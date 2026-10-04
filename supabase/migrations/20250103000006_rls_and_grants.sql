-- Foundation migration: row-level security policies and privilege grants.
-- Source of truth: docs/db-and-api-reference.md section 4.
--
-- Scope: this spec only owns app_config, profiles, consents, instruments,
-- paper_accounts, user_stats, and events. The table arrays below are the
-- section-4 lists narrowed to those tables. Later specs add their own tables
-- (and the policies/grants for them) when they create them. The schema-wide
-- revoke/grant/default-privilege statements come verbatim from section 4; the
-- public schema currently contains only this spec's tables, so they apply to
-- exactly the owned set.

-- Enable RLS on every table this spec owns.
do $$
declare t text;
begin
  foreach t in array array[
    'app_config','profiles','consents','instruments',
    'paper_accounts','user_stats','events']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

-- Reference tables: readable by any signed-in user.
do $$
declare t text;
begin
  foreach t in array array['app_config','instruments']
  loop execute format('create policy "read reference" on public.%I for select to authenticated using (true)', t); end loop;
end $$;

-- User-owned tables: owner can read own rows.
do $$
declare t text;
begin
  foreach t in array array['profiles','consents','paper_accounts','user_stats']
  loop execute format('create policy "own rows" on public.%I for select to authenticated using (user_id = (select public.current_user_id()))', t); end loop;
end $$;

-- events: no select policy at all (write-only through log_events).

-- Privileges: nothing for anon; signed-in users can only SELECT; no direct writes.
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
revoke select on public.events from authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.current_user_id() to authenticated;
-- Later tasks GRANT EXECUTE on each RPC (create_profile, log_events, ...) to
-- authenticated individually when those functions are created.
