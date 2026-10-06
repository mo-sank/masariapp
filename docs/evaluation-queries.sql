-- Masari — Evaluation report queries (team-only).
--
-- Source of truth: docs/db-and-api-reference.md section 6 ("Evaluation views")
-- and requirement 7.2, which lists exactly the report outputs this file must
-- provide:
--   1. completion and dropout by lesson
--   2. median lesson duration
--   3. first-trade rate within 24 hours
--   4. Day-1 and Day-7 return rates
--   5. trades with and without rationale
--   6. pre/post gains with n (sample size)
--
-- These are plain SELECTs the team runs in the Supabase SQL editor or through
-- the service role (which bypasses RLS). They are NOT part of the client API:
-- the two helper views (v_lesson_funnel, v_assessment_gain) created in migration
-- 20250106000005_evaluation_views.sql are revoked from the `authenticated` role,
-- and these queries touch base tables (orders, paper_accounts, lesson_attempts,
-- portfolio_snapshots) that the app can read only for its own rows — so an app
-- session could never reproduce these aggregates across users. Run them as the
-- team (requirement 7.3). Report completion and dropout alongside gains, and
-- always show n so a small sample is read honestly.
--
-- Each snippet is self-contained: copy the one you need. Numbers are in the
-- units the schema stores (money in integer cents, durations in milliseconds).


-- ===========================================================================
-- 1. Completion and dropout by lesson (requirement 7.1, 7.2)
--    Starts, completions, dropout count, and completion rate per lesson,
--    ordered by the catalog's own sequence so the funnel reads top-to-bottom.
--    Built on the v_lesson_funnel view; dropout = started - completed.
-- ===========================================================================
select
  f.lesson_id,
  c.unit,
  f.started,
  f.completed,
  f.started - f.completed as dropped,
  round(100.0 * f.completed / nullif(f.started, 0), 1) as completion_pct
from public.v_lesson_funnel f
join public.lessons_catalog c on c.lesson_id = f.lesson_id
order by c.unit, c.sort_order;


-- ===========================================================================
-- 2. Median lesson duration (requirement 7.2)
--    Median wall-clock duration of a lesson attempt, per lesson and overall,
--    in milliseconds and seconds. Uses the append-only lesson_attempts log and
--    ignores rows with a missing/zero duration. percentile_cont gives a true
--    interpolated median, which is more robust to outliers than a mean.
-- ===========================================================================
select
  la.lesson_id,
  count(*) as attempts_with_duration,
  percentile_cont(0.5) within group (order by la.duration_ms) as median_duration_ms,
  round(
    (percentile_cont(0.5) within group (order by la.duration_ms))::numeric / 1000.0, 1
  ) as median_duration_s
from public.lesson_attempts la
where la.duration_ms is not null and la.duration_ms > 0
group by la.lesson_id
order by la.lesson_id;

-- Overall median across every lesson attempt (single row), for a headline number.
select
  count(*) as attempts_with_duration,
  percentile_cont(0.5) within group (order by duration_ms) as median_duration_ms,
  round(
    (percentile_cont(0.5) within group (order by duration_ms))::numeric / 1000.0, 1
  ) as median_duration_s
from public.lesson_attempts
where duration_ms is not null and duration_ms > 0;


-- ===========================================================================
-- 3. First-trade rate within 24 hours (requirement 7.2)
--    Of all users who have a paper account, what share placed their first
--    order within 24 hours of the account being created. The paper account is
--    created at onboarding, so account creation is the "start of journey"
--    anchor; the first order is the earliest row in `orders` for that user.
--    Users with no order count toward the denominator but not the numerator.
-- ===========================================================================
with first_trade as (
  select pa.user_id,
         pa.created_at as account_created_at,
         min(o.created_at) as first_order_at
  from public.paper_accounts pa
  left join public.orders o on o.user_id = pa.user_id
  group by pa.user_id, pa.created_at
)
select
  count(*) as users,
  count(*) filter (where first_order_at is not null) as traded_ever,
  count(*) filter (
    where first_order_at is not null
      and first_order_at <= account_created_at + interval '24 hours'
  ) as traded_within_24h,
  round(
    100.0 * count(*) filter (
      where first_order_at is not null
        and first_order_at <= account_created_at + interval '24 hours'
    ) / nullif(count(*), 0), 1
  ) as first_trade_rate_24h_pct
from first_trade;


-- ===========================================================================
-- 4. Day-1 and Day-7 return rates (requirement 7.2)
--    Retention: of users active (any logged event) on their first active day,
--    what share came back on the following day (D1) and seven days later (D7).
--    "Active day" is a UTC day with at least one event; day 0 is each user's
--    first active day. D1/D7 are counted against the users who have had a
--    chance to return (i.e. whose day 0 is at least 1 / 7 days in the past),
--    so a user who only joined yesterday does not drag D7 down to zero.
-- ===========================================================================
with user_days as (
  select distinct user_id, (created_at at time zone 'UTC')::date as active_day
  from public.events
),
day0 as (
  select user_id, min(active_day) as d0
  from user_days
  group by user_id
)
select
  -- D1
  count(*) filter (where d0.d0 <= current_date - 1) as eligible_d1,
  count(*) filter (
    where d0.d0 <= current_date - 1
      and exists (
        select 1 from user_days ud
        where ud.user_id = d0.user_id and ud.active_day = d0.d0 + 1
      )
  ) as returned_d1,
  round(
    100.0 * count(*) filter (
      where d0.d0 <= current_date - 1
        and exists (
          select 1 from user_days ud
          where ud.user_id = d0.user_id and ud.active_day = d0.d0 + 1
        )
    ) / nullif(count(*) filter (where d0.d0 <= current_date - 1), 0), 1
  ) as d1_return_pct,
  -- D7
  count(*) filter (where d0.d0 <= current_date - 7) as eligible_d7,
  count(*) filter (
    where d0.d0 <= current_date - 7
      and exists (
        select 1 from user_days ud
        where ud.user_id = d0.user_id and ud.active_day = d0.d0 + 7
      )
  ) as returned_d7,
  round(
    100.0 * count(*) filter (
      where d0.d0 <= current_date - 7
        and exists (
          select 1 from user_days ud
          where ud.user_id = d0.user_id and ud.active_day = d0.d0 + 7
        )
    ) / nullif(count(*) filter (where d0.d0 <= current_date - 7), 0), 1
  ) as d7_return_pct
from day0 d0;


-- ===========================================================================
-- 5. Trades with and without rationale (requirement 7.2)
--    How many orders carried a pre-trade rationale (either a tag or free text)
--    vs none. The pre-trade rationale is stored on the order itself
--    (rationale_tags text[] and rationale_text), so an order "has rationale"
--    when it has at least one tag or any non-empty text.
-- ===========================================================================
select
  count(*) as total_orders,
  count(*) filter (
    where cardinality(rationale_tags) > 0
       or coalesce(btrim(rationale_text), '') <> ''
  ) as with_rationale,
  count(*) filter (
    where cardinality(rationale_tags) = 0
      and coalesce(btrim(rationale_text), '') = ''
  ) as without_rationale,
  round(
    100.0 * count(*) filter (
      where cardinality(rationale_tags) > 0
         or coalesce(btrim(rationale_text), '') <> ''
    ) / nullif(count(*), 0), 1
  ) as with_rationale_pct
from public.orders;


-- ===========================================================================
-- 6. Pre/post gains with n (requirement 6.3, 7.2)
--    Learning gain from Form A (pre) to Form B (post), with the sample size n
--    always reported so a small cohort is read honestly. Per-user rows come
--    from the v_assessment_gain view; this rolls them up into n and the mean
--    and median gain (and the mean pre/post scores for context).
-- ===========================================================================
select
  count(*) as n,
  round(avg(score_a), 1) as mean_score_a,
  round(avg(score_b), 1) as mean_score_b,
  round(avg(gain), 1) as mean_gain,
  percentile_cont(0.5) within group (order by gain) as median_gain
from public.v_assessment_gain;

-- Per-user detail (also n rows), when you want to see the distribution rather
-- than just the summary above.
select user_id, score_a, score_b, gain
from public.v_assessment_gain
order by gain desc;
