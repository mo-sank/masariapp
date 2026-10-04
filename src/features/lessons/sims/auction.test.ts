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
  parseAuctionParams,
  scoreAuction,
  type AuctionParams,
  type AuctionChoice,
} from './auction';
import { mulberry32 } from '../rng';

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
