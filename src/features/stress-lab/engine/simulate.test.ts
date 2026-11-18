import { getScenario } from '../scenarios/scenarios';

import { simulate } from './simulate';
import type { LabHolding } from './types';

const crisis = getScenario('crisis_2008')!;
const covid = getScenario('covid_2020')!;

describe('simulate — AC-4 worked example', () => {
  it('matches 192500 cents ending and -3583 bp', () => {
    const holdings: LabHolding[] = [
      { symbol: 'AAPL', name: 'Apple', sector: 'Information Technology', qty: 10, currentValueCents: 150_000 },
      { symbol: 'JPM', name: 'JPMorgan', sector: 'Financials', qty: 5, currentValueCents: 100_000 },
    ];
    const result = simulate({ holdings, cashCents: 50_000, scenario: crisis });
    expect(result.simulatedValueCents).toBe(192_500);
    expect(result.changeBasisPoints).toBe(-3583);
  });
});

describe('simulate — cash', () => {
  it('never shocks cash (cash-only portfolio is stable)', () => {
    const result = simulate({ holdings: [], cashCents: 50_000, scenario: crisis });
    expect(result.startingValueCents).toBe(50_000);
    expect(result.simulatedValueCents).toBe(50_000);
    expect(result.changeCents).toBe(0);
    expect(result.changeBasisPoints).toBe(0);
    expect(result.cashCents).toBe(50_000);
  });

  it('passes cash through unchanged alongside shocked holdings', () => {
    const holdings: LabHolding[] = [
      { symbol: 'AAPL', name: 'Apple', sector: 'Information Technology', qty: 1, currentValueCents: 100_000 },
    ];
    const result = simulate({ holdings, cashCents: 25_000, scenario: crisis });
    expect(result.cashCents).toBe(25_000);
    // AAPL -0.35 -> 65_000; plus untouched 25_000 cash = 90_000.
    expect(result.simulatedValueCents).toBe(90_000);
  });
});

describe('simulate — determinism (AC-5)', () => {
  it('yields identical output for the same input run twice', () => {
    const holdings: LabHolding[] = [
      { symbol: 'AAPL', name: 'Apple', sector: 'Information Technology', qty: 10, currentValueCents: 150_000 },
      { symbol: 'XLE', name: 'Energy ETF', sector: null, qty: 3, currentValueCents: 60_000 },
    ];
    const input = { holdings, cashCents: 12_345, scenario: crisis } as const;
    expect(simulate(input)).toEqual(simulate(input));
  });
});

describe('simulate — broad-market fallback for null sectors', () => {
  it('applies broadMarketShock to a null-sector STOCK and sets usedBroadMarket', () => {
    const holdings: LabHolding[] = [
      { symbol: 'MYSTERY', name: 'Unclassified Co', sector: null, qty: 1, currentValueCents: 100_000 },
    ];
    const result = simulate({ holdings, cashCents: 0, scenario: crisis });
    const h = result.holdings[0];
    expect(h.usedBroadMarket).toBe(true);
    expect(h.shock).toBe(crisis.broadMarketShock); // -0.30
    expect(h.simulatedValueCents).toBe(70_000);
  });

  it('applies broadMarketShock to a null-sector ETF and sets usedBroadMarket', () => {
    const holdings: LabHolding[] = [
      { symbol: 'VTI', name: 'Total Market ETF', sector: null, qty: 2, currentValueCents: 200_000 },
    ];
    const result = simulate({ holdings, cashCents: 0, scenario: crisis });
    const h = result.holdings[0];
    expect(h.usedBroadMarket).toBe(true);
    expect(h.shock).toBe(crisis.broadMarketShock);
    expect(h.simulatedValueCents).toBe(140_000);
  });

  it('uses the sector shock (not broad market) when the sector is known', () => {
    const holdings: LabHolding[] = [
      { symbol: 'JPM', name: 'JPMorgan', sector: 'Financials', qty: 1, currentValueCents: 100_000 },
    ];
    const result = simulate({ holdings, cashCents: 0, scenario: crisis });
    const h = result.holdings[0];
    expect(h.usedBroadMarket).toBe(false);
    expect(h.shock).toBe(-0.55);
  });
});

describe('simulate — zero/negative clamp', () => {
  it('floors a simulated holding value at 0 cents', () => {
    // A hand-built scenario with a shock below -100% must never go negative.
    const wipeout = { ...crisis, sectorShocks: { ...crisis.sectorShocks, Financials: -1.5 } };
    const holdings: LabHolding[] = [
      { symbol: 'JPM', name: 'JPMorgan', sector: 'Financials', qty: 1, currentValueCents: 100_000 },
    ];
    const result = simulate({ holdings, cashCents: 0, scenario: wipeout });
    expect(result.holdings[0].simulatedValueCents).toBe(0);
    expect(result.holdings[0].changeCents).toBe(-100_000);
  });

  it('leaves a zero-value holding at 0', () => {
    const holdings: LabHolding[] = [
      { symbol: 'ZERO', name: 'No Quote Co', sector: 'Energy', qty: 5, currentValueCents: 0 },
    ];
    const result = simulate({ holdings, cashCents: 0, scenario: crisis });
    expect(result.holdings[0].simulatedValueCents).toBe(0);
    expect(result.holdings[0].changeBasisPoints).toBeNull();
  });
});

describe('simulate — COVID recovery phase', () => {
  const holdings: LabHolding[] = [
    { symbol: 'AAPL', name: 'Apple', sector: 'Information Technology', qty: 1, currentValueCents: 100_000 },
  ];

  it('applies the recovery table independently of the crash', () => {
    const recovery = simulate({ holdings, cashCents: 0, scenario: covid, phase: 'recovery' });
    const h = recovery.holdings[0];
    // Recovery IT shock +0.55 on the CURRENT value, not composed on the crash.
    expect(recovery.phase).toBe('recovery');
    expect(h.shock).toBe(0.55);
    expect(h.simulatedValueCents).toBe(155_000);
  });

  it('uses the base crash table for the default phase', () => {
    const shock = simulate({ holdings, cashCents: 0, scenario: covid });
    const h = shock.holdings[0];
    expect(shock.phase).toBe('shock');
    expect(h.shock).toBe(-0.08);
    expect(h.simulatedValueCents).toBe(92_000);
  });

  it('falls back to the base table when a scenario has no recovery phase', () => {
    const recovery = simulate({ holdings, cashCents: 0, scenario: crisis, phase: 'recovery' });
    expect(recovery.phase).toBe('shock');
    expect(recovery.holdings[0].shock).toBe(crisis.sectorShocks['Information Technology']);
  });
});
