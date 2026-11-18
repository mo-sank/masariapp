/**
 * The pure stress-simulation engine (FR-13–FR-19).
 *
 * `simulate(input)` applies a scenario's shock table to a portfolio's holdings
 * and returns the simulated result. It is the core invariant owner: it holds
 * NO React or Supabase imports and uses NO randomness, so the same input always
 * produces the same output (FR-17 determinism). All money math is integer cents
 * via `src/lib/money.ts`.
 *
 * Per holding:
 *   shock               = scenario.sectorShocks[sector] ?? scenario.broadMarketShock
 *   simulatedValueCents = max(0, currentValueCents + round(currentValueCents * shock))
 *   changeBasisPoints   = pctChange(simulatedValueCents, currentValueCents)
 *
 * The delta is rounded (not the product) so a zero shock is exactly identity
 * and a cash-only portfolio is stable. A holding's simulated value is clamped
 * at a floor of 0 cents: a position cannot go below zero (a shock below −100%
 * would otherwise produce a negative value).
 *
 * Cash is a pass-through term and is never shocked (FR-15).
 *
 * Phase: when `phase === 'recovery'` and the scenario carries a `recovery`
 * table, that table is used instead of the base table; the recovery is an
 * independent shock on the current holdings, not composed on the crash. A
 * scenario with no recovery table falls back to its base table for any phase.
 */
import { pctChange } from '../../../lib/money';

import type { ShockTable } from '../scenarios/scenarios';
import type {
  LabHolding,
  SimulatedHolding,
  SimulationInput,
  SimulationResult,
} from './types';

/** Resolve the shock table for the requested phase. */
function tableForPhase(input: SimulationInput): ShockTable {
  if (input.phase === 'recovery' && input.scenario.recovery) {
    return input.scenario.recovery;
  }
  return input.scenario;
}

/** Apply a shock table to a single holding. */
function simulateHolding(holding: LabHolding, table: ShockTable): SimulatedHolding {
  // Look the sector up by string; an unknown or null sector uses broad market.
  const sectorShocks: Record<string, number> = table.sectorShocks;
  const sectorShock = holding.sector === null ? undefined : sectorShocks[holding.sector];
  const usedBroadMarket = sectorShock === undefined;
  const shock = usedBroadMarket ? table.broadMarketShock : sectorShock;

  // Round the delta (not the product) so a zero shock is exact identity, then
  // clamp at 0 cents — a position cannot be worth less than nothing.
  const delta = Math.round(holding.currentValueCents * shock);
  const simulatedValueCents = Math.max(0, holding.currentValueCents + delta);
  const changeCents = simulatedValueCents - holding.currentValueCents;

  return {
    ...holding,
    shock,
    usedBroadMarket,
    simulatedValueCents,
    changeCents,
    changeBasisPoints: pctChange(simulatedValueCents, holding.currentValueCents),
  };
}

/**
 * Run a scenario against a portfolio. Pure and deterministic. Returns the
 * per-holding breakdown plus portfolio-level totals, all in integer cents.
 */
export function simulate(input: SimulationInput): SimulationResult {
  const table = tableForPhase(input);
  const phase = input.phase === 'recovery' && input.scenario.recovery ? 'recovery' : 'shock';

  const holdings = input.holdings.map((h) => simulateHolding(h, table));

  const startingValueCents =
    holdings.reduce((sum, h) => sum + h.currentValueCents, 0) + input.cashCents;
  const simulatedValueCents =
    holdings.reduce((sum, h) => sum + h.simulatedValueCents, 0) + input.cashCents;

  return {
    startingValueCents,
    simulatedValueCents,
    changeCents: simulatedValueCents - startingValueCents,
    changeBasisPoints: pctChange(simulatedValueCents, startingValueCents),
    holdings,
    cashCents: input.cashCents,
    phase,
  };
}
