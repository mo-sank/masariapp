/**
 * Manual Jest mock for `react-native-auth0`.
 *
 * The real SDK calls `TurboModuleRegistry.getEnforcing('A0Auth0')` at import
 * time, which throws under Jest because the native module is not registered in
 * the test runtime. Any module that transitively imports `src/lib/auth0`
 * (e.g. the Supabase client, and through it the trading/explore data hooks and
 * the real GuidedTradeStep) would otherwise fail to load.
 *
 * Jest uses this file automatically for the `react-native-auth0` package
 * because it lives in a root-level `__mocks__` directory adjacent to
 * `node_modules`. It mirrors the small surface `src/lib/auth0.ts` consumes:
 *  - default export `Auth0` (a class with a `credentialsManager`),
 *  - `Auth0Provider` (passes children straight through),
 *  - `useAuth0` (an inert hook).
 *
 * Suites that need specific session behaviour mock `src/lib/auth0` directly;
 * this only keeps the native import from exploding for suites that don't.
 */
const React = require('react');

class Auth0 {
  constructor() {
    this.credentialsManager = {
      getCredentials: jest.fn(async () => null),
      clearCredentials: jest.fn(async () => undefined),
    };
  }
}

function Auth0Provider({ children }) {
  return children;
}

function useAuth0() {
  return {
    user: null,
    isLoading: false,
    authorize: jest.fn(async () => undefined),
    clearSession: jest.fn(async () => undefined),
    clearCredentials: jest.fn(async () => undefined),
    getCredentials: jest.fn(async () => null),
  };
}

module.exports = {
  __esModule: true,
  default: Auth0,
  Auth0Provider,
  useAuth0,
};
