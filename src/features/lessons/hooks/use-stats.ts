/**
 * Learner stats query (requirement 2.5).
 *
 * Fetches the signed-in learner's `user_stats` row — XP total and streak — so
 * the Learn tab header can show progress and refresh it when XP or the streak
 * changes (requirement 2.5). RLS scopes the result to the caller's own row, so
 * no user id is passed from the client (same convention as `useProfile`).
 *
 * The row is created at onboarding (foundation spec), so a signed-in learner
 * normally has exactly one; `maybeSingle()` resolves "no row yet" to `null`
 * rather than throwing. The query key `['stats']` is invalidated by the
 * completion flow (task 11) so the header refreshes after a lesson awards XP.
 */
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../../lib/supabase';
import type { Database } from '../../../types/db';

type UserStatsRow = Database['public']['Tables']['user_stats']['Row'];

/** React Query key for the learner's stats. */
export const STATS_QUERY_KEY = ['stats'] as const;

/** Fetch the caller's user_stats row, or `null` when none exists yet. */
export async function fetchStats(): Promise<UserStatsRow | null> {
  const { data, error } = await supabase
    .from('user_stats')
    .select('user_id, xp_total, streak_current, streak_longest, streak_freezes, last_active_date')
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

/**
 * Query the learner's stats. Pass `enabled = isSignedIn` so it does not run
 * while signed out.
 */
export function useStats(enabled = true) {
  return useQuery({
    queryKey: STATS_QUERY_KEY,
    queryFn: fetchStats,
    enabled,
  });
}
