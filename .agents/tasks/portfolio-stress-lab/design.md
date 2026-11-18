# Portfolio Stress Lab — Technical Design

## Overview

The Portfolio Stress Lab adds an interactive, educational simulation to Masari. A student opens the lab from the Portfolio tab, sees their real paper portfolio (sourced from the existing portfolio read model), picks one of five app-authored economic scenarios, and runs a **pure, deterministic** simulation that shocks each holding by a per-sector (or broad-market fallback) percentage. The lab shows a results dashboard (overall change, per-asset table, sector exposure, risk observations), persists a self-contained snapshot of each run, and in Phase 2 adds predictions, reflections, improvement recommendations, a route back into the existing brokerage, a comparison dashboard, and per-scenario design challenges.

The design reuses what already exists: the portfolio model in `src/features/portfolio/use-portfolio.ts`, instrument/sector metadata in `instruments`, integer-cents math in `src/lib/money.ts`, the theme in `src/theme`, shared UI in `src/components/ui`, `react-native-svg` for charts, React Query for data, zustand for in-flight UI state, and zod for validating RPC results at the trust boundary. It introduces no new runtime dependencies and does not touch the brokerage write path.

**Technology stack (locked on approval):** Expo SDK ~57, React Native 0.86.3, React 19, Expo Router ~57 (file-based routing), `@supabase/supabase-js` ^2, `@tanstack/react-query` ^5, `zustand` ^5, `zod` ^4, `react-native-svg` 15.15.4, `react-native-auth0` ^5, `expo-crypto` for client UUIDs. Database is Postgres via Supabase migrations with SECURITY DEFINER RPCs and RLS, matching the existing specs.

---

## Answers to the four design-phase questions (with code evidence)

### Q1 — Shape of the existing portfolio read model (the single source of truth)

`src/features/portfolio/use-portfolio.ts` is the authoritative read model and the Stress Lab consumes it directly. `fetchPortfolio()` reads three sources through the shared client (`src/lib/supabase.ts`) with **no client-supplied user id** (RLS scopes them):

- `paper_accounts` (`.maybeSingle()`) → `cash_cents`, `starting_cash_cents`. Table defined in `20250103000004_account_tables.sql`; RLS in `20250103000006_rls_and_grants.sql`.
- `positions` → `account_id, symbol, qty, cost_basis_cents, updated_at`. Table in `20250105000002_trading_ledger.sql`; RLS policy `"own positions"` in `20250105000003_market_trading_rls_and_grants.sql` scopes rows by account ownership.
- `quotes` (`price_cents`) for the held symbols, keyed by `symbol`. A holding whose symbol has no quote is valued at 0 rather than breaking the screen.

It returns a `Portfolio` with `cashCents`, `positionsValueCents`, `equityCents`, `startingCashCents`, `totalGainCents`, `totalGainBasisPoints`, and `positions: PortfolioPosition[]` where each position carries `symbol, qty, costBasisCents, avgCostCents, currentPriceCents, valueCents, gainCents, gainBasisPoints`. React Query key is `PORTFOLIO_QUERY_KEY = ['portfolio','me']`, refetch `60_000ms`. **The Stress Lab calls `usePortfolio()` and never re-queries `positions`/`quotes` with a different shape.**

One gap the read model has for our needs: it does not expose each holding's **company name** or **sector** (it only joins `quotes`, not `instruments`). The individual-asset table (FR-22) needs company name, and sector analysis (FR-5, FR-23) needs sector. Rather than widen the shared `fetchPortfolio()` (which would change a model other screens depend on), the lab fetches instrument metadata separately and joins it in a feature-local hook — see "Portfolio analysis" below.

### Q2 — Where sector/asset classification comes from, and the fallback

Sector lives on `public.instruments.sector` — a **nullable** `text` column (`20250103000003_instruments.sql`): `symbol, name, type ('stock'|'etf'), sector, is_starter, is_active, sort_order`. The seed (`supabase/seed/instruments.sql`, generated from `supabase/seed/instruments.csv`, loaded via `config.toml` `[db.seed] sql_paths`) populates GICS-style sector names. The shipped catalog of ~50 stock rows contains exactly **11 distinct sectors** (verified by counting the seed):

**Canonical seeded sector list (the authoritative shock-table key set):**
`Information Technology`, `Financials`, `Consumer Discretionary`, `Consumer Staples`, `Health Care`, `Energy`, `Industrials`, `Materials`, `Utilities`, `Real Estate`, `Communication Services`.

Every current seed row has a sector, but the column is nullable and the design must not assume it is always present. This canonical list is pinned in `scenarios/scenarios.ts` as `SEEDED_SECTORS`, and `scenarios.test.ts` asserts that each scenario's `sectorShocks` keys are exactly this set (plus a `broadMarketShock`). If a future migration adds a new seeded sector, the test fails until every scenario supplies a shock for it — coverage is enforced, not assumed.

The lab reads instrument metadata exactly like Explore does — `src/features/explore/use-instruments.ts` fetches `instruments` (`symbol, name, sector, type, ...`) through the shared client with no user id (instruments are a shared catalog readable by any signed-in user). The lab adds a small variant that fetches only the held symbols via `.in('symbol', symbols)`.

**Fallback rule (disclosed in UI):** a holding whose instrument has `sector = null` is assigned the scenario's `broad_market` shock and grouped in the overview/analysis under an explicit "Unclassified / broad market" bucket — never silently dropped. **ETF handling:** `type = 'etf'` is shocked by its `sector` when present, otherwise `broad_market`; a sector is never inferred from the ETF's name. This keeps a diversified ETF (sector null) on the broad-market shock instead of mislabelling it.

Scenario shock lookup is therefore: `shock = scenario.sectorShocks[holding.sector] ?? scenario.broadMarketShock`, with the same expression for stocks and ETFs. Scenario authoring supplies a shock for every seeded sector plus the broad-market value.

#### The five scenarios' shock tables (authoritative values)

Shocks are decimal fractions (`-0.30` = −30%). These are the values `scenarios/scenarios.ts` ships and `supabase/seed/stress_scenarios.sql` encodes in each row's `assumptions` jsonb; the two are asserted consistent (see Testability). Every scenario defines all 11 sectors plus `broad_market`. They are educational, internally-consistent estimates — **not** fitted to real historical returns — and the UI labels every derived figure SIMULATED (FR-19).

**Scenario 1 — 2008 Financial Crisis** (`id: crisis_2008`, severity: `severe`)

| sector | shock | | sector | shock |
|---|---|---|---|---|
| broad_market | −0.30 | | Industrials | −0.30 |
| Financials | −0.55 | | Materials | −0.28 |
| Real Estate | −0.50 | | Energy | −0.25 |
| Consumer Discretionary | −0.38 | | Communication Services | −0.25 |
| Information Technology | −0.35 | | Health Care | −0.15 |
| Consumer Staples | −0.12 | | Utilities | −0.10 |

**Scenario 2 — COVID-19 Crash 2020** (`id: covid_2020`, severity: `high`). Base (crash) table:

| sector | shock | | sector | shock |
|---|---|---|---|---|
| broad_market | −0.25 | | Financials | −0.30 |
| Energy | −0.45 | | Materials | −0.25 |
| Consumer Discretionary | −0.38 | | Communication Services | −0.12 |
| Industrials | −0.35 | | Information Technology | −0.08 |
| Real Estate | −0.32 | | Health Care | −0.05 |
| Consumer Staples | −0.10 | | Utilities | −0.15 |

Optional **recovery** phase (`phase: 'recovery'`, applied by the same engine over the base — a second shock table, not a time series):

| sector | shock | | sector | shock |
|---|---|---|---|---|
| broad_market | +0.30 | | Financials | +0.25 |
| Information Technology | +0.55 | | Materials | +0.25 |
| Consumer Discretionary | +0.45 | | Industrials | +0.28 |
| Communication Services | +0.35 | | Real Estate | +0.20 |
| Health Care | +0.30 | | Consumer Staples | +0.12 |
| Energy | +0.20 | | Utilities | +0.15 |

**Scenario 3 — High Inflation** (`id: high_inflation`, severity: `medium`)

| sector | shock | | sector | shock |
|---|---|---|---|---|
| broad_market | −0.08 | | Industrials | −0.05 |
| Information Technology | −0.15 | | Health Care | −0.05 |
| Consumer Discretionary | −0.14 | | Materials | +0.05 |
| Real Estate | −0.10 | | Consumer Staples | +0.02 |
| Financials | −0.06 | | Utilities | +0.03 |
| Communication Services | −0.10 | | Energy | +0.15 |

**Scenario 4 — Rising Interest Rates** (`id: rising_rates`, severity: `medium`)

| sector | shock | | sector | shock |
|---|---|---|---|---|
| broad_market | −0.10 | | Communication Services | −0.12 |
| Information Technology | −0.25 | | Industrials | −0.08 |
| Consumer Discretionary | −0.18 | | Health Care | −0.06 |
| Real Estate | −0.22 | | Consumer Staples | −0.03 |
| Utilities | −0.15 | | Energy | +0.02 |
| Materials | −0.08 | | Financials | +0.08 |

**Scenario 5 — Economic Recession** (`id: recession`, severity: `high`)

| sector | shock | | sector | shock |
|---|---|---|---|---|
| broad_market | −0.20 | | Communication Services | −0.18 |
| Consumer Discretionary | −0.35 | | Information Technology | −0.22 |
| Industrials | −0.30 | | Health Care | −0.08 |
| Materials | −0.28 | | Consumer Staples | −0.05 |
| Energy | −0.25 | | Utilities | −0.06 |
| Financials | −0.26 | | Real Estate | −0.20 |

#### Worked AC-4 example (end to end)

Portfolio: 10 shares AAPL (Information Technology) at a current price of \$150.00 → `currentValueCents = 150_000`; 5 shares JPM (Financials) at \$200.00 → `currentValueCents = 100_000`; uninvested cash \$500.00 → `cashCents = 50_000`. `startingValueCents = 150_000 + 100_000 + 50_000 = 300_000`.

Run **2008 Financial Crisis**:
- AAPL: shock `-0.35`. `simulatedValueCents = 150_000 + round(150_000 * -0.35) = 150_000 + (-52_500) = 97_500`. `changeCents = -52_500` (−35.00%).
- JPM: shock `-0.55`. `simulatedValueCents = 100_000 + round(100_000 * -0.55) = 100_000 + (-55_000) = 45_000`. `changeCents = -55_000` (−55.00%).
- Cash: unchanged at `50_000`.
- `simulatedValueCents = 97_500 + 45_000 + 50_000 = 192_500`. `changeCents = 192_500 - 300_000 = -107_500`. `changeBasisPoints = pctChange(192_500, 300_000) = -3583` bp (−35.83%).

A holding whose instrument sector is `null` (or an ETF with no classification) would instead take `broad_market = -0.30`. `scenarios.test.ts` asserts this exact example against `simulate()`, and an engine↔RPC parity test asserts `record_simulation` produces the identical numbers.

### Q3 — RLS design for the new tables

Mirror the existing split exactly:

- **Reference data readable by all signed-in users:** `stress_scenarios` gets RLS enabled with a `for select to authenticated using (true)` policy, matching the `"read reference"` pattern applied to `quotes`/`quote_bars`/`market_holidays` in `20250105000003_market_trading_rls_and_grants.sql`. The 5 scenarios are app-authored data, seeded, not user-writable.
- **User-owned tables keyed by `user_id text`:** `stress_simulations`, `stress_predictions`, `stress_reflections`, `stress_challenge_progress` each store `user_id text references public.profiles(user_id)` and get a `"own rows" ... using (user_id = (select public.current_user_id()))` SELECT policy, matching the `orders`/`trade_reflections`/`watchlist_items` pattern. `current_user_id()` resolves the Auth0 `sub` from the verified JWT (`20250103000001_helpers_and_app_config.sql`).
- **Privileges:** `revoke all ... from anon, authenticated` then `grant select ... to authenticated` on every new table. **No direct writes** — all writes go through SECURITY DEFINER RPCs, matching `place_market_order`, `complete_lesson`, `submit_assessment`, `save_rewind_items`.

**Decision — writes go through SECURITY DEFINER RPCs, not direct-table RLS writes.** This matches the universal convention in this codebase (clients hold SELECT only; every write is an RPC granted to `authenticated` and derives the user from `current_user_id()`). It lets the server compute and validate authoritative values rather than trusting the client. Specifically, `record_simulation` validates the scenario is active, re-reads the account/positions/quotes **server-side** to build the authoritative holdings snapshot and per-asset results, computes the shocks in SQL, and inserts the record — so a client cannot fabricate a flattering result. The Phase-2 prediction/reflection/challenge writes are thin RPCs that attach rows to a simulation the caller owns.

Using `user_id text` (Auth0 sub) rather than `account_id` for ownership is deliberate: simulation history is about the *student*, must survive even if positions change, and matches the user-keyed tables (`orders`, `watchlist_items`).

### Q4 — Navigation integration

**Decision — a Portfolio-tab entry button plus a root-level stack route group, not a new tab.** The tab bar (`app/(tabs)/_layout.tsx`) has four fixed tabs (Learn, Explore, Portfolio, Profile) wired into the first-run tutorial target registry (`TAB_TARGET_IDS`). Adding a fifth tab would crowd a student-facing bar and entangle the tutorial coachmark walkthrough. Instead:

- Add a prominent "Stress Lab" entry on the Portfolio tab (`app/(tabs)/portfolio.tsx`), consistent with how that screen already routes to `/history` via `router.push('/history')`.
- Create route files under `app/stress-lab/`: `app/stress-lab/_layout.tsx` (a `Stack`, mirroring `app/settings/_layout.tsx`), `app/stress-lab/index.tsx` (overview + scenario selection), and `app/stress-lab/results/[simulationId].tsx` (results dashboard for a persisted run). Root `<Stack />` in `app/_layout.tsx` auto-registers the group (same mechanism as `app/history.tsx`, `app/glossary.tsx`). Navigate with `Link`/`router` from `expo-router`.
- Phase 2 adds `app/stress-lab/compare/[scenarioId].tsx` (comparison dashboard). "Improve My Portfolio" calls `router.push('/(tabs)/explore')` (or a specific `/trade/[symbol]`), reusing the existing brokerage — no new trading route.

Per AGENTS.md, route files stay thin (navigation + loading/empty/error states, like `app/history.tsx`); all logic lives under `src/features/stress-lab/`.

**Gating decision:** Phase 1 ships the lab **ungated** behind the Portfolio tab. The Portfolio tab itself is already gated on the `portfolio` feature via `Gate` (`src/features/progress/components/Gate.tsx`), so any student who can reach the entry point has already unlocked trading. Introducing a new `feature_key` would require new lesson content and a `feature_unlock_rules` seed (`src/features/progress/feature-keys.ts` is kept in lock-step with `content/lessons/*.json` by a drift test), which is out of scope. The lab's own empty state (FR-9) handles the "no holdings yet" case.

---

## Module boundaries and file layout

All non-route code under `src/features/stress-lab/`, split by the required separation. Each folder gets a short `README.md` matching the repo convention (e.g. `src/features/portfolio/README.md`).

```
src/features/stress-lab/
  README.md
  scenarios/
    scenarios.ts            # ScenarioDefinition type + SEEDED_SECTORS + the 5 scenario shock tables (pure data)
    scenarios.test.ts       # coverage: each scenario's sectorShocks keys === SEEDED_SECTORS; broad_market present;
                            #           COVID carries a recovery table; AC-4 worked example matches simulate()
  engine/
    simulate.ts             # PURE deterministic engine (no I/O, no RNG)
    simulate.test.ts
    types.ts                # SimulationInput, SimulatedHolding, SimulationResult
  analysis/
    portfolio-analysis.ts   # allocation by asset/sector, concentration/diversification, sector exposure
    portfolio-analysis.test.ts
    observations.ts         # risk-assessment observations derived from actual holdings + results (pure)
    observations.test.ts
    recommendations.ts      # Phase 2: improvement recommendations (pure)
    recommendations.test.ts
    challenges.ts           # Phase 2: challenge definitions + pass/fail evaluation (pure)
    challenges.test.ts
    prediction.ts           # Phase 2: prediction-accuracy scoring (pure)
  data/
    use-stress-portfolio.ts # joins usePortfolio() + instrument metadata into lab holdings
    use-scenarios.ts        # React Query read of stress_scenarios (reference)
    use-run-simulation.ts   # mutation -> record_simulation RPC; invalidates history
    use-simulation.ts       # read one persisted simulation by id
    use-simulation-history.ts
    use-save-prediction.ts  # Phase 2
    use-save-reflection.ts  # Phase 2
    use-challenge-progress.ts # Phase 2
    rpc-schemas.ts          # zod schemas validating RPC return shapes at the boundary
  components/
    index.ts
    PortfolioOverview.tsx
    AllocationDonut.tsx     # react-native-svg
    ConcentrationBar.tsx    # react-native-svg
    HoldingsBreakdown.tsx
    ScenarioCard.tsx
    ScenarioPreviewSheet.tsx
    SimulatedBadge.tsx      # the "SIMULATED" label reused across result UI
    ResultsSummary.tsx
    StartVsSimulatedChart.tsx # react-native-svg
    AssetBreakdownTable.tsx
    SectorExposure.tsx
    RiskObservations.tsx
    Recommendations.tsx     # Phase 2
    PredictionForm.tsx      # Phase 2
    ReflectionForm.tsx      # Phase 2
    ComparisonDashboard.tsx # Phase 2
    ChallengeTracker.tsx    # Phase 2
```

Routes under `app/stress-lab/` as described in Q4. Client UI transient state (selected scenario, in-progress prediction before submit) uses a small zustand store if it must survive navigation; otherwise local component state. Server state is React Query only.

### The pure engine (the core invariant owner)

`engine/simulate.ts` owns FR-13–FR-19 and holds no React/Supabase imports. Signature:

```
simulate(input: SimulationInput): SimulationResult
  SimulationInput  = { holdings: LabHolding[]; cashCents: number; scenario: ScenarioDefinition; phase?: 'shock' | 'recovery' }
  LabHolding       = { symbol; name; sector: string | null; qty; currentValueCents }
  SimulatedHolding = { ...LabHolding; shock: number; usedBroadMarket: boolean; simulatedValueCents; changeCents; changeBasisPoints }
  SimulationResult = { startingValueCents; simulatedValueCents; changeCents; changeBasisPoints; holdings: SimulatedHolding[]; cashCents }
```

Math (integer cents via `src/lib/money.ts`): per holding `shock = scenario.sectorShocks[sector] ?? scenario.broadMarketShock`; `simulatedValueCents = currentValueCents + Math.round(currentValueCents * shock)` (round the delta so a zero shock is exactly identity and cash-only portfolios are stable); `changeBasisPoints = pctChange(simulatedValueCents, currentValueCents)`. Portfolio: `startingValueCents = sum(currentValueCents) + cashCents`; `simulatedValueCents = sum(simulatedValueCents) + cashCents`; `changeBasisPoints = pctChange(simulatedValueCents, startingValueCents)`. Cash is a pass-through term, never shocked (FR-15). Determinism (FR-17) is guaranteed by purity and no RNG. Extensibility (FR-18): a scenario is pure input; the COVID optional recovery is modelled as a second shock table on the same scenario selected by `phase`, applied by the same function — no special-casing. Future historical backtesting plugs in as an alternative `ScenarioDefinition` source without changing the math.

`shock` is a decimal fraction (e.g. `-0.45` = −45%). Scenario authoring keeps shocks in a sane band; the engine clamps a holding's simulated value at a floor of 0 cents (a position cannot go below zero) and documents that clamp.

### Server-side authority

The same shock formula is re-implemented in the `record_simulation` RPC so the stored record is server-computed and tamper-proof (the client result is for immediate display; the persisted snapshot is authoritative). The engine and the RPC are tested to agree on the acceptance-criterion example. The client zod schema in `rpc-schemas.ts` validates the RPC's returned record shape before it reaches the UI.

---

## Data model (new migrations)

New timestamped migrations following the existing conventions (`YYYYMMDDNNNNNN_name.sql`, separate RLS/grants and RPC files, never editing an applied migration). Proposed names (adjust NN to the next free slot after `20250107*`):

- `20250108000001_stress_lab_tables.sql`
- `20250108000002_stress_lab_rls_and_grants.sql`
- `20250108000003_stress_lab_rpcs.sql`
- Seed the 5 scenarios in a new `supabase/seed/stress_scenarios.sql` (idempotent `insert ... on conflict (id) do update`, matching `instruments.sql`) and register it in `supabase/config.toml` `[db.seed] sql_paths`, appended after `"./seed/instruments.sql"`. Seed files are composed by that ordered `sql_paths` array — not by inclusion from `seed.sql` (which only seeds `app_config`). A local `supabase db reset` applies it automatically; to seed a linked/remote project, apply it explicitly with `psql "$DATABASE_URL" -f supabase/seed/stress_scenarios.sql` (the remote-apply path documented in `supabase/seed/README.md`).

### Tables

`stress_scenarios` (reference, seeded):
- `id text primary key` ('crisis_2008','covid_2020','high_inflation','rising_rates','recession')
- `name text not null`, `description text not null`, `cause text not null`, `conditions text not null`, `expected_impacts text not null`, `learning_objective text not null`
- `severity text not null check (severity in ('low','medium','high','severe'))`
- `assumptions jsonb not null` — `{ broad_market: number, sectors: { "<sector>": number }, recovery?: { broad_market, sectors } }`
- `sort_order int not null`, `is_active boolean not null default true`

`stress_simulations` (user-owned, append-only history; snapshots so later trades can't mutate it — FR-26):
- `id uuid primary key default gen_random_uuid()`
- `user_id text not null references public.profiles(user_id) on delete cascade`
- `scenario_id text not null references public.stress_scenarios(id)`
- `phase text not null default 'shock' check (phase in ('shock','recovery'))`
- `starting_value_cents bigint not null`, `simulated_value_cents bigint not null`
- `change_cents bigint not null`, `change_basis_points int` (null when starting value is 0)
- `cash_cents bigint not null`
- `holdings_snapshot jsonb not null` — array of `{ symbol, name, sector, qty, current_value_cents }` captured at run time
- `assumptions_snapshot jsonb not null` — the scenario `assumptions` used for this run (FR-25)
- `asset_results jsonb not null` — array of `{ symbol, name, sector, qty, original_value_cents, shock, used_broad_market, simulated_change_cents, simulated_change_bp, simulated_value_cents }`
- `created_at timestamptz not null default now()`
- index `stress_simulations_user_created_idx (user_id, created_at desc)`; index `(user_id, scenario_id, created_at desc)` for the comparison lookup

`stress_predictions` (Phase 2, one per simulation, owner-keyed):
- `id uuid primary key default gen_random_uuid()`, `simulation_id uuid not null unique references public.stress_simulations(id) on delete cascade`, `user_id text not null references public.profiles(user_id) on delete cascade`
- `direction text not null check (direction in ('gain','lose'))`, `estimated_change_bp int`, `picked_best text`, `picked_worst text` (symbols), `accuracy jsonb` (computed server-side), `created_at timestamptz not null default now()`

`stress_reflections` (Phase 2, owner-keyed):
- `id uuid primary key default gen_random_uuid()`, `simulation_id uuid not null references public.stress_simulations(id) on delete cascade`, `user_id text not null references public.profiles(user_id) on delete cascade`
- `responses jsonb not null` — `[{ question_id, answer }]` (answer ≤ a server-enforced length), `created_at timestamptz not null default now()`

`stress_challenge_progress` (Phase 2, owner + scenario + challenge keyed):
- `user_id text not null references public.profiles(user_id) on delete cascade`, `scenario_id text not null references public.stress_scenarios(id)`, `challenge_id text not null`
- `status text not null check (status in ('in_progress','met'))`, `best_simulation_id uuid references public.stress_simulations(id)`, `attempts int not null default 0`, `met_at timestamptz`, `updated_at timestamptz not null default now()`
- `primary key (user_id, scenario_id, challenge_id)`

Challenge definitions themselves (objective text, pass predicate) live in `analysis/challenges.ts` (pure data + evaluator), not the DB, because they are app logic evaluated against a simulation result.

### RLS & grants (`20250108000002`)

Enable RLS on all five tables. `stress_scenarios`: `create policy "read reference" ... for select to authenticated using (true)`. The four user tables: `create policy "own rows" ... for select to authenticated using (user_id = (select public.current_user_id()))`. Then `revoke all on <all five> from anon, authenticated; grant select on <all five> to authenticated;`. No insert/update/delete grants — writes are RPC-only.

### RPCs (`20250108000003`), all `security definer set search_path = public`, granted to `authenticated` only

- `record_simulation(p_scenario_id text, p_phase text default 'shock') returns stress_simulations` — derives `v_uid := current_user_id()` (raise `not_authenticated` if null); loads the caller's `paper_accounts` row (raise `no_account` if missing); loads the active scenario (raise `unknown_scenario` / `scenario_inactive`); reads the caller's `positions` joined to `instruments` (name, sector, type) and current `quotes`; builds `holdings_snapshot`; computes per-holding shock = `assumptions->sectors->>sector` (or `assumptions->>broad_market`) and `simulated = value + round(value * shock)` clamped at 0; assembles `asset_results`, totals, and change; inserts and returns the row. A holding with a missing quote is valued at 0 (mirroring `fetchPortfolio`) so the server and client agree.
- `save_prediction(p_simulation_id uuid, p_direction text, p_estimated_change_bp int, p_best text, p_worst text) returns stress_predictions` — Phase 2; verifies the simulation belongs to the caller; computes and stores `accuracy` vs the stored result (direction correct, |estimate − actual| band, whether best/worst picks matched); unique on `simulation_id` so re-saving updates.
- `save_reflection(p_simulation_id uuid, p_responses jsonb) returns stress_reflections` — Phase 2; verifies ownership; validates `jsonb_typeof = 'array'`; clamps answer length; inserts.
- `upsert_challenge_progress(p_scenario_id text, p_challenge_id text, p_status text, p_simulation_id uuid) returns stress_challenge_progress` — Phase 2; verifies the referenced simulation belongs to the caller; upserts on the composite PK, incrementing `attempts`, stamping `met_at` when status flips to `met`.

Client hooks call these via `supabase.rpc(...)` with no user id, exactly like `use-place-order.ts` and `use-watchlist-mutations.ts`, and validate the result with zod before use.

### DB types

`src/types/db.ts` is hand-maintained. Add `Row`/`Insert`/`Update` for the five tables and the four RPC function signatures to keep `supabase.from(...)`/`supabase.rpc(...)` type-safe, following the existing entries' structure.

---

## Error handling (per operation)

- **Load portfolio (`usePortfolio`/`use-stress-portfolio`):** Supabase error → React Query `isError`; route renders the shared `StateView kind="error"` with retry (exactly as `app/history.tsx`/`app/(tabs)/portfolio.tsx` do). Recoverable. A single missing quote is **not** an error — that holding is valued at 0, matching `fetchPortfolio`. Logged at the existing React Query layer; no extra logging.
- **No holdings:** not an error — the overview shows the FR-9 empty state with a brokerage button; the "Stress Test My Portfolio" button is disabled.
- **Load scenarios (`use-scenarios`):** query error → error state with retry (recoverable). An empty scenario list (seed missing) shows an empty state rather than crashing.
- **Run simulation (`record_simulation` via `use-run-simulation`):** RPC raises stable string codes (`not_authenticated`, `no_account`, `unknown_scenario`, `scenario_inactive`). The mutation maps each to friendly, teen-appropriate copy through a small `mapStressError` (same pattern as `mapPlaceOrderError` in `use-place-order.ts`), with a generic fallback for network/unknown. `no_account`/`not_authenticated` are defensive (the gate/entry point should prevent them) but still mapped so no raw code surfaces. Recoverable (retry). On success, invalidate the history and single-simulation query keys, then navigate to the results route. **No new analytics event is emitted** for the Stress Lab: no FR/NFR/AC requires telemetry, and adding a tracked event would require a coordinated two-place change (add the name to `ANALYTICS_EVENT_NAMES` in `src/features/progress/analytics-events.ts` **and** to the `log_events` RPC server-side allowlist in a new migration — the client enforces the list before queueing and the RPC rejects the whole batch if an unknown name reaches it). That is undeclared scope, so it is deliberately left out. If telemetry is wanted later, it must be added in both places in the same change, carrying only `scenario_id` and a bucketed outcome, never holdings or free text.
- **Persisted record validation:** `rpc-schemas.ts` zod-parses the RPC return; a parse failure is treated as an error state (should not happen; indicates a server/type drift) and reported to Sentry via the existing `ErrorBoundary`/`src/lib/sentry.ts` path, not silently ignored.
- **Save prediction/reflection/challenge (Phase 2):** ownership failures raise `not_found`/`not_owner`; mapped to a friendly message. A reflection with no responses is rejected client-side (zod) before the RPC. Recoverable.
- **Engine (`simulate`):** pure; defends against malformed input with zod at the `use-stress-portfolio` boundary (qty integer, values integer cents), so the engine only ever sees validated data. A negative or absurd shock is clamped (value floored at 0); the engine never throws on valid typed input.

### Input validation (external inputs)

- `p_scenario_id` (RPC): required, must match an `is_active` scenario row (FK + active check), else `unknown_scenario`/`scenario_inactive`.
- `p_phase`: optional, defaults `'shock'`; must be `'shock'|'recovery'` (check constraint + guard); `'recovery'` only meaningful for `covid_2020`, otherwise falls back to the base shock table.
- Prediction `direction`: required, `'gain'|'lose'`. `estimated_change_bp`: optional int, bounded (e.g. −10000..10000). `best`/`worst`: optional, must be symbols present in the simulation's `holdings_snapshot` (validated client-side; server stores as-is since they are display-only).
- Reflection `responses`: required JSON array; each `answer` length-capped server-side (mirrors the 280-char clamp pattern on `trade_reflections`/`orders`). Empty array rejected.
- Scenario `assumptions` (authoring, not user input): validated by `scenarios.test.ts` to cover every seeded sector and include `broad_market`; the seed SQL and `scenarios/scenarios.ts` are asserted consistent.

### Invariant ownership

- **Money is integer cents, no float on money:** owned by `src/lib/money.ts` and reused by both the engine and the RPC; `assertIntegerCents` guards leaks. The engine rounds only the shock delta.
- **Cash is never shocked:** owned by the engine (pass-through term) and by the RPC (cash added untouched).
- **Snapshots are immutable after a trade:** owned by the DB schema — `stress_simulations` stores `holdings_snapshot`/`assumptions_snapshot`/`asset_results` as `jsonb` with no FK to live positions, so later trades cannot alter a stored run (FR-26). Enforced at the data layer because that is the only place that can guarantee it regardless of client behavior.
- **A student sees only their own records:** owned by RLS (`using (user_id = current_user_id())`) plus RPC-only writes; enforced at the database so the client cannot bypass it.
- **Scenario ↔ engine shock-table parity:** owned by `scenarios.test.ts` and an engine/RPC agreement test.

---

## Testability

- **Unit (no React/Supabase):** `engine/simulate.ts` (the acceptance-criterion formula, cash-never-shocked, determinism on rerun, broad-market fallback, zero/negative-value clamps, COVID recovery phase); `analysis/portfolio-analysis.ts` (allocation %, concentration flags, best/worst/greatest-exposure sectors); `observations.ts`, `recommendations.ts`, `challenges.ts`, `prediction.ts` (derived strictly from fixture holdings + results); `scenarios.ts` coverage. These are pure and fast, matching `order-ticket-logic.test.ts`, `chart-geometry.test.ts`, `money.test.ts`.
  - **ETF and null-sector fallback are exercised only by synthetic fixtures**, not seeded catalog data: the shipped `instruments.sql` is 50 `type='stock'` rows and every row has a non-null sector, so no real holding reaches the ETF (`type='etf'`) path or the `sector = null` fallback. `engine/simulate.test.ts` and `analysis/portfolio-analysis.test.ts` must therefore include hand-built fixtures — at minimum an ETF holding with `sector = null` and a stock holding with `sector = null` — asserting both take `broadMarketShock`, set `usedBroadMarket = true`, and land in the "Unclassified / broad market" analysis bucket. This obligation is called out so it is not forgotten; it requires no production/seed change.
- **Hook tests:** `use-run-simulation` error mapping and query invalidation; `rpc-schemas` parse/reject — same style as `use-place-order.test.ts`.
- **Screen/integration (`@testing-library/react-native`, under `__tests__/`):** overview renders real figures and the empty state; scenario cards render and preview; results dashboard renders table/sector/observations with the SIMULATED labelling; "Improve My Portfolio" navigates to the brokerage. There is no shared Supabase `__mocks__` module (the top-level `__mocks__` holds only `react-native-auth0.js`); mock the shared client per-test with `jest.mock('../../lib/supabase', ...)`, matching `src/features/trading/use-place-order.test.ts`.
- **DB:** scenario-shock parity between `scenarios.ts` and the seeded `assumptions`; RLS behavior belongs to `supabase/tests` following existing conventions.

A design note on testability: because the engine is pure and the server re-computes authoritatively, the hard-to-test parts (money math, shock application, snapshot immutability) are all covered by fast unit tests plus schema/RLS tests, and the UI stays thin.

---

## Phase 3 — explicitly deferred

Phase 3 is **not** built in this effort. Deferred items: real historical price backtesting/replay against actual historical series; multi-period or time-stepped simulations beyond the single COVID optional recovery phase; Monte Carlo / probabilistic modelling; user-authored or custom scenarios; cross-student comparison, leaderboards, or teacher/classroom dashboards; report export/sharing; push notifications. The engine (`engine/simulate.ts`) and the scenario abstraction (`scenarios/scenarios.ts`) are structured so a historical-backtest scenario source can be added as another `ScenarioDefinition` provider and a multi-phase run as additional `phase` inputs, without rewriting the math or the persistence model.

---

## Responses to design review findings

Review: `.agents/tasks/portfolio-stress-lab/design-review.md` (verdict CHANGES_REQUESTED — 2 MEDIUM, 4 NITs). All six findings are addressed below; none were backlogged or ignored.

- **Finding 1 (MEDIUM — missing per-sector shock tables / unverifiable coverage) — ADDRESSED.** Added the authoritative canonical 11-sector list to Q2 (`SEEDED_SECTORS`, copied from the seed and verified by counting `instruments.sql`) and a complete shock table for every one of the 5 scenarios — all 11 sectors plus `broad_market` in each, plus the COVID `recovery` table. Added a full end-to-end worked AC-4 example (two holdings + cash through `round(value*(1+shock))` to the portfolio total and basis-point change). Stated that `scenarios.test.ts` asserts each scenario's `sectorShocks` keys equal `SEEDED_SECTORS` and that the worked example matches `simulate()`. The shock magnitudes are explicitly labelled educational estimates, not fitted historical returns.

- **Finding 2 (MEDIUM — analytics event misdescribed; wrong file, missing server allowlist edit) — ADDRESSED by removal.** The `stress_test_run` event is dropped entirely. No requirement asks for telemetry, so the simplest correct resolution is to not add it. The Error-handling section now states no new analytics event is emitted and records the correct two-place mechanism (`ANALYTICS_EVENT_NAMES` in `src/features/progress/analytics-events.ts` **and** the `log_events` RPC allowlist in a migration, in the same change) for any future addition. This also resolves Finding 6.

- **Finding 3 (NIT — seed composition described wrong) — ADDRESSED.** The Data-model seed bullet now says to add `supabase/seed/stress_scenarios.sql` (idempotent `on conflict do update`) and register it in `config.toml` `[db.seed] sql_paths` after `instruments.sql`, correcting the false "loaded from `seed.sql`" claim, and documents the `psql -f` remote-apply path from `supabase/seed/README.md`.

- **Finding 4 (NIT — ETF/null-sector paths have no seed coverage) — ADDRESSED.** Testability now states explicitly that the ETF (`type='etf'`) path and the `sector = null` fallback are exercised only by synthetic fixtures in `engine/simulate.test.ts` and `analysis/portfolio-analysis.test.ts` (an ETF with null sector and a stock with null sector), because the shipped catalog has neither; no production or seed change is required.

- **Finding 5 (NIT — imprecise Supabase mocking) — ADDRESSED.** Testability now says to mock the shared client per-test with `jest.mock('../../lib/supabase', ...)`, matching `use-place-order.test.ts`, and notes there is no shared Supabase `__mocks__` module.

- **Finding 6 (NIT — `stress_test_run` is undeclared scope) — ADDRESSED.** Resolved together with Finding 2 by removing the event.
