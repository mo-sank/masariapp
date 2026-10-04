-- RLS cross-user isolation (Requirement 6.2, Property 1).
-- An authenticated session acting as user A reads only A's rows in every
-- user-owned table (profiles, consents, paper_accounts, user_stats); never B's.
-- Repeated with the subs swapped.

begin;
select plan(16);

create extension if not exists pgtap;
\set helpers_included on
\ir _helpers.sql

-- Seed two users' data with elevated privileges (bypasses RLS as the table owner).
insert into public.profiles(user_id, username, birth_year, age_band)
values
  ('auth0|userA', 'red-fox-11',   2010, '13-15'),
  ('auth0|userB', 'blue-owl-22',  2008, '16-17');

insert into public.consents(user_id, consent_type, version)
values
  ('auth0|userA', 'terms',   'v1'),
  ('auth0|userA', 'privacy', 'v1'),
  ('auth0|userB', 'terms',   'v1'),
  ('auth0|userB', 'privacy', 'v1');

insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents)
values
  ('auth0|userA', 1000000, 1000000),
  ('auth0|userB', 1000000, 1000000);

insert into public.user_stats(user_id)
values ('auth0|userA'), ('auth0|userB');

-- Acting as user A: sees only A's rows.
reset role;
select tests.set_authenticated_claims('auth0|userA');
set role authenticated;

select is(
  (select count(*)::int from public.profiles),
  1, 'A sees exactly one profile (own)');
select is(
  (select count(*)::int from public.profiles where user_id <> 'auth0|userA'),
  0, 'A sees no other users'' profiles');
select is(
  (select count(*)::int from public.consents where user_id <> 'auth0|userA'),
  0, 'A sees no other users'' consents');
select is(
  (select count(*)::int from public.consents),
  2, 'A sees exactly its own two consents');
select is(
  (select count(*)::int from public.paper_accounts where user_id <> 'auth0|userA'),
  0, 'A sees no other users'' paper_accounts');
select is(
  (select count(*)::int from public.paper_accounts),
  1, 'A sees exactly its own paper_account');
select is(
  (select count(*)::int from public.user_stats where user_id <> 'auth0|userA'),
  0, 'A sees no other users'' user_stats');
select is(
  (select count(*)::int from public.user_stats),
  1, 'A sees exactly its own user_stats');

-- Swap: acting as user B now sees only B's rows.
reset role;
select tests.set_authenticated_claims('auth0|userB');
set role authenticated;

select is(
  (select count(*)::int from public.profiles),
  1, 'B sees exactly one profile (own)');
select is(
  (select count(*)::int from public.profiles where user_id <> 'auth0|userB'),
  0, 'B sees no other users'' profiles');
select is(
  (select count(*)::int from public.consents where user_id <> 'auth0|userB'),
  0, 'B sees no other users'' consents');
select is(
  (select count(*)::int from public.consents),
  2, 'B sees exactly its own two consents');
select is(
  (select count(*)::int from public.paper_accounts where user_id <> 'auth0|userB'),
  0, 'B sees no other users'' paper_accounts');
select is(
  (select count(*)::int from public.paper_accounts),
  1, 'B sees exactly its own paper_account');
select is(
  (select count(*)::int from public.user_stats where user_id <> 'auth0|userB'),
  0, 'B sees no other users'' user_stats');
select is(
  (select count(*)::int from public.user_stats),
  1, 'B sees exactly its own user_stats');

select * from finish();
rollback;
