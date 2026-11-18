# Design Review — Portfolio Value Chart (revision pass)

Reviewed: `.agents/tasks/portfolio-value-chart/design.md`
Against: `.agents/tasks/portfolio-value-chart/requirements.md` and the worktree
source at `/Users/mohamednazirsankari/Apps/masariapp/.worktrees/portfolio-value-chart`.

This is a re-review of a design that already went through one round
(`design.md` §14 documents the responses to a prior `CHANGES_REQUESTED` with
HIGH 2 / MEDIUM 4 / NIT 3). I re-derived every claim from the worktree source
rather than trusting the §14 narrative, and I recomputed the pgTAP worked
example row by row.

## Summary judgement

The design is implementable as written. On every checkpoint the review brief
named, it holds up against the actual source:

- The RPC derives the account from `current_user_id()` only, takes no argument,
  is `SECURITY DEFINER set search_path = public`, and guards
  `not_authenticated` / `no_account` as bare-error-code `raise exception`s —
  matching `place_market_order` and `submit_reflection`
  (`20250105000006`, `20250105000007`).
- Cash is reconstructed from the ledger (`starting_cash_cents + Σ filled SELL −
  Σ filled BUY`, each `coalesce(total_cents, 0)`), not from `v_acct.cash_cents`,
  clamped `>= 0`.
- `snap_date` is bounded to `v_today - 1` (yesterday ET), so the cron's same-day
  row is never overwritten.
- The upsert is `on conflict (account_id, snap_date) do update`, idempotent on
  the existing PK.
- The earliest-date rule (`least(account created_at ET, first filled order ET)`)
  and carry-forward close (`bar_date <= D`, most recent) are both stated and
  defensible.
- The pgTAP plan is concrete: `plan(22)` with an enumerated assertion table and
  a hand-computed six-row worked example (which I verified — see below).
- The client surface (hook mirroring `use-bars.ts`, mutation + zod + error map
  mirroring `use-place-order.ts` / `use-run-simulation.ts`, presentational chart
  via props, five-range selector with `ALL`, sparse/empty state + once-per-mount
  backfill with an error render target) is fully specified.
- Constraints are honored: no new deps (`react-native-svg@15.15.4` reused), no
  trading/snapshot changes (new migration only), non-route code under
  `src/features/portfolio/` with the single `app/` edit being
  `app/(tabs)/portfolio.tsx`.

All nine findings from the prior review are genuinely resolved in the current
document, confirmed against source (see Verified Assumptions). The two findings
below are new and minor; neither blocks implementation.

## Worked-example verification (independent recompute)

Seed: starting cash `1,000,000`; orders `01-03 buy AAA 10 (100000)`,
`01-05 buy BBB 5 (50000)`, `01-07 sell AAA 4 (48000)`; bars AAA
`03=10000, 04=10500, 08=12000`, BBB `06=11000, 08=9000`.

| date | cash | AAA qty×close | BBB qty×close | positions | equity | design |
|------|------|---------------|---------------|-----------|--------|--------|
| 01-03 | 900000 | 10×10000=100000 | — | 100000 | 1,000,000 | 1,000,000 ✓ |
| 01-04 | 900000 | 10×10500=105000 | — | 105000 | 1,005,000 | 1,005,000 ✓ |
| 01-05 | 850000 | 10×10500 (carry)=105000 | 5×0 (no bar ≤D)=0 | 105000 | 955,000 | 955,000 ✓ |
| 01-06 | 850000 | 10×10500 (carry)=105000 | 5×11000=55000 | 160000 | 1,010,000 | 1,010,000 ✓ |
| 01-07 | 898000 | 6×10500 (carry)=63000 | 5×11000 (carry)=55000 | 118000 | 1,016,000 | 1,016,000 ✓ |
| 01-08 | 898000 | 6×12000=72000 | 5×9000=45000 | 117000 | 1,015,000 | 1,015,000 ✓ |

All six `equity_cents`, the `cash_cents(01-07)=898000` (#7), and the
`positions_value_cents(01-05)=105000` (#8) assertions are internally consistent.
The worked example exercises the missing-bar-=-0 rule (BBB on 01-05),
carry-forward (AAA/BBB on 01-05/06/07), and both the sell leg of cash and the
sell leg of holdings (01-07). Good.

---

## Findings

### HIGH

_None._

### MEDIUM

_None._

### NIT

**N1. The §9 claim that the components barrel "exports components, not types" is
inaccurate, which weakens (but does not break) the stated rationale for keeping
`ChartRange` out of the barrel.**
Location: design §9, final paragraph ("the current barrel exports only
`PortfolioSummary`/`PositionRow`; it exports components, not types").
`src/features/portfolio/components/index.ts` currently exports
`type PortfolioSummaryProps` and `type PortfolioSummaryProps`'s sibling
`type PositionRowProps` alongside the two components — i.e. it already exports
types. The design's conclusion (import `ChartRange` from
`use-portfolio-history.ts`, not the barrel, to avoid a dangling type export) is
still sound and worth doing, but the justifying sentence misstates the current
barrel. Fix: reword to "the barrel exports each component with its own props
type; `ChartRange` lives in the hook module and every consumer imports it from
there, so it is not re-exported through the components barrel." The decision
stands; only the description needs correcting.

**N2. `no_account` copy diverges from the sibling Stress Lab mutation for the
same underlying condition.**
Location: design §5 (`BACKFILL_ERROR_MESSAGES.no_account =
"We couldn't find your paper account. Please try again."`).
`use-place-order.ts` uses the identical string, so the design is internally
consistent with the trading mutation it mirrors. However
`use-run-simulation.ts` maps the same `no_account` code to
"We couldn't find your paper portfolio. Make a trade first, then try again." —
which is more actionable for a gated-but-account-less learner, exactly the case
§9 says can still occur inside the `Gate`. This is a copy choice, not a defect;
flagging only so the implementer picks deliberately rather than by accident.
Fix (optional): consider the more actionable Stress Lab phrasing for
`no_account`, since the backfill's `no_account` surfaces on the chart card to a
learner who may simply have no trades yet.

---

## Verified Assumptions

Each was checked by reading the cited source in the worktree:

1. **`portfolio_snapshots` shape/PK** — exactly `account_id uuid, snap_date date,
   cash_cents bigint, positions_value_cents bigint, equity_cents bigint`, PK
   `(account_id, snap_date)` (`20250105000002_trading_ledger.sql`). Matches the
   design's insert column list and `on conflict` target.
2. **`orders.total_cents` is nullable** — declared `total_cents bigint` with no
   `not null` (`20250105000002`). The design's `coalesce(o.total_cents, 0)` in
   the `fills` CTE (prior H2) is justified and present.
3. **`snapshot_portfolios()` conventions** — `SECURITY DEFINER set search_path =
   public`, returns `int`, `v_today = (now() at time zone 'America/New_York')
   ::date`, upsert `on conflict (account_id, snap_date)`, execute revoked from
   `public, anon, authenticated` (`20250105000007`). The backfill mirrors return
   type, search_path, ET date, and upsert; the price-source divergence
   (`quote_bars.close_cents` vs live `quotes`) is real and documented.
4. **`place_market_order` guards and cash safety** — `not_authenticated` /
   `no_account` raised as bare codes; buys blocked by `insufficient_cash`
   (`20250105000006`). Confirms the corrected clamp rationale (prior H1): a
   write-path ledger can never drive daily reconstructed cash negative, so
   `greatest(..., 0)` is a defensive floor and the clamp pgTAP case must seed a
   BUY directly. §2.3 #13 does exactly that.
5. **RLS / grants** — `"own snapshots"` policy is SELECT-only for the owning
   account; `portfolio_snapshots` has no client write grant
   (`20250105000003`). The RPC's `SECURITY DEFINER` write bypasses this for the
   caller's own `account_id` only; the design's grant block
   (`revoke ... from public, anon; grant ... to authenticated`) matches the
   sibling RPCs.
6. **`paper_accounts`** — has `id, user_id (unique, not null), cash_cents,
   starting_cash_cents, created_at timestamptz not null`
   (`20250103000004_account_tables.sql`). `user_id` unique makes
   `select * into v_acct ... where user_id = v_uid` single-row safe; `created_at`
   exists for the earliest-date computation.
7. **`quote_bars`** — PK `(symbol, bar_date)`, readable by `authenticated`
   (`20250105000001` / `20250105000003`). Makes the `priced` correlated
   `order by bar_date desc limit 1` unambiguous (prior M3 corrected).
8. **`use-bars.ts` pattern** — `ChartRange`, `RANGE_DAYS` (`5Y = 1827`),
   `rangeCutoffDate` using `getUTCDate()` / `toISOString().slice(0,10)`,
   `barsQueryKey`, `fetchBars`, `useBars`, no polling. The hook design mirrors
   this faithfully; the UTC-vs-ET cutoff drift is documented and accepted (prior
   M1), with AC-14 expectations pinned to a fixed UTC `now`.
9. **`chart-geometry.ts` (trading)** — `ChartBar { bar_date, close_cents }`,
   `priceDomain` (empty → null; flat → ±1), `priceToY` (axis flip + clamp),
   `indexToX` (even spread, single-point centre), `barsToPoints`,
   `pointsToPolyline` (round to 1 dp). The portfolio geometry module reuses this
   math over a neutral `EquityPoint { snapDate, valueCents }`; `ChartBar` is
   genuinely `quote_bars`-specific, so a feature-local module (not reuse) is
   correct.
10. **Stress-lab feature-local `chart-geometry.ts` precedent** exists
    (`src/features/stress-lab/components/chart-geometry.ts` + `.test.ts`),
    supporting the "add a feature-local geometry module" decision over
    generalizing the shared one.
11. **`line-chart.tsx` / `range-toggle.tsx`** — `onLayout` width self-measure,
    `<Polyline>` for >1 point, `<Circle>` for 1, "No chart data yet" for empty;
    toggle is a `tablist` of `Pressable` `tab`s with
    `accessibilityState={{ selected }}`, active `backgroundColor =
    theme.colors.primary`, active text `color="onPrimary"` / inactive
    `textMuted` (prior N1 corrected in §8).
12. **`portfolio-summary.tsx`** — `gainColor` (`primary`/`danger`/`textMuted`),
    `gainText` via `formatSignedCents` + `formatPercent`, "Paper money" tag.
    The chart header spec mirrors these exactly.
13. **`money.ts`** — `formatCents`, `formatSignedCents`, `formatPercent`,
    `pctChange` (basis points, `null` on zero basis) all exist with the
    signatures the chart header relies on.
14. **`use-place-order.ts` error-map pattern** — `Record<Code, string>`,
    `map*Error(unknown)`, `is*Code` guard, message-off-error reader, fallback
    string; exported for unit test. `use-run-simulation.ts` adds the
    zod-at-boundary (`parse*` throws on malformed payload). The backfill hook
    mirrors both.
15. **`src/types/db.ts` Functions block** — no-arg entries use
    `Args: Record<PropertyKey, never>` (`current_user_id`, `get_daily_briefing`);
    `watchlist_remove` nearby. The design's new
    `backfill_portfolio_snapshots: { Args: Record<PropertyKey, never>; Returns:
    number }` is consistent, and `supabase.rpc('backfill_portfolio_snapshots')`
    with no args matches the established `supabase.rpc('get_daily_briefing')`
    call in `use-briefing.ts`.
16. **pgTAP harness** — `_helpers.sql` prescribes top-level `reset role` /
    `set role authenticated|anon` with `tests.set_authenticated_claims` /
    `tests.clear_claims`; `supporting_rpcs.test.sql` commits `plan(32)` up front
    and seeds as the owner. The design's §2 harness description and `plan(22)`
    commitment match.
17. **Latest migration timestamp** — the newest applied migration is
    `20250108000003_stress_lab_rpcs.sql`, so `20250109000001_...` is strictly
    later and no applied file is edited.
18. **`portfolio` Gate** — `app/(tabs)/portfolio.tsx` wraps `PortfolioView` in
    `<Gate feature="portfolio">`, so the chart card mounts only after the gate
    passes (supports the §9 claim that `not_authenticated` should not surface
    there, `no_account` still can).

## Unverified / Wrong Assumptions

- **None that block implementation.** One descriptive inaccuracy (N1: the
  components barrel does export prop types, contrary to the design's aside) and
  one copy-consistency note (N2) are captured above; neither is a wrong
  structural assumption about the source.
- **Two items the design itself flags for implement-time smoke testing (§13)**
  remain reasonable and are not downgraded findings: (a) the local Supabase
  stack is the `supabase test db` runner (consistent with the task's opening
  `supabase db query --linked`), and (b) `generate_series(date, date, interval
  '1 day')::date` casts cleanly on Postgres 17. Both are standard; the design
  correctly leaves them as a verify-on-apply note rather than a design decision.

## Verdict

No HIGH or MEDIUM findings. Two NITs only. **APPROVED.**
