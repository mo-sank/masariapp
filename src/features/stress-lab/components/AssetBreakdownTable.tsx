/**
 * AssetBreakdownTable (FR-22).
 *
 * The per-holding breakdown of a simulation, one row per holding with: ticker
 * and company name, shares held, original holding value, simulated percent
 * change, simulated dollar gain/loss, and the simulated ending value. Positive
 * and negative outcomes are tinted AND carry a non-colour cue (an ▲/▼/– glyph
 * plus the sign in the figures) so meaning never relies on colour alone.
 *
 * All figures are the server-persisted simulated values, formatted from integer
 * cents via lib/money. The card is marked SIMULATED. Purely presentational.
 */
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '../../../components/ui';
import { formatCents, formatPercent, formatSignedCents } from '../../../lib/money';
import { useTheme } from '../../../theme/theme-provider';
import type { SimulatedHolding } from '../engine/types';
import { SimulatedBadge } from './SimulatedBadge';

export interface AssetBreakdownTableProps {
  holdings: readonly SimulatedHolding[];
}

/** Direction glyph + colour token for a cents change (non-colour cue included). */
function direction(changeCents: number): { glyph: string; color: 'primary' | 'danger' | 'textMuted' } {
  if (changeCents > 0) {
    return { glyph: '▲', color: 'primary' };
  }
  if (changeCents < 0) {
    return { glyph: '▼', color: 'danger' };
  }
  return { glyph: '–', color: 'textMuted' };
}

/** Pluralize "share" for a row. */
function sharesLabel(qty: number): string {
  return `${qty} ${qty === 1 ? 'share' : 'shares'}`;
}

export function AssetBreakdownTable({ holdings }: AssetBreakdownTableProps) {
  const theme = useTheme();

  if (holdings.length === 0) {
    return null;
  }

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <View style={styles.titleRow}>
        <Text variant="caption" color="textMuted" accessibilityRole="header">
          Holding-by-holding
        </Text>
        <SimulatedBadge />
      </View>

      {holdings.map((h) => {
        const dir = direction(h.changeCents);
        return (
          <View
            key={h.symbol}
            style={[styles.row, { gap: theme.spacing.md, paddingVertical: theme.spacing.xs }]}
            accessibilityRole="summary"
            accessibilityLabel={[
              `${h.symbol}, ${h.name}`,
              sharesLabel(h.qty),
              `original value ${formatCents(h.currentValueCents)}`,
              `simulated change ${formatPercent(h.changeBasisPoints)}, ${formatSignedCents(h.changeCents)}`,
              `simulated ending value ${formatCents(h.simulatedValueCents)}`,
            ].join(', ')}
          >
            <View style={styles.left}>
              <Text variant="body" color="text" style={styles.symbol}>
                {h.symbol}
              </Text>
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {h.name} · {sharesLabel(h.qty)} · was {formatCents(h.currentValueCents)}
              </Text>
            </View>
            <View style={styles.right}>
              <Text variant="body" color={dir.color}>
                {dir.glyph} {formatPercent(h.changeBasisPoints)}
              </Text>
              <Text variant="caption" color={dir.color}>
                {formatSignedCents(h.changeCents)}
              </Text>
              <Text variant="caption" color="textMuted">
                → {formatCents(h.simulatedValueCents)}
              </Text>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
