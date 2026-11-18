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

/* -------------------------------------------------------------------------- */
/* Phase 2: prediction / reflection / challenge-progress RPC returns (FEAT-004) */
/* -------------------------------------------------------------------------- */

/**
 * The server-computed `accuracy` jsonb attached to a saved prediction. Shapes
 * mirror `save_prediction` (FEAT-001): direction correctness, the actual
 * outcome, the estimate error (null when either side is missing), and whether
 * the best/worst symbol picks matched.
 */
export const predictionAccuracySchema = z.object({
  direction_correct: z.boolean(),
  actual_direction: z.string(),
  actual_change_bp: z.number().int().nullable(),
  estimate_error_bp: z.number().int().nullable(),
  best_correct: z.boolean(),
  worst_correct: z.boolean(),
  actual_best: z.string().nullable(),
  actual_worst: z.string().nullable(),
});

/** The validated `stress_predictions` row returned by `save_prediction`. */
export const stressPredictionSchema = z.object({
  id: z.string(),
  simulation_id: z.string(),
  user_id: z.string(),
  direction: z.string(),
  estimated_change_bp: z.number().int().nullable(),
  picked_best: z.string().nullable(),
  picked_worst: z.string().nullable(),
  /** Server-computed; absent only in degenerate rows, so allow null. */
  accuracy: predictionAccuracySchema.nullable(),
  created_at: z.string(),
});

/** The validated `stress_reflections` row returned by `save_reflection`. */
export const stressReflectionSchema = z.object({
  id: z.string(),
  simulation_id: z.string(),
  user_id: z.string(),
  /** Free-form responses array (clamped server-side); kept as unknown JSON. */
  responses: z.array(z.unknown()),
  created_at: z.string(),
});

/** The validated `stress_challenge_progress` row returned by the upsert RPC. */
export const stressChallengeProgressSchema = z.object({
  user_id: z.string(),
  scenario_id: z.string(),
  challenge_id: z.string(),
  status: z.string(),
  best_simulation_id: z.string().nullable(),
  attempts: z.number().int(),
  met_at: z.string().nullable(),
  updated_at: z.string(),
});

/** Server-computed prediction accuracy after validation. */
export type PredictionAccuracyPayload = z.infer<typeof predictionAccuracySchema>;
/** A fully validated prediction row. */
export type StressPrediction = z.infer<typeof stressPredictionSchema>;
/** A fully validated reflection row. */
export type StressReflection = z.infer<typeof stressReflectionSchema>;
/** A fully validated challenge-progress row. */
export type StressChallengeProgress = z.infer<typeof stressChallengeProgressSchema>;

/** Parse an untrusted `save_prediction` payload. Throws a `ZodError` on a bad shape. */
export function parseStressPrediction(input: unknown): StressPrediction {
  return stressPredictionSchema.parse(input);
}

/** Parse an untrusted `save_reflection` payload. Throws a `ZodError` on a bad shape. */
export function parseStressReflection(input: unknown): StressReflection {
  return stressReflectionSchema.parse(input);
}

/** Parse an untrusted `upsert_challenge_progress` payload. Throws on a bad shape. */
export function parseStressChallengeProgress(input: unknown): StressChallengeProgress {
  return stressChallengeProgressSchema.parse(input);
}
