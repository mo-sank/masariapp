import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';

import { Button, Card, Disclaimer, Screen, StateView, Text } from '../../src/components/ui';
import {
  PortfolioSummary,
  PortfolioValueChart,
  PositionRow,
  RangeToggle,
} from '../../src/features/portfolio/components';
import { useBackfillPortfolioHistory, mapBackfillError } from '../../src/features/portfolio/use-backfill-portfolio-history';
import {
  usePortfolioHistory,
  type ChartRange,
} from '../../src/features/portfolio/use-portfolio-history';
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

  // Portfolio value chart (design §9): a range selector feeding a history query,
  // with a once-per-mount backfill that reconstructs the historical series when
  // the chart has too little data to draw.
  const [range, setRange] = useState<ChartRange>('3M');
  const history = usePortfolioHistory(range);
  const backfill = useBackfillPortfolioHistory();

  // Treat <= 1 point as sparse: too little to draw a curve.
  const sparse = (history.data?.length ?? 0) <= 1;
  const firedRef = useRef(false);
  useEffect(() => {
    // Fire the backfill at most once per mount (the firedRef latch is set before
    // mutate(), so a rejected mutation does not auto-retry and a range change
    // does not re-trigger it).
    if (!history.isLoading && sparse && !firedRef.current && !backfill.isPending) {
      firedRef.current = true;
      backfill.mutate();
    }
    // The firedRef latch makes this a once-per-mount trigger; `backfill` is a
    // stable mutation object and is intentionally not a dependency so a range
    // change or re-render never re-fires it (design §9).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.isLoading, sparse, backfill.isPending]);

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

  // Equity points for the chart, mapped from the history query (oldest-first).
  const chartPoints = (history.data ?? []).map((p) => ({
    snapDate: p.snapDate,
    valueCents: p.equityCents,
  }));

  const chartCard = sparse ? (
    <Card style={{ gap: theme.spacing.sm }}>
      <Text variant="body" color="text">
        Your portfolio history will build over time
      </Text>
      {backfill.isPending ? (
        <Text variant="caption" color="textMuted">
          Building your history…
        </Text>
      ) : backfill.isError ? (
        <Text variant="caption" color="textMuted">
          {mapBackfillError(backfill.error)}
        </Text>
      ) : null}
      <RangeToggle value={range} onChange={setRange} />
    </Card>
  ) : (
    <View style={{ gap: theme.spacing.sm }}>
      <PortfolioValueChart
        points={chartPoints}
        range={range}
        loading={history.isLoading}
      />
      <RangeToggle value={range} onChange={setRange} />
    </View>
  );

  const header = (
    <View style={{ gap: theme.spacing.md }}>
      <Text variant="title" accessibilityRole="header">
        Portfolio
      </Text>
      {chartCard}
      <PortfolioSummary portfolio={data} />
      <Button
        title="View trade history"
        variant="secondary"
        onPress={() => router.push('/history')}
      />
      <Button
        title="Stress Lab"
        variant="secondary"
        onPress={() => router.push('/stress-lab')}
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
