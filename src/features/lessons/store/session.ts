/**
 * In-memory lesson session store (requirements 3.1, 3.3, 5.1).
 *
 * Tracks the learner's progress through the lesson currently being played: the
 * active lesson, which step they are on, the answers recorded so far, when the
 * session started, and the player's phase. The lesson player (requirement 3.1)
 * reads `stepIndex`/`status` to show the progress bar and the current step,
 * records each response with `answer`, and advances with `next`; the completion
 * flow reads `answers` and `startedAt` to score the lesson (requirement 5.1)
 * and report its duration (requirement 5.2).
 *
 * Resume-in-session (requirement 3.3): when the learner exits mid-lesson and
 * reopens the SAME lesson while the app is still running, they resume at the
 * same step. `resumeIfSameSession` expresses exactly that — it is a no-op when
 * the reopened lesson matches the active session, and starts fresh otherwise.
 * "Session" means the life of the running app, so like `onboarding-store`, this
 * is a plain Zustand store with no persistence middleware: state lives in memory
 * and is gone on reload. Durable progress lives server-side via `complete_lesson`.
 *
 * Design reference: `.kiro/specs/lesson-engine/design.md`
 * ("store/session.ts (Zustand): lessonId, stepIndex, answers[], startedAt,
 * status ('idle'|'playing'|'feedback'|'done'); actions answer(), next(), exit(),
 * resumeIfSameSession()").
 *
 * No Expo/React Native/network imports — only the pure `Answer` type — so the
 * store can be unit-tested directly.
 */
import { create } from 'zustand';

import type { Answer } from '../scoring';

/**
 * The player's phase.
 *  - idle:     no session active (initial state, and after `exit`).
 *  - playing:  showing the current step, waiting for the learner.
 *  - feedback: a scored step was answered; showing correct/incorrect feedback
 *              before advancing (requirement 3.2).
 *  - done:     the last step is complete; ready to score and submit.
 */
export type SessionStatus = 'idle' | 'playing' | 'feedback' | 'done';

export interface SessionState {
  /** The lesson being played, or null when idle. */
  lessonId: string | null;
  /** Zero-based index of the current step within the lesson. */
  stepIndex: number;
  /** Answers recorded so far, one per scored step the learner has answered. */
  answers: Answer[];
  /** Epoch ms when the current session started, or null when idle. Feeds duration. */
  startedAt: number | null;
  /** The player's current phase. */
  status: SessionStatus;

  /**
   * Begin a fresh session for `lessonId`, resetting step, answers, and timer.
   * Called by the player when a lesson is opened for the first time.
   */
  start: (lessonId: string) => void;

  /**
   * Record the learner's answer to the current step. The first answer wins:
   * a repeat answer for the same step id is ignored so the recorded response is
   * the first try (requirement 5.1). Moves the player into `feedback`.
   */
  answer: (answer: Answer) => void;

  /**
   * Advance to the next step. `totalSteps` is the lesson's step count; when the
   * current step is the last one the session moves to `done` and the index is
   * left on the final step, otherwise it increments and returns to `playing`.
   */
  next: (totalSteps: number) => void;

  /** End the session and clear all state (e.g. the learner confirms an exit). */
  exit: () => void;

  /**
   * Resume the given lesson if it is the one already in progress; otherwise
   * start it fresh (requirement 3.3). Idempotent for the active lesson — the
   * step and recorded answers are preserved so reopening lands on the same step.
   */
  resumeIfSameSession: (lessonId: string) => void;
}

/** The idle baseline, reused by the initial state and `exit`. */
const IDLE = {
  lessonId: null,
  stepIndex: 0,
  answers: [] as Answer[],
  startedAt: null,
  status: 'idle' as SessionStatus,
};

export const useSessionStore = create<SessionState>((set, get) => ({
  ...IDLE,

  start: (lessonId) =>
    set({
      lessonId,
      stepIndex: 0,
      answers: [],
      startedAt: Date.now(),
      status: 'playing',
    }),

  answer: (answer) =>
    set((state) => {
      // First try wins: ignore a repeated answer for a step already recorded.
      if (state.answers.some((a) => a.stepId === answer.stepId)) {
        return { status: 'feedback' };
      }
      return { answers: [...state.answers, answer], status: 'feedback' };
    }),

  next: (totalSteps) =>
    set((state) => {
      const isLast = state.stepIndex >= totalSteps - 1;
      return isLast
        ? { status: 'done' }
        : { stepIndex: state.stepIndex + 1, status: 'playing' };
    }),

  exit: () => set({ ...IDLE }),

  resumeIfSameSession: (lessonId) => {
    // Same lesson already in flight: keep the step and answers (requirement 3.3).
    if (get().lessonId === lessonId && get().status !== 'idle') return;
    // Different lesson, or no active session: start fresh.
    get().start(lessonId);
  },
}));
