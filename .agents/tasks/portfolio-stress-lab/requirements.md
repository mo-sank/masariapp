# Portfolio Stress Lab — Requirements

## Summary

The Portfolio Stress Lab is a new feature in the Masari app (Expo/React Native, Expo Router, Supabase) that lets a student take their existing paper-trading portfolio and simulate how it would perform under predefined economic scenarios (2008 crisis, COVID-19 crash, high inflation, rising rates, recession). It reports simulated losses/gains, sector exposure, concentration, and educational observations, then encourages the student to improve their portfolio through the existing brokerage and re-run the simulation. The feature is constructionist: it never auto-trades and never tells the student what to buy.

The simulation is a transparent, deterministic estimate applied to the student's **current** holdings using per-sector and broad-market percentage shocks defined per scenario. It does not fabricate historical prices. All results are clearly labelled SIMULATED and visually separated from the student's real paper portfolio.

Delivery is in phases:
- **Phase 1 (MVP):** entry point, portfolio overview, scenario selection, simulation engine, results dashboard, persisted history.
- **Phase 2 (constructionist):** predictions, reflections, improvement recommendations, "Improve My Portfolio" routing into the existing brokerage, comparison dashboard, per-scenario design challenges.
- **Phase 3:** explicitly deferred (see Out of Scope).

### Assumptions

1. The Stress Lab reuses the existing portfolio read model (`src/features/portfolio/use-portfolio.ts`) and underlying tables (`paper_accounts`, `positions`, `quotes`) as its single source of truth for holdings, cash, quantities, and current prices. It does not query those tables independently with a different shape.
2. Sector classification comes from `instruments.sector` (nullable text). The shipped catalog (`supabase/seed/instruments.sql`) uses exactly 11 GICS sectors — Information Technology, Financials, Consumer Discretionary, Consumer Staples, Health Care, Energy, Industrials, Materials, Utilities, Real Estate, Communication Services — which is the canonical key set every scenario's shock table must cover (plus a broad-market fallback). Holdings whose instrument has no sector fall back to a broad-market shock, disclosed in the UI. Instrument `type` is `stock` or `etf`; an ETF is shocked by its `sector` when present, otherwise broad-market — never by a sector guessed from its name.
3. All money is integer cents, computed with `src/lib/money.ts`, matching the rest of the app. Shocks are applied as integer-cents math (see design).
4. The feature is reached from within the authenticated app (a Portfolio-tab entry point plus a stack route), consistent with how `app/history.tsx` is reached from the Portfolio tab. Phase 1 does **not** introduce a new lesson-gated feature key; it is available to any signed-in user who can see the Portfolio tab.
5. The 5 scenarios and their shock tables are app-authored reference data seeded into a new table, not user-editable.
6. No new runtime dependencies. Charts use the existing `react-native-svg`. No new external APIs or paid services.

## Functional Requirements

### Entry point & navigation
- FR-1. Provide a Stress Lab entry point reachable from the existing app navigation (from the Portfolio tab), opening a Stress Lab screen.
- FR-2. Keep all non-route code outside `app/`; only thin route files live under `app/` (per AGENTS.md).

### A. Portfolio Overview
- FR-3. Display the student's current paper-trading portfolio read from the existing portfolio model: total value (equity), available cash, number of holdings, current overall performance (gain/loss vs starting cash in $ and %).
- FR-4. Display allocation by asset (per holding share of total portfolio value).
- FR-5. Display allocation by sector where sector is available; holdings with no sector are grouped under a clearly labelled "Unclassified / broad market" bucket rather than dropped.
- FR-6. Display concentration/diversification indicators (e.g. largest single holding %, largest single sector %, number of distinct sectors, and a plain-language over-concentration flag).
- FR-7. Render allocation using charts built with `react-native-svg` plus a holdings breakdown list.
- FR-8. Show a prominent "Stress Test My Portfolio" button.
- FR-9. When the student has no holdings, show an empty state that explains they must first create a portfolio through the paper-trading brokerage, with a button routing into the existing Explore/brokerage flow.

### B. Scenario Selection
- FR-10. Present the 5 scenarios as visually distinct cards, each showing name, description, cause of the economic event, simulated conditions, expected market impacts, learning objective, and a severity indicator.
- FR-11. Allow previewing a scenario's details before running it.
- FR-12. Each scenario defines per-sector percentage shocks plus a broad-market (fallback) shock. The 5 scenarios are: (1) 2008 Financial Crisis, (2) COVID-19 Crash 2020 (with an optional, separate recovery phase), (3) High Inflation, (4) Rising Interest Rates, (5) Economic Recession.

### C. Simulation engine
- FR-13. The engine is a pure, deterministic, modular function (no I/O, no randomness) that is unit-tested in isolation.
- FR-14. For each holding: `simulatedValueCents = round(currentValueCents * (1 + shock))`, where `shock` is the holding's sector shock (or broad-market shock when the holding has no sector/classification).
- FR-15. `simulatedPortfolioValueCents = sum(simulatedValueCents of all holdings) + uninvestedCashCents`. Cash is NEVER shocked.
- FR-16. Report starting value, simulated value, total $ change, and % change computed from starting vs simulated.
- FR-17. Re-running the same scenario against the same holdings produces identical results.
- FR-18. The engine is structured so additional scenarios — and future historical backtesting — can be added without rewriting it (scenario data is an input, not hardcoded in the math).
- FR-19. Results are labelled as SIMULATED estimates everywhere they appear; the engine never invents historical prices.

### C(results). Stress Test Results dashboard
- FR-20. Show overall performance: starting value, simulated end value, $ change, % change.
- FR-21. Show a visual comparison of starting vs simulated portfolio value and each holding's contribution to the result (react-native-svg).
- FR-22. Show an individual-asset breakdown table: ticker, company name, shares, original holding value, simulated % change, simulated $ change, simulated ending value, with positive/negative visual indicators (and non-color cues for accessibility).
- FR-23. Show sector exposure analysis: best-performing sectors, worst-performing sectors, sectors with greatest exposure, and an over-concentration flag.
- FR-24. Show a portfolio risk assessment of educational observations derived from the student's ACTUAL holdings and the simulation results (not generic boilerplate).

### Persistence (Phase 1)
- FR-25. Persist each run as a simulation record scoped to the student: scenario id, timestamp, starting value, simulated end value, $ change, % change, a SNAPSHOT of the holdings at simulation time, a snapshot of the scenario assumptions used, and the per-asset results.
- FR-26. Simulation records must survive subsequent trades: they store snapshots, never live references to the current portfolio.
- FR-27. A student can only read their own simulation records; no student can read or modify another student's records.

### Phase 2 — constructionist
- FR-28. Before running, let the student record a prediction (will the portfolio gain or lose; estimated %; which holdings will do best/worst); save it alongside the resulting simulation record.
- FR-29. After the run, show the prediction's accuracy against the actual simulated result.
- FR-30. After the run, present reflection questions and save the student's responses.
- FR-31. Generate educational improvement recommendations derived from the student's actual data (concentration, missing defensive exposure, scenario-specific weaknesses). Never auto-modify the portfolio.
- FR-32. Provide an "Improve My Portfolio" button that routes into the EXISTING brokerage flow (no second brokerage is built).
- FR-33. Provide a comparison dashboard: original vs updated portfolio value, original vs updated simulated performance for the same scenario, $ and % differences, and sector allocation/concentration changes. Prior simulation results are preserved across subsequent trades.
- FR-34. Provide per-scenario design challenges (e.g. Recession: lose < 20%; Diversification: no sector > 30%; Inflation: maintain purchasing power; Risk Management: reduce losses while keeping growth), re-runnable until met, with completion status saved and experimentation rewarded.

## Non-Functional Requirements

- NFR-1. Reuse existing infrastructure — portfolio model, brokerage, instrument/quote data, auth (`react-native-auth0`), money math (`src/lib/money.ts`), theme (`src/theme`), shared UI (`src/components/ui`), React Query, zustand, zod. Do not duplicate the portfolio or brokerage.
- NFR-2. Do not break existing trading/brokerage behavior; no changes to existing order RPCs, positions, or portfolio semantics.
- NFR-3. Security: every new table is RLS-protected so a student sees only their own rows; writes follow the existing SECURITY DEFINER RPC convention. Reference/scenario data is readable by any signed-in user. No user id is passed from the client (derived from the verified JWT via `current_user_id()`).
- NFR-4. No new runtime dependencies. If one were truly unavoidable, install via `npx expo install` and document it. Charts use `react-native-svg`.
- NFR-5. UI: modern, polished fintech look consistent with the Masari theme; student-friendly (middle/high-school) with tooltips/plain-language for jargon; responsive on mobile; clear visual separation between REAL paper-portfolio data and SIMULATED results; accessibility cues beyond color for gain/loss.
- NFR-6. Simulation math is integer-cents only (no float on money values), consistent with `src/lib/money.ts`.
- NFR-7. The simulation engine and portfolio-analysis logic are pure and unit-testable without React, a device, or a live Supabase client, matching the project's test conventions.
- NFR-8. New Supabase schema is added as NEW timestamped migrations following existing conventions (`YYYYMMDDNNNNNN_name.sql`, separate RLS/grants and RPC migrations); no applied migration is edited.

## Acceptance Criteria

1. A signed-in student with holdings can open the Stress Lab from the Portfolio tab and see total value, available cash, number of holdings, current performance, allocation-by-asset chart, allocation-by-sector chart, a holdings breakdown, and concentration/diversification indicators — all values matching the Portfolio tab for the same account.
2. A student with zero holdings sees an empty state explaining they must build a portfolio in the brokerage first, with a working button into the brokerage flow; no simulation can be started.
3. The 5 scenarios each render as a distinct card showing name, description, cause, simulated conditions, expected impacts, learning objective, and a severity indicator, and can be previewed before running.
4. Running a scenario computes, for each holding, `simulatedValue = round(currentValue * (1 + shock))` using the holding's sector shock, or the broad-market shock when the holding has no sector; cash is unchanged; the portfolio simulated value equals the sum of simulated holdings plus cash. Verified by unit tests on the pure engine.
5. Running the same scenario twice on unchanged holdings yields identical starting value, simulated value, $ change, and % change.
6. The results dashboard shows starting value, simulated end value, $ change, % change, a start-vs-simulated visual comparison, per-holding contribution, and an individual-asset table with ticker, company, shares, original value, simulated % change, simulated $ change, and simulated ending value, with positive/negative indicated by more than color.
7. The results dashboard shows sector exposure analysis (best, worst, greatest-exposure sectors, over-concentration flag) and at least one risk-assessment observation that references the student's actual holdings/sectors (not generic text).
8. Every result and figure derived from the simulation is visually labelled SIMULATED and is visually distinct from the real portfolio overview section.
9. Each run is persisted with scenario id, timestamp, starting/simulated values, $ and % change, a holdings snapshot, a scenario-assumptions snapshot, and per-asset results. A later trade does not change any stored simulation record.
10. A request for another student's simulation record (or an attempt to write one for another student) is rejected by RLS; a student retrieves only their own records. Writes go through a SECURITY DEFINER RPC granted to `authenticated` only.
11. (Phase 2) A student can record a prediction before running and, after running, see its accuracy; reflection responses are saved and reloadable.
12. (Phase 2) The results screen offers an "Improve My Portfolio" button that navigates into the existing brokerage flow and does not modify any holding automatically.
13. (Phase 2) After the student trades and returns, a comparison dashboard shows original vs updated portfolio value and simulated performance for the same scenario with $ and % differences and sector/concentration changes, while prior simulation records remain intact.
14. (Phase 2) Per-scenario design challenges show their objective and completion status, can be re-run until met, and record completion.
15. `npx expo lint` and `npx tsc --noEmit` pass; new pure logic (engine, analysis, recommendations, challenge evaluation) has unit tests that pass under `jest`.
16. No new runtime dependency appears in `package.json`; charts are rendered with `react-native-svg`.

## Out of Scope

- **Phase 3 (deferred):** anything beyond Phase 1 + Phase 2 as scoped above — e.g. true historical price backtesting/replay using real historical series, multi-period/time-stepped simulations beyond the single COVID optional recovery phase, Monte Carlo or probabilistic modelling, custom/user-authored scenarios, cross-student comparison or leaderboards, teacher/classroom dashboards, exporting/sharing reports, and push notifications. The engine must be structured so historical backtesting can be added later without a rewrite, but it is not built now.
- Changing existing trading/brokerage mechanics, order RPCs, or portfolio valuation semantics.
- Adding real-time or live market data, new market-data providers, or any paid/external API.
- Introducing a new lesson-gated feature key or lesson content to unlock the Stress Lab (Phase 1 ships ungated behind the Portfolio tab).
- Native module changes, new config plugins, or edits to `ios/`/`android/`.
