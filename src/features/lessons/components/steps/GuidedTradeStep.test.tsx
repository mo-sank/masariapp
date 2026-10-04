import { fireEvent, render, screen } from '@testing-library/react-native';

import { GuidedTradeStep } from './GuidedTradeStep';
import { ThemeProvider } from '../../../../theme/theme-provider';
import type { GuidedTradeStep as GuidedTradeStepType } from '../../schema';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

function makeStep(overrides: Partial<GuidedTradeStepType> = {}): GuidedTradeStepType {
  return {
    id: 's1',
    type: 'guided_trade',
    symbols: 'starter',
    requireRationale: true,
    ...overrides,
  } as GuidedTradeStepType;
}

describe('<GuidedTradeStep /> (requirement 4.7)', () => {
  it('labels itself as a guided trade placeholder', async () => {
    await renderWithTheme(
      <GuidedTradeStep step={makeStep()} onAnswer={jest.fn()} onContinue={jest.fn()} />,
    );
    expect(screen.getByText('Guided trade')).toBeTruthy();
    expect(screen.getByText('Place your first practice trade')).toBeTruthy();
    // It is honest that the real order ticket is still to come.
    expect(screen.getByText(/trading update/)).toBeTruthy();
  });

  it('advances via onContinue and never scores (4.7, 4.8)', async () => {
    const onAnswer = jest.fn();
    const onContinue = jest.fn();
    await renderWithTheme(
      <GuidedTradeStep step={makeStep()} onAnswer={onAnswer} onContinue={onContinue} />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Continue to the next step' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    // A guided_trade step is never scored, so it must not report an answer.
    expect(onAnswer).not.toHaveBeenCalled();
  });
});
