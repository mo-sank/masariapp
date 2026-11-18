# Requirements — Portfolio Value Chart

## Summary

Add a line chart to the Portfolio tab that shows a user's paper-trading
portfolio value (equity) over time, with selectable time frames
(1M / 3M / 1Y / 5Y / ALL). The plotted series is the daily `equity_cents` from
`public.portfolio_snapshots`, which the existing `snapshot_portfolios()` cron
writes forward one day at a time. Because that cron only started recently, the
longer ranges would otherwise be empty, so a new SECURITY DEFINER RPC,
`backfill_portfolio_snapshots()`, reconstructs the historical daily series for
the caller's account from the `orders` + `quote_bars` ledger and upserts it into
the same table, producing rows indistinguishable in shape and semantics from the
cron's rows. The client fires the backfill opportunistically when the chart has
too little data to draw.

This is a full feature spanning a new database migration, a pgTAP test, two
client hooks, one presentational chart component, a range selector, and the
Portfolio tab screen wiring.

### Scope note (unrelated prior request)

The earlier user message about removing the "Market 101" and glossary
buttons/features is a separate task and is **out of scope** for this document.
This requirements document covers only the Portfolio Value Chart feature.

### Confirmed environment and source facts

Every fact below was verified against the worktree during this pass:

- Expo SDK `~57.0.26`, React Native `0.86.3`, React `19.2.3`, Expo Router
  `~57.0.24`. `react-native-svg` `15.15.4` is already a dependency. No
  `bun.lock` present, so use `npx`.
- `@supabase/supabase-js` `^2.117.2`, `@tanstack/react-query` `^5.104.1`,
  `zod` `^4.6.5` are present. Money math is integer cents via `src/lib/money.ts`.
- `public.portfolio_snapshots` columns are exactly: `account_id uuid`,
  `snap_date date`, `cash_cents bigint`, `positions_value_cents bigint`,
  `equity_cents bigint`, PK `(account_id, snap_date)`
  (`20250105000002_trading_ledger.sql`). RLS policy `"own snapshots"` grants
  `SELECT` to the owning account only; `authenticated` has `SELECT`, no direct
  writes (`20250105000003_market_trading_rls_and_grants.sql`).
- `public.snapshot_portfolios()` is `SECURITY DEFINER set search_path = public`,
  returns `int`, computes the snapshot date as
  `(now() at time zone 'America/New_York')::date`, derives positions value from
  the **live `quotes` table** (`qty * price_cents`), upserts
  `on conflict (account_id, snap_date)`, and execute is revoked from
  `public, anon, authenticated` (service-only). **Divergence to note:** the
  backfill must instead value positions from `quote_bars.close_cents` at the
  historical `bar_date`, because `quotes` holds only the current price. The
  backfill's row *shape and column semantics* match the cron; the *price source*
  necessarily differs (historical close vs. live quote). This is expected and
  must be documented in the migration.
- `public.orders` columns include `account_id`, `user_id`, `symbol`,
  `side ('buy'|'sell')`, `qty bigint`, `status ('filled'|'pending'|'cancelled')`,
  `fill_price_cents`, `total_cents`, `created_at`. Only `status='filled'` rows
  reconstruct holdings.
- `public.quote_bars` columns: `symbol`, `bar_date`, `open_cents`, `high_cents`,
  `low_cents`, `close_cents`, `volume`, PK `(symbol, bar_date)`. Readable by
  `authenticated`. `close_cents` is the historical price source.
- `public.paper_accounts` has `id`, `user_id`, `cash_cents`,
  `starting_cash_cents`, `created_at`.
- `public.current_user_id()` returns the caller's `user_id` (text) and is the
  RLS/ownership source; no user id is ever passed from the client.
- Client chart pattern to mirror: `src/features/trading/use-bars.ts`
  (`ChartRange`, `RANGE_DAYS`, `rangeCutoffDate`, `fetchBars`, `useBars`,
  `barsQueryKey`). Pure geometry: `src/features/trading/components/chart-geometry.ts`.
  Renderer: `src/features/trading/components/line-chart.tsx`. Range selector:
  `src/features/trading/components/range-toggle.tsx` (`CHART_RANGES`). Error-map
  / mutation pattern: `src/features/trading/use-place-order.ts`. Portfolio read
  model: `src/features/portfolio/use-portfolio.ts`; portfolio components barrel
  `src/features/portfolio/components/index.ts`. Screen:
  `app/(tabs)/portfolio.tsx`. Generated DB types: `src/types/db.ts`
  (`Functions` block begins line ~955).
- **Divergence to note:** `chart-geometry.ts` types (`ChartBar`) are hard-coded
  to `quote_bars` fields (`bar_date`, `close_cents`). The portfolio chart plots
  `snap_date` / `equity_cents`, so it cannot literally reuse `ChartBar`. The
  design must either add a small portfolio-specific geometry module that mirrors
  the same math (`priceDomain`/`priceToY`/`indexToX`/`barsToPoints` equivalents)
  or generalize the existing helpers to a neutral `{ value }` point shape. The
  *approach* (pure, unit-tested geometry + thin SVG renderer) is reused; the
  exact `ChartBar` type is not.
- Migrations dir: latest files are `20250108000001..03`. New migration must use
  a later timestamp (e.g. `20250109000001_...`). pgTAP tests live in
  `supabase/tests/`; `config.toml [db.seed] sql_paths` already lists the seed
  files.

### Assumptions

1. **Earliest backfill date** = the later of `paper_accounts.created_at::date`
   and the first filled order date is *not* used; instead the series starts at
   the **earlier** of those two that still has usable data, per the step brief.
   Concretely: start at `min(first filled order created_at::date,
   account created_at::date)` but only emit a row for a calendar date that has
   at least one `quote_bars.close_cents` available for a held symbol *or* the
   account has zero positions on that date (cash-only rows are still valid).
   The implementation must document the exact chosen rule in a SQL comment; the
   acceptance criteria below pin the observable behavior rather than the internal
   phrasing.
2. **ET calendar** is the canonical day for both ledger reconstruction and the
   `snap_date`, matching `snapshot_portfolios()`. Order dates are compared as
   `(created_at at time zone 'America/New_York')::date`.
3. **"Sparse" history** on the client = 0 or 1 snapshot rows returned for the
   current range. This is the trigger for the one-shot backfill.
4. The `portfolio` feature gate already protects the Portfolio tab; the chart
   inherits that gate and adds no new unlock.
5. The chart does not need intraday data; one point per calendar day is
   sufficient, matching `quote_bars` and `portfolio_snapshots` granularity.

## Functional Requirements

### FR-1 Server: `backfill_portfolio_snapshots()` RPC

- FR-1.1 A new timestamped migration under `supabase/migrations/` (timestamp
  later than `20250108000003`) defines
  `public.backfill_portfolio_snapshots()` as `language plpgsql SECURITY DEFINER
  set search_path = public`, returning `int` (number of rows upserted), mirroring
  the conventions of `snapshot_portfolios()` and `place_market_order()`.
- FR-1.2 The function derives the account from `public.current_user_id()` only.
  It accepts **no** account/user argument.
- FR-1.3 It raises `not_authenticated` when `current_user_id()` is null, and
  `no_account` when the caller has no `paper_accounts` row — raised as Postgres
  exceptions whose message is the bare error code, matching
  `place_market_order` / `submit_reflection`.
- FR-1.4 It reconstructs a daily series for the caller's single account from the
  earliest relevant date (see Assumption 1) up to **yesterday ET**
  (`(now() at time zone 'America/New_York')::date - 1`), emitting one row per
  calendar date that has usable price data (or a cash-only date). It never
  writes a row for `snap_date >= today ET`, so it can never overwrite the cron's
  same-day row written by a different price method.
- FR-1.5 For each date `D`, holdings per symbol = net filled buy qty minus net
  filled sell qty for `orders` with `status='filled'` and
  `(created_at at time zone 'America/New_York')::date <= D`.
- FR-1.6 `positions_value_cents(D)` = sum over held symbols of
  `qty(D) * close_cents` where `close_cents` is from `quote_bars` at
  `bar_date = D`, or the most recent `bar_date <= D` when no bar falls exactly on
  `D`. A held symbol with no bar at or before `D` contributes 0, matching the
  `use-portfolio.ts` missing-quote = 0 rule.
- FR-1.7 `cash_cents(D)` is reconstructed from the ledger, **not** from the
  account's current cash: `starting_cash_cents` + sum of filled SELL
  `total_cents` up to `D` − sum of filled BUY `total_cents` up to `D`. The result
  is clamped to `>= 0` with an explanatory SQL comment.
- FR-1.8 `equity_cents(D)` = `cash_cents(D) + positions_value_cents(D)`. All
  arithmetic is integer `bigint` cents; the reconstruction is deterministic for a
  given ledger and bar set.
- FR-1.9 Rows are written with
  `insert ... on conflict (account_id, snap_date) do update`, so re-running the
  backfill updates existing rows rather than duplicating them, and the result is
  idempotent for an unchanged ledger.
- FR-1.10 The function creates no new table and adds no column. It is the only
  write path to `portfolio_snapshots` available to a client; clients keep
  SELECT-only. `execute` is granted to `authenticated` and revoked from
  `public, anon`.
- FR-1.11 `src/types/db.ts` gains a `Functions.backfill_portfolio_snapshots`
  entry (`Args: Record<PropertyKey, never>`, `Returns: number`) consistent with
  the existing generated entries.

### FR-2 Server: pgTAP test

- FR-2.1 A new test in `supabase/tests/` (mirroring the structure and helper
  usage of `supporting_rpcs.test.sql`: `begin` / `plan(N)` / `pgtap` /
  `\ir _helpers.sql` / `tests.set_authenticated_claims` / role switching /
  `finish()` / `rollback`).
- FR-2.2 It seeds an account with filled orders across several dates and
  `quote_bars` rows across those dates, runs the backfill, and asserts specific
  `equity_cents` on specific `snap_date` values from a hand-computed worked
  example (cash and positions legs both exercised).
- FR-2.3 It asserts idempotency: running the backfill twice yields the same row
  count and the same `equity_cents` values (no duplicates, no drift).
- FR-2.4 It asserts a no-position account yields `equity_cents` equal to the
  reconstructed cash (`positions_value_cents = 0`).
- FR-2.5 It asserts ownership isolation: a second user cannot produce or read
  the first user's snapshots (the RPC run as user B writes only B's account; B's
  SELECT under RLS cannot see A's rows).
- FR-2.6 It asserts the `not_authenticated` guard (no claims) and the
  `no_account` guard (authenticated but no `paper_accounts` row).
- FR-2.7 It asserts the backfill never writes a `snap_date >= today ET` row.

### FR-3 Client: `usePortfolioHistory(range)` hook

- FR-3.1 New hook in `src/features/portfolio/` mirroring `use-bars.ts`
  structure. `ChartRange` here is `'1M' | '3M' | '1Y' | '5Y' | 'ALL'` (adds
  `'ALL'` to the trading set).
- FR-3.2 `fetchPortfolioHistory(range)` selects
  `(snap_date, equity_cents, cash_cents, positions_value_cents)` from
  `portfolio_snapshots`, filtered `snap_date >= cutoff` (where `'ALL'` applies no
  cutoff), ordered by `snap_date` ascending. RLS scopes rows to the caller; no
  user id is passed.
- FR-3.3 A pure `rangeCutoffDate`-equivalent helper computes the cutoff from an
  injectable clock and is unit-tested, including the `'ALL'` = no-cutoff case.
- FR-3.4 The react-query key is `['portfolio-history', range]`.

### FR-4 Client: `useBackfillPortfolioHistory()` mutation

- FR-4.1 New mutation hook calling
  `supabase.rpc('backfill_portfolio_snapshots')` with no arguments.
- FR-4.2 On success it invalidates `['portfolio-history']` and the existing
  `['portfolio', 'me']` (`PORTFOLIO_QUERY_KEY`) query keys so the chart and the
  summary re-read.
- FR-4.3 Errors are mapped to friendly, student-appropriate copy through a code
  map consistent with `mapPlaceOrderError` in `use-place-order.ts`, covering at
  least `not_authenticated` and `no_account` plus a generic fallback. A zod
  schema validates the RPC result shape (a number), consistent with the project's
  zod usage.
- FR-4.4 The backfill fires at most once per session/mount, only when history is
  sparse (see FR-5.3). It must not fire on every render or on every range change.

### FR-5 Client: `PortfolioValueChart` component

- FR-5.1 New presentational component in `src/features/portfolio/components/`
  built on `react-native-svg`, reusing the stock-detail charting *approach*
  (polyline path, min/max y-scaling with a flat-series fallback, index-to-x
  spread, inner padding, self-measured width via `onLayout`, single-point dot).
  Geometry math lives in a pure, unit-tested module (a portfolio equivalent of
  `chart-geometry.ts`, since `ChartBar` is `quote_bars`-specific — see the
  divergence note).
- FR-5.2 Props are data-only: an array of points (each with a date and
  `equityCents`), the selected `range`, and `loading` / `empty` flags. The
  component performs no data fetching, so Stress Lab can adopt it later.
- FR-5.3 It displays the current/selected equity and the change across the
  visible range in both dollars (`formatSignedCents`) and percent
  (`formatPercent` over `pctChange`), tinted with the positive/negative theme
  colors (`primary` / `danger`), with the sign carried in text for
  accessibility (mirroring `PortfolioSummary`).
- FR-5.4 An accessible range selector (reusing or mirroring `RangeToggle`,
  extended to include `'ALL'`) sits with the chart; the active range is marked
  `selected` for assistive tech.
- FR-5.5 Values are labeled as paper/simulated money, consistent with the
  "Paper money" tag used by `PortfolioSummary`.
- FR-5.6 The component is exported from
  `src/features/portfolio/components/index.ts`.

### FR-6 Integration: Portfolio tab screen

- FR-6.1 `app/(tabs)/portfolio.tsx` renders a chart card near the top of the
  existing header (above or alongside `PortfolioSummary`), wired to
  `usePortfolioHistory` with a default range of `3M` and a working range
  selector. Non-route code (the hook and component) stays under
  `src/features/`; only this screen file lives under `app/`.
- FR-6.2 Existing content (summary card, trade-history and Stress Lab buttons,
  holdings list, empty state, disclaimer, `Gate`) keeps working unchanged.
- FR-6.3 Empty/sparse state: when `usePortfolioHistory` returns 0 or 1 rows, the
  screen shows a friendly card ("Your portfolio history will build over time")
  **and** opportunistically fires the one-shot backfill (FR-4). After the
  backfill succeeds and the query refetches, the reconstructed curve renders.
- FR-6.4 If the account is still a single day after the backfill (brand-new
  account with no trades and no reconstructable history), the friendly empty
  state persists rather than drawing a flat single-dot chart.

## Non-Functional Requirements

- NFR-1 No new runtime dependencies: `package.json` and `package-lock.json` are
  unchanged. No charting library is added; `react-native-svg` is reused.
- NFR-2 No external or paid APIs; the backfill reads only existing Supabase
  tables.
- NFR-3 All money is integer cents end to end; formatting goes through
  `src/lib/money.ts`. No float math touches a stored money value.
- NFR-4 UI follows the Masari theme (`src/theme`) and shared UI
  (`src/components/ui`), is student-friendly, clearly labeled as simulated/paper
  money, and responsive on mobile (chart width measured via `onLayout`).
- NFR-5 No modification to `place_market_order`, `snapshot_portfolios`, or the
  `orders` / `positions` schema. Applied migrations are never edited; a new
  timestamped file is added.
- NFR-6 `npx expo lint` and `npx tsc --noEmit` pass. Client pure helpers and the
  chart geometry are covered by Jest unit tests; the RPC by the pgTAP test.
- NFR-7 The backfill is deterministic and bounded: one scan of the caller's
  filled orders and the relevant `quote_bars`, no cross-account work, safe to run
  repeatedly.

## Acceptance Criteria

1. A new migration file exists under `supabase/migrations/` with a timestamp
   later than `20250108000003`, and no previously applied migration file is
   modified.
2. `backfill_portfolio_snapshots()` is `SECURITY DEFINER`, has
   `set search_path = public`, takes no arguments, and returns the count of rows
   upserted.
3. Calling the RPC with no authenticated claims raises `not_authenticated`;
   calling it as an authenticated user with no `paper_accounts` row raises
   `no_account`.
4. For a seeded account with filled orders and `quote_bars` across known dates,
   the RPC writes `portfolio_snapshots` rows whose `equity_cents` on specific
   `snap_date`s equal the hand-computed values in the pgTAP test, where
   `equity = reconstructed_cash + sum(holding_qty(D) * close_at_or_before(D))`.
5. A held symbol with no `quote_bars` row at or before date `D` contributes 0 to
   that date's `positions_value_cents` (does not abort the run or skip the date).
6. `cash_cents(D)` equals `starting_cash_cents` + filled SELL totals up to `D` −
   filled BUY totals up to `D`, clamped to `>= 0`, reconstructed from the ledger
   (verified by a test case where current account cash differs from the
   reconstructed value).
7. No row is written with `snap_date >= today ET`; the latest possible
   `snap_date` is yesterday ET.
8. Running the RPC twice produces the same number of rows and identical
   `equity_cents` values (idempotent upsert on `(account_id, snap_date)`).
9. An account with zero positions over the whole range gets rows with
   `positions_value_cents = 0` and `equity_cents = reconstructed cash`.
10. User B running the RPC writes only B's account rows; B cannot SELECT A's
    snapshots under RLS, and A's rows are unaffected by B's run.
11. `execute` on the RPC is granted to `authenticated` and not to `anon` /
    `public`; `portfolio_snapshots` remains SELECT-only for clients (no direct
    write grant added).
12. `src/types/db.ts` contains a `backfill_portfolio_snapshots` entry under
    `Functions` with empty `Args` and `Returns: number`; `npx tsc --noEmit`
    passes.
13. `usePortfolioHistory('3M')` queries `portfolio_snapshots` for
    `(snap_date, equity_cents, cash_cents, positions_value_cents)` filtered
    `snap_date >= cutoff` ordered ascending, keyed `['portfolio-history','3M']`,
    passing no user id; `'ALL'` applies no `snap_date` filter.
14. The pure range-cutoff helper returns the expected `YYYY-MM-DD` for `1M`,
    `3M`, `1Y`, `5Y` against a fixed injected clock and returns no-cutoff for
    `ALL`, verified by Jest.
15. `useBackfillPortfolioHistory()` calls `supabase.rpc(
    'backfill_portfolio_snapshots')`, invalidates `['portfolio-history']` and
    `['portfolio','me']` on success, and maps `not_authenticated` / `no_account`
    / unknown errors to friendly copy (verified by a unit test on the mapper,
    mirroring `mapPlaceOrderError`).
16. `PortfolioValueChart` renders a polyline from data passed via props only (no
    Supabase import in the component), scales y from min/max equity with a flat
    fallback, shows a single dot for one point, and shows "No chart data yet"
    styling for an empty series — verified by the geometry unit tests and a
    render test.
17. The chart shows range change in dollars and percent with the correct
    positive/negative theme color and the sign in the accessibility label.
18. The range selector exposes `1M / 3M / 1Y / 5Y / ALL`, marks the active
    option `selected`, and switching range refetches the corresponding series.
19. On the Portfolio tab, with ≥ 2 snapshot rows the chart card renders the curve
    with default range `3M`; existing summary, buttons, holdings list, empty
    state, and disclaimer are unchanged and still functional.
20. With 0 or 1 snapshot rows the screen shows the "Your portfolio history will
    build over time" card and fires the backfill at most once per mount; after a
    successful backfill the query refetches and the curve renders.
21. A brand-new account with no trades keeps the friendly empty state after the
    backfill (no flat single-dot chart).
22. `git diff` shows `package.json` and `package-lock.json` unchanged; no new
    import of any charting library; the only new file under `app/` changes is the
    edit to `app/(tabs)/portfolio.tsx`.
23. `npx expo lint`, `npx tsc --noEmit`, and the Jest suite pass; the new pgTAP
    test passes under the project's test runner.

## Out of Scope

- Removing the "Market 101" and glossary buttons/features (a separate request).
- Changing `snapshot_portfolios()`, the nightly cron schedule, or
  `place_market_order`.
- Intraday or sub-daily portfolio points; only one point per calendar day.
- Per-position historical breakdown, benchmark overlays, drawdown, or
  annotations/markers on the portfolio chart.
- Backfilling or snapshotting other users' accounts, or any server-side batch
  backfill job (the backfill is per-caller, client-triggered).
- Adopting `PortfolioValueChart` inside Stress Lab (the component is built to be
  reusable, but wiring it into Stress Lab is a later task).
- Any change to the `orders` / `positions` / `paper_accounts` schema or RLS.
