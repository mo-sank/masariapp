-- Market data and paper trading migration (task 7): the supporting RPCs and the
-- daily portfolio-snapshot job.
-- Source of truth: docs/db-and-api-reference.md section 5.4 (behaviors) and 5.5
-- (the snapshot-portfolios schedule).
--
-- Clients hold only SELECT on trade_reflections, watchlist_items and
-- portfolio_snapshots (see 20250105000003_market_trading_rls_and_grants.sql), so
-- every write to those tables goes through a SECURITY DEFINER RPC here, each of
-- which derives the user from public.current_user_id() (never from an argument)
-- and runs with set search_path = public. The grant/revoke posture mirrors the
-- other RPC migrations: the foundation RLS/grants migration revoked execute from
-- public/anon on every function, so the three user-facing RPCs grant execute to
-- `authenticated` individually. snapshot_portfolios is a service-only job and is
-- deliberately NOT granted to authenticated/anon.
--
-- Functions:
--   * submit_reflection(p_order_id, p_expectation, p_note) — Requirement 9.2.
--     Requires the post_trade_reflection unlock and that the order belongs to the
--     caller; inserts exactly one reflection per order (order_id is unique).
--   * watchlist_add(p_symbol) / watchlist_remove(p_symbol) — Requirement 6.2.
--     Require the `watchlist` unlock. Add enforces the app_config.watchlist_max
--     limit and is idempotent (re-adding a held symbol is a no-op, does not
--     consume a slot). Remove is idempotent (removing an absent symbol is fine).
--   * snapshot_portfolios() — Requirements 12.1, 12.2. Service-only. Writes
--     today's portfolio_snapshots row per account: cash_cents from the account,
--     positions_value_cents from current quotes (qty * price_cents summed over
--     the account's positions), equity_cents = cash + positions value. Keyed on
--     (account_id, snap_date) with ON CONFLICT update so a second run the same
--     day updates the row instead of duplicating it.
--
-- Error codes raised (surfaced as friendly text by the client):
--   not_authenticated, feature_locked, order_not_found, reflection_exists,
--   invalid_reflection, symbol_not_available, watchlist_full.

-- ---------------------------------------------------------------------------
-- submit_reflection (Requirement 9.2)
-- ---------------------------------------------------------------------------
create or replace function public.submit_reflection(
  p_order_id uuid, p_expectation text, p_note text default null)
returns public.trade_reflections
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := public.current_user_id();
  v_order public.orders;
  v_reflection public.trade_reflections;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- Reflection is gated behind its own feature unlock (Req 9.2).
  if not exists (
       select 1 from user_unlocks where user_id = v_uid and feature_key = 'post_trade_reflection')
    then raise exception 'feature_locked'; end if;

  -- Shape validation: expectation is one of the three allowed values; the note
  -- is optional and clamped to the 280-char column limit.
  if p_expectation is null or p_expectation not in ('better','as_expected','worse')
    then raise exception 'invalid_reflection'; end if;

  -- The order must exist AND belong to the caller. Deriving ownership from the
  -- order's user_id (not an argument) means another user's order id yields
  -- order_not_found rather than leaking that it exists.
  select * into v_order from orders where id = p_order_id and user_id = v_uid;
  if not found then raise exception 'order_not_found'; end if;

  -- One reflection per order (order_id is unique). A repeat is rejected rather
  -- than silently overwriting the first reflection.
  if exists (select 1 from trade_reflections where order_id = p_order_id) then
    raise exception 'reflection_exists';
  end if;

  insert into trade_reflections(order_id, user_id, expectation, note)
    values (p_order_id, v_uid, p_expectation, left(p_note, 280))
    returning * into v_reflection;
  return v_reflection;
end $$;

-- Postgres grants EXECUTE to PUBLIC by default on a new function, so revoke that
-- first (the foundation migration's blanket revoke predates this function) and
-- then grant only `authenticated` — never anon, per section 4's "nothing for
-- anon" posture.
revoke execute on function public.submit_reflection(uuid, text, text) from public, anon;
grant execute on function public.submit_reflection(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- watchlist_add (Requirement 6.2)
-- ---------------------------------------------------------------------------
create or replace function public.watchlist_add(p_symbol text)
returns public.watchlist_items
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := public.current_user_id();
  v_max int;
  v_count int;
  v_existing public.watchlist_items;
  v_item public.watchlist_items;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- Watchlist is gated behind the `watchlist` unlock (Req 6.2).
  if not exists (
       select 1 from user_unlocks where user_id = v_uid and feature_key = 'watchlist')
    then raise exception 'feature_locked'; end if;

  -- The symbol must be a real, active instrument.
  if not exists (select 1 from instruments where symbol = p_symbol and is_active)
    then raise exception 'symbol_not_available'; end if;

  -- Idempotent: if the symbol is already on the list, return it unchanged and do
  -- NOT consume a slot or re-stamp added_at.
  select * into v_existing from watchlist_items where user_id = v_uid and symbol = p_symbol;
  if found then return v_existing; end if;

  -- Enforce the configured maximum (default 5) only for a genuinely new symbol.
  v_max := coalesce((select (value)::int from app_config where key = 'watchlist_max'), 5);
  select count(*) into v_count from watchlist_items where user_id = v_uid;
  if v_count >= v_max then raise exception 'watchlist_full'; end if;

  insert into watchlist_items(user_id, symbol) values (v_uid, p_symbol)
    returning * into v_item;
  return v_item;
end $$;

revoke execute on function public.watchlist_add(text) from public, anon;
grant execute on function public.watchlist_add(text) to authenticated;

-- ---------------------------------------------------------------------------
-- watchlist_remove (Requirement 6.2)
-- ---------------------------------------------------------------------------
create or replace function public.watchlist_remove(p_symbol text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := public.current_user_id();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- Watchlist is gated behind the `watchlist` unlock (Req 6.2).
  if not exists (
       select 1 from user_unlocks where user_id = v_uid and feature_key = 'watchlist')
    then raise exception 'feature_locked'; end if;

  -- Idempotent: removing a symbol that is not on the list is a harmless no-op.
  delete from watchlist_items where user_id = v_uid and symbol = p_symbol;
end $$;

revoke execute on function public.watchlist_remove(text) from public, anon;
grant execute on function public.watchlist_remove(text) to authenticated;

-- ---------------------------------------------------------------------------
-- snapshot_portfolios (Requirements 12.1, 12.2) — service-only
-- ---------------------------------------------------------------------------
-- Writes one portfolio_snapshots row per account for TODAY (ET), computing
-- positions value from current quotes. Idempotent per account/day via the
-- primary key (account_id, snap_date): a second run the same day updates the
-- existing row rather than inserting a duplicate (Req 12.2). The snapshot date
-- is the US/Eastern calendar day so "today" matches the market's trading day
-- regardless of the server's UTC clock.
--
-- A position whose symbol has no quote contributes 0 to positions value rather
-- than aborting the whole run; this keeps the nightly job resilient to a missing
-- quote. Accounts with no positions still get a row (positions value 0, equity =
-- cash) so every account has a daily record (Req 12.1).
create or replace function public.snapshot_portfolios()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
  v_count int;
begin
  insert into portfolio_snapshots(account_id, snap_date, cash_cents, positions_value_cents, equity_cents)
  select
    a.id,
    v_today,
    a.cash_cents,
    coalesce(pv.positions_value_cents, 0),
    a.cash_cents + coalesce(pv.positions_value_cents, 0)
  from paper_accounts a
  left join (
    select p.account_id, sum(p.qty * q.price_cents)::bigint as positions_value_cents
    from positions p
    join quotes q on q.symbol = p.symbol
    group by p.account_id
  ) pv on pv.account_id = a.id
  on conflict (account_id, snap_date) do update
    set cash_cents = excluded.cash_cents,
        positions_value_cents = excluded.positions_value_cents,
        equity_cents = excluded.equity_cents;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- snapshot_portfolios is a service-only job invoked by pg_cron below. Postgres
-- grants EXECUTE to PUBLIC by default on every new function, so we must
-- explicitly revoke it here (the foundation RLS/grants migration's blanket
-- "revoke execute on all functions ... from public, anon" ran before this
-- function existed and so does not cover it). After this revoke, only
-- privileged roles (the function owner / service_role, which bypasses these
-- grants) can run it — never authenticated or anon.
revoke execute on function public.snapshot_portfolios() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Schedule: snapshot-portfolios after the close (DB reference 5.5).
-- ---------------------------------------------------------------------------
-- This job calls a DB function directly, so it needs pg_cron but NOT pg_net
-- (no outbound HTTP). The schedule '30 21 * * 1-5' is UTC (pg_cron uses the
-- server's UTC clock): 21:30 UTC is 17:30 ET during Eastern Daylight Time and
-- 16:30 ET during Standard Time, i.e. a half hour after the 16:00 ET close in
-- both DST states, so the snapshot captures the final close.
create extension if not exists pg_cron with schema pg_catalog;

-- Replace any prior definition so this migration is safe to re-run (pg_cron
-- errors on a duplicate job name).
select cron.unschedule('snapshot-portfolios')
where exists (select 1 from cron.job where jobname = 'snapshot-portfolios');

select cron.schedule(
  'snapshot-portfolios',
  '30 21 * * 1-5',
  $cron$ select public.snapshot_portfolios(); $cron$
);
