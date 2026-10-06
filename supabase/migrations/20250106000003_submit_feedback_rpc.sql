-- Progression, Unlocks & Evaluation migration (task 7): the submit_feedback RPC
-- and its grant.
-- Source of truth: docs/db-and-api-reference.md section 5.4 ("submit_feedback
-- (p_category text, p_message text, p_screen text) — Inserts a feedback row.
-- Rate-limited to 10 per day per user.") and requirements 5.1-5.3.
--
-- Clients hold only SELECT on feedback (see 20250106000002_feedback_table.sql),
-- so the single write path is this SECURITY DEFINER RPC. It follows the same
-- posture as every other write RPC in this project: it runs with
-- set search_path = public, derives the user from public.current_user_id()
-- (never from an argument, so a caller cannot file feedback as someone else),
-- and raises bare error codes that the client maps to friendly copy.
--
-- Behavior:
--   * requirement 5.1 — stores the chosen category, the message (1-1000 chars),
--     and the screen name the user was on. category is validated against the
--     same four values the table CHECK allows; message is validated for length
--     here too so the client gets a precise error code (invalid_category /
--     message_required / message_too_long) instead of a raw CHECK violation.
--     p_screen is optional and trimmed to a sane length.
--   * requirement 5.2 — a per-user daily rate limit. Before inserting we count
--     the caller's feedback from the trailing 24 hours; at or above the limit we
--     raise `rate_limited` so the client can show a friendly "come back
--     tomorrow" message. The limit lives in app_config.feedback_daily_limit
--     (default 10) so the team can tune it without a release; a missing or
--     malformed value falls back to 10.
--   * requirement 5.3 — the row is written for current_user_id() and is only
--     ever readable by that user (the table's "own rows" RLS policy) or the team
--     via the service role, so feedback stays private to its author.
--
-- Error codes raised (surfaced as friendly text by the client):
--   not_authenticated, invalid_category, message_required, message_too_long,
--   rate_limited.

create or replace function public.submit_feedback(
  p_category text, p_message text, p_screen text default null)
returns public.feedback
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := public.current_user_id();
  v_message text := btrim(coalesce(p_message, ''));
  v_limit int;
  v_count int;
  v_row public.feedback;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- Category must be one of the four allowed values (mirrors the table CHECK);
  -- raising a named code lets the client show precise copy.
  if p_category is null or p_category not in ('bug','idea','confusing','other')
    then raise exception 'invalid_category'; end if;

  -- Message is required and capped at 1000 characters (requirement 5.1). We
  -- validate the trimmed message so a whitespace-only message is rejected and a
  -- genuinely-long one is reported precisely rather than hitting the raw CHECK.
  if char_length(v_message) < 1 then raise exception 'message_required'; end if;
  if char_length(v_message) > 1000 then raise exception 'message_too_long'; end if;

  -- Per-user daily rate limit (requirement 5.2). Count the caller's feedback in
  -- the trailing 24 hours and block at or above the configured limit. The limit
  -- is config-driven; a missing/invalid value falls back to a safe 10.
  v_limit := greatest(
    coalesce((select (value)::int from app_config where key = 'feedback_daily_limit'), 10), 1);
  select count(*) into v_count
    from feedback
    where user_id = v_uid and created_at >= now() - interval '24 hours';
  if v_count >= v_limit then raise exception 'rate_limited'; end if;

  insert into feedback(user_id, category, message, screen)
    values (v_uid, p_category, v_message, left(nullif(btrim(coalesce(p_screen, '')), ''), 100))
    returning * into v_row;
  return v_row;
end $$;

-- Postgres grants EXECUTE to PUBLIC by default on a new function, so revoke that
-- first (the foundation migration's blanket revoke predates this function) and
-- then grant only `authenticated` — never anon, per section 4's "nothing for
-- anon" posture.
revoke execute on function public.submit_feedback(text, text, text) from public, anon;
grant execute on function public.submit_feedback(text, text, text) to authenticated;
