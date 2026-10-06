import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CompletionResults } from './CompletionResults';
import { ThemeProvider } from '../../../../theme/theme-provider';
import type { CompletionPassed } from '../../api/complete-lesson';

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

function passing(overrides: Partial<CompletionPassed> = {}): CompletionPassed {
  return {
    passed: true,
    firstCompletion: true,
    xpAwarded: 15,
    streak: 3,
    streakFreezes: 1,
    unlocked: ['explore'],
    ...overrides,
  };
}

describe('<CompletionResults /> (5.4, 5.6)', () => {
  it('shows XP earned, streak, freeze, and the unlocked feature (5.4)', async () => {
    await renderScreen(
      <CompletionResults
        result={passing()}
        lessonTitle="Slice the Pizza"
        onGoToFeature={jest.fn()}
        onBackToPath={jest.fn()}
      />,
    );

    expect(screen.getByText('Lesson complete!')).toBeTruthy();
    expect(screen.getByText('Slice the Pizza')).toBeTruthy();
    // Each stat collapses into one accessibility element; assert via its label.
    expect(screen.getByLabelText('You earned 15 experience points')).toBeTruthy();
    expect(screen.getByLabelText('Current streak: 3 days')).toBeTruthy();
    expect(screen.getByLabelText('1 Streak Freeze')).toBeTruthy();
    expect(screen.getByText('🎉 Explore unlocked')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try Explore now' })).toBeTruthy();
  });

  it('routes to the unlocked feature when its "Try it now" button is pressed (5.4)', async () => {
    const onGoToFeature = jest.fn();
    await renderScreen(
      <CompletionResults
        result={passing()}
        lessonTitle="Slice the Pizza"
        onGoToFeature={onGoToFeature}
        onBackToPath={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Try Explore now' }));
    expect(onGoToFeature).toHaveBeenCalledWith('/(tabs)/explore');
  });

  it('handles a replay gracefully: no XP figure, encouraging header (5.6)', async () => {
    await renderScreen(
      <CompletionResults
        result={passing({ firstCompletion: false, xpAwarded: 0, unlocked: [] })}
        lessonTitle="Slice the Pizza"
        onGoToFeature={jest.fn()}
        onBackToPath={jest.fn()}
      />,
    );

    expect(screen.getByText('Nice replay!')).toBeTruthy();
    expect(
      screen.getByLabelText('No new experience points — you already earned XP for this lesson'),
    ).toBeTruthy();
    // No unlocks on a replay -> no "go to feature" button.
    expect(screen.queryByRole('button', { name: /^Go to / })).toBeNull();
  });

  it('calls onBackToPath from the Back to path button', async () => {
    const onBackToPath = jest.fn();
    await renderScreen(
      <CompletionResults
        result={passing()}
        lessonTitle="Slice the Pizza"
        onGoToFeature={jest.fn()}
        onBackToPath={onBackToPath}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Back to the learning path' }));
    expect(onBackToPath).toHaveBeenCalledTimes(1);
  });

  it('uses singular units for a one-day streak and a single freeze', async () => {
    await renderScreen(
      <CompletionResults
        result={passing({ streak: 1, streakFreezes: 1 })}
        lessonTitle="L"
        onGoToFeature={jest.fn()}
        onBackToPath={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Current streak: 1 day')).toBeTruthy();
    expect(screen.getByLabelText('1 Streak Freeze')).toBeTruthy();
  });
});
