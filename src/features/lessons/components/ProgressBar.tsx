/**
 * Lesson progress bar (requirements 3.1, 10.1).
 *
 * A thin horizontal bar at the top of the player that fills as the learner moves
 * through the steps, giving a sense of "how much is left" that makes a lesson
 * feel short and game-like (requirement 3.1). It is purely presentational: given
 * the current step and the total, it renders the filled fraction.
 *
 * The fill width animates toward its target so advancing a step glides rather
 * than jumps — unless the OS reduce-motion setting is on, in which case it snaps
 * to the new width with no animation (requirement 10.1 / 3.4 reduce-motion). The
 * caller passes `reduceMotion` (from `useReduceMotion`) so this component stays a
 * pure function of its props and is trivial to test.
 *
 * Accessibility: exposes a `progressbar` role with min/now/max so a screen
 * reader can announce completion (e.g. "step 2 of 4").
 */

import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useTheme } from '../../../theme/theme-provider';

export interface ProgressBarProps {
  /** Zero-based index of the current step. */
  stepIndex: number;
  /** Total number of steps in the lesson (must be >= 1). */
  totalSteps: number;
  /** OS reduce-motion setting; when true the fill snaps instead of animating. */
  reduceMotion: boolean;
}

export function ProgressBar({ stepIndex, totalSteps, reduceMotion }: ProgressBarProps) {
  const theme = useTheme();

  // Fraction complete, 0..1. We show progress as "steps entered" — the first
  // step reads as 1/total, the last as total/total — so the bar is never empty
  // on step one and is full on the final step. Guard against a zero total.
  const safeTotal = Math.max(1, totalSteps);
  const fraction = Math.min(1, Math.max(0, (stepIndex + 1) / safeTotal));

  // Animated.Value drives the fill width as a percentage string. A lazy useState
  // initializer keeps one stable instance across renders without reading a ref
  // during render (mirrors the shared Toast's fade value).
  const [progress] = useState(() => new Animated.Value(fraction));

  useEffect(() => {
    if (reduceMotion) {
      // Snap with no animation when the user asked for minimal motion.
      progress.setValue(fraction);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: fraction,
      duration: 250,
      // Width can't use the native driver; animate on the JS thread.
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [fraction, reduceMotion, progress]);

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View
      testID="lesson-progress"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: safeTotal, now: stepIndex + 1 }}
      style={[styles.track, { backgroundColor: theme.colors.border, borderRadius: theme.radii.sm }]}
    >
      <Animated.View
        style={[
          styles.fill,
          { width, backgroundColor: theme.colors.primary, borderRadius: theme.radii.sm },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
