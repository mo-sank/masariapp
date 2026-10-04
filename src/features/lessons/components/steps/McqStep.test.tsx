import { fireEvent, render, screen } from '@testing-library/react-native';

import { McqStep } from './McqStep';
import { ThemeProvider } from '../../../../theme/theme-provider';
import type { McqStep as McqStepType } from '../../schema';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

function makeStep(overrides: Partial<McqStepType> = {}): McqStepType {
  return {
    id: 's1',
    type: 'mcq',
    prompt: 'What is a share?',
    options: [
      { id: 'a', text: 'A slice of ownership' },
      { id: 'b', text: 'A kind of loan' },
      { id: 'c', text: 'A bank account' },
    ],
    correctId: 'a',
    explanation: 'A share is a slice of ownership.',
    variant: 'standard',
    scored: true,
    concept: 'ownership',
    ...overrides,
  } as McqStepType;
}

describe('<McqStep />', () => {
  it('renders the prompt and every option (4.2)', async () => {
    await renderWithTheme(
      <McqStep step={makeStep()} onAnswer={jest.fn()} onContinue={jest.fn()} />,
    );
    expect(screen.getByText('What is a share?')).toBeTruthy();
    expect(screen.getByText('A slice of ownership')).toBeTruthy();
    expect(screen.getByText('A kind of loan')).toBeTruthy();
    expect(screen.getByText('A bank account')).toBeTruthy();
  });

  it('reports the selected option id via onAnswer, never onContinue (4.8)', async () => {
    const onAnswer = jest.fn();
    const onContinue = jest.fn();
    await renderWithTheme(
      <McqStep step={makeStep()} onAnswer={onAnswer} onContinue={onContinue} />,
    );

    fireEvent.press(screen.getByText('A kind of loan'));

    expect(onAnswer).toHaveBeenCalledWith({ stepId: 's1', type: 'mcq', optionId: 'b' });
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('does not reveal correctness — any option reports its own id', async () => {
    const onAnswer = jest.fn();
    await renderWithTheme(
      <McqStep step={makeStep()} onAnswer={onAnswer} onContinue={jest.fn()} />,
    );

    // The wrong option still reports faithfully; the player judges correctness.
    fireEvent.press(screen.getByText('A bank account'));
    expect(onAnswer).toHaveBeenCalledWith({ stepId: 's1', type: 'mcq', optionId: 'c' });
  });

  it('marks the tapped option selected for assistive tech (4.8)', async () => {
    await renderWithTheme(
      <McqStep step={makeStep()} onAnswer={jest.fn()} onContinue={jest.fn()} />,
    );

    const option = screen.getByRole('radio', { name: 'A slice of ownership' });
    expect(option.props.accessibilityState).toMatchObject({ selected: false });

    fireEvent.press(screen.getByText('A slice of ownership'));

    // After the state flushes, the tapped option reports selected = true.
    expect(
      await screen.findByRole('radio', { name: 'A slice of ownership', selected: true }),
    ).toBeTruthy();
  });

  it('exposes every option as a radio for assistive tech (4.8)', async () => {
    await renderWithTheme(
      <McqStep step={makeStep()} onAnswer={jest.fn()} onContinue={jest.fn()} />,
    );
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    // Each radio carries its own label so screen readers announce the choice.
    expect(screen.getByRole('radio', { name: 'A slice of ownership' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'A kind of loan' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'A bank account' })).toBeTruthy();
  });

  it('shows the explain-variant lead-in when variant is "explain" (4.2)', async () => {
    await renderWithTheme(
      <McqStep
        step={makeStep({ variant: 'explain' })}
        onAnswer={jest.fn()}
        onContinue={jest.fn()}
      />,
    );
    expect(screen.getByText('Pick the best explanation')).toBeTruthy();
  });

  it('shows the standard lead-in for the standard variant (4.2)', async () => {
    await renderWithTheme(
      <McqStep step={makeStep({ variant: 'standard' })} onAnswer={jest.fn()} onContinue={jest.fn()} />,
    );
    expect(screen.getByText('Choose one')).toBeTruthy();
    expect(screen.queryByText('Pick the best explanation')).toBeNull();
  });
});
