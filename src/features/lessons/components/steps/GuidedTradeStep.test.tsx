import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ThemeProvider } from '../../../../theme/theme-provider';
import type { GuidedTradeStep as GuidedTradeStepType } from '../../schema';

// --- Mocks ------------------------------------------------------------------

// Stub the Supabase singleton and expo-crypto so loading the (real) place-order
// module via requireActual does not pull in native modules. We keep the real
// mapPlaceOrderError and order-ticket-logic so copy and gating are exercised.
jest.mock('../../../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'fixed-guided-uuid-1234') }));

// Session: the guided step reads isSignedIn to gate its queries.
let mockSignedIn = true;
jest.mock('../../../../lib/auth0', () => ({
  useSession: () => ({ isSignedIn: mockSignedIn }),
}));

// Instruments: control the starter / non-starter universe. The step must only
// ever offer the starters.
let mockInstruments: { symbol: string; name: string; is_starter: boolean }[] = [
  { symbol: 'AAPL', name: 'Apple', is_starter: true },
  { symbol: 'MSFT', name: 'Microsoft', is_starter: true },
  { symbol: 'TSLA', name: 'Tesla', is_starter: false },
];
jest.mock('../../../explore/use-instruments', () => ({
  useInstruments: () => ({ data: mockInstruments }),
}));

// Unlocks: control whether buying is unlocked.
let mockUnlocks: { feature_key: string }[] = [{ feature_key: 'market_buy' }];
jest.mock('../../hooks/use-unlocks', () => ({
  useUnlocks: () => ({ data: mockUnlocks }),
}));

// Quote: control the current price for the estimate.
let mockQuote: { price_cents: number } | null = { price_cents: 15000 };
jest.mock('../../../explore/use-quotes', () => ({
  useQuote: () => ({ data: mockQuote }),
}));

// Place-order mutation: capture mutate calls and drive success/error. Keep the
// real mapPlaceOrderError, newIdempotencyKey, and feature-key constants.
const mockMutate = jest.fn();
let mockPending = false;
jest.mock('../../../trading/use-place-order', () => {
  const actual = jest.requireActual('../../../trading/use-place-order');
  return {
    ...actual,
    usePlaceOrder: () => ({ mutate: mockMutate, isPending: mockPending }),
  };
});

// eslint-disable-next-line import/first -- after mocks
import { GuidedTradeStep } from './GuidedTradeStep';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

function makeStep(overrides: Partial<GuidedTradeStepType> = {}): GuidedTradeStepType {
  return {
    id: 's1',
    type: 'guided_trade',
    symbols: 'starter',
    requireRationale: true,
    ...overrides,
  } as GuidedTradeStepType;
}

const onAnswer = jest.fn();
const onContinue = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockSignedIn = true;
  mockInstruments = [
    { symbol: 'AAPL', name: 'Apple', is_starter: true },
    { symbol: 'MSFT', name: 'Microsoft', is_starter: true },
    { symbol: 'TSLA', name: 'Tesla', is_starter: false },
  ];
  mockUnlocks = [{ feature_key: 'market_buy' }];
  mockQuote = { price_cents: 15000 };
  mockPending = false;
});

afterEach(() => {
  cleanup();
});

describe('<GuidedTradeStep /> (requirements 8.1, 9.1)', () => {
  it('offers starter instruments only, never the full universe', async () => {
    await renderWithTheme(
      <GuidedTradeStep step={makeStep()} onAnswer={onAnswer} onContinue={onContinue} />,
    );
    expect(screen.getByLabelText('AAPL Apple')).toBeTruthy();
    expect(screen.getByLabelText('MSFT Microsoft')).toBeTruthy();
    // TSLA is not a starter → it must not be offered.
    expect(screen.queryByLabelText('TSLA Tesla')).toBeNull();
  });

  it('requires a reason chip before the buy can be submitted (9.1)', async () => {
    await renderWithTheme(
      <GuidedTradeStep step={makeStep()} onAnswer={onAnswer} onContinue={onContinue} />,
    );

    // Pick a starter → the quantity, estimate, and rationale appear.
    fireEvent.press(screen.getByLabelText('AAPL Apple'));

    // Estimate: 1 share × $150.00 (further math is covered by estimateTotalCents
    // unit tests).
    expect(await screen.findByText('$150.00')).toBeTruthy();

    // Submit is blocked until at least one rationale chip is chosen (9.1).
    expect(screen.getByLabelText('Buy AAPL').props.accessibilityState.disabled).toBe(true);

    fireEvent.press(screen.getByText('I know the brand'));
    await waitFor(() => {
      expect(screen.getByLabelText('Buy AAPL').props.accessibilityState.disabled).toBe(false);
    });
  });

  it('places a buy with no price and the session idempotency key (8.1, 8.5)', async () => {
    await renderWithTheme(
      <GuidedTradeStep step={makeStep()} onAnswer={onAnswer} onContinue={onContinue} />,
    );
    fireEvent.press(screen.getByLabelText('AAPL Apple'));
    fireEvent.press(await screen.findByText('I know the brand'));
    await waitFor(() => {
      expect(screen.getByLabelText('Buy AAPL').props.accessibilityState.disabled).toBe(false);
    });

    fireEvent.press(screen.getByLabelText('Buy AAPL'));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    const [input] = mockMutate.mock.calls[0];
    expect(input).toMatchObject({
      symbol: 'AAPL',
      side: 'buy',
      qty: 1,
      idempotencyKey: 'fixed-guided-uuid-1234',
      rationaleTags: ['know_the_brand'],
    });
    // Never sends a price (8.1).
    expect(input).not.toHaveProperty('price');
    expect(input).not.toHaveProperty('priceCents');
  });

  it('celebrates on success then advances via onContinue, never scoring (4.8)', async () => {
    await renderWithTheme(
      <GuidedTradeStep step={makeStep()} onAnswer={onAnswer} onContinue={onContinue} />,
    );
    fireEvent.press(screen.getByLabelText('AAPL Apple'));
    fireEvent.press(await screen.findByText('I know the brand'));
    await waitFor(() => {
      expect(screen.getByLabelText('Buy AAPL').props.accessibilityState.disabled).toBe(false);
    });

    fireEvent.press(screen.getByLabelText('Buy AAPL'));
    const [, handlers] = mockMutate.mock.calls[0];
    handlers.onSuccess({ symbol: 'AAPL', side: 'buy', qty: 2 });

    await waitFor(() => {
      expect(screen.getByText('You placed your first trade! 🎉')).toBeTruthy();
    });
    expect(screen.getByText(/bought 2 shares of AAPL/i)).toBeTruthy();
    // The celebration carries the persistent not-advice disclaimer (13.1).
    expect(
      screen.getByText('Paper money. Educational only. Not financial advice.'),
    ).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Continue to the next step'));
    expect(onContinue).toHaveBeenCalledTimes(1);
    // A guided_trade step is never scored, so it must not report an answer.
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('shows friendly copy on an order error and stays open (8.7)', async () => {
    await renderWithTheme(
      <GuidedTradeStep step={makeStep()} onAnswer={onAnswer} onContinue={onContinue} />,
    );
    fireEvent.press(screen.getByLabelText('AAPL Apple'));
    fireEvent.press(await screen.findByText('I know the brand'));
    await waitFor(() => {
      expect(screen.getByLabelText('Buy AAPL').props.accessibilityState.disabled).toBe(false);
    });

    fireEvent.press(screen.getByLabelText('Buy AAPL'));
    const [, handlers] = mockMutate.mock.calls[0];
    handlers.onError(new Error('insufficient_cash'));

    await waitFor(() => {
      expect(screen.getByText(/enough paper cash/i)).toBeTruthy();
    });
    // Still on the form (no celebration), and the buy is still available to retry.
    expect(screen.queryByText('You placed your first trade! 🎉')).toBeNull();
    expect(screen.getByLabelText('Buy AAPL')).toBeTruthy();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('lets the learner skip and continue without trading (never a dead end)', async () => {
    await renderWithTheme(
      <GuidedTradeStep step={makeStep()} onAnswer={onAnswer} onContinue={onContinue} />,
    );
    fireEvent.press(screen.getByLabelText('Skip the trade and continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('still offers Continue when buying is not unlocked yet (4.8)', async () => {
    mockUnlocks = [{ feature_key: 'explore' }];
    await renderWithTheme(
      <GuidedTradeStep step={makeStep()} onAnswer={onAnswer} onContinue={onContinue} />,
    );
    expect(screen.getByText(/Trading unlocks a little further along/i)).toBeTruthy();
    // No starter picker is shown when the learner cannot buy.
    expect(screen.queryByLabelText('AAPL Apple')).toBeNull();

    fireEvent.press(screen.getByLabelText('Continue to the next step'));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
  });
});
