/**
 * Sim (lab) component contract (requirements 4.6, 8.5).
 *
 * Each hands-on lab — OwnershipSplit, Auction, PnlReplay, OpeningBell — is a
 * React component resolved by `simId` through the {@link SimRegistry}. The
 * lesson's sim step is rendered by `SimStep`, which looks up the lab, validates
 * the step's `params` against that lab's schema, derives a stable seed from the
 * step id, and hands both to the component. This module defines the single props
 * shape every lab shares so SimStep stays decoupled from any one lab's internals.
 *
 * Design reference: `.kiro/specs/lesson-engine/design.md` ("components/sims/*
 * ... A SimRegistry maps simId to component. Each sim: props { params, seed,
 * onComplete({ score, summary }) }").
 *
 * The contract is deliberately narrow:
 *   - `params` is the authored, free-form params object for this sim step. Each
 *     lab validates it with its own Zod schema (design: "params (per sim,
 *     validated)"), so the shape is `unknown` here.
 *   - `seed` is a stable 32-bit integer derived from the step id (requirement
 *     8.5), so the lab's randomness is identical across runs. Every lab receives
 *     one even if it is deterministic and ignores it.
 *   - `onComplete` reports the finished run's 0-100 `score` and a short
 *     `summary`. SimStep turns that into a sim {@link Answer} (scored) or simply
 *     advances (unscored). A lab calls it exactly once, when the learner
 *     finishes.
 *
 * Keeping this in its own module (type-only imports) avoids a circular
 * dependency between the registry, SimStep, and the lab components.
 */

/** The outcome a lab reports when the learner finishes its run. */
export interface SimOutcome {
  /** The lab's self-graded score, 0-100. SimStep clamps and forwards it. */
  score: number;
  /** A short, learner-facing summary of how the run went. */
  summary: string;
}

/** Props passed to every lab component. */
export interface SimComponentProps {
  /** The authored params for this sim step; each lab validates its own shape. */
  params: unknown;
  /** Stable per-step seed for the lab's randomness (requirement 8.5). */
  seed: number;
  /** Report the finished run. A lab calls this exactly once, on completion. */
  onComplete: (outcome: SimOutcome) => void;
}

/** A lab component: a React component accepting {@link SimComponentProps}. */
export type SimComponent = React.ComponentType<SimComponentProps>;
