import { fireEvent, render, screen } from '@testing-library/react-native';

import { LockedState } from './locked-state';
import { ThemeProvider } from '../../theme/theme-provider';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('LockedState', () => {
  it('names the feature and the unlocking lesson (requirement 7.2)', async () => {
    await renderWithTheme(
      <LockedState featureName="Portfolio" unlockedByLesson="Your First Trade" />,
    );
    expect(screen.getByText('Portfolio is locked')).toBeTruthy();
    expect(screen.getByText('Complete "Your First Trade" to unlock Portfolio.')).toBeTruthy();
  });

  it('renders an action button only when both label and handler are given', async () => {
    const onAction = jest.fn();
    await renderWithTheme(
      <LockedState
        featureName="Explore"
        unlockedByLesson="Slice the Pizza"
        actionLabel="Go to Learn"
        onAction={onAction}
      />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Go to Learn' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('omits the action button when no handler is given', async () => {
    await renderWithTheme(
      <LockedState
        featureName="Explore"
        unlockedByLesson="Slice the Pizza"
        actionLabel="Go to Learn"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Go to Learn' })).toBeNull();
  });
});
