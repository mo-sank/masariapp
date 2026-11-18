/**
 * Trust-boundary validation for the Stress Lab RPC payloads (FEAT-003).
 *
 * `record_simulation` returns a `stress_simulations` row whose `holdings_snapshot`,
 * `assumptions_snapshot`, and `asset_results` columns are untyped `jsonb`. The
 * row crosses the client trust boundary as `unknown`-shaped JSON, so we validate
 * it with zod before any screen reads it, turning a malformed payload into a
 * thrown error the data hook can surface rather than a silent `undefined` deep in
 * the results dashboard.
 *
 * Shapes mirror FEAT-001 exactly:
 *   - `holdings_snapshot[]`  { symbol, name, sector|null, qty, current_value_cents }
 *   - `asset_results[]`      { symbol, name, sector|null, qty, original_value_cents,
 *                              shock, used_broad_market, simulated_change_cents,
 *                              simulated_change_bp|null, simulated_value_cents }
 *   - plus the row-level cents totals and `change_basis_points` (null when the
 *     starting value is 0).
 *
 * Money fields are asserted to be integers (the server stores them as `bigint`
 * cents); `shock` is the only non-cents numeric (a decimal fraction).
 */
import { z } from 'zod';

/** An integer-cents money field (the DB stores these as bigint). */
const centsInt = z.number().int();

/** One element of `holdings_snapshot` — the pre-shock portfolio snapshot. */
export const holdingSnapshotSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  sector: z.string().nullable(),
  qty: z.number().int(),
  current_value_cents: centsInt,
});

/** One element of `asset_results` — the per-holding simulated outcome. */
export const assetResultSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  sector: z.string().nullable(),
  qty: z.number().int(),
  original_value_cents: centsInt,
  /** Decimal-fraction shock applied to this holding (e.g. -0.35). */
  shock: z.number(),
  used_broad_market: z.boolean(),
  simulated_change_cents: centsInt,
  /** Null when the original value was 0. */
  simulated_change_bp: z.number().int().nullable(),
  simulated_value_cents: centsInt,
});

/**
 * The validated `stress_simulations` row returned by `record_simulation`. The
 * three jsonb columns are parsed into typed arrays/records; everything else is
 * the scalar column.
 */
export const stressSimulationSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  scenario_id: z.string(),
  phase: z.string(),
  starting_value_cents: centsInt,
  simulated_value_cents: centsInt,
  change_cents: centsInt,
  /** Null when the starting value was 0. */
  change_basis_points: z.number().int().nullable(),
  cash_cents: centsInt,
  holdings_snapshot: z.array(holdingSnapshotSchema),
  assumptions_snapshot: z.unknown(),
  asset_results: z.array(assetResultSchema),
  created_at: z.string(),
});

/** A holding-snapshot element after validation. */
export type HoldingSnapshot = z.infer<typeof holdingSnapshotSchema>;
/** An asset-result element after validation. */
export type AssetResult = z.infer<typeof assetResultSchema>;
/** A fully validated simulation row. */
export type StressSimulation = z.infer<typeof stressSimulationSchema>;

/**
 * Parse an untrusted `record_simulation` payload into a typed
 * {@link StressSimulation}. Throws a `ZodError` when the shape is wrong, which
 * the data hook surfaces as a query/mutation error.
 */
export function parseStressSimulation(input: unknown): StressSimulation {
  return stressSimulationSchema.parse(input);
}
