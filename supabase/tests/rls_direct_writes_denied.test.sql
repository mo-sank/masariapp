-- No direct writes (Requirement 6.3, Property 2).
-- An authenticated client role may not INSERT/UPDATE/DELETE directly on any
-- table this spec owns; the only successful writes come through SECURITY
-- DEFINER RPCs (added in later tasks). authenticated holds only SELECT, so
-- every direct DML raises 42501 (permission denied).

begin;
select plan(21);

create extension if not exists pgtap;
\set helpers_included on
\ir _helpers.sql

-- Seed one owned row per user table (as the privileged owner) so UPDATE/DELETE
-- have a target to attempt against.
insert into public.profiles(user_id, username, birth_year, age_band)
  values ('auth0|userA', 'red-fox-11', 2010, '13-15');
insert into public.consents(user_id, consent_type, version)
  values ('auth0|userA', 'terms', 'v1');
insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents)
  values ('auth0|userA', 1000000, 1000000);
insert into public.user_stats(user_id) values ('auth0|userA');

reset role;
select tests.set_authenticated_claims('auth0|userA');
set role authenticated;

-- profiles
select throws_ok(
  $$insert into public.profiles(user_id, username, birth_year, age_band)
    values ('auth0|userA', 'new-cat-99', 2010, '13-15')$$,
  '42501', 'permission denied for table profiles',
  'authenticated cannot INSERT into profiles');
select throws_ok(
  $$update public.profiles set username = 'new-cat-99' where user_id = 'auth0|userA'$$,
  '42501', 'permission denied for table profiles',
  'authenticated cannot UPDATE profiles');
select throws_ok(
  $$delete from public.profiles where user_id = 'auth0|userA'$$,
  '42501', 'permission denied for table profiles',
  'authenticated cannot DELETE from profiles');

-- consents
select throws_ok(
  $$insert into public.consents(user_id, consent_type, version)
    values ('auth0|userA', 'privacy', 'v2')$$,
  '42501', 'permission denied for table consents',
  'authenticated cannot INSERT into consents');
select throws_ok(
  $$update public.consents set version = 'v2' where user_id = 'auth0|userA'$$,
  '42501', 'permission denied for table consents',
  'authenticated cannot UPDATE consents');
select throws_ok(
  $$delete from public.consents where user_id = 'auth0|userA'$$,
  '42501', 'permission denied for table consents',
  'authenticated cannot DELETE from consents');

-- paper_accounts
select throws_ok(
  $$insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents)
    values ('auth0|userZ', 500, 500)$$,
  '42501', 'permission denied for table paper_accounts',
  'authenticated cannot INSERT into paper_accounts');
select throws_ok(
  $$update public.paper_accounts set cash_cents = 999 where user_id = 'auth0|userA'$$,
  '42501', 'permission denied for table paper_accounts',
  'authenticated cannot UPDATE paper_accounts');
select throws_ok(
  $$delete from public.paper_accounts where user_id = 'auth0|userA'$$,
  '42501', 'permission denied for table paper_accounts',
  'authenticated cannot DELETE from paper_accounts');

-- user_stats
select throws_ok(
  $$insert into public.user_stats(user_id) values ('auth0|userZ')$$,
  '42501', 'permission denied for table user_stats',
  'authenticated cannot INSERT into user_stats');
select throws_ok(
  $$update public.user_stats set xp_total = 999 where user_id = 'auth0|userA'$$,
  '42501', 'permission denied for table user_stats',
  'authenticated cannot UPDATE user_stats');
select throws_ok(
  $$delete from public.user_stats where user_id = 'auth0|userA'$$,
  '42501', 'permission denied for table user_stats',
  'authenticated cannot DELETE from user_stats');

-- events (write-only via RPC; direct writes still denied for authenticated)
select throws_ok(
  $$insert into public.events(user_id, name) values ('auth0|userA', 'session_start')$$,
  '42501', 'permission denied for table events',
  'authenticated cannot INSERT into events');
select throws_ok(
  $$update public.events set name = 'x' where user_id = 'auth0|userA'$$,
  '42501', 'permission denied for table events',
  'authenticated cannot UPDATE events');
select throws_ok(
  $$delete from public.events where user_id = 'auth0|userA'$$,
  '42501', 'permission denied for table events',
  'authenticated cannot DELETE from events');

-- app_config (reference table: readable, but still no direct writes)
select throws_ok(
  $$insert into public.app_config(key, value) values ('hacked', '"x"'::jsonb)$$,
  '42501', 'permission denied for table app_config',
  'authenticated cannot INSERT into app_config');
select throws_ok(
  $$update public.app_config set value = '"x"'::jsonb where key = 'min_age'$$,
  '42501', 'permission denied for table app_config',
  'authenticated cannot UPDATE app_config');
select throws_ok(
  $$delete from public.app_config where key = 'min_age'$$,
  '42501', 'permission denied for table app_config',
  'authenticated cannot DELETE from app_config');

-- instruments (reference table: readable, but still no direct writes)
select throws_ok(
  $$insert into public.instruments(symbol, name) values ('ZZZ', 'Bad Co')$$,
  '42501', 'permission denied for table instruments',
  'authenticated cannot INSERT into instruments');
select throws_ok(
  $$update public.instruments set name = 'x' where symbol = 'AAPL'$$,
  '42501', 'permission denied for table instruments',
  'authenticated cannot UPDATE instruments');
select throws_ok(
  $$delete from public.instruments where symbol = 'AAPL'$$,
  '42501', 'permission denied for table instruments',
  'authenticated cannot DELETE from instruments');

select * from finish();
rollback;
