/**
 * Stress Lab data-layer barrel.
 *
 * One import point for the React Query hooks, the RPC schemas, and the
 * row→engine mapper so the thin route files (app/stress-lab/*) pull from a
 * single place.
 */
export {
  parseStressSimulation,
  stressSimulationSchema,
  assetResultSchema,
  holdingSnapshotSchema,
  type StressSimulation,
  type AssetResult,
  type HoldingSnapshot,
} from './rpc-schemas';
export { simulationResultFromRow } from './map-simulation';
export {
  useStressPortfolio,
  STRESS_INSTRUMENTS_QUERY_KEY,
  type StressPortfolio,
} from './use-stress-portfolio';
export { useScenarios, fetchScenarios, SCENARIOS_QUERY_KEY, type LabScenario } from './use-scenarios';
export { useSimulation, fetchSimulation, simulationQueryKey } from './use-simulation';
export {
  useSimulationHistory,
  fetchSimulationHistory,
  SIMULATION_HISTORY_QUERY_KEY,
} from './use-simulation-history';
export {
  useRunSimulation,
  runSimulation,
  mapStressError,
  invalidateAfterRun,
  type RunSimulationInput,
  type RunPhase,
  type StressErrorCode,
} from './use-run-simulation';
