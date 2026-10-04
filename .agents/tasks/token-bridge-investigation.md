# Token-Bridge Investigation — Sign-up / create_profile failure

Read-only investigation. No code was changed.

## Summary answer (the root cause)

The sign-up failure is a **token-bridge configuration problem, not a race condition in the usual sense.** The Auth0 access token that the app sends to Supabase is **not a token Supabase can validate or read a user out of.** Two independent, compounding defects cause this:

1. **Wrong `audience`.** `EXPO_PUBLIC_AUTH0_AUDIENCE` is set to the **Auth0 Management API** (`https://dev-waorupmxxm0utwej.us.auth0.com/api/v2/`), not a "Masari API" identifier. Access tokens minted for this audience are issued for Auth0's own management surface; they are not meant to be consumed by Supabase and they do not carry the `role: authenticated` claim PostgREST needs.
2. **Supabase has no Auth0 third-party trust configured.** `supabase/config.toml` has `[auth.third_party.auth0] enabled = false`. With no third-party integration, Supabase/GoTrue cannot verify an Auth0-signed JWT, so `auth.jwt()` is empty for these requests and `public.current_user_id()` returns `null`.

With `current_user_id()` null, the `create_profile` RPC hits `if v_uid is null then raise exception 'not_authenticated'`. The onboarding screen maps that to "Something went wrong creating your profile." Meanwhile `useProfile` (the `profiles` SELECT) also returns no rows / errors because RLS sees an anonymous request, which is what bounces the user back from onboarding toward the username screen while the gate re-resolves.

The "works once then stops" behavior and the brief `PGRST125` log line are secondary symptoms layered on top of this core defect (details and ranking below).

The architecture's own documentation states the required design explicitly and the current config contradicts it:
> the access token is the one that carries `role = "authenticated"` and `sub`, so Supabase assigns the `authenticated` Postgres role and RLS reads the caller's Auth0 `sub` via `public.current_user_id()`.
> — `src/lib/supabase.ts` header comment

For that to be true, the token must be a JWT Supabase trusts AND must carry `role: authenticated`. Neither holds with the current audience + third-party config.

---

## Evidence (file / symbol citations)

### A. The token flow, end to end

1. **Login** — `useSession().login()` in `src/lib/auth0.ts` calls `authorize({ scope: LOGIN_SCOPE, audience: config.auth0Audience })`.
   - `LOGIN_SCOPE = 'openid profile email offline_access'` (`src/lib/auth0.ts`). `offline_access` is present, so a refresh token *is* requested.
   - `config.auth0Audience` resolves to `EXPO_PUBLIC_AUTH0_AUDIENCE` (`src/lib/config.ts`, `readRawEnv`).
2. **Token read for Supabase** — `src/lib/supabase.ts` builds the client with `accessToken: async () => getAccessTokenSafe()`.
3. **`getAccessTokenSafe()`** — `src/lib/auth0.ts` calls `getStandaloneClient().credentialsManager.getCredentials()` and returns `credentials?.accessToken ?? null`, swallowing any throw and returning `null`.
4. **RPC** — `src/features/auth/api/create-profile.ts` → `supabase.rpc('create_profile', {...})`. supabase-js attaches `Authorization: Bearer <accessToken>` (or omits it when the callback returns `null`).
5. **Server** — `public.create_profile` (`supabase/migrations/20250103000007_create_profile_rpc.sql`, mirrored in `docs/db-and-api-reference.md` §5.1) does `v_uid := public.current_user_id(); if v_uid is null then raise exception 'not_authenticated'`.
6. **`current_user_id()`** — `supabase/migrations/20250103000001_helpers_and_app_config.sql`: `select nullif(auth.jwt() ->> 'sub', '')`. `auth.jwt()` is only populated when Supabase's gateway/GoTrue has verified the bearer token's signature against a trusted key.

### B. The audience is the Management API (Question 3 — CONFIRMED problem)

`.env`:
```
EXPO_PUBLIC_AUTH0_AUDIENCE=https://dev-waorupmxxm0utwej.us.auth0.com/api/v2/
```
This is Auth0's **Management API v2** identifier (same host, `/api/v2/` path). Consequences:
- Tokens for this audience are issued for Auth0 to consume, not Supabase. They will not contain a `role` claim, so even if Supabase *did* trust the signature, PostgREST would not switch the request to the `authenticated` Postgres role — the request stays effectively anonymous.
- The config schema only checks the audience is a **non-empty string** (`src/lib/config.ts`, `nonEmpty('EXPO_PUBLIC_AUTH0_AUDIENCE')`). It does not validate that the audience points at the app's own API, so this wrong value passes validation silently.
- Supporting signal that `/api/v2/` is "the management audience, not the app audience": the Edge Function side reads a **separate** `AUTH0_AUDIENCE` secret for the app API and uses `AUTH0_MGMT_*` for management calls (`supabase/functions/_shared/auth0.ts`, `readAuth0Env`), and the data-flow table lists "Auth0 Management API — Called only by delete-account" (`docs/db-and-api-reference.md` §1). The client is pointed at the management audience that is supposed to be server-only.

### C. Supabase does not trust Auth0 tokens (compounding root cause)

`supabase/config.toml`:
```
[auth.third_party.auth0]
enabled = false
```
No `tenant`/`tenant_region` set. Without the third-party Auth0 integration enabled (and configured on the hosted project), Supabase has no JWKS/issuer trust for `dev-waorupmxxm0utwej.us.auth0.com`, so it cannot verify the token and `auth.jwt()` yields no `sub`. The only place the project verifies Auth0 tokens today is the `delete-account` Edge Function, which does it **manually** with `jose` against the Auth0 JWKS and runs with `verify_jwt = false` (`supabase/functions/_shared/auth0.ts` `verifyAuth0Jwt`, `supabase/config.toml` `[functions.delete-account]`). The main data path (`supabase-js` → PostgREST → RLS/RPC) has no equivalent, so it depends entirely on the (disabled) third-party trust.

Net: even a perfectly-fresh Auth0 access token produces an anonymous DB request → `current_user_id()` null → `not_authenticated`.

### D. Standalone client vs. Provider hook (Question 2 — share the store, NOT the active cause)

- The hook path (`useSession` → `useAuth0`) and the module path (`getStandaloneClient()` in `src/lib/auth0.ts`) are two separate `Auth0`/provider instances, but both are constructed with the same `domain` + `clientId` from `config`, and react-native-auth0's CredentialsManager persists to the shared native store (iOS Keychain / Android EncryptedSharedPreferences). The code comment asserts this and it is correct for the default configuration.
- Caveat worth noting but not the root cause: the standalone `new Auth0({ domain, clientId })` uses react-native-auth0's **default** credentials-manager storage. If the `Auth0Provider` were ever given custom storage, or on a fresh install before the first `getCredentials()` warms the manager, the standalone client could momentarily read nothing. But since the real failure reproduces even with a valid in-hook session, the store-sharing is not what's breaking `create_profile`. The token it fetches is simply unusable by Supabase (B + C).
- `isSignedIn` derives from the **ID token** (`user != null` from `useAuth0`), which is completely independent of whether the **access token** is a Supabase-usable JWT. This is exactly why the user looks "signed in" (hook says yes) yet the DB treats them as anonymous. This split is the trap described in the brief.

### E. "Works once then stops" (Question 4)

Ranked contributors:
1. **Idempotency masking, then token drift.** `create_profile` is idempotent (`if found then return v_profile`). But a *first* call cannot have created a row, so success-then-fail cannot be idempotency on `create_profile` alone. The more likely "worked once" surface is `useProfile`'s `profiles` SELECT and short-lived cached state: a request can intermittently appear to resolve, then subsequent calls fail once the access token is refreshed/rotated to a new (still-wrong-audience) token or expires.
2. **Access-token expiry + silent refresh.** `offline_access` yields a refresh token and `getCredentials()` can refresh silently, so refresh capability exists. But refresh returns another Management-audience token, so refreshing does not fix the authorization — it only changes *when* the anonymous behavior shows up (e.g., right after an expiry boundary), producing the intermittent "worked then stopped" feel.
3. **`PGRST125` "Invalid path specified in request URL"** (user log, message index 9). This is a PostgREST-level routing error distinct from `not_authenticated`. It indicates a request where PostgREST could not resolve the RPC path — typically a transient schema-cache / routing condition or a request shaped differently than the function signature at that moment. It appeared once in the logs and then the error reverted to the auth path. It is a **secondary, intermittent** symptom, not the primary cause; the dominant, reproducible failure is the anonymous-request `not_authenticated` path. (PostgREST error-code reference: [PostgREST Errors docs](https://docs.postgrest.org/en/v12/references/errors.html). Content was rephrased for compliance with licensing restrictions.)

### F. Why the user is kicked back to username selection mid-submit (Question 5)

In `src/features/auth/auth-gate.tsx`:
- The gate routes on `useSession().isSignedIn` and `useProfile(isSignedIn)` via `decideBranch`. `signed in + no profile -> onboarding`; `signed in + has profile -> tabs`; `no session -> auth`.
- During the long "loading" after Continue, `submitOnboarding` → `createProfile` is awaiting the RPC. Two things can re-route the user:
  1. **`useProfile` error/empty.** The `profiles` query (`src/features/auth/use-profile.ts`, `fetchMyProfile`) runs anonymously (same broken token bridge) and returns `null`/errors. `hasProfile` stays false, so the gate keeps the user on `onboarding`. On a React Query refetch/invalidation the component re-renders and the onboarding screen remounts with a freshly `generateUsername()`'d name — which to the user looks like "it threw me back to pick a username again."
  2. **`isSignedIn` flicker.** `isSignedIn = user != null`. If the Auth0 SDK briefly reports `isLoading`/`user == null` during a credential refresh, `decideBranch` returns `null` (splash) or `'auth'`, momentarily yanking the user out of onboarding; when `user` repopulates it drops them back on onboarding with a new username.
- After the re-render, the second Continue tap runs `createProfile` again, which again gets the anonymous `not_authenticated` → the switch's `error` branch sets **"Something went wrong creating your profile."** (`app/(auth)/onboarding.tsx`, `onContinue`). This exactly matches the reported sequence: long load → bounced to username → next Continue shows the generic error.

### G. Secondary note: migrations vs. live DB

The RPC and `current_user_id()` exist in `supabase/migrations/*` (verified non-empty). This investigation did not confirm whether these migrations are actually applied to the hosted project at `fmjnijwyzkzpksweemkj.supabase.co`, nor whether the Auth0 third-party provider is enabled on the **hosted** project dashboard (only the local `config.toml` was readable, and it says disabled). Both should be verified on the live project, since local `config.toml` does not configure a remote project's auth.

---

## Conclusions — root causes ranked by likelihood

1. **(Highest) Wrong Auth0 audience + Supabase not configured to trust Auth0.** The access token is minted for the Auth0 Management API and Supabase has no third-party Auth0 trust, so every DB request is anonymous and `create_profile` raises `not_authenticated`. This fully explains the reproducible failure and the mid-submit bounce. Evidence: `.env` audience, `supabase/config.toml` `[auth.third_party.auth0] enabled=false`, `current_user_id()` definition, RPC guard.
2. **(Supporting) Token expiry/refresh timing** makes it intermittent ("worked once then stopped"), because refresh keeps producing the same wrong-audience token.
3. **(Minor / transient) `PGRST125`** path/schema-cache blip observed once; not the dominant cause.
4. **(Not the cause, but a latent risk) Standalone-vs-provider credential store** — they share storage in the default config; rule it out unless custom storage is introduced.

---

## Recommended fixes (implement nothing here)

1. **Fix the audience.** Create a dedicated API in Auth0 (an "Masari API" with an identifier like `https://api.masari.app`), add Auth0 Actions/claims so the issued access token carries `role: "authenticated"` and `sub`, and set `EXPO_PUBLIC_AUTH0_AUDIENCE` to that API identifier — not `/api/v2/`. (`.env`, consumed in `src/lib/config.ts`.)
2. **Enable the Supabase Auth0 third-party integration** on the hosted project and in `supabase/config.toml` (`[auth.third_party.auth0] enabled = true` with the correct `tenant`/`tenant_region`), so Supabase verifies Auth0 JWTs and populates `auth.jwt()`. Confirm the issued token's `role` claim is `authenticated` so PostgREST assigns the right Postgres role.
3. **Harden config validation.** In `src/lib/config.ts`, reject an audience that points at `/api/v2/` (the management API) so this misconfiguration fails fast at startup instead of surfacing as a runtime "Something went wrong."
4. **Make the token-bridge failure legible.** `getAccessTokenSafe()` swallows all errors and returns `null`, turning an auth misconfig into a silent anonymous request. Consider logging a non-sensitive diagnostic (e.g., "no credentials" vs. "refresh failed") — never the token itself — so this class of problem is visible in dev. For the create-profile path specifically, prefer `getAccessToken()` (the throwing variant) as the client comment already advises, so a missing/invalid token produces a clear re-auth prompt instead of an anonymous RPC. (`src/lib/auth0.ts`, `src/features/auth/api/create-profile.ts`.)
5. **Stabilize the gate during submit.** In `src/features/auth/auth-gate.tsx` / `onboarding.tsx`, avoid remounting the username and re-routing while a `create_profile` call is in flight (e.g., gate on an explicit "submitting" state), so a transient `isSignedIn`/profile-refetch flicker does not throw the user back to username selection.
6. **Verify the DB side is live.** Confirm the migrations (incl. `current_user_id()` and `create_profile`) are applied to the hosted project and that RLS/grants match §4 of the reference doc.
7. **(Optional) Investigate `PGRST125`** separately if it recurs after the auth fix — likely a schema-cache reload or an RPC argument/signature mismatch; reload the PostgREST schema cache and confirm the deployed `create_profile` signature matches the six `p_*` args the client sends.

## What was verified vs. not

- Verified by reading code/config: the full client token flow, the audience value, `third_party.auth0 = false`, the RPC/`current_user_id` definitions, the gate's routing logic, and the onboarding error mapping.
- Not verified (needs live access): whether migrations are applied on the hosted Supabase project, the hosted project's third-party auth setting, and the actual claims inside a live Auth0 access token. These are the first things to confirm when applying the fix.
