-- Supporting RPCs and the snapshot job (Market Data & Paper Trading
-- Requirements 6.2, 9.2, 12.1, 12.2).
-- Source of truth: docs/db-and-api-reference.md section 5.4 and the functions in
-- migration 20250105000007_supporting_rpcs.sql.
--
-- Covers:
--   submit_reflection (Req 9.2):
--     * feature_locked without post_trade_reflection,
--     * order_not_found for an order owned by someone else (ownership check),
--     * invalid_reflection for a bad expectation value,
--     * a happy-path reflection is written for the caller's own order,
--     * one-per-order: a second reflection on the same order raises
--       reflection_exists and the stored row is unchanged.
--   watchlist_add / watchlist_remove (Req 6.2):
--     * feature_locked without the watchlist unlock (add and remove),
--     * add is idempotent (re-adding a held symbol does not grow the list),
--     * the watchlist_max limit is enforced (watchlist_full past the max), and a
--       duplicate re-add while full is still fine (does not consume a slot),
--     * remove deletes the symbol and is idempotent (removing twice is a no-op),
--     * removing one frees a slot so a new symbol can be added.
--   snapshot_portfolios (Req 12.1, 12.2):
--     * writes one row per account per day with correct cash, positions value
--       (qty * current quote price), and equity = cash + positions value,
--     * an account with no positions still gets a row (positions value 0),
--     * running twice the same day updates the row, not duplicates it (and picks
--       up a changed quote), and the function is service-only (no grant to
--       authenticated / anon).
--
-- The user-facing RPCs are SECURITY DEFINER and derive the user from
-- current_user_id(). Tests set the JWT claims via _helpers.sql, act as the
-- `authenticated` client role, and seed instruments/quotes/accounts/orders/
-- unlocks as the privileged owner (which bypasses RLS). snapshot_portfolios is
-- invoked as the owner (service role), matching how pg_cron runs it.

begin;
select plan(32);

create extension if not exists pgtap;
\set helpers_included on
\ir _helpers.sql

-- ---------------------------------------------------------------------------
-- Config the RPCs read. watchlist_max is set to 2 here so the limit path is
-- cheap to exercise; ON CONFLICT keeps any seeded row otherwise.
-- ---------------------------------------------------------------------------
insert into public.app_config(key, value) values ('watchlist_max', '2')
  on conflict (key) do update set value = excluded.value;

-- ---------------------------------------------------------------------------
-- Instruments and quotes. Three starters so the watchlist limit and snapshot
-- math have real symbols to work with.
-- ---------------------------------------------------------------------------
insert into public.instruments(symbol, name, type, sector, is_starter, is_active, sort_order)
values
  ('AAA', 'Alpha Co',  'stock', 'Tech',    true, true, 1),
  ('BBB', 'Beta Co',   'stock', 'Tech',    true, true, 2),
  ('CCC', 'Gamma Co',  'stock', 'Finance', true, true, 3);

insert into public.quotes(symbol, price_cents, prev_close_cents, as_of, is_delayed, source, updated_at)
values
  ('AAA', 10000, 9900, now(), true, 'test', now()),  -- $100.00
  ('BBB',  5000, 4900, now(), true, 'test', now()),  -- $50.00
  ('CCC',  2500, 2400, now(), true, 'test', now());  -- $25.00

-- ===========================================================================
-- submit_reflection (Req 9.2)
-- ===========================================================================
-- User A owns an order; User Z owns a different order (used to prove the
-- ownership check). Orders are seeded directly as the owner (RLS bypassed).
reset role;
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userA', 'red-fox-11', 2008, '16-17', 'America/New_York');
insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents)
  values ('auth0|userA', 1000000, 1000000);
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userZ', 'zed-owl-99', 2008, '16-17', 'America/New_York');
insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents)
  values ('auth0|userZ', 1000000, 1000000);

-- A sell order for A and a sell order for Z.
insert into public.orders(account_id, user_id, symbol, side, qty, status,
    fill_price_cents, total_cents, realized_pl_cents, idempotency_key)
  values (
    (select id from public.paper_accounts where user_id='auth0|userA'),
    'auth0|userA', 'AAA', 'sell', 1, 'filled', 10000, 10000, 500, 'ord-A-sell-0001')
  returning id as a_order_id \gset
insert into public.orders(account_id, user_id, symbol, side, qty, status,
    fill_price_cents, total_cents, realized_pl_cents, idempotency_key)
  values (
    (select id from public.paper_accounts where user_id='auth0|userZ'),
    'auth0|userZ', 'BBB', 'sell', 1, 'filled', 5000, 5000, 100, 'ord-Z-sell-0001')
  returning id as z_order_id \gset

-- A acts without the post_trade_reflection unlock yet: feature_locked.
reset role;
select tests.set_authenticated_claims('auth0|userA');
set role authenticated;
select throws_ok(
  $$ select public.submit_reflection( (select id from public.orders where idempotency_key='ord-A-sell-0001'), 'better', 'nice') $$,
  'feature_locked',
  'submit_reflection without post_trade_reflection raises feature_locked');

-- Grant A the unlock.
reset role;
insert into public.user_unlocks(user_id, feature_key) values ('auth0|userA', 'post_trade_reflection');
set role authenticated;

-- A cannot reflect on Z's order: order_not_found (ownership check).
select throws_ok(
  $$ select public.submit_reflection( (select id from public.orders where idempotency_key='ord-Z-sell-0001'), 'better', 'sneaky') $$,
  'order_not_found',
  'reflecting on another users order raises order_not_found');

-- A bad expectation value is rejected.
select throws_ok(
  $$ select public.submit_reflection( (select id from public.orders where idempotency_key='ord-A-sell-0001'), 'amazing', null) $$,
  'invalid_reflection',
  'an invalid expectation value raises invalid_reflection');

-- Happy path: A reflects on A's own order.
select lives_ok(
  $$ select public.submit_reflection( (select id from public.orders where idempotency_key='ord-A-sell-0001'), 'as_expected', 'learned something') $$,
  'the owner can submit a reflection for their own order');

reset role;
select is((select count(*)::int from public.trade_reflections where order_id = (:'a_order_id')::uuid),
  1, 'exactly one reflection row exists for the order');
select is((select expectation from public.trade_reflections where order_id = (:'a_order_id')::uuid),
  'as_expected', 'the reflection records the submitted expectation');
select is((select note from public.trade_reflections where order_id = (:'a_order_id')::uuid),
  'learned something', 'the reflection records the submitted note');

-- One per order: a second reflection on the same order is rejected and leaves
-- the original row unchanged (Req 9.2 / unique on order_id).
set role authenticated;
select throws_ok(
  $$ select public.submit_reflection( (select id from public.orders where idempotency_key='ord-A-sell-0001'), 'worse', 'changed my mind') $$,
  'reflection_exists',
  'a second reflection on the same order raises reflection_exists');

reset role;
select is((select count(*)::int from public.trade_reflections where order_id = (:'a_order_id')::uuid),
  1, 'the rejected second reflection did not add a row');
select is((select expectation from public.trade_reflections where order_id = (:'a_order_id')::uuid),
  'as_expected', 'the original reflection is unchanged after a rejected duplicate');

-- ===========================================================================
-- watchlist_add / watchlist_remove (Req 6.2). watchlist_max = 2 (set above).
-- ===========================================================================
reset role;
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userW', 'wag-cat-22', 2008, '16-17', 'America/New_York');
insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents)
  values ('auth0|userW', 1000000, 1000000);

reset role;
select tests.set_authenticated_claims('auth0|userW');
set role authenticated;

-- No watchlist unlock yet: add and remove are both feature_locked.
select throws_ok(
  $$ select public.watchlist_add('AAA') $$,
  'feature_locked',
  'watchlist_add without the watchlist unlock raises feature_locked');
select throws_ok(
  $$ select public.watchlist_remove('AAA') $$,
  'feature_locked',
  'watchlist_remove without the watchlist unlock raises feature_locked');

-- Grant the unlock.
reset role;
insert into public.user_unlocks(user_id, feature_key) values ('auth0|userW', 'watchlist');
set role authenticated;

-- Add two symbols (fills the max of 2).
select lives_ok($$ select public.watchlist_add('AAA') $$, 'adding the first symbol succeeds');
select lives_ok($$ select public.watchlist_add('BBB') $$, 'adding the second symbol succeeds');

reset role;
select is((select count(*)::int from public.watchlist_items where user_id='auth0|userW'),
  2, 'the watchlist holds two symbols after two adds');

-- Re-adding a held symbol is idempotent: it does not grow the list and does not
-- trip the limit (it returns the existing row before the count check).
set role authenticated;
select lives_ok($$ select public.watchlist_add('AAA') $$, 're-adding a held symbol is idempotent (no error)');
reset role;
select is((select count(*)::int from public.watchlist_items where user_id='auth0|userW'),
  2, 'the idempotent re-add did not add a duplicate row');

-- A genuinely new third symbol exceeds watchlist_max (2): watchlist_full.
set role authenticated;
select throws_ok(
  $$ select public.watchlist_add('CCC') $$,
  'watchlist_full',
  'adding past watchlist_max raises watchlist_full');

-- Remove one symbol, which frees a slot...
select lives_ok($$ select public.watchlist_remove('AAA') $$, 'removing a held symbol succeeds');
reset role;
select is((select count(*)::int from public.watchlist_items where user_id='auth0|userW'),
  1, 'the watchlist holds one symbol after a remove');
select ok(
  not exists (select 1 from public.watchlist_items where user_id='auth0|userW' and symbol='AAA'),
  'the removed symbol is gone from the watchlist');

-- ...so adding the previously-rejected third symbol now succeeds.
set role authenticated;
select lives_ok($$ select public.watchlist_add('CCC') $$, 'a freed slot allows a new symbol to be added');

-- Remove is idempotent: removing a symbol that is not present is a no-op.
select lives_ok($$ select public.watchlist_remove('AAA') $$, 'removing an absent symbol is a harmless no-op');
reset role;
select is((select count(*)::int from public.watchlist_items where user_id='auth0|userW'),
  2, 'the no-op remove left the two held symbols intact');

-- ===========================================================================
-- snapshot_portfolios (Req 12.1, 12.2) — service-only daily job.
-- User S has a 3-share AAA position ($100) and a 4-share CCC position ($25):
-- positions value = 300*? ... 3*10000 + 4*2500 = 30000 + 10000 = 40000.
-- cash = 123456. equity = 163456.
-- User E (empty) has no positions: positions value 0, equity = cash.
-- ===========================================================================
reset role;
insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userS', 'sun-ram-33', 2008, '16-17', 'America/New_York');
insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents)
  values ('auth0|userS', 123456, 1000000);
insert into public.positions(account_id, symbol, qty, cost_basis_cents) values
  ((select id from public.paper_accounts where user_id='auth0|userS'), 'AAA', 3, 29000),
  ((select id from public.paper_accounts where user_id='auth0|userS'), 'CCC', 4, 9000);

insert into public.profiles(user_id, username, birth_year, age_band, timezone)
  values ('auth0|userE', 'elk-doe-44', 2008, '16-17', 'America/New_York');
insert into public.paper_accounts(user_id, cash_cents, starting_cash_cents)
  values ('auth0|userE', 777777, 1000000);

-- Run the job as the owner (service role), matching how pg_cron invokes it.
select public.snapshot_portfolios();

-- User S's snapshot: cash 123456, positions 40000, equity 163456.
select is(
  (select positions_value_cents from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userS')
       and snap_date=(now() at time zone 'America/New_York')::date),
  40000::bigint,
  'snapshot positions value = sum(qty * current quote price)');
select is(
  (select cash_cents from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userS')
       and snap_date=(now() at time zone 'America/New_York')::date),
  123456::bigint,
  'snapshot cash equals the account cash');
select is(
  (select equity_cents from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userS')
       and snap_date=(now() at time zone 'America/New_York')::date),
  163456::bigint,
  'snapshot equity = cash + positions value');

-- User E (no positions) still gets a row with positions value 0, equity = cash.
select is(
  (select equity_cents from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userE')
       and snap_date=(now() at time zone 'America/New_York')::date),
  777777::bigint,
  'an account with no positions gets equity = cash (positions value 0)');

-- Idempotency (Req 12.2): raise a quote, run again the same day; the row is
-- UPDATED (new value), not duplicated.
update public.quotes set price_cents = 20000, updated_at = now() where symbol = 'AAA';  -- $200
select public.snapshot_portfolios();

select is(
  (select count(*)::int from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userS')
       and snap_date=(now() at time zone 'America/New_York')::date),
  1,
  'running the snapshot twice in one day does not duplicate the row');
select is(
  (select positions_value_cents from public.portfolio_snapshots
     where account_id=(select id from public.paper_accounts where user_id='auth0|userS')
       and snap_date=(now() at time zone 'America/New_York')::date),
  70000::bigint,  -- 3*20000 + 4*2500 = 60000 + 10000
  'the second run updated positions value to reflect the new quote');

-- snapshot_portfolios is service-only: it must NOT be executable by the client
-- roles (no grant was issued; the foundation migration revoked public/anon).
select ok(
  not has_function_privilege('authenticated', 'public.snapshot_portfolios()', 'execute'),
  'snapshot_portfolios is NOT executable by authenticated (service-only)');
select ok(
  not has_function_privilege('anon', 'public.snapshot_portfolios()', 'execute'),
  'snapshot_portfolios is NOT executable by anon (service-only)');

select * from finish();
rollback;
