/**
 * LockedState (requirement 7.2).
 *
 * Shown in place of a tab's content when the feature is not yet unlocked. It
 * names the lesson that unlocks the feature so the user knows exactly what to do
 * next, rather than hitting a dead end. The lesson name is passed in by the
 * caller — the unlock rules themselves live in the progression spec, so this
 * component stays presentational.
 *
 * Accessibility: a lock glyph is hidden from assistive tech (decorative); the
 * title and message carry the meaning. An optional action (e.g. "Go to Learn")
 * can be supplied.
 */
import { StyleSheet, View } from 'react-native';

import { Button } from './button';
import { Text } from './text';
import { useTheme } from '../../theme/theme-provider';

export interface LockedStateProps {
  /** Short name of what is locked, e.g. "Portfolio". */
  featureName: string;
  /** The lesson that unlocks it, e.g. "Your first trade". */
  unlockedByLesson: string;
  /** Optional CTA label. Rendered only when `onAction` is also given. */
  actionLabel?: string;
  /** Optional CTA handler, e.g. navigate to the unlocking lesson. */
  onAction?: () => void;
}

export function LockedState({
  featureName,
  unlockedByLesson,
  actionLabel,
  onAction,
}: LockedStateProps) {
  const theme = useTheme();
  const message = `Complete "${unlockedByLesson}" to unlock ${featureName}.`;

  return (
    <View style={[styles.container, { gap: theme.spacing.md }]} accessibilityRole="summary">
      <Text
        variant="title"
        style={styles.icon}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        🔒
      </Text>
      <Text variant="title" color="text" style={styles.heading}>
        {featureName} is locked
      </Text>
      <Text variant="body" color="textMuted" style={styles.message}>
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Button title={actionLabel} variant="primary" onPress={onAction} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  icon: {
    fontSize: 40,
    lineHeight: 48,
  },
  heading: {
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    maxWidth: 320,
  },
});
