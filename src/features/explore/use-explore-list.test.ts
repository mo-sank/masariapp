// Mock the Supabase singleton so importing use-explore-list (via use-instruments
// and use-quotes) does not pull in the native auth0 module chain. This test
// exercises only the pure buildExploreList/filterExploreList helpers.
jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

// eslint-disable-next-line import/first -- jest.mock must be hoisted above this import
import { buildExploreList, filterExploreList, type ExploreListItem } from './use-explore-list';
// eslint-disable-next-line import/first
import type { Database } from '../../types/db';

type InstrumentRow = Database['public']['Tables']['instruments']['Row'];
type QuoteRow = Database['public']['Tables']['quotes']['Row'];

function instrument(partial: Partial<InstrumentRow> & { symbol: string; name: string }): InstrumentRow {
  return {
    is_active: true,
    is_starter: false,
    sector: null,
    sort_order: null,
    type: 'stock',
    ...partial,
  };
}

function quote(partial: Partial<QuoteRow> & { symbol: string }): QuoteRow {
  return {
    as_of: '2025-01-01T00:00:00.000Z',
    high_cents: null,
    is_delayed: true,
    low_cents: null,
    open_cents: null,
    prev_close_cents: 10000,
    price_cents: 10500,
    source: 'test',
    updated_at: '2025-01-01T00:00:00.000Z',
    volume: null,
    ...partial,
  };
}

describe('buildExploreList', () => {
  it('surfaces starters first while preserving catalog order within each group', () => {
    const instruments = [
      instrument({ symbol: 'AAA', name: 'Alpha', is_starter: false }),
      instrument({ symbol: 'BBB', name: 'Bravo', is_starter: true }),
      instrument({ symbol: 'CCC', name: 'Charlie', is_starter: false }),
      instrument({ symbol: 'DDD', name: 'Delta', is_starter: true }),
    ];
    const result = buildExploreList(instruments, []);
    expect(result.map((i) => i.instrument.symbol)).toEqual(['BBB', 'DDD', 'AAA', 'CCC']);
  });

  it('joins each instrument to its quote and leaves missing quotes null', () => {
    const instruments = [
      instrument({ symbol: 'AAA', name: 'Alpha' }),
      instrument({ symbol: 'BBB', name: 'Bravo' }),
    ];
    const quotes = [quote({ symbol: 'AAA', price_cents: 12345 })];
    const result = buildExploreList(instruments, quotes);
    expect(result.find((i) => i.instrument.symbol === 'AAA')?.quote?.price_cents).toBe(12345);
    expect(result.find((i) => i.instrument.symbol === 'BBB')?.quote).toBeNull();
  });
});

describe('filterExploreList', () => {
  const items: ExploreListItem[] = [
    { instrument: instrument({ symbol: 'AAPL', name: 'Apple Inc.' }), quote: null },
    { instrument: instrument({ symbol: 'MSFT', name: 'Microsoft' }), quote: null },
    { instrument: instrument({ symbol: 'GOOG', name: 'Alphabet' }), quote: null },
  ];

  it('returns the list unchanged for an empty or whitespace query', () => {
    expect(filterExploreList(items, '')).toHaveLength(3);
    expect(filterExploreList(items, '   ')).toHaveLength(3);
  });

  it('matches by symbol, case-insensitively', () => {
    const result = filterExploreList(items, 'aapl');
    expect(result.map((i) => i.instrument.symbol)).toEqual(['AAPL']);
  });

  it('matches by name substring', () => {
    const result = filterExploreList(items, 'micro');
    expect(result.map((i) => i.instrument.symbol)).toEqual(['MSFT']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterExploreList(items, 'zzz')).toEqual([]);
  });
});
