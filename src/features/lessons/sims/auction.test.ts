/**
 * Tests for the auction pure logic (requirements 8.2, 8.5).
 *
 * The lab's randomness is the small seeded price noise; everything else is a
 * deterministic function of the price, the headline deltas, and the sensitivity.
 * These tests pin down the price update's direction, the determinism across runs
 * with the same seed (requirement 8.5), the "predictions / rounds" scoring, and
 * the edge cases (zero demand+supply, unknown headline, no rounds).
 */

import {
  applyHeadline,
  deriveCrowdTotals,
  deriveMarketSnapshot,
  parseAuctionParams,
  safeParseAuctionParams,
  isValidAuctionSeed,
  scoreAuction,
  type AuctionMarketSnapshot,
  type AuctionParams,
  type AuctionChoice,
} from './auction';
import { mulberry32, randomInt } from '../rng';
// The authored L1.2 lesson content, imported directly so the regression binds to
// the real shipped file. This import must NOT change L1.2.json — it only reads it.
import l12 from '../../../../content/lessons/L1.2.json';

/**
 * A params set with a clear "bull" and "bear" card. Noise is zero in most tests
 * so the headline alone decides the direction; a separate test turns noise on to
 * check determinism.
 */
function makeParams(overrides: Partial<AuctionParams> = {}): AuctionParams {
  return parseAuctionParams({
    startPriceCents: 10000, // $100
    baseDemand: 50,
    baseSupply: 50,
    sensitivity: 0.2,
    noise: 0,
    rounds: 3,
    headlines: [
      { id: 'bull', text: 'Great earnings', demandDelta: 40, supplyDelta: 0 },
      { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 40 },
    ],
    ...overrides,
  });
}

describe('parseAuctionParams', () => {
  it('defaults noise to a gentle 1% when omitted', () => {
    const parsed = parseAuctionParams({
      startPriceCents: 100,
      baseDemand: 10,
      baseSupply: 10,
      sensitivity: 0.1,
      rounds: 2,
      headlines: [
        { id: 'a', text: 'A', demandDelta: 1, supplyDelta: 0 },
        { id: 'b', text: 'B', demandDelta: 0, supplyDelta: 1 },
      ],
    });
    expect(parsed.noise).toBeCloseTo(0.01);
  });

  it('rejects a single-headline auction', () => {
    expect(() =>
      parseAuctionParams({
        startPriceCents: 100,
        baseDemand: 1,
        baseSupply: 1,
        sensitivity: 0.1,
        rounds: 1,
        headlines: [{ id: 'a', text: 'A', demandDelta: 1, supplyDelta: 0 }],
      }),
    ).toThrow();
  });
});

describe('applyHeadline (requirement 8.2)', () => {
  it('raises the price when demand outstrips supply', () => {
    const params = makeParams();
    const bull = params.headlines[0];
    const round = applyHeadline(10000, bull, params, mulberry32(1));
    // demand 90, supply 50 -> imbalance +0.2857, k 0.2 -> ~+5.7%.
    expect(round.direction).toBe('up');
    expect(round.priceAfterCents).toBeGreaterThan(10000);
  });

  it('lowers the price when supply outstrips demand', () => {
    const params = makeParams();
    const bear = params.headlines[1];
    const round = applyHeadline(10000, bear, params, mulberry32(1));
    expect(round.direction).toBe('down');
    expect(round.priceAfterCents).toBeLessThan(10000);
  });

  it('does not divide by zero when demand and supply are both zero', () => {
    const params = makeParams({ baseDemand: 0, baseSupply: 0, noise: 0 });
    // Both deltas zero -> demand 0, supply 0 -> imbalance term 0, no noise.
    const flat = { id: 'flat', text: 'Nothing', demandDelta: 0, supplyDelta: 0 };
    const round = applyHeadline(10000, flat, { ...params, headlines: [flat, params.headlines[0]] }, mulberry32(1));
    expect(round.priceAfterCents).toBe(10000);
    expect(round.direction).toBe('up'); // ties count as up
  });

  it('keeps the price a positive whole cent', () => {
    const params = makeParams({ sensitivity: 1, baseDemand: 0, baseSupply: 1000 });
    const crash = { id: 'crash', text: 'Crash', demandDelta: 0, supplyDelta: 0 };
    const round = applyHeadline(1, crash, { ...params, headlines: [crash, params.headlines[0]] }, mulberry32(1));
    expect(Number.isInteger(round.priceAfterCents)).toBe(true);
    expect(round.priceAfterCents).toBeGreaterThanOrEqual(1);
  });
});

describe('scoreAuction (requirements 8.2, 8.5)', () => {
  const choices: AuctionChoice[] = [
    { headlineId: 'bull', prediction: 'up' }, // correct
    { headlineId: 'bear', prediction: 'up' }, // wrong (price falls)
    { headlineId: 'bull', prediction: 'up' }, // correct
  ];

  it('scores correct predictions / rounds as a 0-100 integer', () => {
    const result = scoreAuction(makeParams(), choices, mulberry32(7));
    expect(result.total).toBe(3);
    expect(result.correct).toBe(2);
    expect(result.score).toBe(67); // round(2/3 * 100)
    expect(result.rounds).toHaveLength(3);
  });

  it('is identical across runs with the same seed (requirement 8.5)', () => {
    const params = makeParams({ noise: 0.05 }); // noise ON, so the seed matters
    const a = scoreAuction(params, choices, mulberry32(123));
    const b = scoreAuction(params, choices, mulberry32(123));
    expect(a).toEqual(b);
    // The exact price path is reproduced, not just the score.
    expect(a.rounds.map((r) => r.priceAfterCents)).toEqual(
      b.rounds.map((r) => r.priceAfterCents),
    );
  });

  it('produces different paths for different seeds when noise is on', () => {
    const params = makeParams({ noise: 0.05 });
    const a = scoreAuction(params, choices, mulberry32(1));
    const b = scoreAuction(params, choices, mulberry32(2));
    expect(a.rounds.map((r) => r.priceAfterCents)).not.toEqual(
      b.rounds.map((r) => r.priceAfterCents),
    );
  });

  it('carries the price from one round into the next', () => {
    const result = scoreAuction(makeParams(), choices, mulberry32(7));
    expect(result.rounds[1].priceBeforeCents).toBe(result.rounds[0].priceAfterCents);
    expect(result.rounds[2].priceBeforeCents).toBe(result.rounds[1].priceAfterCents);
    expect(result.finalPriceCents).toBe(result.rounds[2].priceAfterCents);
  });

  it('throws on a choice referencing an unknown headline', () => {
    expect(() =>
      scoreAuction(makeParams(), [{ headlineId: 'ghost', prediction: 'up' }], mulberry32(1)),
    ).toThrow(/unknown headline/);
  });

  it('scores an empty run as 0', () => {
    const result = scoreAuction(makeParams(), [], mulberry32(1));
    expect(result.score).toBe(0);
    expect(result.total).toBe(0);
  });
});

// Feature: interactive-auction-room, Property 1: Legacy params parse with bounded values and documented defaults
//
// For all legacy-shaped auction params containing a positive safe-integer
// starting price, integer baseline totals in 0..1,000,000, sensitivity in
// 0..1, optional noise in 0..0.1, a positive integer round count, and two to
// four unique valid headlines whose integer deltas are in -1,000,000..1,000,000,
// parsing succeeds, preserves every authored value, and supplies noise = 0.01
// and showMarketDepth = true exactly when those fields are absent.
//
// Cases are generated dependency-free with the existing `mulberry32` RNG (no
// fast-check); the generation seed is printed on any failure so a failing case
// can be replayed by seeding `mulberry32` with it.
describe('parseAuctionParams — Property 1: legacy params parse with bounded values and documented defaults', () => {
  const MAX_CROWD = 1_000_000;
  const MAX_DELTA = 1_000_000;

  /** The documented defaults applied when the field is absent. */
  const DEFAULT_NOISE = 0.01;
  const DEFAULT_SHOW_MARKET_DEPTH = true;

  /**
   * One authored (legacy-shaped) params object plus the exact values that must
   * survive parsing. `noise`/`showMarketDepth` are omitted from `input` exactly
   * when `omitNoise`/`omitShowMarketDepth` is true, so the test can assert the
   * documented default is supplied in that case.
   */
  interface GeneratedCase {
    input: Record<string, unknown>;
    expectedNoise: number;
    expectedShowMarketDepth: boolean;
    omitNoise: boolean;
    omitShowMarketDepth: boolean;
  }

  /** Draw a float in [lo, hi]. */
  function floatInRange(rng: () => number, lo: number, hi: number): number {
    return lo + rng() * (hi - lo);
  }

  /**
   * Build a valid, legacy-shaped case entirely from the seeded generator so the
   * whole case is reproducible from `seed` alone. Every authored value is kept
   * inside the schema bounds, ids are unique, and `noise`/`showMarketDepth` are
   * sometimes omitted to exercise the documented defaults.
   */
  function generateCase(rng: () => number): GeneratedCase {
    // Positive safe integer starting price (cap well under MAX_SAFE_INTEGER).
    const startPriceCents = randomInt(rng, 1, 1_000_000_000);
    const baseDemand = randomInt(rng, 0, MAX_CROWD);
    const baseSupply = randomInt(rng, 0, MAX_CROWD);
    const sensitivity = floatInRange(rng, 0, 1);
    const rounds = randomInt(rng, 1, 50);

    // Two to four unique headlines with integer deltas in range.
    const headlineCount = randomInt(rng, 2, 4);
    const headlines = Array.from({ length: headlineCount }, (_unused, i) => ({
      id: `h${i}`,
      text: `Headline ${i}`,
      demandDelta: randomInt(rng, -MAX_DELTA, MAX_DELTA),
      supplyDelta: randomInt(rng, -MAX_DELTA, MAX_DELTA),
    }));

    const input: Record<string, unknown> = {
      startPriceCents,
      baseDemand,
      baseSupply,
      sensitivity,
      rounds,
      headlines,
    };

    // Omit noise ~half the time; otherwise author a value in [0, 0.1].
    const omitNoise = rng() < 0.5;
    const authoredNoise = floatInRange(rng, 0, 0.1);
    if (!omitNoise) input.noise = authoredNoise;

    // Omit showMarketDepth ~half the time; otherwise author a boolean.
    const omitShowMarketDepth = rng() < 0.5;
    const authoredShowMarketDepth = rng() < 0.5;
    if (!omitShowMarketDepth) input.showMarketDepth = authoredShowMarketDepth;

    return {
      input,
      expectedNoise: omitNoise ? DEFAULT_NOISE : authoredNoise,
      expectedShowMarketDepth: omitShowMarketDepth
        ? DEFAULT_SHOW_MARKET_DEPTH
        : authoredShowMarketDepth,
      omitNoise,
      omitShowMarketDepth,
    };
  }

  /**
   * Assert one generated case parses and preserves every authored value, and
   * that omitted optional fields receive their documented defaults. `label`
   * identifies the case (seed or fixture name) so a failure can be replayed.
   */
  function checkCase(testCase: GeneratedCase, label: string): void {
    const { input } = testCase;
    let parsed: AuctionParams;
    try {
      parsed = parseAuctionParams(input);
    } catch (error) {
      throw new Error(
        `${label} should parse but threw: ${String(error)}\ninput: ${JSON.stringify(input)}`,
      );
    }

    // Authored values survive parsing exactly.
    expect(parsed.startPriceCents).toBe(input.startPriceCents);
    expect(parsed.baseDemand).toBe(input.baseDemand);
    expect(parsed.baseSupply).toBe(input.baseSupply);
    expect(parsed.sensitivity).toBe(input.sensitivity);
    expect(parsed.rounds).toBe(input.rounds);
    expect(parsed.headlines).toEqual(input.headlines);

    // Omitted optional fields receive their documented defaults; authored ones
    // are preserved. toBeCloseTo guards against float representation drift.
    expect(parsed.noise).toBeCloseTo(testCase.expectedNoise, 12);
    expect(parsed.showMarketDepth).toBe(testCase.expectedShowMarketDepth);
  }

  it('parses explicit boundary fixtures with authored values and documented defaults', () => {
    // Lower/upper bounds, omitted optionals (defaults apply), and the existing
    // L1.2-style shape. Each fixture pins a corner of the input space.
    const fixtures: { label: string; testCase: GeneratedCase }[] = [
      {
        label: 'fixture:all-at-lower-bounds-optionals-omitted',
        testCase: {
          input: {
            startPriceCents: 1,
            baseDemand: 0,
            baseSupply: 0,
            sensitivity: 0,
            rounds: 1,
            headlines: [
              { id: 'a', text: 'A', demandDelta: -MAX_DELTA, supplyDelta: -MAX_DELTA },
              { id: 'b', text: 'B', demandDelta: 0, supplyDelta: 0 },
            ],
          },
          expectedNoise: DEFAULT_NOISE,
          expectedShowMarketDepth: DEFAULT_SHOW_MARKET_DEPTH,
          omitNoise: true,
          omitShowMarketDepth: true,
        },
      },
      {
        label: 'fixture:all-at-upper-bounds-optionals-authored',
        testCase: {
          input: {
            startPriceCents: Number.MAX_SAFE_INTEGER,
            baseDemand: MAX_CROWD,
            baseSupply: MAX_CROWD,
            sensitivity: 1,
            noise: 0.1,
            rounds: 1_000_000,
            showMarketDepth: false,
            headlines: [
              { id: 'a', text: 'A', demandDelta: MAX_DELTA, supplyDelta: MAX_DELTA },
              { id: 'b', text: 'B', demandDelta: MAX_DELTA, supplyDelta: -MAX_DELTA },
              { id: 'c', text: 'C', demandDelta: -MAX_DELTA, supplyDelta: MAX_DELTA },
              { id: 'd', text: 'D', demandDelta: 0, supplyDelta: 0 },
            ],
          },
          expectedNoise: 0.1,
          expectedShowMarketDepth: false,
          omitNoise: false,
          omitShowMarketDepth: false,
        },
      },
      {
        label: 'fixture:noise-zero-authored-showdepth-true-authored',
        testCase: {
          input: {
            startPriceCents: 5000,
            baseDemand: 10,
            baseSupply: 10,
            sensitivity: 0.2,
            noise: 0,
            rounds: 3,
            showMarketDepth: true,
            headlines: [
              { id: 'bull', text: 'Great earnings', demandDelta: 40, supplyDelta: 0 },
              { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 40 },
              { id: 'flat', text: 'Quiet day', demandDelta: 0, supplyDelta: 0 },
            ],
          },
          expectedNoise: 0,
          expectedShowMarketDepth: true,
          omitNoise: false,
          omitShowMarketDepth: false,
        },
      },
      {
        label: 'fixture:legacy-L1.2-shape-optionals-omitted',
        testCase: {
          input: {
            startPriceCents: 5000,
            baseDemand: 10,
            baseSupply: 10,
            sensitivity: 0.2,
            rounds: 3,
            headlines: [
              { id: 'bull', text: 'Great earnings', demandDelta: 40, supplyDelta: 0 },
              { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 40 },
              { id: 'flat', text: 'Quiet day', demandDelta: 0, supplyDelta: 0 },
            ],
          },
          expectedNoise: DEFAULT_NOISE,
          expectedShowMarketDepth: DEFAULT_SHOW_MARKET_DEPTH,
          omitNoise: true,
          omitShowMarketDepth: true,
        },
      },
    ];

    for (const { label, testCase } of fixtures) {
      checkCase(testCase, label);
    }
  });

  it('parses at least 100 generated legacy-shaped cases, preserving authored values and defaults', () => {
    const CASE_COUNT = 200;
    for (let i = 0; i < CASE_COUNT; i++) {
      // Each case is seeded by its index so a failure replays with mulberry32(i).
      const seed = i;
      const rng = mulberry32(seed);
      const testCase = generateCase(rng);
      checkCase(testCase, `generated case (replay with mulberry32(${seed}))`);
    }
  });
});
// Focused params and seed boundary tests (task 1.3).
//
// Example-based coverage of the hardened input contract (requirements 1.6, 4.1,
// 9.1, 9.2, 9.3). These pin the exact corners the generated Property-1 test
// samples broadly: strict vs safe parse behavior on the same bad input, the
// explicit `showMarketDepth: false` escape hatch, duplicate-id and headline-count
// rejection, per-field integer/range/finite-number failures, and the full
// taxonomy of invalid seeds plus the valid uint32 boundaries.

/** A minimal valid, legacy-shaped params object the field tests mutate. */
function validInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    startPriceCents: 10000,
    baseDemand: 50,
    baseSupply: 50,
    sensitivity: 0.2,
    rounds: 3,
    headlines: [
      { id: 'bull', text: 'Great earnings', demandDelta: 40, supplyDelta: 0 },
      { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 40 },
    ],
    ...overrides,
  };
}

describe('parseAuctionParams vs safeParseAuctionParams — strict throw vs discriminated result', () => {
  it('strict parser throws while the safe parser returns {success:false, error} for the same invalid input', () => {
    const bad = validInput({ startPriceCents: 0 }); // below the min of 1

    // Strict API throws (used by pure callers and tests).
    expect(() => parseAuctionParams(bad)).toThrow();

    // Safe API never throws: it reports the failure and carries the Zod error.
    const result = safeParseAuctionParams(bad);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected a failure result');
    expect(result.error.issues.length).toBeGreaterThan(0);
  });

  it('both parsers accept the same valid input and agree on the parsed value', () => {
    const good = validInput();

    const strict = parseAuctionParams(good);
    const safe = safeParseAuctionParams(good);

    expect(safe.success).toBe(true);
    if (!safe.success) throw new Error('expected a success result');
    expect(safe.data).toEqual(strict);
  });

  it('the safe parser rejects a completely wrong shape without throwing', () => {
    for (const notParams of [null, undefined, 42, 'auction', [], {}]) {
      const result = safeParseAuctionParams(notParams);
      expect(result.success).toBe(false);
    }
  });
});

describe('parseAuctionParams — showMarketDepth default and explicit override', () => {
  it('defaults showMarketDepth to true when omitted (existing L1.2 content)', () => {
    expect(parseAuctionParams(validInput()).showMarketDepth).toBe(true);
  });

  it('preserves an explicit showMarketDepth: false', () => {
    expect(parseAuctionParams(validInput({ showMarketDepth: false })).showMarketDepth).toBe(false);
  });

  it('preserves an explicit showMarketDepth: true', () => {
    expect(parseAuctionParams(validInput({ showMarketDepth: true })).showMarketDepth).toBe(true);
  });

  it('rejects a non-boolean showMarketDepth', () => {
    expect(() => parseAuctionParams(validInput({ showMarketDepth: 'yes' }))).toThrow();
    expect(() => parseAuctionParams(validInput({ showMarketDepth: 1 }))).toThrow();
  });
});

describe('parseAuctionParams — headline id uniqueness and count bounds', () => {
  it('rejects duplicate headline ids', () => {
    const dup = validInput({
      headlines: [
        { id: 'same', text: 'First', demandDelta: 10, supplyDelta: 0 },
        { id: 'same', text: 'Second', demandDelta: 0, supplyDelta: 10 },
      ],
    });
    expect(() => parseAuctionParams(dup)).toThrow(/unique/i);
    expect(safeParseAuctionParams(dup).success).toBe(false);
  });

  it('rejects fewer than two headlines', () => {
    expect(() =>
      parseAuctionParams(
        validInput({
          headlines: [{ id: 'solo', text: 'Only one', demandDelta: 1, supplyDelta: 0 }],
        }),
      ),
    ).toThrow();
  });

  it('rejects more than four headlines', () => {
    const five = validInput({
      headlines: Array.from({ length: 5 }, (_unused, i) => ({
        id: `h${i}`,
        text: `Headline ${i}`,
        demandDelta: 1,
        supplyDelta: 0,
      })),
    });
    expect(() => parseAuctionParams(five)).toThrow();
  });

  it('accepts exactly two headlines (lower bound)', () => {
    expect(parseAuctionParams(validInput()).headlines).toHaveLength(2);
  });

  it('accepts exactly four headlines (upper bound)', () => {
    const four = validInput({
      headlines: Array.from({ length: 4 }, (_unused, i) => ({
        id: `h${i}`,
        text: `Headline ${i}`,
        demandDelta: 1,
        supplyDelta: 0,
      })),
    });
    expect(parseAuctionParams(four).headlines).toHaveLength(4);
  });

  it('rejects an empty headline id or text', () => {
    expect(() =>
      parseAuctionParams(
        validInput({
          headlines: [
            { id: '', text: 'A', demandDelta: 1, supplyDelta: 0 },
            { id: 'b', text: 'B', demandDelta: 0, supplyDelta: 1 },
          ],
        }),
      ),
    ).toThrow();
    expect(() =>
      parseAuctionParams(
        validInput({
          headlines: [
            { id: 'a', text: '   ', demandDelta: 1, supplyDelta: 0 },
            { id: 'b', text: 'B', demandDelta: 0, supplyDelta: 1 },
          ],
        }),
      ),
    ).toThrow();
  });
});

describe('parseAuctionParams — per-field integer, range, and finite-number failures', () => {
  // Each case names a field and an invalid value that must be rejected by both
  // the strict parser (throws) and the safe parser ({success:false}).
  const invalidFieldCases: { field: string; value: unknown; why: string }[] = [
    // startPriceCents: positive safe integer.
    { field: 'startPriceCents', value: 0, why: 'below the minimum of 1' },
    { field: 'startPriceCents', value: -1, why: 'negative' },
    { field: 'startPriceCents', value: 100.5, why: 'non-integer' },
    { field: 'startPriceCents', value: Number.NaN, why: 'NaN' },
    { field: 'startPriceCents', value: Number.POSITIVE_INFINITY, why: 'infinite' },

    // baseDemand: integer 0..1,000,000.
    { field: 'baseDemand', value: -1, why: 'negative' },
    { field: 'baseDemand', value: 1_000_001, why: 'above the crowd ceiling' },
    { field: 'baseDemand', value: 10.5, why: 'non-integer' },
    { field: 'baseDemand', value: Number.NaN, why: 'NaN' },

    // baseSupply: integer 0..1,000,000.
    { field: 'baseSupply', value: -5, why: 'negative' },
    { field: 'baseSupply', value: 1_000_001, why: 'above the crowd ceiling' },
    { field: 'baseSupply', value: 3.14, why: 'non-integer' },

    // sensitivity: finite number 0..1.
    { field: 'sensitivity', value: -0.1, why: 'negative' },
    { field: 'sensitivity', value: 1.1, why: 'above 1' },
    { field: 'sensitivity', value: Number.NaN, why: 'NaN' },
    { field: 'sensitivity', value: Number.POSITIVE_INFINITY, why: 'infinite' },

    // noise: finite number 0..0.1.
    { field: 'noise', value: -0.01, why: 'negative' },
    { field: 'noise', value: 0.2, why: 'above the 0.1 ceiling' },
    { field: 'noise', value: Number.NaN, why: 'NaN' },
    { field: 'noise', value: Number.NEGATIVE_INFINITY, why: 'infinite' },

    // rounds: positive integer.
    { field: 'rounds', value: 0, why: 'below the minimum of 1' },
    { field: 'rounds', value: -3, why: 'negative' },
    { field: 'rounds', value: 2.5, why: 'non-integer' },
    { field: 'rounds', value: Number.NaN, why: 'NaN' },
  ];

  it.each(invalidFieldCases)('rejects $field when it is $why', ({ field, value }) => {
    const bad = validInput({ [field]: value });
    expect(() => parseAuctionParams(bad)).toThrow();
    expect(safeParseAuctionParams(bad).success).toBe(false);
  });

  // Headline deltas: integers in -1,000,000..1,000,000.
  const invalidDeltaCases: { field: 'demandDelta' | 'supplyDelta'; value: unknown; why: string }[] = [
    { field: 'demandDelta', value: 1_000_001, why: 'above the delta ceiling' },
    { field: 'demandDelta', value: -1_000_001, why: 'below the delta floor' },
    { field: 'demandDelta', value: 1.5, why: 'non-integer' },
    { field: 'demandDelta', value: Number.NaN, why: 'NaN' },
    { field: 'supplyDelta', value: 2_000_000, why: 'above the delta ceiling' },
    { field: 'supplyDelta', value: -1_000_001, why: 'below the delta floor' },
    { field: 'supplyDelta', value: 0.25, why: 'non-integer' },
    { field: 'supplyDelta', value: Number.POSITIVE_INFINITY, why: 'infinite' },
  ];

  it.each(invalidDeltaCases)('rejects a headline $field when it is $why', ({ field, value }) => {
    const bad = validInput({
      headlines: [
        { id: 'a', text: 'A', demandDelta: 0, supplyDelta: 0, [field]: value },
        { id: 'b', text: 'B', demandDelta: 0, supplyDelta: 0 },
      ],
    });
    expect(() => parseAuctionParams(bad)).toThrow();
    expect(safeParseAuctionParams(bad).success).toBe(false);
  });

  it('accepts the valid delta boundaries -1,000,000 and 1,000,000', () => {
    const parsed = parseAuctionParams(
      validInput({
        headlines: [
          { id: 'a', text: 'A', demandDelta: -1_000_000, supplyDelta: 1_000_000 },
          { id: 'b', text: 'B', demandDelta: 1_000_000, supplyDelta: -1_000_000 },
        ],
      }),
    );
    expect(parsed.headlines[0].demandDelta).toBe(-1_000_000);
    expect(parsed.headlines[0].supplyDelta).toBe(1_000_000);
  });
});

describe('isValidAuctionSeed — uint32 validation without coercion', () => {
  const MAX_SEED = 4_294_967_295;

  it('accepts the valid uint32 boundaries 0 and 4,294,967,295', () => {
    expect(isValidAuctionSeed(0)).toBe(true);
    expect(isValidAuctionSeed(MAX_SEED)).toBe(true);
  });

  it('accepts representative in-range integers', () => {
    expect(isValidAuctionSeed(1)).toBe(true);
    expect(isValidAuctionSeed(42)).toBe(true);
    expect(isValidAuctionSeed(2_147_483_648)).toBe(true);
  });

  // The full taxonomy of invalid seeds, each expected to be false (no coercion).
  const invalidSeeds: { label: string; value: unknown }[] = [
    { label: 'a numeric string', value: '42' },
    { label: 'an empty string', value: '' },
    { label: 'a non-numeric string', value: 'seed' },
    { label: 'a fraction', value: 1.5 },
    { label: 'a small negative', value: -1 },
    { label: 'a large negative', value: -4_294_967_295 },
    { label: 'overflow above the uint32 max', value: MAX_SEED + 1 },
    { label: 'a far-overflow value', value: 10_000_000_000 },
    { label: 'NaN', value: Number.NaN },
    { label: 'positive Infinity', value: Number.POSITIVE_INFINITY },
    { label: 'negative Infinity', value: Number.NEGATIVE_INFINITY },
    { label: 'null', value: null },
    { label: 'undefined', value: undefined },
    { label: 'a boolean', value: true },
    { label: 'an object', value: {} },
    { label: 'an array', value: [1] },
    { label: 'a bigint', value: BigInt(1) },
  ];

  it.each(invalidSeeds)('rejects $label', ({ value }) => {
    expect(isValidAuctionSeed(value)).toBe(false);
  });

  it('does not fold out-of-range or fractional values the way mulberry32 would', () => {
    // mulberry32 coerces via `>>> 0`; isValidAuctionSeed must NOT accept the
    // same inputs — it validates, it does not fold.
    expect(isValidAuctionSeed(1.9)).toBe(false); // mulberry32(1.9) seeds as 1
    expect(isValidAuctionSeed(MAX_SEED + 1)).toBe(false); // would fold to 0
    expect(isValidAuctionSeed(-1)).toBe(false); // would fold to 4,294,967,295
  });
});

describe('parseAuctionParams — existing legacy L1.2 fields remain accepted', () => {
  it('accepts the full legacy field set (startPriceCents, baseDemand, baseSupply, sensitivity, noise, headlines, rounds)', () => {
    const legacy = {
      startPriceCents: 5000,
      baseDemand: 10,
      baseSupply: 10,
      sensitivity: 0.2,
      noise: 0.03,
      rounds: 3,
      headlines: [
        { id: 'bull', text: 'Great earnings', demandDelta: 40, supplyDelta: 0 },
        { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 40 },
        { id: 'flat', text: 'Quiet day', demandDelta: 0, supplyDelta: 0 },
      ],
    };
    const parsed = parseAuctionParams(legacy);
    expect(parsed.startPriceCents).toBe(5000);
    expect(parsed.baseDemand).toBe(10);
    expect(parsed.baseSupply).toBe(10);
    expect(parsed.sensitivity).toBe(0.2);
    expect(parsed.noise).toBeCloseTo(0.03, 12);
    expect(parsed.rounds).toBe(3);
    expect(parsed.headlines).toEqual(legacy.headlines);
    // The new optional field defaults in without the author specifying it.
    expect(parsed.showMarketDepth).toBe(true);
  });
});

// Feature: interactive-auction-room, Property 3: Headline adjustments produce bounded whole-number crowd totals
//
// For all schema-valid auction params and headlines, deriveCrowdTotals returns
// demand = clamp(baseDemand + demandDelta, 0, 1,000,000) and
// supply = clamp(baseSupply + supplyDelta, 0, 1,000,000) (requirements 2.1,
// 2.2). Each total is a whole integer bounded in 0..1,000,000: a baseline-plus-
// delta below 0 clamps up to 0, one above 1,000,000 clamps down to 1,000,000,
// and an in-range sum passes through unchanged. Because the schema bounds base
// to 0..1,000,000 and each delta to -1,000,000..1,000,000, the raw sum spans
// -1,000,000 (clamps to 0) to 2,000,000 (clamps to 1,000,000).
//
// Cases are generated dependency-free with the existing `mulberry32`/`randomInt`
// RNG (no fast-check); each case is seeded by its index so a failure replays
// with mulberry32(seed). The generation seed is printed on any failure.
describe('deriveCrowdTotals — Property 3: headline adjustments produce bounded whole-number crowd totals', () => {
  const MAX_CROWD = 1_000_000;
  const MAX_DELTA = 1_000_000;

  /** The reference clamp the helper must implement for one side. */
  function clamp(value: number): number {
    return Math.min(MAX_CROWD, Math.max(0, value));
  }

  /**
   * Build schema-valid params with the given baselines and a two-headline set
   * whose first card carries the baseline/delta combination under test. The
   * second card is a benign filler so the two-headline minimum is met. Noise is
   * zero and sensitivity mid-range — neither influences the crowd derivation,
   * which is a pure function of baselines and deltas.
   */
  function makeCrowdParams(
    baseDemand: number,
    baseSupply: number,
    demandDelta: number,
    supplyDelta: number,
  ): { params: AuctionParams; headline: AuctionParams['headlines'][number] } {
    const params = parseAuctionParams({
      startPriceCents: 10000,
      baseDemand,
      baseSupply,
      sensitivity: 0.2,
      noise: 0,
      rounds: 1,
      headlines: [
        { id: 'under-test', text: 'Under test', demandDelta, supplyDelta },
        { id: 'filler', text: 'Filler', demandDelta: 0, supplyDelta: 0 },
      ],
    });
    return { params, headline: params.headlines[0] };
  }

  /**
   * Assert deriveCrowdTotals clamps both sides to a whole integer in
   * 0..1,000,000 that equals the reference clamp of baseline-plus-delta.
   * `label` identifies the case so a failure can be replayed.
   */
  function checkCrowd(
    baseDemand: number,
    baseSupply: number,
    demandDelta: number,
    supplyDelta: number,
    label: string,
  ): void {
    const { params, headline } = makeCrowdParams(baseDemand, baseSupply, demandDelta, supplyDelta);
    const totals = deriveCrowdTotals(params, headline);

    const expectedDemand = clamp(baseDemand + demandDelta);
    const expectedSupply = clamp(baseSupply + supplyDelta);
    const detail = `${label}\ninput: baseDemand=${baseDemand} demandDelta=${demandDelta} baseSupply=${baseSupply} supplyDelta=${supplyDelta}`;

    // Exact clamp on both sides.
    if (totals.demand !== expectedDemand) {
      throw new Error(`${detail}\nexpected demand ${expectedDemand} but got ${totals.demand}`);
    }
    if (totals.supply !== expectedSupply) {
      throw new Error(`${detail}\nexpected supply ${expectedSupply} but got ${totals.supply}`);
    }

    // Whole integers, bounded in 0..1,000,000 on both sides.
    expect(Number.isInteger(totals.demand)).toBe(true);
    expect(Number.isInteger(totals.supply)).toBe(true);
    expect(totals.demand).toBeGreaterThanOrEqual(0);
    expect(totals.demand).toBeLessThanOrEqual(MAX_CROWD);
    expect(totals.supply).toBeGreaterThanOrEqual(0);
    expect(totals.supply).toBeLessThanOrEqual(MAX_CROWD);
  }

  it('clamps both edges and passes in-range values through on explicit boundary fixtures', () => {
    const fixtures: {
      label: string;
      baseDemand: number;
      baseSupply: number;
      demandDelta: number;
      supplyDelta: number;
    }[] = [
      // Lower-edge clamp: base+delta below 0 clamps to 0 on both sides.
      {
        label: 'fixture:both-sides-clamp-to-zero (min raw sum -1,000,000)',
        baseDemand: 0,
        baseSupply: 0,
        demandDelta: -MAX_DELTA,
        supplyDelta: -MAX_DELTA,
      },
      {
        label: 'fixture:mid-base-large-negative-delta-clamps-to-zero',
        baseDemand: 500_000,
        baseSupply: 1,
        demandDelta: -MAX_DELTA,
        supplyDelta: -MAX_DELTA,
      },
      // Upper-edge clamp: base+delta above 1,000,000 clamps to 1,000,000.
      {
        label: 'fixture:both-sides-clamp-to-ceiling (max raw sum 2,000,000)',
        baseDemand: MAX_CROWD,
        baseSupply: MAX_CROWD,
        demandDelta: MAX_DELTA,
        supplyDelta: MAX_DELTA,
      },
      {
        label: 'fixture:mid-base-large-positive-delta-clamps-to-ceiling',
        baseDemand: 1,
        baseSupply: 999_999,
        demandDelta: MAX_DELTA,
        supplyDelta: MAX_DELTA,
      },
      // Exactly on the bounds, no clamp needed.
      {
        label: 'fixture:lands-exactly-on-zero',
        baseDemand: MAX_CROWD,
        baseSupply: 1000,
        demandDelta: -MAX_CROWD,
        supplyDelta: -1000,
      },
      {
        label: 'fixture:lands-exactly-on-ceiling',
        baseDemand: 0,
        baseSupply: 500_000,
        demandDelta: MAX_CROWD,
        supplyDelta: 500_000,
      },
      // In-range sums pass through unchanged.
      {
        label: 'fixture:in-range-passthrough',
        baseDemand: 50,
        baseSupply: 50,
        demandDelta: 40,
        supplyDelta: -30,
      },
      // Mixed: one side clamps low, the other clamps high.
      {
        label: 'fixture:demand-clamps-low-supply-clamps-high',
        baseDemand: 10,
        baseSupply: MAX_CROWD,
        demandDelta: -MAX_DELTA,
        supplyDelta: MAX_DELTA,
      },
      // Zero deltas leave the baselines untouched.
      {
        label: 'fixture:zero-deltas-passthrough-baselines',
        baseDemand: 123_456,
        baseSupply: 654_321,
        demandDelta: 0,
        supplyDelta: 0,
      },
    ];

    for (const f of fixtures) {
      checkCrowd(f.baseDemand, f.baseSupply, f.demandDelta, f.supplyDelta, f.label);
    }
  });

  it('clamps both sides correctly across at least 100 generated baseline/delta combinations', () => {
    const CASE_COUNT = 200;
    for (let i = 0; i < CASE_COUNT; i++) {
      // Each case is seeded by its index so a failure replays with mulberry32(i).
      const seed = i;
      const rng = mulberry32(seed);
      // Draw baselines in 0..1,000,000 and deltas in -1,000,000..1,000,000, the
      // full schema input space, so cases span both clamp edges and the middle.
      const baseDemand = randomInt(rng, 0, MAX_CROWD);
      const baseSupply = randomInt(rng, 0, MAX_CROWD);
      const demandDelta = randomInt(rng, -MAX_DELTA, MAX_DELTA);
      const supplyDelta = randomInt(rng, -MAX_DELTA, MAX_DELTA);
      checkCrowd(
        baseDemand,
        baseSupply,
        demandDelta,
        supplyDelta,
        `generated case (replay with mulberry32(${seed}))`,
      );
    }
  });
});

// Feature: interactive-auction-room, Property 4: A round applies the exact formula with one draw and a valid price
//
// For all schema-valid params, every positive whole-cent price, and every
// authored headline, `applyHeadline` reproduces the design's price update
// exactly, draws the seeded rng exactly once, and returns a positive whole-cent
// price (requirements 2.3, 2.4, 2.5, 6.4). With `u` the single draw and the
// clamped crowd totals `demand`/`supply`:
//
//   total     = demand + supply
//   imbalance = total === 0 ? 0 : (demand - supply) / total
//   rawNext   = priceCents * (1 + sensitivity * imbalance + (2u - 1) * noise)
//   priceAfterCents = max(1, round(rawNext))
//   direction = priceAfterCents >= priceBefore ? 'up' : 'down'
//
// A controlled rng returning a fixed `u` pins the exact formula, including the
// zero-total (imbalance = 0) case, the symmetric noise bounds, nearest-cent
// rounding, and the one-cent floor. A counting rng wrapper proves the call draws
// exactly once — even when authored noise is zero — so the established
// one-draw-per-round seed budget is preserved (requirement 6.4).
//
// Cases are generated dependency-free with the existing `mulberry32`/`randomInt`
// RNG (no fast-check); each case is seeded by its index so a failure replays
// with mulberry32(seed). The generation seed is printed on any failure.
describe('applyHeadline — Property 4: a round applies the exact formula with one draw and a valid price', () => {
  const MAX_CROWD = 1_000_000;
  const MAX_DELTA = 1_000_000;

  /**
   * Wrap a generator so every draw is counted. The wrapper forwards each call to
   * the underlying rng unchanged, so the stream the sim sees is identical; only
   * the number of draws is observed, letting us assert exactly one draw per
   * `applyHeadline` call (requirement 6.4).
   */
  function countingRng(inner: () => number): { rng: () => number; count: () => number } {
    let draws = 0;
    return {
      rng: () => {
        draws += 1;
        return inner();
      },
      count: () => draws,
    };
  }

  /**
   * A controlled generator that always returns the same `u` in [0, 1). Used to
   * pin the exact formula: with a known `u` the noise term is fully determined,
   * so the expected price can be computed independently of the PRNG stream.
   * (A real generator never returns a constant; this is a test seam only.)
   */
  function constantRng(u: number): () => number {
    return () => u;
  }

  /** Clamp a baseline-plus-delta crowd total to an integer in 0..1,000,000. */
  function clampCrowd(value: number): number {
    return Math.min(MAX_CROWD, Math.max(0, value));
  }

  /**
   * The reference implementation of the design's update, computed here
   * independently of the module under test. Given the price, the chosen
   * headline, the params, and the single draw `u`, it returns the expected
   * price and direction so the test can compare field by field.
   */
  function expectedRound(
    priceCents: number,
    headline: AuctionParams['headlines'][number],
    params: AuctionParams,
    u: number,
  ): { priceAfterCents: number; direction: 'up' | 'down'; demand: number; supply: number } {
    const demand = clampCrowd(params.baseDemand + headline.demandDelta);
    const supply = clampCrowd(params.baseSupply + headline.supplyDelta);
    const total = demand + supply;
    const imbalance = total === 0 ? 0 : (demand - supply) / total;
    const rawNext = priceCents * (1 + params.sensitivity * imbalance + (2 * u - 1) * params.noise);
    const priceAfterCents = Math.max(1, Math.round(rawNext));
    return {
      priceAfterCents,
      direction: priceAfterCents >= priceCents ? 'up' : 'down',
      demand,
      supply,
    };
  }

  /**
   * Assert one case: `applyHeadline` matches the reference formula exactly for
   * the given fixed draw `u`, draws the rng exactly once, and returns a positive
   * whole cent. `label` identifies the case (seed or fixture) for replay.
   */
  function checkCase(
    priceCents: number,
    headline: AuctionParams['headlines'][number],
    params: AuctionParams,
    u: number,
    label: string,
  ): void {
    const { rng, count } = countingRng(constantRng(u));
    const round = applyHeadline(priceCents, headline, params, rng);
    const expected = expectedRound(priceCents, headline, params, u);

    const detail =
      `${label}\n` +
      `input: priceCents=${priceCents} u=${u} sensitivity=${params.sensitivity} noise=${params.noise}\n` +
      `headline: demandDelta=${headline.demandDelta} supplyDelta=${headline.supplyDelta}\n` +
      `baseDemand=${params.baseDemand} baseSupply=${params.baseSupply}`;

    // Exactly one draw per applied round (requirement 6.4), including noise = 0.
    if (count() !== 1) {
      throw new Error(`${detail}\nexpected exactly 1 rng draw but got ${count()}`);
    }

    // Exact formula: price, direction, and crowd totals match the reference.
    if (round.priceAfterCents !== expected.priceAfterCents) {
      throw new Error(
        `${detail}\nexpected priceAfterCents ${expected.priceAfterCents} but got ${round.priceAfterCents}`,
      );
    }
    if (round.direction !== expected.direction) {
      throw new Error(
        `${detail}\nexpected direction ${expected.direction} but got ${round.direction}`,
      );
    }
    expect(round.priceBeforeCents).toBe(priceCents);
    expect(round.demand).toBe(expected.demand);
    expect(round.supply).toBe(expected.supply);

    // Positive whole-cent floor (requirement 2.5).
    expect(Number.isInteger(round.priceAfterCents)).toBe(true);
    expect(round.priceAfterCents).toBeGreaterThanOrEqual(1);

    // Noise is bounded by |noise| as a fraction of the price: the imbalance-only
    // price (u = 0.5, noise term vanishes) and the drawn price differ by no more
    // than priceCents * noise, up to rounding. This guards the (2u - 1) * noise
    // bound (requirement 2.4) independently of the exact-formula comparison.
    const imbalanceOnly =
      priceCents *
      (1 +
        params.sensitivity *
          (expected.demand + expected.supply === 0
            ? 0
            : (expected.demand - expected.supply) / (expected.demand + expected.supply)));
    const maxNoiseCents = priceCents * params.noise;
    const rawNext =
      imbalanceOnly + priceCents * (2 * u - 1) * params.noise;
    expect(Math.abs(rawNext - imbalanceOnly)).toBeLessThanOrEqual(maxNoiseCents + 1e-6);
  }

  /** Build schema-valid params carrying one headline under test plus a filler. */
  function makeParams(
    baseDemand: number,
    baseSupply: number,
    demandDelta: number,
    supplyDelta: number,
    sensitivity: number,
    noise: number,
  ): { params: AuctionParams; headline: AuctionParams['headlines'][number] } {
    const params = parseAuctionParams({
      startPriceCents: 10000,
      baseDemand,
      baseSupply,
      sensitivity,
      noise,
      rounds: 1,
      headlines: [
        { id: 'under-test', text: 'Under test', demandDelta, supplyDelta },
        { id: 'filler', text: 'Filler', demandDelta: 0, supplyDelta: 0 },
      ],
    });
    return { params, headline: params.headlines[0] };
  }

  it('matches the exact formula, draws once, and floors the price on explicit boundary fixtures', () => {
    const fixtures: {
      label: string;
      priceCents: number;
      baseDemand: number;
      baseSupply: number;
      demandDelta: number;
      supplyDelta: number;
      sensitivity: number;
      noise: number;
      u: number;
    }[] = [
      // Zero total demand+supply -> imbalance term is 0 (no division by zero).
      {
        label: 'fixture:zero-total-imbalance-is-zero',
        priceCents: 10000,
        baseDemand: 0,
        baseSupply: 0,
        demandDelta: 0,
        supplyDelta: 0,
        sensitivity: 0.5,
        noise: 0,
        u: 0.5,
      },
      // Noise = 0 still draws exactly once; u = 0.5 makes the noise term vanish.
      {
        label: 'fixture:noise-zero-still-draws-once',
        priceCents: 10000,
        baseDemand: 90,
        baseSupply: 50,
        demandDelta: 0,
        supplyDelta: 0,
        sensitivity: 0.2,
        noise: 0,
        u: 0.123456,
      },
      // Maximum downward noise (u = 0) with a strong bearish imbalance.
      {
        label: 'fixture:max-down-noise-strong-bear',
        priceCents: 10000,
        baseDemand: 0,
        baseSupply: MAX_CROWD,
        demandDelta: 0,
        supplyDelta: 0,
        sensitivity: 1,
        noise: 0.1,
        u: 0,
      },
      // Maximum upward noise (u = 1) with a strong bullish imbalance.
      {
        label: 'fixture:max-up-noise-strong-bull',
        priceCents: 10000,
        baseDemand: MAX_CROWD,
        baseSupply: 0,
        demandDelta: 0,
        supplyDelta: 0,
        sensitivity: 1,
        noise: 0.1,
        u: 1,
      },
      // One-cent floor: tiny price, strong bear, max down noise -> clamps to 1.
      {
        label: 'fixture:one-cent-floor',
        priceCents: 1,
        baseDemand: 0,
        baseSupply: MAX_CROWD,
        demandDelta: 0,
        supplyDelta: 0,
        sensitivity: 1,
        noise: 0.1,
        u: 0,
      },
      // Tie resolves up: balanced market, no noise -> price unchanged -> 'up'.
      {
        label: 'fixture:tie-resolves-up',
        priceCents: 5000,
        baseDemand: 100,
        baseSupply: 100,
        demandDelta: 0,
        supplyDelta: 0,
        sensitivity: 0.3,
        noise: 0,
        u: 0.5,
      },
      // Nearest-cent rounding on a price that does not divide evenly.
      {
        label: 'fixture:nearest-cent-rounding',
        priceCents: 9999,
        baseDemand: 70,
        baseSupply: 30,
        demandDelta: 0,
        supplyDelta: 0,
        sensitivity: 0.17,
        noise: 0.03,
        u: 0.73,
      },
      // Deltas drive the crowd totals through the clamp before the formula.
      {
        label: 'fixture:deltas-clamp-then-formula',
        priceCents: 25000,
        baseDemand: 500_000,
        baseSupply: 10,
        demandDelta: MAX_DELTA,
        supplyDelta: -MAX_DELTA,
        sensitivity: 0.8,
        noise: 0.05,
        u: 0.2,
      },
    ];

    for (const f of fixtures) {
      const { params, headline } = makeParams(
        f.baseDemand,
        f.baseSupply,
        f.demandDelta,
        f.supplyDelta,
        f.sensitivity,
        f.noise,
      );
      checkCase(f.priceCents, headline, params, f.u, f.label);
    }
  });

  it('matches the exact formula and draws exactly once across at least 100 generated cases', () => {
    const CASE_COUNT = 200;
    for (let i = 0; i < CASE_COUNT; i++) {
      // Each case is seeded by its index so a failure replays with mulberry32(i).
      const seed = i;
      const rng = mulberry32(seed);

      // Draw the full input space: positive whole-cent price, baselines in
      // 0..1,000,000, deltas in -1,000,000..1,000,000, sensitivity in [0, 1],
      // noise in [0, 0.1], and the single controlled draw u in [0, 1).
      const priceCents = randomInt(rng, 1, 1_000_000);
      const baseDemand = randomInt(rng, 0, MAX_CROWD);
      const baseSupply = randomInt(rng, 0, MAX_CROWD);
      const demandDelta = randomInt(rng, -MAX_DELTA, MAX_DELTA);
      const supplyDelta = randomInt(rng, -MAX_DELTA, MAX_DELTA);
      const sensitivity = rng();
      // Mix in exact-zero noise on some cases so the one-draw budget is checked
      // with noise off as well as on.
      const noise = i % 7 === 0 ? 0 : rng() * 0.1;
      const u = rng();

      const { params, headline } = makeParams(
        baseDemand,
        baseSupply,
        demandDelta,
        supplyDelta,
        sensitivity,
        noise,
      );
      checkCase(
        priceCents,
        headline,
        params,
        u,
        `generated case (replay with mulberry32(${seed}))`,
      );
    }
  });
});

// Feature: interactive-auction-room, Property 5: Market snapshots are deterministic, proportional, ordered, and RNG-neutral
//
// For all positive whole-cent prices and all integer crowd totals in
// 0..1,000,000, `deriveMarketSnapshot(priceCents, demand, supply)` returns a
// deterministic, well-ordered, proportional, RNG-free projection
// (requirements 3.2, 3.3, 3.4):
//
//   - Determinism: repeated calls with the same inputs return deeply equal
//     snapshots (requirement 3.2).
//   - Ordering / non-negative spread: askCents >= bidCents >= 1 and
//     spreadCents = askCents - bidCents >= 0 (requirement 3.3).
//   - Proportional side fractions: for a nonzero total, buyFraction and
//     sellFraction sum to ~1 and equal demand/total and supply/total; a
//     zero-total market yields zero fractions (requirement 3.4).
//   - Exact depth sums / common scaling: each side's three depth-level
//     quantities sum exactly to that side's total, and every relativeSize uses
//     the common scale max(demand, supply, 1) (requirement 3.4).
//   - Zero-total output: a zero-total market yields zero fractions and zero
//     depth quantities (requirement 3.4).
//   - RNG-neutral: `deriveMarketSnapshot` takes no rng, so calling it an
//     arbitrary number of times between two draws of a seeded generator does
//     NOT change that generator's sequence (requirement 3.2).
//
// Cases are generated dependency-free with the existing `mulberry32`/`randomInt`
// RNG (no fast-check); each case is seeded by its index so a failure replays
// with mulberry32(seed). The generation seed is printed on any failure.
describe('deriveMarketSnapshot — Property 5: market snapshots are deterministic, proportional, ordered, and RNG-neutral', () => {
  const MAX_CROWD = 1_000_000;

  /**
   * Assert every invariant of one snapshot given the inputs that produced it.
   * `label` identifies the case (seed or fixture) so a failure can be replayed.
   * Separated from generation so boundary fixtures and generated cases share the
   * exact same checks.
   */
  function checkSnapshot(priceCents: number, demand: number, supply: number, label: string): void {
    const detail = `${label}\ninput: priceCents=${priceCents} demand=${demand} supply=${supply}`;

    // Determinism: a second call with the same inputs is deeply equal to the
    // first (requirement 3.2).
    const snapshot = deriveMarketSnapshot(priceCents, demand, supply);
    const again = deriveMarketSnapshot(priceCents, demand, supply);
    if (snapshot === null) {
      throw new Error(`${detail}\nexpected a snapshot for valid input but got null`);
    }
    expect(again).toEqual(snapshot);

    const total = demand + supply;

    // Quote ordering and non-negative spread (requirement 3.3): the ask is at
    // least the bid, the bid is at least one cent, and the spread is the exact
    // non-negative difference.
    expect(Number.isInteger(snapshot.bidCents)).toBe(true);
    expect(Number.isInteger(snapshot.askCents)).toBe(true);
    expect(snapshot.bidCents).toBeGreaterThanOrEqual(1);
    expect(snapshot.askCents).toBeGreaterThanOrEqual(snapshot.bidCents);
    expect(snapshot.spreadCents).toBe(snapshot.askCents - snapshot.bidCents);
    expect(snapshot.spreadCents).toBeGreaterThanOrEqual(0);

    // Side fractions are proportional to the crowd (requirement 3.4): zero at a
    // zero total, otherwise demand/total and supply/total summing to ~1.
    if (total === 0) {
      expect(snapshot.buyFraction).toBe(0);
      expect(snapshot.sellFraction).toBe(0);
      expect(snapshot.imbalance).toBe(0);
    } else {
      expect(snapshot.buyFraction).toBeCloseTo(demand / total, 12);
      expect(snapshot.sellFraction).toBeCloseTo(supply / total, 12);
      expect(snapshot.buyFraction + snapshot.sellFraction).toBeCloseTo(1, 12);
      expect(snapshot.imbalance).toBeCloseTo((demand - supply) / total, 12);
    }
    expect(snapshot.buyFraction).toBeGreaterThanOrEqual(0);
    expect(snapshot.sellFraction).toBeGreaterThanOrEqual(0);

    // The common scale shared by both sides so bars stay visually comparable.
    const scale = Math.max(demand, supply, 1);

    // Each side's three levels sum exactly to that side's total, and each
    // relativeSize is quantity / common-scale (requirement 3.4).
    checkSide(snapshot.buyLevels, demand, scale, `${detail}\nside: buy`);
    checkSide(snapshot.sellLevels, supply, scale, `${detail}\nside: sell`);

    // Zero-total market: every depth quantity is zero on both sides.
    if (total === 0) {
      for (const level of [...snapshot.buyLevels, ...snapshot.sellLevels]) {
        expect(level.quantity).toBe(0);
        expect(level.relativeSize).toBe(0);
      }
    }
  }

  /**
   * Assert one side's three depth levels sum exactly to `sideTotal`, carry
   * whole non-negative quantities, and scale each `relativeSize` against the
   * shared common `scale`.
   */
  function checkSide(
    levels: AuctionMarketSnapshot['buyLevels'],
    sideTotal: number,
    scale: number,
    detail: string,
  ): void {
    expect(levels).toHaveLength(3);
    let sum = 0;
    for (const level of levels) {
      expect(Number.isInteger(level.quantity)).toBe(true);
      expect(level.quantity).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(level.priceCents)).toBe(true);
      expect(level.priceCents).toBeGreaterThanOrEqual(1);
      // relativeSize is this level's quantity against the common scale.
      expect(level.relativeSize).toBeCloseTo(level.quantity / scale, 12);
      sum += level.quantity;
    }
    // The three levels partition the side total exactly (requirement 3.4).
    if (sum !== sideTotal) {
      throw new Error(`${detail}\nexpected depth quantities to sum to ${sideTotal} but got ${sum}`);
    }
  }

  it('is deterministic, ordered, proportional, and exact on explicit boundary fixtures', () => {
    const fixtures: { label: string; priceCents: number; demand: number; supply: number }[] = [
      // Zero total: no crowd on either side -> zero fractions and zero depth.
      { label: 'fixture:zero-total-empty-market', priceCents: 10000, demand: 0, supply: 0 },
      // All demand, no supply -> buyFraction 1, sellFraction 0.
      { label: 'fixture:all-demand-no-supply', priceCents: 10000, demand: MAX_CROWD, supply: 0 },
      // All supply, no demand -> sellFraction 1, buyFraction 0.
      { label: 'fixture:all-supply-no-demand', priceCents: 10000, demand: 0, supply: MAX_CROWD },
      // Perfectly balanced -> fractions 0.5/0.5, imbalance 0.
      { label: 'fixture:balanced-crowd', priceCents: 5000, demand: 500, supply: 500 },
      // Minimum price with max supply pressure -> bid floored at one cent.
      { label: 'fixture:min-price-max-bear', priceCents: 1, demand: 0, supply: MAX_CROWD },
      // Minimum price balanced -> both sides tiny, bid floored at one cent.
      { label: 'fixture:min-price-balanced', priceCents: 1, demand: 1, supply: 1 },
      // Small odd totals exercise the near/middle/far ceil split summing exactly.
      { label: 'fixture:odd-small-totals', priceCents: 1234, demand: 1, supply: 2 },
      { label: 'fixture:odd-small-totals-2', priceCents: 9999, demand: 3, supply: 7 },
      // Max crowd on both sides at a large price.
      { label: 'fixture:max-crowd-both-sides', priceCents: 1_000_000, demand: MAX_CROWD, supply: MAX_CROWD },
      // Lopsided mid-range crowd.
      { label: 'fixture:lopsided-mid-range', priceCents: 25000, demand: 123_456, supply: 7_890 },
      // A single unit on one side.
      { label: 'fixture:single-demand-unit', priceCents: 500, demand: 1, supply: 0 },
    ];

    for (const f of fixtures) {
      checkSnapshot(f.priceCents, f.demand, f.supply, f.label);
    }
  });

  it('returns null for invalid price or out-of-range demand/supply', () => {
    // A valid snapshot anchor to mutate one field at a time.
    const validPrice = 10000;
    const validCrowd = 50;

    // Non-positive-integer prices are unavailable input -> null.
    for (const badPrice of [0, -1, -10000, 100.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(deriveMarketSnapshot(badPrice, validCrowd, validCrowd)).toBeNull();
    }

    // Out-of-range or non-integer demand -> null.
    for (const badDemand of [-1, MAX_CROWD + 1, 10.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(deriveMarketSnapshot(validPrice, badDemand, validCrowd)).toBeNull();
    }

    // Out-of-range or non-integer supply -> null.
    for (const badSupply of [-1, MAX_CROWD + 1, 3.14, Number.NaN, Number.NEGATIVE_INFINITY]) {
      expect(deriveMarketSnapshot(validPrice, validCrowd, badSupply)).toBeNull();
    }

    // Valid boundaries still produce a snapshot (not null).
    expect(deriveMarketSnapshot(1, 0, 0)).not.toBeNull();
    expect(deriveMarketSnapshot(1, MAX_CROWD, MAX_CROWD)).not.toBeNull();
  });

  it('holds every invariant across at least 100 generated cases', () => {
    const CASE_COUNT = 200;
    for (let i = 0; i < CASE_COUNT; i++) {
      // Each case is seeded by its index so a failure replays with mulberry32(i).
      const seed = i;
      const rng = mulberry32(seed);
      // Full valid input space: positive whole-cent price and integer crowd
      // totals in 0..1,000,000. Force a zero total on some cases so the
      // empty-market branch is exercised alongside nonzero crowds.
      const priceCents = randomInt(rng, 1, 1_000_000);
      const forceZero = i % 11 === 0;
      const demand = forceZero ? 0 : randomInt(rng, 0, MAX_CROWD);
      const supply = forceZero ? 0 : randomInt(rng, 0, MAX_CROWD);
      checkSnapshot(priceCents, demand, supply, `generated case (replay with mulberry32(${seed}))`);
    }
  });

  it('is RNG-neutral: snapshot calls between two draws do not change the rng sequence', () => {
    // The reference stream: draws taken straight from a fresh generator with no
    // snapshot calls between them.
    const reference: number[] = [];
    const referenceRng = mulberry32(12345);
    const DRAWS = 50;
    for (let i = 0; i < DRAWS; i++) reference.push(referenceRng());

    // The observed stream: an independent generator with the same seed, but with
    // an arbitrary number of deriveMarketSnapshot calls wedged between each draw.
    // Because deriveMarketSnapshot takes no rng and reads no ambient entropy, the
    // observed sequence must match the reference exactly (requirement 3.2).
    const observed: number[] = [];
    const observedRng = mulberry32(12345);
    const snapshotRng = mulberry32(999); // only used to vary the snapshot inputs
    for (let i = 0; i < DRAWS; i++) {
      // Call the pure snapshot an arbitrary number of times with varied inputs.
      const callCount = randomInt(snapshotRng, 0, 5);
      for (let c = 0; c < callCount; c++) {
        const priceCents = randomInt(snapshotRng, 1, 1_000_000);
        const demand = randomInt(snapshotRng, 0, MAX_CROWD);
        const supply = randomInt(snapshotRng, 0, MAX_CROWD);
        deriveMarketSnapshot(priceCents, demand, supply);
      }
      observed.push(observedRng());
    }

    // The snapshot calls consumed zero draws from observedRng, so the two
    // same-seed streams are identical.
    expect(observed).toEqual(reference);
  });
});

// Feature: interactive-auction-room, Property 6: Direction is derived only from the signed price change
//
// For every applied Round, `applyHeadline` resolves `direction` purely from the
// signed difference between the price before and the price after the Round, and
// never from the Headline_Card's authored wording or intended mood
// (requirement 4.8):
//
//   priceAfterCents >= priceBeforeCents  <=>  direction === 'up'   (ties -> up)
//   priceAfterCents <  priceBeforeCents  <=>  direction === 'down'
//
// A change greater than zero resolves to `up`, a change less than zero resolves
// to `down`, and a change of exactly zero (a tie) resolves to the single
// deterministic direction `up`. The sign of the move is engineered through the
// controlled inputs — crowd imbalance (demand vs supply), sensitivity, and a
// fixed single noise draw `u` — not through the card's text. To prove wording
// cannot override the number, each case authors a headline whose text sounds the
// OPPOSITE of the move it actually produces (a "bullish"-sounding card that
// drives the price down, and vice versa); the computed direction still follows
// the number.
//
// A controlled rng returning a fixed `u` makes the single noise draw fully
// determined, so each case lands on a known increase, decrease, or exact tie.
// Cases are generated dependency-free with the existing `mulberry32`/`randomInt`
// RNG (no fast-check); each case is seeded by its index so a failure replays
// with mulberry32(seed). The generation seed is printed on any failure.
describe('applyHeadline — Property 6: direction is derived only from the signed price change', () => {
  const MAX_CROWD = 1_000_000;

  /** The intended move a case is engineered to produce. */
  type IntendedMove = 'up' | 'down' | 'tie';

  /**
   * A controlled generator that always returns the same `u` in [0, 1). Fixing
   * the single draw determines the noise term, so the signed price move is a
   * deterministic function of the crafted inputs — letting each case land on a
   * known increase, decrease, or exact tie.
   */
  function constantRng(u: number): () => number {
    return () => u;
  }

  /**
   * Build schema-valid params carrying one headline under test plus a benign
   * filler (so the two-headline minimum is met). The headline's `text` is chosen
   * to sound the OPPOSITE of `intended`, so a passing case proves the direction
   * follows the computed number and not the authored wording. The deltas are
   * zero here; the move is driven entirely by the baselines, sensitivity, and
   * the fixed noise draw, keeping the engineered sign easy to reason about.
   */
  function makeParams(
    baseDemand: number,
    baseSupply: number,
    sensitivity: number,
    noise: number,
    intended: IntendedMove,
  ): { params: AuctionParams; headline: AuctionParams['headlines'][number] } {
    // Deliberately misleading wording: a card that actually pushes the price
    // down is worded bullishly, and one that pushes it up is worded bearishly.
    // A tie gets emphatic wording in both directions. The text must never decide
    // the outcome.
    const misleadingText =
      intended === 'up'
        ? 'DISASTER: factory burns down, buyers flee'
        : intended === 'down'
          ? 'BOOM: blockbuster demand, prices to the moon'
          : 'MASSIVE bullish breakout — unstoppable rally (bearish crash too)';

    const params = parseAuctionParams({
      startPriceCents: 10000,
      baseDemand,
      baseSupply,
      sensitivity,
      noise,
      rounds: 1,
      headlines: [
        { id: 'under-test', text: misleadingText, demandDelta: 0, supplyDelta: 0 },
        { id: 'filler', text: 'Quiet day', demandDelta: 0, supplyDelta: 0 },
      ],
    });
    return { params, headline: params.headlines[0] };
  }

  /**
   * Apply one case and assert the direction is derived strictly from the signed
   * price change: `up` iff the price did not fall (ties included), `down` iff it
   * fell. Also asserts the engineered `intended` move actually materialized, so
   * the generator is really exercising increases, decreases, and ties — and that
   * the misleading wording did not sway the result. `label` identifies the case
   * (seed or fixture) for replay.
   */
  function checkDirection(
    priceCents: number,
    params: AuctionParams,
    headline: AuctionParams['headlines'][number],
    u: number,
    intended: IntendedMove,
    label: string,
  ): void {
    const round = applyHeadline(priceCents, headline, params, constantRng(u));
    const detail =
      `${label}\n` +
      `input: priceCents=${priceCents} u=${u} sensitivity=${params.sensitivity} noise=${params.noise}\n` +
      `baseDemand=${params.baseDemand} baseSupply=${params.baseSupply} intended=${intended}\n` +
      `headlineText=${JSON.stringify(headline.text)}\n` +
      `before=${round.priceBeforeCents} after=${round.priceAfterCents} direction=${round.direction}`;

    // The before-price is always the input price (sanity anchor for the sign).
    expect(round.priceBeforeCents).toBe(priceCents);

    // Core property: direction follows the signed change, with ties -> up.
    const expectedDirection = round.priceAfterCents >= round.priceBeforeCents ? 'up' : 'down';
    if (round.direction !== expectedDirection) {
      throw new Error(
        `${detail}\nexpected direction ${expectedDirection} from the signed change but got ${round.direction}`,
      );
    }

    // The two equivalences spelled out, so a regression names which side broke:
    // up iff not-fallen, down iff fallen.
    if (round.priceAfterCents >= round.priceBeforeCents) {
      if (round.direction !== 'up') {
        throw new Error(`${detail}\nprice did not fall but direction was not 'up'`);
      }
    } else if (round.direction !== 'down') {
      throw new Error(`${detail}\nprice fell but direction was not 'down'`);
    }

    // The engineered move actually happened — proving the generator exercises
    // genuine increases, decreases, and exact ties (not all one bucket), and
    // that the opposite-sounding wording did not override the computed move.
    if (intended === 'up') {
      if (!(round.priceAfterCents > round.priceBeforeCents)) {
        throw new Error(`${detail}\nexpected an increase but price did not rise`);
      }
      expect(round.direction).toBe('up');
    } else if (intended === 'down') {
      if (!(round.priceAfterCents < round.priceBeforeCents)) {
        throw new Error(`${detail}\nexpected a decrease but price did not fall`);
      }
      expect(round.direction).toBe('down');
    } else {
      // Exact tie: price unchanged -> deterministic 'up'.
      if (round.priceAfterCents !== round.priceBeforeCents) {
        throw new Error(`${detail}\nexpected an exact tie but the price moved`);
      }
      expect(round.direction).toBe('up');
    }
  }

  it('resolves increases, decreases, and ties from the number on explicit boundary fixtures', () => {
    // Each fixture pins a controlled increase, decrease, or exact tie. The
    // `intended` field also selects an opposite-sounding headline, so every
    // fixture doubles as a check that wording cannot override the move.
    const fixtures: {
      label: string;
      priceCents: number;
      baseDemand: number;
      baseSupply: number;
      sensitivity: number;
      noise: number;
      u: number;
      intended: IntendedMove;
    }[] = [
      // Strong bullish imbalance, no noise -> clear increase (worded bearishly).
      {
        label: 'fixture:imbalance-up-no-noise',
        priceCents: 10000,
        baseDemand: MAX_CROWD,
        baseSupply: 0,
        sensitivity: 1,
        noise: 0,
        u: 0.5,
        intended: 'up',
      },
      // Strong bearish imbalance, no noise -> clear decrease (worded bullishly).
      {
        label: 'fixture:imbalance-down-no-noise',
        priceCents: 10000,
        baseDemand: 0,
        baseSupply: MAX_CROWD,
        sensitivity: 1,
        noise: 0,
        u: 0.5,
        intended: 'down',
      },
      // Perfectly balanced crowd, no noise -> exact tie -> deterministic 'up'.
      {
        label: 'fixture:balanced-tie-resolves-up',
        priceCents: 5000,
        baseDemand: 500,
        baseSupply: 500,
        sensitivity: 0.5,
        noise: 0,
        u: 0.5,
        intended: 'tie',
      },
      // Zero crowd, no noise -> imbalance 0 -> exact tie -> 'up'.
      {
        label: 'fixture:zero-crowd-tie-resolves-up',
        priceCents: 7777,
        baseDemand: 0,
        baseSupply: 0,
        sensitivity: 0.9,
        noise: 0,
        u: 0.5,
        intended: 'tie',
      },
      // Zero sensitivity, zero noise -> no change at all -> exact tie -> 'up'.
      {
        label: 'fixture:zero-sensitivity-tie',
        priceCents: 1234,
        baseDemand: MAX_CROWD,
        baseSupply: 0,
        sensitivity: 0,
        noise: 0,
        u: 0.5,
        intended: 'tie',
      },
      // Balanced crowd but max UP noise (u = 1) forces the price up on its own,
      // proving the move follows the number even with a neutral crowd.
      {
        label: 'fixture:noise-only-up',
        priceCents: 10000,
        baseDemand: 100,
        baseSupply: 100,
        sensitivity: 0.5,
        noise: 0.1,
        u: 1,
        intended: 'up',
      },
      // Balanced crowd but max DOWN noise (u = 0) forces the price down.
      {
        label: 'fixture:noise-only-down',
        priceCents: 10000,
        baseDemand: 100,
        baseSupply: 100,
        sensitivity: 0.5,
        noise: 0.1,
        u: 0,
        intended: 'down',
      },
      // One-cent price with a bearish imbalance -> already at the floor, cannot
      // fall further -> stays 1 -> tie -> 'up' (floor interacts with direction).
      {
        label: 'fixture:one-cent-floor-tie-up',
        priceCents: 1,
        baseDemand: 0,
        baseSupply: MAX_CROWD,
        sensitivity: 1,
        noise: 0,
        u: 0.5,
        intended: 'tie',
      },
    ];

    for (const f of fixtures) {
      const { params, headline } = makeParams(
        f.baseDemand,
        f.baseSupply,
        f.sensitivity,
        f.noise,
        f.intended,
      );
      checkDirection(f.priceCents, params, headline, f.u, f.intended, f.label);
    }
  });

  it('derives direction from the signed change across at least 100 generated cases', () => {
    const CASE_COUNT = 200;
    // Count how many of each move the generator actually produced, so the suite
    // provably exercises increases, decreases, AND ties rather than one bucket.
    const seen: Record<IntendedMove, number> = { up: 0, down: 0, tie: 0 };

    for (let i = 0; i < CASE_COUNT; i++) {
      // Each case is seeded by its index so a failure replays with mulberry32(i).
      const seed = i;
      const rng = mulberry32(seed);

      // Rotate deterministically through the three engineered moves so every
      // bucket is well represented. The crafted inputs guarantee the sign.
      const intended: IntendedMove = i % 3 === 0 ? 'up' : i % 3 === 1 ? 'down' : 'tie';

      // Price well above the one-cent floor so an engineered decrease has room
      // to actually fall (and is not clamped into an accidental tie).
      const priceCents = randomInt(rng, 1000, 1_000_000);
      // Sensitivity strong enough that a lopsided crowd clearly moves the price.
      const sensitivity = 0.2 + rng() * 0.8; // [0.2, 1.0]

      let baseDemand: number;
      let baseSupply: number;
      let noise: number;
      let u: number;

      if (intended === 'up') {
        // Demand dominates and noise cannot flip the sign: pin noise to zero so
        // the positive imbalance alone decides the move.
        baseDemand = randomInt(rng, 1, MAX_CROWD);
        baseSupply = randomInt(rng, 0, Math.max(0, baseDemand - 1)); // strictly less
        noise = 0;
        u = rng(); // noise term is zero regardless of u
      } else if (intended === 'down') {
        // Supply dominates and noise is off, so the negative imbalance decides.
        baseSupply = randomInt(rng, 1, MAX_CROWD);
        baseDemand = randomInt(rng, 0, Math.max(0, baseSupply - 1)); // strictly less
        noise = 0;
        u = rng();
      } else {
        // Exact tie: a perfectly balanced crowd (imbalance 0) with the noise
        // term neutralized (u = 0.5 makes 2u - 1 = 0), so the price is unchanged
        // whatever the sensitivity or noise fraction.
        const crowd = randomInt(rng, 0, MAX_CROWD);
        baseDemand = crowd;
        baseSupply = crowd;
        noise = rng() * 0.1; // irrelevant: the noise term vanishes at u = 0.5
        u = 0.5;
      }

      const { params, headline } = makeParams(
        baseDemand,
        baseSupply,
        sensitivity,
        noise,
        intended,
      );
      checkDirection(
        priceCents,
        params,
        headline,
        u,
        intended,
        `generated case (replay with mulberry32(${seed}))`,
      );
      seen[intended] += 1;
    }

    // The generator exercised all three engineered moves, so the property was
    // checked against genuine increases, decreases, and ties.
    expect(seen.up).toBeGreaterThan(0);
    expect(seen.down).toBeGreaterThan(0);
    expect(seen.tie).toBeGreaterThan(0);
  });
});

// Focused crowd, quote, and formula regressions (task 2.7).
//
// Example-based coverage of the deterministic primitives the generated
// Property 3/4/5/6 tests sample broadly. These pin the exact corners by name so
// a regression says which behavior broke (requirements 2.2, 2.3, 2.4, 2.5, 3.2,
// 3.3, 3.4, 3.5, 4.8, 6.1, 6.2, 6.4):
//
//   deriveCrowdTotals — both clamp edges (requirement 2.2).
//   applyHeadline     — both-zero totals, tie -> up, positive whole cent, and
//                       exactly one draw when authored noise is zero
//                       (requirements 2.3, 2.4, 2.5, 4.8, 6.4).
//   deriveMarketSnapshot — three-level price/quantity ordering, zero depth,
//                       proportional common scaling, and null for unavailable
//                       input (requirements 3.2, 3.3, 3.4, 3.5).
//   no ambient entropy — a full scoreAuction replay never reads Math.random or
//                       a clock, only the supplied seeded rng (requirement 6.2).

/** The shared bounds, restated locally so these regressions are self-contained. */
const REG_MAX_CROWD = 1_000_000;
const REG_MAX_DELTA = 1_000_000;

/** A minimal valid params object the regressions build on, with noise off. */
function regParams(overrides: Partial<AuctionParams> = {}): AuctionParams {
  return parseAuctionParams({
    startPriceCents: 10000,
    baseDemand: 50,
    baseSupply: 50,
    sensitivity: 0.2,
    noise: 0,
    rounds: 3,
    headlines: [
      { id: 'bull', text: 'Great earnings', demandDelta: 40, supplyDelta: 0 },
      { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 40 },
    ],
    ...overrides,
  });
}

describe('deriveCrowdTotals — focused clamp regressions (requirement 2.2)', () => {
  it('clamps a below-zero baseline-plus-delta up to 0 on both sides (lower clamp)', () => {
    // base 0 + delta -1,000,000 = -1,000,000 -> clamps up to 0.
    const params = regParams({
      baseDemand: 0,
      baseSupply: 0,
      headlines: [
        { id: 'crash', text: 'Everyone leaves', demandDelta: -REG_MAX_DELTA, supplyDelta: -REG_MAX_DELTA },
        { id: 'filler', text: 'Filler', demandDelta: 0, supplyDelta: 0 },
      ],
    });
    const totals = deriveCrowdTotals(params, params.headlines[0]);
    expect(totals).toEqual({ demand: 0, supply: 0 });
  });

  it('clamps an above-ceiling baseline-plus-delta down to 1,000,000 on both sides (upper clamp)', () => {
    // base 1,000,000 + delta 1,000,000 = 2,000,000 -> clamps down to 1,000,000.
    const params = regParams({
      baseDemand: REG_MAX_CROWD,
      baseSupply: REG_MAX_CROWD,
      headlines: [
        { id: 'mania', text: 'Buying frenzy', demandDelta: REG_MAX_DELTA, supplyDelta: REG_MAX_DELTA },
        { id: 'filler', text: 'Filler', demandDelta: 0, supplyDelta: 0 },
      ],
    });
    const totals = deriveCrowdTotals(params, params.headlines[0]);
    expect(totals).toEqual({ demand: REG_MAX_CROWD, supply: REG_MAX_CROWD });
  });
});

describe('applyHeadline — focused formula regressions (requirements 2.3, 2.4, 2.5, 4.8, 6.4)', () => {
  it('treats both-zero totals as zero imbalance and leaves only the noise term', () => {
    // demand 0, supply 0 -> imbalance term is 0 (no division by zero); with
    // noise 0 the price is unchanged.
    const params = regParams({
      baseDemand: 0,
      baseSupply: 0,
      sensitivity: 1,
      noise: 0,
      headlines: [
        { id: 'flat', text: 'Nothing happens', demandDelta: 0, supplyDelta: 0 },
        { id: 'filler', text: 'Filler', demandDelta: 0, supplyDelta: 0 },
      ],
    });
    const round = applyHeadline(10000, params.headlines[0], params, mulberry32(1));
    expect(round.demand).toBe(0);
    expect(round.supply).toBe(0);
    expect(round.priceAfterCents).toBe(10000); // imbalance 0, noise 0 -> unchanged
  });

  it('resolves an exact tie (unchanged price) to the deterministic up direction', () => {
    // Balanced crowd, no noise -> price unchanged -> ties count as 'up'.
    const params = regParams({
      baseDemand: 500,
      baseSupply: 500,
      sensitivity: 0.5,
      noise: 0,
      headlines: [
        { id: 'balanced', text: 'Steady as she goes', demandDelta: 0, supplyDelta: 0 },
        { id: 'filler', text: 'Filler', demandDelta: 0, supplyDelta: 0 },
      ],
    });
    const round = applyHeadline(5000, params.headlines[0], params, mulberry32(42));
    expect(round.priceAfterCents).toBe(round.priceBeforeCents);
    expect(round.direction).toBe('up');
  });

  it('floors the price at a positive whole cent even under a crushing bear move', () => {
    // Tiny price, all-supply crowd, max sensitivity, max down noise (u = 0) ->
    // the raw price goes well below 1 but is floored to a whole 1 cent.
    const params = regParams({
      baseDemand: 0,
      baseSupply: REG_MAX_CROWD,
      sensitivity: 1,
      noise: 0.1,
      headlines: [
        { id: 'collapse', text: 'Total collapse', demandDelta: 0, supplyDelta: 0 },
        { id: 'filler', text: 'Filler', demandDelta: 0, supplyDelta: 0 },
      ],
    });
    // A constant rng returning 0 produces the maximum downward noise.
    const round = applyHeadline(1, params.headlines[0], params, () => 0);
    expect(Number.isInteger(round.priceAfterCents)).toBe(true);
    expect(round.priceAfterCents).toBe(1);
  });

  it('draws the seeded rng exactly once even when authored noise is zero (requirement 6.4)', () => {
    // The one-draw-per-round budget holds with noise off: the draw still happens,
    // its result just does not move the price.
    let draws = 0;
    const countingRng = () => {
      draws += 1;
      return 0.5;
    };
    const params = regParams({ noise: 0 });
    applyHeadline(10000, params.headlines[0], params, countingRng);
    expect(draws).toBe(1);
  });
});

describe('deriveMarketSnapshot — focused quote and depth regressions (requirements 3.2, 3.3, 3.4, 3.5)', () => {
  it('orders the three buy levels descending and the three sell levels ascending in price', () => {
    const snapshot = deriveMarketSnapshot(100000, 600, 400);
    expect(snapshot).not.toBeNull();
    if (!snapshot) throw new Error('expected a snapshot');

    expect(snapshot.buyLevels).toHaveLength(3);
    expect(snapshot.sellLevels).toHaveLength(3);

    // Buy side: best bid first, each deeper level at a strictly lower (or equal
    // at the one-cent floor) price. Sell side: best ask first, ascending.
    expect(snapshot.buyLevels[0].priceCents).toBe(snapshot.bidCents);
    expect(snapshot.buyLevels[0].priceCents).toBeGreaterThanOrEqual(snapshot.buyLevels[1].priceCents);
    expect(snapshot.buyLevels[1].priceCents).toBeGreaterThanOrEqual(snapshot.buyLevels[2].priceCents);

    expect(snapshot.sellLevels[0].priceCents).toBe(snapshot.askCents);
    expect(snapshot.sellLevels[0].priceCents).toBeLessThanOrEqual(snapshot.sellLevels[1].priceCents);
    expect(snapshot.sellLevels[1].priceCents).toBeLessThanOrEqual(snapshot.sellLevels[2].priceCents);

    // Quote ordering and non-negative spread (requirement 3.3).
    expect(snapshot.askCents).toBeGreaterThanOrEqual(snapshot.bidCents);
    expect(snapshot.bidCents).toBeGreaterThanOrEqual(1);
    expect(snapshot.spreadCents).toBe(snapshot.askCents - snapshot.bidCents);
  });

  it('splits each side total exactly across its three depth-level quantities', () => {
    const snapshot = deriveMarketSnapshot(100000, 600, 400);
    expect(snapshot).not.toBeNull();
    if (!snapshot) throw new Error('expected a snapshot');

    const buySum = snapshot.buyLevels.reduce((acc, level) => acc + level.quantity, 0);
    const sellSum = snapshot.sellLevels.reduce((acc, level) => acc + level.quantity, 0);
    expect(buySum).toBe(600);
    expect(sellSum).toBe(400);
  });

  it('yields zero depth quantities and zero fractions for a zero-total market', () => {
    const snapshot = deriveMarketSnapshot(10000, 0, 0);
    expect(snapshot).not.toBeNull();
    if (!snapshot) throw new Error('expected a snapshot');

    expect(snapshot.buyFraction).toBe(0);
    expect(snapshot.sellFraction).toBe(0);
    expect(snapshot.imbalance).toBe(0);
    for (const level of [...snapshot.buyLevels, ...snapshot.sellLevels]) {
      expect(level.quantity).toBe(0);
      expect(level.relativeSize).toBe(0);
    }
  });

  it('scales every relativeSize against the common scale max(demand, supply, 1)', () => {
    // Lopsided crowd: the common scale is the larger side, so the smaller side's
    // bars read as a smaller fraction of the same scale — keeping both sides
    // visually proportional to each other.
    const demand = 800;
    const supply = 200;
    const snapshot = deriveMarketSnapshot(100000, demand, supply);
    expect(snapshot).not.toBeNull();
    if (!snapshot) throw new Error('expected a snapshot');

    const scale = Math.max(demand, supply, 1); // 800
    for (const level of snapshot.buyLevels) {
      expect(level.relativeSize).toBeCloseTo(level.quantity / scale, 12);
    }
    for (const level of snapshot.sellLevels) {
      expect(level.relativeSize).toBeCloseTo(level.quantity / scale, 12);
    }
    // The dominant side's best level fills the most of the common scale.
    expect(snapshot.buyLevels[0].relativeSize).toBeGreaterThan(snapshot.sellLevels[0].relativeSize);
  });

  it('returns the same snapshot on repeat calls with the same inputs (deterministic)', () => {
    const first = deriveMarketSnapshot(12345, 321, 654);
    const second = deriveMarketSnapshot(12345, 321, 654);
    expect(second).toEqual(first);
  });

  it('returns null for unavailable or invalid price/balance inputs (requirement 3.5)', () => {
    // Non-positive-integer price.
    expect(deriveMarketSnapshot(0, 50, 50)).toBeNull();
    expect(deriveMarketSnapshot(-1, 50, 50)).toBeNull();
    expect(deriveMarketSnapshot(100.5, 50, 50)).toBeNull();
    expect(deriveMarketSnapshot(Number.NaN, 50, 50)).toBeNull();
    // Out-of-range or non-integer crowd totals.
    expect(deriveMarketSnapshot(10000, -1, 50)).toBeNull();
    expect(deriveMarketSnapshot(10000, 50, REG_MAX_CROWD + 1)).toBeNull();
    expect(deriveMarketSnapshot(10000, 10.5, 50)).toBeNull();
  });
});

describe('scoreAuction — no ambient entropy during pure replay (requirement 6.2)', () => {
  // A full replay must take ALL of its randomness from the supplied seeded rng
  // and NEVER read Math.random or a clock. Spying on those ambient APIs during a
  // complete scoreAuction run and asserting they are never called proves no
  // accidental entropy leaked into the "deterministic" path.
  it('never calls Math.random, Date.now, or Date construction during a replay', () => {
    const randomSpy = jest.spyOn(Math, 'random');
    const dateNowSpy = jest.spyOn(Date, 'now');
    // Spy on the Date constructor via performance.now as well, where available,
    // so a clock read through any common seam is observed.
    const perfNowSpy =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? jest.spyOn(performance, 'now')
        : null;

    try {
      // Noise ON so the replay genuinely consumes draws — only from the seeded
      // rng — across several rounds and both directions.
      const params = regParams({ noise: 0.05 });
      const choices: AuctionChoice[] = [
        { headlineId: 'bull', prediction: 'up' },
        { headlineId: 'bear', prediction: 'down' },
        { headlineId: 'bull', prediction: 'up' },
      ];
      const result = scoreAuction(params, choices, mulberry32(2024));

      // The replay produced a real graded outcome (so the spies covered actual
      // work, not an early return).
      expect(result.total).toBe(3);
      expect(result.rounds).toHaveLength(3);

      // No ambient entropy was read: all randomness came from the seeded rng.
      expect(randomSpy).not.toHaveBeenCalled();
      expect(dateNowSpy).not.toHaveBeenCalled();
      if (perfNowSpy) expect(perfNowSpy).not.toHaveBeenCalled();
    } finally {
      // Restore the ambient APIs so later tests are unaffected.
      randomSpy.mockRestore();
      dateNowSpy.mockRestore();
      perfNowSpy?.mockRestore();
    }
  });

  it('reproduces an identical price path across replays with the same seed, independent of ambient state', () => {
    const params = regParams({ noise: 0.05 });
    const choices: AuctionChoice[] = [
      { headlineId: 'bull', prediction: 'up' },
      { headlineId: 'bear', prediction: 'down' },
    ];
    const a = scoreAuction(params, choices, mulberry32(777));
    const b = scoreAuction(params, choices, mulberry32(777));
    expect(a).toEqual(b);
  });
});

// Feature: interactive-auction-room, Property 7: Replay grading and reporting match committed predictions
//
// For all schema-valid params, every uint32 seed, and every sequence of learner
// choices referencing authored headlines (each choice's prediction present or
// absent), `scoreAuction(params, choices, mulberry32(seed))` grades and reports
// the run exactly as an independent reference oracle does (requirements 1.5,
// 5.1, 5.2, 5.3, 5.4, 5.5):
//
//   - total === choices.length (every provided choice plays one Round).
//   - correct === the oracle's count of choices whose committed prediction
//     equals the Round's computed Price_Direction; a choice with NO committed
//     prediction can never match and is counted incorrect (requirements 5.1,
//     5.2).
//   - score === clamp(round(correct / total * 100), 0, 100), an integer in
//     0..100, and exactly 0 when total === 0 (requirements 5.3, 5.5).
//   - finalPriceCents === the last Round's priceAfterCents, or startPriceCents
//     when the choice list is empty.
//   - summary states the exact "<correct> of <total>" counts with the correct
//     singular/plural wording ("time" for a single Round, "times" otherwise)
//     (requirement 5.4).
//
// The reference oracle replays the design's price update independently with its
// OWN fresh mulberry32(seed) — recomputing each Round's direction from the
// signed price change, not from `scoreAuction` — so a bug in the module's
// grading, scoring, carry, or summary cannot hide behind a matching bug in the
// oracle. Cases are generated dependency-free with the existing
// `mulberry32`/`randomInt` RNG (no fast-check); each case is seeded by its index
// so a failure replays with mulberry32(seed). The generation seed is printed on
// any failure.
describe('scoreAuction — Property 7: replay grading and reporting match committed predictions', () => {
  const P7_MAX_CROWD = 1_000_000;
  const P7_MAX_DELTA = 1_000_000;
  const P7_MAX_SEED = 4_294_967_295;

  /** Clamp a baseline-plus-delta crowd total to an integer in 0..1,000,000. */
  function clampCrowd(value: number): number {
    return Math.min(P7_MAX_CROWD, Math.max(0, value));
  }

  /** The single-source score formula the oracle expects the module to use. */
  function expectedScore(correct: number, total: number): number {
    if (total === 0) return 0;
    return Math.min(100, Math.max(0, Math.round((correct / total) * 100)));
  }

  /** The exact summary copy, with singular/plural wording on the total. */
  function expectedSummary(correct: number, total: number): string {
    return `You read the market right ${correct} of ${total} ${total === 1 ? 'time' : 'times'}.`;
  }

  /**
   * An independent reference replay. Starting at `startPriceCents`, it applies
   * each chosen headline in order using its OWN fresh `mulberry32(seed)`,
   * reproducing the design's price update
   *   price' = price * (1 + k * (demand - supply) / (demand + supply)) + (2u-1)*noise
   * with clamped crowd totals, nearest-cent rounding, and a one-cent floor. It
   * recomputes each Round's direction from the signed change and counts a Round
   * correct only when a committed prediction matches that direction — a missing
   * prediction (`undefined`) can never match. Returns everything the module's
   * `AuctionResult` reports so the test can compare field by field.
   */
  function referenceReplay(
    params: AuctionParams,
    choices: readonly AuctionChoice[],
    seed: number,
  ): {
    directions: ('up' | 'down')[];
    prices: number[];
    correct: number;
    total: number;
    score: number;
    finalPriceCents: number;
    summary: string;
  } {
    const byId = new Map(params.headlines.map((h) => [h.id, h] as const));
    const rng = mulberry32(seed); // fresh generator, independent of scoreAuction
    const directions: ('up' | 'down')[] = [];
    const prices: number[] = [];
    let price = params.startPriceCents;
    let correct = 0;

    for (const choice of choices) {
      const headline = byId.get(choice.headlineId);
      if (!headline) throw new Error(`oracle: unknown headline "${choice.headlineId}"`);

      const demand = clampCrowd(params.baseDemand + headline.demandDelta);
      const supply = clampCrowd(params.baseSupply + headline.supplyDelta);
      const total = demand + supply;
      const imbalance = total === 0 ? 0 : (demand - supply) / total;
      const u = rng(); // exactly one draw per played Round
      const rawNext = price * (1 + params.sensitivity * imbalance + (2 * u - 1) * params.noise);
      const priceAfterCents = Math.max(1, Math.round(rawNext));
      const direction: 'up' | 'down' = priceAfterCents >= price ? 'up' : 'down';

      // A missing prediction is `undefined`, which never equals 'up'/'down', so
      // the round is counted incorrect rather than skipped (requirements 5.1, 5.2).
      if (choice.prediction === direction) correct += 1;

      directions.push(direction);
      prices.push(priceAfterCents);
      price = priceAfterCents;
    }

    const total = choices.length;
    return {
      directions,
      prices,
      correct,
      total,
      score: expectedScore(correct, total),
      finalPriceCents: total === 0 ? params.startPriceCents : price,
      summary: expectedSummary(correct, total),
    };
  }

  /**
   * Assert `scoreAuction` matches the independent oracle on every reported field
   * for one (params, choices, seed) case. `label` identifies the case (seed or
   * fixture) so a failure can be replayed. Shared by boundary fixtures and
   * generated cases.
   */
  function checkCase(
    params: AuctionParams,
    choices: readonly AuctionChoice[],
    seed: number,
    label: string,
  ): void {
    const result = scoreAuction(params, choices, mulberry32(seed));
    const oracle = referenceReplay(params, choices, seed);
    const detail =
      `${label}\n` +
      `seed=${seed} choices=${JSON.stringify(choices)}\n` +
      `module: total=${result.total} correct=${result.correct} score=${result.score} ` +
      `final=${result.finalPriceCents}\n` +
      `oracle: total=${oracle.total} correct=${oracle.correct} score=${oracle.score} ` +
      `final=${oracle.finalPriceCents}`;

    // total === choices.length: every provided choice plays exactly one Round.
    if (result.total !== oracle.total) {
      throw new Error(`${detail}\nexpected total ${oracle.total} but got ${result.total}`);
    }
    expect(result.total).toBe(choices.length);
    expect(result.rounds).toHaveLength(choices.length);

    // Exact correct count: matches the oracle's prediction-vs-direction tally,
    // with a missing prediction counted incorrect (requirements 5.1, 5.2).
    if (result.correct !== oracle.correct) {
      throw new Error(`${detail}\nexpected correct ${oracle.correct} but got ${result.correct}`);
    }

    // Per-round directions and carried prices match the oracle exactly, so the
    // grading is anchored to the real computed Price_Direction, not luck.
    expect(result.rounds.map((r) => r.direction)).toEqual(oracle.directions);
    expect(result.rounds.map((r) => r.priceAfterCents)).toEqual(oracle.prices);

    // Score is the clamped, rounded integer share (requirements 5.3, 5.5).
    if (result.score !== oracle.score) {
      throw new Error(`${detail}\nexpected score ${oracle.score} but got ${result.score}`);
    }
    expect(Number.isInteger(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);

    // Final price is the last round's price, or the start price for an empty run.
    if (result.finalPriceCents !== oracle.finalPriceCents) {
      throw new Error(
        `${detail}\nexpected finalPriceCents ${oracle.finalPriceCents} but got ${result.finalPriceCents}`,
      );
    }

    // Summary reports the exact counts with the correct singular/plural copy
    // (requirement 5.4).
    if (result.summary !== oracle.summary) {
      throw new Error(
        `${detail}\nexpected summary ${JSON.stringify(oracle.summary)} but got ${JSON.stringify(result.summary)}`,
      );
    }
    expect(result.summary).toContain(`${result.correct} of ${result.total}`);
  }

  /**
   * Build schema-valid params with `headlineCount` (2..4) headlines spanning
   * clearly bullish, bearish, and flat deltas, so generated choice sequences hit
   * genuine increases, decreases, and ties. Noise is on so the seed actually
   * matters to the price path.
   */
  function makeParams(
    rng: () => number,
    headlineCount: number,
  ): AuctionParams {
    const headlines = Array.from({ length: headlineCount }, (_unused, i) => {
      // Rotate through bull / bear / flat deltas so the deck is not one-sided.
      const kind = i % 3;
      const demandDelta = kind === 0 ? randomInt(rng, 1, P7_MAX_DELTA) : 0;
      const supplyDelta = kind === 1 ? randomInt(rng, 1, P7_MAX_DELTA) : 0;
      return { id: `h${i}`, text: `Headline ${i}`, demandDelta, supplyDelta };
    });

    return parseAuctionParams({
      startPriceCents: randomInt(rng, 100, 1_000_000),
      baseDemand: randomInt(rng, 0, 1000),
      baseSupply: randomInt(rng, 0, 1000),
      sensitivity: 0.1 + rng() * 0.9, // [0.1, 1.0]
      noise: rng() * 0.1, // seed genuinely matters
      rounds: headlineCount, // not used by scoreAuction, kept valid
      headlines,
    });
  }

  it('grades and reports explicit fixtures: empty, all-missing, all-correct, all-incorrect', () => {
    // A fixed, no-noise deck with an unambiguous bull and bear card so the
    // computed direction is predictable for the all-correct/all-incorrect cases.
    const params = parseAuctionParams({
      startPriceCents: 10000,
      baseDemand: 50,
      baseSupply: 50,
      sensitivity: 0.3,
      noise: 0,
      rounds: 3,
      headlines: [
        { id: 'bull', text: 'Great earnings', demandDelta: 400, supplyDelta: 0 },
        { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 400 },
      ],
    });
    const seed = 4242;

    // Empty sequence: no rounds played -> total 0, score 0, final = start price,
    // singular/plural copy uses "times" for zero (requirement 5.5).
    const empty = scoreAuction(params, [], mulberry32(seed));
    expect(empty.total).toBe(0);
    expect(empty.correct).toBe(0);
    expect(empty.score).toBe(0);
    expect(empty.finalPriceCents).toBe(params.startPriceCents);
    expect(empty.summary).toBe('You read the market right 0 of 0 times.');
    checkCase(params, [], seed, 'fixture:empty-sequence');

    // All-missing-prediction sequence: every round plays and advances the price,
    // but with no committed prediction none can be correct (requirement 5.2).
    const allMissing: AuctionChoice[] = [
      { headlineId: 'bull' },
      { headlineId: 'bear' },
      { headlineId: 'bull' },
    ];
    const missing = scoreAuction(params, allMissing, mulberry32(seed));
    expect(missing.total).toBe(3);
    expect(missing.correct).toBe(0);
    expect(missing.score).toBe(0);
    checkCase(params, allMissing, seed, 'fixture:all-missing-prediction');

    // All-correct: the bull card (demand dominates) always moves up and the bear
    // card (supply dominates) always moves down with noise off, so predicting the
    // true direction every round scores a perfect 100.
    const allCorrect: AuctionChoice[] = [
      { headlineId: 'bull', prediction: 'up' },
      { headlineId: 'bear', prediction: 'down' },
      { headlineId: 'bull', prediction: 'up' },
    ];
    const correctRun = scoreAuction(params, allCorrect, mulberry32(seed));
    expect(correctRun.total).toBe(3);
    expect(correctRun.correct).toBe(3);
    expect(correctRun.score).toBe(100);
    checkCase(params, allCorrect, seed, 'fixture:all-correct');

    // All-incorrect: predicting the opposite of the true move every round scores
    // 0 (requirement 5.3's clamp lower bound exercised at the extreme).
    const allIncorrect: AuctionChoice[] = [
      { headlineId: 'bull', prediction: 'down' },
      { headlineId: 'bear', prediction: 'up' },
      { headlineId: 'bull', prediction: 'down' },
    ];
    const incorrectRun = scoreAuction(params, allIncorrect, mulberry32(seed));
    expect(incorrectRun.total).toBe(3);
    expect(incorrectRun.correct).toBe(0);
    expect(incorrectRun.score).toBe(0);
    checkCase(params, allIncorrect, seed, 'fixture:all-incorrect');

    // Single round: summary uses the singular "time" (requirement 5.4).
    const single = scoreAuction(params, [{ headlineId: 'bull', prediction: 'up' }], mulberry32(seed));
    expect(single.total).toBe(1);
    expect(single.summary).toBe('You read the market right 1 of 1 time.');
    checkCase(params, [{ headlineId: 'bull', prediction: 'up' }], seed, 'fixture:single-round-singular-copy');
  });

  it('matches the independent oracle across at least 100 generated choice sequences', () => {
    const CASE_COUNT = 200;
    // Track that generated runs span the full correctness spectrum (some zero,
    // some perfect, and mixed), and that missing predictions were exercised.
    let sawZeroCorrect = false;
    let sawAllCorrect = false;
    let sawMissingPrediction = false;

    for (let i = 0; i < CASE_COUNT; i++) {
      // Each case is seeded by its index so a failure replays with mulberry32(i).
      const genSeed = i;
      const gen = mulberry32(genSeed);

      // A uint32 seed for the run, drawn across the full valid range so grading
      // is checked against many distinct price paths.
      const runSeed = randomInt(gen, 0, P7_MAX_SEED);

      const headlineCount = randomInt(gen, 2, 4);
      const params = makeParams(gen, headlineCount);

      // A choice sequence of 0..6 rounds. Each choice references a real authored
      // headline; its prediction is 'up', 'down', or omitted (missing), so the
      // grading of present-and-correct, present-and-wrong, and absent predictions
      // is all exercised.
      const roundCount = randomInt(gen, 0, 6);
      const choices: AuctionChoice[] = Array.from({ length: roundCount }, () => {
        const headlineId = `h${randomInt(gen, 0, headlineCount - 1)}`;
        const roll = randomInt(gen, 0, 2); // 0 -> up, 1 -> down, 2 -> missing
        if (roll === 2) {
          sawMissingPrediction = true;
          return { headlineId };
        }
        return { headlineId, prediction: roll === 0 ? 'up' : 'down' };
      });

      checkCase(params, choices, runSeed, `generated case (replay with mulberry32(${genSeed}))`);

      // Record the correctness spread for the coverage assertions below.
      const oracle = referenceReplay(params, choices, runSeed);
      if (oracle.total > 0 && oracle.correct === 0) sawZeroCorrect = true;
      if (oracle.total > 0 && oracle.correct === oracle.total) sawAllCorrect = true;
    }

    // The generator genuinely exercised the grading spectrum, so the oracle match
    // above was not trivially over one kind of run.
    expect(sawZeroCorrect).toBe(true);
    expect(sawAllCorrect).toBe(true);
    expect(sawMissingPrediction).toBe(true);
  });
});

// Feature: interactive-auction-room, Property 8: Fixed-seed replay is identical
//
// For all schema-valid params, every uint32 Seed, and every sequence of learner
// choices referencing authored headlines, two independent `scoreAuction` calls
// made with FRESH `mulberry32(seed)` generators produce deeply equal results
// (requirements 6.1, 6.3): the same per-Round outcomes (priceBeforeCents,
// priceAfterCents, direction, demand, supply), the same correct count, the same
// total, the same clamped integer score, the same finalPriceCents, and the same
// summary copy. Because the two runs share nothing but the Seed value — each
// builds its own PRNG — identical output proves the lab draws all randomness
// exclusively from the Seed and reads no ambient entropy (clock, Math.random):
// a hidden entropy source would make the second run diverge.
//
// As a sanity contrast (requirement 6.1), when noise is on, two runs with
// DIFFERENT seeds are expected to diverge on at least one price path, so the
// equality above is a real determinism guarantee and not a degenerate case where
// the Seed is ignored.
//
// Cases are generated dependency-free with the existing `mulberry32`/`randomInt`
// RNG (no fast-check); each case is seeded by its index so a failure replays
// with mulberry32(seed). The generation seed is printed on any failure.
describe('scoreAuction — Property 8: fixed-seed replay is identical', () => {
  const P8_MAX_DELTA = 1_000_000;
  const P8_MAX_SEED = 4_294_967_295;

  /**
   * Assert two independent `scoreAuction` runs — each with its OWN fresh
   * `mulberry32(seed)` — are deeply equal on every reported field for one
   * (params, choices, seed) case. `label` identifies the case (seed or fixture)
   * so a failure can be replayed. The two generators share only the Seed number;
   * identical output is the determinism guarantee (requirement 6.3).
   */
  function checkReplayIdentical(
    params: AuctionParams,
    choices: readonly AuctionChoice[],
    seed: number,
    label: string,
  ): void {
    // Two FRESH generators from the same Seed value, built independently.
    const first = scoreAuction(params, choices, mulberry32(seed));
    const second = scoreAuction(params, choices, mulberry32(seed));

    const detail =
      `${label}\n` +
      `seed=${seed} choices=${JSON.stringify(choices)}\n` +
      `first:  final=${first.finalPriceCents} correct=${first.correct} score=${first.score}\n` +
      `second: final=${second.finalPriceCents} correct=${second.correct} score=${second.score}`;

    // The whole AuctionResult is deeply equal: rounds (prices, directions,
    // demand, supply), counts, score, final price, and summary (requirement 6.3).
    try {
      expect(second).toEqual(first);
    } catch {
      throw new Error(`${detail}\nexpected the two fixed-seed replays to be deeply equal`);
    }

    // Spell out the key fields individually so a divergence names what differed.
    expect(second.rounds.map((r) => r.priceBeforeCents)).toEqual(
      first.rounds.map((r) => r.priceBeforeCents),
    );
    expect(second.rounds.map((r) => r.priceAfterCents)).toEqual(
      first.rounds.map((r) => r.priceAfterCents),
    );
    expect(second.rounds.map((r) => r.direction)).toEqual(first.rounds.map((r) => r.direction));
    expect(second.rounds.map((r) => r.demand)).toEqual(first.rounds.map((r) => r.demand));
    expect(second.rounds.map((r) => r.supply)).toEqual(first.rounds.map((r) => r.supply));
    expect(second.correct).toBe(first.correct);
    expect(second.total).toBe(first.total);
    expect(second.score).toBe(first.score);
    expect(second.finalPriceCents).toBe(first.finalPriceCents);
    expect(second.summary).toBe(first.summary);
  }

  /**
   * Build schema-valid params with `headlineCount` (2..4) headlines spanning
   * bullish, bearish, and flat deltas so generated choice sequences hit genuine
   * increases, decreases, and ties. Noise is on so the Seed actually drives the
   * price path, making the fixed-seed equality a meaningful determinism check.
   */
  function makeParams(rng: () => number, headlineCount: number): AuctionParams {
    const headlines = Array.from({ length: headlineCount }, (_unused, i) => {
      const kind = i % 3; // rotate bull / bear / flat so the deck is not one-sided
      const demandDelta = kind === 0 ? randomInt(rng, 1, P8_MAX_DELTA) : 0;
      const supplyDelta = kind === 1 ? randomInt(rng, 1, P8_MAX_DELTA) : 0;
      return { id: `h${i}`, text: `Headline ${i}`, demandDelta, supplyDelta };
    });

    return parseAuctionParams({
      startPriceCents: randomInt(rng, 100, 1_000_000),
      baseDemand: randomInt(rng, 0, 1000),
      baseSupply: randomInt(rng, 0, 1000),
      sensitivity: 0.1 + rng() * 0.9, // [0.1, 1.0]
      noise: 0.01 + rng() * 0.09, // [0.01, 0.1] — noise genuinely on, so the Seed matters
      rounds: headlineCount, // not used by scoreAuction, kept valid
      headlines,
    });
  }

  it('replays identically for explicit fixtures: empty, single-round, and a multi-round run with noise on', () => {
    // A fixed deck with an unambiguous bull and bear card. Noise is on so the
    // price path depends on the Seed; the two replays must still match exactly.
    const params = parseAuctionParams({
      startPriceCents: 10000,
      baseDemand: 50,
      baseSupply: 50,
      sensitivity: 0.3,
      noise: 0.05,
      rounds: 3,
      headlines: [
        { id: 'bull', text: 'Great earnings', demandDelta: 400, supplyDelta: 0 },
        { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 400 },
      ],
    });

    // Empty sequence: no rounds, but the two empty results are still deeply equal.
    checkReplayIdentical(params, [], 2024, 'fixture:empty-sequence');

    // Single round (singular summary copy carried identically).
    checkReplayIdentical(
      params,
      [{ headlineId: 'bull', prediction: 'up' }],
      2024,
      'fixture:single-round',
    );

    // Multi-round run mixing present and missing predictions and both cards.
    checkReplayIdentical(
      params,
      [
        { headlineId: 'bull', prediction: 'up' },
        { headlineId: 'bear', prediction: 'down' },
        { headlineId: 'bull' }, // missing prediction still replays identically
      ],
      987654321,
      'fixture:multi-round-mixed',
    );

    // The boundary Seeds (0 and the uint32 max) also replay identically.
    checkReplayIdentical(params, [{ headlineId: 'bull', prediction: 'up' }], 0, 'fixture:seed-zero');
    checkReplayIdentical(
      params,
      [{ headlineId: 'bear', prediction: 'down' }],
      P8_MAX_SEED,
      'fixture:seed-uint32-max',
    );
  });

  it('replays identically across at least 100 generated params, seeds, and choice sequences', () => {
    const CASE_COUNT = 200;
    // Track that generated runs exercise non-trivial, multi-round sequences and
    // that missing predictions are included, so the equality is not over only
    // empty or single-round runs.
    let sawMultiRound = false;
    let sawMissingPrediction = false;

    for (let i = 0; i < CASE_COUNT; i++) {
      // Each case is seeded by its index so a failure replays with mulberry32(i).
      const genSeed = i;
      const gen = mulberry32(genSeed);

      // A uint32 run Seed drawn across the full valid range.
      const runSeed = randomInt(gen, 0, P8_MAX_SEED);

      const headlineCount = randomInt(gen, 2, 4);
      const params = makeParams(gen, headlineCount);

      // A choice sequence of 0..6 rounds. Each choice references a real authored
      // headline; its prediction is 'up', 'down', or omitted (missing).
      const roundCount = randomInt(gen, 0, 6);
      if (roundCount >= 2) sawMultiRound = true;
      const choices: AuctionChoice[] = Array.from({ length: roundCount }, () => {
        const headlineId = `h${randomInt(gen, 0, headlineCount - 1)}`;
        const roll = randomInt(gen, 0, 2); // 0 -> up, 1 -> down, 2 -> missing
        if (roll === 2) {
          sawMissingPrediction = true;
          return { headlineId };
        }
        return { headlineId, prediction: roll === 0 ? 'up' : 'down' };
      });

      checkReplayIdentical(
        params,
        choices,
        runSeed,
        `generated case (replay with mulberry32(${genSeed}))`,
      );
    }

    // The generator genuinely exercised multi-round runs and missing predictions,
    // so the fixed-seed equality above was not trivially over degenerate cases.
    expect(sawMultiRound).toBe(true);
    expect(sawMissingPrediction).toBe(true);
  });

  it('produces a different price path for a different seed when noise is on (sanity contrast)', () => {
    // The complement of the determinism guarantee (requirement 6.1): with noise
    // on, changing ONLY the Seed must be able to change the price path. If it
    // could not, the fixed-seed equality above would be a degenerate result of
    // the Seed being ignored. We scan a handful of distinct seed pairs and
    // require at least one divergence, which is overwhelmingly likely with a
    // multi-round noisy run.
    const params = parseAuctionParams({
      startPriceCents: 10000,
      baseDemand: 50,
      baseSupply: 50,
      sensitivity: 0.3,
      noise: 0.08,
      rounds: 4,
      headlines: [
        { id: 'bull', text: 'Great earnings', demandDelta: 400, supplyDelta: 0 },
        { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 400 },
      ],
    });
    const choices: AuctionChoice[] = [
      { headlineId: 'bull', prediction: 'up' },
      { headlineId: 'bear', prediction: 'down' },
      { headlineId: 'bull', prediction: 'up' },
      { headlineId: 'bear', prediction: 'down' },
    ];

    const pathFor = (seed: number): number[] =>
      scoreAuction(params, choices, mulberry32(seed)).rounds.map((r) => r.priceAfterCents);

    const baseline = pathFor(1);
    const sawDifferentPath = [2, 3, 4, 5, 6, 7, 8, 9].some(
      (seed) => JSON.stringify(pathFor(seed)) !== JSON.stringify(baseline),
    );
    expect(sawDifferentPath).toBe(true);
  });
});
// Feature: interactive-auction-room, Property 9: Unknown headline choices fail explicitly
//
// For all schema-valid params and every learner choice sequence that references
// a Headline_Card id NOT present in the authored `params.headlines`, calling
// `scoreAuction` raises an error whose message CONTAINS the exact unknown id
// (requirement 9.4). The failure is explicit, not silent: the unknown choice is
// never skipped, never substituted with a valid card, and never allowed to draw
// a round result. Because the throw aborts the replay mid-stream:
//   - `scoreAuction` returns no value at all (it throws, so there is no
//     AuctionResult and no round outcome is produced for the bad choice), and
//   - the shared seeded rng is drawn EXACTLY once per valid choice processed
//     BEFORE the unknown id and NOT for the unknown id itself. A counting rng
//     wrapper proves the draw count equals the number of leading valid choices,
//     so the bad round consumed no randomness.
//
// The unknown id is placed at the first, middle, or last position of a choice
// sequence so the abort is exercised with zero, some, and all-but-one leading
// valid choices. Each generated id is drawn to be guaranteed disjoint from the
// authored id set (authored ids are the fixed shape `h0..h{n-1}`; generated
// unknown ids use a `ghost:` prefix the authored ids can never take), so the
// case is a genuine unknown-headline failure and not an accidental collision.
//
// Cases are generated dependency-free with the existing `mulberry32`/`randomInt`
// RNG (no fast-check); each case is seeded by its index so a failure replays
// with mulberry32(seed). The generation seed is printed on any failure.
describe('scoreAuction — Property 9: unknown headline choices fail explicitly', () => {
  const P9_MAX_DELTA = 1_000_000;
  const P9_MAX_SEED = 4_294_967_295;

  /**
   * A counting rng wrapper over an inner generator. Every call advances the
   * inner stream (so the price path is unaffected) and increments the draw
   * tally, letting the test assert exactly how many draws `scoreAuction` made
   * before the unknown-headline throw aborted the replay.
   */
  function countingRng(inner: () => number): { rng: () => number; count: () => number } {
    let draws = 0;
    return {
      rng: () => {
        draws += 1;
        return inner();
      },
      count: () => draws,
    };
  }

  /**
   * Build schema-valid params with `headlineCount` (2..4) authored headlines
   * whose ids are the fixed shape `h0..h{n-1}`. Deltas rotate through bull /
   * bear / flat so the leading valid choices genuinely move the price. The
   * authored id shape is what the generated unknown ids are kept disjoint from.
   */
  function makeParams(rng: () => number, headlineCount: number): AuctionParams {
    const headlines = Array.from({ length: headlineCount }, (_unused, i) => {
      const kind = i % 3; // rotate bull / bear / flat so the deck is not one-sided
      const demandDelta = kind === 0 ? randomInt(rng, 1, P9_MAX_DELTA) : 0;
      const supplyDelta = kind === 1 ? randomInt(rng, 1, P9_MAX_DELTA) : 0;
      return { id: `h${i}`, text: `Headline ${i}`, demandDelta, supplyDelta };
    });

    return parseAuctionParams({
      startPriceCents: randomInt(rng, 100, 1_000_000),
      baseDemand: randomInt(rng, 0, 1000),
      baseSupply: randomInt(rng, 0, 1000),
      sensitivity: 0.1 + rng() * 0.9, // [0.1, 1.0]
      noise: rng() * 0.1, // noise on so each valid draw genuinely matters
      rounds: headlineCount, // not used by scoreAuction, kept valid
      headlines,
    });
  }

  /**
   * Produce an unknown headline id guaranteed disjoint from the authored set.
   * Authored ids are always `h<number>`; prefixing with `ghost:` and appending a
   * random suffix yields an id that can never match an authored one, so the
   * resulting choice is a real unknown-headline reference.
   */
  function makeUnknownId(rng: () => number, authoredIds: ReadonlySet<string>): string {
    let id = `ghost:${randomInt(rng, 0, 1_000_000)}`;
    // Defensive: the `ghost:` prefix already makes a collision impossible against
    // `h<number>` ids, but keep drawing if an authored id ever shared the shape.
    while (authoredIds.has(id)) id = `ghost:${randomInt(rng, 0, 1_000_000)}`;
    return id;
  }

  /**
   * Assert one case fails explicitly: `scoreAuction` throws, the thrown message
   * contains the exact unknown id, no result/round is produced for the bad
   * choice, and the rng was drawn exactly `expectedDraws` times — one per valid
   * choice processed before the unknown id, and none for the unknown id itself.
   * `label` identifies the case so a failure can be replayed.
   */
  function checkUnknownFails(
    params: AuctionParams,
    choices: readonly AuctionChoice[],
    unknownId: string,
    expectedDraws: number,
    seed: number,
    label: string,
  ): void {
    const { rng, count } = countingRng(mulberry32(seed));

    const detail =
      `${label}\n` +
      `seed=${seed} unknownId=${JSON.stringify(unknownId)} ` +
      `expectedDraws=${expectedDraws} choices=${JSON.stringify(choices)}`;

    // The replay throws (it does not return an AuctionResult): the unknown choice
    // is never skipped or substituted (requirement 9.4). Capture the thrown error
    // so its message can be inspected for the exact id.
    let thrown: unknown;
    let returned: unknown;
    try {
      returned = scoreAuction(params, choices, rng);
    } catch (error) {
      thrown = error;
    }

    if (thrown === undefined) {
      throw new Error(
        `${detail}\nexpected scoreAuction to throw on the unknown headline but it returned ${JSON.stringify(returned)}`,
      );
    }

    // No round result is produced — the throw aborts before any value is
    // returned, so there is no AuctionResult for the aborted run.
    expect(returned).toBeUndefined();

    // The message identifies the unknown card by its exact id (requirement 9.4).
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    if (!message.includes(unknownId)) {
      throw new Error(
        `${detail}\nexpected the error message to contain the exact unknown id ${JSON.stringify(unknownId)} but got: ${message}`,
      );
    }

    // Exactly one draw per valid choice BEFORE the unknown id, and none for the
    // unknown choice: the bad round drew no randomness before aborting.
    if (count() !== expectedDraws) {
      throw new Error(
        `${detail}\nexpected ${expectedDraws} rng draw(s) before the abort but counted ${count()}`,
      );
    }
    expect(count()).toBe(expectedDraws);
  }

  it('fails explicitly for fixtures with the unknown id first, middle, and last', () => {
    const params = parseAuctionParams({
      startPriceCents: 10000,
      baseDemand: 50,
      baseSupply: 50,
      sensitivity: 0.3,
      noise: 0.05,
      rounds: 3,
      headlines: [
        { id: 'h0', text: 'Great earnings', demandDelta: 400, supplyDelta: 0 },
        { id: 'h1', text: 'Factory fire', demandDelta: 0, supplyDelta: 400 },
      ],
    });
    const ghost = 'ghost:does-not-exist';
    const seed = 9999;

    // First position: zero leading valid choices -> zero draws before the abort.
    checkUnknownFails(
      params,
      [{ headlineId: ghost, prediction: 'up' }, { headlineId: 'h0', prediction: 'up' }],
      ghost,
      0,
      seed,
      'fixture:unknown-first',
    );

    // Middle position: one leading valid choice -> exactly one draw before abort.
    checkUnknownFails(
      params,
      [
        { headlineId: 'h0', prediction: 'up' },
        { headlineId: ghost, prediction: 'down' },
        { headlineId: 'h1', prediction: 'down' },
      ],
      ghost,
      1,
      seed,
      'fixture:unknown-middle',
    );

    // Last position: two leading valid choices -> exactly two draws before abort.
    checkUnknownFails(
      params,
      [
        { headlineId: 'h0', prediction: 'up' },
        { headlineId: 'h1', prediction: 'down' },
        { headlineId: ghost },
      ],
      ghost,
      2,
      seed,
      'fixture:unknown-last',
    );

    // A lone unknown choice also fails explicitly with zero draws.
    checkUnknownFails(params, [{ headlineId: ghost, prediction: 'up' }], ghost, 0, seed, 'fixture:unknown-only');
  });

  it('fails explicitly across at least 100 generated cases disjoint from the authored id set', () => {
    const CASE_COUNT = 200;
    // Track that the unknown id landed at the first, a middle, and the last
    // position across the run, so the abort is exercised with zero, some, and
    // all-but-one leading valid choices rather than only one position.
    let sawFirst = false;
    let sawMiddle = false;
    let sawLast = false;

    for (let i = 0; i < CASE_COUNT; i++) {
      // Each case is seeded by its index so a failure replays with mulberry32(i).
      const genSeed = i;
      const gen = mulberry32(genSeed);

      // A uint32 run seed drawn across the full valid range for the price path.
      const runSeed = randomInt(gen, 0, P9_MAX_SEED);

      const headlineCount = randomInt(gen, 2, 4);
      const params = makeParams(gen, headlineCount);
      const authoredIds = new Set(params.headlines.map((h) => h.id));

      // 1..5 leading VALID choices, each referencing a real authored headline.
      // These are the only choices that may draw before the abort.
      const validCount = randomInt(gen, 1, 5);
      const validChoices: AuctionChoice[] = Array.from({ length: validCount }, () => {
        const headlineId = `h${randomInt(gen, 0, headlineCount - 1)}`;
        const roll = randomInt(gen, 0, 2); // 0 -> up, 1 -> down, 2 -> missing
        if (roll === 2) return { headlineId };
        return { headlineId, prediction: roll === 0 ? 'up' : 'down' };
      });

      // A single unknown choice, guaranteed disjoint from the authored id set.
      const unknownId = makeUnknownId(gen, authoredIds);
      expect(authoredIds.has(unknownId)).toBe(false);
      const unknownChoice: AuctionChoice =
        randomInt(gen, 0, 1) === 0 ? { headlineId: unknownId, prediction: 'up' } : { headlineId: unknownId };

      // Insert the unknown choice at the first, a middle, or the last position.
      // The number of VALID choices before it is exactly the expected draw count.
      const position = randomInt(gen, 0, validChoices.length); // 0..validCount
      if (position === 0) sawFirst = true;
      else if (position === validChoices.length) sawLast = true;
      else sawMiddle = true;

      const choices: AuctionChoice[] = [
        ...validChoices.slice(0, position),
        unknownChoice,
        ...validChoices.slice(position),
      ];
      const expectedDraws = position; // one draw per valid choice before the unknown id

      checkUnknownFails(
        params,
        choices,
        unknownId,
        expectedDraws,
        runSeed,
        `generated case (replay with mulberry32(${genSeed}))`,
      );
    }

    // The generator genuinely placed the unknown id at the first, a middle, and
    // the last position, so the abort was exercised across the full spectrum of
    // leading-valid-choice counts and not just one position.
    expect(sawFirst).toBe(true);
    expect(sawMiddle).toBe(true);
    expect(sawLast).toBe(true);
  });
});

// Focused scoring and replay regressions (task 3.5).
//
// Example-based coverage of the replay/grading corners the generated Property
// 7/8/9 tests sample broadly, pinned by name so a regression says exactly which
// behavior broke (requirements 1.5, 5.1, 5.2, 5.3, 5.4, 5.5, 6.3, 6.4, 9.4):
//
//   scoreAuction — an absent prediction still applies its headline, consumes
//                  exactly one rng draw, produces a round result, and is counted
//                  incorrect (requirements 5.1, 5.2, 5.5, 6.4); singular/plural
//                  summary copy for 0/1/2+ rounds (requirement 5.4); the empty
//                  replay (requirements 5.3, 5.5); the 0 and 100 score bounds
//                  plus an integer in between (requirement 5.3); the multi-round
//                  price carry (requirement 1.5); the explicit unknown-id throw
//                  (requirement 9.4); and the established same-seed/different-seed
//                  determinism contrast (requirement 6.3).

/** A clear bull/bear deck with noise off, so the headline alone decides direction. */
function replayRegParams(overrides: Partial<AuctionParams> = {}): AuctionParams {
  return parseAuctionParams({
    startPriceCents: 10000, // $100
    baseDemand: 50,
    baseSupply: 50,
    sensitivity: 0.3,
    noise: 0,
    rounds: 3,
    headlines: [
      { id: 'bull', text: 'Great earnings', demandDelta: 400, supplyDelta: 0 },
      { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 400 },
    ],
    ...overrides,
  });
}

describe('scoreAuction — absent prediction still advances exactly one draw (requirements 5.2, 5.5, 6.4)', () => {
  it('applies the headline, draws the rng exactly once, produces a round, and counts it incorrect', () => {
    // A single choice with NO committed prediction. Noise is on so the one draw
    // genuinely participates in the price path (not a no-op), letting the count
    // prove the missing-prediction round still consumed exactly one draw.
    const params = replayRegParams({ noise: 0.05 });

    let draws = 0;
    const countingRng = () => {
      draws += 1;
      // Forward a fixed value so the stream is deterministic; only the count
      // matters here.
      return 0.5;
    };

    const result = scoreAuction(params, [{ headlineId: 'bull' }], countingRng);

    // Exactly one round was played and exactly one draw was consumed, even
    // though the prediction was absent (requirement 6.4).
    expect(draws).toBe(1);
    expect(result.total).toBe(1);
    expect(result.rounds).toHaveLength(1);

    // The headline was actually applied: the round carries the before price and
    // the derived crowd totals (bull: demand 450, supply 50) rather than being
    // skipped.
    expect(result.rounds[0].priceBeforeCents).toBe(params.startPriceCents);
    expect(result.rounds[0].demand).toBe(450);
    expect(result.rounds[0].supply).toBe(50);

    // A missing prediction can never match the computed direction, so the round
    // is counted incorrect and the score is 0 (requirements 5.2, 5.5).
    expect(result.correct).toBe(0);
    expect(result.score).toBe(0);
  });

  it('still advances the price path for a missing-prediction round the same as a predicted one', () => {
    // The price path must not depend on whether a prediction was committed: a
    // round with a missing prediction and a round with a prediction, same seed
    // and same headline, produce the identical price. Only the grading differs.
    const params = replayRegParams({ noise: 0.05 });

    const withPrediction = scoreAuction(params, [{ headlineId: 'bull', prediction: 'up' }], mulberry32(55));
    const withoutPrediction = scoreAuction(params, [{ headlineId: 'bull' }], mulberry32(55));

    // Identical price path and round outcome...
    expect(withoutPrediction.rounds[0].priceAfterCents).toBe(withPrediction.rounds[0].priceAfterCents);
    expect(withoutPrediction.finalPriceCents).toBe(withPrediction.finalPriceCents);

    // ...but the missing prediction is never counted correct, whereas the
    // committed (and here correct) prediction is.
    expect(withPrediction.correct).toBe(1);
    expect(withoutPrediction.correct).toBe(0);
  });
});

describe('scoreAuction — singular/plural summary copy (requirement 5.4)', () => {
  const params = replayRegParams();
  const seed = 7;

  it('uses the plural "times" for an empty run (0 rounds)', () => {
    const result = scoreAuction(params, [], mulberry32(seed));
    expect(result.total).toBe(0);
    expect(result.summary).toBe('You read the market right 0 of 0 times.');
  });

  it('uses the singular "time" for exactly one round', () => {
    const result = scoreAuction(params, [{ headlineId: 'bull', prediction: 'up' }], mulberry32(seed));
    expect(result.total).toBe(1);
    expect(result.summary).toBe('You read the market right 1 of 1 time.');
  });

  it('uses the plural "times" for two rounds', () => {
    const result = scoreAuction(
      params,
      [
        { headlineId: 'bull', prediction: 'up' },
        { headlineId: 'bear', prediction: 'down' },
      ],
      mulberry32(seed),
    );
    expect(result.total).toBe(2);
    expect(result.summary).toBe('You read the market right 2 of 2 times.');
  });

  it('uses the plural "times" for several rounds and reports the exact correct count', () => {
    // Three rounds, two correct: the copy stays plural and names the real tally.
    const result = scoreAuction(
      params,
      [
        { headlineId: 'bull', prediction: 'up' }, // correct
        { headlineId: 'bear', prediction: 'up' }, // wrong (price falls)
        { headlineId: 'bull', prediction: 'up' }, // correct
      ],
      mulberry32(seed),
    );
    expect(result.total).toBe(3);
    expect(result.correct).toBe(2);
    expect(result.summary).toBe('You read the market right 2 of 3 times.');
  });
});

describe('scoreAuction — empty replay (requirements 5.3, 5.5)', () => {
  it('plays no rounds: total 0, correct 0, score 0, final price equals the start price', () => {
    const params = replayRegParams({ startPriceCents: 12345 });
    const result = scoreAuction(params, [], mulberry32(1));
    expect(result.rounds).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.correct).toBe(0);
    expect(result.score).toBe(0);
    // No round moved the price, so the final price is the authored start price.
    expect(result.finalPriceCents).toBe(params.startPriceCents);
  });
});

describe('scoreAuction — score bounds and integer share (requirement 5.3)', () => {
  // Noise off and an unambiguous bull/bear deck, so predicting the true move is
  // always right and predicting the opposite is always wrong — making the 100
  // and 0 extremes exact and reproducible.
  const params = replayRegParams();
  const seed = 11;

  it('scores a perfect run as 100', () => {
    const result = scoreAuction(
      params,
      [
        { headlineId: 'bull', prediction: 'up' },
        { headlineId: 'bear', prediction: 'down' },
        { headlineId: 'bull', prediction: 'up' },
      ],
      mulberry32(seed),
    );
    expect(result.correct).toBe(3);
    expect(result.score).toBe(100);
  });

  it('scores an all-wrong run as 0', () => {
    const result = scoreAuction(
      params,
      [
        { headlineId: 'bull', prediction: 'down' },
        { headlineId: 'bear', prediction: 'up' },
        { headlineId: 'bull', prediction: 'down' },
      ],
      mulberry32(seed),
    );
    expect(result.correct).toBe(0);
    expect(result.score).toBe(0);
  });

  it('rounds a partial run to the nearest integer in 0..100', () => {
    // Two of three correct -> round(2/3 * 100) = 67, an integer strictly between
    // the bounds.
    const result = scoreAuction(
      params,
      [
        { headlineId: 'bull', prediction: 'up' }, // correct
        { headlineId: 'bear', prediction: 'up' }, // wrong
        { headlineId: 'bull', prediction: 'up' }, // correct
      ],
      mulberry32(seed),
    );
    expect(result.correct).toBe(2);
    expect(result.total).toBe(3);
    expect(result.score).toBe(67);
    expect(Number.isInteger(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe('scoreAuction — multi-round price carry across several rounds (requirement 1.5)', () => {
  it('carries each round price into the next and ends on the last round price', () => {
    // Five rounds with noise on, so the carried price genuinely changes each
    // round and the chaining is non-trivial.
    const params = replayRegParams({ noise: 0.05, rounds: 5 });
    const choices: AuctionChoice[] = [
      { headlineId: 'bull', prediction: 'up' },
      { headlineId: 'bear', prediction: 'down' },
      { headlineId: 'bull', prediction: 'up' },
      { headlineId: 'bear', prediction: 'down' },
      { headlineId: 'bull', prediction: 'up' },
    ];
    const result = scoreAuction(params, choices, mulberry32(321));

    expect(result.rounds).toHaveLength(5);

    // The first round starts at the authored start price.
    expect(result.rounds[0].priceBeforeCents).toBe(params.startPriceCents);

    // Every later round opens at exactly the previous round's closing price.
    for (let i = 1; i < result.rounds.length; i++) {
      expect(result.rounds[i].priceBeforeCents).toBe(result.rounds[i - 1].priceAfterCents);
    }

    // The reported final price is the last round's closing price.
    expect(result.finalPriceCents).toBe(result.rounds[result.rounds.length - 1].priceAfterCents);
  });
});

describe('scoreAuction — unknown headline id fails explicitly (requirement 9.4)', () => {
  it('throws an error whose message contains the exact unknown id', () => {
    const params = replayRegParams();
    expect(() =>
      scoreAuction(params, [{ headlineId: 'does-not-exist', prediction: 'up' }], mulberry32(1)),
    ).toThrow(/does-not-exist/);
  });

  it('aborts the run on a mid-sequence unknown id without producing a result', () => {
    const params = replayRegParams();
    expect(() =>
      scoreAuction(
        params,
        [
          { headlineId: 'bull', prediction: 'up' },
          { headlineId: 'phantom', prediction: 'down' },
          { headlineId: 'bear', prediction: 'down' },
        ],
        mulberry32(1),
      ),
    ).toThrow(/phantom/);
  });
});

describe('scoreAuction — established same-seed / different-seed behavior (requirement 6.3)', () => {
  // Noise on so the seed genuinely drives the price path; the choices mix both
  // cards and a missing prediction so the whole result (prices, counts, summary)
  // is non-trivial.
  const params = replayRegParams({ noise: 0.05 });
  const choices: AuctionChoice[] = [
    { headlineId: 'bull', prediction: 'up' },
    { headlineId: 'bear', prediction: 'down' },
    { headlineId: 'bull' },
  ];

  it('returns a deeply equal result for two fresh generators built from the same seed', () => {
    const a = scoreAuction(params, choices, mulberry32(2468));
    const b = scoreAuction(params, choices, mulberry32(2468));
    expect(b).toEqual(a);
  });

  it('returns a different price path for a different seed', () => {
    const a = scoreAuction(params, choices, mulberry32(1));
    const b = scoreAuction(params, choices, mulberry32(2));
    expect(a.rounds.map((r) => r.priceAfterCents)).not.toEqual(
      b.rounds.map((r) => r.priceAfterCents),
    );
  });
});

// Unchanged L1.2 compatibility regression (task 8.2).
//
// The feature enhances the `auction` sim without touching the authored lesson
// (requirements 9.2, 9.3) or the seeded price path / RNG budget (requirements
// 6.3, 6.4). This suite loads the REAL L1.2 content, parses its auction step's
// params, and pins:
//   - the legacy authored values survive parsing unchanged, `noise` stays 0.01,
//     and the absent `showMarketDepth` defaults to true (9.2, 9.3);
//   - a fixed-seed replay over the three real headlines reproduces an exact,
//     literal price path, directions, counts, score, final price, and summary
//     (6.3) — any formula regression changes a literal and fails here;
//   - the full replay consumes exactly one RNG draw per round, i.e.
//     `choices.length` draws, with the richer quote/depth derivations costing
//     nothing (6.4);
//   - calling `deriveMarketSnapshot` any number of times before, between, and
//     after the replay leaves the pinned price path and RNG budget untouched
//     (the quote/depth helpers are pure and RNG-free).
//
// If this file is ever edited to make the regression pass, that is the bug: the
// authored content is a fixed contract, so the literals below must be updated
// only when an intentional, reviewed change to the engine is made.
describe('L1.2 auction compatibility regression (unchanged authored content)', () => {
  /** A fixed seed so the whole replay is reproducible and the literals are stable. */
  const SEED = 12345;

  /** The shape of a lesson step we care about: the auction sim and its params. */
  interface AuctionStep {
    simId?: string;
    params?: unknown;
  }

  /** Locate the authored `auction` sim step inside the real L1.2 content. */
  function findAuctionStep(): AuctionStep {
    const steps = (l12 as { steps: AuctionStep[] }).steps;
    const step = steps.find((s) => s.simId === 'auction');
    if (!step) throw new Error('L1.2 content is missing its auction sim step');
    return step;
  }

  /** Parse the authored params exactly as the engine would. */
  function parseL12AuctionParams(): AuctionParams {
    return parseAuctionParams(findAuctionStep().params);
  }

  /**
   * A representative choice sequence over the three REAL headline ids
   * (h-good / h-bad / h-neutral), one per authored round, with predictions. The
   * predictions are chosen so the run has a mix of correct and incorrect grades,
   * pinning the scoring path as well as the price path.
   */
  const CHOICES: AuctionChoice[] = [
    { headlineId: 'h-good', prediction: 'up' }, // demand surges -> up (correct)
    { headlineId: 'h-bad', prediction: 'down' }, // sellers rush -> down (correct)
    { headlineId: 'h-neutral', prediction: 'up' }, // balanced, drifts down -> wrong
  ];

  it('parses the authored legacy values unchanged, with noise 0.01 and showMarketDepth defaulting to true', () => {
    const parsed = parseL12AuctionParams();

    // Authored legacy values survive parsing exactly (requirement 9.2).
    expect(parsed.startPriceCents).toBe(5000);
    expect(parsed.baseDemand).toBe(10);
    expect(parsed.baseSupply).toBe(10);
    expect(parsed.sensitivity).toBeCloseTo(0.2, 12);
    expect(parsed.rounds).toBe(3);
    expect(parsed.headlines.map((h) => h.id)).toEqual(['h-good', 'h-bad', 'h-neutral']);
    expect(parsed.headlines).toEqual([
      {
        id: 'h-good',
        text: 'Surprise award: the item is rarer than anyone thought.',
        demandDelta: 8,
        supplyDelta: -2,
      },
      {
        id: 'h-bad',
        text: 'A near-identical copy turns up, so sellers rush to list.',
        demandDelta: -3,
        supplyDelta: 8,
      },
      {
        id: 'h-neutral',
        text: 'Quiet day: a few more buyers, a few more sellers.',
        demandDelta: 2,
        supplyDelta: 2,
      },
    ]);

    // The authored noise is preserved (requirement 9.3)...
    expect(parsed.noise).toBeCloseTo(0.01, 12);
    // ...and the absent showMarketDepth defaults to true (requirement 9.3).
    expect(parsed.showMarketDepth).toBe(true);
  });

  it('reproduces the exact established seeded price path and replay outcome', () => {
    const parsed = parseL12AuctionParams();
    const result = scoreAuction(parsed, CHOICES, mulberry32(SEED));

    // Pinned per-round price path for the fixed seed. A change to the price
    // formula, rounding, or RNG consumption flips one of these literals.
    expect(result.rounds.map((r) => r.priceBeforeCents)).toEqual([5000, 5433, 4934]);
    expect(result.rounds.map((r) => r.priceAfterCents)).toEqual([5433, 4934, 4932]);
    expect(result.rounds.map((r) => r.direction)).toEqual(['up', 'down', 'down']);
    expect(result.rounds.map((r) => r.demand)).toEqual([18, 7, 12]);
    expect(result.rounds.map((r) => r.supply)).toEqual([8, 18, 12]);

    // Pinned grading and reporting.
    expect(result.correct).toBe(2);
    expect(result.total).toBe(3);
    expect(result.score).toBe(67);
    expect(result.finalPriceCents).toBe(4932);
    expect(result.summary).toBe('You read the market right 2 of 3 times.');
  });

  it('consumes exactly one RNG draw per round for the full replay', () => {
    const parsed = parseL12AuctionParams();
    const base = mulberry32(SEED);
    let draws = 0;
    const countingRng = () => {
      draws += 1;
      return base();
    };

    scoreAuction(parsed, CHOICES, countingRng);

    // One draw per applied round, no more: the quote/depth derivations are pure.
    expect(draws).toBe(CHOICES.length);
  });

  it('leaves the price path and RNG budget untouched when quote/depth snapshots are derived around the replay', () => {
    const parsed = parseL12AuctionParams();

    // Interleave an arbitrary number of snapshot derivations around a counted
    // replay. If snapshots consumed draws or mutated anything, the pinned path
    // or the draw count would change.
    const base = mulberry32(SEED);
    let draws = 0;
    const countingRng = () => {
      draws += 1;
      return base();
    };

    const snapshots: (AuctionMarketSnapshot | null)[] = [];
    const snap = () =>
      snapshots.push(
        deriveMarketSnapshot(parsed.startPriceCents, parsed.baseDemand, parsed.baseSupply),
      );

    snap();
    snap();
    snap();
    const result = scoreAuction(parsed, CHOICES, countingRng);
    snap();
    snap();

    // Snapshots are RNG-free, so the draw budget is still one per round...
    expect(draws).toBe(CHOICES.length);
    // ...and the price path matches the pinned replay exactly.
    expect(result.rounds.map((r) => r.priceAfterCents)).toEqual([5433, 4934, 4932]);
    expect(result.finalPriceCents).toBe(4932);

    // The snapshot itself is deterministic and identical every time it is
    // derived, confirming the derivations are pure (RNG-neutral).
    expect(snapshots.every((s) => s !== null)).toBe(true);
    for (const s of snapshots) {
      expect(s).toEqual(snapshots[0]);
    }
  });

  it('matches an independent fresh-seed replay (same seed reproduces the full result)', () => {
    const parsed = parseL12AuctionParams();
    const a = scoreAuction(parsed, CHOICES, mulberry32(SEED));
    const b = scoreAuction(parsed, CHOICES, mulberry32(SEED));
    expect(b).toEqual(a);
  });
});
