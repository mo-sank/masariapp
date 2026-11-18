/**
 * AllocationDonut (FR-4).
 *
 * A react-native-svg donut of portfolio allocation (by asset or by sector). It
 * is deliberately thin: all the angle arithmetic lives in the pure
 * `chart-geometry` helpers (unit-tested without React); this component turns the
 * computed arcs into `<Path>` rings and renders a legend so each slice's meaning
 * is read from text, not colour. An empty portfolio shows a muted placeholder.
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Text } from '../../../components/ui';
import { formatCents } from '../../../lib/money';
import { useTheme } from '../../../theme/theme-provider';
import { donutArcPath, donutArcs } from './chart-geometry';
import { paletteColor } from './palette';
import { formatShare } from './format-share';

/** One labelled slice of the donut. */
export interface AllocationSlice {
  label: string;
  valueCents: number;
  /** Share of the whole, in basis points (for the legend). */
  basisPoints: number;
}

export interface AllocationDonutProps {
  slices: readonly AllocationSlice[];
  /** Diameter of the donut in points. */
  size?: number;
  /** Accessible description of what the donut shows. */
  accessibilityLabel?: string;
}

const DEFAULT_SIZE = 180;
const RING_WIDTH = 28;

export function AllocationDonut({
  slices,
  size = DEFAULT_SIZE,
  accessibilityLabel,
}: AllocationDonutProps) {
  const theme = useTheme();
  const hasData = slices.some((s) => s.valueCents > 0);

  if (!hasData) {
    return (
      <View style={styles.empty}>
        <Text variant="caption" color="textMuted">
          No allocation to chart yet
        </Text>
      </View>
    );
  }

  const center = { x: size / 2, y: size / 2 };
  const outerRadius = size / 2;
  const innerRadius = outerRadius - RING_WIDTH;
  const arcs = donutArcs(slices.map((s) => ({ valueCents: s.valueCents })));

  return (
    <View style={[styles.container, { gap: theme.spacing.md }]}>
      <Svg
        width={size}
        height={size}
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel ?? 'Portfolio allocation chart'}
      >
        {arcs.map((arc) => {
          const path = donutArcPath(arc, center, outerRadius, innerRadius);
          if (path.d === '') {
            return null;
          }
          return <Path key={arc.index} d={path.d} fill={paletteColor(arc.index)} />;
        })}
      </Svg>

      <View style={[styles.legend, { gap: theme.spacing.xs }]}>
        {slices.map((slice, index) => (
          <View key={slice.label} style={[styles.legendRow, { gap: theme.spacing.sm }]}>
            <View
              style={[styles.swatch, { backgroundColor: paletteColor(index), borderRadius: 3 }]}
            />
            <Text variant="caption" color="text" style={styles.legendLabel} numberOfLines={1}>
              {slice.label}
            </Text>
            <Text variant="caption" color="textMuted">
              {formatShare(slice.basisPoints)} · {formatCents(slice.valueCents)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  empty: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  legend: {
    alignSelf: 'stretch',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  swatch: {
    width: 12,
    height: 12,
  },
  legendLabel: {
    flex: 1,
    minWidth: 0,
    fontWeight: '600',
  },
});
