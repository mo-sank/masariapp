import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '../../../theme/theme-provider';

// --- Mocks ------------------------------------------------------------------

// Imperative navigation to the ticket route.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (href: unknown) => mockPush(href) },
}));

// Unlocks query: control which feature keys the caller has (the gate).
let mockUnlocks: { feature_key: string }[] = [{ feature_key: 'market_buy' }];
jest.mock('../../lessons/hooks/use-unlocks', () => ({
  useUnlocks: () => ({ data: mockUnlocks }),
}));

// Lesson content: a known title for the lock hint.
jest.mock('../../lessons/content', () => ({
  getLesson: (_id: string) => ({ title: 'Your First Trade' }),
}));

// eslint-disable-next-line import/first -- after mocks
import { TradeButton } from './trade-button';

async function renderButton(ui: React.ReactElement) {
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

beforeEach(() => {
  jest.clearAllMocks();
  mockUnlocks = [{ feature_key: 'market_buy' }];
});

describe('<TradeButton /> gating', () => {
  it('shows a lock hint naming the lesson when trading is locked', async () => {
    mockUnlocks = [{ feature_key: 'stock_detail' }];
    const view = await renderButton(<TradeButton symbol="AAPL" isSignedIn />);

    expect(view.getByText(/Your First Trade/)).toBeTruthy();
    expect(view.queryByText('Trade')).toBeNull();
  });

  it('fails closed when unlocks are absent (e.g. loading)', async () => {
    mockUnlocks = [];
    const view = await renderButton(<TradeButton symbol="AAPL" isSignedIn />);
    expect(view.getByText(/first trade/i)).toBeTruthy();
    expect(view.queryByText('Trade')).toBeNull();
  });
});

describe('<TradeButton /> navigation', () => {
  it('shows the Trade button when buying is unlocked and routes to the ticket', async () => {
    const view = await renderButton(<TradeButton symbol="AAPL" isSignedIn />);
    const button = view.getByText('Trade');
    expect(button).toBeTruthy();

    fireEvent.press(button);
    expect(mockPush).toHaveBeenCalledWith('/trade/AAPL');
  });

  it('shows the Trade button when only selling is unlocked', async () => {
    mockUnlocks = [{ feature_key: 'market_sell' }];
    const view = await renderButton(<TradeButton symbol="AAPL" isSignedIn />);
    expect(view.getByText('Trade')).toBeTruthy();
  });
});
