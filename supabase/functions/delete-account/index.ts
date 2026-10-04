// delete-account Edge Function (requirements 8.3, 8.4, 8.5).
//
// Triggered by the app's Settings → Delete account flow with a POST carrying the
// user's Auth0 access token on the Authorization header. Because the caller
// presents an AUTH0 token (not a Supabase JWT), Supabase's gateway cannot verify
// it — so this function is configured with verify_jwt = false (see
// supabase/config.toml) and verifies the token itself with jose against the
// Auth0 JWKS. This is the "safe fallback" called out in
// docs/db-and-api-reference.md section 7.
//
// Flow:
//   1. Verify the Auth0 token; read `sub`. The function acts ONLY on this `sub`
//      and ignores any user id in the request body (requirement 8.5).
//   2. Using the service-role client, delete the profiles row for that sub. The
//      profiles.user_id is the FK target for consents, paper_accounts,
//      user_stats, and events via ON DELETE CASCADE, so this removes all of the
//      user's data in one statement.
//   3. Delete the Auth0 user via the Management API.
//   4. Return 204 on full success. If the Auth0 delete fails after the Supabase
//      row is gone, return 502 so the client retries; the whole flow is
//      idempotent, so a retry (profile already gone, Auth0 delete repeated)
//      still returns 204 (requirement 8.4).
//
// Imports use `npm:` specifiers with pinned versions per Supabase's current
// Edge Function guidance. The handler uses the `export default { fetch }`
// contract rather than Deno.serve.
import { createClient } from 'npm:@supabase/supabase-js@^2';

import { deleteAuth0User, readAuth0Env, verifyAuth0Jwt, type Auth0Env } from '../_shared/auth0.ts';

// Allow the app (and local tooling) to call this cross-origin. We do not need to
// echo a specific origin for a token-authenticated POST, so `*` is fine; no
// cookies are involved.
const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type',
};

/** Pull the bearer token out of the Authorization header, or null. */
function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/** Build a service-role Supabase client that bypasses RLS. */
function serviceRoleClient() {
  const url = Deno.env.get('SUPABASE_URL');
  // The service-role key is injected automatically in local and hosted stacks.
  // Fall back to the newer SUPABASE_SECRET_KEYS map ("default") when present.
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? readDefaultSecretKey();
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or service-role key in the environment');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Parse SUPABASE_SECRET_KEYS (JSON map) and return the default secret, if any. */
function readDefaultSecretKey(): string | undefined {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (!raw) return undefined;
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    return map['default'];
  } catch {
    return undefined;
  }
}

/**
 * Perform the deletion for a verified `sub`. Separated from the HTTP wrapper so
 * the error-to-status mapping stays readable: a Supabase failure is a hard 500
 * (nothing was deleted yet), while an Auth0 failure after the row is gone is a
 * retryable 502.
 */
async function performDelete(sub: string, env: Auth0Env): Promise<void> {
  const supabase = serviceRoleClient();

  // Delete the profile; cascades remove consents, paper_accounts, user_stats,
  // and events. Idempotent: deleting an already-absent row affects zero rows and
  // is not an error, so a retry after a partial failure is safe.
  const { error } = await supabase.from('profiles').delete().eq('user_id', sub);
  if (error) {
    // Nothing (reliably) deleted yet — surface as a server error.
    throw new SupabaseDeleteError(error.message);
  }

  // Then remove the Auth0 user. A failure here (after the row is gone) must be a
  // retryable non-2xx; deleteAuth0User throws, which the wrapper maps to 502.
  await deleteAuth0User(sub, env);
}

/** Marks a failure in the Supabase delete step (before Auth0), mapped to 500. */
class SupabaseDeleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseDeleteError';
  }
}

export default {
  fetch: async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (req.method !== 'POST') {
      return json(405, { error: 'method_not_allowed' });
    }

    // 1. Authenticate: verify the Auth0 token and read the sub.
    const token = bearerToken(req);
    if (!token) {
      return json(401, { error: 'missing_token' });
    }

    let env: Auth0Env;
    try {
      env = readAuth0Env((k) => Deno.env.get(k));
    } catch {
      // Misconfiguration (missing secrets). Do not leak which ones.
      return json(500, { error: 'server_misconfigured' });
    }

    let sub: string;
    try {
      sub = await verifyAuth0Jwt(token, env);
    } catch {
      // Invalid/expired/forged token.
      return json(401, { error: 'invalid_token' });
    }

    // 2-3. Delete Supabase data (cascade) then the Auth0 user.
    try {
      await performDelete(sub, env);
    } catch (err) {
      if (err instanceof SupabaseDeleteError) {
        // Nothing deleted yet; a generic server error.
        return json(500, { error: 'delete_failed' });
      }
      // The Supabase row is gone but the Auth0 delete failed. Return a retryable
      // status so the client retries; the retry completes idempotently (8.4).
      return json(502, { error: 'auth0_delete_failed' });
    }

    // 4. Full success.
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  },
};

/** Build a JSON response with the shared CORS headers. */
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}
