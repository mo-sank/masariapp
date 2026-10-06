import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { RankBadge } from './RankBadge';
import { ThemeProvider } from '../../../theme/theme-provider';

/**
 * <RankBadge /> (requirement 3.2).
 *
 * Presentational: the caller passes the derived rank (from `useRank`). These
 * tests pin that the badge shows the rank name and announces it as one labelled
 * unit for a screen reader.
 */
async function renderBadge(ui: ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('<RankBadge /> (3.2)', () => {
  it('shows the rank name', async () => {
    await renderBadge(<RankBadge rank="Rookie" />);
    expect(screen.getByText('Rookie')).toBeTruthy();
  });

  it('announces the rank as a single accessible label', async () => {
    await renderBadge(<RankBadge rank="Newcomer" />);
    expect(screen.getByLabelText('Rank: Newcomer')).toBeTruthy();
  });
});
