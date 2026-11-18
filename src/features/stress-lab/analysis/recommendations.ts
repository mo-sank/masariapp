/**
 * Improvement recommendations for the Stress Lab (FR-26–FR-29, Phase 2).
 *
 * Pure functions that turn a simulation result (and the holdings behind it)
 * into student-facing improvement prompts. The constructionist rule is the
 * whole point: a recommendation NEVER tells the student what to buy or sell and
 * NEVER modifies the portfolio. It names a weakness grounded in the student's
 * real holdings and the simulated numbers — concentration, missing defensive
 * exposure, a scenario-specific soft spot — and invites the student back to the
 * brokerage to make their own decision.
 *
 * No React or Supabase; all monetary reasoning is over integer cents and
 * percentages are in basis points, mirroring `src/lib/money.ts` discipline.
 */
import { formatCents, formatPercent } from '../../../lib/money';

import type { SimulationResult } from '../engine/types';
import {
  allocationBySector,
  analyzeSectorExposure,
  concentrationIndicators,
  UNCLASSIFIED_SECTOR,
} from './portfolio-analysis';

/** Why a recommendation was raised, for grouping / icon selection in the UI. */
export type RecommendationKind =
  | 'sector-concentration'
  | 'holding-concentration'
  | 'missing-defensive'
  | 'scenario-loss';

/** A single improvement prompt. Never prescriptive: it frames, never instructs. */
export interface Recommendation {
  kind: RecommendationKind;
  /** One-sentence observation grounded in the student's real figures. */
  message: string;
  /** An open prompt that invites the student to explore, not an instruction. */
  prompt: string;
}

/** Sector share (basis points) above which the portfolio is "heavily" in it. */
const HEAVY_SECTOR_BP = 5000; // 50%
/** Single-holding share (basis points) that flags over-concentration. */
const HEAVY_HOLDING_BP = 4000; // 40%
/** Portfolio loss (basis points) considered worth a scenario-specific callout. */
const SCENARIO_LOSS_BP = -2000; // −20%

/**
 * The sectors students most often treat as "defensive" — steadier through
 * downturns. Used only to point out ABSENCE (a gap to think about), never to
 * recommend a specific purchase.
 */
const DEFENSIVE_SECTORS: readonly string[] = ['Consumer Staples', 'Utilities', 'Health Care'];

/**
 * Derive improvement recommendations from a simulation result. Returns an
 * ordered list (most pressing first); an empty portfolio or a well-balanced,
 * resilient one yields an empty list, which the UI renders as encouragement
 * rather than a problem.
 *
 * Every message references the student's ACTUAL holdings/sectors/figures, and
 * no recommendation modifies the portfolio — it only frames a question for the
 * student to answer in the brokerage.
 */
export function deriveRecommendations(result: SimulationResult): Recommendation[] {
  if (result.holdings.length === 0) {
    return [];
  }

  const recommendations: Recommendation[] = [];
  const sectors = allocationBySector(result.holdings);
  const concentration = concentrationIndicators(result.holdings);
  const exposure = analyzeSectorExposure(result);

  // Heavy concentration in one sector.
  const topSector = sectors[0];
  if (topSector && topSector.basisPoints >= HEAVY_SECTOR_BP) {
    recommendations.push({
      kind: 'sector-concentration',
      message: `Your portfolio has ${formatSharePercent(topSector.basisPoints)} exposure to ${topSector.sector}.`,
      prompt: 'Consider exploring other sectors so a shock to one industry moves less of your portfolio.',
    });
  }

  // Heavy concentration in one holding.
  if (
    concentration.largestHoldingSymbol &&
    concentration.largestHoldingBasisPoints >= HEAVY_HOLDING_BP
  ) {
    recommendations.push({
      kind: 'holding-concentration',
      message: `A large portion of your portfolio — ${formatSharePercent(concentration.largestHoldingBasisPoints)} — is a single company (${concentration.largestHoldingSymbol}).`,
      prompt:
        'Think about whether spreading across more companies would make your portfolio less dependent on one name.',
    });
  }

  // Missing defensive exposure: no holdings in any commonly-defensive sector.
  const heldSectorNames = new Set(sectors.map((s) => s.sector));
  const hasDefensive = DEFENSIVE_SECTORS.some((s) => heldSectorNames.has(s));
  if (!hasDefensive && heldSectorNames.size > 0 && !heldSectorNames.has(UNCLASSIFIED_SECTOR)) {
    recommendations.push({
      kind: 'missing-defensive',
      message: 'Your portfolio has limited exposure to defensive industries (like consumer staples, utilities, or health care).',
      prompt:
        'These sectors often hold up better in downturns — worth comparing how adding some would change a stress test.',
    });
  }

  // Scenario-specific weakness: a substantial simulated loss, naming the worst sector.
  if (result.changeBasisPoints !== null && result.changeBasisPoints <= SCENARIO_LOSS_BP) {
    const worst = exposure.worstSector;
    const worstClause =
      worst && worst.changeBasisPoints !== null
        ? ` Your ${worst.sector} holdings fell the most (${formatPercent(worst.changeBasisPoints)}, ${formatCents(worst.changeCents)}).`
        : '';
    recommendations.push({
      kind: 'scenario-loss',
      message: `Your portfolio fell ${formatPercent(result.changeBasisPoints)} (${formatCents(result.changeCents)}) under this scenario.${worstClause}`,
      prompt:
        'Try changing your mix in the brokerage, then run this scenario again to see whether the loss shrinks.',
    });
  }

  return recommendations;
}

/** Format allocation basis points as a whole-percent label, e.g. 7500 -> "75%". */
function formatSharePercent(basisPoints: number): string {
  return `${Math.round(basisPoints / 100)}%`;
}
