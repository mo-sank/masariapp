/**
 * Fun, anonymous username generator (requirements 5.2, 5.3).
 *
 * Onboarding offers a generated `adjective-animal-number` username and a
 * "shuffle" button, with NO free-text entry (requirement 5.2). This keeps
 * usernames playful and non-identifying — teens never type their own name — and
 * guarantees the value matches the shape the database enforces.
 *
 * Output format: `^[a-z]{3,12}-[a-z]{3,12}-[0-9]{2,4}$`, i.e.
 *   <adjective>-<animal>-<number>
 * matching the CHECK constraint on `profiles.username` and the validation inside
 * the `create_profile` RPC (docs/db-and-api-reference.md sections 3.2 and 5.1).
 * Every word in the lists below is lowercase a-z only and 3-12 letters long, so
 * any adjective + animal combination is a valid pair of segments.
 *
 * Word lists were reviewed for appropriateness for a teen audience: common,
 * friendly, neutral words only — no slurs, no violence, nothing that reads as
 * demeaning when paired with an animal. Keep that bar when editing the lists.
 *
 * Everything here is pure: randomness is injected via an `rng` function (default
 * `Math.random`) so tests are deterministic and the generator has no device or
 * platform dependency.
 */

/** Regex the database enforces on `profiles.username`. Exported for tests/UI. */
export const USERNAME_PATTERN = /^[a-z]{3,12}-[a-z]{3,12}-[0-9]{2,4}$/;

/**
 * Friendly adjectives (lowercase a-z, 3-12 letters). Reviewed for a teen
 * audience: positive or neutral, never demeaning.
 */
export const ADJECTIVES: readonly string[] = [
  'brave',
  'bright',
  'calm',
  'clever',
  'cosmic',
  'curious',
  'daring',
  'eager',
  'gentle',
  'happy',
  'jolly',
  'keen',
  'lively',
  'lucky',
  'mellow',
  'merry',
  'mighty',
  'nimble',
  'noble',
  'quick',
  'quiet',
  'shiny',
  'sunny',
  'swift',
  'witty',
  'zesty',
] as const;

/**
 * Friendly animals (lowercase a-z, 3-12 letters). Reviewed for a teen audience:
 * recognizable, non-threatening creatures.
 */
export const ANIMALS: readonly string[] = [
  'otter',
  'fox',
  'owl',
  'panda',
  'koala',
  'lynx',
  'heron',
  'robin',
  'finch',
  'bison',
  'moose',
  'badger',
  'beaver',
  'ferret',
  'gecko',
  'hare',
  'ibis',
  'lemur',
  'mole',
  'newt',
  'quokka',
  'raven',
  'seal',
  'turtle',
  'walrus',
  'wombat',
] as const;

/** A source of randomness in [0, 1). Injected so tests stay deterministic. */
export type Rng = () => number;

/** Pick a uniformly random element from a non-empty list using `rng`. */
function pick<T>(list: readonly T[], rng: Rng): T {
  // Clamp the index into range even if a (mis-behaving) rng returns exactly 1.
  const index = Math.min(list.length - 1, Math.floor(rng() * list.length));
  return list[index];
}

/**
 * Generate the trailing number segment: 2 to 4 digits with no leading zero, so
 * it always lands in `[0-9]{2,4}` and reads naturally (10-9999).
 */
export function generateNumber(rng: Rng = Math.random): string {
  // 10..9999 inclusive -> always 2 to 4 digits, never a leading zero.
  const n = 10 + Math.floor(rng() * (9999 - 10 + 1));
  return String(n);
}

/**
 * Generate a username of the form `adjective-animal-number`.
 *
 * The result always satisfies {@link USERNAME_PATTERN} because every word is
 * lowercase a-z and 3-12 letters and the number is 2-4 digits.
 *
 * @param rng Randomness source in [0, 1); defaults to `Math.random`. Pass a
 *            seeded function in tests for deterministic output.
 */
export function generateUsername(rng: Rng = Math.random): string {
  const adjective = pick(ADJECTIVES, rng);
  const animal = pick(ANIMALS, rng);
  const number = generateNumber(rng);
  return `${adjective}-${animal}-${number}`;
}
