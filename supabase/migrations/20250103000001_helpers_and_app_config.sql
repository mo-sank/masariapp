-- Foundation migration: extensions, current_user_id() helper, and app_config.
-- Source of truth: docs/db-and-api-reference.md section 3.1.
-- RLS policies and grants are added in a later task (section 4), not here.

create extension if not exists pgcrypto;

-- Resolves the caller's Auth0 `sub` from the verified JWT. Used by RLS and RPCs.
create or replace function public.current_user_id()
returns text language sql stable
as $$ select nullif(auth.jwt() ->> 'sub', '') $$;

-- Key/value configuration table (reference data).
create table public.app_config (
  key text primary key,
  value jsonb not null
);
