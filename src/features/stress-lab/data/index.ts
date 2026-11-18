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
  parseStressPrediction,
  parseStressReflection,
  parseStressChallengeProgress,
  stressPredictionSchema,
  stressReflectionSchema,
  stressChallengeProgressSchema,
  predictionAccuracySchema,
  type StressSimulation,
  type AssetResult,
  type HoldingSnapshot,
  type StressPrediction,
  type StressReflection,
  type StressChallengeProgress,
  type PredictionAccuracyPayload,
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
  useSimulationsForScenario,
  fetchSimulationsForScenario,
  scenarioHistoryQueryKey,
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
export {
  useSavePrediction,
  usePrediction,
  savePrediction,
  fetchPrediction,
  mapPredictionError,
  invalidateAfterPrediction,
  predictionQueryKey,
  parsePredictionEstimateBp,
  type SavePredictionInput,
  type PredictionDirectionInput,
  type PredictionErrorCode,
} from './use-save-prediction';
export {
  useSaveReflection,
  useReflection,
  saveReflection,
  fetchReflection,
  mapReflectionError,
  invalidateAfterReflection,
  reflectionQueryKey,
  type SaveReflectionInput,
  type ReflectionResponse,
  type ReflectionErrorCode,
} from './use-save-reflection';
export {
  useChallengeProgress,
  useChallengeProgressUpsert,
  upsertChallengeProgress,
  fetchChallengeProgress,
  mapChallengeError,
  invalidateAfterChallenge,
  CHALLENGE_PROGRESS_QUERY_KEY,
  type ChallengeProgressInput,
  type ChallengeStatus,
  type ChallengeErrorCode,
} from './use-challenge-progress';
