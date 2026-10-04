-- log_events RPC (Requirement 9.2/9.4, Property 4).
-- Covers:
--   * a batch of allowlisted events is inserted for the caller and attributed to
--     their Auth0 sub (and returns the inserted count),
--   * an unknown event name is rejected and the WHOLE batch is rolled back
--     (nothing is partially inserted),
--   * batches larger than 50 events are rejected (too_many_events),
--   * a non-array payload is rejected (invalid_payload),
--   * disallowed prop keys (email/token/text) are scrubbed before insert, while
--     allowed props survive,
--   * optional fields (session_id, app_version, client_ts) are stored, and an
--     absent client_ts is stored as NULL.
--
-- log_events is SECURITY DEFINER and derives the user from
-- public.current_user_id() (auth.jwt() ->> 'sub'), so these tests set the JWT
-- claims via the shared _helpers.sql and invoke the RPC while acting as the
-- `authenticated` client role — exactly how the app calls it. Clients cannot
-- SELECT events (SELECT is revoked), so after each RPC call the test drops back
-- to the owning role (`reset role`) to inspect the inserted rows.

begin;
select plan(15);

create extension if not exists pgtap;
\set helpers_included on
\ir _helpers.sql

-- A profile row is required because events.user_id references profiles(user_id).
insert into public.profiles(user_id, username, birth_year, age_band)
  values ('auth0|userA', 'red-fox-11', 2010, '13-15'),
         ('auth0|userB', 'blue-jay-22', 2010, '13-15');

-- ---------------------------------------------------------------------------
-- A valid batch of allowlisted events is inserted for the caller.
-- ---------------------------------------------------------------------------
reset role;
select tests.set_authenticated_claims('auth0|userA');
set role authenticated;

select is(
  public.log_events($$[
    {"name":"session_start","session_id":"s1","app_version":"1.0.0","client_ts":"2025-01-01T00:00:00Z"},
    {"name":"onboarding_completed","props":{"source":"onboarding"}}
  ]$$::jsonb),
  2,
  'log_events returns the number of inserted events');

reset role;
select is((select count(*)::int from public.events where user_id = 'auth0|userA'),
  2, 'both allowlisted events are inserted for the caller');
select is(
  (select array_agg(name order by name) from public.events where user_id = 'auth0|userA'),
  array['onboarding_completed','session_start']::text[],
  'the inserted event names match the batch');
select is(
  (select session_id from public.events where user_id = 'auth0|userA' and name = 'session_start'),
  's1', 'session_id is stored');
select is(
  (select app_version from public.events where user_id = 'auth0|userA' and name = 'session_start'),
  '1.0.0', 'app_version is stored');
select is(
  (select client_ts from public.events where user_id = 'auth0|userA' and name = 'session_start'),
  '2025-01-01T00:00:00Z'::timestamptz, 'client_ts is parsed and stored');
select is(
  (select client_ts from public.events where user_id = 'auth0|userA' and name = 'onboarding_completed'),
  null, 'an absent client_ts is stored as NULL');
select is(
  (select props from public.events where user_id = 'auth0|userA' and name = 'onboarding_completed'),
  '{"source":"onboarding"}'::jsonb, 'allowed props are preserved');

-- ---------------------------------------------------------------------------
-- An unknown event name is rejected and the whole batch is rolled back.
-- ---------------------------------------------------------------------------
reset role;
select tests.set_authenticated_claims('auth0|userB');
set role authenticated;

select throws_ok(
  $$ select public.log_events('[{"name":"session_start"},{"name":"totally_made_up"}]'::jsonb) $$,
  'P0001',
  'unknown_event_name: totally_made_up',
  'log_events rejects an unknown event name');

reset role;
select is((select count(*)::int from public.events where user_id = 'auth0|userB'),
  0, 'a batch containing an unknown name inserts nothing (atomic)');

-- ---------------------------------------------------------------------------
-- Over-size and malformed payloads are rejected.
-- ---------------------------------------------------------------------------
reset role;
select tests.set_authenticated_claims('auth0|userA');
set role authenticated;

-- 51 allowlisted events: one over the cap.
select throws_ok(
  $$ select public.log_events(
       (select jsonb_agg(jsonb_build_object('name','session_start'))
          from generate_series(1, 51))) $$,
  'P0001', 'too_many_events',
  'log_events rejects a batch larger than 50 events');

-- A non-array payload is rejected.
select throws_ok(
  $$ select public.log_events('{"name":"session_start"}'::jsonb) $$,
  'P0001', 'invalid_payload',
  'log_events rejects a non-array payload');

-- ---------------------------------------------------------------------------
-- Disallowed prop keys are scrubbed; the event is still inserted.
-- ---------------------------------------------------------------------------
select is(
  public.log_events($$[
    {"name":"session_start","props":{"email":"a@b.com","token":"secret","text":"free typing","ok":1}}
  ]$$::jsonb),
  1, 'an event with disallowed prop keys is still accepted');

reset role;
select is(
  (select props from public.events
     where user_id = 'auth0|userA' and name = 'session_start'
       and props ? 'ok'),
  '{"ok":1}'::jsonb,
  'email/token/text keys are stripped; the allowed key survives');

-- ---------------------------------------------------------------------------
-- An empty batch is a no-op that returns zero.
-- ---------------------------------------------------------------------------
reset role;
select tests.set_authenticated_claims('auth0|userB');
set role authenticated;

select is(public.log_events('[]'::jsonb), 0, 'an empty batch inserts nothing and returns 0');

select * from finish();
rollback;
