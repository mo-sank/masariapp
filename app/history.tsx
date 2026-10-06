import { useMemo } from 'react';

import { Disclaimer, Screen, StateView, Text } from '../src/components/ui';
import { Gate } from '../src/features/progress/components/Gate';
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
 * `trade_history` feature through the shared {@link Gate} (progression spec,
 * requirements 1.3, 1.5): until the learner completes the lesson that grants it
 * ("Win, Lose, or Hold", L1.5) it shows a {@link LockedState} naming that lesson
 * with a button that opens it, rather than a dead end. The gate fails closed —
 * while unlocks load it shows a loading placeholder, and if the unlocks query
 * errors it shows a retry — so trades never flash before the gate resolves.
 *
 * Orders and reflections are read through their RLS-scoped hooks and joined by
 * `order_id`, so reflection text stays private to the learner (requirement 9.3).
 * This route stays thin: it owns navigation and loading/empty/error states; the
 * list rendering and integer-cents formatting live in {@link TradeHistoryList}.
 */

export default function TradeHistoryScreen() {
  const { isSignedIn } = useSession();

  return (
    <Gate feature="trade_history" isSignedIn={isSignedIn} loadingFallback={<HistoryLoading />}>
      <TradeHistoryView isSignedIn={isSignedIn} />
    </Gate>
  );
}

/** Full-screen loading placeholder shown while the unlock check resolves. */
function HistoryLoading() {
  return (
    <Screen>
      <StateView kind="loading" />
    </Screen>
  );
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
