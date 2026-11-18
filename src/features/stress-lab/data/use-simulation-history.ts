/**
 * List the caller's past simulations, newest first (FR-25).
 *
 * `stress_simulations` is RLS-scoped to the caller (no user id from the client),
 * and the `(user_id, created_at desc)` index backs this ordering. The run
 * mutation invalidates this key on success so a fresh run appears at the top.
 * Each row's jsonb columns are validated at the boundary with
 * {@link parseStressSimulation}; a malformed row throws rather than corrupting
 * the list.
 */
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../../lib/supabase';
import { parseStressSimulation, type StressSimulation } from './rpc-schemas';

/** React Query key for the caller's simulation history list. */
export const SIMULATION_HISTORY_QUERY_KEY = ['stress-lab', 'history'] as const;

/** Fetch the caller's simulations newest-first. Throws on a Supabase error. */
export async function fetchSimulationHistory(): Promise<StressSimulation[]> {
  const { data, error } = await supabase
    .from('stress_simulations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    throw error;
  }
  return (data ?? []).map(parseStressSimulation);
}

/** Query the caller's simulation history for the lab's history list. */
export function useSimulationHistory(enabled = true) {
  return useQuery({
    queryKey: SIMULATION_HISTORY_QUERY_KEY,
    queryFn: fetchSimulationHistory,
    enabled,
  });
}

/** React Query key for the caller's runs of one scenario, newest-first. */
export function scenarioHistoryQueryKey(scenarioId: string) {
  return ['stress-lab', 'history', 'scenario', scenarioId] as const;
}

/**
 * Fetch the caller's runs of one scenario, newest-first. Backed by the
 * `(user_id, scenario_id, created_at desc)` index. Used by the comparison
 * dashboard to read the latest two runs of the same scenario; each row is
 * validated at the boundary.
 */
export async function fetchSimulationsForScenario(
  scenarioId: string,
): Promise<StressSimulation[]> {
  const { data, error } = await supabase
    .from('stress_simulations')
    .select('*')
    .eq('scenario_id', scenarioId)
    .order('created_at', { ascending: false });
  if (error) {
    throw error;
  }
  return (data ?? []).map(parseStressSimulation);
}

/** Query the caller's runs of one scenario for the comparison dashboard. */
export function useSimulationsForScenario(scenarioId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: scenarioHistoryQueryKey(scenarioId ?? ''),
    queryFn: () => fetchSimulationsForScenario(scenarioId as string),
    enabled: enabled && typeof scenarioId === 'string' && scenarioId.length > 0,
  });
}
