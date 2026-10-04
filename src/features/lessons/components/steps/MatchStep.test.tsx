import { fireEvent, render, screen } from '@testing-library/react-native';

import { MatchStep } from './MatchStep';
import { ThemeProvider } from '../../../../theme/theme-provider';
import type { MatchStep as MatchStepType } from '../../schema';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

function makeStep(overrides: Partial<MatchStepType> = {}): MatchStepType {
  return {
    id: 's1',
    type: 'match',
    prompt: 'Match each term to its meaning.',
    pairs: [
      { id: 'p1', left: 'Share', right: 'A slice of ownership' },
      { id: 'p2', left: 'Dividend', right: 'A share of the profits' },
    ],
    explanation: 'Each term has one meaning.',
    scored: true,
    concept: 'vocab',
    ...overrides,
  } as MatchStepType;
}

/**
 * Pair a term with a definition: tap the term, wait for its selection to
 * register, then tap the definition and wait for the match to show. Awaiting
 * between taps mirrors a learner's two gestures and lets each tap's state
 * settle before the next.
 */
async function pair(term: string, definition: string) {
  fireEvent.press(screen.getByText(term));
  await screen.findByLabelText(new RegExp(`^${term},`));
  fireEvent.press(screen.getByText(definition));
  await screen.findByLabelText(`${term}, matched with: ${definition}. Tap to re-match.`);
}

describe('<MatchStep />', () => {
  it('renders the prompt, every term, and every definition (4.5)', async () => {
    await renderWithTheme(
      <MatchStep step={makeStep()} onAnswer={jest.fn()} onContinue={jest.fn()} />,
    );
    expect(screen.getByText('Match each term to its meaning.')).toBeTruthy();
    expect(screen.getByText('Share')).toBeTruthy();
    expect(screen.getByText('Dividend')).toBeTruthy();
    expect(screen.getByText('A slice of ownership')).toBeTruthy();
    expect(screen.getByText('A share of the profits')).toBeTruthy();
  });

  it('disables Check until every term is matched (4.5)', async () => {
    const onAnswer = jest.fn();
    await renderWithTheme(
      <MatchStep step={makeStep()} onAnswer={onAnswer} onContinue={jest.fn()} />,
    );

    const check = screen.getByRole('button', { name: 'Check your answer' });
    expect(check.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(check);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('pairs by tapping a term then a definition, reporting pairings via onAnswer (4.5, 4.8)', async () => {
    const onAnswer = jest.fn();
    const onContinue = jest.fn();
    await renderWithTheme(
      <MatchStep step={makeStep()} onAnswer={onAnswer} onContinue={onContinue} />,
    );

    await pair('Share', 'A slice of ownership');
    await pair('Dividend', 'A share of the profits');
    fireEvent.press(await screen.findByRole('button', { name: 'Check your answer' }));

    expect(onAnswer).toHaveBeenCalledWith({
      stepId: 's1',
      type: 'match',
      pairings: { p1: 'A slice of ownership', p2: 'A share of the profits' },
    });
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('reports the learner pairing faithfully, even when wrong (player grades)', async () => {
    const onAnswer = jest.fn();
    await renderWithTheme(
      <MatchStep step={makeStep()} onAnswer={onAnswer} onContinue={jest.fn()} />,
    );

    // Swap the pairings on purpose.
    await pair('Share', 'A share of the profits');
    await pair('Dividend', 'A slice of ownership');
    fireEvent.press(await screen.findByRole('button', { name: 'Check your answer' }));

    expect(onAnswer).toHaveBeenCalledWith({
      stepId: 's1',
      type: 'match',
      pairings: { p1: 'A share of the profits', p2: 'A slice of ownership' },
    });
  });

  it('moves a definition rather than duplicating it when reused', async () => {
    const onAnswer = jest.fn();
    await renderWithTheme(
      <MatchStep step={makeStep()} onAnswer={onAnswer} onContinue={jest.fn()} />,
    );

    // Pair Share -> "A slice of ownership".
    await pair('Share', 'A slice of ownership');
    // Give the same definition to Dividend; it should move off Share.
    await pair('Dividend', 'A slice of ownership');
    // Share is unmatched again; match it to the remaining definition.
    await pair('Share', 'A share of the profits');
    fireEvent.press(await screen.findByRole('button', { name: 'Check your answer' }));

    expect(onAnswer).toHaveBeenCalledWith({
      stepId: 's1',
      type: 'match',
      pairings: { p2: 'A slice of ownership', p1: 'A share of the profits' },
    });
  });

  it('marks a tapped term as selected for assistive tech (4.8)', async () => {
    await renderWithTheme(
      <MatchStep step={makeStep()} onAnswer={jest.fn()} onContinue={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Share, not matched', selected: false })).toBeTruthy();

    fireEvent.press(screen.getByText('Share'));

    expect(
      await screen.findByRole('button', { name: 'Share, not matched', selected: true }),
    ).toBeTruthy();
  });

  it('announces an established match in the accessibility label', async () => {
    await renderWithTheme(
      <MatchStep step={makeStep()} onAnswer={jest.fn()} onContinue={jest.fn()} />,
    );
    await pair('Share', 'A slice of ownership');

    expect(
      screen.getByLabelText('Share, matched with: A slice of ownership. Tap to re-match.'),
    ).toBeTruthy();
  });
});
