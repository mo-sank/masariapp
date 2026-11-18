/**
 * Run-simulation mutation (FR-13–FR-19, FR-25).
 *
 * The write side of the Stress Lab. `useRunSimulation` calls the
 * `record_simulation` RPC (SECURITY DEFINER), which derives the caller from the
 * verified session, snapshots the caller's current holdings and cash, applies
 * the scenario's authoritative shock table, and inserts one `stress_simulations`
 * row — the simulation id is SERVER-generated, so the client sends NO id and no
 * idempotency key (design-review NIT-2). We pass only `{ p_scenario_id, p_phase }`,
 * matching the no-user-id RPC convention of `use-place-order.ts`.
 *
 * The returned row's untyped jsonb columns are validated with
 * {@link parseStressSimulation} at the trust boundary before the resolved value
 * is handed back to the screen (used to navigate to the results dashboard). On
 * success the history list and the new row's single-simulation query are
 * invalidated so both readers refresh.
 *
 * The RPC raises Postgres exceptions whose message is a stable error code, which
 * {@link mapStressError} turns into friendly, teen-appropriate copy. The pure
 * `runSimulation` caller and `mapStressError` are exported so both can be unit
 * tested without React or the real client.
 */
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { supabase } from '../../../lib/supabase';
import { parseStressSimulation, type StressSimulation } from './rpc-schemas';
import { simulationQueryKey } from './use-simulation';
import {
  SIMULATION_HISTORY_QUERY_KEY,
  scenarioHistoryQueryKey,
} from './use-simulation-history';

/** Which phase of a scenario to run; 'recovery' is meaningful only for COVID-19. */
export type RunPhase = 'shock' | 'recovery';

/** The arguments a run collects. */
export interface RunSimulationInput {
  /** Scenario id, e.g. "crisis_2008". */
  scenarioId: string;
  /** Phase to run; defaults to 'shock'. */
  phase?: RunPhase;
}

/**
 * Stable error codes `record_simulation` can raise (as the error message).
 * Mirrors the codes documented in the RPC migration (FEAT-001). The empty-
 * portfolio and not-signed-in cases are guarded by the screen, but we map them
 * too so the UI never shows a raw code.
 */
export type StressErrorCode =
  | 'not_authenticated'
  | 'no_account'
  | 'unknown_scenario'
  | 'scenario_inactive'
  | 'invalid_phase';

/** Friendly, teen-appropriate copy for each known run error code. */
const STRESS_ERROR_MESSAGES: Record<StressErrorCode, string> = {
  not_authenticated: 'Sign in to run a stress test.',
  no_account: "We couldn't find your paper portfolio. Make a trade first, then try again.",
  unknown_scenario: "We couldn't find that scenario. Pick another one and try again.",
  scenario_inactive: "That scenario isn't available right now. Try a different one.",
  invalid_phase: "That test phase isn't available. Try running the scenario again.",
};

/** Fallback copy when the error is unrecognised (e.g. network/unknown). */
const STRESS_FALLBACK_MESSAGE = "We couldn't run your stress test. Please try again.";

/**
 * Map a thrown run error to friendly UI copy. The RPC raises Postgres
 * exceptions whose message is the stable error code, which PostgREST passes
 * through as the error's `message`; anything unrecognised gets the generic
 * fallback so the UI never shows a raw error string.
 */
export function mapStressError(error: unknown): string {
  const code = stressErrorCode(error);
  if (code && isStressErrorCode(code)) {
    return STRESS_ERROR_MESSAGES[code];
  }
  return STRESS_FALLBACK_MESSAGE;
}

/** Narrow an arbitrary string to a known {@link StressErrorCode}. */
function isStressErrorCode(code: string): code is StressErrorCode {
  return Object.prototype.hasOwnProperty.call(STRESS_ERROR_MESSAGES, code);
}

/** Read the error code (the message) off an unknown thrown value, if present. */
function stressErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message.trim();
    }
  }
  return null;
}

/**
 * Call `record_simulation` for one run. Returns the validated, persisted row.
 * Throws the raw Supabase error (or a zod error for a malformed payload) so the
 * caller can map it with {@link mapStressError}.
 */
export async function runSimulation(input: RunSimulationInput): Promise<StressSimulation> {
  const { data, error } = await supabase.rpc('record_simulation', {
    p_scenario_id: input.scenarioId,
    p_phase: input.phase ?? 'shock',
  });
  if (error) {
    throw error;
  }
  return parseStressSimulation(data);
}

/**
 * Invalidate the readers a new simulation affects: the full history list, the
 * new row's single-simulation query (so the dashboard re-reads if it is already
 * mounted), and — when the scenario is known — the per-scenario history the
 * comparison dashboard reads so a fresh run becomes the new "updated" side.
 */
export function invalidateAfterRun(
  client: QueryClient,
  simulationId: string,
  scenarioId?: string,
): void {
  void client.invalidateQueries({ queryKey: SIMULATION_HISTORY_QUERY_KEY });
  void client.invalidateQueries({ queryKey: simulationQueryKey(simulationId) });
  if (scenarioId) {
    void client.invalidateQueries({ queryKey: scenarioHistoryQueryKey(scenarioId) });
  }
}

/**
 * Mutation that runs a stress test. `mutate(input)` / `mutateAsync(input)`; on
 * success the history and single-simulation queries are invalidated and the
 * resolved value is the persisted row (used to navigate to the results
 * dashboard). On failure the mutation rejects with the raw error — map it for
 * the UI with {@link mapStressError}.
 */
export function useRunSimulation() {
  const client = useQueryClient();
  return useMutation<StressSimulation, Error, RunSimulationInput>({
    mutationFn: (input) => runSimulation(input),
    onSuccess: (row) => {
      invalidateAfterRun(client, row.id, row.scenario_id);
    },
  });
}
