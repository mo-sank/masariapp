/**
 * Daily portfolio-equity history for the Portfolio tab chart (design §4).
 *
 * Reads the caller's `portfolio_snapshots` rows (one row per account per ET
 * calendar day, in integer cents) for a given range and returns them
 * oldest-first so a line chart can plot them left to right. The plotted series
 * is `equity_cents`; `cash_cents` / `positions_value_cents` ride along for any
 * future breakdown.
 *
 * `portfolio_snapshots` is scoped to the caller by the `"own snapshots"` RLS
 * policy, so NO user id is passed from the client. Snapshots change at most once
 * per day (the nightly cron, plus the one-shot backfill), so — like
 * `use-bars.ts` — this query does NOT poll on an interval.
 *
 * The range is turned into a `snap_date >= cutoff` filter computed from today;
 * `'ALL'` applies no filter. The cutoff is a coarse UTC-derived lower bound that
 * mirrors `use-bars.ts`; the one-day edge drift at the ET boundary is accepted
 * (design §4 "ET-vs-UTC"). The newest point (the equity the header reports) is
 * always inside every window because it is bounded by yesterday ET.
 */
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';

/** The chart ranges offered on the Portfolio tab (design §4). */
export type ChartRange = '1M' | '3M' | '1Y' | '5Y' | 'ALL';

/**
 * Approximate day span for each non-`ALL` range, used to compute the date
 * cutoff. `5Y = 1827 ≈ 5 × 365.25` is copied verbatim from `use-bars.ts`.
 */
const RANGE_DAYS: Record<Exclude<ChartRange, 'ALL'>, number> = {
  '1M': 31,
  '3M': 93,
  '1Y': 366,
  '5Y': 1827,
};

/** One day of reconstructed/snapshotted portfolio value, all integer cents. */
export interface PortfolioHistoryPoint {
  /** ET calendar day, `YYYY-MM-DD` (ascending across the series). */
  snapDate: string;
  /** Total equity in cents (cash + positions value) — the value we plot. */
  equityCents: number;
  /** Cash in cents on that day. */
  cashCents: number;
  /** Positions value in cents on that day. */
  positionsValueCents: number;
}

/** React Query key for the caller's portfolio history at a given range. */
export function portfolioHistoryQueryKey(range: ChartRange) {
  return ['portfolio-history', range] as const;
}

/**
 * Compute the inclusive `snap_date` cutoff (YYYY-MM-DD) for a range, counting
 * back from `now`. Returns `null` for `'ALL'` (no filter). Exposed with an
 * injectable clock so the slicing logic is unit-testable without the real date.
 */
export function rangeCutoffDate(range: ChartRange, now: Date = new Date()): string | null {
  if (range === 'ALL') {
    return null;
  }
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - RANGE_DAYS[range]);
  return cutoff.toISOString().slice(0, 10);
}

/**
 * Fetch the caller's daily snapshots within the range, oldest first, mapped to
 * camelCase points so the component and geometry stay free of generated-type
 * field names. RLS scopes the rows to the caller; no user id is passed. Throws
 * on a Supabase error.
 */
export async function fetchPortfolioHistory(
  range: ChartRange,
): Promise<PortfolioHistoryPoint[]> {
  const cutoff = rangeCutoffDate(range);
  let query = supabase
    .from('portfolio_snapshots')
    .select('snap_date, equity_cents, cash_cents, positions_value_cents')
    .order('snap_date', { ascending: true });
  if (cutoff) {
    query = query.gte('snap_date', cutoff);
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return (data ?? []).map((r) => ({
    snapDate: r.snap_date,
    equityCents: r.equity_cents,
    cashCents: r.cash_cents,
    positionsValueCents: r.positions_value_cents,
  }));
}

/**
 * Query the caller's portfolio history for a range. Pass `enabled = false` to
 * hold the query. No `refetchInterval` — snapshots change at most once per day.
 */
export function usePortfolioHistory(range: ChartRange, enabled = true) {
  return useQuery({
    queryKey: portfolioHistoryQueryKey(range),
    queryFn: () => fetchPortfolioHistory(range),
    enabled,
  });
}
