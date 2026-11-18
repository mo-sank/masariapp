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

The route files live under `app/stress-lab/` and stay thin (navigation and
loading/empty/error states only). Every simulated figure is labelled SIMULATED
and kept visually distinct from the real portfolio overview.
