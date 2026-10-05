-- Market data and paper trading migration (task 6): the place_market_order RPC
-- and its grant.
-- Source of truth: docs/db-and-api-reference.md section 5.2.
--
-- place_market_order is the SECURITY DEFINER write path the order ticket calls.
-- Clients hold only SELECT on the ledger tables (paper_accounts, positions,
-- orders), so this function performs every write under its definer privileges
-- and does it all in one transaction (Requirement 8.4). It:
--   * derives the user from public.current_user_id() (never from an argument),
--   * locks the caller's paper_accounts row FOR UPDATE so concurrent orders for
--     the same user serialize behind one another with no negative cash and no
--     negative shares (Requirement 8.8),
--   * is idempotent on (account_id, idempotency_key): a repeat call with the
--     same key returns the original order and changes no balances (Req 8.5),
--   * validates the order shape (side, quantity 1..100000, an idempotency key of
--     at least 8 chars) and the price never comes from the client (Req 8.1),
--   * enforces the per-side feature unlock: market_buy for buys and
--     market_sell for sells, else raises feature_locked (Req 8.2, 8.3),
--   * requires an active, eligible instrument: non-starter symbols need the
--     full_universe unlock, else symbol_not_available (Req 8.2),
--   * reads the server-side quote; while the market is open a quote older than
--     app_config.quote_stale_minutes raises quote_stale; a missing quote raises
--     no_quote,
--   * buys: require enough cash (insufficient_cash) and keep the resulting
--     position value within starter_position_cap_cents unless the user has the
--     raise_cap unlock (position_cap_exceeded); then debit cash and upsert
--     the position, accumulating total cost basis (Req 8.2),
--   * sells: require enough shares (insufficient_shares); realized P&L is the
--     proceeds minus the PROPORTIONAL cost basis removed, rounded to the nearest
--     cent (a full sell removes the whole basis exactly); then credit cash and
--     reduce or delete the position (Req 8.3),
--   * records price_source as 'delayed_quote' while the market is open and
--     'last_close' when it is closed (Req 8.6), and clamps rationale_text to the
--     280-char column limit.
--
-- Error codes raised (surfaced as friendly text by the client, Req 8.7):
--   not_authenticated, no_account, invalid_order, feature_locked,
--   symbol_not_available, no_quote, quote_stale, insufficient_cash,
--   position_cap_exceeded, insufficient_shares.
--
-- This mirrors the draft in section 5.2 with the app_config coalesce fallbacks
-- kept so the function is safe even if a config key is missing.

create or replace function public.place_market_order(
  p_symbol text, p_side text, p_qty bigint, p_idempotency_key text,
  p_rationale_tags text[] default '{}', p_rationale_text text default null)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := public.current_user_id();
  v_acct public.paper_accounts;
  v_inst public.instruments;
  v_q public.quotes;
  v_pos public.positions;
  v_existing public.orders;
  v_order public.orders;
  v_total bigint;
  v_cap bigint;
  v_stale int;
  v_basis_removed bigint;
  v_realized bigint;
  v_open boolean := public.market_is_open();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- Lock this user's account row so concurrent orders serialize (Req 8.8).
  select * into v_acct from paper_accounts where user_id = v_uid for update;
  if not found then raise exception 'no_account'; end if;

  -- Idempotency: a repeat of the same key returns the original order untouched.
  select * into v_existing from orders
    where account_id = v_acct.id and idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;

  -- Shape validation. The client never sends a price (Req 8.1).
  if p_side not in ('buy','sell') or p_qty is null or p_qty < 1 or p_qty > 100000
     or p_idempotency_key is null or length(p_idempotency_key) < 8
    then raise exception 'invalid_order'; end if;

  -- Per-side feature gate (Req 8.2, 8.3).
  if not exists (
       select 1 from user_unlocks where user_id = v_uid
         and feature_key = case p_side when 'buy' then 'market_buy' else 'market_sell' end)
    then raise exception 'feature_locked'; end if;

  -- Instrument must be active and eligible; non-starter needs full_universe.
  select * into v_inst from instruments where symbol = p_symbol and is_active;
  if not found then raise exception 'symbol_not_available'; end if;
  if not v_inst.is_starter and not exists (
       select 1 from user_unlocks where user_id = v_uid and feature_key = 'full_universe')
    then raise exception 'symbol_not_available'; end if;

  -- Server-side quote. Reject a stale quote only while the market is open.
  select * into v_q from quotes where symbol = p_symbol;
  if not found then raise exception 'no_quote'; end if;
  v_stale := coalesce((select (value)::int from app_config where key = 'quote_stale_minutes'), 30);
  if v_open and v_q.updated_at < now() - make_interval(mins => v_stale) then
    raise exception 'quote_stale';
  end if;

  v_total := v_q.price_cents * p_qty;

  if p_side = 'buy' then
    if v_acct.cash_cents < v_total then raise exception 'insufficient_cash'; end if;

    v_cap := coalesce((select (value)::bigint from app_config where key = 'starter_position_cap_cents'), 100000);
    select * into v_pos from positions where account_id = v_acct.id and symbol = p_symbol for update;
    if (coalesce(v_pos.qty, 0) + p_qty) * v_q.price_cents > v_cap
       and not exists (select 1 from user_unlocks where user_id = v_uid and feature_key = 'raise_cap')
      then raise exception 'position_cap_exceeded'; end if;

    update paper_accounts set cash_cents = cash_cents - v_total where id = v_acct.id;
    insert into positions(account_id, symbol, qty, cost_basis_cents)
      values (v_acct.id, p_symbol, p_qty, v_total)
      on conflict (account_id, symbol) do update
      set qty = positions.qty + excluded.qty,
          cost_basis_cents = positions.cost_basis_cents + excluded.cost_basis_cents,
          updated_at = now();
    v_realized := null;
  else
    select * into v_pos from positions where account_id = v_acct.id and symbol = p_symbol for update;
    if not found or v_pos.qty < p_qty then raise exception 'insufficient_shares'; end if;

    -- Proportional cost basis removed; a full sell removes the whole basis so
    -- rounding never leaves a residual cent on the position (Req 8.3).
    v_basis_removed := case when v_pos.qty = p_qty then v_pos.cost_basis_cents
                            else round(v_pos.cost_basis_cents::numeric * p_qty / v_pos.qty)::bigint end;
    v_realized := v_total - v_basis_removed;

    update paper_accounts set cash_cents = cash_cents + v_total where id = v_acct.id;
    if v_pos.qty = p_qty then
      delete from positions where account_id = v_acct.id and symbol = p_symbol;
    else
      update positions
        set qty = qty - p_qty,
            cost_basis_cents = cost_basis_cents - v_basis_removed,
            updated_at = now()
        where account_id = v_acct.id and symbol = p_symbol;
    end if;
  end if;

  insert into orders(
      account_id, user_id, symbol, side, qty, status, fill_price_cents, total_cents, realized_pl_cents,
      price_as_of, price_source, rationale_tags, rationale_text, idempotency_key)
  values (
      v_acct.id, v_uid, p_symbol, p_side, p_qty, 'filled', v_q.price_cents, v_total, v_realized,
      v_q.as_of, case when v_open then 'delayed_quote' else 'last_close' end,
      coalesce(p_rationale_tags, '{}'), left(p_rationale_text, 280), p_idempotency_key)
  returning * into v_order;
  return v_order;
end $$;

-- The client calls this RPC; grant execute to the authenticated role only
-- (the foundation RLS/grants migration revoked execute from public/anon).
grant execute on function public.place_market_order(text, text, bigint, text, text[], text)
  to authenticated;
