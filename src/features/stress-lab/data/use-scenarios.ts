/**
 * Scenario catalog read for the Stress Lab (FR-10–FR-12).
 *
 * `stress_scenarios` is a shared reference table (RLS: readable by every
 * signed-in user, no user id from the client), so this follows the Explore
 * catalog pattern: a plain async fetch plus a thin `useQuery` wrapper. Only
 * active scenarios are read, ordered by `sort_order` for a stable card list.
 *
 * The row stores the display copy in snake_case plus the shock tables in an
 * `assumptions` jsonb; the card/preview UI needs only the copy and severity, so
 * this hook maps each row into a camelCase {@link LabScenario} and leaves the
 * numeric shock tables (used server-side and in the FEAT-002 engine mirror) out
 * of the view model.
 */
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../../lib/supabase';
import type { Database } from '../../../types/db';
import type { ScenarioSeverity } from '../scenarios/scenarios';

type ScenarioRow = Database['public']['Tables']['stress_scenarios']['Row'];

/** React Query key for the active-scenario list. */
export const SCENARIOS_QUERY_KEY = ['stress-lab', 'scenarios'] as const;

/** A scenario as the cards and preview sheet consume it (display copy only). */
export interface LabScenario {
  id: string;
  name: string;
  description: string;
  cause: string;
  conditions: string;
  expectedImpacts: string;
  learningObjective: string;
  severity: ScenarioSeverity;
  sortOrder: number;
  /** True when the scenario carries a recovery phase (COVID-19). */
  hasRecovery: boolean;
}

/** The known severities; an unexpected value falls back to the mildest. */
const SEVERITIES: readonly ScenarioSeverity[] = ['low', 'medium', 'high', 'severe'];

/** Narrow the DB `severity` text to a {@link ScenarioSeverity}. */
function toSeverity(value: string): ScenarioSeverity {
  return (SEVERITIES as readonly string[]).includes(value) ? (value as ScenarioSeverity) : 'low';
}

/** Does the row's assumptions jsonb carry a recovery table? */
function hasRecovery(assumptions: ScenarioRow['assumptions']): boolean {
  return (
    typeof assumptions === 'object' &&
    assumptions !== null &&
    !Array.isArray(assumptions) &&
    'recovery' in assumptions
  );
}

/** The scenario columns the card/preview list actually reads. */
type ScenarioSelection = Pick<
  ScenarioRow,
  | 'id'
  | 'name'
  | 'description'
  | 'cause'
  | 'conditions'
  | 'expected_impacts'
  | 'learning_objective'
  | 'severity'
  | 'sort_order'
  | 'assumptions'
>;

/** Map a scenario row to the display view model. */
function toLabScenario(row: ScenarioSelection): LabScenario {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    cause: row.cause,
    conditions: row.conditions,
    expectedImpacts: row.expected_impacts,
    learningObjective: row.learning_objective,
    severity: toSeverity(row.severity),
    sortOrder: row.sort_order,
    hasRecovery: hasRecovery(row.assumptions),
  };
}

/** Fetch the active scenarios, ordered for display. Throws on a Supabase error. */
export async function fetchScenarios(): Promise<LabScenario[]> {
  const { data, error } = await supabase
    .from('stress_scenarios')
    .select(
      'id, name, description, cause, conditions, expected_impacts, learning_objective, severity, sort_order, assumptions',
    )
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []).map(toLabScenario);
}

/** Query the active-scenario catalog for the Stress Lab card list. */
export function useScenarios(enabled = true) {
  return useQuery({
    queryKey: SCENARIOS_QUERY_KEY,
    queryFn: fetchScenarios,
    enabled,
  });
}
