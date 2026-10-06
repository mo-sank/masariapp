/**
 * Feature-key -> route mapping for the "go to feature" button (requirement 5.4).
 *
 * A lesson's unlocks are feature *keys* (e.g. `explore`). When the results screen
 * shows a newly unlocked feature it offers a button that routes the learner
 * straight there (requirement 5.4). This map is the single place that
 * translation from key to a navigable route lives, so the results screen stays
 * presentational and the mapping is unit-testable.
 *
 * Keys that are not mapped (a newly authored unlock that has no destination yet)
 * resolve to `null`; the results screen then shows the unlock without a
 * navigation button rather than routing somewhere wrong.
 *
 * Pure data — no React, Expo, or network — so it is usable from components and
 * tests alike. The route strings match the expo-router paths under `app/`.
 */

/**
 * Known feature keys mapped to the route the "go to feature" button opens.
 *
 * Only features reachable by a single, parameter-free route are listed. Keys for
 * per-symbol features are intentionally omitted because they have no sensible
 * landing target from a lesson result (routing there would need a symbol the
 * result does not carry), so they fall back to "no button" rather than routing
 * to an incomplete path:
 *   - `stock_detail`, `market_buy`, `market_sell` -> `app/stock/[symbol].tsx` /
 *     `app/trade/[symbol].tsx` (per-symbol; no landing target).
 *   - `chart_time_ranges`, `trade_markers` -> live inside the per-symbol stock
 *     detail chart, not a standalone screen.
 *
 * `watchlist` and `price_tickers` route to Explore, where the watchlist toggle
 * and price tickers live (there is no standalone watchlist screen).
 */
const FEATURE_ROUTES: Record<string, string> = {
  explore: '/(tabs)/explore',
  watchlist: '/(tabs)/explore',
  price_tickers: '/(tabs)/explore',
  portfolio: '/(tabs)/portfolio',
  trade_history: '/history',
  daily_briefing: '/(tabs)/learn',
  learn: '/(tabs)/learn',
};

/**
 * The expo-router route for a feature key, or `null` when the key has no known
 * destination (so the caller can omit the navigation button).
 */
export function featureRoute(key: string): string | null {
  return FEATURE_ROUTES[key] ?? null;
}
