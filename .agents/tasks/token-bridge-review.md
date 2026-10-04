# Auth0 → Supabase token bridge: send the ID token, drop the login audience

Sign-up failed at profile creation because the app sent Auth0's **access token** to Supabase, and that token was minted for the Auth0 Management API audience (`/api/v2/`), which Supabase cannot read. This change swaps the Supabase `accessToken` callback to return the Auth0 **ID token** (via a new `getIdTokenSafe`), which carries the `role: authenticated` custom claim and `sub` that Supabase RLS needs. It also removes the `audience` option from the login `authorize()` call so Auth0 stops minting an API-scoped access token at sign-in, adds a config refinement that rejects a Management-API audience outright, enables the Supabase third-party Auth0 block in `config.toml`, strips three debug `console.log`s from `create-profile.ts`, and adds an onboarding re-auth button plus an in-memory username hold to survive a transient gate remount mid-submit.

Watch for: removing the login `audience` changes what the Auth0 **access token** is scoped to, and the `delete-account` Edge Function still verifies that access token's `aud` against the Masari API audience — account deletion will likely start failing with a 401 (confirmed by code trace, likely regression). The onboarding changes are otherwise low-risk and do not alter routing.

**Verdict**: NEEDS_CHANGES

## High-level view

The token swap itself is correct and well-documented. Supabase consumes the ID token because Auth0 strips non-namespaced custom claims from access tokens, so only the ID token carries `role: authenticated` and `sub`. `getIdTokenSafe` mirrors `getAccessTokenSafe` precisely (reads `credentials?.idToken ?? null`, swallows errors to null for an anonymous request), and the header comments in `supabase.ts` and `auth0.ts` were updated to match.

The removal of the login `audience` is the right move for the Supabase bridge but has an unaddressed blast radius. `delete-account.ts` still sends the Auth0 **access token** to the `delete-account` Edge Function, and that function's `verifyAuth0Jwt` strictly asserts `audience: env.audience` (the Masari API audience). With no audience requested at login, the access token Auth0 issues no longer carries that `aud`, so the Edge Function should reject it. The test suite does not catch this because `delete-account.test.ts` mocks `fetch` wholesale.

The config refinement is a clean guard: `auth0Audience` stays required (the server-side Edge Function contract and `RawEnv` shape are preserved) but a `/api/v2/` value is now rejected with a specific message, anchored correctly so a legitimate audience like `https://api.masari.app` still parses. The keep-and-validate decision is explained in the commit message.

The onboarding stabilization holds the generated username in the in-memory store so a brief remount reuses the same name rather than regenerating one under the user, and adds a "Log in again" button on `not_authenticated`/signed-out paths. Routing is unchanged — the gate still drives navigation. The `error` branch was also split into a typed check (`CreateProfileError.code === 'not_authenticated'`) plus an explicit `default`, which is a real improvement over the prior string-matching on the error message.

<details>
<summary>Issues (3)</summary>

1. **delete-account access-token audience regression** — removing the login `audience` means Auth0 no longer mints an access token for the Masari API audience, but the `delete-account` Edge Function's `verifyAuth0Jwt` asserts that `aud`; account deletion will likely fail with a 401. Decide whether the delete-account access token needs its own audience (e.g. request it only for that call) or whether the Edge Function should verify the ID token instead, and add a test that exercises the audience contract.
2. **No test covers the client-token/Edge-Function audience contract** — `delete-account.test.ts` mocks `fetch`, so the token's `aud` is never asserted against what the Edge Function expects. Add coverage (unit or integration) that would catch an audience mismatch.
3. **Onboarding store rewrite after reset (minor)** — on successful submit, `resetOnboarding()` sets `username` to null while the screen is still mounted, and the mount effect immediately writes the local username back into the store. Harmless because the screen is navigating away, but the reset is effectively undone for the moment the screen lives on. Confirm this cannot leave a stale username in the store if navigation is delayed.

</details>

<details>
<summary>Details</summary>

### delete-account still rides the access token audience

```
login authorize({ scope })        ← no audience anymore
        │
        ▼
Auth0 issues access token          ← aud is NOT the Masari API audience
        │
        ├─ Supabase: uses ID token (fine)
        │
        └─ deleteAccount(): sends ACCESS token ──▶ Edge Function
                                                      verifyAuth0Jwt(token, { audience: env.audience })
                                                      └─ asserts aud === Masari API audience  ✗ mismatch → throw → 401
```

`deleteAccount()` reads the token via `getAccessTokenSafe()` and sends it as `Authorization: Bearer <accessToken>` to the `delete-account` function. `_shared/auth0.ts#verifyAuth0Jwt` calls `jwtVerify(token, jwks, { issuer, audience: env.audience })`, so a token whose `aud` is not `env.audience` fails verification and the function returns a 401. Before this change, login passed `audience: config.auth0Audience`, so the access token carried the Masari API audience and matched. After this change nothing requests that audience, so the access token's `aud` will be the default (the userinfo endpoint), and the match should fail. This is a cross-feature regression: the sign-up fix likely breaks account deletion. The fix needs an explicit decision — request the API audience just for the delete-account token, or verify the ID token in the Edge Function the same way Supabase does — and that decision belongs in this change because this change is what removes the audience.

### Test coverage for the audience contract

The passing suite (186 tests) does not protect the delete-account path against this. `delete-account.test.ts` mocks `getAccessTokenSafe` to return a literal string and mocks `fetch` to return `{ ok: true, status: 204 }`, so the token's `aud` claim is never produced or asserted anywhere. `verifyAuth0Jwt` runs only in the Deno Edge runtime and has no exercise here against a token minted without the login audience. Whatever remediation is chosen for the regression above should come with a test that would fail on an audience mismatch, otherwise the same break can recur silently.

### Config refinement

The `.refine()` regex `/\/api\/v2\/?$/` is anchored to the end and tolerates the optional trailing slash, so both `.../api/v2` and `.../api/v2/` are rejected (both covered by the new tests) while a real audience such as `https://api.masari.app` still parses — the existing `validEnv` baseline test confirms the happy path is intact. Note the inline comment claims the audience "is no longer read on the client" — that is true for the login call, but `delete-account.ts` is client code and its access token is still implicitly bound to this audience server-side, which ties back to the regression above.

### Onboarding stabilization and re-auth

The username now lives in the onboarding store (`username: string | null`, with `setUsername` and an extended `reset`). The screen seeds its local state from `storedUsername ?? generateUsername()` and an effect writes any new local value back to the store, so a transient remount of the onboarding screen reuses the same generated name instead of swapping it under the user mid-submit. The `username_taken` retry path still generates a fresh name through `setUsername`, which keeps the store in sync via the same effect. One wrinkle: on `success` the handler calls `resetOnboarding()` (which nulls the stored username) while the screen is still mounted, and the effect then rewrites the local username back into the store before navigation completes. It is harmless in the current flow because the gate immediately routes away, but it means `reset` does not actually leave the store empty while the screen lives — worth confirming no delayed-navigation path can leave a stale username behind.

The `error` branch was tightened from matching `error.message.includes('not_authenticated')` to checking the typed `CreateProfileError.code`, with a separate `default` arm added for the exhaustive switch. This is more robust than string matching. The new "Log in again" button appears on the signed-out and `not_authenticated` paths and calls `login()` with its own busy/error handling; it does not touch routing, which the gate continues to own.

### Debug logging and config.toml

The three `console.log` lines in `create-profile.ts` (args on entry, RPC error code/message, success) are removed, so the RPC path no longer logs argument values or error details. The `[auth.third_party.auth0]` block in `supabase/config.toml` is flipped to `enabled = true` with `tenant = "dev-waorupmxxm0utwej"` and `tenant_region = "us"`, which is what makes Supabase accept the Auth0 ID token server-side — the local half of the same bridge the client change implements.

</details>

<details>
<summary>File map</summary>

- `src/lib/supabase.ts` — `accessToken` callback and header comment now use `getIdTokenSafe` (ID token) instead of the access token.
- `src/lib/auth0.ts` — adds `getIdTokenSafe`; removes `audience` from the login `authorize()` call; updates stale "Masari API" audience comments.
- `src/lib/config.ts` — keeps `auth0Audience` required, adds a `.refine()` rejecting `/api/v2/` audiences with a specific message.
- `src/features/auth/api/create-profile.ts` — removes three debug `console.log` lines.
- `src/features/auth/onboarding-store.ts` — adds `username`/`setUsername`, extends `reset` to clear it.
- `app/(auth)/onboarding.tsx` — sources username from the store, adds a "Log in again" button and re-auth handler, replaces string-match error handling with a typed `CreateProfileError.code` check plus a `default` arm.
- `supabase/config.toml` — enables `[auth.third_party.auth0]` with tenant and region.
- `src/lib/supabase.test.ts`, `src/lib/auth0.test.tsx`, `src/lib/config.test.ts` — updated/added tests for the ID-token callback, no-audience login, and `/api/v2/` rejection.

Full diff: `git show fbdebce` (HEAD) at `/Users/mohamednazirsankari/Apps/masariapp`.

</details>
