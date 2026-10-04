-- lesson-engine migration (task 2): RLS policies and privilege grants for the
-- learning tables created in 20250104000001_learning_tables.sql.
-- Source of truth: docs/db-and-api-reference.md section 4.
--
-- The foundation RLS/grants migration (20250103000006) ran the schema-wide
-- `grant select on all tables ... to authenticated` and set a default-privileges
-- revoke, but those statements only affected tables that existed at that time.
-- The learning tables are created later, so this migration must:
--   * enable RLS on each new table,
--   * add the correct SELECT policy (reference = readable by all authenticated;
--     user-owned = own rows only), and
--   * grant SELECT to authenticated on each new table explicitly (the earlier
--     schema-wide grant did not reach these later-created tables, and the
--     default-privileges revoke means they start with no client grant).
-- No INSERT/UPDATE/DELETE is ever granted: all writes go through the SECURITY
-- DEFINER RPCs added in the following migrations.

-- Enable RLS on every learning table this spec owns.
do $$
declare t text;
begin
  foreach t in array array[
    'lessons_catalog','feature_unlock_rules','lesson_progress','lesson_attempts',
    'assessment_results','user_unlocks','badges','rewind_items']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

-- Reference tables: readable by any signed-in user (the client renders the path
-- and unlock previews from these). Section 4 lists both under "read reference".
do $$
declare t text;
begin
  foreach t in array array['lessons_catalog','feature_unlock_rules']
  loop execute format('create policy "read reference" on public.%I for select to authenticated using (true)', t); end loop;
end $$;

-- User-owned tables: owner can read only their own rows.
do $$
declare t text;
begin
  foreach t in array array[
    'lesson_progress','lesson_attempts','assessment_results',
    'user_unlocks','badges','rewind_items']
  loop execute format('create policy "own rows" on public.%I for select to authenticated using (user_id = (select public.current_user_id()))', t); end loop;
end $$;

-- Grant SELECT to authenticated on exactly these new tables. The schema-wide
-- grant in the foundation migration predates them, and the default-privileges
-- revoke means they otherwise carry no client grant. No DML grants are given;
-- writes happen only through the RPCs below.
grant select on public.lessons_catalog to authenticated;
grant select on public.feature_unlock_rules to authenticated;
grant select on public.lesson_progress to authenticated;
grant select on public.lesson_attempts to authenticated;
grant select on public.assessment_results to authenticated;
grant select on public.user_unlocks to authenticated;
grant select on public.badges to authenticated;
grant select on public.rewind_items to authenticated;
