# Portfolio Stress Lab — Implementation Plan

Scope: Phase 1 (MVP) + Phase 2 (constructionist). Phase 3 deferred.
Source of truth: `requirements.md` + `design.md` (APPROVED) + `design-review.json` (3 NITs folded in).

Worktree (absolute): `/Users/mohamednazirsankari/Apps/masariapp/.worktrees/portfolio-stress-lab`
All relative paths below are under that worktree. Use `git -C <worktree>` for git.

## Design-review NITs folded in (all 3 resolved here)
- NIT-1: Append `supabase/seed/stress_scenarios.sql` to the **END** of `sql_paths` in `supabase/config.toml` (after `holidays.sql`). It has no FK dependency on holidays, so trailing placement is correct.
- NIT-2: Simulation ids are **server-generated** (`gen_random_uuid()`). The Stress Lab needs **no** client UUID and must **not** import `expo-crypto`. Prevent double-submit by disabling the "Stress Test" button while the mutation is pending.
- NIT-3: COVID recovery is an **independent** shock applied to the student's **current** holdings using the recovery table — NOT composed on the crash result. Crash and recovery are separate `stress_simulations` rows (`phase`) shown side by side. Engine and RPC agree; a recovery example is unit-tested.

## Conventions confirmed during exploration
- Routes live at `app/` (root), not `src/app/`. Route groups auto-register under the root `<Stack />` in `app/_layout.tsx` (same as `app/history.tsx`). Non-route code lives under `src/features/stress-lab/`.
- Money is integer cents via `src/lib/money.ts` (`pctChange`, `formatCents`, `formatSignedCents`, `formatPercent`, `centsToDollars` for charts only). No float on money values.
- Portfolio read model: `src/features/portfolio/use-portfolio.ts` (`usePortfolio()`, `PORTFOLIO_QUERY_KEY`). A missing quote values a holding at 0.
- Instruments read: `src/features/explore/use-instruments.ts` pattern (`supabase.from('instruments')`, no user id). 11 seeded sectors confirmed present in `supabase/seed/instruments.sql`.
- RPC + error-mapping pattern: `src/features/trading/use-place-order.ts` (`supabase.rpc`, no user id; `mapPlaceOrderError`; invalidate on success).
- Migration conventions: tables → RLS/grants → RPCs as separate timestamped files `YYYYMMDDNNNNNN_name.sql`. User tables keyed by `user_id text references public.profiles(user_id)`; RLS `using (user_id = (select public.current_user_id()))`; `revoke all ... from anon, authenticated` then `grant select ... to authenticated`; writes via `security definer set search_path = public` RPCs granted to `authenticated`. Reference tables get `for select to authenticated using (true)`.
- Hand-maintained `src/types/db.ts` must gain `Row/Insert/Update` for new tables and function signatures under `Functions`.
- SVG charts follow `src/features/trading/components/chart-geometry.ts` (pure geometry) + thin renderer `line-chart.tsx`. `react-native-svg` 15.15.4 is already a dependency.
- Pure-logic tests: colocated `*.test.ts`, Jest (`jest-expo`), run with `npm test`. Supabase mocked per-test with `jest.mock('../../lib/supabase', ...)` — there is NO shared `__mocks__/supabase`.
- Shared UI: `src/components/ui` (`Screen`, `StateView`, `Button`, `Card`, `Text`, `Disclaimer`). Theme via `src/theme/theme-provider` `useTheme()`.
- Next free migration slot after `20250107*` is `20250108*`.

## No new runtime dependencies
All required libraries are already in `package.json`: `react-native-svg` 15.15.4, `@tanstack/react-query` ^5, `zustand` ^5, `zod` ^4, `@supabase/supabase-js` ^2. Confirmed via FR-16/NFR-4. Do NOT run `npx expo install`; do NOT add `expo-crypto` to this feature.

---

# Implementation Plan

## A. Database layer

- [ ] 1. Create the stress-lab tables migration.
      Create `stress_scenarios` (reference, seeded) and the user-owned `stress_simulations`, `stress_predictions`, `stress_reflections`, `stress_challenge_progress` tables per design "Data model" (columns, checks, FKs to `public.profiles(user_id)` and `public.stress_scenarios(id)`, jsonb snapshot columns, the two `stress_simulations` indexes, composite PK on `stress_challenge_progress`). `stress_simulations.id uuid default gen_random_uuid()` (server-generated). Follow the file-header-comment style of existing migrations.
      Files: `supabase/migrations/20250108000001_stress_lab_tables.sql`
      Verify: `cd <worktree> && npx supabase db reset` applies cleanly (or `psql -f` the file against a scratch DB); `npx tsc --noEmit` still passes (no TS touched yet).

- [ ] 2. Create the RLS + grants migration for the five tables.
      Enable RLS on all five. `stress_scenarios`: `create policy "read reference" ... for select to authenticated using (true)`. The four user tables: `create policy "own rows" ... for select to authenticated using (user_id = (select public.current_user_id()))`. Then `revoke all on <five> from anon, authenticated;` and `grant select on <five> to authenticated;` (no insert/update/delete). Mirror `20250105000003_market_trading_rls_and_grants.sql`.
      Files: `supabase/migrations/20250108000002_stress_lab_rls_and_grants.sql`
      Verify: `npx supabase db reset` applies cleanly.

- [ ] 3. Create the RPC migration (`record_simulation` for Phase 1; `save_prediction`, `save_reflection`, `upsert_challenge_progress` for Phase 2).
      All `security definer set search_path = public`, `v_uid := public.current_user_id()` (raise `not_authenticated` if null), granted to `authenticated` only. `record_simulation(p_scenario_id text, p_phase text default 'shock') returns stress_simulations`: validate active scenario (`unknown_scenario`/`scenario_inactive`), load caller's `paper_accounts` (`no_account`), read `positions` joined to `instruments` (name, sector, type) + `quotes` (missing quote → value 0), build `holdings_snapshot`, compute per-holding `shock = assumptions->'sectors'->>sector` else `assumptions->>'broad_market'`, `simulated = value + round(value*shock)` clamped at 0, assemble `asset_results`+totals+change, insert and return. Phase-2 RPCs verify the simulation belongs to the caller and attach rows; `save_prediction` computes `accuracy`, unique on `simulation_id`; `save_reflection` requires non-empty jsonb array and clamps answer length; `upsert_challenge_progress` upserts the composite PK, increments `attempts`, stamps `met_at` on flip to `met`. For COVID `phase='recovery'` apply the `assumptions->'recovery'` table to current holdings (independent, per NIT-3). Follow `place_market_order` structure.
      Files: `supabase/migrations/20250108000003_stress_lab_rpcs.sql`
      Verify: `npx supabase db reset` applies cleanly; manually call `select * from record_simulation('crisis_2008')` against a seeded scratch DB returns a row.

- [ ] 4. Seed the 5 scenarios and register the seed file.
      Create `supabase/seed/stress_scenarios.sql` as an idempotent `insert ... on conflict (id) do update` (mirror `instruments.sql`) with the authoritative shock tables from design §Q2 for all 5 scenarios — each `assumptions` jsonb has `broad_market`, all 11 sectors, and COVID additionally a `recovery` object. Append `"./seed/stress_scenarios.sql"` to the END of `sql_paths` in `supabase/config.toml` (after `holidays.sql`).
      Files: `supabase/seed/stress_scenarios.sql`, `supabase/config.toml`
      Verify: `npx supabase db reset` seeds without error; `select count(*) from stress_scenarios` returns 5.

- [ ] 5. Extend hand-maintained DB types.
      Add `Row/Insert/Update` for the five new tables (alphabetical/consistent with existing entries) and the four RPC signatures under `Functions` in `src/types/db.ts`, matching the shape of `place_market_order`/`complete_lesson` entries.
      Files: `src/types/db.ts`
      Verify: `npx tsc --noEmit` passes.

## B. Pure core: scenarios, engine, analysis (no React, no Supabase)

- [ ] 6. Create scenario definitions and the coverage test.
      `scenarios.ts`: `ScenarioDefinition` type, `SEEDED_SECTORS` (the 11-sector canonical list), and the 5 scenario shock tables (shocks as decimal fractions) + COVID recovery table — values identical to the seed in item 4. `scenarios.test.ts`: assert each scenario's `sectorShocks` keys === `SEEDED_SECTORS`, `broadMarketShock` present, COVID carries a recovery table, and the AC-4 worked example matches `simulate()` (added after item 7).
      Files: `src/features/stress-lab/scenarios/scenarios.ts`, `src/features/stress-lab/scenarios/scenarios.test.ts`, `src/features/stress-lab/README.md`
      Verify: `npm test -- src/features/stress-lab/scenarios` passes.

- [ ] 7. Create the pure deterministic simulation engine + tests.
      `engine/types.ts` (`SimulationInput`, `LabHolding`, `SimulatedHolding`, `SimulationResult` per design). `engine/simulate.ts`: `simulate(input)` using integer-cents math from `src/lib/money.ts` — `shock = scenario.sectorShocks[sector] ?? scenario.broadMarketShock`; `simulatedValueCents = currentValueCents + Math.round(currentValueCents*shock)` floored at 0; `changeBasisPoints = pctChange(...)`; cash pass-through; portfolio totals; `phase` selects the recovery table when present. No RNG, no I/O. `simulate.test.ts`: AC-4 example, cash-never-shocked, determinism on rerun, broad-market fallback for null-sector stock AND null-sector ETF (synthetic fixtures), zero/negative clamp, COVID recovery phase.
      Files: `src/features/stress-lab/engine/types.ts`, `src/features/stress-lab/engine/simulate.ts`, `src/features/stress-lab/engine/simulate.test.ts`
      Verify: `npm test -- src/features/stress-lab/engine` passes (includes AC-4, AC-5 determinism).

- [ ] 8. Create portfolio-analysis math + observations + tests.
      `analysis/portfolio-analysis.ts`: allocation by asset, allocation by sector (null-sector → "Unclassified / broad market" bucket), concentration/diversification indicators (largest holding %, largest sector %, distinct sector count, over-concentration flag), and sector-exposure analysis (best/worst/greatest-exposure sectors from a `SimulationResult`). `observations.ts`: pure risk-assessment observations derived from actual holdings + results. Colocated tests with synthetic fixtures including null-sector holdings.
      Files: `src/features/stress-lab/analysis/portfolio-analysis.ts`, `src/features/stress-lab/analysis/portfolio-analysis.test.ts`, `src/features/stress-lab/analysis/observations.ts`, `src/features/stress-lab/analysis/observations.test.ts`
      Verify: `npm test -- src/features/stress-lab/analysis` passes.

## C. Persistence hooks (React Query)

- [ ] 9. Create RPC zod schemas and the data hooks (Phase 1).
      `data/rpc-schemas.ts`: zod schemas validating `record_simulation` return shape at the boundary. `data/use-stress-portfolio.ts`: joins `usePortfolio()` with held-symbol instrument metadata (`.in('symbol', symbols)`, Explore pattern) into `LabHolding[]`; validates qty/values with zod. `data/use-scenarios.ts`: React Query read of `stress_scenarios`. `data/use-run-simulation.ts`: mutation → `record_simulation` RPC (no user id), `mapStressError` (pattern of `mapPlaceOrderError`) for codes `not_authenticated|no_account|unknown_scenario|scenario_inactive` + fallback, invalidate history + single-sim keys on success. `data/use-simulation.ts` + `data/use-simulation-history.ts`: reads by id / list. Add `use-run-simulation.test.ts` + `rpc-schemas` parse/reject test (mock supabase per-test).
      Files: `src/features/stress-lab/data/rpc-schemas.ts`, `.../use-stress-portfolio.ts`, `.../use-scenarios.ts`, `.../use-run-simulation.ts`, `.../use-run-simulation.test.ts`, `.../use-simulation.ts`, `.../use-simulation-history.ts`
      Verify: `npm test -- src/features/stress-lab/data` passes; `npx tsc --noEmit` passes.

## D. UI + routes (Phase 1)

- [ ] 10. Create pure SVG chart geometry + chart components.
      Pure geometry helper(s) following `chart-geometry.ts` (allocation donut arcs, start-vs-simulated bar scaling) with colocated tests, then thin `react-native-svg` renderers `AllocationDonut.tsx`, `ConcentrationBar.tsx`, `StartVsSimulatedChart.tsx`. `SimulatedBadge.tsx` for the reused "SIMULATED" label.
      Files: `src/features/stress-lab/components/*` (donut/bar geometry + `.test.ts`, the three chart components, `SimulatedBadge.tsx`)
      Verify: `npm test -- src/features/stress-lab/components` passes geometry tests; `npx tsc --noEmit` passes.

- [ ] 11. Create Phase-1 presentational components + barrel.
      `PortfolioOverview.tsx`, `HoldingsBreakdown.tsx`, `ScenarioCard.tsx`, `ScenarioPreviewSheet.tsx`, `ResultsSummary.tsx`, `AssetBreakdownTable.tsx` (FR-22 columns, non-color gain/loss cues), `SectorExposure.tsx`, `RiskObservations.tsx`, and `components/index.ts`. Reuse `src/components/ui` + theme. REAL-vs-SIMULATED visual separation and student tooltips per NFR-5.
      Files: `src/features/stress-lab/components/*.tsx`, `src/features/stress-lab/components/index.ts`
      Verify: `npx tsc --noEmit` and `npx expo lint` pass.

- [ ] 12. Create the route files and wire navigation.
      `app/stress-lab/_layout.tsx` (`Stack`, mirror `app/settings/_layout.tsx`), `app/stress-lab/index.tsx` (overview + scenario selection; empty state FR-9 with Explore button; "Stress Test My Portfolio" disabled while pending and when no holdings), `app/stress-lab/results/[simulationId].tsx` (results dashboard via `useLocalSearchParams`). Add a "Stress Lab" entry on `app/(tabs)/portfolio.tsx` (`router.push('/stress-lab')`, same pattern as the existing `/history` button). Routes stay thin (nav + loading/empty/error states).
      Files: `app/stress-lab/_layout.tsx`, `app/stress-lab/index.tsx`, `app/stress-lab/results/[simulationId].tsx`, `app/(tabs)/portfolio.tsx`
      Verify: `npx expo lint` + `npx tsc --noEmit` pass; `npx expo start` boots without a router error (manual smoke optional).

## E. Phase 2 — constructionist

- [ ] 13. Create Phase-2 pure logic + tests.
      `analysis/recommendations.ts` (improvement recommendations from actual data; never auto-trade), `analysis/challenges.ts` (per-scenario challenge definitions + pass/fail evaluator), `analysis/prediction.ts` (prediction-accuracy scoring). Colocated `*.test.ts` with fixtures.
      Files: `src/features/stress-lab/analysis/recommendations.ts` (+test), `.../challenges.ts` (+test), `.../prediction.ts` (+test)
      Verify: `npm test -- src/features/stress-lab/analysis` passes.

- [ ] 14. Create Phase-2 data hooks.
      `data/use-save-prediction.ts`, `data/use-save-reflection.ts`, `data/use-challenge-progress.ts` → the Phase-2 RPCs, with zod validation and query invalidation, friendly error mapping (`not_found`/`not_owner`). Extend `rpc-schemas.ts`.
      Files: `src/features/stress-lab/data/use-save-prediction.ts`, `.../use-save-reflection.ts`, `.../use-challenge-progress.ts`, `.../rpc-schemas.ts`
      Verify: `npm test -- src/features/stress-lab/data` passes; `npx tsc --noEmit` passes.

- [ ] 15. Create Phase-2 UI + routes.
      `Recommendations.tsx`, `PredictionForm.tsx`, `ReflectionForm.tsx`, `ComparisonDashboard.tsx`, `ChallengeTracker.tsx`. Add `app/stress-lab/compare/[scenarioId].tsx`. Wire "Improve My Portfolio" to `router.push('/(tabs)/explore')` (no new brokerage). Prediction captured before running; accuracy + reflections shown after. Update `components/index.ts`.
      Files: `src/features/stress-lab/components/{Recommendations,PredictionForm,ReflectionForm,ComparisonDashboard,ChallengeTracker}.tsx`, `src/features/stress-lab/components/index.ts`, `app/stress-lab/compare/[scenarioId].tsx`
      Verify: `npx expo lint` + `npx tsc --noEmit` pass.

## F. Final verification

- [ ] 16. Run the full verification suite and fix any findings.
      Files: (none — verification only)
      Verify, all from `<worktree>`:
      - `npx expo lint` → no errors.
      - `npx tsc --noEmit` → no errors.
      - `npm test` → all suites pass (engine, analysis, scenarios, data hooks).
      - `npx expo-doctor` → no new issues; confirm `package.json` has no new runtime dependency (FR-16/NFR-4).
