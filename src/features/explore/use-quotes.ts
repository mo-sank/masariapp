/**
 * Current delayed quotes (requirements 4.1, 4.4, 5.1).
 *
 * Reads the `quotes` table — one row per instrument, written by the
 * ingest-quotes edge function in integer cents. Explore and stock-detail
 * screens join these to instruments to show price and day change. Quotes are
 * delayed (~15 min) and labelled as such in the UI (requirement 4.4); the data
 * itself carries `is_delayed` and `as_of` so screens can show freshness.
 *
 * Price screens refetch roughly every minute (design: "refetch every 60 s on
 * price screens"), so `REFETCH_INTERVAL_MS` is exported for screens to pass to
 * `useQuery` where they mount this data. Quotes are a shared catalog readable by
 * any signed-in user, so no user id is passed from the client.
 *
 * `useQuotes()` fetches every quote (handy for the Explore list). `useQuote`
 * selects a single symbol's quote for a detail screen; it returns `null` when no
 * quote row exists yet rather than throwing.
 */
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';
import type { Database } from '../../types/db';

type QuoteRow = Database['public']['Tables']['quotes']['Row'];

/** How often price screens should refetch quotes (design: ~60 s). */
export const QUOTE_REFETCH_INTERVAL_MS = 60_000;

const QUOTE_COLUMNS =
  'symbol, price_cents, prev_close_cents, open_cents, high_cents, low_cents, volume, as_of, is_delayed, source, updated_at';

/** React Query key for the full quote list. */
export const QUOTES_QUERY_KEY = ['quotes'] as const;

/** React Query key for a single symbol's quote. */
export function quoteQueryKey(symbol: string) {
  return ['quotes', symbol] as const;
}

/** Fetch every current quote. Throws on a Supabase error. */
export async function fetchQuotes(): Promise<QuoteRow[]> {
  const { data, error } = await supabase.from('quotes').select(QUOTE_COLUMNS);
  if (error) {
    throw error;
  }
  return data ?? [];
}

/** Fetch a single symbol's quote, or `null` when none exists yet. */
export async function fetchQuote(symbol: string): Promise<QuoteRow | null> {
  const { data, error } = await supabase
    .from('quotes')
    .select(QUOTE_COLUMNS)
    .eq('symbol', symbol)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

/** Query all current quotes, refetching on the price-screen interval. */
export function useQuotes() {
  return useQuery({
    queryKey: QUOTES_QUERY_KEY,
    queryFn: fetchQuotes,
    refetchInterval: QUOTE_REFETCH_INTERVAL_MS,
  });
}

/**
 * Query one symbol's quote. Pass `enabled = false` to hold the query while the
 * symbol is not yet known (e.g. an unresolved route param).
 */
export function useQuote(symbol: string, enabled = true) {
  return useQuery({
    queryKey: quoteQueryKey(symbol),
    queryFn: () => fetchQuote(symbol),
    enabled: enabled && symbol.length > 0,
    refetchInterval: QUOTE_REFETCH_INTERVAL_MS,
  });
}
