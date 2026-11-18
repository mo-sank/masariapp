/**
 * Challenge-progress read + upsert for the Stress Lab (FR-30–FR-32, Phase 2).
 *
 * Per-scenario design challenges track whether the student has re-designed their
 * portfolio to meet an objective. `upsert_challenge_progress` is SECURITY
 * DEFINER on the composite PK (user_id, scenario_id, challenge_id): it verifies
 * the referenced simulation is owned by the caller, increments attempts, and
 * stamps `met_at` on the flip to 'met'. The client passes NO user id (RLS scopes
 * rows) and only `{ p_scenario_id, p_challenge_id, p_status, p_simulation_id }`.
 *
 * The read lists all of the caller's challenge progress rows (the tracker filters
 * by scenario). The returned row is validated with
 * {@link parseStressChallengeProgress}; known error codes map to friendly copy
 * via {@link mapChallengeError}; on success the challenge-progress list is
 * invalidated so the tracker reflects the new status.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { supabase } from '../../../lib/supabase';
import {
  parseStressChallengeProgress,
  type StressChallengeProgress,
} from './rpc-schemas';

/** The status a challenge can be in. */
export type ChallengeStatus = 'in_progress' | 'met';

/** The arguments a challenge-progress upsert collects. */
export interface ChallengeProgressInput {
  /** The scenario the challenge belongs to. */
  scenarioId: string;
  /** The challenge id (unique within the scenario). */
  challengeId: string;
  /** Whether the objective is now met or still in progress. */
  status: ChallengeStatus;
  /** The run that produced this verdict, if any (must be owned by the caller). */
  simulationId?: string | null;
}

/** React Query key for the caller's challenge-progress list. */
export const CHALLENGE_PROGRESS_QUERY_KEY = ['stress-lab', 'challenges'] as const;

/** Stable error codes `upsert_challenge_progress` can raise. */
export type ChallengeErrorCode = 'not_authenticated' | 'not_found' | 'invalid_challenge';

/** Friendly, teen-appropriate copy for each known challenge error code. */
const CHALLENGE_ERROR_MESSAGES: Record<ChallengeErrorCode, string> = {
  not_authenticated: 'Sign in to track your challenges.',
  not_found: "We couldn't match that to one of your stress tests. Run the scenario again.",
  invalid_challenge: "That challenge update doesn't look right. Please try again.",
};

/** Fallback copy when the error is unrecognised. */
const CHALLENGE_FALLBACK_MESSAGE = "We couldn't update your challenge. Please try again.";

/** Map a thrown challenge error to friendly UI copy. */
export function mapChallengeError(error: unknown): string {
  const code = errorCode(error);
  if (code && Object.prototype.hasOwnProperty.call(CHALLENGE_ERROR_MESSAGES, code)) {
    return CHALLENGE_ERROR_MESSAGES[code as ChallengeErrorCode];
  }
  return CHALLENGE_FALLBACK_MESSAGE;
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

/** Fetch all of the caller's challenge-progress rows. */
export async function fetchChallengeProgress(): Promise<StressChallengeProgress[]> {
  const { data, error } = await supabase.from('stress_challenge_progress').select('*');
  if (error) {
    throw error;
  }
  return (data ?? []).map(parseStressChallengeProgress);
}

/** Query the caller's challenge progress for the tracker. */
export function useChallengeProgress(enabled = true) {
  return useQuery({
    queryKey: CHALLENGE_PROGRESS_QUERY_KEY,
    queryFn: fetchChallengeProgress,
    enabled,
  });
}

/** Call `upsert_challenge_progress`. Returns the validated row. */
export async function upsertChallengeProgress(
  input: ChallengeProgressInput,
): Promise<StressChallengeProgress> {
  const { data, error } = await supabase.rpc('upsert_challenge_progress', {
    p_scenario_id: input.scenarioId,
    p_challenge_id: input.challengeId,
    p_status: input.status,
    p_simulation_id: input.simulationId ?? null,
  });
  if (error) {
    throw error;
  }
  return parseStressChallengeProgress(data);
}

/** Invalidate the challenge-progress list so the tracker reflects the change. */
export function invalidateAfterChallenge(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: CHALLENGE_PROGRESS_QUERY_KEY });
}

/**
 * Mutation that records challenge progress. On success the challenge-progress
 * list is invalidated; on failure the mutation rejects with the raw error — map
 * it with {@link mapChallengeError}.
 */
export function useChallengeProgressUpsert() {
  const client = useQueryClient();
  return useMutation<StressChallengeProgress, Error, ChallengeProgressInput>({
    mutationFn: (input) => upsertChallengeProgress(input),
    onSuccess: () => {
      invalidateAfterChallenge(client);
    },
  });
}
