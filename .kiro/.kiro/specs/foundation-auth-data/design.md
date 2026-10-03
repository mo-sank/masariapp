```
# Design Document: Foundation, Auth, and Data
```

```
## Overview
An Expo (TypeScript) app using Expo Router. Auth0 handles identity. Supabase stores data and enforces RLS using the Auth0 `sub`. All writes go through RPCs. This design implements requirements 1 to 10.
```

```
## Architecture
App (Expo Router screens) -> feature hooks -> src/lib/auth0.ts (Auth0 SDK) and src/lib/supabase.ts (Supabase client with accessToken callback) -> Supabase Postgres (RLS + RPCs). Edge Function delete-account -> Auth0 Management API.
```

```
### Startup and routing flow
1. App loads config (validated with Zod). Sentry initializes.
2. Root layout wraps: Auth0Provider -> QueryClientProvider -> ThemeProvider -> AuthGate.
3. AuthGate decides the route:
   - Under-13 device flag set -> /age-block
   - No Auth0 session -> /(auth)/age-gate (then /(auth)/welcome)
   - Session but no profile (select from profiles returns none) -> /(auth)/onboarding
   - Session and profile -> /(tabs)/learn
```

```
### Auth flow (sequence)
1. Age gate collects month+year, computes age (last day of birth month). Under 13: block. Otherwise keep month/year in memory (onboarding store).
2. Welcome screen: "Get started" / "Log in" -> auth0.authorize() (Universal Login, audience = AUTH0_AUDIENCE, scope = "openid profile email offline_access").
3. useAuth0().getCredentials() returns tokens. The Supabase client's accessToken callback calls getCredentials() each time and returns the token that carries the role claim.
4. Auth0 Post-Login Action sets role = "authenticated" so Supabase assigns the authenticated Postgres role.
5. RLS reads the user id with public.current_user_id() (auth.jwt() ->> 'sub').
```

```
**Token note:** Supabase's current Auth0 guide and Auth0's claim handling differ on whether the claim survives in the access token or only the ID token. The spike task decodes the token the app actually sends. Use whichever token contains role = "authenticated" and sub, and record the decision in tech.md.
```

```
## Components and interfaces
```

```
### src/lib/config.ts
Zod-validated env: auth0Domain, auth0ClientId, auth0Audience, supabaseUrl, supabaseAnonKey. Throws a readable error naming missing keys.
```

```
### src/lib/auth0.ts
Thin wrapper exporting: AuthProvider (Auth0Provider), useSession() -> { isLoading, isSignedIn, login(), logout(), getAccessToken() }.
```

```
### src/lib/supabase.ts
createClient(url, anonKey, { accessToken: async () => await getAccessToken() }). Exports a singleton. No other file constructs a client.
```

```
### src/features/auth
- age.ts: computeAge(month, year, now) using last day of month; isUnderMin(age). Pure + tested.
- use-age-block.ts: reads/writes the device flag (AsyncStorage key under13_blocked; contains no personal data).
- onboarding-store.ts (Zustand): birthMonth, birthYear (in memory only).
- username.ts: generateUsername(rng) from adjective/animal word lists, format ^[a-z]{3,12}-[a-z]{3,12}-[0-9]{2,4}$. Word lists reviewed for appropriateness.
- api/create-profile.ts: calls rpc('create_profile'), maps error codes to typed errors.
- screens: age-gate, age-block, welcome, onboarding (username + terms checkbox + continue).
```

```
### src/features/settings
- Screens: settings index, legal webviews (Privacy, Terms), delete-account confirm.
- api/delete-account.ts: POST to /functions/v1/delete-account with the Auth0 token.
```

```
### src/components/ui
Button, Card, Text, Screen, Sheet, StateView (loading/empty/error/offline), LockedState, Toast. All support dynamic type and accessibility labels.
```

```
### src/lib/analytics.ts
track(name, props) -> in-memory queue persisted to AsyncStorage; flush every 20 events or 30 s and on app background via rpc('log_events'). Drops events if props contain disallowed keys (email, token, text).
```

```
### Edge Function: delete-account
1. Read Authorization bearer. Verify with jose against the Auth0 JWKS (issuer, audience).
2. sub = payload.sub. Using the service-role client: delete from profiles where user_id = sub.
3. Get a Management API token (client-credentials) and DELETE /api/v2/users/{sub}.
4. Return 204. Idempotent: if the profile is already gone, still attempt the Auth0 delete.
```

```
## Data models
Tables used here: app_config, profiles, consents, paper_accounts, user_stats, events (full DDL in docs/db-and-api-reference.md sections 3.1, 3.2, 3.4, 3.6). RPCs: create_profile, log_events.
```

```
## Error handling
- Map RPC error messages to typed AppError codes (see trading-and-data-rules.md) and friendly copy.
- Network failure: show StateView offline with retry; never lose queued analytics.
- Auth failure: return to welcome with a message; never leave a spinner.
- Config failure: dev-only error screen.
```

```
## Testing strategy
- Unit: computeAge (edge cases: month boundaries, leap years), generateUsername format, error mapping, analytics queue.
- Component: age gate, onboarding, StateView, LockedState.
- Database (pgTAP): RLS isolation per table; direct writes denied; anon denied; create_profile (age under 13 rejected, idempotent, creates account + stats + consents, username validation).
- Manual device test: full signup -> onboarding -> tabs -> logout -> login -> delete account.
```