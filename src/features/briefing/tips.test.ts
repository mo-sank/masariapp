import { BRIEFING_TIP_COUNT, BRIEFING_TIPS, tipForIndex } from './tips';

describe('BRIEFING_TIPS', () => {
  it('every tip has a non-empty title and a one-line body', () => {
    for (const tip of BRIEFING_TIPS) {
      expect(tip.title.trim().length).toBeGreaterThan(0);
      expect(tip.body.trim().length).toBeGreaterThan(0);
      // Short, single-sentence copy — no multi-line paragraphs.
      expect(tip.body).not.toContain('\n');
    }
  });

  it('BRIEFING_TIP_COUNT matches the list length (kept in sync with app_config)', () => {
    expect(BRIEFING_TIP_COUNT).toBe(BRIEFING_TIPS.length);
  });
});

describe('tipForIndex', () => {
  it('returns the tip at an in-range index', () => {
    for (let i = 0; i < BRIEFING_TIP_COUNT; i += 1) {
      expect(tipForIndex(i)).toBe(BRIEFING_TIPS[i]);
    }
  });

  it('wraps an out-of-range index with a modulo', () => {
    expect(tipForIndex(BRIEFING_TIP_COUNT)).toBe(BRIEFING_TIPS[0]);
    expect(tipForIndex(BRIEFING_TIP_COUNT + 2)).toBe(BRIEFING_TIPS[2 % BRIEFING_TIP_COUNT]);
  });

  it('handles a negative index without crashing', () => {
    expect(tipForIndex(-1)).toBe(BRIEFING_TIPS[BRIEFING_TIP_COUNT - 1]);
  });

  it('falls back to the first tip for a non-finite index', () => {
    expect(tipForIndex(Number.NaN)).toBe(BRIEFING_TIPS[0]);
    expect(tipForIndex(Number.POSITIVE_INFINITY)).toBe(BRIEFING_TIPS[0]);
  });
});
