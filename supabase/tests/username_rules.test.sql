-- Username rules (onboarding-revamp): the relaxed CHECK, the case-insensitive
-- unique index, and the shared public.username_allowed validator.
--
-- Covers:
--   * the relaxed format CHECK accepts a custom name and rejects too-short /
--     too-long / bad-character names,
--   * uniqueness is case-insensitive: inserting `MixedCase` then `mixedcase`
--     violates the unique index,
--   * username_allowed() enforces the same format and rejects blocklisted words
--     (case-insensitively) while accepting clean names.
--
-- These are schema/validator tests, so they insert into profiles directly as
-- the table owner (the owning role bypasses RLS and needs no RPC). The
-- create_profile RPC's own behavior is covered in create_profile.test.sql.

begin;
select plan(12);

create extension if not exists pgtap;
\set helpers_included on
\ir _helpers.sql

-- Act as the owning role for direct inserts (bypasses RLS; profiles has no
-- client INSERT grant by design).
reset role;

-- ---------------------------------------------------------------------------
-- Relaxed format CHECK.
-- ---------------------------------------------------------------------------

-- A free-form custom username (letters + underscore) is now accepted.
select lives_ok(
  $$ insert into public.profiles(user_id, username, birth_year, age_band)
     values ('auth0|fmt_ok', 'Cool_Trader', 2000, '18+') $$,
  'relaxed CHECK accepts a custom letters+underscore username');

-- Too short (2 chars) is rejected by the CHECK.
select throws_ok(
  $$ insert into public.profiles(user_id, username, birth_year, age_band)
     values ('auth0|fmt_short', 'ab', 2000, '18+') $$,
  '23514',
  null,
  'CHECK rejects a 2-character username (too short)');

-- Too long (21 chars) is rejected by the CHECK.
select throws_ok(
  $$ insert into public.profiles(user_id, username, birth_year, age_band)
     values ('auth0|fmt_long', 'aaaaaaaaaaaaaaaaaaaaa', 2000, '18+') $$,
  '23514',
  null,
  'CHECK rejects a 21-character username (too long)');

-- A disallowed character (space) is rejected by the CHECK.
select throws_ok(
  $$ insert into public.profiles(user_id, username, birth_year, age_band)
     values ('auth0|fmt_bad', 'has space', 2000, '18+') $$,
  '23514',
  null,
  'CHECK rejects a username containing a space');

-- ---------------------------------------------------------------------------
-- Case-insensitive uniqueness.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.profiles(user_id, username, birth_year, age_band)
     values ('auth0|case_a', 'MixedCase', 2000, '18+') $$,
  'first insert of MixedCase succeeds');

-- A second row differing only in case violates the lower(username) unique index.
select throws_ok(
  $$ insert into public.profiles(user_id, username, birth_year, age_band)
     values ('auth0|case_b', 'mixedcase', 2000, '18+') $$,
  '23505',
  null,
  'case-insensitive unique index rejects mixedcase after MixedCase');

-- ---------------------------------------------------------------------------
-- username_allowed(): format + blocklist.
-- ---------------------------------------------------------------------------
select ok(public.username_allowed('clever_otter'),
  'username_allowed accepts a clean custom name');
select ok(public.username_allowed('investor-123'),
  'username_allowed accepts letters, digits and a hyphen');

select ok(not public.username_allowed('ab'),
  'username_allowed rejects a too-short name');
select ok(not public.username_allowed('bad name'),
  'username_allowed rejects a name with a space');

-- Blocklisted word, exact and case-insensitive-with-context.
select ok(not public.username_allowed('shithead'),
  'username_allowed rejects a name containing a blocked fragment');
select ok(not public.username_allowed('XxNaZixX'),
  'username_allowed rejects a blocked word case-insensitively');

select * from finish();
rollback;
