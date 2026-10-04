import { QueryClient } from '@tanstack/react-query';

import { fetchDueRewindItems, REWIND_QUERY_KEY, type DueRewindItem } from './use-rewind';
import { invalidateRewind } from './use-save-rewind-items';

// Mock the Supabase client with a chainable query builder so `fetchDueRewindItems`
// can be exercised without the native-backed real client. `select -> lte ->
// order` all return the same builder; `order` resolves with the mocked rows.
// The `mock`-prefixed names are the one escape hatch jest allows the hoisted
// `jest.mock` factory to reference.
const mockOrder = jest.fn();
const mockLte = jest.fn((_column: string, _value: string) => ({ order: mockOrder }));
const mockSelect = jest.fn((_columns: string) => ({ lte: mockLte }));
const mockFrom = jest.fn((_table: string) => ({ select: mockSelect }));
jest.mock('../../../lib/supabase', () => ({
  supabase: { from: (name: string) => mockFrom(name) },
}));

function makeRow(partial: Partial<DueRewindItem> & Pick<DueRewindItem, 'item_id'>): DueRewindItem {
  return { id: `id-${partial.item_id}`, lesson_id: 'L1.1', box: 0, ...partial };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fetchDueRewindItems (7.2)', () => {
  it('returns the due items and a matching dueCount', async () => {
    const rows = [makeRow({ item_id: 's1' }), makeRow({ item_id: 's2' })];
    mockOrder.mockResolvedValueOnce({ data: rows, error: null });

    const result = await fetchDueRewindItems(new Date('2025-01-10T00:00:00Z'));

    expect(result.items).toEqual(rows);
    expect(result.dueCount).toBe(2);
  });

  it('reports dueCount 0 (card hidden) when nothing is due', async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null });

    const result = await fetchDueRewindItems();

    expect(result.items).toEqual([]);
    expect(result.dueCount).toBe(0);
  });

  it('treats a null data payload as an empty, zero-count queue', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: null });

    const result = await fetchDueRewindItems();

    expect(result.items).toEqual([]);
    expect(result.dueCount).toBe(0);
  });

  it('filters server-side on due_at <= now (the injected clock)', async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null });

    await fetchDueRewindItems(new Date('2025-01-10T12:00:00Z'));

    expect(mockFrom).toHaveBeenCalledWith('rewind_items');
    expect(mockLte).toHaveBeenCalledWith('due_at', '2025-01-10T12:00:00.000Z');
    expect(mockOrder).toHaveBeenCalledWith('due_at', { ascending: true });
  });

  it('throws when the query errors', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: new Error('rls denied') });

    await expect(fetchDueRewindItems()).rejects.toThrow('rls denied');
  });
});

describe('invalidateRewind (7.2)', () => {
  it('invalidates the rewind query so the card refreshes', () => {
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries').mockReturnValue(Promise.resolve());

    invalidateRewind(client);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: REWIND_QUERY_KEY });
    client.clear();
  });
});
