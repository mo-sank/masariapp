/**
 * Stress Lab components barrel.
 *
 * One import point for the lab's presentational pieces so the thin route files
 * (app/stress-lab/*) can pull what they need without reaching into individual
 * files. Charts, badges, and the scenario/results cards are all re-exported
 * here; the pure chart-geometry and palette helpers stay internal.
 */
export { AllocationDonut, type AllocationDonutProps, type AllocationSlice } from './AllocationDonut';
export { AssetBreakdownTable, type AssetBreakdownTableProps } from './AssetBreakdownTable';
export { ChallengeTracker, type ChallengeTrackerProps } from './ChallengeTracker';
export { ComparisonDashboard, type ComparisonDashboardProps } from './ComparisonDashboard';
export { ConcentrationBar, type ConcentrationBarProps } from './ConcentrationBar';
export { HoldingsBreakdown, type HoldingsBreakdownProps } from './HoldingsBreakdown';
export { InfoTip, type InfoTipProps } from './InfoTip';
export { PortfolioOverview, type PortfolioOverviewProps } from './PortfolioOverview';
export {
  PredictionForm,
  type PredictionFormProps,
  type PredictionDraft,
} from './PredictionForm';
export { PredictionResult, type PredictionResultProps } from './PredictionResult';
export { Recommendations, type RecommendationsProps } from './Recommendations';
export {
  ReflectionForm,
  type ReflectionFormProps,
  type ReflectionQuestion,
  DEFAULT_REFLECTION_QUESTIONS,
  REFLECTION_ANSWER_MAX,
} from './ReflectionForm';
export { ResultsSummary, type ResultsSummaryProps } from './ResultsSummary';
export { RiskObservations, type RiskObservationsProps } from './RiskObservations';
export { ScenarioCard, type ScenarioCardProps } from './ScenarioCard';
export { ScenarioPreviewSheet, type ScenarioPreviewSheetProps } from './ScenarioPreviewSheet';
export { SectorExposure, type SectorExposureProps } from './SectorExposure';
export { SeverityBadge, type SeverityBadgeProps } from './SeverityBadge';
export { SimulatedBadge, type SimulatedBadgeProps } from './SimulatedBadge';
export { StartVsSimulatedChart, type StartVsSimulatedChartProps } from './StartVsSimulatedChart';
