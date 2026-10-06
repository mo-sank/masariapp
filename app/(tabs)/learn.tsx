import { router } from 'expo-router';

import { Screen, StateView, Text } from '../../src/components/ui';
import { BriefingCard } from '../../src/features/briefing/components';
import { PathView, RewindCard } from '../../src/features/lessons/components/path';
import { useLearningPath } from '../../src/features/lessons/hooks/use-learning-path';
import { useRewind } from '../../src/features/lessons/hooks/use-rewind';
import type { Lesson } from '../../src/features/lessons/schema';
import { Gate } from '../../src/features/progress/components/Gate';
import { StatsHeader } from '../../src/features/progress/components/StatsHeader';
import { useStats } from '../../src/features/progress/hooks/use-stats';
import { useSession } from '../../src/lib/auth0';
import { useTheme } from '../../src/theme/theme-provider';

/**
 * Learn tab — the learning path (requirements 2.1-2.5).
 *
 * The home of the learning path. It loads the learner's progress and unlocks
 * (via {@link useLearningPath}), their XP/streak/freezes (via {@link useStats},
 * rendered by the {@link StatsHeader}), and their due Rewind items (via
 * {@link useRewind}), then renders the unit-grouped path through
 * {@link PathView}: a prominent Continue card for unfinished work
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
 * Once the learner unlocks `daily_briefing` (completing boss B1), a
 * {@link BriefingCard} appears that opens the three-card Daily Market Briefing at
 * `/briefing` (requirement 4.1). It is wrapped in a {@link Gate} with a null
 * fallback, so it is simply absent until earned rather than showing a locked
 * state on the Learn tab.
 *
 * The screen owns the data fetch and navigation; the path components stay
 * presentational. While loading it shows the shared loading state, and an error
 * surfaces the retry state rather than a blank screen (requirement 7.3). Because
 * the queries' keys (`['lesson-progress']`, `['unlocks']`, `['stats']`) are the
 * ones the completion flow invalidates, finishing a lesson refreshes the path
 * and the StatsHeader's XP, streak, and freezes with no manual reload
 * (requirements 2.5, 3.4).
 */
export default function LearnScreen() {
  const theme = useTheme();
  const { isSignedIn } = useSession();
  const { isLoading, isError, refetch, path } = useLearningPath(isSignedIn);
  const stats = useStats(isSignedIn);
  const rewind = useRewind(isSignedIn);
  const openBriefing = () => router.push('/briefing');

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
    // Pass the id as a route param (object form) rather than interpolating it
    // into the path string. Lesson ids contain dots (e.g. "L1.1"), which an
    // interpolated path can mishandle; the param form routes them reliably.
    router.push({ pathname: '/lesson/[id]', params: { id: lesson.id } });
  };

  const dueCount = rewind.data?.dueCount ?? 0;

  return (
    <Screen scroll style={{ gap: theme.spacing.md }}>
      <Text variant="title" accessibilityRole="header">
        Learn
      </Text>

      <StatsHeader
        xp={stats.data?.xp_total ?? 0}
        streakCurrent={stats.data?.streak_current ?? 0}
        streakLongest={stats.data?.streak_longest ?? 0}
        streakFreezes={stats.data?.streak_freezes ?? 0}
      />

      <RewindCard dueCount={dueCount} onStart={() => router.push('/rewind')} />

      {/* The Daily Market Briefing card appears only once the learner has
          unlocked `daily_briefing` (requirement 4.1). The Gate hides it (null
          fallback) while locked or loading, so it never shows a locked state on
          the Learn tab — it simply is not there until earned. */}
      <Gate feature="daily_briefing" isSignedIn={isSignedIn} fallback={null}>
        <BriefingCard onOpen={openBriefing} />
      </Gate>

      <PathView path={path} onOpenLesson={openLesson} />
    </Screen>
  );
}
