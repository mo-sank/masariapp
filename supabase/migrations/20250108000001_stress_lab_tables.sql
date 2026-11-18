-- Portfolio Stress Lab migration (1/3): tables.
-- Source of truth: .agents/tasks/portfolio-stress-lab/design.md section "Data model".
--
-- This migration adds the Stress Lab schema: one app-authored reference table
-- (stress_scenarios, seeded from supabase/seed/stress_scenarios.sql) and four
-- user-owned tables (stress_simulations, stress_predictions, stress_reflections,
-- stress_challenge_progress). RLS policies and grants for these tables are added
-- in 20250108000002_stress_lab_rls_and_grants.sql, not here; the write RPCs
-- (record_simulation / save_prediction / save_reflection /
-- upsert_challenge_progress) are added in 20250108000003_stress_lab_rpcs.sql.
--
-- Simulations are snapshot-based: holdings_snapshot, assumptions_snapshot and
-- asset_results are stored as jsonb with no FK to live positions, so a later
-- trade can never mutate a stored run (FR-26). Ownership is keyed by user_id
-- (Auth0 sub) rather than account_id so history is about the student and
-- survives position changes, matching orders / watchlist_items.

create table public.stress_scenarios (
  id text primary key,
  name text not null,
  description text not null,
  cause text not null,
  conditions text not null,
  expected_impacts text not null,
  learning_objective text not null,
  severity text not null check (severity in ('low','medium','high','severe')),
  assumptions jsonb not null,  -- { broad_market, sectors: {<sector>: n}, recovery?: {...} }
  sort_order int not null,
  is_active boolean not null default true
);

create table public.stress_simulations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(user_id) on delete cascade,
  scenario_id text not null references public.stress_scenarios(id),
  phase text not null default 'shock' check (phase in ('shock','recovery')),
  starting_value_cents bigint not null,
  simulated_value_cents bigint not null,
  change_cents bigint not null,
  change_basis_points int,  -- null when starting value is 0
  cash_cents bigint not null,
  holdings_snapshot jsonb not null,    -- [{ symbol, name, sector, qty, current_value_cents }]
  assumptions_snapshot jsonb not null, -- the scenario assumptions used for this run (FR-25)
  asset_results jsonb not null,        -- [{ symbol, name, sector, qty, original_value_cents, shock,
                                       --    used_broad_market, simulated_change_cents,
                                       --    simulated_change_bp, simulated_value_cents }]
  created_at timestamptz not null default now()
);
create index stress_simulations_user_created_idx
  on public.stress_simulations(user_id, created_at desc);
create index stress_simulations_user_scenario_created_idx
  on public.stress_simulations(user_id, scenario_id, created_at desc);

create table public.stress_predictions (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null unique references public.stress_simulations(id) on delete cascade,
  user_id text not null references public.profiles(user_id) on delete cascade,
  direction text not null check (direction in ('gain','lose')),
  estimated_change_bp int,
  picked_best text,
  picked_worst text,
  accuracy jsonb,  -- computed server-side vs the stored result
  created_at timestamptz not null default now()
);

create table public.stress_reflections (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.stress_simulations(id) on delete cascade,
  user_id text not null references public.profiles(user_id) on delete cascade,
  responses jsonb not null,  -- [{ question_id, answer }] (answer length clamped server-side)
  created_at timestamptz not null default now()
);

create table public.stress_challenge_progress (
  user_id text not null references public.profiles(user_id) on delete cascade,
  scenario_id text not null references public.stress_scenarios(id),
  challenge_id text not null,
  status text not null check (status in ('in_progress','met')),
  best_simulation_id uuid references public.stress_simulations(id),
  attempts int not null default 0,
  met_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, scenario_id, challenge_id)
);
