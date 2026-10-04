# Fix: Improve Auth0 session handling in onboarding

This commit addresses the "something went wrong trying to create your profile" error by implementing two key changes: (1) a new `getAccessToken()` function that throws when credentials are unavailable instead of silently returning `null`, and (2) an `isSignedIn` check in the onboarding screen before attempting profile creation. The Auth0 Universal Login redirect is expected behavior—the app correctly routes unauthenticated users through the welcome screen to Auth0, then back to onboarding.

**Watch for:** The new `getAccessToken()` function in `src/lib/auth0.ts` throws when credentials are unavailable, which callers must handle. If callers don't catch the error or don't show a recovery path, users could see unhandled exceptions or confusing errors. The `isSignedIn` check in `onboarding.tsx` shows "Please log in again to continue." when the session is missing, but this doesn't re-authenticate the user—after they tap "log in again," the screen must handle the return from Auth0 correctly.

**Verdict**: NEEDS_CHANGES

## High-level view

The fix introduces `getAccessToken()` in `src/lib/auth0.ts` that throws when the Auth0 access token is unavailable instead of returning `null`. This allows callers to detect a missing session and show a clear error message. The onboarding screen now checks `isSignedIn` before calling `submitOnboarding()` and improves error handling to detect `not_authenticated` errors and show "Your session has expired. Please log in again." However, the screen only shows these messages—it doesn't re-authenticate the user, so after tapping "log in again," the user may end up at the same screen without a valid session. Additionally, the `getAccessToken()` in `useSession` and the standalone module-level `getAccessToken()` are redundant—they call the same underlying SDK method but the module-level one is used by `supabase.ts` while `useSession`'s version is used elsewhere, creating a split API surface.

## Issues (3)

1. **Duplicate `getAccessToken()` implementations** — There are two `getAccessToken()` functions: one in `useSession` hook and one module-level standalone function. They both call the same underlying SDK method, creating redundancy. Code should use one canonical way to get the access token.

2. **No re-authentication flow after `not_authenticated` error** — The onboarding screen detects `not_authenticated` errors and shows "Your session has expired. Please log in again.", but tapping a recovery action isn't implemented. The user has no way to re-authenticate from the error state.

3. **Race condition between Universal Login and onboarding** — After completing Auth0 Universal Login, the `isSignedIn` check and `getAccessToken()` may still fail if the SDK hasn't stored credentials yet. The fix doesn't address this timing issue.

## `<details><summary>Details</summary>`

### New `getAccessToken()` function

The standalone `getAccessToken()` function in `src/lib/auth0.ts` is a new addition:

```ts
export async function getAccessToken(): Promise<string> {
  const credentials = await getStandaloneClient().credentialsManager.getCredentials();
  if (!credentials?.accessToken) {
    throw new Error('No Auth0 access token available');
  }
  return credentials.accessToken;
}
```

It reads credentials from the SDK's native Credentials Manager (iOS Keychain / Android EncryptedCredentials) and throws if no access token exists. This is the expected behavior for callers that need a valid session and want to surface the lack of credentials explicitly.

The existing `getAccessTokenSafe()` function remains unchanged and is still used by `src/lib/supabase.ts`:

```ts
export async function getAccessTokenSafe(): Promise<string | null> {
  try {
    const credentials = await getStandaloneClient().credentialsManager.getCredentials();
    return credentials?.accessToken ?? null;
  } catch {
    return null;
  }
}
```

This is correct for the Supabase client's `accessToken` callback, which should silently fall back to an anonymous request (RLS returns nothing) rather than crash. However, the Supabase client should not be calling `create_profile` when the session is missing—the onboarding screen should prevent that.

### Onboarding screen changes

The onboarding screen now has an early `isSignedIn` check before profile creation:

```tsx
// Early check: if the user is not signed in, show a clear message
if (!isSignedIn) {
  setError('Please log in again to continue.');
  setBusy(false);
  return;
}
```

If `isSignedIn` is false, the user sees "Please log in again to continue." This is helpful, but it doesn't actually log the user in again. The user has no way to trigger re-authentication from this error state.

The `onContinue` callback also improved error handling:

```tsx
case 'error':
default: {
  // Check if this is a not_authenticated error
  const errorMessage = result.error instanceof Error ? result.error.message : '';
  if (errorMessage.includes('not_authenticated')) {
    setError('Your session has expired. Please log in again.');
  } else {
    setError('Something went wrong creating your profile. Please try again.');
  }
  setBusy(false);
  return;
}
```

This checks the error message for `not_authenticated` and shows a clearer message. However, `errorMessage.includes('not_authenticated')` is fragile—the error might be wrapped (e.g., `Error: No Auth0 access token available`), or the underlying RPC might raise a different message. A more robust approach would check `instanceof CreateProfileError` and inspect `code === 'not_authenticated'`.

The `submitOnboarding` function in `src/features/auth/onboarding.ts` returns `{ kind: 'error'; error: unknown }` for any failure that isn't explicitly `under_min_age` or `username_taken`. The onboarding screen receives this and tries to extract `not_authenticated` from the error message, but it doesn't handle the `CreateProfileError` case that `createProfile` actually throws.

### `createProfile` function

The `createProfile` function in `src/features/auth/api/create-profile.ts` throws a typed `CreateProfileError` when the RPC raises a known code:

```ts
if (error) {
  console.log('[createProfile] RPC Error - code:', error.code, 'message:', error.message);
  const code = mapErrorMessage(error.message);
  if (code) {
    throw new CreateProfileError(code);
  }
  throw error;
}
```

`mapErrorMessage` checks if the error message includes any of the known codes:

```ts
export function mapErrorMessage(message: string | undefined): CreateProfileErrorCode | undefined {
  if (!message) {
    return undefined;
  }
  return KNOWN_CODES.find((code) => message.includes(code));
}
```

This substring matching works for RPC-raised messages like `RAISE EXCEPTION 'not_authenticated'`, but it's not robust. If Supabase changes the error message format or the RPC uses a different error-raising pattern, the code mapping could break.

### Redundant `getAccessToken` functions

There are two `getAccessToken` functions in the Auth0 wrapper:

1. **Module-level standalone** (`src/lib/auth0.ts`):
   ```ts
   export async function getAccessToken(): Promise<string> { ... }
   ```

2. **Hook's method** (`src/lib/auth0.ts` `useSession`):
   ```ts
   const getAccessToken = async (): Promise<string> => {
     const credentials = await getCredentials();
     if (!credentials?.accessToken) {
       throw new Error('No Auth0 access token available');
     }
     return credentials.accessToken;
   };
   ```

Both call the same underlying SDK method (`credentialsManager.getCredentials()` vs `getCredentials()`), both throw when no token exists, and both are used in different places. The module-level one is used by `supabase.ts` (via `getAccessTokenSafe`, not `getAccessToken`), while the hook's version would be used in components that call `useSession().getAccessToken()`.

This split API surface is unnecessary. There should be one canonical way to get the access token. The hook's version is more React-idiomatic, so the module-level one should either be removed or its purpose clarified (e.g., used only when hooks aren't available).

### Not tested

**Not tested**: The `isSignedIn` check in onboarding is a new guard, but there's no test verifying that `submitOnboarding` is not called when `isSignedIn` is false. The existing test suite for `onboarding.tsx` likely tests the success, `username_taken`, and `under_min_age` paths, but not the "not signed in" path.

**Not tested**: The improved `not_authenticated` error handling in the `error` case is not tested. Unit tests for `submitOnboarding` cover the typed result kinds (`success`, `under_min_age`, `username_taken`, `error`), but the onboarding screen's interpretation of `result.error` is not covered.

**Not tested**: The substring matching in `mapErrorMessage` is not tested with edge cases like `undefined` messages, empty strings, or messages that partially match a code (e.g., `"user_not_authenticated_extra"`).

**Not tested**: The race condition where `isSignedIn` is true but `getAccessToken()` would still throw (e.g., SDK hasn't stored credentials yet after Universal Login) is not covered. The check `isSignedIn: user != null` in `useSession` only verifies that the SDK has a `user` object, not that credentials are available.

### Edge cases not handled

- **`isSignedIn` true but token unavailable**: The `useSession` hook reports `isSignedIn` based on `user != null`. If the user has completed Universal Login but the SDK hasn't stored credentials yet, `user` might be `null` or the credentials might be unavailable. In that case, `isSignedIn` could be false, but there's also a window where `user` exists but `getCredentials()` would fail (e.g., refresh token expired, network issue during credential storage). The fix doesn't address this timing gap.

- **Error message format changes**: The `mapErrorMessage` function uses `message.includes(code)` to match RPC-raised errors. If Supabase changes the error message format or the RPC uses a different exception pattern, the code mapping could break. A more robust approach would be to parse the error code from the RPC's JSON response or use a stricter pattern.

- **Logout mid-onboarding**: If the user logs out after `isSignedIn` is checked but before `submitOnboarding` completes, the `createProfile` call will still happen and fail. The check is a one-time guard, not a persistent session validation.

- **Deep links to onboarding**: If the app is launched with a deep link to `/onboarding` and no Auth0 session exists, the `isSignedIn` check will catch it, but the user has no way to trigger re-authentication from the onboarding screen.

## Recommendations

1. **Unify `getAccessToken` implementations** — Remove the module-level `getAccessToken()` function and use `useSession().getAccessToken()` everywhere. If a caller truly cannot use hooks, introduce a separate "legacy" or "non-React" wrapper with a clear name that signals it's a temporary fallback.

2. **Add re-authentication flow** — After detecting `not_authenticated` or `isSignedIn` being false, provide a button that calls `useSession().login()` to re-authenticate the user, then re-attempt profile creation or navigate to the appropriate screen.

3. **Improve `not_authenticated` detection** — Instead of `errorMessage.includes('not_authenticated')`, check `if (result.error instanceof CreateProfileError && result.error.code === 'not_authenticated')`. This is more robust and uses the typed error structure that `createProfile` already provides.

4. **Add integration tests for auth flows** — Test the full sign-up flow with scenarios: (a) no Auth0 session on onboarding load, (b) `getAccessToken()` throws, (c) logout during onboarding, (d) silent refresh failure. These should verify the error messages and any re-authentication paths.

5. **Add unit tests for `mapErrorMessage`** — Test with `undefined`, empty string, exact matches, partial matches, and case sensitivity. Ensure the function doesn't falsely match codes like `"user_not_authenticated"` when looking for `"not_authenticated"`.

## File map

<details>
<summary>Files changed (3 files)</summary>

- `src/lib/auth0.ts` — Added `getAccessToken()` function that throws when credentials are unavailable.
- `app/(auth)/onboarding.tsx` — Added `isSignedIn` check before profile creation and improved error handling for auth-related failures.
- `src/features/auth/api/create-profile.ts` — No changes to this file in the commit; it was already throwing typed `CreateProfileError` with codes.

Full diff: commit 1894f3368613f788516240a18deb6bc5417cd6db

</details>
</details>