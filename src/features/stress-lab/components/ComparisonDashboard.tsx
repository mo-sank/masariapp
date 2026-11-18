/**
 * ComparisonDashboard (FR-35–FR-37, Phase 2).
 *
 * After the student re-designs their portfolio in the brokerage and re-runs the
 * SAME scenario, this compares the earlier run (the "original") against the
 * latest run (the "updated"): starting portfolio value, simulated ending value,
 * and simulated performance, with the $ and % differences between the two runs,
 * plus how sector exposure and concentration changed.
 *
 * Both sides come from PERSISTED simulation snapshots (FEAT-001), so prior runs
 * are never overwritten — the comparison reads two immutable records. The route
 * supplies the two rows (latest two for the scenario); this component only maps
 * and renders. Marked SIMULATED throughout. Purely presentational.
 */
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '../../../components/ui';
import { formatCents, formatPercent, formatSignedCents } from '../../../lib/money';
import { useTheme } from '../../../theme/theme-provider';
import { concentrationIndicators } from '../analysis/portfolio-analysis';
import { simulationResultFromRow } from '../data/map-simulation';
import type { StressSimulation } from '../data/rpc-schemas';
import { SimulatedBadge } from './SimulatedBadge';

export interface ComparisonDashboardProps {
  /** The earlier run of the scenario (the baseline portfolio). */
  original: StressSimulation;
  /** The latest run of the same scenario (the re-designed portfolio). */
  updated: StressSimulation;
  /** The scenario name, for the heading. */
  scenarioName: string;
}

export function ComparisonDashboard({ original, updated, scenarioName }: ComparisonDashboardProps) {
  const theme = useTheme();

  const originalResult = simulationResultFromRow(original);
  const updatedResult = simulationResultFromRow(updated);

  // Differences between the two runs (updated minus original), in cents / bp.
  const startingDeltaCents = updated.starting_value_cents - original.starting_value_cents;
  const simulatedDeltaCents = updated.simulated_value_cents - original.simulated_value_cents;
  // Change in the simulated performance itself (how much better/worse the mix held up).
  const performanceDeltaBp =
    (updated.change_basis_points ?? 0) - (original.change_basis_points ?? 0);

  const originalConc = concentrationIndicators(originalResult.holdings);
  const updatedConc = concentrationIndicators(updatedResult.holdings);

  return (
    <Card style={{ gap: theme.spacing.lg }}>
      <View style={styles.titleRow}>
        <Text variant="caption" color="textMuted" style={styles.scenario} numberOfLines={2}>
          {scenarioName} · original vs updated
        </Text>
        <SimulatedBadge />
      </View>

      {/* Side-by-side headline figures. */}
      <View style={[styles.columns, { gap: theme.spacing.md }]}>
        <RunColumn
          label="Original"
          startingValueCents={original.starting_value_cents}
          simulatedValueCents={original.simulated_value_cents}
          changeCents={original.change_cents}
          changeBasisPoints={original.change_basis_points}
        />
        <RunColumn
          label="Updated"
          startingValueCents={updated.starting_value_cents}
          simulatedValueCents={updated.simulated_value_cents}
          changeCents={updated.change_cents}
          changeBasisPoints={updated.change_basis_points}
        />
      </View>

      {/* Differences between the two runs. */}
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="caption" color="textMuted" accessibilityRole="header">
          What changed
        </Text>
        <DeltaRow label="Starting value" valueText={formatSignedCents(startingDeltaCents)} cents={startingDeltaCents} />
        <DeltaRow
          label="Simulated ending value"
          valueText={formatSignedCents(simulatedDeltaCents)}
          cents={simulatedDeltaCents}
        />
        <DeltaRow
          label="Simulated performance"
          valueText={`${performanceDeltaBp >= 0 ? '+' : ''}${formatPercent(performanceDeltaBp)}`}
          cents={performanceDeltaBp}
        />
      </View>

      {/* Sector / concentration changes. */}
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="caption" color="textMuted" accessibilityRole="header">
          Diversification
        </Text>
        <Text variant="body" color="text">
          Largest sector: {originalConc.largestSectorName ?? '—'} (
          {formatShare(originalConc.largestSectorBasisPoints)}) →{' '}
          {updatedConc.largestSectorName ?? '—'} ({formatShare(updatedConc.largestSectorBasisPoints)})
        </Text>
        <Text variant="body" color="text">
          Largest holding: {originalConc.largestHoldingSymbol ?? '—'} (
          {formatShare(originalConc.largestHoldingBasisPoints)}) →{' '}
          {updatedConc.largestHoldingSymbol ?? '—'} (
          {formatShare(updatedConc.largestHoldingBasisPoints)})
        </Text>
        <Text variant="body" color="text">
          Sectors held: {originalConc.distinctSectorCount} → {updatedConc.distinctSectorCount}
        </Text>
      </View>
    </Card>
  );
}

/** One run's headline figures. */
function RunColumn({
  label,
  startingValueCents,
  simulatedValueCents,
  changeCents,
  changeBasisPoints,
}: {
  label: string;
  startingValueCents: number;
  simulatedValueCents: number;
  changeCents: number;
  changeBasisPoints: number | null;
}) {
  const theme = useTheme();
  const changeColor = changeCents > 0 ? 'primary' : changeCents < 0 ? 'danger' : 'textMuted';
  return (
    <View style={[styles.column, { gap: theme.spacing.xs }]}>
      <Text variant="caption" color="textMuted" accessibilityRole="header">
        {label}
      </Text>
      <Text variant="caption" color="textMuted">
        Started at
      </Text>
      <Text variant="body" color="text">
        {formatCents(startingValueCents)}
      </Text>
      <Text variant="caption" color="textMuted">
        Simulated
      </Text>
      <Text variant="body" color="text">
        {formatCents(simulatedValueCents)}
      </Text>
      <Text variant="body" color={changeColor}>
        {formatSignedCents(changeCents)} ({formatPercent(changeBasisPoints)})
      </Text>
    </View>
  );
}

/** A labelled difference row with a direction glyph (non-colour cue). */
function DeltaRow({
  label,
  valueText,
  cents,
}: {
  label: string;
  valueText: string;
  cents: number;
}) {
  const theme = useTheme();
  const glyph = cents > 0 ? '▲' : cents < 0 ? '▼' : '–';
  const color = cents > 0 ? 'primary' : cents < 0 ? 'danger' : 'textMuted';
  return (
    <View style={[styles.deltaRow, { gap: theme.spacing.sm }]}>
      <Text variant="body" color="text" style={styles.deltaLabel}>
        {label}
      </Text>
      <Text variant="body" color={color}>
        {glyph} {valueText}
      </Text>
    </View>
  );
}

/** Unsigned whole-percent share label from basis points, e.g. 3000 -> "30%". */
function formatShare(basisPoints: number): string {
  return `${Math.round(basisPoints / 100)}%`;
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  scenario: {
    flex: 1,
    minWidth: 0,
  },
  columns: {
    flexDirection: 'row',
  },
  column: {
    flex: 1,
    minWidth: 0,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deltaLabel: {
    flex: 1,
    minWidth: 0,
  },
});
