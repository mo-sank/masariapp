import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import IntroScreen from '../app/(auth)/intro';
import { ThemeProvider } from '../src/theme/theme-provider';

// Wrap in the same providers the app supplies, with fixed metrics so the themed
// Screen's safe-area insets resolve synchronously. render is async in this RNTL
// version, so callers await it.
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

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    replace: (href: string) => mockReplace(href),
  },
}));

// The intro screen fires a top-of-funnel analytics event on mount; mock track
// so the test does not pull in the real analytics queue / native storage.
const mockTrack = jest.fn();
jest.mock('../src/lib/analytics', () => ({
  track: (name: string) => mockTrack(name),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('<IntroScreen />', () => {
  it('introduces the app and offers a single Get started CTA', async () => {
    const view = await renderScreen(<IntroScreen />);
    expect(view.getByText('Masari')).toBeTruthy();
    // The intro collects no input and starts no login.
    expect(view.queryByText(/log in/i)).toBeNull();
    expect(view.getByText('Get started')).toBeTruthy();
  });

  it('logs intro_viewed once on mount', async () => {
    await renderScreen(<IntroScreen />);
    expect(mockTrack).toHaveBeenCalledWith('intro_viewed');
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });

  it('moves to the age gate when Get started is pressed', async () => {
    const view = await renderScreen(<IntroScreen />);
    fireEvent.press(view.getByText('Get started'));
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/age-gate');
  });
});
