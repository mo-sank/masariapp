import { z } from 'zod';

/**
 * Client configuration.
 *
 * Only PUBLIC values live here. Every variable uses the `EXPO_PUBLIC_` prefix so
 * the Expo CLI inlines it into the JS bundle at build time (see
 * https://docs.expo.dev/guides/environment-variables/). Never put secrets here:
 * anything in this file ships in plain text inside the app.
 *
 * Server-only secrets (MARKET_DATA_API_KEY, AUTH0_MGMT_*, CRON_SECRET, the
 * Supabase service-role key) are Edge Function secrets and must never be read
 * by the app.
 */

// Zod v4: a single `error` param covers both the missing/wrong-type case and
// failed refinements, so the message always names the variable and never
// surfaces the offending value.
const nonEmpty = (name: string) =>
  z
    .string({ error: `${name} is not set` })
    .trim()
    .min(1, { error: `${name} is not set` });

// Placeholder legal URLs. These are optional in the environment: when unset we
// fall back to a placeholder host so the Settings legal links are always
// tappable in development. Replace the real URLs (served from docs/legal) before
// launch by setting the EXPO_PUBLIC_LEGAL_* variables.
const PLACEHOLDER_PRIVACY_URL = 'https://masari.app/legal/privacy';
const PLACEHOLDER_TERMS_URL = 'https://masari.app/legal/terms';

// An optional URL env var: when provided it must be a valid URL; when omitted we
// substitute the given placeholder. Keeps the Settings legal links working
// before the real documents are hosted.
const optionalUrl = (name: string, fallback: string) =>
  z
    .string()
    .trim()
    .url({ error: `${name} must be a valid URL` })
    .optional()
    .transform((value) => (value && value.length > 0 ? value : fallback))
    .catch(fallback);

// Sentry DSN is genuinely optional: it is unset in local development and in
// tests, where crash reporting stays disabled. When present it must be a valid
// URL. An empty string collapses to `undefined` so Sentry.init can skip setup.
const optionalDsn = z
  .string()
  .trim()
  .url({ error: 'EXPO_PUBLIC_SENTRY_DSN must be a valid URL' })
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined))
  .catch(undefined);

export const configSchema = z.object({
  auth0Domain: nonEmpty('EXPO_PUBLIC_AUTH0_DOMAIN'),
  auth0ClientId: nonEmpty('EXPO_PUBLIC_AUTH0_CLIENT_ID'),
  // The client no longer sends an API audience at login (Supabase consumes the
  // Auth0 ID token). The field is retained because the server-side Edge
  // Functions (e.g. delete-account) still reference an audience. We reject the
  // Auth0 Management API (`/api/v2/`) explicitly: an access token minted for it
  // is unreadable by Supabase and was the original sign-up failure.
  auth0Audience: nonEmpty('EXPO_PUBLIC_AUTH0_AUDIENCE').refine(
    (value) => !/\/api\/v2\/?$/.test(value),
    { error: 'EXPO_PUBLIC_AUTH0_AUDIENCE must not be the Auth0 Management API (/api/v2/)' },
  ),
  supabaseUrl: nonEmpty('EXPO_PUBLIC_SUPABASE_URL').url({
    error: 'EXPO_PUBLIC_SUPABASE_URL must be a valid URL',
  }),
  supabaseAnonKey: nonEmpty('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
  legalPrivacyUrl: optionalUrl('EXPO_PUBLIC_LEGAL_PRIVACY_URL', PLACEHOLDER_PRIVACY_URL),
  legalTermsUrl: optionalUrl('EXPO_PUBLIC_LEGAL_TERMS_URL', PLACEHOLDER_TERMS_URL),
  sentryDsn: optionalDsn,
});

export type Config = z.infer<typeof configSchema>;

/**
 * The raw environment, mapped from the statically-inlined `EXPO_PUBLIC_*`
 * references. Each `process.env.EXPO_PUBLIC_*` access must be a literal so the
 * Expo CLI can replace it at build time; a dynamic lookup would be left
 * `undefined` in the bundle.
 */
export type RawEnv = {
  auth0Domain: string | undefined;
  auth0ClientId: string | undefined;
  auth0Audience: string | undefined;
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  // Legal URLs are genuinely optional (placeholder fallbacks apply), so they are
  // optional on the raw env type too — callers need not provide them.
  legalPrivacyUrl?: string | undefined;
  legalTermsUrl?: string | undefined;
  // Sentry DSN is optional; when unset, crash reporting is disabled.
  sentryDsn?: string | undefined;
};

export function readRawEnv(): RawEnv {
  return {
    auth0Domain: process.env.EXPO_PUBLIC_AUTH0_DOMAIN,
    auth0ClientId: process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID,
    auth0Audience: process.env.EXPO_PUBLIC_AUTH0_AUDIENCE,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    legalPrivacyUrl: process.env.EXPO_PUBLIC_LEGAL_PRIVACY_URL,
    legalTermsUrl: process.env.EXPO_PUBLIC_LEGAL_TERMS_URL,
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  };
}

/**
 * Validate the given environment and return a typed config.
 *
 * Throws a readable error that NAMES the offending variables and never prints
 * their values. Pure and side-effect free so it can be unit tested.
 */
export function parseConfig(raw: RawEnv): Config {
  const result = configSchema.safeParse(raw);
  if (result.success) {
    return result.data;
  }

  const messages = result.error.issues.map((issue) => issue.message);
  // De-duplicate while preserving order.
  const unique = [...new Set(messages)];
  throw new Error(
    `Invalid app configuration. Fix these environment variables:\n` +
      unique.map((m) => `  - ${m}`).join('\n'),
  );
}

let cached: Config | undefined;

/**
 * The validated config for the running app.
 *
 * Validation happens on first access (memoized), so a missing or malformed
 * variable fails fast with a readable error the first time the app reads config
 * at startup, rather than surfacing later as an undefined value. Accessing a
 * property is enough to trigger validation.
 */
export const config: Config = new Proxy({} as Config, {
  get(_target, prop: string | symbol) {
    cached ??= parseConfig(readRawEnv());
    return cached[prop as keyof Config];
  },
}) as Config;
