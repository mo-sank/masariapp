-- Portfolio Stress Lab scenario seed (FEAT-001).
-- Source of truth: .agents/tasks/portfolio-stress-lab/design.md section Q2
-- ("The five scenarios' shock tables"). Shocks are decimal fractions
-- (-0.30 = -30%); each assumptions jsonb carries broad_market plus a shock for
-- all 11 seeded GICS sectors, and covid_2020 additionally carries a recovery
-- table (an independent recovery shock, not composed on the crash).
-- These are educational, internally-consistent estimates — NOT fitted to real
-- historical returns.
--
-- Idempotent: safe to re-run and to apply to a linked project after migrations
-- (mirrors supabase/seed/instruments.sql). Registered in supabase/config.toml
-- [db.seed] sql_paths at the END of the array (no FK dependency on holidays).

insert into public.stress_scenarios(
  id, name, description, cause, conditions, expected_impacts,
  learning_objective, severity, assumptions, sort_order, is_active) values
  (
    'crisis_2008',
    'The 2008 Financial Crisis',
    'A severe, system-wide recession triggered by a collapse in the housing and mortgage markets that froze credit and spread losses across the entire economy.',
    'Years of subprime mortgage lending and complex mortgage-backed securities unravelled when housing prices fell, pushing major banks toward insolvency and causing a credit crunch.',
    'A deep recession with frozen credit markets, failing financial institutions, and sharp declines across most risk assets, with a flight to safer holdings.',
    'Financial institutions and real estate are hit hardest, broad markets fall sharply, and defensive sectors such as utilities, consumer staples, and health care hold up comparatively better.',
    'Understand diversification, systemic financial risk, and how different sectors react during recessions.',
    'severe',
    '{
      "broad_market": -0.30,
      "sectors": {
        "Information Technology": -0.35,
        "Financials": -0.55,
        "Consumer Discretionary": -0.38,
        "Consumer Staples": -0.12,
        "Health Care": -0.15,
        "Energy": -0.25,
        "Industrials": -0.30,
        "Materials": -0.28,
        "Utilities": -0.10,
        "Real Estate": -0.50,
        "Communication Services": -0.25
      }
    }'::jsonb,
    1, true
  ),
  (
    'covid_2020',
    'The COVID-19 Market Crash (2020)',
    'A sudden, market-wide decline as the global pandemic forced shutdowns, followed by an uneven recovery as parts of the economy adapted.',
    'The rapid spread of COVID-19 and the public-health lockdowns that followed abruptly halted travel, hospitality, and much in-person economic activity.',
    'A fast crash across risk assets with especially severe hits to travel, energy, and economically sensitive industries, and a subsequent recovery led by technology and consumer demand.',
    'Economically sensitive sectors such as energy, industrials, and consumer discretionary fall hardest in the crash; technology and health care are more resilient; the recovery phase rewards growth-oriented sectors.',
    'Understand market volatility, sector exposure, and the effects of unexpected economic shocks.',
    'high',
    '{
      "broad_market": -0.25,
      "sectors": {
        "Information Technology": -0.08,
        "Financials": -0.30,
        "Consumer Discretionary": -0.38,
        "Consumer Staples": -0.10,
        "Health Care": -0.05,
        "Energy": -0.45,
        "Industrials": -0.35,
        "Materials": -0.25,
        "Utilities": -0.15,
        "Real Estate": -0.32,
        "Communication Services": -0.12
      },
      "recovery": {
        "broad_market": 0.30,
        "sectors": {
          "Information Technology": 0.55,
          "Financials": 0.25,
          "Consumer Discretionary": 0.45,
          "Consumer Staples": 0.12,
          "Health Care": 0.30,
          "Energy": 0.20,
          "Industrials": 0.28,
          "Materials": 0.25,
          "Utilities": 0.15,
          "Real Estate": 0.20,
          "Communication Services": 0.35
        }
      }
    }'::jsonb,
    2, true
  ),
  (
    'high_inflation',
    'High Inflation Environment',
    'A sustained period of unusually high inflation that erodes purchasing power and pressures the valuations of many assets.',
    'A combination of strong demand, supply constraints, and rising costs pushed prices higher across the economy for an extended period.',
    'Rising prices squeeze margins and reduce real returns; rate-sensitive and long-duration assets suffer while real-asset and commodity-linked sectors can benefit.',
    'Rate-sensitive growth sectors such as technology and consumer discretionary lag; energy and materials can gain as commodity and input prices rise.',
    'Understand inflation, real returns, and the relationship between economic conditions and investments.',
    'medium',
    '{
      "broad_market": -0.08,
      "sectors": {
        "Information Technology": -0.15,
        "Financials": -0.06,
        "Consumer Discretionary": -0.14,
        "Consumer Staples": 0.02,
        "Health Care": -0.05,
        "Energy": 0.15,
        "Industrials": -0.05,
        "Materials": 0.05,
        "Utilities": 0.03,
        "Real Estate": -0.10,
        "Communication Services": -0.10
      }
    }'::jsonb,
    3, true
  ),
  (
    'rising_rates',
    'Rising Interest Rates',
    'An environment in which central banks aggressively raise interest rates, lifting the cost of borrowing and compressing valuations.',
    'To combat inflation or cool an overheating economy, central banks raised policy rates quickly and repeatedly.',
    'Higher discount rates weigh most on growth and long-duration assets; banks can benefit from wider margins while rate-sensitive sectors decline.',
    'Growth and technology stocks and rate-sensitive sectors such as real estate and utilities fall; financials can benefit from higher net interest margins.',
    'Understand how interest rates influence company valuations and investment performance.',
    'medium',
    '{
      "broad_market": -0.10,
      "sectors": {
        "Information Technology": -0.25,
        "Financials": 0.08,
        "Consumer Discretionary": -0.18,
        "Consumer Staples": -0.03,
        "Health Care": -0.06,
        "Energy": 0.02,
        "Industrials": -0.08,
        "Materials": -0.08,
        "Utilities": -0.15,
        "Real Estate": -0.22,
        "Communication Services": -0.12
      }
    }'::jsonb,
    4, true
  ),
  (
    'recession',
    'Economic Recession',
    'A broad economic downturn marked by declining activity, reduced consumer spending, and rising unemployment.',
    'Weakening demand, tightening financial conditions, and falling business investment combined to push the economy into contraction.',
    'Cyclical and consumer-facing sectors decline sharply while defensive sectors such as consumer staples, utilities, and health care hold up comparatively better.',
    'Consumer discretionary, industrials, and materials fall hardest as spending contracts; defensive sectors are more resilient.',
    'Understand cyclical industries, defensive investments, and recession risk.',
    'high',
    '{
      "broad_market": -0.20,
      "sectors": {
        "Information Technology": -0.22,
        "Financials": -0.26,
        "Consumer Discretionary": -0.35,
        "Consumer Staples": -0.05,
        "Health Care": -0.08,
        "Energy": -0.25,
        "Industrials": -0.30,
        "Materials": -0.28,
        "Utilities": -0.06,
        "Real Estate": -0.20,
        "Communication Services": -0.18
      }
    }'::jsonb,
    5, true
  )
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  cause = excluded.cause,
  conditions = excluded.conditions,
  expected_impacts = excluded.expected_impacts,
  learning_objective = excluded.learning_objective,
  severity = excluded.severity,
  assumptions = excluded.assumptions,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;
