import {
  getYouthSubtitle,
  matchesYouthCategory,
  YOUTH_CATEGORIES,
} from './youth-tags';

describe('youth-tags', () => {
  it('provides youth categories including Gaming, Streetwear, Entertainment, and Food', () => {
    const keys = YOUTH_CATEGORIES.map((c) => c.key);
    expect(keys).toContain('all');
    expect(keys).toContain('gaming');
    expect(keys).toContain('streetwear');
    expect(keys).toContain('entertainment');
    expect(keys).toContain('food');
  });

  it('correctly matches symbols to youth categories', () => {
    expect(matchesYouthCategory('NVDA', 'gaming')).toBe(true);
    expect(matchesYouthCategory('NVDA', 'food')).toBe(false);
    expect(matchesYouthCategory('NKE', 'streetwear')).toBe(true);
    expect(matchesYouthCategory('KO', 'food')).toBe(true);
    expect(matchesYouthCategory('NFLX', 'entertainment')).toBe(true);
    expect(matchesYouthCategory('AAPL', 'all')).toBe(true);
  });

  it('returns relatable subtitles for popular youth stocks', () => {
    expect(getYouthSubtitle('AAPL')).toContain('iPhone');
    expect(getYouthSubtitle('NKE')).toContain('Air Jordans');
    expect(getYouthSubtitle('DIS')).toContain('Marvel');
    expect(getYouthSubtitle('UNKNOWN')).toBeNull();
  });
});
