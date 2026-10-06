import { router } from 'expo-router';
import { FlatList, View } from 'react-native';

import { Button, Disclaimer, Screen, StateView, Text } from '../../src/components/ui';
import { PortfolioSummary, PositionRow } from '../../src/features/portfolio/components';
import { usePortfolio, type PortfolioPosition } from '../../src/features/portfolio/use-portfolio';
import { Gate } from '../../src/features/progress/components/Gate';
import { useSession } from '../../src/lib/auth0';
import { useTheme } from '../../src/theme/theme-provider';

/**
 * Portfolio tab (requirements 7.1, 7.2, 7.3, 7.4).
 *
 * The paper-trading portfolio. The tab is gated on the `portfolio` feature
 * through the shared {@link Gate} (progression spec, requirements 1.3, 1.5):
 * until the learner completes the lesson that grants it ("Your First Trade",
 * L1.4), the tab shows a {@link LockedState} naming that lesson with a button
 * that opens it, rather than a dead end. The gate fails closed — while unlocks
 * load it shows a loading placeholder, and if the unlocks query errors it shows
 * a retry — so portfolio figures never flash before the gate resolves.
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
 * owns only navigation and the loading/empty/error states.
 */

export default function PortfolioScreen() {
  const theme = useTheme();
  const { isSignedIn } = useSession();

  return (
    <Gate feature="portfolio" isSignedIn={isSignedIn} loadingFallback={<PortfolioLoading />}>
      <PortfolioView theme={theme} />
    </Gate>
  );
}

/** Full-screen loading placeholder shown while the unlock check resolves. */
function PortfolioLoading() {
  return (
    <Screen>
      <StateView kind="loading" />
    </Screen>
  );
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
