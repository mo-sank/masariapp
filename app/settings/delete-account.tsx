import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Screen, Text } from '../../src/components/ui';
import { DeleteAccountError } from '../../src/features/settings/api/delete-account';
import { useDeleteAccount } from '../../src/features/settings/use-delete-account';
import { useTheme } from '../../src/theme/theme-provider';

/**
 * Delete-account confirmation (requirements 8.2, 8.3, 8.4).
 *
 * 8.2: this is the explicit confirmation step. It spells out that deletion is
 * permanent and lists what gets removed before the user can proceed. Reaching
 * this screen does nothing on its own — the user must tap the destructive
 * button, and can back out at any point.
 *
 * 8.3: on confirm it runs the composed delete flow (useDeleteAccount): call the
 * Edge Function, then sign out and return to the age screen.
 *
 * 8.4: if deletion fails partway (the server returns a non-2xx — e.g. the
 * Supabase row was deleted but the Auth0 Management API delete failed), we show
 * a retryable error and keep the user here. Tapping delete again retries; the
 * Edge Function is idempotent, so the retry completes the Auth0 deletion even
 * though no Supabase rows remain.
 */
export default function DeleteAccountScreen() {
  const theme = useTheme();
  const deleteAccount = useDeleteAccount();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConfirm = async () => {
    setError(null);
    setIsDeleting(true);
    try {
      await deleteAccount();
      // On success the hook signs out and navigates to the age screen; this
      // screen unmounts, so there is nothing more to do here.
    } catch (err) {
      // Surface a retryable message. Every DeleteAccountError except
      // `not_authenticated` is retryable (network blips and server-side partial
      // deletes). We keep the user on this screen so they can tap delete again.
      const message =
        err instanceof DeleteAccountError && err.code === 'not_authenticated'
          ? 'Your session expired. Please log in again before deleting your account.'
          : 'Something went wrong deleting your account. Please try again.';
      setError(message);
      setIsDeleting(false);
    }
  };

  return (
    <Screen scroll style={{ gap: theme.spacing.lg }}>
      <Text variant="title" accessibilityRole="header">
        Delete your account?
      </Text>

      <Card>
        <Text variant="body">
          This is permanent. Deleting your account immediately and permanently removes your profile,
          your paper trading account and balance, your progress and stats, and your consent records.
          This cannot be undone.
        </Text>
      </Card>

      {error ? (
        <Text variant="body" color="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <View style={{ gap: theme.spacing.md }}>
        <Button
          title="Delete my account"
          variant="danger"
          loading={isDeleting}
          onPress={onConfirm}
          accessibilityLabel="Permanently delete my account"
          accessibilityHint="Deletes your account and all your data"
        />
        <Button
          title="Cancel"
          variant="secondary"
          disabled={isDeleting}
          onPress={() => router.back()}
          accessibilityLabel="Cancel and keep my account"
        />
      </View>
    </Screen>
  );
}
