import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { StatsHeader } from './StatsHeader';
import { ThemeProvider } from '../../../theme/theme-provider';

/**
 * <StatsHeader /> (requirements 3.1, 3.4).
 *
 * The header is a pure function of its props (the live refresh is the caller's
 * `useStats` query, invalidated by the completion flow — tested there), so these
 * tests pin that it renders every stat with a glanceable value and a screen-
 * reader phrase, and that a brand-new learner reads as all zeros.
 */
async function renderHeader(ui: ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('<StatsHeader /> (3.1)', () => {
  it('shows XP, current streak, longest streak, and freezes (3.1)', async () => {
    await renderHeader(
      <StatsHeader xp={1250} streakCurrent={5} streakLongest={12} streakFreezes={2} />,
    );

    expect(screen.getByText('1,250')).toBeTruthy();
    expect(screen.getByText('🔥 5')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('❄️ 2')).toBeTruthy();

    // Each cell reads as a full phrase, not a bare number.
    expect(screen.getByLabelText('1250 XP')).toBeTruthy();
    expect(screen.getByLabelText('5 day streak')).toBeTruthy();
    expect(screen.getByLabelText('Longest streak 12 days')).toBeTruthy();
    expect(screen.getByLabelText('2 streak freezes')).toBeTruthy();
  });

  it('defaults every stat to zero for a brand-new learner (no stats row yet)', async () => {
    await renderHeader(<StatsHeader />);

    expect(screen.getByLabelText('0 XP')).toBeTruthy();
    expect(screen.getByLabelText('0 day streak')).toBeTruthy();
    expect(screen.getByLabelText('Longest streak 0 days')).toBeTruthy();
    expect(screen.getByLabelText('0 streak freezes')).toBeTruthy();
  });
});
