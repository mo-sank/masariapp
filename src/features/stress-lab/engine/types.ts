/**
 * Types for the pure stress-simulation engine (design.md "The pure engine").
 *
 * These describe the engine's input and output shapes only. All money is
 * integer cents; `shock` and `changeBasisPoints` are the sole non-cents numeric
 * fields (a decimal fraction and basis points respectively).
 */
import type { ScenarioDefinition } from '../scenarios/scenarios';

/** Which shock table a run applies: the base crash or the recovery table. */
export type SimulationPhase = 'shock' | 'recovery';

/**
 * One holding fed to the engine, valued at its current price. `sector` is null
 * when the instrument has no GICS classification (the engine then uses the
 * scenario's broad-market shock).
 */
export interface LabHolding {
  /** Ticker symbol. */
  symbol: string;
  /** Company / instrument name. */
  name: string;
  /** GICS sector, or null when unclassified. */
  sector: string | null;
  /** Number of shares held. */
  qty: number;
  /** Current market value in cents (`qty * currentPriceCents`). */
  currentValueCents: number;
}

/** A holding after the scenario shock has been applied. */
export interface SimulatedHolding extends LabHolding {
  /** The decimal-fraction shock applied to this holding. */
  shock: number;
  /** True when the shock came from `broadMarketShock` (sector null/absent). */
  usedBroadMarket: boolean;
  /** Simulated value in cents, floored at 0. */
  simulatedValueCents: number;
  /** Simulated value minus current value, in cents. */
  changeCents: number;
  /** Percent change in basis points, or null when current value is 0. */
  changeBasisPoints: number | null;
}

/** The input to `simulate`. */
export interface SimulationInput {
  /** The holdings to shock. */
  holdings: LabHolding[];
  /** Uninvested cash in cents; a pass-through term, never shocked. */
  cashCents: number;
  /** The scenario whose shock table is applied. */
  scenario: ScenarioDefinition;
  /** Which phase to run; defaults to 'shock'. */
  phase?: SimulationPhase;
}

/** The deterministic output of `simulate`. */
export interface SimulationResult {
  /** sum(currentValueCents) + cashCents. */
  startingValueCents: number;
  /** sum(simulatedValueCents) + cashCents. */
  simulatedValueCents: number;
  /** simulatedValueCents - startingValueCents. */
  changeCents: number;
  /** Percent change in basis points, or null when starting value is 0. */
  changeBasisPoints: number | null;
  /** The per-holding breakdown, in input order. */
  holdings: SimulatedHolding[];
  /** The unchanged cash pass-through, in cents. */
  cashCents: number;
  /** Which phase was run. */
  phase: SimulationPhase;
}
