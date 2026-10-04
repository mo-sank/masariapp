-- events are write-only (Requirement 6.3/6.5, Property 4, and Requirement 9).
-- events are appended only through the log_events RPC and are never readable by
-- clients: the table has no SELECT policy and SELECT is revoked from
-- authenticated, so an authenticated session cannot read events at all.

begin;
select plan(3);

create extension if not exists pgtap;
\set helpers_included on
\ir _helpers.sql

-- Seed an event as the privileged owner so there IS a row that must stay hidden.
insert into public.profiles(user_id, username, birth_year, age_band)
  values ('auth0|userA', 'red-fox-11', 2010, '13-15');
insert into public.events(user_id, name) values ('auth0|userA', 'session_start');

-- The authenticated client role has SELECT revoked on events.
reset role;
select tests.set_authenticated_claims('auth0|userA');
set role authenticated;

select throws_ok(
  'select * from public.events',
  '42501', 'permission denied for table events',
  'authenticated cannot SELECT events (write-only)');

-- events must also have NO row-level SELECT policy defined (write-only).
select is(
  (select count(*)::int
     from pg_policies
    where schemaname = 'public' and tablename = 'events' and cmd = 'SELECT'),
  0, 'events has no SELECT policy');

-- RLS must be enabled on events.
select is(
  (select relrowsecurity from pg_class where oid = 'public.events'::regclass),
  true, 'RLS is enabled on events');

select * from finish();
rollback;
