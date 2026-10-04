/**
 * Rewind due-items query (requirements 7.2, 7.3).
 *
 * Fetches the signed-in learner's *due* `rewind_items` — the missed scored items
 * whose `due_at` has arrived — so the Learn tab can show the Rewind card with a
 * count when work is waiting (requirement 7.2) and the Rewind session screen has
 * the items to walk through (requirement 7.3). RLS scopes the rows to the
 * caller's own queue (migration 20250104000002_learning_rls_and_grants.sql,
 * policy "own rows"), so no user id is passed from the client — same convention
 * as {@link useLessonProgress} / {@link useStats}.
 *
 * "Due" means `due_at <= now`, filtered server-side against the
 * `rewind_items_user_due_idx` index. The query orders by `due_at` so the most
 * overdue items come first, and the session takes the first few (requirement 7.3
 * presents up to 5 due items ~90 seconds). The hook exposes both the full due
 * list and a `dueCount` so the card does not have to re-derive it. When nothing
 * is due the list is empty and `dueCount` is 0, which is how the card knows to
 * hide itself (requirement 7.2 shows it only when items are due).
 *
 * The query key `['rewind']` is invalidated by {@link useSaveRewindItems} (after
 * a completion queues new misses) and by the session screen (after reviews move
 * items out), so the card's count stays in step with the queue (requirement
 * 7.2 / 2.5).
 */
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../../lib/supabase';
import type { DueRewindItem } from '../rewind-session';

// Re-export the due-item type and session limit from the pure session module so
// callers can keep importing them from the hook; defining them there (not here)
// keeps the pure session logic free of the native-backed Supabase client.
export { REWIND_SESSION_LIMIT, type DueRewindItem } from '../rewind-session';

/** React Query key for the learner's due Rewind items. */
export const REWIND_QUERY_KEY = ['rewind'] as const;

/** The shape {@link useRewind} resolves to. */
export interface RewindData {
  /** Due items, most-overdue first (already filtered to due_at <= now). */
  items: DueRewindItem[];
  /** How many items are due — what the Rewind card shows (requirement 7.2). */
  dueCount: number;
}

/**
 * Fetch the caller's due rewind items (`due_at <= now`), most-overdue first.
 *
 * `now` is injectable so tests can pin the clock; it defaults to the real
 * current time. The server-side `lte` filter uses the due index and keeps the
 * payload to just the items that are actually due.
 */
export async function fetchDueRewindItems(now: Date = new Date()): Promise<RewindData> {
  const { data, error } = await supabase
    .from('rewind_items')
    .select('id, lesson_id, item_id, box')
    .lte('due_at', now.toISOString())
    .order('due_at', { ascending: true });
  if (error) {
    throw error;
  }
  const items = data ?? [];
  return { items, dueCount: items.length };
}

/**
 * Query the learner's due Rewind items. Pass `enabled = isSignedIn` so it does
 * not run while signed out (an anonymous request would return no rows anyway).
 */
export function useRewind(enabled = true) {
  return useQuery({
    queryKey: REWIND_QUERY_KEY,
    queryFn: () => fetchDueRewindItems(),
    enabled,
  });
}
