import { router } from 'expo-router';
import { useMemo } from 'react';

import { Disclaimer, LockedState, Screen, StateView, Text } from '../src/components/ui';
import { getLesson } from '../src/features/lessons/content';
import { useUnlocks } from '../src/features/lessons/hooks/use-unlocks';
import { TradeHistoryList } from '../src/features/trading/components';
import { useOrders } from '../src/features/trading/use-orders';
import { reflectionsByOrderId, useReflections } from '../src/features/trading/use-reflections';
import { useSession } from '../src/lib/auth0';
import { useTheme } from '../src/theme/theme-provider';

/**
 * Trade history screen (requirements 9.3, 10.1).
 *
 * Shows the caller's past orders newest-first with side, symbol, quantity,
 * price, total, realized P&L (for sells), the rationale recorded at buy time,
 * and the reflection recorded after a sell. The screen is gated on the
 * `trade_history` feature: until the learner completes the lesson that grants it
 * ("Win, Lose, or Hold", L1.5) it shows a {@link LockedState} naming that lesson
 * rather than a dead end. Fail closed — while unlocks load or error we treat the
 * history as locked so trades never flash before the gate resolves.
 *
 * Orders and reflections are read through their RLS-scoped hooks and joined by
 * `order_id`, so reflection text stays private to the learner (requirement 9.3).
 * This route stays thin: it owns the gate, navigation, and loading/empty/error
 * states; the list rendering and integer-cents formatting live in
 * {@link TradeHistoryList}.
 */

/** The feature key this screen is gated on (seed catalog: trade_history -> L1.5). */
const HISTORY_FEATURE_KEY = 'trade_history';
/** The lesson that unlocks trade history, resolved from the bundled catalog. */
const HISTORY_UNLOCK_LESSON_ID = 'L1.5';

export default function TradeHistoryScreen() {
  const { isSignedIn } = useSession();
  const unlocks = useUnlocks(isSignedIn);

  const isUnlocked = useMemo(
    () => (unlocks.data ?? []).some((u) => u.feature_key === HISTORY_FEATURE_KEY),
    [unlocks.data],
  );

  // Gate: while loading or on error, fail closed (treat as locked).
  if (!isUnlocked) {
    const lessonTitle = getLesson(HISTORY_UNLOCK_LESSON_ID)?.title ?? 'Win, Lose, or Hold';
    return (
      <Screen center>
        <LockedState
          featureName="Trade history"
          unlockedByLesson={lessonTitle}
          actionLabel="Go to Learn"
          onAction={() => router.push('/(tabs)/learn')}
        />
      </Screen>
    );
  }

  return <TradeHistoryView isSignedIn={isSignedIn} />;
}

/** The unlocked history UI, split out so queries run only once the gate passes. */
function TradeHistoryView({ isSignedIn }: { isSignedIn: boolean }) {
  const theme = useTheme();
  const orders = useOrders(isSignedIn);
  const reflections = useReflections(isSignedIn);

  const isLoading = orders.isLoading || reflections.isLoading;
  const isError = orders.isError || reflections.isError;

  const reflectionsByOrder = useMemo(
    () => reflectionsByOrderId(reflections.data ?? []),
    [reflections.data],
  );

  const refetch = () => {
    void orders.refetch();
    void reflections.refetch();
  };

  if (isLoading) {
    return (
      <Screen>
        <StateView kind="loading" />
      </Screen>
    );
  }

  if (isError || !orders.data) {
    return (
      <Screen>
        <StateView
          kind="error"
          message="We couldn't load your trade history. Please try again."
          onRetry={refetch}
        />
      </Screen>
    );
  }

  if (orders.data.length === 0) {
    return (
      <Screen scroll style={{ gap: theme.spacing.lg }}>
        <Text variant="title" accessibilityRole="header">
          Trade history
        </Text>
        <StateView
          kind="empty"
          title="No trades yet"
          message="Place your first paper trade and it'll show up here with your reasons."
        />
        <Disclaimer />
      </Screen>
    );
  }

  return (
    <Screen scroll style={{ gap: theme.spacing.lg }}>
      <Text variant="title" accessibilityRole="header">
        Trade history
      </Text>
      <TradeHistoryList orders={orders.data} reflectionsByOrder={reflectionsByOrder} />
      <Disclaimer />
    </Screen>
  );
}
