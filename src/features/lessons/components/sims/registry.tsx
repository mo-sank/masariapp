/**
 * SimRegistry (requirement 4.6).
 *
 * Maps a `simId` to the lab component that implements it. `SimStep` renders a
 * sim step by looking the lab up here, so adding a lab is a one-line change (a
 * new entry) with no change to SimStep or the player — mirroring the step
 * registry one level up.
 *
 * Design reference: `.kiro/specs/lesson-engine/design.md` ("components/sims/*:
 * OwnershipSplit, Auction, PnlReplay, OpeningBell. A SimRegistry maps simId to
 * component").
 *
 * All four labs are now implemented: `ownership_split` and `auction` (task 8),
 * `pnl_replay` and `opening_bell` (task 9). {@link getSimComponent} still
 * returns `undefined` for any `simId` with no entry, so SimStep degrades
 * gracefully (a labelled "not available yet" state) rather than crashing the
 * player if content ever references an unregistered lab.
 */

import { Auction } from './Auction';
import { OpeningBell } from './OpeningBell';
import { OwnershipSplit } from './OwnershipSplit';
import { PnlReplay } from './PnlReplay';
import type { SimComponent } from './types';
import type { SimId } from '../../schema';

/**
 * The `simId` -> lab component map. A `Partial` record so a `simId` with no
 * entry is handled by the lookup below rather than being a type error, keeping
 * the player resilient to content that references an unregistered lab. Every
 * `SimId` in the schema now has an entry.
 */
export const SIM_REGISTRY: Partial<Record<SimId, SimComponent>> = {
  ownership_split: OwnershipSplit,
  auction: Auction,
  pnl_replay: PnlReplay,
  opening_bell: OpeningBell,
};

/**
 * Resolve the lab component for a `simId`, or `undefined` if no lab is
 * registered for it yet. Exported so SimStep (and tests) can look up a lab
 * without reaching into the map directly.
 */
export function getSimComponent(simId: SimId): SimComponent | undefined {
  return SIM_REGISTRY[simId];
}
