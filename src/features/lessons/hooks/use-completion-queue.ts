/**
 * Offline completion queue wiring (requirement 5.5).
 *
 * Mounted once at the app root (app/_layout.tsx). It hydrates any lesson
 * completions persisted from a previous run and flushes them, then flushes again
 * whenever the app returns to the foreground — the two moments a device that was
 * offline at completion time is most likely to be back online. This mirrors the
 * analytics wiring (src/features/progress/use-session-analytics.ts), which the
 * app already uses for the same offline-safe retry shape.
 *
 * No network detection dependency is added: Expo/React Native ship no
 * first-party connectivity primitive in this project, so — exactly like the
 * analytics queue — retrying on foreground and next launch is the chosen trigger
 * rather than adding `@react-native-community/netinfo`. A flush is cheap when the
 * queue is empty and harmless when it is not, because `complete_lesson` is
 * idempotent for XP and unlocks.
 *
 * Everything here is fire-and-forget: a failed flush simply leaves the
 * completions queued for the next attempt, so a sync failure never surfaces to
 * the learner (requirement 5.5 — the result is never lost).
 */
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { completionQueue } from '../completion-queue';

/**
 * Hydrate and flush the pending-completion queue, and re-flush when the app
 * returns to the foreground. Call once at the app root.
 */
export function useCompletionQueue(): void {
  useEffect(() => {
    // Retry anything persisted from a prior run as soon as we start up.
    void completionQueue.hydrate().then(() => completionQueue.flush());

    // Flush again when the app becomes active — a device that was offline at
    // completion time is often back online by the time the learner returns.
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') {
        void completionQueue.flush();
      }
    };
    const subscription = AppState.addEventListener('change', onChange);

    return () => {
      subscription.remove();
    };
  }, []);
}
