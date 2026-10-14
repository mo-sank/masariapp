import { fireEvent, render, screen } from '@testing-library/react-native';

import { FoundationalPrimer } from './foundational-primer';
import { ThemeProvider } from '../../theme/theme-provider';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('<FoundationalPrimer />', () => {
  it('walks through the 3 slides and calls onClose upon completion', async () => {
    const onClose = jest.fn();
    await renderWithTheme(<FoundationalPrimer visible={true} onClose={onClose} />);

    // Slide 1
    expect(screen.getByText('What is a Company?')).toBeTruthy();
    expect(screen.getByText('STEP 1 OF 3 · HOW THE MARKET WORKS')).toBeTruthy();

    // Advance to Slide 2
    fireEvent.press(screen.getByRole('button', { name: 'Next slide' }));
    expect(await screen.findByText('Why do Companies Sell Shares?')).toBeTruthy();

    // Advance to Slide 3
    fireEvent.press(screen.getByRole('button', { name: 'Next slide' }));
    expect(await screen.findByText('What Does Owning 1 Share Mean?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Complete intro' })).toBeTruthy();

    // Finish
    fireEvent.press(screen.getByRole('button', { name: 'Complete intro' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('allows skipping directly to close', async () => {
    const onClose = jest.fn();
    await renderWithTheme(<FoundationalPrimer visible={true} onClose={onClose} />);

    fireEvent.press(screen.getByRole('button', { name: 'Skip primer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
