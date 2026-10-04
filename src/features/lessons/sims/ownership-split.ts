/**
 * Ownership-split lab — pure logic (requirements 8.1, 8.5).
 *
 * This is the lemonade-stand lab from L1.1: the learner sells shares of their
 * company to raise cash while trying to keep majority ownership (requirement
 * 8.1). The React component (`components/sims/OwnershipSplit.tsx`) owns the UI;
 * this module owns everything that can be reasoned about without a screen —
 * validating the authored params, deriving the live ownership/raise figures as
 * the learner moves the slider, and grading the final result. Keeping that here
 * (no React, no Expo, no network) is what makes the lab's behaviour unit-testable
 * and repeatable (requirement 8.5): with the same params and the same number of
 * shares sold, these functions always return the same numbers.
 *
 * Design reference: `.kiro/specs/lesson-engine/design.md` ("Sim designs"):
 *   state sharesSold; ownership% = (total - sold) / total; raise = sold * price.
 *   Score 100 if raise >= target AND ownership >= min; 60 if only one met;
 *   else 30 (with a hint and one retry).
 *
 * This lab is deterministic and uses no randomness itself — selling N shares
 * always produces the same ownership and raise. The seed exists for a uniform
 * lab contract (every lab receives one), so it is accepted and ignored here.
 */

import { z } from 'zod';

/* ------------------------------------------------------------------ *
 * Params
 * ------------------------------------------------------------------ */

/**
 * The authored params for an ownership-split step, validated per the design's
 * example `{ totalShares, pricePerShareCents, targetRaiseCents, minOwnerPct }`.
 * The content schema only guarantees `params` is an object; this schema is the
 * lab's own contract, so a malformed sim step fails loudly here (and in
 * `validate:content`) rather than rendering a broken simulation.
 */
export const ownershipSplitParamsSchema = z.object({
  /** Total shares the company has issued. The learner owns all of them to start. */
  totalShares: z
    .number()
    .int()
    .min(1, { error: 'totalShares must be at least 1' }),
  /** Price a buyer pays per share, in cents. */
  pricePerShareCents: z
    .number()
    .int()
    .min(1, { error: 'pricePerShareCents must be at least 1' }),
  /** Cash the learner is trying to raise, in cents. */
  targetRaiseCents: z
    .number()
    .int()
    .min(1, { error: 'targetRaiseCents must be at least 1' }),
  /** Minimum ownership percentage the learner should keep (0-100). */
  minOwnerPct: z
    .number()
    .min(0, { error: 'minOwnerPct must be between 0 and 100' })
    .max(100, { error: 'minOwnerPct must be between 0 and 100' }),
});

export type OwnershipSplitParams = z.infer<typeof ownershipSplitParamsSchema>;

/**
 * Parse unknown authored params into typed {@link OwnershipSplitParams},
 * throwing a Zod error if the shape is wrong. The component calls this once so
 * every later calculation works on validated numbers.
 */
export function parseOwnershipSplitParams(params: unknown): OwnershipSplitParams {
  return ownershipSplitParamsSchema.parse(params);
}

/* ------------------------------------------------------------------ *
 * Derived state
 * ------------------------------------------------------------------ */

/** The live figures for a given number of shares sold. */
export interface OwnershipSplitState {
  /** How many shares the learner has sold so far. */
  sharesSold: number;
  /** Shares the learner still holds (`total - sold`). */
  sharesKept: number;
  /** The learner's remaining ownership as a percentage, 0-100. */
  ownerPct: number;
  /** Cash raised so far, in cents (`sold * price`). */
  raisedCents: number;
}

/** Clamp shares sold into the valid `[0, totalShares]` range (integer). */
export function clampSharesSold(sharesSold: number, params: OwnershipSplitParams): number {
  const n = Math.round(sharesSold);
  if (n < 0) return 0;
  if (n > params.totalShares) return params.totalShares;
  return n;
}

/**
 * Derive the live ownership/raise figures for a number of shares sold. Pure:
 * the same inputs always yield the same `OwnershipSplitState`, which is what the
 * component renders as the learner moves the slider (requirement 8.1: show
 * ownership change live).
 */
export function deriveOwnershipState(
  sharesSold: number,
  params: OwnershipSplitParams,
): OwnershipSplitState {
  const sold = clampSharesSold(sharesSold, params);
  const sharesKept = params.totalShares - sold;
  const ownerPct = (sharesKept / params.totalShares) * 100;
  const raisedCents = sold * params.pricePerShareCents;
  return { sharesSold: sold, sharesKept, ownerPct, raisedCents };
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

/** Which of the two goals the learner's current split meets. */
export interface OwnershipSplitGoals {
  /** Whether the raise meets or beats the target. */
  raiseMet: boolean;
  /** Whether remaining ownership meets or beats the minimum. */
  ownershipMet: boolean;
}

/** The graded outcome of an ownership-split run. */
export interface OwnershipSplitResult extends OwnershipSplitGoals {
  /** The score to report to the player: 100 (both), 60 (one), or 30 (neither). */
  score: number;
  /** A short, learner-facing summary of how the split did. */
  summary: string;
}

/**
 * Evaluate which goals a split meets. A tiny epsilon absorbs floating-point
 * error on the ownership percentage so a split that is exactly on the minimum
 * (e.g. 51.00%) is never rejected by a rounding artefact.
 */
export function evaluateGoals(
  state: OwnershipSplitState,
  params: OwnershipSplitParams,
): OwnershipSplitGoals {
  const EPSILON = 1e-9;
  return {
    raiseMet: state.raisedCents >= params.targetRaiseCents,
    ownershipMet: state.ownerPct + EPSILON >= params.minOwnerPct,
  };
}

/**
 * Grade a completed ownership-split run (requirement 8.1). Scoring follows the
 * design exactly: both goals met -> 100, exactly one -> 60, neither -> 30. The
 * `summary` explains the outcome in plain language for the result the lab
 * reports; the component turns a sub-100 score into the "hint and one retry"
 * affordance (the design's retry) before committing.
 */
export function scoreOwnershipSplit(
  sharesSold: number,
  params: OwnershipSplitParams,
): OwnershipSplitResult {
  const state = deriveOwnershipState(sharesSold, params);
  const { raiseMet, ownershipMet } = evaluateGoals(state, params);

  let score: number;
  if (raiseMet && ownershipMet) {
    score = 100;
  } else if (raiseMet || ownershipMet) {
    score = 60;
  } else {
    score = 30;
  }

  const summary = buildSummary({ raiseMet, ownershipMet }, state, params);
  return { score, summary, raiseMet, ownershipMet };
}

/** Build the learner-facing one-line summary for a graded run. */
function buildSummary(
  goals: OwnershipSplitGoals,
  state: OwnershipSplitState,
  params: OwnershipSplitParams,
): string {
  const raised = formatDollars(state.raisedCents);
  const target = formatDollars(params.targetRaiseCents);
  const owned = `${formatPct(state.ownerPct)}% ownership`;

  if (goals.raiseMet && goals.ownershipMet) {
    return `You raised ${raised} and kept ${owned}. Both goals met!`;
  }
  if (goals.raiseMet && !goals.ownershipMet) {
    return `You raised ${raised}, but gave up too much — only ${owned} left (needed ${formatPct(
      params.minOwnerPct,
    )}%).`;
  }
  if (!goals.raiseMet && goals.ownershipMet) {
    return `You kept ${owned}, but only raised ${raised} of the ${target} target.`;
  }
  return `You raised ${raised} of ${target} and kept ${owned}. Try selling a different number of shares.`;
}

/* ------------------------------------------------------------------ *
 * Formatting helpers (pure, locale-free so tests are stable)
 * ------------------------------------------------------------------ */

/** Format a cent amount as a plain dollar string, e.g. 40000 -> "$400". */
export function formatDollars(cents: number): string {
  const dollars = cents / 100;
  // Whole dollars render without decimals; otherwise show two decimal places.
  const body = Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
  return `$${body}`;
}

/** Format a percentage to at most one decimal place, trimming a trailing ".0". */
export function formatPct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
