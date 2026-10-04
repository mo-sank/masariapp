import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearAgeBlock, readAgeBlock, setAgeBlock, UNDER13_BLOCKED_KEY } from './use-age-block';

// Mock AsyncStorage with a simple in-memory store so the pure read/write
// functions can be tested without a native module.
jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
      return Promise.resolve();
    }),
    __reset: () => {
      store = {};
    },
  };
});

const mockStorage = AsyncStorage as unknown as {
  getItem: jest.Mock;
  setItem: jest.Mock;
  removeItem: jest.Mock;
  __reset: () => void;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockStorage.__reset();
});

describe('age block flag', () => {
  it('reads false when nothing is stored', async () => {
    await expect(readAgeBlock()).resolves.toBe(false);
    expect(mockStorage.getItem).toHaveBeenCalledWith(UNDER13_BLOCKED_KEY);
  });

  it('persists the block under the namespaced key', async () => {
    await setAgeBlock();
    expect(mockStorage.setItem).toHaveBeenCalledWith(UNDER13_BLOCKED_KEY, 'true');
    await expect(readAgeBlock()).resolves.toBe(true);
  });

  it('clears the block flag', async () => {
    await setAgeBlock();
    await clearAgeBlock();
    expect(mockStorage.removeItem).toHaveBeenCalledWith(UNDER13_BLOCKED_KEY);
    await expect(readAgeBlock()).resolves.toBe(false);
  });

  it('treats any non-"true" value as not blocked', async () => {
    mockStorage.getItem.mockResolvedValueOnce('false');
    await expect(readAgeBlock()).resolves.toBe(false);
  });

  it('stores no personal data - only a boolean flag string', async () => {
    await setAgeBlock();
    // Every value written must be the literal flag, never a birth month/year.
    for (const call of mockStorage.setItem.mock.calls) {
      expect(call[1]).toBe('true');
    }
  });
});
