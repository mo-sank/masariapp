-- Market-data-paper-trading migration: extend the log_events allowlist with the
-- trading lifecycle event names (requirements 8.4, 9.2).
--
-- ALLOWLIST MIRROR (requirement 9.4): the server-side allowlist in log_events
-- MUST stay in sync with the canonical client list in
-- src/features/progress/analytics-events.ts. The foundation spec shipped
-- `session_start` and `onboarding_completed`; the lesson-engine spec added the
-- four lesson events; the market-data-paper-trading spec adds the four trading
-- events below. We redefine log_events here (rather than editing the
-- already-applied migration 20250104000005) so the change is a forward
-- migration. Only the allowlist array changes; the body is otherwise identical
-- to the lesson-engine definition.

create or replace function public.log_events(p_events jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := public.current_user_id();
  -- Mirror of src/features/progress/analytics-events.ts. Keep in sync.
  v_allowed text[] := array[
    -- foundation-auth-data
    'session_start',
    'onboarding_completed',
    -- lesson-engine (requirement 10.1)
    'lesson_started',
    'step_answered',
    'lesson_completed',
    'rewind_session_completed',
    -- market-data-paper-trading (requirements 8.4, 9.2)
    'trade_placed',
    'reflection_submitted',
    'watchlist_changed',
    'stock_viewed'
  ];
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

-- Re-affirm the execute grant (create or replace keeps existing grants, but we
-- state it explicitly to match the earlier migrations).
grant execute on function public.log_events(jsonb) to authenticated;
