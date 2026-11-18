/**
 * Portfolio RangeToggle (design §8).
 *
 * The 1M / 3M / 1Y / 5Y / ALL selector above the Portfolio value chart. It is a
 * structural clone of `src/features/trading/components/range-toggle.tsx`, kept
 * separate so the trading toggle (which is typed to a 4-range `ChartRange`
 * without `'ALL'`) stays untouched and the stock screen stays 4-range.
 *
 * Each option is a tab-like button; the active range is filled with the brand
 * color and marked `selected` for assistive tech. Purely presentational — the
 * caller owns the active range state and the change handler.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';
import type { ChartRange } from '../use-portfolio-history';

/** The five ranges offered on the Portfolio tab, in display order (design §8). */
export const PORTFOLIO_CHART_RANGES: readonly ChartRange[] = ['1M', '3M', '1Y', '5Y', 'ALL'];

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
      {PORTFOLIO_CHART_RANGES.map((range) => {
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
