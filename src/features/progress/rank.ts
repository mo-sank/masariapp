/**
 * Rank derivation (requirement 3.2).
 *
 * A learner's rank is derived purely from which *boss* lessons they have
 * completed — not stored, not awarded by a server call. The design ("Rank
 * mapping (MVP)") pins the only live rank for now:
 *
 *   rank = 'Rookie' once boss B1 is completed, else 'Newcomer'.
 *
 * Later ranks are reserved against the remaining unit bosses (B2 Chart Reader,
 * B3 Risk Wrangler, B4 Order Pilot, B5 Market Thinker, and the C Masari Pro
 * capstone). They are declared here so the ladder is defined in one place and so
 * `useRank` has a stable mapping to grow into, but they are unreachable until
 * those bosses ship — deriving a reserved rank today would require a boss id the
 * catalog does not yet contain.
 *
 * This module is pure data — no Expo, React Native, or network imports — so it
 * runs identically in the app, in Jest, and in Node scripts, and the rule stays
 * unit-testable without React (design "Testing strategy": rank mapping unit).
 */

/** Every rank name, lowest to highest. `Newcomer` is the pre-B1 starting rank. */
export const RANKS = [
  'Newcomer',
  'Rookie',
  'Chart Reader',
  'Risk Wrangler',
  'Order Pilot',
  'Market Thinker',
  'Masari Pro',
] as const;

/** A learner-facing rank name. */
export type Rank = (typeof RANKS)[number];

/** The rank shown before any boss is beaten. */
export const DEFAULT_RANK: Rank = 'Newcomer';

/**
 * The boss lesson that promotes a learner into each rank, highest first.
 *
 * Only `B1 -> Rookie` is reachable in the MVP; the rest are reserved against
 * bosses that do not exist in the catalog yet (so they can never match a
 * completed-id today). Ordered highest-to-lowest so {@link rankForCompletedBosses}
 * can return the first rank whose boss the learner has cleared.
 */
export const RANK_LADDER: readonly { bossId: string; rank: Rank }[] = [
  { bossId: 'C', rank: 'Masari Pro' },
  { bossId: 'B5', rank: 'Market Thinker' },
  { bossId: 'B4', rank: 'Order Pilot' },
  { bossId: 'B3', rank: 'Risk Wrangler' },
  { bossId: 'B2', rank: 'Chart Reader' },
  { bossId: 'B1', rank: 'Rookie' },
];

/**
 * Derive the learner's rank from the set of boss lesson ids they have completed.
 *
 * Returns the highest rank whose unlocking boss is present in `completedBossIds`,
 * or {@link DEFAULT_RANK} ('Newcomer') when no boss has been cleared. Only the
 * ids of *completed boss* lessons should be passed; non-boss completions never
 * change the rank (requirement 3.2).
 */
export function rankForCompletedBosses(completedBossIds: ReadonlySet<string>): Rank {
  for (const { bossId, rank } of RANK_LADDER) {
    if (completedBossIds.has(bossId)) {
      return rank;
    }
  }
  return DEFAULT_RANK;
}
