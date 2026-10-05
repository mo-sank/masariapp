/**
 * TradeHistoryList (requirement 10.1).
 *
 * Renders the caller's orders newest-first, one {@link TradeHistoryRow} per
 * order, showing side, symbol, quantity, fill price, total, realized P&L (for
 * sells), the rationale tags/note recorded at buy time, and the reflection (if
 * any). Money fields are integer cents formatted with src/lib/money.ts; the
 * orders arrive already ordered `created_at desc` from
 * src/features/trading/use-orders.ts.
 *
 * Reflections are joined by `order_id` from the caller's own RLS-scoped
 * reflections (use-reflections.ts), so reflection text stays private to the
 * learner (requirement 9.3). This component is presentational: the screen owns
 * the queries, the gate, and the loading/empty/error states.
 */
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';
import { formatCents, formatSignedCents } from '../../../lib/money';
import { RATIONALE_CHIPS } from '../order-ticket-logic';
import { reflectionExpectationLabel } from '../reflection-logic';
import type { Database } from '../../../types/db';

type OrderRow = Database['public']['Tables']['orders']['Row'];
type ReflectionRow = Database['public']['Tables']['trade_reflections']['Row'];

export interface TradeHistoryListProps {
  /** The caller's orders, newest first. */
  orders: readonly OrderRow[];
  /** Map from order id to that order's reflection, if one exists. */
  reflectionsByOrder: ReadonlyMap<string, ReflectionRow>;
}

/** Lookup from a stored rationale tag id to its display label. */
const RATIONALE_LABELS = new Map(RATIONALE_CHIPS.map((chip) => [chip.id, chip.label]));

/** Resolve a stored rationale tag id to a friendly label (falls back to the id). */
export function rationaleTagLabel(tagId: string): string {
  return RATIONALE_LABELS.get(tagId) ?? tagId;
}

export function TradeHistoryList({ orders, reflectionsByOrder }: TradeHistoryListProps) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      {orders.map((order) => (
        <TradeHistoryRow
          key={order.id}
          order={order}
          reflection={reflectionsByOrder.get(order.id) ?? null}
        />
      ))}
    </View>
  );
}

/** A single order row with its rationale and reflection. */
function TradeHistoryRow({
  order,
  reflection,
}: {
  order: OrderRow;
  reflection: ReflectionRow | null;
}) {
  const theme = useTheme();
  const isSell = order.side === 'sell';
  const sideLabel = isSell ? 'Sold' : 'Bought';
  const tags = order.rationale_tags ?? [];

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      {/* Header: side, qty, symbol. */}
      <View style={[styles.row, { gap: theme.spacing.md }]}>
        <Text variant="body" color="text" style={styles.heading}>
          {`${sideLabel} ${order.qty} ${order.qty === 1 ? 'share' : 'shares'} of ${order.symbol}`}
        </Text>
      </View>

      <DetailRow label="Price" value={formatCentsOrDash(order.fill_price_cents)} />
      <DetailRow label="Total" value={formatCentsOrDash(order.total_cents)} />

      {/* Realized P&L only makes sense for a sell. The sign is carried in the
          text (formatSignedCents) so meaning never relies on color alone. */}
      {isSell && order.realized_pl_cents != null ? (
        <DetailRow
          label="Realized P&L"
          value={formatSignedCents(order.realized_pl_cents)}
          valueColor={
            order.realized_pl_cents > 0
              ? 'primary'
              : order.realized_pl_cents < 0
                ? 'danger'
                : 'textMuted'
          }
        />
      ) : null}

      {/* Rationale tags recorded at buy time (9.1). */}
      {tags.length > 0 ? (
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="caption" color="textMuted">
            Why
          </Text>
          <Text variant="caption" color="text">
            {tags.map(rationaleTagLabel).join(' · ')}
          </Text>
          {order.rationale_text ? (
            <Text variant="caption" color="textMuted">
              {order.rationale_text}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Reflection recorded after a sell (9.2), private to the learner (9.3). */}
      {reflection ? (
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="caption" color="textMuted">
            Reflection
          </Text>
          <Text variant="caption" color="text">
            {reflectionExpectationLabel(reflection.expectation)}
          </Text>
          {reflection.note ? (
            <Text variant="caption" color="textMuted">
              {reflection.note}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/** A labelled detail row inside a history card. */
function DetailRow({
  label,
  value,
  valueColor = 'text',
}: {
  label: string;
  value: string;
  valueColor?: 'text' | 'primary' | 'danger' | 'textMuted';
}) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { gap: theme.spacing.md }]}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <Text variant="caption" color={valueColor} style={styles.value}>
        {value}
      </Text>
    </View>
  );
}

/** Format cents, or a dash when the value is null. */
function formatCentsOrDash(cents: number | null): string {
  return cents == null ? '—' : formatCents(cents);
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heading: {
    fontWeight: '600',
    flexShrink: 1,
  },
  value: {
    textAlign: 'right',
    flexShrink: 1,
  },
});
