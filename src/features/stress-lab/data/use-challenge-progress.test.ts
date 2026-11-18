jest.mock('../../../lib/supabase', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
}));

// eslint-disable-next-line import/first
import { QueryClient } from '@tanstack/react-query';
// eslint-disable-next-line import/first
import { supabase } from '../../../lib/supabase';
// eslint-disable-next-line import/first
import {
  CHALLENGE_PROGRESS_QUERY_KEY,
  invalidateAfterChallenge,
  mapChallengeError,
  upsertChallengeProgress,
} from './use-challenge-progress';

const rpcMock = supabase.rpc as jest.Mock;

function validRow() {
  return {
    user_id: 'auth0|abc',
    scenario_id: 'recession',
    challenge_id: 'survive_recession',
    status: 'met',
    best_simulation_id: 'sim-123',
    attempts: 2,
    met_at: '2025-01-08T00:00:00.000Z',
    updated_at: '2025-01-08T00:00:00.000Z',
  };
}

beforeEach(() => {
  rpcMock.mockReset();
});

describe('mapChallengeError', () => {
  it('maps not_authenticated to a sign-in message', () => {
    expect(mapChallengeError(new Error('not_authenticated'))).toMatch(/sign in/i);
  });
  it('maps not_found to a run-again message', () => {
    expect(mapChallengeError(new Error('not_found'))).toMatch(/stress test/i);
  });
  it('maps invalid_challenge to a try-again message', () => {
    expect(mapChallengeError(new Error('invalid_challenge'))).toMatch(/try again/i);
  });
  it('falls back for an unknown error', () => {
    expect(mapChallengeError(new Error('boom'))).toMatch(/try again/i);
  });
});

describe('upsertChallengeProgress', () => {
  it('calls upsert_challenge_progress with the mapped args and no user id', async () => {
    rpcMock.mockResolvedValue({ data: validRow(), error: null });

    const row = await upsertChallengeProgress({
      scenarioId: 'recession',
      challengeId: 'survive_recession',
      status: 'met',
      simulationId: 'sim-123',
    });

    expect(rpcMock).toHaveBeenCalledWith('upsert_challenge_progress', {
      p_scenario_id: 'recession',
      p_challenge_id: 'survive_recession',
      p_status: 'met',
      p_simulation_id: 'sim-123',
    });
    expect(row.status).toBe('met');
  });

  it('defaults simulation id to null', async () => {
    rpcMock.mockResolvedValue({ data: { ...validRow(), best_simulation_id: null }, error: null });
    await upsertChallengeProgress({
      scenarioId: 'recession',
      challengeId: 'survive_recession',
      status: 'in_progress',
    });
    expect(rpcMock).toHaveBeenCalledWith('upsert_challenge_progress', {
      p_scenario_id: 'recession',
      p_challenge_id: 'survive_recession',
      p_status: 'in_progress',
      p_simulation_id: null,
    });
  });

  it('throws the raw error so the caller can map it', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('not_found') });
    await expect(
      upsertChallengeProgress({ scenarioId: 'x', challengeId: 'y', status: 'met' }),
    ).rejects.toThrow('not_found');
  });

  it('rejects a malformed payload at the trust boundary', async () => {
    rpcMock.mockResolvedValue({ data: { ...validRow(), attempts: 'two' }, error: null });
    await expect(
      upsertChallengeProgress({ scenarioId: 'x', challengeId: 'y', status: 'met' }),
    ).rejects.toBeDefined();
  });
});

describe('invalidateAfterChallenge', () => {
  it('invalidates the challenge-progress list', () => {
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries').mockReturnValue(Promise.resolve());
    invalidateAfterChallenge(client);
    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(CHALLENGE_PROGRESS_QUERY_KEY);
    client.clear();
  });
});
