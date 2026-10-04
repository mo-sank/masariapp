-- lesson-engine migration (task 2): learning and progression tables.
-- Source of truth: docs/db-and-api-reference.md section 3.5.
--
-- Scope: this migration creates the eight learning tables the lesson engine
-- owns: lessons_catalog, feature_unlock_rules, lesson_progress, lesson_attempts,
-- assessment_results, user_unlocks, badges, rewind_items. The companion
-- user_stats table was already created by the foundation spec (migration
-- 20250103000004_account_tables.sql) because onboarding seeds a stats row, so it
-- is NOT recreated here; the RPCs in later migrations update it in place.
--
-- RLS policies and grants are added in the next migration (section 4), not here.
-- The RPCs (complete_lesson, submit_assessment, save_rewind_items,
-- review_rewind_item) are added in their own migrations after that.

-- Lesson catalog: one row per authored lesson. Generated/seeded from
-- content/lessons/*.json by scripts/sync-catalog.ts (task 3). The self FK on
-- prerequisite_lesson_id lets complete_lesson enforce prerequisites in SQL.
create table public.lessons_catalog (
  lesson_id text primary key,                 -- 'L0','L1.1','B1'
  unit int not null,
  sort_order int not null,
  kind text not null check (kind in ('placement','lesson','boss')),
  xp_base int not null default 10,
  pass_score int not null default 60,
  prerequisite_lesson_id text references public.lessons_catalog(lesson_id)
);

-- Which feature a lesson unlocks on first completion. complete_lesson copies
-- matching rows into user_unlocks. Also seeded by sync-catalog.ts.
create table public.feature_unlock_rules (
  feature_key text primary key,
  lesson_id text not null references public.lessons_catalog(lesson_id),
  description text
);

-- Per-user, per-lesson progress. One row per (user, lesson). status flips to
-- 'completed' the first time the pass score is met; attempts and best_score keep
-- climbing on replays, but XP is only awarded on first completion.
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

-- Immutable log of every attempt (append-only). answers holds the per-item
-- results the player sends: [{item_id, concept, correct, ms}].
create table public.lesson_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(user_id) on delete cascade,
  lesson_id text not null references public.lessons_catalog(lesson_id),
  score numeric(5,2) not null,
  duration_ms int,
  answers jsonb not null default '[]',   -- [{item_id, concept, correct, ms}]
  created_at timestamptz not null default now()
);

-- Placement/unit-check results (L0 Form A, later Form B). Stored separately from
-- lesson_attempts because the assessment has no pass/fail and records per-item
-- concept correctness for the learning-gain evaluation views.
create table public.assessment_results (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(user_id) on delete cascade,
  lesson_id text not null references public.lessons_catalog(lesson_id),
  form text not null check (form in ('A','B')),
  score_pct numeric(5,2) not null,
  item_results jsonb not null,           -- [{item_id, concept, correct}]
  taken_at timestamptz not null default now()
);

-- Features the user has unlocked. One row per (user, feature). The source lesson
-- is recorded for auditing/analytics; the uniqueness is on (user, feature) so
-- re-completing a lesson never duplicates an unlock.
create table public.user_unlocks (
  user_id text not null references public.profiles(user_id) on delete cascade,
  feature_key text not null,
  source_lesson_id text references public.lessons_catalog(lesson_id),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, feature_key)
);

-- Earned badges. One row per (user, badge).
create table public.badges (
  user_id text not null references public.profiles(user_id) on delete cascade,
  badge_key text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_key)
);

-- Spaced-repetition queue of missed scored items. box 0..4 maps to the review
-- intervals (0,1,3,7,14 days) applied by review_rewind_item. The unique
-- (user_id, item_id) lets save_rewind_items upsert the same item idempotently.
create table public.rewind_items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(user_id) on delete cascade,
  lesson_id text not null references public.lessons_catalog(lesson_id),
  item_id text not null,
  box int not null default 0 check (box between 0 and 4),  -- spaced-repetition box 0..4
  due_at timestamptz not null default now(),
  last_seen_at timestamptz,
  unique (user_id, item_id)
);

-- Query the Learn tab's "due Rewind items" count efficiently.
create index rewind_items_user_due_idx on public.rewind_items(user_id, due_at);
