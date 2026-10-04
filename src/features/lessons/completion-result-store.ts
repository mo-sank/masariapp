/**
 * Completion result hand-off store (requirements 5.3, 5.4).
 *
 * The results and retry screens (`app/lesson/results`, `app/lesson/retry`) need
 * the full completion outcome — the parsed RPC result (nested unlock arrays and
 * numbers) and the lesson's title/pass score — which does not round-trip cleanly
 * through URL params. Rather than serialize a nested object into the query
 * string, the lesson screen stashes the outcome here keyed by lesson id and
 * navigates by id; the results/retry screen reads it back on mount.
 *
 * This is an ephemeral, in-memory hand-off (the life of a single navigation),
 * mirroring the session store's "no persistence" stance — the durable record of
 * a completion lives server-side. A plain Zustand store keeps it readable from
 * the route screens and resettable in tests without a module singleton hack.
 *
 * No Expo/React Native/network imports — only the pure result types — so it is
 * unit-testable directly.
 */
import { create } from 'zustand';

import type { CompletionResult } from './api/complete-lesson';

/** The outcome handed from the lesson screen to the results/retry screen. */
export interface CompletionOutcome {
  lessonId: string;
  lessonTitle: string;
  /** The lesson's pass threshold, needed by the retry screen (requirement 5.3). */
  passScore: number;
  /** The learner's score this attempt, 0-100. */
  scorePct: number;
  /** The parsed RPC result (pass or sub-pass). */
  result: CompletionResult;
}

interface CompletionResultState {
  /** The pending outcome, or null when none is staged. */
  outcome: CompletionOutcome | null;
  /** Stage an outcome for the results/retry screen to read. */
  set: (outcome: CompletionOutcome) => void;
  /** Clear the staged outcome (after it has been consumed or on exit). */
  clear: () => void;
}

export const useCompletionResultStore = create<CompletionResultState>((set) => ({
  outcome: null,
  set: (outcome) => set({ outcome }),
  clear: () => set({ outcome: null }),
}));
