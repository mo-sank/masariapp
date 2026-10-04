/**
 * Pure lesson scoring (requirements 5.1, 3.3).
 *
 * A lesson's score is the percentage of *scored* items the learner got right on
 * their first try (requirement 5.1). Sims are scored only when the step is
 * marked `scored`, and they contribute the 0-100 score the lab reported rather
 * than a boolean. Everything here is pure: given the authored steps and the
 * learner's recorded answers it returns the score and a per-item breakdown,
 * with no state, randomness, or I/O. The session store records answers; this
 * module turns them into a result; the completion flow sends that result to
 * `complete_lesson` (requirement 5.2).
 *
 * Design reference: `.kiro/specs/lesson-engine/design.md`
 * ("scoring.ts (pure): scoreLesson(answers, steps) -> { scorePct, perItem[] }").
 *
 * "First try" is a property of the recorded answer, not of this module: the
 * player locks in the first response to a scored step (requirement 3.2 shows
 * feedback before continuing), so the `Answer` passed here already represents
 * the first attempt. This module never sees retries.
 *
 * Pure module: no Expo, React Native, or network imports.
 */

import type { Step } from './schema';

/**
 * A learner's recorded answer to a single step, tagged by the step's `type` so
 * correctness can be judged against the authored step. Only the step types that
 * can be scored carry answer data; `cards` and `guided_trade` are never scored
 * and so never produce an `Answer`.
 *
 * `stepId` ties the answer back to the step. For a `sim` the lab reports its own
 * 0-100 `score`; for every other type the stored response is compared against
 * the authored correct answer here.
 */
export type Answer =
  | { stepId: string; type: 'mcq'; optionId: string }
  | { stepId: string; type: 'truefalse'; value: boolean }
  | { stepId: string; type: 'predict'; optionId: string }
  // sort: the bucket the learner placed each item into, keyed by item id.
  | { stepId: string; type: 'sort'; placements: Record<string, string> }
  // match: the right-hand value the learner paired with each pair id.
  | { stepId: string; type: 'match'; pairings: Record<string, string> }
  // sim: the 0-100 score the lab reported for the learner's run.
  | { stepId: string; type: 'sim'; score: number };

/** The outcome for one scored step. */
export interface PerItemResult {
  stepId: string;
  /** The step's concept tag — present on every scored step (requirement 1.3). */
  concept: string | undefined;
  /**
   * Whether the item counts as correct. For graded sims (a 0-100 score) this is
   * true when the score is a full 100; the fractional `score` is kept in
   * `scorePct` for callers that want partial credit (e.g. Rewind decisions).
   */
  correct: boolean;
  /**
   * This item's contribution as a percentage, 0-100. Pass/fail items are 0 or
   * 100; sims pass through their reported score. Averaged across items to get
   * the lesson score.
   */
  scorePct: number;
}

/** The result of scoring a whole lesson. */
export interface LessonScore {
  /**
   * The lesson score, 0-100, rounded to the nearest integer: the mean of every
   * scored item's `scorePct`. A lesson with no scored items scores 100 (there
   * is nothing to get wrong), which keeps content like a pure reading lesson
   * from being treated as a failure.
   */
  scorePct: number;
  /** One entry per scored step, in the order the steps appear in the lesson. */
  perItem: PerItemResult[];
}

/** Whether a step contributes to the score, honouring the schema's per-type default. */
function isScored(step: Step): boolean {
  switch (step.type) {
    // Never scored.
    case 'cards':
    case 'guided_trade':
      return false;
    // Opt-in: scored only when the author set `scored: true`.
    case 'predict':
    case 'sim':
      return step.scored === true;
    // Scored by default; the author can turn it off with `scored: false`.
    case 'mcq':
    case 'truefalse':
    case 'sort':
    case 'match':
      return step.scored !== false;
  }
}

/** Clamp a sim's reported score into the valid 0-100 range. */
function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

/**
 * Judge a single scored step against its recorded answer, returning the item's
 * percentage contribution (0-100). A missing answer, or one whose type does not
 * match the step, scores 0 — an unanswered scored item is wrong, not skipped.
 */
function scoreStep(step: Step, answer: Answer | undefined): number {
  switch (step.type) {
    case 'mcq':
      return answer?.type === 'mcq' && answer.optionId === step.correctId ? 100 : 0;

    case 'truefalse':
      return answer?.type === 'truefalse' && answer.value === step.answer ? 100 : 0;

    case 'predict':
      // Only reachable when scored, which the schema guarantees implies a
      // correctId. Guard anyway so a mis-shaped step can never throw.
      return answer?.type === 'predict' &&
        step.correctId !== undefined &&
        answer.optionId === step.correctId
        ? 100
        : 0;

    case 'sort': {
      if (answer?.type !== 'sort') return 0;
      // All-or-nothing: every item must land in its authored bucket.
      const allCorrect = step.items.every(
        (item) => answer.placements[item.id] === item.bucketId,
      );
      return allCorrect ? 100 : 0;
    }

    case 'match': {
      if (answer?.type !== 'match') return 0;
      // All-or-nothing: every pair's left must be matched to its own right.
      const allCorrect = step.pairs.every(
        (pair) => answer.pairings[pair.id] === pair.right,
      );
      return allCorrect ? 100 : 0;
    }

    case 'sim':
      // The lab already graded the run; pass its score through (clamped).
      return answer?.type === 'sim' ? clampScore(answer.score) : 0;

    // cards / guided_trade are never scored and never reach here.
    default:
      return 0;
  }
}

/**
 * Score a lesson from its steps and the learner's recorded answers
 * (requirement 5.1).
 *
 * Walks the steps in order, scores each one that counts, and averages the
 * per-item percentages into the lesson score. The `perItem` breakdown drives
 * the results screen and the Rewind queue (incorrect scored items are saved for
 * later practice, requirement 7.1).
 *
 * @param steps - The authored lesson steps (from the parsed lesson).
 * @param answers - The learner's answers; order does not matter, they are
 *   looked up by `stepId`. Extra or unknown answers are ignored.
 */
export function scoreLesson(steps: readonly Step[], answers: readonly Answer[]): LessonScore {
  const byStepId = new Map(answers.map((a) => [a.stepId, a] as const));
  const perItem: PerItemResult[] = [];

  for (const step of steps) {
    if (!isScored(step)) continue;
    const scorePct = scoreStep(step, byStepId.get(step.id));
    perItem.push({
      stepId: step.id,
      concept: step.concept,
      correct: scorePct === 100,
      scorePct,
    });
  }

  // No scored items -> nothing to get wrong -> full marks (see LessonScore doc).
  if (perItem.length === 0) {
    return { scorePct: 100, perItem };
  }

  const total = perItem.reduce((sum, item) => sum + item.scorePct, 0);
  return {
    scorePct: Math.round(total / perItem.length),
    perItem,
  };
}

/**
 * Whether a lesson score meets the lesson's pass threshold (requirement 5.3).
 * Below the pass score the player shows an encouraging retry screen and does
 * not mark the lesson completed; this helper keeps that comparison in one place.
 */
export function isPassing(scorePct: number, passScore: number): boolean {
  return scorePct >= passScore;
}
