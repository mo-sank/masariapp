/**
 * Per-scenario design challenges for the Stress Lab (FR-30–FR-32, Phase 2).
 *
 * The constructionist "design challenge" layer: each scenario carries one or
 * more objectives the student tries to MEET by re-designing their own portfolio
 * in the brokerage and re-running the test — e.g. "survive the recession losing
 * less than 20%" or "keep no single sector above 30%". These are pure
 * definitions plus a deterministic pass/fail evaluator over a
 * {@link SimulationResult}; nothing here modifies the portfolio or prescribes a
 * trade. The evaluator result maps to the `upsert_challenge_progress` status
 * ('met' / 'in_progress') the data hook persists.
 *
 * No React or Supabase. Money reasoning is over integer cents / basis points,
 * mirroring `src/lib/money.ts`.
 */
import { allocationBySector, concentrationIndicators } from './portfolio-analysis';
import type { SimulationResult } from '../engine/types';

/** How a challenge is checked: cap a loss, or cap a concentration share. */
export type ChallengeMetric = 'max-loss-bp' | 'max-sector-share-bp' | 'max-holding-share-bp';

/** A design challenge the student tries to satisfy by re-designing the portfolio. */
export interface ChallengeDefinition {
  /** Stable id, unique within a scenario (persisted as `challenge_id`). */
  id: string;
  /** Scenario this challenge applies to (persisted as `scenario_id`). */
  scenarioId: string;
  /** Short, student-facing title. */
  title: string;
  /** The objective in plain language. */
  objective: string;
  /** Which metric decides pass/fail. */
  metric: ChallengeMetric;
  /**
   * The threshold in basis points. For `max-loss-bp` the simulated change must
   * be >= this (a negative bound, e.g. -2000 = "lose no more than 20%"); for the
   * share metrics the largest sector/holding must be <= this.
   */
  thresholdBp: number;
}

/** The outcome of evaluating one challenge against a result. */
export interface ChallengeEvaluation {
  /** True when the objective is satisfied by this result. */
  met: boolean;
  /** The status string the progress RPC expects. */
  status: 'met' | 'in_progress';
  /** The measured value (basis points) the threshold was compared against. */
  actualBp: number | null;
  /** Plain-language summary of where the student stands. */
  summary: string;
}

/**
 * Challenge catalog keyed by scenario id. Thresholds chosen to be reachable by
 * re-designing a portfolio, not by luck — the point is to make the student
 * iterate (FR-32).
 */
export const CHALLENGES: readonly ChallengeDefinition[] = [
  {
    id: 'survive_recession',
    scenarioId: 'recession',
    title: 'Weather the recession',
    objective: 'Finish the recession scenario having lost less than 20% of your portfolio.',
    metric: 'max-loss-bp',
    thresholdBp: -2000,
  },
  {
    id: 'survive_2008',
    scenarioId: 'crisis_2008',
    title: 'Survive 2008',
    objective: 'Keep your loss under 30% through the 2008 financial crisis.',
    metric: 'max-loss-bp',
    thresholdBp: -3000,
  },
  {
    id: 'diversify_2008',
    scenarioId: 'crisis_2008',
    title: 'Spread the risk',
    objective: 'Hold no single sector above 30% of your portfolio going into the crisis.',
    metric: 'max-sector-share-bp',
    thresholdBp: 3000,
  },
  {
    id: 'soften_covid',
    scenarioId: 'covid_2020',
    title: 'Cushion the crash',
    objective: 'Limit the COVID-19 crash to a loss under 25%.',
    metric: 'max-loss-bp',
    thresholdBp: -2500,
  },
  {
    id: 'inflation_real_return',
    scenarioId: 'high_inflation',
    title: 'Beat inflation',
    objective: 'Come through the high-inflation scenario down no more than 5%.',
    metric: 'max-loss-bp',
    thresholdBp: -500,
  },
  {
    id: 'rates_resilience',
    scenarioId: 'rising_rates',
    title: 'Rate-proof your mix',
    objective: 'Keep your loss under 10% when interest rates rise sharply.',
    metric: 'max-loss-bp',
    thresholdBp: -1000,
  },
  {
    id: 'avoid_single_bet',
    scenarioId: 'rising_rates',
    title: 'No single bet',
    objective: 'Hold no single company above 30% of your portfolio.',
    metric: 'max-holding-share-bp',
    thresholdBp: 3000,
  },
];

/** The challenges defined for a scenario, in catalog order. */
export function challengesForScenario(scenarioId: string): ChallengeDefinition[] {
  return CHALLENGES.filter((c) => c.scenarioId === scenarioId);
}

/** Look up a single challenge by scenario + challenge id. */
export function getChallenge(
  scenarioId: string,
  challengeId: string,
): ChallengeDefinition | undefined {
  return CHALLENGES.find((c) => c.scenarioId === scenarioId && c.id === challengeId);
}

/**
 * Evaluate a challenge against a simulation result. Deterministic: the same
 * result always yields the same verdict. An empty portfolio never meets a
 * challenge (there is nothing to design yet).
 */
export function evaluateChallenge(
  challenge: ChallengeDefinition,
  result: SimulationResult,
): ChallengeEvaluation {
  if (result.holdings.length === 0) {
    return {
      met: false,
      status: 'in_progress',
      actualBp: null,
      summary: 'Add holdings in the brokerage, then run this scenario to attempt the challenge.',
    };
  }

  switch (challenge.metric) {
    case 'max-loss-bp':
      return evaluateMaxLoss(challenge, result);
    case 'max-sector-share-bp':
      return evaluateMaxSectorShare(challenge, result);
    case 'max-holding-share-bp':
      return evaluateMaxHoldingShare(challenge, result);
    default:
      return {
        met: false,
        status: 'in_progress',
        actualBp: null,
        summary: 'This challenge cannot be evaluated.',
      };
  }
}

/** Cap-the-loss challenge: simulated change must be >= the (negative) threshold. */
function evaluateMaxLoss(
  challenge: ChallengeDefinition,
  result: SimulationResult,
): ChallengeEvaluation {
  const actualBp = result.changeBasisPoints;
  // A null change means a zero starting value; treat as unmet (nothing simulated).
  const met = actualBp !== null && actualBp >= challenge.thresholdBp;
  return {
    met,
    status: met ? 'met' : 'in_progress',
    actualBp,
    summary: met
      ? `Met: your portfolio moved ${formatBp(actualBp)}, within the ${formatBp(challenge.thresholdBp)} limit.`
      : `Not yet: your portfolio moved ${formatBp(actualBp)}; aim for ${formatBp(challenge.thresholdBp)} or better.`,
  };
}

/** Cap-the-sector-share challenge: the largest sector must be <= the threshold. */
function evaluateMaxSectorShare(
  challenge: ChallengeDefinition,
  result: SimulationResult,
): ChallengeEvaluation {
  const sectors = allocationBySector(result.holdings);
  const largest = sectors.length > 0 ? sectors[0] : null;
  const actualBp = largest ? largest.basisPoints : null;
  const met = actualBp !== null && actualBp <= challenge.thresholdBp;
  return {
    met,
    status: met ? 'met' : 'in_progress',
    actualBp,
    summary: met
      ? `Met: your largest sector is ${formatShare(actualBp)}, within the ${formatShare(challenge.thresholdBp)} limit.`
      : `Not yet: ${largest ? largest.sector : 'your largest sector'} is ${formatShare(actualBp)}; keep every sector at or below ${formatShare(challenge.thresholdBp)}.`,
  };
}

/** Cap-the-holding-share challenge: the largest holding must be <= the threshold. */
function evaluateMaxHoldingShare(
  challenge: ChallengeDefinition,
  result: SimulationResult,
): ChallengeEvaluation {
  const indicators = concentrationIndicators(result.holdings);
  const actualBp = indicators.largestHoldingSymbol ? indicators.largestHoldingBasisPoints : null;
  const met = actualBp !== null && actualBp <= challenge.thresholdBp;
  return {
    met,
    status: met ? 'met' : 'in_progress',
    actualBp,
    summary: met
      ? `Met: your largest holding is ${formatShare(actualBp)}, within the ${formatShare(challenge.thresholdBp)} limit.`
      : `Not yet: ${indicators.largestHoldingSymbol ?? 'your largest holding'} is ${formatShare(actualBp)}; keep every holding at or below ${formatShare(challenge.thresholdBp)}.`,
  };
}

/** Signed percent label from basis points, e.g. -2000 -> "-20.0%". */
function formatBp(bp: number | null): string {
  if (bp === null) {
    return '—';
  }
  const sign = bp > 0 ? '+' : bp < 0 ? '-' : '';
  return `${sign}${(Math.abs(bp) / 100).toFixed(1)}%`;
}

/** Unsigned whole-percent share label, e.g. 3000 -> "30%". */
function formatShare(bp: number | null): string {
  if (bp === null) {
    return '—';
  }
  return `${Math.round(bp / 100)}%`;
}
