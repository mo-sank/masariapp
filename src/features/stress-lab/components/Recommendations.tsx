/**
 * Recommendations (FR-26–FR-29, Phase 2).
 *
 * The improvement section of the results dashboard: weaknesses the analysis
 * layer derives from the student's ACTUAL holdings and the simulated result,
 * each paired with an open prompt that invites the student to explore a change
 * themselves. It NEVER prescribes a trade or modifies the portfolio — the
 * "Improve My Portfolio" action (owned by the route) takes the student into the
 * existing brokerage to make their own decision.
 *
 * A well-balanced, resilient portfolio yields no recommendations, which this
 * renders as encouragement rather than an empty gap. Purely presentational.
 */
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';
import { deriveRecommendations, type Recommendation } from '../analysis/recommendations';
import type { SimulationResult } from '../engine/types';
import { SimulatedBadge } from './SimulatedBadge';

export interface RecommendationsProps {
  result: SimulationResult;
}

export function Recommendations({ result }: RecommendationsProps) {
  const theme = useTheme();
  const recommendations: Recommendation[] = deriveRecommendations(result);

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <View style={styles.titleRow}>
        <Text variant="caption" color="textMuted" accessibilityRole="header">
          Ideas to explore
        </Text>
        <SimulatedBadge />
      </View>

      {recommendations.length === 0 ? (
        <Text variant="body" color="text">
          Nice — no glaring weak spots stood out in this run. Try a tougher scenario, or tweak your
          mix and see what changes.
        </Text>
      ) : (
        recommendations.map((rec, index) => (
          <View key={`${rec.kind}-${index}`} style={{ gap: 2 }}>
            <Text variant="body" color="text">
              {rec.message}
            </Text>
            <Text variant="caption" color="textMuted">
              {rec.prompt}
            </Text>
          </View>
        ))
      )}

      <Text variant="caption" color="textMuted" style={{ marginTop: theme.spacing.xs }}>
        These are prompts to think about — not instructions. Head to the brokerage, make your own
        changes, then run the test again to compare.
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
});
