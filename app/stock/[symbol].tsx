import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Disclaimer, Screen, StateView, Text } from '../../src/components/ui';
import {
  DelayedBadge,
  MarketBanner,
  PriceChange,
} from '../../src/features/explore/components';
import { useInstruments } from '../../src/features/explore/use-instruments';
import { useQuote } from '../../src/features/explore/use-quotes';
import { getLesson } from '../../src/features/lessons/content';
import { Gate } from '../../src/features/progress/components/Gate';
import { useUnlock } from '../../src/features/progress/hooks/use-unlock';
import { LineChart, RangeToggle, TradeButton } from '../../src/features/trading/components';
import { trackStockViewed } from '../../src/features/trading/analytics';
import { useBars, type ChartRange } from '../../src/features/trading/use-bars';
import { useMarketStatus } from '../../src/features/trading/use-market-status';
import { useOrders } from '../../src/features/trading/use-orders';
import { WatchlistButton } from '../../src/features/watchlist/components';
import { formatCents } from '../../src/lib/money';
import { useSession } from '../../src/lib/auth0';
import { useTheme } from '../../src/theme/theme-provider';

/**
 * Stock detail route (requirements 5.1, 5.2, 5.3, 5.4, 3.3).
 *
 * The per-company page a learner opens from Explore. It is gated on three
 * separate feature keys, each unlocked by a different lesson, so parts of the
 * page progressively light up as the learner advances:
 *
 *  - `stock_detail` (lesson L1.3, "Anatomy of a Stock Card") gates the whole
 *    page through the shared {@link Gate} (progression spec, requirements 1.3,
 *    1.5). Until it is unlocked the route shows a {@link LockedState} naming
 *    that lesson with a button that opens it (requirement 5.1). The gate fails
 *    closed: while unlocks load it shows a loading placeholder, and if the
 *    unlocks query errors it shows a retry, so content never flashes.
 *  - `chart_time_ranges` (lesson L2.1, "Charts Tell Stories") gates the 1M/3M/
 *    1Y/5Y range toggle; locked, the chart is fixed to 1M with a lock hint
 *    (requirement 5.2). Checked with the single `useUnlock` hook (fails closed).
 *  - `trade_markers` (also L2.1) gates drawing the learner's own buys and sells
 *    on the chart (requirement 5.3). Also checked with `useUnlock`.
 *
 * The page always shows the paper-money / not-advice {@link Disclaimer}
 * (requirement 5.4) and the market banner + delayed-price label that every
 * price screen carries (requirement 11.1).
 *
 * It also hosts the {@link WatchlistButton} (requirements 6.1–6.3), which gates
 * itself on the `watchlist` unlock: a locked learner sees a lock hint rather
 * than an active toggle.
 *
 * This route stays thin: data joining is in the hooks (`useQuote`,
 * `useInstruments`, `useBars`, `useOrders`), and the chart drawing lives in
 * `src/features/trading/components`.
 */

/** The lesson that grants the chart range toggle (L2.1). */
const RANGES_UNLOCK_LESSON_ID = 'L2.1';

export default function StockScreen() {
  const { symbol: rawSymbol } = useLocalSearchParams<{ symbol: string }>();
  const symbol = (rawSymbol ?? '').toUpperCase();
  const { isSignedIn } = useSession();

  // Whole-page gate on `stock_detail` (requirement 5.1) via the shared Gate:
  // fails closed while loading, shows a retry on error, else a LockedState that
  // links to the unlocking lesson.
  return (
    <Gate feature="stock_detail" isSignedIn={isSignedIn} loadingFallback={<StockLoading />}>
      <StockDetail symbol={symbol} isSignedIn={isSignedIn} />
    </Gate>
  );
}

/** Full-screen loading placeholder shown while the page's unlock resolves. */
function StockLoading() {
  return (
    <Screen>
      <StateView kind="loading" />
    </Screen>
  );
}

interface StockDetailProps {
  symbol: string;
  isSignedIn: boolean;
}

/** The unlocked detail UI, split out so data hooks run only past the gate. */
function StockDetail({ symbol, isSignedIn }: StockDetailProps) {
  const theme = useTheme();
  // Sub-gates checked through the single useUnlock hook (fails closed). Ranges
  // (5.2) and markers (5.3) are both granted by L2.1.
  const { unlocked: rangesUnlocked } = useUnlock('chart_time_ranges', isSignedIn);
  const { unlocked: markersUnlocked } = useUnlock('trade_markers', isSignedIn);
  // Ranges locked → fixed 1M (requirement 5.2); unlocked → user picks.
  const [range, setRange] = useState<ChartRange>('1M');
  const effectiveRange: ChartRange = rangesUnlocked ? range : '1M';

  // Log one stock_viewed per symbol opened (requirement 9.2). This runs only
  // past the stock_detail gate, so it reflects an actual (unlocked) view. Keyed
  // on symbol so switching companies logs a new view but re-renders do not.
  useEffect(() => {
    trackStockViewed(symbol);
  }, [symbol]);

  const quote = useQuote(symbol);
  const instruments = useInstruments();
  const bars = useBars(symbol, effectiveRange);
  const orders = useOrders(markersUnlocked);
  const market = useMarketStatus();
  const marketOpen = market.data?.isOpen ?? true;

  const instrument = useMemo(
    () => (instruments.data ?? []).find((row) => row.symbol === symbol),
    [instruments.data, symbol],
  );

  // Only this symbol's filled orders become chart markers (requirement 5.3).
  const markers = useMemo(() => {
    if (!markersUnlocked) {
      return [];
    }
    return (orders.data ?? [])
      .filter(
        (o) =>
          o.symbol === symbol &&
          o.fill_price_cents != null &&
          (o.side === 'buy' || o.side === 'sell'),
      )
      .map((o) => ({
        side: o.side as 'buy' | 'sell',
        created_at: o.created_at,
        fill_price_cents: o.fill_price_cents as number,
      }));
  }, [markersUnlocked, orders.data, symbol]);

  // First-load: wait for the quote (the page's headline data).
  if (quote.isLoading) {
    return (
      <Screen>
        <StateView kind="loading" />
      </Screen>
    );
  }

  if (quote.isError) {
    return (
      <Screen>
        <StateView
          kind="error"
          message={`We couldn't load ${symbol}. Please try again.`}
          onRetry={quote.refetch}
        />
      </Screen>
    );
  }

  const q = quote.data;

  return (
    <Screen scroll style={{ gap: theme.spacing.lg }}>
      {/* Header: name + symbol, price, and day change. */}
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="title" accessibilityRole="header">
          {symbol}
        </Text>
        {instrument ? (
          <Text variant="body" color="textMuted">
            {instrument.name}
          </Text>
        ) : null}
      </View>

      <MarketBanner status={market.data?.status} holidayName={market.data?.holidayName} />
      <DelayedBadge session={market.data?.session} marketOpen={marketOpen} />

      {q ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="title" color="text">
            {formatCents(q.price_cents)}
          </Text>
          <PriceChange priceCents={q.price_cents} prevCloseCents={q.prev_close_cents} />
        </View>
      ) : (
        <Text variant="body" color="textMuted">
          No quote yet for {symbol}.
        </Text>
      )}

      {/* Watchlist add/remove, self-gated on the `watchlist` unlock (6.1–6.3). */}
      <WatchlistButton symbol={symbol} isSignedIn={isSignedIn} />

      {/* Trade, self-gated on the buy/sell unlock → opens the order ticket. */}
      <TradeButton symbol={symbol} isSignedIn={isSignedIn} />

      {/* Chart (requirements 5.2, 5.3, 3.3). */}
      <Card style={{ gap: theme.spacing.md }}>
        {rangesUnlocked ? (
          <RangeToggle value={range} onChange={setRange} />
        ) : (
          <RangeLockHint />
        )}
        <LineChart
          bars={bars.data ?? []}
          markers={markers}
          accessibilityLabel={`${symbol} price history, ${effectiveRange}`}
        />
      </Card>

      {/* Key stats (requirement 5.1). */}
      {q ? (
        <Card style={{ gap: theme.spacing.sm }}>
          <StatRow label="Previous close" value={formatCentsOrDash(q.prev_close_cents)} />
          <StatRow label="Day range" value={formatRange(q.low_cents, q.high_cents)} />
          <StatRow label="Volume" value={formatVolume(q.volume)} />
          <StatRow label="Sector" value={instrument?.sector ?? '—'} />
        </Card>
      ) : null}

      <Disclaimer />
    </Screen>
  );
}

/** A labelled stat row inside the stats card. */
function StatRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.statRow, { gap: theme.spacing.md }]}>
      <Text variant="body" color="textMuted">
        {label}
      </Text>
      <Text variant="body" color="text" style={styles.statValue}>
        {value}
      </Text>
    </View>
  );
}

/** The lock hint shown above the chart while chart ranges are locked (5.2). */
function RangeLockHint() {
  const theme = useTheme();
  const lessonTitle = getLesson(RANGES_UNLOCK_LESSON_ID)?.title ?? 'Charts Tell Stories';
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
        {`🔒 Showing 1M. Complete "${lessonTitle}" to unlock 3M, 1Y, and 5Y.`}
      </Text>
    </View>
  );
}

/** Format cents, or a muted dash when the value is null (not yet ingested). */
function formatCentsOrDash(cents: number | null): string {
  return cents == null ? '—' : formatCents(cents);
}

/** "$low – $high" day range, or a dash when either bound is missing. */
function formatRange(lowCents: number | null, highCents: number | null): string {
  if (lowCents == null || highCents == null) {
    return '—';
  }
  return `${formatCents(lowCents)} – ${formatCents(highCents)}`;
}

/** Group a share volume with thousands separators, or a dash when unknown. */
function formatVolume(volume: number | null): string {
  if (volume == null) {
    return '—';
  }
  return volume.toLocaleString('en-US');
}

const styles = StyleSheet.create({
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statValue: {
    textAlign: 'right',
    flexShrink: 1,
  },
  hint: {
    borderWidth: 1,
  },
});
