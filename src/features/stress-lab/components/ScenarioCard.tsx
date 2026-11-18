/**
 * ScenarioCard (FR-10, FR-11).
 *
 * A visually distinct card for one economic scenario: its name, a short
 * description, and a severity indicator. Tapping the card opens its preview
 * (handled by the caller) so the student can read what the scenario simulates
 * before running it. Purely presentational.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';
import type { LabScenario } from '../data/use-scenarios';
import { SeverityBadge } from './SeverityBadge';

export interface ScenarioCardProps {
  scenario: LabScenario;
  /** Open the preview for this scenario. */
  onPress: () => void;
}

export function ScenarioCard({ scenario, onPress }: ScenarioCardProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${scenario.name}. ${scenario.description}`}
      accessibilityHint="Opens a preview before you run it"
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <Card style={{ gap: theme.spacing.sm }}>
        <View style={styles.headerRow}>
          <Text variant="body" color="text" style={styles.name}>
            {scenario.name}
          </Text>
          <SeverityBadge severity={scenario.severity} />
        </View>
        <Text variant="caption" color="textMuted">
          {scenario.description}
        </Text>
        <Text variant="caption" color="primary">
          Preview & run →
        </Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.85,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: {
    flex: 1,
    minWidth: 0,
    fontWeight: '700',
  },
});
