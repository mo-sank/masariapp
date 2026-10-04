/**
 * Ownership-split lab — the lemonade-stand company (requirements 8.1, 4.6, 8.5).
 *
 * The learner sells shares of their company to raise cash while trying to keep
 * majority ownership (requirement 8.1). They adjust how many shares to sell with
 * +/- controls and watch ownership and the money raised update live; when happy
 * they lock it in. The lab grades the split (both goals -> 100, one -> 60,
 * neither -> 30) and, on a sub-100 result, offers a hint and one retry before
 * committing the score — the "hint and one retry" from the design.
 *
 * All the arithmetic and grading live in the pure `sims/ownership-split.ts`
 * module, which makes the lab's behaviour unit-testable and repeatable
 * (requirement 8.5). This component is just the screen: it validates params,
 * tracks `sharesSold`, renders the live figures, and reports the final outcome
 * via `onComplete`. It is pure in the lesson sense (requirement 4.8): no network,
 * no scoring of its own, no haptics — the player owns feedback and haptics after
 * SimStep turns the outcome into an answer. This lab uses no randomness, so the
 * `seed` prop is accepted and ignored.
 *
 * Accessibility: the goal is a header; the shares control is a labelled stepper
 * (two buttons plus a live-updating readout) so it works without a drag gesture;
 * the live ownership/raise figures are announced politely as they change.
 */

import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { SimComponentProps } from './types';
import { Button, Card, Text } from '../../../../components/ui';
import { useTheme } from '../../../../theme/theme-provider';
import {
  deriveOwnershipState,
  clampSharesSold,
  formatDollars,
  formatPct,
  parseOwnershipSplitParams,
  scoreOwnershipSplit,
} from '../../sims/ownership-split';

/** How many shares one tap of the +/- control moves (kept small for control). */
const STEP = 1;
/** A larger jump for quicker coarse adjustment on bigger share counts. */
const BIG_STEP = 5;

export function OwnershipSplit({ params, onComplete }: SimComponentProps) {
  const theme = useTheme();

  // Validate the authored params once. A malformed sim step throws here (and in
  // validate:content), rather than rendering a broken simulation.
  const parsed = useMemo(() => parseOwnershipSplitParams(params), [params]);

  // The learner's current split. Start at zero shares sold (full ownership). A
  // ref mirrors it so lock-in reads the live value from its handler rather than
  // a value captured by a stale render (robust to how React batches taps — the
  // same pattern as SortStep's placements ref).
  const [sharesSold, setSharesSold] = useState(0);
  const sharesSoldRef = useRef(0);
  // Whether we have shown the hint after a sub-100 attempt; the design allows
  // one retry, so the second lock-in commits regardless of the score. Mirrored
  // in a ref for the same batch-safety reason.
  const [hintShown, setHintShown] = useState(false);
  const hintShownRef = useRef(false);

  const state = deriveOwnershipState(sharesSold, parsed);

  // Adjust shares sold by a delta, clamped to [0, totalShares], keeping the ref
  // in step with the state.
  const adjust = (delta: number) => {
    const next = clampSharesSold(sharesSoldRef.current + delta, parsed);
    sharesSoldRef.current = next;
    setSharesSold(next);
  };

  // Lock in the current split. First lock-in with a sub-100 score shows a hint
  // and lets the learner try once more; the next lock-in commits the outcome.
  // Reads the live shares/hint from the refs so it is correct even if the final
  // adjust and the lock-in are processed in the same batch.
  const handleLockIn = () => {
    const result = scoreOwnershipSplit(sharesSoldRef.current, parsed);
    if (result.score < 100 && !hintShownRef.current) {
      hintShownRef.current = true;
      setHintShown(true);
      return;
    }
    onComplete({ score: result.score, summary: result.summary });
  };

  const atMin = sharesSold <= 0;
  const atMax = sharesSold >= parsed.totalShares;

  return (
    <Card style={[styles.card, { gap: theme.spacing.md }]}>
      <Text variant="caption" color="textMuted" accessibilityRole="header">
        Raise cash, keep control
      </Text>

      {/* Live figures. Announced politely so assistive tech reads the change. */}
      <View
        style={[styles.readout, { gap: theme.spacing.xs }]}
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Selling ${sharesSold} of ${parsed.totalShares} shares. You keep ${formatPct(
          state.ownerPct,
        )} percent ownership and raise ${formatDollars(state.raisedCents)}.`}
      >
        <Text variant="title">{formatDollars(state.raisedCents)} raised</Text>
        <Text variant="body" color="textMuted">
          You keep {formatPct(state.ownerPct)}% ownership ({state.sharesKept} of{' '}
          {parsed.totalShares} shares)
        </Text>
        <Text variant="caption" color="textMuted">
          Goal: raise {formatDollars(parsed.targetRaiseCents)} and keep at least{' '}
          {formatPct(parsed.minOwnerPct)}%
        </Text>
      </View>

      {/* Shares stepper: tap-only, no drag needed. */}
      <View style={[styles.controls, { gap: theme.spacing.sm }]}>
        <View style={[styles.row, { gap: theme.spacing.sm }]}>
          <Button
            title={`- ${BIG_STEP}`}
            variant="secondary"
            disabled={atMin}
            onPress={() => adjust(-BIG_STEP)}
            accessibilityLabel={`Sell ${BIG_STEP} fewer shares`}
          />
          <Button
            title="- 1"
            variant="secondary"
            disabled={atMin}
            onPress={() => adjust(-STEP)}
            accessibilityLabel="Sell one fewer share"
          />
          <Button
            title="+ 1"
            variant="secondary"
            disabled={atMax}
            onPress={() => adjust(STEP)}
            accessibilityLabel="Sell one more share"
          />
          <Button
            title={`+ ${BIG_STEP}`}
            variant="secondary"
            disabled={atMax}
            onPress={() => adjust(BIG_STEP)}
            accessibilityLabel={`Sell ${BIG_STEP} more shares`}
          />
        </View>
        <Text variant="caption" color="textMuted" accessibilityLabel={`${sharesSold} shares sold`}>
          Selling {sharesSold} share{sharesSold === 1 ? '' : 's'}
        </Text>
      </View>

      {/* Hint after a sub-100 attempt (the design's "hint and one retry"). */}
      {hintShown ? (
        <Text
          variant="body"
          color="textMuted"
          accessibilityLiveRegion="polite"
          accessibilityLabel={`Hint: ${scoreOwnershipSplit(sharesSold, parsed).summary} Adjust and lock in again.`}
        >
          {scoreOwnershipSplit(sharesSold, parsed).summary} Adjust and try once more.
        </Text>
      ) : null}

      <Button
        title={hintShown ? 'Lock in this split' : 'Lock it in'}
        variant="primary"
        onPress={handleLockIn}
        accessibilityLabel="Lock in your share sale"
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%' },
  readout: { width: '100%' },
  controls: { width: '100%' },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
});
