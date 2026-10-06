/**
 * Feature keys: the single source of truth for every gated feature
 * (requirements 1.3, 1.5).
 *
 * Unlocks are data, not code branches (design "Overview"): lesson content
 * declares which feature keys it unlocks (`content/lessons/*.json` -> `unlocks`),
 * `scripts/sync-catalog.ts` writes those into `feature_unlock_rules`, and
 * `complete_lesson` grants matching `user_unlocks` rows. The client reads
 * `user_unlocks` through `useUnlock(featureKey)` and gates the UI. For that to
 * work, the string a screen checks (`useUnlock('portfolio')`) must be *exactly*
 * the string the content author wrote and the server stored — one typo and the
 * feature silently never unlocks.
 *
 * This module is where those strings are defined once (requirement 1.3). Every
 * key here is the literal `feature_key` used by:
 *   - the lesson content `unlocks` arrays (`content/lessons/*.json`),
 *   - the generated seed (`supabase/seed/catalog.generated.sql` ->
 *     `feature_unlock_rules`), and
 *   - the server unlock checks (`place_market_order`, `watchlist_add`,
 *     `submit_reflection`, `get_daily_briefing`) which re-enforce the same gate
 *     (requirement 1.4).
 *
 * The accompanying `feature-keys.test.ts` asserts this set equals the keys found
 * in the content files, so the two can never drift apart (design "Components":
 * "a unit test asserting the keys equal those in content files").
 *
 * This module is pure data — no Expo, React Native, or network imports — so it
 * runs identically in the app, in Jest, and in Node scripts.
 */

import { listLessons } from '../lessons/content';

/**
 * Every gated feature key, mapped to the id of the lesson that unlocks it and a
 * short human description used by the `LockedState`/celebration copy.
 *
 * The keys and their unlocking lesson match `trading-and-data-rules.md`
 * ("Feature keys and the lesson that unlocks each") and, authoritatively, the
 * `unlocks` arrays in `content/lessons/*.json` — the drift test keeps them in
 * sync. `label` is the short feature name shown to the learner; `lessonId` is
 * the lesson whose completion grants the key (used to deep-link "Start lesson").
 */
export const FEATURE_KEYS = {
  paper_account: { lessonId: 'L0', label: 'Paper trading account' },
  explore: { lessonId: 'L1.1', label: 'Explore' },
  watchlist: { lessonId: 'L1.2', label: 'Watchlist' },
  price_tickers: { lessonId: 'L1.2', label: 'Price tickers' },
  stock_detail: { lessonId: 'L1.3', label: 'Stock detail' },
  market_buy: { lessonId: 'L1.4', label: 'Buy orders' },
  portfolio: { lessonId: 'L1.4', label: 'Portfolio' },
  pre_trade_rationale: { lessonId: 'L1.4', label: 'Trade rationale' },
  market_sell: { lessonId: 'L1.5', label: 'Sell orders' },
  pnl_display: { lessonId: 'L1.5', label: 'Profit & loss' },
  trade_history: { lessonId: 'L1.5', label: 'Trade history' },
  post_trade_reflection: { lessonId: 'L1.5', label: 'Trade reflection' },
  daily_briefing: { lessonId: 'B1', label: 'Daily Market Briefing' },
  rank_rookie: { lessonId: 'B1', label: 'Rookie rank' },
  chart_time_ranges: { lessonId: 'L2.1', label: 'Chart time ranges' },
  trade_markers: { lessonId: 'L2.1', label: 'Trade markers' },
} as const;

/** A valid feature key — the strings `useUnlock`/`Gate` and the server accept. */
export type FeatureKey = keyof typeof FEATURE_KEYS;

/** Metadata for a single feature key. */
export interface FeatureKeyInfo {
  /** The lesson that grants this feature on first completion. */
  lessonId: string;
  /** Short, learner-facing feature name. */
  label: string;
}

/** Every feature key as a readonly array (stable, declaration order). */
export const ALL_FEATURE_KEYS = Object.keys(FEATURE_KEYS) as FeatureKey[];

/** Type guard: is `key` a known feature key? Narrows `string` to `FeatureKey`. */
export function isFeatureKey(key: string): key is FeatureKey {
  return Object.prototype.hasOwnProperty.call(FEATURE_KEYS, key);
}

/** The metadata for a feature key. */
export function featureKeyInfo(key: FeatureKey): FeatureKeyInfo {
  return FEATURE_KEYS[key];
}

/**
 * Collect the distinct feature keys declared across all bundled lessons'
 * `unlocks` arrays. This is what the drift test compares against `FEATURE_KEYS`,
 * and it reads from the same catalog the app ships, so the two cannot diverge
 * without the test failing.
 */
export function featureKeysFromContent(): Set<string> {
  const keys = new Set<string>();
  for (const lesson of listLessons()) {
    for (const key of lesson.unlocks) {
      keys.add(key);
    }
  }
  return keys;
}
