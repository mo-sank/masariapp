import { fireEvent, render, screen } from '@testing-library/react-native';

import { SortStep } from './SortStep';
import { ThemeProvider } from '../../../../theme/theme-provider';
import type { SortStep as SortStepType } from '../../schema';

// Reduce-motion ON so any snap-back is synchronous; the tap path (what these
// tests exercise) does not animate, but this keeps timers out of the way.
jest.mock('../../../../theme/use-reduce-motion', () => ({
  useReduceMotion: () => true,
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

function makeStep(overrides: Partial<SortStepType> = {}): SortStepType {
  return {
    id: 's1',
    type: 'sort',
    prompt: 'Sort each into the right group.',
    buckets: [
      { id: 'asset', label: 'Asset' },
      { id: 'liability', label: 'Liability' },
    ],
    items: [
      { id: 'cash', text: 'Cash', bucketId: 'asset' },
      { id: 'loan', text: 'Loan', bucketId: 'liability' },
    ],
    explanation: 'Assets you own; liabilities you owe.',
    scored: true,
    concept: 'balance-sheet',
    ...overrides,
  } as SortStepType;
}

/**
 * Tap a tray item (by label) then its target bucket to place it. Awaits the
 * selection to register between the two taps (matching how a learner taps, and
 * how a prior tap's state must settle before the next), then awaits the item
 * landing in the bucket.
 */
async function placeItem(itemLabel: string, bucketLabel: string, bucketId: string) {
  fireEvent.press(screen.getByLabelText(itemLabel));
  // The item is now selected; the bucket invites placement.
  await screen.findByRole('button', {
    name: new RegExp(`^${bucketLabel} bucket.*tap to place`),
  });
  fireEvent.press(screen.getByRole('button', { name: new RegExp(`^${bucketLabel} bucket`) }));
  // The item has moved into the bucket.
  await screen.findByLabelText(`${itemLabel}, in ${bucketLabel}. Tap to remove.`);
  void bucketId;
}

describe('<SortStep />', () => {
  it('renders the prompt, items, and buckets (4.4)', async () => {
    await renderWithTheme(
      <SortStep step={makeStep()} onAnswer={jest.fn()} onContinue={jest.fn()} />,
    );
    expect(screen.getByText('Sort each into the right group.')).toBeTruthy();
    expect(screen.getByText('Cash')).toBeTruthy();
    expect(screen.getByText('Loan')).toBeTruthy();
    expect(screen.getByText('Asset')).toBeTruthy();
    expect(screen.getByText('Liability')).toBeTruthy();
  });

  it('disables Check until every item is placed (4.4)', async () => {
    const onAnswer = jest.fn();
    await renderWithTheme(
      <SortStep step={makeStep()} onAnswer={onAnswer} onContinue={jest.fn()} />,
    );

    const check = screen.getByRole('button', { name: 'Check your answer' });
    expect(check.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(check);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('places items by tapping an item then a bucket (tap fallback, no drag) (4.4)', async () => {
    const onAnswer = jest.fn();
    await renderWithTheme(
      <SortStep step={makeStep()} onAnswer={onAnswer} onContinue={jest.fn()} />,
    );

    await placeItem('Cash', 'Asset', 'asset');
    await placeItem('Loan', 'Liability', 'liability');
    fireEvent.press(await screen.findByRole('button', { name: 'Check your answer' }));

    expect(onAnswer).toHaveBeenCalledWith({
      stepId: 's1',
      type: 'sort',
      placements: { cash: 'asset', loan: 'liability' },
    });
  });

  it('reports the learner placement faithfully, even when wrong (player grades)', async () => {
    const onAnswer = jest.fn();
    await renderWithTheme(
      <SortStep step={makeStep()} onAnswer={onAnswer} onContinue={jest.fn()} />,
    );

    // Deliberately place both in the wrong bucket.
    await placeItem('Cash', 'Liability', 'liability');
    await placeItem('Loan', 'Asset', 'asset');
    fireEvent.press(await screen.findByRole('button', { name: 'Check your answer' }));

    expect(onAnswer).toHaveBeenCalledWith({
      stepId: 's1',
      type: 'sort',
      placements: { cash: 'liability', loan: 'asset' },
    });
  });

  it('lets a placed item be returned to the tray and re-sorted', async () => {
    const onAnswer = jest.fn();
    await renderWithTheme(
      <SortStep step={makeStep()} onAnswer={onAnswer} onContinue={jest.fn()} />,
    );

    // Place Cash in Liability by mistake, then tap the placed chip to remove it.
    await placeItem('Cash', 'Liability', 'liability');
    fireEvent.press(screen.getByLabelText('Cash, in Liability. Tap to remove.'));
    // Cash is back in the tray; place everything correctly.
    await screen.findByRole('button', { name: 'Cash', selected: false });
    await placeItem('Cash', 'Asset', 'asset');
    await placeItem('Loan', 'Liability', 'liability');
    fireEvent.press(await screen.findByRole('button', { name: 'Check your answer' }));

    expect(onAnswer).toHaveBeenCalledWith({
      stepId: 's1',
      type: 'sort',
      placements: { cash: 'asset', loan: 'liability' },
    });
  });

  it('marks a tapped item as selected for assistive tech (4.8)', async () => {
    await renderWithTheme(
      <SortStep step={makeStep()} onAnswer={jest.fn()} onContinue={jest.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Cash', selected: false })).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Cash'));
    expect(await screen.findByRole('button', { name: 'Cash', selected: true })).toBeTruthy();
  });

  it('does not report twice if Check is pressed again', async () => {
    const onAnswer = jest.fn();
    await renderWithTheme(
      <SortStep step={makeStep()} onAnswer={onAnswer} onContinue={jest.fn()} />,
    );

    await placeItem('Cash', 'Asset', 'asset');
    await placeItem('Loan', 'Liability', 'liability');

    const check = await screen.findByRole('button', { name: 'Check your answer' });
    fireEvent.press(check);
    fireEvent.press(check);

    expect(onAnswer).toHaveBeenCalledTimes(1);
  });
});
