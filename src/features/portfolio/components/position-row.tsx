/**
 * PositionRow (requirement 7.2).
 *
 * One holding in the Portfolio list: symbol and share count on the left; current
 * market value and unrealized gain/loss (dollars and percent) on the right, with
 * average cost and current price on a supporting line. Every figure is formatted
 * from the integer-cents fields on {@link PortfolioPosition} via lib/money, so no
 * float math ever touches a money value here.
 *
 * Gain/loss is tinted green for a gain, red for a loss, and muted when flat; the
 * sign is also carried in the text (via formatSignedCents / formatPercent) so
 * meaning never relies on color alone (accessibility). A holding whose symbol has
 * no quote yet (currentPriceCents === null) shows a muted dash for price and
 * values at 0 rather than breaking the row. Purely presentational.
 */
import { StyleSheet, View } from 'react-native';

import { Text } from '../../../components/ui';
import { formatCents, formatPercent, formatSignedCents } from '../../../lib/money';
import { useTheme } from '../../../theme/theme-provider';
import type { PortfolioPosition } from '../use-portfolio';

export interface PositionRowProps {
  position: PortfolioPosition;
}

/** Pluralize "share" for the row's share count. */
function sharesLabel(qty: number): string {
  return `${qty} ${qty === 1 ? 'share' : 'shares'}`;
}

export function PositionRow({ position }: PositionRowProps) {
  const theme = useTheme();
  const {
    symbol,
    qty,
    avgCostCents,
    currentPriceCents,
    valueCents,
    gainCents,
    gainBasisPoints,
  } = position;

  const priceText = currentPriceCents == null ? '—' : formatCents(currentPriceCents);
  const gainText = `${formatSignedCents(gainCents)} (${formatPercent(gainBasisPoints)})`;
  const gainColor = gainCents > 0 ? 'primary' : gainCents < 0 ? 'danger' : 'textMuted';

  // One spoken summary so a screen reader does not read each cell in turn.
  const a11yLabel = [
    symbol,
    sharesLabel(qty),
    `value ${formatCents(valueCents)}`,
    `gain or loss ${gainText}`,
  ].join(', ');

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={a11yLabel}
      style={[
        styles.row,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.md,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.md,
          gap: theme.spacing.md,
        },
      ]}
    >
      <View style={styles.left}>
        <Text variant="body" color="text" style={styles.symbol}>
          {symbol}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {sharesLabel(qty)} · avg {formatCents(avgCostCents)} · now {priceText}
        </Text>
      </View>

      <View style={styles.right}>
        <Text variant="body" color="text">
          {formatCents(valueCents)}
        </Text>
        <Text variant="caption" color={gainColor}>
          {gainText}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: 1,
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
  right: {
    alignItems: 'flex-end',
  },
});
