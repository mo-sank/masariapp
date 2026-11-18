# Design — Portfolio Value Chart

## Overview

This feature adds a line chart of the caller's daily paper-trading equity to the
Portfolio tab, with a `1M / 3M / 1Y / 5Y / ALL` range selector. The plotted
series is the daily `equity_cents` column of `public.portfolio_snapshots`, which
the existing `snapshot_portfolios()` cron appends one row per account per ET
calendar day. Because that cron only started recently, longer ranges would be
empty, so a new `SECURITY DEFINER` RPC, `public.backfill_portfolio_snapshots()`,
reconstructs the historical daily series for the caller's single account from the
`orders` + `quote_bars` ledger and upserts it into the same table, producing rows
that match the cron's rows in shape and column semantics (the price *source*
differs — historical `quote_bars.close_cents` vs. the cron's live `quotes` — which
the migration documents). The client fires the backfill once per mount when the
chart has too little data to draw.

The work spans one new SQL migration, one pgTAP test, a generated-types edit, two
client hooks, a pure geometry module, a presentational chart component, an
extended range selector, and the Portfolio tab screen wiring. No new runtime
dependency is added; `react-native-svg@15.15.4` (already a dependency) is reused.
No trading or snapshot logic is modified — the only change to existing SQL is a
*new* migration file; `place_market_order`, `snapshot_portfolios`, the cron
schedule, and the `orders`/`positions`/`paper_accounts` schema are untouched.

## Technology stack (locked on approval)

- Postgres (Supabase), `plpgsql`, `SECURITY DEFINER set search_path = public`,
  mirroring `supabase/migrations/20250105000007_supporting_rpcs.sql` and
  `20250105000006_place_market_order_rpc.sql`.
- pgTAP via `supabase test db`, mirroring
  `supabase/tests/supporting_rpcs.test.sql` and `supabase/tests/_helpers.sql`.
- React Native 0.86.3 / React 19.2.3 / Expo SDK ~57, Expo Router ~57.
- `@tanstack/react-query@^5.104.1`, `@supabase/supabase-js@^2.117.2`,
  `zod@^4.6.5`, `react-native-svg@15.15.4`.
- Integer-cents money math through `src/lib/money.ts`. Theme via `src/theme`,
  shared UI via `src/components/ui`.
- Jest `~29.7.0` + `jest-expo` for unit/render tests.

---

## 1. Server: `backfill_portfolio_snapshots()` RPC

### 1.1 Migration file

New file: `supabase/migrations/20250109000001_backfill_portfolio_snapshots_rpc.sql`.

Verified: the latest existing migration is
`supabase/migrations/20250108000003_stress_lab_rpcs.sql`, so `20250109000001` is
strictly after `20250108000003`. No applied migration is edited (NFR-5). The file
creates the function and sets its grants; it creates **no new table and no new
column** — `public.portfolio_snapshots` already exists with exactly
`account_id uuid, snap_date date, cash_cents bigint, positions_value_cents bigint,
equity_cents bigint`, PK `(account_id, snap_date)`
(`20250105000002_trading_ledger.sql`).

### 1.2 Signature, guards, and conventions

Mirrors `snapshot_portfolios()` (return `int` = rows upserted) and
`place_market_order()` (guard order, bare-error-code exceptions, account derived
from `current_user_id()`):

```sql
create or replace function public.backfill_portfolio_snapshots()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := public.current_user_id();
  v_acct public.paper_accounts;
  v_today date := (now() at time zone 'America/New_York')::date;
  v_last  date := v_today - 1;            -- latest snap_date we may write (yesterday ET)
  v_start date;
  v_count int := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_acct from paper_accounts where user_id = v_uid;
  if not found then raise exception 'no_account'; end if;
  ...
end $$;
```

- `v_uid` from `public.current_user_id()` only; **no** account/user argument
  (FR-1.2). `current_user_id()` returns the Auth0 `sub` as `text`
  (`20250103000001_helpers_and_app_config.sql`).
- `not_authenticated` when `v_uid is null`; `no_account` when the caller has no
  `paper_accounts` row — both raised as `raise exception '<code>'` so PostgREST
  surfaces the bare code as the error `message`, exactly as `place_market_order`
  and `submit_reflection` do (FR-1.3). No `for update` lock is needed — the
  backfill only reads the ledger and writes the caller's own snapshot rows (it is
  not racing a cash mutation), unlike `place_market_order`.

### 1.3 Date bounds and the earliest date

```sql
  -- Earliest date we reconstruct: the earlier of the account's creation day and
  -- the first filled order's day (both in ET). An account with no orders starts
  -- at its creation day, giving a cash-only series. (Assumption 1.)
  select least(
           (v_acct.created_at at time zone 'America/New_York')::date,
           coalesce(
             (select min((o.created_at at time zone 'America/New_York')::date)
                from orders o
               where o.account_id = v_acct.id and o.status = 'filled'),
             (v_acct.created_at at time zone 'America/New_York')::date))
    into v_start;

  if v_start > v_last then
    return 0;   -- brand-new account today: nothing before today ET to reconstruct
  end if;
```

- `v_today = (now() at time zone 'America/New_York')::date` matches
  `snapshot_portfolios()` exactly. The latest writable `snap_date` is
  `v_today - 1` (yesterday ET), so the backfill can **never** overwrite the
  cron's same-day row written by the live-quote method (FR-1.4, AC-7). All day
  comparisons on `orders.created_at` use
  `(created_at at time zone 'America/New_York')::date` (Assumption 2).
- `paper_accounts.created_at` exists (`20250103000004_account_tables.sql`;
  confirmed in `src/types/db.ts` Row).

### 1.4 Reconstruction query

One `insert ... select` over a generated calendar series. The chosen approach is a
single set-based statement (not a per-day loop): it is deterministic and reads
naturally against Postgres. The holdings/cash legs are single grouped scans of the
caller's filled orders; the price leg is a correlated most-recent-bar lookup per
held-symbol-day (see the `priced` note below), not a single scan. Alternatives considered — a `plpgsql`
day loop (simpler to read per-day but O(days) round trips of planning) and a
window-function running total over order days only (fewer rows but must still
expand to every calendar day for the chart) — were rejected because the set-based
form is both bounded and the clearest to verify against the worked example.

```sql
  with
  -- One row per calendar day in [v_start, v_last].
  days as (
    select d::date as snap_date
    from generate_series(v_start, v_last, interval '1 day') d
  ),
  -- Net filled holdings per symbol as of each day D (carry-forward via <= D).
  -- Built from per-symbol signed quantities; a symbol contributes only on days
  -- on or after its first filled order.
  fills as (
    select o.symbol,
           (o.created_at at time zone 'America/New_York')::date as fill_date,
           sum(case when o.side = 'buy' then o.qty else -o.qty end) as signed_qty,
           -- total_cents is a NULLABLE bigint (see note below); coalesce every
           -- ledger sum to 0 so a filled row with a null total can never
           -- propagate NULL into the not-null snapshot columns.
           sum(case when o.side = 'sell' then coalesce(o.total_cents, 0) else 0 end) as sell_total,
           sum(case when o.side = 'buy'  then coalesce(o.total_cents, 0) else 0 end) as buy_total
    from orders o
    where o.account_id = v_acct.id and o.status = 'filled'
    group by o.symbol, (o.created_at at time zone 'America/New_York')::date
  ),
  -- Holdings qty per (symbol, day): running sum of signed_qty up to D.
  holdings as (
    select dd.snap_date, f.symbol,
           sum(f.signed_qty) as qty
    from days dd
    join fills f on f.fill_date <= dd.snap_date
    group by dd.snap_date, f.symbol
    having sum(f.signed_qty) <> 0          -- drop fully-closed / zero positions
  ),
  -- Carry-forward close: the close at bar_date = D, else the most recent
  -- bar_date <= D. A held symbol with no bar at or before D contributes 0.
  -- This correlated lookup runs once per holdings row (per held-symbol-day),
  -- bounded by the caller's own holdings x days; the quote_bars PK
  -- (symbol, bar_date) makes the `order by bar_date desc limit 1` unambiguous.
  priced as (
    select h.snap_date,
           h.qty,
           (select qb.close_cents
              from quote_bars qb
             where qb.symbol = h.symbol and qb.bar_date <= h.snap_date
             order by qb.bar_date desc
             limit 1) as close_cents
    from holdings h
  ),
  positions_value as (
    select snap_date,
           coalesce(sum(qty * coalesce(close_cents, 0)), 0)::bigint as positions_value_cents
    from priced
    group by snap_date
  ),
  -- Reconstructed cash as of D from the ledger, clamped >= 0.
  cash as (
    select dd.snap_date,
           greatest(
             v_acct.starting_cash_cents
               + coalesce((select sum(f.sell_total) from fills f where f.fill_date <= dd.snap_date), 0)
               - coalesce((select sum(f.buy_total)  from fills f where f.fill_date <= dd.snap_date), 0),
             0)::bigint as cash_cents
    from days dd
  )
  insert into portfolio_snapshots(account_id, snap_date, cash_cents, positions_value_cents, equity_cents)
  select v_acct.id,
         dd.snap_date,
         c.cash_cents,
         coalesce(pv.positions_value_cents, 0),
         c.cash_cents + coalesce(pv.positions_value_cents, 0)
  from days dd
  join cash c on c.snap_date = dd.snap_date
  left join positions_value pv on pv.snap_date = dd.snap_date
  on conflict (account_id, snap_date) do update
    set cash_cents = excluded.cash_cents,
        positions_value_cents = excluded.positions_value_cents,
        equity_cents = excluded.equity_cents;

  get diagnostics v_count = row_count;
  return v_count;
end $$;
```

Rules this encodes, each pinned to a requirement:

- **Holdings as of D** (FR-1.5): net filled buy qty − net filled sell qty for
  `orders.status = 'filled'` with fill day `<= D`. `orders` columns used
  (`account_id`, `symbol`, `side`, `qty`, `status`, `total_cents`, `created_at`)
  all exist (`20250105000002_trading_ledger.sql`); `qty` is `not null` so it
  needs no coalesce, but `total_cents` is nullable and is coalesced in the cash
  legs (above). Zero-net symbols are dropped by the `having` so a fully-closed
  position does not add a 0-qty row.
- **Positions value (D)** (FR-1.6): `sum(qty(D) * close_at_or_before(D))`, where
  `close_cents` is from `quote_bars` at `bar_date = D` or the most recent
  `bar_date <= D` (carry-forward). A held symbol with **no** bar at or before D
  yields `close_cents = null`, coalesced to **0**, matching the "missing quote =
  0" rule in `use-portfolio.ts` and `snapshot_portfolios()` (AC-5). `quote_bars`
  columns (`symbol`, `bar_date`, `close_cents`, PK `(symbol, bar_date)`) exist
  (`20250105000001_market_data.sql`). The carry-forward close is a **correlated
  most-recent-bar lookup executed once per `holdings` row** — i.e. per
  held-symbol-day: `order by qb.bar_date desc limit 1` over `bar_date <= D`. The
  `quote_bars` PK `(symbol, bar_date)` guarantees at most one row per
  `(symbol, bar_date)`, so the `limit 1` is unambiguous (no tie-break needed) and
  each `holdings` row maps to exactly one close. This is not a single table scan;
  its cost is `O(held-symbol-days)` index lookups, bounded by the caller's own
  holdings × days (NFR-7, see §13). A `distinct on (symbol)` lateral rewrite was
  considered but rejected: the correlated form is the clearest to verify against
  the worked example and the per-caller row count is small (one user's filled
  symbols over a bounded window), so the micro-optimization is not worth the
  readability cost.
- **Cash (D)** (FR-1.7): `starting_cash_cents + Σ filled SELL coalesce(total_cents,0)(≤D) −
  Σ filled BUY coalesce(total_cents,0)(≤D)`, clamped `>= 0` via `greatest(..., 0)`
  with an explanatory comment. Reconstructed from the ledger, **not** from
  `v_acct.cash_cents`. Each ledger sum is `coalesce(o.total_cents, 0)` because
  `orders.total_cents` is a **nullable** `bigint` (declared `total_cents bigint`
  with no `not null`, verified at line 31 of
  `20250105000002_trading_ledger.sql`): `place_market_order` sets it on the
  filled rows it writes, but a directly-seeded or historically-migrated `filled`
  row may leave it null, and an un-coalesced `sum` would then yield `NULL` cash
  and `NULL` equity, violating the `not null` cents columns on
  `portfolio_snapshots` and aborting the whole run.
  **Clamp rationale (corrected):** the cash is a *per-day aggregate* with no
  intra-day ordering, and `place_market_order` already refuses any buy that would
  drive cash negative (`insufficient_cash`, enforced in
  `20250105000006_place_market_order_rpc.sql`), so for any ledger the write-path
  RPC produced, `Σbuy(≤D)` can never exceed `starting_cash_cents + Σsell(≤D)` and
  the clamp never fires. The `greatest(..., 0)` is kept as a **defensive floor**
  against directly-seeded or historically-migrated rows (where a BUY total could
  exceed starting + sells), never expected to fire in normal data. The migration
  comment states exactly this.
- **Equity (D)** (FR-1.8): `cash_cents(D) + positions_value_cents(D)`, all
  `bigint` integer cents, deterministic for a fixed ledger + bar set.
- **Idempotent upsert** (FR-1.9, AC-8): `on conflict (account_id, snap_date) do
  update` on the existing PK — a re-run updates in place, no duplicates, no drift.

A `-- DIVERGENCE` comment block at the top of the function documents that the
price source is `quote_bars.close_cents` (historical) rather than
`snapshot_portfolios()`'s live `quotes.price_cents`, and that the row *shape and
column semantics* still match the cron (per the requirements' "Confirmed
environment" note).

### 1.5 Grants

Mirrors the user-facing RPCs in `20250105000007` / `20250105000006` (FR-1.10,
AC-11):

```sql
revoke execute on function public.backfill_portfolio_snapshots() from public, anon;
grant  execute on function public.backfill_portfolio_snapshots() to authenticated;
```

No grant change to `portfolio_snapshots` itself — clients keep SELECT-only under
the `"own snapshots"` RLS policy (`20250105000003`). Because the RPC is
`SECURITY DEFINER`, its inserts run with the owner's privileges and bypass the
table's write restriction; the function body only ever targets the caller's own
`account_id` (derived from `current_user_id()`), so a client cannot write another
account's rows.

### 1.6 Edge cases

- **Brand-new account today** (`v_start > v_last`): returns `0`, writes nothing
  (AC-21 support).
- **No filled orders**: `fills` is empty → `holdings` empty → every day is
  cash-only with `positions_value_cents = 0`, `equity = reconstructed cash`
  (= `starting_cash_cents`, since there are no buys/sells) (AC-9).
- **Held symbol, no bars**: contributes 0, run proceeds (AC-5).
- **Account cash ≠ reconstructed cash**: the RPC uses the reconstructed value,
  verified by the pgTAP case (AC-6).
- **Gaps in `quote_bars`** (weekends/holidays): carry-forward `bar_date <= D`
  fills them; a symbol held before its first bar contributes 0 until a bar exists.
- **Clamp (defensive only)**: for any ledger produced by `place_market_order`,
  daily reconstructed cash is never negative (the write path blocks it), so the
  `greatest(..., 0)` floor is unreachable through normal data. It guards only
  directly-seeded or migrated rows whose BUY totals exceed starting + sells; the
  pgTAP clamp case (§2.3 #13) seeds such a row directly to exercise it.
- **Null `total_cents`**: a `filled` row with a null `total_cents` contributes 0
  to the cash legs (`coalesce`), never a `NULL` snapshot column.

---

## 2. Server: pgTAP test

New file: `supabase/tests/backfill_portfolio_snapshots.test.sql`, mirroring
`supporting_rpcs.test.sql`: `begin; select plan(N); create extension if not exists
pgtap; \set helpers_included on; \ir _helpers.sql; ... select * from finish();
rollback;`. Role switching is done at top level with `reset role` /
`set role authenticated` and claims via `tests.set_authenticated_claims('auth0|..')`
/ `tests.clear_claims()`, exactly as the helper header prescribes. Seed rows
(profiles, accounts, orders, quote_bars, instruments) are inserted as the owner
(RLS bypassed), matching the existing tests.

### 2.1 Worked example (hand-computed)

Seed user A, `starting_cash_cents = 1_000_000` ($10,000), `created_at` = a fixed
date well in the past (e.g. `'2025-01-02'`). Instruments `AAA`, `BBB` (starters).
Dates are ET calendar days.

Orders (all `status='filled'`, `created_at` at noon ET so the ET date is
unambiguous):

| date       | side | symbol | qty | total_cents |
|------------|------|--------|-----|-------------|
| 2025-01-03 | buy  | AAA    | 10  | 100000      |
| 2025-01-05 | buy  | BBB    | 5   | 50000       |
| 2025-01-07 | sell | AAA    | 4   | 48000       |

`quote_bars` (`close_cents`):

| symbol | 2025-01-03 | 2025-01-04 | 2025-01-06 | 2025-01-08 |
|--------|------------|------------|------------|------------|
| AAA    | 10000      | 10500      | (none)     | 12000      |
| BBB    | —          | —          | 11000      | 9000       |

Expected rows (`v_last` fixed at `2025-01-08` in the assertions by seeding dates
safely in the past so `v_last >= 2025-01-08`):

- **2025-01-03**: AAA qty 10, close 10000 → positions 100000. cash = 1,000,000 −
  100,000(buy) = 900000. **equity = 1,000,000**.
- **2025-01-04**: AAA qty 10, close 10500 (bar on D) → 105000. cash 900000.
  **equity = 1,005,000**.
- **2025-01-05**: AAA qty 10 (carry-forward close 10500, no 01-05 bar) → 105000;
  BBB qty 5 but **no bar at or before 01-05** → 0. cash = 900000 − 50000 = 850000.
  **equity = 955,000**. (Exercises FR-1.6 missing-bar = 0 and carry-forward.)
- **2025-01-06**: AAA 10 × 10500 (carry) = 105000; BBB 5 × 11000 = 55000. cash
  850000. **equity = 1,010,000**.
- **2025-01-07**: AAA 10−4 = 6 × 10500 (carry; no 01-07 bar) = 63000; BBB 5 ×
  11000 (carry) = 55000. cash = 850000 + 48000(sell) = 898000.
  **equity = 1,016,000**. (Exercises the sell leg of both cash and holdings.)
- **2025-01-08**: AAA 6 × 12000 = 72000; BBB 5 × 9000 = 45000. cash 898000.
  **equity = 1,015,000**.

Assertions use `is((select equity_cents from portfolio_snapshots where
account_id = ... and snap_date = 'YYYY-MM-DD'), <expected>::bigint, '...')` for
each named date, plus one `cash_cents` and one `positions_value_cents` assertion
on a chosen date (FR-2.2, AC-4).

### 2.2 Other assertions

- **Idempotency** (FR-2.3, AC-8): run the RPC twice; assert the row `count` for A
  is identical and `equity_cents` on a named date is unchanged.
- **No-position account** (FR-2.4, AC-9): user E with cash and zero filled
  orders; every row has `positions_value_cents = 0` and `equity_cents =
  starting_cash_cents`.
- **Cash reconstruction ≠ current cash** (AC-6): set A's live
  `paper_accounts.cash_cents` to a different value after seeding orders; assert the
  reconstructed `cash_cents(D)` matches the ledger math, not the live column.
- **Clamp** (FR-1.7): because an RPC-produced ledger can never drive daily cash
  negative (`place_market_order` blocks it via `insufficient_cash`), the clamp
  cannot be exercised through the normal write path — a naive "spend more than
  you have" case is unreachable. The test therefore **seeds the ledger directly
  as the owner** (`reset role`, which bypasses RLS and the write-path RPC):
  insert a single-day account with `starting_cash_cents = 100000`, no sells, and
  one `filled` BUY row with `total_cents = 150000` (so `Σbuy(≤D) = 150000 >
  starting + Σsell = 100000`). Run the RPC as that user and assert the stored
  `cash_cents` on that `snap_date` is exactly `0` (not `-50000`), proving the
  defensive `greatest(..., 0)` floor. This is the only case in the plan that
  constructs an otherwise-impossible ledger; the comment in the test says so.
- **Ownership isolation** (FR-2.5, AC-10): user B runs the RPC; assert B wrote
  only B's `account_id` rows and A's rows are unchanged; then as `authenticated`
  with B's claims, `select count(*) from portfolio_snapshots where account_id =
  <A>` returns 0 under RLS.
- **Guards** (FR-2.6, AC-3): `set role authenticated` with `clear_claims()` →
  `throws_ok(..., 'not_authenticated', ...)`; an authenticated user with no
  `paper_accounts` row → `throws_ok(..., 'no_account', ...)`.
- **No future row** (FR-2.7, AC-7): assert
  `max(snap_date) <= (now() at time zone 'America/New_York')::date - 1` for A, and
  that no row exists for `today ET`.
- **Grants** (AC-11): `ok(has_function_privilege('authenticated',
  'public.backfill_portfolio_snapshots()', 'execute'), ...)` and
  `ok(not has_function_privilege('anon', ..., 'execute'), ...)`.

### 2.3 Assertion inventory and committed `plan(N)`

The plan is pinned up front, exactly as `supporting_rpcs.test.sql` commits to
`plan(32)`. The test opens with `select plan(22);` and the 22 assertions are:

| # | Group | Assertion |
|---|-------|-----------|
| 1–6 | Worked example | `equity_cents` on each of `2025-01-03 … 2025-01-08` equals the six hand-computed values (`is(...)`) |
| 7 | Worked example | `cash_cents` on `2025-01-07` = `898000` (sell leg) (`is(...)`) |
| 8 | Worked example | `positions_value_cents` on `2025-01-05` = `105000` (carry-forward + missing-bar-=-0) (`is(...)`) |
| 9 | Idempotency | second run leaves A's row `count` identical (`is(...)`) |
| 10 | Idempotency | `equity_cents` on `2025-01-08` unchanged after the second run (`is(...)`) |
| 11 | No-position | user E (cash, zero filled orders): `equity_cents` on a named date = `starting_cash_cents` and `positions_value_cents = 0` — one combined row asserted with `is(...)` on `equity_cents` |
| 12 | Cash ≠ live cash | after setting A's live `paper_accounts.cash_cents` to a different value, reconstructed `cash_cents(D)` matches the ledger math, not the live column (`is(...)`) |
| 13 | Clamp | directly-seeded single-day over-buy (`total_cents 150000`, starting `100000`): stored `cash_cents = 0` (`is(...)`) |
| 14 | Ownership | user B's run wrote only B's `account_id` rows (`is(count)=` B's expected day count) |
| 15 | Ownership | A's row `count`/`equity` on a named date unchanged by B's run (`is(...)`) |
| 16 | Ownership | as `authenticated` with B's claims, `select count(*) from portfolio_snapshots where account_id = <A>` returns `0` under RLS (`is(...)`) |
| 17 | Guard | `authenticated` + `clear_claims()` → `throws_ok(..., 'not_authenticated', ...)` |
| 18 | Guard | `authenticated` user with no `paper_accounts` row → `throws_ok(..., 'no_account', ...)` |
| 19 | No future row | `max(snap_date)` for A `<= (now() at time zone 'America/New_York')::date - 1` (`ok(...)`) |
| 20 | No future row | no row exists for A at `today ET` (`ok(not exists ...)`) |
| 21 | Grant | `ok(has_function_privilege('authenticated', 'public.backfill_portfolio_snapshots()', 'execute'), ...)` |
| 22 | Grant | `ok(not has_function_privilege('anon', 'public.backfill_portfolio_snapshots()', 'execute'), ...)` |

Count = 6 equity + 1 cash + 1 positions + 2 idempotency + 1 no-position + 1 cash≠live
+ 1 clamp + 3 ownership + 2 guards + 2 no-future + 2 grants = **22** → `plan(22)`.
If the implementer adds an assertion, bump `plan` to match; the count is otherwise
locked.

---

## 3. Client: generated types

Edit `src/types/db.ts`, adding to the `Functions` block (verified to begin after
the `Tables`/`Views` sections; `watchlist_remove` / `get_daily_briefing` entries
are nearby) an entry consistent with the existing no-arg functions
(`current_user_id`, `get_daily_briefing`):

```ts
      backfill_portfolio_snapshots: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
```

`Returns: number` matches the RPC's `int` return (FR-1.11, AC-12). The
`portfolio_snapshots` Row type already exists in `db.ts`
(`account_id: string; cash_cents: number; equity_cents: number;
positions_value_cents: number; snap_date: string`), so no table-type change is
needed.

---

## 4. Client: `usePortfolioHistory(range)`

New file: `src/features/portfolio/use-portfolio-history.ts`, mirroring
`src/features/trading/use-bars.ts` (FR-3).

```ts
export type ChartRange = '1M' | '3M' | '1Y' | '5Y' | 'ALL';

const RANGE_DAYS: Record<Exclude<ChartRange, 'ALL'>, number> = {
  '1M': 31, '3M': 93, '1Y': 366, '5Y': 1827,
};

export interface PortfolioHistoryPoint {
  snapDate: string;          // YYYY-MM-DD
  equityCents: number;
  cashCents: number;
  positionsValueCents: number;
}

export function portfolioHistoryQueryKey(range: ChartRange) {
  return ['portfolio-history', range] as const;   // FR-3.4, AC-13
}

/**
 * Pure, unit-testable cutoff with an injectable clock. Returns null for 'ALL'.
 *
 * NOTE (ET vs UTC): snap_date values are ET calendar days, but this cutoff is
 * computed from the UTC date, a coarse lower bound (see §4 "ET-vs-UTC" below).
 * The off-by-one-day drift at the ET boundary is deliberately accepted; it
 * mirrors use-bars.ts and only widens/narrows a multi-month window by up to one
 * day at the oldest edge.
 */
export function rangeCutoffDate(range: ChartRange, now: Date = new Date()): string | null {
  if (range === 'ALL') return null;               // FR-3.3, AC-14
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - RANGE_DAYS[range]);
  return cutoff.toISOString().slice(0, 10);
}

export async function fetchPortfolioHistory(range: ChartRange): Promise<PortfolioHistoryPoint[]> {
  const cutoff = rangeCutoffDate(range);
  let query = supabase
    .from('portfolio_snapshots')
    .select('snap_date, equity_cents, cash_cents, positions_value_cents')
    .order('snap_date', { ascending: true });     // oldest-first for the chart
  if (cutoff) {
    query = query.gte('snap_date', cutoff);        // FR-3.2; 'ALL' => no filter
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    snapDate: r.snap_date,
    equityCents: r.equity_cents,
    cashCents: r.cash_cents,
    positionsValueCents: r.positions_value_cents,
  }));
}

export function usePortfolioHistory(range: ChartRange, enabled = true) {
  return useQuery({
    queryKey: portfolioHistoryQueryKey(range),
    queryFn: () => fetchPortfolioHistory(range),
    enabled,
  });
}
```

RLS scopes rows to the caller via the `"own snapshots"` policy; **no user id is
passed** (FR-3.2, AC-13). Unlike `usePortfolio`, there is no `refetchInterval` —
snapshots change at most once per day, matching `use-bars.ts` (which also does not
poll). The row-to-point mapping is done here so the component and geometry stay
free of generated-type field names.

**Validation of external input (the range):** `range` is an app-internal union,
never user free text; the type system constrains it. `fetchPortfolioHistory`
treats any non-`'ALL'` value through `RANGE_DAYS`; an out-of-union value is a
programming error, not a runtime input, so no runtime guard is added (consistent
with `use-bars.ts`). The Supabase response rows are typed by `Database`; a
`null`/`undefined` `data` coalesces to `[]`.

**ET-vs-UTC cutoff decision (M1).** The series (`snap_date`) is an ET calendar
day, but the client cutoff is derived from the device's **UTC** date via
`getUTCDate()` / `toISOString().slice(0,10)`. Between ~19:00–24:00 ET the UTC
date is already "tomorrow", so `rangeCutoffDate` yields a cutoff up to one day
later than the ET-aligned boundary, dropping (or including) a day of history at
the oldest edge of the window. **Decision: accept the coarse UTC lower bound.**
Rationale: (1) the filter is `>= cutoff` on a multi-month-to-multi-year span, so a
one-day edge drift is cosmetic — the newest point (the equity the header reports)
is always included because it is bounded by `v_last = yesterday ET`, well inside
every window; (2) it mirrors `use-bars.ts` exactly, which already compares a
UTC-derived cutoff against ET `bar_date`, so the two charts behave identically and
no new timezone helper is introduced (NFR-1, no new dep); (3) converting to an ET
calendar day on the client would need either `Intl`/`toLocaleDateString('en-CA',
{ timeZone: 'America/New_York' })` or a date lib, adding complexity the coarse
bound does not justify for a lower-bound filter. This is a *consistency-and-
simplicity* choice, not a correctness claim — the drift is real and bounded to
one day at the oldest edge only.

**Testable:** `rangeCutoffDate` is pure with an injected clock. Jest asserts the
exact `YYYY-MM-DD` for `1M/3M/1Y/5Y` against a **fixed UTC `now`** (e.g.
`new Date('2025-06-15T12:00:00Z')`), computing each expectation as
`now − RANGE_DAYS[range]` from the **same `RANGE_DAYS` constant** (not a calendar
"N months/years ago"), and `null` for `'ALL'` (AC-14, N2). Because the test pins a
fixed UTC instant, the ET/UTC drift does not make the test flaky — the expected
value is defined by the UTC arithmetic the helper performs. `fetchPortfolioHistory`
is integration-tested against a mocked supabase client if desired, but the cutoff
logic is the unit-tested part.

Note (N2): `5Y = 1827` days ≈ 5 × 365.25, copied verbatim from `use-bars.ts`; it
is an approximate span (ignores exact leap-year placement), and the AC-14
expectations are derived from this constant rather than a calendar "5 years ago"
computation, so the test stays exact.

---

## 5. Client: `useBackfillPortfolioHistory()`

New file: `src/features/portfolio/use-backfill-portfolio-history.ts`, mirroring the
error-map + mutation shape of `src/features/trading/use-place-order.ts` and the
zod-at-the-boundary pattern of `src/features/stress-lab/data/use-run-simulation.ts`
(FR-4).

```ts
export type BackfillErrorCode = 'not_authenticated' | 'no_account';

const BACKFILL_ERROR_MESSAGES: Record<BackfillErrorCode, string> = {
  not_authenticated: 'Sign in to build your portfolio history.',
  no_account: "We couldn't find your paper account. Please try again.",
};
const BACKFILL_FALLBACK_MESSAGE = "We couldn't build your portfolio history. Please try again.";

export function mapBackfillError(error: unknown): string { /* identical shape to mapPlaceOrderError */ }

/** zod: the RPC returns an int row count. */
const backfillResultSchema = z.number().int().nonnegative();

export async function backfillPortfolioHistory(): Promise<number> {
  const { data, error } = await supabase.rpc('backfill_portfolio_snapshots');
  if (error) throw error;
  return backfillResultSchema.parse(data);   // validate the RPC result shape (FR-4.3)
}

export function useBackfillPortfolioHistory() {
  const client = useQueryClient();
  return useMutation<number, Error, void>({
    mutationFn: () => backfillPortfolioHistory(),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['portfolio-history'] }); // FR-4.2, AC-15
      void client.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEY });   // ['portfolio','me']
    },
  });
}
```

- Called with **no arguments** (FR-4.1).
- `PORTFOLIO_QUERY_KEY` is imported from `use-portfolio.ts` (`['portfolio','me']`),
  already exported there. Invalidating `['portfolio-history']` (prefix) refetches
  every range's history query; invalidating `PORTFOLIO_QUERY_KEY` refreshes the
  summary (FR-4.2, AC-15).
- Error map covers `not_authenticated`, `no_account`, and a generic fallback,
  structured identically to `mapPlaceOrderError` (FR-4.3). `mapBackfillError` and
  `backfillPortfolioHistory` are exported for unit tests (AC-15).

**Error handling for the RPC call:**

| Failure | Recoverable? | Caller receives | Logged? |
|---|---|---|---|
| RPC raises `not_authenticated` / `no_account` | Recoverable (user action) | mutation rejects with raw error; UI shows mapped copy | No app log; react-query holds the error |
| Network / unknown PostgREST error | Recoverable (retry) | rejects; UI shows fallback copy | No |
| Malformed result (zod parse fails) | Fatal for this call | rejects with ZodError; UI shows fallback copy | No (surfaced via the mutation error) |

No exception is logged to analytics — consistent with `use-place-order.ts`, which
also leaves logging to react-query's error state. The once-per-mount trigger
(§9) does not retry automatically on failure; on a failed backfill the sparse
chart card renders `mapBackfillError(backfill.error)` as a muted sub-line (§9,
M2) so the mapped copy is actually shown rather than the card staying silently
generic.

---

## 6. Client: pure geometry module

New file: `src/features/portfolio/components/chart-geometry.ts`.

Decision: **add a portfolio-specific geometry module** rather than generalize the
trading `ChartBar`-based helpers. Rationale: `src/features/trading/components/
chart-geometry.ts` hard-codes `ChartBar { bar_date; close_cents }`, and the
stress-lab feature already set the precedent of a feature-local
`chart-geometry.ts` that *mirrors* the trading module rather than importing it
(`src/features/stress-lab/components/chart-geometry.ts` header: "mirroring
`src/features/trading/components/chart-geometry.ts`"). Generalizing the shared
module to a neutral point shape would touch trading code (out of scope and a
needless regression risk). The portfolio module reuses the same *math*
(`priceDomain` → min/max with flat-series ±1 fallback, `priceToY` axis flip +
clamp, `indexToX` even spread + single-point centre, `pointsToPolyline`) over a
neutral point:

```ts
export interface EquityPoint {
  snapDate: string;     // YYYY-MM-DD, ascending
  valueCents: number;   // equity_cents — the value we plot
}
export interface ChartPoint { x: number; y: number }
export interface ChartLayout { width: number; height: number; padding?: number }
export interface ValueDomain { minCents: number; maxCents: number }

export function valueDomain(points: readonly EquityPoint[]): ValueDomain | null;
export function valueToY(valueCents: number, domain: ValueDomain, layout: ChartLayout): number;
export function indexToX(index: number, count: number, layout: ChartLayout): number;
export function equityToPoints(points: readonly EquityPoint[], layout: ChartLayout): ChartPoint[];
export function pointsToPolyline(points: readonly ChartPoint[]): string;
```

Semantics copied verbatim from the trading module: empty series → `null` domain →
`[]` points; all-equal values → domain widened ±1 cent so a flat line renders
mid-box; padding clamped to ¼ of the smaller dimension; `count <= 1` centres the
single point; y flipped so higher equity = smaller y; polyline rounded to one
decimal. No markers equivalent is needed (the portfolio chart has no trade
markers — Out of Scope).

**Testable:** this module is pure and unit-tested the same way as
`src/features/trading/components/chart-geometry.test.ts` — domain of a known
series, flat-series fallback, single-point centring, empty-series `[]`, polyline
string (AC-16). No float ever feeds back into money math (NFR-3); cents are
divided only when projecting to pixels.

---

## 7. Client: `PortfolioValueChart` component

New file: `src/features/portfolio/components/portfolio-value-chart.tsx`,
presentational, built on `react-native-svg`, mirroring
`src/features/trading/components/line-chart.tsx` (FR-5).

```ts
export interface PortfolioValueChartProps {
  /** Equity points, oldest-first (as usePortfolioHistory returns them). */
  points: readonly EquityPoint[];
  /** The selected range, used only for the accessibility label. */
  range: ChartRange;
  height?: number;        // default 200, matching LineChart
  loading?: boolean;
  empty?: boolean;        // caller's sparse/empty decision (0 or 1 points)
}
```

- **Data via props only** — no Supabase import in the component (AC-16), so Stress
  Lab can adopt it later (FR-5.2, kept deliberately reusable but not wired there —
  Out of Scope).
- Self-measures width via `onLayout` (starts at 0, fills in), fixed height from
  the caller, inner padding constant — same structure as `LineChart`.
- Renders: a `<Polyline>` when `points.length > 1`; a single `<Circle>` when
  `points.length === 1`; a muted "No chart data yet" view when `empty` or
  `points.length === 0` (AC-16).
- **Header summary** (FR-5.3, AC-17): current equity = last point's `valueCents`
  via `formatCents`; change across the visible range = `last − first` via
  `formatSignedCents`, and percent via `formatPercent(pctChange(last, first))` —
  all from `src/lib/money.ts`. Tinted `primary` (gain) / `danger` (loss) /
  `textMuted` (flat), with the sign carried in text and in the accessibility label
  (mirroring `PortfolioSummary`'s `gainColor` / `gainText`).
- **Paper-money labelling** (FR-5.5, NFR-4): a "Paper money" tag identical to
  `PortfolioSummary`'s tag row.
- The range selector is rendered alongside (section 8). `accessibilityRole="image"`
  with a label like `Portfolio value, ${range}` (FR-5.4 selector marks active).

**Edge cases:** `loading` shows a loading placeholder (not an empty chart);
`empty` shows the "No chart data yet" styling; a flat series renders a straight
mid-box line (domain ±1 fallback); one point renders a centred dot.

**Testable:** a render test (jest-expo + test-renderer, as the trading components
do) asserts the empty copy for `empty`, a `<Polyline>` for ≥2 points, a `<Circle>`
for 1 point, and the gain/loss color + accessibility sign (AC-16, AC-17). Geometry
correctness is covered by section 6's unit tests.

---

## 8. Client: range selector

Decision: **extend the range set in the portfolio feature** rather than modify the
trading `RangeToggle`/`CHART_RANGES` (which are typed to the trading `ChartRange`
without `'ALL'`). Two viable options were (a) generalize `RangeToggle` to accept a
`ranges` prop, or (b) add a thin portfolio selector. Option (b) is chosen: it keeps
the trading component untouched (no regression risk to the stock screen, which must
stay 4-range), and the selector is ~30 lines. New file:
`src/features/portfolio/components/range-toggle.tsx`, structurally identical to
`src/features/trading/components/range-toggle.tsx` (verified): a `tablist` `View`,
each option a `Pressable` with `accessibilityRole="tab"`,
`accessibilityState={{ selected: active }}`, and `accessibilityLabel={`Range
${range}`}`; the active tab's `backgroundColor` is `theme.colors.primary` and its
`<Text>` uses `color="onPrimary"`, while an inactive tab is `transparent` with
`color="textMuted"` (the exact `onPrimary`/`textMuted` pair the trading toggle
uses — do not drop the text color when cloning). With:

```ts
export const PORTFOLIO_CHART_RANGES: readonly ChartRange[] = ['1M','3M','1Y','5Y','ALL'];
```

exposing all five ranges, marking the active one `selected` for assistive tech
(FR-5.4, AC-18). The `ChartRange` type is imported from `use-portfolio-history.ts`.

---

## 9. Integration: Portfolio tab screen

Edit `app/(tabs)/portfolio.tsx` only (the single change under `app/`; all other new
code lives under `src/features/portfolio/` per the routing rule) (FR-6, AC-22).

- In `PortfolioView`, add local state `const [range, setRange] = useState<ChartRange>('3M')`
  (default `3M`, FR-6.1) and call `usePortfolioHistory(range)` and
  `useBackfillPortfolioHistory()`.
- Render a **chart card** in the `header` block, above `PortfolioSummary`,
  containing the `PortfolioValueChart` (fed `points` mapped from the history query)
  and the portfolio `RangeToggle`. `PortfolioSummary`, the trade-history/Stress Lab
  buttons, the holdings `FlatList`, the empty state, the `Disclaimer`, and the
  `Gate` are all left unchanged and keep working (FR-6.2, AC-19).
- **Sparse/empty + once-per-mount backfill** (FR-6.3, FR-4.4, AC-20): treat the
  history as sparse when `data.length <= 1`. When sparse, the chart card shows a
  friendly "Your portfolio history will build over time" card (not a one-dot
  chart), and a `useEffect` fires the backfill **at most once per mount**:

  ```ts
  const firedRef = useRef(false);
  const sparse = (history.data?.length ?? 0) <= 1;
  useEffect(() => {
    if (!history.isLoading && sparse && !firedRef.current && !backfill.isPending) {
      firedRef.current = true;
      backfill.mutate();
    }
  }, [history.isLoading, sparse, backfill.isPending]);
  ```

  The `firedRef` guard ensures it never fires on every render or on range change
  (FR-4.4); `onSuccess` invalidates `['portfolio-history']`, the query refetches,
  and with ≥2 reconstructed points the curve renders (AC-20). The guard is keyed to
  the mount (a `useRef`), so switching range does not re-trigger it.
- **Backfill error surface** (M2, FR-4.3): the once-per-mount trigger is a
  one-shot — it does **not** auto-retry on failure (the `firedRef` latch is set
  before `mutate()`, so a rejected mutation leaves `firedRef.current === true`).
  So the mapped copy from `mapBackfillError` must have a render target, otherwise
  FR-4.3's friendly message is produced but never shown. The sparse card
  therefore renders, when `backfill.isError`, `mapBackfillError(backfill.error)`
  as a muted sub-line beneath the "Your portfolio history will build over time"
  headline (e.g. `<Text variant="caption" color="textMuted">`), instead of
  silently staying generic. While `backfill.isPending`, the card shows a quiet
  "Building your history…" sub-line; on success the refetch replaces the card with
  the curve. In practice the chart card mounts **inside** the `portfolio` `Gate`
  (verified: `app/(tabs)/portfolio.tsx` wraps `PortfolioView` in `<Gate>`), so a
  signed-out `not_authenticated` should not occur there; `no_account` still can
  (a gated-but-account-less edge) and its mapped copy — "We couldn't find your
  paper account. Please try again." — is what the sub-line shows. Because there is
  no auto-retry, the user is never stuck with a spinner: they see either the
  building sub-line, the mapped error sub-line, or the curve.
- **Brand-new account** (FR-6.4, AC-21): if, after the backfill resolves, history
  is still `<= 1` point, the friendly empty-state card persists (no flat single-dot
  chart). This falls out of the same `sparse` check re-evaluated after refetch,
  combined with the server returning `0` for a same-day new account.
- The chart inherits the existing `portfolio` `Gate`; no new unlock is added
  (Assumption 4).
- Export `PortfolioValueChart`, `PortfolioValueChartProps`, and the portfolio
  `RangeToggle` / `PORTFOLIO_CHART_RANGES` from
  `src/features/portfolio/components/index.ts` (FR-5.6), following the existing
  barrel style (the current barrel exports only `PortfolioSummary`/`PositionRow`;
  it exports components, not types). **The `ChartRange` type is NOT added to the
  components barrel (N3):** it is defined in `use-portfolio-history.ts`, and every
  consumer — the portfolio `RangeToggle`, `PortfolioValueChart`, and the
  `portfolio.tsx` screen — imports `ChartRange` from the hook path
  (`../use-portfolio-history`), not from the components barrel, to avoid a
  dangling type export. `PortfolioValueChart`'s `range: ChartRange` prop type is
  likewise sourced from the hook module.

---

## 10. Invariants and ownership

- **"snap_date < today ET" invariant** is owned by the RPC (`v_last = v_today - 1`
  bound) — the only writer a client can invoke — so the client never needs to
  filter future rows. The cron owns the same-day row.
- **Account scoping** is owned by two layers that agree: the RPC derives
  `account_id` from `current_user_id()` (write path), and the `"own snapshots"`
  RLS policy scopes reads (`usePortfolioHistory`). Neither trusts a client-supplied
  id.
- **Integer-cents money** is owned end to end: `bigint` in SQL, `number` cents in
  the hooks, formatting only at the UI boundary via `src/lib/money.ts` (NFR-3).
- **Bounded, per-caller cost (NFR-7, corrected).** The reconstruction touches
  only the caller's own data and is bounded, but it is *not* a single scan of
  `quote_bars`. Its cost is: one grouped scan of the caller's filled `orders`
  (the `fills` CTE), the running-sum joins over the day series (`holdings`,
  `cash`), and a **correlated most-recent-bar lookup per held-symbol-day** (the
  `priced` CTE) — `O(holdings × days)` index lookups into `quote_bars`, bounded
  by one user's filled symbols over the reconstructed window. There is no
  cross-account work and the upsert touches only the caller's `account_id` rows,
  so NFR-7's "deterministic, bounded, safe to run repeatedly" holds; the earlier
  "one scan of the relevant `quote_bars`" phrasing is replaced by this correlated-
  lookup characterization. The pgTAP test's expectations assert values, not plan
  shape, so they do not rely on the (inaccurate) single-scan claim.

## 11. Testability summary

- **Unit (Jest):** `rangeCutoffDate` (incl. `'ALL'`), the `chart-geometry` module,
  `mapBackfillError`, and the `backfillResultSchema` parse. A render test for
  `PortfolioValueChart` (empty / 1-point / ≥2-point / gain-loss color + a11y).
- **Integration (pgTAP):** the RPC worked example, idempotency, no-position, cash
  reconstruction vs. live cash, clamp, ownership isolation, guards, no-future-row,
  grants.
- **Hard-to-test risk:** the once-per-mount `useEffect` trigger is the only piece
  that is awkward to unit-test; it is kept trivially small (a `useRef` guard +
  `mutate()`) so correctness is by inspection, and the mutation/mapper underneath
  it are unit-tested independently.

## 12. No-dependency / no-regression statement

No new runtime dependency is added: `package.json` and `package-lock.json` stay
unchanged (NFR-1, AC-22); `react-native-svg@15.15.4` (already present) is reused
and no charting library is imported. No trading or snapshot logic is modified — the
feature adds one new migration, one new pgTAP test, one `db.ts` type entry, four new
client files under `src/features/portfolio/`, and one edit to
`app/(tabs)/portfolio.tsx`. `place_market_order`, `snapshot_portfolios`, the cron
schedule, and the `orders`/`positions`/`paper_accounts`/`portfolio_snapshots`
schema and RLS are untouched (NFR-5, AC-22).

## 13. Items flagged for verification

Everything in this design was resolved against source in the worktree. Two items a
reviewer should still confirm at implement time:

1. **Test runner invocation.** `supabase/config.toml` lists `[db.seed] sql_paths`
   and `[db.migrations]`, and the existing tests run under `supabase test db`
   (pg_prove), per `supabase/tests/README.md`. The new test needs no `sql_paths`
   entry (pg_prove globs every `*.sql` in `supabase/tests/`). Confirm the project's
   local Supabase stack is the runner (the task's opening message shows
   `supabase db query --linked`), not a remote.
2. **`generate_series(date, date, interval)` return type.** The query casts
   `d::date`; on Postgres 17 (`config.toml major_version = 17`)
   `generate_series(v_start, v_last, interval '1 day')` returns `timestamp`/`date`
   values that cast cleanly to `date`. This is standard but should be smoke-tested
   when the migration is applied.

---

## 14. Responses to design review (revision pass)

Review: `.agents/tasks/portfolio-value-chart/design-review.md`
(`design-review.json`, verdict `CHANGES_REQUESTED`: HIGH 2, MEDIUM 4, NIT 3). All
nine findings addressed below; each was re-verified against the worktree source
before editing.

- **H1 — clamp rationale wrong; clamp test unreachable (ADDRESSED).** Verified
  `place_market_order` raises `insufficient_cash` before any negative-cash buy,
  and the cash reconstruction is a per-day aggregate with no intra-day ordering,
  so the old "mid-day dip" rationale was false. §1.4 Cash(D) and §1.6 now state
  the correct rationale: the `greatest(..., 0)` is a **defensive floor** for
  directly-seeded/migrated rows, never expected to fire on RPC-produced data. §2.3
  #13 now specifies the clamp test seeds a `filled` BUY `total_cents = 150000`
  against `starting_cash_cents = 100000` with no sells **directly as the owner**
  (RLS/write-path bypass via `reset role`) and asserts `cash_cents = 0` on that
  `snap_date`.

- **H2 — nullable `orders.total_cents` propagates NULL (ADDRESSED).** Verified
  `total_cents bigint` is declared nullable (line 31 of
  `20250105000002_trading_ledger.sql`). The `fills` CTE now wraps both legs in
  `coalesce(o.total_cents, 0)`, and §1.4 Cash(D) / the FR-1.5 holdings bullet /
  the §1.6 edge list document the rule and why (a null in a `filled` row would
  otherwise make `cash_cents`/`equity_cents` NULL and abort the run on the
  `not null` columns). The migration comment states it.

- **M1 — UTC cutoff vs ET series (ADDRESSED, option a).** §4 adds an explicit
  "ET-vs-UTC cutoff decision": the cutoff is kept as a coarse **UTC lower bound**
  mirroring `use-bars.ts`, with the one-day edge drift documented and accepted
  (the newest point is always inside the window since `v_last = yesterday ET`).
  AC-14 unit-test expectations are now pinned to a **fixed UTC `now`** and derived
  from the `RANGE_DAYS` constant, so the test is deterministic despite the drift.

- **M2 — mapped backfill error had no render target (ADDRESSED).** §9 now
  specifies the sparse card renders `mapBackfillError(backfill.error)` as a muted
  caption sub-line when `backfill.isError` (a "Building your history…" sub-line
  while pending), and states the one-shot does not auto-retry (the `firedRef`
  latch is set before `mutate()`). Confirmed the card mounts inside the
  `portfolio` `Gate`, so `not_authenticated` is not expected there but `no_account`
  can occur and its mapped copy is the sub-line shown. §5's closing sentence was
  updated to point at this surface.

- **M3 — "one scan" performance claim inaccurate (ADDRESSED).** Verified
  `quote_bars` PK is `(symbol, bar_date)` (so the `limit 1` is unambiguous). §1.4
  (positions-value bullet and the `priced` CTE comment), the reconstruction-
  approach paragraph, and §10's NFR-7 invariant now describe the price leg as a
  **correlated most-recent-bar lookup per held-symbol-day**, `O(holdings × days)`,
  not a single scan. A `distinct on (symbol)` lateral rewrite was considered and
  rejected (readability vs. negligible per-caller row count); the choice is
  stated.

- **M4 — `plan(N)` deferred (ADDRESSED).** §2.3 adds an explicit 22-row assertion
  inventory and commits the test to `plan(22)`, mirroring how
  `supporting_rpcs.test.sql` commits to `plan(32)`.

- **N1 — active text color (ADDRESSED).** Verified the trading toggle uses
  `color="onPrimary"` (active) / `color="textMuted"` (inactive). §8 now spells out
  the full `onPrimary`/`textMuted` text-color pair alongside the `primary` fill.

- **N2 — `5Y = 1827` approximation (ADDRESSED).** §4 notes `1827 ≈ 5 × 365.25` is
  an approximate span copied from `use-bars.ts`, and that AC-14 expectations are
  computed from the `RANGE_DAYS` constant, not a calendar "5 years ago".

- **N3 — `ChartRange` import path (ADDRESSED).** §8 and §9 now state `ChartRange`
  is imported from `use-portfolio-history.ts` by every consumer and is **not**
  added to the components barrel (which exports components only), avoiding a
  dangling type export.
