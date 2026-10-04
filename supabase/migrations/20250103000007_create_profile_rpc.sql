-- Foundation migration: the create_profile RPC and its grant.
-- Source of truth: docs/db-and-api-reference.md section 5.1.
--
-- create_profile is the SECURITY DEFINER write path for onboarding. The client
-- holds only SELECT on the owned tables (see the RLS/grants migration), so this
-- function is the only way a profile and its companion rows are created. It:
--   * derives the user from public.current_user_id() (never from an argument),
--   * is idempotent: a second call for the same sub returns the existing
--     profile and creates no duplicate consent/paper_account/user_stats rows,
--   * conservatively rejects under-min-age users (last day of the birth month),
--   * validates the username format against the profiles CHECK constraint,
--   * seeds a paper account with the configured starter cash and a user_stats
--     row in the same transaction.
--
-- Difference from the draft in section 5.1: the draft maps ANY unique_violation
-- to 'username_taken'. That is too broad — paper_accounts.user_id and
-- user_stats.user_id are also UNIQUE, so a race could surface those as a
-- misleading "username taken". We narrow the mapping to the username unique
-- constraint only (profiles_username_key) and re-raise anything else unchanged.

create or replace function public.create_profile(
  p_username text, p_birth_year int, p_birth_month int, p_timezone text,
  p_terms_version text, p_privacy_version text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := public.current_user_id();
  v_min int := coalesce((select (value)::int from app_config where key = 'min_age'), 13);
  v_cash bigint := coalesce((select (value)::bigint from app_config where key = 'starter_cash_cents'), 1000000);
  v_dob date; v_age int; v_band text; v_profile public.profiles;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- Idempotent: if a profile already exists for this user, return it unchanged.
  select * into v_profile from profiles where user_id = v_uid;
  if found then return v_profile; end if;

  -- Age gate (conservative): treat the birthday as the LAST day of the birth
  -- month so a borderline user is classified as younger. Out-of-range month or
  -- year is also a reason to block rather than silently proceed.
  if p_birth_month not between 1 and 12
     or p_birth_year not between 1900 and extract(year from now())::int
    then raise exception 'under_min_age'; end if;
  v_dob := (make_date(p_birth_year, p_birth_month, 1) + interval '1 month' - interval '1 day')::date;
  v_age := extract(year from age(current_date, v_dob))::int;
  if v_age < v_min then raise exception 'under_min_age'; end if;
  v_band := case when v_age < 16 then '13-15' when v_age < 18 then '16-17' else '18+' end;

  -- Username must match the same shape the profiles CHECK enforces. Validate
  -- here too so the client gets 'invalid_username' instead of a raw check error.
  if p_username !~ '^[a-z]{3,12}-[a-z]{3,12}-[0-9]{2,4}$' then
    raise exception 'invalid_username';
  end if;

  insert into profiles(user_id, username, birth_year, age_band, timezone)
    values (v_uid, p_username, p_birth_year, v_band,
            coalesce(nullif(p_timezone, ''), 'America/New_York'));
  insert into consents(user_id, consent_type, version) values
    (v_uid, 'terms', p_terms_version), (v_uid, 'privacy', p_privacy_version);
  insert into paper_accounts(user_id, cash_cents, starting_cash_cents)
    values (v_uid, v_cash, v_cash);
  insert into user_stats(user_id) values (v_uid);

  select * into v_profile from profiles where user_id = v_uid;
  return v_profile;
exception
  when unique_violation then
    -- Only a clash on the username should surface as 'username_taken'. Any
    -- other unique_violation (e.g. a concurrent create racing on the user_id
    -- keys) is unexpected here and is re-raised unchanged.
    if sqlerrm like '%profiles_username_key%' then
      raise exception 'username_taken';
    end if;
    raise;
end $$;

-- The client calls this RPC; grant execute to the authenticated role only
-- (section 4 revoked execute from public/anon on every function).
grant execute on function public.create_profile(text, int, int, text, text, text)
  to authenticated;
