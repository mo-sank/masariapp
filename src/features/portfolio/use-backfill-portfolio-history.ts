/**
 * Backfill-portfolio-history mutation (design §5).
 *
 * The one-shot write that reconstructs the caller's historical daily equity so
 * the longer chart ranges are not empty. `useBackfillPortfolioHistory` wraps the
 * `backfill_portfolio_snapshots` RPC
 * (supabase/migrations/20250109000001_backfill_portfolio_snapshots_rpc.sql),
 * which runs SECURITY DEFINER, derives the caller from the verified session,
 * rebuilds one `portfolio_snapshots` row per ET calendar day from the orders +
 * quote_bars ledger, and upserts them. The client sends NO arguments (the server
 * owns the account and the date bounds), matching the no-user-id RPC convention
 * of `use-place-order.ts`.
 *
 * On success the mutation invalidates the `['portfolio-history']` prefix (every
 * range's history query refetches) and `PORTFOLIO_QUERY_KEY` (the summary), the
 * invalidate-on-success pattern of `use-place-order.ts`.
 *
 * The RPC returns an int row count, validated with `backfillResultSchema` at the
 * trust boundary (the zod-at-the-boundary pattern of `use-run-simulation.ts`),
 * and raises Postgres exceptions whose message is a stable error code which
 * {@link mapBackfillError} turns into friendly copy. The pure
 * `backfillPortfolioHistory` caller and `mapBackfillError` are exported so both
 * can be unit tested without React or the real client.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { supabase } from '../../lib/supabase';
import { PORTFOLIO_QUERY_KEY } from './use-portfolio';

/**
 * Stable error codes the `backfill_portfolio_snapshots` RPC can raise (as the
 * error message). The card mounts inside the portfolio Gate, so
 * `not_authenticated` is not expected there; `no_account` still can occur (a
 * gated-but-account-less edge). Both are mapped so the UI never shows a raw code.
 */
export type BackfillErrorCode = 'not_authenticated' | 'no_account';

/** Friendly, teen-appropriate copy for each known backfill error code. */
const BACKFILL_ERROR_MESSAGES: Record<BackfillErrorCode, string> = {
  not_authenticated: 'Sign in to build your portfolio history.',
  no_account: "We couldn't find your paper account. Please try again.",
};

/** Fallback copy when the error is unrecognised (e.g. network/unknown). */
const BACKFILL_FALLBACK_MESSAGE =
  "We couldn't build your portfolio history. Please try again.";

/**
 * Map a thrown backfill error to friendly UI copy.
 *
 * The RPC raises Postgres exceptions whose message is the stable error code,
 * which PostgREST passes through as the error's `message`. We read that message
 * and look it up; anything unrecognised (network error, unexpected failure, or
 * a zod parse failure) gets the generic fallback so the UI never shows a raw
 * error string.
 */
export function mapBackfillError(error: unknown): string {
  const code = backfillErrorCode(error);
  if (code && isBackfillErrorCode(code)) {
    return BACKFILL_ERROR_MESSAGES[code];
  }
  return BACKFILL_FALLBACK_MESSAGE;
}

/** Narrow an arbitrary string to a known {@link BackfillErrorCode}. */
function isBackfillErrorCode(code: string): code is BackfillErrorCode {
  return Object.prototype.hasOwnProperty.call(BACKFILL_ERROR_MESSAGES, code);
}

/** Read the error code (the message) off an unknown thrown value, if present. */
function backfillErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message.trim();
    }
  }
  return null;
}

/** zod: the RPC returns a non-negative int row count (rows upserted). */
const backfillResultSchema = z.number().int().nonnegative();

export { backfillResultSchema };

/**
 * Call `backfill_portfolio_snapshots` with no arguments. Returns the count of
 * rows upserted, validated at the trust boundary. Throws the raw Supabase error
 * (or a zod error for a malformed payload) so the caller can map it with
 * {@link mapBackfillError}.
 */
export async function backfillPortfolioHistory(): Promise<number> {
  const { data, error } = await supabase.rpc('backfill_portfolio_snapshots');
  if (error) {
    throw error;
  }
  return backfillResultSchema.parse(data);
}

/**
 * Mutation that backfills the caller's portfolio history. `mutate()` /
 * `mutateAsync()` take no input; on success the `['portfolio-history']` prefix
 * and the portfolio summary are invalidated so the chart and header re-read. On
 * failure the mutation rejects with the raw error — map it for the UI with
 * {@link mapBackfillError}.
 */
export function useBackfillPortfolioHistory() {
  const client = useQueryClient();
  return useMutation<number, Error, void>({
    mutationFn: () => backfillPortfolioHistory(),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['portfolio-history'] });
      void client.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEY });
    },
  });
}
