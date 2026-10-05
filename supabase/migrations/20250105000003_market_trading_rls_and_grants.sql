-- Market data and paper trading migration: RLS policies and grants for the
-- tables this spec adds.
-- Source of truth: docs/db-and-api-reference.md section 4.
--
-- Scope: the tables created in 20250105000001_market_data.sql and
-- 20250105000002_trading_ledger.sql — quotes, quote_bars, market_holidays,
-- positions, orders, trade_reflections, watchlist_items, portfolio_snapshots.
-- (instruments and paper_accounts already have RLS + grants from the foundation
-- spec's 20250103000006_rls_and_grants.sql.)
--
-- The foundation migration's schema-wide revoke/grant/default-privilege
-- statements only applied to tables that existed when it ran, so this migration
-- re-applies the section-4 default-deny + SELECT grant to the newly created
-- tables explicitly: default deny for anon, SELECT-only for authenticated,
-- never direct writes. All writes go through SECURITY DEFINER RPCs (tasks 4-7).

-- Enable RLS on every table this migration governs.
do $$
declare t text;
begin
  foreach t in array array[
    'quotes','quote_bars','market_holidays',
    'positions','orders','trade_reflections','watchlist_items','portfolio_snapshots']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

-- Reference tables: readable by any signed-in user.
do $$
declare t text;
begin
  foreach t in array array['quotes','quote_bars','market_holidays']
  loop execute format('create policy "read reference" on public.%I for select to authenticated using (true)', t); end loop;
end $$;

-- User-owned tables: owner can read own rows (keyed by user_id).
do $$
declare t text;
begin
  foreach t in array array['orders','trade_reflections','watchlist_items']
  loop execute format('create policy "own rows" on public.%I for select to authenticated using (user_id = (select public.current_user_id()))', t); end loop;
end $$;

-- Account-keyed tables: read through account ownership.
create policy "own positions" on public.positions for select to authenticated
  using (account_id in (select id from public.paper_accounts where user_id = (select public.current_user_id())));
create policy "own snapshots" on public.portfolio_snapshots for select to authenticated
  using (account_id in (select id from public.paper_accounts where user_id = (select public.current_user_id())));

-- Privileges: nothing for anon; signed-in users can only SELECT; no direct
-- writes. Applied per table because the foundation spec's schema-wide statements
-- predate these tables.
revoke all on
  public.quotes, public.quote_bars, public.market_holidays,
  public.positions, public.orders, public.trade_reflections,
  public.watchlist_items, public.portfolio_snapshots
  from anon, authenticated;
grant select on
  public.quotes, public.quote_bars, public.market_holidays,
  public.positions, public.orders, public.trade_reflections,
  public.watchlist_items, public.portfolio_snapshots
  to authenticated;

-- market_is_open() is read-only and useful to the client market-status banner.
grant execute on function public.market_is_open(timestamptz) to authenticated;
