/**
 * PortfolioValueChart (design §7).
 *
 * A react-native-svg line chart of the caller's daily paper-trading equity. It
 * is presentational and fed data via props only — it imports NO Supabase
 * client, so it can be reused elsewhere later. All the x/y arithmetic lives in
 * the pure `chart-geometry` helpers (unit-tested without React); this component
 * only turns those points into SVG primitives and renders the header summary. It
 * mirrors `src/features/trading/components/line-chart.tsx`: it measures its own
 * width via `onLayout` (filling the card it sits in) and uses a fixed height
 * passed by the caller.
 *
 * Header summary: the current equity is the last point's value; the change
 * across the visible range is `last − first` in dollars and percent, tinted
 * green (gain) / red (loss) / muted (flat), with the sign carried in the text
 * and the accessibility label (mirroring `PortfolioSummary`). A "Paper money"
 * tag marks the figures as paper money.
 *
 * Empty / short series: when `empty` or there are no points, a muted "No chart
 * data yet" line shows rather than an empty box; a single point renders a
 * centred dot. While `loading`, a quiet loading placeholder shows instead of an
 * empty chart.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import {
  equityToPoints,
  pointsToPolyline,
  type ChartLayout,
  type EquityPoint,
} from './chart-geometry';
import { Card, Text } from '../../../components/ui';
import { formatCents, formatPercent, formatSignedCents, pctChange } from '../../../lib/money';
import { useTheme } from '../../../theme/theme-provider';
import type { ChartRange } from '../use-portfolio-history';

export interface PortfolioValueChartProps {
  /** Equity points, oldest-first (as `usePortfolioHistory` returns them). */
  points: readonly EquityPoint[];
  /** The selected range, used only for the accessibility label. */
  range: ChartRange;
  /** Chart height in points. Width is measured from the parent. Defaults to 200. */
  height?: number;
  /** When true, show a loading placeholder instead of a chart. */
  loading?: boolean;
  /** When true, show the "No chart data yet" state (caller's sparse decision). */
  empty?: boolean;
}

/** Inner padding so the line never clips at the card edges. */
const CHART_PADDING = 12;
const DEFAULT_HEIGHT = 200;

export function PortfolioValueChart({
  points,
  range,
  height = DEFAULT_HEIGHT,
  loading = false,
  empty = false,
}: PortfolioValueChartProps) {
  const theme = useTheme();
  // Width is unknown until the view lays out; start at 0 and fill in on layout.
  const [width, setWidth] = useState(0);

  const layout: ChartLayout = { width, height, padding: CHART_PADDING };
  const plotted = width > 0 ? equityToPoints(points, layout) : [];

  const hasData = !empty && points.length > 0;

  // Header summary: current equity, and the change across the visible range.
  const firstCents = points.length > 0 ? points[0].valueCents : 0;
  const lastCents = points.length > 0 ? points[points.length - 1].valueCents : 0;
  const changeCents = lastCents - firstCents;
  const changeText = `${formatSignedCents(changeCents)} (${formatPercent(
    pctChange(lastCents, firstCents),
  )})`;
  const changeColor = changeCents > 0 ? 'primary' : changeCents < 0 ? 'danger' : 'textMuted';
  const changeSign = changeCents > 0 ? 'up' : changeCents < 0 ? 'down' : 'flat';

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <View style={styles.tagRow}>
        <View
          style={[
            styles.tag,
            {
              backgroundColor: theme.colors.border,
              borderRadius: theme.radii.sm,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: 2,
            },
          ]}
        >
          <Text variant="caption" color="textMuted">
            Paper money
          </Text>
        </View>
      </View>

      <Text variant="caption" color="textMuted">
        Portfolio value
      </Text>
      <Text
        variant="title"
        color="text"
        accessibilityLabel={`Portfolio value ${formatCents(lastCents)}`}
      >
        {formatCents(lastCents)}
      </Text>
      <Text
        variant="body"
        color={changeColor}
        accessibilityLabel={`Change ${changeSign} ${changeText} over ${range}`}
      >
        {changeText}
      </Text>

      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[styles.container, { height }]}
        accessibilityRole="image"
        accessibilityLabel={`Portfolio value, ${range}`}
      >
        {loading ? (
          <View style={styles.center}>
            <Text variant="caption" color="textMuted">
              Loading chart…
            </Text>
          </View>
        ) : !hasData ? (
          <View style={styles.center}>
            <Text variant="caption" color="textMuted">
              No chart data yet
            </Text>
          </View>
        ) : width > 0 ? (
          <Svg width={width} height={height}>
            {plotted.length > 1 ? (
              <Polyline
                testID="portfolio-value-line"
                points={pointsToPolyline(plotted)}
                fill="none"
                stroke={theme.colors.primary}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}

            {/* A single point: show just a dot so the chart is not blank. */}
            {plotted.length === 1 ? (
              <Circle
                testID="portfolio-value-dot"
                cx={plotted[0].x}
                cy={plotted[0].y}
                r={3}
                fill={theme.colors.primary}
              />
            ) : null}
          </Svg>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagRow: {
    flexDirection: 'row',
  },
  tag: {
    alignSelf: 'flex-start',
  },
});
