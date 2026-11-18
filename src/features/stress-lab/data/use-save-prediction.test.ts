// Mock the Supabase singleton so importing the hook does not pull in native
// modules; the client's rpc + from are mocked per-test.
jest.mock('../../../lib/supabase', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
}));

// eslint-disable-next-line import/first -- jest.mock must be hoisted above imports
import { QueryClient } from '@tanstack/react-query';
// eslint-disable-next-line import/first
import { supabase } from '../../../lib/supabase';
// eslint-disable-next-line import/first
import {
  invalidateAfterPrediction,
  mapPredictionError,
  parsePredictionEstimateBp,
  predictionQueryKey,
  savePrediction,
} from './use-save-prediction';

const rpcMock = supabase.rpc as jest.Mock;

/** A well-formed save_prediction row for the success path. */
function validRow() {
  return {
    id: 'pred-1',
    simulation_id: 'sim-123',
    user_id: 'auth0|abc',
    direction: 'lose',
    estimated_change_bp: -2000,
    picked_best: 'KO',
    picked_worst: 'JPM',
    accuracy: {
      direction_correct: true,
      actual_direction: 'lose',
      actual_change_bp: -3583,
      estimate_error_bp: 1583,
      best_correct: true,
      worst_correct: true,
      actual_best: 'KO',
      actual_worst: 'JPM',
    },
    created_at: '2025-01-08T00:00:00.000Z',
  };
}

beforeEach(() => {
  rpcMock.mockReset();
});

describe('mapPredictionError', () => {
  it('maps not_authenticated to a sign-in message', () => {
    expect(mapPredictionError(new Error('not_authenticated'))).toMatch(/sign in/i);
  });
  it('maps not_found to a run-again message', () => {
    expect(mapPredictionError(new Error('not_found'))).toMatch(/stress test/i);
  });
  it('maps invalid_prediction to a check-your-estimate message', () => {
    expect(mapPredictionError(new Error('invalid_prediction'))).toMatch(/estimate/i);
  });
  it('falls back for an unknown error', () => {
    expect(mapPredictionError(new Error('boom'))).toMatch(/try again/i);
    expect(mapPredictionError(null)).toMatch(/try again/i);
  });
});

describe('savePrediction', () => {
  it('calls save_prediction with the mapped args and no user id', async () => {
    rpcMock.mockResolvedValue({ data: validRow(), error: null });

    const row = await savePrediction({
      simulationId: 'sim-123',
      direction: 'lose',
      estimatedChangeBp: -2000,
      pickedBest: 'KO',
      pickedWorst: 'JPM',
    });

    expect(rpcMock).toHaveBeenCalledWith('save_prediction', {
      p_simulation_id: 'sim-123',
      p_direction: 'lose',
      p_estimated_change_bp: -2000,
      p_best: 'KO',
      p_worst: 'JPM',
    });
    expect(row.accuracy?.direction_correct).toBe(true);
  });

  it('defaults optional fields to null', async () => {
    rpcMock.mockResolvedValue({ data: validRow(), error: null });
    await savePrediction({ simulationId: 'sim-123', direction: 'gain' });
    expect(rpcMock).toHaveBeenCalledWith('save_prediction', {
      p_simulation_id: 'sim-123',
      p_direction: 'gain',
      p_estimated_change_bp: null,
      p_best: null,
      p_worst: null,
    });
  });

  it('throws the raw error so the caller can map it', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('not_found') });
    await expect(savePrediction({ simulationId: 'x', direction: 'gain' })).rejects.toThrow('not_found');
  });

  it('rejects a malformed payload at the trust boundary', async () => {
    rpcMock.mockResolvedValue({ data: { ...validRow(), direction: 123 }, error: null });
    await expect(savePrediction({ simulationId: 'x', direction: 'gain' })).rejects.toBeDefined();
  });
});

describe('parsePredictionEstimateBp', () => {
  it('parses a whole-percent estimate into basis points', () => {
    expect(parsePredictionEstimateBp('-20')).toBe(-2000);
    expect(parsePredictionEstimateBp('15%')).toBe(1500);
  });
  it('returns null for empty or unparseable input', () => {
    expect(parsePredictionEstimateBp('')).toBeNull();
    expect(parsePredictionEstimateBp('abc')).toBeNull();
  });
  it('clamps to the server-accepted range', () => {
    expect(parsePredictionEstimateBp('250')).toBe(10000);
    expect(parsePredictionEstimateBp('-250')).toBe(-10000);
  });
});

describe('invalidateAfterPrediction', () => {
  it('invalidates the prediction query key for the simulation', () => {
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries').mockReturnValue(Promise.resolve());
    invalidateAfterPrediction(client, 'sim-123');
    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(predictionQueryKey('sim-123'));
    client.clear();
  });
});
