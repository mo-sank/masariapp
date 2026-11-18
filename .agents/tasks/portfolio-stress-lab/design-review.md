# Design Review — Portfolio Stress Lab

Reviewer: design-review subagent (fresh read, no prior context).
Scope: `.agents/tasks/portfolio-stress-lab/design.md` against `requirements.md`, verified against the live codebase at `/Users/mohamednazirsankari/Apps/masariapp`.

## Verdict

**APPROVED** — 0 HIGH, 0 MEDIUM, 3 NITs.

This design is implementation-ready. All four design-phase questions are resolved with accurate, verifiable code evidence; the five scenarios ship complete shock tables; the engine contract is precise and correct; persistence stores snapshots; module boundaries are clean; phasing and dependency constraints are honored. The findings below are NITs that do not block and the coder can resolve inline.

---

## Findings

### 1. NIT — `config.toml` seed insertion point described slightly loosely
**Where:** Data model → seed bullet ("register it in `config.toml` `[db.seed] sql_paths`, appended after `./seed/instruments.sql`").
**Problem:** The live `sql_paths` is `["./seed/seed.sql", "./seed/catalog.generated.sql", "./seed/instruments.sql", "./seed/holidays.sql"]`. Appending "after `instruments.sql`" would place the scenario seed between `instruments.sql` and `holidays.sql`, which is harmless but not literally "appended." The intent (ordering after `instruments.sql` so FKs resolve) is correct.
**Fix:** State it as "append `./seed/stress_scenarios.sql` to the end of the `sql_paths` array (it has no FK dependency on `holidays.sql`, so trailing placement is fine)." No ordering constraint is actually violated either way.

### 2. NIT — `gen_random_uuid()` vs. `expo-crypto` client UUIDs unreconciled in prose
**Where:** Tech-stack line names `expo-crypto` for client UUIDs; `stress_simulations.id` uses `default gen_random_uuid()` server-side.
**Problem:** The design lists `expo-crypto` under the stack but the new write path (`record_simulation` RETURNS the inserted row with a server-generated `gen_random_uuid()`) never needs a client UUID — unlike `place_market_order`, which uses a client idempotency key. The `expo-crypto` mention is vestigial for this feature and could confuse the coder into generating client ids for simulations.
**Fix:** Either drop `expo-crypto` from the Stress Lab stack line, or add one sentence: "simulation ids are server-generated (`gen_random_uuid()`); no client UUID/idempotency key is used for `record_simulation`." If an idempotency guarantee against double-submit is wanted, say so explicitly; otherwise confirm double-tap is handled by disabling the run button while the mutation is pending.

### 3. NIT — COVID `recovery` run is persisted as a standalone simulation, with the base-vs-recovery relationship left implicit
**Where:** `stress_simulations.phase` (`'shock'|'recovery'`) + `record_simulation(p_phase)`; FR-12 / requirements §B describe recovery as "an optional, separate recovery phase."
**Problem:** The schema stores a recovery run as an independent row keyed only by `(user_id, scenario_id, phase)`. The design does not say whether the recovery phase is applied to the *original* holdings (a second independent shock from the starting portfolio) or *composed on top of* the crash result. The engine section says "a second shock table ... applied by the same function" and "over the base," which reads as composition, but `record_simulation` re-reads live positions and applies a single `assumptions->recovery` table to the current holdings — i.e. independent, not composed. These two descriptions can be read differently.
**Fix:** State the chosen semantics in one line: "Recovery is an independent shock from the student's current holdings using the `recovery` table; it is NOT applied on top of the crash result. Both phases are separate `stress_simulations` rows and the UI presents them side by side." Confirm the engine `phase` branch and the RPC agree, and that `scenarios.test.ts`/the parity test cover a recovery example.

---

## Verified Assumptions (checked against source)

1. **Portfolio read model (Q1) is accurate.** `src/features/portfolio/use-portfolio.ts` exposes `usePortfolio()`/`fetchPortfolio()` returning `Portfolio` with `cashCents, positionsValueCents, equityCents, startingCashCents, totalGainCents, totalGainBasisPoints, positions[]`; each `PortfolioPosition` carries `symbol, qty, costBasisCents, avgCostCents, currentPriceCents, valueCents, gainCents, gainBasisPoints`. Reads `paper_accounts.maybeSingle()`, `positions`, and `quotes` by `symbol` with no client user id; a missing quote values a holding at 0. `PORTFOLIO_QUERY_KEY = ['portfolio','me']`, refetch `60_000ms`. The model does **not** expose company `name` or `sector` — exactly the gap the design calls out and solves with a feature-local join rather than widening the shared model. **Verified.**
2. **Instrument/sector source (Q2) is accurate.** `public.instruments` (`20250103000003_instruments.sql`) is `symbol, name, type ('stock'|'etf') default 'stock', sector text (nullable), is_starter, is_active, sort_order`. `src/features/explore/use-instruments.ts` selects `is_active, is_starter, name, sector, sort_order, symbol, type` through the shared client with no user id. The lab's "fetch held symbols via `.in('symbol', symbols)`" variant is consistent. **Verified.**
3. **11-sector canonical list is accurate.** Counted `supabase/seed/instruments.csv`: 50 `type=stock` rows, every row has a non-null sector, exactly 11 distinct sectors: Information Technology, Financials, Consumer Discretionary, Consumer Staples, Health Care, Energy, Industrials, Materials, Utilities, Real Estate, Communication Services. No ETF rows and no null sectors ship — matching the design's statement that ETF/null-fallback paths are exercised only by synthetic test fixtures. **Verified.**
4. **Money discipline (integer cents) is accurate.** `src/lib/money.ts` provides `pctChange` (basis points, null on zero basis), `computeGainLoss`, `formatCents`, and a private `assertIntegerCents` guard. The engine's `round(value * shock)` delta + `pctChange(simulated, starting)` match these helpers. **Verified.**
5. **RLS/write-path design (Q3) mirrors existing conventions exactly.** `20250105000003_market_trading_rls_and_grants.sql` shows the `"read reference" ... for select to authenticated using (true)` pattern (quotes/quote_bars/market_holidays), the `"own rows" ... using (user_id = (select public.current_user_id()))` pattern (orders/trade_reflections/watchlist_items), `revoke all ... from anon, authenticated` then `grant select ... to authenticated`, and RPC-only writes. `current_user_id()` exists (`20250103000001_helpers_and_app_config.sql`); `place_market_order` is `language plpgsql security definer set search_path = public` deriving `v_uid := current_user_id()`. The design's SECURITY-DEFINER-RPC decision (server re-reads positions/quotes, client never passes a result) is correct and explicitly justified. **Verified.**
6. **Navigation (Q4) is feasible and consistent.** `app/(tabs)/_layout.tsx` has four fixed tabs wired to `TAB_TARGET_IDS` (`src/features/tutorial/tour.ts`), so the "don't add a fifth tab" rationale is real. Root `app/_layout.tsx` renders a bare `<Stack />`, so a new `app/stress-lab/` group auto-registers like `app/history.tsx`. `app/settings/_layout.tsx` is a plain `Stack` matching the proposed `app/stress-lab/_layout.tsx`. Non-route code under `src/features/stress-lab/` honors AGENTS.md. **Verified.**
7. **Migration slots/naming.** Latest applied migration is `20250107000004`; `20250108000001-3` are free and follow `YYYYMMDDNNNNNN_name.sql` with separate tables/RLS/RPC files. **Verified.**
8. **No new runtime dependency.** `package.json` already has `react-native-svg` 15.15.4, `zustand` ^5, `zod` ^4, `@tanstack/react-query` ^5, `react-native-auth0` ^5, `expo-crypto` ~57.0.3, `@supabase/supabase-js` ^2, Expo ~57.0.26, RN 0.86.3, React 19.2.3. Charts on `react-native-svg`. **Verified.**
9. **Test conventions.** `mapPlaceOrderError` exists and is unit-tested with error-code→copy mapping; `use-place-order.test.ts`/`order-ticket.test.tsx` mock the client per-test via `jest.mock('../../lib/supabase', ...)` and `expo-crypto`. The design's `mapStressError` and per-test mocking plan match. **Verified.**
10. **`seed.sql` content.** `supabase/seed/seed.sql` seeds only `app_config`; `instruments.sql` is a separate `sql_paths` entry. The design's corrected seed-composition claim is accurate. **Verified.**
11. **Scenario shock-table completeness.** Each of the five scenarios in Q2 lists all 11 canonical sectors plus `broad_market`; COVID adds a full 11-sector + `broad_market` recovery table. The worked AC-4 example (AAPL −0.35, JPM −0.55, cash untouched → 192,500 / −35.83%) is internally consistent with `round(value*shock)` and `pctChange`. **Verified.**
12. **Engine purity / cash-never-shocked / determinism / extensibility.** `engine/simulate.ts` signature and formulas (`simulatedValueCents = currentValueCents + round(currentValueCents * shock)`, portfolio = sum + cash, cash pass-through, floor at 0, `shock = sectorShocks[sector] ?? broadMarketShock`) satisfy FR-13–FR-19; scenario is input not hardcoded, phase is a second table — extensible for Phase 3 without rewrite. **Verified against the stated requirements.**
13. **Snapshot persistence (FR-25/26).** `stress_simulations` stores `holdings_snapshot`, `assumptions_snapshot`, `asset_results` as `jsonb` with no FK to live `positions`, so later trades cannot mutate a stored run. **Verified as sound.**

## Unverified / Wrong Assumptions

None of the design's code-evidence claims were found wrong. Items not independently verifiable at design time (correctly flagged as such by the design, not defects):

- **Exact runtime shock magnitudes are educational estimates, not fitted to historical returns.** The design states this explicitly and labels all derived figures SIMULATED; there is no "correct" external value to check them against. Not a finding.
- **`scenarios.test.ts` key-coverage assertion and the engine↔RPC parity test are described but not yet written** (this is a design, not code). Their existence is an implementation obligation the design commits to; the review assumes they will be authored as specified. Not a finding, but the coder must deliver them for AC-4/AC-5/AC-9.
- **Server/client valuation agreement under a quote change between the client read and the `record_simulation` call** is resolved by design (persisted results come from the server-computed record read back via `results/[simulationId]`, not the client engine), so no race surfaces to the user. Confirmed as addressed, not a finding.
