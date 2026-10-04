/**
 * Tests for the ownership-split pure logic (requirements 8.1, 8.5).
 *
 * The lab's whole value is that its arithmetic and grading are deterministic and
 * repeatable: selling N shares always yields the same ownership, raise, and
 * score. These tests pin that down — the live-figure derivation, the goal
 * evaluation (including the on-the-boundary case), and the 100/60/30 scoring
 * from the design.
 */

import {
  clampSharesSold,
  deriveOwnershipState,
  evaluateGoals,
  parseOwnershipSplitParams,
  scoreOwnershipSplit,
  type OwnershipSplitParams,
} from './ownership-split';

/** The design's worked example: 100 shares at $25, raise $400, keep >= 51%. */
const PARAMS: OwnershipSplitParams = {
  totalShares: 100,
  pricePerShareCents: 2500,
  targetRaiseCents: 40000,
  minOwnerPct: 51,
};

describe('parseOwnershipSplitParams', () => {
  it('accepts well-formed params', () => {
    expect(parseOwnershipSplitParams(PARAMS)).toEqual(PARAMS);
  });

  it('rejects malformed params', () => {
    expect(() => parseOwnershipSplitParams({ totalShares: 0 })).toThrow();
    expect(() =>
      parseOwnershipSplitParams({ ...PARAMS, minOwnerPct: 150 }),
    ).toThrow();
  });
});

describe('deriveOwnershipState (requirement 8.1)', () => {
  it('starts at full ownership and zero raised', () => {
    expect(deriveOwnershipState(0, PARAMS)).toEqual({
      sharesSold: 0,
      sharesKept: 100,
      ownerPct: 100,
      raisedCents: 0,
    });
  });

  it('derives ownership and raise for a mid-sale', () => {
    // Sell 16 shares: keep 84% ownership, raise 16 * $25 = $400.
    expect(deriveOwnershipState(16, PARAMS)).toEqual({
      sharesSold: 16,
      sharesKept: 84,
      ownerPct: 84,
      raisedCents: 40000,
    });
  });

  it('is deterministic — same input, same output', () => {
    expect(deriveOwnershipState(20, PARAMS)).toEqual(deriveOwnershipState(20, PARAMS));
  });

  it('clamps shares sold into [0, totalShares]', () => {
    expect(clampSharesSold(-5, PARAMS)).toBe(0);
    expect(clampSharesSold(250, PARAMS)).toBe(100);
    expect(clampSharesSold(33.6, PARAMS)).toBe(34);
    expect(deriveOwnershipState(-5, PARAMS).sharesSold).toBe(0);
    expect(deriveOwnershipState(999, PARAMS).sharesKept).toBe(0);
  });
});

describe('evaluateGoals', () => {
  it('treats an exactly-on-the-minimum ownership as met (no float artefact)', () => {
    // Sell 49 shares -> keep exactly 51%, the minimum.
    const state = deriveOwnershipState(49, PARAMS);
    expect(evaluateGoals(state, PARAMS)).toEqual({ raiseMet: true, ownershipMet: true });
  });
});

describe('scoreOwnershipSplit (requirement 8.1)', () => {
  it('scores 100 when both goals are met', () => {
    // Sell 40 shares: raise $1000 (>= $400) and keep 60% (>= 51%).
    const result = scoreOwnershipSplit(40, PARAMS);
    expect(result.score).toBe(100);
    expect(result.raiseMet).toBe(true);
    expect(result.ownershipMet).toBe(true);
    expect(result.summary).toContain('Both goals met');
  });

  it('scores 60 when only the raise is met (over-diluted)', () => {
    // Sell 60 shares: raise $1500 but keep only 40% (< 51%).
    const result = scoreOwnershipSplit(60, PARAMS);
    expect(result.score).toBe(60);
    expect(result.raiseMet).toBe(true);
    expect(result.ownershipMet).toBe(false);
  });

  it('scores 60 when only ownership is met (under-raised)', () => {
    // Sell 4 shares: keep 96% but raise only $100 (< $400).
    const result = scoreOwnershipSplit(4, PARAMS);
    expect(result.score).toBe(60);
    expect(result.raiseMet).toBe(false);
    expect(result.ownershipMet).toBe(true);
  });

  it('scores 30 when neither goal is met', () => {
    // Sell 0 shares: raise $0 and... ownership is 100% which IS met, so pick a
    // params set where selling nothing fails both is impossible; instead use a
    // target the learner cannot reach without over-diluting. Here, require a
    // raise of $2000 while keeping >= 90%: any split fails at least one, and a
    // tiny sale fails both.
    const tight: OwnershipSplitParams = {
      totalShares: 100,
      pricePerShareCents: 2500,
      targetRaiseCents: 200000, // $2000 needs 80 shares sold
      minOwnerPct: 90, // keeping 90% allows selling only 10 shares -> $250
    };
    const result = scoreOwnershipSplit(5, tight); // raise $125, keep 95%
    expect(result.raiseMet).toBe(false);
    expect(result.ownershipMet).toBe(true); // 95% >= 90%
    // Only one met -> 60. To hit 30 we need neither: sell 15 -> $375 (<$2000),
    // keep 85% (<90%).
    const neither = scoreOwnershipSplit(15, tight);
    expect(neither.raiseMet).toBe(false);
    expect(neither.ownershipMet).toBe(false);
    expect(neither.score).toBe(30);
  });

  it('is deterministic — same split, same score and summary', () => {
    expect(scoreOwnershipSplit(37, PARAMS)).toEqual(scoreOwnershipSplit(37, PARAMS));
  });
});
