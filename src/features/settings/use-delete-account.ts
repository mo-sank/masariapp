/**
 * Account deletion flow (requirements 8.3, 8.4).
 *
 * Composes the full delete-account sequence the confirmation screen triggers:
 *
 *   1. Call the delete-account Edge Function (src/features/settings/api), which
 *      verifies the Auth0 token, deletes the profile (cascading all the user's
 *      data) via the service role, and deletes the Auth0 user via the
 *      Management API.
 *   2. On success, sign out locally: clear the Auth0 session and credentials,
 *      wipe the React Query cache, and reset the in-memory onboarding store, so
 *      no deleted-user data lingers (same cleanup as logout, requirement 3.4).
 *   3. Return the user to the age screen (requirement 8.3). The AuthGate already
 *      routes a signed-out, unblocked user there; we also replace explicitly so
 *      the transition is immediate and the user cannot swipe back into Settings.
 *
 * On failure the thrown {@link DeleteAccountError} propagates to the caller so
 * the screen can show a retryable error. Requirement 8.4: a partial delete
 * (Supabase row gone, Auth0 delete failed) returns a non-2xx, surfaced as a
 * retryable error; calling the returned function again completes the deletion
 * idempotently. We only sign out and navigate AFTER the server confirms full
 * success, so a failed attempt leaves the user signed in to retry.
 */
import { router } from 'expo-router';
import { useCallback } from 'react';

import { useSession } from '../../lib/auth0';
import { clearQueryCache } from '../../lib/query-client';
import { useOnboardingStore } from '../auth/onboarding-store';
import { deleteAccount } from './api/delete-account';

/**
 * Returns a `deleteAccount` function that deletes the account server-side, then
 * signs out and returns to the age screen. Rejects with a
 * {@link DeleteAccountError} when the server call fails, leaving the user signed
 * in so they can retry.
 */
export function useDeleteAccount(): () => Promise<void> {
  const { logout: clearAuth0Session } = useSession();
  const resetOnboarding = useOnboardingStore((s) => s.reset);

  return useCallback(async () => {
    // Delete server-side first. If this throws, we stop here: the user stays
    // signed in and the screen surfaces a retryable error (requirement 8.4).
    await deleteAccount();

    // Full success: tear down the local session. Clear the Auth0 session/
    // credentials; even if that step throws, still drop local state so no
    // deleted-user data survives.
    try {
      await clearAuth0Session();
    } finally {
      clearQueryCache();
      resetOnboarding();
      // Return to the age screen. replace() leaves no back entry into Settings.
      router.replace('/(auth)/age-gate');
    }
  }, [clearAuth0Session, resetOnboarding]);
}
