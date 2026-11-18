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
export { ConcentrationBar, type ConcentrationBarProps } from './ConcentrationBar';
export { HoldingsBreakdown, type HoldingsBreakdownProps } from './HoldingsBreakdown';
export { InfoTip, type InfoTipProps } from './InfoTip';
export { PortfolioOverview, type PortfolioOverviewProps } from './PortfolioOverview';
export { ResultsSummary, type ResultsSummaryProps } from './ResultsSummary';
export { RiskObservations, type RiskObservationsProps } from './RiskObservations';
export { ScenarioCard, type ScenarioCardProps } from './ScenarioCard';
export { ScenarioPreviewSheet, type ScenarioPreviewSheetProps } from './ScenarioPreviewSheet';
export { SectorExposure, type SectorExposureProps } from './SectorExposure';
export { SeverityBadge, type SeverityBadgeProps } from './SeverityBadge';
export { SimulatedBadge, type SimulatedBadgeProps } from './SimulatedBadge';
export { StartVsSimulatedChart, type StartVsSimulatedChartProps } from './StartVsSimulatedChart';
