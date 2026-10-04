-- lesson-engine migration (task 2): the complete_lesson RPC and its grant.
-- Source of truth: docs/db-and-api-reference.md section 5.3.
--
-- complete_lesson is the SECURITY DEFINER write path the lesson player calls when
-- a lesson ends. Clients hold only SELECT on the learning tables, so this
-- function performs every write (attempt log, progress, stats, unlocks) under its
-- definer privileges. It:
--   * derives the user from public.current_user_id() (never from an argument),
--   * validates the lesson exists and the score is in [0,100],
--   * enforces the prerequisite: the prerequisite lesson must already be
--     'completed' for this user, else raises prerequisite_not_completed,
--   * always appends an immutable lesson_attempts row,
--   * below the pass score: records/updates in_progress, awards no XP, returns
--     passed = false WITHOUT touching streak, stats, or unlocks,
--   * at or above the pass score: marks the lesson completed; on the FIRST
--     completion it awards xp_base plus a +5 first-try bonus when the score is
--     >= 90 and this is the user's first attempt, updates the streak in the
--     user's local day, and grants the lesson's feature unlocks,
--   * replays (already completed) award 0 XP and leave unlocks unchanged
--     (Requirement 5.6), while still logging the attempt and refreshing streak.
--
-- Streak rules (user's local day, from profiles.timezone):
--   * first ever active day -> streak 1,
--   * same day again -> unchanged,
--   * yesterday -> +1,
--   * two days ago AND a freeze available -> spend one freeze, +1,
--   * otherwise -> reset to 1.
-- Completing a 'boss' lesson for the first time grants one Streak Freeze (capped
-- at 3). This mirrors the draft in section 5.3.
--
-- Idempotency/repeatability: the server calls are safe to repeat because XP and
-- unlocks are gated on v_first (first completion). A repeated completion of an
-- already-completed lesson adds no XP and inserts no duplicate unlock (the
-- user_unlocks upsert is `on conflict do nothing`).

create or replace function public.complete_lesson(
  p_lesson_id text, p_score numeric, p_duration_ms int, p_answers jsonb default '[]'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := public.current_user_id();
  v_cat public.lessons_catalog;
  v_prog public.lesson_progress;
  v_stats public.user_stats;
  v_tz text;
  v_today date;
  v_first boolean;
  v_first_try boolean;
  v_xp int := 0;
  v_streak int;
  v_freezes int;
  v_unlocked text[] := '{}';
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_cat from lessons_catalog where lesson_id = p_lesson_id;
  if not found then raise exception 'unknown_lesson'; end if;

  if p_score is null or p_score < 0 or p_score > 100 then raise exception 'invalid_score'; end if;

  -- Prerequisite gate: the named prerequisite must be completed by this user.
  if v_cat.prerequisite_lesson_id is not null and not exists (
       select 1 from lesson_progress where user_id = v_uid
         and lesson_id = v_cat.prerequisite_lesson_id and status = 'completed')
    then raise exception 'prerequisite_not_completed'; end if;

  -- Always log the raw attempt (append-only), pass or fail.
  insert into lesson_attempts(user_id, lesson_id, score, duration_ms, answers)
    values (v_uid, p_lesson_id, p_score, p_duration_ms, coalesce(p_answers, '[]'));

  -- Lock the progress row (if any) for the stats/unlock decisions below.
  select * into v_prog from lesson_progress where user_id = v_uid and lesson_id = p_lesson_id for update;
  v_first := not found or v_prog.status <> 'completed';
  -- A genuine first-ever attempt (no prior progress row) qualifies for the
  -- first-try bonus. Compute before the progress row is touched below.
  v_first_try := coalesce(v_prog.attempts, 0) = 0;

  -- Below the pass score: record progress as in_progress, award nothing, and do
  -- NOT advance streak/stats/unlocks. Return an encouraging-retry signal.
  if p_score < v_cat.pass_score then
    insert into lesson_progress(user_id, lesson_id, status, attempts, best_score)
      values (v_uid, p_lesson_id, 'in_progress', 1, p_score)
      on conflict (user_id, lesson_id) do update
      set attempts = lesson_progress.attempts + 1,
          best_score = greatest(lesson_progress.best_score, excluded.best_score),
          updated_at = now();
    return jsonb_build_object('passed', false, 'xp_awarded', 0, 'unlocked', '[]'::jsonb);
  end if;

  -- Passing. XP only on the first completion; +5 bonus for a >=90 first attempt.
  if v_first then
    v_xp := v_cat.xp_base + case when p_score >= 90 and v_first_try then 5 else 0 end;
  end if;

  insert into lesson_progress(
      user_id, lesson_id, status, attempts, best_score, first_try_score, xp_awarded, completed_at)
    values (v_uid, p_lesson_id, 'completed', 1, p_score, p_score, v_xp, now())
    on conflict (user_id, lesson_id) do update
    set status = 'completed',
        attempts = lesson_progress.attempts + 1,
        best_score = greatest(lesson_progress.best_score, excluded.best_score),
        xp_awarded = lesson_progress.xp_awarded + v_xp,
        completed_at = coalesce(lesson_progress.completed_at, now()),
        updated_at = now();

  -- Streak, computed in the user's local day.
  select timezone into v_tz from profiles where user_id = v_uid;
  v_tz := coalesce(v_tz, 'America/New_York');
  v_today := (now() at time zone v_tz)::date;

  select * into v_stats from user_stats where user_id = v_uid for update;
  v_streak := v_stats.streak_current;
  v_freezes := v_stats.streak_freezes;

  if v_stats.last_active_date is null then
    v_streak := 1;
  elsif v_stats.last_active_date = v_today then
    null;  -- already counted today
  elsif v_stats.last_active_date = v_today - 1 then
    v_streak := v_streak + 1;
  elsif v_stats.last_active_date = v_today - 2 and v_freezes > 0 then
    v_freezes := v_freezes - 1;
    v_streak := v_streak + 1;
  else
    v_streak := 1;
  end if;

  -- First completion of a boss lesson grants a Streak Freeze (capped at 3).
  if v_first and v_cat.kind = 'boss' then
    v_freezes := least(v_freezes + 1, 3);
  end if;

  update user_stats
    set xp_total = xp_total + v_xp,
        streak_current = v_streak,
        streak_longest = greatest(streak_longest, v_streak),
        streak_freezes = v_freezes,
        last_active_date = v_today
    where user_id = v_uid;

  -- Grant unlocks only on the first completion. Idempotent via on-conflict.
  if v_first then
    insert into user_unlocks(user_id, feature_key, source_lesson_id)
      select v_uid, feature_key, p_lesson_id from feature_unlock_rules where lesson_id = p_lesson_id
      on conflict do nothing;
    select coalesce(array_agg(feature_key), '{}') into v_unlocked
      from feature_unlock_rules where lesson_id = p_lesson_id;
  end if;

  return jsonb_build_object(
    'passed', true,
    'first_completion', v_first,
    'xp_awarded', v_xp,
    'streak', v_streak,
    'streak_freezes', v_freezes,
    'unlocked', to_jsonb(v_unlocked));
end $$;

-- The client calls this RPC; grant execute to the authenticated role only
-- (the foundation RLS/grants migration revoked execute from public/anon).
grant execute on function public.complete_lesson(text, numeric, int, jsonb) to authenticated;
