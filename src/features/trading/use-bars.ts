/**
 * Daily price-history bars for the stock-detail chart (requirement 3.3).
 *
 * Reads the `quote_bars` table (one daily OHLC row per symbol, in integer
 * cents) for a given symbol and range. The MVP supports four fixed ranges —
 * 1M, 3M, 1Y, 5Y — and no intraday data (requirement 3.3). The range is turned
 * into a `bar_date >= cutoff` filter computed from today; bars are returned
 * oldest-first so a line chart can plot them left to right.
 *
 * `quote_bars` is a shared catalog readable by any signed-in user, so no user id
 * is passed from the client. Unlike quotes, bars change at most once per day
 * (the nightly append job), so this query does NOT poll on an interval.
 */
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';
import type { Database } from '../../types/db';

type BarRow = Database['public']['Tables']['quote_bars']['Row'];

/** The chart ranges offered in the MVP (requirement 3.3). */
export type ChartRange = '1M' | '3M' | '1Y' | '5Y';

/** Approximate day span for each range, used to compute the date cutoff. */
const RANGE_DAYS: Record<ChartRange, number> = {
  '1M': 31,
  '3M': 93,
  '1Y': 366,
  '5Y': 1827,
};

/** React Query key for a symbol's bars at a given range. */
export function barsQueryKey(symbol: string, range: ChartRange) {
  return ['bars', symbol, range] as const;
}

/**
 * Compute the inclusive `bar_date` cutoff (YYYY-MM-DD) for a range, counting
 * back from `now`. Exposed with an injectable clock so the slicing logic is
 * unit-testable without the real date.
 */
export function rangeCutoffDate(range: ChartRange, now: Date = new Date()): string {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - RANGE_DAYS[range]);
  return cutoff.toISOString().slice(0, 10);
}

/**
 * Fetch a symbol's daily bars within the range, oldest first. Throws on a
 * Supabase error.
 */
export async function fetchBars(symbol: string, range: ChartRange): Promise<BarRow[]> {
  const { data, error } = await supabase
    .from('quote_bars')
    .select('symbol, bar_date, open_cents, high_cents, low_cents, close_cents, volume')
    .eq('symbol', symbol)
    .gte('bar_date', rangeCutoffDate(range))
    .order('bar_date', { ascending: true });
  if (error) {
    throw error;
  }
  return data ?? [];
}

/**
 * Query a symbol's price history for a range. Pass `enabled = false` to hold
 * the query while the symbol is not yet known.
 */
export function useBars(symbol: string, range: ChartRange, enabled = true) {
  return useQuery({
    queryKey: barsQueryKey(symbol, range),
    queryFn: () => fetchBars(symbol, range),
    enabled: enabled && symbol.length > 0,
  });
}
