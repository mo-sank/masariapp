import { DEFAULT_RANK, RANK_LADDER, rankForCompletedBosses } from './rank';

/**
 * Rank mapping (requirement 3.2; design "Rank mapping (MVP)").
 *
 * The rank is a pure function of which boss lessons the learner has completed.
 * These tests pin the MVP rule (Newcomer until B1, then Rookie) and the ladder's
 * highest-wins behaviour the reserved ranks will grow into.
 */
describe('rankForCompletedBosses (3.2)', () => {
  it('is Newcomer before any boss is completed', () => {
    expect(rankForCompletedBosses(new Set())).toBe('Newcomer');
    expect(DEFAULT_RANK).toBe('Newcomer');
  });

  it('is Rookie once B1 is completed (MVP)', () => {
    expect(rankForCompletedBosses(new Set(['B1']))).toBe('Rookie');
  });

  it('ignores non-boss completions passed in the set', () => {
    // Only boss ids should reach here; a stray lesson id must not promote.
    expect(rankForCompletedBosses(new Set(['L1.4', 'L2.1']))).toBe('Newcomer');
  });

  it('returns the highest reached rank when several bosses are completed', () => {
    // Reserved ladder: B2 outranks B1, so clearing both reads as Chart Reader.
    expect(rankForCompletedBosses(new Set(['B1', 'B2']))).toBe('Chart Reader');
  });

  it('maps every ladder boss to its reserved rank', () => {
    for (const { bossId, rank } of RANK_LADDER) {
      expect(rankForCompletedBosses(new Set([bossId]))).toBe(rank);
    }
  });
});
