/**
 * Opening-bell lab — read the trading day (requirements 8.4, 4.6, 8.5).
 *
 * A 90-second fictional trading day on an invented stock. Headline events arrive
 * one at a time; at each event the learner first picks the best interpretation
 * of the news (an mcq-like choice), sees a short explanation, then makes a
 * practice buy / hold / sell move for feel. The practice action is NOT scored on
 * returns (requirement 8.4) — the score is the share of events the learner
 * interpreted correctly.
 *
 * The event order, scoring, and params validation live in the pure
 * `sims/opening-bell.ts` module, which makes the lab's behaviour unit-testable
 * and repeatable (requirement 8.5): this component orders the events once from
 * the `seed` prop (via {@link mulberry32}) exactly as the pure `orderEvents`
 * oracle does in the tests, and grades with the same `scoreOpeningBell`. The
 * component is pure in the lesson sense (requirement 4.8): no network, no
 * haptics — SimStep turns the final outcome into an answer and the player owns
 * feedback.
 *
 * Each event is a two-step loop:
 *   interpret -> learner taps an interpretation; the explanation is revealed
 *   act       -> learner taps buy / hold / sell; advances to the next event
 * After the last event the lab reports the score.
 *
 * Timer / reduce-motion: a ~90-second countdown ticks in the background purely
 * as flavour, split evenly across the events. It is display-only and NEVER gates
 * completion — the learner advances by answering, not by waiting, and the lab
 * finishes on the last event regardless of the clock. When reduce-motion is on
 * the countdown is not animated (no interval runs); the lab is fully usable and
 * testable without it.
 *
 * Accessibility: each phase has a header; interpretations and the buy/hold/sell
 * actions are labelled buttons (tap-only, no gestures); the headline, the
 * explanation, and the running event counter are announced politely.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { SimComponentProps } from './types';
import { Button, Card, Text } from '../../../../components/ui';
import { useReduceMotion } from '../../../../theme/use-reduce-motion';
import { useTheme } from '../../../../theme/theme-provider';
import { mulberry32 } from '../../rng';
import {
  OPENING_BELL_ACTIONS,
  orderEvents,
  parseOpeningBellParams,
  scoreOpeningBell,
  secondsPerEvent,
  type OpeningBellAction,
  type OpeningBellChoice,
} from '../../sims/opening-bell';

/** The per-event phases. */
type Phase = 'interpret' | 'act';

/** Human labels for the practice actions. */
const ACTION_LABEL: Record<OpeningBellAction, string> = {
  buy: 'Buy',
  hold: 'Hold',
  sell: 'Sell',
};

export function OpeningBell({ params, seed, onComplete }: SimComponentProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();

  // Validate params and fix the (deterministic) event order once. A malformed
  // sim step throws here. The order is derived from the seed so it is identical
  // across runs and matches the pure oracle in tests (requirement 8.5).
  const parsed = useMemo(() => parseOpeningBellParams(params), [params]);
  const events = useMemo(() => orderEvents(parsed, mulberry32(seed)), [parsed, seed]);
  const perEvent = useMemo(() => secondsPerEvent(parsed), [parsed]);

  // Which event we are on, and the within-event phase. The round-crossing values
  // (index, chosen interpretation, running choices) are mirrored in refs so a
  // handler reads the live value from its own invocation rather than one
  // captured by a stale render — the taps of an event may be processed before
  // React re-renders between them (the pattern Auction/SortStep use).
  const [eventIndex, setEventIndex] = useState(0);
  const eventIndexRef = useRef(0);
  const [phase, setPhase] = useState<Phase>('interpret');
  const [chosenInterpretationId, setChosenInterpretationId] = useState<string | null>(null);
  const chosenRef = useRef<string | null>(null);
  // Accumulated choices across events; graded all at once at the end.
  const choicesRef = useRef<OpeningBellChoice[]>([]);

  // A display-only countdown. Starts at the full day length and ticks down one
  // second at a time; it is flavour and never gates completion. Skipped entirely
  // under reduce-motion (no interval), so assistive-tech users and tests are not
  // waiting on a clock.
  const [secondsLeft, setSecondsLeft] = useState(parsed.durationSeconds);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [reduceMotion]);

  const total = events.length;
  const event = events[eventIndex];
  const isLastEvent = eventIndex >= total - 1;

  // Learner picks an interpretation -> reveal the explanation, move to the
  // practice action. Records the chosen id in the ref for the action handler.
  const handleInterpret = (interpretationId: string) => {
    chosenRef.current = interpretationId;
    setChosenInterpretationId(interpretationId);
    setPhase('act');
  };

  // Learner takes a practice action -> record the full choice, then advance to
  // the next event or finish and report the score. Reads the live interpretation
  // and index from refs so it is correct even if the two taps are batched.
  const handleAction = (action: OpeningBellAction) => {
    const interpretationId = chosenRef.current;
    if (!interpretationId) return;
    const currentEvent = events[eventIndexRef.current];
    choicesRef.current.push({
      eventId: currentEvent.id,
      interpretationId,
      action,
    });

    if (eventIndexRef.current >= total - 1) {
      const result = scoreOpeningBell(parsed, choicesRef.current);
      onComplete({ score: result.score, summary: result.summary });
      return;
    }

    eventIndexRef.current += 1;
    chosenRef.current = null;
    setEventIndex((i) => i + 1);
    setChosenInterpretationId(null);
    setPhase('interpret');
  };

  const chosenCorrect =
    chosenInterpretationId !== null &&
    chosenInterpretationId === event.correctInterpretationId;

  return (
    <Card style={[styles.card, { gap: theme.spacing.md }]}>
      <View style={styles.header}>
        <Text variant="caption" color="textMuted" accessibilityRole="header">
          {parsed.symbol} · Event {eventIndex + 1} of {total}
        </Text>
        {!reduceMotion ? (
          <Text
            variant="caption"
            color="textMuted"
            accessibilityLabel={`About ${secondsLeft} seconds left in the trading day`}
          >
            {secondsLeft}s
          </Text>
        ) : (
          <Text variant="caption" color="textMuted">
            ~{Math.round(perEvent)}s per headline
          </Text>
        )}
      </View>

      <Text variant="title" accessibilityLiveRegion="polite">
        {event.headline}
      </Text>

      {phase === 'interpret' ? (
        <View style={[styles.section, { gap: theme.spacing.sm }]}>
          <Text variant="body" accessibilityRole="header">
            What does this mean for {parsed.symbol}?
          </Text>
          {event.interpretations.map((interpretation) => (
            <Button
              key={interpretation.id}
              title={interpretation.text}
              variant="secondary"
              onPress={() => handleInterpret(interpretation.id)}
              accessibilityLabel={`Interpretation: ${interpretation.text}`}
            />
          ))}
        </View>
      ) : null}

      {phase === 'act' ? (
        <View style={[styles.section, { gap: theme.spacing.sm }]}>
          <Text
            variant="body"
            accessibilityLiveRegion="polite"
            accessibilityLabel={`${chosenCorrect ? 'Correct.' : 'Not quite.'} ${event.explanation}`}
          >
            {chosenCorrect ? 'Correct. ' : 'Not quite. '}
            {event.explanation}
          </Text>
          <Text variant="body" accessibilityRole="header">
            Make a practice move (just for feel)
          </Text>
          <View style={[styles.row, { gap: theme.spacing.sm }]}>
            {OPENING_BELL_ACTIONS.map((action) => (
              <Button
                key={action}
                title={ACTION_LABEL[action]}
                variant="primary"
                onPress={() => handleAction(action)}
                accessibilityLabel={
                  isLastEvent
                    ? `${ACTION_LABEL[action]} and see your result`
                    : `${ACTION_LABEL[action]} and go to the next headline`
                }
              />
            ))}
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%' },
  header: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  section: { width: '100%' },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
});
