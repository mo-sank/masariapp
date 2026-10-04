/**
 * Current user's profile lookup (requirements 4.1, 5.1).
 *
 * AuthGate uses this to decide, for a signed-in user, between onboarding (no
 * profile yet) and the main tabs (profile exists). The query selects the
 * caller's own `profiles` row; RLS scopes the result to the authenticated
 * user's `sub`, so no user id is passed from the client. A signed-in user with
 * no profile row yields `null` (the design's "select from profiles returns
 * none" case).
 *
 * The query is only enabled when signed in, so a signed-out app never issues an
 * anonymous request here.
 */
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';
import type { Database } from '../../types/db';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

/** React Query key for the current user's profile. */
export const PROFILE_QUERY_KEY = ['profile', 'me'] as const;

/**
 * Fetch the caller's profile row, or `null` when they have none yet.
 *
 * Uses `maybeSingle()` so "no row" resolves to `null` instead of throwing,
 * which is the normal pre-onboarding state rather than an error. Any real
 * Supabase error is thrown so React Query surfaces it to the caller.
 */
export async function fetchMyProfile(): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('age_band, avatar_key, birth_year, created_at, timezone, user_id, username')
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

export interface UseProfileResult {
  /** True while the profile is being fetched for the first time. */
  isLoading: boolean;
  /** True when the fetch failed. */
  isError: boolean;
  /** True when a profile row exists for the signed-in user. */
  hasProfile: boolean;
  /** The profile row, or null when the user has not onboarded yet. */
  profile: ProfileRow | null;
}

/**
 * Query the signed-in user's profile. Pass `enabled = isSignedIn` so the query
 * does not run while signed out.
 */
export function useProfile(enabled: boolean): UseProfileResult {
  const query = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: fetchMyProfile,
    enabled,
  });

  return {
    // While disabled (signed out) the query is idle, not loading.
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    hasProfile: query.data != null,
    profile: query.data ?? null,
  };
}
