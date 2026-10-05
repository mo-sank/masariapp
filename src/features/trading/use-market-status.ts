/**
 * Market session status for the price-screen banner (requirement 11.1; extended
 * for pre/after-hours quotes).
 *
 * The banner tells the learner where the market is: Open (regular hours),
 * pre-market / after-hours (extended), or Closed (after hours / holiday). The
 * server is authoritative on hours — it evaluates New-York time and the holiday
 * calendar — so the client asks it via the `market_session` RPC rather than
 * computing hours locally. We also read today's holiday row (when any) so a
 * fully-closed market can be labelled as a holiday vs a normal weekend/overnight
 * close.
 *
 * `isOpen` means the REGULAR session only (09:30-16:00 ET, early close 13:00),
 * which is what trading rules key off: a market order placed during extended
 * hours still fills at the last close (place_market_order uses market_is_open),
 * so the order ticket's "fills at last close" wording must stay tied to `isOpen`,
 * not to whether we are merely ingesting extended-hours quotes.
 *
 * The RPCs are not user-scoped, so no user id is passed from the client. The
 * status is time-sensitive, so this query refetches on the ~60 s price cadence.
 */
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';

/** Raw session from public.market_session. */
export type MarketSession = 'regular' | 'extended' | 'closed';

/**
 * Banner states. `open` = regular session; `extended` = pre/after-hours;
 * `closed_after_hours` = normal weekday-night/weekend close; `closed_holiday` =
 * a full-day market holiday.
 */
export type MarketStatus = 'open' | 'extended' | 'closed_after_hours' | 'closed_holiday';

/** Result of {@link fetchMarketStatus}: the status plus today's holiday name. */
export interface MarketStatusResult {
  status: MarketStatus;
  /** The raw server session (regular | extended | closed). */
  session: MarketSession;
  /** True ONLY during the regular session (what trading rules key off). */
  isOpen: boolean;
  /** True during pre-market or after-hours. */
  isExtended: boolean;
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
 * Ask the server for the current session and, when fully closed, whether today
 * is a full-day holiday (so the banner can name it). An early-close day is a
 * trading day, so its shortened session still reports regular/extended and is
 * never labelled a holiday close. Throws on a Supabase error.
 */
export async function fetchMarketStatus(): Promise<MarketStatusResult> {
  const { data: sessionRaw, error: sessionError } = await supabase.rpc('market_session');
  if (sessionError) {
    throw sessionError;
  }
  const session: MarketSession =
    sessionRaw === 'regular' || sessionRaw === 'extended' ? sessionRaw : 'closed';

  if (session === 'regular') {
    return { status: 'open', session, isOpen: true, isExtended: false, holidayName: null };
  }
  if (session === 'extended') {
    return { status: 'extended', session, isOpen: false, isExtended: true, holidayName: null };
  }

  // Fully closed: distinguish a full-day holiday from a normal close so the
  // banner can name the holiday.
  const { data: holiday, error: holidayError } = await supabase
    .from('market_holidays')
    .select('name, is_early_close')
    .eq('holiday_date', easternToday())
    .maybeSingle();
  if (holidayError) {
    throw holidayError;
  }

  if (holiday && !holiday.is_early_close) {
    return {
      status: 'closed_holiday',
      session,
      isOpen: false,
      isExtended: false,
      holidayName: holiday.name,
    };
  }
  return {
    status: 'closed_after_hours',
    session,
    isOpen: false,
    isExtended: false,
    holidayName: null,
  };
}

/** Query the market-status banner, refetching on the price-screen interval. */
export function useMarketStatus() {
  return useQuery({
    queryKey: MARKET_STATUS_QUERY_KEY,
    queryFn: fetchMarketStatus,
    refetchInterval: MARKET_STATUS_REFETCH_INTERVAL_MS,
  });
}
