/**
 * Place-market-order mutation (requirements 8.1, 8.4, 8.5, 8.7).
 *
 * The write side of the order ticket. `usePlaceOrder` wraps the
 * `place_market_order` RPC
 * (supabase/migrations/20250105000006_place_market_order_rpc.sql), which runs
 * SECURITY DEFINER, derives the user from the verified session, enforces the
 * per-side feature unlock, eligibility, cash/share limits, and the starter
 * position cap, and writes cash + positions + the orders row in one
 * transaction. The client NEVER sends a price (requirement 8.1): the server
 * reads the authoritative quote and records the fill. We pass only
 * `{ p_symbol, p_side, p_qty, p_idempotency_key, p_rationale_tags,
 * p_rationale_text }`, matching the no-user-id RPC convention used by
 * src/features/watchlist/use-watchlist-mutations.ts.
 *
 * Idempotency (requirement 8.5): the ticket generates one UUID per ticket
 * session (see {@link newIdempotencyKey}) and REUSES it on retry, so a retry
 * after a network timeout returns the original order rather than placing a
 * second one. The key lives in the ticket component for the life of a ticket.
 *
 * On success the mutation invalidates the portfolio, orders, and (when present)
 * watchlist query keys so the Portfolio tab, trade history, and any watchlist
 * UI re-read after balances change — the invalidate-on-success pattern of
 * use-watchlist-mutations.ts and use-complete-lesson.ts.
 *
 * The RPC raises Postgres exceptions whose message is a stable error code.
 * PostgREST surfaces that string as the error's `message`, which
 * {@link mapPlaceOrderError} turns into friendly, teen-appropriate copy
 * (requirement 8.7). The pure `placeOrder` caller and `mapPlaceOrderError` are
 * exported so both can be unit tested without React or the real client.
 */
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';

import { supabase } from '../../lib/supabase';
import { PORTFOLIO_QUERY_KEY } from '../portfolio/use-portfolio';
import { WATCHLIST_QUERY_KEY } from '../watchlist/use-watchlist';
import { trackTradePlaced } from './analytics';
import { ORDERS_QUERY_KEY } from './use-orders';
import type { Database } from '../../types/db';

type OrderRow = Database['public']['Tables']['orders']['Row'];

/** Buy or sell. */
export type OrderSide = 'buy' | 'sell';

/** The arguments the ticket collects for one order. */
export interface PlaceOrderInput {
  /** Instrument symbol, e.g. "AAPL". */
  symbol: string;
  /** Buy or sell. */
  side: OrderSide;
  /** Whole number of shares (>= 1). */
  qty: number;
  /** Client-generated UUID, reused on retry so the order is idempotent (8.5). */
  idempotencyKey: string;
  /** Rationale chip ids (requirement 9.1); empty when rationale is not required. */
  rationaleTags?: string[];
  /** Optional free-text note (<= 280 chars), or null. */
  rationaleText?: string | null;
}

/**
 * Stable error codes the `place_market_order` RPC can raise (as the error
 * message). Mirrors the codes documented in the RPC migration (requirement
 * 8.7). `invalid_order` / `not_authenticated` / `no_account` are defensive —
 * the ticket's own validation should prevent them — but we map them too so the
 * UI never shows a raw code.
 */
export type PlaceOrderErrorCode =
  | 'feature_locked'
  | 'insufficient_cash'
  | 'insufficient_shares'
  | 'position_cap_exceeded'
  | 'quote_stale'
  | 'no_quote'
  | 'symbol_not_available'
  | 'invalid_order'
  | 'not_authenticated'
  | 'no_account';

/** Friendly, teen-appropriate copy for each known order error code (8.7). */
const PLACE_ORDER_ERROR_MESSAGES: Record<PlaceOrderErrorCode, string> = {
  feature_locked: 'Finish the lesson that unlocks trading to place this order.',
  insufficient_cash: "You don't have enough paper cash for this order.",
  insufficient_shares: "You don't have enough shares to sell that many.",
  position_cap_exceeded:
    'That would put too much in one company for now. Try fewer shares.',
  quote_stale: 'Prices are catching up. Try again in a moment.',
  no_quote: "We don't have a price for this company yet. Try again later.",
  symbol_not_available: "That company isn't available to trade right now.",
  invalid_order: "That order doesn't look right. Check the amount and try again.",
  not_authenticated: 'Sign in to place an order.',
  no_account: "We couldn't find your paper account. Please try again.",
};

/** Fallback copy when the error is unrecognised (e.g. network/unknown). */
const PLACE_ORDER_FALLBACK_MESSAGE = "We couldn't place your order. Please try again.";

/**
 * Generate a fresh idempotency key for a ticket session. Uses expo-crypto's
 * `randomUUID` (RFC 4122 v4), the Expo-recommended cryptographically-secure
 * UUID source for React Native (there is no global `crypto.randomUUID` on the
 * RN runtime). The ticket calls this once and reuses the result on every retry
 * so a timed-out order never double-fills (requirement 8.5).
 */
export function newIdempotencyKey(): string {
  return Crypto.randomUUID();
}

/**
 * Map a thrown order error to friendly UI copy (requirement 8.7).
 *
 * The RPC raises Postgres exceptions whose message is the stable error code,
 * which PostgREST passes through as the error's `message`. We read that message
 * and look it up; anything unrecognised (network error, unexpected failure)
 * gets the generic fallback so the UI never shows a raw error string.
 */
export function mapPlaceOrderError(error: unknown): string {
  const code = placeOrderErrorCode(error);
  if (code && isPlaceOrderErrorCode(code)) {
    return PLACE_ORDER_ERROR_MESSAGES[code];
  }
  return PLACE_ORDER_FALLBACK_MESSAGE;
}

/** Narrow an arbitrary string to a known {@link PlaceOrderErrorCode}. */
function isPlaceOrderErrorCode(code: string): code is PlaceOrderErrorCode {
  return Object.prototype.hasOwnProperty.call(PLACE_ORDER_ERROR_MESSAGES, code);
}

/** Read the error code (the message) off an unknown thrown value, if present. */
function placeOrderErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message.trim();
    }
  }
  return null;
}

/**
 * Call `place_market_order` for one order. Returns the filled (or, on an
 * idempotent replay, the original) order row. Throws the raw Supabase error on
 * failure so the caller can map it with {@link mapPlaceOrderError}.
 *
 * Note the absence of any price argument — the server is authoritative on the
 * fill price (requirement 8.1).
 */
export async function placeOrder(input: PlaceOrderInput): Promise<OrderRow> {
  const { data, error } = await supabase.rpc('place_market_order', {
    p_symbol: input.symbol,
    p_side: input.side,
    p_qty: input.qty,
    p_idempotency_key: input.idempotencyKey,
    p_rationale_tags: input.rationaleTags ?? [],
    p_rationale_text: input.rationaleText ?? null,
  });
  if (error) {
    throw error;
  }
  return data as OrderRow;
}

/**
 * Invalidate every query a filled order changes: the portfolio (cash +
 * positions), the order history, and the watchlist (harmless if unused). The
 * ticket is the single writer, so invalidating here keeps every reader fresh
 * (requirement 8.4).
 */
export function invalidateAfterOrder(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEY });
  void client.invalidateQueries({ queryKey: ORDERS_QUERY_KEY });
  void client.invalidateQueries({ queryKey: WATCHLIST_QUERY_KEY });
}

/**
 * Mutation that places a market order. `mutate(input)` / `mutateAsync(input)`;
 * on success the portfolio, orders, and watchlist queries are invalidated and
 * the resolved value is the filled order row (used to render the confirmation,
 * requirement 8.4). On failure the mutation rejects with the raw error — map it
 * for the UI with {@link mapPlaceOrderError} (requirement 8.7).
 */
export function usePlaceOrder() {
  const client = useQueryClient();
  return useMutation<OrderRow, Error, PlaceOrderInput>({
    mutationFn: (input) => placeOrder(input),
    onSuccess: (_order, input) => {
      invalidateAfterOrder(client);
      // Log a filled order once per success (requirement 8.4). Only non-free-text
      // props: side, symbol, qty, and whether a rationale was attached — never
      // the rationale text (requirement 9.2).
      trackTradePlaced({
        side: input.side,
        symbol: input.symbol,
        qty: input.qty,
        hasRationale: (input.rationaleTags?.length ?? 0) > 0,
      });
    },
  });
}
