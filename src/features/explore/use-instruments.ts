/**
 * Active-instrument list for the Explore tab (requirement 4.1).
 *
 * Follows the project's data-hook pattern (see src/features/auth/use-profile.ts):
 * a plain async fetch function plus a thin `useQuery` wrapper. The query reads
 * the public `instruments` table through the shared Supabase client; instruments
 * are a shared, non-user-scoped catalog (readable by every signed-in user via
 * RLS), so no user id is passed from the client.
 *
 * Rows come back ordered so the Explore list is stable: by `sort_order` first
 * (the curated display order), then by symbol as a tiebreaker for rows with no
 * explicit order. Starter instruments are flagged by `is_starter` so the screen
 * can highlight them (requirement 4.1); this hook returns the raw rows and
 * leaves presentation to the screen.
 */
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';
import type { Database } from '../../types/db';

type InstrumentRow = Database['public']['Tables']['instruments']['Row'];

/** React Query key for the active-instrument list. */
export const INSTRUMENTS_QUERY_KEY = ['instruments', 'active'] as const;

/**
 * Fetch all active instruments, ordered for display. Throws on a Supabase
 * error so React Query surfaces it to the caller.
 */
export async function fetchInstruments(): Promise<InstrumentRow[]> {
  const { data, error } = await supabase
    .from('instruments')
    .select('is_active, is_starter, name, sector, sort_order, symbol, type')
    .eq('is_active', true)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('symbol', { ascending: true });
  if (error) {
    throw error;
  }
  return data ?? [];
}

/** Query the active-instrument catalog for the Explore list. */
export function useInstruments() {
  return useQuery({
    queryKey: INSTRUMENTS_QUERY_KEY,
    queryFn: fetchInstruments,
  });
}
