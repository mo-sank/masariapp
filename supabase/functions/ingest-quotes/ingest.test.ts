// Deno tests for the ingest-quotes core logic (runIngest / toQuoteRow).
// No live Supabase stack or market-data provider: every dependency is faked.
// Run with: deno test supabase/functions/ingest-quotes/
import { assertEquals, assertExists } from 'jsr:@std/assert@^1';

import type { ProviderBar, ProviderQuote, QuoteProvider } from '../_shared/providers/types.ts';
import { runIngest, toQuoteRow, type IngestDeps, type Logger, type QuoteRow } from './ingest.ts';

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

/** A stub provider whose getSnapshots behavior is supplied per test. */
function stubProvider(
  getSnapshots: (symbols: string[]) => Promise<ProviderQuote[]>,
): QuoteProvider & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    name: 'stub',
    calls,
    getSnapshots: (symbols: string[]) => {
      calls.push(symbols);
      return getSnapshots(symbols);
    },
    getDailyBars: (): Promise<ProviderBar[]> => Promise.resolve([]),
  };
}

/** Build IngestDeps with sensible defaults; override per test. */
function makeDeps(overrides: Partial<IngestDeps> = {}): {
  deps: IngestDeps;
  upserted: QuoteRow[][];
  logger: ReturnType<typeof recordingLogger>;
} {
  const upserted: QuoteRow[][] = [];
  const logger = recordingLogger();
  const deps: IngestDeps = {
    provider: stubProvider(() => Promise.resolve([])),
    marketSession: () => Promise.resolve('regular' as const),
    listActiveSymbols: () => Promise.resolve(['AAPL']),
    upsertQuotes: (rows: QuoteRow[]) => {
      upserted.push(rows);
      return Promise.resolve();
    },
    logger,
    now: () => new Date('2024-04-01T15:00:00Z'),
    ...overrides,
  };
  return { deps, upserted, logger };
}

/** A well-formed provider quote for AAPL in provider dollars. */
function aaplQuote(overrides: Partial<ProviderQuote> = {}): ProviderQuote {
  return {
    symbol: 'AAPL',
    price: 189.95,
    prevClose: 188.72,
    open: 188.5,
    high: 190.4,
    low: 188.1,
    volume: 52_000_000,
    asOf: '2024-04-01T14:55:00.000Z',
    ...overrides,
  };
}

Deno.test('skips without calling the provider when fully closed and window passed', async () => {
  const provider = stubProvider(() => Promise.resolve([aaplQuote()]));
  const { deps, upserted } = makeDeps({ provider, marketSession: () => Promise.resolve('closed' as const) });

  const result = await runIngest(deps);

  assertEquals(result.skipped, true);
  assertEquals(result.reason, 'market_closed');
  assertEquals(result.session, 'closed');
  assertEquals(provider.calls.length, 0); // provider never called (requirement 2.2)
  assertEquals(upserted.length, 0);
});

Deno.test('ingests during the extended (pre/after-hours) session', async () => {
  const provider = stubProvider(() => Promise.resolve([aaplQuote()]));
  const { deps, upserted } = makeDeps({ provider, marketSession: () => Promise.resolve('extended' as const) });

  const result = await runIngest(deps);

  assertEquals(result.skipped, false);
  assertEquals(result.session, 'extended');
  assertEquals(provider.calls.length, 1);
  assertEquals(upserted.length, 1);
  // The row's source carries the session so the client can label it.
  assertEquals(upserted[0][0].source, 'stub:extended');
});

Deno.test('runs during the 25-minute closing window even when closed right now', async () => {
  // Open 25 min ago (windowStart) but closed now: still ingests to capture the
  // final close (requirement 2.1).
  const now = new Date('2024-04-01T20:10:00Z');
  const windowStart = new Date(now.getTime() - 25 * 60 * 1000);
  const provider = stubProvider(() => Promise.resolve([aaplQuote()]));
  const { deps, upserted } = makeDeps({
    provider,
    now: () => now,
    marketSession: (at: Date) => Promise.resolve((at.getTime() === windowStart.getTime() ? 'regular' : 'closed') as const),
  });

  const result = await runIngest(deps);

  assertEquals(result.skipped, false);
  assertEquals(provider.calls.length, 1);
  assertEquals(upserted.length, 1);
  assertEquals(upserted[0][0].symbol, 'AAPL');
});

Deno.test('requests all active symbols and upserts valid rows in integer cents', async () => {
  const provider = stubProvider(() => Promise.resolve([aaplQuote(), aaplQuote({ symbol: 'MSFT', price: 420.1 })]));
  const { deps, upserted } = makeDeps({
    provider,
    listActiveSymbols: () => Promise.resolve(['AAPL', 'MSFT']),
  });

  const result = await runIngest(deps);

  assertEquals(provider.calls[0], ['AAPL', 'MSFT']); // batched for all actives (2.1)
  assertEquals(result.requested, 2);
  assertEquals(result.received, 2);
  assertEquals(result.upserted, 2);
  assertEquals(upserted.length, 1); // single upsert batch
  const aapl = upserted[0].find((r) => r.symbol === 'AAPL')!;
  assertEquals(aapl.price_cents, 18995); // dollars -> integer cents once
  assertEquals(aapl.prev_close_cents, 18872);
  assertEquals(aapl.open_cents, 18850);
  assertEquals(aapl.volume, 52_000_000);
  // Row records as_of, is_delayed, source (requirement 2.6).
  assertEquals(aapl.as_of, '2024-04-01T14:55:00.000Z');
  assertEquals(aapl.is_delayed, true);
  assertEquals(aapl.source, 'stub:regular'); // provider name + session
  assertEquals(aapl.updated_at, '2024-04-01T15:00:00.000Z');
});

Deno.test('keeps last-known-good (writes nothing) when the provider call throws', async () => {
  const provider = stubProvider(() => Promise.reject(new Error('timeout')));
  const { deps, upserted, logger } = makeDeps({
    provider,
    listActiveSymbols: () => Promise.resolve(['AAPL', 'MSFT']),
  });

  const result = await runIngest(deps);

  assertEquals(result.upserted, 0);
  assertEquals(result.received, 0);
  assertEquals(result.missing, ['AAPL', 'MSFT']);
  assertEquals(upserted.length, 0); // nothing written (requirement 2.3)
  assertEquals(logger.entries.some((e) => e.level === 'error'), true);
});

Deno.test('drops a symbol missing from the provider response and logs the shortfall', async () => {
  // Provider returns only AAPL though MSFT was requested (e.g. halted). MSFT
  // keeps its last-known-good row and is reported as missing.
  const provider = stubProvider(() => Promise.resolve([aaplQuote()]));
  const { deps, upserted, logger } = makeDeps({
    provider,
    listActiveSymbols: () => Promise.resolve(['AAPL', 'MSFT']),
  });

  const result = await runIngest(deps);

  assertEquals(result.upserted, 1);
  assertEquals(result.missing, ['MSFT']);
  assertEquals(upserted[0].length, 1);
  assertEquals(upserted[0][0].symbol, 'AAPL');
  assertEquals(logger.entries.some((e) => e.level === 'warn' && e.message.includes('last-known-good')), true);
});

Deno.test('never upserts a zero or negative price; the bad symbol is kept, not written', async () => {
  // Provider returned a 0 price (should have been filtered upstream, but the
  // ingest boundary is the last line of defense).
  const provider = stubProvider(() =>
    Promise.resolve([aaplQuote(), aaplQuote({ symbol: 'ZERO', price: 0 }), aaplQuote({ symbol: 'NEG', price: -5 })]),
  );
  const { deps, upserted } = makeDeps({
    provider,
    listActiveSymbols: () => Promise.resolve(['AAPL', 'ZERO', 'NEG']),
  });

  const result = await runIngest(deps);

  assertEquals(result.upserted, 1);
  assertEquals(result.missing, ['NEG', 'ZERO']);
  const symbols = upserted[0].map((r) => r.symbol);
  assertEquals(symbols, ['AAPL']); // only the valid, positive price written
});

Deno.test('returns a no-op success when there are no active instruments', async () => {
  const provider = stubProvider(() => Promise.resolve([aaplQuote()]));
  const { deps, upserted } = makeDeps({ provider, listActiveSymbols: () => Promise.resolve([]) });

  const result = await runIngest(deps);

  assertEquals(result.skipped, false);
  assertEquals(result.requested, 0);
  assertEquals(provider.calls.length, 0); // nothing to fetch
  assertEquals(upserted.length, 0);
});

Deno.test('toQuoteRow collapses absent optional fields to null', () => {
  const logger = recordingLogger();
  const row = toQuoteRow(
    { symbol: 'nvda', price: 100, asOf: '2024-04-01T14:00:00.000Z' },
    'stub',
    '2024-04-01T15:00:00.000Z',
    logger,
  );
  assertExists(row);
  assertEquals(row.symbol, 'NVDA'); // upper-cased to match instruments.symbol
  assertEquals(row.price_cents, 10000);
  assertEquals(row.prev_close_cents, null);
  assertEquals(row.open_cents, null);
  assertEquals(row.volume, null);
});

Deno.test('toQuoteRow drops a quote whose optional field is non-finite', () => {
  const logger = recordingLogger();
  const row = toQuoteRow(
    { symbol: 'AAPL', price: 189.95, high: Number.NaN, asOf: '2024-04-01T14:00:00.000Z' },
    'stub',
    '2024-04-01T15:00:00.000Z',
    logger,
  );
  assertEquals(row, null); // a present-but-invalid field is never silently dropped
  assertEquals(logger.entries.some((e) => e.level === 'warn'), true);
});
