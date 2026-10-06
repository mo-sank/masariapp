/**
 * Learner rank query (requirement 3.2, 3.4).
 *
 * `useRank()` reports the signed-in learner's current rank for the Profile. Rank
 * is derived, never stored: it reads the learner's completed lessons (via the
 * shared `['lesson-progress']` query), keeps only those that are *boss* lessons
 * per the bundled catalog, and runs the pure `rankForCompletedBosses` rule
 * (design "Rank mapping (MVP)": Rookie after B1, else Newcomer).
 *
 * Because it rides the same `['lesson-progress']` query the completion flow
 * invalidates (`use-complete-lesson` / `use-submit-assessment`), beating a boss
 * promotes the rank with no manual refresh (requirement 3.4). It fails safe:
 * while progress is loading or on error the learner reads as the default rank
 * rather than crashing the Profile.
 */
import { useMemo } from 'react';

import { useLessonProgress } from '../../lessons/hooks/use-lesson-progress';
import { listLessons } from '../../lessons/content';
import { DEFAULT_RANK, rankForCompletedBosses, type Rank } from '../rank';

/** What `useRank` reports to the Profile. */
export interface RankState {
  /** The learner's current rank (defaults to 'Newcomer' until a boss is cleared). */
  rank: Rank;
  /** True while the backing progress query has not resolved yet. */
  isLoading: boolean;
  /** True when the backing progress query errored. */
  isError: boolean;
}

/**
 * Derive the signed-in learner's rank. Pass `enabled = isSignedIn` so the
 * backing query does not run while signed out.
 */
export function useRank(enabled = true): RankState {
  const progress = useLessonProgress(enabled);

  const rank = useMemo(() => {
    const rows = progress.data;
    if (!rows) {
      return DEFAULT_RANK;
    }
    // The catalog is the source of truth for which lessons are bosses; a
    // completed lesson only counts toward rank when its catalog kind is 'boss'.
    const bossIds = new Set(listLessons().filter((l) => l.kind === 'boss').map((l) => l.id));
    const completedBossIds = new Set(
      rows.filter((r) => r.status === 'completed' && bossIds.has(r.lesson_id)).map((r) => r.lesson_id),
    );
    return rankForCompletedBosses(completedBossIds);
  }, [progress.data]);

  return {
    rank,
    isLoading: progress.isLoading,
    isError: progress.isError,
  };
}
