import { Screen, Text } from '../../src/components/ui';
import { useTheme } from '../../src/theme/theme-provider';

/**
 * Age-block screen (requirement 2.2).
 *
 * Shown when the age gate computes an age under the minimum, or on app launch
 * when the device-local block flag is already set. It is a dead end by design:
 * there is no "continue" or "log in" action, so a blocked user cannot start
 * Auth0 login from here. The copy is friendly and non-judgmental rather than an
 * error.
 *
 * Accessibility (requirements 10.1, 10.2): themed Screen/Text so copy scales
 * with Dynamic Type and uses the AA-checked contrast tokens in light/dark mode;
 * the heading carries the `header` role.
 */
export default function AgeBlockScreen() {
  const theme = useTheme();
  return (
    <Screen scroll center style={{ gap: theme.spacing.md }}>
      <Text variant="title" accessibilityRole="header" style={{ textAlign: 'center' }}>
        Thanks for stopping by
      </Text>
      <Text variant="body" color="textMuted" style={{ textAlign: 'center' }}>
        You need to be at least 13 to use Masari. We hope to see you back here when you&apos;re a
        little older.
      </Text>
    </Screen>
  );
}
