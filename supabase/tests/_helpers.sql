-- pgTAP shared helpers for faking the Auth0 identity in database tests.
--
-- Why this exists: database tests cannot mint a real Auth0 token, so instead
-- they set the JWT claims Postgres reads. public.current_user_id() resolves
-- auth.jwt() ->> 'sub', and the local Supabase stack's auth.jwt() reads the
-- GUC `request.jwt.claims` (plural). Confirmed in task 4 against the local
-- stack: auth.jwt() is
--   coalesce(current_setting('request.jwt.claim',  true),
--            current_setting('request.jwt.claims', true))::jsonb
-- The singular `request.jwt.claim` is normally unset, so writing the plural
-- `request.jwt.claims` is what current_user_id() ends up reading.
--
-- Claims are set transaction-locally (set_config(..., is_local => true)). pgTAP
-- runs each test file inside a single transaction, so claims set here stay in
-- effect for the assertions that follow and are rolled back when the file ends.
--
-- Role switching (SET ROLE / RESET ROLE) is NOT done inside these functions:
-- Postgres forbids changing "role" inside a SECURITY DEFINER function, and a
-- plain function would switch the role only for its own call. Tests therefore
-- run `reset role` / `set role authenticated|anon` directly at the top level and
-- use these helpers only to set or clear the JWT claims. The recommended pattern
-- per test is:
--     reset role;                              -- back to the owning role
--     select tests.set_authenticated_claims('auth0|userA');
--     set role authenticated;                  -- act as the signed-in client
-- and for the anon path:
--     reset role;
--     select tests.clear_claims();
--     set role anon;
--
-- Usage: each *.test.sql file loads this helper with `\ir _helpers.sql` before
-- its assertions. This file defines helpers only and runs no assertions of its
-- own, so it is not meant to be executed as a standalone test.

create schema if not exists tests;

-- Set the JWT claims so auth.jwt() ->> 'sub' resolves to p_sub and the role
-- claim is 'authenticated' (what the Auth0 Post-Login Action adds). Does NOT
-- switch the Postgres role; the caller does that at the top level.
create or replace function tests.set_authenticated_claims(p_sub text)
returns void language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text,
    true  -- is_local: scoped to the current transaction
  );
  select null::void;
$$;

-- Clear the JWT claims (models an unauthenticated / no-token request). Does NOT
-- switch the Postgres role; the caller sets `anon` at the top level.
create or replace function tests.clear_claims()
returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
  select null::void;
$$;

-- Allow the restricted API roles to find and execute the helpers so a test can
-- re-set claims even while currently acting as `authenticated` or `anon`.
grant usage on schema tests to anon, authenticated, service_role;
grant execute on function tests.set_authenticated_claims(text) to anon, authenticated, service_role;
grant execute on function tests.clear_claims() to anon, authenticated, service_role;

-- `supabase test db` runs pg_prove over every *.sql file in this directory,
-- including this one. A test file sets :helpers_included before `\ir`-ing this
-- file, which suppresses the standalone epilogue below. When this file is run on
-- its own (no variable set), it emits a valid, empty TAP plan so the runner sees
-- a passing no-op instead of a "no plan found" parse error.
\if :{?helpers_included}
\else
create extension if not exists pgtap;
select plan(1);
select pass('_helpers.sql loaded (no standalone assertions)');
select finish();
\endif
