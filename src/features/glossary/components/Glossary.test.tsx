import { fireEvent, render, screen } from '@testing-library/react-native';

import { GlossaryModal } from './GlossaryModal';
import { GlossaryTerm } from './GlossaryTerm';
import { ThemeProvider } from '../../../theme/theme-provider';
import { getGlossaryTerm } from '../glossary-data';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('Glossary Components', () => {
  it('renders GlossaryTerm and opens GlossaryModal on tap', async () => {
    await renderWithTheme(<GlossaryTerm termId="stock" displayText="What is a stock?" />);

    expect(screen.getByText('What is a stock?')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: /What is a stock\?/ }));

    // Modal opens with definition and analogy
    expect(await screen.findByText('WHAT IT MEANS')).toBeTruthy();
    expect(screen.getByText('💡 THE EVERYDAY ANALOGY')).toBeTruthy();
    expect(screen.getByText('Got it!')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Close definition' }));
  });

  it('renders GlossaryModal directly and handles close', async () => {
    const entry = getGlossaryTerm('market_cap');
    const onClose = jest.fn();

    await renderWithTheme(
      <GlossaryModal entry={entry!} visible={true} onClose={onClose} />,
    );

    expect(screen.getByText('Market Cap (Market Capitalization)')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Close definition' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
