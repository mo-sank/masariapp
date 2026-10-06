-- Progression, Unlocks & Evaluation migration (task 9): team-only evaluation
-- views.
-- Source of truth: docs/db-and-api-reference.md section 6 ("Evaluation views
-- (for your report)") and requirements 6.3, 7.1, 7.3. The companion report SQL
-- snippets (funnel/dropout, median duration, first-trade rate, D1/D7 return,
-- trades with vs without rationale, pre/post gains with n) live in
-- docs/evaluation-queries.sql (requirement 7.2); they are plain SELECTs run by
-- the team in the SQL editor / service role, not objects created here.
--
-- Audience (requirement 7.3): these views are for the team only — the SQL editor
-- or the service role, which bypasses RLS. They are NOT part of the client API.
-- The app never selects them. So after creating each view we REVOKE every grant
-- from authenticated (and anon/public for good measure). Views are not tables,
-- so no RLS policy applies; the privilege revoke is the control that keeps them
-- off the client. A view owned by the migration role also runs with that role's
-- rights, which is another reason analytics must not be reachable by app users.
--
-- Why views (not RPCs): evaluation is read-only reporting over existing tables
-- (assessment_results, lesson_progress). A view keeps the definition versioned
-- in a migration and queryable from the SQL editor without shipping any client
-- surface. create or replace keeps the migration re-runnable.

-- v_assessment_gain (requirement 6.3): per-user pre/post learning gain. Joins
-- each user's Form A (pre) result to their Form B (post) result and reports
-- score_a, score_b, and the gain (B - A). One row per user who has taken both
-- forms; users with only one form do not appear (an inner join), which is the
-- intended "paired" view for the report. Verbatim from DB reference section 6.
create or replace view public.v_assessment_gain as
select a.user_id,
       a.score_pct as score_a,
       b.score_pct as score_b,
       b.score_pct - a.score_pct as gain
from public.assessment_results a
join public.assessment_results b
  on b.user_id = a.user_id and b.form = 'B' and a.form = 'A';

-- v_lesson_funnel (requirement 7.1): started vs completed counts per lesson.
-- `started` counts any progress row (in_progress or completed) and `completed`
-- counts the completed ones, so dropout per lesson is started - completed.
-- Verbatim from DB reference section 6.
create or replace view public.v_lesson_funnel as
select lesson_id,
       count(*) filter (where status in ('in_progress','completed')) as started,
       count(*) filter (where status = 'completed') as completed
from public.lesson_progress
group by lesson_id;

-- Team-only (requirement 7.3): revoke all access from the client/anon roles so
-- these views are reachable only via the SQL editor / service role (which
-- bypasses RLS and is not subject to these grants). The foundation grants
-- migration ran before these views existed, so there is nothing to rely on —
-- we revoke explicitly and grant nothing to authenticated. Revoke from PUBLIC
-- too, since a freshly created view may carry a default PUBLIC privilege.
revoke all on public.v_assessment_gain from public, anon, authenticated;
revoke all on public.v_lesson_funnel  from public, anon, authenticated;
