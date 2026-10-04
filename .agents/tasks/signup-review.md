# Profile creation error and Auth0 redirect fix

The PR addresses two user-reported issues: (1) "something went wrong trying to create your profile" when picking a username during sign-up, and (2) unexpected redirection to Auth0 Universal Login. The fix was not a source code change but verification that the Supabase `create_profile` RPC exists on the remote database and that the Auth0-to-Supabase token bridge is correctly wired. The expected sign-up flow is now: age gate → welcome → Auth0 Universal Login → onboarding → tabs.

**Watch for:** The Supabase client uses `getAccessTokenSafe()` which can return `null`. When the Auth0 session is not ready or refresh fails, the client omits the Authorization header and RLS returns no rows, causing `not_authenticated` errors in RPC calls. The `create_profile` RPC requires a valid Auth0 access token to derive the user's `sub` via `public.current_user_id()`.

**Verdict**: NEEDS_CHANGES

## High-level view

The sign-up flow works as documented: unauthenticated users start at the age gate, authenticate via Auth0, then proceed to onboarding where `create_profile` is called. The RPC exists on the remote Supabase database and the token-bridge wiring is correct per tech.md decision: `src/lib/supabase.ts` supplies the Auth0 access token via an `accessToken` callback. However, the current implementation uses `getAccessTokenSafe()` which returns `null` when credentials are unavailable, causing RPC calls to be made anonymously. A profile creation fails with `not_authenticated` if the Auth0 session is not yet ready, if a silent refresh failed, or if the user logged out between opening the app and reaching onboarding.

## `<details><summary>Details</summary>`

### Token availability and profile creation failure

The root cause of "something went wrong trying to create your profile" is that `src/lib/supabase.ts` uses `getAccessTokenSafe()` in the `accessToken` callback:

```ts
accessToken: async () => {
  return getAccessTokenSafe();
},
```

`getAccessTokenSafe()` catches all errors and returns `null` when no credentials exist or a silent refresh fails. When it returns `null`, supabase-js omits the Authorization header, so Supabase treats the request as anonymous. RLS on the `profiles` table (and all user-owned tables) returns zero rows for anonymous sessions, and the `create_profile` RPC reads `public.current_user_id()` which returns `null` when `auth.jwt()` yields no claims. The RPC then raises `not_authenticated`.

This manifests as a generic error when the Auth0 session is not yet established (e.g., the user just completed Universal Login but the SDK hasn't stored credentials yet), when a silent refresh failed, or when the user logs out between opening the app and reaching onboarding. The screen shows "Something went wrong creating your profile. Please try again" without distinguishing a transient auth state from a permanent error.

### Confirmed patterns

**Confirmed**: The `create_profile` RPC exists on the remote database and is properly wired. Migrations are applied, and the function grants execute to `authenticated`. This part of the fix is correct.

**Confirmed**: The token-bridge decision (use Auth0 access token, not ID token) is correctly implemented per tech.md. The callback returns the access token via `getAccessTokenSafe()`.

**Confirmed**: The onboarding screen catches `CreateProfileError` with typed codes (`not_authenticated`, `under_min_age`, `invalid_username`, `username_taken`) and branches appropriately. The `error` case shows the generic retryable message.

**Confirmed**: `submitOnboarding` retries once with a fresh username on `username_taken`. This matches requirement 5.5.

**Confirmed**: The onboarding screen guards against missing birth month/year and shows a friendly message. However, this is unrelated to the `not_authenticated` error.

### Issues that need fixing

1. **Auth0 session race in `getAccessTokenSafe`** — confirmed. `getAccessTokenSafe()` catches errors and returns `null` when credentials are unavailable. The Supabase client's `accessToken` callback passes this `null` to supabase-js, which omits the Authorization header. The `create_profile` RPC then raises `not_authenticated`.

2. **No fallback if Auth0 session is unavailable** — confirmed. There is no mechanism to refresh the session before attempting `create_profile`. If the user completes Universal Login but the SDK hasn't stored credentials yet (race condition), the RPC fails with `not_authenticated`.

3. **Silent refresh failures propagate as anonymous requests** — likely. If the SDK's silent refresh fails (network issue, expired refresh token), `getAccessTokenSafe()` returns `null`. The RPC call proceeds anonymously and fails with `not_authenticated`. The user sees a generic error without a path to recover.

4. **Logout between auth and onboarding** — possible. If the user logs out after completing Universal Login but before reaching onboarding, `getAccessTokenSafe()` returns `null`. The RPC fails with `not_authenticated`. The screen shows a generic error without re-authenticating.

### Not tested

**Not tested**: The scenario where `getAccessTokenSafe()` returns `null` (no credentials, silent refresh failed) has not been tested. Unit tests for `createProfile` mock the Supabase client but do not test the case where the access token callback returns `null`.

**Not tested**: The onboarding screen's error handling for `not_authenticated` was not verified end-to-end. The test suite does not include a flow test that simulates an Auth0 session that is not yet ready.

**Not tested**: The race condition where a user completes Universal Login but the SDK hasn't stored credentials before reaching onboarding.

### Edge cases not handled

- **No Auth0 session on onboarding load**: If the user is routed to onboarding without a valid Auth0 session (e.g., deep link, app reload mid-flow), `getAccessTokenSafe()` returns `null` and `create_profile` raises `not_authenticated`.

- **Silent refresh fails**: If the SDK's silent refresh fails (expired refresh token, network error), `getAccessTokenSafe()` returns `null` and subsequent RPCs fail anonymously.

- **Logout between auth and onboarding**: If the user logs out after completing Universal Login but before reaching onboarding, `getAccessTokenSafe()` returns `null`.

### Recommendations

1. **Change `src/lib/supabase.ts` to use `getAccessToken()` instead of `getAccessTokenSafe()`** — `getAccessToken()` is already implemented in `useSession` and throws when credentials are unavailable. This would cause the Supabase client to throw before making an RPC call, giving the caller a chance to re-authenticate or show a clear error message. However, this requires updating `src/lib/auth0.ts` to export `getAccessToken` or exposing `useSession()`'s `getAccessToken` for module-level use.

2. **Add an Auth0 session check before attempting `create_profile`** — In `src/features/auth/onboarding.ts` or `app/(auth)/onboarding.tsx`, check `useSession().isSignedIn` before calling `submitOnboarding`. If `isSignedIn` is false, redirect to the welcome screen and prompt the user to log in again.

3. **Improve error handling in `onboarding.tsx`** — When `submitOnboarding` returns `{ kind: 'error' }`, inspect the error to see if it's `not_authenticated`. If so, redirect to the welcome screen with a message like "Your session expired. Please log in again." This gives the user a recovery path instead of a generic error.

4. **Add integration test for token unavailability** — Test the full sign-up flow with a mocked `getAccessTokenSafe()` that returns `null` to verify the error path is handled correctly.

## Issues (4)

1. **Use of `getAccessTokenSafe` causes anonymous RPC calls** — The Supabase client's `accessToken` callback uses `getAccessTokenSafe()` which returns `null` when credentials are unavailable, causing Supabase to treat the request as anonymous and the `create_profile` RPC to raise `not_authenticated`.

2. **No Auth0 session check before profile creation** — There is no mechanism to verify the Auth0 session is ready before calling `create_profile`, so the RPC can be invoked with an unavailable access token.

3. **Silent refresh failures result in generic errors** — If the SDK's silent refresh fails, `getAccessTokenSafe()` returns `null` and subsequent RPCs fail with `not_authenticated`, showing the user a generic retry message.

4. **Logout between auth and onboarding is not handled** — If the user logs out after completing Universal Login but before reaching onboarding, `getAccessTokenSafe()` returns `null` and `create_profile` fails with `not_authenticated`.

</details>

## File map

<details>
<summary>Files changed (12 files)</summary>

- `.gitignore` — Added `coverage/` and `.env.local` to ignore list.
- `.kiro/.kiro/specs/foundation-auth-data/design.md` — Reformatted from markdown code blocks to plain prose; added correctness properties section.
- `.kiro/.kiro/specs/foundation-auth-data/requirements.md` — Reformatted; added glossary and updated acceptance criteria.
- `.kiro/.kiro/specs/foundation-auth-data/tasks.md` — Reformatted; added task dependency graph.
- `.kiro/.kiro/steering/structure.md` — Minor formatting update.
- `.kiro/.kiro/steering/tech.md` — Added token-bridge decision notes (use Auth0 access token, not ID token).
- `App.tsx` — Deleted (placeholder app file replaced by Expo Router entry).
- `app.json` — Updated to add Expo config plugin for react-native-auth0 and deep link scheme.
- `index.ts` — Deleted (replaced by Expo Router entry point).
- `package.json` — Added Expo dependencies (expo-router, expo-dev-client, etc.), Auth0 SDK, Supabase JS, state management libraries; updated scripts.
- `package-lock.json` — Updated to match new `package.json` dependencies.
- `tsconfig.json` — Enabled TypeScript strict mode.

Full diff: `git diff main 2>&1`

</details>