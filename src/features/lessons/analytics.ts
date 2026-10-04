/**
 * Lesson analytics events (requirement 10.1).
 *
 * Requirement 10.1 asks the app to log a lesson lifecycle: when a lesson starts,
 * when a scored step is answered, when a lesson completes, and when a Rewind
 * session finishes — carrying the lesson id, step id, correctness, and duration,
 * and *no free text*. This module gives the player (and later the Rewind screen)
 * typed helpers so every call-site logs a well-formed event instead of hand-
 * assembling prop bags, and so the "no free text" rule is enforced by the types:
 * every prop is an id, a boolean, or a number.
 *
 * The event NAMES are the four lesson entries in the shared allowlist
 * (src/features/progress/analytics-events.ts); `track` drops anything not in
 * that list and the `log_events` RPC enforces the same set server-side. These
 * helpers are thin wrappers over `track` and inherit its guarantees: calls are
 * fire-and-forget, never throw, and attach the session id and app version.
 *
 * Pure wrappers over `track` — no React, Expo, or network imports here.
 */

import { track } from '../../lib/analytics';

/**
 * Lesson started (requirement 10.1). Logged once when a session begins in the
 * player. Carries only the lesson id.
 */
export function trackLessonStarted(lessonId: string): void {
  track('lesson_started', { props: { lesson_id: lessonId } });
}

/**
 * Scored step answered (requirement 10.1). Logged when the learner answers a
 * scored step, carrying which lesson and step and whether the answer was
 * correct. Only scored steps produce this event (an unscored card has nothing
 * to be correct about).
 */
export function trackStepAnswered(
  lessonId: string,
  stepId: string,
  correct: boolean,
): void {
  track('step_answered', {
    props: { lesson_id: lessonId, step_id: stepId, correct },
  });
}

/**
 * Lesson completed (requirement 10.1, 3.5). Logged when a lesson run reaches the
 * end, carrying the lesson id, the final 0-100 score, and the actual duration in
 * milliseconds (requirement 3.5 records the real time, not the authored
 * estimate).
 */
export function trackLessonCompleted(
  lessonId: string,
  scorePct: number,
  durationMs: number,
): void {
  track('lesson_completed', {
    props: { lesson_id: lessonId, score: scorePct, duration_ms: durationMs },
  });
}

/**
 * Rewind session completed (requirement 10.1, 7.3). Logged when a Rewind session
 * finishes, carrying how many items were reviewed and the session duration. The
 * Rewind screen (a later task) is the caller; the helper lives here so all
 * lesson analytics share one module.
 */
export function trackRewindSessionCompleted(
  itemsReviewed: number,
  durationMs: number,
): void {
  track('rewind_session_completed', {
    props: { items_reviewed: itemsReviewed, duration_ms: durationMs },
  });
}
