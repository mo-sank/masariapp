import {
  ADJECTIVES,
  ANIMALS,
  generateNumber,
  generateUsername,
  USERNAME_PATTERN,
  type Rng,
} from './username';

/**
 * Build a deterministic rng that returns the given values in order, then
 * repeats the last one. Lets tests pin exactly which adjective/animal/number
 * `generateUsername` picks.
 */
function sequenceRng(values: number[]): Rng {
  let i = 0;
  return () => {
    const v = values[Math.min(i, values.length - 1)];
    i += 1;
    return v;
  };
}

describe('word lists', () => {
  it('contain only lowercase a-z words of 3-12 letters (valid username segments)', () => {
    for (const word of [...ADJECTIVES, ...ANIMALS]) {
      expect(word).toMatch(/^[a-z]{3,12}$/);
    }
  });

  it('have no duplicate entries', () => {
    expect(new Set(ADJECTIVES).size).toBe(ADJECTIVES.length);
    expect(new Set(ANIMALS).size).toBe(ANIMALS.length);
  });
});

describe('generateNumber', () => {
  it('produces 2-4 digits with no leading zero', () => {
    // Smallest (rng -> 0) is 10; largest (rng -> ~1) is 9999.
    expect(generateNumber(() => 0)).toBe('10');
    expect(generateNumber(() => 0.9999999)).toBe('9999');
  });

  it('always matches [0-9]{2,4} across many seeds', () => {
    for (let i = 0; i < 1000; i++) {
      expect(generateNumber(Math.random)).toMatch(/^[0-9]{2,4}$/);
    }
  });
});

describe('generateUsername', () => {
  it('composes adjective-animal-number from the chosen indices', () => {
    // First rng call picks the adjective, second the animal, third the number.
    const rng = sequenceRng([0, 0, 0]);
    expect(generateUsername(rng)).toBe(`${ADJECTIVES[0]}-${ANIMALS[0]}-10`);
  });

  it('selects the last list entry when rng returns ~1 (index is clamped)', () => {
    const rng = sequenceRng([0.9999999, 0.9999999, 0.9999999]);
    const last = `${ADJECTIVES[ADJECTIVES.length - 1]}-${ANIMALS[ANIMALS.length - 1]}-9999`;
    expect(generateUsername(rng)).toBe(last);
  });

  it('always matches the database username pattern across many random draws', () => {
    // Property: for any rng output, the result satisfies USERNAME_PATTERN (the
    // same shape the profiles CHECK and create_profile RPC enforce).
    for (let i = 0; i < 2000; i++) {
      expect(generateUsername(Math.random)).toMatch(USERNAME_PATTERN);
    }
  });

  it('exercises every adjective and animal index without producing invalid output', () => {
    // Walk the full index space of both lists to be sure no entry breaks the
    // format (e.g. an accidentally too-long or non-letter word).
    for (let a = 0; a < ADJECTIVES.length; a++) {
      for (let b = 0; b < ANIMALS.length; b++) {
        const rng = sequenceRng([a / ADJECTIVES.length, b / ANIMALS.length, 0.5]);
        expect(generateUsername(rng)).toMatch(USERNAME_PATTERN);
      }
    }
  });
});
