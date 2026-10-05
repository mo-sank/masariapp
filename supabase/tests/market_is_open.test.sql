-- market_is_open() function (Requirement 11.1).
-- Source of truth: docs/db-and-api-reference.md section 3.3 and the function in
-- migration 20250105000001_market_data.sql.
--
-- market_is_open(p_at) evaluates p_at in America/New_York and returns true only
-- when US equities are trading:
--   * weekends (Sat/Sun) are closed,
--   * a full-day holiday is closed,
--   * an early-close day trades 09:30 ET up to (but not including) 13:00 ET,
--   * a regular day trades 09:30 ET up to (but not including) 16:00 ET.
--
-- The open/close boundaries are wall-clock ET, so the equivalent UTC instant
-- shifts by an hour across US daylight-saving transitions. These tests pin
-- specific UTC instants and assert the ET-local behavior, covering:
--   * a regular weekday (open mid-session, closed before 09:30 and at/after 16:00),
--   * the exact 09:30 ET open and 16:00 ET close boundaries (inclusive open,
--     exclusive close),
--   * Saturday and Sunday,
--   * a full-day holiday (closed even during regular hours),
--   * an early-close day (open before 13:00 ET, closed from 13:00 ET),
--   * EST vs EDT: the same 09:30 ET open maps to 14:30 UTC in winter and
--     13:30 UTC in summer, and the days bracketing both 2025 DST transitions
--     (spring-forward Mar 9, fall-back Nov 2) resolve correctly.
--
-- The function reads public.market_holidays. `supabase test db` resets and
-- seeds the DB (supabase/seed/holidays.sql) before running, so the real NYSE
-- rows are present; to stay self-contained and deterministic the dates this
-- file depends on are re-asserted here with ON CONFLICT DO NOTHING. The whole
-- file runs in one transaction and rolls back at the end.

begin;
select plan(29);

create extension if not exists pgtap;

-- Ensure the holiday rows these tests rely on exist regardless of seed state.
-- (ON CONFLICT DO NOTHING keeps any seeded row as-is; the values match the seed.)
insert into public.market_holidays(holiday_date, name, is_early_close) values
  ('2025-07-04', 'Independence Day', false),
  ('2025-07-03', 'Independence Day (early close)', true),
  ('2025-11-28', 'Day after Thanksgiving (early close)', true)
on conflict (holiday_date) do nothing;

-- ===========================================================================
-- Regular summer weekday: Tuesday 2025-06-10 (EDT, UTC-4).
-- 09:30 ET = 13:30 UTC, 16:00 ET = 20:00 UTC.
-- ===========================================================================
select ok(
  public.market_is_open(timestamptz '2025-06-10 17:00:00+00'),
  'open mid-session on a regular summer weekday (13:00 ET Tue)');
select ok(
  not public.market_is_open(timestamptz '2025-06-10 12:00:00+00'),
  'closed before the open on a regular weekday (08:00 ET)');
select ok(
  not public.market_is_open(timestamptz '2025-06-10 21:00:00+00'),
  'closed after the close on a regular weekday (17:00 ET)');

-- Open boundary is inclusive at 09:30 ET (= 13:30 UTC in EDT).
select ok(
  public.market_is_open(timestamptz '2025-06-10 13:30:00+00'),
  'open exactly at 09:30 ET (inclusive) in summer');
select ok(
  not public.market_is_open(timestamptz '2025-06-10 13:29:59+00'),
  'closed one second before 09:30 ET in summer');

-- Close boundary is exclusive at 16:00 ET (= 20:00 UTC in EDT).
select ok(
  not public.market_is_open(timestamptz '2025-06-10 20:00:00+00'),
  'closed exactly at 16:00 ET (exclusive) in summer');
select ok(
  public.market_is_open(timestamptz '2025-06-10 19:59:59+00'),
  'open one second before 16:00 ET in summer');

-- ===========================================================================
-- Regular winter weekday: Tuesday 2025-01-07 (EST, UTC-5).
-- 09:30 ET = 14:30 UTC, 16:00 ET = 21:00 UTC. Proves the UTC boundary shifts
-- by an hour relative to summer (same ET wall-clock, different UTC instant).
-- ===========================================================================
select ok(
  public.market_is_open(timestamptz '2025-01-07 18:00:00+00'),
  'open mid-session on a regular winter weekday (13:00 ET Tue)');
select ok(
  public.market_is_open(timestamptz '2025-01-07 14:30:00+00'),
  'open exactly at 09:30 ET (= 14:30 UTC in winter)');
select ok(
  not public.market_is_open(timestamptz '2025-01-07 14:29:59+00'),
  'closed one second before 09:30 ET in winter');
select ok(
  not public.market_is_open(timestamptz '2025-01-07 21:00:00+00'),
  'closed exactly at 16:00 ET (= 21:00 UTC in winter)');
select ok(
  public.market_is_open(timestamptz '2025-01-07 20:59:59+00'),
  'open one second before 16:00 ET in winter');
-- 13:30 UTC is 08:30 ET in winter (before the open): must be closed, unlike
-- summer where the same UTC instant is 09:30 ET.
select ok(
  not public.market_is_open(timestamptz '2025-01-07 13:30:00+00'),
  '13:30 UTC is 08:30 ET in winter and therefore closed');

-- ===========================================================================
-- Weekend: Saturday 2025-06-14 and Sunday 2025-06-15 (closed all day).
-- ===========================================================================
select ok(
  not public.market_is_open(timestamptz '2025-06-14 17:00:00+00'),
  'closed on Saturday even during regular hours (13:00 ET Sat)');
select ok(
  not public.market_is_open(timestamptz '2025-06-15 17:00:00+00'),
  'closed on Sunday even during regular hours (13:00 ET Sun)');

-- ===========================================================================
-- Full-day holiday: Independence Day, Friday 2025-07-04 (closed all day).
-- ===========================================================================
select ok(
  not public.market_is_open(timestamptz '2025-07-04 17:00:00+00'),
  'closed on a full-day holiday during regular hours (13:00 ET Jul 4)');
select ok(
  not public.market_is_open(timestamptz '2025-07-04 14:00:00+00'),
  'closed on a full-day holiday just after the usual open (10:00 ET)');

-- ===========================================================================
-- Early-close day: Thursday 2025-07-03 (EDT). Trades 09:30 ET up to 13:00 ET.
-- 09:30 ET = 13:30 UTC, 13:00 ET = 17:00 UTC, 16:00 ET = 20:00 UTC.
-- ===========================================================================
select ok(
  public.market_is_open(timestamptz '2025-07-03 14:30:00+00'),
  'open before 13:00 ET on an early-close day (10:30 ET)');
select ok(
  public.market_is_open(timestamptz '2025-07-03 16:59:59+00'),
  'open one second before 13:00 ET on an early-close day');
select ok(
  not public.market_is_open(timestamptz '2025-07-03 17:00:00+00'),
  'closed exactly at 13:00 ET (exclusive) on an early-close day');
select ok(
  not public.market_is_open(timestamptz '2025-07-03 18:00:00+00'),
  'closed at 14:00 ET on an early-close day (after early close)');
select ok(
  not public.market_is_open(timestamptz '2025-07-03 19:30:00+00'),
  'closed at the usual 15:30 ET on an early-close day');

-- A second early-close day after the fall-back transition: 2025-11-28 is EST
-- (fall-back was 2025-11-02), so 13:00 ET = 18:00 UTC here.
select ok(
  public.market_is_open(timestamptz '2025-11-28 17:59:59+00'),
  'open one second before 13:00 ET on the day-after-Thanksgiving early close');
select ok(
  not public.market_is_open(timestamptz '2025-11-28 18:00:00+00'),
  'closed at 13:00 ET on the day-after-Thanksgiving early close');

-- ===========================================================================
-- Daylight-saving transition days (2025): verify ET resolves correctly across
-- the switch. Both fall on Sundays (markets closed), so pair each with its
-- adjacent trading weekday to confirm the UTC->ET offset actually changed.
-- Spring-forward: Sun 2025-03-09 02:00 EST -> 03:00 EDT.
-- Fall-back:      Sun 2025-11-02 02:00 EDT -> 01:00 EST.
-- ===========================================================================

-- Friday 2025-03-07 is still EST: 09:30 ET = 14:30 UTC.
select ok(
  public.market_is_open(timestamptz '2025-03-07 14:30:00+00'),
  'Fri before spring-forward is EST: 14:30 UTC = 09:30 ET, open');
select ok(
  not public.market_is_open(timestamptz '2025-03-07 13:30:00+00'),
  'Fri before spring-forward is EST: 13:30 UTC = 08:30 ET, closed');

-- Monday 2025-03-10 is EDT (clocks sprang forward Sun): 09:30 ET = 13:30 UTC.
select ok(
  public.market_is_open(timestamptz '2025-03-10 13:30:00+00'),
  'Mon after spring-forward is EDT: 13:30 UTC = 09:30 ET, open');

-- Monday 2025-11-03 is back on EST (clocks fell back Sun): 09:30 ET = 14:30 UTC.
select ok(
  public.market_is_open(timestamptz '2025-11-03 14:30:00+00'),
  'Mon after fall-back is EST: 14:30 UTC = 09:30 ET, open');
select ok(
  not public.market_is_open(timestamptz '2025-11-03 13:30:00+00'),
  'Mon after fall-back is EST: 13:30 UTC = 08:30 ET, closed');

select * from finish();
rollback;
