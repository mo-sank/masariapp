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

import { z, type ZodError } from 'zod';

import type { Rng } from '../rng';

/* ------------------------------------------------------------------ *
 * Bounds (shared by the schema and documented in the design)
 * ------------------------------------------------------------------ */

/** Upper bound for a baseline crowd total (demand or supply). */
const MAX_CROWD = 1_000_000;
/** Bound (magnitude) for a headline's additive demand/supply delta. */
const MAX_DELTA = 1_000_000;
/** Maximum authored headline cards offered per round. */
const MAX_HEADLINES = 4;
/** Largest valid seed: an unsigned 32-bit integer. */
const MAX_SEED = 4_294_967_295;

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
  /** How much this card adds to bot demand (integer, may be negative). */
  demandDelta: z
    .number()
    .int({ error: 'demandDelta must be an integer' })
    .min(-MAX_DELTA, { error: 'demandDelta must be at least -1,000,000' })
    .max(MAX_DELTA, { error: 'demandDelta must be at most 1,000,000' }),
  /** How much this card adds to bot supply (integer, may be negative). */
  supplyDelta: z
    .number()
    .int({ error: 'supplyDelta must be an integer' })
    .min(-MAX_DELTA, { error: 'supplyDelta must be at least -1,000,000' })
    .max(MAX_DELTA, { error: 'supplyDelta must be at most 1,000,000' }),
});

export type AuctionHeadline = z.infer<typeof auctionHeadlineSchema>;

/**
 * The authored params for an auction step. Validated here (the lab's own
 * contract) because the content schema only guarantees `params` is an object.
 */
export const auctionParamsSchema = z.object({
  /** Starting price in cents: a positive safe integer. */
  startPriceCents: z
    .number()
    .int({ error: 'startPriceCents must be an integer' })
    .min(1, { error: 'startPriceCents must be at least 1' }),
  /** Baseline bot demand before any headline is applied (integer 0..1,000,000). */
  baseDemand: z
    .number()
    .int({ error: 'baseDemand must be an integer' })
    .min(0, { error: 'baseDemand must be non-negative' })
    .max(MAX_CROWD, { error: 'baseDemand must be at most 1,000,000' }),
  /** Baseline bot supply before any headline is applied (integer 0..1,000,000). */
  baseSupply: z
    .number()
    .int({ error: 'baseSupply must be an integer' })
    .min(0, { error: 'baseSupply must be non-negative' })
    .max(MAX_CROWD, { error: 'baseSupply must be at most 1,000,000' }),
  /** Sensitivity `k`: how strongly the demand/supply imbalance moves the price. */
  sensitivity: z
    .number()
    .finite({ error: 'sensitivity must be a finite number' })
    .min(0, { error: 'sensitivity must be non-negative' })
    .max(1, { error: 'sensitivity must be at most 1' }),
  /**
   * Maximum size of the seeded price noise, as a fraction of the price
   * (e.g. 0.01 = up to +/-1%). Kept small so the headline, not luck, decides the
   * direction; defaults to a gentle 1%.
   */
  noise: z
    .number()
    .finite({ error: 'noise must be a finite number' })
    .min(0, { error: 'noise must be non-negative' })
    .max(0.1, { error: 'noise must be at most 0.1' })
    .default(0.01),
  /**
   * The headline cards available each round. Between two and four cards, each
   * with a non-empty, unique id and non-empty text (ids are what choices and
   * replay resolve by, so duplicates are rejected).
   */
  headlines: z
    .array(auctionHeadlineSchema)
    .min(2, { error: 'auction must offer at least two headlines' })
    .max(MAX_HEADLINES, { error: 'auction must offer at most four headlines' })
    .refine((headlines) => new Set(headlines.map((h) => h.id)).size === headlines.length, {
      error: 'auction headline ids must be unique',
    }),
  /** How many rounds the lab runs (positive integer). */
  rounds: z
    .number()
    .int({ error: 'rounds must be an integer' })
    .min(1, { error: 'rounds must be at least 1' }),
  /**
   * Whether to show the expanded three-level order-book depth. Optional; when
   * omitted (as in existing L1.2 content) it defaults to `true`, so the full
   * market experience is enabled. Bid/ask and the proportional buy/sell strip
   * are always shown regardless of this flag.
   */
  showMarketDepth: z.boolean().default(true),
});

export type AuctionParams = z.infer<typeof auctionParamsSchema>;

/**
 * The result of a non-throwing params parse: either the typed, defaulted params
 * or the validation error describing why the shape was rejected.
 */
export type SafeAuctionParamsResult =
  | { success: true; data: AuctionParams }
  | { success: false; error: ZodError };

/**
 * Parse unknown authored params into typed {@link AuctionParams}, throwing a Zod
 * error if the shape is wrong. The strict API retained for pure callers and
 * tests.
 */
export function parseAuctionParams(params: unknown): AuctionParams {
  return auctionParamsSchema.parse(params);
}

/**
 * Non-throwing variant of {@link parseAuctionParams} used at the React boundary,
 * so the component can render a non-blocking error state instead of crashing the
 * lesson player when authored params are invalid (requirement 1.6). Returns a
 * discriminated result with the fully-defaulted params on success or the Zod
 * validation error on failure.
 */
export function safeParseAuctionParams(params: unknown): SafeAuctionParamsResult {
  return auctionParamsSchema.safeParse(params);
}

/**
 * Validate a runtime seed for the component boundary without any coercion.
 *
 * The engine statically types `seed` as a `number`, but at runtime the lab must
 * reject anything that is not a finite unsigned 32-bit integer — strings,
 * fractions, negatives, overflow, `NaN`, and infinities all fail — so an invalid
 * seed renders the error state rather than silently seeding the PRNG with a
 * folded value (requirement 1.6). Unlike {@link mulberry32}, this performs no
 * `>>> 0` folding; the value must already be in `0..4,294,967,295`.
 */
export function isValidAuctionSeed(seed: unknown): seed is number {
  return (
    typeof seed === 'number' &&
    Number.isInteger(seed) &&
    seed >= 0 &&
    seed <= MAX_SEED
  );
}

/* ------------------------------------------------------------------ *
 * Round simulation
 * ------------------------------------------------------------------ */

/**
 * The bots' total demand and supply for a round, after a headline is applied.
 *
 * Each side is the authored baseline plus the chosen headline's additive delta,
 * clamped to an integer in `0..1,000,000` (requirements 2.1, 2.2). Clamping on
 * both ends keeps the crowd a sane whole number even when a card's delta would
 * push a side negative or past the authored ceiling, so the price update and
 * the market snapshot always see bounded inputs.
 */
export interface AuctionTotals {
  /** Total demand this round: `clamp(baseDemand + demandDelta, 0, 1,000,000)`. */
  demand: number;
  /** Total supply this round: `clamp(baseSupply + supplyDelta, 0, 1,000,000)`. */
  supply: number;
}

/**
 * Derive the bots' demand and supply for a round from the baselines and the
 * chosen headline's deltas (requirements 2.1, 2.2).
 *
 * Returns integer totals, each equal to `clamp(base + delta, 0, 1,000,000)` for
 * its side. The baselines and deltas are already validated as integers by the
 * params/headline schemas, so the sum is an integer; the clamp only bounds the
 * magnitude. This is a pure, draw-free helper — it never touches the `rng`, a
 * clock, or any other entropy — so the preview totals the component shows before
 * committing a prediction cost zero randomness.
 */
export function deriveCrowdTotals(
  params: AuctionParams,
  headline: AuctionHeadline,
): AuctionTotals {
  return {
    demand: clampCrowd(params.baseDemand + headline.demandDelta),
    supply: clampCrowd(params.baseSupply + headline.supplyDelta),
  };
}

/** Clamp a baseline-plus-delta crowd total to an integer in `0..1,000,000`. */
function clampCrowd(value: number): number {
  return Math.min(MAX_CROWD, Math.max(0, value));
}

/** The outcome of applying one headline to the market. */
export interface AuctionRoundResult {
  /** Price before this round, in cents. */
  priceBeforeCents: number;
  /** Price after this round, in cents (integer, >= 1). */
  priceAfterCents: number;
  /** The direction the price actually moved. Ties (no change) count as `up`. */
  direction: AuctionDirection;
  /** Total demand this round: `clamp(base + the card's demand delta, 0, 1,000,000)`. */
  demand: number;
  /** Total supply this round: `clamp(base + the card's supply delta, 0, 1,000,000)`. */
  supply: number;
}

/**
 * Apply one headline to the market and return the new price (requirement 8.2).
 *
 * Implements the design's update exactly:
 *   price' = price * (1 + k * (demand - supply) / (demand + supply)) + noise
 * where `demand`/`supply` are the baselines plus the chosen headline's deltas
 * ({@link deriveCrowdTotals}, each clamped to `0..1,000,000`), `k` is
 * `sensitivity`, and the noise is a small symmetric
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
  const { demand, supply } = deriveCrowdTotals(params, headline);

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
 * Indicative bid, ask, and order-book depth
 * ------------------------------------------------------------------ */

/**
 * One illustrative level in the order book, on either the buy or sell side.
 *
 * The three levels per side are a teaching visualization, not a real matching
 * engine (requirement 3.4): they split a side's total into near/middle/far
 * buckets whose quantities sum exactly to that side total, each anchored at a
 * price stepped away from the bid/ask by whole-cent ticks.
 */
export interface MarketDepthLevel {
  /** The price for this level, in cents (a positive integer). */
  priceCents: number;
  /** Resting quantity at this level. The three levels sum to the side total. */
  quantity: number;
  /**
   * This level's size relative to a common scale shared across both sides
   * (`max(demand, supply, 1)`), in `0..1`, so buy and sell bars stay visually
   * proportional to each other.
   */
  relativeSize: number;
}

/**
 * A deterministic snapshot of the round's indicative market: the bid, the ask,
 * the spread, the demand/supply imbalance and side fractions, and three
 * illustrative depth levels per side (requirements 3.2, 3.3, 3.4).
 *
 * This is an educational projection derived purely from the current price and
 * the crowd totals — not an exchange-grade order book. The ask is always at
 * least the bid, so the spread is never negative, and both are at least one
 * cent.
 */
export interface AuctionMarketSnapshot {
  /** Highest price buyers are willing to pay, in cents (>= 1). */
  bidCents: number;
  /** Lowest price sellers will accept, in cents (>= bidCents). */
  askCents: number;
  /** `askCents - bidCents`; always >= 0. */
  spreadCents: number;
  /** Demand/supply imbalance in `-1..1`; zero when the market is empty. */
  imbalance: number;
  /** Share of the crowd on the buy side, in `0..1`; zero at zero total. */
  buyFraction: number;
  /** Share of the crowd on the sell side, in `0..1`; zero at zero total. */
  sellFraction: number;
  /** The three buy-side depth levels, nearest (best bid) first. */
  buyLevels: readonly MarketDepthLevel[];
  /** The three sell-side depth levels, nearest (best ask) first. */
  sellLevels: readonly MarketDepthLevel[];
}

/**
 * Derive the round's indicative bid, ask, spread, side fractions, and three-level
 * depth from the current price and crowd totals (requirements 3.2, 3.3, 3.4).
 *
 * Pure and RNG-free (requirement 6.1): it takes no `rng` and reads no clock or
 * ambient entropy, so the component can recompute the market on every render and
 * any number of snapshots cost zero seeded draws, leaving the price path
 * untouched. Given the same inputs it always returns an identical snapshot
 * (requirement 3.2).
 *
 * Returns `null` for unavailable or invalid input — a non-positive-integer price
 * or non-integer / out-of-bounds demand or supply — so the UI can show
 * placeholders without mutating the round (requirement 3.5). It never touches
 * session data.
 *
 * The half-spread widens modestly with disagreement, the integer rounding plus a
 * final `max` guarantee `askCents >= bidCents >= 1` and a non-negative spread
 * (requirement 3.3), and each side's three levels sum exactly to that side's
 * total. At zero total both fractions and all level quantities are zero.
 */
export function deriveMarketSnapshot(
  priceCents: number,
  demand: number,
  supply: number,
): AuctionMarketSnapshot | null {
  if (!isPositiveInteger(priceCents)) return null;
  if (!isCrowdTotal(demand) || !isCrowdTotal(supply)) return null;

  const total = demand + supply;
  const imbalance = total === 0 ? 0 : (demand - supply) / total;

  const halfSpreadCents = Math.max(
    1,
    Math.round(priceCents * (0.0025 + 0.0025 * Math.abs(imbalance))),
  );
  const bidCents = Math.max(1, priceCents - halfSpreadCents);
  const askCents = Math.max(bidCents, priceCents + halfSpreadCents);
  const spreadCents = askCents - bidCents;

  const buyFraction = total === 0 ? 0 : demand / total;
  const sellFraction = total === 0 ? 0 : supply / total;

  const tickCents = Math.max(1, Math.round(priceCents * 0.001));
  // Common scale so buy and sell bars stay proportional to each other.
  const scale = Math.max(demand, supply, 1);

  const buyLevels = buildDepthLevels(
    demand,
    [bidCents, Math.max(1, bidCents - tickCents), Math.max(1, bidCents - 2 * tickCents)],
    scale,
  );
  const sellLevels = buildDepthLevels(
    supply,
    [askCents, askCents + tickCents, askCents + 2 * tickCents],
    scale,
  );

  return {
    bidCents,
    askCents,
    spreadCents,
    imbalance,
    buyFraction,
    sellFraction,
    buyLevels,
    sellLevels,
  };
}

/** True when `value` is a safe integer >= 1 (a usable whole-cent price). */
function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}

/** True when `value` is an integer crowd total in `0..1,000,000`. */
function isCrowdTotal(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_CROWD;
}

/**
 * Split a side total into three near/middle/far levels that sum exactly to the
 * total, pairing each with its price (nearest first) and a `relativeSize` scaled
 * against the shared common scale.
 */
function buildDepthLevels(
  sideTotal: number,
  prices: readonly [number, number, number],
  scale: number,
): MarketDepthLevel[] {
  const near = Math.ceil(sideTotal * 0.5);
  const middle = Math.min(sideTotal - near, Math.ceil(sideTotal * 0.3));
  const far = sideTotal - near - middle;
  const quantities = [near, middle, far] as const;

  return prices.map((priceCents, i) => ({
    priceCents,
    quantity: quantities[i],
    relativeSize: quantities[i] / scale,
  }));
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

/** The learner's choice and prediction for one round. */
export interface AuctionChoice {
  /** The id of the headline card the learner played. */
  headlineId: string;
  /**
   * The direction the learner predicted before seeing the result.
   *
   * Optional and supported only by pure replay/grading: {@link scoreAuction}
   * still applies the chosen headline and consumes one round draw when this is
   * absent, but an absent prediction can never match the computed direction, so
   * the round is always counted incorrect. The live component never produces a
   * missing prediction — its state machine has no transition into the reveal
   * without a committed `up`/`down`.
   */
  prediction?: AuctionDirection;
}

/** The graded result of a full auction run. */
export interface AuctionResult {
  /** The per-round outcomes, in play order. */
  rounds: AuctionRoundResult[];
  /** How many rounds the learner predicted correctly. */
  correct: number;
  /** Total rounds played. */
  total: number;
  /** Score to report to the player: `clamp(round(correct / total * 100), 0, 100)`, or `0` with no rounds. */
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
 * Each choice's `prediction` is optional (supported only here, for pure replay):
 * a choice with an absent prediction still resolves and applies its headline and
 * consumes one `rng` draw, keeping the price path and replay order intact, but
 * can never be counted correct. An empty choice list plays no rounds, so `total`
 * and `score` are `0` and the final price is the starting price. The score is
 * centralized in {@link scoreFromCounts} as `clamp(round(correct / total * 100),
 * 0, 100)`.
 *
 * @param choices - One per round, in order. Must reference a headline that
 *   exists in `params.headlines`; an unknown id throws (with that id in the
 *   message) before the round is applied, since the component only ever reports
 *   cards it rendered.
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
    // Apply every provided headline and consume exactly one draw per played
    // round, even when the prediction is absent — a missing prediction is
    // `undefined`, which can never equal the computed `up`/`down` direction, so
    // the round is counted incorrect rather than skipped (requirement 5.5).
    const round = applyHeadline(price, headline, params, rng);
    rounds.push(round);
    if (round.direction === choice.prediction) correct += 1;
    price = round.priceAfterCents;
  }

  const total = choices.length;
  const score = scoreFromCounts(correct, total);
  const summary = `You read the market right ${correct} of ${total} ${
    total === 1 ? 'time' : 'times'
  }.`;

  return { rounds, correct, total, score, finalPriceCents: price, summary };
}

/**
 * Centralized final score: `0` when no rounds were played, otherwise
 * `clamp(round(correct / total * 100), 0, 100)` (requirement 5.3).
 *
 * `correct` is already bounded by `total`, so the clamp is defensive — it can
 * never actually trim a value in practice — but the design pins the clamp as the
 * single source of the score formula, so it stays here to keep the 0..100
 * guarantee explicit and in one place.
 */
function scoreFromCounts(correct: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(100, Math.max(0, Math.round((correct / total) * 100)));
}
