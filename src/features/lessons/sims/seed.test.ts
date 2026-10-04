/**
 * Tests for the deterministic seed derivation (requirement 8.5).
 *
 * The seed must be a stable function of the step id: the same id always yields
 * the same seed (so a lab replays identically) and different ids almost always
 * yield different seeds (so sibling sim steps in one lesson do not share a run).
 */

import { seedFromString } from './seed';

describe('seedFromString (requirement 8.5)', () => {
  it('is deterministic — the same string always yields the same seed', () => {
    expect(seedFromString('s3')).toBe(seedFromString('s3'));
    expect(seedFromString('L1.1:sim')).toBe(seedFromString('L1.1:sim'));
  });

  it('maps different strings to different seeds', () => {
    expect(seedFromString('s3')).not.toBe(seedFromString('s4'));
    expect(seedFromString('a')).not.toBe(seedFromString('b'));
  });

  it('returns a 32-bit unsigned integer', () => {
    for (const input of ['', 's1', 'a very long step identifier here', '🙂']) {
      const seed = seedFromString(input);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 32);
    }
  });

  it('handles the empty string without throwing', () => {
    expect(() => seedFromString('')).not.toThrow();
    expect(seedFromString('')).toBe(seedFromString(''));
  });
});
