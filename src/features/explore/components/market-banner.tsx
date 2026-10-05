/**
 * MarketBanner (requirement 11.1).
 *
 * The open/closed banner shown on every price screen. It renders one of three
 * states — Open, After-hours (extended), Closed (after hours), or Closed
 * (holiday) — from the
 * {@link MarketStatus} the caller resolves via `useMarketStatus`. When today is
 * a holiday the banner names it (e.g. "Closed · Thanksgiving Day") so the closed
 * state reads as intentional rather than broken.
 *
 * Purely presentational: it takes the already-fetched status and holiday name.
 * The banner is a live region so a screen reader announces a status change.
 */
import { StyleSheet, View } from 'react-native';

import { Text } from '../../../components/ui';
import type { MarketStatus } from '../../trading/use-market-status';
import { useTheme } from '../../../theme/theme-provider';

export interface MarketBannerProps {
  /** The resolved market status, or undefined while it is still loading. */
  status?: MarketStatus;
  /** Today's holiday name, used when `status` is `closed_holiday`. */
  holidayName?: string | null;
}

/** Short label for each status, used for the visible text and a11y label. */
export function marketBannerLabel(status: MarketStatus, holidayName?: string | null): string {
  switch (status) {
    case 'open':
      return 'Market open';
    case 'extended':
      return 'Market open · After-hours';
    case 'closed_holiday':
      return holidayName ? `Market closed · ${holidayName}` : 'Market closed · Holiday';
    case 'closed_after_hours':
    default:
      return 'Market closed · After hours';
  }
}

export function MarketBanner({ status, holidayName }: MarketBannerProps) {
  const theme = useTheme();

  if (!status) {
    return null;
  }

  // A live session (regular or extended) uses the brand color; fully-closed
  // states use muted ink on the surface.
  const sessionActive = status === 'open' || status === 'extended';
  const label = marketBannerLabel(status, holidayName);
  const dotColor = sessionActive ? theme.colors.primary : theme.colors.textMuted;

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      style={[
        styles.banner,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.md,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          gap: theme.spacing.sm,
        },
      ]}
    >
      <View
        style={[styles.dot, { backgroundColor: dotColor }]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text variant="caption" color="text">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
