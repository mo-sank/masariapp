# supabase/functions

Edge Functions (Deno/TypeScript): `ingest-quotes/`, `ingest-bars/`,
`delete-account/`, and `_shared/`. Each is a kebab-case folder with `index.ts`.

Functions use the `export default { fetch }` handler contract (not `Deno.serve`)
and import external dependencies with `npm:`/`jsr:` specifiers at pinned
versions, per Supabase's current Edge Function guidance.

These files are excluded from the app's TypeScript (`tsconfig.json`) and ESLint
(`eslint.config.js`) because they target the Deno Edge runtime, not React
Native. Lint/typecheck them with the Supabase CLI / Deno.

## delete-account

Triggered by the app's Settings → Delete account flow (`POST
/functions/v1/delete-account` with the user's Auth0 access token on the
`Authorization` header). It:

1. Verifies the Auth0 token itself with `jose` against the Auth0 JWKS (issuer +
   audience) and reads `sub`. Because the caller presents an Auth0 token (not a
   Supabase JWT), the gateway cannot verify it, so this function sets
   `verify_jwt = false` in `config.toml` and does its own verification.
2. Deletes the `profiles` row for that `sub` via the service role; `ON DELETE
   CASCADE` removes the user's `consents`, `paper_accounts`, `user_stats`, and
   `events`.
3. Deletes the Auth0 user via the Management API.
4. Returns `204` on full success, `502` if the Auth0 delete fails after the
   Supabase row is gone (retryable; the flow is idempotent so a retry still
   returns `204`), `401` for a missing/invalid token, and `500` for a Supabase
   delete failure or missing configuration.

The function acts only on the verified `sub` and ignores any request body.

### Required secrets (never in the app)

Set these as Edge Function secrets (`supabase secrets set --env-file ...`) for
the dev and prod projects:

- `AUTH0_DOMAIN` — tenant domain (token issuer + JWKS).
- `AUTH0_AUDIENCE` — API audience the access token is issued for.
- `AUTH0_MGMT_DOMAIN` — Management API tenant domain (defaults to `AUTH0_DOMAIN`).
- `AUTH0_MGMT_CLIENT_ID` / `AUTH0_MGMT_CLIENT_SECRET` — Management API (M2M) app
  with `delete:users`.

`SUPABASE_URL` and the service-role key are injected automatically by the
platform.
