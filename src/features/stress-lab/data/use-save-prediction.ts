/**
 * Prediction read + save for the Stress Lab (FR-33, Phase 2).
 *
 * A prediction is captured BEFORE a run (direction, a rough estimate, best/worst
 * picks) and scored server-side against the persisted result. `save_prediction`
 * is SECURITY DEFINER and unique on `simulation_id`, so a re-save updates the
 * existing row; the client passes NO user id (RLS scopes the row) and only
 * `{ p_simulation_id, p_direction, p_estimated_change_bp, p_best, p_worst }`,
 * matching the `use-place-order.ts` / `use-run-simulation.ts` convention.
 *
 * The returned row's `accuracy` jsonb is validated at the trust boundary with
 * {@link parseStressPrediction}. Known RPC error codes map to friendly teen copy
 * via {@link mapPredictionError}; on success the prediction query for this
 * simulation is invalidated so the form reloads the saved state.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { supabase } from '../../../lib/supabase';
import { parseStressPrediction, type StressPrediction } from './rpc-schemas';

/** Which way the student thinks the portfolio will move. */
export type PredictionDirectionInput = 'gain' | 'lose';

/** The arguments a prediction save collects. */
export interface SavePredictionInput {
  /** The simulation this prediction is about. */
  simulationId: string;
  /** Up or down. */
  direction: PredictionDirectionInput;
  /** Optional rough estimate of the move, in basis points. */
  estimatedChangeBp?: number | null;
  /** Optional symbol expected to perform best. */
  pickedBest?: string | null;
  /** Optional symbol expected to perform worst. */
  pickedWorst?: string | null;
}

/** React Query key for the saved prediction of one simulation. */
export function predictionQueryKey(simulationId: string) {
  return ['stress-lab', 'prediction', simulationId] as const;
}

/**
 * Parse a student-typed whole-percent estimate (e.g. "-20", "15%") into basis
 * points for `save_prediction`. Returns null for empty or unparseable input so
 * the estimate stays optional, and clamps to the server's [-10000, 10000] range
 * (±100%) so a valid prediction is never rejected as `invalid_prediction`.
 */
export function parsePredictionEstimateBp(input: string): number | null {
  const trimmed = input.trim().replace(/%$/, '');
  if (trimmed === '') {
    return null;
  }
  const percent = Number(trimmed);
  if (!Number.isFinite(percent)) {
    return null;
  }
  const bp = Math.round(percent * 100);
  return Math.max(-10000, Math.min(10000, bp));
}

/** Stable error codes `save_prediction` can raise. */
export type PredictionErrorCode = 'not_authenticated' | 'not_found' | 'invalid_prediction';

/** Friendly, teen-appropriate copy for each known prediction error code. */
const PREDICTION_ERROR_MESSAGES: Record<PredictionErrorCode, string> = {
  not_authenticated: 'Sign in to save your prediction.',
  not_found: "We couldn't find that stress test. Run it again, then make your prediction.",
  invalid_prediction: "That prediction doesn't look right. Check your estimate and try again.",
};

/** Fallback copy when the error is unrecognised. */
const PREDICTION_FALLBACK_MESSAGE = "We couldn't save your prediction. Please try again.";

/** Map a thrown prediction error to friendly UI copy. */
export function mapPredictionError(error: unknown): string {
  const code = errorCode(error);
  if (code && Object.prototype.hasOwnProperty.call(PREDICTION_ERROR_MESSAGES, code)) {
    return PREDICTION_ERROR_MESSAGES[code as PredictionErrorCode];
  }
  return PREDICTION_FALLBACK_MESSAGE;
}

/** Read the stable error code (the message) off an unknown thrown value. */
function errorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message.trim();
    }
  }
  return null;
}

/** Fetch the saved prediction for a simulation, or null when none exists. */
export async function fetchPrediction(simulationId: string): Promise<StressPrediction | null> {
  const { data, error } = await supabase
    .from('stress_predictions')
    .select('*')
    .eq('simulation_id', simulationId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data == null ? null : parseStressPrediction(data);
}

/** Query the saved prediction for a simulation so the form can reload it. */
export function usePrediction(simulationId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: predictionQueryKey(simulationId ?? ''),
    queryFn: () => fetchPrediction(simulationId as string),
    enabled: enabled && typeof simulationId === 'string' && simulationId.length > 0,
  });
}

/** Call `save_prediction` for one prediction. Returns the validated row. */
export async function savePrediction(input: SavePredictionInput): Promise<StressPrediction> {
  const { data, error } = await supabase.rpc('save_prediction', {
    p_simulation_id: input.simulationId,
    p_direction: input.direction,
    p_estimated_change_bp: input.estimatedChangeBp ?? null,
    p_best: input.pickedBest ?? null,
    p_worst: input.pickedWorst ?? null,
  });
  if (error) {
    throw error;
  }
  return parseStressPrediction(data);
}

/** Invalidate the prediction query so the form reloads the saved state. */
export function invalidateAfterPrediction(client: QueryClient, simulationId: string): void {
  void client.invalidateQueries({ queryKey: predictionQueryKey(simulationId) });
}

/**
 * Mutation that saves a prediction. On success the prediction query for the
 * simulation is invalidated and the resolved value is the scored row; on failure
 * the mutation rejects with the raw error — map it with {@link mapPredictionError}.
 */
export function useSavePrediction() {
  const client = useQueryClient();
  return useMutation<StressPrediction, Error, SavePredictionInput>({
    mutationFn: (input) => savePrediction(input),
    onSuccess: (row) => {
      invalidateAfterPrediction(client, row.simulation_id);
    },
  });
}
