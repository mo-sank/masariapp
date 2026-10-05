/**
 * Guided-trade step — the real guided order ticket (requirements 8.1, 9.1).
 *
 * A `guided_trade` step (schema: `symbols: 'starter'`, `requireRationale: true`,
 * never scored) is where the learner places their first *practice* trade inside
 * the lesson. This used to be a labelled placeholder (lesson-engine spec,
 * requirement 4.7); now that the trading spec's order ticket and the
 * `place_market_order` mutation exist (tasks 13-14), this is the real guided
 * flow — a slimmed-down ticket that matches the full one but lives in the
 * lessons feature and pulls in no route-level concerns.
 *
 * The flow:
 *  1. Pick a STARTER instrument only (useInstruments() filtered to
 *     `is_starter` — matching the step's `symbols: 'starter'`). The full
 *     universe is never shown here.
 *  2. Choose a whole-shares quantity ({@link QuantityStepper}, min 1) and see a
 *     live cost estimate = qty × the current quote price, in integer cents via
 *     src/lib/money.ts (requirement 8.1). The server sets the real fill price;
 *     the client never sends one.
 *  3. A REQUIRED rationale ({@link RationaleChips}): at least one reason chip,
 *     optional 280-char note (requirement 9.1), reusing the real ticket's
 *     chips/logic so the guided flow matches it exactly.
 *  4. Place a BUY via {@link usePlaceOrder} with a client-generated UUID
 *     idempotency key, reused on retry so a timed-out order never double-fills
 *     (requirement 8.5), and no price (requirement 8.1).
 *  5. On success a celebratory confirmation ("You placed your first trade!"),
 *     then a Continue that advances the lesson via `onContinue`.
 *
 * The lesson-engine contract (requirement 4.8) is preserved: a `guided_trade`
 * step is NEVER scored, so this component never calls `onAnswer` — it only ever
 * advances with `onContinue`. Placing the trade is practice, not a graded gate:
 * if the learner cannot buy yet, has no starter to trade, or the order errors,
 * the step shows friendly copy and still offers Continue so the lesson is never
 * a dead end.
 *
 * Design reference: `.kiro/specs/lesson-engine/design.md`
 * ("components/steps/*: ... GuidedTradeStep (placeholder until trading spec)" —
 * now the real step) and `.kiro/specs/market-data-paper-trading/design.md`
 * ("Order ticket flow").
 */

import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { StepComponentProps } from './types';
import { Button, Card, Disclaimer, Text } from '../../../../components/ui';
import { useTheme } from '../../../../theme/theme-provider';
import { formatCents } from '../../../../lib/money';
import { useInstruments } from '../../../explore/use-instruments';
import { useQuote } from '../../../explore/use-quotes';
import {
  BUY_FEATURE_KEY,
  canSubmitOrder,
  estimateTotalCents,
} from '../../../trading/order-ticket-logic';
import { QuantityStepper } from '../../../trading/components/quantity-stepper';
import { RationaleChips } from '../../../trading/components/rationale-chips';
import {
  mapPlaceOrderError,
  newIdempotencyKey,
  usePlaceOrder,
} from '../../../trading/use-place-order';
import { useSession } from '../../../../lib/auth0';
import { useUnlocks } from '../../hooks/use-unlocks';
import type { GuidedTradeStep as GuidedTradeStepType } from '../../schema';
import type { Database } from '../../../../types/db';

type OrderRow = Database['public']['Tables']['orders']['Row'];

export function GuidedTradeStep({ onContinue }: StepComponentProps<GuidedTradeStepType>) {
  const theme = useTheme();
  const { isSignedIn } = useSession();

  const instruments = useInstruments();
  const unlocks = useUnlocks(isSignedIn);
  const placeOrder = usePlaceOrder();

  // Starter-only choices (requirement 4.1 / the step's `symbols: 'starter'`):
  // never the full universe.
  const starters = useMemo(
    () => (instruments.data ?? []).filter((i) => i.is_starter),
    [instruments.data],
  );

  const canBuy = useMemo(
    () => new Set((unlocks.data ?? []).map((u) => u.feature_key)).has(BUY_FEATURE_KEY),
    [unlocks.data],
  );

  const [symbol, setSymbol] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<OrderRow | null>(null);

  // One idempotency key per guided-step session, reused on retry (8.5).
  const idempotencyKey = useRef(newIdempotencyKey());

  const quote = useQuote(symbol ?? '', isSignedIn && symbol != null);
  const priceCents = quote.data?.price_cents ?? null;
  const estimateCents = estimateTotalCents(qty, priceCents);

  // Rationale is always required for a guided_trade (schema: requireRationale).
  const submitDisabled = !canSubmitOrder({
    qty,
    pending: placeOrder.isPending,
    rationaleRequired: true,
    selectedTags,
    note,
  });

  // Success: celebrate, then let the learner continue the lesson (never scored).
  if (confirmed) {
    return (
      <Card style={[styles.card, { gap: theme.spacing.md }]}>
        <Text variant="caption" color="textMuted" accessibilityRole="header">
          Guided trade
        </Text>
        <Text variant="title">You placed your first trade! 🎉</Text>
        <Text variant="body" color="textMuted">
          {`You bought ${confirmed.qty} ${
            confirmed.qty === 1 ? 'share' : 'shares'
          } of ${confirmed.symbol} with paper money. Nice work writing down why.`}
        </Text>
        <Disclaimer />
        <Button
          title="Continue"
          variant="primary"
          onPress={onContinue}
          accessibilityLabel="Continue to the next step"
        />
      </Card>
    );
  }

  // The learner hasn't unlocked buying yet, or there is no starter to trade:
  // the step is practice, not a gate, so show honest copy and still allow
  // continuing — the lesson is never a dead end.
  if (!canBuy || starters.length === 0) {
    return (
      <Card style={[styles.card, { gap: theme.spacing.md }]}>
        <Text variant="caption" color="textMuted" accessibilityRole="header">
          Guided trade
        </Text>
        <Text variant="title">Place your first practice trade</Text>
        <Text variant="body" color="textMuted">
          {canBuy
            ? "There's no starter stock to practice with right now. You can keep going and trade later from Explore."
            : 'Trading unlocks a little further along. You can keep going and come back to place your first trade.'}
        </Text>
        <Button
          title="Continue"
          variant="primary"
          onPress={onContinue}
          accessibilityLabel="Continue to the next step"
        />
      </Card>
    );
  }

  const onSubmit = () => {
    if (symbol == null) {
      return;
    }
    setErrorText(null);
    placeOrder.mutate(
      {
        symbol,
        side: 'buy',
        qty,
        idempotencyKey: idempotencyKey.current,
        rationaleTags: selectedTags,
        rationaleText: note.length > 0 ? note : null,
      },
      {
        onSuccess: (order) => setConfirmed(order),
        // Keep the step open with friendly copy (8.7); the same idempotency key
        // is reused on retry (8.5).
        onError: (error) => setErrorText(mapPlaceOrderError(error)),
      },
    );
  };

  return (
    <Card style={[styles.card, { gap: theme.spacing.md }]}>
      <Text variant="caption" color="textMuted" accessibilityRole="header">
        Guided trade
      </Text>
      <Text variant="title">Place your first practice trade</Text>
      <Text variant="body" color="textMuted">
        Pick a starter stock, choose how many shares, and write why you&apos;re
        buying it. It&apos;s all paper money.
      </Text>

      {/* Starter-only picker. */}
      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="body" color="text">
          Choose a starter stock
        </Text>
        <View style={[styles.chips, { gap: theme.spacing.sm }]}>
          {starters.map((inst) => {
            const selected = inst.symbol === symbol;
            return (
              <Pressable
                key={inst.symbol}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: placeOrder.isPending }}
                accessibilityLabel={`${inst.symbol} ${inst.name}`}
                disabled={placeOrder.isPending}
                onPress={() => setSymbol(inst.symbol)}
                style={[
                  styles.chip,
                  {
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                    backgroundColor: selected ? theme.colors.primary : 'transparent',
                    borderRadius: theme.radii.md,
                    paddingVertical: theme.spacing.sm,
                    paddingHorizontal: theme.spacing.md,
                  },
                ]}
              >
                <Text variant="caption" color={selected ? 'onPrimary' : 'text'}>
                  {inst.symbol}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {symbol != null ? (
        <>
          {/* Quantity. */}
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="body" color="textMuted">
              Shares
            </Text>
            <QuantityStepper value={qty} onChange={setQty} disabled={placeOrder.isPending} />
          </View>

          {/* Live estimate (8.1): qty × current price, in cents. */}
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="body" color="textMuted">
              Estimated cost
            </Text>
            <Text
              variant="title"
              color="text"
              accessibilityLabel={`Estimated cost ${formatCents(estimateCents)}`}
            >
              {formatCents(estimateCents)}
            </Text>
            <Text variant="caption" color="textMuted">
              Estimate only. Fills at the latest price.
            </Text>
          </View>

          {/* Required rationale (9.1). */}
          <RationaleChips
            selectedTags={selectedTags}
            onChangeTags={setSelectedTags}
            note={note}
            onChangeNote={setNote}
            disabled={placeOrder.isPending}
          />
        </>
      ) : null}

      {/* Error (8.7): keep the step open with friendly copy. */}
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

      <Disclaimer />

      <View style={[styles.actions, { gap: theme.spacing.sm }]}>
        <Button
          title={symbol != null ? `Buy ${symbol}` : 'Buy'}
          variant="primary"
          onPress={onSubmit}
          loading={placeOrder.isPending}
          disabled={symbol == null || submitDisabled}
          accessibilityLabel={symbol != null ? `Buy ${symbol}` : 'Buy'}
        />
        {/* Practice, not a gate: let the learner move on even without trading. */}
        <Button
          title="Skip for now"
          variant="secondary"
          onPress={onContinue}
          disabled={placeOrder.isPending}
          accessibilityLabel="Skip the trade and continue"
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%' },
  actions: { width: '100%' },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  error: {
    borderWidth: 1,
  },
});
