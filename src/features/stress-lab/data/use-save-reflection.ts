/**
 * Reflection read + save for the Stress Lab (FR-34, Phase 2).
 *
 * After a run the student answers reflection questions ("what surprised you?",
 * "what would you change?"). `save_reflection` is SECURITY DEFINER, verifies the
 * caller owns the run, requires a non-empty jsonb array, and clamps each answer
 * server-side. The client passes NO user id (RLS scopes the row) and only
 * `{ p_simulation_id, p_responses }`.
 *
 * Reflections are NOT unique per simulation (a student can reflect more than
 * once), so the read returns the latest for a simulation to reload the form. The
 * returned row is validated with {@link parseStressReflection}; known error
 * codes map to friendly copy via {@link mapReflectionError}; on success the
 * reflection query for the simulation is invalidated.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { supabase } from '../../../lib/supabase';
import type { Json } from '../../../types/db';
import { parseStressReflection, type StressReflection } from './rpc-schemas';

/** One reflection answer: a question id/prompt and the student's answer. */
export interface ReflectionResponse {
  /** Stable id of the question being answered. */
  question: string;
  /** The student's free-text answer (clamped to 280 chars server-side). */
  answer: string;
}

/** The arguments a reflection save collects. */
export interface SaveReflectionInput {
  /** The simulation this reflection is about. */
  simulationId: string;
  /** The answered questions (must be non-empty). */
  responses: ReflectionResponse[];
}

/** React Query key for the saved reflection of one simulation. */
export function reflectionQueryKey(simulationId: string) {
  return ['stress-lab', 'reflection', simulationId] as const;
}

/** Stable error codes `save_reflection` can raise. */
export type ReflectionErrorCode = 'not_authenticated' | 'not_found' | 'invalid_reflection';

/** Friendly, teen-appropriate copy for each known reflection error code. */
const REFLECTION_ERROR_MESSAGES: Record<ReflectionErrorCode, string> = {
  not_authenticated: 'Sign in to save your reflection.',
  not_found: "We couldn't find that stress test. Run it again, then reflect on it.",
  invalid_reflection: 'Write at least one answer before saving your reflection.',
};

/** Fallback copy when the error is unrecognised. */
const REFLECTION_FALLBACK_MESSAGE = "We couldn't save your reflection. Please try again.";

/** Map a thrown reflection error to friendly UI copy. */
export function mapReflectionError(error: unknown): string {
  const code = errorCode(error);
  if (code && Object.prototype.hasOwnProperty.call(REFLECTION_ERROR_MESSAGES, code)) {
    return REFLECTION_ERROR_MESSAGES[code as ReflectionErrorCode];
  }
  return REFLECTION_FALLBACK_MESSAGE;
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

/** Fetch the latest reflection for a simulation, or null when none exists. */
export async function fetchReflection(simulationId: string): Promise<StressReflection | null> {
  const { data, error } = await supabase
    .from('stress_reflections')
    .select('*')
    .eq('simulation_id', simulationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data == null ? null : parseStressReflection(data);
}

/** Query the saved reflection for a simulation so the form can reload it. */
export function useReflection(simulationId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: reflectionQueryKey(simulationId ?? ''),
    queryFn: () => fetchReflection(simulationId as string),
    enabled: enabled && typeof simulationId === 'string' && simulationId.length > 0,
  });
}

/** Call `save_reflection` for one reflection. Returns the validated row. */
export async function saveReflection(input: SaveReflectionInput): Promise<StressReflection> {
  const { data, error } = await supabase.rpc('save_reflection', {
    p_simulation_id: input.simulationId,
    // Each ReflectionResponse is a plain {question, answer} object — JSON-safe —
    // but lacks the index signature `Json` requires, so cast at the boundary.
    p_responses: input.responses as unknown as Json,
  });
  if (error) {
    throw error;
  }
  return parseStressReflection(data);
}

/** Invalidate the reflection query so the form reloads the saved state. */
export function invalidateAfterReflection(client: QueryClient, simulationId: string): void {
  void client.invalidateQueries({ queryKey: reflectionQueryKey(simulationId) });
}

/**
 * Mutation that saves a reflection. On success the reflection query for the
 * simulation is invalidated; on failure the mutation rejects with the raw error
 * — map it with {@link mapReflectionError}.
 */
export function useSaveReflection() {
  const client = useQueryClient();
  return useMutation<StressReflection, Error, SaveReflectionInput>({
    mutationFn: (input) => saveReflection(input),
    onSuccess: (row) => {
      invalidateAfterReflection(client, row.simulation_id);
    },
  });
}
