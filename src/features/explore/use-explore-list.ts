/**
 * Combined Explore list hook (requirements 4.1, 4.2, 4.3).
 *
 * The Explore screen's single data entry point. It joins two already-built
 * queries — {@link useInstruments} (the active catalog) and {@link useQuotes}
 * (current delayed quotes) — into one display list, keeps starters surfaced
 * first (requirement 4.1), and applies the free-text search filter by symbol or
 * name (requirement 4.3). All joining/filtering lives in pure helpers so it is
 * unit-testable without React.
 *
 * Quotes are keyed by symbol and may be missing for an instrument (a row the
 * ingest job has not written yet); such rows still appear in the list with a
 * null quote so the catalog is never hidden by a data gap.
 */
import { useMemo } from 'react';

import { useInstruments } from './use-instruments';
import { useQuotes } from './use-quotes';
import type { Database } from '../../types/db';

type InstrumentRow = Database['public']['Tables']['instruments']['Row'];
type QuoteRow = Database['public']['Tables']['quotes']['Row'];

/** One row of the Explore list: an instrument with its current quote (if any). */
export interface ExploreListItem {
  instrument: InstrumentRow;
  quote: QuoteRow | null;
}

/**
 * Join instruments to their quotes, ordering starters first while otherwise
 * preserving the catalog order the instruments query returned (sort_order, then
 * symbol). Pure; exported for unit tests.
 */
export function buildExploreList(
  instruments: InstrumentRow[],
  quotes: QuoteRow[],
): ExploreListItem[] {
  const quoteBySymbol = new Map(quotes.map((q) => [q.symbol, q] as const));
  const items = instruments.map<ExploreListItem>((instrument) => ({
    instrument,
    quote: quoteBySymbol.get(instrument.symbol) ?? null,
  }));
  // Stable partition: starters keep their relative catalog order and lead the
  // list; everything else follows in catalog order.
  const starters = items.filter((i) => i.instrument.is_starter);
  const rest = items.filter((i) => !i.instrument.is_starter);
  return [...starters, ...rest];
}

/**
 * Filter the joined list by a free-text query against symbol or name
 * (case-insensitive, substring). An empty/whitespace query returns the list
 * unchanged. Pure; exported for unit tests.
 */
export function filterExploreList(items: ExploreListItem[], query: string): ExploreListItem[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return items;
  }
  return items.filter(({ instrument }) => {
    return (
      instrument.symbol.toLowerCase().includes(needle) ||
      instrument.name.toLowerCase().includes(needle)
    );
  });
}

export interface UseExploreListResult {
  /** True while either underlying query is loading for the first time. */
  isLoading: boolean;
  /** True when either query failed. */
  isError: boolean;
  /** Refetch both underlying queries (used by the error-state retry). */
  refetch: () => void;
  /** The joined, starters-first, filtered rows for the screen. */
  items: ExploreListItem[];
}

/**
 * Load the Explore list for the given search query. Pass the raw search text;
 * the hook trims and matches it. The result is memoized so re-renders while
 * typing stay cheap.
 */
export function useExploreList(search: string): UseExploreListResult {
  const instruments = useInstruments();
  const quotes = useQuotes();

  const items = useMemo(() => {
    const joined = buildExploreList(instruments.data ?? [], quotes.data ?? []);
    return filterExploreList(joined, search);
  }, [instruments.data, quotes.data, search]);

  return {
    isLoading: instruments.isLoading || quotes.isLoading,
    isError: instruments.isError || quotes.isError,
    refetch: () => {
      void instruments.refetch();
      void quotes.refetch();
    },
    items,
  };
}
