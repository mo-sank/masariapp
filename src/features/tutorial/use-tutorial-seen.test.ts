import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearTutorialSeen,
  readTutorialSeen,
  setTutorialSeen,
  TUTORIAL_SEEN_KEY,
} from './use-tutorial-seen';

// In-memory AsyncStorage stub so the pure read/write functions can be tested
// without a native module (mirrors use-age-block.test.ts).
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

describe('tutorial seen flag', () => {
  it('reads false when nothing is stored', async () => {
    await expect(readTutorialSeen()).resolves.toBe(false);
    expect(mockStorage.getItem).toHaveBeenCalledWith(TUTORIAL_SEEN_KEY);
  });

  it('persists the seen flag under the namespaced key', async () => {
    await setTutorialSeen();
    expect(mockStorage.setItem).toHaveBeenCalledWith(TUTORIAL_SEEN_KEY, 'true');
    await expect(readTutorialSeen()).resolves.toBe(true);
  });

  it('clears the seen flag', async () => {
    await setTutorialSeen();
    await clearTutorialSeen();
    expect(mockStorage.removeItem).toHaveBeenCalledWith(TUTORIAL_SEEN_KEY);
    await expect(readTutorialSeen()).resolves.toBe(false);
  });

  it('treats any non-"true" value as not seen', async () => {
    mockStorage.getItem.mockResolvedValueOnce('false');
    await expect(readTutorialSeen()).resolves.toBe(false);
  });

  it('stores no personal data - only a boolean flag string', async () => {
    await setTutorialSeen();
    for (const call of mockStorage.setItem.mock.calls) {
      expect(call[1]).toBe('true');
    }
  });
});
