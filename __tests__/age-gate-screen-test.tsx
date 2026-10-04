import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AgeGateScreen from '../app/(auth)/age-gate';
import { ThemeProvider } from '../src/theme/theme-provider';

// The screen now renders through the themed Screen (reads safe-area insets) and
// ThemeProvider, so tests wrap it in the same providers the app supplies, with
// fixed metrics so insets resolve synchronously.
function renderScreen(ui: React.ReactElement) {
  return render(
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

// Mock expo-router's imperative navigation.
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    replace: (href: string) => mockReplace(href),
  },
}));

// Mock the device-flag hook so the screen renders without AsyncStorage.
const mockBlock = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/features/auth/use-age-block', () => ({
  useAgeBlock: () => ({ isLoading: false, isBlocked: false, block: mockBlock }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('<AgeGateScreen />', () => {
  it('asks for birth month and year before any login option', async () => {
    const view = await renderScreen(<AgeGateScreen />);
    expect(view.getByText('How old are you?')).toBeTruthy();
    expect(view.getByPlaceholderText('MM')).toBeTruthy();
    expect(view.getByPlaceholderText('YYYY')).toBeTruthy();
    // No login affordance is shown on the age gate itself.
    expect(view.queryByText(/log in/i)).toBeNull();
    expect(view.queryByText(/get started/i)).toBeNull();
  });

  it('shows a validation error and does not navigate for an invalid month', async () => {
    const view = await renderScreen(<AgeGateScreen />);
    fireEvent.changeText(view.getByPlaceholderText('MM'), '13');
    fireEvent.changeText(view.getByPlaceholderText('YYYY'), '2000');
    fireEvent.press(view.getByText('Continue'));

    await waitFor(() => expect(view.getByText(/enter a month/i)).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockBlock).not.toHaveBeenCalled();
  });
});
