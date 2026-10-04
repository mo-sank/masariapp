/**
 * Onboarding submit orchestration (requirements 5.3-5.7).
 *
 * This is the pure, testable core behind the onboarding screen's "Continue"
 * button. It takes the user's chosen (generated) username, their in-memory
 * birth month/year, the consent versions, and the create_profile call, and
 * applies the required flow:
 *
 *   - 5.5 username_taken: generate a NEW username and retry ONCE. If the retry
 *     also comes back username_taken, give up and report a friendly error.
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
 * shell and lets the retry/branching be unit tested without a device, a client,
 * or React.
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
  /** Produce a fresh username for the retry after username_taken. */
  generateUsername: () => string;
}

/** The classified outcome of a submit attempt. */
export type OnboardingSubmitResult =
  | { kind: 'success'; profile: ProfileRow }
  /** The user is under the minimum age: screen must block + log out (5.6). */
  | { kind: 'under_min_age' }
  /** Both the original and the retried username were taken (5.5). */
  | { kind: 'username_taken' }
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
 * Attempt to create the profile, applying the required retry-once-on-taken and
 * under-age handling. Never throws: every path resolves to a classified result
 * the screen can switch on.
 */
export async function submitOnboarding(
  input: OnboardingSubmitInput,
  deps: OnboardingSubmitDeps,
): Promise<OnboardingSubmitResult> {
  try {
    const profile = await deps.createProfile(toArgs(input.username, input));
    return { kind: 'success', profile };
  } catch (first) {
    if (first instanceof CreateProfileError) {
      if (first.code === 'under_min_age') {
        return { kind: 'under_min_age' };
      }
      if (first.code === 'username_taken') {
        // 5.5: generate a new username and retry exactly once.
        const retryUsername = deps.generateUsername();
        try {
          const profile = await deps.createProfile(toArgs(retryUsername, input));
          return { kind: 'success', profile };
        } catch (second) {
          if (second instanceof CreateProfileError && second.code === 'username_taken') {
            return { kind: 'username_taken' };
          }
          if (second instanceof CreateProfileError && second.code === 'under_min_age') {
            return { kind: 'under_min_age' };
          }
          return { kind: 'error', error: second };
        }
      }
    }
    // not_authenticated, invalid_username, or any non-typed error.
    return { kind: 'error', error: first };
  }
}
