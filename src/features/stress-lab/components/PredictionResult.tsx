/**
 * PredictionResult (FR-33, Phase 2).
 *
 * Shown after a run when the student recorded a prediction: how their guess
 * compared to the simulated outcome. It reads the server-computed `accuracy`
 * payload saved with the prediction (direction call, the actual move, estimate
 * error, and best/worst pick correctness) so the "predict, then check" loop
 * closes with grounded feedback. Marked SIMULATED. Purely presentational.
 */
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '../../../components/ui';
import { formatPercent } from '../../../lib/money';
import { useTheme } from '../../../theme/theme-provider';
import type { StressPrediction } from '../data/rpc-schemas';
import { SimulatedBadge } from './SimulatedBadge';

export interface PredictionResultProps {
  /** The saved, scored prediction for this run. */
  prediction: StressPrediction;
}

export function PredictionResult({ prediction }: PredictionResultProps) {
  const theme = useTheme();
  const accuracy = prediction.accuracy;

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <View style={styles.titleRow}>
        <Text variant="caption" color="textMuted" accessibilityRole="header">
          Your prediction
        </Text>
        <SimulatedBadge />
      </View>

      <Text variant="body" color="text">
        You guessed your portfolio would {prediction.direction === 'gain' ? 'gain' : 'lose'}.
      </Text>

      {accuracy ? (
        <>
          <Row
            label="Direction"
            value={accuracy.direction_correct ? 'Correct' : 'Not this time'}
            correct={accuracy.direction_correct}
          />
          {accuracy.estimate_error_bp !== null ? (
            <Row
              label="Estimate"
              value={`Off by ${formatPercent(accuracy.estimate_error_bp)} (actual ${formatPercent(accuracy.actual_change_bp)})`}
              correct={accuracy.estimate_error_bp <= 500}
            />
          ) : null}
          {prediction.picked_best ? (
            <Row
              label="Best pick"
              value={
                accuracy.best_correct
                  ? `Right — ${accuracy.actual_best ?? '—'} held up best`
                  : `Actually ${accuracy.actual_best ?? '—'} held up best`
              }
              correct={accuracy.best_correct}
            />
          ) : null}
          {prediction.picked_worst ? (
            <Row
              label="Worst pick"
              value={
                accuracy.worst_correct
                  ? `Right — ${accuracy.actual_worst ?? '—'} fell most`
                  : `Actually ${accuracy.actual_worst ?? '—'} fell most`
              }
              correct={accuracy.worst_correct}
            />
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

/** A labelled accuracy row with a glyph (non-colour cue). */
function Row({ label, value, correct }: { label: string; value: string; correct: boolean }) {
  const theme = useTheme();
  const glyph = correct ? '✓' : '✗';
  const color = correct ? 'primary' : 'textMuted';
  return (
    <View style={[styles.row, { gap: theme.spacing.sm }]}>
      <Text variant="body" color={color} style={styles.glyph}>
        {glyph}
      </Text>
      <View style={styles.body}>
        <Text variant="caption" color="textMuted">
          {label}
        </Text>
        <Text variant="body" color="text">
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  glyph: {
    width: 16,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
});
