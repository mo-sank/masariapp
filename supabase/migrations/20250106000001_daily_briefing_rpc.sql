-- Progression, Unlocks & Evaluation migration (task 6): the get_daily_briefing
-- RPC and its grant.
-- Source of truth: docs/db-and-api-reference.md (the RPC section) and the design
-- "Server" note: get_daily_briefing() requires the daily_briefing unlock and
-- returns json { top_gainer, top_loser (starter stocks, % change from
-- prev_close), portfolio_day_change_cents, market_state, tip_index } where
-- tip_index = day-of-year mod tip count; the tip templates themselves live in the
-- client as a reviewed list (requirements 4.1-4.4).
--
-- get_daily_briefing is a read-only SECURITY DEFINER RPC. It derives the user
-- from public.current_user_id() (never from an argument), runs with
-- set search_path = public, and like every other gated RPC it RE-ENFORCES the
-- unlock the client checks (Progression requirement 1.4): it fails closed with
-- feature_locked when the caller lacks the daily_briefing unlock, so the server
-- is the real boundary, not the UI gate.
--
-- The whole briefing is assembled from STORED quotes — no AI-generated text and
-- no recommendations (requirement 4.4). Specifically:
--   * card 1 (requirement 4.2): the top gainer and top loser among STARTER
--     stocks, by percent change from prev_close. Only instruments that are
--     active starters AND have a quote with a non-null, positive prev_close are
--     considered (a symbol with no usable prior close cannot have a day change).
--     change_bps is in basis points (hundredths of a percent) computed in
--     integer cents: round((price - prev_close) * 10000 / prev_close). When
--     fewer than one such stock exists both are null and the client hides card 1.
--   * card 2 (requirement 4.2): the caller's portfolio day change in cents —
--     the sum over the caller's positions of qty * (price_cents -
--     prev_close_cents), using only positions whose quote has a prev_close. A
--     user with no account or no positions gets 0 (a flat day), never an error.
--   * card 3 (requirement 4.2 / 4.3): a tip_index selecting one of the client's
--     reviewed "why prices move" templates. tip_index = day-of-year (ET) mod the
--     tip count, so it rotates once per day and is stable within a day. The tip
--     COUNT lives in app_config.briefing_tip_count (default 6) so the server and
--     the client's template list agree on the modulus; the client clamps anyway.
--   * market_state (requirement 4.3): public.market_session() — 'regular',
--     'extended', or 'closed'. When the market is not in its regular session the
--     figures above come from the last stored quote (its price IS the last
--     close), and market_state lets the client say so ("As of last close").
--
-- Error codes raised (surfaced as friendly text by the client):
--   not_authenticated, feature_locked.

create or replace function public.get_daily_briefing()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := public.current_user_id();
  v_top_gainer jsonb;
  v_top_loser jsonb;
  v_portfolio_day_change_cents bigint;
  v_market_state text := public.market_session();
  v_tip_count int;
  v_tip_index int;
  v_doy int := extract(doy from (now() at time zone 'America/New_York'))::int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- Server-side gate: re-enforce the daily_briefing unlock the client checks
  -- (Progression requirement 1.4). Fails closed.
  if not exists (
       select 1 from user_unlocks where user_id = v_uid and feature_key = 'daily_briefing')
    then raise exception 'feature_locked'; end if;

  -- --- Card 1: top gainer / top loser among starter stocks ------------------
  -- A starter stock's day change is meaningful only when it has a quote with a
  -- positive prev_close to measure against. change_bps is signed basis points.
  with movers as (
    select
      i.symbol,
      i.name,
      q.price_cents,
      q.prev_close_cents,
      round((q.price_cents - q.prev_close_cents)::numeric * 10000 / q.prev_close_cents)::int
        as change_bps
    from instruments i
    join quotes q on q.symbol = i.symbol
    where i.is_starter and i.is_active
      and q.prev_close_cents is not null and q.prev_close_cents > 0
  )
  select
    (select to_jsonb(g) from (
       select symbol, name, price_cents, prev_close_cents, change_bps
       from movers order by change_bps desc, symbol asc limit 1) g),
    (select to_jsonb(l) from (
       select symbol, name, price_cents, prev_close_cents, change_bps
       from movers order by change_bps asc, symbol asc limit 1) l)
  into v_top_gainer, v_top_loser;

  -- --- Card 2: the caller's portfolio day change, in cents ------------------
  -- Sum qty * (price - prev_close) over the caller's positions, counting only
  -- positions whose quote carries a prev_close. No account / no positions -> 0.
  select coalesce(sum(p.qty * (q.price_cents - q.prev_close_cents)), 0)::bigint
    into v_portfolio_day_change_cents
    from paper_accounts a
    join positions p on p.account_id = a.id
    join quotes q on q.symbol = p.symbol
    where a.user_id = v_uid and q.prev_close_cents is not null;

  -- --- Card 3: the rotating tip index ---------------------------------------
  -- tip_index = day-of-year mod tip count. The count mirrors the client's
  -- reviewed template list via app_config so both pick the same tip; a bad or
  -- missing config value falls back to a safe positive default.
  v_tip_count := greatest(coalesce((select (value)::int from app_config where key = 'briefing_tip_count'), 6), 1);
  v_tip_index := v_doy % v_tip_count;

  return jsonb_build_object(
    'top_gainer', v_top_gainer,
    'top_loser', v_top_loser,
    'portfolio_day_change_cents', coalesce(v_portfolio_day_change_cents, 0),
    'market_state', v_market_state,
    'tip_index', v_tip_index
  );
end $$;

-- The client calls this RPC; grant execute to the authenticated role only.
-- Postgres grants EXECUTE to PUBLIC by default on a new function, so revoke that
-- first (the foundation migration's blanket revoke predates this function) and
-- then grant only `authenticated` — never anon.
revoke execute on function public.get_daily_briefing() from public, anon;
grant execute on function public.get_daily_briefing() to authenticated;

-- Default tip count so the modulus is defined even on a fresh DB. The client's
-- reviewed template list is the source of truth for the actual tip text; this
-- key only needs to match that list's length (kept in sync intentionally).
insert into public.app_config(key, value) values ('briefing_tip_count', '6')
  on conflict (key) do nothing;
