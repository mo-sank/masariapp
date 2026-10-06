import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, Card, Screen, StateView, Text } from '../../src/components/ui';
import { useProfile } from '../../src/features/auth/use-profile';
import { RankBadge } from '../../src/features/progress/components/RankBadge';
import { StatsHeader } from '../../src/features/progress/components/StatsHeader';
import { useRank } from '../../src/features/progress/hooks/use-rank';
import { useStats } from '../../src/features/progress/hooks/use-stats';
import { useSession } from '../../src/lib/auth0';
import { useTheme } from '../../src/theme/theme-provider';

/**
 * Profile tab (requirements 3.1, 3.2, 7.1, 7.3, 7.4).
 *
 * Shows the signed-in user's anonymous username, their progress — XP, streak,
 * longest streak, and Streak Freezes via the {@link StatsHeader} (requirement
 * 3.1) — and their current {@link RankBadge} derived from completed boss lessons
 * (requirement 3.2), plus an entry point to Settings. The stats and rank ride
 * the shared `['stats']` / `['lesson-progress']` queries the completion flow
 * invalidates, so finishing a lesson or beating a boss updates them here with no
 * manual refresh (requirement 3.4). While the profile loads it renders the
 * shared loading state, and surfaces an error state with retry if the lookup
 * fails — never a blank screen.
 */
export default function ProfileScreen() {
  const theme = useTheme();
  const { isSignedIn } = useSession();
  const { isLoading, isError, profile } = useProfile(isSignedIn);
  const stats = useStats(isSignedIn);
  const { rank } = useRank(isSignedIn);

  if (isLoading) {
    return (
      <Screen>
        <StateView kind="loading" />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <StateView
          kind="error"
          message="We couldn't load your profile. Please try again."
          onRetry={() => router.replace('/(tabs)/profile')}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll style={{ gap: theme.spacing.lg }}>
      <Text variant="title" accessibilityRole="header">
        Profile
      </Text>

      <Card accessible accessibilityLabel={`Username ${profile?.username ?? 'unknown'}`}>
        <Text variant="caption" color="textMuted">
          Your username
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.md,
            marginTop: theme.spacing.xs,
          }}
        >
          <Text variant="title">{profile?.username ?? '—'}</Text>
          <RankBadge rank={rank} />
        </View>
      </Card>

      <StatsHeader
        xp={stats.data?.xp_total ?? 0}
        streakCurrent={stats.data?.streak_current ?? 0}
        streakLongest={stats.data?.streak_longest ?? 0}
        streakFreezes={stats.data?.streak_freezes ?? 0}
      />

      <Button
        title="Settings"
        variant="secondary"
        onPress={() => router.push('/settings')}
        accessibilityLabel="Open settings"
      />
    </Screen>
  );
}
