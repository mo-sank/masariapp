/**
 * Device-local under-13 block flag (requirement 2.2).
 *
 * When the age gate computes an age under the minimum, the app sets a persistent
 * device flag so the block stays in place across launches without ever starting
 * Auth0 login or storing the user's birth date. The flag is a single boolean
 * stored under one AsyncStorage key; it holds NO personal data (no birth month,
 * year, or exact date), only the fact that this device has been blocked.
 *
 * AsyncStorage is unencrypted key-value storage, which is appropriate here: the
 * flag is not sensitive and only needs to survive app restarts. See
 * https://docs.expo.dev/versions/v57.0.0/sdk/async-storage/.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

/**
 * Storage key for the block flag. Namespaced to avoid collisions and named so a
 * reviewer can see at a glance that it carries no personal data.
 */
export const UNDER13_BLOCKED_KEY = 'under13_blocked';

/** The value written when a device is blocked. */
const BLOCKED_VALUE = 'true';

/** Read the persisted block flag. Resolves false when unset. */
export async function readAgeBlock(): Promise<boolean> {
  const value = await AsyncStorage.getItem(UNDER13_BLOCKED_KEY);
  return value === BLOCKED_VALUE;
}

/** Persist the under-13 block for this device. */
export async function setAgeBlock(): Promise<void> {
  await AsyncStorage.setItem(UNDER13_BLOCKED_KEY, BLOCKED_VALUE);
}

/**
 * Clear the block flag. Not used in the normal flow (the block is intended to
 * stick) but exposed for account deletion / test cleanup.
 */
export async function clearAgeBlock(): Promise<void> {
  await AsyncStorage.removeItem(UNDER13_BLOCKED_KEY);
}

export interface AgeBlockState {
  /** True while the flag is being read from storage on mount. */
  isLoading: boolean;
  /** True when this device has been blocked for being under the minimum age. */
  isBlocked: boolean;
  /** Persist the block and update local state. */
  block: () => Promise<void>;
}

/**
 * React hook over the device block flag. Reads the persisted value once on mount
 * and exposes a `block()` action the age gate calls when a user is under the
 * minimum age. The AuthGate (a later task) reads `isBlocked` to route a blocked
 * device straight to the age-block screen.
 */
export function useAgeBlock(): AgeBlockState {
  const [isLoading, setIsLoading] = useState(true);
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    let active = true;
    readAgeBlock()
      .then((blocked) => {
        if (active) {
          setIsBlocked(blocked);
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

  const block = useCallback(async () => {
    await setAgeBlock();
    setIsBlocked(true);
  }, []);

  return { isLoading, isBlocked, block };
}
