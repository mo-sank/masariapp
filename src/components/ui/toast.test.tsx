import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text as RNText } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider, useToast } from './toast';
import { ThemeProvider } from '../../theme/theme-provider';

// A tiny harness button that triggers a toast via the hook.
function ShowButton({ message, durationMs }: { message: string; durationMs?: number }) {
  const toast = useToast();
  return (
    <Pressable accessibilityRole="button" onPress={() => toast.show(message, { durationMs })}>
      <RNText>show</RNText>
    </Pressable>
  );
}

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>
        <ToastProvider>{ui}</ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

// Press within an async act so the triggered state update is flushed before
// we query the tree (render is async in this RNTL version).
async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(element);
  });
}

describe('Toast', () => {
  it('shows a message when triggered via useToast', async () => {
    await renderWithProviders(<ShowButton message="Saved" />);
    expect(screen.queryByText('Saved')).toBeNull();
    await press(screen.getByRole('button', { name: 'show' }));
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('auto-dismisses after the duration elapses', async () => {
    jest.useFakeTimers();
    try {
      await renderWithProviders(<ShowButton message="Bye" durationMs={1000} />);
      await press(screen.getByRole('button', { name: 'show' }));
      expect(screen.getByText('Bye')).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.queryByText('Bye')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('dismisses when the toast is tapped', async () => {
    await renderWithProviders(<ShowButton message="Tap to close" />);
    await press(screen.getByRole('button', { name: 'show' }));
    await press(screen.getByRole('alert', { name: 'Tap to close' }));
    expect(screen.queryByText('Tap to close')).toBeNull();
  });

  it('throws when useToast is used outside a provider', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    let caught: unknown;
    try {
      await render(<ShowButton message="x" />);
    } catch (e) {
      caught = e;
    }
    expect((caught as Error | undefined)?.message).toBe(
      'useToast must be used within a ToastProvider',
    );
    consoleError.mockRestore();
  });
});
