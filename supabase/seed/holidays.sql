-- Market holidays seed (Requirement 11.1; used by public.market_is_open).
-- Source of truth: supabase/seed/holidays.csv (human-readable). Keep this file
-- in sync with that CSV. Dates come from the official NYSE 2025-2027 holiday
-- and early-closings calendar (NYSE Group / ICE, published 2024-11-08):
-- https://www.nyse.com/markets/hours-calendars
--
-- Early-close days (is_early_close = true) close at 13:00 ET; market_is_open
-- treats a full-day holiday as closed and an early-close day as open until 13:00.
--
-- Idempotent: safe to re-run and to apply to a linked project after migrations.

insert into public.market_holidays(holiday_date, name, is_early_close) values
  ('2025-01-01', 'New Year''s Day', false),
  ('2025-01-20', 'Martin Luther King, Jr. Day', false),
  ('2025-02-17', 'Washington''s Birthday', false),
  ('2025-04-18', 'Good Friday', false),
  ('2025-05-26', 'Memorial Day', false),
  ('2025-06-19', 'Juneteenth National Independence Day', false),
  ('2025-07-03', 'Independence Day (early close)', true),
  ('2025-07-04', 'Independence Day', false),
  ('2025-09-01', 'Labor Day', false),
  ('2025-11-27', 'Thanksgiving Day', false),
  ('2025-11-28', 'Day after Thanksgiving (early close)', true),
  ('2025-12-24', 'Christmas Eve (early close)', true),
  ('2025-12-25', 'Christmas Day', false),
  ('2026-01-01', 'New Year''s Day', false),
  ('2026-01-19', 'Martin Luther King, Jr. Day', false),
  ('2026-02-16', 'Washington''s Birthday', false),
  ('2026-04-03', 'Good Friday', false),
  ('2026-05-25', 'Memorial Day', false),
  ('2026-06-19', 'Juneteenth National Independence Day', false),
  ('2026-07-03', 'Independence Day (observed)', false),
  ('2026-09-07', 'Labor Day', false),
  ('2026-11-26', 'Thanksgiving Day', false),
  ('2026-11-27', 'Day after Thanksgiving (early close)', true),
  ('2026-12-24', 'Christmas Eve (early close)', true),
  ('2026-12-25', 'Christmas Day', false),
  ('2027-01-01', 'New Year''s Day', false),
  ('2027-01-18', 'Martin Luther King, Jr. Day', false),
  ('2027-02-15', 'Washington''s Birthday', false),
  ('2027-03-26', 'Good Friday', false),
  ('2027-05-31', 'Memorial Day', false),
  ('2027-06-18', 'Juneteenth National Independence Day (observed)', false),
  ('2027-07-05', 'Independence Day (observed)', false),
  ('2027-09-06', 'Labor Day', false),
  ('2027-11-25', 'Thanksgiving Day', false),
  ('2027-11-26', 'Day after Thanksgiving (early close)', true),
  ('2027-12-24', 'Christmas Day (observed)', false)
on conflict (holiday_date) do update set
  name = excluded.name,
  is_early_close = excluded.is_early_close;
