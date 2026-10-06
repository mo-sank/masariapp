import { featureRoute } from './feature-routes';

describe('featureRoute', () => {
  it('maps known feature keys to their routes', () => {
    expect(featureRoute('explore')).toBe('/(tabs)/explore');
    expect(featureRoute('portfolio')).toBe('/(tabs)/portfolio');
    expect(featureRoute('learn')).toBe('/(tabs)/learn');
  });

  it('routes watchlist and price tickers to Explore (no standalone screen)', () => {
    expect(featureRoute('watchlist')).toBe('/(tabs)/explore');
    expect(featureRoute('price_tickers')).toBe('/(tabs)/explore');
  });

  it('routes trade history and the daily briefing to their screens', () => {
    expect(featureRoute('trade_history')).toBe('/history');
    expect(featureRoute('daily_briefing')).toBe('/(tabs)/learn');
  });

  it('returns null for per-symbol features with no single-route destination', () => {
    expect(featureRoute('trade')).toBeNull();
    expect(featureRoute('stock_detail')).toBeNull();
    expect(featureRoute('market_buy')).toBeNull();
    expect(featureRoute('market_sell')).toBeNull();
    expect(featureRoute('chart_time_ranges')).toBeNull();
  });

  it('returns null for an unknown feature key', () => {
    expect(featureRoute('mystery')).toBeNull();
  });
});
