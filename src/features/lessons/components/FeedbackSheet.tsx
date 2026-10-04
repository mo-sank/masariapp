/**
 * Feedback sheet (requirement 3.2).
 *
 * After a scored step is answered the player shows this sheet with an immediate
 * correct/incorrect verdict and a short explanation, and the learner taps
 * Continue to move on (requirement 3.2: "show immediate correct/incorrect
 * feedback with a short explanation before continuing"). It is presentational:
 * the player decides correctness and supplies the explanation; the sheet just
 * renders them and reports the Continue press.
 *
 * It renders as a bottom sheet pinned over the current step via an absolutely-
 * positioned overlay (not a native Modal) — the same overlay approach as the
 * shared Toast — so it composes with the themed tree, needs no extra dependency,
 * and is straightforward to query in tests. The verdict uses the themed
 * success/danger ink and carries an `alert` role so a screen reader announces
 * the result the moment it appears. Returns `null` when not visible.
 *
 * This sheet is the on-screen half of the answer feedback; the light haptic tap
 * (requirement 3.4) is fired by the player alongside it.
 */

import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';

export interface FeedbackSheetProps {
  /** Whether the sheet is shown. */
  visible: boolean;
  /** Whether the answer was correct — drives the headline and color. */
  correct: boolean;
  /** A short explanation of the answer (authored on the step). */
  explanation: string;
  /** Label for the advance button; defaults to "Continue". */
  continueLabel?: string;
  /** Called when the learner taps Continue to advance to the next step. */
  onContinue: () => void;
  /**
   * When false, the sheet shows a neutral "answer saved" acknowledgment with no
   * correct/incorrect verdict and no explanation — used by the Placement Quest,
   * which must not reveal which answers were right or wrong (requirement 6.3).
   * Defaults to true (the normal scored-lesson behaviour, requirement 3.2).
   */
  reveal?: boolean;
}

export function FeedbackSheet({
  visible,
  correct,
  explanation,
  continueLabel = 'Continue',
  onContinue,
  reveal = true,
}: FeedbackSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  if (!visible) {
    return null;
  }

  // No-reveal mode (placement): a neutral acknowledgment, never a verdict (6.3).
  const headline = reveal ? (correct ? 'Correct' : 'Not quite') : 'Answer saved';
  const headlineColor = reveal ? (correct ? 'primary' : 'danger') : 'text';
  // Hide the authored explanation in no-reveal mode so a wrong answer is not
  // implicitly given away by an explanation of the right one.
  const bodyText = reveal ? explanation : '';

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View
        accessibilityViewIsModal
        style={[
          styles.sheet,
          {
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: theme.radii.lg,
            borderTopRightRadius: theme.radii.lg,
            borderColor: theme.colors.border,
            paddingTop: theme.spacing.lg,
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: insets.bottom + theme.spacing.lg,
            gap: theme.spacing.md,
          },
        ]}
      >
        <Text
          variant="title"
          color={headlineColor}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          {headline}
        </Text>

        {bodyText ? (
          <Text variant="body" color="text">
            {bodyText}
          </Text>
        ) : null}

        <Button
          title={continueLabel}
          variant="primary"
          onPress={onContinue}
          accessibilityLabel={continueLabel}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
