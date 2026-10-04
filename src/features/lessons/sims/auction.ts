/**
 * Auction lab — pure logic (requirements 8.2, 8.5).
 *
 * This is the L1.2 lab: a toy market of bot buyers and sellers whose price moves
 * with the balance of demand and supply (requirement 8.2). Each round the
 * learner picks a headline card that nudges demand or supply, predicts which way
 * the price will move, and then sees the result. The React component
 * (`components/sims/Auction.tsx`) owns the UI and the predict-then-reveal loop;
 * this module owns everything that must be deterministic and testable: the
 * authored params, the per-round price update, and the final score.
 *
 * Design reference: `.kiro/specs/lesson-engine/design.md` ("Sim designs"):
 *   N bot buyers/sellers; each round
 *     price' = price * (1 + k * (demand - supply) / (demand + supply)) + noise
 *   with small *seeded* noise. Learner picks a headline card that shifts bot
 *   demand or supply, predicts direction first, then sees the result.
 *   Score = correct predictions / rounds.
 *
 * Determinism (requirement 8.5): the only randomness is the small price noise,
 * drawn from the seeded {@link Rng} the player passes in. Given the same seed,
 * the same starting price, and the same sequence of headline choices, the price
 * path is identical on every run and in every test. Nothing here reads a clock
 * or `Math.random`. Pure module: no React, Expo, or network imports.
 */

import { z } from 'zod';

import type { Rng } from '../rng';

/* ------------------------------------------------------------------ *
 * Params
 * ------------------------------------------------------------------ */

/** The price direction the learner can predict for a round. */
export const AUCTION_DIRECTIONS = ['up', 'down'] as const;
export type AuctionDirection = (typeof AUCTION_DIRECTIONS)[number];

/**
 * A headline card the learner can play in a round. Each card shifts the bots'
 * demand and/or supply by an additive delta; the sign of the net shift is what
 * ultimately pushes the price. `expected` is the direction the card is designed
 * to produce, used only to author sensible content — the actual outcome is
 * always computed from the price update, never asserted from this field.
 */
export const auctionHeadlineSchema = z.object({
  /** Stable id so the component can key and report the chosen card. */
  id: z.string().trim().min(1, { error: 'headline id must not be empty' }),
  /** The headline text shown on the card. */
  text: z.string().trim().min(1, { error: 'headline text must not be empty' }),
  /** How much this card adds to bot demand (may be negative). */
  demandDelta: z.number(),
  /** How much this card adds to bot supply (may be negative). */
  supplyDelta: z.number(),
});

export type AuctionHeadline = z.infer<typeof auctionHeadlineSchema>;

/**
 * The authored params for an auction step. Validated here (the lab's own
 * contract) because the content schema only guarantees `params` is an object.
 */
export const auctionParamsSchema = z.object({
  /** Starting price in cents. */
  startPriceCents: z
    .number()
    .int()
    .min(1, { error: 'startPriceCents must be at least 1' }),
  /** Baseline bot demand before any headline is applied. */
  baseDemand: z.number().min(0, { error: 'baseDemand must be non-negative' }),
  /** Baseline bot supply before any headline is applied. */
  baseSupply: z.number().min(0, { error: 'baseSupply must be non-negative' }),
  /** Sensitivity `k`: how strongly the demand/supply imbalance moves the price. */
  sensitivity: z
    .number()
    .min(0, { error: 'sensitivity must be non-negative' })
    .max(1, { error: 'sensitivity must be at most 1' }),
  /**
   * Maximum size of the seeded price noise, as a fraction of the price
   * (e.g. 0.01 = up to +/-1%). Kept small so the headline, not luck, decides the
   * direction; defaults to a gentle 1%.
   */
  noise: z
    .number()
    .min(0, { error: 'noise must be non-negative' })
    .max(0.1, { error: 'noise must be at most 0.1' })
    .default(0.01),
  /** The headline cards available each round (at least two to choose from). */
  headlines: z
    .array(auctionHeadlineSchema)
    .min(2, { error: 'auction must offer at least two headlines' }),
  /** How many rounds the lab runs. */
  rounds: z
    .number()
    .int()
    .min(1, { error: 'rounds must be at least 1' }),
});

export type AuctionParams = z.infer<typeof auctionParamsSchema>;

/**
 * Parse unknown authored params into typed {@link AuctionParams}, throwing a Zod
 * error if the shape is wrong. The component calls this once up front.
 */
export function parseAuctionParams(params: unknown): AuctionParams {
  return auctionParamsSchema.parse(params);
}

/* ------------------------------------------------------------------ *
 * Round simulation
 * ------------------------------------------------------------------ */

/** The outcome of applying one headline to the market. */
export interface AuctionRoundResult {
  /** Price before this round, in cents. */
  priceBeforeCents: number;
  /** Price after this round, in cents (integer, >= 1). */
  priceAfterCents: number;
  /** The direction the price actually moved. Ties (no change) count as `up`. */
  direction: AuctionDirection;
  /** Total demand this round (base + the card's demand delta, floored at 0). */
  demand: number;
  /** Total supply this round (base + the card's supply delta, floored at 0). */
  supply: number;
}

/**
 * Apply one headline to the market and return the new price (requirement 8.2).
 *
 * Implements the design's update exactly:
 *   price' = price * (1 + k * (demand - supply) / (demand + supply)) + noise
 * where `demand`/`supply` are the baselines plus the chosen headline's deltas
 * (never negative), `k` is `sensitivity`, and the noise is a small symmetric
 * term drawn from the seeded `rng` (so the path is reproducible, requirement
 * 8.5). The result is rounded to a whole cent and floored at 1 so the price
 * stays a positive integer.
 *
 * The returned `direction` is derived from the actual price change, so the
 * learner's prediction is graded against what really happened — not against the
 * headline's authored intent. When demand and supply are both zero the imbalance
 * term is treated as zero (no division by zero), leaving only the noise.
 */
export function applyHeadline(
  priceCents: number,
  headline: AuctionHeadline,
  params: AuctionParams,
  rng: Rng,
): AuctionRoundResult {
  const demand = Math.max(0, params.baseDemand + headline.demandDelta);
  const supply = Math.max(0, params.baseSupply + headline.supplyDelta);

  const total = demand + supply;
  const imbalance = total === 0 ? 0 : (demand - supply) / total;

  // Symmetric noise in [-noise, +noise], as a fraction of the price. Draw it
  // from the seeded rng so the path is identical across runs with the same seed.
  const noiseFraction = (rng() * 2 - 1) * params.noise;

  const rawNext = priceCents * (1 + params.sensitivity * imbalance + noiseFraction);
  // Keep the price a positive whole cent.
  const priceAfterCents = Math.max(1, Math.round(rawNext));

  return {
    priceBeforeCents: priceCents,
    priceAfterCents,
    direction: priceAfterCents >= priceCents ? 'up' : 'down',
    demand,
    supply,
  };
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

/** The learner's choice and prediction for one round. */
export interface AuctionChoice {
  /** The id of the headline card the learner played. */
  headlineId: string;
  /** The direction the learner predicted before seeing the result. */
  prediction: AuctionDirection;
}

/** The graded result of a full auction run. */
export interface AuctionResult {
  /** The per-round outcomes, in play order. */
  rounds: AuctionRoundResult[];
  /** How many rounds the learner predicted correctly. */
  correct: number;
  /** Total rounds played. */
  total: number;
  /** Score to report to the player: correct / rounds as a 0-100 integer. */
  score: number;
  /** The final price after the last round, in cents. */
  finalPriceCents: number;
  /** A short, learner-facing summary. */
  summary: string;
}

/**
 * Replay a full auction from a sequence of learner choices and grade it
 * (requirement 8.2). Starts at `startPriceCents`, applies each chosen headline
 * in order with the shared seeded `rng`, and counts a round correct when the
 * learner's prediction matches the direction the price actually moved. The score
 * is `correct / rounds` as a 0-100 integer (design: "Score = correct
 * predictions / rounds").
 *
 * Pure and deterministic: the same params, the same seed (via `rng`), and the
 * same choices always produce the same rounds, score, and summary — which is
 * what the sim tests assert (requirement 8.5). The component drives the live
 * round-by-round loop with {@link applyHeadline}; this function is the
 * end-to-end oracle the tests use and the lab uses to compute the final score.
 *
 * @param choices - One per round, in order. Must reference a headline that
 *   exists in `params.headlines`; an unknown id throws, since the component only
 *   ever reports cards it rendered.
 */
export function scoreAuction(
  params: AuctionParams,
  choices: readonly AuctionChoice[],
  rng: Rng,
): AuctionResult {
  const byId = new Map(params.headlines.map((h) => [h.id, h] as const));
  const rounds: AuctionRoundResult[] = [];
  let price = params.startPriceCents;
  let correct = 0;

  for (const choice of choices) {
    const headline = byId.get(choice.headlineId);
    if (!headline) {
      throw new Error(`auction choice references unknown headline "${choice.headlineId}"`);
    }
    const round = applyHeadline(price, headline, params, rng);
    rounds.push(round);
    if (round.direction === choice.prediction) correct += 1;
    price = round.priceAfterCents;
  }

  const total = choices.length;
  const score = total === 0 ? 0 : Math.round((correct / total) * 100);
  const summary = `You read the market right ${correct} of ${total} ${
    total === 1 ? 'time' : 'times'
  }.`;

  return { rounds, correct, total, score, finalPriceCents: price, summary };
}
