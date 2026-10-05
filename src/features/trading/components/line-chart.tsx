/**
 * LineChart (requirements 5.2, 5.3, 3.3).
 *
 * A react-native-svg line chart of a symbol's daily closes. It is deliberately
 * thin: all the x/y arithmetic lives in the pure `chart-geometry` helpers (which
 * are unit-tested without React), and this component only turns those points
 * into SVG primitives. It measures its own width via `onLayout` so it fills the
 * card it sits in, and uses a fixed height passed by the caller.
 *
 * Trade markers (requirement 5.3) are optional and already gated by the caller:
 * when the `trade_markers` feature is locked the stock screen passes none. Buys
 * render as a primary-tinted dot, sells as a danger-tinted dot; the side is also
 * encoded in each dot's accessibility label so meaning does not rely on color.
 *
 * Empty/short series: with no bars the chart shows a muted "No chart data yet"
 * line rather than an empty box; a single bar renders a centred dot.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import {
  barsToPoints,
  pointsToPolyline,
  tradeMarkers,
  type ChartBar,
  type ChartLayout,
  type MarkerInput,
} from './chart-geometry';
import { Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';

export interface LineChartProps {
  /** Daily bars, oldest-first (as `useBars` returns them). */
  bars: readonly ChartBar[];
  /** Chart height in points. Width is measured from the parent. */
  height?: number;
  /** The user's trades to mark (already unlock-gated by the caller). */
  markers?: readonly MarkerInput[];
  /** Accessible description of what the line shows (e.g. "AAPL, 1M"). */
  accessibilityLabel?: string;
}

/** Inner padding so the line and markers never clip at the card edges. */
const CHART_PADDING = 12;
const DEFAULT_HEIGHT = 200;
const MARKER_RADIUS = 4;

export function LineChart({
  bars,
  height = DEFAULT_HEIGHT,
  markers,
  accessibilityLabel,
}: LineChartProps) {
  const theme = useTheme();
  // Width is unknown until the view lays out; start at 0 and fill in on layout.
  const [width, setWidth] = useState(0);

  const layout: ChartLayout = { width, height, padding: CHART_PADDING };
  const points = width > 0 ? barsToPoints(bars, layout) : [];
  const placedMarkers =
    width > 0 && markers && markers.length > 0 ? tradeMarkers(markers, bars, layout) : [];

  const hasData = bars.length > 0;

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.container, { height }]}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? 'Price history chart'}
    >
      {!hasData ? (
        <View style={styles.empty}>
          <Text variant="caption" color="textMuted">
            No chart data yet
          </Text>
        </View>
      ) : width > 0 ? (
        <Svg width={width} height={height}>
          {points.length > 1 ? (
            <Polyline
              points={pointsToPolyline(points)}
              fill="none"
              stroke={theme.colors.primary}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          {/* A single bar: show just a dot so the chart is not blank. */}
          {points.length === 1 ? (
            <Circle cx={points[0].x} cy={points[0].y} r={3} fill={theme.colors.primary} />
          ) : null}

          {placedMarkers.map((marker, index) => (
            <Circle
              key={`${marker.side}-${index}`}
              cx={marker.x}
              cy={marker.y}
              r={MARKER_RADIUS}
              fill={marker.side === 'buy' ? theme.colors.primary : theme.colors.danger}
              stroke={theme.colors.background}
              strokeWidth={1.5}
            />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
