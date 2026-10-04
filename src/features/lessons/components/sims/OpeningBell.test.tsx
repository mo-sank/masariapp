import { fireEvent, render, screen } from '@testing-library/react-native';

import { OpeningBell } from './OpeningBell';
import { ThemeProvider } from '../../../../theme/theme-provider';
import { mulberry32 } from '../../rng';
import {
  orderEvents,
  parseOpeningBellParams,
  scoreOpeningBell,
  type OpeningBellAction,
  type OpeningBellChoice,
} from '../../sims/opening-bell';

// Reduce-motion ON so no countdown interval runs during the component tests —
// the clock is display-only flavour and must not be needed to drive the lab.
jest.mock('../../../../theme/use-reduce-motion', () => ({
  useReduceMotion: () => true,
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

/** A two-event day with unambiguous correct readings, for easy assertions. */
const PARAMS = {
  symbol: 'ACME',
  durationSeconds: 90,
  events: [
    {
      id: 'e1',
      headline: 'ACME beats earnings',
      interpretations: [
        { id: 'good', text: 'Made more money than expected' },
        { id: 'bad', text: 'The company is in trouble' },
      ],
      correctInterpretationId: 'good',
      explanation: 'Beating earnings is usually good news.',
    },
    {
      id: 'e2',
      headline: 'ACME recalls a product',
      interpretations: [
        { id: 'good', text: 'Nothing to worry about' },
        { id: 'bad', text: 'A costly problem' },
      ],
      correctInterpretationId: 'bad',
      explanation: 'A recall can be expensive.',
    },
  ],
};

/** The event order the component will use for a given seed (pure oracle). */
function orderedFor(seed: number) {
  return orderEvents(parseOpeningBellParams(PARAMS), mulberry32(seed));
}

/**
 * Answer the current event: pick the given interpretation, then a practice
 * action. Awaits the act-phase header so act() scopes never overlap (React 19).
 */
async function answerEvent(interpretationText: string, action: OpeningBellAction, last: boolean) {
  fireEvent.press(screen.getByRole('button', { name: `Interpretation: ${interpretationText}` }));
  await screen.findByText('Make a practice move (just for feel)');
  const label = `${action === 'buy' ? 'Buy' : action === 'hold' ? 'Hold' : 'Sell'} and ${
    last ? 'see your result' : 'go to the next headline'
  }`;
  fireEvent.press(screen.getByRole('button', { name: label }));
}

describe('<OpeningBell /> (requirements 8.4, 8.5)', () => {
  it('shows the symbol, event counter, and first headline', async () => {
    const first = orderedFor(1)[0];
    await renderWithTheme(<OpeningBell params={PARAMS} seed={1} onComplete={jest.fn()} />);
    expect(screen.getByText('ACME · Event 1 of 2')).toBeTruthy();
    expect(screen.getByText(first.headline)).toBeTruthy();
  });

  it('reveals the explanation only after an interpretation is picked', async () => {
    const first = orderedFor(1)[0];
    await renderWithTheme(<OpeningBell params={PARAMS} seed={1} onComplete={jest.fn()} />);
    expect(screen.queryByText(new RegExp(first.explanation))).toBeNull();
    fireEvent.press(
      screen.getByRole('button', { name: `Interpretation: ${first.interpretations[0].text}` }),
    );
    expect(await screen.findByText(new RegExp(first.explanation))).toBeTruthy();
    // The practice action buttons now appear.
    expect(screen.getByText('Make a practice move (just for feel)')).toBeTruthy();
  });

  it('scores correct interpretations / events, matching the pure oracle (8.4, 8.5)', async () => {
    const onComplete = jest.fn();
    await renderWithTheme(<OpeningBell params={PARAMS} seed={3} onComplete={onComplete} />);

    const ordered = orderedFor(3);
    const choices: OpeningBellChoice[] = [];

    // Answer both events: always pick the FIRST interpretation and Buy. One of
    // the two events has 'good' first (correct) and the other has it first too,
    // so correctness depends on the authored data — we mirror the exact choices
    // into the oracle below rather than hard-coding a score.
    for (let i = 0; i < ordered.length; i++) {
      const event = ordered[i];
      const pick = event.interpretations[0];
      const action: OpeningBellAction = 'buy';
      await answerEvent(pick.text, action, i === ordered.length - 1);
      choices.push({ eventId: event.id, interpretationId: pick.id, action });
      if (i < ordered.length - 1) {
        await screen.findByText(`ACME · Event ${i + 2} of ${ordered.length}`);
      }
    }

    const oracle = scoreOpeningBell(parseOpeningBellParams(PARAMS), choices);
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ score: oracle.score, summary: oracle.summary }),
    );
  });

  it('reports a perfect score when every interpretation is correct', async () => {
    const onComplete = jest.fn();
    await renderWithTheme(<OpeningBell params={PARAMS} seed={9} onComplete={onComplete} />);

    const ordered = orderedFor(9);
    for (let i = 0; i < ordered.length; i++) {
      const event = ordered[i];
      const correct = event.interpretations.find(
        (opt) => opt.id === event.correctInterpretationId,
      )!;
      await answerEvent(correct.text, 'hold', i === ordered.length - 1);
      if (i < ordered.length - 1) {
        await screen.findByText(`ACME · Event ${i + 2} of ${ordered.length}`);
      }
    }

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ score: 100 }));
  });

  it('uses a deterministic event order for a given seed (8.5)', () => {
    expect(orderedFor(42).map((e) => e.id)).toEqual(orderedFor(42).map((e) => e.id));
  });
});
