/**
 * Cards step — swipeable micro-cards (requirements 4.1, 4.8).
 *
 * Presents the step's micro-cards one at a time. The learner moves through them
 * by swiping left (built on React Native's core {@link Animated} +
 * {@link PanResponder}, so no gesture/animation dependency is added) or by
 * tapping the Next button, which doubles as the accessible, no-gesture path
 * (requirement 4.8). Cards are never scored, so when the learner advances past
 * the last card the step calls `onContinue` — it never calls `onAnswer`.
 *
 * Reduce-motion (requirement 10.1 / 10.3): when the OS "reduce motion" setting
 * is on, advancing snaps to the next card instead of sliding it in.
 *
 * Purity (requirement 4.8): props in, `onContinue` out. No network, no scoring,
 * no haptics — the player owns feedback and progression between steps.
 *
 * Accessibility (requirement 4.8): the card body is readable text with the
 * title as a header; a labelled Next/Continue button advances without requiring
 * a swipe gesture, and a caption announces "Card N of M" so position is clear.
 */

import { useCallback, useMemo, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

import type { StepComponentProps } from './types';
import { Button, Card, Text } from '../../../../components/ui';
import { useReduceMotion } from '../../../../theme/use-reduce-motion';
import { useTheme } from '../../../../theme/theme-provider';
import type { CardsStep as CardsStepType } from '../../schema';

// How far a horizontal drag must travel (left) to count as a swipe to the next
// card, how far the incoming card starts off-screen, and the animation
// durations for the slide-in and the snap-back.
const SWIPE_THRESHOLD = 80;
const SLIDE_IN_FROM = 300;
const SLIDE_IN_MS = 180;
const RESET_MS = 150;

export function CardsStep({ step, onContinue }: StepComponentProps<CardsStepType>) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();

  const [index, setIndex] = useState(0);
  const total = step.cards.length;
  const isLast = index >= total - 1;
  const card = step.cards[index];

  // Horizontal offset of the current card while dragging / animating out. A
  // single stable Animated.Value for the life of the component (useMemo rather
  // than a ref so it is never read during render in a way the hooks rules flag).
  const translateX = useMemo(() => new Animated.Value(0), []);

  // Advance to the next card, or finish the step on the last card. On advancing,
  // the incoming card slides in from the right as a visual flourish (skipped
  // under reduce-motion). Progression flips state immediately and is never gated
  // on an animation callback, so it is deterministic and identical with
  // reduce-motion on.
  const advance = useCallback(() => {
    if (isLast) {
      onContinue();
      return;
    }
    setIndex((i) => i + 1);
    if (reduceMotion) {
      translateX.setValue(0);
    } else {
      // Start the new card off to the right, then settle it to center.
      translateX.setValue(SLIDE_IN_FROM);
      Animated.timing(translateX, {
        toValue: 0,
        duration: SLIDE_IN_MS,
        useNativeDriver: true,
      }).start();
    }
  }, [isLast, onContinue, reduceMotion, translateX]);

  // Spring the card back to center when a drag didn't cross the threshold.
  const resetPosition = useCallback(() => {
    Animated.timing(translateX, {
      toValue: 0,
      duration: RESET_MS,
      useNativeDriver: true,
    }).start();
  }, [translateX]);

  // Drag handling: follow the finger horizontally; on release, either swipe out
  // (past the threshold, to the left) or snap back. Only claims horizontal drags
  // so vertical scrolling in the player is unaffected. Rebuilt when the advance
  // handlers change so a swipe always sees the current card index.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, gesture) =>
          Math.abs(gesture.dx) > Math.abs(gesture.dy) && Math.abs(gesture.dx) > 10,
        onPanResponderMove: (_e, gesture) => {
          // Only track leftward movement toward "next"; ignore rightward pull.
          translateX.setValue(Math.min(0, gesture.dx));
        },
        onPanResponderRelease: (_e, gesture) => {
          // A left swipe past the threshold advances; otherwise snap back.
          if (gesture.dx <= -SWIPE_THRESHOLD) {
            advance();
          } else {
            resetPosition();
          }
        },
        onPanResponderTerminate: () => resetPosition(),
      }),
    [translateX, advance, resetPosition],
  );

  return (
    <View style={[styles.wrapper, { gap: theme.spacing.md }]}>
      <Text variant="caption" color="textMuted" accessibilityLabel={`Card ${index + 1} of ${total}`}>
        {`Card ${index + 1} of ${total}`}
      </Text>

      <Animated.View
        // Remount per card index so a new card animates in from center and its
        // content is re-announced to assistive tech.
        key={index}
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        <Card style={[styles.card, { gap: theme.spacing.sm }]}>
          {card.emoji ? (
            <Text variant="title" accessibilityElementsHidden importantForAccessibility="no">
              {card.emoji}
            </Text>
          ) : null}
          {card.title ? (
            <Text variant="title" accessibilityRole="header">
              {card.title}
            </Text>
          ) : null}
          <Text variant="body">{card.body}</Text>
        </Card>
      </Animated.View>

      <Button
        title={isLast ? 'Continue' : 'Next'}
        variant="primary"
        onPress={advance}
        accessibilityLabel={isLast ? 'Continue to the next step' : 'Next card'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: '100%' },
  card: { width: '100%' },
});
