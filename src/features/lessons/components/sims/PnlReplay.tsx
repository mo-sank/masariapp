/**
 * P&L replay lab — sell or hold (requirements 8.3, 4.6, 8.5).
 *
 * The learner bought in, the price fast-forwards to a prompt, and they choose to
 * sell or hold; the lab shows the unrealized P&L at the prompt and then the
 * realized P&L once the decision plays out (requirement 8.3). Sell locks in the
 * prompt-time price; hold rides the path to the final price. Both outcomes are
 * shown so the lesson lands whichever the learner picks.
 *
 * The price path, P&L maths, and grading live in the pure `sims/pnl-replay.ts`
 * module, which makes the lab's behaviour unit-testable and repeatable
 * (requirement 8.5): this component builds the path once from the `seed` prop
 * (via {@link mulberry32}) for generated paths, or uses the authored `prices`,
 * exactly as the pure `replayPnl` oracle does in the tests. The component is
 * pure in the lesson sense (requirement 4.8): no network, no haptics — SimStep
 * turns the final outcome into an answer and the player owns feedback.
 *
 * The lab is a small state machine:
 *   replay  -> the price fast-forwards from the buy point to the prompt
 *   prompt  -> unrealized P&L shown; learner taps Sell or Hold
 *   result  -> realized P&L (and the alternative) shown; Continue finishes
 *
 * Reduce-motion / timer: the fast-forward is a short interval that steps the
 * displayed price toward the prompt. When reduce-motion is on it is skipped and
 * the prompt is shown immediately. The replay never gates completion — the
 * learner can act as soon as the prompt is reached, and no timer blocks the
 * score — so the lab is fully usable (and testable) without waiting on motion.
 *
 * Accessibility: each phase has a header; Sell/Hold and Continue are labelled
 * buttons (tap-only, no gestures); the live price and the P&L figures are
 * announced politely as they change.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { SimComponentProps } from './types';
import { Button, Card, Text } from '../../../../components/ui';
import { useReduceMotion } from '../../../../theme/use-reduce-motion';
import { useTheme } from '../../../../theme/theme-provider';
import { mulberry32 } from '../../rng';
import {
  buildPricePath,
  computePnl,
  formatDollars,
  formatSignedDollars,
  formatSignedPct,
  parsePnlReplayParams,
  replayPnl,
  type PnlDecision,
  type PnlReplayResult,
} from '../../sims/pnl-replay';

/** How long each fast-forward tick waits, in ms (ignored under reduce-motion). */
const TICK_MS = 450;

/** The phases of the lab. */
type Phase = 'replay' | 'prompt' | 'result';

export function PnlReplay({ params, seed, onComplete }: SimComponentProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();

  // Validate params and build the (deterministic) price path once. A malformed
  // sim step throws here. The path is built from the seed so a generated path is
  // identical across runs and matches the pure oracle in tests (requirement 8.5).
  const parsed = useMemo(() => parsePnlReplayParams(params), [params]);
  const path = useMemo(() => buildPricePath(parsed, mulberry32(seed)), [parsed, seed]);

  const buyPriceCents = path[parsed.buyIndex];

  // The index currently displayed during the fast-forward. Starts at the buy
  // point and advances to the prompt. Mirrored in a ref so the interval callback
  // reads the live index rather than a value captured when the effect ran.
  const [displayIndex, setDisplayIndex] = useState(parsed.buyIndex);
  const displayIndexRef = useRef(parsed.buyIndex);

  // Reduce-motion skips the fast-forward entirely and starts at the prompt.
  const [phase, setPhase] = useState<Phase>(reduceMotion ? 'prompt' : 'replay');
  // The graded result once the learner decides. Mirrored in a ref so Continue
  // reports the live value even if the decision and the tap are batched.
  const [result, setResult] = useState<PnlReplayResult | null>(null);
  const resultRef = useRef<PnlReplayResult | null>(null);

  // Fast-forward the displayed price from the buy point to the prompt. Runs only
  // in the replay phase (so not under reduce-motion). The interval is cleared on
  // unmount and when the prompt is reached, so no timer gates completion.
  useEffect(() => {
    if (phase !== 'replay') return;
    // Already at (or past) the prompt — nothing to animate.
    if (displayIndexRef.current >= parsed.promptIndex) {
      setPhase('prompt');
      return;
    }
    const timer = setInterval(() => {
      const next = displayIndexRef.current + 1;
      displayIndexRef.current = next;
      setDisplayIndex(next);
      if (next >= parsed.promptIndex) {
        clearInterval(timer);
        setPhase('prompt');
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [phase, parsed.promptIndex]);

  // The price shown right now: the fast-forward price during replay, otherwise
  // the prompt price.
  const shownIndex = phase === 'replay' ? displayIndex : parsed.promptIndex;
  const shownPriceCents = path[shownIndex];
  const unrealized = computePnl(parsed.shares, buyPriceCents, path[parsed.promptIndex]);

  // Learner decides -> grade the full replay and show the result.
  const handleDecision = (decision: PnlDecision) => {
    const graded = replayPnl(path, parsed, decision);
    resultRef.current = graded;
    setResult(graded);
    setPhase('result');
  };

  // Continue past the result -> report the score to the player. Reads the ref so
  // it is correct even if the decision and the Continue tap are batched.
  const handleContinue = () => {
    const graded = resultRef.current;
    if (!graded) return;
    onComplete({ score: graded.score, summary: graded.summary });
  };

  return (
    <Card style={[styles.card, { gap: theme.spacing.md }]}>
      <Text variant="caption" color="textMuted" accessibilityRole="header">
        You bought {parsed.shares} share{parsed.shares === 1 ? '' : 's'} at{' '}
        {formatDollars(buyPriceCents)}
      </Text>

      <Text
        variant="title"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Price now ${formatDollars(shownPriceCents)}`}
      >
        {formatDollars(shownPriceCents)}
      </Text>

      {phase === 'replay' ? (
        <Text variant="caption" color="textMuted" accessibilityLiveRegion="polite">
          Fast-forwarding the price…
        </Text>
      ) : null}

      {phase === 'prompt' ? (
        <View style={[styles.section, { gap: theme.spacing.sm }]}>
          <Text
            variant="body"
            accessibilityLiveRegion="polite"
            accessibilityLabel={`On paper you are ${
              unrealized.pnlCents >= 0 ? 'up' : 'down'
            } ${formatSignedDollars(unrealized.pnlCents)}, ${formatSignedPct(unrealized.pnlPct)}.`}
          >
            On paper: {formatSignedDollars(unrealized.pnlCents)} (
            {formatSignedPct(unrealized.pnlPct)})
          </Text>
          <Text variant="body" accessibilityRole="header">
            Sell now or hold?
          </Text>
          <View style={[styles.row, { gap: theme.spacing.sm }]}>
            <Button
              title="Sell"
              variant="primary"
              onPress={() => handleDecision('sell')}
              accessibilityLabel="Sell now and lock in this profit or loss"
            />
            <Button
              title="Hold"
              variant="secondary"
              onPress={() => handleDecision('hold')}
              accessibilityLabel="Hold and ride the price to the end"
            />
          </View>
        </View>
      ) : null}

      {phase === 'result' && result ? (
        <View style={[styles.section, { gap: theme.spacing.sm }]}>
          <Text
            variant="body"
            accessibilityLiveRegion="polite"
            accessibilityLabel={`You ${
              result.decision === 'sell' ? 'sold' : 'held'
            } and realized ${formatSignedDollars(result.realized.pnlCents)}, ${formatSignedPct(
              result.realized.pnlPct,
            )}.`}
          >
            Realized: {formatSignedDollars(result.realized.pnlCents)} (
            {formatSignedPct(result.realized.pnlPct)})
          </Text>
          <Text variant="caption" color="textMuted">
            {result.decision === 'sell' ? 'Holding' : 'Selling'} would have been{' '}
            {formatSignedDollars(result.alternative.pnlCents)}.
          </Text>
          <Button
            title="Continue"
            variant="primary"
            onPress={handleContinue}
            accessibilityLabel="Continue to the next step"
          />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%' },
  section: { width: '100%' },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
});
