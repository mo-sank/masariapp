---
inclusion: always
---
# Tech Stack
 
## Client
- Expo (latest stable SDK, pinned in package.json) + React Native + TypeScript (strict). Expo Router for file-based navigation.
- Development builds via EAS Build. Expo Go is NOT supported (react-native-auth0 needs native code).
- State: TanStack Query (server state), Zustand (local/session state). Forms: react-hook-form + Zod.
- Styling: React Native StyleSheet with theme tokens in src/theme. No CSS-in-JS runtime libs.
- Animation/gestures: react-native-reanimated, react-native-gesture-handler, expo-haptics.
- Charts: react-native-svg based line charts (default react-native-gifted-charts). Daily bars only in MVP.
- Local storage: @react-native-async-storage/async-storage for the offline event/completion queue ONLY. Never store tokens or secrets there.
 
## Authentication: Auth0
- SDK: react-native-auth0 (Auth0Provider, useAuth0) with its Expo config plugin. Universal Login (browser-based).
- Auth0 tenant has: Native application, an API (audience), Database connection (email + password, email verification required). Google and Apple connections added in the hardening phase.
- An Auth0 Post-Login Action adds the claim role = "authenticated" to the token the app sends to Supabase.
- The Auth0 `sub` (e.g. auth0|abc123) is the user id everywhere. It is TEXT, not UUID.
- An age gate runs BEFORE Auth0 login is started.

### Token-bridge decision (task 7 spike)
The Supabase client sends the Auth0 **access token** (not the ID token). Decision basis:
- `login()` requests `audience = EXPO_PUBLIC_AUTH0_AUDIENCE`, so Auth0 issues a verifiable JWT access token (without an API audience the access token is opaque and unusable for RLS).
- The Post-Login Action must set the custom claims on the ACCESS token (`api.accessToken.setCustomClaim('role','authenticated')` and ensure `sub` is present). The ID token is audienced to the client app, not the Supabase API, so Supabase rejects it on audience verification even if it carries the claims.
- `public.current_user_id()` reads `auth.jwt() ->> 'sub'`, and PostgREST switches to the Postgres role named by the `role` claim; EXECUTE on `current_user_id()` is granted to `authenticated` only. So the token that both (a) decodes to `role = "authenticated"` + `sub` and (b) makes `rpc('current_user_id')` return the caller's `sub` is the access token.
- Wiring (tasks 8/9/12): `src/lib/supabase.ts` creates the client with `accessToken: async () => getAccessToken()`, where `getAccessToken()` returns `credentials.accessToken` from the Auth0 SDK (already implemented in `src/lib/auth0.ts`). No change to that wrapper is needed.
- Local GUC note (confirmed in task 4): the local stack's `auth.jwt()` reads `request.jwt.claims` (plural), which is why pgTAP identity tests set that GUC.
- The throwaway debug screen used to confirm this (`app/debug-token-bridge.tsx`) has been deleted per the spike's definition of done.
 
## Backend: Supabase
- Postgres with Row Level Security on every table. Supabase CLI for migrations and local development.
- Supabase is connected to Auth0 through its Third-Party Auth integration. The Supabase JS client is created with an accessToken callback that returns the Auth0 token. Supabase Auth (its own email/password) is NOT used; disable its sign-ups.
- RLS identity helper: public.current_user_id() returns auth.jwt() ->> 'sub'. NEVER use auth.uid() (it casts to uuid and fails for Auth0 ids).
- Business-critical logic lives in SECURITY DEFINER Postgres functions (RPCs): create_profile, complete_lesson, place_market_order, submit_reflection, watchlist_add, log_events.
- Edge Functions (Deno/TypeScript): ingest-quotes, ingest-bars, delete-account. Scheduled with pg_cron + pg_net.
- Two hosted projects: masari-dev and masari-prod. Local stack via `supabase start`.

### Auth/data wiring conventions (established in foundation-auth-data; follow in later specs)
- One Supabase client only, in `src/lib/supabase.ts`, created with `accessToken: async () => getAccessTokenSafe()`. `getAccessTokenSafe()` (src/lib/auth0.ts) returns the Auth0 access token or `null`; on `null` supabase-js omits the Authorization header so RLS returns no rows. GoTrue `persistSession`/`autoRefreshToken`/`detectSessionInUrl` are all off (Auth0 owns identity).
- RPC wrappers live in `src/features/<feature>/api/<rpc>.ts` and map the RPC's RAISEd messages to a typed error-code union (see `create-profile.ts`: `CreateProfileError` with `under_min_age | username_taken | invalid_username | not_authenticated`). Match the raw message by substring, throw a typed error for known codes, rethrow unknown errors unchanged. Never pass a user id from the client — RPCs derive it from `public.current_user_id()`.
- Logout is composed in `src/features/auth/use-logout.ts`, not in auth0.ts: clear the Auth0 session first, then `clearQueryCache()` and reset local stores in a `finally` so cached data never outlives the session (requirement 3.4). New per-user client state added by later specs must be cleared here too.
- Routing is centralized in the `AuthGate` (`src/features/auth/auth-gate.tsx`), rendered beside `<Stack />` in `app/_layout.tsx`. It holds the splash until age-block flag + session + profile resolve, then routes to one of four branches (age-block / auth / onboarding / tabs) and only redirects across branches — never within one. Provider order is fixed: `AuthProvider -> QueryClientProvider -> ThemeProvider -> ErrorBoundary -> ToastProvider -> AuthGate + Stack`.
- Edge Functions that authenticate with an **Auth0** token (not a Supabase JWT) set `verify_jwt = false` under `[functions.<name>]` in `supabase/config.toml` and verify the token themselves with jose against the Auth0 JWKS (issuer + audience), acting only on the verified `sub` and ignoring the request body. `delete-account` is the reference implementation; its shared verify/Management-API helpers live in `supabase/functions/_shared/auth0.ts`. Make such deletes idempotent (treat "already gone" as success) and return a retryable non-2xx if a later step fails after an earlier one succeeded.
- Local pgTAP note: the local stack exposes JWT claims to `auth.jwt()` via the `request.jwt.claims` (plural) GUC; identity tests set it through `supabase/tests/_helpers.sql`.
 
## Market data
- Delayed (~15 min) US stock quotes and daily bars from ONE provider behind a QuoteProvider interface (src in supabase/functions/_shared/providers). Default candidate: Massive (formerly Polygon.io) free tier; alternates Alpaca, Finnhub, Twelve Data. Verify current rate limits and display/redistribution terms before launch.
- The app NEVER calls the provider directly. Edge Functions fetch on a schedule and write to the quotes and quote_bars tables. All users read from those tables.
 
## Observability and tooling
- Crashes: Sentry (@sentry/react-native), sendDefaultPii = false, scrub emails and ids.
- Analytics: first-party events table via log_events RPC. No third-party analytics or ad SDKs.
- Tests: Jest + React Native Testing Library (unit/component), pgTAP via `supabase test db` (database), Maestro (optional end-to-end).
- CI: GitHub Actions: lint, typecheck, unit tests, content validation, database tests.
- Release: EAS Build profiles (development, preview, production), EAS Submit, EAS Update for JS and lesson-content updates.
 
## Environment variables
Client (public, EXPO_PUBLIC_ prefix): AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_AUDIENCE, SUPABASE_URL, SUPABASE_ANON_KEY (publishable key).
Server only (Edge Function secrets, never in the app): MARKET_DATA_API_KEY, AUTH0_MGMT_DOMAIN, AUTH0_MGMT_CLIENT_ID, AUTH0_MGMT_CLIENT_SECRET, CRON_SECRET. The Supabase service-role key is available to Edge Functions automatically and must never ship in the app.
 
## Conventions
- TypeScript strict; no `any` without a comment. Validate all external data with Zod at the boundary.
- Money is INTEGER CENTS (bigint in SQL, number in TS). No floating-point money. Format only at the UI edge.
- Timestamps are UTC ISO strings. Convert to the user's IANA timezone only for display and streak days.
- The server is authoritative for prices, balances, unlocks, XP, and streaks. The client displays and requests.
- Small, reviewable changes. One task per commit.
 
## Commands
- npm run start, npm run lint, npm run typecheck, npm test
- npm run validate:content (lesson JSON against the Zod schema)
- supabase start | supabase db reset | supabase test db | supabase gen types typescript --local > src/types/db.ts
- eas build --profile development --platform ios
