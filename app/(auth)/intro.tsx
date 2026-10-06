import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, Text } from '../../src/components/ui';
import { track } from '../../src/lib/analytics';
import { useTheme } from '../../src/theme/theme-provider';

/**
 * Intro screen (new pre-login entry point).
 *
 * The first screen a brand-new, unauthenticated user sees. Instead of dropping
 * them straight onto the age gate, it introduces what Masari is — a safe,
 * simulated way to learn investing — and offers a single "Get started" button
 * that moves them on to the age gate. The AuthGate routes the `auth` branch
 * here first (see src/features/auth/auth-gate.tsx); the age gate then handles
 * the under-13 vs. 13+ split as before.
 *
 * It starts no login and collects no input, so it is safe to show before the
 * age check. On mount it logs a single `intro_viewed` analytics event
 * (fire-and-forget, no PII) so we can see how many people reach the top of the
 * funnel.
 *
 * Accessibility (requirements 10.1, 10.2): built on the themed Screen/Text/Button
 * so copy scales with Dynamic Type and uses the AA-checked contrast tokens in
 * light/dark mode. The heading carries the `header` role and the CTA is a
 * labelled button.
 */
export default function IntroScreen() {
  const theme = useTheme();

  useEffect(() => {
    // Top-of-funnel analytics. Fire-and-forget; the name is in the shared
    // allowlist and the event carries no props.
    track('intro_viewed');
  }, []);

  return (
    <Screen scroll center style={{ gap: theme.spacing.lg }}>
      <View style={styles.hero}>
        <Text variant="title" accessibilityRole="header" style={styles.centered}>
          Masari
        </Text>
        <Text variant="body" color="textMuted" style={styles.centered}>
          Learn how investing works by doing it — with a simulated account, not
          real money.
        </Text>
      </View>

      <View style={[styles.points, { gap: theme.spacing.md }]}>
        <Text variant="body" style={styles.centered}>
          Build real skills through short, guided lessons.
        </Text>
        <Text variant="body" style={styles.centered}>
          Practice trading stocks risk-free with virtual cash.
        </Text>
        <Text variant="body" style={styles.centered}>
          Track your progress as you go.
        </Text>
      </View>

      <Button
        title="Get started"
        variant="primary"
        onPress={() => router.replace('/(auth)/age-gate')}
        accessibilityLabel="Get started"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: 8,
  },
  points: {
    width: '100%',
    alignItems: 'center',
  },
  centered: {
    textAlign: 'center',
  },
});
