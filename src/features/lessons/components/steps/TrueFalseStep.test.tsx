import { fireEvent, render, screen } from '@testing-library/react-native';

import { TrueFalseStep } from './TrueFalseStep';
import { ThemeProvider } from '../../../../theme/theme-provider';
import type { TrueFalseStep as TrueFalseStepType } from '../../schema';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

function makeStep(overrides: Partial<TrueFalseStepType> = {}): TrueFalseStepType {
  return {
    id: 's1',
    type: 'truefalse',
    prompt: 'A share makes you a part-owner of a company.',
    answer: true,
    explanation: 'Yes — a share is a slice of ownership.',
    scored: true,
    concept: 'ownership',
    ...overrides,
  } as TrueFalseStepType;
}

describe('<TrueFalseStep />', () => {
  it('renders the prompt and both choices (4.2)', async () => {
    await renderWithTheme(
      <TrueFalseStep step={makeStep()} onAnswer={jest.fn()} onContinue={jest.fn()} />,
    );
    expect(screen.getByText('A share makes you a part-owner of a company.')).toBeTruthy();
    expect(screen.getByText('True')).toBeTruthy();
    expect(screen.getByText('False')).toBeTruthy();
  });

  it('reports value true when True is tapped, via onAnswer (4.8)', async () => {
    const onAnswer = jest.fn();
    const onContinue = jest.fn();
    await renderWithTheme(
      <TrueFalseStep step={makeStep()} onAnswer={onAnswer} onContinue={onContinue} />,
    );

    fireEvent.press(screen.getByText('True'));

    expect(onAnswer).toHaveBeenCalledWith({ stepId: 's1', type: 'truefalse', value: true });
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('reports value false when False is tapped', async () => {
    const onAnswer = jest.fn();
    await renderWithTheme(
      <TrueFalseStep step={makeStep()} onAnswer={onAnswer} onContinue={jest.fn()} />,
    );

    fireEvent.press(screen.getByText('False'));

    expect(onAnswer).toHaveBeenCalledWith({ stepId: 's1', type: 'truefalse', value: false });
  });

  it('does not reveal the correct answer — reports the learner choice regardless', async () => {
    const onAnswer = jest.fn();
    // answer is true; tapping False still reports false (player judges).
    await renderWithTheme(
      <TrueFalseStep step={makeStep({ answer: true })} onAnswer={onAnswer} onContinue={jest.fn()} />,
    );
    fireEvent.press(screen.getByText('False'));
    expect(onAnswer).toHaveBeenCalledWith({ stepId: 's1', type: 'truefalse', value: false });
  });

  it('marks the tapped choice selected for assistive tech (4.8)', async () => {
    await renderWithTheme(
      <TrueFalseStep step={makeStep()} onAnswer={jest.fn()} onContinue={jest.fn()} />,
    );

    const trueOption = screen.getByRole('radio', { name: 'True' });
    expect(trueOption.props.accessibilityState).toMatchObject({ selected: false });

    fireEvent.press(screen.getByText('True'));

    // After the state flushes, the tapped choice reports selected = true.
    expect(await screen.findByRole('radio', { name: 'True', selected: true })).toBeTruthy();
  });

  it('exposes both choices as radios for assistive tech (4.8)', async () => {
    await renderWithTheme(
      <TrueFalseStep step={makeStep()} onAnswer={jest.fn()} onContinue={jest.fn()} />,
    );
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'True' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'False' })).toBeTruthy();
  });
});
