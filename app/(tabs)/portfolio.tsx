import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, View } from 'react-native';

import { Button, Disclaimer, LockedState, Screen, StateView, Text } from '../../src/components/ui';
import { getLesson } from '../../src/features/lessons/content';
import { useUnlocks } from '../../src/features/lessons/hooks/use-unlocks';
import { PortfolioSummary, PositionRow } from '../../src/features/portfolio/components';
import { usePortfolio, type PortfolioPosition } from '../../src/features/portfolio/use-portfolio';
import { useSession } from '../../src/lib/auth0';
import { useTheme } from '../../src/theme/theme-provider';

/**
 * Portfolio tab (requirements 7.1, 7.2, 7.3, 7.4).
 *
 * The paper-trading portfolio. The tab is gated on the `portfolio` feature:
 * until the learner completes the lesson that grants it ("Your First Trade",
 * L1.4), the tab shows a {@link LockedState} naming that lesson (requirement
 * 7.2) rather than a dead end. Fail closed — while unlocks are loading or errored
 * we treat the portfolio as locked so figures never flash before the gate
 * resolves.
 *
 * Unlocked, it renders:
 *  - a {@link PortfolioSummary} header card with total equity, total gain/loss
 *    versus starting cash (dollars and percent), and cash (requirement 7.1),
 *    labelled "Paper money" (requirement 7.4);
 *  - a {@link PositionRow} per holding showing symbol, shares, average cost,
 *    current price, market value, and unrealized gain/loss in dollars and
 *    percent (requirement 7.2);
 *  - an empty state inviting the learner to Explore when they hold only cash
 *    (requirement 7.3); and
 *  - the persistent not-advice {@link Disclaimer} (requirement 7.4).
 *
 * All assembly and integer-cents math lives in {@link usePortfolio}; this screen
 * owns only the gate, navigation, and the loading/empty/error states.
 */

/** The feature key this tab is gated on (seed catalog: portfolio -> L1.4). */
const PORTFOLIO_FEATURE_KEY = 'portfolio';
/** The lesson that unlocks the portfolio, resolved from the bundled catalog. */
const PORTFOLIO_UNLOCK_LESSON_ID = 'L1.4';

export default function PortfolioScreen() {
  const theme = useTheme();
  const { isSignedIn } = useSession();
  const unlocks = useUnlocks(isSignedIn);

  const isUnlocked = useMemo(
    () => (unlocks.data ?? []).some((u) => u.feature_key === PORTFOLIO_FEATURE_KEY),
    [unlocks.data],
  );

  // Gate: while loading or on error, fail closed (treat as locked).
  if (!isUnlocked) {
    const lessonTitle = getLesson(PORTFOLIO_UNLOCK_LESSON_ID)?.title ?? 'Your First Trade';
    return (
      <Screen center>
        <LockedState
          featureName="Portfolio"
          unlockedByLesson={lessonTitle}
          actionLabel="Go to Learn"
          onAction={() => router.push('/(tabs)/learn')}
        />
      </Screen>
    );
  }

  return <PortfolioView theme={theme} />;
}

/** The unlocked portfolio UI, split out so hooks run only once the gate passes. */
function PortfolioView({ theme }: { theme: ReturnType<typeof useTheme> }) {
  const { data, isLoading, isError, refetch } = usePortfolio();

  if (isLoading) {
    return (
      <Screen>
        <StateView kind="loading" />
      </Screen>
    );
  }

  if (isError || !data) {
    return (
      <Screen>
        <StateView
          kind="error"
          message="We couldn't load your portfolio. Please try again."
          onRetry={refetch}
        />
      </Screen>
    );
  }

  const header = (
    <View style={{ gap: theme.spacing.md }}>
      <Text variant="title" accessibilityRole="header">
        Portfolio
      </Text>
      <PortfolioSummary portfolio={data} />
      <Button
        title="View trade history"
        variant="secondary"
        onPress={() => router.push('/history')}
      />
      {data.positions.length > 0 ? (
        <Text variant="caption" color="textMuted" accessibilityRole="header">
          Holdings
        </Text>
      ) : null}
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={data.positions}
        keyExtractor={(item) => item.symbol}
        renderItem={({ item }: { item: PortfolioPosition }) => <PositionRow position={item} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={{ gap: theme.spacing.md, paddingTop: theme.spacing.lg }}>
            <StateView
              kind="empty"
              title="No holdings yet"
              message="You're holding only cash. Explore the market to make your first paper trade."
            />
            <Button
              title="Explore the market"
              variant="primary"
              onPress={() => router.push('/(tabs)/explore')}
            />
          </View>
        }
        ListFooterComponent={<Disclaimer style={{ marginTop: theme.spacing.md }} />}
        contentContainerStyle={{ gap: theme.spacing.sm, paddingBottom: theme.spacing.xl }}
      />
    </Screen>
  );
}
