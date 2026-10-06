/**
 * is_username_available RPC wrapper.
 *
 * The onboarding username field calls this (debounced) to check whether a
 * candidate username is free before the user submits. It wraps the
 * `is_username_available` RPC (see
 * supabase/migrations/20250107000003_is_username_available_rpc.sql), which runs
 * SECURITY DEFINER and returns a plain boolean: true when the name passes the
 * server validator AND no profile holds it (case-insensitively), false
 * otherwise.
 *
 * This is advisory: `create_profile` remains authoritative and handles the race
 * where a name is claimed between this check and submit. The caller should still
 * run the client-side `validateUsername` first so malformed/profane input never
 * reaches the network.
 */
import { supabase } from '../../../lib/supabase';

/**
 * Return whether `username` is currently available (free and allowed).
 *
 * Throws if the RPC errors (e.g. network failure); the hook treats a thrown
 * error as an indeterminate result and lets the user retry on submit.
 */
export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_username_available', {
    p_username: username,
  });
  if (error) {
    throw error;
  }
  return data === true;
}
