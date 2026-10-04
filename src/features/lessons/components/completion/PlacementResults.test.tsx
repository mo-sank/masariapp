import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PlacementResults } from './PlacementResults';
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

describe('<PlacementResults /> (6.1, 6.3)', () => {
  it('shows encouraging copy and never a score or right/wrong verdict (6.3)', async () => {
    await renderScreen(
      <PlacementResults
        lessonTitle="Placement Quest"
        unlocked={['explore']}
        onGoToFeature={jest.fn()}
        onStartLearning={jest.fn()}
      />,
    );

    expect(screen.getByText("You're all set!")).toBeTruthy();
    expect(screen.getByText('Placement Quest')).toBeTruthy();

    // No-reveal: no score figure, no graded verdict, no X-of-Y tally. (The copy
    // may reassure "there are no right or wrong answers" — that is the point —
    // so we assert against the graded-report wording, not every substring.)
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByText(/\byour score\b/i)).toBeNull();
    expect(screen.queryByText(/\bgot .* right\b/i)).toBeNull();
    expect(screen.queryByText(/^Correct$/)).toBeNull();
    expect(screen.queryByText(/^Not quite$/)).toBeNull();
    expect(screen.queryByText(/\bpassed\b/i)).toBeNull();
    expect(screen.queryByText(/\bfailed\b/i)).toBeNull();
  });

  it('previews the unlocked features and routes to them (6.3 "where you will start")', async () => {
    const onGoToFeature = jest.fn();
    await renderScreen(
      <PlacementResults
        lessonTitle="Placement Quest"
        unlocked={['explore']}
        onGoToFeature={onGoToFeature}
        onStartLearning={jest.fn()}
      />,
    );

    expect(screen.getByText('🎉 Explore')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Go to Explore' }));
    expect(onGoToFeature).toHaveBeenCalledWith('/(tabs)/explore');
  });

  it('shows an unlock with no known route by name, without a button', async () => {
    await renderScreen(
      <PlacementResults
        lessonTitle="Placement Quest"
        unlocked={['paper_account']}
        onGoToFeature={jest.fn()}
        onStartLearning={jest.fn()}
      />,
    );

    // paper_account has no route in feature-routes -> named but no button.
    expect(screen.getByText('🎉 Paper Account')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Go to / })).toBeNull();
  });

  it('calls onStartLearning from the primary button (6.1)', async () => {
    const onStartLearning = jest.fn();
    await renderScreen(
      <PlacementResults
        lessonTitle="Placement Quest"
        unlocked={[]}
        onGoToFeature={jest.fn()}
        onStartLearning={onStartLearning}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Start learning on your path' }));
    expect(onStartLearning).toHaveBeenCalledTimes(1);
  });
});
