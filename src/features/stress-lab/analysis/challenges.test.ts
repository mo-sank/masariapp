import { simulate } from '../engine/simulate';
import type { LabHolding } from '../engine/types';
import { getScenario } from '../scenarios/scenarios';

import {
  CHALLENGES,
  challengesForScenario,
  evaluateChallenge,
  getChallenge,
} from './challenges';

const recession = getScenario('recession')!;
const crisis = getScenario('crisis_2008')!;
const risingRates = getScenario('rising_rates')!;

/** Defensive, well-spread portfolio that should survive a recession. */
const defensive: LabHolding[] = [
  { symbol: 'PG', name: 'Procter & Gamble', sector: 'Consumer Staples', qty: 1, currentValueCents: 250_000 },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Health Care', qty: 1, currentValueCents: 250_000 },
  { symbol: 'DUK', name: 'Duke Energy', sector: 'Utilities', qty: 1, currentValueCents: 250_000 },
  { symbol: 'KO', name: 'Coca-Cola', sector: 'Consumer Staples', qty: 1, currentValueCents: 250_000 },
];

/** One cyclical name taking the full brunt of the recession. */
const fragile: LabHolding[] = [
  { symbol: 'TSLA', name: 'Tesla', sector: 'Consumer Discretionary', qty: 1, currentValueCents: 1_000_000 },
];

describe('challenge catalog', () => {
  it('maps challenges to real seeded scenarios only', () => {
    const scenarioIds = new Set(
      ['crisis_2008', 'covid_2020', 'high_inflation', 'rising_rates', 'recession'],
    );
    for (const challenge of CHALLENGES) {
      expect(scenarioIds.has(challenge.scenarioId)).toBe(true);
    }
  });

  it('filters and looks up challenges by scenario', () => {
    const recessionChallenges = challengesForScenario('recession');
    expect(recessionChallenges.length).toBeGreaterThan(0);
    expect(recessionChallenges.every((c) => c.scenarioId === 'recession')).toBe(true);
    expect(getChallenge('recession', 'survive_recession')).toBeDefined();
    expect(getChallenge('recession', 'nope')).toBeUndefined();
  });
});

describe('evaluateChallenge', () => {
  const surviveRecession = getChallenge('recession', 'survive_recession')!;

  it('marks a defensive portfolio as meeting the recession loss cap', () => {
    const result = simulate({ holdings: defensive, cashCents: 0, scenario: recession });
    const evaluation = evaluateChallenge(surviveRecession, result);
    expect(evaluation.met).toBe(true);
    expect(evaluation.status).toBe('met');
    expect(evaluation.summary).toMatch(/met/i);
  });

  it('marks a fragile portfolio as not yet meeting the recession loss cap', () => {
    const result = simulate({ holdings: fragile, cashCents: 0, scenario: recession });
    const evaluation = evaluateChallenge(surviveRecession, result);
    expect(evaluation.met).toBe(false);
    expect(evaluation.status).toBe('in_progress');
  });

  it('evaluates a max-sector-share challenge against allocation, not loss', () => {
    const diversify = getChallenge('crisis_2008', 'diversify_2008')!;
    // Evenly split across four distinct sectors => largest sector 25% <= 30%.
    const result = simulate({ holdings: defensiveFourSectors(), cashCents: 0, scenario: crisis });
    const evaluation = evaluateChallenge(diversify, result);
    expect(evaluation.met).toBe(true);
    expect(evaluation.actualBp).toBeLessThanOrEqual(diversify.thresholdBp);
  });

  it('evaluates a max-holding-share challenge', () => {
    const noSingleBet = getChallenge('rising_rates', 'avoid_single_bet')!;
    const result = simulate({ holdings: fragile, cashCents: 0, scenario: risingRates });
    const evaluation = evaluateChallenge(noSingleBet, result);
    // One holding = 100% > 30%.
    expect(evaluation.met).toBe(false);
  });

  it('never meets a challenge for an empty portfolio', () => {
    const result = simulate({ holdings: [], cashCents: 50_000, scenario: recession });
    const evaluation = evaluateChallenge(surviveRecession, result);
    expect(evaluation.met).toBe(false);
    expect(evaluation.status).toBe('in_progress');
  });
});

/** Four sectors, each 25% — distinct from the defensive fixture's staples pair. */
function defensiveFourSectors(): LabHolding[] {
  return [
    { symbol: 'PG', name: 'Procter & Gamble', sector: 'Consumer Staples', qty: 1, currentValueCents: 250_000 },
    { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Health Care', qty: 1, currentValueCents: 250_000 },
    { symbol: 'DUK', name: 'Duke Energy', sector: 'Utilities', qty: 1, currentValueCents: 250_000 },
    { symbol: 'XOM', name: 'Exxon', sector: 'Energy', qty: 1, currentValueCents: 250_000 },
  ];
}
