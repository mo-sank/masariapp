import { featureRoute } from './feature-routes';

describe('featureRoute', () => {
  it('maps known feature keys to their routes', () => {
    expect(featureRoute('explore')).toBe('/(tabs)/explore');
    expect(featureRoute('portfolio')).toBe('/(tabs)/portfolio');
    expect(featureRoute('learn')).toBe('/(tabs)/learn');
  });

  it('returns null for a feature with no single-route destination (trade)', () => {
    expect(featureRoute('trade')).toBeNull();
  });

  it('returns null for an unknown feature key', () => {
    expect(featureRoute('mystery')).toBeNull();
  });
});
