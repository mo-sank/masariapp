/**
 * SimulatedBadge (FR-19).
 *
 * The reused "SIMULATED" label that marks every figure derived from a stress
 * test, keeping simulated numbers visually distinct from the real portfolio
 * overview. It is a small pill reading from theme tokens; the caption variant
 * carries the word itself so meaning never relies on colour alone.
 */
import { StyleSheet, View } from 'react-native';

import { Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';

export interface SimulatedBadgeProps {
  /** Override the label (defaults to "SIMULATED"). */
  label?: string;
}

export function SimulatedBadge({ label = 'SIMULATED' }: SimulatedBadgeProps) {
  const theme = useTheme();
  return (
    <View
      accessibilityLabel={`${label} result`}
      style={[
        styles.badge,
        {
          backgroundColor: theme.colors.xp,
          borderRadius: theme.radii.sm,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: 2,
        },
      ]}
    >
      <Text variant="caption" color="onPrimary" style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
  },
  label: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
