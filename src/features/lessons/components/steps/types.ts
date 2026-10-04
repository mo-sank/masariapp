/**
 * Step component contract (requirement 4.8).
 *
 * Every step type (cards, mcq, truefalse, predict, sort, match, sim,
 * guided_trade) is rendered by its own component, resolved through the
 * {@link StepRenderer} registry by the lesson player. Requirement 4.8 says each
 * step component MUST be pure — "props in, onAnswer out" with no network calls —
 * so this module defines the single props shape they all share. The real
 * components arrive in tasks 6-9; this contract lets the player and the registry
 * be built now and the components slot in without touching the player.
 *
 * The contract is intentionally narrow:
 *   - `step` is the authored, typed step for this component (each concrete
 *     component narrows it to its own variant, e.g. `McqStep`).
 *   - `onAnswer` reports the learner's response for a *scored* step. The payload
 *     is an {@link Answer} with its `stepId` already set, so the player can
 *     record it and show feedback without re-deriving anything.
 *   - `onContinue` advances past a step that produces no scored answer (a cards
 *     step, or an unscored predict/sim). A component calls exactly one of
 *     `onAnswer`/`onContinue` for a given interaction.
 *
 * Keeping this in its own module (no React import beyond the type) avoids a
 * circular dependency between the registry, the player, and the step components.
 */

import type { Answer } from '../../scoring';
import type { Step } from '../../schema';

/**
 * Props passed to every step component. Generic over the step variant so a
 * concrete component (e.g. the mcq component) receives its narrowed step type.
 */
export interface StepComponentProps<S extends Step = Step> {
  /** The authored step to render. */
  step: S;
  /**
   * Report the learner's answer to a scored step. The `stepId` on the payload
   * must equal `step.id`. The player records the first answer, scores it, and
   * shows feedback before advancing (requirement 3.2).
   */
  onAnswer: (answer: Answer) => void;
  /**
   * Advance past a step that yields no scored answer (e.g. a cards step, or an
   * unscored predict/sim once the learner has seen the reveal). The player moves
   * straight to the next step with no feedback sheet.
   */
  onContinue: () => void;
}

/** A step component: a React component accepting {@link StepComponentProps}. */
export type StepComponent<S extends Step = Step> = React.ComponentType<StepComponentProps<S>>;
