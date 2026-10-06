/**
 * Short, learner-facing descriptions of what each unlockable feature does
 * (requirement 2.1).
 *
 * The unlock celebration shows "an unlock animation per feature with a short
 * description of what it does" (requirement 2.1). `feature-keys.ts` already
 * carries each key's short `label` (e.g. "Explore") and the lesson that unlocks
 * it, but it deliberately stays a minimal, pure-data source of truth that the
 * drift test pins to the content files. The celebration copy — one plain
 * sentence saying what the learner can now *do* — lives here instead, so adding
 * or wording a description never risks breaking the key-drift test.
 *
 * Keys that have no entry fall back to a sensible generic sentence built from
 * the key's label, so a newly authored unlock still reads as a real feature
 * rather than showing nothing.
 *
 * Pure data — no React, Expo, or network — so it is usable from components and
 * tests alike.
 */
import { FEATURE_KEYS, type FeatureKey } from './feature-keys';

/**
 * Each feature key mapped to a one-line description of what it unlocks. Written
 * for a teen beta audience: concrete and about what they can now do, not jargon.
 */
const FEATURE_DESCRIPTIONS: Partial<Record<FeatureKey, string>> = {
  paper_account: 'Practice investing with virtual cash — no real money at risk.',
  explore: 'Browse starter stocks and see how they move.',
  watchlist: 'Save stocks you want to keep an eye on.',
  price_tickers: 'See live-style prices update across the app.',
  stock_detail: 'Open any stock to see its price, change, and details.',
  market_buy: 'Place practice buy orders at the current price.',
  portfolio: 'Track what you own and how it is doing.',
  pre_trade_rationale: 'Jot down why you are making a trade before you place it.',
  market_sell: 'Sell your practice positions and lock in the result.',
  pnl_display: 'See your profit and loss on every position.',
  trade_history: 'Review every trade you have made.',
  post_trade_reflection: 'Reflect on how a trade went after you sell.',
  daily_briefing: 'Get a quick daily recap of the market and your portfolio.',
  rank_rookie: 'You reached the Rookie rank — your first milestone.',
  chart_time_ranges: 'Switch a stock chart between time ranges.',
  trade_markers: 'See your buys and sells marked right on the chart.',
};

/**
 * The learner-facing description for a feature key — one sentence saying what it
 * does — or a generic fallback built from the key's label when none is defined.
 */
export function featureDescription(key: FeatureKey): string {
  return FEATURE_DESCRIPTIONS[key] ?? `You unlocked ${FEATURE_KEYS[key].label}.`;
}
