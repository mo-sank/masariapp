/**
 * Auction lab — read the market (requirements 8.2, 4.6, 8.5).
 *
 * A toy market of bot buyers and sellers. Each round the learner picks a
 * headline card, predicts whether the price will go up or down, then reveals the
 * result; the price reacts to the balance of demand and supply the card creates
 * (requirement 8.2). After all rounds the lab reports a score equal to the share
 * of rounds the learner predicted correctly.
 *
 * The price update, grading, and params validation live in the pure
 * `sims/auction.ts` module. The only randomness is a small seeded price noise,
 * so with the same `seed` and the same choices the price path is identical on
 * every run (requirement 8.5): the game subtree builds its PRNG from the `seed`
 * prop with {@link mulberry32} and advances it exactly once per round via
 * `applyHeadline`, matching what the pure `scoreAuction` oracle produces in the
 * tests. The component is pure in the lesson sense (requirement 4.8): no network,
 * no haptics — SimStep turns the final outcome into an answer and the player
 * owns feedback.
 *
 * Input boundary: the public `Auction` component accepts only the shared
 * `SimComponentProps` ({@link SimComponentProps}) and validates them before any
 * game state exists (requirements 1.1, 1.4, 1.6, 9.1). `validateAuctionInput`
 * composes the non-throwing `safeParseAuctionParams` with the runtime
 * `isValidAuctionSeed` seed check. Invalid input renders a persistent,
 * non-crashing `AuctionErrorState` and never calls `onComplete`. Only validated
 * params and seed mount the private `AuctionGame` subtree, so the seeded RNG and
 * all round state are allocated only for inputs the game can actually run.
 *
 * The round loop is a small state machine:
 *   choose   -> learner taps a headline card
 *   predict  -> learner taps up or down (prediction locked before the reveal)
 *   reveal   -> result shown; Continue advances to the next round or finishes
 *
 * Accessibility: each phase has a header; headline cards and the up/down choices
 * are labelled buttons (tap-only, no gestures); the revealed result is announced
 * politely and the running round counter is spoken.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';

import type { SimComponentProps } from './types';
import { Button, Card, Text } from '../../../../components/ui';
import { useReduceMotion } from '../../../../theme/use-reduce-motion';
import { useTheme } from '../../../../theme/theme-provider';
import type { Theme } from '../../../../theme/tokens';
import { mulberry32 } from '../../rng';
import {
  applyHeadline,
  deriveCrowdTotals,
  deriveMarketSnapshot,
  isValidAuctionSeed,
  safeParseAuctionParams,
  type AuctionDirection,
  type AuctionHeadline,
  type AuctionMarketSnapshot,
  type AuctionParams,
  type AuctionRoundResult,
  type AuctionTotals,
  type MarketDepthLevel,
} from '../../sims/auction';
import { formatDollars } from '../../sims/ownership-split';

/**
 * The deterministic reveal copy for one committed round (design: "Reveal copy").
 * Everything is derived from the round result's computed movement and
 * demand/supply balance — never the headline's authored intent (requirement
 * 4.8). The pieces are built once and rendered as persistent accessible text.
 *
 *  - `movement`: increase/decrease/no-change wording from the signed cent change.
 *  - `signedCents`: the signed whole-cent difference formatted as `+71¢` /
 *    `-571¢` / `0¢`.
 *  - `resultLine`: the stable "Price rose from X to Y (±N¢)." shape.
 *  - `explanation`: the balance-driven reason the price moved as it did.
 */
interface AuctionRevealCopy {
  movement: 'increase' | 'decrease' | 'no change';
  signedCents: string;
  resultLine: string;
  explanation: string;
}

/**
 * Build the full reveal copy from a committed round result. The cent change is
 * `priceAfterCents - priceBeforeCents`; its sign alone decides the increase /
 * decrease / no-change wording (requirements 4.5, 4.6, 4.7). The explanation is
 * chosen from the round's demand/supply totals and the computed movement, not
 * the headline (requirement 4.8):
 *
 *  - demand > supply:            buyers outnumbered sellers, bids rose.
 *  - supply > demand:            sellers outnumbered buyers, price fell.
 *  - equal totals, price moved:  balanced crowd; the simulated noise nudged it.
 *  - no cent change:             balanced out, the rounded price held.
 */
function buildRevealCopy(result: AuctionRoundResult): AuctionRevealCopy {
  const deltaCents = result.priceAfterCents - result.priceBeforeCents;
  const movement: AuctionRevealCopy['movement'] =
    deltaCents > 0 ? 'increase' : deltaCents < 0 ? 'decrease' : 'no change';

  const sign = deltaCents > 0 ? '+' : deltaCents < 0 ? '-' : '';
  const signedCents = `${sign}${Math.abs(deltaCents)}¢`;

  const verb = deltaCents > 0 ? 'rose' : deltaCents < 0 ? 'fell' : 'held';
  const before = formatDollars(result.priceBeforeCents);
  const after = formatDollars(result.priceAfterCents);
  const resultLine = `Price ${verb} from ${before} to ${after} (${signedCents}).`;

  let explanation: string;
  if (deltaCents === 0) {
    explanation = 'Buyers and sellers balanced out, so the rounded price did not change.';
  } else if (result.demand > result.supply) {
    explanation = 'More buyers than sellers pushed bids higher.';
  } else if (result.supply > result.demand) {
    explanation = 'More sellers than buyers pulled the price lower.';
  } else {
    explanation =
      'Buyers and sellers were balanced; the small simulated market wobble moved the price.';
  }

  return { movement, signedCents, resultLine, explanation };
}

/**
 * Post one best-effort screen-reader announcement for a revealed round (design:
 * "Accessibility architecture"). The reveal text is already persistent in the
 * tree inside a polite live region; this imperative announcement is a pure
 * nicety for platforms that need it. It is guarded by BOTH feature detection and
 * a `try/catch`, and is strictly fire-and-forget: a missing API or a thrown
 * error must never remove the persistent text, change game state, or affect
 * completion. The queued variant is preferred so a reveal does not clobber a
 * prior announcement; it falls back to the plain announcement when unavailable.
 */
function announceReveal(message: string): void {
  try {
    const info = AccessibilityInfo as unknown as {
      announceForAccessibilityWithOptions?: (
        announcement: string,
        options: { queue?: boolean },
      ) => void;
      announceForAccessibility?: (announcement: string) => void;
    };
    if (typeof info.announceForAccessibilityWithOptions === 'function') {
      info.announceForAccessibilityWithOptions(message, { queue: true });
    } else if (typeof info.announceForAccessibility === 'function') {
      info.announceForAccessibility(message);
    }
  } catch {
    // Best-effort only. The persistent live-region text remains the source of
    // truth; a failed announcement is silently ignored.
  }
}

/**
 * The persistent educational framing shown in every phase (requirements 8.1,
 * 8.2, 8.3). The subject is a fictional rare collectible — never a real ticker
 * or security — and the two labels make clear this is a simulation with no real
 * money and that the quotes are simulated, not live market data.
 */
const SIMULATION_LABEL = 'Simulation · No real money';
const SIMULATED_QUOTE_LABEL = 'Simulated prices — not live market quotes';
const COLLECTIBLE_SUBJECT = 'Rare collectible auction';

/** How many fixed buyer/seller avatars the crowd shows per side (design: fixed small set). */
const CROWD_AVATAR_COUNT = 5;

/**
 * The phases of the guarded round machine (design: "State machine").
 *
 *   choose    -> learner taps a headline card
 *   predict   -> learner taps up or down (prediction locked before the reveal)
 *   reveal    -> result shown; next advances or finish completes the lab
 *   completed -> terminal; every further event is a no-op
 */
type AuctionPhase = 'choose' | 'predict' | 'reveal' | 'completed';

/**
 * One committed round in the immutable session history (design: "Session
 * state"). Live UI records always carry a present `up`/`down` prediction — the
 * machine has no transition into the reveal without one.
 */
interface AuctionRoundRecord {
  /** Zero-based index of the round this record completed. */
  roundIndex: number;
  /** The id of the headline that was played this round. */
  headlineId: string;
  /** The direction the learner locked in before the reveal. */
  prediction: AuctionDirection;
  /** The deterministic outcome `applyHeadline` produced for the round. */
  result: AuctionRoundResult;
}

/**
 * The whole discriminated session state (design: "Session state"). Replaces the
 * independently mutable round fields with one object whose invariants the phase
 * guards preserve:
 *
 *  - `choose`: no selected headline, prediction, or current result; `history`
 *    length equals `roundIndex`.
 *  - `predict`: exactly one valid selected headline, no prediction/result;
 *    `previewTotals`/`market` reflect that headline.
 *  - `reveal`: selected headline, locked prediction, and `currentResult` all
 *    present; `history` length is `roundIndex + 1`.
 *  - `completed`: `history` length equals `params.rounds`; no further mutation.
 *
 * `currentPriceCents` is the starting price before any commit and the latest
 * `priceAfterCents` afterward. `market` is derived purely from the current price
 * and displayed totals; it is never independently editable.
 */
interface AuctionSessionState {
  phase: AuctionPhase;
  /** Zero-based; always `0..params.rounds - 1` before `completed`. */
  roundIndex: number;
  /** The live price carried from round to round, in cents. */
  currentPriceCents: number;
  /** The headline chosen this round, or `null` in `choose`/`completed`. */
  selectedHeadlineId: string | null;
  /** The committed prediction, or `null` before a commit. */
  lockedPrediction: AuctionDirection | null;
  /** Clamped demand/supply for the selected headline (baselines in `choose`). */
  previewTotals: AuctionTotals;
  /** The indicative market snapshot for the displayed price/totals, or `null`. */
  market: AuctionMarketSnapshot | null;
  /** The revealed round outcome, or `null` outside `reveal`. */
  currentResult: AuctionRoundResult | null;
  /** Immutable, append-only committed rounds in play order. */
  history: readonly AuctionRoundRecord[];
}

/**
 * The result of validating the public component input. On success it carries the
 * fully-parsed {@link AuctionParams} (defaults applied) and the validated uint32
 * seed; on failure it carries a friendly, stable message for the error state. No
 * raw param content is ever surfaced to the learner.
 */
type AuctionInputValidation =
  | { success: true; params: AuctionParams; seed: number }
  | { success: false; message: string };

/**
 * Validate the authored params and the derived seed before any game state is
 * created (requirements 1.6, 9.1). Composed from the non-throwing
 * `safeParseAuctionParams` and the runtime `isValidAuctionSeed` guard so a
 * malformed sim step never throws out of render and never mounts the RNG or
 * round state. The returned message is intentionally generic and stable: it does
 * not echo the invalid params or the Zod error detail.
 */
function validateAuctionInput(params: unknown, seed: unknown): AuctionInputValidation {
  const parsed = safeParseAuctionParams(params);
  if (!parsed.success) {
    return { success: false, message: 'This market lab could not load.' };
  }
  if (!isValidAuctionSeed(seed)) {
    return { success: false, message: 'This market lab could not load.' };
  }
  return { success: true, params: parsed.data, seed };
}

/**
 * The public lab component. Owns only the input boundary: it validates params
 * and seed, then either shows a non-crashing error card or mounts the private
 * game subtree. It allocates no RNG or round state itself, so invalid input
 * mounts nothing that could draw from the seed or call `onComplete`.
 */
export function Auction({ params, seed, onComplete }: SimComponentProps) {
  const validation = useMemo(() => validateAuctionInput(params, seed), [params, seed]);

  if (!validation.success) {
    return <AuctionErrorState message={validation.message} />;
  }

  return (
    <AuctionGame params={validation.params} seed={validation.seed} onComplete={onComplete} />
  );
}

/**
 * Persistent, non-crashing error card shown for invalid params or seed
 * (requirements 1.6, 9.1). It renders friendly, stable copy using the shared UI
 * components, never dumps raw params, exposes no game controls, and never calls
 * `onComplete` — an invalid sim step neither completes nor crashes the player.
 */
interface AuctionErrorStateProps {
  /** Friendly, stable copy. Never contains raw param content. */
  message: string;
}

function AuctionErrorState({ message }: AuctionErrorStateProps) {
  const theme = useTheme();
  return (
    <Card style={[styles.card, { gap: theme.spacing.sm }]}>
      <Text variant="body" color="textMuted" accessibilityRole="header">
        {message}
      </Text>
    </Card>
  );
}

/** Validated input for the private game subtree. */
interface AuctionGameProps {
  /** Fully parsed params with defaults applied. */
  params: AuctionParams;
  /** Already-validated uint32 seed. */
  seed: number;
  onComplete: SimComponentProps['onComplete'];
}

/**
 * The learner-facing completion outcome derived purely from committed history
 * (design: scoring). The score is `clamp(round(correct / total * 100), 0, 100)`
 * and the summary counts match.
 */
interface AuctionOutcome {
  score: number;
  summary: string;
}

/**
 * Derive the final outcome from the committed history alone — no live RNG draw
 * (design: FINISH "do NOT draw more RNG"). `correct` counts records whose locked
 * prediction equals the computed round direction; the score mirrors the pure
 * `scoreAuction` formula so live play and the oracle agree.
 */
function outcomeFromHistory(history: readonly AuctionRoundRecord[]): AuctionOutcome {
  const total = history.length;
  const correct = history.reduce(
    (count, record) => (record.result.direction === record.prediction ? count + 1 : count),
    0,
  );
  const score = total === 0 ? 0 : Math.min(100, Math.max(0, Math.round((correct / total) * 100)));
  const summary = `You read the market right ${correct} of ${total} ${
    total === 1 ? 'time' : 'times'
  }.`;
  return { score, summary };
}

/**
 * The private game subtree. Mounted only for validated input, so the seeded PRNG
 * and all session state are allocated here and never for invalid params/seed.
 * Uses the validated {@link AuctionParams} directly (no re-parse).
 *
 * The round loop is the guarded `choose -> predict -> reveal -> completed`
 * machine from the design. A single discriminated {@link AuctionSessionState}
 * holds every round-crossing value, and a synchronously updated `stateRef`
 * mirrors it so an event handler reads and advances the live state from its own
 * invocation rather than a value captured by a stale render. The up-to-three
 * taps of a round (choose -> predict -> next/finish) — and any rapid duplicate
 * taps — may be processed before React re-renders between them; guarding on the
 * ref makes a duplicate or stale headline/prediction/next/finish tap a no-op
 * before React batching can admit it.
 */
function AuctionGame({ params, seed, onComplete }: AuctionGameProps) {
  const theme = useTheme();

  // The seeded PRNG for the whole run. Built once from the validated seed and
  // advanced exactly once per applied round (inside applyHeadline on commit), so
  // the price path is deterministic and matches the pure scoreAuction oracle
  // used in tests. A ref, not state, because advancing it must not re-render.
  const rngRef = useRef(mulberry32(seed));

  // Fast headline lookup by id for SELECT_HEADLINE resolution.
  const headlinesById = useMemo(
    () => new Map(params.headlines.map((h) => [h.id, h] as const)),
    [params.headlines],
  );

  // The initial session: round 0, starting price, baseline crowd, no selection.
  const initialState = useMemo<AuctionSessionState>(() => {
    const baseline: AuctionTotals = { demand: params.baseDemand, supply: params.baseSupply };
    return {
      phase: 'choose',
      roundIndex: 0,
      currentPriceCents: params.startPriceCents,
      selectedHeadlineId: null,
      lockedPrediction: null,
      previewTotals: baseline,
      market: deriveMarketSnapshot(params.startPriceCents, baseline.demand, baseline.supply),
      currentResult: null,
      history: [],
    };
    // Baselines and start price are stable for the life of a valid game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [state, setState] = useState<AuctionSessionState>(initialState);

  // Synchronous mirror of `state`. Every handler reads/updates this ref BEFORE
  // scheduling React state, so two taps in the same render batch both see the
  // already-advanced phase and the second is rejected by the guard.
  const stateRef = useRef<AuctionSessionState>(initialState);

  // At-most-once completion guard. Set synchronously before `onComplete` so a
  // duplicate or late finish tap can never emit a second completion.
  const completionSentRef = useRef(false);

  // Commit a new session state to both the synchronous ref and React.
  const commit = (next: AuctionSessionState) => {
    stateRef.current = next;
    setState(next);
  };

  const totalRounds = params.rounds;

  // SELECT_HEADLINE(id): only in `choose`, only for a known id. Compute preview
  // crowd totals and the market snapshot (0 RNG draws), lock the selection, and
  // enter `predict`. Any other phase or an unknown id is a no-op.
  const handleSelectHeadline = (headlineId: string) => {
    const current = stateRef.current;
    if (current.phase !== 'choose') return;
    const headline = headlinesById.get(headlineId);
    if (!headline) return;

    const previewTotals = deriveCrowdTotals(params, headline);
    commit({
      ...current,
      phase: 'predict',
      selectedHeadlineId: headline.id,
      previewTotals,
      market: deriveMarketSnapshot(
        current.currentPriceCents,
        previewTotals.demand,
        previewTotals.supply,
      ),
    });
  };

  // COMMIT_PREDICTION(direction): only in `predict` with a selected headline.
  // Call applyHeadline ONCE (one rng draw), append exactly one history record,
  // carry the revealed price, lock the prediction, and enter `reveal`. A
  // duplicate commit (phase already `reveal`) is a no-op, so there is exactly
  // one draw and one record per round.
  const handleCommitPrediction = (prediction: AuctionDirection) => {
    const current = stateRef.current;
    if (current.phase !== 'predict') return;
    if (current.selectedHeadlineId === null) return;
    const headline = headlinesById.get(current.selectedHeadlineId);
    if (!headline) return;

    const result = applyHeadline(current.currentPriceCents, headline, params, rngRef.current);
    const record: AuctionRoundRecord = {
      roundIndex: current.roundIndex,
      headlineId: headline.id,
      prediction,
      result,
    };
    commit({
      ...current,
      phase: 'reveal',
      lockedPrediction: prediction,
      currentResult: result,
      currentPriceCents: result.priceAfterCents,
      previewTotals: { demand: result.demand, supply: result.supply },
      market: deriveMarketSnapshot(result.priceAfterCents, result.demand, result.supply),
      history: [...current.history, record],
    });
  };

  // NEXT: only in `reveal` and not on the last round. Increment the round, clear
  // the round-only fields, and reset crowd totals to the authored baselines
  // (snapshot derived from the carried price + baselines). Enter `choose`.
  const handleNext = () => {
    const current = stateRef.current;
    if (current.phase !== 'reveal') return;
    if (current.roundIndex >= totalRounds - 1) return;

    const baseline: AuctionTotals = { demand: params.baseDemand, supply: params.baseSupply };
    commit({
      ...current,
      phase: 'choose',
      roundIndex: current.roundIndex + 1,
      selectedHeadlineId: null,
      lockedPrediction: null,
      previewTotals: baseline,
      market: deriveMarketSnapshot(current.currentPriceCents, baseline.demand, baseline.supply),
      currentResult: null,
    });
  };

  // FINISH: only in `reveal` on the last round. Set the at-most-once completion
  // ref BEFORE calling onComplete, derive the outcome from committed history
  // (no extra RNG), enter `completed`, and call onComplete exactly once. A
  // duplicate/late finish is rejected by the phase guard and the ref.
  const handleFinish = () => {
    const current = stateRef.current;
    if (current.phase !== 'reveal') return;
    if (current.roundIndex < totalRounds - 1) return;
    if (completionSentRef.current) return;

    const outcome = outcomeFromHistory(current.history);
    completionSentRef.current = true;
    commit({
      ...current,
      phase: 'completed',
      selectedHeadlineId: null,
      lockedPrediction: null,
      currentResult: null,
    });
    onComplete({ score: outcome.score, summary: outcome.summary });
  };

  const isLastRound = state.roundIndex >= totalRounds - 1;
  const selectedHeadline =
    state.selectedHeadlineId !== null
      ? (headlinesById.get(state.selectedHeadlineId) ?? null)
      : null;
  const result = state.currentResult;

  return (
    <Card style={[styles.card, { gap: theme.spacing.md }]}>
      <AuctionHeader roundIndex={state.roundIndex} totalRounds={totalRounds} theme={theme} />

      <MarketStage
        priceCents={state.currentPriceCents}
        totals={state.previewTotals}
        theme={theme}
      />

      <BidAskPanel market={state.market} theme={theme} />

      <OrderBookDepth
        market={state.market}
        showMarketDepth={params.showMarketDepth}
        theme={theme}
      />

      <PhaseHeader phase={state.phase} />

      {state.phase === 'choose' ? (
        <HeadlineChooser
          headlines={params.headlines}
          onSelect={handleSelectHeadline}
          theme={theme}
        />
      ) : null}

      {state.phase === 'predict' && selectedHeadline ? (
        <PredictionControls
          selectedHeadline={selectedHeadline}
          onCommit={handleCommitPrediction}
          theme={theme}
        />
      ) : null}

      {state.phase === 'reveal' && result ? (
        <RevealPanel
          result={result}
          isLastRound={isLastRound}
          onNext={handleNext}
          onFinish={handleFinish}
          theme={theme}
        />
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Presentational market-stage sections (design: "UI decomposition")
 *
 * Each is a private, stateless function that receives already-derived values
 * and the resolved theme. None imports the RNG, holds session state, or calls
 * `onComplete`; they only render what `AuctionGame` passes down, so the market
 * can be redrawn on every render for free. Rendering is O(1) per interaction —
 * the crowd uses a fixed, small avatar set and never one node per demand/supply
 * unit, and at most six depth rows ever render.
 * ------------------------------------------------------------------ */

/**
 * The single active phase header (design: "Accessibility architecture" → "Each
 * phase exposes one active accessible header"). Exactly one of these renders at
 * a time, named for the current phase so a screen reader always finds one
 * unambiguous phase heading. The `completed` phase (terminal, handled by the
 * engine) renders no phase header. All other section sub-labels in the tree are
 * plain text, not headers, so this is the only active phase header.
 */
interface PhaseHeaderProps {
  phase: AuctionPhase;
}

function PhaseHeader({ phase }: PhaseHeaderProps) {
  const label =
    phase === 'choose'
      ? 'Choose a headline'
      : phase === 'predict'
        ? 'Make your prediction'
        : phase === 'reveal'
          ? 'Round result'
          : null;

  if (label === null) return null;

  return (
    <Text variant="body" accessibilityRole="header" accessibilityLabel={label}>
      {label}
    </Text>
  );
}

/**
 * The persistent header (design: "UI decomposition" → `AuctionHeader`). Frames
 * the lab as a fictional rare collectible auction and shows the two always-on
 * educational labels plus the round progress. The "Simulation · No real money"
 * and simulated-quote labels are visible in every phase (requirements 8.1, 8.2,
 * 8.3). `Round N of M` keeps the exact accessible text existing tests depend on.
 */
interface AuctionHeaderProps {
  roundIndex: number;
  totalRounds: number;
  theme: Theme;
}

function AuctionHeader({ roundIndex, totalRounds, theme }: AuctionHeaderProps) {
  return (
    <View style={[styles.section, { gap: theme.spacing.xs }]}>
      <Text variant="body" accessibilityRole="header">
        {COLLECTIBLE_SUBJECT}
      </Text>
      <Text variant="caption" color="textMuted" accessibilityLabel={SIMULATION_LABEL}>
        {SIMULATION_LABEL}
      </Text>
      <Text variant="caption" color="textMuted" accessibilityLabel={SIMULATED_QUOTE_LABEL}>
        {SIMULATED_QUOTE_LABEL}
      </Text>
      <Text variant="caption" color="textMuted" accessibilityRole="header">
        Round {roundIndex + 1} of {totalRounds}
      </Text>
    </View>
  );
}

/**
 * The live market stage (design: "UI decomposition" → `MarketStage`). Shows the
 * current price (preserving the `Current price <formatted>` accessible label and
 * the plain `$…` text existing tests rely on), the whole-number demand/supply
 * totals (requirement 2.1), a fixed small buyer/seller crowd of illustrative
 * avatars (never one node per unit — design "Performance characteristics"), and
 * a proportional balance meter derived from the displayed totals. The totals and
 * meter update immediately when a headline is selected because `AuctionGame`
 * recomputes `previewTotals` with no RNG draw.
 */
interface MarketStageProps {
  priceCents: number;
  totals: AuctionTotals;
  theme: Theme;
}

function MarketStage({ priceCents, totals, theme }: MarketStageProps) {
  const total = totals.demand + totals.supply;
  // Proportional balance meter. At zero total both sides sit at 50% so the meter
  // reads as balanced rather than collapsing to one side.
  const buyPct = total === 0 ? 0.5 : totals.demand / total;
  const sellPct = total === 0 ? 0.5 : totals.supply / total;

  return (
    <View style={[styles.section, { gap: theme.spacing.sm }]}>
      <Text
        variant="title"
        accessibilityLabel={`Current price ${formatDollars(priceCents)}`}
      >
        {formatDollars(priceCents)}
      </Text>

      <View style={[styles.row, styles.crowdRow, { gap: theme.spacing.md }]}>
        <CrowdSide
          side="buyers"
          total={totals.demand}
          color={theme.colors.primary}
          theme={theme}
        />
        <CrowdSide
          side="sellers"
          total={totals.supply}
          color={theme.colors.danger}
          theme={theme}
        />
      </View>

      <View
        style={styles.balanceMeter}
        accessibilityRole="progressbar"
        accessibilityLabel={`Buyers versus sellers: ${totals.demand} buyers, ${totals.supply} sellers`}
      >
        <View
          style={[
            styles.balanceSegment,
            {
              flex: buyPct,
              backgroundColor: theme.colors.primary,
              borderTopLeftRadius: theme.radii.sm,
              borderBottomLeftRadius: theme.radii.sm,
            },
          ]}
        />
        <View
          style={[
            styles.balanceSegment,
            {
              flex: sellPct,
              backgroundColor: theme.colors.danger,
              borderTopRightRadius: theme.radii.sm,
              borderBottomRightRadius: theme.radii.sm,
            },
          ]}
        />
      </View>
    </View>
  );
}

/**
 * One side of the fixed crowd. Renders a constant {@link CROWD_AVATAR_COUNT} set
 * of avatar glyphs regardless of the side total (so a million-strong crowd is
 * still five nodes), plus the exact whole-number total as grouped accessible
 * text. This is what keeps the stage O(1) per interaction.
 */
interface CrowdSideProps {
  side: 'buyers' | 'sellers';
  total: number;
  color: string;
  theme: Theme;
}

function CrowdSide({ side, total, color, theme }: CrowdSideProps) {
  const label = side === 'buyers' ? 'Buyers (demand)' : 'Sellers (supply)';
  const glyph = side === 'buyers' ? '🙋' : '🧑‍💼';
  return (
    <View
      style={[styles.crowdSide, { gap: theme.spacing.xs }]}
      accessibilityLabel={`${label}: ${total}`}
    >
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <Text variant="body" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {glyph.repeat(CROWD_AVATAR_COUNT)}
      </Text>
      <Text variant="title" style={{ color }}>
        {total}
      </Text>
    </View>
  );
}

/**
 * The bid/ask quotes with their plain-language meanings (design: "UI
 * decomposition" → `BidAskPanel`; requirement 3.6). Always rendered: when the
 * snapshot is null it shows labelled placeholders without touching round state
 * (requirement 3.5). The meanings make bid and ask legible to a first-time
 * learner regardless of color.
 */
interface BidAskPanelProps {
  market: AuctionMarketSnapshot | null;
  theme: Theme;
}

function BidAskPanel({ market, theme }: BidAskPanelProps) {
  const bidText = market ? formatDollars(market.bidCents) : '—';
  const askText = market ? formatDollars(market.askCents) : '—';
  const spreadText = market ? formatDollars(market.spreadCents) : '—';

  return (
    <View style={[styles.section, { gap: theme.spacing.xs }]}>
      <View style={[styles.row, { gap: theme.spacing.md }]}>
        <View
          style={styles.quoteCell}
          accessibilityLabel={`Bid ${bidText}. The highest price buyers will pay.`}
        >
          <Text variant="caption" color="textMuted">
            Bid — highest price buyers will pay
          </Text>
          <Text variant="body" style={{ color: theme.colors.primary }}>
            {bidText}
          </Text>
        </View>
        <View
          style={styles.quoteCell}
          accessibilityLabel={`Ask ${askText}. The lowest price sellers will accept.`}
        >
          <Text variant="caption" color="textMuted">
            Ask — lowest price sellers will accept
          </Text>
          <Text variant="body" style={{ color: theme.colors.danger }}>
            {askText}
          </Text>
        </View>
      </View>
      <Text
        variant="caption"
        color="textMuted"
        accessibilityLabel={`Spread ${spreadText}. The gap between bid and ask.`}
      >
        Spread {spreadText}
      </Text>
    </View>
  );
}

/**
 * The order-book depth (design: "UI decomposition" → `OrderBookDepth`). The
 * compact proportional buy/sell strip is always rendered from the snapshot's
 * side fractions (requirement 3.4). The three expanded levels per side render
 * only when `showMarketDepth` is true (requirement 3.5 interpretation / design).
 * On a null snapshot it shows a placeholder and preserves round state
 * (requirement 3.5).
 */
interface OrderBookDepthProps {
  market: AuctionMarketSnapshot | null;
  showMarketDepth: boolean;
  theme: Theme;
}

function OrderBookDepth({ market, showMarketDepth, theme }: OrderBookDepthProps) {
  if (!market) {
    return (
      <View style={[styles.section, { gap: theme.spacing.xs }]}>
        <Text variant="caption" color="textMuted">
          Order book
        </Text>
        <Text variant="caption" color="textMuted" accessibilityLabel="Order book unavailable">
          —
        </Text>
      </View>
    );
  }

  const buyPct = Math.max(0, Math.min(1, market.buyFraction));
  const sellPct = Math.max(0, Math.min(1, market.sellFraction));

  return (
    <View style={[styles.section, { gap: theme.spacing.sm }]}>
      <Text variant="caption" color="textMuted">
        Order book
      </Text>

      {/* Always-visible compact proportional buy/sell strip (requirement 3.4). */}
      <View
        style={styles.depthStrip}
        accessibilityLabel={`Resting orders: ${Math.round(buyPct * 100)}% buy, ${Math.round(
          sellPct * 100,
        )}% sell`}
      >
        <View
          style={[
            styles.balanceSegment,
            {
              flex: buyPct === 0 && sellPct === 0 ? 0.5 : buyPct,
              backgroundColor: theme.colors.primary,
            },
          ]}
        />
        <View
          style={[
            styles.balanceSegment,
            {
              flex: buyPct === 0 && sellPct === 0 ? 0.5 : sellPct,
              backgroundColor: theme.colors.danger,
            },
          ]}
        />
      </View>

      {showMarketDepth ? (
        <View style={[styles.row, { gap: theme.spacing.md }]}>
          <DepthLadder
            heading="Buy orders"
            levels={market.buyLevels}
            color={theme.colors.primary}
            theme={theme}
          />
          <DepthLadder
            heading="Sell orders"
            levels={market.sellLevels}
            color={theme.colors.danger}
            theme={theme}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * One side's three expanded depth levels. Renders a fixed three rows (never one
 * per unit), each a price with its resting quantity and a proportional bar whose
 * width tracks the level's `relativeSize` against the shared common scale.
 */
interface DepthLadderProps {
  heading: string;
  levels: readonly MarketDepthLevel[];
  color: string;
  theme: Theme;
}

function DepthLadder({ heading, levels, color, theme }: DepthLadderProps) {
  return (
    <View style={[styles.depthLadder, { gap: theme.spacing.xs }]}>
      <Text variant="caption" color="textMuted">
        {heading}
      </Text>
      {levels.map((level, i) => (
        <View
          key={i}
          style={styles.depthLevelRow}
          accessibilityLabel={`${heading} level ${i + 1}: ${level.quantity} at ${formatDollars(
            level.priceCents,
          )}`}
        >
          <View
            style={[
              styles.depthLevelBar,
              {
                width: `${Math.max(0, Math.min(1, level.relativeSize)) * 100}%`,
                backgroundColor: color,
                borderRadius: theme.radii.sm,
              },
            ]}
          />
          <Text variant="caption" color="textMuted">
            {formatDollars(level.priceCents)} · {level.quantity}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The headline chooser (design: "UI decomposition" → `HeadlineChooser`). Renders
 * all two-to-four authored headline cards as single-tap buttons; selecting one
 * emits its id and moves the machine into `predict` (requirement 4.1). The
 * `Play headline: <text>` accessible label is the exact string existing tests
 * depend on, and the full headline text is in the label (requirement 7.2).
 */
interface HeadlineChooserProps {
  headlines: readonly AuctionHeadline[];
  onSelect: (headlineId: string) => void;
  theme: Theme;
}

function HeadlineChooser({ headlines, onSelect, theme }: HeadlineChooserProps) {
  return (
    <View style={[styles.section, { gap: theme.spacing.sm }]}>
      <Text variant="body" color="textMuted">
        Pick a headline
      </Text>
      {headlines.map((headline) => (
        <Button
          key={headline.id}
          title={headline.text}
          variant="secondary"
          onPress={() => onSelect(headline.id)}
          accessibilityLabel={`Play headline: ${headline.text}`}
        />
      ))}
    </View>
  );
}

/**
 * The prediction controls (design: "UI decomposition" → `PredictionControls`).
 * The chosen headline from `choose` is retained and visually marked as the
 * active card (requirement 4.2): its text stays on screen and it reports
 * `accessibilityState.selected`, so the learner always sees which card they are
 * predicting on. Exactly the `up` and `down` commitment controls are rendered;
 * committing one locks the prediction and the pair is gone (requirements 4.3,
 * 4.4). The up/down controls carry the explicit "go up"/"go down" wording tests
 * and screen readers depend on.
 */
interface PredictionControlsProps {
  selectedHeadline: AuctionHeadline;
  onCommit: (direction: AuctionDirection) => void;
  theme: Theme;
}

function PredictionControls({ selectedHeadline, onCommit, theme }: PredictionControlsProps) {
  return (
    <View style={[styles.section, { gap: theme.spacing.sm }]}>
      <View
        style={[
          styles.activeHeadline,
          {
            borderColor: theme.colors.primary,
            borderRadius: theme.radii.md,
            padding: theme.spacing.sm,
          },
        ]}
        accessibilityState={{ selected: true }}
        accessibilityLabel={`Playing headline: ${selectedHeadline.text}`}
        accessibilityLiveRegion="polite"
      >
        <Text variant="caption" color="textMuted">
          Playing headline
        </Text>
        <Text variant="body">{selectedHeadline.text}</Text>
      </View>
      <Text variant="body" color="textMuted">
        Which way will the price move?
      </Text>
      <View style={[styles.row, { gap: theme.spacing.sm }]}>
        <Button
          title="Price up"
          variant="primary"
          onPress={() => onCommit('up')}
          accessibilityLabel="Predict the price will go up"
        />
        <Button
          title="Price down"
          variant="primary"
          onPress={() => onCommit('down')}
          accessibilityLabel="Predict the price will go down"
        />
      </View>
    </View>
  );
}

/**
 * The persistent reveal panel (design: "UI decomposition" → `RevealPanel`, and
 * "Reveal copy"). Everything here is rendered immediately from the committed
 * round result with no animation gating — numeric state and controls never wait
 * on any timing (requirement 2.6; motion arrives in task 7.1).
 *
 * The panel shows, as persistent accessible text:
 *  - the previous and new prices and the signed whole-cent difference, in the
 *    stable "Price rose from X to Y (±N¢)." line (requirements 4.5, 4.6);
 *  - increase / decrease / no-change wording for the move (requirement 4.7);
 *  - the actual computed direction; and
 *  - the balance-driven explanation (requirement 4.8).
 *
 * The legacy `The price moved <direction> to <price>.` line is kept verbatim so
 * existing tests that match `/The price moved/` stay green. Only the correct
 * next-round (non-final) or finish (final) control is exposed (requirement 4.6).
 */
interface RevealPanelProps {
  result: AuctionRoundResult;
  isLastRound: boolean;
  onNext: () => void;
  onFinish: () => void;
  theme: Theme;
}

/**
 * The fixed vertical travel of the directional ticker effect, in points. The
 * value is a pure visual constant: it never feeds back into the domain.
 */
const TICKER_OFFSET = 8;

function RevealPanel({ result, isLastRound, onNext, onFinish, theme }: RevealPanelProps) {
  const copy = buildRevealCopy(result);
  const legacyLine = `The price moved ${result.direction} to ${formatDollars(
    result.priceAfterCents,
  )}.`;

  const reduceMotion = useReduceMotion();

  // Stable presentation-only Animated.Value instances (design: "Animation
  // architecture"). These drive opacity/transform only and are never read by the
  // domain. Lazily initialized once and held in state so the same instances are
  // reused across renders of a reveal; RevealPanel mounts fresh for each reveal,
  // so each reveal gets its own pair. (Lazy state init rather than a ref avoids
  // reading a ref's value during render.)
  const [tickerProgress] = useState(() => new Animated.Value(0));
  const [crowdPulse] = useState(() => new Animated.Value(0));

  // Identity of the revealed round. Everything accessible is already rendered
  // from `result` before this effect runs; the effect only adds motion and a
  // best-effort announcement, keyed so each distinct reveal fires exactly once.
  const resultKey = `${result.priceBeforeCents}:${result.priceAfterCents}:${result.direction}`;

  // One best-effort announcement per revealed round. The persistent text in the
  // polite live region below is the real source of truth; this is additive.
  useEffect(() => {
    announceReveal(`${legacyLine} ${copy.resultLine}`);
    // Fire once per distinct reveal. The copy is derived deterministically from
    // the same result identity, so resultKey alone keys this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey]);

  // Presentation-only reveal animation. It starts AFTER the result is already
  // rendered, animates opacity/transform with the native driver, and its
  // completion callback does nothing to the domain (no RNG, no state change, no
  // control gating, no grading, no completion). Reduced motion snaps straight to
  // the final visual state with no timing animation. Running animations are
  // stopped on cleanup (unmount or a new reveal) so no clock is left pending.
  useEffect(() => {
    if (reduceMotion) {
      // Snap directly to the settled presentation; start no timing animation.
      tickerProgress.setValue(0);
      crowdPulse.setValue(0);
      return;
    }

    // Reset to the start of the effect, then run a short directional pulse that
    // returns the ticker to rest and fades the crowd pulse back out.
    tickerProgress.setValue(0);
    crowdPulse.setValue(0);

    const animation = Animated.parallel([
      Animated.sequence([
        Animated.timing(tickerProgress, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(tickerProgress, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(crowdPulse, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(crowdPulse, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
    ]);

    // No completion callback mutates state: start with no onEnd handler.
    animation.start();

    return () => {
      // Stop any in-flight animation on cleanup / new reveal.
      animation.stop();
      tickerProgress.stopAnimation();
      crowdPulse.stopAnimation();
    };
    // Re-run only when the revealed round changes or the motion preference flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey, reduceMotion]);

  // Map direction to a fixed visual target: up translates upward, down downward,
  // and a no-change tie (domain direction is the deterministic `up`) still uses
  // the up offset. This is purely cosmetic and derived from the already-computed
  // direction, not recomputed.
  const translateY = tickerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, result.direction === 'down' ? TICKER_OFFSET : -TICKER_OFFSET],
  });
  const pulseOpacity = crowdPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.6],
  });

  return (
    <View style={[styles.section, { gap: theme.spacing.xs }]} accessibilityLiveRegion="polite">
      {/* Stable, test-relied phrasing. Kept verbatim and persistent. The purely
          visual opacity/transform wrapper never gates this content: the text is
          present and accessible regardless of animation timing. */}
      <Animated.View style={{ opacity: pulseOpacity, transform: [{ translateY }] }}>
        <Text variant="body" accessibilityLabel={legacyLine}>
          {legacyLine}
        </Text>
      </Animated.View>

      {/* The stable signed result line: previous price, new price, signed cents. */}
      <Text variant="body" accessibilityLabel={copy.resultLine}>
        {copy.resultLine}
      </Text>

      {/* Increase / decrease / no-change wording plus the computed direction. */}
      <Text
        variant="caption"
        color="textMuted"
        accessibilityLabel={`Price ${copy.movement} of ${copy.signedCents}. Direction: ${result.direction}.`}
      >
        {`Price ${copy.movement} (${copy.signedCents}) · direction ${result.direction}`}
      </Text>

      {/* Why the balance of demand and supply moved the price. */}
      <Text variant="caption" color="textMuted" accessibilityLabel={copy.explanation}>
        {copy.explanation}
      </Text>

      <Button
        title={isLastRound ? 'See your result' : 'Next round'}
        variant="primary"
        onPress={isLastRound ? onFinish : onNext}
        accessibilityLabel={isLastRound ? 'See your result' : 'Go to the next round'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%' },
  activeHeadline: { borderWidth: 1, width: '100%' },
  section: { width: '100%' },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  crowdRow: { justifyContent: 'space-between' },
  crowdSide: { flex: 1, alignItems: 'center' },
  balanceMeter: {
    width: '100%',
    height: 12,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  balanceSegment: { height: '100%' },
  quoteCell: { flex: 1, minWidth: 120 },
  depthStrip: {
    width: '100%',
    height: 10,
    flexDirection: 'row',
    borderRadius: 5,
    overflow: 'hidden',
  },
  depthLadder: { flex: 1, minWidth: 120 },
  depthLevelRow: { width: '100%' },
  depthLevelBar: { height: 6, minWidth: 2 },
});
