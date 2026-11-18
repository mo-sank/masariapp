/**
 * Map a persisted simulation row (snake_case, server-authoritative) into the
 * engine's camelCase result types (FEAT-002) so the analysis helpers
 * (sector exposure, observations) and the chart/table components can consume
 * the stored record without re-running `simulate()`.
 *
 * The server is authoritative on the numbers: the `record_simulation` RPC
 * computed `asset_results` and the totals when the snapshot was taken, so the
 * dashboard renders exactly what was persisted rather than recomputing it from
 * live prices (which would drift after later trades). This module only renames
 * fields — it never does money math.
 */
import type { SimulatedHolding, SimulationPhase, SimulationResult } from '../engine/types';

import type { StressSimulation } from './rpc-schemas';

/** A phase string from the DB is narrowed to the engine's union. */
function toPhase(phase: string): SimulationPhase {
  return phase === 'recovery' ? 'recovery' : 'shock';
}

/** Map one persisted `asset_results` element to a {@link SimulatedHolding}. */
function toSimulatedHolding(row: StressSimulation['asset_results'][number]): SimulatedHolding {
  return {
    symbol: row.symbol,
    name: row.name,
    sector: row.sector,
    qty: row.qty,
    currentValueCents: row.original_value_cents,
    shock: row.shock,
    usedBroadMarket: row.used_broad_market,
    simulatedValueCents: row.simulated_value_cents,
    changeCents: row.simulated_change_cents,
    changeBasisPoints: row.simulated_change_bp,
  };
}

/**
 * Build a {@link SimulationResult} from a validated simulation row. The result
 * drives the analysis helpers and the results dashboard; every figure is the
 * server-persisted value.
 */
export function simulationResultFromRow(row: StressSimulation): SimulationResult {
  return {
    startingValueCents: row.starting_value_cents,
    simulatedValueCents: row.simulated_value_cents,
    changeCents: row.change_cents,
    changeBasisPoints: row.change_basis_points,
    holdings: row.asset_results.map(toSimulatedHolding),
    cashCents: row.cash_cents,
    phase: toPhase(row.phase),
  };
}
