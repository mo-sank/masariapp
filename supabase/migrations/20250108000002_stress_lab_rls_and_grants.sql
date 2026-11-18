-- Portfolio Stress Lab migration (2/3): RLS policies and grants.
-- Source of truth: .agents/tasks/portfolio-stress-lab/design.md section
-- "RLS & grants".
--
-- Scope: the five tables created in 20250108000001_stress_lab_tables.sql.
-- Mirrors 20250105000003_market_trading_rls_and_grants.sql exactly: default
-- deny for anon, SELECT-only for authenticated, never direct writes. All writes
-- go through the SECURITY DEFINER RPCs in 20250108000003_stress_lab_rpcs.sql.

-- Enable RLS on every Stress Lab table.
do $$
declare t text;
begin
  foreach t in array array[
    'stress_scenarios','stress_simulations','stress_predictions',
    'stress_reflections','stress_challenge_progress']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

-- Reference table: the app-authored scenarios are readable by any signed-in user.
create policy "read reference" on public.stress_scenarios
  for select to authenticated using (true);

-- User-owned tables: owner can read own rows (keyed by user_id).
do $$
declare t text;
begin
  foreach t in array array[
    'stress_simulations','stress_predictions','stress_reflections',
    'stress_challenge_progress']
  loop execute format('create policy "own rows" on public.%I for select to authenticated using (user_id = (select public.current_user_id()))', t); end loop;
end $$;

-- Privileges: nothing for anon; signed-in users can only SELECT; no direct
-- writes. Writes are RPC-only (20250108000003_stress_lab_rpcs.sql).
revoke all on
  public.stress_scenarios, public.stress_simulations, public.stress_predictions,
  public.stress_reflections, public.stress_challenge_progress
  from anon, authenticated;
grant select on
  public.stress_scenarios, public.stress_simulations, public.stress_predictions,
  public.stress_reflections, public.stress_challenge_progress
  to authenticated;
