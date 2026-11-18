/**
 * Scenario shock tables for the Portfolio Stress Lab (FR-10–FR-12, FR-18).
 *
 * Pure data: each scenario is a named shock table that maps a GICS sector to a
 * decimal-fraction price shock (`-0.30` = −30%), plus a `broadMarketShock`
 * applied to any holding whose sector is unknown (null) or not in the table.
 * COVID-19 additionally carries a `recovery` table — an independent second
 * shock applied by the engine when `phase === 'recovery'`, not composed on the
 * crash (see design.md Q2).
 *
 * These numbers MUST stay identical to `supabase/seed/stress_scenarios.sql`
 * (FEAT-001), which encodes the same values in each row's `assumptions` jsonb.
 * The server re-computes authoritative results from that seed; this module is
 * the client mirror used for the immediate, pre-persist display. They are
 * educational, internally-consistent estimates — NOT fitted to real historical
 * returns — and the UI labels every derived figure SIMULATED (FR-19).
 */

/**
 * The 11 canonical GICS sectors seeded in `public.instruments.sector`
 * (design.md Q2). Every scenario supplies a shock for each of these sectors;
 * `scenarios.test.ts` asserts that coverage so a newly seeded sector cannot
 * silently fall back to the broad-market shock without an explicit decision.
 */
export const SEEDED_SECTORS = [
  'Information Technology',
  'Financials',
  'Consumer Discretionary',
  'Consumer Staples',
  'Health Care',
  'Energy',
  'Industrials',
  'Materials',
  'Utilities',
  'Real Estate',
  'Communication Services',
] as const;

/** A seeded sector name. */
export type SeededSector = (typeof SEEDED_SECTORS)[number];

/** Severity badge shown on a scenario card. Mirrors the seed CHECK constraint. */
export type ScenarioSeverity = 'low' | 'medium' | 'high' | 'severe';

/**
 * A shock table: the broad-market fallback plus a per-sector shock for every
 * seeded sector. Shocks are decimal fractions (`-0.55` = −55%).
 */
export interface ShockTable {
  /** Applied when a holding's sector is null or absent from `sectorShocks`. */
  broadMarketShock: number;
  /** Per-sector decimal-fraction shocks, one entry per seeded sector. */
  sectorShocks: Record<SeededSector, number>;
}

/**
 * A scenario the student can run against their portfolio. Pure input to the
 * engine; adding a scenario (or a `recovery` phase) requires no engine change
 * (FR-18).
 */
export interface ScenarioDefinition extends ShockTable {
  /** Stable id, identical to `stress_scenarios.id` in the seed. */
  id: string;
  /** Display name (FR-10). */
  name: string;
  /** What the economic environment is. */
  description: string;
  /** What caused the economic event. */
  cause: string;
  /** The economic conditions being simulated. */
  conditions: string;
  /** The expected types of market impacts. */
  expectedImpacts: string;
  /** The educational learning objective. */
  learningObjective: string;
  /** Simple severity indicator for the card. */
  severity: ScenarioSeverity;
  /** Sort order for the scenario list (matches the seed `sort_order`). */
  sortOrder: number;
  /** Optional independent recovery shock table (COVID-19 only). */
  recovery?: ShockTable;
}

/** 2008 Financial Crisis. */
const CRISIS_2008: ScenarioDefinition = {
  id: 'crisis_2008',
  name: 'The 2008 Financial Crisis',
  description:
    'A severe, system-wide recession triggered by a collapse in the housing and mortgage markets that froze credit and spread losses across the entire economy.',
  cause:
    'Years of subprime mortgage lending and complex mortgage-backed securities unravelled when housing prices fell, pushing major banks toward insolvency and causing a credit crunch.',
  conditions:
    'A deep recession with frozen credit markets, failing financial institutions, and sharp declines across most risk assets, with a flight to safer holdings.',
  expectedImpacts:
    'Financial institutions and real estate are hit hardest, broad markets fall sharply, and defensive sectors such as utilities, consumer staples, and health care hold up comparatively better.',
  learningObjective:
    'Understand diversification, systemic financial risk, and how different sectors react during recessions.',
  severity: 'severe',
  sortOrder: 1,
  broadMarketShock: -0.3,
  sectorShocks: {
    'Information Technology': -0.35,
    Financials: -0.55,
    'Consumer Discretionary': -0.38,
    'Consumer Staples': -0.12,
    'Health Care': -0.15,
    Energy: -0.25,
    Industrials: -0.3,
    Materials: -0.28,
    Utilities: -0.1,
    'Real Estate': -0.5,
    'Communication Services': -0.25,
  },
};

/** COVID-19 Market Crash (2020), with an independent recovery phase. */
const COVID_2020: ScenarioDefinition = {
  id: 'covid_2020',
  name: 'The COVID-19 Market Crash (2020)',
  description:
    'A sudden, market-wide decline as the global pandemic forced shutdowns, followed by an uneven recovery as parts of the economy adapted.',
  cause:
    'The rapid spread of COVID-19 and the public-health lockdowns that followed abruptly halted travel, hospitality, and much in-person economic activity.',
  conditions:
    'A fast crash across risk assets with especially severe hits to travel, energy, and economically sensitive industries, and a subsequent recovery led by technology and consumer demand.',
  expectedImpacts:
    'Economically sensitive sectors such as energy, industrials, and consumer discretionary fall hardest in the crash; technology and health care are more resilient; the recovery phase rewards growth-oriented sectors.',
  learningObjective:
    'Understand market volatility, sector exposure, and the effects of unexpected economic shocks.',
  severity: 'high',
  sortOrder: 2,
  broadMarketShock: -0.25,
  sectorShocks: {
    'Information Technology': -0.08,
    Financials: -0.3,
    'Consumer Discretionary': -0.38,
    'Consumer Staples': -0.1,
    'Health Care': -0.05,
    Energy: -0.45,
    Industrials: -0.35,
    Materials: -0.25,
    Utilities: -0.15,
    'Real Estate': -0.32,
    'Communication Services': -0.12,
  },
  recovery: {
    broadMarketShock: 0.3,
    sectorShocks: {
      'Information Technology': 0.55,
      Financials: 0.25,
      'Consumer Discretionary': 0.45,
      'Consumer Staples': 0.12,
      'Health Care': 0.3,
      Energy: 0.2,
      Industrials: 0.28,
      Materials: 0.25,
      Utilities: 0.15,
      'Real Estate': 0.2,
      'Communication Services': 0.35,
    },
  },
};

/** High Inflation Environment. */
const HIGH_INFLATION: ScenarioDefinition = {
  id: 'high_inflation',
  name: 'High Inflation Environment',
  description:
    'A sustained period of unusually high inflation that erodes purchasing power and pressures the valuations of many assets.',
  cause:
    'A combination of strong demand, supply constraints, and rising costs pushed prices higher across the economy for an extended period.',
  conditions:
    'Rising prices squeeze margins and reduce real returns; rate-sensitive and long-duration assets suffer while real-asset and commodity-linked sectors can benefit.',
  expectedImpacts:
    'Rate-sensitive growth sectors such as technology and consumer discretionary lag; energy and materials can gain as commodity and input prices rise.',
  learningObjective:
    'Understand inflation, real returns, and the relationship between economic conditions and investments.',
  severity: 'medium',
  sortOrder: 3,
  broadMarketShock: -0.08,
  sectorShocks: {
    'Information Technology': -0.15,
    Financials: -0.06,
    'Consumer Discretionary': -0.14,
    'Consumer Staples': 0.02,
    'Health Care': -0.05,
    Energy: 0.15,
    Industrials: -0.05,
    Materials: 0.05,
    Utilities: 0.03,
    'Real Estate': -0.1,
    'Communication Services': -0.1,
  },
};

/** Rising Interest Rates. */
const RISING_RATES: ScenarioDefinition = {
  id: 'rising_rates',
  name: 'Rising Interest Rates',
  description:
    'An environment in which central banks aggressively raise interest rates, lifting the cost of borrowing and compressing valuations.',
  cause:
    'To combat inflation or cool an overheating economy, central banks raised policy rates quickly and repeatedly.',
  conditions:
    'Higher discount rates weigh most on growth and long-duration assets; banks can benefit from wider margins while rate-sensitive sectors decline.',
  expectedImpacts:
    'Growth and technology stocks and rate-sensitive sectors such as real estate and utilities fall; financials can benefit from higher net interest margins.',
  learningObjective:
    'Understand how interest rates influence company valuations and investment performance.',
  severity: 'medium',
  sortOrder: 4,
  broadMarketShock: -0.1,
  sectorShocks: {
    'Information Technology': -0.25,
    Financials: 0.08,
    'Consumer Discretionary': -0.18,
    'Consumer Staples': -0.03,
    'Health Care': -0.06,
    Energy: 0.02,
    Industrials: -0.08,
    Materials: -0.08,
    Utilities: -0.15,
    'Real Estate': -0.22,
    'Communication Services': -0.12,
  },
};

/** Economic Recession. */
const RECESSION: ScenarioDefinition = {
  id: 'recession',
  name: 'Economic Recession',
  description:
    'A broad economic downturn marked by declining activity, reduced consumer spending, and rising unemployment.',
  cause:
    'Weakening demand, tightening financial conditions, and falling business investment combined to push the economy into contraction.',
  conditions:
    'Cyclical and consumer-facing sectors decline sharply while defensive sectors such as consumer staples, utilities, and health care hold up comparatively better.',
  expectedImpacts:
    'Consumer discretionary, industrials, and materials fall hardest as spending contracts; defensive sectors are more resilient.',
  learningObjective:
    'Understand cyclical industries, defensive investments, and recession risk.',
  severity: 'high',
  sortOrder: 5,
  broadMarketShock: -0.2,
  sectorShocks: {
    'Information Technology': -0.22,
    Financials: -0.26,
    'Consumer Discretionary': -0.35,
    'Consumer Staples': -0.05,
    'Health Care': -0.08,
    Energy: -0.25,
    Industrials: -0.3,
    Materials: -0.28,
    Utilities: -0.06,
    'Real Estate': -0.2,
    'Communication Services': -0.18,
  },
};

/** All scenarios in display order (matches the seed `sort_order`). */
export const SCENARIOS: readonly ScenarioDefinition[] = [
  CRISIS_2008,
  COVID_2020,
  HIGH_INFLATION,
  RISING_RATES,
  RECESSION,
];

/** Look a scenario up by id, or return undefined when unknown. */
export function getScenario(id: string): ScenarioDefinition | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
