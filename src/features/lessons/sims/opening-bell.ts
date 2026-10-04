/**
 * Opening-bell lab — pure logic (requirements 8.4, 8.5).
 *
 * This is the B1 lab: a 90-second fictional trading day on an invented stock.
 * Five headline events arrive one at a time; at each one the learner first picks
 * the best *interpretation* of the news (an mcq-like choice with one correct
 * reading), then makes a practice buy / hold / sell move. The practice action is
 * for feel only — it is NOT scored on returns (requirement 8.4). The score is
 * simply the share of events whose interpretation the learner read correctly:
 * "Score = correct interpretations / events" (design, "Sim designs").
 *
 * The React component (`components/sims/OpeningBell.tsx`) owns the UI, the
 * ~90-second clock, and the per-event interpretation-then-action loop; this
 * module owns everything that must be deterministic and testable: the authored
 * params, the seeded event order, and the scoring.
 *
 * Determinism (requirement 8.5): the only randomness is the order the authored
 * events are presented in, drawn from the seeded {@link Rng} the player passes
 * in. Given the same seed and params the order is identical on every run and in
 * every test. Nothing here reads a clock or `Math.random`. Pure module: no
 * React, Expo, or network imports.
 */

import { z } from 'zod';

import { shuffle, type Rng } from '../rng';

/* ------------------------------------------------------------------ *
 * Params
 * ------------------------------------------------------------------ */

/** The practice trade actions available at each event (not scored on returns). */
export const OPENING_BELL_ACTIONS = ['buy', 'hold', 'sell'] as const;
export type OpeningBellAction = (typeof OPENING_BELL_ACTIONS)[number];

/** One interpretation option for an event's news. */
export const openingBellInterpretationSchema = z.object({
  /** Stable id so the component can key and report the chosen interpretation. */
  id: z.string().trim().min(1, { error: 'interpretation id must not be empty' }),
  /** The interpretation text shown as a choice. */
  text: z.string().trim().min(1, { error: 'interpretation text must not be empty' }),
});

export type OpeningBellInterpretation = z.infer<typeof openingBellInterpretationSchema>;

/**
 * A single headline event: the news, the interpretation choices, and which one
 * is the best reading. `correctInterpretationId` must reference one of
 * `interpretations` — enforced in the refinement below.
 */
export const openingBellEventSchema = z
  .object({
    /** Stable id so the component can key events and the score can be checked. */
    id: z.string().trim().min(1, { error: 'event id must not be empty' }),
    /** The headline shown to the learner. */
    headline: z.string().trim().min(1, { error: 'event headline must not be empty' }),
    /** The interpretation choices (mcq-like); at least two to choose from. */
    interpretations: z
      .array(openingBellInterpretationSchema)
      .min(2, { error: 'each event needs at least two interpretations' }),
    /** The id of the best interpretation. */
    correctInterpretationId: z
      .string()
      .trim()
      .min(1, { error: 'correctInterpretationId must not be empty' }),
    /** A short explanation shown after the learner answers. */
    explanation: z.string().trim().min(1, { error: 'event explanation must not be empty' }),
  })
  .superRefine((event, ctx) => {
    if (!event.interpretations.some((i) => i.id === event.correctInterpretationId)) {
      ctx.addIssue({
        code: 'custom',
        message: `event "${event.id}" correctInterpretationId does not match any interpretation`,
        path: ['correctInterpretationId'],
      });
    }
  });

export type OpeningBellEvent = z.infer<typeof openingBellEventSchema>;

/**
 * The authored params for an opening-bell step. Validated here (the lab's own
 * contract) because the content schema only guarantees `params` is an object.
 * The design calls for five events over ninety seconds; the schema allows a
 * little slack so authoring, not the schema, polices the exact count.
 */
export const openingBellParamsSchema = z.object({
  /** The fictional ticker shown throughout, e.g. "ACME". */
  symbol: z.string().trim().min(1, { error: 'symbol must not be empty' }),
  /** The total length of the trading day, in seconds (the design's 90s). */
  durationSeconds: z
    .number()
    .int()
    .min(30, { error: 'durationSeconds must be at least 30' })
    .max(300, { error: 'durationSeconds must be at most 300' })
    .default(90),
  /** The headline events; the design authors five. */
  events: z
    .array(openingBellEventSchema)
    .min(1, { error: 'opening bell must have at least one event' })
    .max(10, { error: 'opening bell must have at most ten events' }),
});

export type OpeningBellParams = z.infer<typeof openingBellParamsSchema>;

/**
 * Parse unknown authored params into typed {@link OpeningBellParams}, throwing a
 * Zod error if the shape is wrong. The component calls this once up front.
 */
export function parseOpeningBellParams(params: unknown): OpeningBellParams {
  return openingBellParamsSchema.parse(params);
}

/* ------------------------------------------------------------------ *
 * Event order
 * ------------------------------------------------------------------ */

/**
 * Return the events in the order the lab should present them, shuffled with the
 * seeded `rng` so the order is varied yet reproducible (requirement 8.5). The
 * input array is not mutated. With the same seed and the same events the order
 * is identical on every run, which is what the sim tests assert.
 */
export function orderEvents(
  params: OpeningBellParams,
  rng: Rng,
): OpeningBellEvent[] {
  return shuffle(rng, params.events);
}

/**
 * The number of seconds budgeted per event when the lab paces the day evenly
 * across its duration. Pure helper so the component and tests agree on the
 * pacing; the component uses it to advance its clock, never to gate completion.
 */
export function secondsPerEvent(params: OpeningBellParams): number {
  return params.durationSeconds / params.events.length;
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

/** The learner's answer for one event: the interpretation and practice action. */
export interface OpeningBellChoice {
  /** The id of the event this choice is for. */
  eventId: string;
  /** The interpretation the learner picked. */
  interpretationId: string;
  /** The practice buy/hold/sell action (recorded, not scored on returns). */
  action: OpeningBellAction;
}

/** Whether a single event's interpretation was read correctly. */
export interface OpeningBellEventResult {
  /** The event's id. */
  eventId: string;
  /** The interpretation the learner picked. */
  interpretationId: string;
  /** Whether that interpretation was the best reading. */
  correct: boolean;
  /** The practice action the learner took (for the summary; not scored). */
  action: OpeningBellAction;
}

/** The fully graded result of an opening-bell run. */
export interface OpeningBellResult {
  /** Per-event outcomes, in the order supplied. */
  events: OpeningBellEventResult[];
  /** How many interpretations the learner read correctly. */
  correct: number;
  /** Total events answered. */
  total: number;
  /** Score to report: correct interpretations / events as a 0-100 integer. */
  score: number;
  /** A short, learner-facing summary. */
  summary: string;
}

/**
 * Grade a full opening-bell run on interpretations only (requirement 8.4). An
 * event counts as correct when the chosen interpretation matches the event's
 * `correctInterpretationId`; the practice buy/hold/sell action is recorded but
 * never scored on returns. The score is `correct / events` as a 0-100 integer
 * (design: "Score = correct interpretations / events").
 *
 * Pure and deterministic: the same params and choices always produce the same
 * result, which the tests assert (requirement 8.5). An unknown event id or an
 * interpretation that is not part of that event throws, since the component only
 * ever reports events and options it rendered.
 *
 * @param choices - One per event, in any order; matched to events by `eventId`.
 */
export function scoreOpeningBell(
  params: OpeningBellParams,
  choices: readonly OpeningBellChoice[],
): OpeningBellResult {
  const byId = new Map(params.events.map((e) => [e.id, e] as const));
  const results: OpeningBellEventResult[] = [];
  let correct = 0;

  for (const choice of choices) {
    const event = byId.get(choice.eventId);
    if (!event) {
      throw new Error(`opening bell choice references unknown event "${choice.eventId}"`);
    }
    if (!event.interpretations.some((i) => i.id === choice.interpretationId)) {
      throw new Error(
        `interpretation "${choice.interpretationId}" is not an option for event "${choice.eventId}"`,
      );
    }
    const isCorrect = choice.interpretationId === event.correctInterpretationId;
    if (isCorrect) correct += 1;
    results.push({
      eventId: choice.eventId,
      interpretationId: choice.interpretationId,
      correct: isCorrect,
      action: choice.action,
    });
  }

  const total = choices.length;
  const score = total === 0 ? 0 : Math.round((correct / total) * 100);
  const summary = `You read ${correct} of ${total} ${
    total === 1 ? 'headline' : 'headlines'
  } right.`;

  return { events: results, correct, total, score, summary };
}
