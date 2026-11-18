/**
 * Portfolio-analysis math for the Stress Lab (FR-3–FR-6, FR-23).
 *
 * Pure functions over lab holdings and simulation results: allocation by asset
 * and by sector, concentration/diversification indicators, and sector-exposure
 * analysis over a `SimulationResult`. No React or Supabase; percentages are in
 * basis points (integers) computed from integer-cents values, mirroring the
 * `src/lib/money.ts` discipline.
 *
 * A holding whose instrument has no GICS classification (`sector === null`) is
 * never dropped: it is grouped under an explicit "Unclassified / broad market"
 * bucket so the allocation always sums to the whole portfolio.
 */
import type { LabHolding, SimulatedHolding, SimulationResult } from '../engine/types';

/** The bucket label for holdings with no GICS sector. */
export const UNCLASSIFIED_SECTOR = 'Unclassified / broad market';

/** Allocation of one asset as a share of total holdings value. */
export interface AssetAllocation {
  symbol: string;
  name: string;
  valueCents: number;
  /** Share of total holdings value, in basis points (0–10000). */
  basisPoints: number;
}

/** Allocation of one sector as a share of total holdings value. */
export interface SectorAllocation {
  /** Sector name, or `UNCLASSIFIED_SECTOR` for null-sector holdings. */
  sector: string;
  valueCents: number;
  /** Share of total holdings value, in basis points (0–10000). */
  basisPoints: number;
  /** Number of holdings in this sector. */
  holdingCount: number;
}

/** Concentration / diversification summary for the portfolio. */
export interface ConcentrationIndicators {
  /** Largest single holding's share, in basis points (0 when no holdings). */
  largestHoldingBasisPoints: number;
  /** The largest single holding's symbol, or null when no holdings. */
  largestHoldingSymbol: string | null;
  /** Largest single sector's share, in basis points. */
  largestSectorBasisPoints: number;
  /** The largest single sector, or null when no holdings. */
  largestSectorName: string | null;
  /** Count of distinct sector buckets (incl. the Unclassified bucket). */
  distinctSectorCount: number;
  /** True when a single holding or sector dominates the portfolio. */
  isOverConcentrated: boolean;
  /** Plain-language summary of the concentration state. */
  summary: string;
}

/** Sector contribution to a simulation result. */
export interface SectorExposure {
  sector: string;
  /** Starting value of the sector's holdings, in cents. */
  startingValueCents: number;
  /** Simulated value of the sector's holdings, in cents. */
  simulatedValueCents: number;
  /** Simulated minus starting, in cents. */
  changeCents: number;
  /** Sector change in basis points, or null when starting value is 0. */
  changeBasisPoints: number | null;
  /** Share of total starting holdings value, in basis points. */
  exposureBasisPoints: number;
}

/** The result of `analyzeSectorExposure`. */
export interface SectorExposureAnalysis {
  /** One entry per sector bucket, sorted by exposure (largest first). */
  sectors: SectorExposure[];
  /** Best-performing sector by percent change, or null when none. */
  bestSector: SectorExposure | null;
  /** Worst-performing sector by percent change, or null when none. */
  worstSector: SectorExposure | null;
  /** Sector with the greatest portfolio exposure, or null when none. */
  greatestExposureSector: SectorExposure | null;
}

/** Threshold (basis points) at which a single holding/sector is over-concentrated. */
const OVER_CONCENTRATION_THRESHOLD_BP = 4000; // 40%

/** Share of `valueCents` in `totalCents` as basis points (0 when total is 0). */
function shareBasisPoints(valueCents: number, totalCents: number): number {
  if (totalCents === 0) {
    return 0;
  }
  return Math.round((valueCents * 10000) / totalCents);
}

/** The bucket a holding belongs to: its sector, or the Unclassified bucket. */
function sectorBucket(sector: string | null): string {
  return sector === null ? UNCLASSIFIED_SECTOR : sector;
}

/** Total value of the holdings, in cents (excludes cash). */
export function totalHoldingsValueCents(holdings: LabHolding[]): number {
  return holdings.reduce((sum, h) => sum + h.currentValueCents, 0);
}

/**
 * Allocation by asset as a share of total holdings value, sorted largest
 * first. An empty portfolio yields an empty list.
 */
export function allocationByAsset(holdings: LabHolding[]): AssetAllocation[] {
  const totalCents = totalHoldingsValueCents(holdings);
  return holdings
    .map((h) => ({
      symbol: h.symbol,
      name: h.name,
      valueCents: h.currentValueCents,
      basisPoints: shareBasisPoints(h.currentValueCents, totalCents),
    }))
    .sort((a, b) => b.valueCents - a.valueCents);
}

/**
 * Allocation by sector as a share of total holdings value, sorted largest
 * first. Null-sector holdings are grouped under `UNCLASSIFIED_SECTOR` and never
 * dropped.
 */
export function allocationBySector(holdings: LabHolding[]): SectorAllocation[] {
  const totalCents = totalHoldingsValueCents(holdings);
  const byBucket = new Map<string, { valueCents: number; holdingCount: number }>();
  for (const h of holdings) {
    const bucket = sectorBucket(h.sector);
    const entry = byBucket.get(bucket) ?? { valueCents: 0, holdingCount: 0 };
    entry.valueCents += h.currentValueCents;
    entry.holdingCount += 1;
    byBucket.set(bucket, entry);
  }
  return [...byBucket.entries()]
    .map(([sector, entry]) => ({
      sector,
      valueCents: entry.valueCents,
      basisPoints: shareBasisPoints(entry.valueCents, totalCents),
      holdingCount: entry.holdingCount,
    }))
    .sort((a, b) => b.valueCents - a.valueCents);
}

/** Concentration / diversification indicators for the portfolio. */
export function concentrationIndicators(holdings: LabHolding[]): ConcentrationIndicators {
  const assets = allocationByAsset(holdings);
  const sectors = allocationBySector(holdings);

  if (holdings.length === 0) {
    return {
      largestHoldingBasisPoints: 0,
      largestHoldingSymbol: null,
      largestSectorBasisPoints: 0,
      largestSectorName: null,
      distinctSectorCount: 0,
      isOverConcentrated: false,
      summary: 'No holdings yet — add positions in the brokerage to analyze concentration.',
    };
  }

  const topAsset = assets[0];
  const topSector = sectors[0];
  const isOverConcentrated =
    topAsset.basisPoints >= OVER_CONCENTRATION_THRESHOLD_BP ||
    topSector.basisPoints >= OVER_CONCENTRATION_THRESHOLD_BP;

  let summary: string;
  if (topSector.basisPoints >= OVER_CONCENTRATION_THRESHOLD_BP) {
    summary = `Highly concentrated: ${formatBp(topSector.basisPoints)} of the portfolio is in ${topSector.sector}.`;
  } else if (topAsset.basisPoints >= OVER_CONCENTRATION_THRESHOLD_BP) {
    summary = `Highly concentrated: ${formatBp(topAsset.basisPoints)} of the portfolio is in a single holding (${topAsset.symbol}).`;
  } else if (sectors.length >= 4) {
    summary = `Reasonably diversified across ${sectors.length} sectors.`;
  } else {
    summary = `Spread across ${sectors.length} sector${sectors.length === 1 ? '' : 's'}; consider broadening your exposure.`;
  }

  return {
    largestHoldingBasisPoints: topAsset.basisPoints,
    largestHoldingSymbol: topAsset.symbol,
    largestSectorBasisPoints: topSector.basisPoints,
    largestSectorName: topSector.sector,
    distinctSectorCount: sectors.length,
    isOverConcentrated,
    summary,
  };
}

/**
 * Sector-exposure analysis over a simulation result: how each sector
 * contributed, plus the best, worst, and greatest-exposure sectors. Null-sector
 * holdings group under `UNCLASSIFIED_SECTOR`.
 */
export function analyzeSectorExposure(result: SimulationResult): SectorExposureAnalysis {
  const totalStartingCents = result.holdings.reduce(
    (sum, h) => sum + h.currentValueCents,
    0,
  );
  const byBucket = new Map<string, { startingValueCents: number; simulatedValueCents: number }>();
  for (const h of result.holdings) {
    const bucket = sectorBucket(h.sector);
    const entry = byBucket.get(bucket) ?? { startingValueCents: 0, simulatedValueCents: 0 };
    entry.startingValueCents += h.currentValueCents;
    entry.simulatedValueCents += h.simulatedValueCents;
    byBucket.set(bucket, entry);
  }

  const sectors: SectorExposure[] = [...byBucket.entries()]
    .map(([sector, entry]) => ({
      sector,
      startingValueCents: entry.startingValueCents,
      simulatedValueCents: entry.simulatedValueCents,
      changeCents: entry.simulatedValueCents - entry.startingValueCents,
      changeBasisPoints: basisPointChange(entry.simulatedValueCents, entry.startingValueCents),
      exposureBasisPoints: shareBasisPoints(entry.startingValueCents, totalStartingCents),
    }))
    .sort((a, b) => b.startingValueCents - a.startingValueCents);

  return {
    sectors,
    bestSector: pickByChange(sectors, 'best'),
    worstSector: pickByChange(sectors, 'worst'),
    greatestExposureSector: sectors.length > 0 ? sectors[0] : null,
  };
}

/** Pick best/worst sector by percent change; ignores sectors with null change. */
function pickByChange(sectors: SectorExposure[], which: 'best' | 'worst'): SectorExposure | null {
  const ranked = sectors.filter((s) => s.changeBasisPoints !== null);
  if (ranked.length === 0) {
    return null;
  }
  return ranked.reduce((acc, s) => {
    const a = acc.changeBasisPoints as number;
    const b = s.changeBasisPoints as number;
    if (which === 'best') {
      return b > a ? s : acc;
    }
    return b < a ? s : acc;
  });
}

/** Percent change in basis points, or null when starting value is 0. */
function basisPointChange(simulatedCents: number, startingCents: number): number | null {
  if (startingCents === 0) {
    return null;
  }
  return Math.round(((simulatedCents - startingCents) * 10000) / startingCents);
}

/** Format basis points as a whole-percent-ish label, e.g. 7500 -> "75%". */
function formatBp(bp: number): string {
  return `${Math.round(bp / 100)}%`;
}

export type { LabHolding, SimulatedHolding, SimulationResult };
