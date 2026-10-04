import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Screen, Text } from '../../src/components/ui';
import { decideAgeGate } from '../../src/features/auth/age';
import { useAgeBlock } from '../../src/features/auth/use-age-block';
import { useOnboardingStore } from '../../src/features/auth/onboarding-store';
import { useTheme } from '../../src/theme/theme-provider';

/**
 * Age gate (requirements 2.1-2.4).
 *
 * The first screen an unauthenticated user sees. It asks for birth month and
 * year ONLY (never an exact date) before offering any login option. On submit it
 * computes a conservative age via the feature logic:
 *
 * - Under 13  -> set the device-local block flag and send the user to the
 *   age-block screen. No Auth0 login is started and the birth date is never
 *   stored (we do not keep it in the onboarding store on this path).
 * - 13 or older -> keep the birth month/year in memory (onboarding store) and
 *   continue toward Auth0 login via the welcome screen.
 *
 * The screen is deliberately thin: all the age math lives in
 * `src/features/auth/age.ts`, the device flag in `use-age-block.ts`, and the
 * in-memory birth date in `onboarding-store.ts`.
 *
 * Accessibility (requirements 10.1, 10.2): built on the themed Screen/Text so
 * copy scales with Dynamic Type and uses the AA-checked contrast tokens in
 * light/dark mode. Each field has a visible label linked to its input, inputs
 * carry explicit accessibility labels, and the error line uses the `alert` role.
 */

const CURRENT_YEAR = new Date().getFullYear();
// Oldest plausible birth year, generous lower bound to keep validation simple.
const MIN_YEAR = 1900;

export default function AgeGateScreen() {
  const theme = useTheme();
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { block } = useAgeBlock();
  const setBirthDate = useOnboardingStore((s) => s.setBirthDate);

  const parsed = useMemo(() => {
    const m = Number.parseInt(month, 10);
    const y = Number.parseInt(year, 10);
    const monthValid = Number.isInteger(m) && m >= 1 && m <= 12;
    const yearValid = Number.isInteger(y) && y >= MIN_YEAR && y <= CURRENT_YEAR;
    return { m, y, monthValid, yearValid, valid: monthValid && yearValid };
  }, [month, year]);

  const onContinue = async () => {
    if (!parsed.valid) {
      setError('Enter a month (1-12) and a four-digit year.');
      return;
    }
    setError(null);

    const decision = decideAgeGate(parsed.m, parsed.y);
    if (decision.kind === 'block') {
      // Block path: persist the device flag, do NOT store the birth date, do NOT
      // start login. Replace so the user cannot swipe back into the gate.
      await block();
      router.replace('/(auth)/age-block');
      return;
    }

    // Allowed path: keep month/year in memory for onboarding, then continue to
    // Auth0 login via the welcome screen.
    setBirthDate(decision.birthMonth, decision.birthYear);
    router.replace('/(auth)/welcome');
  };

  const inputStyle = {
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
    color: theme.colors.text,
  };

  return (
    <Screen scroll center style={{ gap: theme.spacing.md }}>
      <Text variant="title" accessibilityRole="header">
        How old are you?
      </Text>
      <Text variant="body" color="textMuted">
        Enter your birth month and year. We use this only to check your age and never store your
        exact birth date.
      </Text>

      <View style={styles.field}>
        <Text variant="caption" nativeID="month-label">
          Birth month (1-12)
        </Text>
        <TextInput
          style={[styles.input, inputStyle]}
          value={month}
          onChangeText={setMonth}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="MM"
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="Birth month, 1 to 12"
          accessibilityLabelledBy="month-label"
          returnKeyType="next"
        />
      </View>

      <View style={styles.field}>
        <Text variant="caption" nativeID="year-label">
          Birth year
        </Text>
        <TextInput
          style={[styles.input, inputStyle]}
          value={year}
          onChangeText={setYear}
          keyboardType="number-pad"
          maxLength={4}
          placeholder="YYYY"
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="Birth year, four digits"
          accessibilityLabelledBy="year-label"
          returnKeyType="done"
        />
      </View>

      {error ? (
        <Text variant="body" color="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Button
        title="Continue"
        variant="primary"
        onPress={onContinue}
        accessibilityLabel="Continue"
      />
    </Screen>
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
});
