/**
 * RiskObservations (FR-7, FR-24).
 *
 * The educational risk assessment: plain-language observations the analysis
 * layer derives from the student's ACTUAL holdings and the simulated result
 * (never boilerplate). Each observation is tinted and prefixed by a tone glyph
 * so meaning is not colour-only. This leads into the improvement section (FR-8),
 * which encourages the student to make their own changes rather than being told
 * what to buy or sell. The card is marked SIMULATED. Purely presentational.
 */
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';
import { deriveObservations, type Observation, type ObservationTone } from '../analysis/observations';
import type { SimulationResult } from '../engine/types';
import { SimulatedBadge } from './SimulatedBadge';

export interface RiskObservationsProps {
  result: SimulationResult;
}

/** Tone glyph + colour token (glyph is the non-colour cue). */
function toneStyle(tone: ObservationTone): { glyph: string; color: 'primary' | 'danger' | 'text' } {
  switch (tone) {
    case 'positive':
      return { glyph: '✓', color: 'primary' };
    case 'negative':
      return { glyph: '!', color: 'danger' };
    case 'neutral':
    default:
      return { glyph: '•', color: 'text' };
  }
}

export function RiskObservations({ result }: RiskObservationsProps) {
  const theme = useTheme();
  const observations: Observation[] = deriveObservations(result);

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <View style={styles.titleRow}>
        <Text variant="caption" color="textMuted" accessibilityRole="header">
          What this tells you
        </Text>
        <SimulatedBadge />
      </View>

      {observations.map((obs, index) => {
        const tone = toneStyle(obs.tone);
        return (
          <View key={`${obs.kind}-${index}`} style={[styles.row, { gap: theme.spacing.sm }]}>
            <Text variant="body" color={tone.color} style={styles.glyph}>
              {tone.glyph}
            </Text>
            <Text variant="body" color="text" style={styles.message}>
              {obs.message}
            </Text>
          </View>
        );
      })}

      <Text variant="caption" color="textMuted" style={{ marginTop: theme.spacing.xs }}>
        These are things to think about — not instructions. Head back to the brokerage and try
        your own changes, then run the test again to compare.
      </Text>
    </Card>
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
  message: {
    flex: 1,
    minWidth: 0,
  },
});
