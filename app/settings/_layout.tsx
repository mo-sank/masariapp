import { Stack } from 'expo-router';

/**
 * Settings navigator (requirements 8.1, 8.2).
 *
 * A stack holding the settings index and the delete-account confirmation. The
 * index lists legal links, feedback, log out, and delete account; the
 * confirmation screen is pushed on top so the user can back out before anything
 * irreversible happens.
 */
export default function SettingsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="delete-account" options={{ title: 'Delete account' }} />
    </Stack>
  );
}
