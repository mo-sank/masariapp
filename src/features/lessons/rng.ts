/**
 * Seeded deterministic random number generator (requirement 8.5).
 *
 * The hands-on labs (ownership_split, auction, pnl_replay, opening_bell) use
 * randomness for bot behaviour, price noise, and event order. Requirement 8.5
 * says that randomness MUST be seeded so a lab's behaviour is testable and
 * repeatable: the same seed always produces the same sequence, on any device
 * and in any test run. This module is that single source of randomness.
 *
 * Design reference: `.kiro/specs/lesson-engine/design.md` ("Sim designs
 * (deterministic, seeded)" and "rng.ts (pure): mulberry32(seed)").
 *
 * `mulberry32` is a small, fast 32-bit PRNG with a full 2^32 period — more than
 * enough for short lab sessions and chosen because it is tiny, dependency-free,
 * and produces an identical stream from a given seed across JS engines (Hermes,
 * JSC, Node). It is NOT cryptographically secure and must never be used for
 * anything security-sensitive; it exists purely to make simulations repeatable.
 *
 * Pure module: no Expo, React Native, or network imports, so it behaves
 * identically in the app and under Jest.
 */

/** A function returning the next pseudo-random float in [0, 1). */
export type Rng = () => number;

/**
 * Create a seeded PRNG. Calling the returned function advances the internal
 * state and yields the next float in the half-open interval [0, 1).
 *
 * The seed is coerced to a 32-bit unsigned integer, so any finite number works;
 * two generators created with the same seed produce the same sequence.
 *
 * @param seed - Any number; fractional and out-of-range values are folded into
 *   a 32-bit unsigned integer, so `mulberry32(1)` and `mulberry32(1.9)` share a
 *   seed but different integers give different streams.
 */
export function mulberry32(seed: number): Rng {
  // Fold the seed into a 32-bit unsigned integer. `>>> 0` both truncates the
  // fractional part and reinterprets the result as unsigned.
  let state = seed >>> 0;
  return function next(): number {
    // mulberry32: advance state by a fixed odd increment, then hash it.
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draw an integer in the inclusive range [min, max] from a generator.
 *
 * Convenience helper for the labs (e.g. picking a bot, choosing a headline).
 * `min` and `max` are rounded down to integers; if `max < min` the bounds are
 * swapped so the call never throws. Uniformity matches the underlying float.
 */
export function randomInt(rng: Rng, min: number, max: number): number {
  let lo = Math.floor(min);
  let hi = Math.floor(max);
  if (hi < lo) {
    [lo, hi] = [hi, lo];
  }
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/**
 * Return a new array with `items` shuffled using the given generator
 * (Fisher-Yates). The input array is not mutated. With the same seed and the
 * same input the output order is identical, so lab setups (e.g. shuffled option
 * order, event order) stay repeatable.
 */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, 0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
