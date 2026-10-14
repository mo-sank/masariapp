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
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '../../../../components/ui';
import { useTheme } from '../../../../theme/theme-provider';

export interface UnitHeaderProps {
  /** The unit number this header introduces. */
  unit: number;
  /** Optional custom title override. */
  title?: string;
  /** Optional custom description. */
  description?: string;
  /** Whether learner can test out / jump ahead in this unit. */
  canTestOut?: boolean;
  /** Called when learner taps Jump Ahead / Test Out. */
  onTestOut?: () => void;
}

export const UNIT_METADATA: Record<number, { title: string; description: string }> = {
  0: { title: 'Placement Quest', description: 'Establish your baseline skill level' },
  1: { title: 'Market Foundations', description: 'Shares, supply & demand, orders & risk' },
  2: { title: 'Market Dynamics', description: 'Charts, trends, and market indexes' },
};

export function UnitHeader({
  unit,
  title,
  description,
  canTestOut,
  onTestOut,
}: UnitHeaderProps) {
  const theme = useTheme();
  const label = `Unit ${unit}`;
  const meta = UNIT_METADATA[unit];
  const unitTitle = title ?? meta?.title;
  const unitDescription = description ?? meta?.description;

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
      <View style={styles.contentRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="caption" color="textMuted" accessibilityRole="header" style={styles.title}>
            {label.toUpperCase()}
          </Text>
          {unitTitle ? (
            <Text variant="body" color="text" style={styles.unitName}>
              {unitTitle}
            </Text>
          ) : null}
          {unitDescription ? (
            <Text variant="caption" color="textMuted">
              {unitDescription}
            </Text>
          ) : null}
        </View>

        {canTestOut && onTestOut ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Test out of Unit ${unit}`}
            onPress={onTestOut}
            style={({ pressed }) => [
              styles.testOutButton,
              {
                backgroundColor: theme.colors.background,
                borderColor: theme.colors.primary,
                borderRadius: theme.radii.pill,
                paddingHorizontal: theme.spacing.sm + 4,
                paddingVertical: theme.spacing.xs,
                opacity: pressed ? 0.85 : 1,
                transform: [{ translateY: pressed ? 1 : 0 }],
              },
            ]}
          >
            <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '700' }}>
              ⚡ Jump Ahead
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  contentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  unitName: {
    fontWeight: '700',
    fontSize: 16,
  },
  testOutButton: {
    borderWidth: 1.5,
    borderBottomWidth: 3,
  },
});
