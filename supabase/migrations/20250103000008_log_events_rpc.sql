-- Foundation migration: the log_events RPC and its grant.
-- Source of truth: docs/db-and-api-reference.md section 5.4
--   log_events(p_events jsonb): "Inserts up to 50 events
--   [{name, props, client_ts, session_id, app_version}] for the caller.
--   Rejects unknown event names."
--
-- log_events is the ONLY write path into public.events. The events table has no
-- SELECT policy and clients have no INSERT grant (see the RLS/grants migration),
-- so events are append-only through this SECURITY DEFINER function. It:
--   * derives the user from public.current_user_id() (never from an argument),
--   * accepts a JSON ARRAY of up to 50 event objects and rejects larger batches,
--   * rejects any event whose `name` is NOT in the server-side allowlist, and
--   * strips disallowed prop keys defensively (email/token/text) so no free text
--     or secret can be persisted even if a client sends it.
--
-- ALLOWLIST MIRROR (requirement 9.4): the allowed event names below MUST stay in
-- sync with the canonical client list in
-- src/features/progress/analytics-events.ts. This foundation spec ships exactly
-- `session_start` and `onboarding_completed`; later specs append names in BOTH
-- places in the same change. Unknown names are rejected on both sides.

create or replace function public.log_events(p_events jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := public.current_user_id();
  -- Mirror of src/features/progress/analytics-events.ts. Keep in sync.
  v_allowed text[] := array['session_start', 'onboarding_completed'];
  -- Prop keys that must never be persisted (no email / token / free text).
  v_denied_keys text[] := array['email', 'token', 'text'];
  v_count int := 0;
  v_event jsonb;
  v_name text;
  v_props jsonb;
  v_key text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- The payload must be a JSON array (the client batches events).
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'invalid_payload';
  end if;

  -- Cap the batch size per the reference (up to 50 events per call).
  if jsonb_array_length(p_events) > 50 then
    raise exception 'too_many_events';
  end if;

  for v_event in select * from jsonb_array_elements(p_events)
  loop
    v_name := v_event ->> 'name';

    -- Allowlist enforcement: reject any name not in the server-side list. This
    -- mirrors the client allowlist and is the authoritative check.
    if v_name is null or not (v_name = any (v_allowed)) then
      raise exception 'unknown_event_name: %', coalesce(v_name, '(null)');
    end if;

    -- Defensive scrub: drop any disallowed top-level prop keys. Props default to
    -- an empty object when missing or not an object.
    v_props := v_event -> 'props';
    if v_props is null or jsonb_typeof(v_props) <> 'object' then
      v_props := '{}'::jsonb;
    else
      foreach v_key in array v_denied_keys loop
        v_props := v_props - v_key;
      end loop;
    end if;

    insert into events(user_id, name, props, session_id, app_version, client_ts)
    values (
      v_uid,
      v_name,
      v_props,
      v_event ->> 'session_id',
      v_event ->> 'app_version',
      -- client_ts is optional; cast only when present so a missing/empty value
      -- stores NULL rather than erroring.
      nullif(v_event ->> 'client_ts', '')::timestamptz
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

-- The client calls this RPC; grant execute to the authenticated role only
-- (section 4 revoked execute from public/anon on every function).
grant execute on function public.log_events(jsonb) to authenticated;
