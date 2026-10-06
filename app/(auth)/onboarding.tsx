import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Screen, Text } from '../../src/components/ui';
import { CreateProfileError, createProfile } from '../../src/features/auth/api/create-profile';
import { PRIVACY_VERSION, TERMS_VERSION } from '../../src/features/auth/consent';
import { track } from '../../src/lib/analytics';
import { submitOnboarding } from '../../src/features/auth/onboarding';
import { useOnboardingStore } from '../../src/features/auth/onboarding-store';
import { useUsernameAvailability } from '../../src/features/auth/use-username-availability';
import { useAgeBlock } from '../../src/features/auth/use-age-block';
import { useLogout } from '../../src/features/auth/use-logout';
import { getDeviceTimezone } from '../../src/features/auth/timezone';
import { useSession } from '../../src/lib/auth0';
import { PROFILE_QUERY_KEY } from '../../src/features/auth/use-profile';
import { useTheme } from '../../src/theme/theme-provider';

/**
 * Onboarding (requirements 5.1-5.7).
 *
 * Shown by the AuthGate to a signed-in user with no profile. The user now picks
 * their OWN username in a text field (no more generated name + Shuffle). As they
 * type, {@link useUsernameAvailability} validates the input on the client first
 * (format + profanity, instant) and then — after a short debounce — checks the
 * server for availability, surfacing a live status line (checking / available /
 * taken / invalid). Continue is enabled only when the name is `available` AND
 * the Terms + Privacy checkbox is accepted.
 *
 * Continue calls `create_profile` through the pure `submitOnboarding`
 * orchestration, which:
 *   - on `username_taken` surfaces a "pick another" message WITHOUT clearing the
 *     user's text (the name was claimed between the check and submit),
 *   - on `invalid_username` surfaces a format/profanity message,
 *   - on `under_min_age` blocks the device and logs the user out,
 *   - on success invalidates the profile query so the AuthGate routes to the
 *     tabs (5.1, 5.4).
 *
 * The age math and birth date come from the in-memory onboarding store set at
 * the age gate; this screen never asks for or stores a birth date itself.
 *
 * Accessibility (requirements 10.1, 10.2): built on the themed Screen/Text/Button
 * so copy scales with Dynamic Type and uses the AA-checked contrast tokens in
 * light/dark mode. The heading uses the `header` role, the field has a linked
 * label, the live status line is a `status`/`alert` region, the terms control
 * exposes the `checkbox` role and checked state, and the error line is an
 * `alert`.
 */
export default function OnboardingScreen() {
  const theme = useTheme();
  const birthMonth = useOnboardingStore((s) => s.birthMonth);
  const birthYear = useOnboardingStore((s) => s.birthYear);
  const storedUsername = useOnboardingStore((s) => s.username);
  const setStoredUsername = useOnboardingStore((s) => s.setUsername);
  const resetOnboarding = useOnboardingStore((s) => s.reset);
  const { block } = useAgeBlock();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const { isSignedIn, login } = useSession();

  // Set once the profile is created and `reset()` has cleared the store, so the
  // sync effect below does NOT write the local username back and resurrect a
  // stale value if navigation away is delayed by a frame.
  const completedRef = useRef(false);

  // Seed the field from the in-memory store so a transient remount of this
  // screen (e.g. a brief gate re-route mid-submit) preserves what the user
  // typed instead of clearing it.
  const [username, setUsername] = useState(() => storedUsername ?? '');
  useEffect(() => {
    // After a successful submit the store is intentionally cleared; do not
    // write the local username back into it.
    if (completedRef.current) {
      return;
    }
    if (username !== storedUsername) {
      setStoredUsername(username);
    }
  }, [username, storedUsername, setStoredUsername]);

  const availability = useUsernameAvailability(username);

  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLoginAgainButton, setShowLoginAgainButton] = useState(false);

  // The device timezone is derived once; it does not change during onboarding.
  const timezone = useMemo(() => getDeviceTimezone(), []);

  const handleReauthenticate = useCallback(async () => {
    setShowLoginAgainButton(false);
    setError(null);
    setBusy(true);
    try {
      await login();
      setBusy(false);
    } catch {
      setError('Could not log in again. Please try again.');
      setBusy(false);
      setShowLoginAgainButton(true);
    }
  }, [login]);

  const onContinue = useCallback(async () => {
    if (busy) {
      return;
    }
    if (availability.kind !== 'available') {
      setError('Please choose an available username.');
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

    // Early check: if the user is not signed in, show a clear message with re-auth.
    if (!isSignedIn) {
      setError('Please log in again to continue.');
      setShowLoginAgainButton(true);
      setBusy(false);
      return;
    }

    setBusy(true);
    setError(null);
    setShowLoginAgainButton(false);

    const result = await submitOnboarding(
      {
        username: username.trim(),
        birthMonth,
        birthYear,
        timezone,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
      },
      { createProfile },
    );

    switch (result.kind) {
      case 'success': {
        // Requirement 9.3: log onboarding completion. Fire-and-forget; no PII in
        // props (the event name is in the shared allowlist).
        track('onboarding_completed');
        // Mark the flow complete BEFORE resetting so the username-sync effect
        // does not rewrite the local name back into the just-cleared store.
        completedRef.current = true;
        resetOnboarding();
        await queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
        // The gate drives navigation; keep busy true so the button stays
        // disabled through the transition.
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
        // The name was claimed between the live check and submit. Keep what the
        // user typed and ask them to pick another.
        setError('That username was just taken. Please choose another.');
        setBusy(false);
        return;
      }
      case 'invalid_username': {
        setError('That username isn’t allowed. Please choose a different one.');
        setBusy(false);
        return;
      }
      case 'error': {
        const createProfileError = result.error as CreateProfileError | undefined;
        if (createProfileError?.code === 'not_authenticated') {
          setError('Your session has expired. Please log in again.');
          setShowLoginAgainButton(true);
        } else {
          setError('Something went wrong creating your profile. Please try again.');
          setShowLoginAgainButton(false);
        }
        setBusy(false);
        return;
      }
      default: {
        setError('Something went wrong creating your profile. Please try again.');
        setShowLoginAgainButton(false);
        setBusy(false);
        return;
      }
    }
  }, [
    busy,
    availability.kind,
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

  const canContinue = availability.kind === 'available' && accepted && !busy;

  const inputStyle = {
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
    color: theme.colors.text,
  };

  return (
    <Screen scroll center style={{ gap: theme.spacing.md }}>
      <Text variant="title" accessibilityRole="header">
        Pick your username
      </Text>
      <Text variant="body" color="textMuted">
        Choose a username others may see. 3–20 characters: letters, numbers,
        hyphens, and underscores.
      </Text>

      <View style={styles.field}>
        <Text variant="caption" nativeID="username-label">
          Username
        </Text>
        <TextInput
          style={[styles.input, inputStyle]}
          value={username}
          onChangeText={(text) => {
            setError(null);
            setUsername(text);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username-new"
          maxLength={20}
          placeholder="e.g. clever_otter"
          placeholderTextColor={theme.colors.textMuted}
          editable={!busy}
          accessibilityLabel="Username"
          accessibilityLabelledBy="username-label"
          returnKeyType="done"
        />
        <UsernameStatus status={availability} />
      </View>

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

      {showLoginAgainButton ? (
        <Button
          title="Log in again"
          variant="secondary"
          loading={busy}
          onPress={handleReauthenticate}
          accessibilityLabel="Log in again"
        />
      ) : null}

      <Button
        title="Continue"
        variant="primary"
        loading={busy}
        disabled={!canContinue}
        onPress={onContinue}
        accessibilityLabel="Continue"
      />
    </Screen>
  );
}

/**
 * The inline availability status line under the username field. Renders nothing
 * while idle so an empty field is quiet; otherwise it announces the current
 * state as a live region so screen readers hear "checking / available / taken /
 * reason" as the user types.
 */
function UsernameStatus({
  status,
}: {
  status: ReturnType<typeof useUsernameAvailability>;
}) {
  const theme = useTheme();

  if (status.kind === 'idle') {
    return null;
  }

  if (status.kind === 'checking') {
    return (
      <View style={styles.statusRow} accessibilityRole="progressbar">
        <ActivityIndicator size="small" color={theme.colors.textMuted} />
        <Text variant="caption" color="textMuted">
          Checking availability…
        </Text>
      </View>
    );
  }

  if (status.kind === 'available') {
    return (
      <Text variant="caption" color="primary" accessibilityLiveRegion="polite">
        ✓ Available
      </Text>
    );
  }

  // taken / invalid / error all read as a problem the user must resolve.
  const message =
    status.kind === 'taken'
      ? 'That username is taken. Try another.'
      : status.kind === 'invalid'
        ? status.reason === 'profanity'
          ? 'That username isn’t allowed. Try another.'
          : 'Use 3–20 letters, numbers, hyphens, or underscores.'
        : 'Couldn’t check that username. You can still try to continue.';

  return (
    <Text variant="caption" color="danger" accessibilityLiveRegion="polite" accessibilityRole="alert">
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  field: {
    width: '100%',
    gap: 6,
  },
  input: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
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
