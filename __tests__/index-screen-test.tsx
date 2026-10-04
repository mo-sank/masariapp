import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Index from '../app/index';
import { ThemeProvider } from '../src/theme/theme-provider';

// Index now renders through the themed Screen (reads safe-area insets), so the
// test supplies the same providers the app does, with fixed metrics so insets
// resolve synchronously.
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

describe('<Index /> scaffold smoke test', () => {
  it('renders the app name', async () => {
    await renderScreen(<Index />);
    expect(screen.getByText('Masari')).toBeTruthy();
  });
});
