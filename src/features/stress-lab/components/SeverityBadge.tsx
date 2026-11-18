/**
 * SeverityBadge (FR-10).
 *
 * The simple severity indicator on a scenario card: a coloured pill reading the
 * severity word. The word itself carries the meaning so it never relies on
 * colour alone; the tint maps low→muted through severe→danger.
 */
import { StyleSheet, View } from 'react-native';

import { Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';
import type { ScenarioSeverity } from '../scenarios/scenarios';

export interface SeverityBadgeProps {
  severity: ScenarioSeverity;
}

const LABELS: Record<ScenarioSeverity, string> = {
  low: 'Low impact',
  medium: 'Medium impact',
  high: 'High impact',
  severe: 'Severe impact',
};

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const theme = useTheme();
  const tint =
    severity === 'severe' || severity === 'high'
      ? theme.colors.danger
      : severity === 'medium'
        ? theme.colors.streak
        : theme.colors.textMuted;

  return (
    <View
      style={[
        styles.badge,
        {
          borderColor: tint,
          borderRadius: theme.radii.sm,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: 2,
        },
      ]}
      accessibilityLabel={LABELS[severity]}
    >
      <Text variant="caption" style={[styles.label, { color: tint }]}>
        {LABELS[severity]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
  label: {
    fontWeight: '700',
  },
});
