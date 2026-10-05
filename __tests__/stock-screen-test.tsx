import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '../src/theme/theme-provider';

// --- Mocks ------------------------------------------------------------------

// Route params + imperative navigation.
let mockParams: { symbol?: string } = { symbol: 'AAPL' };
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  router: { push: (href: unknown) => mockPush(href) },
}));

// Session: signed in by default so the unlocks query is enabled.
let mockSignedIn = true;
jest.mock('../src/lib/auth0', () => ({
  useSession: () => ({ isSignedIn: mockSignedIn, isLoading: false }),
}));

// Unlocks: control which feature keys are unlocked.
let mockUnlocks: { feature_key: string }[] = [{ feature_key: 'stock_detail' }];
jest.mock('../src/features/lessons/hooks/use-unlocks', () => ({
  useUnlocks: () => ({ data: mockUnlocks, isLoading: false, isError: false }),
}));

// Quote hook.
let mockQuote: {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  refetch: jest.Mock;
} = {
  data: {
    symbol: 'AAPL',
    price_cents: 10500,
    prev_close_cents: 10000,
    open_cents: 10100,
    high_cents: 10700,
    low_cents: 10050,
    volume: 1234567,
    as_of: '2025-01-01T00:00:00.000Z',
    is_delayed: true,
    source: 'test',
    updated_at: '2025-01-01T00:00:00.000Z',
  },
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
};
jest.mock('../src/features/explore/use-quotes', () => ({
  useQuote: () => mockQuote,
}));

// Instruments hook (name + sector lookup).
let mockInstruments: { data: unknown[] } = {
  data: [
    {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      sector: 'Technology',
      is_active: true,
      is_starter: true,
      sort_order: 1,
      type: 'stock',
    },
  ],
};
jest.mock('../src/features/explore/use-instruments', () => ({
  useInstruments: () => mockInstruments,
}));

// Bars hook: track the range it is called with so we can assert the toggle.
const mockUseBars = jest.fn();
let mockBars: { data: unknown[] } = {
  data: [
    { symbol: 'AAPL', bar_date: '2025-01-01', open_cents: 9900, high_cents: 10100, low_cents: 9800, close_cents: 10000, volume: 1 },
    { symbol: 'AAPL', bar_date: '2025-01-02', open_cents: 10000, high_cents: 10600, low_cents: 9950, close_cents: 10500, volume: 1 },
  ],
};
jest.mock('../src/features/trading/use-bars', () => ({
  useBars: (symbol: string, range: string, enabled?: boolean) => {
    mockUseBars(symbol, range, enabled);
    return mockBars;
  },
}));

// Orders hook (trade markers).
let mockOrders: { data: unknown[] } = { data: [] };
jest.mock('../src/features/trading/use-orders', () => ({
  useOrders: () => mockOrders,
}));

// Market status: open by default.
let mockMarket = {
  data: { status: 'open', session: 'regular', isOpen: true, isExtended: false, holidayName: null },
};
jest.mock('../src/features/trading/use-market-status', () => ({
  useMarketStatus: () => mockMarket,
}));

// Watchlist read + mutations: stub so the WatchlistButton on the page does not
// pull in the real Supabase client/config. The watchlist's own gating and
// add/remove behavior is covered by watchlist-button.test.tsx; here we only need
// the page to render with the button present.
let mockWatchlist: { symbol: string }[] = [];
jest.mock('../src/features/watchlist/use-watchlist', () => ({
  useWatchlist: () => ({ data: mockWatchlist }),
}));
jest.mock('../src/features/watchlist/use-watchlist-mutations', () => ({
  useWatchlistAdd: () => ({ mutate: jest.fn(), isPending: false }),
  useWatchlistRemove: () => ({ mutate: jest.fn(), isPending: false }),
  mapWatchlistError: () => 'error',
}));
jest.mock('../src/components/ui', () => {
  const actual = jest.requireActual('../src/components/ui');
  return { ...actual, useToast: () => ({ show: jest.fn(), hide: jest.fn() }) };
});

// Stub the Supabase singleton so loading the trading components barrel (which
// now includes the order ticket / TradeButton → use-place-order) does not pull
// in the real client/config. The TradeButton's own gating + routing is covered
// by trade-button.test.tsx; here we only need the page to render.
jest.mock('../src/lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));

// Import after mocks are registered.
import StockScreen from '../app/stock/[symbol]';

async function renderScreen() {
  return await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>
        <StockScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { symbol: 'AAPL' };
  mockSignedIn = true;
  mockUnlocks = [{ feature_key: 'stock_detail' }];
  mockQuote = {
    data: {
      symbol: 'AAPL',
      price_cents: 10500,
      prev_close_cents: 10000,
      open_cents: 10100,
      high_cents: 10700,
      low_cents: 10050,
      volume: 1234567,
      as_of: '2025-01-01T00:00:00.000Z',
      is_delayed: true,
      source: 'test',
      updated_at: '2025-01-01T00:00:00.000Z',
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  mockInstruments = {
    data: [
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        sector: 'Technology',
        is_active: true,
        is_starter: true,
        sort_order: 1,
        type: 'stock',
      },
    ],
  };
  mockBars = {
    data: [
      { symbol: 'AAPL', bar_date: '2025-01-01', open_cents: 9900, high_cents: 10100, low_cents: 9800, close_cents: 10000, volume: 1 },
      { symbol: 'AAPL', bar_date: '2025-01-02', open_cents: 10000, high_cents: 10600, low_cents: 9950, close_cents: 10500, volume: 1 },
    ],
  };
  mockOrders = { data: [] };
  mockMarket = { data: { status: 'open', session: 'regular', isOpen: true, isExtended: false, holidayName: null } };
  mockWatchlist = [];
});

describe('<StockScreen />', () => {
  it('shows the locked state naming the unlocking lesson when stock_detail is locked (5.1)', async () => {
    mockUnlocks = [];
    await renderScreen();
    expect(screen.getByText('Stock details is locked')).toBeTruthy();
    expect(screen.getByText(/Anatomy of a Stock Card/)).toBeTruthy();
  });

  it('fails closed while unlocks are empty even when signed in', async () => {
    mockUnlocks = [{ feature_key: 'explore' }];
    await renderScreen();
    expect(screen.getByText('Stock details is locked')).toBeTruthy();
  });

  it('renders price, previous close, day range, volume and sector when unlocked (5.1)', async () => {
    await renderScreen();

    expect(screen.getByText('AAPL')).toBeTruthy();
    expect(screen.getByText('Apple Inc.')).toBeTruthy();
    expect(screen.getByText('$105.00')).toBeTruthy();
    // Previous close.
    expect(screen.getByText('$100.00')).toBeTruthy();
    // Day range low – high.
    expect(screen.getByText('$100.50 – $107.00')).toBeTruthy();
    // Volume grouped.
    expect(screen.getByText('1,234,567')).toBeTruthy();
    // Sector.
    expect(screen.getByText('Technology')).toBeTruthy();
  });

  it('always renders the paper-money / not-advice disclaimer (5.4)', async () => {
    await renderScreen();
    expect(screen.getByText('Paper money. Educational only. Not financial advice.')).toBeTruthy();
  });

  it('shows the watchlist lock hint when watchlist is locked (6.3)', async () => {
    // Default unlocks grant stock_detail but not watchlist.
    await renderScreen();
    expect(screen.getByText(/The Auction Room/)).toBeTruthy();
    expect(screen.queryByText('Add to watchlist')).toBeNull();
  });

  it('shows the watchlist add toggle when watchlist is unlocked (6.1)', async () => {
    mockUnlocks = [{ feature_key: 'stock_detail' }, { feature_key: 'watchlist' }];
    await renderScreen();
    expect(screen.getByText('Add to watchlist')).toBeTruthy();
  });

  it('shows a fixed 1M chart with a lock hint when chart ranges are locked (5.2)', async () => {
    await renderScreen();

    // No range toggle rendered.
    expect(screen.queryByLabelText('Range 3M')).toBeNull();
    // Lock hint names the unlocking lesson.
    expect(screen.getByText(/Charts Tell Stories/)).toBeTruthy();
    // Bars fetched for the fixed 1M range.
    expect(mockUseBars).toHaveBeenCalledWith('AAPL', '1M', undefined);
  });

  it('offers the range toggle and refetches bars when a range is picked (5.2)', async () => {
    mockUnlocks = [{ feature_key: 'stock_detail' }, { feature_key: 'chart_time_ranges' }];
    await renderScreen();

    expect(screen.getByLabelText('Range 1M')).toBeTruthy();
    expect(screen.getByLabelText('Range 5Y')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Range 1Y'));
    await waitFor(() => {
      expect(mockUseBars).toHaveBeenCalledWith('AAPL', '1Y', undefined);
    });
  });

  it('shows a loading state while the quote loads', async () => {
    mockQuote = { data: undefined, isLoading: true, isError: false, refetch: jest.fn() };
    await renderScreen();
    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  it('shows an error state with retry when the quote fails', async () => {
    const refetch = jest.fn();
    mockQuote = { data: undefined, isLoading: false, isError: true, refetch };
    await renderScreen();

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
