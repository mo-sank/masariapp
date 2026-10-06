import { Stack } from 'expo-router';

/**
 * Settings navigator (requirements 8.1, 8.2).
 *
 * A stack holding the settings index, the Send feedback form, and the
 * delete-account confirmation. The index lists legal links, feedback, log out,
 * and delete account; the feedback and confirmation screens are pushed on top so
 * the user can back out before anything is sent or anything irreversible
 * happens.
 */
export default function SettingsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="feedback" options={{ title: 'Send feedback' }} />
      <Stack.Screen name="delete-account" options={{ title: 'Delete account' }} />
    </Stack>
  );
}
