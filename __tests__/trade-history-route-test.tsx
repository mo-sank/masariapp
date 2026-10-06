import { render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '../src/theme/theme-provider';
import type { Database } from '../src/types/db';

type OrderRow = Database['public']['Tables']['orders']['Row'];
type ReflectionRow = Database['public']['Tables']['trade_reflections']['Row'];

// --- Mocks ------------------------------------------------------------------

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (href: string) => mockPush(href) },
}));

// The trading components barrel pulls in use-reflection -> the Supabase client
// (a native module chain). Stub the client so the route loads under Jest; the
// mutation path is covered by use-reflection's own tests.
jest.mock('../src/lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));

// Session: signed in for every test here.
jest.mock('../src/lib/auth0', () => ({
  useSession: () => ({ isSignedIn: true }),
}));

// Unlocks: driven per test. The shared useUnlock hook (behind Gate) only reports
// a feature unlocked when the backing query has succeeded, so derive isSuccess /
// isLoading from whether the data has resolved (undefined models loading).
let mockUnlocks: { data: { feature_key: string }[] | undefined };
jest.mock('../src/features/lessons/hooks/use-unlocks', () => ({
  useUnlocks: () => ({
    data: mockUnlocks.data,
    isSuccess: mockUnlocks.data !== undefined,
    isLoading: mockUnlocks.data === undefined,
    isError: false,
    refetch: jest.fn(),
  }),
}));

// Orders / reflections queries: driven per test.
let mockOrders: { data: OrderRow[]; isLoading: boolean; isError: boolean; refetch: jest.Mock };
let mockReflections: {
  data: ReflectionRow[];
  isLoading: boolean;
  isError: boolean;
  refetch: jest.Mock;
};
jest.mock('../src/features/trading/use-orders', () => ({
  ORDERS_QUERY_KEY: ['orders', 'me'],
  useOrders: () => mockOrders,
}));
// Provide a lightweight stand-in so the route loads without the Supabase client
// (the real module imports it). reflectionsByOrderId mirrors the real helper.
jest.mock('../src/features/trading/use-reflections', () => ({
  REFLECTIONS_QUERY_KEY: ['reflections', 'me'],
  useReflections: () => mockReflections,
  reflectionsByOrderId: (rows: { order_id: string }[]) =>
    new Map(rows.map((r) => [r.order_id, r])),
}));

// Lesson content: resolve the unlocking lesson's title.
jest.mock('../src/features/lessons/content', () => ({
  getLesson: (id: string) => (id === 'L1.5' ? { title: 'Win, Lose, or Hold' } : undefined),
}));

import TradeHistoryScreen from '../app/history';

function makeOrder(overrides: Partial<OrderRow>): OrderRow {
  return {
    id: 'o1',
    account_id: 'acc1',
    user_id: 'u1',
    symbol: 'AAPL',
    side: 'buy',
    order_type: 'market',
    qty: 2,
    status: 'filled',
    fill_price_cents: 15000,
    total_cents: 30000,
    realized_pl_cents: null,
    price_as_of: null,
    price_source: 'delayed_quote',
    rationale_tags: [],
    rationale_text: null,
    idempotency_key: 'k1',
    created_at: '2025-01-10T15:00:00Z',
    ...overrides,
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
        <TradeHistoryScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUnlocks = { data: [{ feature_key: 'trade_history' }] };
  mockOrders = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
  mockReflections = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
});

describe('<TradeHistoryScreen /> route', () => {
  it('shows the locked state naming the unlocking lesson when locked (10.1)', async () => {
    mockUnlocks = { data: [] };
    await renderScreen();

    expect(screen.getByText('Trade history is locked')).toBeTruthy();
    expect(
      screen.getByText('Complete "Win, Lose, or Hold" to unlock Trade history.'),
    ).toBeTruthy();
  });

  it('fails closed while unlocks are still loading (shows loading, not the history)', async () => {
    mockUnlocks = { data: undefined };
    await renderScreen();
    // Fail closed: the gate shows a loading placeholder and never the history.
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.queryByText('No trades yet')).toBeNull();
  });

  it('shows a friendly empty state when unlocked with no orders (10.1)', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByText('No trades yet')).toBeTruthy());
  });

  it('renders the history list with a sell row, realized P&L, rationale and reflection (10.1, 9.2)', async () => {
    mockOrders = {
      data: [
        makeOrder({
          id: 'o-sell',
          side: 'sell',
          qty: 2,
          symbol: 'AAPL',
          fill_price_cents: 16000,
          total_cents: 32000,
          realized_pl_cents: 2000,
          rationale_tags: ['know_the_brand'],
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    };
    mockReflections = {
      data: [
        {
          id: 'r1',
          order_id: 'o-sell',
          user_id: 'u1',
          expectation: 'worse',
          note: 'Panic sold',
          created_at: '2025-01-10T16:00:00Z',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    };

    await renderScreen();

    expect(screen.getByText('Sold 2 shares of AAPL')).toBeTruthy();
    expect(screen.getByText('+$20.00')).toBeTruthy();
    expect(screen.getByText('I know the brand')).toBeTruthy();
    expect(screen.getByText('Worse')).toBeTruthy();
    expect(screen.getByText('Panic sold')).toBeTruthy();
  });
});
