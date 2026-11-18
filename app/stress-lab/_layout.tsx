import { Stack } from 'expo-router';

/**
 * Portfolio Stress Lab navigator.
 *
 * A stack holding the lab index (portfolio overview + scenario selection) and
 * the results dashboard pushed on top of it, so the student can back out of a
 * result to pick another scenario. Mirrors the settings stack layout.
 */
export default function StressLabLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Portfolio Stress Lab' }} />
      <Stack.Screen name="results/[simulationId]" options={{ title: 'Stress test results' }} />
      <Stack.Screen name="compare/[scenarioId]" options={{ title: 'Compare runs' }} />
    </Stack>
  );
}
