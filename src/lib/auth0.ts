/**
 * Auth0 identity wrapper.
 *
 * A thin layer over react-native-auth0's hooks so the rest of the app depends on
 * a small, stable surface instead of the full SDK. Two exports:
 *
 * - `AuthProvider`  wraps the app in Auth0's `Auth0Provider`, wired with the
 *   domain and clientId from the validated config (src/lib/config.ts).
 * - `useSession()`  returns `{ isLoading, isSignedIn, login, logout,
 *   getAccessToken }`.
 *
 * Design note (requirements 3.1-3.5): credentials live only inside the Auth0
 * SDK's Credentials Manager. This module never writes tokens to AsyncStorage,
 * never logs them, and never persists them anywhere else. `getAccessToken`
 * delegates to `getCredentials`, which transparently performs a silent refresh
 * when the access token has expired and restores a saved session on app
 * relaunch. The native deep-link handling for Universal Login's callback is set
 * up by the react-native-auth0 Expo config plugin (see app.config.ts), so a
 * development build is required (not Expo Go).
 */
import { createElement, type ReactNode } from 'react';
import Auth0, { Auth0Provider, useAuth0 } from 'react-native-auth0';

import { config } from './config';

/**
 * A standalone Auth0 client used OUTSIDE React.
 *
 * The `useSession` hook covers everything inside the component tree, but the
 * Supabase client (src/lib/supabase.ts) is a plain module with no access to
 * hooks, and it needs the current access token on every request. This instance
 * shares the same native credentials store (iOS Keychain / Android
 * EncryptedSharedPreferences) as the Auth0Provider, so credentials saved during
 * Universal Login are readable here. It is created lazily so config validation
 * errors surface only when auth is actually used, and so unit tests that never
 * touch the client do not construct it.
 */
let standaloneClient: Auth0 | undefined;

function getStandaloneClient(): Auth0 {
  standaloneClient ??= new Auth0({
    domain: config.auth0Domain,
    clientId: config.auth0ClientId,
  });
  return standaloneClient;
}

/**
 * Return the current Auth0 access token for use outside React, or `null` when
 * no valid session exists (signed out, cleared, or refresh failed).
 *
 * Unlike {@link Session.getAccessToken}, this NEVER throws: it is called from
 * the Supabase client's `accessToken` callback, where a missing token must
 * simply produce an anonymous (unauthenticated) request rather than crash the
 * request. The credentials manager refreshes a stale token silently and
 * restores a saved session on relaunch. The token is never logged here.
 */
export async function getAccessTokenSafe(): Promise<string | null> {
  try {
    const credentials = await getStandaloneClient().credentialsManager.getCredentials();
    return credentials?.accessToken ?? null;
  } catch {
    // No credentials, or a silent refresh failed. Treat as signed out: the
    // caller sends an anonymous request and RLS returns no rows.
    return null;
  }
}

/**
 * Return the current Auth0 access token for use outside React, throwing if no
 * valid session exists. Use this when you want the caller to handle a missing
 * token explicitly (e.g., redirect to login) rather than send an anonymous
 * request.
 *
 * The credentials manager refreshes a stale token silently and restores a saved
 * session on relaunch. Rejects when no valid credentials exist or a refresh
 * fails, so callers can route the user back to the welcome screen.
 */
export async function getAccessToken(): Promise<string> {
  const credentials = await getStandaloneClient().credentialsManager.getCredentials();
  if (!credentials?.accessToken) {
    throw new Error('No Auth0 access token available');
  }
  return credentials.accessToken;
}

/**
 * OAuth scopes requested at login. `offline_access` yields a refresh token so
 * the SDK can refresh silently; `openid profile email` cover identity. The
 * audience ties the issued access token to the Masari API so it carries the
 * claims Supabase RLS reads.
 */
const LOGIN_SCOPE = 'openid profile email offline_access';

export interface Session {
  /** True while the SDK restores any saved session on startup. */
  isLoading: boolean;
  /** True when a user is authenticated. */
  isSignedIn: boolean;
  /**
   * Open Auth0 Universal Login. Resolves once login completes and the SDK has
   * stored the credentials; rejects (including on user cancel) otherwise.
   */
  login: () => Promise<void>;
  /**
   * Clear the Auth0 web session and the stored credentials. Resolves once the
   * user is fully signed out.
   */
  logout: () => Promise<void>;
  /**
   * Return a current access token, refreshing it silently if it has expired.
   * Rejects when no valid credentials exist or a refresh fails, so callers can
   * route the user back to the welcome screen.
   */
  getAccessToken: () => Promise<string>;
}

/**
 * Wrap the app so the Auth0 hooks work beneath it. Reads the domain and clientId
 * from the validated config. Place it high in the tree (per the design: inside
 * the root layout, above QueryClientProvider and ThemeProvider).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  return createElement(
    Auth0Provider,
    { domain: config.auth0Domain, clientId: config.auth0ClientId },
    children,
  );
}

/**
 * Access the current session and the auth actions. Must be rendered under
 * `AuthProvider`.
 */
export function useSession(): Session {
  const { user, isLoading, authorize, clearSession, clearCredentials, getCredentials } = useAuth0();

  const login = async (): Promise<void> => {
    // Universal Login. The audience ties the token to the Masari API; the scope
    // requests a refresh token for silent renewal. The SDK stores the resulting
    // credentials in its Credentials Manager.
    await authorize({ scope: LOGIN_SCOPE, audience: config.auth0Audience });
  };

  const logout = async (): Promise<void> => {
    // Clear the hosted Auth0 session (so the next login prompts again) and drop
    // the locally stored credentials.
    await clearSession();
    await clearCredentials();
  };

  const getAccessToken = async (): Promise<string> => {
    // getCredentials refreshes a stale access token transparently and restores a
    // saved session on relaunch. It rejects when no valid credentials exist.
    const credentials = await getCredentials();
    if (!credentials?.accessToken) {
      throw new Error('No Auth0 access token available');
    }
    return credentials.accessToken;
  };

  return {
    isLoading,
    isSignedIn: user != null,
    login,
    logout,
    getAccessToken,
  };
}
