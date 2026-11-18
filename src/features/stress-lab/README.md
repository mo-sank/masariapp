# features/stress-lab

Portfolio Stress Lab: test a paper-trading portfolio against predefined
economic scenarios and learn from the result.

This directory holds the **pure core** (FEAT-002): scenario shock tables, the
deterministic simulation engine, and portfolio-analysis + observations math.
None of it imports React or Supabase, and all money is integer cents computed
with `src/lib/money.ts`. The engine is deterministic (no RNG): the same input
always yields the same output.

- `scenarios/` — the 5 scenario shock tables (decimal fractions) and the
  canonical seeded sector list. Values are identical to
  `supabase/seed/stress_scenarios.sql`.
- `engine/` — `simulate(input)`, the shock-application core.
- `analysis/` — allocation, concentration/diversification, sector exposure, and
  risk-assessment observations derived from real holdings and results.
