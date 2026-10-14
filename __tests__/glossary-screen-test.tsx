import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn().mockReturnValue(true);

jest.mock('expo-router', () => ({
  router: {
    push: (href: unknown) => mockPush(href),
    back: () => mockBack(),
    replace: (href: unknown) => mockReplace(href),
    canGoBack: () => mockCanGoBack(),
  },
}));

import GlossaryScreen from '../app/glossary';
import { ThemeProvider } from '../src/theme/theme-provider';

async function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>
        <GlossaryScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

describe('<GlossaryScreen />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the header and all terms by default', async () => {
    await renderScreen();

    expect(screen.getByText('📖 Financial Glossary')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search terms, analogies, keywords...')).toBeTruthy();
    expect(screen.getByText(/Stock \(or Share\)/)).toBeTruthy();
  });

  it('filters terms by category pill', async () => {
    await renderScreen();

    // Tap Trading category pill
    await act(async () => {
      fireEvent.press(screen.getByRole('tab', { name: 'Category Trading' }));
    });

    expect(screen.getByText('Volatility')).toBeTruthy();
    expect(screen.getByText('Limit Order')).toBeTruthy();
    expect(screen.queryByText('Market Cap (Market Capitalization)')).toBeNull();
  });

  it('filters terms by search text', async () => {
    await renderScreen();

    const searchInput = screen.getByPlaceholderText('Search terms, analogies, keywords...');

    await act(async () => {
      fireEvent.changeText(searchInput, 'pizza');
    });

    expect(screen.getByText(/Stock \(or Share\)/)).toBeTruthy();
    expect(screen.queryByText('Volatility')).toBeNull();
  });

  it('shows empty state when nothing matches and allows clearing', async () => {
    await renderScreen();

    const searchInput = screen.getByPlaceholderText('Search terms, analogies, keywords...');

    await act(async () => {
      fireEvent.changeText(searchInput, 'xyznomatch123');
    });

    expect(screen.getByText(/No financial terms match/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Clear Search' }));
    });

    expect(screen.getByText(/Stock \(or Share\)/)).toBeTruthy();
  });

  it('expands term card to reveal teen analogy and real-world example', async () => {
    await renderScreen();

    const stockCard = screen.getByLabelText(/Stock \(or Share\) glossary card/);

    // Initial state: analogy not shown
    expect(screen.queryByText(/EVERYDAY ANALOGY/)).toBeNull();

    // Tap to expand
    await act(async () => {
      fireEvent.press(stockCard);
    });

    expect(screen.getByText('💡 EVERYDAY ANALOGY')).toBeTruthy();
    expect(screen.getByText(/Imagine a large pizza cut into 1,000,000 microscopic slices/)).toBeTruthy();
    expect(screen.getByText('📌 REAL-WORLD EXAMPLE')).toBeTruthy();
  });

  it('navigates back when Back button is tapped', async () => {
    await renderScreen();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Back from Glossary' }));
    });

    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
