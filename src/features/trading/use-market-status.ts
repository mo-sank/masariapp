/**
 * Market open/closed status for the price-screen banner (requirement 11.1).
 *
 * The banner must say Open, Closed (after hours), or Closed (holiday) using the
 * server's `market_is_open` RPC and the `market_holidays` table. The server is
 * authoritative on hours — it evaluates New-York time and the holiday calendar —
 * so the client asks it rather than computing hours locally. We also read
 * today's holiday row (when any) so a closed market can be labelled as a holiday
 * versus a normal after-hours/weekend close.
 *
 * `market_is_open` and `market_holidays` are not user-scoped, so no user id is
 * passed from the client. The status is time-sensitive, so this query refetches
 * on the same ~60 s cadence as the price screens.
 */
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';

/** The three banner states (requirement 11.1). */
export type MarketStatus = 'open' | 'closed_after_hours' | 'closed_holiday';

/** Result of {@link fetchMarketStatus}: the status plus today's holiday name. */
export interface MarketStatusResult {
  status: MarketStatus;
  /** True when the ET market is currently in regular (or early-close) hours. */
  isOpen: boolean;
  /** Name of today's holiday when the market is closed for one, else null. */
  holidayName: string | null;
}

/** How often the banner refreshes its status (matches price screens, ~60 s). */
export const MARKET_STATUS_REFETCH_INTERVAL_MS = 60_000;

/** React Query key for the market-status banner. */
export const MARKET_STATUS_QUERY_KEY = ['market-status'] as const;

/** Today's date in US/Eastern as YYYY-MM-DD (the market's trading day). */
function easternToday(): string {
  // en-CA formats as YYYY-MM-DD; the timeZone option does the ET conversion.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Ask the server whether the market is open and, if not, whether today is a
 * full-day holiday. A holiday with `is_early_close` is a trading day, so it is
 * NOT reported as a holiday close — the hours check already accounts for its
 * earlier close. Throws on a Supabase error.
 */
export async function fetchMarketStatus(): Promise<MarketStatusResult> {
  const { data: isOpen, error: openError } = await supabase.rpc('market_is_open');
  if (openError) {
    throw openError;
  }

  if (isOpen) {
    return { status: 'open', isOpen: true, holidayName: null };
  }

  // Closed: distinguish a full-day holiday from a normal after-hours/weekend
  // close so the banner can name the holiday.
  const { data: holiday, error: holidayError } = await supabase
    .from('market_holidays')
    .select('name, is_early_close')
    .eq('holiday_date', easternToday())
    .maybeSingle();
  if (holidayError) {
    throw holidayError;
  }

  if (holiday && !holiday.is_early_close) {
    return { status: 'closed_holiday', isOpen: false, holidayName: holiday.name };
  }
  return { status: 'closed_after_hours', isOpen: false, holidayName: null };
}

/** Query the market-status banner, refetching on the price-screen interval. */
export function useMarketStatus() {
  return useQuery({
    queryKey: MARKET_STATUS_QUERY_KEY,
    queryFn: fetchMarketStatus,
    refetchInterval: MARKET_STATUS_REFETCH_INTERVAL_MS,
  });
}
