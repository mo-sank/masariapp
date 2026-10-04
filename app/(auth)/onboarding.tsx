import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Screen, Text } from '../../src/components/ui';
import { createProfile } from '../../src/features/auth/api/create-profile';
import { PRIVACY_VERSION, TERMS_VERSION } from '../../src/features/auth/consent';
import { track } from '../../src/lib/analytics';
import { submitOnboarding } from '../../src/features/auth/onboarding';
import { useOnboardingStore } from '../../src/features/auth/onboarding-store';
import { generateUsername } from '../../src/features/auth/username';
import { useAgeBlock } from '../../src/features/auth/use-age-block';
import { useLogout } from '../../src/features/auth/use-logout';
import { getDeviceTimezone } from '../../src/features/auth/timezone';
import { useSession } from '../../src/lib/auth0';
import { PROFILE_QUERY_KEY } from '../../src/features/auth/use-profile';
import { useTheme } from '../../src/theme/theme-provider';

/**
 * Onboarding (requirements 5.1-5.7).
 *
 * Shown by the AuthGate to a signed-in user with no profile. It presents a
 * generated `adjective-animal-number` username with a Shuffle button (NO
 * free-text entry, per 5.2), a Terms + Privacy acceptance checkbox, and a
 * Continue button. Continue calls `create_profile` through the pure
 * `submitOnboarding` orchestration, which:
 *   - retries once with a fresh username on `username_taken` (5.5), then shows
 *     a friendly error if it is still taken,
 *   - on `under_min_age` (5.6) blocks the device and logs the user out,
 *   - on success invalidates the profile query so the AuthGate routes to the
 *     tabs (5.1, 5.4).
 *
 * The age math and birth date come from the in-memory onboarding store set at
 * the age gate; this screen never asks for or stores a birth date itself. All
 * the branching logic lives in `src/features/auth/onboarding.ts`; this screen
 * is a thin shell over it.
 *
 * Accessibility (requirements 10.1, 10.2): built on the themed Screen/Text/Button
 * so copy scales with Dynamic Type and uses the AA-checked contrast tokens in
 * light/dark mode. The heading uses the `header` role, the username is announced
 * as readable words, the terms control exposes the `checkbox` role and checked
 * state, and the error line is an `alert`.
 */
export default function OnboardingScreen() {
  const theme = useTheme();
  const birthMonth = useOnboardingStore((s) => s.birthMonth);
  const birthYear = useOnboardingStore((s) => s.birthYear);
  const resetOnboarding = useOnboardingStore((s) => s.reset);
  const { block } = useAgeBlock();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const { isSignedIn } = useSession();

  const [username, setUsername] = useState(() => generateUsername());
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The device timezone is derived once; it does not change during onboarding.
  const timezone = useMemo(() => getDeviceTimezone(), []);

  const onShuffle = useCallback(() => {
    if (busy) {
      return;
    }
    setError(null);
    setUsername(generateUsername());
  }, [busy]);

  const onContinue = useCallback(async () => {
    if (busy) {
      return;
    }
    if (!accepted) {
      setError('Please accept the Terms and Privacy Policy to continue.');
      return;
    }
    // The age gate always sets these before routing here; guard anyway so a
    // deep link into onboarding cannot submit without a birth date.
    if (birthMonth == null || birthYear == null) {
      setError('Something went wrong. Please restart the sign-up flow.');
      return;
    }

    // Early check: if the user is not signed in, show a clear message
    if (!isSignedIn) {
      setError('Please log in again to continue.');
      setBusy(false);
      return;
    }

    setBusy(true);
    setError(null);

    const result = await submitOnboarding(
      {
        username,
        birthMonth,
        birthYear,
        timezone,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
      },
      { createProfile, generateUsername },
    );

    switch (result.kind) {
      case 'success': {
        // Requirement 9.3: log onboarding completion. Fire-and-forget; no PII in
        // props (the event name is in the shared allowlist).
        track('onboarding_completed');
        // Clear the in-memory birth date and refresh the profile query so the
        // AuthGate observes the new profile and routes to the tabs.
        resetOnboarding();
        await queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
        // The gate drives navigation; no manual replace needed. Keep busy true
        // so the button stays disabled through the transition.
        return;
      }
      case 'under_min_age': {
        // 5.6: block this device and log the user out; the gate routes to the
        // age-block screen once the session clears.
        await block();
        await logout();
        setBusy(false);
        return;
      }
      case 'username_taken': {
        // 5.5: the retry was also taken. Offer a fresh name and a friendly nudge.
        setUsername(generateUsername());
        setError('That username was just taken. We picked a new one — try again.');
        setBusy(false);
        return;
      }
      case 'error':
      default: {
        // Check if this is a not_authenticated error
        const errorMessage = result.error instanceof Error ? result.error.message : '';
        if (errorMessage.includes('not_authenticated')) {
          setError('Your session has expired. Please log in again.');
        } else {
          setError('Something went wrong creating your profile. Please try again.');
        }
        setBusy(false);
        return;
      }
    }
  }, [
    busy,
    accepted,
    birthMonth,
    birthYear,
    username,
    timezone,
    resetOnboarding,
    queryClient,
    block,
    logout,
    isSignedIn,
  ]);

  return (
    <Screen scroll center style={{ gap: theme.spacing.md }}>
      <Text variant="title" accessibilityRole="header">
        Pick your username
      </Text>
      <Text variant="body" color="textMuted">
        We generate a fun, anonymous username for you — no real names needed. Shuffle until you find
        one you like.
      </Text>

      <View style={styles.usernameRow}>
        <Text
          variant="title"
          accessibilityLabel={`Your username is ${username.replace(/-/g, ' ')}`}
          style={styles.username}
        >
          {username}
        </Text>
      </View>

      <Button
        title="Shuffle"
        variant="secondary"
        disabled={busy}
        onPress={onShuffle}
        accessibilityLabel="Shuffle username"
      />

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted, disabled: busy }}
        accessibilityLabel="I accept the Terms of Service and Privacy Policy"
        disabled={busy}
        onPress={() => {
          setError(null);
          setAccepted((v) => !v);
        }}
        style={styles.checkboxRow}
      >
        <View
          style={[
            styles.checkbox,
            { borderColor: theme.colors.primary, borderRadius: theme.radii.sm },
            accepted && { backgroundColor: theme.colors.primary },
          ]}
        >
          {accepted ? (
            <Text style={[styles.checkmark, { color: theme.colors.onPrimary }]}>✓</Text>
          ) : null}
        </View>
        <Text variant="body" style={styles.checkboxLabel}>
          I accept the Terms of Service and Privacy Policy.
        </Text>
      </Pressable>

      {error ? (
        <Text variant="body" color="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Button
        title="Continue"
        variant="primary"
        loading={busy}
        disabled={!accepted}
        onPress={onContinue}
        accessibilityLabel="Continue"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  usernameRow: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  username: {
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    // A comfortable minimum height keeps the whole row an easy tap target.
    minHeight: 44,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 15,
    fontWeight: '700',
  },
  checkboxLabel: {
    flex: 1,
  },
});
