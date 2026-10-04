import { fireEvent, render, screen } from '@testing-library/react-native';

import { Auction } from './Auction';
import { ThemeProvider } from '../../../../theme/theme-provider';
import { mulberry32 } from '../../rng';
import { scoreAuction, type AuctionChoice } from '../../sims/auction';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

/**
 * A two-round auction with an unambiguous bull and bear card. Noise is zero so
 * the headline alone decides direction and the component path is easy to assert.
 */
const PARAMS = {
  startPriceCents: 10000,
  baseDemand: 50,
  baseSupply: 50,
  sensitivity: 0.2,
  noise: 0,
  rounds: 2,
  headlines: [
    { id: 'bull', text: 'Great earnings', demandDelta: 40, supplyDelta: 0 },
    { id: 'bear', text: 'Factory fire', demandDelta: 0, supplyDelta: 40 },
  ],
};

/**
 * Play one round: choose a headline, predict, then continue. Awaits each phase
 * transition so act() scopes never overlap (React 19) and the next tap acts on
 * the re-rendered phase.
 */
async function playRound(headlineText: string, prediction: 'up' | 'down', last: boolean) {
  fireEvent.press(screen.getByRole('button', { name: `Play headline: ${headlineText}` }));
  // The prediction buttons appear once the headline is chosen.
  const predictLabel =
    prediction === 'up' ? 'Predict the price will go up' : 'Predict the price will go down';
  fireEvent.press(await screen.findByRole('button', { name: predictLabel }));
  // The result and the continue/finish button appear once a prediction is in.
  const continueLabel = last ? 'See your result' : 'Go to the next round';
  fireEvent.press(await screen.findByRole('button', { name: continueLabel }));
}

describe('<Auction /> (requirements 8.2, 8.5)', () => {
  it('shows the round, price, and headline cards up front', async () => {
    await renderWithTheme(<Auction params={PARAMS} seed={1} onComplete={jest.fn()} />);
    expect(screen.getByText('Round 1 of 2')).toBeTruthy();
    expect(screen.getByText('$100')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play headline: Great earnings' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play headline: Factory fire' })).toBeTruthy();
  });

  it('requires a prediction before revealing the result (8.2)', async () => {
    await renderWithTheme(<Auction params={PARAMS} seed={1} onComplete={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: 'Play headline: Great earnings' }));
    // Prediction buttons are shown; the result is not revealed yet.
    expect(
      await screen.findByRole('button', { name: 'Predict the price will go up' }),
    ).toBeTruthy();
    expect(screen.queryByText(/The price moved/)).toBeNull();
  });

  it('reveals the actual direction after a prediction', async () => {
    await renderWithTheme(<Auction params={PARAMS} seed={1} onComplete={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: 'Play headline: Great earnings' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Predict the price will go up' }));
    expect(await screen.findByText(/The price moved up/)).toBeTruthy();
  });

  it('reports score = correct predictions / rounds, matching the pure oracle (8.5)', async () => {
    const onComplete = jest.fn();
    await renderWithTheme(<Auction params={PARAMS} seed={42} onComplete={onComplete} />);

    // Round 1: bull card, predict up (correct). Round 2: bear card, predict up
    // (wrong — price falls). So 1 of 2 correct -> score 50.
    await playRound('Great earnings', 'up', false);
    // Wait for round 2 to render before playing it.
    await screen.findByText('Round 2 of 2');
    await playRound('Factory fire', 'up', true);

    // Cross-check against the pure oracle fed the same seed the component uses
    // (the raw `seed` prop, 42 here).
    const choices: AuctionChoice[] = [
      { headlineId: 'bull', prediction: 'up' },
      { headlineId: 'bear', prediction: 'up' },
    ];
    const oracle = scoreAuction(PARAMS, choices, mulberry32(42));

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ score: oracle.score }));
    expect(oracle.score).toBe(50);
  });
});
