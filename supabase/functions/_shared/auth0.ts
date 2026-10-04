// Shared Auth0 helpers for Edge Functions (used by delete-account).
//
// Two concerns live here so the function body stays small:
//   1. verifyAuth0Jwt — verify the incoming Auth0 access token with jose against
//      the tenant's JWKS, checking the issuer and audience, and return the `sub`.
//   2. deleteAuth0User — get a Management API token (client-credentials) and
//      DELETE the user, treating "already gone" as success for idempotency.
//
// Imports use the `npm:` specifier with pinned versions, per Supabase's current
// Edge Function guidance. Secrets are read from the environment; they are never
// logged.
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@^5';

/** Environment config for Auth0 verification and Management API calls. */
export interface Auth0Env {
  /** Tenant domain for the token issuer and JWKS, e.g. "masari.us.auth0.com". */
  domain: string;
  /** API audience the access token must be issued for. */
  audience: string;
  /** Management API tenant domain (usually the same tenant domain). */
  mgmtDomain: string;
  /** Management API (machine-to-machine) client id. */
  mgmtClientId: string;
  /** Management API client secret. */
  mgmtClientSecret: string;
}

/** Read and validate the required Auth0 environment for the function. */
export function readAuth0Env(get: (key: string) => string | undefined): Auth0Env {
  const domain = get('AUTH0_DOMAIN');
  const audience = get('AUTH0_AUDIENCE');
  const mgmtDomain = get('AUTH0_MGMT_DOMAIN') ?? domain;
  const mgmtClientId = get('AUTH0_MGMT_CLIENT_ID');
  const mgmtClientSecret = get('AUTH0_MGMT_CLIENT_SECRET');

  const missing: string[] = [];
  if (!domain) missing.push('AUTH0_DOMAIN');
  if (!audience) missing.push('AUTH0_AUDIENCE');
  if (!mgmtDomain) missing.push('AUTH0_MGMT_DOMAIN');
  if (!mgmtClientId) missing.push('AUTH0_MGMT_CLIENT_ID');
  if (!mgmtClientSecret) missing.push('AUTH0_MGMT_CLIENT_SECRET');
  if (missing.length > 0) {
    throw new Error(`Missing Auth0 Edge Function secrets: ${missing.join(', ')}`);
  }

  return {
    domain: domain!,
    audience: audience!,
    mgmtDomain: mgmtDomain!,
    mgmtClientId: mgmtClientId!,
    mgmtClientSecret: mgmtClientSecret!,
  };
}

/** Normalize a domain into an https issuer URL with a trailing slash. */
function issuerUrl(domain: string): string {
  const bare = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `https://${bare}/`;
}

// Cache the remote JWKS across invocations in the same worker so we are not
// refetching the key set on every request. Keyed by issuer in case the domain
// changes between environments.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(domain: string) {
  const issuer = issuerUrl(domain);
  let jwks = jwksCache.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}.well-known/jwks.json`));
    jwksCache.set(issuer, jwks);
  }
  return jwks;
}

/**
 * Verify an Auth0 access token and return the `sub`.
 *
 * Checks the signature against the tenant JWKS and asserts the issuer and
 * audience. Throws if the token is missing, malformed, expired, or fails
 * verification. The caller must treat any throw as a 401.
 */
export async function verifyAuth0Jwt(token: string, env: Auth0Env): Promise<string> {
  const { payload } = await jwtVerify(token, getJwks(env.domain), {
    issuer: issuerUrl(env.domain),
    audience: env.audience,
  });
  const sub = payload.sub;
  if (!sub) {
    throw new Error('Token has no sub claim');
  }
  return sub;
}

/** Fetch a short-lived Management API access token via client-credentials. */
async function getManagementToken(env: Auth0Env): Promise<string> {
  const tokenUrl = `${issuerUrl(env.mgmtDomain)}oauth/token`;
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: env.mgmtClientId,
      client_secret: env.mgmtClientSecret,
      // The Management API audience is the tenant's /api/v2/ endpoint.
      audience: `${issuerUrl(env.mgmtDomain)}api/v2/`,
    }),
  });
  if (!res.ok) {
    throw new Error(`Auth0 Management token request failed: ${res.status}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error('Auth0 Management token response had no access_token');
  }
  return json.access_token;
}

/**
 * Delete the Auth0 user identified by `sub` via the Management API.
 *
 * Idempotent: a 404 (user already deleted) is treated as success, so a retry
 * after a partial failure still resolves. Throws on any other non-2xx so the
 * caller can return a non-2xx and let the client retry (requirement 8.4).
 */
export async function deleteAuth0User(sub: string, env: Auth0Env): Promise<void> {
  const mgmtToken = await getManagementToken(env);
  const url = `${issuerUrl(env.mgmtDomain)}api/v2/users/${encodeURIComponent(sub)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${mgmtToken}` },
  });
  // 204 is the documented success; 200 is accepted defensively. 404 means the
  // user is already gone — treat as success so retries are idempotent.
  if (res.ok || res.status === 404) {
    return;
  }
  throw new Error(`Auth0 Management delete failed: ${res.status}`);
}
