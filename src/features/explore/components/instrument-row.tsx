/**
 * InstrumentRow (requirements 4.1, 4.2).
 *
 * One tappable row in the Explore list: symbol and company name on the left,
 * price and day change on the right. Starter instruments carry a small "Starter"
 * tag so the familiar names stand out (requirement 4.1). Tapping the row opens
 * the stock detail page for its symbol.
 *
 * Price is formatted from integer cents (see lib/money); a row whose quote has
 * not been ingested yet shows a muted dash instead of a price. Purely
 * presentational — the caller supplies the joined item and the tap handler.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { PriceChange } from './price-change';
import { Text } from '../../../components/ui';
import { formatCents } from '../../../lib/money';
import { useTheme } from '../../../theme/theme-provider';
import type { ExploreListItem } from '../use-explore-list';
import { getYouthSubtitle } from '../youth-tags';

export interface InstrumentRowProps {
  item: ExploreListItem;
  /** Called with the instrument's symbol when the row is pressed. */
  onPress: (symbol: string) => void;
}

export function InstrumentRow({ item, onPress }: InstrumentRowProps) {
  const theme = useTheme();
  const { instrument, quote } = item;
  const priceText = quote ? formatCents(quote.price_cents) : '—';
  const youthSubtitle = getYouthSubtitle(instrument.symbol);

  // A concise spoken summary so a screen reader does not read each cell in turn.
  const a11yLabel = [
    instrument.symbol,
    instrument.name,
    youthSubtitle,
    instrument.is_starter ? 'starter' : null,
    quote ? priceText : 'price unavailable',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={() => onPress(instrument.symbol)}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.md,
          paddingVertical: theme.spacing.md - 2,
          paddingHorizontal: theme.spacing.md,
          gap: theme.spacing.md,
        },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.left}>
        <View style={[styles.symbolRow, { gap: theme.spacing.sm }]}>
          <Text variant="body" color="text" style={styles.symbol}>
            {instrument.symbol}
          </Text>
          {instrument.is_starter ? (
            <View
              style={[
                styles.tag,
                {
                  backgroundColor: theme.colors.primary,
                  borderRadius: theme.radii.sm,
                  paddingHorizontal: theme.spacing.sm,
                  paddingVertical: 2,
                },
              ]}
            >
              <Text variant="caption" color="onPrimary" style={{ fontWeight: '700', fontSize: 11 }}>
                Starter
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {instrument.name}
        </Text>
        {youthSubtitle ? (
          <Text variant="caption" color="primary" numberOfLines={1} style={styles.youthSubtitle}>
            {youthSubtitle}
          </Text>
        ) : null}
      </View>

      <View style={styles.right}>
        <Text variant="body" color="text" style={styles.price}>
          {priceText}
        </Text>
        {quote ? (
          <PriceChange
            priceCents={quote.price_cents}
            prevCloseCents={quote.prev_close_cents}
            variant="caption"
          />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: 1.5,
    borderBottomWidth: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  left: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  symbol: {
    fontWeight: '700',
  },
  youthSubtitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  price: {
    fontWeight: '700',
    textAlign: 'right',
  },
  right: {
    alignItems: 'flex-end',
    gap: 2,
  },
  tag: {
    alignSelf: 'center',
  },
  pressed: {
    transform: [{ translateY: 1 }],
    opacity: 0.9,
  },
});
