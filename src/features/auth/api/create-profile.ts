/**
 * create_profile RPC wrapper (requirements 5.3-5.7).
 *
 * The onboarding screen calls this to create the signed-in user's profile. It
 * wraps the Supabase `create_profile` RPC (docs/db-and-api-reference.md section
 * 5.1), which runs SECURITY DEFINER and derives the user from the verified Auth0
 * `sub` — so the client never passes a user id. The RPC also seeds the two
 * consent rows, the paper account, and the user_stats row in the same
 * transaction, and is idempotent (a repeat call returns the existing profile).
 *
 * The RPC signals failures by RAISEing a bare message (e.g. `under_min_age`).
 * supabase-js surfaces that in `error.message`. We translate those known
 * messages into a small, typed union (`CreateProfileErrorCode`) so the UI can
 * branch on a stable code instead of matching raw strings, and throw a
 * `CreateProfileError` for anything we recognize. Unknown errors are rethrown
 * unchanged so they are not silently swallowed.
 */
import { supabase } from '../../../lib/supabase';
import type { Database } from '../../../types/db';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

/** Known error codes the `create_profile` RPC can raise. */
export type CreateProfileErrorCode =
  'not_authenticated' | 'under_min_age' | 'invalid_username' | 'username_taken';

/** The set of recognized codes, used to detect/parse RPC error messages. */
const KNOWN_CODES: readonly CreateProfileErrorCode[] = [
  'not_authenticated',
  'under_min_age',
  'invalid_username',
  'username_taken',
];

/** A typed error carrying one of the known `create_profile` codes. */
export class CreateProfileError extends Error {
  readonly code: CreateProfileErrorCode;

  constructor(code: CreateProfileErrorCode) {
    super(code);
    this.name = 'CreateProfileError';
    this.code = code;
  }
}

/**
 * Map a raw RPC error message to a known code, or `undefined` if unrecognized.
 *
 * Postgres prefixes RAISEd messages in some paths, so we match by substring
 * against the known codes rather than requiring an exact equality. Exported for
 * unit testing.
 */
export function mapErrorMessage(message: string | undefined): CreateProfileErrorCode | undefined {
  if (!message) {
    return undefined;
  }
  return KNOWN_CODES.find((code) => message.includes(code));
}

/** Arguments for {@link createProfile}, mirroring the RPC parameters. */
export interface CreateProfileArgs {
  username: string;
  birthYear: number;
  birthMonth: number;
  timezone: string;
  termsVersion: string;
  privacyVersion: string;
}

/**
 * Call the `create_profile` RPC and return the created (or existing) profile.
 *
 * Throws a {@link CreateProfileError} with a typed `code` for a recognized RPC
 * failure, and rethrows any other error unchanged.
 */
export async function createProfile(args: CreateProfileArgs): Promise<ProfileRow> {
  const { data, error } = await supabase.rpc('create_profile', {
    p_username: args.username,
    p_birth_year: args.birthYear,
    p_birth_month: args.birthMonth,
    p_timezone: args.timezone,
    p_terms_version: args.termsVersion,
    p_privacy_version: args.privacyVersion,
  });

  if (error) {
    const code = mapErrorMessage(error.message);
    if (code) {
      throw new CreateProfileError(code);
    }
    throw error;
  }

  // On success the RPC returns the profile row.
  return data as ProfileRow;
}
