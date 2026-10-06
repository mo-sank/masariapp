/**
 * Debounced username availability hook.
 *
 * Drives the live "available / taken / invalid" feedback on the onboarding
 * username field. Given the current input text, it:
 *
 *   1. Runs the pure client-side {@link validateUsername} FIRST. If the name is
 *      malformed or profane the status becomes `invalid` immediately and NO
 *      network request is made (malformed/profane input never hits the server).
 *   2. Otherwise, after a short debounce, calls the injected `check` function
 *      (the `is_username_available` RPC wrapper) and reports `available` or
 *      `taken`. A thrown error resolves to `error` so the UI can let the user
 *      try again on submit (the server is authoritative there anyway).
 *
 * The debounce timer and the checker are injectable so the hook can be unit
 * tested with fake timers and a stub, with no device or network.
 *
 * Empty/blank input is `idle` (no feedback, no request).
 */
import { useEffect, useRef, useState } from 'react';

import { checkUsernameAvailable } from './api/check-username';
import { validateUsername, type UsernameRejectReason } from './username-filter';

/** The debounce applied before an availability request is issued (ms). */
export const AVAILABILITY_DEBOUNCE_MS = 400;

/** The live status of the current username input. */
export type AvailabilityStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'taken' }
  | { kind: 'invalid'; reason: UsernameRejectReason }
  | { kind: 'error' };

/** Options for {@link useUsernameAvailability}; all optional, injected in tests. */
export interface UseUsernameAvailabilityOptions {
  /** Availability checker; defaults to the real RPC wrapper. */
  check?: (username: string) => Promise<boolean>;
  /** Debounce in ms; defaults to {@link AVAILABILITY_DEBOUNCE_MS}. */
  debounceMs?: number;
}

/** The status we can derive synchronously from the input, before any request. */
type SyncStatus =
  | { kind: 'idle' }
  | { kind: 'invalid'; reason: UsernameRejectReason }
  | { kind: 'checking' };

/** Derive the pre-request status from the trimmed input (pure). */
function deriveSyncStatus(value: string): SyncStatus {
  if (value.length === 0) {
    return { kind: 'idle' };
  }
  // Client-side gate: malformed/profane names never reach the network.
  const validation = validateUsername(value);
  if (!validation.ok) {
    return { kind: 'invalid', reason: validation.reason };
  }
  // Format is fine; a server availability check is pending.
  return { kind: 'checking' };
}

/**
 * Watch `username` and return its live availability status. Validates on the
 * client first (instant `invalid`), then debounces a server availability check.
 *
 * The synchronous part of the status (idle / invalid / checking) is derived
 * during render from the input, so the effect only ever sets the ASYNC outcome
 * (available / taken / error). That keeps the effect from calling setState
 * synchronously and avoids cascading renders.
 */
export function useUsernameAvailability(
  username: string,
  options: UseUsernameAvailabilityOptions = {},
): AvailabilityStatus {
  const { check = checkUsernameAvailable, debounceMs = AVAILABILITY_DEBOUNCE_MS } = options;

  const value = username.trim();
  const sync = deriveSyncStatus(value);

  // The resolved async outcome for the CURRENT value, or null while we have not
  // resolved one yet (idle/invalid/checking render straight from `sync`).
  const [asyncStatus, setAsyncStatus] = useState<
    { value: string; status: { kind: 'available' } | { kind: 'taken' } | { kind: 'error' } } | null
  >(null);

  // Track the latest value so a slow earlier response cannot overwrite the
  // status for a newer input (last-write-wins by comparing the trimmed value).
  const latestRef = useRef<string>('');

  useEffect(() => {
    latestRef.current = value;

    // Only names that pass the client gate issue a request.
    if (sync.kind !== 'checking') {
      return;
    }

    const timer = setTimeout(() => {
      check(value)
        .then((available) => {
          if (latestRef.current !== value) {
            return;
          }
          setAsyncStatus({ value, status: available ? { kind: 'available' } : { kind: 'taken' } });
        })
        .catch(() => {
          if (latestRef.current !== value) {
            return;
          }
          setAsyncStatus({ value, status: { kind: 'error' } });
        });
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [value, sync.kind, check, debounceMs]);

  // Prefer the async outcome only when it belongs to the current value AND the
  // input still passes the client gate; otherwise render the synchronous status.
  if (sync.kind === 'checking' && asyncStatus && asyncStatus.value === value) {
    return asyncStatus.status;
  }
  return sync;
}
