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
 * Only features reachable by a single, parameter-free route are listed. `trade`
 * is intentionally omitted: it is a per-symbol route (`app/trade/[symbol].tsx`)
 * with no sensible landing target from a lesson result, so it falls back to "no
 * button" rather than routing to an incomplete path.
 */
const FEATURE_ROUTES: Record<string, string> = {
  explore: '/(tabs)/explore',
  portfolio: '/(tabs)/portfolio',
  learn: '/(tabs)/learn',
};

/**
 * The expo-router route for a feature key, or `null` when the key has no known
 * destination (so the caller can omit the navigation button).
 */
export function featureRoute(key: string): string | null {
  return FEATURE_ROUTES[key] ?? null;
}
