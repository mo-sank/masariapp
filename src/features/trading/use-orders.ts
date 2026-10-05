/**
 * Order (trade) history (requirement 10.1).
 *
 * Reads the caller's own `orders` rows, newest first, for the trade-history
 * screen. RLS on `orders` scopes the result to the signed-in user's rows, so no
 * user id is passed from the client — matching the project's RLS-scoped hook
 * pattern (see src/features/auth/use-profile.ts). Every monetary field
 * (`fill_price_cents`, `total_cents`, `realized_pl_cents`) is integer cents and
 * is formatted for display with src/lib/money.ts.
 *
 * The matching `orders_account_created_idx` index backs the `created_at desc`
 * ordering, so this list is cheap even as history grows.
 */
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';
import type { Database } from '../../types/db';

type OrderRow = Database['public']['Tables']['orders']['Row'];

/** React Query key for the caller's order history. */
export const ORDERS_QUERY_KEY = ['orders', 'me'] as const;

/**
 * Fetch the caller's orders, newest first. RLS limits the rows to the signed-in
 * user. Throws on a Supabase error.
 */
export async function fetchMyOrders(): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, account_id, user_id, symbol, side, order_type, qty, status, fill_price_cents, total_cents, realized_pl_cents, price_as_of, price_source, rationale_tags, rationale_text, idempotency_key, created_at',
    )
    .order('created_at', { ascending: false });
  if (error) {
    throw error;
  }
  return data ?? [];
}

/**
 * Query the caller's order history. Pass `enabled = isSignedIn` so the query
 * does not run while signed out.
 */
export function useOrders(enabled = true) {
  return useQuery({
    queryKey: ORDERS_QUERY_KEY,
    queryFn: fetchMyOrders,
    enabled,
  });
}
