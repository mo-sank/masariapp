/**
 * DelayedBadge (requirements 4.4, 11.2; extended for pre/after-hours).
 *
 * A small pill on price screens so the learner always knows these are delayed
 * prices, not live, and WHICH session they reflect:
 *   - regular session  -> "Delayed ~15 min"
 *   - pre/after-hours   -> "After-hours" (extended session)
 *   - fully closed      -> "Last close"
 *
 * Prefer passing `session` (from useMarketStatus). The legacy `marketOpen` prop
 * is still honoured for callers that only know open/closed: open -> delayed,
 * closed -> last close. If both are given, `session` wins.
 *
 * Purely presentational: the caller passes the session/flag; the component
 * carries no data of its own.
 */
import { StyleSheet, View } from 'react-native';

import { Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';
import type { MarketSession } from '../../trading/use-market-status';

export interface DelayedBadgeProps {
  /** The market session; drives the label when provided (preferred). */
  session?: MarketSession;
  /**
   * Legacy flag for callers that only know open vs closed. When `session` is
   * absent: true -> "Delayed ~15 min", false -> "Last close" (requirement 11.2).
   */
  marketOpen?: boolean;
}

/** The copy used during the regular session (quotes are ~15 min delayed). */
export const DELAYED_LABEL = 'Delayed ~15 min';
/** The copy used during pre-market / after-hours (extended session). */
export const EXTENDED_LABEL = 'After-hours · delayed';
/** The copy used while the market is fully closed (prices are the last close). */
export const LAST_CLOSE_LABEL = 'Last close';

/** Resolve the label from the session (preferred) or the legacy open flag. */
export function delayedBadgeLabel(session: MarketSession | undefined, marketOpen: boolean): string {
  if (session === 'regular') return DELAYED_LABEL;
  if (session === 'extended') return EXTENDED_LABEL;
  if (session === 'closed') return LAST_CLOSE_LABEL;
  // No session provided: fall back to the open/closed flag.
  return marketOpen ? DELAYED_LABEL : LAST_CLOSE_LABEL;
}

export function DelayedBadge({ session, marketOpen = true }: DelayedBadgeProps) {
  const theme = useTheme();
  const label = delayedBadgeLabel(session, marketOpen);

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Prices: ${label}`}
      style={[
        styles.badge,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.sm,
          paddingVertical: theme.spacing.xs,
          paddingHorizontal: theme.spacing.sm,
        },
      ]}
    >
      <Text variant="caption" color="textMuted">
        {`🕒 ${label}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
});
