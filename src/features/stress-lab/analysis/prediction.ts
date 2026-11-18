/**
 * Prediction-accuracy scoring for the Stress Lab (FR-33, Phase 2).
 *
 * Before running a scenario the student records a prediction: whether the
 * portfolio will gain or lose, a rough estimate of the percentage move, and
 * which holding they expect to do best / worst. After the run we score that
 * prediction against the deterministic {@link SimulationResult} so the student
 * sees how close they were — the "make a guess, then check it" loop that turns a
 * stress test into a learning moment.
 *
 * This mirrors the `accuracy` jsonb the `save_prediction` RPC computes
 * server-side (FEAT-001): same fields, same definitions — direction, actual
 * direction/change, estimate error, and best/worst symbol correctness — so the
 * immediate client-side feedback and the persisted record agree. Pure, no React
 * or Supabase; percentages are basis points.
 */
import type { SimulationResult } from '../engine/types';

/** Whether the student thinks the portfolio will go up or down. */
export type PredictionDirection = 'gain' | 'lose';

/** A prediction the student records BEFORE running a scenario. */
export interface Prediction {
  /** Up or down. */
  direction: PredictionDirection;
  /** Optional rough estimate of the percentage move, in basis points. */
  estimatedChangeBp?: number | null;
  /** Optional symbol the student expects to perform best. */
  pickedBest?: string | null;
  /** Optional symbol the student expects to perform worst. */
  pickedWorst?: string | null;
}

/** The scored accuracy of a prediction vs the simulated result. */
export interface PredictionAccuracy {
  /** Did the student call the overall direction? */
  directionCorrect: boolean;
  /** The direction the simulation actually produced. */
  actualDirection: PredictionDirection;
  /** The portfolio's actual change in basis points (null when starting value 0). */
  actualChangeBp: number | null;
  /** |estimate − actual| in basis points, or null when either is missing. */
  estimateErrorBp: number | null;
  /** Did the student pick the actual best holding? (false when no pick). */
  bestCorrect: boolean;
  /** Did the student pick the actual worst holding? (false when no pick). */
  worstCorrect: boolean;
  /** The symbol that actually performed best, or null when no holdings. */
  actualBest: string | null;
  /** The symbol that actually performed worst, or null when no holdings. */
  actualWorst: string | null;
}

/**
 * Score a prediction against a simulation result. Deterministic and side-effect
 * free; the field definitions match the server's `save_prediction` accuracy
 * payload so immediate feedback matches the persisted record.
 */
export function scorePrediction(
  prediction: Prediction,
  result: SimulationResult,
): PredictionAccuracy {
  const actualDirection: PredictionDirection = result.changeCents >= 0 ? 'gain' : 'lose';
  const actualChangeBp = result.changeBasisPoints;
  const { best, worst } = bestAndWorst(result);

  const estimateErrorBp =
    prediction.estimatedChangeBp == null || actualChangeBp == null
      ? null
      : Math.abs(prediction.estimatedChangeBp - actualChangeBp);

  return {
    directionCorrect: prediction.direction === actualDirection,
    actualDirection,
    actualChangeBp,
    estimateErrorBp,
    bestCorrect: prediction.pickedBest != null && prediction.pickedBest === best,
    worstCorrect: prediction.pickedWorst != null && prediction.pickedWorst === worst,
    actualBest: best,
    actualWorst: worst,
  };
}

/**
 * The symbols with the highest and lowest simulated percentage change. Holdings
 * with a null change (zero original value) are ignored for the ranking; ties
 * resolve to the first holding in the result order, matching the server's
 * `order by ... desc/asc nulls last limit 1`.
 */
function bestAndWorst(result: SimulationResult): { best: string | null; worst: string | null } {
  const ranked = result.holdings.filter((h) => h.changeBasisPoints !== null);
  if (ranked.length === 0) {
    return { best: null, worst: null };
  }
  let best = ranked[0];
  let worst = ranked[0];
  for (const h of ranked) {
    if ((h.changeBasisPoints as number) > (best.changeBasisPoints as number)) {
      best = h;
    }
    if ((h.changeBasisPoints as number) < (worst.changeBasisPoints as number)) {
      worst = h;
    }
  }
  return { best: best.symbol, worst: worst.symbol };
}

/** A 0–100 "closeness" score for display, derived from the accuracy fields. */
export function predictionScore(accuracy: PredictionAccuracy): number {
  let score = 0;
  // Direction is the headline call.
  if (accuracy.directionCorrect) {
    score += 50;
  }
  // Best / worst picks, when the student made them and got them right.
  if (accuracy.bestCorrect) {
    score += 15;
  }
  if (accuracy.worstCorrect) {
    score += 15;
  }
  // The estimate: full 20 when within 5%, scaling to 0 by a 30% miss.
  if (accuracy.estimateErrorBp != null) {
    const within = Math.max(0, 1 - Math.max(0, accuracy.estimateErrorBp - 500) / 2500);
    score += Math.round(20 * within);
  }
  return Math.min(100, score);
}
