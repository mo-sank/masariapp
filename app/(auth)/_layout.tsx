import { Stack } from 'expo-router';

// Auth flow group: age gate, welcome, onboarding. Screens added in later tasks.
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
