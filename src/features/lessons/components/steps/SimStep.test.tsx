import { fireEvent, render, screen } from '@testing-library/react-native';

import { SimStep } from './SimStep';
import { ThemeProvider } from '../../../../theme/theme-provider';
import type { SimStep as SimStepType } from '../../schema';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

/**
 * Sell 5*times shares in the embedded ownership_split lab, awaiting each tap's
 * state update so act() scopes never overlap (React 19).
 */
async function sellFiveTimes(times: number) {
  const plusFive = screen.getByRole('button', { name: 'Sell 5 more shares' });
  for (let i = 0; i < times; i++) {
    fireEvent.press(plusFive);
    await screen.findByText(new RegExp(`Selling ${(i + 1) * 5} shares`));
  }
}

/** A scored ownership_split sim step mirroring the design's L1.1 example. */
function makeStep(overrides: Partial<SimStepType> = {}): SimStepType {
  return {
    id: 's3',
    type: 'sim',
    simId: 'ownership_split',
    goal: 'Raise $400 but keep at least 51%.',
    params: {
      totalShares: 100,
      pricePerShareCents: 2500,
      targetRaiseCents: 40000,
      minOwnerPct: 51,
    },
    scored: true,
    concept: 'dilution',
    ...overrides,
  } as SimStepType;
}

describe('<SimStep />', () => {
  it('renders the registered lab for the simId (4.6)', async () => {
    await renderWithTheme(<SimStep step={makeStep()} onAnswer={jest.fn()} onContinue={jest.fn()} />);
    // The ownership_split lab's lock-in button is present.
    expect(screen.getByRole('button', { name: 'Lock in your share sale' })).toBeTruthy();
  });

  it('reports a sim Answer with the lab score when the step is scored', async () => {
    const onAnswer = jest.fn();
    const onContinue = jest.fn();
    await renderWithTheme(
      <SimStep step={makeStep()} onAnswer={onAnswer} onContinue={onContinue} />,
    );

    // Sell 40 shares (8 * +5) -> both goals met -> score 100.
    await sellFiveTimes(8);
    fireEvent.press(screen.getByRole('button', { name: 'Lock in your share sale' }));

    expect(onAnswer).toHaveBeenCalledWith({ stepId: 's3', type: 'sim', score: 100 });
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('advances via onContinue when the step is unscored', async () => {
    const onAnswer = jest.fn();
    const onContinue = jest.fn();
    await renderWithTheme(
      <SimStep
        step={makeStep({ scored: false, concept: undefined })}
        onAnswer={onAnswer}
        onContinue={onContinue}
      />,
    );

    await sellFiveTimes(8);
    fireEvent.press(screen.getByRole('button', { name: 'Lock in your share sale' }));

    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('degrades to a Continue card for a lab with no registry entry', async () => {
    const onContinue = jest.fn();
    // Every real simId is registered now (tasks 8-9), so to exercise the
    // graceful-degradation path we point the step at an id with no entry — the
    // resilience SimStep guards against if content ever references an unknown
    // lab. The cast stands in for that out-of-schema id.
    await renderWithTheme(
      <SimStep
        step={makeStep({
          simId: 'not_a_real_lab' as SimStepType['simId'],
          params: {},
          scored: false,
          concept: undefined,
        })}
        onAnswer={jest.fn()}
        onContinue={onContinue}
      />,
    );

    expect(screen.getByText('This lab is not available yet.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Continue to the next step' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
