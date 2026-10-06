/**
 * RankBadge (requirement 3.2).
 *
 * A small pill that names the learner's current rank, shown on the Profile. It
 * is purely presentational: the caller passes the already-derived `rank` (from
 * `useRank`), so this component stays a pure function of its props and is
 * trivial to test. It reads its colours, radius, and spacing from theme tokens
 * so it sits correctly in light and dark mode.
 *
 * The badge is announced as a single label ("Rank: Rookie") so a screen reader
 * reads the medal and the rank name as one unit rather than two stray tokens.
 */
import { View } from 'react-native';

import { Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';
import type { Rank } from '../rank';

export interface RankBadgeProps {
  /** The learner's current rank (from `useRank`). */
  rank: Rank;
}

export function RankBadge({ rank }: RankBadgeProps) {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`Rank: ${rank}`}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        backgroundColor: theme.colors.primary,
        borderRadius: theme.radii.lg,
        paddingVertical: theme.spacing.xs,
        paddingHorizontal: theme.spacing.md,
      }}
    >
      {/* Decorative medal; the View owns the accessible label so this is hidden. */}
      <Text color="onPrimary" accessibilityElementsHidden importantForAccessibility="no">
        🏅
      </Text>
      <Text color="onPrimary">{rank}</Text>
    </View>
  );
}
