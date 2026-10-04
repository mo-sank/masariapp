-- Foundation migration: analytics events table.
-- Source of truth: docs/db-and-api-reference.md section 3.6 (events table only).
-- feedback belongs to a later spec and is not created here.
-- RLS policies and grants are added in a later task (section 4), not here.
-- events is write-only (append via the log_events RPC); it gets no SELECT policy.

create table public.events (
  id bigint generated always as identity primary key,
  user_id text not null references public.profiles(user_id) on delete cascade,
  name text not null,
  props jsonb not null default '{}',
  session_id text,
  app_version text,
  client_ts timestamptz,
  created_at timestamptz not null default now()
);
create index events_user_created_idx on public.events(user_id, created_at);
create index events_name_created_idx on public.events(name, created_at);
