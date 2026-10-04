/**
 * Tests for the seeded PRNG (requirement 8.5).
 *
 * The whole point of the module is determinism: a given seed must always
 * produce the same stream, so a lab's behaviour is testable and repeatable. The
 * tests therefore focus on (a) same seed -> identical sequence, (b) different
 * seeds -> different sequences, (c) the output stays in range, and (d) the
 * helpers (`randomInt`, `shuffle`) are themselves deterministic and well-bounded.
 */

import { mulberry32, randomInt, shuffle } from './rng';

/** Draw `n` values from a fresh generator seeded with `seed`. */
function draw(seed: number, n: number): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => rng());
}

describe('mulberry32 (requirement 8.5)', () => {
  it('produces an identical sequence for the same seed', () => {
    expect(draw(42, 10)).toEqual(draw(42, 10));
  });

  it('produces different sequences for different seeds', () => {
    expect(draw(1, 10)).not.toEqual(draw(2, 10));
  });

  it('keeps every value in the half-open interval [0, 1)', () => {
    const rng = mulberry32(123456);
    for (let i = 0; i < 10000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('folds equal 32-bit seeds to the same stream and differs otherwise', () => {
    // 0 and 2^32 fold to the same unsigned 32-bit value.
    expect(draw(0, 5)).toEqual(draw(2 ** 32, 5));
    // Truncates the fractional part, so 1 and 1.9 share a seed.
    expect(draw(1, 5)).toEqual(draw(1.9, 5));
    // Distinct integers give distinct streams.
    expect(draw(7, 5)).not.toEqual(draw(8, 5));
  });

  it('is a fresh independent generator each call (no shared state)', () => {
    const a = mulberry32(99);
    const b = mulberry32(99);
    // Advancing `a` must not affect `b`.
    a();
    a();
    expect(b()).toEqual(mulberry32(99)());
  });

  // Property-style: across many seeds, the stream is reproducible and in-range.
  it('is reproducible and in-range across many seeds', () => {
    for (let seed = 0; seed < 500; seed++) {
      const first = draw(seed, 8);
      const second = draw(seed, 8);
      expect(second).toEqual(first);
      for (const v of first) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });
});

describe('randomInt', () => {
  it('returns integers within the inclusive bounds', () => {
    const rng = mulberry32(2024);
    for (let i = 0; i < 10000; i++) {
      const v = randomInt(rng, 3, 7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it('can reach both endpoints of the range', () => {
    const rng = mulberry32(5);
    const seen = new Set<number>();
    for (let i = 0; i < 10000; i++) seen.add(randomInt(rng, 0, 4));
    expect(seen).toEqual(new Set([0, 1, 2, 3, 4]));
  });

  it('returns the single value when min equals max', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 100; i++) expect(randomInt(rng, 4, 4)).toBe(4);
  });

  it('swaps reversed bounds instead of throwing', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const v = randomInt(rng, 7, 3);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = mulberry32(55);
    const b = mulberry32(55);
    const seqA = Array.from({ length: 20 }, () => randomInt(a, 0, 100));
    const seqB = Array.from({ length: 20 }, () => randomInt(b, 0, 100));
    expect(seqA).toEqual(seqB);
  });
});

describe('shuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const input = [1, 2, 3, 4, 5];
    const rng = mulberry32(10);
    const out = shuffle(rng, input);
    expect(input).toEqual([1, 2, 3, 4, 5]); // unchanged
    expect([...out].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5]); // same multiset
  });

  it('is deterministic for a given seed', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(shuffle(mulberry32(321), items)).toEqual(shuffle(mulberry32(321), items));
  });

  it('handles empty and single-element arrays', () => {
    const rng = mulberry32(1);
    expect(shuffle(rng, [])).toEqual([]);
    expect(shuffle(rng, [42])).toEqual([42]);
  });

  // Property-style: a permutation preserves the multiset for any seed.
  it('preserves the multiset across many seeds', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const sorted = [...items].sort((a, b) => a - b);
    for (let seed = 0; seed < 300; seed++) {
      const out = shuffle(mulberry32(seed), items);
      expect([...out].sort((a, b) => a - b)).toEqual(sorted);
    }
  });
});
