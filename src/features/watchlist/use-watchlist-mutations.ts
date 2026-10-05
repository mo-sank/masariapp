/**
 * Watchlist add/remove mutations (requirements 6.1, 6.2).
 *
 * The write side of the watchlist. `useWatchlistAdd` / `useWatchlistRemove`
 * wrap the `watchlist_add` / `watchlist_remove` RPCs
 * (supabase/migrations/20250105000007_supporting_rpcs.sql), which run
 * SECURITY DEFINER, derive the user from the verified session, enforce the
 * `watchlist` feature unlock, and (for add) the configured `watchlist_max`
 * limit. The client never passes a user id, matching the RPC convention used by
 * src/features/lessons/api/complete-lesson.ts and src/features/auth.
 *
 * Both mutations invalidate `WATCHLIST_QUERY_KEY` on success so the Watchlist
 * section and any WatchlistButton re-read the caller's list (requirement 6.1),
 * following the invalidate-on-success pattern of
 * src/features/lessons/hooks/use-complete-lesson.ts.
 *
 * The RPC raises Postgres exceptions whose message is a stable error code
 * (`watchlist_full`, `feature_locked`, `symbol_not_available`,
 * `not_authenticated`). PostgREST surfaces that string as the error's
 * `message`, which {@link mapWatchlistError} turns into friendly UI copy — in
 * particular the limit message for `watchlist_full` (requirement 6.2). The pure
 * `addWatchlist`/`removeWatchlist` callers and `mapWatchlistError` are exported
 * so the mapping can be unit tested without React or the real client.
 */
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';
import { trackWatchlistChanged } from '../trading/analytics';
import { WATCHLIST_QUERY_KEY } from './use-watchlist';
import type { Database } from '../../types/db';

type WatchlistItemRow = Database['public']['Tables']['watchlist_items']['Row'];

/** The configured maximum watchlist size (app_config.watchlist_max). */
export const WATCHLIST_MAX = 5;

/** Stable error codes the watchlist RPCs can raise (as the error message). */
export type WatchlistErrorCode =
  | 'watchlist_full'
  | 'feature_locked'
  | 'symbol_not_available'
  | 'not_authenticated';

/** Friendly, teen-appropriate copy for each known watchlist error code. */
const WATCHLIST_ERROR_MESSAGES: Record<WatchlistErrorCode, string> = {
  // Requirement 6.2: a friendly limit message when the list is full.
  watchlist_full: `Your watchlist is full. Remove one to add another (max ${WATCHLIST_MAX}).`,
  feature_locked: 'Finish the lesson that unlocks the watchlist to use it.',
  symbol_not_available: "That company isn't available to follow right now.",
  not_authenticated: 'Sign in to use your watchlist.',
};

/** Fallback copy when the error is unrecognised (e.g. network/unknown). */
const WATCHLIST_FALLBACK_MESSAGE = "We couldn't update your watchlist. Please try again.";

/**
 * Map a thrown watchlist error to friendly UI copy (requirement 6.2).
 *
 * The RPC raises Postgres exceptions whose message is the stable error code,
 * which PostgREST passes through as the error's `message`. We read that message
 * and look it up; anything unrecognised (network error, unexpected failure)
 * gets the generic fallback so the UI never shows a raw error string.
 */
export function mapWatchlistError(error: unknown): string {
  const code = watchlistErrorCode(error);
  if (code && isWatchlistErrorCode(code)) {
    return WATCHLIST_ERROR_MESSAGES[code];
  }
  return WATCHLIST_FALLBACK_MESSAGE;
}

/** Narrow an arbitrary string to a known {@link WatchlistErrorCode}. */
function isWatchlistErrorCode(code: string): code is WatchlistErrorCode {
  return Object.prototype.hasOwnProperty.call(WATCHLIST_ERROR_MESSAGES, code);
}

/** Read the error code (the message) off an unknown thrown value, if present. */
function watchlistErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message.trim();
    }
  }
  return null;
}

/**
 * Call `watchlist_add` for `symbol`. Returns the added (or already-present)
 * row. Throws the raw Supabase error on failure so the caller can map it with
 * {@link mapWatchlistError}.
 */
export async function addWatchlist(symbol: string): Promise<WatchlistItemRow> {
  const { data, error } = await supabase.rpc('watchlist_add', { p_symbol: symbol });
  if (error) {
    throw error;
  }
  return data as WatchlistItemRow;
}

/**
 * Call `watchlist_remove` for `symbol`. Idempotent server-side (removing an
 * absent symbol is a no-op). Throws the raw Supabase error on failure.
 */
export async function removeWatchlist(symbol: string): Promise<void> {
  const { error } = await supabase.rpc('watchlist_remove', { p_symbol: symbol });
  if (error) {
    throw error;
  }
}

/** Invalidate the watchlist query so readers refetch (requirement 6.1). */
export function invalidateWatchlist(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: WATCHLIST_QUERY_KEY });
}

/**
 * Mutation that adds a symbol to the caller's watchlist. `mutate(symbol)` /
 * `mutateAsync(symbol)`; on success the watchlist query is invalidated. On
 * failure the mutation rejects with the raw error — map it for the UI with
 * {@link mapWatchlistError} (e.g. the `watchlist_full` limit message, 6.2).
 */
export function useWatchlistAdd() {
  const client = useQueryClient();
  return useMutation<WatchlistItemRow, Error, string>({
    mutationFn: (symbol) => addWatchlist(symbol),
    onSuccess: (_row, symbol) => {
      invalidateWatchlist(client);
      // Log the change (requirement 9.2): action + symbol identifier only.
      trackWatchlistChanged('add', symbol);
    },
  });
}

/**
 * Mutation that removes a symbol from the caller's watchlist. `mutate(symbol)`;
 * on success the watchlist query is invalidated so the row disappears.
 */
export function useWatchlistRemove() {
  const client = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (symbol) => removeWatchlist(symbol),
    onSuccess: (_result, symbol) => {
      invalidateWatchlist(client);
      // Log the change (requirement 9.2): action + symbol identifier only.
      trackWatchlistChanged('remove', symbol);
    },
  });
}
