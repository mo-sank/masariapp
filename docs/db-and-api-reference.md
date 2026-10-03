Masari: Database and API Reference

_Save this in your repo as docs/db-and-api-reference.md. It is the single source of truth for the schema, security rules, server functions, and external APIs. The SQL below is a DRAFT: Kiro should adapt it into migrations, run supabase db reset, and prove it with pgTAP tests before relying on it._

# 1\. How data flows

| **Layer**            | **What it does**                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| Expo app             | Shows screens. Reads own data with the Supabase client. Writes ONLY through RPC functions.     |
| Auth0                | Logs users in. Issues the JWT. The Auth0 sub is the user id (text).                            |
| Supabase Postgres    | Stores everything. RLS limits reads to the owner. SECURITY DEFINER functions do all writes.    |
| Edge Functions       | ingest-quotes, ingest-bars (scheduled, fetch market data) and delete-account (user-triggered). |
| Market data provider | Called only by Edge Functions, never by the app.                                               |
| Auth0 Management API | Called only by delete-account to remove the Auth0 user.                                        |

# 2\. Conventions

- Primary users table key: user_id text = Auth0 sub. App-owned rows use uuid.
- Money: integer cents (bigint). Quantities: whole shares (bigint).
- Every table has RLS enabled. Clients get SELECT on their own rows only. No direct writes.
- All RPCs: security definer, set search_path = public, validate inputs, derive user from public.current_user_id(), grant execute ... to authenticated.

# 3\. Schema (draft migration SQL)

## 3.1 Helpers and configuration

```
create extension if not exists pgcrypto;
```

```
create or replace function public.current_user_id()
returns text language sql stable
as $$ select nullif(auth.jwt() ->> 'sub', '') $$;
```

```
create table public.app_config (
  key text primary key,
  value jsonb not null
);
insert into public.app_config(key, value) values
  ('min_age', '13'),
  ('starter_cash_cents', '1000000'),
  ('starter_position_cap_cents', '100000'),
  ('watchlist_max', '5'),
  ('quote_stale_minutes', '30');
```

## 3.2 Identity and consent

```
create table public.profiles (
  user_id text primary key,
  username text not null unique check (username ~ '^[a-z]{3,12}-[a-z]{3,12}-[0-9]{2,4}$'),
  birth_year int not null check (birth_year between 1900 and 2100),
  age_band text not null check (age_band in ('13-15','16-17','18+')),
  timezone text not null default 'America/New_York',
  avatar_key text not null default 'default',
  created_at timestamptz not null default now()
);
```

```
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(user_id) on delete cascade,
  consent_type text not null check (consent_type in ('terms','privacy')),
  version text not null,
  accepted_at timestamptz not null default now()
);
```

## 3.3 Market data

```
create table public.instruments (
  symbol text primary key,
  name text not null,
  type text not null default 'stock' check (type in ('stock','etf')),
  sector text,
  is_starter boolean not null default false,
  is_active boolean not null default true,
  sort_order int
);
```

```
create table public.quotes (
  symbol text primary key references public.instruments(symbol),
  price_cents bigint not null check (price_cents > 0),
  prev_close_cents bigint,
  open_cents bigint,
  high_cents bigint,
  low_cents bigint,
  volume bigint,
  as_of timestamptz not null,          -- provider timestamp
  is_delayed boolean not null default true,
  source text not null,
  updated_at timestamptz not null default now()  -- when we wrote it
);
```

```
create table public.quote_bars (
  symbol text not null references public.instruments(symbol),
  bar_date date not null,
  open_cents bigint not null,
  high_cents bigint not null,
  low_cents bigint not null,
  close_cents bigint not null,
  volume bigint,
  primary key (symbol, bar_date)
);
```

```
create table public.market_holidays (
  holiday_date date primary key,
  name text not null,
  is_early_close boolean not null default false
);
```

```
create or replace function public.market_is_open(p_at timestamptz default now())
returns boolean language plpgsql stable as $$
declare
  v_local timestamp := p_at at time zone 'America/New_York';
  v_date date := v_local::date;
  v_time time := v_local::time;
  v_close time := time '16:00';
  v_h public.market_holidays;
begin
  if extract(isodow from v_date) > 5 then return false; end if;
  select * into v_h from public.market_holidays where holiday_date = v_date;
  if found then
    if not v_h.is_early_close then return false; end if;
    v_close := time '13:00';
  end if;
  return v_time >= time '09:30' and v_time < v_close;
end $$;
```

## 3.4 Paper trading ledger

```
create table public.paper_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique references public.profiles(user_id) on delete cascade,
  cash_cents bigint not null check (cash_cents >= 0),
  starting_cash_cents bigint not null,
  created_at timestamptz not null default now()
);
```

```
create table public.positions (
  account_id uuid not null references public.paper_accounts(id) on delete cascade,
  symbol text not null references public.instruments(symbol),
  qty bigint not null check (qty > 0),
  cost_basis_cents bigint not null check (cost_basis_cents > 0),  -- TOTAL cost, not per share
  updated_at timestamptz not null default now(),
  primary key (account_id, symbol)
);
```

```
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.paper_accounts(id) on delete cascade,
  user_id text not null references public.profiles(user_id) on delete cascade,
  symbol text not null references public.instruments(symbol),
  side text not null check (side in ('buy','sell')),
  order_type text not null default 'market' check (order_type in ('market')),
  qty bigint not null check (qty > 0),
  status text not null default 'filled' check (status in ('filled','pending','cancelled')),
  fill_price_cents bigint,
  total_cents bigint,
  realized_pl_cents bigint,
  price_as_of timestamptz,
  price_source text check (price_source in ('delayed_quote','last_close')),
  rationale_tags text[] not null default '{}',
  rationale_text text check (char_length(rationale_text) <= 280),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (account_id, idempotency_key)
);
create index orders_account_created_idx on public.orders(account_id, created_at desc);
```

```
create table public.trade_reflections (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  user_id text not null references public.profiles(user_id) on delete cascade,
  expectation text not null check (expectation in ('better','as_expected','worse')),
  note text check (char_length(note) <= 280),
  created_at timestamptz not null default now()
);
```

```
create table public.watchlist_items (
  user_id text not null references public.profiles(user_id) on delete cascade,
  symbol text not null references public.instruments(symbol),
  added_at timestamptz not null default now(),
  primary key (user_id, symbol)
);
```

```
create table public.portfolio_snapshots (
  account_id uuid not null references public.paper_accounts(id) on delete cascade,
  snap_date date not null,
  cash_cents bigint not null,
  positions_value_cents bigint not null,
  equity_cents bigint not null,
  primary key (account_id, snap_date)
);
```

## 3.5 Learning and progression

```
create table public.lessons_catalog (
  lesson_id text primary key,                 -- 'L0','L1.1','B1'
  unit int not null,
  sort_order int not null,
  kind text not null check (kind in ('placement','lesson','boss')),
  xp_base int not null default 10,
  pass_score int not null default 60,
  prerequisite_lesson_id text references public.lessons_catalog(lesson_id)
);
```

```
create table public.feature_unlock_rules (
  feature_key text primary key,
  lesson_id text not null references public.lessons_catalog(lesson_id),
  description text
);
```

```
create table public.lesson_progress (
  user_id text not null references public.profiles(user_id) on delete cascade,
  lesson_id text not null references public.lessons_catalog(lesson_id),
  status text not null check (status in ('in_progress','completed')),
  attempts int not null default 0,
  best_score numeric(5,2),
  first_try_score numeric(5,2),
  xp_awarded int not null default 0,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
```

```
create table public.lesson_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(user_id) on delete cascade,
  lesson_id text not null references public.lessons_catalog(lesson_id),
  score numeric(5,2) not null,
  duration_ms int,
  answers jsonb not null default '[]',   -- [{item_id, concept, correct, ms}]
  created_at timestamptz not null default now()
);
```

```
create table public.assessment_results (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(user_id) on delete cascade,
  lesson_id text not null references public.lessons_catalog(lesson_id),
  form text not null check (form in ('A','B')),
  score_pct numeric(5,2) not null,
  item_results jsonb not null,           -- [{item_id, concept, correct}]
  taken_at timestamptz not null default now()
);
```

```
create table public.user_stats (
  user_id text primary key references public.profiles(user_id) on delete cascade,
  xp_total int not null default 0,
  streak_current int not null default 0,
  streak_longest int not null default 0,
  last_active_date date,
  streak_freezes int not null default 0 check (streak_freezes between 0 and 3)
);
```

```
create table public.user_unlocks (
  user_id text not null references public.profiles(user_id) on delete cascade,
  feature_key text not null,
  source_lesson_id text references public.lessons_catalog(lesson_id),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, feature_key)
);
```

```
create table public.badges (
  user_id text not null references public.profiles(user_id) on delete cascade,
  badge_key text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_key)
);
```

```
create table public.rewind_items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(user_id) on delete cascade,
  lesson_id text not null references public.lessons_catalog(lesson_id),
  item_id text not null,
  box int not null default 0,            -- spaced-repetition box 0..4
  due_at timestamptz not null default now(),
  last_seen_at timestamptz,
  unique (user_id, item_id)
);
```

## 3.6 Analytics and feedback

```
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
```

```
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(user_id) on delete cascade,
  category text not null check (category in ('bug','idea','confusing','other')),
  message text not null check (char_length(message) between 1 and 1000),
  screen text,
  created_at timestamptz not null default now()
);
```

# 4\. Row Level Security and grants

```
-- Enable RLS everywhere
do $$
declare t text;
begin
  foreach t in array array[
    'app_config','profiles','consents','instruments','quotes','quote_bars','market_holidays',
    'paper_accounts','positions','orders','trade_reflections','watchlist_items','portfolio_snapshots',
    'lessons_catalog','feature_unlock_rules','lesson_progress','lesson_attempts','assessment_results',
    'user_stats','user_unlocks','badges','rewind_items','events','feedback']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;
```

```
-- Reference tables: readable by any signed-in user
do $$
declare t text;
begin
  foreach t in array array['app_config','instruments','quotes','quote_bars','market_holidays','lessons_catalog','feature_unlock_rules']
  loop execute format('create policy "read reference" on public.%I for select to authenticated using (true)', t); end loop;
end $$;
```

```
-- User-owned tables: owner can read own rows
do $$
declare t text;
begin
  foreach t in array array['profiles','consents','paper_accounts','orders','trade_reflections','watchlist_items',
    'lesson_progress','lesson_attempts','assessment_results','user_stats','user_unlocks','badges','rewind_items','feedback']
  loop execute format('create policy "own rows" on public.%I for select to authenticated using (user_id = (select public.current_user_id()))', t); end loop;
end $$;
```

```
-- Account-keyed tables: read through account ownership
create policy "own positions" on public.positions for select to authenticated
  using (account_id in (select id from public.paper_accounts where user_id = (select public.current_user_id())));
create policy "own snapshots" on public.portfolio_snapshots for select to authenticated
  using (account_id in (select id from public.paper_accounts where user_id = (select public.current_user_id())));
```

```
-- events: no select policy at all (write-only through log_events)
```

```
-- Privileges: nothing for anon; signed-in users can only SELECT; no direct writes
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
revoke select on public.events from authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
```

```
revoke execute on all functions in schema public from public, anon;
grant execute on function public.current_user_id() to authenticated;
grant execute on function public.market_is_open(timestamptz) to authenticated;
-- Then GRANT EXECUTE ON each RPC below TO authenticated, individually.
```

_Required pgTAP tests: user A cannot read user B's rows in every user-owned table; anon reads nothing; authenticated cannot INSERT/UPDATE/DELETE any table directly; events cannot be selected by clients._

# 5\. Server functions (RPCs)

## 5.1 create_profile

```
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
  select * into v_profile from profiles where user_id = v_uid;
  if found then return v_profile; end if;                       -- idempotent
```

```
  if p_birth_month not between 1 and 12 or p_birth_year not between 1900 and extract(year from now())::int
    then raise exception 'under_min_age'; end if;
  -- Use the LAST day of the birth month so a borderline user is treated as younger (conservative)
  v_dob := (make_date(p_birth_year, p_birth_month, 1) + interval '1 month' - interval '1 day')::date;
  v_age := extract(year from age(current_date, v_dob))::int;
  if v_age < v_min then raise exception 'under_min_age'; end if;
  v_band := case when v_age < 16 then '13-15' when v_age < 18 then '16-17' else '18+' end;
```

```
  if p_username !~ '^[a-z]{3,12}-[a-z]{3,12}-[0-9]{2,4}$' then raise exception 'invalid_username'; end if;
```

```
  insert into profiles(user_id, username, birth_year, age_band, timezone)
    values (v_uid, p_username, p_birth_year, v_band, coalesce(nullif(p_timezone,''), 'America/New_York'));
  insert into consents(user_id, consent_type, version) values
    (v_uid, 'terms', p_terms_version), (v_uid, 'privacy', p_privacy_version);
  insert into paper_accounts(user_id, cash_cents, starting_cash_cents) values (v_uid, v_cash, v_cash);
  insert into user_stats(user_id) values (v_uid);
```

```
  select * into v_profile from profiles where user_id = v_uid;
  return v_profile;
exception when unique_violation then
  raise exception 'username_taken';   -- NOTE: Kiro should narrow this to the username constraint only
end $$;
```

## 5.2 place_market_order

```
create or replace function public.place_market_order(
  p_symbol text, p_side text, p_qty bigint, p_idempotency_key text,
  p_rationale_tags text[] default '{}', p_rationale_text text default null)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := public.current_user_id();
  v_acct public.paper_accounts; v_inst public.instruments; v_q public.quotes;
  v_pos public.positions; v_existing public.orders; v_order public.orders;
  v_total bigint; v_cap bigint; v_stale int; v_basis_removed bigint; v_realized bigint;
  v_open boolean := public.market_is_open();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
```

```
  select * into v_acct from paper_accounts where user_id = v_uid for update;   -- serialize this user's orders
  if not found then raise exception 'no_account'; end if;
```

```
  select * into v_existing from orders where account_id = v_acct.id and idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;
```

```
  if p_side not in ('buy','sell') or p_qty is null or p_qty < 1 or p_qty > 100000
     or p_idempotency_key is null or length(p_idempotency_key) < 8
    then raise exception 'invalid_order'; end if;
```

```
  if not exists (select 1 from user_unlocks where user_id = v_uid
                 and feature_key = case p_side when 'buy' then 'trade.market_buy' else 'trade.market_sell' end)
    then raise exception 'feature_locked'; end if;
```

```
  select * into v_inst from instruments where symbol = p_symbol and is_active;
  if not found then raise exception 'symbol_not_available'; end if;
  if not v_inst.is_starter and not exists (select 1 from user_unlocks where user_id = v_uid and feature_key = 'trade.full_universe')
    then raise exception 'symbol_not_available'; end if;
```

```
  select * into v_q from quotes where symbol = p_symbol;
  if not found then raise exception 'no_quote'; end if;
  v_stale := coalesce((select (value)::int from app_config where key = 'quote_stale_minutes'), 30);
  if v_open and v_q.updated_at < now() - make_interval(mins => v_stale) then raise exception 'quote_stale'; end if;
```

```
  v_total := v_q.price_cents * p_qty;
```

```
  if p_side = 'buy' then
    if v_acct.cash_cents < v_total then raise exception 'insufficient_cash'; end if;
    v_cap := coalesce((select (value)::bigint from app_config where key = 'starter_position_cap_cents'), 100000);
    select * into v_pos from positions where account_id = v_acct.id and symbol = p_symbol for update;
    if (coalesce(v_pos.qty, 0) + p_qty) * v_q.price_cents > v_cap
       and not exists (select 1 from user_unlocks where user_id = v_uid and feature_key = 'trade.raise_cap')
      then raise exception 'position_cap_exceeded'; end if;
```

```
    update paper_accounts set cash_cents = cash_cents - v_total where id = v_acct.id;
    insert into positions(account_id, symbol, qty, cost_basis_cents) values (v_acct.id, p_symbol, p_qty, v_total)
      on conflict (account_id, symbol) do update
      set qty = positions.qty + excluded.qty,
          cost_basis_cents = positions.cost_basis_cents + excluded.cost_basis_cents,
          updated_at = now();
    v_realized := null;
  else
    select * into v_pos from positions where account_id = v_acct.id and symbol = p_symbol for update;
    if not found or v_pos.qty < p_qty then raise exception 'insufficient_shares'; end if;
    v_basis_removed := case when v_pos.qty = p_qty then v_pos.cost_basis_cents
                            else round(v_pos.cost_basis_cents::numeric * p_qty / v_pos.qty)::bigint end;
    v_realized := v_total - v_basis_removed;
    update paper_accounts set cash_cents = cash_cents + v_total where id = v_acct.id;
    if v_pos.qty = p_qty then
      delete from positions where account_id = v_acct.id and symbol = p_symbol;
    else
      update positions set qty = qty - p_qty, cost_basis_cents = cost_basis_cents - v_basis_removed, updated_at = now()
        where account_id = v_acct.id and symbol = p_symbol;
    end if;
  end if;
```

```
  insert into orders(account_id, user_id, symbol, side, qty, status, fill_price_cents, total_cents, realized_pl_cents,
                     price_as_of, price_source, rationale_tags, rationale_text, idempotency_key)
  values (v_acct.id, v_uid, p_symbol, p_side, p_qty, 'filled', v_q.price_cents, v_total, v_realized,
          v_q.as_of, case when v_open then 'delayed_quote' else 'last_close' end,
          coalesce(p_rationale_tags, '{}'), left(p_rationale_text, 280), p_idempotency_key)
  returning * into v_order;
  return v_order;
end $$;
```

## 5.3 complete_lesson

```
create or replace function public.complete_lesson(
  p_lesson_id text, p_score numeric, p_duration_ms int, p_answers jsonb default '[]'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := public.current_user_id();
  v_cat public.lessons_catalog; v_prog public.lesson_progress; v_stats public.user_stats;
  v_tz text; v_today date; v_first boolean; v_xp int := 0;
  v_streak int; v_freezes int; v_unlocked text[] := '{}';
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_cat from lessons_catalog where lesson_id = p_lesson_id;
  if not found then raise exception 'unknown_lesson'; end if;
  if p_score is null or p_score < 0 or p_score > 100 then raise exception 'invalid_score'; end if;
```

```
  if v_cat.prerequisite_lesson_id is not null and not exists (
       select 1 from lesson_progress where user_id = v_uid
         and lesson_id = v_cat.prerequisite_lesson_id and status = 'completed')
    then raise exception 'prerequisite_not_completed'; end if;
```

```
  insert into lesson_attempts(user_id, lesson_id, score, duration_ms, answers)
    values (v_uid, p_lesson_id, p_score, p_duration_ms, coalesce(p_answers, '[]'));
```

```
  select * into v_prog from lesson_progress where user_id = v_uid and lesson_id = p_lesson_id for update;
  v_first := not found or v_prog.status <> 'completed';
```

```
  if p_score < v_cat.pass_score then
    insert into lesson_progress(user_id, lesson_id, status, attempts, best_score)
      values (v_uid, p_lesson_id, 'in_progress', 1, p_score)
      on conflict (user_id, lesson_id) do update
      set attempts = lesson_progress.attempts + 1,
          best_score = greatest(lesson_progress.best_score, excluded.best_score), updated_at = now();
    return jsonb_build_object('passed', false, 'xp_awarded', 0, 'unlocked', '[]'::jsonb);
  end if;
```

```
  if v_first then
    v_xp := v_cat.xp_base + case when p_score >= 90 and coalesce(v_prog.attempts, 0) = 0 then 5 else 0 end;
  end if;
```

```
  insert into lesson_progress(user_id, lesson_id, status, attempts, best_score, first_try_score, xp_awarded, completed_at)
    values (v_uid, p_lesson_id, 'completed', 1, p_score, p_score, v_xp, now())
    on conflict (user_id, lesson_id) do update
    set status = 'completed', attempts = lesson_progress.attempts + 1,
        best_score = greatest(lesson_progress.best_score, excluded.best_score),
        xp_awarded = lesson_progress.xp_awarded + v_xp,
        completed_at = coalesce(lesson_progress.completed_at, now()), updated_at = now();
```

```
  -- Streak (user's local day)
  select timezone into v_tz from profiles where user_id = v_uid;
  v_today := (now() at time zone v_tz)::date;
  select * into v_stats from user_stats where user_id = v_uid for update;
  v_streak := v_stats.streak_current; v_freezes := v_stats.streak_freezes;
  if v_stats.last_active_date is null then v_streak := 1;
  elsif v_stats.last_active_date = v_today then null;
  elsif v_stats.last_active_date = v_today - 1 then v_streak := v_streak + 1;
  elsif v_stats.last_active_date = v_today - 2 and v_freezes > 0 then v_freezes := v_freezes - 1; v_streak := v_streak + 1;
  else v_streak := 1; end if;
  if v_first and v_cat.kind = 'boss' then v_freezes := least(v_freezes + 1, 3); end if;
```

```
  update user_stats set xp_total = xp_total + v_xp, streak_current = v_streak,
      streak_longest = greatest(streak_longest, v_streak), streak_freezes = v_freezes, last_active_date = v_today
    where user_id = v_uid;
```

```
  if v_first then
    insert into user_unlocks(user_id, feature_key, source_lesson_id)
      select v_uid, feature_key, p_lesson_id from feature_unlock_rules where lesson_id = p_lesson_id
      on conflict do nothing;
    select coalesce(array_agg(feature_key), '{}') into v_unlocked from feature_unlock_rules where lesson_id = p_lesson_id;
  end if;
```

```
  return jsonb_build_object('passed', true, 'first_completion', v_first, 'xp_awarded', v_xp,
    'streak', v_streak, 'streak_freezes', v_freezes, 'unlocked', to_jsonb(v_unlocked));
end $$;
```

## 5.4 Smaller RPCs and server jobs

<div class="joplin-table-wrapper"><table><thead><tr><th><p><strong>Function</strong></p></th><th><p><strong>Signature</strong></p></th><th><p><strong>Behavior</strong></p></th></tr></thead><tbody><tr><td><pre><code>submit_reflection</code></pre></td><td><pre><code>(p_order_id uuid, p_expectation text, p_note text)</code></pre></td><td><p>Requires unlock trade.reflection and that the order belongs to the caller. Inserts one reflection per order.</p></td></tr><tr><td><p>watchlist_add / watchlist_remove</p></td><td><pre><code>(p_symbol text)</code></pre></td><td><p>Requires unlock watchlist. Enforces watchlist_max. Idempotent.</p></td></tr><tr><td><pre><code>log_events</code></pre></td><td><pre><code>(p_events jsonb)</code></pre></td><td><p>Inserts up to 50 events [{name, props, client_ts, session_id, app_version}] for the caller. Rejects unknown event names.</p></td></tr><tr><td><pre><code>save_rewind_items</code></pre></td><td><pre><code>(p_items jsonb)</code></pre></td><td><p>Upserts missed items [{lesson_id, item_id}] with box = 0, due_at = now().</p></td></tr><tr><td><pre><code>review_rewind_item</code></pre></td><td><pre><code>(p_item_id text, p_correct boolean)</code></pre></td><td><p>Correct: box + 1 and push due_at out (1, 3, 7, 14 days). Wrong: box = 0, due now.</p></td></tr><tr><td><pre><code>submit_assessment</code></pre></td><td><pre><code>(p_lesson_id text, p_form text, p_item_results jsonb)</code></pre></td><td><p>Inserts an assessment_results row with the computed score. Used by L0 and later unit checks.</p></td></tr><tr><td><pre><code>submit_feedback</code></pre></td><td><pre><code>(p_category text, p_message text, p_screen text)</code></pre></td><td><p>Inserts a feedback row. Rate-limited to 10 per day per user.</p></td></tr><tr><td><pre><code>get_daily_briefing</code></pre></td><td><pre><code>()</code></pre></td><td><p>Requires unlock daily_briefing. Returns top gainer, top loser among starter stocks, and the caller's day change.</p></td></tr><tr><td><pre><code>snapshot_portfolios</code></pre></td><td><p>() service-only</p></td><td><p>Writes today's portfolio_snapshots row per account. Scheduled after close.</p></td></tr></tbody></table></div>

## 5.5 Scheduled jobs (pg_cron + pg_net)

```
-- Enable extensions pg_cron and pg_net in the Supabase dashboard first.
-- Store the secret once:  select vault.create_secret('<random-string>', 'cron_secret');
```

```
select cron.schedule('ingest-quotes', '*/5 13-21 * * 1-5', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/ingest-quotes',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb);
$$);
```

```
select cron.schedule('ingest-bars', '0 22 * * 1-5', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/ingest-bars',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{"mode":"nightly"}'::jsonb);
$$);
```

```
select cron.schedule('snapshot-portfolios', '30 21 * * 1-5', $$ select public.snapshot_portfolios(); $$);
```

_The ingest functions should skip work unless market_is_open(now()) or market_is_open(now() - interval '25 minutes'), so the final closing price is captured._

# 6\. Evaluation views (for your report)

```
create or replace view public.v_assessment_gain as
select a.user_id, a.score_pct as score_a, b.score_pct as score_b, b.score_pct - a.score_pct as gain
from public.assessment_results a
join public.assessment_results b on b.user_id = a.user_id and b.form = 'B' and a.form = 'A';
```

```
create or replace view public.v_lesson_funnel as
select lesson_id,
       count(*) filter (where status in ('in_progress','completed')) as started,
       count(*) filter (where status = 'completed') as completed
from public.lesson_progress group by lesson_id;
```

_Views are for you (SQL editor or service role), not for the app. Revoke their access from authenticated. Report completion and dropout alongside gains._

# 7\. Edge Functions

<div class="joplin-table-wrapper"><table><thead><tr><th><p><strong>Function</strong></p></th><th><p><strong>Trigger</strong></p></th><th><p><strong>Auth</strong></p></th><th><p><strong>Does</strong></p></th></tr></thead><tbody><tr><td><pre><code>ingest-quotes</code></pre></td><td><p>pg_cron every 5 min, weekdays</p></td><td><p>x-cron-secret header, verify_jwt = false</p></td><td><p>Checks market state, fetches batch snapshots for active instruments from the provider, converts to integer cents, upserts quotes. Keeps last-known-good on failure.</p></td></tr><tr><td><pre><code>ingest-bars</code></pre></td><td><p>pg_cron nightly; manual {"mode":"backfill","years":5}</p></td><td><p>Same</p></td><td><p>Fetches daily bars, upserts quote_bars.</p></td></tr><tr><td><pre><code>delete-account</code></pre></td><td><p>App (Settings), POST</p></td><td><p>Auth0 JWT verified inside the function with jose against the Auth0 JWKS; verify_jwt = false</p></td><td><p>Gets sub, deletes the profiles row via service role (cascades), then deletes the Auth0 user with the Management API. Returns 204.</p></td></tr></tbody></table></div>

_Note: confirm Supabase's current guidance on verifying third-party JWTs inside Edge Functions. The manual jose check above is the safe fallback._

## 7.1 Provider interface (supabase/functions/\_shared/providers/types.ts)

```
export interface ProviderQuote {
  symbol: string; price: number; prevClose?: number; open?: number; high?: number; low?: number;
  volume?: number; asOf: string; // ISO
}
export interface ProviderBar { date: string; open: number; high: number; low: number; close: number; volume?: number }
export interface QuoteProvider {
  name: string;
  getSnapshots(symbols: string[]): Promise<ProviderQuote[]>;          // batch
  getDailyBars(symbol: string, from: string, to: string): Promise<ProviderBar[]>;
}
// Convert dollars -> integer cents ONCE, at the boundary: Math.round(price * 100)
```

_Pick a provider only after a one-hour spike: confirm a batch/snapshot endpoint exists, that ~50 symbols every 5 minutes fits the free-tier rate limit, and that the terms allow displaying delayed data in a published app._

# 8\. Client API map

<div class="joplin-table-wrapper"><table><thead><tr><th><p><strong>Need</strong></p></th><th><p><strong>Call</strong></p></th></tr></thead><tbody><tr><td><p>Create profile</p></td><td><pre><code>rpc('create_profile', {...})</code></pre></td></tr><tr><td><p>Read own profile, stats, unlocks, progress</p></td><td><pre><code>from('profiles' / 'user_stats' / 'user_unlocks' / 'lesson_progress').select()</code></pre></td></tr><tr><td><p>Complete a lesson</p></td><td><pre><code>rpc('complete_lesson', {p_lesson_id, p_score, p_duration_ms, p_answers})</code></pre></td></tr><tr><td><p>List stocks / quotes</p></td><td><p>from('instruments').select() and from('quotes').select()</p></td></tr><tr><td><p>Chart data</p></td><td><pre><code>from('quote_bars').select().eq('symbol', s).gte('bar_date', from)</code></pre></td></tr><tr><td><p>Portfolio</p></td><td><p>from('paper_accounts'), from('positions'), plus quotes to value positions</p></td></tr><tr><td><p>Trade</p></td><td><p>rpc('place_market_order', {...}) with a client-generated UUID idempotency key</p></td></tr><tr><td><p>Trade history</p></td><td><pre><code>from('orders').select().order('created_at', {ascending:false})</code></pre></td></tr><tr><td><p>Reflect</p></td><td><pre><code>rpc('submit_reflection', {...})</code></pre></td></tr><tr><td><p>Watchlist</p></td><td><p>rpc('watchlist_add'), rpc('watchlist_remove'), from('watchlist_items').select()</p></td></tr><tr><td><p>Analytics</p></td><td><p>rpc('log_events', {p_events}) (batched, queued offline)</p></td></tr><tr><td><p>Delete account</p></td><td><p>POST /functions/v1/delete-account with the Auth0 token</p></td></tr></tbody></table></div>

# 9\. Seed data

- instruments.csv: about 50 large US companies covering every sector, 8 flagged is_starter. Suggested starter examples (neutral, not recommendations): AAPL, DIS, NKE, MCD, SBUX, KO, WMT, NFLX. Team reviews the full list against the exclusions in security-privacy.md.
- market_holidays: from the official NYSE calendar for the current and next year (verify, including early closes).
- lessons_catalog and feature_unlock_rules: generated from content/lessons/\*.json by scripts/sync-catalog.ts.