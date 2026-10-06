/**
 * Daily Market Briefing data (requirements 4.1-4.4).
 *
 * The briefing comes entirely from the `get_daily_briefing` RPC, which assembles
 * it from stored quotes on the server — no AI text, no recommendations
 * (requirement 4.4). This hook calls that RPC, validates its JSON payload into a
 * typed shape, and leaves all copy and formatting to the briefing screen.
 *
 * The RPC re-enforces the `daily_briefing` unlock server-side (requirement 1.4),
 * so a caller without it gets a `feature_locked` error; the screen is wrapped in
 * a {@link Gate} on the same key, so in practice the query only runs once the
 * feature is unlocked. The payload is a single snapshot (top mover pair,
 * portfolio day change, market state, tip index), so it does not need the ~60 s
 * price-screen refetch loop — it is fetched when the briefing opens and on manual
 * retry.
 *
 * market_state (`regular | extended | closed`) tells the screen when to say the
 * figures are "as of last close" (requirement 4.3). The movers can be null when
 * no starter stock has a usable prior close yet; the screen hides card 1 then.
 */
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';

/** The raw server market session, mirrored from `public.market_session`. */
export type BriefingMarketState = 'regular' | 'extended' | 'closed';

/** One mover (top gainer or top loser) among the starter stocks. */
export interface BriefingMover {
  symbol: string;
  name: string;
  /** Current (or last-close) price in integer cents. */
  priceCents: number;
  /** The prior close in integer cents (the day-change baseline). */
  prevCloseCents: number;
  /** Signed percent change from prev close, in basis points. */
  changeBasisPoints: number;
}

/** The validated briefing payload the screen renders. */
export interface Briefing {
  /** The starter stock up the most today, or null when none is measurable. */
  topGainer: BriefingMover | null;
  /** The starter stock down the most today, or null when none is measurable. */
  topLoser: BriefingMover | null;
  /** The caller's portfolio day change in integer cents (0 when flat/empty). */
  portfolioDayChangeCents: number;
  /** Where the market is now; drives the "as of last close" wording. */
  marketState: BriefingMarketState;
  /** Index into the client's reviewed tip list (see tips.ts). */
  tipIndex: number;
}

/** React Query key for the daily briefing. */
export const BRIEFING_QUERY_KEY = ['briefing'] as const;

/** Read a finite number from an untrusted record field, or `fallback`. */
function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Parse one mover sub-object (or null) from the RPC payload. */
function parseMover(value: unknown): BriefingMover | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const m = value as Record<string, unknown>;
  if (typeof m.symbol !== 'string') {
    return null;
  }
  return {
    symbol: m.symbol,
    name: typeof m.name === 'string' ? m.name : m.symbol,
    priceCents: num(m.price_cents),
    prevCloseCents: num(m.prev_close_cents),
    changeBasisPoints: num(m.change_bps),
  };
}

/** Normalize the server session string to a known state (defaults to closed). */
function parseMarketState(value: unknown): BriefingMarketState {
  return value === 'regular' || value === 'extended' ? value : 'closed';
}

/**
 * Call `get_daily_briefing` and validate its JSON into a {@link Briefing}.
 * Throws the raw Supabase error on failure (including `feature_locked` when the
 * caller lacks the unlock) so the caller can surface a retry.
 */
export async function fetchBriefing(): Promise<Briefing> {
  const { data, error } = await supabase.rpc('get_daily_briefing');
  if (error) {
    throw error;
  }
  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    topGainer: parseMover(payload.top_gainer),
    topLoser: parseMover(payload.top_loser),
    portfolioDayChangeCents: num(payload.portfolio_day_change_cents),
    marketState: parseMarketState(payload.market_state),
    tipIndex: num(payload.tip_index),
  };
}

/**
 * Query the daily briefing. Pass `enabled = isSignedIn` so it does not run while
 * signed out. The Gate on `daily_briefing` keeps it from running (and surfacing
 * `feature_locked`) before the feature is unlocked.
 */
export function useBriefing(enabled = true) {
  return useQuery({
    queryKey: BRIEFING_QUERY_KEY,
    queryFn: fetchBriefing,
    enabled,
  });
}
