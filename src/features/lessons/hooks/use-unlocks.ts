/**
 * Feature unlocks query (requirement 2.3).
 *
 * Fetches the signed-in learner's `user_unlocks` rows so the path's unlock
 * previews can tell which features a lesson *will* unlock versus which it
 * *already* unlocked. RLS scopes the result to the caller's own rows, so no
 * user id is passed from the client (same convention as `useProfile`).
 *
 * The query key `['unlocks']` is invalidated by the completion flow (task 11)
 * after a lesson grants a new unlock, so the path refreshes (requirement 2.5).
 */
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../../lib/supabase';
import type { Database } from '../../../types/db';

type UserUnlockRow = Database['public']['Tables']['user_unlocks']['Row'];

/** React Query key for the learner's unlocked features. */
export const UNLOCKS_QUERY_KEY = ['unlocks'] as const;

/** Fetch the caller's user_unlocks rows (just the feature keys the path needs). */
export async function fetchUnlocks(): Promise<Pick<UserUnlockRow, 'feature_key'>[]> {
  const { data, error } = await supabase.from('user_unlocks').select('feature_key');
  if (error) {
    throw error;
  }
  return data ?? [];
}

/**
 * Query the learner's unlocked features. Pass `enabled = isSignedIn` so it does
 * not run while signed out.
 */
export function useUnlocks(enabled = true) {
  return useQuery({
    queryKey: UNLOCKS_QUERY_KEY,
    queryFn: fetchUnlocks,
    enabled,
  });
}
