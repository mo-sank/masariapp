/**
 * Combined learning-path data hook (requirements 2.1-2.5).
 *
 * The Learn tab's single data entry point. It joins three things:
 *   - the bundled lesson catalog (`listLessons()`, already unit/order sorted),
 *   - the learner's completed lessons (`useLessonProgress`), and
 *   - the learner's unlocked features (`useUnlocks`),
 * then runs the pure path logic (`buildLearningPath`) to produce the
 * unit-grouped, status-tagged path and the Continue target the screen renders.
 * Stats (XP / streak) come from the sibling `useStats` hook; the screen reads it
 * directly for the header.
 *
 * This hook owns only data orchestration — all status rules live in the pure
 * `path.ts` so they stay unit-testable without React. The content catalog is
 * static (bundled JSON), so it is read synchronously here; only progress and
 * unlocks are async.
 */
import { useMemo } from 'react';

import { useLessonProgress } from './use-lesson-progress';
import { useUnlocks } from './use-unlocks';
import { listLessons } from '../content';
import { buildLearningPath, type LearningPath } from '../path';

export interface UseLearningPathResult {
  /** True while progress/unlocks are loading for the first time. */
  isLoading: boolean;
  /** True when a query failed. */
  isError: boolean;
  /** Refetch the underlying queries (used by the error-state retry). */
  refetch: () => void;
  /** The computed path: units with status-tagged lessons and the Continue target. */
  path: LearningPath;
  /** Feature keys the learner has already unlocked (for unlock previews). */
  unlockedFeatures: ReadonlySet<string>;
}

/**
 * Load and compute the learning path for the signed-in learner.
 *
 * Pass `enabled = isSignedIn` so the queries do not run while signed out. While
 * loading, `path` reflects an empty completed set (everything with no
 * prerequisite is available) so the screen can show its loading state without
 * crashing on undefined data.
 */
export function useLearningPath(enabled = true): UseLearningPathResult {
  const progress = useLessonProgress(enabled);
  const unlocks = useUnlocks(enabled);

  const completedIds = useMemo(() => {
    const rows = progress.data ?? [];
    return new Set(rows.filter((r) => r.status === 'completed').map((r) => r.lesson_id));
  }, [progress.data]);

  const unlockedFeatures = useMemo(
    () => new Set((unlocks.data ?? []).map((u) => u.feature_key)),
    [unlocks.data],
  );

  // The catalog is static bundled JSON; listLessons() returns a fresh sorted
  // copy, so memoize the computed path on the completed set only.
  const path = useMemo(() => buildLearningPath(listLessons(), completedIds), [completedIds]);

  return {
    isLoading: (enabled && progress.isLoading) || (enabled && unlocks.isLoading),
    isError: progress.isError || unlocks.isError,
    refetch: () => {
      void progress.refetch();
      void unlocks.refetch();
    },
    path,
    unlockedFeatures,
  };
}
