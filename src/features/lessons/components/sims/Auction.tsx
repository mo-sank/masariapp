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
 * every run (requirement 8.5): this component builds its PRNG from the `seed`
 * prop with {@link mulberry32} and advances it exactly once per round via
 * `applyHeadline`, matching what the pure `scoreAuction` oracle produces in the
 * tests. The component is pure in the lesson sense (requirement 4.8): no network,
 * no haptics — SimStep turns the final outcome into an answer and the player
 * owns feedback.
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

import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { SimComponentProps } from './types';
import { Button, Card, Text } from '../../../../components/ui';
import { useTheme } from '../../../../theme/theme-provider';
import { mulberry32 } from '../../rng';
import {
  applyHeadline,
  parseAuctionParams,
  type AuctionDirection,
  type AuctionHeadline,
  type AuctionRoundResult,
} from '../../sims/auction';
import { formatDollars } from '../../sims/ownership-split';

/** The phases of a single round. */
type Phase = 'choose' | 'predict' | 'reveal';

export function Auction({ params, seed, onComplete }: SimComponentProps) {
  const theme = useTheme();

  // Validate the authored params once. A malformed sim step throws here.
  const parsed = useMemo(() => parseAuctionParams(params), [params]);

  // The seeded PRNG for the whole run. Built once from the step's seed and
  // advanced exactly once per round (inside applyHeadline), so the price path is
  // deterministic and matches the pure scoreAuction oracle used in tests. A ref,
  // not state, because advancing it must not trigger a re-render.
  const rngRef = useRef(mulberry32(seed));

  // Round state. `price` is the live price carried from round to round. The
  // round-crossing values (price, chosen headline, result, running correct
  // count, round index) are each mirrored in a ref so a handler reads the live
  // value from its own invocation rather than a value captured by a stale
  // render — the three taps of a round (choose -> predict -> continue) may be
  // processed before React re-renders between them. This mirrors SortStep's
  // ref-backed state and keeps the round loop correct regardless of batching.
  const [roundIndex, setRoundIndex] = useState(0);
  const roundIndexRef = useRef(0);
  const [price, setPrice] = useState(parsed.startPriceCents);
  const priceRef = useRef(parsed.startPriceCents);
  const [phase, setPhase] = useState<Phase>('choose');
  const [chosen, setChosen] = useState<AuctionHeadline | null>(null);
  const chosenRef = useRef<AuctionHeadline | null>(null);
  const [result, setResult] = useState<AuctionRoundResult | null>(null);
  const resultRef = useRef<AuctionRoundResult | null>(null);
  // How many predictions were correct so far; summed into the final score.
  const correctRef = useRef(0);

  const totalRounds = parsed.rounds;
  const isLastRound = roundIndex >= totalRounds - 1;

  // Learner picks a headline card -> move to the prediction phase.
  const handleChoose = (headline: AuctionHeadline) => {
    chosenRef.current = headline;
    setChosen(headline);
    setPhase('predict');
  };

  // Learner commits a prediction -> apply the headline (advancing the rng once)
  // and reveal the result. The prediction is locked in before the reveal
  // (requirement 8.2: predict direction first). Reads the live headline and
  // price from refs so it is correct even if choose and predict are batched.
  const handlePredict = (prediction: AuctionDirection) => {
    const headline = chosenRef.current;
    if (!headline) return;
    const round = applyHeadline(priceRef.current, headline, parsed, rngRef.current);
    resultRef.current = round;
    setResult(round);
    if (round.direction === prediction) {
      correctRef.current += 1;
    }
    setPhase('reveal');
  };

  // Continue past the reveal: advance to the next round, or finish and report
  // the final score (correct / rounds as a 0-100 integer). Reads the live
  // result/correct/round from refs so it is correct even when batched.
  const handleContinue = () => {
    const round = resultRef.current;
    if (!round) return;
    const nextPrice = round.priceAfterCents;
    const correct = correctRef.current;

    if (roundIndexRef.current >= totalRounds - 1) {
      const score = Math.round((correct / totalRounds) * 100);
      onComplete({
        score,
        summary: `You read the market right ${correct} of ${totalRounds} ${
          totalRounds === 1 ? 'time' : 'times'
        }.`,
      });
      return;
    }

    priceRef.current = nextPrice;
    roundIndexRef.current += 1;
    chosenRef.current = null;
    resultRef.current = null;
    setPrice(nextPrice);
    setRoundIndex((i) => i + 1);
    setChosen(null);
    setResult(null);
    setPhase('choose');
  };

  return (
    <Card style={[styles.card, { gap: theme.spacing.md }]}>
      <Text variant="caption" color="textMuted" accessibilityRole="header">
        Round {roundIndex + 1} of {totalRounds}
      </Text>

      <Text
        variant="title"
        accessibilityLabel={`Current price ${formatDollars(price)}`}
      >
        {formatDollars(price)}
      </Text>

      {phase === 'choose' ? (
        <View style={[styles.section, { gap: theme.spacing.sm }]}>
          <Text variant="body" accessibilityRole="header">
            Pick a headline
          </Text>
          {parsed.headlines.map((headline) => (
            <Button
              key={headline.id}
              title={headline.text}
              variant="secondary"
              onPress={() => handleChoose(headline)}
              accessibilityLabel={`Play headline: ${headline.text}`}
            />
          ))}
        </View>
      ) : null}

      {phase === 'predict' && chosen ? (
        <View style={[styles.section, { gap: theme.spacing.sm }]}>
          <Text variant="body" accessibilityLiveRegion="polite">
            {chosen.text}
          </Text>
          <Text variant="body" accessibilityRole="header">
            Which way will the price move?
          </Text>
          <View style={[styles.row, { gap: theme.spacing.sm }]}>
            <Button
              title="Price up"
              variant="primary"
              onPress={() => handlePredict('up')}
              accessibilityLabel="Predict the price will go up"
            />
            <Button
              title="Price down"
              variant="primary"
              onPress={() => handlePredict('down')}
              accessibilityLabel="Predict the price will go down"
            />
          </View>
        </View>
      ) : null}

      {phase === 'reveal' && result ? (
        <View style={[styles.section, { gap: theme.spacing.sm }]}>
          <Text
            variant="body"
            accessibilityLiveRegion="polite"
            accessibilityLabel={`The price moved ${result.direction} to ${formatDollars(
              result.priceAfterCents,
            )}.`}
          >
            The price moved {result.direction} to {formatDollars(result.priceAfterCents)}.
          </Text>
          <Button
            title={isLastRound ? 'See your result' : 'Next round'}
            variant="primary"
            onPress={handleContinue}
            accessibilityLabel={isLastRound ? 'See your result' : 'Go to the next round'}
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
