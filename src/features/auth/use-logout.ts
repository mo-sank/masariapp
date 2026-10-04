/**
 * Composed logout (requirement 3.4).
 *
 * Requirement 3.4: "WHEN the user taps 'Log out' THEN the system SHALL clear the
 * Auth0 session, the TanStack Query cache, and local stores."
 *
 * `useSession().logout()` (src/lib/auth0.ts) only clears the Auth0 web session
 * and stored credentials — that module is intentionally limited to the Auth0
 * SDK (see structure.md "Boundaries"). This hook composes the full sign-out: it
 * clears the Auth0 session, then wipes the React Query cache so no cached server
 * data from the previous user survives, and resets the in-memory onboarding
 * store. Keeping the orchestration here (not in auth0.ts) respects the module
 * boundaries while giving the UI a single `logout()` to call.
 *
 * Order: clear Auth0 first so credentials are gone before we drop local state;
 * the cache/store clears run even if that step is already signed out. The gate
 * then observes the signed-out session and routes back to the age gate.
 */
import { useCallback } from 'react';

import { useSession } from '../../lib/auth0';
import { clearQueryCache } from '../../lib/query-client';
import { useOnboardingStore } from './onboarding-store';

/**
 * Returns a `logout` function that performs the full sign-out: Auth0 session,
 * React Query cache, and local stores.
 */
export function useLogout(): () => Promise<void> {
  const { logout: clearAuth0Session } = useSession();
  const resetOnboarding = useOnboardingStore((s) => s.reset);

  return useCallback(async () => {
    try {
      await clearAuth0Session();
    } finally {
      // Always clear local state, even if clearing the Auth0 session threw, so
      // the previous user's data never lingers in the cache or stores.
      clearQueryCache();
      resetOnboarding();
    }
  }, [clearAuth0Session, resetOnboarding]);
}
