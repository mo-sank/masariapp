// Mock the Supabase singleton so the wrapper can be tested without a client or
// native modules. The module under test calls `.rpc('is_username_available', ...)`.
const mockRpc = jest.fn();
jest.mock('../../../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

// eslint-disable-next-line import/first -- jest.mock must be hoisted above this import
import { checkUsernameAvailable } from './check-username';

beforeEach(() => {
  mockRpc.mockReset();
});

describe('checkUsernameAvailable', () => {
  it('passes the p_-prefixed username and returns true when available', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    await expect(checkUsernameAvailable('clever_otter')).resolves.toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('is_username_available', { p_username: 'clever_otter' });
  });

  it('returns false when the RPC reports the name is taken/not allowed', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    await expect(checkUsernameAvailable('takenname')).resolves.toBe(false);
  });

  it('treats a non-true data value as not available', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await expect(checkUsernameAvailable('whatever')).resolves.toBe(false);
  });

  it('throws when the RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('boom') });
    await expect(checkUsernameAvailable('name')).rejects.toThrow('boom');
  });
});
