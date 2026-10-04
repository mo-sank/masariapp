/**
 * P&L replay lab — pure logic (requirements 8.3, 8.5).
 *
 * This is the L1.5 lab: a price path is fast-forwarded from the point the
 * learner "bought" in; at a prompt partway through, the learner chooses to sell
 * or hold. The lab shows the *unrealized* profit/loss at the prompt and then the
 * *realized* profit/loss at the end — sell locks in the prompt-time price, hold
 * rides the path to the final price (requirement 8.3). The React component
 * (`components/sims/PnlReplay.tsx`) owns the fast-forward animation and the
 * sell/hold choice; this module owns everything that must be deterministic and
 * testable: the authored params, the (optionally seeded) price path, and the
 * P&L maths.
 *
 * Design reference: `.kiro/specs/lesson-engine/design.md` ("Sim designs"):
 *   fixed or seeded price path; learner "bought" at index i; plays forward and
 *   chooses sell/hold at a prompt; show unrealized then realized P&L; then a
 *   sort step classifies statements.
 *
 * The sort step that follows is authored lesson content (a separate `sort`
 * step), not part of this lab — the lab itself handles the buy / sell-or-hold
 * replay and reports a score.
 *
 * Scoring: this lab teaches rather than tests a "right answer" — both sell and
 * hold are legitimate choices. The score reflects whether the learner's choice
 * captured the better realized outcome given the path they saw: 100 if their
 * decision realized at least as much as the alternative would have, else 60. The
 * learner always sees both numbers so the lesson lands either way.
 *
 * Determinism (requirement 8.5): the price path is either authored outright
 * (`prices`) or generated from the seeded {@link Rng} the player passes in
 * (`generator`). Given the same seed and params, the generated path is identical
 * on every run and in every test. Nothing here reads a clock or `Math.random`.
 * Pure module: no React, Expo, or network imports.
 */

import { z } from 'zod';

import type { Rng } from '../rng';

/* ------------------------------------------------------------------ *
 * Params
 * ------------------------------------------------------------------ */

/** The two decisions the learner can make at the prompt. */
export const PNL_DECISIONS = ['sell', 'hold'] as const;
export type PnlDecision = (typeof PNL_DECISIONS)[number];

/**
 * A seeded random-walk generator for a price path, used when the content does
 * not author `prices` outright. Each step moves the price by a small random
 * fraction in [-drift-vol, drift+vol], so paths vary with the seed while staying
 * recognisably "a stock". All fields have gentle defaults so authors can request
 * `{ generator: {} }` for a reasonable path.
 */
export const pnlGeneratorSchema = z.object({
  /** How many points the path has, including the buy point. */
  steps: z
    .number()
    .int()
    .min(2, { error: 'generator steps must be at least 2' })
    .default(12),
  /** Central tendency per step, as a fraction (e.g. 0.01 = +1% average drift). */
  drift: z
    .number()
    .min(-0.1, { error: 'drift must be at least -0.1' })
    .max(0.1, { error: 'drift must be at most 0.1' })
    .default(0.0),
  /** Max symmetric wobble per step, as a fraction of the price (0.05 = +/-5%). */
  volatility: z
    .number()
    .min(0, { error: 'volatility must be non-negative' })
    .max(0.5, { error: 'volatility must be at most 0.5' })
    .default(0.06),
});

export type PnlGenerator = z.infer<typeof pnlGeneratorSchema>;

/**
 * The authored params for a pnl_replay step. The content schema only guarantees
 * `params` is an object; this schema is the lab's own contract. Exactly one of
 * `prices` (a fixed authored path) or `generator` (a seeded random walk) must be
 * supplied — enforced in the refinement below — so a step is either fully
 * deterministic by authoring or deterministic by seed.
 */
export const pnlReplayParamsSchema = z
  .object({
    /** The number of shares the learner bought at the buy point. */
    shares: z
      .number()
      .int()
      .min(1, { error: 'shares must be at least 1' })
      .default(1),
    /** Index into the price path where the learner "bought". */
    buyIndex: z
      .number()
      .int()
      .min(0, { error: 'buyIndex must be non-negative' })
      .default(0),
    /** Index into the price path where the sell/hold prompt appears. */
    promptIndex: z
      .number()
      .int()
      .min(1, { error: 'promptIndex must be at least 1' }),
    /** A fixed authored price path, in cents. Mutually exclusive with generator. */
    prices: z
      .array(z.number().int().min(1, { error: 'each price must be at least 1 cent' }))
      .min(2, { error: 'prices must have at least two points' })
      .optional(),
    /** Starting price for a generated path, in cents (used with generator). */
    startPriceCents: z
      .number()
      .int()
      .min(1, { error: 'startPriceCents must be at least 1' })
      .optional(),
    /** A seeded generator for the price path. Mutually exclusive with prices. */
    generator: pnlGeneratorSchema.optional(),
  })
  .superRefine((params, ctx) => {
    const hasPrices = params.prices !== undefined;
    const hasGenerator = params.generator !== undefined;
    if (hasPrices === hasGenerator) {
      ctx.addIssue({
        code: 'custom',
        message: 'provide exactly one of prices or generator',
        path: ['prices'],
      });
    }
    if (hasGenerator && params.startPriceCents === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'startPriceCents is required when using a generator',
        path: ['startPriceCents'],
      });
    }
    // promptIndex and buyIndex must sit inside an authored path.
    if (params.prices) {
      const last = params.prices.length - 1;
      if (params.buyIndex > last) {
        ctx.addIssue({
          code: 'custom',
          message: 'buyIndex is past the end of the price path',
          path: ['buyIndex'],
        });
      }
      if (params.promptIndex > last) {
        ctx.addIssue({
          code: 'custom',
          message: 'promptIndex is past the end of the price path',
          path: ['promptIndex'],
        });
      }
    }
    if (params.promptIndex <= params.buyIndex) {
      ctx.addIssue({
        code: 'custom',
        message: 'promptIndex must be after buyIndex',
        path: ['promptIndex'],
      });
    }
  });

export type PnlReplayParams = z.infer<typeof pnlReplayParamsSchema>;

/**
 * Parse unknown authored params into typed {@link PnlReplayParams}, throwing a
 * Zod error if the shape is wrong. The component calls this once up front.
 */
export function parsePnlReplayParams(params: unknown): PnlReplayParams {
  return pnlReplayParamsSchema.parse(params);
}

/* ------------------------------------------------------------------ *
 * Price path
 * ------------------------------------------------------------------ */

/**
 * Build the full price path (in cents) the lab replays. If `prices` is authored
 * it is returned as-is; otherwise a seeded random walk is generated from
 * `startPriceCents` and the `generator` settings, drawing every step from the
 * shared `rng` so the path is identical across runs with the same seed
 * (requirement 8.5). Each generated price is rounded to a whole cent and floored
 * at 1 so the price stays a positive integer.
 */
export function buildPricePath(params: PnlReplayParams, rng: Rng): number[] {
  if (params.prices) return params.prices.slice();

  // Generator path: startPriceCents and generator are guaranteed present by the
  // schema refinement when prices is absent.
  const start = params.startPriceCents as number;
  const gen = params.generator as PnlGenerator;
  const path: number[] = [start];
  let price = start;
  for (let i = 1; i < gen.steps; i++) {
    // Symmetric wobble in [-volatility, +volatility] plus the drift.
    const move = gen.drift + (rng() * 2 - 1) * gen.volatility;
    price = Math.max(1, Math.round(price * (1 + move)));
    path.push(price);
  }
  return path;
}

/* ------------------------------------------------------------------ *
 * P&L maths
 * ------------------------------------------------------------------ */

/** Profit/loss at a point, in cents and as a percentage of cost basis. */
export interface Pnl {
  /** Profit (positive) or loss (negative) in cents. */
  pnlCents: number;
  /** The same as a percentage of the cost basis, to one decimal place. */
  pnlPct: number;
}

/**
 * Compute the P&L of holding `shares` bought at `buyPriceCents` when the price
 * is now `currentPriceCents`. Positive is profit, negative is loss. The percent
 * is relative to the cost basis (`shares * buyPrice`); a zero cost basis yields
 * 0% (it cannot happen with valid params, but stays safe).
 */
export function computePnl(
  shares: number,
  buyPriceCents: number,
  currentPriceCents: number,
): Pnl {
  const costBasis = shares * buyPriceCents;
  const value = shares * currentPriceCents;
  const pnlCents = value - costBasis;
  const pnlPct = costBasis === 0 ? 0 : Math.round((pnlCents / costBasis) * 1000) / 10;
  return { pnlCents, pnlPct };
}

/* ------------------------------------------------------------------ *
 * Replay + scoring
 * ------------------------------------------------------------------ */

/** The fully graded result of a P&L replay. */
export interface PnlReplayResult {
  /** The buy price, in cents. */
  buyPriceCents: number;
  /** The price at the sell/hold prompt, in cents. */
  promptPriceCents: number;
  /** The final price at the end of the path, in cents. */
  finalPriceCents: number;
  /** The learner's decision at the prompt. */
  decision: PnlDecision;
  /** Unrealized P&L at the prompt (what the position was worth on paper). */
  unrealized: Pnl;
  /** Realized P&L the learner's decision actually locked in. */
  realized: Pnl;
  /** Realized P&L the *other* decision would have locked in, for comparison. */
  alternative: Pnl;
  /** Score to report: 100 if the decision was at least as good, else 60. */
  score: number;
  /** A short, learner-facing summary. */
  summary: string;
}

/**
 * Replay a P&L path end to end and grade the learner's decision (requirement
 * 8.3). The learner bought at `buyIndex` and faces the prompt at `promptIndex`:
 *   - "sell" realizes the prompt-time price (the position is closed there);
 *   - "hold" realizes the final price at the end of the path.
 * The unrealized P&L shown at the prompt is always the prompt-time P&L. The
 * score is 100 when the learner's realized P&L is at least the alternative's
 * (they captured the better outcome), else 60 — both decisions are legitimate,
 * so this nudges without punishing, and the learner always sees both numbers.
 *
 * Pure and deterministic: given the same `path`, params, and decision it always
 * returns the same result (requirement 8.5). The component drives the live
 * fast-forward; this function is the oracle the tests use and the lab uses to
 * compute the reported score.
 *
 * @param path - The full price path in cents (from {@link buildPricePath}).
 * @param params - The validated params (shares, buyIndex, promptIndex).
 * @param decision - The learner's sell/hold choice at the prompt.
 */
export function replayPnl(
  path: readonly number[],
  params: PnlReplayParams,
  decision: PnlDecision,
): PnlReplayResult {
  const lastIndex = path.length - 1;
  if (params.buyIndex > lastIndex || params.promptIndex > lastIndex) {
    throw new Error('pnl replay indices are outside the price path');
  }

  const buyPriceCents = path[params.buyIndex];
  const promptPriceCents = path[params.promptIndex];
  const finalPriceCents = path[lastIndex];
  const { shares } = params;

  const unrealized = computePnl(shares, buyPriceCents, promptPriceCents);

  // Sell locks in the prompt price; hold rides to the final price.
  const sellPnl = computePnl(shares, buyPriceCents, promptPriceCents);
  const holdPnl = computePnl(shares, buyPriceCents, finalPriceCents);

  const realized = decision === 'sell' ? sellPnl : holdPnl;
  const alternative = decision === 'sell' ? holdPnl : sellPnl;

  const score = realized.pnlCents >= alternative.pnlCents ? 100 : 60;
  const summary = buildSummary(decision, realized, alternative);

  return {
    buyPriceCents,
    promptPriceCents,
    finalPriceCents,
    decision,
    unrealized,
    realized,
    alternative,
    score,
    summary,
  };
}

/** Build the learner-facing one-line summary for a graded replay. */
function buildSummary(decision: PnlDecision, realized: Pnl, alternative: Pnl): string {
  const didWell = realized.pnlCents >= alternative.pnlCents;
  const outcome = realized.pnlCents >= 0 ? 'a profit' : 'a loss';
  const realizedStr = formatSignedDollars(realized.pnlCents);
  const altStr = formatSignedDollars(alternative.pnlCents);
  const otherLabel = decision === 'sell' ? 'holding' : 'selling';

  if (didWell) {
    return `You ${decision === 'sell' ? 'sold' : 'held'} and locked in ${realizedStr} (${outcome}). ${
      otherLabel.charAt(0).toUpperCase() + otherLabel.slice(1)
    } would have been ${altStr}.`;
  }
  return `You ${decision === 'sell' ? 'sold' : 'held'} for ${realizedStr}; ${otherLabel} would have been ${altStr}. Both are fair calls — the point is seeing the difference.`;
}

/* ------------------------------------------------------------------ *
 * Formatting helpers (pure, locale-free so tests are stable)
 * ------------------------------------------------------------------ */

/** Format a cent amount as a plain dollar string, e.g. 40000 -> "$400". */
export function formatDollars(cents: number): string {
  const dollars = cents / 100;
  const body = Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
  return `$${body}`;
}

/** Format a signed cent amount, e.g. 2500 -> "+$25", -2500 -> "-$25". */
export function formatSignedDollars(cents: number): string {
  const sign = cents < 0 ? '-' : '+';
  return `${sign}${formatDollars(Math.abs(cents))}`;
}

/** Format a percentage with a sign and one decimal, e.g. 12.5 -> "+12.5%". */
export function formatSignedPct(pct: number): string {
  const sign = pct < 0 ? '-' : '+';
  const abs = Math.abs(pct);
  const body = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return `${sign}${body}%`;
}
