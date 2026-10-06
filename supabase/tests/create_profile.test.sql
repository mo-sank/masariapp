-- create_profile RPC (Requirement 5, Properties 5 and 8).
-- Covers:
--   * under-13 rejected (and out-of-range month/year rejected as under_min_age),
--   * username format rules (invalid_username, username_taken),
--   * successful creation of the profile + its companion rows (two consents, a
--     paper account seeded with the configured starter cash, a user_stats row),
--   * idempotency: a second call for the same sub returns the same profile and
--     creates no duplicate consent/paper_account/user_stats rows.
--
-- The RPC is SECURITY DEFINER and derives the user from public.current_user_id()
-- (auth.jwt() ->> 'sub'), so these tests set the JWT claims via the shared
-- _helpers.sql and invoke the RPC while acting as the `authenticated` client
-- role — exactly how the app calls it. The function itself performs the writes
-- under its definer privileges, so no direct DML grants are needed.

begin;
select plan(24);

create extension if not exists pgtap;
\set helpers_included on
\ir _helpers.sql

-- ---------------------------------------------------------------------------
-- Under-13 is rejected (Requirement 5.6, age gate in the RPC).
-- A 2020 birth year is clearly under 13 relative to any plausible test clock.
-- ---------------------------------------------------------------------------
reset role;
select tests.set_authenticated_claims('auth0|minor');
set role authenticated;

select throws_ok(
  $$ select public.create_profile('tiny-cub-01', 2020, 6, 'America/New_York', 'v1', 'v1') $$,
  'under_min_age',
  'create_profile rejects an under-13 user with under_min_age');

-- Out-of-range month is treated as under_min_age (defensive input check).
select throws_ok(
  $$ select public.create_profile('tiny-cub-02', 2000, 13, 'America/New_York', 'v1', 'v1') $$,
  'under_min_age',
  'create_profile rejects an out-of-range birth month');

-- A blocked attempt writes nothing.
reset role;
select is((select count(*)::int from public.profiles where user_id = 'auth0|minor'),
  0, 'under-13 attempt creates no profile row');
select is((select count(*)::int from public.consents where user_id = 'auth0|minor'),
  0, 'under-13 attempt creates no consent rows');

-- ---------------------------------------------------------------------------
-- Username rules (Requirement 5.3 via public.username_allowed; 5.5 username_taken).
-- The format is now the relaxed ^[a-zA-Z0-9_-]{3,20}$, so a custom name like
-- 'Cool_Trader' is valid; only a malformed OR blocklisted name is rejected.
-- ---------------------------------------------------------------------------
reset role;
select tests.set_authenticated_claims('auth0|badname');
set role authenticated;

-- A disallowed character (space) fails the format gate.
select throws_ok(
  $$ select public.create_profile('bad name', 2008, 6, 'America/New_York', 'v1', 'v1') $$,
  'invalid_username',
  'create_profile rejects a username with a disallowed character');

-- A blocklisted word is rejected as invalid_username (profane == invalid).
select throws_ok(
  $$ select public.create_profile('shithead', 2008, 6, 'America/New_York', 'v1', 'v1') $$,
  'invalid_username',
  'create_profile rejects a blocklisted username as invalid_username');

reset role;
select is((select count(*)::int from public.profiles where user_id = 'auth0|badname'),
  0, 'invalid-username attempt creates no profile row');

-- ---------------------------------------------------------------------------
-- Successful creation seeds the profile and all companion rows
-- (Requirement 5.4; Property 8 money non-negativity).
-- ---------------------------------------------------------------------------
reset role;
select tests.set_authenticated_claims('auth0|userA');
set role authenticated;

-- Choose a birth year that is unambiguously in the 13-15 band regardless of the
-- test clock: 14 years before the current year, with a January birth month so
-- the (last-day-of-month) birthday has always passed by "today". This keeps the
-- age_band assertion below deterministic rather than tied to a hard-coded year.
select (extract(year from now())::int - 14) as birth_year_1315 \gset
-- Pass an empty timezone to exercise the default fallback to America/New_York.
select lives_ok(
  format($$ select public.create_profile('cool-fox-77', %s, 1, '', 'v1', 'v2') $$, :birth_year_1315),
  'create_profile succeeds for a valid 13+ user');

-- Inspect the created rows as the owner (RLS scopes to this sub anyway).
select is((select count(*)::int from public.profiles where user_id = 'auth0|userA'),
  1, 'exactly one profile row is created');
select is((select username from public.profiles where user_id = 'auth0|userA'),
  'cool-fox-77', 'profile stores the requested username');
select is((select age_band from public.profiles where user_id = 'auth0|userA'),
  '13-15', 'age_band is derived conservatively (age 14 -> 13-15)');
select is((select timezone from public.profiles where user_id = 'auth0|userA'),
  'America/New_York', 'empty timezone falls back to America/New_York');

select is((select count(*)::int from public.consents where user_id = 'auth0|userA'),
  2, 'two consent rows are created');
select is(
  (select array_agg(consent_type order by consent_type)
     from public.consents where user_id = 'auth0|userA'),
  array['privacy','terms']::text[],
  'the two consents are terms and privacy');
select is(
  (select version from public.consents
     where user_id = 'auth0|userA' and consent_type = 'privacy'),
  'v2', 'privacy consent stores the passed privacy version');

select is((select count(*)::int from public.paper_accounts where user_id = 'auth0|userA'),
  1, 'one paper account is created');
select is(
  (select cash_cents from public.paper_accounts where user_id = 'auth0|userA'),
  1000000::bigint,
  'paper account cash_cents equals the configured starter_cash_cents (>= 0)');

select is((select count(*)::int from public.user_stats where user_id = 'auth0|userA'),
  1, 'one user_stats row is created');

-- ---------------------------------------------------------------------------
-- Idempotency (Requirement 5.7, Property 5): a second call returns the same
-- profile and creates no duplicate companion rows, even with different args.
-- ---------------------------------------------------------------------------
select is(
  (select (public.create_profile('other-cat-99', 2008, 6, '', 'v1', 'v1')).username),
  'cool-fox-77',
  'a repeat call returns the EXISTING profile (ignores new args)');

reset role;
select is((select count(*)::int from public.consents where user_id = 'auth0|userA'),
  2, 'repeat call does not add consent rows');
select is((select count(*)::int from public.paper_accounts where user_id = 'auth0|userA'),
  1, 'repeat call does not add a paper account');
select is((select count(*)::int from public.user_stats where user_id = 'auth0|userA'),
  1, 'repeat call does not add a user_stats row');

-- ---------------------------------------------------------------------------
-- username_taken (Requirement 5.5): a different user requesting an already-used
-- username gets username_taken, not a raw constraint error.
-- ---------------------------------------------------------------------------
reset role;
select tests.set_authenticated_claims('auth0|userB');
set role authenticated;

select throws_ok(
  $$ select public.create_profile('cool-fox-77', 2008, 6, 'America/New_York', 'v1', 'v1') $$,
  'username_taken',
  'a taken username surfaces as username_taken for a different user');

-- Uniqueness is case-insensitive: the SAME name in a different case is also
-- reported as username_taken (not a raw unique_violation).
select throws_ok(
  $$ select public.create_profile('COOL-FOX-77', 2008, 6, 'America/New_York', 'v1', 'v1') $$,
  'username_taken',
  'a taken username is username_taken case-insensitively');

select * from finish();
rollback;
