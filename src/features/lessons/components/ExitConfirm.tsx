/**
 * Exit confirmation (requirement 3.3).
 *
 * Leaving mid-lesson should not be a one-tap accident, so when the learner tries
 * to exit the player asks them to confirm first (requirement 3.3). This is a
 * small centered dialog with a "keep going" default and a "leave" action; the
 * player decides what each does (dismiss vs. navigate away) so the dialog stays
 * presentational.
 *
 * The copy reassures the learner that progress is kept for this session
 * (requirement 3.3: reopening the same lesson resumes at the same step), so
 * leaving feels low-stakes. It renders as an absolutely-positioned overlay (the
 * same approach as the shared Toast and the feedback sheet) rather than a native
 * Modal, so it composes with the themed tree and is easy to query in tests. The
 * dialog carries an `alert` role and is marked as a modal view for screen
 * readers. Returns `null` when not visible.
 */

import { StyleSheet, View } from 'react-native';

import { Button, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';

export interface ExitConfirmProps {
  /** Whether the dialog is shown. */
  visible: boolean;
  /** Dismiss the dialog and stay in the lesson. */
  onCancel: () => void;
  /** Confirm leaving the lesson. */
  onConfirm: () => void;
}

export function ExitConfirm({ visible, onCancel, onConfirm }: ExitConfirmProps) {
  const theme = useTheme();

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.overlay}>
      <View
        accessibilityViewIsModal
        accessibilityRole="alert"
        style={[
          styles.dialog,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radii.lg,
            padding: theme.spacing.lg,
            gap: theme.spacing.md,
          },
        ]}
      >
        <Text variant="title" color="text">
          Leave this lesson?
        </Text>
        <Text variant="body" color="textMuted">
          Your place is saved — you can pick up right here if you come back.
        </Text>

        <View style={[styles.actions, { gap: theme.spacing.sm }]}>
          <Button
            title="Keep going"
            variant="primary"
            onPress={onCancel}
            accessibilityLabel="Keep going"
          />
          <Button
            title="Leave"
            variant="secondary"
            onPress={onConfirm}
            accessibilityLabel="Leave the lesson"
          />
        </View>
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
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actions: {
    width: '100%',
  },
});
