import { fireEvent, render, screen } from '@testing-library/react-native';

import { CardsStep } from './CardsStep';
import { ThemeProvider } from '../../../../theme/theme-provider';
import type { CardsStep as CardsStepType } from '../../schema';

// Force reduce-motion ON so advancing snaps synchronously (no Animated timer),
// keeping the swipe/advance assertions deterministic. The animated path is a
// visual nicety over the same advance() logic.
let mockReduceMotion = true;
jest.mock('../../../../theme/use-reduce-motion', () => ({
  useReduceMotion: () => mockReduceMotion,
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

function makeStep(overrides: Partial<CardsStepType> = {}): CardsStepType {
  return {
    id: 's1',
    type: 'cards',
    cards: [
      { title: 'Companies sell slices', body: 'A company can sell small pieces of itself.' },
      { title: 'Owners share the upside', body: 'If it grows, each slice can be worth more.' },
    ],
    ...overrides,
  } as CardsStepType;
}

beforeEach(() => {
  mockReduceMotion = true;
});

describe('<CardsStep />', () => {
  it('shows the first card and its position (4.1)', async () => {
    await renderWithTheme(
      <CardsStep step={makeStep()} onAnswer={jest.fn()} onContinue={jest.fn()} />,
    );
    expect(screen.getByText('Companies sell slices')).toBeTruthy();
    expect(screen.getByText('A company can sell small pieces of itself.')).toBeTruthy();
    expect(screen.getByText('Card 1 of 2')).toBeTruthy();
    // Second card not shown yet.
    expect(screen.queryByText('Owners share the upside')).toBeNull();
  });

  it('advances to the next card via the Next button, not onContinue (4.1, 4.8)', async () => {
    const onContinue = jest.fn();
    await renderWithTheme(
      <CardsStep step={makeStep()} onAnswer={jest.fn()} onContinue={onContinue} />,
    );

    fireEvent.press(screen.getByLabelText('Next card'));

    expect(await screen.findByText('Owners share the upside')).toBeTruthy();
    expect(screen.getByText('Card 2 of 2')).toBeTruthy();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('calls onContinue after advancing past the last card (4.1)', async () => {
    const onContinue = jest.fn();
    const onAnswer = jest.fn();
    await renderWithTheme(
      <CardsStep step={makeStep()} onAnswer={onAnswer} onContinue={onContinue} />,
    );

    // First card -> Next; wait for the second card to render.
    fireEvent.press(screen.getByLabelText('Next card'));
    const continueButton = await screen.findByLabelText('Continue to the next step');
    // Last card -> Continue finishes the step.
    fireEvent.press(continueButton);

    expect(onContinue).toHaveBeenCalledTimes(1);
    // Cards are never scored.
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('shows Continue (not Next) on a single-card step', async () => {
    const onContinue = jest.fn();
    await renderWithTheme(
      <CardsStep
        step={makeStep({ cards: [{ body: 'Only card.' }] })}
        onAnswer={jest.fn()}
        onContinue={onContinue}
      />,
    );
    expect(screen.getByText('Card 1 of 1')).toBeTruthy();
    expect(screen.getByLabelText('Continue to the next step')).toBeTruthy();
    expect(screen.queryByLabelText('Next card')).toBeNull();

    fireEvent.press(screen.getByLabelText('Continue to the next step'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('renders an optional card title as a header and the body as text (4.8)', async () => {
    await renderWithTheme(
      <CardsStep step={makeStep()} onAnswer={jest.fn()} onContinue={jest.fn()} />,
    );
    const header = screen.getByRole('header', { name: 'Companies sell slices' });
    expect(header).toBeTruthy();
  });
});
