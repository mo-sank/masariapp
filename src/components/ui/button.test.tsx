import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from './button';
import { ThemeProvider } from '../../theme/theme-provider';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('Button', () => {
  it('renders the title and exposes the button role', async () => {
    await renderWithTheme(<Button title="Continue" onPress={() => {}} />);
    expect(screen.getByText('Continue')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<Button title="Tap me" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Tap me' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<Button title="Nope" disabled onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Nope' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('does not call onPress and hides the label while loading', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<Button title="Saving" loading onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Saving' });
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    // The label text is replaced by a spinner while loading.
    expect(screen.queryByText('Saving')).toBeNull();
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });

  it('uses a custom accessibility label when provided', async () => {
    await renderWithTheme(
      <Button title="X" accessibilityLabel="Close dialog" onPress={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeTruthy();
  });
});
