-- Onboarding-revamp migration: the is_username_available RPC.
--
-- The onboarding screen checks a candidate username as the user types so it can
-- show "available" / "taken" / "invalid" before they submit. This RPC answers
-- that question. It is advisory only — create_profile remains the authoritative
-- write path and still handles the race where a name is taken between the check
-- and the submit (via its username_taken mapping).
--
-- Returns false when:
--   * the name fails public.username_allowed(...) (bad format or blocklisted), or
--   * a profile with the same name (case-insensitively) already exists.
-- Returns true otherwise.
--
-- SECURITY DEFINER so it can read profiles regardless of the caller's RLS view
-- (it only ever returns a boolean, never any row data, so it leaks nothing about
-- who owns a name). Derives nothing from arguments beyond the candidate string.

create or replace function public.is_username_available(p_username text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.username_allowed(p_username) then
    return false;
  end if;

  -- Case-insensitive existence check, matching the profiles_username_lower_key
  -- unique index. Returns true only when no row currently holds the name.
  return not exists (
    select 1 from public.profiles where lower(username) = lower(p_username)
  );
end $$;

-- The client calls this RPC while signed in; grant execute to authenticated.
grant execute on function public.is_username_available(text) to authenticated;
