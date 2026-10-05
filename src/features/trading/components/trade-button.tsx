/**
 * TradeButton (requirements 8.1, 8.2, 8.3).
 *
 * The entry point to the order ticket from the stock detail page. It self-gates
 * on the trading unlocks: a learner who has unlocked either buying
 * (`market_buy`) or selling (`market_sell`) sees an active "Trade" button that
 * routes to `/trade/[symbol]`; until then it shows a lock hint naming the
 * lesson that unlocks the first trade (requirement 5.1 pattern), matching how
 * {@link WatchlistButton} gates itself.
 *
 * We fail closed — while unlocks load or error the button stays locked so it
 * never flashes active. The side gates and all order rules are re-enforced
 * server-side by `place_market_order`; this control only decides visibility and
 * navigation.
 */
import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '../../../components/ui';
import { getLesson } from '../../lessons/content';
import { useUnlocks } from '../../lessons/hooks/use-unlocks';
import { useTheme } from '../../../theme/theme-provider';
import { BUY_FEATURE_KEY, SELL_FEATURE_KEY } from '../order-ticket-logic';

/** The lesson that unlocks the first trade (grants `market_buy`). */
export const TRADE_UNLOCK_LESSON_ID = 'L1.4';
/** Fallback title if the lesson content is unavailable. */
const TRADE_LESSON_FALLBACK_TITLE = 'Your First Trade';

export interface TradeButtonProps {
  /** The company symbol this button trades. */
  symbol: string;
  /** Whether a user is signed in; gates the unlock query. */
  isSignedIn: boolean;
}

export function TradeButton({ symbol, isSignedIn }: TradeButtonProps) {
  const unlocks = useUnlocks(isSignedIn);

  const unlockedKeys = useMemo(
    () => new Set((unlocks.data ?? []).map((u) => u.feature_key)),
    [unlocks.data],
  );
  // Active once either side is unlocked; fail closed while loading/errored.
  const canTrade = unlockedKeys.has(BUY_FEATURE_KEY) || unlockedKeys.has(SELL_FEATURE_KEY);

  if (!canTrade) {
    return <TradeLockHint />;
  }

  return (
    <Button
      title="Trade"
      onPress={() => router.push(`/trade/${symbol}`)}
      accessibilityLabel={`Trade ${symbol}`}
    />
  );
}

/** The lock hint shown in place of the button while trading is locked. */
function TradeLockHint() {
  const theme = useTheme();
  const lessonTitle = getLesson(TRADE_UNLOCK_LESSON_ID)?.title ?? TRADE_LESSON_FALLBACK_TITLE;
  return (
    <View
      accessibilityRole="text"
      style={[
        styles.hint,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.sm,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
        },
      ]}
    >
      <Text variant="caption" color="textMuted">
        {`🔒 Complete "${lessonTitle}" to place your first trade.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    borderWidth: 1,
  },
});
