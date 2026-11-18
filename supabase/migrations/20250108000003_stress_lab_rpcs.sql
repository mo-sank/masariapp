-- Portfolio Stress Lab migration (3/3): the SECURITY DEFINER write RPCs.
-- Source of truth: .agents/tasks/portfolio-stress-lab/design.md section
-- "RPCs" and the design-review NITs (NIT-2 server-generated ids,
-- NIT-3 COVID recovery is an independent shock, not composed on the crash).
--
-- Clients hold only SELECT on the five Stress Lab tables, so every write runs
-- here under definer privileges. Each function derives the user from
-- public.current_user_id() (never from an argument) and is granted to the
-- authenticated role only. Mirrors place_market_order
-- (20250105000006_place_market_order_rpc.sql).
--
-- Error codes raised (surfaced as friendly text by the client):
--   not_authenticated, no_account, unknown_scenario, scenario_inactive,
--   not_found (prediction/reflection/challenge against a run the caller does
--   not own), invalid_prediction, invalid_reflection, invalid_challenge.

-- record_simulation re-reads the caller's account/positions/quotes server-side,
-- applies the scenario shock table, and inserts an authoritative, immutable
-- snapshot run. A holding whose symbol has no quote is valued at 0, matching
-- fetchPortfolio so the server and client agree. The simulated value of each
-- holding is floored at 0 (a position cannot go below zero). Simulation ids are
-- server-generated (gen_random_uuid default); no client id or idempotency key is
-- used (design-review NIT-2) — the client disables the run button while pending.
create or replace function public.record_simulation(
  p_scenario_id text, p_phase text default 'shock')
returns public.stress_simulations
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := public.current_user_id();
  v_acct public.paper_accounts;
  v_scn public.stress_scenarios;
  v_phase text := coalesce(p_phase, 'shock');
  v_shocks jsonb;          -- the shock table (broad_market + sectors) used for this run
  v_holdings jsonb := '[]'::jsonb;
  v_results jsonb := '[]'::jsonb;
  v_starting bigint := 0;  -- positions value + cash
  v_simulated bigint := 0;
  v_positions_value bigint := 0;
  v_simulated_positions bigint := 0;
  v_change bigint;
  v_change_bp int;
  r record;
  v_value bigint;
  v_shock numeric;
  v_used_broad boolean;
  v_sim_value bigint;
  v_sim_change bigint;
  v_sim_change_bp int;
  v_row public.stress_simulations;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  if v_phase not in ('shock','recovery') then raise exception 'invalid_phase'; end if;

  -- Scenario must exist and be active.
  select * into v_scn from stress_scenarios where id = p_scenario_id;
  if not found then raise exception 'unknown_scenario'; end if;
  if not v_scn.is_active then raise exception 'scenario_inactive'; end if;

  -- Caller's paper account (the lab starts from the real paper portfolio).
  select * into v_acct from paper_accounts where user_id = v_uid;
  if not found then raise exception 'no_account'; end if;

  -- Select the shock table for this phase. Recovery is an INDEPENDENT shock
  -- applied to the current holdings, NOT composed on a crash result
  -- (design-review NIT-3); it is only meaningful when the scenario carries a
  -- recovery table (covid_2020), otherwise fall back to the base table.
  if v_phase = 'recovery' and v_scn.assumptions ? 'recovery' then
    v_shocks := v_scn.assumptions -> 'recovery';
  else
    v_shocks := v_scn.assumptions;
  end if;

  -- Read the caller's positions joined to instrument metadata (name, sector)
  -- and the current quote. A missing quote values the holding at 0.
  for r in
    select p.symbol,
           i.name,
           i.sector,
           p.qty,
           coalesce(q.price_cents, 0) * p.qty as value_cents
    from positions p
    join paper_accounts a on a.id = p.account_id
    join instruments i on i.symbol = p.symbol
    left join quotes q on q.symbol = p.symbol
    where a.user_id = v_uid
    order by p.symbol
  loop
    v_value := r.value_cents;

    -- shock = sectors->><sector> when present, else broad_market.
    if r.sector is not null and (v_shocks -> 'sectors') ? r.sector then
      v_shock := (v_shocks -> 'sectors' ->> r.sector)::numeric;
      v_used_broad := false;
    else
      v_shock := (v_shocks ->> 'broad_market')::numeric;
      v_used_broad := true;
    end if;

    -- Round the delta so a zero shock is exactly identity; floor at 0.
    v_sim_value := greatest(v_value + round(v_value * v_shock)::bigint, 0);
    v_sim_change := v_sim_value - v_value;
    v_sim_change_bp := case when v_value = 0 then null
                            else round((v_sim_value - v_value)::numeric / v_value * 10000)::int end;

    v_positions_value := v_positions_value + v_value;
    v_simulated_positions := v_simulated_positions + v_sim_value;

    v_holdings := v_holdings || jsonb_build_object(
      'symbol', r.symbol, 'name', r.name, 'sector', r.sector,
      'qty', r.qty, 'current_value_cents', v_value);

    v_results := v_results || jsonb_build_object(
      'symbol', r.symbol, 'name', r.name, 'sector', r.sector, 'qty', r.qty,
      'original_value_cents', v_value, 'shock', v_shock,
      'used_broad_market', v_used_broad,
      'simulated_change_cents', v_sim_change,
      'simulated_change_bp', v_sim_change_bp,
      'simulated_value_cents', v_sim_value);
  end loop;

  -- Cash is a pass-through term, never shocked (FR-15).
  v_starting := v_positions_value + v_acct.cash_cents;
  v_simulated := v_simulated_positions + v_acct.cash_cents;
  v_change := v_simulated - v_starting;
  v_change_bp := case when v_starting = 0 then null
                      else round(v_change::numeric / v_starting * 10000)::int end;

  insert into stress_simulations(
      user_id, scenario_id, phase, starting_value_cents, simulated_value_cents,
      change_cents, change_basis_points, cash_cents,
      holdings_snapshot, assumptions_snapshot, asset_results)
  values (
      v_uid, v_scn.id, v_phase, v_starting, v_simulated,
      v_change, v_change_bp, v_acct.cash_cents,
      v_holdings, v_shocks, v_results)
  returning * into v_row;
  return v_row;
end $$;

grant execute on function public.record_simulation(text, text) to authenticated;

-- save_prediction attaches a prediction to a run the caller owns and computes
-- accuracy against the stored result. Unique on simulation_id, so a re-save
-- updates the existing row.
create or replace function public.save_prediction(
  p_simulation_id uuid, p_direction text, p_estimated_change_bp int default null,
  p_best text default null, p_worst text default null)
returns public.stress_predictions
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := public.current_user_id();
  v_sim public.stress_simulations;
  v_actual_dir text;
  v_actual_best text;
  v_actual_worst text;
  v_accuracy jsonb;
  v_row public.stress_predictions;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_direction not in ('gain','lose') then raise exception 'invalid_prediction'; end if;
  if p_estimated_change_bp is not null
     and (p_estimated_change_bp < -10000 or p_estimated_change_bp > 10000)
    then raise exception 'invalid_prediction'; end if;

  -- Ownership check.
  select * into v_sim from stress_simulations
    where id = p_simulation_id and user_id = v_uid;
  if not found then raise exception 'not_found'; end if;

  -- Derive the actual outcome from the stored result for accuracy scoring.
  v_actual_dir := case when v_sim.change_cents >= 0 then 'gain' else 'lose' end;
  select ar->>'symbol' into v_actual_best
    from jsonb_array_elements(v_sim.asset_results) ar
    order by (ar->>'simulated_change_bp')::numeric desc nulls last limit 1;
  select ar->>'symbol' into v_actual_worst
    from jsonb_array_elements(v_sim.asset_results) ar
    order by (ar->>'simulated_change_bp')::numeric asc nulls last limit 1;

  v_accuracy := jsonb_build_object(
    'direction_correct', (p_direction = v_actual_dir),
    'actual_direction', v_actual_dir,
    'actual_change_bp', v_sim.change_basis_points,
    'estimate_error_bp',
      case when p_estimated_change_bp is null or v_sim.change_basis_points is null
           then null
           else abs(p_estimated_change_bp - v_sim.change_basis_points) end,
    'best_correct', (p_best is not null and p_best = v_actual_best),
    'worst_correct', (p_worst is not null and p_worst = v_actual_worst),
    'actual_best', v_actual_best,
    'actual_worst', v_actual_worst);

  insert into stress_predictions(
      simulation_id, user_id, direction, estimated_change_bp,
      picked_best, picked_worst, accuracy)
  values (
      p_simulation_id, v_uid, p_direction, p_estimated_change_bp,
      p_best, p_worst, v_accuracy)
  on conflict (simulation_id) do update set
      direction = excluded.direction,
      estimated_change_bp = excluded.estimated_change_bp,
      picked_best = excluded.picked_best,
      picked_worst = excluded.picked_worst,
      accuracy = excluded.accuracy,
      created_at = now()
  returning * into v_row;
  return v_row;
end $$;

grant execute on function public.save_prediction(uuid, text, int, text, text) to authenticated;

-- save_reflection attaches reflection responses to a run the caller owns. The
-- responses must be a non-empty jsonb array; each answer is clamped to 280
-- characters (mirroring the trade_reflections / orders text clamp).
create or replace function public.save_reflection(
  p_simulation_id uuid, p_responses jsonb)
returns public.stress_reflections
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := public.current_user_id();
  v_sim public.stress_simulations;
  v_clamped jsonb;
  v_row public.stress_reflections;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_responses is null or jsonb_typeof(p_responses) <> 'array'
     or jsonb_array_length(p_responses) = 0
    then raise exception 'invalid_reflection'; end if;

  -- Ownership check.
  select * into v_sim from stress_simulations
    where id = p_simulation_id and user_id = v_uid;
  if not found then raise exception 'not_found'; end if;

  -- Clamp each answer to 280 chars server-side.
  select jsonb_agg(
           case when jsonb_typeof(elem -> 'answer') = 'string'
                then jsonb_set(elem, '{answer}', to_jsonb(left(elem ->> 'answer', 280)))
                else elem end)
    into v_clamped
    from jsonb_array_elements(p_responses) elem;

  insert into stress_reflections(simulation_id, user_id, responses)
  values (p_simulation_id, v_uid, v_clamped)
  returning * into v_row;
  return v_row;
end $$;

grant execute on function public.save_reflection(uuid, jsonb) to authenticated;

-- upsert_challenge_progress records per-scenario design-challenge progress on
-- the composite PK (user_id, scenario_id, challenge_id). It verifies the
-- referenced simulation belongs to the caller (when supplied), increments
-- attempts, and stamps met_at on the flip to 'met'.
create or replace function public.upsert_challenge_progress(
  p_scenario_id text, p_challenge_id text, p_status text,
  p_simulation_id uuid default null)
returns public.stress_challenge_progress
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := public.current_user_id();
  v_row public.stress_challenge_progress;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_status not in ('in_progress','met') then raise exception 'invalid_challenge'; end if;

  -- When a simulation is referenced, it must belong to the caller.
  if p_simulation_id is not null
     and not exists (select 1 from stress_simulations
                     where id = p_simulation_id and user_id = v_uid)
    then raise exception 'not_found'; end if;

  insert into stress_challenge_progress(
      user_id, scenario_id, challenge_id, status, best_simulation_id,
      attempts, met_at, updated_at)
  values (
      v_uid, p_scenario_id, p_challenge_id, p_status, p_simulation_id,
      1, case when p_status = 'met' then now() else null end, now())
  on conflict (user_id, scenario_id, challenge_id) do update set
      status = excluded.status,
      best_simulation_id = coalesce(excluded.best_simulation_id,
                                    stress_challenge_progress.best_simulation_id),
      attempts = stress_challenge_progress.attempts + 1,
      -- Stamp met_at only on the flip into 'met'; keep the existing stamp otherwise.
      met_at = case
                 when excluded.status = 'met' and stress_challenge_progress.status <> 'met'
                   then now()
                 when excluded.status = 'met'
                   then stress_challenge_progress.met_at
                 else null end,
      updated_at = now()
  returning * into v_row;
  return v_row;
end $$;

grant execute on function public.upsert_challenge_progress(text, text, text, uuid) to authenticated;
