import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '../src/theme/theme-provider';
import type { Portfolio, PortfolioPosition } from '../src/features/portfolio/use-portfolio';

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

// Unlocks: control whether portfolio is unlocked.
let mockUnlocks: { feature_key: string }[] = [{ feature_key: 'portfolio' }];
jest.mock('../src/features/lessons/hooks/use-unlocks', () => ({
  useUnlocks: () => ({ data: mockUnlocks, isLoading: false, isError: false }),
}));

// Portfolio hook: feed controlled data / states.
let mockPortfolio = {
  data: undefined as Portfolio | undefined,
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
};
jest.mock('../src/features/portfolio/use-portfolio', () => ({
  usePortfolio: () => mockPortfolio,
}));

// Import after mocks are registered.
import PortfolioScreen from '../app/(tabs)/portfolio';

function makePosition(overrides: Partial<PortfolioPosition> = {}): PortfolioPosition {
  return {
    symbol: 'AAPL',
    qty: 3,
    costBasisCents: 30000,
    avgCostCents: 10000,
    currentPriceCents: 11000,
    valueCents: 33000,
    gainCents: 3000,
    gainBasisPoints: 1000,
    ...overrides,
  };
}

function makePortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    account: null,
    cashCents: 70000,
    positionsValueCents: 33000,
    equityCents: 103000,
    startingCashCents: 100000,
    totalGainCents: 3000,
    totalGainBasisPoints: 300,
    positions: [makePosition()],
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
        <PortfolioScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignedIn = true;
  mockUnlocks = [{ feature_key: 'portfolio' }];
  mockPortfolio = {
    data: makePortfolio(),
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
});

describe('<PortfolioScreen />', () => {
  it('shows the locked state naming the unlocking lesson when portfolio is locked (7.2)', async () => {
    mockUnlocks = [];
    await renderScreen();
    expect(screen.getByText('Portfolio is locked')).toBeTruthy();
    expect(screen.getByText(/Your First Trade/)).toBeTruthy();
  });

  it('fails closed when the portfolio unlock is absent even when signed in', async () => {
    mockUnlocks = [{ feature_key: 'explore' }];
    await renderScreen();
    expect(screen.getByText('Portfolio is locked')).toBeTruthy();
  });

  it('shows equity, gain/loss, cash, and a Paper money label when unlocked (7.1, 7.4)', async () => {
    await renderScreen();

    // Total equity headline, from integer cents.
    expect(screen.getByText('$1,030.00')).toBeTruthy();
    // Gain/loss versus starting cash in dollars and percent.
    expect(screen.getByText('+$30.00 (+3.00%)')).toBeTruthy();
    // Cash line.
    expect(screen.getByText('Cash $700.00')).toBeTruthy();
    // Paper-money labeling and the not-advice disclaimer.
    expect(screen.getByText('Paper money')).toBeTruthy();
    expect(
      screen.getByText('Paper money. Educational only. Not financial advice.'),
    ).toBeTruthy();
  });

  it('renders a position row with symbol, shares, value, and gain/loss (7.2)', async () => {
    await renderScreen();

    expect(screen.getByText('AAPL')).toBeTruthy();
    expect(screen.getByText(/3 shares/)).toBeTruthy();
    // Average cost and current price on the supporting line.
    expect(screen.getByText(/avg \$100\.00/)).toBeTruthy();
    expect(screen.getByText(/now \$110\.00/)).toBeTruthy();
    // Market value and unrealized gain/loss.
    expect(screen.getByText('$330.00')).toBeTruthy();
    expect(screen.getByText('+$30.00 (+10.00%)')).toBeTruthy();
  });

  it('shows an empty state inviting the learner to Explore when holding only cash (7.3)', async () => {
    mockPortfolio = {
      data: makePortfolio({ positions: [], positionsValueCents: 0, equityCents: 100000 }),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    };
    await renderScreen();

    expect(screen.getByText('No holdings yet')).toBeTruthy();
    fireEvent.press(screen.getByText('Explore the market'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/explore');
  });

  it('shows the loading state while the portfolio loads', async () => {
    mockPortfolio = { data: undefined, isLoading: true, isError: false, refetch: jest.fn() };
    await renderScreen();
    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  it('shows an error state with retry when loading fails', async () => {
    const refetch = jest.fn();
    mockPortfolio = { data: undefined, isLoading: false, isError: true, refetch };
    await renderScreen();

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
