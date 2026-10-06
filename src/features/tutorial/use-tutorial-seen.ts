/**
 * Device-local "first-run tutorial seen" flag (onboarding-revamp).
 *
 * The coachmark tour shows ONCE per device, on first entry into the app. We
 * persist a single boolean under one AsyncStorage key so the "already seen"
 * state survives app restarts without touching the user's profile or any server
 * state. This mirrors the under-13 block flag pattern in
 * src/features/auth/use-age-block.ts.
 *
 * The flag carries NO personal data — only the fact that this device has seen
 * the tour. AsyncStorage is unencrypted key-value storage, which is appropriate
 * for a non-sensitive flag that only needs to persist across launches. See
 * https://docs.expo.dev/versions/v57.0.0/sdk/async-storage/.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

/** Storage key for the tutorial-seen flag. Namespaced; carries no personal data. */
export const TUTORIAL_SEEN_KEY = 'tutorial_seen';

/** The value written once the tour has been seen (completed or skipped). */
const SEEN_VALUE = 'true';

/** Read the persisted flag. Resolves false when unset. */
export async function readTutorialSeen(): Promise<boolean> {
  const value = await AsyncStorage.getItem(TUTORIAL_SEEN_KEY);
  return value === SEEN_VALUE;
}

/** Persist that this device has seen the tour. */
export async function setTutorialSeen(): Promise<void> {
  await AsyncStorage.setItem(TUTORIAL_SEEN_KEY, SEEN_VALUE);
}

/** Clear the flag (exposed for test cleanup / a future "replay tutorial"). */
export async function clearTutorialSeen(): Promise<void> {
  await AsyncStorage.removeItem(TUTORIAL_SEEN_KEY);
}

export interface TutorialSeenState {
  /** True while the flag is being read from storage on mount. */
  isLoading: boolean;
  /** True once this device has seen the tour. */
  hasSeen: boolean;
  /** Persist the seen flag and update local state. */
  markSeen: () => Promise<void>;
}

/**
 * React hook over the tutorial-seen flag. Reads the persisted value once on
 * mount and exposes `markSeen()` to call when the tour ends (completed or
 * skipped). The tabs read `hasSeen`/`isLoading` to decide whether to launch the
 * tour on first entry.
 */
export function useTutorialSeen(): TutorialSeenState {
  const [isLoading, setIsLoading] = useState(true);
  const [hasSeen, setHasSeen] = useState(false);

  useEffect(() => {
    let active = true;
    readTutorialSeen()
      .then((seen) => {
        if (active) {
          setHasSeen(seen);
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const markSeen = useCallback(async () => {
    await setTutorialSeen();
    setHasSeen(true);
  }, []);

  return { isLoading, hasSeen, markSeen };
}
