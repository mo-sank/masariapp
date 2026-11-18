// Mock the Supabase singleton so importing use-run-simulation does not pull in
// native modules. These tests exercise the pure mapStressError, runSimulation,
// and invalidateAfterRun helpers with the client's rpc mocked per-test.
jest.mock('../../../lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

// eslint-disable-next-line import/first -- jest.mock must be hoisted above imports
import { QueryClient } from '@tanstack/react-query';
// eslint-disable-next-line import/first
import { supabase } from '../../../lib/supabase';
// eslint-disable-next-line import/first
import {
  invalidateAfterRun,
  mapStressError,
  runSimulation,
} from './use-run-simulation';
// eslint-disable-next-line import/first
import { SIMULATION_HISTORY_QUERY_KEY } from './use-simulation-history';
// eslint-disable-next-line import/first
import { simulationQueryKey } from './use-simulation';

const rpcMock = supabase.rpc as jest.Mock;

/** A well-formed record_simulation row for the success path. */
function validRow() {
  return {
    id: 'sim-123',
    user_id: 'auth0|abc',
    scenario_id: 'crisis_2008',
    phase: 'shock',
    starting_value_cents: 300000,
    simulated_value_cents: 192500,
    change_cents: -107500,
    change_basis_points: -3583,
    cash_cents: 50000,
    holdings_snapshot: [
      { symbol: 'AAPL', name: 'Apple', sector: 'Information Technology', qty: 10, current_value_cents: 150000 },
    ],
    assumptions_snapshot: { broad_market: -0.3, sectors: {} },
    asset_results: [
      {
        symbol: 'AAPL',
        name: 'Apple',
        sector: 'Information Technology',
        qty: 10,
        original_value_cents: 150000,
        shock: -0.35,
        used_broad_market: false,
        simulated_change_cents: -52500,
        simulated_change_bp: -3500,
        simulated_value_cents: 97500,
      },
    ],
    created_at: '2025-01-08T00:00:00.000Z',
  };
}

beforeEach(() => {
  rpcMock.mockReset();
});

describe('mapStressError', () => {
  it('maps not_authenticated to a sign-in message', () => {
    expect(mapStressError(new Error('not_authenticated'))).toMatch(/sign in/i);
  });

  it('maps no_account to a make-a-trade-first message', () => {
    expect(mapStressError(new Error('no_account'))).toMatch(/portfolio/i);
  });

  it('maps unknown_scenario to a pick-another message', () => {
    expect(mapStressError(new Error('unknown_scenario'))).toMatch(/scenario/i);
  });

  it('maps scenario_inactive to an unavailable message', () => {
    expect(mapStressError(new Error('scenario_inactive'))).toMatch(/available/i);
  });

  it('maps invalid_phase to a phase message', () => {
    expect(mapStressError(new Error('invalid_phase'))).toMatch(/phase/i);
  });

  it('trims surrounding whitespace on the error code before matching', () => {
    expect(mapStressError(new Error('  no_account  '))).toMatch(/portfolio/i);
  });

  it('reads the code from a plain error-shaped object (PostgREST error)', () => {
    expect(mapStressError({ message: 'scenario_inactive', code: 'P0001' })).toMatch(/available/i);
  });

  it('falls back to generic copy for an unknown error', () => {
    expect(mapStressError(new Error('boom'))).toMatch(/try again/i);
  });

  it('falls back to generic copy for a non-error value', () => {
    expect(mapStressError(null)).toMatch(/try again/i);
    expect(mapStressError(undefined)).toMatch(/try again/i);
    expect(mapStressError('no_account')).toMatch(/try again/i);
  });
});

describe('runSimulation', () => {
  it('calls record_simulation with the scenario id and default shock phase', async () => {
    rpcMock.mockResolvedValue({ data: validRow(), error: null });

    const row = await runSimulation({ scenarioId: 'crisis_2008' });

    expect(rpcMock).toHaveBeenCalledWith('record_simulation', {
      p_scenario_id: 'crisis_2008',
      p_phase: 'shock',
    });
    expect(row.id).toBe('sim-123');
    expect(row.asset_results[0].symbol).toBe('AAPL');
  });

  it('passes the recovery phase through when requested', async () => {
    rpcMock.mockResolvedValue({ data: { ...validRow(), phase: 'recovery' }, error: null });

    await runSimulation({ scenarioId: 'covid_2020', phase: 'recovery' });

    expect(rpcMock).toHaveBeenCalledWith('record_simulation', {
      p_scenario_id: 'covid_2020',
      p_phase: 'recovery',
    });
  });

  it('throws the raw Supabase error so the caller can map it', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('no_account') });

    await expect(runSimulation({ scenarioId: 'crisis_2008' })).rejects.toThrow('no_account');
  });

  it('rejects a malformed payload at the trust boundary', async () => {
    const bad = { ...validRow(), starting_value_cents: 'oops' };
    rpcMock.mockResolvedValue({ data: bad, error: null });

    await expect(runSimulation({ scenarioId: 'crisis_2008' })).rejects.toBeDefined();
  });
});

describe('invalidateAfterRun', () => {
  it('invalidates the history and the single-simulation query keys', () => {
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries').mockReturnValue(Promise.resolve());

    invalidateAfterRun(client, 'sim-123');

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(SIMULATION_HISTORY_QUERY_KEY);
    expect(keys).toContainEqual(simulationQueryKey('sim-123'));
    client.clear();
  });
});
