# supabase/tests

pgTAP tests run via `supabase test db` (pg_prove globs every `*.sql` here).

- `_helpers.sql` — shared helpers that fake the Auth0 identity. Loaded by each
  test with `\set helpers_included on` then `\ir _helpers.sql`. It sets the
  `request.jwt.claims` GUC (the plural key the local stack's `auth.jwt()` reads)
  so `public.current_user_id()` resolves to a chosen Auth0 `sub`. Role switching
  (`set role authenticated|anon`) is done at the top level of each test, since
  Postgres forbids changing roles inside functions. When pg_prove runs this file
  on its own it emits a trivial passing plan.
- `rls_isolation.test.sql` — cross-user isolation (Req 6.2).
- `rls_anon_denied.test.sql` — anon reads nothing (Req 6.4).
- `rls_direct_writes_denied.test.sql` — no direct INSERT/UPDATE/DELETE (Req 6.3).
- `rls_events_write_only.test.sql` — events are not selectable by clients (Req 6.3/6.5).

RPC tests are added in later tasks.
