/**
 * Pure tutorial step sequencing (onboarding-revamp, first-run coachmark tour).
 *
 * The coachmark overlay walks the user through a fixed, ordered list of steps —
 * one per spotlighted UI target. All the sequencing logic (which step is
 * current, when "Next" becomes "Done", when the tour ends) lives here as a pure
 * reducer so it can be unit tested without React, a device, or layout
 * measurement. The overlay component is a thin view over this state.
 */

/** One step of the tour: a target to spotlight plus the tooltip copy. */
export interface TutorialStep {
  /** Identifier of the registered target this step spotlights (e.g. a tab key). */
  targetId: string;
  /** Tooltip heading. */
  title: string;
  /** Tooltip body copy. */
  body: string;
}

/** The tour's progress through its steps. */
export interface TutorialState {
  /** Index of the current step. Equals `total` once the tour has ended. */
  index: number;
  /** Total number of steps. */
  total: number;
  /** True once the tour is finished (completed through the end or skipped). */
  done: boolean;
  /** How the tour ended, or null while still running. */
  outcome: 'completed' | 'skipped' | null;
}

/** Actions that advance or end the tour. */
export type TutorialAction = { type: 'next' } | { type: 'skip' };

/** Build the initial state for a tour of `total` steps. */
export function initTutorial(total: number): TutorialState {
  // A zero-step tour is immediately done (nothing to show).
  if (total <= 0) {
    return { index: 0, total: 0, done: true, outcome: 'completed' };
  }
  return { index: 0, total, done: false, outcome: null };
}

/** Whether the current step is the last one (its CTA reads "Done", not "Next"). */
export function isLastStep(state: TutorialState): boolean {
  return !state.done && state.index === state.total - 1;
}

/**
 * Advance the tour. Once `done`, further actions are no-ops (idempotent):
 *   - `next` on a middle step moves to the next step; on the last step it
 *     completes the tour.
 *   - `skip` ends the tour immediately with the `skipped` outcome.
 */
export function tutorialReducer(state: TutorialState, action: TutorialAction): TutorialState {
  if (state.done) {
    return state;
  }

  switch (action.type) {
    case 'skip':
      return { ...state, index: state.total, done: true, outcome: 'skipped' };
    case 'next': {
      if (isLastStep(state)) {
        return { ...state, index: state.total, done: true, outcome: 'completed' };
      }
      return { ...state, index: state.index + 1 };
    }
    default:
      return state;
  }
}
