/**
 * Jest setup — global native-module mocks (runs after the test framework).
 *
 * `src/lib/analytics.ts` imports `@react-native-async-storage/async-storage` at
 * module load to persist its queue. Any suite that transitively imports the
 * analytics module (directly, or via a feature hook that logs an event — e.g.
 * the trading/watchlist mutation hooks that fire trade_placed / reflection_
 * submitted / watchlist_changed) would otherwise fail to load with
 * "NativeModule: AsyncStorage is null" under the Node test runtime.
 *
 * Registering the library's official Jest mock here (via `setupFilesAfterEnv`,
 * where `jest.mock` is available) makes AsyncStorage resolve to an in-memory
 * stub for every suite, so pure logic tests never touch native storage. Suites
 * that need to assert specific storage behaviour still override it with their
 * own `jest.mock`, which takes precedence per-file.
 */
jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
