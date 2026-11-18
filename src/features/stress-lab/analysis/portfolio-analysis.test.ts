import { simulate } from '../engine/simulate';
import type { LabHolding } from '../engine/types';
import { getScenario } from '../scenarios/scenarios';

import {
  UNCLASSIFIED_SECTOR,
  allocationByAsset,
  allocationBySector,
  analyzeSectorExposure,
  concentrationIndicators,
} from './portfolio-analysis';

const crisis = getScenario('crisis_2008')!;

/** A concentrated tech-heavy portfolio with one unclassified holding. */
const holdings: LabHolding[] = [
  { symbol: 'AAPL', name: 'Apple', sector: 'Information Technology', qty: 1, currentValueCents: 600_000 },
  { symbol: 'MSFT', name: 'Microsoft', sector: 'Information Technology', qty: 1, currentValueCents: 100_000 },
  { symbol: 'JPM', name: 'JPMorgan', sector: 'Financials', qty: 1, currentValueCents: 200_000 },
  { symbol: 'MYST', name: 'Unclassified Co', sector: null, qty: 1, currentValueCents: 100_000 },
];

describe('allocationByAsset', () => {
  it('computes each holding share in basis points, sorted largest first', () => {
    const alloc = allocationByAsset(holdings);
    expect(alloc.map((a) => a.symbol)).toEqual(['AAPL', 'JPM', 'MSFT', 'MYST']);
    // AAPL 600k / 1,000k total = 60% = 6000 bp.
    expect(alloc[0].basisPoints).toBe(6000);
  });

  it('returns an empty list for an empty portfolio', () => {
    expect(allocationByAsset([])).toEqual([]);
  });
});

describe('allocationBySector', () => {
  it('groups null-sector holdings under the Unclassified bucket, never dropping them', () => {
    const alloc = allocationBySector(holdings);
    const buckets = alloc.map((s) => s.sector);
    expect(buckets).toContain(UNCLASSIFIED_SECTOR);

    const unclassified = alloc.find((s) => s.sector === UNCLASSIFIED_SECTOR)!;
    expect(unclassified.valueCents).toBe(100_000);
    expect(unclassified.holdingCount).toBe(1);

    // Buckets sum to the whole portfolio (1,000,000 cents).
    const total = alloc.reduce((sum, s) => sum + s.valueCents, 0);
    expect(total).toBe(1_000_000);

    // IT aggregates AAPL + MSFT.
    const it = alloc.find((s) => s.sector === 'Information Technology')!;
    expect(it.valueCents).toBe(700_000);
    expect(it.holdingCount).toBe(2);
  });
});

describe('concentrationIndicators', () => {
  it('flags over-concentration and names the dominant sector', () => {
    const c = concentrationIndicators(holdings);
    expect(c.isOverConcentrated).toBe(true);
    expect(c.largestSectorName).toBe('Information Technology');
    expect(c.largestSectorBasisPoints).toBe(7000); // 70%
    expect(c.distinctSectorCount).toBe(3); // IT, Financials, Unclassified
    expect(c.summary).toContain('Information Technology');
  });

  it('does not flag a well-diversified portfolio', () => {
    const diversified: LabHolding[] = [
      { symbol: 'A', name: 'A', sector: 'Energy', qty: 1, currentValueCents: 100_000 },
      { symbol: 'B', name: 'B', sector: 'Utilities', qty: 1, currentValueCents: 100_000 },
      { symbol: 'C', name: 'C', sector: 'Health Care', qty: 1, currentValueCents: 100_000 },
      { symbol: 'D', name: 'D', sector: 'Industrials', qty: 1, currentValueCents: 100_000 },
    ];
    const c = concentrationIndicators(diversified);
    expect(c.isOverConcentrated).toBe(false);
    expect(c.distinctSectorCount).toBe(4);
  });

  it('handles the empty portfolio', () => {
    const c = concentrationIndicators([]);
    expect(c.isOverConcentrated).toBe(false);
    expect(c.largestHoldingSymbol).toBeNull();
    expect(c.distinctSectorCount).toBe(0);
  });
});

describe('analyzeSectorExposure', () => {
  const result = simulate({ holdings, cashCents: 0, scenario: crisis });

  it('ranks greatest exposure and finds best/worst sectors by percent change', () => {
    const analysis = analyzeSectorExposure(result);

    // Greatest exposure is IT (700k of 1,000k).
    expect(analysis.greatestExposureSector?.sector).toBe('Information Technology');

    // Under 2008: IT -0.35, Financials -0.55, Unclassified broad -0.30.
    // Best (least negative) is the Unclassified bucket; worst is Financials.
    expect(analysis.worstSector?.sector).toBe('Financials');
    expect(analysis.bestSector?.sector).toBe(UNCLASSIFIED_SECTOR);
  });

  it('includes the Unclassified bucket in the sector exposure list', () => {
    const analysis = analyzeSectorExposure(result);
    expect(analysis.sectors.map((s) => s.sector)).toContain(UNCLASSIFIED_SECTOR);
  });
});
