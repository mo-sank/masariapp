/**
 * review_rewind_item RPC wrapper and result model (requirements 7.3, 7.4).
 *
 * The Rewind session calls this once per reviewed item (requirement 7.3). It
 * wraps the Supabase `review_rewind_item` RPC
 * (supabase/migrations/20250104000004_rewind_and_assessment_rpcs.sql, and the
 * "Rewind scheduling" section of the design), which runs SECURITY DEFINER,
 * derives the user from the verified session, and advances the item's
 * spaced-repetition schedule (requirement 7.4):
 *   - correct   -> box + 1 (capped at 4), due_at pushed out by the new box's
 *                  interval (1, 3, 7, 14 days);
 *   - incorrect -> box reset to 0, due_at = now() (surfaces again immediately).
 * The client never passes a user id (the RPC scopes to the caller's own row),
 * matching the `complete_lesson` / `submit_assessment` convention in the sibling
 * api modules.
 *
 * The RPC returns the updated `rewind_items` row. {@link parseRewindReview}
 * narrows it to {@link RewindReviewResult}, reading each field defensively so a
 * slightly-off server response can never throw in the session UI. The session
 * only needs to know the review landed (and, for the summary, how the box moved),
 * so the parse is intentionally small.
 *
 * Pure parsing + a single RPC call. The Supabase client is imported lazily
 * inside {@link reviewRewindItem} (as the sibling api modules do) so unit tests
 * of {@link parseRewindReview} never pull in the native-backed client at import
 * time.
 */

/** The narrowed `rewind_items` row returned after a review. */
export interface RewindReviewResult {
  itemId: string;
  /** The spaced-repetition box after the review, 0-4. */
  box: number;
}

/** Read a numeric field from the raw RPC row, defaulting to 0. */
function num(obj: Record<string, unknown>, key: string): number {
  const value = obj[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Narrow the raw `rewind_items` row into a typed {@link RewindReviewResult},
 * falling back to the reviewed item id when the row omits it. Reads defensively
 * so the session screen always has a usable result. Exported for unit testing.
 */
export function parseRewindReview(raw: unknown, itemId: string): RewindReviewResult {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rowItemId = typeof obj['item_id'] === 'string' ? obj['item_id'] : itemId;
  return {
    itemId: rowItemId,
    box: num(obj, 'box'),
  };
}

/**
 * Call the `review_rewind_item` RPC for one reviewed item and return the parsed
 * result (requirement 7.4).
 *
 * Throws the raw supabase error on failure (offline, RPC error) so the caller
 * can surface a friendly message; the session treats a failed review as
 * best-effort and keeps the learner moving. The RPC is scoped to the caller's
 * own item and raises `rewind_item_not_found` for an unknown id.
 */
export async function reviewRewindItem(
  itemId: string,
  correct: boolean,
): Promise<RewindReviewResult> {
  // Imported lazily so unit tests of the pure parser never pull in the Supabase
  // client (which constructs itself at import time and reads config/native deps).
  const { supabase } = await import('../../../lib/supabase');
  const { data, error } = await supabase.rpc('review_rewind_item', {
    p_item_id: itemId,
    p_correct: correct,
  });

  if (error) {
    throw error;
  }

  return parseRewindReview(data, itemId);
}
