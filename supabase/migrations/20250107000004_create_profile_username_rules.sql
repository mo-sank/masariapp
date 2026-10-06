-- Onboarding-revamp migration: make create_profile use the shared username
-- validator and the case-insensitive unique index.
--
-- Two changes vs. the foundation definition (20250103000007_create_profile_rpc):
--   1. Username validation is delegated to public.username_allowed(...) (format +
--      blocklist) instead of an inline regex, so a user-chosen name is held to
--      the SAME rules as the live availability check and a profane name is
--      rejected as `invalid_username`.
--   2. The username_taken mapping keys on the NEW case-insensitive unique index
--      `profiles_username_lower_key` (the old plain `profiles_username_key`
--      constraint was dropped in 20250107000002_username_rules). A clash on that
--      index — including a name differing only in case — surfaces as
--      `username_taken` rather than a raw unique_violation.
--
-- Everything else (idempotency, the conservative age gate, seeding the consent /
-- paper_account / user_stats rows) is unchanged from the foundation definition.
-- We redefine the function here as a forward migration rather than editing the
-- already-applied one.

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

  -- Username must satisfy the shared validator (format + blocklist). This is the
  -- same gate the live availability check uses, so the client gets a stable
  -- 'invalid_username' for a malformed OR profane name rather than a raw CHECK
  -- error.
  if not public.username_allowed(p_username) then
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
    -- Only a clash on the (case-insensitive) username index should surface as
    -- 'username_taken'. Any other unique_violation (e.g. a concurrent create
    -- racing on the user_id keys) is unexpected here and is re-raised unchanged.
    if sqlerrm like '%profiles_username_lower_key%' then
      raise exception 'username_taken';
    end if;
    raise;
end $$;

-- Re-affirm the execute grant (create or replace keeps existing grants, but we
-- state it explicitly to match the foundation migration).
grant execute on function public.create_profile(text, int, int, text, text, text)
  to authenticated;
