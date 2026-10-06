/**
 * Single feature-unlock check (requirements 1.3, 1.5).
 *
 * `useUnlock(featureKey)` is the one hook screens call to decide whether to show
 * a gated feature. It is backed by `user_unlocks` through the shared
 * `useUnlocks()` query (design "Architecture": `useUnlock(key)` over
 * `user_unlocks`), so every gate reads from one cached fetch rather than each
 * screen querying independently.
 *
 * It fails closed. While the unlocks are loading, or if the query errored, the
 * feature is reported LOCKED (design "Error handling": "If user_unlocks fails to
 * load, default to LOCKED (fail closed)"). A learner never sees a feature flash
 * open before the check resolves, and a network blip cannot expose a feature the
 * learner has not earned. The server re-checks the same unlock regardless
 * (requirement 1.4), so this is a UX gate, not the security boundary.
 *
 * The returned `unlockLesson` names the lesson that unlocks the feature so a
 * `LockedState` can tell the learner exactly what to do next and link straight
 * to it (requirement 1.5).
 */
import { useMemo } from 'react';

import { FEATURE_KEYS, type FeatureKey } from '../feature-keys';
import { getLesson } from '../../lessons/content';
import { useUnlocks } from '../../lessons/hooks/use-unlocks';

/** The lesson that unlocks a feature, for the "Start lesson" affordance. */
export interface UnlockLesson {
  /** The lesson id, e.g. `L1.4` — used to deep-link `/lesson/[id]`. */
  id: string;
  /** The lesson's title, e.g. "Your First Trade", or `null` if not bundled. */
  title: string | null;
}

/** What `useUnlock` reports about a single feature. */
export interface UnlockState {
  /** True only when the learner has earned this feature. Fails closed. */
  unlocked: boolean;
  /** True while the backing query has not resolved yet (treat as locked). */
  isLoading: boolean;
  /** True when the unlocks query errored (treated as locked; show a retry). */
  isError: boolean;
  /** The lesson that unlocks this feature (for LockedState copy + deep link). */
  unlockLesson: UnlockLesson;
  /** Re-run the backing `user_unlocks` query (wired to a retry button). */
  refetch: () => void;
}

/**
 * Check whether a single feature is unlocked for the signed-in learner.
 *
 * @param featureKey The gated feature to check (one of {@link FeatureKey}).
 * @param enabled Pass `isSignedIn`; while `false` the query does not run and the
 *   feature stays locked (a signed-out user has no unlocks).
 */
export function useUnlock(featureKey: FeatureKey, enabled = true): UnlockState {
  const query = useUnlocks(enabled);

  const unlocked = useMemo(() => {
    // Fail closed: only unlocked once the query has succeeded with the key.
    if (!query.isSuccess || !query.data) {
      return false;
    }
    return query.data.some((row) => row.feature_key === featureKey);
  }, [query.isSuccess, query.data, featureKey]);

  const unlockLesson = useMemo<UnlockLesson>(() => {
    const lessonId = FEATURE_KEYS[featureKey].lessonId;
    return { id: lessonId, title: getLesson(lessonId)?.title ?? null };
  }, [featureKey]);

  return {
    unlocked,
    isLoading: query.isLoading,
    isError: query.isError,
    unlockLesson,
    refetch: query.refetch,
  };
}
