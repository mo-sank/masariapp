jest.mock('../../../lib/supabase', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
}));

// eslint-disable-next-line import/first
import { QueryClient } from '@tanstack/react-query';
// eslint-disable-next-line import/first
import { supabase } from '../../../lib/supabase';
// eslint-disable-next-line import/first
import {
  invalidateAfterReflection,
  mapReflectionError,
  reflectionQueryKey,
  saveReflection,
} from './use-save-reflection';

const rpcMock = supabase.rpc as jest.Mock;

function validRow() {
  return {
    id: 'ref-1',
    simulation_id: 'sim-123',
    user_id: 'auth0|abc',
    responses: [{ question: 'surprise', answer: 'Financials fell the most.' }],
    created_at: '2025-01-08T00:00:00.000Z',
  };
}

beforeEach(() => {
  rpcMock.mockReset();
});

describe('mapReflectionError', () => {
  it('maps not_authenticated to a sign-in message', () => {
    expect(mapReflectionError(new Error('not_authenticated'))).toMatch(/sign in/i);
  });
  it('maps invalid_reflection to a write-an-answer message', () => {
    expect(mapReflectionError(new Error('invalid_reflection'))).toMatch(/answer/i);
  });
  it('maps not_found to a run-again message', () => {
    expect(mapReflectionError(new Error('not_found'))).toMatch(/stress test/i);
  });
  it('falls back for an unknown error', () => {
    expect(mapReflectionError(undefined)).toMatch(/try again/i);
  });
});

describe('saveReflection', () => {
  it('calls save_reflection with the responses array and no user id', async () => {
    rpcMock.mockResolvedValue({ data: validRow(), error: null });
    const responses = [{ question: 'surprise', answer: 'Financials fell the most.' }];

    const row = await saveReflection({ simulationId: 'sim-123', responses });

    expect(rpcMock).toHaveBeenCalledWith('save_reflection', {
      p_simulation_id: 'sim-123',
      p_responses: responses,
    });
    expect(row.simulation_id).toBe('sim-123');
    expect(row.responses).toHaveLength(1);
  });

  it('throws the raw error so the caller can map it', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('invalid_reflection') });
    await expect(
      saveReflection({ simulationId: 'x', responses: [] }),
    ).rejects.toThrow('invalid_reflection');
  });

  it('rejects a malformed payload at the trust boundary', async () => {
    rpcMock.mockResolvedValue({ data: { ...validRow(), responses: 'oops' }, error: null });
    await expect(
      saveReflection({ simulationId: 'x', responses: [{ question: 'q', answer: 'a' }] }),
    ).rejects.toBeDefined();
  });
});

describe('invalidateAfterReflection', () => {
  it('invalidates the reflection query key for the simulation', () => {
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries').mockReturnValue(Promise.resolve());
    invalidateAfterReflection(client, 'sim-123');
    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(reflectionQueryKey('sim-123'));
    client.clear();
  });
});
