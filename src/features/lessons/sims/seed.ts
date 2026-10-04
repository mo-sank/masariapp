/**
 * Deterministic seed derivation for the hands-on labs (requirement 8.5).
 *
 * Requirement 8.5 says all randomness in a lab MUST be seeded so the lab's
 * behaviour is identical across runs with the same seed. The player therefore
 * needs a *stable* seed per sim step: the same step must always get the same
 * seed, on any device and in any test run, so that a learner who replays a
 * lesson — and the test suite — see an identical simulation.
 *
 * The seed is derived from the step id (a stable authored string like `s3`)
 * rather than from a clock or `Math.random`, which would make the run
 * irreproducible. This module turns that id into a 32-bit integer suitable for
 * {@link mulberry32}; `SimStep` calls it and hands the result to each lab.
 *
 * Pure module: no Expo, React Native, or network imports, so it behaves
 * identically in the app and under Jest.
 */

/**
 * Hash a string into a 32-bit unsigned integer with the FNV-1a algorithm.
 *
 * FNV-1a is tiny, dependency-free, and well-distributed for short strings, so
 * two different step ids almost always map to different seeds while the same id
 * always maps to the same seed. The result is a seed for {@link mulberry32},
 * not a security primitive.
 *
 * @param input - The string to hash (e.g. a step id).
 * @returns A 32-bit unsigned integer in the range [0, 2^32).
 */
export function seedFromString(input: string): number {
  // FNV-1a 32-bit: offset basis, then for each byte XOR and multiply by the
  // FNV prime, keeping the running value a 32-bit unsigned integer throughout.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // `Math.imul` does the 32-bit multiply; `>>> 0` folds back to unsigned.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
