/**
 * Supabase client (requirements 3.4, 4.1).
 *
 * The single place in the app that constructs a Supabase client (see
 * structure.md "Boundaries"). Everything else imports the `supabase` singleton
 * from here.
 *
 * Auth0 is the identity provider, not Supabase Auth. Supabase's own GoTrue
 * email/password flow is unused, so this client:
 *
 * - supplies an `accessToken` callback that returns the current Auth0 **ID
 *   token** on every request. Auth0 strips non-namespaced custom claims from
 *   access tokens, so the ID token is the one that carries `role =
 *   "authenticated"` (added by an Auth0 Action) and `sub` — the JWT Supabase
 *   reads. Supabase then assigns the `authenticated` Postgres role and RLS
 *   reads the caller's Auth0 `sub` via `public.current_user_id()`.
 * - disables GoTrue session persistence, auto-refresh, and URL session
 *   detection. Those features manage Supabase's own tokens; we have none, and
 *   leaving them on would have the client try to read/write a session from
 *   storage. When `accessToken` is supplied, supabase-js ignores its internal
 *   auth state anyway, but turning these off keeps the intent explicit and
 *   avoids any storage access on React Native.
 *
 * The callback delegates to the Auth0 SDK's credentials manager (via
 * `getIdTokenSafe` in src/lib/auth0.ts), which refreshes a stale token
 * silently and restores a saved session on relaunch. When no valid credentials
 * exist it returns `null`; supabase-js then sends the request without an
 * Authorization header, so RLS returns no rows (requirement 4.4). Tokens are
 * never written to AsyncStorage or logs here.
 *
 * IMPORTANT: When a profile is being created or when a call MUST have a valid
 * Auth0 session, use `getAccessToken()` instead. That function throws when the
 * session is unavailable, allowing callers to re-authenticate or show a clear
 * error message rather than sending anonymous requests.
 */
import { createClient } from '@supabase/supabase-js';

import type { Database } from '../types/db';
import { getIdTokenSafe } from './auth0';
import { config } from './config';

/**
 * The app-wide Supabase client. Typed with the generated `Database` so table
 * and RPC calls are checked against the schema in src/types/db.ts.
 */
export const supabase = createClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
  // Send the current Auth0 ID token on every request. Returning `null`
  // (no valid credentials) makes supabase-js omit the Authorization header, so
  // the request is treated as anonymous and RLS returns nothing.
  accessToken: async () => {
    const token = await getIdTokenSafe();
    console.log('[supabase] ID token present:', token != null, token ? `(len ${token.length})` : '(anonymous request)');
    return token;
  },
  auth: {
    // We do not use Supabase Auth; Auth0 owns identity. Disable all GoTrue
    // session machinery so the client never touches storage for its own tokens.
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
