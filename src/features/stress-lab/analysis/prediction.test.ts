import { simulate } from '../engine/simulate';
import type { LabHolding } from '../engine/types';
import { getScenario } from '../scenarios/scenarios';

import { predictionScore, scorePrediction } from './prediction';

const crisis = getScenario('crisis_2008')!;

/** Financials fall hardest under 2008; staples hold up best, so JPM worst / KO best. */
const holdings: LabHolding[] = [
  { symbol: 'JPM', name: 'JPMorgan', sector: 'Financials', qty: 1, currentValueCents: 400_000 },
  { symbol: 'KO', name: 'Coca-Cola', sector: 'Consumer Staples', qty: 1, currentValueCents: 300_000 },
  { symbol: 'AAPL', name: 'Apple', sector: 'Information Technology', qty: 1, currentValueCents: 300_000 },
];

const result = simulate({ holdings, cashCents: 0, scenario: crisis });

describe('scorePrediction', () => {
  it('reports the actual direction and marks a correct direction call', () => {
    const accuracy = scorePrediction({ direction: 'lose' }, result);
    expect(accuracy.actualDirection).toBe('lose');
    expect(accuracy.directionCorrect).toBe(true);
    expect(accuracy.actualChangeBp).toBe(result.changeBasisPoints);
  });

  it('marks an incorrect direction call', () => {
    const accuracy = scorePrediction({ direction: 'gain' }, result);
    expect(accuracy.directionCorrect).toBe(false);
  });

  it('identifies the actual best and worst holdings', () => {
    const accuracy = scorePrediction({ direction: 'lose' }, result);
    expect(accuracy.actualWorst).toBe('JPM');
    expect(accuracy.actualBest).toBe('KO');
  });

  it('scores best/worst picks only when the student picked and was right', () => {
    const right = scorePrediction(
      { direction: 'lose', pickedBest: 'KO', pickedWorst: 'JPM' },
      result,
    );
    expect(right.bestCorrect).toBe(true);
    expect(right.worstCorrect).toBe(true);

    const noPick = scorePrediction({ direction: 'lose' }, result);
    expect(noPick.bestCorrect).toBe(false);
    expect(noPick.worstCorrect).toBe(false);
  });

  it('computes the estimate error as an absolute basis-point distance', () => {
    const actual = result.changeBasisPoints as number;
    const accuracy = scorePrediction(
      { direction: 'lose', estimatedChangeBp: actual - 300 },
      result,
    );
    expect(accuracy.estimateErrorBp).toBe(300);
  });

  it('returns a null estimate error when no estimate was given', () => {
    const accuracy = scorePrediction({ direction: 'lose' }, result);
    expect(accuracy.estimateErrorBp).toBeNull();
  });

  it('handles an empty portfolio with no best/worst', () => {
    const empty = simulate({ holdings: [], cashCents: 50_000, scenario: crisis });
    const accuracy = scorePrediction({ direction: 'lose' }, empty);
    expect(accuracy.actualBest).toBeNull();
    expect(accuracy.actualWorst).toBeNull();
  });
});

describe('predictionScore', () => {
  it('rewards a fully correct prediction more than direction alone', () => {
    const full = predictionScore(
      scorePrediction(
        { direction: 'lose', estimatedChangeBp: result.changeBasisPoints, pickedBest: 'KO', pickedWorst: 'JPM' },
        result,
      ),
    );
    const directionOnly = predictionScore(scorePrediction({ direction: 'lose' }, result));
    expect(full).toBeGreaterThan(directionOnly);
    expect(full).toBeLessThanOrEqual(100);
  });

  it('gives a low score to a wrong direction call', () => {
    const score = predictionScore(scorePrediction({ direction: 'gain' }, result));
    expect(score).toBeLessThan(50);
  });
});
