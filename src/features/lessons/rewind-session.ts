/**
 * Pure Rewind session logic (requirements 7.3, 7.4).
 *
 * A Rewind session re-presents the learner's due missed items, grades each
 * re-answer, and records the result (requirement 7.3). The screen owns the
 * rendering, haptics, RPC calls and navigation; this module owns the pure parts
 * so they can be unit tested without React or the network:
 *
 *   - {@link buildReviewItems}: resolve the due `rewind_items` into the authored
 *     steps to re-present, capping the session at {@link REWIND_SESSION_LIMIT}
 *     items (~90 seconds, requirement 7.3) and dropping any item whose lesson or
 *     step no longer exists (content can change between the miss and the review),
 *     so the session only ever presents items it can actually render.
 *   - {@link gradeReviewAnswer}: judge a single re-answer with the shared pure
 *     scorer, yielding the boolean the `review_rewind_item` RPC needs
 *     (requirement 7.4: correct advances the box, incorrect resets it).
 *
 * This module imports only the content loader and the pure scorer — no Expo,
 * React Native, or network imports — so it behaves identically in the app and in
 * tests.
 */

import { getLesson } from './content';
import type { Step } from './schema';
import { scoreLesson, type Answer } from './scoring';
import type { Database } from '../../types/db';

type RewindRow = Database['public']['Tables']['rewind_items']['Row'];

/**
 * A due item the session needs: which lesson it came from and which step. Kept
 * here (not in the supabase-backed `use-rewind` hook) so the pure session logic
 * and its tests never transitively import the native client; `use-rewind`
 * re-exports it.
 */
export type DueRewindItem = Pick<RewindRow, 'id' | 'lesson_id' | 'item_id' | 'box'>;

/**
 * The maximum number of due items a single Rewind session presents
 * (requirement 7.3: "up to 5 due items (about 90 seconds)"). The Rewind card
 * still reports the true due count; this only caps how many a session walks
 * through. Defined here (the pure module) and re-exported by `use-rewind`.
 */
export const REWIND_SESSION_LIMIT = 5;

/**
 * A due item resolved to the authored step the session will re-present. Carries
 * the `itemId` (passed to `review_rewind_item`) and the `lessonId` for context.
 */
export interface ReviewItem {
  /** The rewind_items.item_id — the scored step's id. Passed to the RPC. */
  itemId: string;
  /** The lesson the missed item came from. */
  lessonId: string;
  /** The authored step to re-present (reused via the StepRenderer registry). */
  step: Step;
}

/**
 * Resolve the due rewind rows into the review items the session will walk
 * through (requirement 7.3).
 *
 * For each due row it looks up the lesson (via {@link getLesson}) and the step
 * whose id equals `item_id`. Rows whose lesson or step no longer exists are
 * skipped — content shipped over the air can change after a miss was queued, and
 * a session must never try to render a step it cannot resolve. The result is
 * capped at {@link REWIND_SESSION_LIMIT} so a session stays short (~90 seconds).
 * Input order is preserved (the caller fetches most-overdue first), so the
 * oldest misses are reviewed first.
 *
 * @param due - The due rewind rows (from {@link useRewind}).
 * @param limit - Max items to present; defaults to {@link REWIND_SESSION_LIMIT}.
 */
export function buildReviewItems(
  due: readonly DueRewindItem[],
  limit: number = REWIND_SESSION_LIMIT,
): ReviewItem[] {
  const items: ReviewItem[] = [];

  for (const row of due) {
    if (items.length >= limit) {
      break;
    }
    const lesson = getLesson(row.lesson_id);
    if (!lesson) {
      continue;
    }
    const step = lesson.steps.find((s) => s.id === row.item_id);
    if (!step) {
      continue;
    }
    items.push({ itemId: row.item_id, lessonId: row.lesson_id, step });
  }

  return items;
}

/**
 * Grade a single re-answer against its step (requirement 7.4), returning whether
 * it was correct. Delegates to the shared pure scorer on a one-step lesson so a
 * Rewind re-answer is judged exactly as it would be in the lesson player — no
 * second, drifting notion of correctness. The boolean is what the session passes
 * to `review_rewind_item` (correct advances the box, incorrect resets it).
 */
export function gradeReviewAnswer(step: Step, answer: Answer): boolean {
  return scoreLesson([step], [answer]).perItem[0]?.correct ?? false;
}
