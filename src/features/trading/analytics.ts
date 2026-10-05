/**
 * Trading analytics events (requirements 8.4, 9.2).
 *
 * The market-data-paper-trading spec logs a trading lifecycle: when an order is
 * placed, when a post-trade reflection is saved, when the watchlist changes, and
 * when a stock detail screen is viewed. Requirement 9.2 forbids free text in
 * these events, so every helper here accepts ONLY enums, identifiers, booleans,
 * or numbers — never a note, rationale text, or any typed string. The "no free
 * text" rule is therefore enforced by the parameter types.
 *
 * The event NAMES are the four trading entries in the shared allowlist
 * (src/features/progress/analytics-events.ts); `track` drops anything not in
 * that list and the `log_events` RPC enforces the same set server-side (see the
 * log_events migration under supabase/migrations). These helpers are thin
 * wrappers over `track` and inherit its guarantees: calls are fire-and-forget,
 * never throw, and attach the session id and app version.
 *
 * Pure wrappers over `track` — no React, Expo, or network imports here.
 */

import { track } from '../../lib/analytics';
import type { OrderSide } from './use-place-order';
import type { ReflectionExpectation } from './reflection-logic';

/**
 * Order placed (requirement 8.4). Logged once per successfully filled order.
 * Carries the side, symbol, whole-share quantity, and whether a rationale was
 * attached — never the rationale text itself (requirement 9.2).
 */
export function trackTradePlaced(input: {
  side: OrderSide;
  symbol: string;
  qty: number;
  hasRationale: boolean;
}): void {
  track('trade_placed', {
    props: {
      side: input.side,
      symbol: input.symbol,
      qty: input.qty,
      has_rationale: input.hasRationale,
    },
  });
}

/**
 * Reflection submitted (requirement 9.2). Logged when a post-trade reflection
 * is saved. Carries only the expectation enum ('better' | 'as_expected' |
 * 'worse'); the free-text note is deliberately NOT included.
 */
export function trackReflectionSubmitted(expectation: ReflectionExpectation): void {
  track('reflection_submitted', { props: { expectation } });
}

/**
 * Watchlist changed (requirement 9.2). Logged when a symbol is added to or
 * removed from the watchlist. Carries the action and the symbol identifier.
 */
export function trackWatchlistChanged(action: 'add' | 'remove', symbol: string): void {
  track('watchlist_changed', { props: { action, symbol } });
}

/**
 * Stock viewed (requirement 9.2). Logged once when a stock detail screen opens
 * for a symbol. Carries only the symbol identifier.
 */
export function trackStockViewed(symbol: string): void {
  track('stock_viewed', { props: { symbol } });
}
