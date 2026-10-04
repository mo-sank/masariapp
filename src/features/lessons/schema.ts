/**
 * Lesson content model and validation (requirements 1.1, 1.2, 1.3).
 *
 * Lessons ship as JSON files under `content/lessons`. This module is the single
 * source of truth for their shape: content authors edit JSON, the loader
 * (`content.ts`) and the `validate:content` script parse it through the schemas
 * here, and the rest of the app consumes the inferred types. Nothing about a
 * lesson's structure is defined anywhere else.
 *
 * Design reference: `.kiro/specs/lesson-engine/design.md` ("Content schema").
 *
 * Zod v4 conventions (matching src/lib/config.ts): a single `error` string on a
 * check doubles as the message for both a missing/wrong-type value and a failed
 * refinement, so messages stay readable and never echo the offending value.
 *
 * Everything here is pure data validation — no Expo, React Native, or network
 * imports — so it runs identically in the app, in Jest, and in the Node-based
 * `scripts/validate-content.ts`.
 */

import { z } from 'zod';

/* ------------------------------------------------------------------ *
 * Shared primitives
 * ------------------------------------------------------------------ */

/**
 * A content identifier (lesson id, step id, option id, ...). Kept deliberately
 * permissive — a trimmed non-empty string — because authors choose readable ids
 * like `L1.1` or `s3`. Cross-file rules (uniqueness, prerequisites exist) are
 * enforced by the validation script, not the schema, because they need the
 * whole set of lessons.
 */
const id = z
  .string({ error: 'id must be a string' })
  .trim()
  .min(1, { error: 'id must not be empty' });

/** A non-empty human-readable string (prompts, titles, explanations). */
const text = (name: string) =>
  z
    .string({ error: `${name} must be a string` })
    .trim()
    .min(1, { error: `${name} must not be empty` });

/** An `{ id, text }` choice used by mcq and predict steps. */
const choice = z.object({
  id,
  text: text('option text'),
});

/* ------------------------------------------------------------------ *
 * Steps (discriminated union on `type`)
 *
 * Every step carries an `id` and optional `scored` / `concept`. Requirement 1.3
 * additionally requires that every *scored* item has a concept tag; that
 * cross-field rule is applied per-step with `superRefine` on the union below so
 * the error points at the exact step.
 * ------------------------------------------------------------------ */

/** Fields shared by every step type. */
const stepBase = {
  id,
  /** Whether the step contributes to the lesson score. Defaults per type. */
  scored: z.boolean().optional(),
  /** Concept tag for scored items (requirement 1.3) and Rewind grouping. */
  concept: text('concept').optional(),
};

/** cards: swipeable micro-cards (requirement 4.1). Never scored. */
const cardsStep = z.object({
  ...stepBase,
  type: z.literal('cards'),
  cards: z
    .array(
      z.object({
        title: text('card title').optional(),
        body: text('card body'),
        emoji: text('card emoji').optional(),
      }),
    )
    .min(1, { error: 'cards must have at least one card' }),
});

/**
 * mcq: single-answer multiple choice with an explanation (requirement 4.2).
 * The `explain` variant asks the learner to pick the best explanation.
 * `correctId` must reference one of `options` — checked in `superRefine`.
 */
const mcqStep = z.object({
  ...stepBase,
  type: z.literal('mcq'),
  prompt: text('mcq prompt'),
  options: z.array(choice).min(2, { error: 'mcq must have at least two options' }),
  correctId: id,
  explanation: text('mcq explanation'),
  variant: z.enum(['standard', 'explain']).default('standard'),
  scored: z.boolean().default(true),
});

/** truefalse: a single true/false question with an explanation (requirement 4.2). */
const trueFalseStep = z.object({
  ...stepBase,
  type: z.literal('truefalse'),
  prompt: text('truefalse prompt'),
  answer: z.boolean({ error: 'truefalse answer must be true or false' }),
  explanation: text('truefalse explanation'),
  scored: z.boolean().default(true),
});

/**
 * predict: the learner must choose before the result is revealed (requirement
 * 4.3). Scored is opt-in (`default false`); when scored, `correctId` is required
 * and must reference an option — enforced in `superRefine`.
 */
const predictStep = z.object({
  ...stepBase,
  type: z.literal('predict'),
  prompt: text('predict prompt'),
  options: z.array(choice).min(2, { error: 'predict must have at least two options' }),
  correctId: id.optional(),
  reveal: text('predict reveal'),
  scored: z.boolean().default(false),
});

/**
 * sort: drag/tap items into labeled buckets (requirement 4.4). Every item's
 * `bucketId` must reference a declared bucket — checked in `superRefine`.
 */
const sortStep = z.object({
  ...stepBase,
  type: z.literal('sort'),
  prompt: text('sort prompt'),
  buckets: z
    .array(z.object({ id, label: text('bucket label') }))
    .min(2, { error: 'sort must have at least two buckets' }),
  items: z
    .array(z.object({ id, text: text('item text'), bucketId: id }))
    .min(1, { error: 'sort must have at least one item' }),
  explanation: text('sort explanation'),
  scored: z.boolean().default(true),
});

/** match: pair terms with definitions (requirement 4.5). */
const matchStep = z.object({
  ...stepBase,
  type: z.literal('match'),
  prompt: text('match prompt'),
  pairs: z
    .array(z.object({ id, left: text('pair left'), right: text('pair right') }))
    .min(2, { error: 'match must have at least two pairs' }),
  explanation: text('match explanation'),
  scored: z.boolean().default(true),
});

/** The simulations registered in the sim framework (requirement 4.6). */
export const SIM_IDS = ['ownership_split', 'auction', 'pnl_replay', 'opening_bell'] as const;

/**
 * sim: renders a registered lab by `simId` (requirement 4.6). `params` is a
 * free-form record validated per-sim by the individual lab (design: "params
 * (per sim, validated)"); the schema only guarantees it is an object so the
 * loader stays decoupled from each lab's internals. Scored is opt-in.
 */
const simStep = z.object({
  ...stepBase,
  type: z.literal('sim'),
  simId: z.enum(SIM_IDS),
  params: z.record(z.string(), z.unknown()),
  goal: text('sim goal'),
  scored: z.boolean().default(false),
});

/**
 * guided_trade: the trading order ticket in guided mode (requirement 4.7).
 * Rendered as a labeled placeholder until the market-data-paper-trading spec
 * provides the real ticket. Never scored.
 */
const guidedTradeStep = z.object({
  ...stepBase,
  type: z.literal('guided_trade'),
  symbols: z.literal('starter'),
  requireRationale: z.literal(true),
});

/**
 * The step union. `superRefine` applies the cross-field rules that a plain
 * discriminated union cannot express, each with a `path` so the reported error
 * points at the exact field:
 *  - scored items must carry a concept tag (requirement 1.3);
 *  - mcq/predict `correctId` must reference a declared option;
 *  - scored predict steps must declare a `correctId`;
 *  - sort item `bucketId`s must reference declared buckets.
 */
export const stepSchema = z
  .discriminatedUnion('type', [
    cardsStep,
    mcqStep,
    trueFalseStep,
    predictStep,
    sortStep,
    matchStep,
    simStep,
    guidedTradeStep,
  ])
  .superRefine((step, ctx) => {
    // Requirement 1.3: every scored item has a concept tag.
    if (step.scored && !step.concept) {
      ctx.addIssue({
        code: 'custom',
        message: `scored step "${step.id}" must have a concept tag`,
        path: ['concept'],
      });
    }

    if (step.type === 'mcq') {
      if (!step.options.some((o) => o.id === step.correctId)) {
        ctx.addIssue({
          code: 'custom',
          message: `mcq correctId "${step.correctId}" does not match any option`,
          path: ['correctId'],
        });
      }
    }

    if (step.type === 'predict') {
      if (step.scored && !step.correctId) {
        ctx.addIssue({
          code: 'custom',
          message: 'scored predict step must declare a correctId',
          path: ['correctId'],
        });
      }
      if (step.correctId && !step.options.some((o) => o.id === step.correctId)) {
        ctx.addIssue({
          code: 'custom',
          message: `predict correctId "${step.correctId}" does not match any option`,
          path: ['correctId'],
        });
      }
    }

    if (step.type === 'sort') {
      const bucketIds = new Set(step.buckets.map((b) => b.id));
      step.items.forEach((item, index) => {
        if (!bucketIds.has(item.bucketId)) {
          ctx.addIssue({
            code: 'custom',
            message: `sort item "${item.id}" references unknown bucket "${item.bucketId}"`,
            path: ['items', index, 'bucketId'],
          });
        }
      });
    }
  });

/* ------------------------------------------------------------------ *
 * Lesson (top level)
 * ------------------------------------------------------------------ */

/** Lesson kinds shown as different nodes on the learning path (requirement 2.1). */
export const LESSON_KINDS = ['placement', 'lesson', 'boss'] as const;

/**
 * The top-level lesson schema. Within a single lesson it enforces that step ids
 * are unique (requirement 1.3) via `superRefine`. Cross-lesson rules — globally
 * unique lesson ids and existing prerequisites — need every lesson at once and
 * live in `scripts/validate-content.ts`.
 */
export const lessonSchema = z
  .object({
    id,
    unit: z.number().int().nonnegative({ error: 'unit must be a non-negative integer' }),
    order: z.number().int().nonnegative({ error: 'order must be a non-negative integer' }),
    kind: z.enum(LESSON_KINDS),
    title: text('title'),
    bigIdea: text('bigIdea'),
    // Authored lessons target a 3-4 minute playthrough (requirement 3.5); allow
    // a little slack (1-6) so content review, not the schema, polices pacing.
    estimatedMinutes: z
      .number()
      .int()
      .min(1, { error: 'estimatedMinutes must be at least 1' })
      .max(6, { error: 'estimatedMinutes must be at most 6' }),
    xp: z.number().int().nonnegative({ error: 'xp must be a non-negative integer' }),
    passScore: z
      .number()
      .int()
      .min(0, { error: 'passScore must be between 0 and 100' })
      .max(100, { error: 'passScore must be between 0 and 100' }),
    // The id of the prerequisite lesson, or null for an entry point (e.g. L0).
    prerequisite: id.nullable(),
    concepts: z.array(text('concept')).min(1, { error: 'concepts must not be empty' }),
    // Feature keys unlocked on completion (requirement 2.3); may be empty.
    unlocks: z.array(text('unlock')),
    steps: z.array(stepSchema).min(1, { error: 'a lesson must have at least one step' }),
  })
  .superRefine((lesson, ctx) => {
    // Requirement 1.3: step ids are unique within a lesson.
    const seen = new Set<string>();
    lesson.steps.forEach((step, index) => {
      if (seen.has(step.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate step id "${step.id}" within lesson "${lesson.id}"`,
          path: ['steps', index, 'id'],
        });
      }
      seen.add(step.id);
    });
  });

/* ------------------------------------------------------------------ *
 * Inferred types
 * ------------------------------------------------------------------ */

export type Lesson = z.infer<typeof lessonSchema>;
export type Step = z.infer<typeof stepSchema>;
export type StepType = Step['type'];
export type SimId = (typeof SIM_IDS)[number];
export type LessonKind = (typeof LESSON_KINDS)[number];

/** Narrowed step types, handy for the step components and the renderer registry. */
export type CardsStep = Extract<Step, { type: 'cards' }>;
export type McqStep = Extract<Step, { type: 'mcq' }>;
export type TrueFalseStep = Extract<Step, { type: 'truefalse' }>;
export type PredictStep = Extract<Step, { type: 'predict' }>;
export type SortStep = Extract<Step, { type: 'sort' }>;
export type MatchStep = Extract<Step, { type: 'match' }>;
export type SimStep = Extract<Step, { type: 'sim' }>;
export type GuidedTradeStep = Extract<Step, { type: 'guided_trade' }>;
