// Mock the Supabase singleton so importing use-watchlist-mutations does not pull
// in the native auth0 module chain. These tests exercise only the pure
// mapWatchlistError helper and the invalidation helper.
jest.mock('../../lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

// eslint-disable-next-line import/first -- jest.mock must be hoisted above imports
import { QueryClient } from '@tanstack/react-query';
// eslint-disable-next-line import/first
import {
  WATCHLIST_MAX,
  invalidateWatchlist,
  mapWatchlistError,
} from './use-watchlist-mutations';
// eslint-disable-next-line import/first
import { WATCHLIST_QUERY_KEY } from './use-watchlist';

describe('mapWatchlistError (6.2)', () => {
  it('maps watchlist_full to the friendly limit message naming the max', () => {
    const message = mapWatchlistError(new Error('watchlist_full'));
    expect(message).toContain('full');
    expect(message).toContain(String(WATCHLIST_MAX));
  });

  it('maps feature_locked to lesson-oriented copy', () => {
    expect(mapWatchlistError(new Error('feature_locked'))).toMatch(/unlock/i);
  });

  it('maps symbol_not_available to friendly copy', () => {
    expect(mapWatchlistError(new Error('symbol_not_available'))).toMatch(/available/i);
  });

  it('maps not_authenticated to a sign-in prompt', () => {
    expect(mapWatchlistError(new Error('not_authenticated'))).toMatch(/sign in/i);
  });

  it('trims surrounding whitespace on the error code before matching', () => {
    expect(mapWatchlistError(new Error('  watchlist_full  '))).toContain('full');
  });

  it('reads the code from a plain error-shaped object (PostgREST error)', () => {
    expect(mapWatchlistError({ message: 'watchlist_full', code: 'P0001' })).toContain('full');
  });

  it('falls back to generic copy for an unknown error', () => {
    expect(mapWatchlistError(new Error('boom'))).toMatch(/try again/i);
  });

  it('falls back to generic copy for a non-error value', () => {
    expect(mapWatchlistError(null)).toMatch(/try again/i);
    expect(mapWatchlistError(undefined)).toMatch(/try again/i);
    expect(mapWatchlistError('watchlist_full')).toMatch(/try again/i);
  });
});

describe('invalidateWatchlist (6.1)', () => {
  it('invalidates the watchlist query key', () => {
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries').mockReturnValue(Promise.resolve());

    invalidateWatchlist(client);

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate.mock.calls[0][0]?.queryKey).toEqual(WATCHLIST_QUERY_KEY);
    client.clear();
  });
});
