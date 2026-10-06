-- Progression, Unlocks & Evaluation migration (task 8): delayed spaced review
-- scheduled when a learner first beats a unit boss.
-- Source of truth: requirements 6.1 ("WHEN a unit boss is completed THEN the
-- system SHALL schedule a delayed review (about 7 days) as due rewind_items for
-- key concepts of that unit") and the design "Delayed review" note ("when
-- complete_lesson completes a boss for the first time, insert rewind_items for
-- that unit's key concepts with due_at = now() + 7 days ... extend complete_lesson
-- or add a trigger-free helper called from it").
--
-- Why a helper called from complete_lesson (not a trigger): rewind_items are
-- user-owned and written only through SECURITY DEFINER RPCs; a trigger-free
-- helper keeps every write to that table on the same auditable path and lets us
-- reuse the current_user_id()-derived user id complete_lesson already holds.
--
-- Where the "key concepts of that unit" come from: the catalog does not store
-- concept tags (they live in the lesson JSON), but every graded attempt records
-- its per-item concepts in lesson_attempts.answers ([{item_id, concept, ...}]).
-- So the key concepts a learner actually practised in a unit are exactly the
-- distinct, non-empty `concept` values across that user's attempts on the
-- unit's lessons. schedule_unit_review turns each such concept into one due
-- rewind item.
--
-- Scheduling model: the review should surface about a week out, so each concept
-- row is inserted at box 3 (the box whose review_rewind_item interval is 7 days)
-- with due_at = now() + 7 days. A synthetic, deterministic item_id
-- `review:U<unit>:<concept>` keeps the insert idempotent against the
-- rewind_items (user_id, item_id) unique key: re-beating the boss re-arms the
-- same due date rather than piling up duplicates, and it never collides with a
-- real missed-item id saved by save_rewind_items (those use the lesson's own
-- scored-step ids). lesson_id is the boss lesson, so the Rewind UI can group the
-- review under the unit it belongs to.

-- schedule_unit_review(p_uid, p_unit, p_boss_lesson_id)
-- Insert/refresh one due-in-7-days rewind item per key concept of the unit for
-- the given user. Internal helper: NOT security definer and NOT granted to any
-- API role — it is only ever called from complete_lesson (itself SECURITY
-- DEFINER), which has already authenticated and authorised the caller.
create or replace function public.schedule_unit_review(
  p_uid text, p_unit int, p_boss_lesson_id text)
returns void
language plpgsql set search_path = public as $$
begin
  insert into rewind_items(user_id, lesson_id, item_id, box, due_at)
  select
    p_uid,
    p_boss_lesson_id,
    'review:U' || p_unit || ':' || c.concept,
    3,                        -- box 3 == the 7-day review interval
    now() + interval '7 days'
  from (
    -- Distinct, non-empty concepts the user has practised across this unit's
    -- lessons, read from the per-item answers recorded on each attempt.
    select distinct btrim(ans.value ->> 'concept') as concept
    from lesson_attempts la
    join lessons_catalog lc on lc.lesson_id = la.lesson_id
    cross join lateral jsonb_array_elements(la.answers) as ans(value)
    where la.user_id = p_uid
      and lc.unit = p_unit
      and jsonb_typeof(la.answers) = 'array'
      and coalesce(btrim(ans.value ->> 'concept'), '') <> ''
  ) c
  on conflict (user_id, item_id) do update
    set lesson_id = excluded.lesson_id,
        box = excluded.box,
        due_at = excluded.due_at;
end $$;

-- This helper is internal: it is only ever called from complete_lesson (SECURITY
-- DEFINER), never by a client. Revoke the default PUBLIC execute grant so no API
-- role can reach it directly, matching this project's "nothing extra for anon"
-- posture. (A direct call would run without definer rights and be blocked by the
-- rewind_items grants/RLS anyway; this just makes the boundary explicit.)
revoke execute on function public.schedule_unit_review(text, int, text) from public, anon, authenticated;

-- Re-create complete_lesson so a first boss completion schedules the delayed
-- unit review. This is a verbatim copy of 20250104000003_complete_lesson_rpc.sql
-- with one addition: after the boss freeze is granted, call schedule_unit_review
-- for the boss's unit. Everything else (prerequisite gate, pass threshold, XP,
-- streak, unlocks, return shape) is unchanged.
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

  -- Beating a unit boss for the first time schedules a delayed (~7 day) review of
  -- the unit's key concepts as due rewind items (requirement 6.1). Gated on
  -- v_first so a replay of an already-completed boss does not re-arm it, and run
  -- after the stats/unlock writes so it never affects the pass/XP/streak result.
  if v_first and v_cat.kind = 'boss' then
    perform public.schedule_unit_review(v_uid, v_cat.unit, p_lesson_id);
  end if;

  return jsonb_build_object(
    'passed', true,
    'first_completion', v_first,
    'xp_awarded', v_xp,
    'streak', v_streak,
    'streak_freezes', v_freezes,
    'unlocked', to_jsonb(v_unlocked));
end $$;

-- The grant from the original migration persists across CREATE OR REPLACE, but
-- re-assert it so this migration is self-contained if applied in isolation.
grant execute on function public.complete_lesson(text, numeric, int, jsonb) to authenticated;
