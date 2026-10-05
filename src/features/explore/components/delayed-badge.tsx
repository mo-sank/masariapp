/**
 * DelayedBadge (requirements 4.4, 11.2).
 *
 * A small pill shown on price screens so the learner always knows quotes are
 * delayed, not live. Its label switches to "Last close" wording when the market
 * is closed (requirement 11.2) — a closed-market price is the previous session's
 * close, not a ~15-minute-delayed intraday quote.
 *
 * Purely presentational: the caller passes whether the market is open. The
 * component carries no data of its own.
 */
import { StyleSheet, View } from 'react-native';

import { Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';

export interface DelayedBadgeProps {
  /** When false, the badge labels prices as the last close (requirement 11.2). */
  marketOpen?: boolean;
}

/** The copy used while the market is open (quotes are ~15 min delayed). */
export const DELAYED_LABEL = 'Delayed ~15 min';
/** The copy used while the market is closed (prices are the last close). */
export const LAST_CLOSE_LABEL = 'Last close';

export function DelayedBadge({ marketOpen = true }: DelayedBadgeProps) {
  const theme = useTheme();
  const label = marketOpen ? DELAYED_LABEL : LAST_CLOSE_LABEL;

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
