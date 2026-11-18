/**
 * ConcentrationBar (FR-6).
 *
 * A single horizontal bar showing how much of the portfolio sits in its largest
 * holding or sector — a plain visual for concentration. The fill-width math
 * lives in the pure `chart-geometry.fillWidth` helper; this renderer draws the
 * track and fill with react-native-svg and labels the share in text so the
 * meaning is never colour-only.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';
import { fillWidth } from './chart-geometry';
import { formatShare } from './format-share';

export interface ConcentrationBarProps {
  /** What the bar measures, e.g. "Largest sector". */
  label: string;
  /** The concentrated share, in basis points (0–10000). */
  basisPoints: number;
  /** True to tint the fill as a warning (over-concentrated). */
  warn?: boolean;
  /** Bar height in points. */
  height?: number;
}

const DEFAULT_HEIGHT = 16;

export function ConcentrationBar({
  label,
  basisPoints,
  warn = false,
  height = DEFAULT_HEIGHT,
}: ConcentrationBarProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const filled = width > 0 ? fillWidth(basisPoints, 10000, width) : 0;
  const fillColor = warn ? theme.colors.danger : theme.colors.primary;

  return (
    <View style={[styles.container, { gap: theme.spacing.xs }]}>
      <View style={styles.labelRow}>
        <Text variant="caption" color="text" style={styles.label}>
          {label}
        </Text>
        <Text variant="caption" color={warn ? 'danger' : 'textMuted'}>
          {formatShare(basisPoints)}
        </Text>
      </View>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[styles.track, { height }]}
        accessibilityRole="progressbar"
        accessibilityLabel={`${label}: ${formatShare(basisPoints)} of the portfolio`}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Rect x={0} y={0} width={width} height={height} rx={4} fill={theme.colors.border} />
            {filled > 0 ? (
              <Rect x={0} y={0} width={filled} height={height} rx={4} fill={fillColor} />
            ) : null}
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontWeight: '600',
  },
  track: {
    width: '100%',
  },
});
