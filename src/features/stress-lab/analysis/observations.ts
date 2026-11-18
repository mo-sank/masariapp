/**
 * Risk-assessment observations for the Stress Lab (FR-7, FR-24).
 *
 * Pure functions that turn a simulation result (and the underlying holdings)
 * into plain-language educational observations. Each observation references the
 * student's ACTUAL holdings, sectors, and simulated numbers — not boilerplate —
 * so the feedback is grounded in what they really hold (FR-24). No React or
 * Supabase; all monetary reasoning is over integer cents.
 */
import { formatCents, formatPercent } from '../../../lib/money';

import type { SimulationResult } from '../engine/types';
import {
  allocationBySector,
  analyzeSectorExposure,
  concentrationIndicators,
  totalHoldingsValueCents,
} from './portfolio-analysis';

/** The kind of observation, for grouping / icon selection in the UI. */
export type ObservationKind = 'concentration' | 'sector' | 'loss' | 'gain' | 'resilience';

/** Tone of an observation, for colour selection in the UI. */
export type ObservationTone = 'negative' | 'neutral' | 'positive';

/** A single educational observation about the portfolio under the scenario. */
export interface Observation {
  kind: ObservationKind;
  tone: ObservationTone;
  /** One-sentence, student-facing statement grounded in real figures. */
  message: string;
}

/** Share (basis points) above which a sector counts as "significant exposure". */
const SIGNIFICANT_EXPOSURE_BP = 3000; // 30%

/** Portfolio loss (basis points) considered "substantial" for a callout. */
const SUBSTANTIAL_LOSS_BP = -1500; // −15%

/**
 * Derive educational observations from a simulation result. Returns an ordered
 * list (most important first). An empty portfolio yields a single prompt to add
 * holdings.
 */
export function deriveObservations(result: SimulationResult): Observation[] {
  if (result.holdings.length === 0) {
    return [
      {
        kind: 'concentration',
        tone: 'neutral',
        message:
          'Your portfolio has no holdings yet. Add positions in the brokerage, then stress test them here.',
      },
    ];
  }

  const observations: Observation[] = [];
  const totalCents = totalHoldingsValueCents(result.holdings);
  const concentration = concentrationIndicators(result.holdings);
  const sectors = allocationBySector(result.holdings);
  const exposure = analyzeSectorExposure(result);

  // Significant exposure to the largest sector.
  const topSector = sectors[0];
  if (topSector && topSector.basisPoints >= SIGNIFICANT_EXPOSURE_BP) {
    observations.push({
      kind: 'sector',
      tone: concentration.isOverConcentrated ? 'negative' : 'neutral',
      message: `Your portfolio has significant exposure to ${topSector.sector}: ${formatPercent(topSector.basisPoints)} of your invested value.`,
    });
  }

  // Concentration in a handful of names.
  if (concentration.largestHoldingSymbol && concentration.largestHoldingBasisPoints >= SIGNIFICANT_EXPOSURE_BP) {
    observations.push({
      kind: 'concentration',
      tone: concentration.largestHoldingBasisPoints >= 4000 ? 'negative' : 'neutral',
      message: `A large portion of your portfolio — ${formatPercent(concentration.largestHoldingBasisPoints)} — sits in a single holding (${concentration.largestHoldingSymbol}).`,
    });
  }

  // Overall portfolio outcome under the scenario.
  if (result.changeBasisPoints !== null && result.changeBasisPoints <= SUBSTANTIAL_LOSS_BP) {
    observations.push({
      kind: 'loss',
      tone: 'negative',
      message: `Under this scenario your portfolio fell ${formatPercent(result.changeBasisPoints)} (${formatCents(result.changeCents)}), a substantial loss.`,
    });
  } else if (result.changeBasisPoints !== null && result.changeBasisPoints > 0) {
    observations.push({
      kind: 'gain',
      tone: 'positive',
      message: `Under this scenario your portfolio gained ${formatPercent(result.changeBasisPoints)} (${formatCents(result.changeCents)}).`,
    });
  }

  // Worst-hit sector, naming a real sector and its real loss.
  const worst = exposure.worstSector;
  if (worst && worst.changeBasisPoints !== null && worst.changeBasisPoints < 0) {
    observations.push({
      kind: 'sector',
      tone: 'negative',
      message: `Your ${worst.sector} holdings were hit hardest, falling ${formatPercent(worst.changeBasisPoints)} (${formatCents(worst.changeCents)}).`,
    });
  }

  // A resilient or recovering sector, when one exists.
  const best = exposure.bestSector;
  if (best && best.changeBasisPoints !== null && best.changeBasisPoints > 0) {
    observations.push({
      kind: 'resilience',
      tone: 'positive',
      message: `Your ${best.sector} holdings held up best, moving ${formatPercent(best.changeBasisPoints)} under this scenario.`,
    });
  }

  // Fallback so the student always gets at least one grounded observation.
  if (observations.length === 0) {
    const topHolding = result.holdings.reduce((acc, h) =>
      h.currentValueCents > acc.currentValueCents ? h : acc,
    );
    observations.push({
      kind: 'sector',
      tone: 'neutral',
      message: `Your largest holding is ${topHolding.symbol}, ${formatCents(topHolding.currentValueCents)} of your ${formatCents(totalCents)} invested value.`,
    });
  }

  return observations;
}
