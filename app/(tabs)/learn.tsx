import { router } from 'expo-router';

import { Screen, StateView, Text } from '../../src/components/ui';
import { PathView, RewindCard } from '../../src/features/lessons/components/path';
import { useLearningPath } from '../../src/features/lessons/hooks/use-learning-path';
import { useRewind } from '../../src/features/lessons/hooks/use-rewind';
import { useStats } from '../../src/features/lessons/hooks/use-stats';
import type { Lesson } from '../../src/features/lessons/schema';
import { useSession } from '../../src/lib/auth0';
import { useTheme } from '../../src/theme/theme-provider';

/**
 * Learn tab — the learning path (requirements 2.1-2.5).
 *
 * The home of the learning path. It loads the learner's progress and unlocks
 * (via {@link useLearningPath}), their XP/streak (via {@link useStats}), and
 * their due Rewind items (via {@link useRewind}), then renders the unit-grouped
 * path through {@link PathView}: a prominent Continue card for unfinished work
 * (requirement 2.4), lessons grouped by unit with available/locked/completed
 * states and unlock previews (requirements 2.1-2.3). Opening an available or
 * completed lesson routes to the player at `/lesson/<id>` (expo-router); locked
 * lessons are inert.
 *
 * When missed items are due, a {@link RewindCard} appears near the top with the
 * due count and routes to the Rewind session at `/rewind` (requirement 7.2); it
 * hides itself when nothing is due. Its `['rewind']` query is invalidated by the
 * completion flow and the session screen, so the count stays current.
 *
 * The screen owns the data fetch and navigation; the path components stay
 * presentational. While loading it shows the shared loading state, and an error
 * surfaces the retry state rather than a blank screen (requirement 7.3). Because
 * the queries' keys (`['lesson-progress']`, `['unlocks']`, `['stats']`) are the
 * ones the completion flow invalidates, finishing a lesson refreshes the path,
 * XP, and streak (requirement 2.5).
 */
export default function LearnScreen() {
  const theme = useTheme();
  const { isSignedIn } = useSession();
  const { isLoading, isError, refetch, path } = useLearningPath(isSignedIn);
  const stats = useStats(isSignedIn);
  const rewind = useRewind(isSignedIn);

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
          message="We couldn't load your learning path. Please try again."
          onRetry={refetch}
        />
      </Screen>
    );
  }

  const openLesson = (lesson: Lesson) => {
    router.push(`/lesson/${lesson.id}`);
  };

  const xp = stats.data?.xp_total ?? 0;
  const streak = stats.data?.streak_current ?? 0;
  const dueCount = rewind.data?.dueCount ?? 0;

  return (
    <Screen scroll style={{ gap: theme.spacing.md }}>
      <Text variant="title" accessibilityRole="header">
        Learn
      </Text>

      <Text
        variant="caption"
        color="textMuted"
        accessibilityLabel={`${xp} XP, ${streak} day streak`}
      >
        {`${xp} XP · 🔥 ${streak}`}
      </Text>

      <RewindCard dueCount={dueCount} onStart={() => router.push('/rewind')} />

      <PathView path={path} onOpenLesson={openLesson} />
    </Screen>
  );
}
