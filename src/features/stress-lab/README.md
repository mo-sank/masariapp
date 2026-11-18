# features/stress-lab

Portfolio Stress Lab: test a paper-trading portfolio against predefined
economic scenarios and learn from the result.

The **pure core** (FEAT-002) is React-free and Supabase-free, and all money is
integer cents computed with `src/lib/money.ts`. The engine is deterministic (no
RNG): the same input always yields the same output.

- `scenarios/` — the 5 scenario shock tables (decimal fractions) and the
  canonical seeded sector list. Values are identical to
  `supabase/seed/stress_scenarios.sql`.
- `engine/` — `simulate(input)`, the shock-application core.
- `analysis/` — allocation, concentration/diversification, sector exposure, and
  risk-assessment observations derived from real holdings and results.

The **Phase 1 feature wiring** (FEAT-003) sits on top of that core and does
touch React Query and Supabase:

- `data/` — React Query hooks over the FEAT-001 tables/RPCs: `useStressPortfolio`
  (joins `usePortfolio` with instrument sector metadata), `useScenarios`,
  `useSimulation`, `useSimulationHistory`, and the `useRunSimulation` mutation
  (calls `record_simulation` with no client id — the simulation id is
  server-generated). `rpc-schemas.ts` validates the RPC payload at the trust
  boundary with zod; `map-simulation.ts` maps a persisted row into the engine's
  result shape so the dashboard renders the server-authoritative numbers.
- `components/` — the SVG charts (`AllocationDonut`, `ConcentrationBar`,
  `StartVsSimulatedChart`) over a pure `chart-geometry` module, plus the
  presentational cards (`PortfolioOverview`, `HoldingsBreakdown`, `ScenarioCard`,
  `ScenarioPreviewSheet`, `ResultsSummary`, `AssetBreakdownTable`,
  `SectorExposure`, `RiskObservations`), the reused `SimulatedBadge`, and the
  `InfoTip` tooltip for plain-language jargon.

The **Phase 2 constructionist layer** (FEAT-004) adds the predict → run →
reflect → improve → re-run loop on top of Phase 1:

- `analysis/recommendations.ts` — improvement prompts derived from real holdings
  and results (sector/holding concentration, missing defensive exposure,
  scenario-specific loss). They frame a question; they never prescribe a trade
  or modify the portfolio.
- `analysis/challenges.ts` — per-scenario design challenges (e.g. "lose < 20% in
  a recession", "no sector > 30%") plus a deterministic pass/fail evaluator over
  a `SimulationResult`.
- `analysis/prediction.ts` — client-side prediction-accuracy scoring, matching
  the server's `save_prediction` accuracy payload.
- `data/use-save-prediction.ts`, `use-save-reflection.ts`,
  `use-challenge-progress.ts` — React Query read + mutation hooks over the
  `save_prediction` / `save_reflection` / `upsert_challenge_progress` RPCs (no
  user id; RLS scopes rows), each validating the return with zod, mapping stable
  error codes to friendly copy, and invalidating its query key on success.
- `components/` — `PredictionForm` (captured before a run), `PredictionResult`,
  `Recommendations`, `ChallengeTracker`, `ReflectionForm` (saves + reloads), and
  `ComparisonDashboard` (original vs updated run of the same scenario, with $/%
  differences and sector/concentration changes).

"Improve My Portfolio" routes into the EXISTING brokerage
(`router.push('/(tabs)/explore')`); there is no second brokerage and no holding
is ever modified automatically. Prior simulation records are immutable snapshots
(FEAT-001), so trading and re-running never overwrite earlier runs — the
comparison reads two persisted records.

The route files live under `app/stress-lab/` and stay thin (navigation and
loading/empty/error states only). Every simulated figure is labelled SIMULATED
and kept visually distinct from the real portfolio overview.
