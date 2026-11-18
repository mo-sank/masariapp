/**
 * ResultsSummary (FR-20, FR-21).
 *
 * The headline of the results dashboard: starting value, simulated ending value,
 * and the total dollar and percent change, with the start-vs-simulated bar
 * comparison. The whole card is marked SIMULATED and tinted by direction so it
 * reads as a hypothetical result, kept visually distinct from the real overview
 * (FR-19). Figures come from the persisted simulation via lib/money.
 */
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '../../../components/ui';
import { formatCents, formatPercent, formatSignedCents } from '../../../lib/money';
import { useTheme } from '../../../theme/theme-provider';
import type { SimulationResult } from '../engine/types';
import { SimulatedBadge } from './SimulatedBadge';
import { StartVsSimulatedChart } from './StartVsSimulatedChart';

export interface ResultsSummaryProps {
  result: SimulationResult;
  /** The scenario name, for the heading. */
  scenarioName: string;
}

export function ResultsSummary({ result, scenarioName }: ResultsSummaryProps) {
  const theme = useTheme();
  const isLoss = result.changeCents < 0;
  const changeColor = result.changeCents > 0 ? 'primary' : isLoss ? 'danger' : 'textMuted';

  return (
    <Card style={{ gap: theme.spacing.md }}>
      <View style={styles.headerRow}>
        <Text variant="caption" color="textMuted" style={styles.scenario} numberOfLines={2}>
          {scenarioName}
          {result.phase === 'recovery' ? ' · recovery phase' : ''}
        </Text>
        <SimulatedBadge />
      </View>

      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="caption" color="textMuted">
          Simulated ending value
        </Text>
        <Text
          variant="title"
          color="text"
          accessibilityLabel={`Simulated ending value ${formatCents(result.simulatedValueCents)}`}
        >
          {formatCents(result.simulatedValueCents)}
        </Text>
        <Text
          variant="body"
          color={changeColor}
          accessibilityLabel={`Change ${formatSignedCents(result.changeCents)}, ${formatPercent(result.changeBasisPoints)}`}
        >
          {formatSignedCents(result.changeCents)} ({formatPercent(result.changeBasisPoints)})
        </Text>
        <Text variant="caption" color="textMuted">
          Started at {formatCents(result.startingValueCents)}
        </Text>
      </View>

      <StartVsSimulatedChart
        startingValueCents={result.startingValueCents}
        simulatedValueCents={result.simulatedValueCents}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  scenario: {
    flex: 1,
    minWidth: 0,
  },
});
