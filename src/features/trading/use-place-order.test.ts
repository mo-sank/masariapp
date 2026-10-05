// Mock the Supabase singleton and expo-crypto so importing use-place-order does
// not pull in native modules. These tests exercise only the pure
// mapPlaceOrderError and invalidation helpers plus the idempotency key.
jest.mock('../../lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '11111111-2222-4333-8444-555555555555'),
}));

// eslint-disable-next-line import/first -- jest.mock must be hoisted above imports
import { QueryClient } from '@tanstack/react-query';
// eslint-disable-next-line import/first
import {
  invalidateAfterOrder,
  mapPlaceOrderError,
  newIdempotencyKey,
} from './use-place-order';
// eslint-disable-next-line import/first
import { PORTFOLIO_QUERY_KEY } from '../portfolio/use-portfolio';
// eslint-disable-next-line import/first
import { ORDERS_QUERY_KEY } from './use-orders';
// eslint-disable-next-line import/first
import { WATCHLIST_QUERY_KEY } from '../watchlist/use-watchlist';

describe('mapPlaceOrderError (8.7)', () => {
  it('maps feature_locked to lesson-oriented copy', () => {
    expect(mapPlaceOrderError(new Error('feature_locked'))).toMatch(/lesson/i);
  });

  it('maps insufficient_cash to a friendly cash message', () => {
    expect(mapPlaceOrderError(new Error('insufficient_cash'))).toMatch(/cash/i);
  });

  it('maps insufficient_shares to a friendly shares message', () => {
    expect(mapPlaceOrderError(new Error('insufficient_shares'))).toMatch(/shares/i);
  });

  it('maps position_cap_exceeded to a fewer-shares hint', () => {
    expect(mapPlaceOrderError(new Error('position_cap_exceeded'))).toMatch(/fewer shares/i);
  });

  it('maps quote_stale to the catching-up message', () => {
    expect(mapPlaceOrderError(new Error('quote_stale'))).toMatch(/catching up/i);
  });

  it('maps no_quote to a no-price message', () => {
    expect(mapPlaceOrderError(new Error('no_quote'))).toMatch(/price/i);
  });

  it('maps symbol_not_available to a friendly availability message', () => {
    expect(mapPlaceOrderError(new Error('symbol_not_available'))).toMatch(/available/i);
  });

  it('maps invalid_order to a check-the-amount message', () => {
    expect(mapPlaceOrderError(new Error('invalid_order'))).toMatch(/amount/i);
  });

  it('trims surrounding whitespace on the error code before matching', () => {
    expect(mapPlaceOrderError(new Error('  insufficient_cash  '))).toMatch(/cash/i);
  });

  it('reads the code from a plain error-shaped object (PostgREST error)', () => {
    expect(mapPlaceOrderError({ message: 'quote_stale', code: 'P0001' })).toMatch(/catching up/i);
  });

  it('falls back to generic copy for an unknown error', () => {
    expect(mapPlaceOrderError(new Error('boom'))).toMatch(/try again/i);
  });

  it('falls back to generic copy for a non-error value', () => {
    expect(mapPlaceOrderError(null)).toMatch(/try again/i);
    expect(mapPlaceOrderError(undefined)).toMatch(/try again/i);
    expect(mapPlaceOrderError('insufficient_cash')).toMatch(/try again/i);
  });
});

describe('newIdempotencyKey (8.5)', () => {
  it('returns a UUID from expo-crypto', () => {
    expect(newIdempotencyKey()).toBe('11111111-2222-4333-8444-555555555555');
  });
});

describe('invalidateAfterOrder (8.4)', () => {
  it('invalidates the portfolio, orders, and watchlist query keys', () => {
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries').mockReturnValue(Promise.resolve());

    invalidateAfterOrder(client);

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(PORTFOLIO_QUERY_KEY);
    expect(keys).toContainEqual(ORDERS_QUERY_KEY);
    expect(keys).toContainEqual(WATCHLIST_QUERY_KEY);
    client.clear();
  });
});
