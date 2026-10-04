import { useState } from 'react';

import { Button, Screen, Text } from '../../src/components/ui';
import { useSession } from '../../src/lib/auth0';
import { useTheme } from '../../src/theme/theme-provider';

/**
 * Welcome screen (requirement 3.1).
 *
 * Shown after the age gate clears a 13-or-older user. "Get started" and "Log in"
 * both open Auth0 Universal Login via the session's `login()`; Auth0's own UI
 * handles the sign-up vs. sign-in distinction and email verification. On
 * success the AuthGate observes the new session and routes the user on to
 * onboarding (no profile) or the tabs (has profile), so this screen does not
 * navigate itself. On failure or cancel it surfaces a message and stays put —
 * never a dead spinner (per the design's error handling).
 *
 * Accessibility (requirements 10.1, 10.2): built from the themed UI kit so text
 * scales with Dynamic Type, colors meet the AA-checked contrast tokens, and the
 * screen follows light/dark mode. The heading uses the `header` role, both CTAs
 * are labelled buttons, and the error line is an `alert`.
 */
export default function WelcomeScreen() {
  const theme = useTheme();
  const { login } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onLogin = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login();
      // AuthGate handles routing once the session updates.
    } catch (e) {
      // User cancel or auth failure: stay on welcome with a message.
      const cancelled = e instanceof Error && /cancel/i.test(e.message);
      if (!cancelled) {
        setError('Something went wrong signing in. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll center style={{ gap: theme.spacing.md }}>
      <Text variant="title" accessibilityRole="header">
        Welcome to Masari
      </Text>
      <Text variant="body" color="textMuted">
        Learn to invest with a safe, simulated account.
      </Text>

      {error ? (
        <Text variant="body" color="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Button
        title="Get started"
        variant="primary"
        loading={busy}
        onPress={onLogin}
        accessibilityLabel="Get started"
      />
      <Button
        title="Log in"
        variant="secondary"
        disabled={busy}
        onPress={onLogin}
        accessibilityLabel="Log in"
      />
    </Screen>
  );
}
