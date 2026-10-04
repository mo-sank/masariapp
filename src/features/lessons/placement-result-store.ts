/**
 * Placement result hand-off store (requirements 6.1, 6.3).
 *
 * The placement results screen (`app/lesson/placement`) needs the finished
 * Placement Quest's title and the features it unlocked, which do not round-trip
 * cleanly through URL params. Mirroring {@link useCompletionResultStore}, the
 * lesson screen stashes the outcome here and navigates by route; the placement
 * screen reads it back on mount.
 *
 * This is kept separate from the scored completion store on purpose: a placement
 * outcome carries no score, no pass/fail, and no per-item breakdown (requirement
 * 6.3's no-reveal), so conflating it with {@link CompletionOutcome} would invite
 * a screen to read a score that must never be shown. An ephemeral, in-memory
 * hand-off (the life of a single navigation) — the durable record lives
 * server-side in `assessment_results` and `lesson_progress`.
 *
 * No Expo/React Native/network imports, so it is unit-testable directly.
 */
import { create } from 'zustand';

/** The outcome handed from the lesson screen to the placement results screen. */
export interface PlacementOutcome {
  lessonId: string;
  lessonTitle: string;
  /** Feature keys unlocked by completing the placement (from `complete_lesson`). */
  unlocked: string[];
}

interface PlacementResultState {
  /** The pending outcome, or null when none is staged. */
  outcome: PlacementOutcome | null;
  /** Stage an outcome for the placement results screen to read. */
  set: (outcome: PlacementOutcome) => void;
  /** Clear the staged outcome (after it has been consumed or on exit). */
  clear: () => void;
}

export const usePlacementResultStore = create<PlacementResultState>((set) => ({
  outcome: null,
  set: (outcome) => set({ outcome }),
  clear: () => set({ outcome: null }),
}));
