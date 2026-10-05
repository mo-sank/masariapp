/**
 * The caller's watchlist (requirement 6.1).
 *
 * Reads the caller's `watchlist_items` for the Watchlist section. RLS scopes
 * the rows to the signed-in user, so no user id is passed from the client
 * (matching src/features/auth/use-profile.ts). Add/remove go through the
 * `watchlist_add` / `watchlist_remove` RPCs in a later task; this hook is the
 * read side only.
 *
 * Rows are returned newest-first (by `added_at`) so the most recently followed
 * company appears at the top. The caller joins these symbols to quotes/
 * instruments for display.
 */
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';
import type { Database } from '../../types/db';

type WatchlistItemRow = Database['public']['Tables']['watchlist_items']['Row'];

/** React Query key for the caller's watchlist. */
export const WATCHLIST_QUERY_KEY = ['watchlist', 'me'] as const;

/**
 * Fetch the caller's watchlist items, newest first. RLS limits the rows to the
 * signed-in user. Throws on a Supabase error.
 */
export async function fetchWatchlist(): Promise<WatchlistItemRow[]> {
  const { data, error } = await supabase
    .from('watchlist_items')
    .select('user_id, symbol, added_at')
    .order('added_at', { ascending: false });
  if (error) {
    throw error;
  }
  return data ?? [];
}

/**
 * Query the caller's watchlist. Pass `enabled = isSignedIn` so the query does
 * not run while signed out.
 */
export function useWatchlist(enabled = true) {
  return useQuery({
    queryKey: WATCHLIST_QUERY_KEY,
    queryFn: fetchWatchlist,
    enabled,
  });
}
