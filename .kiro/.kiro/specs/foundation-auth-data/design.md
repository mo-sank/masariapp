# Design Document

## Overview

Foundation, Auth, and Data. An Expo (TypeScript) app using Expo Router. Auth0 handles identity. Supabase stores data and enforces RLS using the Auth0 `sub`. All writes go through RPCs. This design implements requirements 1 to 10. Targets Expo SDK 57 (React Native 0.86, React 19.2.3; minimum Node 22.13, iOS 26.4+/Xcode 26.4). Verify react-native-auth0 and Expo Router APIs against the SDK 57 docs (https://docs.expo.dev/versions/v57.0.0/) before coding rather than relying on remembered APIs.

## Architecture

App (Expo Router screens) -> feature hooks -> src/lib/auth0.ts (Auth0 SDK) and src/lib/supabase.ts (Supabase client with accessToken callback) -> Supabase Postgres (RLS + RPCs). Edge Function delete-account -> Auth0 Management API.

### Startup and routing flow

1. App loads config (validated with Zod). Sentry initializes.
2. Root layout wraps: Auth0Provider -> QueryClientProvider -> ThemeProvider -> AuthGate.
3. AuthGate decides the route:
   - Under-13 device flag set -> /age-block
   - No Auth0 session -> /(auth)/age-gate (then /(auth)/welcome)
   - Session but no profile (select from profiles returns none) -> /(auth)/onboarding
   - Session and profile -> /(tabs)/learn

### Auth flow (sequence)

1. Age gate collects month+year, computes age (last day of birth month). Under 13: block. Otherwise keep month/year in memory (onboarding store).
2. Welcome screen: "Get started" / "Log in" -> auth0.authorize() (Universal Login, audience = AUTH0_AUDIENCE, scope = "openid profile email offline_access").
3. useAuth0().getCredentials() returns tokens. The Supabase client's accessToken callback calls getCredentials() each time and returns the token that carries the role claim.
4. Auth0 Post-Login Action sets role = "authenticated" so Supabase assigns the authenticated Postgres role.
5. RLS reads the user id with public.current_user_id() (auth.jwt() ->> 'sub').

**Token note:** Supabase's current Auth0 guide and Auth0's claim handling differ on whether the claim survives in the access token or only the ID token. The spike task decodes the token the app actually sends. Use whichever token contains role = "authenticated" and sub, and record the decision in tech.md.

## Components and interfaces

### src/lib/config.ts

Zod-validated env: auth0Domain, auth0ClientId, auth0Audience, supabaseUrl, supabaseAnonKey. Throws a readable error naming missing keys.

### src/lib/auth0.ts

Thin wrapper exporting: AuthProvider (Auth0Provider), useSession() -> { isLoading, isSignedIn, login(), logout(), getAccessToken() }.

### src/lib/supabase.ts

createClient(url, anonKey, { accessToken: async () => await getAccessToken() }). Exports a singleton. No other file constructs a client.

### src/features/auth

- age.ts: computeAge(month, year, now) using last day of month; isUnderMin(age). Pure + tested.
- use-age-block.ts: reads/writes the device flag (AsyncStorage key under13_blocked; contains no personal data).
- onboarding-store.ts (Zustand): birthMonth, birthYear (in memory only).
- username.ts: generateUsername(rng) from adjective/animal word lists, format ^[a-z]{3,12}-[a-z]{3,12}-[0-9]{2,4}$. Word lists reviewed for appropriateness.
- api/create-profile.ts: calls rpc('create_profile'), maps error codes to typed errors.
- screens: age-gate, age-block, welcome, onboarding (username + terms checkbox + continue).

### src/features/settings

- Screens: settings index, legal webviews (Privacy, Terms), delete-account confirm.
- api/delete-account.ts: POST to /functions/v1/delete-account with the Auth0 token.

### src/components/ui

Button, Card, Text, Screen, Sheet, StateView (loading/empty/error/offline), LockedState, Toast. All support dynamic type and accessibility labels.

### src/lib/analytics.ts

track(name, props) -> in-memory queue persisted to AsyncStorage; flush every 20 events or 30 s and on app background via rpc('log_events'). Drops events if props contain disallowed keys (email, token, text). The canonical list of allowed event names lives in src/features/progress/analytics-events.ts (exported constant). The log_events RPC enforces the same list server-side. Foundation ships session_start and onboarding_completed; later specs append names in both places.

### Edge Function: delete-account

1. Read Authorization bearer. Verify with jose against the Auth0 JWKS (issuer, audience).
2. sub = payload.sub. Using the service-role client: delete from profiles where user_id = sub.
3. Get a Management API token (client-credentials) and DELETE /api/v2/users/{sub}.
4. Return 204 on full success. If the Auth0 Management API delete fails after the Supabase row is deleted, return a non-2xx (e.g. 502) so the client can retry. Idempotent: a retry with the profile already gone still performs the Auth0 delete and returns 204. The function acts only on the sub from the verified token and ignores any user id in the request body.

## Data models

Tables used here: app_config, profiles, consents, paper_accounts, user_stats, events (full DDL in docs/db-and-api-reference.md sections 3.1, 3.2, 3.4, 3.6). RPCs: create_profile, log_events.

## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: User isolation

For any two distinct users A and B, an authenticated session acting as A can never read B's rows in any user-owned table (profiles, consents, paper_accounts, user_stats, events). Checked in pgTAP: seed rows for userA and userB, set request.jwt.claims to A's sub via the _helpers.sql helper, and assert every user-owned table returns zero of B's rows; repeat with the subs swapped.

**Validates: Requirement 6**

### Property 2: No direct writes

For any user-owned table, a direct INSERT/UPDATE/DELETE issued by the authenticated client role is rejected; the only successful writes come through the SECURITY DEFINER RPCs. Checked in pgTAP: with authenticated claims set, assert each direct DML statement raises/returns no affected rows, while the equivalent RPC call succeeds.

**Validates: Requirement 6**

### Property 3: Anon denial

For any table, the anon role (no token / empty role claim) reads zero rows. Checked in pgTAP: clear request.jwt.claims (or set an empty role) and assert SELECT on every table returns no rows.

**Validates: Requirement 6**

### Property 4: events write-only

For any authenticated session, a SELECT against the events table returns no rows (events are append-only via the log_events RPC and never readable by clients). Checked in pgTAP: with authenticated claims set and events seeded through the RPC, assert a direct SELECT on events is denied or empty.

**Validates: Requirements 6, 9**

### Property 5: create_profile idempotency

For any sub, calling create_profile twice returns the same profile and creates no duplicate consent, paper_account, or user_stats rows. Checked in pgTAP: invoke the RPC twice with identical claims/args and assert the returned profile id is unchanged and the row counts in consents, paper_accounts, and user_stats stay at one each.

**Validates: Requirement 5**

### Property 6: Age-gate monotonicity and conservatism

For any birth month, birth year, and reference date, computeAge uses the last day of the birth month, so a user whose birthday falls anywhere within the birth month is never treated as older than their true age; any input that resolves to under 13 always classifies as blocked. Checked by a property-based unit test over randomly generated month/year/now triples, asserting the computed age is a lower bound on true age and isUnderMin is true for every under-13 case.

**Validates: Requirement 2**

### Property 7: Analytics privacy

For any event payload, track() drops or rejects it when props contain a disallowed key (email, token, free text) or when the event name is outside the allowlist in analytics-events.ts. Checked by a property-based unit test generating random payloads with and without disallowed keys and with in/out-of-allowlist names, asserting rejected payloads never reach the queue.

**Validates: Requirement 9**

### Property 8: Money non-negativity (seeded here)

For any freshly created profile, the paper account created by create_profile has cash_cents equal to app_config.starter_cash_cents and cash_cents >= 0. Checked in pgTAP: call create_profile, then assert the new paper_accounts.cash_cents matches the configured starter value and is non-negative.

**Validates: Requirement 5**

## Error handling

- Map RPC error messages to typed AppError codes (see trading-and-data-rules.md) and friendly copy.
- Network failure: show StateView offline with retry; never lose queued analytics.
- Auth failure: return to welcome with a message; never leave a spinner.
- Config failure: dev-only error screen.

## Testing strategy

- Unit: computeAge (edge cases: month boundaries, leap years), generateUsername format, error mapping, analytics queue.
- Component: age gate, onboarding, StateView, LockedState.
- Database (pgTAP): RLS isolation per table; direct writes denied; anon denied; create_profile (age under 13 rejected, idempotent, creates account + stats + consents, username validation).
- Manual device test: full signup -> onboarding -> tabs -> logout -> login -> delete account.

### Faking the Auth0 identity in pgTAP

Database tests set the JWT claims Postgres reads rather than minting a real Auth0 token. Before each assertion, set the claims so that public.current_user_id() resolves, e.g.:

select set_config('request.jwt.claims', json_build_object('sub','auth0|userA','role','authenticated')::text, true);

Switch sub to test cross-user isolation; clear the claim (or set an empty role) for the anon/no-token path. A shared helper in supabase/tests/_helpers.sql wraps this. Note: confirm the exact GUC/claim key the local Supabase stack exposes to auth.jwt() during task 4 and record it, since current_user_id() reads auth.jwt() ->> 'sub'.
