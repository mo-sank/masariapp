-- Market data and paper trading: add market_session() for extended-hours quote
-- ingestion (Option 1 — pre/after-hours quotes).
--
-- The MVP ingested quotes only during the 09:30-16:00 ET regular session
-- (market_is_open). This adds a finer-grained classifier so the ingest-quotes
-- function can also refresh during PRE-MARKET and AFTER-HOURS, while leaving the
-- overnight/weekend dead zone alone (no trading happens then, so there is
-- nothing new to fetch).
--
-- IMPORTANT: market_is_open() is UNCHANGED and still means the REGULAR session
-- only. Trading rules (place_market_order's stale-quote check and the
-- delayed_quote vs last_close price_source) continue to key off market_is_open,
-- so a market order placed outside the regular session still fills at
-- last_close — which is correct. market_session() drives INGESTION cadence and
-- client FRESHNESS LABELING only, not order pricing.
--
-- Sessions (evaluated in America/New_York, trading days only):
--   'regular'  : 09:30 (incl) .. close (16:00, or 13:00 on an early-close day).
--   'extended' : 04:00 (incl) .. 09:30  AND  close .. 20:00 (excl)  [pre/post].
--   'closed'   : everything else (overnight, weekends, full holidays).
-- On an early-close day the regular session ends at 13:00 and the after-hours
-- window still runs to 20:00, matching how US venues treat a half day.

create or replace function public.market_session(p_at timestamptz default now())
returns text language plpgsql stable as $$
declare
  v_local timestamp := p_at at time zone 'America/New_York';
  v_date date := v_local::date;
  v_time time := v_local::time;
  v_close time := time '16:00';
  v_h public.market_holidays;
begin
  -- Weekends: fully closed.
  if extract(isodow from v_date) > 5 then
    return 'closed';
  end if;

  -- Holidays: a full-day holiday is closed entirely (no extended session on a
  -- full market holiday). An early-close day trades a shortened regular session
  -- (to 13:00) and still has the normal pre/after-hours windows.
  select * into v_h from public.market_holidays where holiday_date = v_date;
  if found then
    if not v_h.is_early_close then
      return 'closed';
    end if;
    v_close := time '13:00';
  end if;

  -- Regular session: 09:30 (inclusive) to the close (exclusive).
  if v_time >= time '09:30' and v_time < v_close then
    return 'regular';
  end if;

  -- Extended hours: pre-market 04:00-09:30, after-hours close-20:00.
  if (v_time >= time '04:00' and v_time < time '09:30')
     or (v_time >= v_close and v_time < time '20:00') then
    return 'extended';
  end if;

  return 'closed';
end $$;

-- Readable by the client banner (same posture as market_is_open).
grant execute on function public.market_session(timestamptz) to authenticated;
