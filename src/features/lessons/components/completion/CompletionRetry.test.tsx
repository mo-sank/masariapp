import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CompletionRetry } from './CompletionRetry';
import { ThemeProvider } from '../../../../theme/theme-provider';

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

describe('<CompletionRetry /> (5.3)', () => {
  it('shows an encouraging message with the score and pass score (no "failed")', async () => {
    await renderScreen(
      <CompletionRetry
        lessonTitle="Slice the Pizza"
        scorePct={40}
        passScore={60}
        onRetry={jest.fn()}
        onBackToPath={jest.fn()}
      />,
    );

    expect(screen.getByText('So close!')).toBeTruthy();
    expect(screen.getByText('Slice the Pizza')).toBeTruthy();
    expect(screen.getByText('You scored 40% — you need 60% to pass this one.')).toBeTruthy();
    // Encouraging, never punishing.
    expect(screen.queryByText(/fail/i)).toBeNull();
  });

  it('calls onRetry from the Try again button', async () => {
    const onRetry = jest.fn();
    await renderScreen(
      <CompletionRetry
        lessonTitle="L"
        scorePct={40}
        passScore={60}
        onRetry={onRetry}
        onBackToPath={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Try the lesson again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('calls onBackToPath from the Back to path button', async () => {
    const onBackToPath = jest.fn();
    await renderScreen(
      <CompletionRetry
        lessonTitle="L"
        scorePct={40}
        passScore={60}
        onRetry={jest.fn()}
        onBackToPath={onBackToPath}
      />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Back to the learning path' }));
    expect(onBackToPath).toHaveBeenCalledTimes(1);
  });
});
