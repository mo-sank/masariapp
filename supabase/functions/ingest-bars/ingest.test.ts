// Deno tests for the ingest-bars core logic (runIngestBars / toBarRows /
// parseRequest). No live Supabase stack or market-data provider: every
// dependency is faked. Run with: deno test supabase/functions/ingest-bars/
import { assertEquals, assertExists, assertThrows } from 'jsr:@std/assert@^1';

import type { ProviderBar, ProviderQuote, QuoteProvider } from '../_shared/providers/types.ts';
import {
  DEFAULT_BACKFILL_YEARS,
  IngestBarsRequestError,
  MAX_BACKFILL_YEARS,
  parseRequest,
  runIngestBars,
  toBarRow,
  toBarRows,
  type IngestBarsDeps,
  type Logger,
  type QuoteBarRow,
} from './ingest.ts';

/** A logger that records every call for assertions. */
function recordingLogger(): Logger & { entries: Array<{ level: string; message: string; data?: unknown }> } {
  const entries: Array<{ level: string; message: string; data?: unknown }> = [];
  return {
    entries,
    info: (message, data) => entries.push({ level: 'info', message, data }),
    warn: (message, data) => entries.push({ level: 'warn', message, data }),
    error: (message, data) => entries.push({ level: 'error', message, data }),
  };
}

/** A stub provider whose getDailyBars behavior is supplied per test. */
function stubProvider(
  getDailyBars: (symbol: string, from: string, to: string) => Promise<ProviderBar[]>,
): QuoteProvider & { calls: Array<{ symbol: string; from: string; to: string }> } {
  const calls: Array<{ symbol: string; from: string; to: string }> = [];
  return {
    name: 'stub',
    calls,
    getSnapshots: (): Promise<ProviderQuote[]> => Promise.resolve([]),
    getDailyBars: (symbol, from, to) => {
      calls.push({ symbol, from, to });
      return getDailyBars(symbol, from, to);
    },
  };
}

/** A well-formed provider bar in provider dollars. */
function bar(overrides: Partial<ProviderBar> = {}): ProviderBar {
  return { date: '2024-03-28', open: 100.1, high: 101.5, low: 99.8, close: 100.9, volume: 1_000_000, ...overrides };
}

/** Build IngestBarsDeps with sensible defaults plus observable side effects. */
function makeDeps(overrides: Partial<IngestBarsDeps> = {}): {
  deps: IngestBarsDeps;
  upserted: QuoteBarRow[][];
  completedMarks: Array<{ windowKey: string; symbol: string; barsWritten: number }>;
  completedStore: Map<string, Set<string>>;
  logger: ReturnType<typeof recordingLogger>;
} {
  const upserted: QuoteBarRow[][] = [];
  const completedMarks: Array<{ windowKey: string; symbol: string; barsWritten: number }> = [];
  const completedStore = new Map<string, Set<string>>();
  const logger = recordingLogger();

  const deps: IngestBarsDeps = {
    provider: stubProvider(() => Promise.resolve([bar()])),
    listActiveSymbols: () => Promise.resolve(['AAPL']),
    upsertBars: (rows) => {
      upserted.push(rows);
      return Promise.resolve();
    },
    listCompletedSymbols: (windowKey) => Promise.resolve([...(completedStore.get(windowKey) ?? [])]),
    markSymbolComplete: (windowKey, symbol, barsWritten) => {
      completedMarks.push({ windowKey, symbol, barsWritten });
      const set = completedStore.get(windowKey) ?? new Set<string>();
      set.add(symbol);
      completedStore.set(windowKey, set);
      return Promise.resolve();
    },
    logger,
    now: () => new Date('2024-04-01T00:00:00Z'),
    ...overrides,
  };
  return { deps, upserted, completedMarks, completedStore, logger };
}

// ---------------------------------------------------------------------------
// parseRequest
// ---------------------------------------------------------------------------

Deno.test('parseRequest defaults to nightly with no body', () => {
  assertEquals(parseRequest(undefined), { mode: 'nightly', years: DEFAULT_BACKFILL_YEARS });
  assertEquals(parseRequest({}), { mode: 'nightly', years: DEFAULT_BACKFILL_YEARS });
});

Deno.test('parseRequest reads backfill mode and years', () => {
  assertEquals(parseRequest({ mode: 'backfill', years: 5 }), { mode: 'backfill', years: 5 });
  assertEquals(parseRequest({ mode: 'backfill' }), { mode: 'backfill', years: DEFAULT_BACKFILL_YEARS });
});

Deno.test('parseRequest rejects an unknown mode', () => {
  assertThrows(() => parseRequest({ mode: 'weekly' }), IngestBarsRequestError);
});

Deno.test('parseRequest rejects an out-of-range or non-integer years', () => {
  assertThrows(() => parseRequest({ mode: 'backfill', years: 0 }), IngestBarsRequestError);
  assertThrows(() => parseRequest({ mode: 'backfill', years: MAX_BACKFILL_YEARS + 1 }), IngestBarsRequestError);
  assertThrows(() => parseRequest({ mode: 'backfill', years: 1.5 }), IngestBarsRequestError);
});

// ---------------------------------------------------------------------------
// backfill mode (requirement 3.1)
// ---------------------------------------------------------------------------

Deno.test('backfill loads a 5-year range for each active symbol and writes bars', async () => {
  const provider = stubProvider(() => Promise.resolve([bar(), bar({ date: '2024-03-29', close: 101.2 })]));
  const { deps, upserted, completedMarks } = makeDeps({
    provider,
    listActiveSymbols: () => Promise.resolve(['AAPL', 'MSFT']),
  });

  const result = await runIngestBars({ mode: 'backfill', years: 5 }, deps);

  // The requested range is now minus 5 years, inclusive, to today.
  assertEquals(result.from, '2019-04-01');
  assertEquals(result.to, '2024-04-01');
  assertEquals(provider.calls.map((c) => c.symbol), ['AAPL', 'MSFT']);
  assertEquals(provider.calls[0].from, '2019-04-01');
  assertEquals(provider.calls[0].to, '2024-04-01');

  assertEquals(result.requested, 2);
  assertEquals(result.completed, 2);
  assertEquals(result.skipped, 0);
  assertEquals(result.barsWritten, 4); // 2 bars x 2 symbols
  assertEquals(upserted.length, 2); // one upsert batch per symbol
  // Both symbols were marked complete for this window.
  assertEquals(completedMarks.map((m) => m.symbol).sort(), ['AAPL', 'MSFT']);
  assertEquals(result.windowKey, '2019-04-01_2024-04-01');
});

Deno.test('backfill converts dollars to integer cents once', async () => {
  const provider = stubProvider(() =>
    Promise.resolve([bar({ open: 100.1, high: 101.5, low: 99.8, close: 100.9, volume: 1234 })]),
  );
  const { deps, upserted } = makeDeps({ provider });

  await runIngestBars({ mode: 'backfill', years: 5 }, deps);

  const row = upserted[0][0];
  assertEquals(row.symbol, 'AAPL');
  assertEquals(row.open_cents, 10010);
  assertEquals(row.high_cents, 10150);
  assertEquals(row.low_cents, 9980);
  assertEquals(row.close_cents, 10090);
  assertEquals(row.volume, 1234);
  assertEquals(row.bar_date, '2024-03-28');
});

Deno.test('backfill is resumable: already-completed symbols are skipped', async () => {
  const windowKey = '2019-04-01_2024-04-01';
  const provider = stubProvider(() => Promise.resolve([bar()]));
  const { deps, upserted, completedStore } = makeDeps({
    provider,
    listActiveSymbols: () => Promise.resolve(['AAPL', 'MSFT', 'NVDA']),
  });
  // Pretend a prior interrupted run already finished AAPL and MSFT.
  completedStore.set(windowKey, new Set(['AAPL', 'MSFT']));

  const result = await runIngestBars({ mode: 'backfill', years: 5 }, deps);

  // Only NVDA is fetched; AAPL and MSFT are resumed-skipped.
  assertEquals(provider.calls.map((c) => c.symbol), ['NVDA']);
  assertEquals(result.skipped, 2);
  assertEquals(result.completed, 1);
  assertEquals(upserted.length, 1);
  assertEquals(upserted[0][0].symbol, 'NVDA');
  const skipped = result.symbols.filter((s) => s.resumedSkip).map((s) => s.symbol).sort();
  assertEquals(skipped, ['AAPL', 'MSFT']);
});

Deno.test('a failing symbol is isolated and NOT marked complete (retried next run)', async () => {
  const provider = stubProvider((symbol) =>
    symbol === 'MSFT' ? Promise.reject(new Error('rate limited')) : Promise.resolve([bar()]),
  );
  const { deps, completedMarks, logger } = makeDeps({
    provider,
    listActiveSymbols: () => Promise.resolve(['AAPL', 'MSFT', 'NVDA']),
  });

  const result = await runIngestBars({ mode: 'backfill', years: 5 }, deps);

  assertEquals(result.completed, 2); // AAPL + NVDA
  assertEquals(result.failed, 1); // MSFT
  // MSFT never marked complete, so a resume will retry it.
  assertEquals(completedMarks.map((m) => m.symbol).sort(), ['AAPL', 'NVDA']);
  assertEquals(logger.entries.some((e) => e.level === 'error'), true);
  const msft = result.symbols.find((s) => s.symbol === 'MSFT')!;
  assertExists(msft.error);
});

// ---------------------------------------------------------------------------
// nightly mode (requirement 3.2)
// ---------------------------------------------------------------------------

Deno.test('nightly appends the latest bars over a short lookback and does not track progress', async () => {
  const provider = stubProvider(() => Promise.resolve([bar({ date: '2024-03-28' }), bar({ date: '2024-04-01' })]));
  const { deps, upserted, completedMarks } = makeDeps({
    provider,
    listActiveSymbols: () => Promise.resolve(['AAPL']),
  });

  const result = await runIngestBars({ mode: 'nightly', years: DEFAULT_BACKFILL_YEARS }, deps);

  assertEquals(result.mode, 'nightly');
  assertEquals(result.to, '2024-04-01');
  assertEquals(result.from, '2024-03-27'); // 5-day lookback
  assertEquals(result.windowKey, undefined); // no resume cohort for nightly
  assertEquals(result.barsWritten, 2);
  assertEquals(upserted.length, 1);
  assertEquals(completedMarks.length, 0); // nightly never writes progress
});

// ---------------------------------------------------------------------------
// edge cases
// ---------------------------------------------------------------------------

Deno.test('no active instruments is a no-op success', async () => {
  const provider = stubProvider(() => Promise.resolve([bar()]));
  const { deps, upserted } = makeDeps({ provider, listActiveSymbols: () => Promise.resolve([]) });

  const result = await runIngestBars({ mode: 'nightly', years: 5 }, deps);

  assertEquals(result.requested, 0);
  assertEquals(result.completed, 0);
  assertEquals(provider.calls.length, 0);
  assertEquals(upserted.length, 0);
});

Deno.test('symbols are normalized (upper-cased, de-duplicated, sorted)', async () => {
  const provider = stubProvider(() => Promise.resolve([bar()]));
  const { deps } = makeDeps({
    provider,
    listActiveSymbols: () => Promise.resolve(['msft', 'AAPL', 'aapl', ' nvda ']),
  });

  const result = await runIngestBars({ mode: 'nightly', years: 5 }, deps);

  assertEquals(result.requested, 3);
  assertEquals(provider.calls.map((c) => c.symbol), ['AAPL', 'MSFT', 'NVDA']);
});

Deno.test('an empty provider response writes nothing but still completes the symbol', async () => {
  const provider = stubProvider(() => Promise.resolve([]));
  const { deps, upserted, completedMarks } = makeDeps({ provider });

  const result = await runIngestBars({ mode: 'backfill', years: 5 }, deps);

  assertEquals(result.completed, 1);
  assertEquals(result.barsWritten, 0);
  assertEquals(upserted.length, 0); // nothing to upsert
  assertEquals(completedMarks.length, 1); // still marked done so it is not refetched
});

// ---------------------------------------------------------------------------
// toBarRow / toBarRows
// ---------------------------------------------------------------------------

Deno.test('toBarRow drops a bar with an invalid date', () => {
  const logger = recordingLogger();
  const row = toBarRow('AAPL', bar({ date: 'not-a-date' }), logger);
  assertEquals(row, null);
  assertEquals(logger.entries.some((e) => e.level === 'warn'), true);
});

Deno.test('toBarRow drops a bar with a non-positive close', () => {
  const logger = recordingLogger();
  assertEquals(toBarRow('AAPL', bar({ close: 0 }), logger), null);
  assertEquals(toBarRow('AAPL', bar({ close: -5 }), logger), null);
});

Deno.test('toBarRow drops a bar whose OHLC is non-finite', () => {
  const logger = recordingLogger();
  assertEquals(toBarRow('AAPL', bar({ high: Number.NaN }), logger), null);
});

Deno.test('toBarRows sorts ascending by bar_date and drops invalid bars', () => {
  const logger = recordingLogger();
  const rows = toBarRows(
    'aapl',
    [bar({ date: '2024-04-01' }), bar({ date: 'bad' }), bar({ date: '2024-03-28' })],
    logger,
  );
  assertEquals(rows.map((r) => r.bar_date), ['2024-03-28', '2024-04-01']);
  assertEquals(rows[0].symbol, 'AAPL'); // upper-cased
});
