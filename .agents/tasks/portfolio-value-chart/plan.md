# Implementation Plan — Portfolio Value Chart

Derived from the APPROVED design (`design.md`) and `requirements.md`. All paths are rooted at the worktree
`/Users/mohamednazirsankari/Apps/masariapp/.worktrees/portfolio-value-chart`. Items are ordered by dependency; each leaves
the tree buildable. Server work (1–3) comes first because the client types in step 3 and the hooks in steps 6–7 depend on the
RPC contract; the screen (step 10) comes last because it wires everything together.

Verification commands (run from the worktree root):
- `npx expo lint`
- `npx tsc --noEmit`
- `npm test` (Jest) — target a file with `npm test -- <path>`
- pgTAP: `npx supabase test db` (requires local Docker stack). If Docker is unavailable, fall back to static validation:
  `npx supabase db lint` if available, otherwise psql-parse the migration/test against a scratch DB, and record that the
  live pgTAP run is deferred to a device/CI pass.

---

- [ ] 1. Create the migration defining `public.backfill_portfolio_snapshots()`.
      Add a `SECURITY DEFINER set search_path = public`, no-argument, `returns int` plpgsql function exactly as design §1.2–§1.5:
      guards (`not_authenticated` when `current_user_id()` is null, `no_account` when the caller has no `paper_accounts` row,
      both `raise exception '<bare_code>'`); `v_today = (now() at time zone 'America/New_York')::date`, `v_last = v_today - 1`;
      `v_start = least(account.created_at ET date, min filled order ET date)` with the early-return `if v_start > v_last then
      return 0`; the single set-based `insert ... select` over `generate_series(v_start, v_last, interval '1 day')` with CTEs
      `days`/`fills`/`holdings`/`priced`/`positions_value`/`cash` as specified, `coalesce(o.total_cents, 0)` on both cash legs,
      `having sum(signed_qty) <> 0`, carry-forward `order by qb.bar_date desc limit 1`, missing-bar `coalesce(..., 0)`, cash
      `greatest(..., 0)` clamp, `on conflict (account_id, snap_date) do update`, `get diagnostics v_count = row_count`. Include
      the `-- DIVERGENCE` comment (price source `quote_bars.close_cents` vs cron's live `quotes`), the clamp-is-defensive
      comment, and the null-`total_cents` comment. End with `revoke execute ... from public, anon` and `grant execute ... to
      authenticated`. No new table/column; no edit to any applied migration.
      Files: supabase/migrations/20250109000001_backfill_portfolio_snapshots_rpc.sql
      Verify: `npx tsc --noEmit` still passes (no TS impact yet); migration parses when the stack applies it in step 2's pgTAP
      run. Confirm the timestamp sorts strictly after `20250108000003_stress_lab_rpcs.sql` and no other migration file changed
      (`git status --short supabase/migrations`).

- [ ] 2. Create the pgTAP test for the RPC.
      New test mirroring `supabase/tests/supporting_rpcs.test.sql` structure: `begin; select plan(22); create extension if not
      exists pgtap; \set helpers_included on; \ir _helpers.sql; ... select * from finish(); rollback;`. Seed instruments, a
      profile + `paper_accounts` for user A (`starting_cash_cents = 1_000_000`, `created_at` well in the past), the three filled
      orders and `quote_bars` from the design §2.1 worked example (orders at noon ET), plus seed rows for user E (no orders),
      user B (ownership isolation), a no-account authenticated user, and a directly-seeded over-buy ledger for the clamp case.
      Assert exactly the 22 rows from design §2.3: 6 equity values (2025-01-03…08), 1 cash (01-07 = 898000), 1 positions
      (01-05 = 105000), 2 idempotency, 1 no-position, 1 cash≠live-cash, 1 clamp (`cash_cents = 0`), 3 ownership, 2 guards
      (`throws_ok ... 'not_authenticated'` / `'no_account'`), 2 no-future-row, 2 grants (`has_function_privilege`). Use
      `reset role` / `set role authenticated|anon` + `tests.set_authenticated_claims` / `tests.clear_claims()` per `_helpers.sql`.
      Files: supabase/tests/backfill_portfolio_snapshots.test.sql
      Verify: `npx supabase test db` — the new test reports `plan(22)` with all 22 assertions passing. If Docker is
      unavailable, record the deferral (see header) and confirm the file parses.

- [ ] 3. Add the generated-type entry for the RPC.
      Insert `backfill_portfolio_snapshots: { Args: Record<PropertyKey, never>; Returns: number }` into the `Functions` block
      of `src/types/db.ts` (block begins at line ~955, next to `current_user_id` / `get_daily_briefing`), consistent with the
      existing no-arg entries. No table-type change (the `portfolio_snapshots` Row already exists).
      Files: src/types/db.ts
      Verify: `npx tsc --noEmit` passes; `supabase.rpc('backfill_portfolio_snapshots')` type-checks (exercised by step 7).

- [ ] 4. Create the `usePortfolioHistory` hook with the pure cutoff helper and fetcher.
      New file mirroring `src/features/trading/use-bars.ts`: export `ChartRange = '1M'|'3M'|'1Y'|'5Y'|'ALL'`,
      `RANGE_DAYS` (1M 31 / 3M 93 / 1Y 366 / 5Y 1827), `PortfolioHistoryPoint`, `portfolioHistoryQueryKey(range)` returning
      `['portfolio-history', range] as const`, pure `rangeCutoffDate(range, now = new Date())` returning `null` for `'ALL'`
      (UTC-derived, per design §4), `fetchPortfolioHistory(range)` selecting
      `snap_date, equity_cents, cash_cents, positions_value_cents` from `portfolio_snapshots` ordered `snap_date` ascending with
      a `.gte('snap_date', cutoff)` only when non-null, mapping rows to camelCase points, and
      `usePortfolioHistory(range, enabled = true)` (no `refetchInterval`, no user id passed).
      Files: src/features/portfolio/use-portfolio-history.ts
      Verify: `npx tsc --noEmit` passes. Unit coverage is added in step 5.

- [ ] 5. Add unit tests for the cutoff helper.
      Jest test asserting `rangeCutoffDate` against a fixed UTC clock (e.g. `new Date('2025-06-15T12:00:00Z')`): exact
      `YYYY-MM-DD` for `1M/3M/1Y/5Y` computed as `now − RANGE_DAYS[range]` from the same constant, and `null` for `'ALL'`
      (AC-14).
      Files: src/features/portfolio/use-portfolio-history.test.ts
      Verify: `npm test -- src/features/portfolio/use-portfolio-history.test.ts` — all cases pass.

- [ ] 6. Create the `useBackfillPortfolioHistory` mutation with error map and zod validation.
      New file mirroring `src/features/trading/use-place-order.ts`: export `BackfillErrorCode = 'not_authenticated'|'no_account'`,
      `mapBackfillError(error)` (same shape as `mapPlaceOrderError`, friendly copy for both codes + generic fallback),
      `backfillResultSchema = z.number().int().nonnegative()`, `backfillPortfolioHistory()` calling
      `supabase.rpc('backfill_portfolio_snapshots')` with no args and `backfillResultSchema.parse(data)`, and
      `useBackfillPortfolioHistory()` invalidating `['portfolio-history']` and `PORTFOLIO_QUERY_KEY` (imported from
      `use-portfolio.ts`) on success. Export `mapBackfillError` and `backfillPortfolioHistory` for tests.
      Files: src/features/portfolio/use-backfill-portfolio-history.ts
      Verify: `npx tsc --noEmit` passes. Unit coverage added in the same step below.

- [ ] 7. Add unit tests for the backfill error mapper and result schema.
      Jest test asserting `mapBackfillError` maps `not_authenticated` / `no_account` / unknown to the expected copy (mirroring
      the `mapPlaceOrderError` test), and that `backfillResultSchema` accepts a non-negative int and rejects a non-number
      (AC-15).
      Files: src/features/portfolio/use-backfill-portfolio-history.test.ts
      Verify: `npm test -- src/features/portfolio/use-backfill-portfolio-history.test.ts` — all cases pass.

- [ ] 8. Create the pure portfolio chart-geometry module and its unit tests.
      New file mirroring `src/features/trading/components/chart-geometry.ts` with a neutral point shape: `EquityPoint
      { snapDate; valueCents }`, `ChartPoint`, `ChartLayout`, `ValueDomain`, and functions `valueDomain` (null for empty,
      ±1 widen when all-equal), `valueToY` (axis flip + clamp), `indexToX` (even spread, single-point centre),
      `equityToPoints`, `pointsToPolyline` (round to 1 decimal). Add the geometry unit tests mirroring
      `chart-geometry.test.ts`: known-series domain, flat-series fallback, single-point centring, empty-series `[]`, polyline
      string (AC-16).
      Files: src/features/portfolio/components/chart-geometry.ts, src/features/portfolio/components/chart-geometry.test.ts
      Verify: `npm test -- src/features/portfolio/components/chart-geometry.test.ts` — all cases pass; `npx tsc --noEmit` passes.

- [ ] 9. Create the portfolio range selector and the `PortfolioValueChart` component, export both from the barrel, add a render test.
      (a) `range-toggle.tsx` — structural clone of `src/features/trading/components/range-toggle.tsx` exporting
      `PORTFOLIO_CHART_RANGES = ['1M','3M','1Y','5Y','ALL']`, `tablist`/`tab` a11y, active fill `theme.colors.primary` +
      `color="onPrimary"`, inactive `transparent` + `color="textMuted"`, importing `ChartRange` from `../use-portfolio-history`.
      (b) `portfolio-value-chart.tsx` — presentational, data-via-props only (no Supabase import), mirroring `line-chart.tsx`:
      `onLayout` width, default height 200, `<Polyline>` for >1 point, `<Circle>` for 1 point, muted "No chart data yet" for
      `empty`/0 points, loading placeholder for `loading`; header shows current equity (`formatCents`), range change in dollars
      (`formatSignedCents`) and percent (`formatPercent(pctChange(last, first))`) tinted `primary`/`danger`/`textMuted` with the
      sign in the a11y label, and a "Paper money" tag; `accessibilityRole="image"` labelled `Portfolio value, ${range}`.
      (c) Export `PortfolioValueChart` (+ `PortfolioValueChartProps`) and the portfolio `RangeToggle` / `PORTFOLIO_CHART_RANGES`
      from `components/index.ts`; do NOT export `ChartRange` from the barrel (design N3). (d) Render test (jest-expo +
      test-renderer) asserting the empty copy, `<Polyline>` for ≥2 points, `<Circle>` for 1 point, and the gain/loss color +
      a11y sign (AC-16, AC-17).
      Files: src/features/portfolio/components/range-toggle.tsx, src/features/portfolio/components/portfolio-value-chart.tsx,
      src/features/portfolio/components/index.ts, src/features/portfolio/components/portfolio-value-chart.test.tsx
      Verify: `npm test -- src/features/portfolio/components/portfolio-value-chart.test.tsx` passes; `npx tsc --noEmit` passes.

- [ ] 10. Wire the chart into the Portfolio tab screen.
      Edit `PortfolioView` in `app/(tabs)/portfolio.tsx`: add `const [range, setRange] = useState<ChartRange>('3M')`, call
      `usePortfolioHistory(range)` and `useBackfillPortfolioHistory()`, and render a chart card in the `header` block above
      `PortfolioSummary` containing `PortfolioValueChart` (points mapped from the history query) and the portfolio
      `RangeToggle`. Treat `data.length <= 1` as sparse: show the "Your portfolio history will build over time" card instead of
      a one-dot chart, render `mapBackfillError(backfill.error)` as a muted caption when `backfill.isError` and a "Building your
      history…" caption while `backfill.isPending`, and fire the backfill at most once per mount via a `useRef` latch set before
      `mutate()` (guarded by `!history.isLoading && sparse && !firedRef.current && !backfill.isPending`). A brand-new account
      that is still `<= 1` point after refetch keeps the empty state. Leave `PortfolioSummary`, the trade-history/Stress Lab
      buttons, the holdings `FlatList`, the empty state, the `Disclaimer`, and the `Gate` unchanged. This is the only edit under
      `app/`.
      Files: app/(tabs)/portfolio.tsx
      Verify: `npx tsc --noEmit` and `npx expo lint` pass; `npm test` (full suite) passes.

- [ ] 11. Full-suite verification and no-dependency check.
      Run the complete gate and confirm the diff stays in scope.
      Files: (none)
      Verify: `npx expo lint` clean, `npx tsc --noEmit` clean, `npm test` green, and `npx supabase test db` green (or the
      documented static fallback). `git diff --stat package.json package-lock.json` shows both unchanged, and
      `git grep -n "victory\|react-native-chart\|recharts"` returns nothing new (no charting lib added; AC-22).

---

## Acceptance checks: automatable vs device/simulator

Automatable in this workflow (lint / tsc / Jest / pgTAP):
- AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11 — covered by the pgTAP test (step 2) + file/grant inspection.
- AC-12 — `npx tsc --noEmit` after step 3.
- AC-13, AC-14 — the cutoff/fetch helper and its unit test (steps 4–5).
- AC-15 — the mutation mapper/schema unit test (steps 6–7).
- AC-16 (geometry + render), AC-17 (gain/loss color + a11y sign) — geometry and render tests (steps 8–9).
- AC-22 — `git diff` / grep in step 11.
- AC-23 — the lint/tsc/Jest/pgTAP gate (step 11).

Need a device or simulator pass (not automatable here):
- AC-18 — visually confirm the `1M/3M/1Y/5Y/ALL` selector renders, marks the active option, and switching range refetches and
  redraws the curve (the `selected` state is unit-asserted, but the live refetch-and-redraw needs a running app).
- AC-19 — on the Portfolio tab with ≥2 snapshot rows, the chart card renders the curve at default `3M` and existing content
  still works.
- AC-20 — with 0/1 rows, the "build over time" card shows, the backfill fires once, and after it succeeds the curve appears.
- AC-21 — a brand-new account keeps the friendly empty state after the backfill (no flat single-dot chart).
  (The once-per-mount `useEffect` latch is correct by inspection per design §11; its live behavior is a simulator check.)
