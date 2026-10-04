import { router } from 'expo-router';

import { Button, Card, Screen, StateView, Text } from '../../src/components/ui';
import { useProfile } from '../../src/features/auth/use-profile';
import { useSession } from '../../src/lib/auth0';
import { useTheme } from '../../src/theme/theme-provider';

/**
 * Profile tab (requirements 7.1, 7.3, 7.4).
 *
 * Shows the signed-in user's anonymous username in a themed card and an entry
 * point to Settings (built out in a later task). While the profile loads it
 * renders the shared loading state, and surfaces an error state with retry if
 * the lookup fails — never a blank screen.
 */
export default function ProfileScreen() {
  const theme = useTheme();
  const { isSignedIn } = useSession();
  const { isLoading, isError, profile } = useProfile(isSignedIn);

  if (isLoading) {
    return (
      <Screen>
        <StateView kind="loading" />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <StateView
          kind="error"
          message="We couldn't load your profile. Please try again."
          onRetry={() => router.replace('/(tabs)/profile')}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll style={{ gap: theme.spacing.lg }}>
      <Text variant="title" accessibilityRole="header">
        Profile
      </Text>

      <Card accessible accessibilityLabel={`Username ${profile?.username ?? 'unknown'}`}>
        <Text variant="caption" color="textMuted">
          Your username
        </Text>
        <Text variant="title" style={{ marginTop: theme.spacing.xs }}>
          {profile?.username ?? '—'}
        </Text>
      </Card>

      <Button
        title="Settings"
        variant="secondary"
        onPress={() => router.push('/settings')}
        accessibilityLabel="Open settings"
      />
    </Screen>
  );
}
