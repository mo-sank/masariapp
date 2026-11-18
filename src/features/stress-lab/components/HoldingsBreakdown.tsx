/**
 * HoldingsBreakdown (FR-3).
 *
 * The real portfolio's holdings as a list, one row per holding: symbol and
 * company name, share count and sector on a supporting line, and the current
 * value on the right. Figures are formatted from integer cents via lib/money.
 * This is part of the REAL overview (no SIMULATED badge). Purely presentational.
 */
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '../../../components/ui';
import { formatCents } from '../../../lib/money';
import { useTheme } from '../../../theme/theme-provider';
import { UNCLASSIFIED_SECTOR } from '../analysis/portfolio-analysis';
import type { LabHolding } from '../engine/types';

export interface HoldingsBreakdownProps {
  holdings: readonly LabHolding[];
}

/** Pluralize "share" for a row. */
function sharesLabel(qty: number): string {
  return `${qty} ${qty === 1 ? 'share' : 'shares'}`;
}

export function HoldingsBreakdown({ holdings }: HoldingsBreakdownProps) {
  const theme = useTheme();

  if (holdings.length === 0) {
    return null;
  }

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <Text variant="caption" color="textMuted" accessibilityRole="header">
        Holdings
      </Text>
      {holdings.map((h) => (
        <View
          key={h.symbol}
          style={[styles.row, { gap: theme.spacing.md, paddingVertical: theme.spacing.xs }]}
          accessibilityRole="summary"
          accessibilityLabel={`${h.symbol}, ${h.name}, ${sharesLabel(h.qty)}, value ${formatCents(h.currentValueCents)}`}
        >
          <View style={styles.left}>
            <Text variant="body" color="text" style={styles.symbol}>
              {h.symbol}
            </Text>
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {h.name} · {sharesLabel(h.qty)} · {h.sector ?? UNCLASSIFIED_SECTOR}
            </Text>
          </View>
          <Text variant="body" color="text">
            {formatCents(h.currentValueCents)}
          </Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  left: {
    flex: 1,
    minWidth: 0,
  },
  symbol: {
    fontWeight: '600',
  },
});
