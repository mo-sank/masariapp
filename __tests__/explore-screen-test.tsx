import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '../src/theme/theme-provider';
import type { ExploreListItem } from '../src/features/explore/use-explore-list';
import type { MarketStatusResult } from '../src/features/trading/use-market-status';

// --- Mocks ------------------------------------------------------------------

// Imperative navigation.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (href: unknown) => mockPush(href) },
}));

// Session: signed in by default so the unlocks query is enabled.
let mockSignedIn = true;
jest.mock('../src/lib/auth0', () => ({
  useSession: () => ({ isSignedIn: mockSignedIn, isLoading: false }),
}));

// Unlocks: control whether explore is unlocked.
let mockUnlocks: { feature_key: string }[] = [{ feature_key: 'explore' }];
jest.mock('../src/features/lessons/hooks/use-unlocks', () => ({
  useUnlocks: () => ({ data: mockUnlocks, isLoading: false, isError: false }),
}));

// Explore list hook: feed controlled items / states.
let mockList = {
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
  items: [] as ExploreListItem[],
};
jest.mock('../src/features/explore/use-explore-list', () => ({
  useExploreList: () => mockList,
}));

// Market status: open by default.
let mockMarket: { data: MarketStatusResult } = {
  data: { status: 'open', isOpen: true, holidayName: null },
};
jest.mock('../src/features/trading/use-market-status', () => ({
  useMarketStatus: () => mockMarket,
}));

// Import after mocks are registered.
import ExploreScreen from '../app/(tabs)/explore';

function makeItem(
  symbol: string,
  name: string,
  overrides: Partial<ExploreListItem['instrument']> = {},
  priceCents = 10500,
): ExploreListItem {
  return {
    instrument: {
      symbol,
      name,
      is_active: true,
      is_starter: false,
      sector: null,
      sort_order: null,
      type: 'stock',
      ...overrides,
    },
    quote: {
      symbol,
      as_of: '2025-01-01T00:00:00.000Z',
      high_cents: null,
      is_delayed: true,
      low_cents: null,
      open_cents: null,
      prev_close_cents: 10000,
      price_cents: priceCents,
      source: 'test',
      updated_at: '2025-01-01T00:00:00.000Z',
      volume: null,
    },
  };
}

async function renderScreen() {
  return await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>
        <ExploreScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignedIn = true;
  mockUnlocks = [{ feature_key: 'explore' }];
  mockList = { isLoading: false, isError: false, refetch: jest.fn(), items: [] };
  mockMarket = { data: { status: 'open', isOpen: true, holidayName: null } };
});

describe('<ExploreScreen />', () => {
  it('shows the locked state naming the unlocking lesson when explore is locked (4.3)', async () => {
    mockUnlocks = [];
    await renderScreen();
    expect(screen.getByText('Explore is locked')).toBeTruthy();
    expect(screen.getByText(/Slice the Pizza/)).toBeTruthy();
  });

  it('fails closed while unlocks are empty even when signed in', async () => {
    mockUnlocks = [{ feature_key: 'watchlist' }];
    await renderScreen();
    expect(screen.getByText('Explore is locked')).toBeTruthy();
  });

  it('lists instruments with a starter tag, price, and market/delayed labels when unlocked (4.1, 4.4, 11.1)', async () => {
    mockList = {
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      items: [
        makeItem('AAPL', 'Apple Inc.', { is_starter: true }),
        makeItem('ZZZ', 'Zeta Corp.'),
      ],
    };
    await renderScreen();

    expect(screen.getByText('AAPL')).toBeTruthy();
    expect(screen.getByText('Apple Inc.')).toBeTruthy();
    expect(screen.getByText('Starter')).toBeTruthy();
    expect(screen.getByText('Market open')).toBeTruthy();
    expect(screen.getByText(/Delayed ~15 min/)).toBeTruthy();
    // Price formatted from cents.
    expect(screen.getAllByText('$105.00').length).toBeGreaterThan(0);
    // Persistent paper-money / not-advice disclaimer (13.1).
    expect(
      screen.getByText('Paper money. Educational only. Not financial advice.'),
    ).toBeTruthy();
  });

  it('labels prices as last close when the market is closed (11.2)', async () => {
    mockMarket = {
      data: { status: 'closed_holiday', isOpen: false, holidayName: 'Independence Day' },
    };
    mockList = {
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      items: [makeItem('AAPL', 'Apple Inc.')],
    };
    await renderScreen();

    expect(screen.getByText('Market closed · Independence Day')).toBeTruthy();
    expect(screen.getByText(/Last close/)).toBeTruthy();
  });

  it('navigates to the stock detail route on row tap', async () => {
    mockList = {
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      items: [makeItem('AAPL', 'Apple Inc.')],
    };
    await renderScreen();

    fireEvent.press(screen.getByText('AAPL'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/stock/[symbol]',
      params: { symbol: 'AAPL' },
    });
  });

  it('shows a search box and an empty state when a query matches nothing (4.3)', async () => {
    mockList = { isLoading: false, isError: false, refetch: jest.fn(), items: [] };
    await renderScreen();

    expect(screen.getByLabelText('Search instruments')).toBeTruthy();
    expect(screen.getByText('No matches')).toBeTruthy();
  });

  it('shows an error state with retry when loading fails', async () => {
    const refetch = jest.fn();
    mockList = { isLoading: false, isError: true, refetch, items: [] };
    await renderScreen();

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
