-- lesson-engine migration (task 2): the submit_assessment, save_rewind_items,
-- and review_rewind_item RPCs and their grants.
-- Source of truth: docs/db-and-api-reference.md section 5.4 and the "Rewind
-- scheduling" section of the design document.
--
-- All three are SECURITY DEFINER, set search_path = public, derive the user from
-- public.current_user_id(), and are granted to the authenticated role only.
-- Clients hold SELECT only, so these functions are the sole write path into
-- assessment_results and rewind_items.

-- -----------------------------------------------------------------------------
-- submit_assessment(p_lesson_id, p_form, p_item_results)
-- Used by L0 (and later unit checks). Inserts one assessment_results row with
-- the score computed server-side from the per-item results, so the client cannot
-- spoof a score. p_item_results is an array of {item_id, concept, correct}.
-- The score is the percentage of items marked correct (0 when the array is
-- empty). No pass/fail semantics: the assessment never gates anything.
-- -----------------------------------------------------------------------------
create or replace function public.submit_assessment(
  p_lesson_id text, p_form text, p_item_results jsonb)
returns public.assessment_results
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := public.current_user_id();
  v_total int;
  v_correct int;
  v_score numeric(5,2);
  v_row public.assessment_results;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  if not exists (select 1 from lessons_catalog where lesson_id = p_lesson_id) then
    raise exception 'unknown_lesson';
  end if;
  if p_form is null or p_form not in ('A','B') then raise exception 'invalid_form'; end if;
  if p_item_results is null or jsonb_typeof(p_item_results) <> 'array' then
    raise exception 'invalid_item_results';
  end if;

  v_total := jsonb_array_length(p_item_results);
  -- Count items whose `correct` is boolean true. Compute the score as a
  -- percentage; an empty result set scores 0 rather than dividing by zero.
  select count(*) into v_correct
    from jsonb_array_elements(p_item_results) as e
    where (e ->> 'correct')::boolean is true;
  v_score := case when v_total > 0
                  then round((v_correct::numeric * 100) / v_total, 2)
                  else 0 end;

  insert into assessment_results(user_id, lesson_id, form, score_pct, item_results)
    values (v_uid, p_lesson_id, p_form, v_score, p_item_results)
    returning * into v_row;
  return v_row;
end $$;

grant execute on function public.submit_assessment(text, text, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- save_rewind_items(p_items)
-- Upserts each missed scored item [{lesson_id, item_id}] into rewind_items at
-- box 0, due now. Idempotent on (user_id, item_id): re-saving an item that is
-- already queued resets it to box 0 / due now (a fresh miss should re-surface
-- the item soon). Returns the number of items processed.
-- -----------------------------------------------------------------------------
create or replace function public.save_rewind_items(p_items jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := public.current_user_id();
  v_item jsonb;
  v_lesson text;
  v_item_id text;
  v_count int := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'invalid_payload'; end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_lesson := v_item ->> 'lesson_id';
    v_item_id := v_item ->> 'item_id';
    if v_lesson is null or v_item_id is null then raise exception 'invalid_item'; end if;
    if not exists (select 1 from lessons_catalog where lesson_id = v_lesson) then
      raise exception 'unknown_lesson';
    end if;

    insert into rewind_items(user_id, lesson_id, item_id, box, due_at)
      values (v_uid, v_lesson, v_item_id, 0, now())
      on conflict (user_id, item_id) do update
      set lesson_id = excluded.lesson_id,
          box = 0,
          due_at = now();
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

grant execute on function public.save_rewind_items(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- review_rewind_item(p_item_id, p_correct)
-- Advances or resets a queued item's spaced-repetition box after a review.
--   correct  -> box + 1 (capped at box 4) and due_at pushed out by the interval
--               for the NEW box: box 1 = 1 day, 2 = 3 days, 3 = 7 days, 4 = 14 days.
--   incorrect-> box reset to 0 and due_at = now() (surfaces again immediately).
-- last_seen_at is stamped either way. Operates only on the caller's own item;
-- a missing item raises rewind_item_not_found.
-- -----------------------------------------------------------------------------
create or replace function public.review_rewind_item(p_item_id text, p_correct boolean)
returns public.rewind_items
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := public.current_user_id();
  v_row public.rewind_items;
  v_new_box int;
  v_days int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_correct is null then raise exception 'invalid_correct'; end if;

  select * into v_row from rewind_items
    where user_id = v_uid and item_id = p_item_id for update;
  if not found then raise exception 'rewind_item_not_found'; end if;

  if p_correct then
    v_new_box := least(v_row.box + 1, 4);
    -- Interval for the new box: boxes 1..4 -> 1, 3, 7, 14 days.
    v_days := case v_new_box when 1 then 1 when 2 then 3 when 3 then 7 else 14 end;
    update rewind_items
      set box = v_new_box,
          due_at = now() + make_interval(days => v_days),
          last_seen_at = now()
      where user_id = v_uid and item_id = p_item_id
      returning * into v_row;
  else
    update rewind_items
      set box = 0,
          due_at = now(),
          last_seen_at = now()
      where user_id = v_uid and item_id = p_item_id
      returning * into v_row;
  end if;

  return v_row;
end $$;

grant execute on function public.review_rewind_item(text, boolean) to authenticated;
