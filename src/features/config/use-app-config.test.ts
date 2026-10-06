// Mock the Supabase singleton so importing use-app-config does not pull in the
// native auth0 module chain. These tests exercise the pure readConfigNumber
// helper and the fallbacks, which need no React or network.
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));

// eslint-disable-next-line import/first -- jest.mock must be hoisted above imports
import {
  APP_CONFIG_FALLBACKS,
  readConfigNumber,
  type AppConfigMap,
} from './use-app-config';

describe('readConfigNumber (8.1)', () => {
  it('returns a JSON number value as-is', () => {
    const config: AppConfigMap = { watchlist_max: 8 };
    expect(readConfigNumber(config, 'watchlist_max')).toBe(8);
  });

  it('coerces a numeric string value', () => {
    const config: AppConfigMap = { quote_stale_minutes: '45' };
    expect(readConfigNumber(config, 'quote_stale_minutes')).toBe(45);
  });

  it('falls back when the key is missing', () => {
    expect(readConfigNumber({}, 'watchlist_max')).toBe(APP_CONFIG_FALLBACKS.watchlist_max);
  });

  it('falls back when the config is undefined (not loaded yet)', () => {
    expect(readConfigNumber(undefined, 'starter_cash_cents')).toBe(
      APP_CONFIG_FALLBACKS.starter_cash_cents,
    );
  });

  it('falls back for a non-numeric value (null, object, bad string)', () => {
    expect(readConfigNumber({ watchlist_max: null }, 'watchlist_max')).toBe(
      APP_CONFIG_FALLBACKS.watchlist_max,
    );
    expect(readConfigNumber({ watchlist_max: { nope: 1 } }, 'watchlist_max')).toBe(
      APP_CONFIG_FALLBACKS.watchlist_max,
    );
    expect(readConfigNumber({ watchlist_max: 'abc' }, 'watchlist_max')).toBe(
      APP_CONFIG_FALLBACKS.watchlist_max,
    );
  });

  it('falls back for a non-finite value', () => {
    expect(readConfigNumber({ watchlist_max: Number.NaN }, 'watchlist_max')).toBe(
      APP_CONFIG_FALLBACKS.watchlist_max,
    );
    expect(readConfigNumber({ watchlist_max: Number.POSITIVE_INFINITY }, 'watchlist_max')).toBe(
      APP_CONFIG_FALLBACKS.watchlist_max,
    );
  });

  it('reads the configured value over the fallback (changing config changes the number)', () => {
    // The whole point of requirement 8.1: when the stored value differs from the
    // fallback, the configured value wins so the client shows the server's cap.
    expect(readConfigNumber({ starter_position_cap_cents: 250000 }, 'starter_position_cap_cents'))
      .toBe(250000);
    expect(readConfigNumber({ starter_position_cap_cents: 250000 }, 'starter_position_cap_cents'))
      .not.toBe(APP_CONFIG_FALLBACKS.starter_position_cap_cents);
  });
});
