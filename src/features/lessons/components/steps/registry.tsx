/**
 * StepRenderer registry (requirements 4.1-4.8).
 *
 * The lesson player does not know about individual step types — it renders the
 * current step through this registry, which maps a step `type` to the component
 * that handles it. This keeps the player stable as step types are added: a new
 * activity type (tasks 6-9) is wired up by registering its component here, with
 * no change to the player.
 *
 * Design reference: `.kiro/specs/lesson-engine/design.md`
 * ("StepRenderer registry -> step components"; "components/steps/*: CardsStep,
 * McqStep, ... (placeholder until trading spec)").
 *
 * Every step type now resolves to its real component (tasks 6-9). The `sim`
 * type resolves to {@link SimStep}, which itself looks the lab up in the
 * SimRegistry and degrades gracefully for a not-yet-built lab; `guided_trade`
 * resolves to {@link GuidedTradeStep}, a labelled placeholder until the trading
 * spec provides the real order ticket. `StepRenderer` additionally falls back to
 * the generic {@link PlaceholderStep} for any type with no entry, so an
 * unexpected type degrades to a usable step instead of crashing the player.
 */

import { createElement } from 'react';

import { CardsStep } from './CardsStep';
import { GuidedTradeStep } from './GuidedTradeStep';
import { MatchStep } from './MatchStep';
import { McqStep } from './McqStep';
import { PlaceholderStep } from './PlaceholderStep';
import { PredictStep } from './PredictStep';
import { SimStep } from './SimStep';
import { SortStep } from './SortStep';
import { TrueFalseStep } from './TrueFalseStep';
import type { StepComponent, StepComponentProps } from './types';
import type { Step, StepType } from '../../schema';

/**
 * The step-type -> component map. Every known type is present so a missing entry
 * is a type error at build time (the `Record<StepType, ...>` keys are exhaustive
 * over the step union). Real components replace the placeholder entries as tasks
 * 6-9 implement them; swapping an entry is the only change needed to light up a
 * step type in the player.
 */
export const STEP_REGISTRY: Record<StepType, StepComponent> = {
  // Each entry handles exactly its own step variant. The map's value type is the
  // base `StepComponent<Step>`, but a concrete component is typed over its
  // narrowed step (e.g. `StepComponent<McqStep>`); React component props are
  // contravariant, so a narrowed component is not directly assignable to the
  // base. `StepRenderer` always dispatches by `step.type`, so the step a
  // component receives is guaranteed to be its own variant — the cast records
  // that invariant the type system can't express here.
  cards: CardsStep as StepComponent,
  mcq: McqStep as StepComponent,
  truefalse: TrueFalseStep as StepComponent,
  predict: PredictStep as StepComponent,
  sort: SortStep as StepComponent,
  match: MatchStep as StepComponent,
  sim: SimStep as StepComponent,
  guided_trade: GuidedTradeStep as StepComponent,
};

/**
 * Resolve the component for a step type, falling back to the placeholder for an
 * unknown type. Exported so the player (and tests) can look up a renderer
 * without reaching into the map directly.
 */
export function getStepComponent(type: StepType): StepComponent {
  return STEP_REGISTRY[type] ?? PlaceholderStep;
}

/**
 * Render the component registered for `step.type`, passing the step and the
 * player's answer/continue callbacks straight through (requirement 4.8 keeps the
 * components pure). This is the single seam the player renders the active step
 * through.
 */
export function StepRenderer({ step, onAnswer, onContinue }: StepComponentProps<Step>) {
  // Resolve the registered component and render it with createElement rather than
  // binding it to a local JSX tag — the registry entries are stable module-level
  // components, so this does not create a new component type per render.
  return createElement(getStepComponent(step.type), { step, onAnswer, onContinue });
}
