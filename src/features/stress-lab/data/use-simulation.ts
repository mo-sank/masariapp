/**
 * Read one persisted simulation by id (FR-20–FR-24).
 *
 * The results dashboard route (`app/stress-lab/results/[simulationId].tsx`)
 * reads the simulation the run mutation created. `stress_simulations` is
 * RLS-scoped to the caller, so no user id is passed; a row the caller does not
 * own (or an unknown id) simply returns no row and the screen shows its empty
 * state. The untyped jsonb columns are validated with {@link parseStressSimulation}
 * at the trust boundary before any component reads them.
 */
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../../lib/supabase';
import { parseStressSimulation, type StressSimulation } from './rpc-schemas';

/** React Query key for a single simulation by id. */
export function simulationQueryKey(simulationId: string) {
  return ['stress-lab', 'simulation', simulationId] as const;
}

/** Fetch one simulation by id, or null when the caller has no such row. */
export async function fetchSimulation(simulationId: string): Promise<StressSimulation | null> {
  const { data, error } = await supabase
    .from('stress_simulations')
    .select('*')
    .eq('id', simulationId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (data == null) {
    return null;
  }
  return parseStressSimulation(data);
}

/** Query a single simulation by id for the results dashboard. */
export function useSimulation(simulationId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: simulationQueryKey(simulationId ?? ''),
    queryFn: () => fetchSimulation(simulationId as string),
    enabled: enabled && typeof simulationId === 'string' && simulationId.length > 0,
  });
}
