import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '../../../theme/theme-provider';

// --- Mocks ------------------------------------------------------------------

// Stub the Supabase singleton so loading the (real) mutations module via
// requireActual below does not pull in the native auth0 chain. We still use the
// real mapWatchlistError so the limit-message assertion exercises real copy.
jest.mock('../../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

// Unlocks query: control which feature keys the caller has (gate, 6.3).
let mockUnlocks: { feature_key: string }[] = [{ feature_key: 'watchlist' }];
jest.mock('../../lessons/hooks/use-unlocks', () => ({
  useUnlocks: () => ({ data: mockUnlocks }),
}));

// Watchlist query: control whether the symbol is already followed (6.1).
let mockWatchlist: { symbol: string }[] = [];
jest.mock('../use-watchlist', () => ({
  useWatchlist: () => ({ data: mockWatchlist }),
}));

// app_config: control the configured watchlist_max the button reads (8.1).
let mockWatchlistMax = 5;
jest.mock('../../config/use-app-config', () => ({
  useAppConfig: () => ({
    config: { watchlist_max: mockWatchlistMax },
    isLoading: false,
    isError: false,
    getNumber: (_key: string) => mockWatchlistMax,
  }),
}));

// Add/remove mutations: capture the mutate calls and drive success/error.
const mockAddMutate = jest.fn();
const mockRemoveMutate = jest.fn();
jest.mock('../use-watchlist-mutations', () => {
  const actual = jest.requireActual('../use-watchlist-mutations');
  return {
    ...actual,
    useWatchlistAdd: () => ({ mutate: mockAddMutate, isPending: false }),
    useWatchlistRemove: () => ({ mutate: mockRemoveMutate, isPending: false }),
  };
});

// Toast: assert the feedback / limit message is shown (6.1, 6.2).
const mockToastShow = jest.fn();
jest.mock('../../../components/ui', () => {
  const actual = jest.requireActual('../../../components/ui');
  return { ...actual, useToast: () => ({ show: mockToastShow, hide: jest.fn() }) };
});

// Lesson content: return a known title for the lock hint (6.3).
jest.mock('../../lessons/content', () => ({
  getLesson: (_id: string) => ({ title: 'The Auction Room' }),
}));

// eslint-disable-next-line import/first -- after mocks
import { WatchlistButton } from './watchlist-button';

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
  mockUnlocks = [{ feature_key: 'watchlist' }];
  mockWatchlist = [];
  mockWatchlistMax = 5;
});

describe('<WatchlistButton /> gating (6.3)', () => {
  it('shows a lock hint naming the lesson when watchlist is locked', async () => {
    mockUnlocks = [];
    const view = await renderButton(<WatchlistButton symbol="AAPL" isSignedIn />);

    expect(view.getByText(/The Auction Room/)).toBeTruthy();
    // No active toggle while locked.
    expect(view.queryByText('Add to watchlist')).toBeNull();
    expect(view.queryByText('Following ✓')).toBeNull();
  });

  it('fails closed: unlocks absent (e.g. loading) is treated as locked', async () => {
    mockUnlocks = [{ feature_key: 'explore' }];
    const view = await renderButton(<WatchlistButton symbol="AAPL" isSignedIn />);

    expect(view.getByText(/follow companies/i)).toBeTruthy();
    expect(view.queryByText('Add to watchlist')).toBeNull();
  });
});

describe('<WatchlistButton /> add (6.1, 6.2)', () => {
  it('shows an add toggle when unlocked and the symbol is not followed', async () => {
    const view = await renderButton(<WatchlistButton symbol="AAPL" isSignedIn />);
    expect(view.getByText('Add to watchlist')).toBeTruthy();
  });

  it('adds the symbol and shows confirmation feedback on success (6.1)', async () => {
    const view = await renderButton(<WatchlistButton symbol="AAPL" isSignedIn />);
    fireEvent.press(view.getByText('Add to watchlist'));

    expect(mockAddMutate).toHaveBeenCalledTimes(1);
    const [symbol, handlers] = mockAddMutate.mock.calls[0];
    expect(symbol).toBe('AAPL');

    // Drive the success callback the component passed to the mutation.
    handlers.onSuccess();
    expect(mockToastShow).toHaveBeenCalledWith('Added AAPL to your watchlist');
  });

  it('shows the friendly limit message when the add fails with watchlist_full (6.2)', async () => {
    const view = await renderButton(<WatchlistButton symbol="AAPL" isSignedIn />);
    fireEvent.press(view.getByText('Add to watchlist'));

    const [, handlers] = mockAddMutate.mock.calls[0];
    // Drive the error callback with the server's watchlist_full code.
    handlers.onError(new Error('watchlist_full'));

    expect(mockToastShow).toHaveBeenCalledTimes(1);
    const [message, options] = mockToastShow.mock.calls[0];
    expect(message).toMatch(/full/i);
    expect(message).toContain('5');
    expect(options).toEqual({ tone: 'error' });
  });

  it('names the configured watchlist_max in the limit message (8.1)', async () => {
    // Changing app_config.watchlist_max changes the number the UI shows.
    mockWatchlistMax = 9;
    const view = await renderButton(<WatchlistButton symbol="AAPL" isSignedIn />);
    fireEvent.press(view.getByText('Add to watchlist'));

    const [, handlers] = mockAddMutate.mock.calls[0];
    handlers.onError(new Error('watchlist_full'));

    const [message] = mockToastShow.mock.calls[0];
    expect(message).toMatch(/full/i);
    expect(message).toContain('9');
    expect(message).not.toContain('5');
  });
});

describe('<WatchlistButton /> remove (6.1)', () => {
  it('shows a following toggle and removes the symbol when already followed', async () => {
    mockWatchlist = [{ symbol: 'AAPL' }];
    const view = await renderButton(<WatchlistButton symbol="AAPL" isSignedIn />);

    const toggle = view.getByText('Following ✓');
    expect(toggle).toBeTruthy();
    fireEvent.press(toggle);

    expect(mockRemoveMutate).toHaveBeenCalledTimes(1);
    expect(mockRemoveMutate.mock.calls[0][0]).toBe('AAPL');

    const [, handlers] = mockRemoveMutate.mock.calls[0];
    handlers.onSuccess();
    expect(mockToastShow).toHaveBeenCalledWith('Removed AAPL from your watchlist');
  });
});
