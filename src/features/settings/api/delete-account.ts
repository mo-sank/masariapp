/**
 * delete-account Edge Function client (requirements 8.3, 8.4).
 *
 * The delete-account confirmation screen calls this to permanently delete the
 * signed-in user. It POSTs to the Supabase Edge Function
 * `/functions/v1/delete-account` (docs/db-and-api-reference.md section 7) with
 * the current Auth0 access token in the `Authorization` header.
 *
 * The Edge Function (not Supabase Auth) verifies the Auth0 JWT itself with jose,
 * derives the user from the verified `sub`, deletes the profiles row via the
 * service role (which cascades across consents, paper_accounts, user_stats, and
 * events through ON DELETE CASCADE), then deletes the Auth0 user via the
 * Management API. The function acts ONLY on the `sub` from the verified token
 * and ignores any body, so this client sends no user id (requirement 8.5).
 *
 * Idempotency and retry (requirement 8.4): if the Supabase delete succeeds but
 * the Auth0 Management API delete fails, the function returns a non-2xx status.
 * We surface that as a retryable {@link DeleteAccountError}. A retry re-runs the
 * (now no-op) Supabase delete and completes the Auth0 delete, so the UI can call
 * {@link deleteAccount} again safely.
 *
 * This module never logs the token and never persists it. It reads the current
 * token straight from the Auth0 SDK via `getAccessTokenSafe`.
 */
import { getAccessTokenSafe } from '../../../lib/auth0';
import { config } from '../../../lib/config';

/** Known failure reasons callers can branch on. */
export type DeleteAccountErrorCode =
  /** No valid Auth0 session — the user must be signed in to delete. */
  | 'not_authenticated'
  /** The request never reached the server (offline, DNS, timeout). */
  | 'network'
  /** The server returned a non-2xx status (includes the retryable 8.4 case). */
  | 'server';

/**
 * A typed error from {@link deleteAccount}. `retryable` is true for failures a
 * retry can resolve: a network error, or a server error such as the partial
 * delete in requirement 8.4 where the Auth0 Management API step failed after the
 * Supabase row was removed.
 */
export class DeleteAccountError extends Error {
  readonly code: DeleteAccountErrorCode;
  readonly retryable: boolean;
  /** The HTTP status, when the failure came from a server response. */
  readonly status?: number;

  constructor(code: DeleteAccountErrorCode, retryable: boolean, status?: number) {
    super(code);
    this.name = 'DeleteAccountError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

/** Build the Edge Function URL from the configured Supabase project URL. */
export function deleteAccountUrl(supabaseUrl: string): string {
  // Trim any trailing slash so we don't produce a double slash.
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/delete-account`;
}

/**
 * Permanently delete the signed-in user's account.
 *
 * Resolves when the server confirms full deletion (a 2xx, typically 204).
 * Throws a {@link DeleteAccountError} otherwise:
 * - `not_authenticated` when there is no valid Auth0 token (not retryable),
 * - `network` when the request could not be sent (retryable),
 * - `server` for any non-2xx response (retryable — covers the 8.4 partial
 *   delete, which a retry completes idempotently).
 */
export async function deleteAccount(): Promise<void> {
  const token = await getAccessTokenSafe();
  if (!token) {
    // The confirmation screen is only reachable while signed in, but guard
    // anyway: without a token the function cannot identify the user.
    throw new DeleteAccountError('not_authenticated', false);
  }

  let response: Response;
  try {
    response = await fetch(deleteAccountUrl(config.supabaseUrl), {
      method: 'POST',
      headers: {
        // The Edge Function verifies this Auth0 JWT itself (verify_jwt = false),
        // reading the user from the token's `sub`. We send no body: the function
        // ignores any user id in it (requirement 8.5).
        Authorization: `Bearer ${token}`,
        // Supabase's gateway requires the project anon key as `apikey` to route
        // the request to the function.
        apikey: config.supabaseAnonKey,
      },
    });
  } catch {
    // fetch rejects only on a transport-level failure (offline, DNS, abort).
    // These are safe to retry once connectivity returns.
    throw new DeleteAccountError('network', true);
  }

  if (!response.ok) {
    // Any non-2xx is a server-side failure. This includes requirement 8.4's
    // partial delete (Supabase row gone, Auth0 delete failed): the function
    // returns a non-2xx so we retry, and the retry completes idempotently.
    throw new DeleteAccountError('server', true, response.status);
  }
}
