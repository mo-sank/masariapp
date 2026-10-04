/**
 * save_rewind_items RPC wrapper and payload builder (requirement 7.1).
 *
 * When a lesson run ends with scored items the learner got wrong, those items
 * should come back later as practice (requirement 7.1). This wraps the Supabase
 * `save_rewind_items` RPC
 * (supabase/migrations/20250104000004_rewind_and_assessment_rpcs.sql, and the
 * "Rewind scheduling" section of the design), which runs SECURITY DEFINER,
 * derives the user from the verified session, and upserts each item into
 * `rewind_items` at box 0 due now — idempotent on (user_id, item_id), so a fresh
 * miss of an already-queued item simply resets it to the front of the queue. The
 * client never passes a user id, matching the `complete_lesson` /
 * `submit_assessment` convention in the sibling api modules.
 *
 * The RPC takes `p_items` as an array of `{ lesson_id, item_id }`.
 * {@link buildRewindItems} turns the pure scorer's `perItem` breakdown and the
 * run's lesson id into that shape, keeping only the *incorrect* scored items
 * (`correct === false`): a correct answer has nothing to re-practise. The
 * `item_id` is the scored step's id (the lesson id + step id together identify
 * the authored item), matching how `complete_lesson`'s per-item answers are keyed.
 *
 * The RPC returns the number of items processed. {@link saveRewindItems} returns
 * that count so the caller can skip the network round-trip entirely when there
 * is nothing to save (see {@link buildRewindItems} returning `[]`).
 *
 * Pure builder + a single RPC call. The Supabase client is imported lazily
 * inside {@link saveRewindItems} (as the sibling api modules do) so unit tests of
 * {@link buildRewindItems} never pull in the native-backed client at import time.
 */
import type { PerItemResult } from '../scoring';
import type { Json } from '../../../types/db';

/** A single missed item sent to the RPC (`{ lesson_id, item_id }`). */
export interface RewindItemInput {
  lesson_id: string;
  item_id: string;
}

/**
 * Build the RPC's `p_items` array from a run's scored per-item breakdown and the
 * lesson id. Only *incorrect* scored items are included — a correct answer is
 * not re-queued (requirement 7.1 saves items answered incorrectly). The step id
 * is the item id, so re-saving the same missed item upserts (not duplicates) the
 * existing `rewind_items` row. Exported for unit testing.
 */
export function buildRewindItems(
  perItem: readonly PerItemResult[],
  lessonId: string,
): RewindItemInput[] {
  return perItem
    .filter((item) => !item.correct)
    .map((item) => ({ lesson_id: lessonId, item_id: item.stepId }));
}

/**
 * Call the `save_rewind_items` RPC with the given missed items and return the
 * number processed.
 *
 * Short-circuits with `0` when `items` is empty so a run with no misses makes no
 * network call. Throws the raw supabase error on failure (offline, RPC error);
 * saving the Rewind queue is best-effort, so the caller swallows the error and
 * lets the learner proceed (the queue just misses this run's items). Because the
 * RPC upserts idempotently, a retried call is safe.
 */
export async function saveRewindItems(items: readonly RewindItemInput[]): Promise<number> {
  if (items.length === 0) {
    return 0;
  }

  // Imported lazily so unit tests of the pure builder never pull in the Supabase
  // client (which constructs itself at import time and reads config/native deps).
  const { supabase } = await import('../../../lib/supabase');
  const { data, error } = await supabase.rpc('save_rewind_items', {
    p_items: items as unknown as Json,
  });

  if (error) {
    throw error;
  }

  return typeof data === 'number' ? data : 0;
}
