/**
 * RangeToggle (requirement 5.2).
 *
 * The 1M / 3M / 1Y / 5Y selector above the chart. It is shown only when the
 * learner has the `chart_time_ranges` feature unlocked; while locked the stock
 * screen shows a fixed 1M chart and a lock hint instead, so this component is
 * purely the unlocked control.
 *
 * Each option is a tab-like button; the active range is filled with the brand
 * color and marked `selected` for assistive tech. Purely presentational — the
 * caller owns the active range state and the change handler.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';
import type { ChartRange } from '../use-bars';

/** The four ranges offered in the MVP, in display order (requirement 3.3). */
export const CHART_RANGES: readonly ChartRange[] = ['1M', '3M', '1Y', '5Y'];

export interface RangeToggleProps {
  /** The currently selected range. */
  value: ChartRange;
  /** Called with the newly chosen range. */
  onChange: (range: ChartRange) => void;
}

export function RangeToggle({ value, onChange }: RangeToggleProps) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.row,
        {
          borderColor: theme.colors.border,
          borderRadius: theme.radii.md,
          padding: theme.spacing.xs,
          gap: theme.spacing.xs,
        },
      ]}
    >
      {CHART_RANGES.map((range) => {
        const active = range === value;
        return (
          <Pressable
            key={range}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Range ${range}`}
            onPress={() => onChange(range)}
            style={[
              styles.tab,
              {
                borderRadius: theme.radii.sm,
                paddingVertical: theme.spacing.sm,
                backgroundColor: active ? theme.colors.primary : 'transparent',
              },
            ]}
          >
            <Text variant="caption" color={active ? 'onPrimary' : 'textMuted'}>
              {range}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
  },
});
