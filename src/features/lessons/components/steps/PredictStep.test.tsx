import { fireEvent, render, screen } from '@testing-library/react-native';

import { PredictStep } from './PredictStep';
import { ThemeProvider } from '../../../../theme/theme-provider';
import type { PredictStep as PredictStepType } from '../../schema';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

function makeStep(overrides: Partial<PredictStepType> = {}): PredictStepType {
  return {
    id: 's1',
    type: 'predict',
    prompt: 'You own 1 of 100 slices of a pizza shop. What do you own?',
    options: [
      { id: 'a', text: '1% of the shop' },
      { id: 'b', text: '1 pizza' },
      { id: 'c', text: 'Nothing yet' },
    ],
    correctId: 'a',
    reveal: 'Right: a share is a slice of the whole company, not a product.',
    scored: false,
    ...overrides,
  } as PredictStepType;
}

describe('<PredictStep />', () => {
  it('renders the prompt and every option without revealing anything first (4.3)', async () => {
    await renderWithTheme(
      <PredictStep step={makeStep()} onAnswer={jest.fn()} onContinue={jest.fn()} />,
    );
    expect(
      screen.getByText('You own 1 of 100 slices of a pizza shop. What do you own?'),
    ).toBeTruthy();
    expect(screen.getByText('1% of the shop')).toBeTruthy();
    expect(screen.getByText('1 pizza')).toBeTruthy();
    expect(screen.getByText('Nothing yet')).toBeTruthy();
    // The reveal is hidden until a prediction is made.
    expect(
      screen.queryByText('Right: a share is a slice of the whole company, not a product.'),
    ).toBeNull();
  });

  it('exposes every option as a radio for assistive tech (4.8)', async () => {
    await renderWithTheme(
      <PredictStep step={makeStep()} onAnswer={jest.fn()} onContinue={jest.fn()} />,
    );
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  describe('unscored (default)', () => {
    it('reveals the outcome after a prediction and continues via onContinue, not onAnswer (4.3, 4.8)', async () => {
      const onAnswer = jest.fn();
      const onContinue = jest.fn();
      await renderWithTheme(
        <PredictStep step={makeStep()} onAnswer={onAnswer} onContinue={onContinue} />,
      );

      fireEvent.press(screen.getByText('1 pizza'));

      // The reveal is shown after committing a prediction (4.3).
      expect(
        await screen.findByText(
          'Right: a share is a slice of the whole company, not a product.',
        ),
      ).toBeTruthy();
      // An unscored predict never reports a scored answer.
      expect(onAnswer).not.toHaveBeenCalled();

      fireEvent.press(screen.getByLabelText('Continue to the next step'));
      expect(onContinue).toHaveBeenCalledTimes(1);
    });

    it('does not show the reveal or a Continue button before a prediction', async () => {
      await renderWithTheme(
        <PredictStep step={makeStep()} onAnswer={jest.fn()} onContinue={jest.fn()} />,
      );
      expect(screen.queryByLabelText('Continue to the next step')).toBeNull();
    });

    it('locks the prediction — a second option tap does not change it', async () => {
      await renderWithTheme(
        <PredictStep step={makeStep()} onAnswer={jest.fn()} onContinue={jest.fn()} />,
      );

      fireEvent.press(screen.getByText('1 pizza'));
      // The first choice is marked selected.
      expect(await screen.findByRole('radio', { name: '1 pizza', selected: true })).toBeTruthy();

      // Tapping another option after committing is ignored.
      fireEvent.press(screen.getByText('1% of the shop'));
      expect(screen.getByRole('radio', { name: '1% of the shop' }).props.accessibilityState).toMatchObject({
        selected: false,
      });
    });
  });

  describe('scored', () => {
    it('reports the choice via onAnswer and lets the player own the reveal (3.2, 4.8)', async () => {
      const onAnswer = jest.fn();
      const onContinue = jest.fn();
      await renderWithTheme(
        <PredictStep
          step={makeStep({ scored: true, concept: 'ownership' })}
          onAnswer={onAnswer}
          onContinue={onContinue}
        />,
      );

      fireEvent.press(screen.getByText('1% of the shop'));

      expect(onAnswer).toHaveBeenCalledWith({ stepId: 's1', type: 'predict', optionId: 'a' });
      expect(onContinue).not.toHaveBeenCalled();
      // The component does not reveal anything itself when scored (the player does).
      expect(
        screen.queryByText('Right: a share is a slice of the whole company, not a product.'),
      ).toBeNull();
      expect(screen.queryByLabelText('Continue to the next step')).toBeNull();
    });

    it('reports the learner choice faithfully without hinting correctness', async () => {
      const onAnswer = jest.fn();
      await renderWithTheme(
        <PredictStep
          step={makeStep({ scored: true, concept: 'ownership' })}
          onAnswer={onAnswer}
          onContinue={jest.fn()}
        />,
      );
      // Picking a wrong option still reports its own id; the player judges.
      fireEvent.press(screen.getByText('Nothing yet'));
      expect(onAnswer).toHaveBeenCalledWith({ stepId: 's1', type: 'predict', optionId: 'c' });
    });
  });
});
