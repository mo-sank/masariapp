/**
 * OrderConfirmation (requirement 8.4).
 *
 * The success view shown after `place_market_order` fills an order. It reports
 * the server-authoritative details the requirement calls out — fill price,
 * quantity, total, and price source — all read straight off the returned
 * `orders` row (never recomputed on the client). Money fields are integer cents
 * formatted with src/lib/money.ts.
 *
 * `price_source` is `'delayed_quote'` while the market is open and
 * `'last_close'` when it is closed; we translate those codes into plain copy so
 * a learner understands where the price came from (requirement 8.6).
 */
import { StyleSheet, View } from 'react-native';

import { Button, Card, Disclaimer, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';
import { formatCents } from '../../../lib/money';
import type { Database } from '../../../types/db';

type OrderRow = Database['public']['Tables']['orders']['Row'];

export interface OrderConfirmationProps {
  /** The filled order returned by place_market_order. */
  order: OrderRow;
  /** Called when the learner dismisses the confirmation (e.g. close/Done). */
  onDone: () => void;
}

/** Plain-language label for the server's price_source code (8.6). */
export function priceSourceLabel(source: string | null): string {
  switch (source) {
    case 'last_close':
      return 'Last close (market closed)';
    case 'delayed_quote':
      return 'Delayed quote';
    default:
      return '—';
  }
}

export function OrderConfirmation({ order, onDone }: OrderConfirmationProps) {
  const theme = useTheme();
  const sideVerb = order.side === 'buy' ? 'Bought' : 'Sold';

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Text variant="title" color="text" accessibilityRole="header">
        Order filled 🎉
      </Text>

      <Text variant="body" color="text">
        {`${sideVerb} ${order.qty} ${order.qty === 1 ? 'share' : 'shares'} of ${order.symbol}.`}
      </Text>

      <Card style={{ gap: theme.spacing.sm }}>
        <DetailRow label="Fill price" value={formatCentsOrDash(order.fill_price_cents)} />
        <DetailRow label="Quantity" value={String(order.qty)} />
        <DetailRow label="Total" value={formatCentsOrDash(order.total_cents)} />
        <DetailRow label="Price source" value={priceSourceLabel(order.price_source)} />
      </Card>

      <Disclaimer />

      <Button title="Done" onPress={onDone} accessibilityLabel="Done" />
    </View>
  );
}

/** A labelled detail row inside the confirmation card. */
function DetailRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { gap: theme.spacing.md }]}>
      <Text variant="body" color="textMuted">
        {label}
      </Text>
      <Text variant="body" color="text" style={styles.value}>
        {value}
      </Text>
    </View>
  );
}

/** Format cents, or a dash when the value is null (should not happen on fill). */
function formatCentsOrDash(cents: number | null): string {
  return cents == null ? '—' : formatCents(cents);
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  value: {
    textAlign: 'right',
    flexShrink: 1,
  },
});
