import { simulate } from '../engine/simulate';
import type { LabHolding } from '../engine/types';
import { getScenario } from '../scenarios/scenarios';

import { deriveObservations } from './observations';

const crisis = getScenario('crisis_2008')!;

/** Tech-concentrated portfolio with a null-sector holding. */
const holdings: LabHolding[] = [
  { symbol: 'AAPL', name: 'Apple', sector: 'Information Technology', qty: 1, currentValueCents: 600_000 },
  { symbol: 'MSFT', name: 'Microsoft', sector: 'Information Technology', qty: 1, currentValueCents: 100_000 },
  { symbol: 'JPM', name: 'JPMorgan', sector: 'Financials', qty: 1, currentValueCents: 200_000 },
  { symbol: 'MYST', name: 'Unclassified Co', sector: null, qty: 1, currentValueCents: 100_000 },
];

describe('deriveObservations', () => {
  const result = simulate({ holdings, cashCents: 0, scenario: crisis });
  const observations = deriveObservations(result);
  const messages = observations.map((o) => o.message);

  it('returns at least one observation referencing a specific sector or holding', () => {
    expect(observations.length).toBeGreaterThan(0);
    const mentionsReal = messages.some(
      (m) =>
        m.includes('Information Technology') ||
        m.includes('Financials') ||
        m.includes('AAPL') ||
        m.includes('JPM'),
    );
    expect(mentionsReal).toBe(true);
  });

  it('calls out significant sector exposure', () => {
    expect(messages.some((m) => m.includes('Information Technology') && m.includes('exposure'))).toBe(true);
  });

  it('calls out a substantial simulated loss', () => {
    const loss = observations.find((o) => o.kind === 'loss');
    expect(loss).toBeDefined();
    expect(loss!.tone).toBe('negative');
  });

  it('names the worst-hit sector (Financials under 2008)', () => {
    expect(messages.some((m) => m.includes('Financials') && m.includes('hardest'))).toBe(true);
  });

  it('prompts to add holdings for an empty portfolio', () => {
    const empty = deriveObservations(simulate({ holdings: [], cashCents: 50_000, scenario: crisis }));
    expect(empty).toHaveLength(1);
    expect(empty[0].message).toContain('no holdings');
  });
});
