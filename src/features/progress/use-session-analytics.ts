/**
 * Session analytics wiring (requirements 9.2, 9.3).
 *
 * Mounted once at the app root (app/_layout.tsx). It:
 *   - logs a single `session_start` event when the app session begins
 *     (requirement 9.3),
 *   - hydrates any queue persisted from a previous run and starts the periodic
 *     flush timer, and
 *   - flushes the queue when the app goes to the background, so queued events
 *     are sent before the OS may suspend the process (requirement 9.2 — the
 *     design calls for a flush "on app background").
 *
 * A stable per-run session id is generated here and attached to every event the
 * app logs during this run, so events from one app launch can be grouped without
 * identifying the user. The id is random and ephemeral (never persisted), so it
 * carries no PII.
 *
 * Analytics must never break a user flow, so everything here is fire-and-forget:
 * `track` and `flush` swallow their own errors, and a failed flush simply leaves
 * events queued for the next attempt.
 */
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { analytics, setSessionId, track } from '../../lib/analytics';

/** Generate a random, ephemeral session id (not persisted, no PII). */
function newSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Start the analytics session: set the session id, log `session_start`, hydrate
 * and start the queue, and flush on background. Call once at the app root.
 */
export function useSessionAnalytics(): void {
  useEffect(() => {
    const sessionId = newSessionId();
    setSessionId(sessionId);

    // Hydrate any persisted queue first so leftover events from a prior run are
    // retried, then start the periodic flush timer.
    void analytics.hydrate().then(() => {
      analytics.start();
      // Requirement 9.3: log the session start exactly once per session.
      track('session_start');
    });

    // Flush when the app leaves the foreground so queued events are not stuck on
    // the device if the OS suspends/terminates the process.
    const onChange = (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        void analytics.flush();
      }
    };
    const subscription = AppState.addEventListener('change', onChange);

    return () => {
      subscription.remove();
      analytics.stop();
    };
  }, []);
}
