import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { PnlReplay } from './PnlReplay';
import { ThemeProvider } from '../../../../theme/theme-provider';
import { buildPricePath, parsePnlReplayParams, replayPnl } from '../../sims/pnl-replay';
import { mulberry32 } from '../../rng';

// Default to reduce-motion ON so the lab starts at the prompt synchronously (no
// fast-forward timer). A dedicated test flips this off to exercise the replay.
let mockReduceMotion = true;
jest.mock('../../../../theme/use-reduce-motion', () => ({
  useReduceMotion: () => mockReduceMotion,
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

/** Authored rising path: bought at $10, prompt at $12 (index 2), ends at $15. */
const PARAMS = {
  shares: 10,
  buyIndex: 0,
  promptIndex: 2,
  prices: [1000, 1100, 1200, 1300, 1500],
};

beforeEach(() => {
  mockReduceMotion = true;
});

describe('<PnlReplay /> (requirements 8.3, 8.5)', () => {
  it('shows the buy price and the sell/hold prompt with unrealized P&L (8.3)', async () => {
    await renderWithTheme(<PnlReplay params={PARAMS} seed={1} onComplete={jest.fn()} />);
    expect(screen.getByText(/You bought 10 shares at \$10/)).toBeTruthy();
    // At the prompt the price is $12 and unrealized is +$20 (+20%).
    expect(screen.getByText('$12')).toBeTruthy();
    expect(screen.getByText(/On paper: \+\$20 \(\+20%\)/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sell now/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Hold/ })).toBeTruthy();
  });

  it('does not reveal realized P&L before the learner decides', async () => {
    await renderWithTheme(<PnlReplay params={PARAMS} seed={1} onComplete={jest.fn()} />);
    expect(screen.queryByText(/Realized:/)).toBeNull();
  });

  it('selling realizes the prompt price and shows the hold alternative', async () => {
    const onComplete = jest.fn();
    await renderWithTheme(<PnlReplay params={PARAMS} seed={1} onComplete={onComplete} />);
    fireEvent.press(screen.getByRole('button', { name: /Sell now/ }));
    // Sold at $12 -> realized +$20; holding would have been +$50.
    expect(await screen.findByText(/Realized: \+\$20 \(\+20%\)/)).toBeTruthy();
    expect(screen.getByText(/Holding would have been \+\$50/)).toBeTruthy();
    // On a rising path selling early is the worse call -> score 60.
    fireEvent.press(screen.getByRole('button', { name: 'Continue to the next step' }));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ score: 60 }));
  });

  it('holding realizes the final price, matching the pure oracle (8.5)', async () => {
    const onComplete = jest.fn();
    await renderWithTheme(<PnlReplay params={PARAMS} seed={7} onComplete={onComplete} />);
    fireEvent.press(screen.getByRole('button', { name: /Hold/ }));
    expect(await screen.findByText(/Realized: \+\$50 \(\+50%\)/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Continue to the next step' }));

    // Cross-check against the pure oracle fed the same path the component builds.
    const parsed = parsePnlReplayParams(PARAMS);
    const oracle = replayPnl(buildPricePath(parsed, mulberry32(7)), parsed, 'hold');
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ score: oracle.score }));
    expect(oracle.score).toBe(100);
  });

  it('fast-forwards to the prompt when reduce-motion is off', async () => {
    jest.useFakeTimers();
    mockReduceMotion = false;
    try {
      await renderWithTheme(<PnlReplay params={PARAMS} seed={1} onComplete={jest.fn()} />);
      // During the fast-forward the Sell/Hold prompt is not shown yet.
      expect(screen.queryByRole('button', { name: /Sell now/ })).toBeNull();
      expect(screen.getByText(/Fast-forwarding/)).toBeTruthy();
      // Advance through both ticks (buyIndex 0 -> promptIndex 2).
      await act(async () => {
        jest.advanceTimersByTime(450 * 2);
      });
      // The prompt is reached and the decision buttons appear.
      expect(screen.getByRole('button', { name: /Sell now/ })).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('builds a deterministic generated path from the seed', async () => {
    const generated = {
      shares: 1,
      buyIndex: 0,
      promptIndex: 3,
      startPriceCents: 2000,
      generator: { steps: 6, drift: 0, volatility: 0.05 },
    };
    const onComplete = jest.fn();
    await renderWithTheme(<PnlReplay params={generated} seed={123} onComplete={onComplete} />);
    fireEvent.press(screen.getByRole('button', { name: /Hold/ }));
    fireEvent.press(await screen.findByRole('button', { name: 'Continue to the next step' }));

    const parsed = parsePnlReplayParams(generated);
    const oracle = replayPnl(buildPricePath(parsed, mulberry32(123)), parsed, 'hold');
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ score: oracle.score, summary: oracle.summary }),
    );
  });
});
