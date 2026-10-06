/**
 * Onboarding submit orchestration (requirements 5.3-5.7).
 *
 * This is the pure, testable core behind the onboarding screen's "Continue"
 * button. It takes the user's CHOSEN username, their in-memory birth
 * month/year, the consent versions, and the create_profile call, and applies
 * the required flow:
 *
 *   - username_taken: the user picked a name that was claimed between the live
 *     availability check and submit. We report `username_taken` so the screen
 *     can ask them to pick another — WITHOUT changing the text they typed.
 *     (Historically this auto-generated a new name and retried once; that only
 *     made sense for machine-generated usernames. Now the user owns the name,
 *     so we never silently swap it.)
 *   - 5.6 under_min_age: report that the user must be blocked and logged out.
 *     (The screen performs the device block + logout; this function only
 *     classifies the outcome so it stays free of side effects.)
 *   - 5.7 idempotency is handled server-side; a repeat call just returns the
 *     existing profile, which we treat as success.
 *
 * Any other failure (not_authenticated, invalid_username, or an unexpected
 * error) is reported as a generic error the screen shows as retryable copy.
 *
 * Keeping this logic pure (dependencies injected) lets the screen stay a thin
 * shell and lets the branching be unit tested without a device, a client, or
 * React.
 */
import { CreateProfileError, type CreateProfileArgs } from './api/create-profile';
import type { Database } from '../../types/db';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

/** Inputs the screen already has when the user taps Continue. */
export interface OnboardingSubmitInput {
  /** The username currently shown (generated, never free-typed). */
  username: string;
  birthMonth: number;
  birthYear: number;
  timezone: string;
  termsVersion: string;
  privacyVersion: string;
}

/** Collaborators injected so the orchestration stays pure and testable. */
export interface OnboardingSubmitDeps {
  /** Create the profile; throws CreateProfileError for known RPC failures. */
  createProfile: (args: CreateProfileArgs) => Promise<ProfileRow>;
}

/** The classified outcome of a submit attempt. */
export type OnboardingSubmitResult =
  | { kind: 'success'; profile: ProfileRow }
  /** The user is under the minimum age: screen must block + log out (5.6). */
  | { kind: 'under_min_age' }
  /** The chosen username was claimed; screen asks the user to pick another. */
  | { kind: 'username_taken' }
  /** The chosen username was rejected by the server validator (format/profanity). */
  | { kind: 'invalid_username' }
  /** Any other failure; show retryable error copy. */
  | { kind: 'error'; error: unknown };

/** Build the RPC args for a given username and the shared onboarding input. */
function toArgs(username: string, input: OnboardingSubmitInput): CreateProfileArgs {
  return {
    username,
    birthYear: input.birthYear,
    birthMonth: input.birthMonth,
    timezone: input.timezone,
    termsVersion: input.termsVersion,
    privacyVersion: input.privacyVersion,
  };
}

/**
 * Attempt to create the profile with the user's chosen username. Never throws:
 * every path resolves to a classified result the screen can switch on. The user
 * picked the name (and the screen already gated Continue on a live "available"
 * check), so we do NOT swap it on a clash — we report `username_taken` and let
 * them choose a different one.
 */
export async function submitOnboarding(
  input: OnboardingSubmitInput,
  deps: OnboardingSubmitDeps,
): Promise<OnboardingSubmitResult> {
  try {
    const profile = await deps.createProfile(toArgs(input.username, input));
    return { kind: 'success', profile };
  } catch (err) {
    if (err instanceof CreateProfileError) {
      if (err.code === 'under_min_age') {
        return { kind: 'under_min_age' };
      }
      if (err.code === 'username_taken') {
        // The name was claimed between the availability check and submit. Keep
        // the user's text and ask them to pick another.
        return { kind: 'username_taken' };
      }
      if (err.code === 'invalid_username') {
        // The server validator rejected the name (format or blocklist). The
        // client should have caught this, but surface it distinctly just in case.
        return { kind: 'invalid_username' };
      }
    }
    // not_authenticated or any non-typed error.
    return { kind: 'error', error: err };
  }
}
