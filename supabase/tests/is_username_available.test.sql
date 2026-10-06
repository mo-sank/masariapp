-- is_username_available RPC (onboarding-revamp).
--
-- Covers:
--   * a clean, unused name is available (true),
--   * an existing name is unavailable, case-insensitively (false),
--   * a malformed or blocklisted name is unavailable (false) via username_allowed,
--   * the RPC is callable by the authenticated client role.
--
-- The RPC is SECURITY DEFINER and returns only a boolean, so it does not depend
-- on the caller's RLS view. We seed one profile as the owner, then call the RPC
-- as the authenticated client exactly as the app does.

begin;
select plan(6);

create extension if not exists pgtap;
\set helpers_included on
\ir _helpers.sql

-- Seed an existing username as the owner (direct insert; profiles has no client
-- INSERT grant).
reset role;
insert into public.profiles(user_id, username, birth_year, age_band)
  values ('auth0|seed', 'TakenName', 2000, '18+');

-- Call the RPC as the signed-in client role.
reset role;
select tests.set_authenticated_claims('auth0|caller');
set role authenticated;

select is(public.is_username_available('fresh_name'), true,
  'a clean, unused name is available');

select is(public.is_username_available('TakenName'), false,
  'an exact existing name is unavailable');

select is(public.is_username_available('takenname'), false,
  'an existing name is unavailable case-insensitively');

select is(public.is_username_available('TAKENNAME'), false,
  'an existing name is unavailable regardless of case');

-- Malformed (too short) and blocklisted names are unavailable via the validator.
select is(public.is_username_available('ab'), false,
  'a malformed name is unavailable');

select is(public.is_username_available('shithead'), false,
  'a blocklisted name is unavailable');

select * from finish();
rollback;
