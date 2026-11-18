/**
 * StartVsSimulatedChart (FR-21).
 *
 * A two-bar react-native-svg comparison of the portfolio's starting value
 * against its simulated value under a scenario. The bar-scaling math lives in
 * the pure `chart-geometry.comparisonBars` helper; this renderer draws the two
 * bars and labels each with its dollar value. The simulated bar is tinted by
 * direction (gain/loss) and every figure is written out in text, so the result
 * never relies on colour alone. The caller marks the whole result SIMULATED.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { Text } from '../../../components/ui';
import { formatCents } from '../../../lib/money';
import { useTheme } from '../../../theme/theme-provider';
import { comparisonBars } from './chart-geometry';

export interface StartVsSimulatedChartProps {
  startingValueCents: number;
  simulatedValueCents: number;
  /** Chart height in points. */
  height?: number;
}

const DEFAULT_HEIGHT = 160;
const BAR_WIDTH = 64;

export function StartVsSimulatedChart({
  startingValueCents,
  simulatedValueCents,
  height = DEFAULT_HEIGHT,
}: StartVsSimulatedChartProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  const isLoss = simulatedValueCents < startingValueCents;
  const simulatedColor = isLoss ? theme.colors.danger : theme.colors.primary;
  const bars = comparisonBars(startingValueCents, simulatedValueCents, height);

  // Place two bars centred within the measured width.
  const gap = theme.spacing.xl;
  const totalBars = BAR_WIDTH * 2 + gap;
  const startX = width > 0 ? Math.max(0, (width - totalBars) / 2) : 0;
  const simulatedX = startX + BAR_WIDTH + gap;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[styles.plot, { height }]}
        accessibilityRole="image"
        accessibilityLabel={`Starting value ${formatCents(startingValueCents)}, simulated value ${formatCents(simulatedValueCents)}`}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Rect
              x={startX}
              y={height - bars.startHeight}
              width={BAR_WIDTH}
              height={bars.startHeight}
              rx={4}
              fill={theme.colors.textMuted}
            />
            <Rect
              x={simulatedX}
              y={height - bars.simulatedHeight}
              width={BAR_WIDTH}
              height={bars.simulatedHeight}
              rx={4}
              fill={simulatedColor}
            />
          </Svg>
        ) : null}
      </View>

      <View style={[styles.labels, { paddingHorizontal: startX }]}>
        <View style={[styles.labelCol, { width: BAR_WIDTH }]}>
          <Text variant="caption" color="textMuted" style={styles.center}>
            Starting
          </Text>
          <Text variant="caption" color="text" style={styles.center}>
            {formatCents(startingValueCents)}
          </Text>
        </View>
        <View style={{ width: gap }} />
        <View style={[styles.labelCol, { width: BAR_WIDTH }]}>
          <Text variant="caption" color="textMuted" style={styles.center}>
            Simulated
          </Text>
          <Text variant="caption" color={isLoss ? 'danger' : 'primary'} style={styles.center}>
            {formatCents(simulatedValueCents)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plot: {
    width: '100%',
  },
  labels: {
    flexDirection: 'row',
  },
  labelCol: {
    alignItems: 'center',
  },
  center: {
    textAlign: 'center',
  },
});
