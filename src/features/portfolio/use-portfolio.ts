/**
 * Paper account + positions, valued with current quotes (requirement 7.1, 7.2).
 *
 * The Portfolio tab shows cash, positions value, total equity, and total
 * gain/loss versus starting cash, plus a row per position (symbol, shares,
 * average cost, current price, value, unrealized gain/loss in dollars and
 * percent). This hook assembles that from three RLS-scoped/shared reads through
 * the shared Supabase client, computing every figure in integer cents with
 * src/lib/money.ts helpers:
 *
 *   - `paper_accounts` (RLS: the caller's single account) -> cash and starting
 *     cash.
 *   - `positions` (RLS: the caller's rows) -> holdings and total cost basis.
 *   - `quotes` (shared catalog) -> the current price for each held symbol.
 *
 * No user id is passed from the client; RLS scopes the account and positions to
 * the signed-in user. A position whose symbol has no quote yet is valued at 0
 * (its quote may not have been ingested), mirroring the server snapshot job's
 * resilience, rather than breaking the whole screen.
 *
 * Portfolio values are "Paper money" and labelled as such on the screen
 * (requirement 7.4); this hook returns raw cents and leaves copy to the screen.
 * Because the view depends on quotes, it refetches on the price-screen cadence.
 */
import { useQuery } from '@tanstack/react-query';

import { computeGainLoss, pctChange } from '../../lib/money';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../types/db';

type AccountRow = Database['public']['Tables']['paper_accounts']['Row'];
type PositionRow = Database['public']['Tables']['positions']['Row'];

/** How often the portfolio refreshes (depends on quotes; ~60 s). */
export const PORTFOLIO_REFETCH_INTERVAL_MS = 60_000;

/** React Query key for the caller's portfolio. */
export const PORTFOLIO_QUERY_KEY = ['portfolio', 'me'] as const;

/** A single holding, enriched with its current quote-derived valuation. */
export interface PortfolioPosition {
  symbol: string;
  /** Number of shares held. */
  qty: number;
  /** Total cost basis in cents (from positions.cost_basis_cents). */
  costBasisCents: number;
  /** Average cost per share in cents, rounded to the nearest cent. */
  avgCostCents: number;
  /** Current quote price in cents, or null when no quote exists yet. */
  currentPriceCents: number | null;
  /** Current market value in cents (0 when no quote). */
  valueCents: number;
  /** Unrealized gain/loss in cents versus cost basis. */
  gainCents: number;
  /** Unrealized gain/loss in basis points, or null when basis is 0. */
  gainBasisPoints: number | null;
}

/** The assembled portfolio for the Portfolio tab. */
export interface Portfolio {
  /** The paper account, or null when the user has none (should not happen for
   * an onboarded user, but handled gracefully). */
  account: AccountRow | null;
  /** Available cash in cents. */
  cashCents: number;
  /** Sum of all position values in cents. */
  positionsValueCents: number;
  /** cash + positions value, in cents. */
  equityCents: number;
  /** Starting cash in cents (the gain/loss baseline). */
  startingCashCents: number;
  /** Total gain/loss versus starting cash, in cents. */
  totalGainCents: number;
  /** Total gain/loss versus starting cash, in basis points (null if 0 basis). */
  totalGainBasisPoints: number | null;
  /** One enriched row per holding. */
  positions: PortfolioPosition[];
}

/**
 * Fetch and assemble the caller's portfolio. RLS limits the account and
 * positions to the signed-in user. Throws on a Supabase error.
 */
export async function fetchPortfolio(): Promise<Portfolio> {
  // The caller's single paper account (RLS-scoped).
  const { data: account, error: accountError } = await supabase
    .from('paper_accounts')
    .select('id, user_id, cash_cents, starting_cash_cents, created_at')
    .maybeSingle();
  if (accountError) {
    throw accountError;
  }

  // The caller's positions (RLS-scoped).
  const { data: positionRows, error: positionsError } = await supabase
    .from('positions')
    .select('account_id, symbol, qty, cost_basis_cents, updated_at')
    .order('symbol', { ascending: true });
  if (positionsError) {
    throw positionsError;
  }
  const positions: PositionRow[] = positionRows ?? [];

  // Current prices for the held symbols only. Skip the query when there are no
  // positions to value.
  const symbols = positions.map((p) => p.symbol);
  const priceBySymbol = new Map<string, number>();
  if (symbols.length > 0) {
    const { data: quoteRows, error: quotesError } = await supabase
      .from('quotes')
      .select('symbol, price_cents')
      .in('symbol', symbols);
    if (quotesError) {
      throw quotesError;
    }
    for (const q of quoteRows ?? []) {
      priceBySymbol.set(q.symbol, q.price_cents);
    }
  }

  const enriched: PortfolioPosition[] = positions.map((p) => {
    const currentPriceCents = priceBySymbol.get(p.symbol) ?? null;
    // A missing quote values the holding at 0 rather than aborting the screen.
    const gl = computeGainLoss(p.qty, currentPriceCents ?? 0, p.cost_basis_cents);
    return {
      symbol: p.symbol,
      qty: p.qty,
      costBasisCents: p.cost_basis_cents,
      avgCostCents: Math.round(p.cost_basis_cents / p.qty),
      currentPriceCents,
      valueCents: gl.valueCents,
      gainCents: gl.gainCents,
      gainBasisPoints: gl.gainBasisPoints,
    };
  });

  const cashCents = account?.cash_cents ?? 0;
  const startingCashCents = account?.starting_cash_cents ?? 0;
  const positionsValueCents = enriched.reduce((sum, p) => sum + p.valueCents, 0);
  const equityCents = cashCents + positionsValueCents;

  return {
    account: account ?? null,
    cashCents,
    positionsValueCents,
    equityCents,
    startingCashCents,
    totalGainCents: equityCents - startingCashCents,
    totalGainBasisPoints: pctChange(equityCents, startingCashCents),
    positions: enriched,
  };
}

/**
 * Query the caller's portfolio, refetching on the price-screen interval. Pass
 * `enabled = isSignedIn` so the query does not run while signed out.
 */
export function usePortfolio(enabled = true) {
  return useQuery({
    queryKey: PORTFOLIO_QUERY_KEY,
    queryFn: fetchPortfolio,
    enabled,
    refetchInterval: PORTFOLIO_REFETCH_INTERVAL_MS,
  });
}
