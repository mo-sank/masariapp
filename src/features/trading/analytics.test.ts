import { sanitizeEvent, track } from '../../lib/analytics';
import {
  trackReflectionSubmitted,
  trackStockViewed,
  trackTradePlaced,
  trackWatchlistChanged,
} from './analytics';

// Importing the real analytics module (for sanitizeEvent) pulls in its singleton
// wiring (AsyncStorage, expo Constants). Mock those native-backed modules so the
// file loads under Jest — the same approach as src/lib/analytics.test.ts.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0' } }));

// Spy on `track` so these tests assert what the wrappers pass to it, keeping the
// rest of the module (sanitizeEvent) real.
jest.mock('../../lib/analytics', () => {
  const actual = jest.requireActual('../../lib/analytics');
  return { ...actual, track: jest.fn() };
});

const trackMock = track as jest.MockedFunction<typeof track>;

describe('trading analytics wrappers (requirements 8.4, 9.2)', () => {
  beforeEach(() => {
    trackMock.mockClear();
  });

  it('trackTradePlaced logs only side/symbol/qty/has_rationale', () => {
    trackTradePlaced({ side: 'buy', symbol: 'AAPL', qty: 3, hasRationale: true });
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith('trade_placed', {
      props: { side: 'buy', symbol: 'AAPL', qty: 3, has_rationale: true },
    });
    // No free-text keys ever attached (requirement 9.2).
    const props = trackMock.mock.calls[0][1]?.props ?? {};
    expect(Object.keys(props).sort()).toEqual(['has_rationale', 'qty', 'side', 'symbol']);
  });

  it('trackReflectionSubmitted logs only the expectation enum (no note)', () => {
    trackReflectionSubmitted('as_expected');
    expect(trackMock).toHaveBeenCalledWith('reflection_submitted', {
      props: { expectation: 'as_expected' },
    });
    const props = trackMock.mock.calls[0][1]?.props ?? {};
    expect(props).not.toHaveProperty('note');
    expect(props).not.toHaveProperty('text');
  });

  it('trackWatchlistChanged logs action + symbol for add and remove', () => {
    trackWatchlistChanged('add', 'MSFT');
    trackWatchlistChanged('remove', 'MSFT');
    expect(trackMock).toHaveBeenNthCalledWith(1, 'watchlist_changed', {
      props: { action: 'add', symbol: 'MSFT' },
    });
    expect(trackMock).toHaveBeenNthCalledWith(2, 'watchlist_changed', {
      props: { action: 'remove', symbol: 'MSFT' },
    });
  });

  it('trackStockViewed logs only the symbol', () => {
    trackStockViewed('NVDA');
    expect(trackMock).toHaveBeenCalledWith('stock_viewed', { props: { symbol: 'NVDA' } });
  });
});

describe('trading events survive sanitize but free text is stripped (Property 7)', () => {
  const ISO = '2025-01-01T00:00:00.000Z';

  it('keeps allowed props and drops a free-text "text" key', () => {
    const event = sanitizeEvent(
      'trade_placed',
      { props: { side: 'buy', symbol: 'AAPL', qty: 3, has_rationale: true, text: 'typed' } },
      ISO,
    );
    expect(event).not.toBeNull();
    expect(event?.name).toBe('trade_placed');
    expect(event?.props).toEqual({ side: 'buy', symbol: 'AAPL', qty: 3, has_rationale: true });
    expect(event?.props).not.toHaveProperty('text');
  });

  it('accepts each trading event name', () => {
    for (const name of [
      'trade_placed',
      'reflection_submitted',
      'watchlist_changed',
      'stock_viewed',
    ]) {
      expect(sanitizeEvent(name, {}, ISO)).not.toBeNull();
    }
  });
});
