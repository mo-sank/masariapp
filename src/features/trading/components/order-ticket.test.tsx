import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '../../../theme/theme-provider';

// --- Mocks ------------------------------------------------------------------

// Stub the Supabase singleton and expo-crypto so loading the (real) place-order
// module via requireActual below does not pull in native modules. We still use
// the real mapPlaceOrderError so error assertions exercise real copy.
jest.mock('../../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'fixed-ticket-uuid-1234') }));

// Unlocks query: control which feature keys the caller has (gates side + 9.1).
let mockUnlocks: { feature_key: string }[] = [{ feature_key: 'market_buy' }];
jest.mock('../../lessons/hooks/use-unlocks', () => ({
  useUnlocks: () => ({ data: mockUnlocks }),
}));

// Quote: control the current price for the estimate.
let mockQuote: { price_cents: number } | null = { price_cents: 15000 };
jest.mock('../../explore/use-quotes', () => ({
  useQuote: () => ({ data: mockQuote }),
}));

// Market status: control open/closed for the market-closed wording (8.6).
let mockMarketOpen = true;
jest.mock('../use-market-status', () => ({
  useMarketStatus: () => ({ data: { isOpen: mockMarketOpen } }),
}));

// Place-order mutation: capture mutate calls and drive success/error. Keep the
// real mapPlaceOrderError and feature-key constants.
const mockMutate = jest.fn();
let mockPending = false;
jest.mock('../use-place-order', () => {
  const actual = jest.requireActual('../use-place-order');
  return {
    ...actual,
    usePlaceOrder: () => ({ mutate: mockMutate, isPending: mockPending }),
  };
});

// eslint-disable-next-line import/first -- after mocks
import { OrderTicket } from './order-ticket';

async function renderTicket(ui: React.ReactElement) {
  return await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );
}

const onClose = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockUnlocks = [{ feature_key: 'market_buy' }];
  mockQuote = { price_cents: 15000 };
  mockMarketOpen = true;
  mockPending = false;
});

// Unmount between tests so a pending async render from one test never leaks
// state updates into the next (avoids overlapping act() warnings).
afterEach(() => {
  cleanup();
});

describe('<OrderTicket /> disclaimer (13.1)', () => {
  it('renders the persistent paper-money / not-advice disclaimer', async () => {
    const view = await renderTicket(<OrderTicket symbol="AAPL" isSignedIn onClose={onClose} />);
    expect(
      view.getByText('Paper money. Educational only. Not financial advice.'),
    ).toBeTruthy();
  });
});

describe('<OrderTicket /> estimate (8.1)', () => {
  it('shows the estimate as qty × current price in dollars', async () => {
    const view = await renderTicket(<OrderTicket symbol="AAPL" isSignedIn onClose={onClose} />);
    // 1 share × $150.00.
    expect(view.getByText('$150.00')).toBeTruthy();

    // Step up to 2 shares → $300.00 (further math is covered by the pure
    // estimateTotalCents unit tests).
    fireEvent.press(view.getByLabelText('Increase quantity'));
    expect(await view.findByText('$300.00')).toBeTruthy();
  });
});

describe('<OrderTicket /> rationale gating (9.1)', () => {
  it('requires a reason chip on a buy when rationale is unlocked', async () => {
    mockUnlocks = [{ feature_key: 'market_buy' }, { feature_key: 'pre_trade_rationale' }];
    const view = await renderTicket(<OrderTicket symbol="AAPL" isSignedIn onClose={onClose} />);

    // The chips are shown.
    expect(view.getByText('Why this trade? Pick at least one.')).toBeTruthy();

    // Submit is blocked until a chip is chosen.
    const submit = view.getByLabelText('Buy AAPL');
    expect(submit.props.accessibilityState.disabled).toBe(true);

    // Choosing a chip enables submit.
    fireEvent.press(view.getByText('I know the brand'));
    await waitFor(() => {
      expect(view.getByLabelText('Buy AAPL').props.accessibilityState.disabled).toBe(false);
    });
  });

  it('does not require a rationale when it is not unlocked', async () => {
    mockUnlocks = [{ feature_key: 'market_buy' }];
    const view = await renderTicket(<OrderTicket symbol="AAPL" isSignedIn onClose={onClose} />);
    expect(view.queryByText('Why this trade? Pick at least one.')).toBeNull();
    expect(view.getByLabelText('Buy AAPL').props.accessibilityState.disabled).toBe(false);
  });
});

describe('<OrderTicket /> market-closed wording (8.6)', () => {
  it('tells the learner the order fills at the last close when closed', async () => {
    mockMarketOpen = false;
    const view = await renderTicket(<OrderTicket symbol="AAPL" isSignedIn onClose={onClose} />);
    expect(view.getByText(/fill at the last close/i)).toBeTruthy();
  });

  it('does not show the closed wording while the market is open', async () => {
    mockMarketOpen = true;
    const view = await renderTicket(<OrderTicket symbol="AAPL" isSignedIn onClose={onClose} />);
    expect(view.queryByText(/fill at the last close/i)).toBeNull();
  });
});

describe('<OrderTicket /> submit (8.1, 8.5)', () => {
  it('places an order with no price and the ticket-session idempotency key', async () => {
    const view = await renderTicket(<OrderTicket symbol="AAPL" isSignedIn onClose={onClose} />);
    fireEvent.press(view.getByLabelText('Buy AAPL'));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    const [input] = mockMutate.mock.calls[0];
    expect(input).toMatchObject({
      symbol: 'AAPL',
      side: 'buy',
      qty: 1,
      idempotencyKey: 'fixed-ticket-uuid-1234',
    });
    // Never sends a price (8.1).
    expect(input).not.toHaveProperty('price');
    expect(input).not.toHaveProperty('priceCents');
  });
});

describe('<OrderTicket /> confirmation (8.4)', () => {
  it('shows the fill price, quantity, total, and price source on success', async () => {
    const view = await renderTicket(<OrderTicket symbol="AAPL" isSignedIn onClose={onClose} />);
    fireEvent.press(view.getByLabelText('Buy AAPL'));

    const [, handlers] = mockMutate.mock.calls[0];
    handlers.onSuccess({
      symbol: 'AAPL',
      side: 'buy',
      qty: 2,
      fill_price_cents: 15000,
      total_cents: 30000,
      price_source: 'delayed_quote',
    });

    await waitFor(() => {
      expect(view.getByText('Order filled 🎉')).toBeTruthy();
    });
    expect(view.getByText('$150.00')).toBeTruthy(); // fill price
    expect(view.getByText('$300.00')).toBeTruthy(); // total
    expect(view.getByText('Delayed quote')).toBeTruthy(); // price source
    expect(view.getByText(/Bought 2 shares of AAPL/)).toBeTruthy();
    // The confirmation (a transient price screen) still carries the disclaimer (13.1).
    expect(
      view.getByText('Paper money. Educational only. Not financial advice.'),
    ).toBeTruthy();
  });

  it('labels the price source as last close when the order filled closed (8.6)', async () => {
    const view = await renderTicket(<OrderTicket symbol="AAPL" isSignedIn onClose={onClose} />);
    fireEvent.press(view.getByLabelText('Buy AAPL'));

    const [, handlers] = mockMutate.mock.calls[0];
    handlers.onSuccess({
      symbol: 'AAPL',
      side: 'buy',
      qty: 1,
      fill_price_cents: 15000,
      total_cents: 15000,
      price_source: 'last_close',
    });

    await waitFor(() => {
      expect(view.getByText(/Last close/i)).toBeTruthy();
    });
  });
});

describe('<OrderTicket /> error display (8.7)', () => {
  it('keeps the ticket open and shows friendly copy on an error', async () => {
    const view = await renderTicket(<OrderTicket symbol="AAPL" isSignedIn onClose={onClose} />);
    fireEvent.press(view.getByLabelText('Buy AAPL'));

    const [, handlers] = mockMutate.mock.calls[0];
    handlers.onError(new Error('insufficient_cash'));

    await waitFor(() => {
      expect(view.getByText(/enough paper cash/i)).toBeTruthy();
    });
    // Still on the form (confirmation not shown).
    expect(view.queryByText('Order filled 🎉')).toBeNull();
    // The submit button is still available for a retry.
    expect(view.getByLabelText('Buy AAPL')).toBeTruthy();
  });
});

describe('<OrderTicket /> side gating', () => {
  it('shows a locked message when neither side is unlocked', async () => {
    mockUnlocks = [{ feature_key: 'explore' }];
    const view = await renderTicket(<OrderTicket symbol="AAPL" isSignedIn onClose={onClose} />);
    expect(view.getByText(/unlock buying and selling/i)).toBeTruthy();
    expect(view.queryByLabelText('Buy AAPL')).toBeNull();
  });

  it('disables the Sell toggle when only buying is unlocked', async () => {
    mockUnlocks = [{ feature_key: 'market_buy' }];
    const view = await renderTicket(<OrderTicket symbol="AAPL" isSignedIn onClose={onClose} />);
    expect(view.getByLabelText('Sell').props.accessibilityState.disabled).toBe(true);
    expect(view.getByLabelText('Buy').props.accessibilityState.disabled).toBe(false);
  });
});
