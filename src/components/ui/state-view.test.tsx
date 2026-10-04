import { fireEvent, render, screen } from '@testing-library/react-native';

import { StateView } from './state-view';
import { ThemeProvider } from '../../theme/theme-provider';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('StateView', () => {
  it('shows a default title per kind', async () => {
    await renderWithTheme(<StateView kind="empty" />);
    expect(screen.getByText('Nothing here yet')).toBeTruthy();
  });

  it('renders a custom title and message', async () => {
    await renderWithTheme(<StateView kind="error" title="Oops" message="Try later" />);
    expect(screen.getByText('Oops')).toBeTruthy();
    expect(screen.getByText('Try later')).toBeTruthy();
  });

  it('shows a retry button for error/offline and calls onRetry', async () => {
    const onRetry = jest.fn();
    await renderWithTheme(<StateView kind="offline" onRetry={onRetry} />);
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not show a retry button for empty state even with onRetry', async () => {
    await renderWithTheme(<StateView kind="empty" onRetry={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('renders the loading state title for the loading kind', async () => {
    await renderWithTheme(<StateView kind="loading" />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });
});
