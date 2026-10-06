/**
 * Gate: declarative feature gating (requirements 1.3, 1.5).
 *
 * Wrap a gated feature so it renders only when the learner has unlocked it:
 *
 *     <Gate feature="portfolio" isSignedIn={isSignedIn}>
 *       <PortfolioScreen />
 *     </Gate>
 *
 * The gate reads the single `useUnlock(featureKey)` hook (design "Components":
 * the `<Gate feature=... fallback=.../>` pattern) and chooses what to show:
 *
 *   - unlocked  -> the children (the real feature).
 *   - loading   -> nothing by default (fail closed; the feature never flashes
 *                  open before the check resolves). Pass `loadingFallback` to
 *                  show a spinner instead.
 *   - error     -> a retry view, because `user_unlocks` failing to load must not
 *                  silently expose or hide the feature (design "Error handling":
 *                  default to LOCKED and show a retry).
 *   - locked    -> a `LockedState` naming the lesson that unlocks the feature,
 *                  with a "Start lesson" button that deep-links to it
 *                  (requirement 1.5). A caller can override this with `fallback`.
 *
 * The server re-enforces the same unlock on every gated action (requirement
 * 1.4); this component only controls what the learner sees.
 */
import { router } from 'expo-router';
import { type ReactNode } from 'react';

import { LockedState, StateView } from '../../../components/ui';
import { FEATURE_KEYS, type FeatureKey } from '../feature-keys';
import { useUnlock } from '../hooks/use-unlock';

export interface GateProps {
  /** The feature key to gate on (defined in `feature-keys.ts`). */
  feature: FeatureKey;
  /** The feature UI, shown only when the feature is unlocked. */
  children: ReactNode;
  /** Pass `isSignedIn`; while false the gate stays locked (no unlocks exist). */
  isSignedIn?: boolean;
  /**
   * What to render when the feature is locked. Defaults to a `LockedState` that
   * names the unlocking lesson and links to it. Provide this to customise the
   * locked experience for a specific screen.
   */
  fallback?: ReactNode;
  /**
   * What to render while the unlock check is loading. Defaults to `null` so the
   * feature never flashes open; pass a loading view when a placeholder is
   * preferable (e.g. a full-screen tab).
   */
  loadingFallback?: ReactNode;
}

export function Gate({ feature, children, isSignedIn = true, fallback, loadingFallback }: GateProps) {
  const { unlocked, isLoading, isError, unlockLesson, refetch } = useUnlock(feature, isSignedIn);

  if (unlocked) {
    return <>{children}</>;
  }

  // While loading we fail closed: show the loading placeholder (or nothing).
  if (isLoading) {
    return <>{loadingFallback ?? null}</>;
  }

  // A failed unlocks fetch must not expose the feature; offer a retry.
  if (isError) {
    return (
      <StateView
        kind="error"
        title="Couldn't check your unlocks"
        message="Check your connection and try again."
        onRetry={refetch}
      />
    );
  }

  // Locked: a caller-provided fallback wins, else the default LockedState.
  if (fallback !== undefined) {
    return <>{fallback}</>;
  }

  const featureName = FEATURE_KEYS[feature].label;
  const unlockedByLesson = unlockLesson.title ?? 'the next lesson';

  return (
    <LockedState
      featureName={featureName}
      unlockedByLesson={unlockedByLesson}
      actionLabel="Start lesson"
      onAction={() => router.push({ pathname: '/lesson/[id]', params: { id: unlockLesson.id } })}
    />
  );
}
