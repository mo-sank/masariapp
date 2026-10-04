import { fireEvent, render, screen } from '@testing-library/react-native';

import { OwnershipSplit } from './OwnershipSplit';
import { ThemeProvider } from '../../../../theme/theme-provider';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

/** The design's L1.1 params: 100 shares at $25, raise $400, keep >= 51%. */
const PARAMS = {
  totalShares: 100,
  pricePerShareCents: 2500,
  targetRaiseCents: 40000,
  minOwnerPct: 51,
};

/**
 * Press the "+5 shares" button `times` times (selling 5*times shares), awaiting
 * the running "Selling N shares" caption so each tap's state update flushes
 * before the next assertion.
 */
async function sellFiveTimes(times: number) {
  const plusFive = screen.getByRole('button', { name: 'Sell 5 more shares' });
  for (let i = 0; i < times; i++) {
    fireEvent.press(plusFive);
    // Await each tap's state update so act() scopes never overlap (React 19).
    await screen.findByText(new RegExp(`Selling ${(i + 1) * 5} shares`));
  }
}

describe('<OwnershipSplit /> (requirement 8.1)', () => {
  it('starts at full ownership and zero raised, showing the goal', async () => {
    await renderWithTheme(<OwnershipSplit params={PARAMS} seed={1} onComplete={jest.fn()} />);
    expect(screen.getByText('$0 raised')).toBeTruthy();
    expect(screen.getByText(/You keep 100% ownership/)).toBeTruthy();
    expect(screen.getByText(/Goal: raise \$400 and keep at least 51%/)).toBeTruthy();
  });

  it('updates ownership and raise live as shares are sold (8.1)', async () => {
    await renderWithTheme(<OwnershipSplit params={PARAMS} seed={1} onComplete={jest.fn()} />);
    // Sell 10 shares via +5 twice -> $250 raised, 90% kept.
    await sellFiveTimes(2);
    expect(screen.getByText('$250 raised')).toBeTruthy();
    expect(screen.getByText(/You keep 90% ownership/)).toBeTruthy();
  });

  it('reports score 100 when both goals are met', async () => {
    const onComplete = jest.fn();
    await renderWithTheme(<OwnershipSplit params={PARAMS} seed={1} onComplete={onComplete} />);
    // Sell 40 shares -> raise $1000, keep 60%.
    await sellFiveTimes(8);
    fireEvent.press(screen.getByRole('button', { name: 'Lock in your share sale' }));

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ score: 100 }));
  });

  it('shows a hint and allows one retry on a sub-100 first attempt', async () => {
    const onComplete = jest.fn();
    await renderWithTheme(<OwnershipSplit params={PARAMS} seed={1} onComplete={onComplete} />);
    // Sell 60 shares -> over-diluted (keep 40%), raise met: score 60.
    await sellFiveTimes(12);

    // First lock-in: a hint appears, nothing is reported yet.
    fireEvent.press(screen.getByRole('button', { name: 'Lock in your share sale' }));
    expect(onComplete).not.toHaveBeenCalled();
    expect(await screen.findByText(/Adjust and try once more/)).toBeTruthy();

    // Second lock-in commits the (still sub-100) score.
    fireEvent.press(screen.getByRole('button', { name: 'Lock in your share sale' }));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ score: 60 }));
  });

  it('does not let shares sold go below zero', async () => {
    await renderWithTheme(<OwnershipSplit params={PARAMS} seed={1} onComplete={jest.fn()} />);
    const minusOne = screen.getByRole('button', { name: 'Sell one fewer share' });
    // Disabled at the start (nothing sold yet).
    expect(minusOne.props.accessibilityState).toMatchObject({ disabled: true });
  });
});
