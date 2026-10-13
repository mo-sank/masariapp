/**
 * UnitHeader (requirement 2.1).
 *
 * The section heading that introduces a unit's run of lessons on the learning
 * path. Requirement 2.1 asks the Learn tab to show lessons "grouped by unit"; a
 * `PathView` renders one `UnitHeader` above each unit's nodes so the path reads
 * as a sequence of titled sections.
 *
 * Purely presentational: it takes the unit number and renders a themed heading.
 * Accessibility: the label is exposed as a `header` so assistive tech can jump
 * between units.
 */
import { StyleSheet, View } from 'react-native';

import { Text } from '../../../../components/ui';
import { useTheme } from '../../../../theme/theme-provider';

export interface UnitHeaderProps {
  /** The unit number this header introduces. */
  unit: number;
}

export function UnitHeader({ unit }: UnitHeaderProps) {
  const theme = useTheme();
  const label = `Unit ${unit}`;
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: 1.5,
          borderBottomWidth: 3,
          borderRadius: theme.radii.lg,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          marginTop: theme.spacing.md,
          marginBottom: theme.spacing.xs,
        },
      ]}
    >
      <Text variant="caption" color="textMuted" accessibilityRole="header" style={styles.title}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  title: {
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});
