/**
 * Submit-reflection mutation (requirements 9.2, 9.3).
 *
 * The write side of the post-trade reflection. `useSubmitReflection` wraps the
 * `submit_reflection` RPC
 * (supabase/migrations/20250105000007_supporting_rpcs.sql), which runs
 * SECURITY DEFINER, derives the user from the verified session, enforces the
 * `post_trade_reflection` feature unlock, checks the order belongs to the
 * caller, and inserts exactly one reflection per order. The client never passes
 * a user id, matching the no-user-id RPC convention used by
 * src/features/watchlist/use-watchlist-mutations.ts and
 * src/features/trading/use-place-order.ts.
 *
 * Privacy (requirement 9.3): the reflection row is only ever read back through
 * the RLS-scoped `trade_reflections` of its owner (see use-reflections.ts).
 * This hook sends it through the SECURITY DEFINER RPC and never surfaces it on
 * any shared screen.
 *
 * On success the mutation invalidates the orders query key so the trade-history
 * list re-reads and shows the new reflection (requirement 10.1) — the
 * invalidate-on-success pattern of use-watchlist-mutations.ts /
 * use-place-order.ts.
 *
 * The RPC raises Postgres exceptions whose message is a stable error code
 * (`feature_locked`, `order_not_found`, `reflection_exists`,
 * `invalid_reflection`, `not_authenticated`). PostgREST surfaces that string as
 * the error's `message`, which {@link mapReflectionError} turns into friendly
 * copy. The pure `submitReflection` caller and `mapReflectionError` are
 * exported so both can be unit tested without React or the real client.
 */
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';
import { trackReflectionSubmitted } from './analytics';
import { ORDERS_QUERY_KEY } from './use-orders';
import { REFLECTIONS_QUERY_KEY } from './use-reflections';
import type { ReflectionExpectation } from './reflection-logic';
import type { Database } from '../../types/db';

type ReflectionRow = Database['public']['Tables']['trade_reflections']['Row'];

/** The arguments the reflection sheet collects for one reflection. */
export interface SubmitReflectionInput {
  /** The order being reflected on (must belong to the caller). */
  orderId: string;
  /** How it went: 'better' | 'as_expected' | 'worse'. */
  expectation: ReflectionExpectation;
  /** Optional free-text note (<= 280 chars), or null. */
  note?: string | null;
}

/**
 * Stable error codes the `submit_reflection` RPC can raise (as the error
 * message). `invalid_reflection` / `not_authenticated` are defensive — the
 * sheet's own validation should prevent them — but we map them too so the UI
 * never shows a raw code.
 */
export type ReflectionErrorCode =
  | 'feature_locked'
  | 'order_not_found'
  | 'reflection_exists'
  | 'invalid_reflection'
  | 'not_authenticated';

/** Friendly, teen-appropriate copy for each known reflection error code. */
const REFLECTION_ERROR_MESSAGES: Record<ReflectionErrorCode, string> = {
  feature_locked: 'Finish the lesson that unlocks reflections to add one.',
  order_not_found: "We couldn't find that trade. Please try again.",
  reflection_exists: "You've already reflected on this trade.",
  invalid_reflection: "That reflection doesn't look right. Please try again.",
  not_authenticated: 'Sign in to add a reflection.',
};

/** Fallback copy when the error is unrecognised (e.g. network/unknown). */
const REFLECTION_FALLBACK_MESSAGE = "We couldn't save your reflection. Please try again.";

/**
 * Map a thrown reflection error to friendly UI copy.
 *
 * The RPC raises Postgres exceptions whose message is the stable error code,
 * which PostgREST passes through as the error's `message`. We read that message
 * and look it up; anything unrecognised gets the generic fallback so the UI
 * never shows a raw error string.
 */
export function mapReflectionError(error: unknown): string {
  const code = reflectionErrorCode(error);
  if (code && isReflectionErrorCode(code)) {
    return REFLECTION_ERROR_MESSAGES[code];
  }
  return REFLECTION_FALLBACK_MESSAGE;
}

/** Narrow an arbitrary string to a known {@link ReflectionErrorCode}. */
function isReflectionErrorCode(code: string): code is ReflectionErrorCode {
  return Object.prototype.hasOwnProperty.call(REFLECTION_ERROR_MESSAGES, code);
}

/** Read the error code (the message) off an unknown thrown value, if present. */
function reflectionErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message.trim();
    }
  }
  return null;
}

/**
 * Call `submit_reflection` for one order. Returns the inserted reflection row.
 * Throws the raw Supabase error on failure so the caller can map it with
 * {@link mapReflectionError}.
 */
export async function submitReflection(input: SubmitReflectionInput): Promise<ReflectionRow> {
  const { data, error } = await supabase.rpc('submit_reflection', {
    p_order_id: input.orderId,
    p_expectation: input.expectation,
    p_note: input.note ?? null,
  });
  if (error) {
    throw error;
  }
  return data as ReflectionRow;
}

/**
 * Invalidate the queries a new reflection changes: the order history and the
 * caller's reflections, so the trade-history list re-reads and shows it
 * (requirement 10.1).
 */
export function invalidateAfterReflection(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: ORDERS_QUERY_KEY });
  void client.invalidateQueries({ queryKey: REFLECTIONS_QUERY_KEY });
}

/**
 * Mutation that submits a post-trade reflection. `mutate(input)` /
 * `mutateAsync(input)`; on success the orders and reflections queries are
 * invalidated. On failure the mutation rejects with the raw error — map it for
 * the UI with {@link mapReflectionError}.
 */
export function useSubmitReflection() {
  const client = useQueryClient();
  return useMutation<ReflectionRow, Error, SubmitReflectionInput>({
    mutationFn: (input) => submitReflection(input),
    onSuccess: (_row, input) => {
      invalidateAfterReflection(client);
      // Log the saved reflection (requirement 9.2). Only the expectation enum is
      // included — never the free-text note.
      trackReflectionSubmitted(input.expectation);
    },
  });
}
