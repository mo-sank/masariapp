import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KnowledgeBinder } from './KnowledgeBinder';
import { ThemeProvider } from '../../../theme/theme-provider';

async function renderBinder(props = {}) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>
        <KnowledgeBinder {...props} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

describe('<KnowledgeBinder />', () => {
  it('renders binder header and key concepts', async () => {
    await renderBinder();
    expect(screen.getByText('📚 Knowledge Binder')).toBeTruthy();
    expect(screen.getByText(/Review core investing concepts/)).toBeTruthy();
  });

  it('allows expanding and collapsing a takeaway card', async () => {
    await renderBinder();
    const pizzaCard = screen.getByTestId('takeaway-L1.1');
    expect(pizzaCard).toBeTruthy();

    // The first item is expanded by default: check for its analogy
    expect(screen.getByText(/Think of 1 share like owning 1 slice of an 8-slice pizza/)).toBeTruthy();

    // Tap to collapse
    await act(async () => {
      fireEvent.press(pizzaCard);
    });
    expect(screen.queryByText(/Think of 1 share like owning 1 slice of an 8-slice pizza/)).toBeNull();

    // Tap to expand again
    await act(async () => {
      fireEvent.press(pizzaCard);
    });
    expect(screen.getByText(/Think of 1 share like owning 1 slice of an 8-slice pizza/)).toBeTruthy();
  });

  it('renders Open Financial Glossary button when onOpenGlossary is provided', async () => {
    const onOpenGlossary = jest.fn();
    await renderBinder({ onOpenGlossary });

    const btn = screen.getByRole('button', { name: 'Open Financial Glossary' });
    expect(btn).toBeTruthy();

    await act(async () => {
      fireEvent.press(btn);
    });
    expect(onOpenGlossary).toHaveBeenCalledTimes(1);
  });
});
