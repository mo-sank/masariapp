/**
 * OrderTicket (requirements 8.1, 8.4, 8.5, 8.6, 8.7, 9.1).
 *
 * The order-entry body behind the `trade/[symbol]` modal route. It joins the
 * current quote, the market status, and the learner's unlocks into one flow:
 *
 *  1. Buy/Sell side toggle (each side gated by its own unlock — a learner who
 *     has only unlocked buying cannot switch to sell).
 *  2. A whole-shares {@link QuantityStepper} (min 1).
 *  3. A live cost estimate = qty × the current quote price, in integer cents
 *     via src/lib/money.ts, labelled as an estimate (the server sets the real
 *     fill price — requirement 8.1).
 *  4. When `pre_trade_rationale` is unlocked AND the side is buy, a required
 *     {@link RationaleChips} picker: at least one reason, optional 280-char note
 *     (requirement 9.1).
 *  5. When the market is closed, wording that the order fills at the last close
 *     (requirement 8.6).
 *  6. An idempotent submit (requirement 8.5): one UUID per ticket session,
 *     reused on retry, so a timed-out order never double-fills. The button is
 *     disabled while pending.
 *  7. On success an {@link OrderConfirmation} with fill price, quantity, total,
 *     and price source (requirement 8.4). On failure the ticket stays open and
 *     shows friendly copy mapped from the server error code (requirement 8.7).
 *  8. When a SELL fills AND `post_trade_reflection` is unlocked, a
 *     {@link ReflectionSheet} prompts the learner before the confirmation
 *     ("Did it go better, as expected, or worse?", requirement 9.2); its note
 *     is private to the learner (requirement 9.3). The learner can submit or
 *     skip, after which the usual confirmation shows.
 *
 * The ticket owns no business rules beyond input shaping — cash, cap,
 * eligibility, and the fill price are all decided server-side by
 * `place_market_order`.
 */
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Disclaimer, Screen, Text } from '../../../components/ui';
import { useUnlocks } from '../../lessons/hooks/use-unlocks';
import { useTheme } from '../../../theme/theme-provider';
import { formatCents } from '../../../lib/money';
import { useQuote } from '../../explore/use-quotes';
import { useMarketStatus } from '../use-market-status';
import {
  mapPlaceOrderError,
  newIdempotencyKey,
  usePlaceOrder,
  type OrderSide,
} from '../use-place-order';
import {
  BUY_FEATURE_KEY,
  RATIONALE_FEATURE_KEY,
  SELL_FEATURE_KEY,
  canSubmitOrder,
  estimateTotalCents,
} from '../order-ticket-logic';
import { REFLECTION_FEATURE_KEY } from '../reflection-logic';
import { OrderConfirmation } from './order-confirmation';
import { QuantityStepper } from './quantity-stepper';
import { RationaleChips } from './rationale-chips';
import { ReflectionSheet } from './reflection-sheet';
import type { Database } from '../../../types/db';

type OrderRow = Database['public']['Tables']['orders']['Row'];

export interface OrderTicketProps {
  /** The instrument symbol being traded (already upper-cased). */
  symbol: string;
  /** Whether a user is signed in; gates the unlock + quote queries. */
  isSignedIn: boolean;
  /** Called when the learner dismisses the ticket after a filled order. */
  onClose: () => void;
}

export function OrderTicket({ symbol, isSignedIn, onClose }: OrderTicketProps) {
  const theme = useTheme();
  const unlocks = useUnlocks(isSignedIn);
  const quote = useQuote(symbol, isSignedIn);
  const market = useMarketStatus();
  const placeOrder = usePlaceOrder();

  const unlockedKeys = useMemo(
    () => new Set((unlocks.data ?? []).map((u) => u.feature_key)),
    [unlocks.data],
  );
  const canBuy = unlockedKeys.has(BUY_FEATURE_KEY);
  const canSell = unlockedKeys.has(SELL_FEATURE_KEY);
  const rationaleUnlocked = unlockedKeys.has(RATIONALE_FEATURE_KEY);
  const reflectionUnlocked = unlockedKeys.has(REFLECTION_FEATURE_KEY);

  // Default to whichever side the learner can use; buy wins when both.
  const [side, setSide] = useState<OrderSide>('buy');
  const [qty, setQty] = useState(1);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<OrderRow | null>(null);
  // When a sell fills and reflection is unlocked, prompt the reflection sheet
  // before the confirmation (requirement 9.2). Holds the filled order until the
  // learner submits or skips.
  const [reflecting, setReflecting] = useState<OrderRow | null>(null);

  // One idempotency key per ticket session, reused on every retry (8.5).
  const idempotencyKey = useRef(newIdempotencyKey());

  // Rationale is required only for a buy once the rationale feature is unlocked.
  const rationaleRequired = side === 'buy' && rationaleUnlocked;

  const priceCents = quote.data?.price_cents ?? null;
  const estimateCents = estimateTotalCents(qty, priceCents);
  const marketClosed = market.data?.isOpen === false;

  // The ticket is unusable if the learner cannot trade either side yet.
  if (!canBuy && !canSell) {
    return (
      <Screen scroll style={{ gap: theme.spacing.lg }}>
        <TicketHeader symbol={symbol} />
        <Text variant="body" color="textMuted">
          Finish the trading lesson to unlock buying and selling.
        </Text>
        <Button title="Close" variant="secondary" onPress={onClose} />
      </Screen>
    );
  }

  // A filled sell with reflection unlocked: prompt the reflection first (9.2),
  // then fall through to the confirmation once the learner submits or skips.
  if (reflecting) {
    return (
      <Screen scroll style={{ gap: theme.spacing.lg }}>
        <ReflectionSheet
          orderId={reflecting.id}
          symbol={reflecting.symbol}
          onDone={() => {
            setConfirmed(reflecting);
            setReflecting(null);
          }}
        />
      </Screen>
    );
  }

  // Success: show the confirmation instead of the form (8.4).
  if (confirmed) {
    return (
      <Screen scroll style={{ gap: theme.spacing.lg }}>
        <OrderConfirmation order={confirmed} onDone={onClose} />
      </Screen>
    );
  }

  const submitDisabled = !canSubmitOrder({
    qty,
    pending: placeOrder.isPending,
    rationaleRequired,
    selectedTags,
    note,
  });

  const onSubmit = () => {
    setErrorText(null);
    placeOrder.mutate(
      {
        symbol,
        side,
        qty,
        idempotencyKey: idempotencyKey.current,
        rationaleTags: rationaleRequired ? selectedTags : [],
        rationaleText: rationaleRequired && note.length > 0 ? note : null,
      },
      {
        onSuccess: (order) => {
          // A filled sell with reflection unlocked prompts the reflection sheet
          // first (9.2); otherwise go straight to the confirmation (8.4).
          if (order.side === 'sell' && reflectionUnlocked) {
            setReflecting(order);
          } else {
            setConfirmed(order);
          }
        },
        // Keep the ticket open and show friendly copy (8.7). The same
        // idempotency key is reused on retry (8.5).
        onError: (error) => setErrorText(mapPlaceOrderError(error)),
      },
    );
  };

  return (
    <Screen scroll style={{ gap: theme.spacing.lg }}>
      <TicketHeader symbol={symbol} />

      {/* Buy/Sell toggle, each side gated by its own unlock. */}
      <View style={[styles.sideRow, { gap: theme.spacing.md }]}>
        <Button
          title="Buy"
          variant={side === 'buy' ? 'primary' : 'secondary'}
          disabled={!canBuy}
          onPress={() => setSide('buy')}
          accessibilityLabel="Buy"
        />
        <Button
          title="Sell"
          variant={side === 'sell' ? 'primary' : 'secondary'}
          disabled={!canSell}
          onPress={() => setSide('sell')}
          accessibilityLabel="Sell"
        />
      </View>

      {/* Quantity. */}
      <Card style={{ gap: theme.spacing.md }}>
        <Text variant="body" color="textMuted">
          Shares
        </Text>
        <QuantityStepper value={qty} onChange={setQty} disabled={placeOrder.isPending} />
      </Card>

      {/* Live estimate (8.1): qty × current price, in cents. */}
      <Card style={{ gap: theme.spacing.xs }}>
        <Text variant="body" color="textMuted">
          Estimated {side === 'buy' ? 'cost' : 'proceeds'}
        </Text>
        <Text variant="title" color="text" accessibilityLabel={`Estimated total ${formatCents(estimateCents)}`}>
          {formatCents(estimateCents)}
        </Text>
        <Text variant="caption" color="textMuted">
          Estimate only. Fills at the latest price.
        </Text>
      </Card>

      {/* Rationale (9.1) — required on a buy once unlocked. */}
      {rationaleRequired ? (
        <Card>
          <RationaleChips
            selectedTags={selectedTags}
            onChangeTags={setSelectedTags}
            note={note}
            onChangeNote={setNote}
            disabled={placeOrder.isPending}
          />
        </Card>
      ) : null}

      {/* Market-closed wording (8.6). */}
      {marketClosed ? (
        <Text variant="caption" color="textMuted">
          The market is closed. This order will fill at the last close.
        </Text>
      ) : null}

      {/* Error (8.7): keep the ticket open and show friendly copy. */}
      {errorText ? (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          style={[
            styles.error,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.danger,
              borderRadius: theme.radii.sm,
              padding: theme.spacing.md,
            },
          ]}
        >
          <Text variant="body" color="danger">
            {errorText}
          </Text>
        </View>
      ) : null}

      <Button
        title={side === 'buy' ? `Buy ${symbol}` : `Sell ${symbol}`}
        onPress={onSubmit}
        loading={placeOrder.isPending}
        disabled={submitDisabled}
        accessibilityLabel={side === 'buy' ? `Buy ${symbol}` : `Sell ${symbol}`}
      />

      <Disclaimer />
    </Screen>
  );
}

/** The ticket's title header. */
function TicketHeader({ symbol }: { symbol: string }) {
  return (
    <Text variant="title" color="text" accessibilityRole="header">
      {`Trade ${symbol}`}
    </Text>
  );
}

const styles = StyleSheet.create({
  sideRow: {
    flexDirection: 'row',
  },
  error: {
    borderWidth: 1,
  },
});
