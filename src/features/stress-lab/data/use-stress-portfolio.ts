/**
 * The lab's view of the caller's portfolio (FR-1–FR-6).
 *
 * The Portfolio tab's {@link usePortfolio} read gives cash and a valued row per
 * holding, but not each instrument's name or GICS sector — which the Stress Lab
 * needs to label holdings and to group exposure by sector. This hook joins the
 * two: it reuses `usePortfolio()` for the authoritative cash + per-symbol values
 * (so the lab overview matches the Portfolio tab exactly), then reads
 * `instruments(symbol, name, sector, type)` for the held symbols only, following
 * the Explore catalog pattern (no user id — instruments are a shared reference
 * table scoped by RLS to every signed-in user).
 *
 * The result is a `LabHolding[]` (the engine's input shape) plus the cash and
 * total figures the overview displays. A held symbol with no catalog row (should
 * not happen for a tradeable instrument) falls back to the symbol as its name and
 * a null sector, so the engine applies the broad-market shock rather than the row
 * being dropped.
 *
 * Share counts and cents values are validated as integers at the boundary with
 * zod: the portfolio read already computes them in integer cents, and a
 * non-integer would mean float math leaked onto a money value upstream.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { supabase } from '../../../lib/supabase';
import { usePortfolio } from '../../portfolio/use-portfolio';
import type { LabHolding } from '../engine/types';

/** Instrument metadata for a held symbol (Explore catalog shape). */
interface InstrumentMeta {
  symbol: string;
  name: string;
  sector: string | null;
  type: string;
}

/** React Query key for the held-symbol instrument metadata read. */
export const STRESS_INSTRUMENTS_QUERY_KEY = ['stress-lab', 'instruments'] as const;

/** Integer-cents / integer-qty guards for the portfolio figures we rely on. */
const labHoldingSchema = z.object({
  symbol: z.string(),
  qty: z.number().int(),
  valueCents: z.number().int(),
});

/** The lab's assembled portfolio: cash, totals, and enriched holdings. */
export interface StressPortfolio {
  /** Available cash in cents (pass-through to the engine). */
  cashCents: number;
  /** Sum of all holding values in cents. */
  holdingsValueCents: number;
  /** cash + holdings value, in cents. */
  totalValueCents: number;
  /** Total gain/loss versus starting cash, in cents. */
  totalGainCents: number;
  /** Total gain/loss versus starting cash, in basis points (null if 0 basis). */
  totalGainBasisPoints: number | null;
  /** One enriched holding per position, sector-labelled for the engine. */
  holdings: LabHolding[];
}

/** Fetch instrument metadata for the given held symbols (no user id). */
async function fetchInstrumentMeta(symbols: string[]): Promise<InstrumentMeta[]> {
  if (symbols.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from('instruments')
    .select('symbol, name, sector, type')
    .in('symbol', symbols);
  if (error) {
    throw error;
  }
  return data ?? [];
}

/**
 * Assemble the caller's portfolio for the Stress Lab. Returns a `useQuery`-like
 * object (`{ data, isLoading, isError, refetch }`) combining the portfolio read
 * and the instrument-metadata read so the screen can drive one set of states.
 */
export function useStressPortfolio(enabled = true) {
  const portfolio = usePortfolio(enabled);

  const symbols = useMemo(
    () => (portfolio.data?.positions ?? []).map((p) => p.symbol),
    [portfolio.data],
  );

  const instruments = useQuery({
    queryKey: [...STRESS_INSTRUMENTS_QUERY_KEY, symbols],
    queryFn: () => fetchInstrumentMeta(symbols),
    // Only read the catalog once we know which symbols are held; a cash-only
    // portfolio needs no instrument lookup.
    enabled: enabled && portfolio.isSuccess,
  });

  const data = useMemo<StressPortfolio | undefined>(() => {
    if (!portfolio.data) {
      return undefined;
    }
    // The instruments read is skipped when there are no positions; treat its
    // pending/empty state as an empty metadata map so a cash-only portfolio
    // still resolves.
    const metaBySymbol = new Map<string, InstrumentMeta>();
    for (const meta of instruments.data ?? []) {
      metaBySymbol.set(meta.symbol, meta);
    }

    const holdings: LabHolding[] = portfolio.data.positions.map((p) => {
      const { symbol, qty, valueCents } = labHoldingSchema.parse({
        symbol: p.symbol,
        qty: p.qty,
        valueCents: p.valueCents,
      });
      const meta = metaBySymbol.get(symbol);
      return {
        symbol,
        name: meta?.name ?? symbol,
        sector: meta?.sector ?? null,
        qty,
        currentValueCents: valueCents,
      };
    });

    return {
      cashCents: portfolio.data.cashCents,
      holdingsValueCents: portfolio.data.positionsValueCents,
      totalValueCents: portfolio.data.equityCents,
      totalGainCents: portfolio.data.totalGainCents,
      totalGainBasisPoints: portfolio.data.totalGainBasisPoints,
      holdings,
    };
  }, [portfolio.data, instruments.data]);

  // A held-symbol instrument read is only meaningful when there are positions;
  // fold its states into the portfolio's so the screen handles one surface.
  const needsInstruments = symbols.length > 0;
  const isLoading = portfolio.isLoading || (needsInstruments && instruments.isLoading);
  const isError = portfolio.isError || (needsInstruments && instruments.isError);

  const refetch = () => {
    void portfolio.refetch();
    void instruments.refetch();
  };

  return { data, isLoading, isError, refetch };
}
