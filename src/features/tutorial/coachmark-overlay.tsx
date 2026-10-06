/**
 * Coachmark overlay (onboarding-revamp, first-run tour).
 *
 * A themed overlay that walks the user through an ordered list of {@link
 * TutorialStep}s, spotlighting a real UI target for each and showing a tooltip
 * card with "Next" / "Skip" (and "Done" on the last step). It renders over the
 * app via a React Native `Modal` with a transparent, dimmed backdrop.
 *
 * Targets register their on-screen rectangle through {@link TutorialTargetProvider}
 * / {@link useRegisterTutorialTarget}: each spotlighted element measures itself
 * with `measureInWindow` and reports `{ x, y, width, height }` under a stable id
 * (e.g. a tab key). The overlay reads the current step's target rect to draw a
 * highlight ring around it and to decide whether the tooltip sits above or below
 * the target. When a rect is unknown (not yet measured) the tooltip simply
 * centers itself, so the tour never blocks on measurement.
 *
 * Sequencing is delegated to the pure reducer in ./steps so this component stays
 * a thin view: it dispatches `next`/`skip` and reports the final outcome through
 * `onFinish`.
 *
 * Accessibility: the tooltip heading uses the `header` role; the Next/Skip
 * controls are labelled buttons; the backdrop is marked as a modal so screen
 * readers stay within the overlay while it is open.
 */
import { useEffect, useReducer } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Button, Card, Text } from '../../components/ui';
import { useTheme } from '../../theme/theme-provider';
import {
  initTutorial,
  isLastStep,
  tutorialReducer,
  type TutorialStep,
} from './steps';
import { useTutorialTargets } from './target-registry';

export interface CoachmarkOverlayProps {
  /** Whether the overlay is visible. */
  visible: boolean;
  /** The ordered steps to walk through. */
  steps: TutorialStep[];
  /** Called once when the tour ends, with how it ended. */
  onFinish: (outcome: 'completed' | 'skipped') => void;
}

/** Vertical gap between the spotlight and the tooltip card. */
const TOOLTIP_GAP = 12;
/** Padding added around a target when drawing its highlight ring. */
const SPOTLIGHT_PAD = 6;

export function CoachmarkOverlay({ visible, steps, onFinish }: CoachmarkOverlayProps) {
  const theme = useTheme();
  const { height: screenHeight } = useWindowDimensions();
  const targets = useTutorialTargets();

  const [state, dispatch] = useReducer(tutorialReducer, steps.length, initTutorial);

  // Report the outcome exactly once, after the reducer marks the tour done.
  useEffect(() => {
    if (state.done && state.outcome) {
      onFinish(state.outcome);
    }
    // onFinish is stable from the caller; depend only on the terminal state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.done, state.outcome]);

  if (!visible || state.done || steps.length === 0) {
    return null;
  }

  const step = steps[state.index];
  const rect = targets[step.targetId];

  // Decide whether the tooltip sits below the target (default) or above it when
  // the target is in the lower half of the screen. Without a measured rect we
  // center the tooltip vertically.
  const targetBelowFold = rect ? rect.y > screenHeight / 2 : false;

  const spotlightStyle = rect
    ? {
        position: 'absolute' as const,
        left: rect.x - SPOTLIGHT_PAD,
        top: rect.y - SPOTLIGHT_PAD,
        width: rect.width + SPOTLIGHT_PAD * 2,
        height: rect.height + SPOTLIGHT_PAD * 2,
        borderRadius: theme.radii.md,
        borderWidth: 2,
        borderColor: theme.colors.primary,
      }
    : null;

  const tooltipPosition = rect
    ? targetBelowFold
      ? { bottom: screenHeight - rect.y + TOOLTIP_GAP }
      : { top: rect.y + rect.height + TOOLTIP_GAP }
    : { top: screenHeight / 2 - 80 };

  const last = isLastStep(state);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      // Android hardware back acts as "skip".
      onRequestClose={() => dispatch({ type: 'skip' })}
      accessibilityViewIsModal
    >
      {/* Dimmed backdrop. Tapping it does nothing (prevents accidental dismiss);
          the user leaves via Skip or Done. */}
      <View style={[StyleSheet.absoluteFill, styles.backdrop]} accessibilityViewIsModal>
        {spotlightStyle ? (
          <View style={spotlightStyle} pointerEvents="none" accessibilityElementsHidden />
        ) : null}

        <View style={[styles.tooltipWrap, tooltipPosition]} pointerEvents="box-none">
          <Card style={styles.tooltip}>
            <Text variant="title" accessibilityRole="header" style={styles.tooltipTitle}>
              {step.title}
            </Text>
            <Text variant="body" color="textMuted">
              {step.body}
            </Text>

            <View style={styles.progressRow}>
              <Text variant="caption" color="textMuted">
                {state.index + 1} of {state.total}
              </Text>
            </View>

            <View style={styles.actions}>
              {!last ? (
                <Pressable
                  onPress={() => dispatch({ type: 'skip' })}
                  accessibilityRole="button"
                  accessibilityLabel="Skip tutorial"
                  style={styles.skip}
                >
                  <Text variant="body" color="textMuted">
                    Skip
                  </Text>
                </Pressable>
              ) : (
                <View style={styles.skip} />
              )}

              <View style={styles.nextWrap}>
                <Button
                  title={last ? 'Done' : 'Next'}
                  variant="primary"
                  onPress={() => dispatch({ type: 'next' })}
                  accessibilityLabel={last ? 'Finish tutorial' : 'Next tip'}
                />
              </View>
            </View>
          </Card>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  tooltipWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  tooltip: {
    gap: 8,
  },
  tooltipTitle: {
    fontSize: 20,
    lineHeight: 26,
  },
  progressRow: {
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  skip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  nextWrap: {
    minWidth: 120,
  },
});
