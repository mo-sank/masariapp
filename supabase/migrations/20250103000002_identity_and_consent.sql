-- Foundation migration: identity and consent tables.
-- Source of truth: docs/db-and-api-reference.md section 3.2.
-- RLS policies and grants are added in a later task (section 4), not here.

create table public.profiles (
  user_id text primary key,
  username text not null unique check (username ~ '^[a-z]{3,12}-[a-z]{3,12}-[0-9]{2,4}$'),
  birth_year int not null check (birth_year between 1900 and 2100),
  age_band text not null check (age_band in ('13-15','16-17','18+')),
  timezone text not null default 'America/New_York',
  avatar_key text not null default 'default',
  created_at timestamptz not null default now()
);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(user_id) on delete cascade,
  consent_type text not null check (consent_type in ('terms','privacy')),
  version text not null,
  accepted_at timestamptz not null default now()
);
