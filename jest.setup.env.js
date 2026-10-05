/**
 * Jest environment setup — dummy public config for the test runtime.
 *
 * `src/lib/supabase.ts` reads `config.supabaseUrl` at module load, which
 * validates the full `EXPO_PUBLIC_*` set (src/lib/config.ts) on first access
 * and throws when any value is missing. Suites that transitively import the
 * Supabase client — e.g. the lesson registry, which now wires the real
 * GuidedTradeStep → the trading/explore data hooks → the client — would fail to
 * load without these.
 *
 * These are inert placeholders, never real credentials: they only satisfy the
 * schema (non-empty strings; valid URLs for the URL-typed fields) so module
 * import succeeds. Suites that exercise auth or data mock those layers directly.
 * Runs via `setupFiles` (before the test framework and module imports).
 */
process.env.EXPO_PUBLIC_AUTH0_DOMAIN ??= 'example.auth0.com';
process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID ??= 'test-client-id';
process.env.EXPO_PUBLIC_AUTH0_AUDIENCE ??= 'https://api.masari.test';
process.env.EXPO_PUBLIC_SUPABASE_URL ??= 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';
