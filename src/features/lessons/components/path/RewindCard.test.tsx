/**
 * Component tests for the Rewind card (requirement 7.2).
 *
 * The card appears only when items are due and shows the count; tapping it
 * starts a session. These tests cover both the shown and hidden states and the
 * singular/plural count copy.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { RewindCard } from './RewindCard';
import { ThemeProvider } from '../../../../theme/theme-provider';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('<RewindCard />', () => {
  it('renders nothing when no items are due (7.2)', async () => {
    await renderWithTheme(<RewindCard dueCount={0} onStart={jest.fn()} />);
    expect(screen.queryByTestId('rewind-card')).toBeNull();
  });

  it('shows the due count and starts a session on press (7.2)', async () => {
    const onStart = jest.fn();
    await renderWithTheme(<RewindCard dueCount={3} onStart={onStart} />);

    expect(screen.getByTestId('rewind-card')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Start Rewind, 3 items to review'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('uses singular copy for a single due item', async () => {
    await renderWithTheme(<RewindCard dueCount={1} onStart={jest.fn()} />);
    expect(screen.getByLabelText('Start Rewind, 1 item to review')).toBeTruthy();
  });
});
