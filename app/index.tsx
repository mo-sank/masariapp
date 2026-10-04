import { Screen, Text } from '../src/components/ui';
import { useTheme } from '../src/theme/theme-provider';

/**
 * Placeholder landing screen for the scaffold. The AuthGate redirects from here
 * to the age gate, onboarding, or the tabs.
 *
 * Accessibility (requirements 10.1, 10.2): themed Screen/Text so copy scales
 * with Dynamic Type and uses the AA-checked contrast tokens; the heading carries
 * the `header` role.
 */
export default function Index() {
  const theme = useTheme();
  return (
    <Screen center style={{ gap: theme.spacing.sm }}>
      <Text variant="title" accessibilityRole="header">
        Masari
      </Text>
      <Text variant="body" color="textMuted">
        App scaffold ready.
      </Text>
    </Screen>
  );
}
