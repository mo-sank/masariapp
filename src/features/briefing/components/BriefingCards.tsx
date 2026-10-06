/**
 * BriefingCards — the three-card recap body (requirements 4.2, 4.3).
 *
 * Renders the briefing's three cards from a validated {@link Briefing}:
 *   - Card 1: the top gainer and top loser among starter stocks, each with its
 *     percent change from the prior close (requirement 4.2). Hidden when the
 *     server reports no measurable movers.
 *   - Card 2: the caller's portfolio day change, in dollars (requirement 4.2).
 *   - Card 3: a short "why prices move" tip chosen by the server's rotating
 *     `tipIndex` from the client's reviewed template list (requirements 4.2,
 *     4.4) — fixed, human-reviewed copy, never advice.
 *
 * Market-closed wording (requirement 4.3): when `marketState` is not the regular
 * session, every price-derived figure comes from the last stored close, so the
 * header says so ("As of the last close"). During the regular session it notes
 * the figures are live-ish (delayed) instead.
 *
 * Purely presentational: it takes data and renders it with themed components and
 * integer-cents formatting (lib/money). The screen owns fetching, gating, and
 * loading/error states.
 */
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '../../../components/ui';
import { formatPercent, formatSignedCents } from '../../../lib/money';
import { useTheme } from '../../../theme/theme-provider';
import { tipForIndex } from '../tips';
import type { Briefing, BriefingMover } from '../use-briefing';

export interface BriefingCardsProps {
  briefing: Briefing;
}

/** True when the market is not in its regular session (figures = last close). */
function isLastClose(briefing: Briefing): boolean {
  return briefing.marketState !== 'regular';
}

export function BriefingCards({ briefing }: BriefingCardsProps) {
  const theme = useTheme();
  const lastClose = isLastClose(briefing);
  const tip = tipForIndex(briefing.tipIndex);
  const hasMovers = briefing.topGainer !== null || briefing.topLoser !== null;

  // Requirement 4.3: say the figures are last-close when the market is closed.
  const asOfLabel = lastClose
    ? 'As of the last close — the market is closed right now.'
    : 'Prices are delayed about 15 minutes.';

  const changeColor = (cents: number) => (cents > 0 ? 'primary' : cents < 0 ? 'danger' : 'textMuted');

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Text variant="caption" color="textMuted">
        {asOfLabel}
      </Text>

      {/* Card 1: top gainer / top loser among starter stocks. */}
      {hasMovers ? (
        <Card style={{ gap: theme.spacing.sm }}>
          <Text variant="title" accessibilityRole="header">
            {"Today's movers"}
          </Text>
          <MoverRow label="Top gainer" mover={briefing.topGainer} />
          <MoverRow label="Top loser" mover={briefing.topLoser} />
        </Card>
      ) : null}

      {/* Card 2: the caller's portfolio day change. */}
      <Card style={{ gap: theme.spacing.xs }}>
        <Text variant="title" accessibilityRole="header">
          Your portfolio
        </Text>
        <Text variant="caption" color="textMuted">
          {lastClose ? "Change since the last close" : "Today's change"}
        </Text>
        <Text
          variant="title"
          color={changeColor(briefing.portfolioDayChangeCents)}
          accessibilityLabel={`Portfolio change ${formatSignedCents(briefing.portfolioDayChangeCents)}`}
        >
          {formatSignedCents(briefing.portfolioDayChangeCents)}
        </Text>
        <Text variant="caption" color="textMuted">
          Paper money — practice only.
        </Text>
      </Card>

      {/* Card 3: a rotating "why prices move" tip. */}
      <Card style={{ gap: theme.spacing.xs }}>
        <Text variant="title" accessibilityRole="header">
          Why prices move
        </Text>
        <Text variant="body">{tip.title}</Text>
        <Text variant="body" color="textMuted">
          {tip.body}
        </Text>
      </Card>
    </View>
  );
}

/** One labelled mover line: "Top gainer  AAPL  +1.20%", or a muted dash. */
function MoverRow({ label, mover }: { label: string; mover: BriefingMover | null }) {
  const theme = useTheme();
  if (!mover) {
    return (
      <View style={styles.row}>
        <Text variant="body" color="textMuted">
          {label}
        </Text>
        <Text variant="body" color="textMuted">
          —
        </Text>
      </View>
    );
  }
  const color = mover.changeBasisPoints > 0 ? 'primary' : mover.changeBasisPoints < 0 ? 'danger' : 'textMuted';
  return (
    <View style={styles.row}>
      <View style={{ flexShrink: 1, paddingRight: theme.spacing.sm }}>
        <Text variant="body">{mover.symbol}</Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {mover.name}
        </Text>
      </View>
      <Text
        variant="body"
        color={color}
        accessibilityLabel={`${label}: ${mover.symbol}, ${formatPercent(mover.changeBasisPoints)}`}
      >
        {formatPercent(mover.changeBasisPoints)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
