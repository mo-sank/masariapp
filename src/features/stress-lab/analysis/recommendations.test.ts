import { simulate } from '../engine/simulate';
import type { LabHolding } from '../engine/types';
import { getScenario } from '../scenarios/scenarios';

import { deriveRecommendations } from './recommendations';

const crisis = getScenario('crisis_2008')!;
const recession = getScenario('recession')!;

/** Portfolio heavily concentrated in one tech name, no defensive exposure. */
const techHeavy: LabHolding[] = [
  { symbol: 'AAPL', name: 'Apple', sector: 'Information Technology', qty: 1, currentValueCents: 800_000 },
  { symbol: 'JPM', name: 'JPMorgan', sector: 'Financials', qty: 1, currentValueCents: 200_000 },
];

/** A diversified, resilient portfolio under a mild scenario. */
const diversified: LabHolding[] = [
  { symbol: 'PG', name: 'Procter & Gamble', sector: 'Consumer Staples', qty: 1, currentValueCents: 250_000 },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Health Care', qty: 1, currentValueCents: 250_000 },
  { symbol: 'DUK', name: 'Duke Energy', sector: 'Utilities', qty: 1, currentValueCents: 250_000 },
  { symbol: 'XOM', name: 'Exxon', sector: 'Energy', qty: 1, currentValueCents: 250_000 },
];

describe('deriveRecommendations', () => {
  it('returns an empty list for a portfolio with no holdings', () => {
    const result = simulate({ holdings: [], cashCents: 50_000, scenario: crisis });
    expect(deriveRecommendations(result)).toEqual([]);
  });

  it('flags heavy single-sector and single-holding concentration grounded in real figures', () => {
    const result = simulate({ holdings: techHeavy, cashCents: 0, scenario: crisis });
    const recs = deriveRecommendations(result);
    const sector = recs.find((r) => r.kind === 'sector-concentration');
    const holding = recs.find((r) => r.kind === 'holding-concentration');

    expect(sector).toBeDefined();
    expect(sector!.message).toContain('Information Technology');
    expect(sector!.message).toContain('80%');

    expect(holding).toBeDefined();
    expect(holding!.message).toContain('AAPL');
  });

  it('points out missing defensive exposure when no defensive sector is held', () => {
    const result = simulate({ holdings: techHeavy, cashCents: 0, scenario: crisis });
    const recs = deriveRecommendations(result);
    expect(recs.some((r) => r.kind === 'missing-defensive')).toBe(true);
  });

  it('does not flag missing defensive exposure when a defensive sector is held', () => {
    const result = simulate({ holdings: diversified, cashCents: 0, scenario: crisis });
    const recs = deriveRecommendations(result);
    expect(recs.some((r) => r.kind === 'missing-defensive')).toBe(false);
  });

  it('raises a scenario-specific loss recommendation naming the worst sector', () => {
    const result = simulate({ holdings: techHeavy, cashCents: 0, scenario: recession });
    const recs = deriveRecommendations(result);
    const loss = recs.find((r) => r.kind === 'scenario-loss');
    expect(loss).toBeDefined();
    expect(loss!.message).toMatch(/-\d+\.\d+%/);
  });

  it('never prescribes a trade or implies the portfolio was modified', () => {
    const result = simulate({ holdings: techHeavy, cashCents: 0, scenario: crisis });
    const recs = deriveRecommendations(result);
    expect(recs.length).toBeGreaterThan(0);
    for (const rec of recs) {
      expect(rec.message.toLowerCase()).not.toMatch(/\bwe (sold|bought|changed|moved)\b/);
      // Prompts invite exploration ("consider", "think", "try"), not instructions.
      expect(typeof rec.prompt).toBe('string');
      expect(rec.prompt.length).toBeGreaterThan(0);
    }
  });
});
