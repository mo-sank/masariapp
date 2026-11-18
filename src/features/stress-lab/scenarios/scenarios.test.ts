import { simulate } from '../engine/simulate';
import type { LabHolding } from '../engine/types';

import { SCENARIOS, SEEDED_SECTORS, getScenario, type ScenarioDefinition } from './scenarios';

/** Sorted copy of the canonical sector list for set comparison. */
const sortedSeededSectors = [...SEEDED_SECTORS].sort();

function sortedKeys(record: Record<string, number>): string[] {
  return Object.keys(record).sort();
}

describe('scenario coverage', () => {
  it('ships exactly 5 scenarios with unique ids in sort order', () => {
    expect(SCENARIOS).toHaveLength(5);
    expect(SCENARIOS.map((s) => s.id)).toEqual([
      'crisis_2008',
      'covid_2020',
      'high_inflation',
      'rising_rates',
      'recession',
    ]);
    expect(SCENARIOS.map((s) => s.sortOrder)).toEqual([1, 2, 3, 4, 5]);
  });

  it.each(SCENARIOS.map((s) => [s.id, s] as const))(
    '%s covers every seeded sector and a broad-market shock',
    (_id, scenario: ScenarioDefinition) => {
      expect(sortedKeys(scenario.sectorShocks)).toEqual(sortedSeededSectors);
      expect(typeof scenario.broadMarketShock).toBe('number');
    },
  );

  it('only covid_2020 carries a recovery table, and it covers every seeded sector', () => {
    for (const scenario of SCENARIOS) {
      if (scenario.id === 'covid_2020') {
        expect(scenario.recovery).toBeDefined();
        expect(sortedKeys(scenario.recovery!.sectorShocks)).toEqual(sortedSeededSectors);
        expect(typeof scenario.recovery!.broadMarketShock).toBe('number');
      } else {
        expect(scenario.recovery).toBeUndefined();
      }
    }
  });

  it('exposes getScenario lookup by id', () => {
    expect(getScenario('crisis_2008')?.name).toBe('The 2008 Financial Crisis');
    expect(getScenario('nope')).toBeUndefined();
  });
});

describe('design.md AC-4 worked example', () => {
  const crisis = getScenario('crisis_2008')!;
  const holdings: LabHolding[] = [
    { symbol: 'AAPL', name: 'Apple', sector: 'Information Technology', qty: 10, currentValueCents: 150_000 },
    { symbol: 'JPM', name: 'JPMorgan', sector: 'Financials', qty: 5, currentValueCents: 100_000 },
  ];

  it('reproduces simulatedValueCents 192500 and changeBasisPoints -3583', () => {
    const result = simulate({ holdings, cashCents: 50_000, scenario: crisis });

    expect(result.startingValueCents).toBe(300_000);
    expect(result.simulatedValueCents).toBe(192_500);
    expect(result.changeCents).toBe(-107_500);
    expect(result.changeBasisPoints).toBe(-3583);

    const aapl = result.holdings.find((h) => h.symbol === 'AAPL')!;
    expect(aapl.simulatedValueCents).toBe(97_500);
    expect(aapl.changeCents).toBe(-52_500);

    const jpm = result.holdings.find((h) => h.symbol === 'JPM')!;
    expect(jpm.simulatedValueCents).toBe(45_000);
    expect(jpm.changeCents).toBe(-55_000);
  });
});
