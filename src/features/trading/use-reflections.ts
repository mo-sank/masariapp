/**
 * The caller's trade reflections (requirements 9.3, 10.1).
 *
 * Reads the signed-in user's own `trade_reflections` rows so the trade-history
 * list can show each order's reflection beside it (requirement 10.1). RLS on
 * `trade_reflections` scopes the result to the caller's rows, so no user id is
 * passed from the client — the same RLS-scoped convention as
 * src/features/trading/use-orders.ts. Because the rows are only ever read back
 * through the owner's RLS scope, reflection text stays private to the user and
 * is never shown to anyone else (requirement 9.3).
 *
 * The query key `['reflections', 'me']` is invalidated by the submit-reflection
 * flow (use-reflection.ts) after a new reflection is saved, so the history
 * refreshes.
 */
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';
import type { Database } from '../../types/db';

type ReflectionRow = Database['public']['Tables']['trade_reflections']['Row'];

/** React Query key for the caller's reflections. */
export const REFLECTIONS_QUERY_KEY = ['reflections', 'me'] as const;

/**
 * Fetch the caller's trade reflections. RLS limits the rows to the signed-in
 * user. Throws on a Supabase error.
 */
export async function fetchMyReflections(): Promise<ReflectionRow[]> {
  const { data, error } = await supabase
    .from('trade_reflections')
    .select('id, order_id, user_id, expectation, note, created_at');
  if (error) {
    throw error;
  }
  return data ?? [];
}

/**
 * Build a map from `order_id` to the reflection for that order, so the history
 * list can join a reflection to its order in O(1). Each order has at most one
 * reflection (`trade_reflections.order_id` is unique).
 */
export function reflectionsByOrderId(
  reflections: readonly ReflectionRow[],
): Map<string, ReflectionRow> {
  const map = new Map<string, ReflectionRow>();
  for (const reflection of reflections) {
    map.set(reflection.order_id, reflection);
  }
  return map;
}

/**
 * Query the caller's reflections. Pass `enabled = isSignedIn` so the query does
 * not run while signed out.
 */
export function useReflections(enabled = true) {
  return useQuery({
    queryKey: REFLECTIONS_QUERY_KEY,
    queryFn: fetchMyReflections,
    enabled,
  });
}
