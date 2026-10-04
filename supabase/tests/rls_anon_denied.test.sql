-- Anon denial (Requirement 6.4, Property 3).
-- The anon role (no token / cleared claims) reads zero rows from every table
-- this spec owns. anon has no table SELECT grant and no policies, so a SELECT
-- either errors (permission denied) or returns nothing; this test asserts the
-- "returns nothing" outcome using throws/lives as appropriate.

begin;
select plan(7);

create extension if not exists pgtap;
\set helpers_included on
\ir _helpers.sql

-- Seed data as the privileged owner so there IS data that must stay hidden.
insert into public.app_config(key, value) values ('probe', '"x"'::jsonb)
  on conflict (key) do nothing;
insert into public.instruments(symbol, name) values ('AAPL', 'Apple Inc.')
  on conflict (symbol) do nothing;
insert into public.profiles(user_id, username, birth_year, age_band)
  values ('auth0|userA', 'red-fox-11', 2010, '13-15');
insert into public.consents(user_id, consent_type, version)
  values ('auth0|userA', 'terms', 'v1');
insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents)
  values ('auth0|userA', 1000000, 1000000);
insert into public.user_stats(user_id) values ('auth0|userA');
insert into public.events(user_id, name) values ('auth0|userA', 'session_start');

-- Switch to the anon role with no identity.
reset role;
select tests.clear_claims();
set role anon;

-- anon has no SELECT privilege on any of these tables, so each SELECT raises
-- "permission denied". throws_ok confirms the read is rejected.
select throws_ok(
  'select * from public.app_config',
  '42501', 'permission denied for table app_config',
  'anon cannot read app_config');
select throws_ok(
  'select * from public.instruments',
  '42501', 'permission denied for table instruments',
  'anon cannot read instruments');
select throws_ok(
  'select * from public.profiles',
  '42501', 'permission denied for table profiles',
  'anon cannot read profiles');
select throws_ok(
  'select * from public.consents',
  '42501', 'permission denied for table consents',
  'anon cannot read consents');
select throws_ok(
  'select * from public.paper_accounts',
  '42501', 'permission denied for table paper_accounts',
  'anon cannot read paper_accounts');
select throws_ok(
  'select * from public.user_stats',
  '42501', 'permission denied for table user_stats',
  'anon cannot read user_stats');
select throws_ok(
  'select * from public.events',
  '42501', 'permission denied for table events',
  'anon cannot read events');

select * from finish();
rollback;
