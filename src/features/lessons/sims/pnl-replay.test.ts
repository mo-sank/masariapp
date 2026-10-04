/**
 * Tests for the P&L replay pure logic (requirements 8.3, 8.5).
 *
 * The lab's only randomness is the seeded price-path generator; the P&L maths
 * and scoring are deterministic functions of the path and the decision. These
 * tests pin down the price-path construction (authored and generated), the
 * determinism across runs with the same seed (requirement 8.5), the unrealized
 * vs realized P&L (requirement 8.3), and the edge cases (bad params, indices).
 */

import {
  buildPricePath,
  computePnl,
  parsePnlReplayParams,
  replayPnl,
  type PnlReplayParams,
} from './pnl-replay';
import { mulberry32 } from '../rng';

/** An authored rising path: bought at $10, prompt at $12, ends at $15. */
function risingParams(overrides: Record<string, unknown> = {}): PnlReplayParams {
  return parsePnlReplayParams({
    shares: 10,
    buyIndex: 0,
    promptIndex: 2,
    prices: [1000, 1100, 1200, 1300, 1500],
    ...overrides,
  });
}

describe('parsePnlReplayParams', () => {
  it('accepts an authored price path', () => {
    const parsed = risingParams();
    expect(parsed.prices).toEqual([1000, 1100, 1200, 1300, 1500]);
    expect(parsed.shares).toBe(10);
  });

  it('defaults shares to 1 and buyIndex to 0', () => {
    const parsed = parsePnlReplayParams({ promptIndex: 1, prices: [500, 600] });
    expect(parsed.shares).toBe(1);
    expect(parsed.buyIndex).toBe(0);
  });

  it('requires exactly one of prices or generator', () => {
    // Neither.
    expect(() => parsePnlReplayParams({ promptIndex: 1 })).toThrow();
    // Both.
    expect(() =>
      parsePnlReplayParams({
        promptIndex: 1,
        prices: [100, 200],
        startPriceCents: 100,
        generator: {},
      }),
    ).toThrow();
  });

  it('requires startPriceCents when using a generator', () => {
    expect(() => parsePnlReplayParams({ promptIndex: 3, generator: {} })).toThrow();
    // With startPriceCents it parses.
    expect(() =>
      parsePnlReplayParams({ promptIndex: 3, startPriceCents: 1000, generator: {} }),
    ).not.toThrow();
  });

  it('rejects a promptIndex at or before buyIndex', () => {
    expect(() =>
      parsePnlReplayParams({ buyIndex: 2, promptIndex: 2, prices: [1, 2, 3, 4] }),
    ).toThrow();
  });

  it('rejects indices past the end of an authored path', () => {
    expect(() =>
      parsePnlReplayParams({ buyIndex: 0, promptIndex: 9, prices: [1, 2, 3] }),
    ).toThrow();
  });
});

describe('buildPricePath (requirement 8.5)', () => {
  it('returns an authored path unchanged (and does not alias it)', () => {
    const params = risingParams();
    const path = buildPricePath(params, mulberry32(1));
    expect(path).toEqual([1000, 1100, 1200, 1300, 1500]);
    // Mutating the result must not touch the params.
    path[0] = 0;
    expect(params.prices?.[0]).toBe(1000);
  });

  it('generates a path of the requested length from the seed', () => {
    const params = parsePnlReplayParams({
      promptIndex: 5,
      startPriceCents: 1000,
      generator: { steps: 10, drift: 0, volatility: 0.05 },
    });
    const path = buildPricePath(params, mulberry32(42));
    expect(path).toHaveLength(10);
    expect(path[0]).toBe(1000);
    expect(path.every((p) => Number.isInteger(p) && p >= 1)).toBe(true);
  });

  it('is identical across runs with the same seed', () => {
    const params = parsePnlReplayParams({
      promptIndex: 5,
      startPriceCents: 1000,
      generator: { steps: 12, drift: 0.01, volatility: 0.08 },
    });
    const a = buildPricePath(params, mulberry32(123));
    const b = buildPricePath(params, mulberry32(123));
    expect(a).toEqual(b);
  });

  it('produces different paths for different seeds', () => {
    const params = parsePnlReplayParams({
      promptIndex: 5,
      startPriceCents: 1000,
      generator: { steps: 12, drift: 0, volatility: 0.1 },
    });
    const a = buildPricePath(params, mulberry32(1));
    const b = buildPricePath(params, mulberry32(2));
    expect(a).not.toEqual(b);
  });
});

describe('computePnl', () => {
  it('reports a gain in cents and percent', () => {
    // 10 shares bought at $10, now $12 -> +$20 on $100 cost -> +20%.
    expect(computePnl(10, 1000, 1200)).toEqual({ pnlCents: 2000, pnlPct: 20 });
  });

  it('reports a loss as negative', () => {
    expect(computePnl(10, 1000, 800)).toEqual({ pnlCents: -2000, pnlPct: -20 });
  });

  it('reports flat as zero', () => {
    expect(computePnl(5, 1000, 1000)).toEqual({ pnlCents: 0, pnlPct: 0 });
  });
});

describe('replayPnl (requirement 8.3)', () => {
  it('sell realizes the prompt price; unrealized matches it', () => {
    const params = risingParams();
    const path = params.prices as number[];
    const result = replayPnl(path, params, 'sell');
    // Prompt price $12 -> realized +$20; unrealized is the same at the prompt.
    expect(result.realized.pnlCents).toBe(2000);
    expect(result.unrealized.pnlCents).toBe(2000);
    expect(result.promptPriceCents).toBe(1200);
    expect(result.finalPriceCents).toBe(1500);
  });

  it('hold realizes the final price', () => {
    const params = risingParams();
    const path = params.prices as number[];
    const result = replayPnl(path, params, 'hold');
    // Final price $15 -> realized +$50; the alternative (sell) is +$20.
    expect(result.realized.pnlCents).toBe(5000);
    expect(result.alternative.pnlCents).toBe(2000);
  });

  it('scores 100 when the decision captured the better outcome', () => {
    const params = risingParams();
    const path = params.prices as number[];
    // On a rising path, holding beats selling early.
    expect(replayPnl(path, params, 'hold').score).toBe(100);
    expect(replayPnl(path, params, 'sell').score).toBe(60);
  });

  it('scores selling 100 when the price falls after the prompt', () => {
    // Bought $10, prompt $12 (sell locks +$20), ends $8 (hold -$20).
    const params = parsePnlReplayParams({
      shares: 10,
      buyIndex: 0,
      promptIndex: 1,
      prices: [1000, 1200, 1000, 800],
    });
    const path = params.prices as number[];
    expect(replayPnl(path, params, 'sell').score).toBe(100);
    expect(replayPnl(path, params, 'hold').score).toBe(60);
  });

  it('ties score 100 for both decisions (flat tail)', () => {
    // Prompt price equals final price -> sell and hold realize the same.
    const params = parsePnlReplayParams({
      shares: 1,
      buyIndex: 0,
      promptIndex: 1,
      prices: [1000, 1100, 1100],
    });
    const path = params.prices as number[];
    expect(replayPnl(path, params, 'sell').score).toBe(100);
    expect(replayPnl(path, params, 'hold').score).toBe(100);
  });

  it('is deterministic end to end from a seeded generated path (8.5)', () => {
    const params = parsePnlReplayParams({
      shares: 3,
      buyIndex: 0,
      promptIndex: 4,
      startPriceCents: 2000,
      generator: { steps: 10, drift: 0.01, volatility: 0.06 },
    });
    const a = replayPnl(buildPricePath(params, mulberry32(99)), params, 'hold');
    const b = replayPnl(buildPricePath(params, mulberry32(99)), params, 'hold');
    expect(a).toEqual(b);
  });

  it('throws when indices fall outside the given path', () => {
    const params = risingParams();
    expect(() => replayPnl([1000, 1100], params, 'sell')).toThrow(/outside the price path/);
  });
});
