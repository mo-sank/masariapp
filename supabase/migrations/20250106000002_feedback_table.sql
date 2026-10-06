-- Progression, Unlocks & Evaluation migration (task 7): the in-app feedback
-- table plus its RLS policy and client grant.
-- Source of truth: docs/db-and-api-reference.md section 3.6 (the feedback table)
-- and section 4 (feedback is RLS-enabled and listed under the "own rows"
-- user-owned tables).
--
-- The foundation events migration (20250103000005) deliberately left feedback
-- for "a later spec"; this is that spec. The table is created here and the
-- submit_feedback RPC is added in the next migration.
--
-- Privacy (requirement 5.3): a feedback row is readable only by the user who
-- wrote it (the "own rows" SELECT policy below) and by the team through the
-- service role / dashboard (which bypasses RLS). No shared or cross-user read
-- path exists. Writes never go directly to this table — the client holds only
-- SELECT (granted below) and all inserts flow through the SECURITY DEFINER
-- submit_feedback RPC in the following migration.

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(user_id) on delete cascade,
  category text not null check (category in ('bug','idea','confusing','other')),
  message text not null check (char_length(message) between 1 and 1000),
  screen text,
  created_at timestamptz not null default now()
);

-- The RPC counts a user's rows from the last 24 hours to enforce the daily
-- limit; index (user_id, created_at) so that count stays cheap as feedback
-- accumulates (mirrors events_user_created_idx on the sibling events table).
create index feedback_user_created_idx on public.feedback(user_id, created_at);

-- The foundation RLS/grants migration (20250103000006) ran its schema-wide
-- grant/revoke before this table existed, so — exactly like the learning tables
-- migration — this migration must enable RLS, add the policy, and grant SELECT
-- to authenticated for this one new table explicitly.
alter table public.feedback enable row level security;

-- User-owned: the owner can read only their own feedback (requirement 5.3). The
-- team reads via the service role, which bypasses RLS.
create policy "own rows" on public.feedback for select to authenticated
  using (user_id = (select public.current_user_id()));

-- Clients get SELECT only; the schema-wide grant predates this table and the
-- default-privileges revoke means it otherwise carries no client grant. No DML
-- grant is given — the submit_feedback RPC (next migration) owns every write.
grant select on public.feedback to authenticated;

-- The per-user daily feedback cap. Kept in app_config so the team can tune it
-- without a release (requirement 8.1 posture, matching watchlist_max etc.). The
-- RPC falls back to 10 if this key is ever missing or malformed.
insert into public.app_config(key, value) values ('feedback_daily_limit', '10')
  on conflict (key) do nothing;
