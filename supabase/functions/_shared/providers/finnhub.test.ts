// Deno tests for the Finnhub provider using recorded fixtures (no live calls).
// Run with: deno test supabase/functions/_shared/providers/
import { assertEquals, assertExists } from 'jsr:@std/assert@^1';

import { dollarsToCents } from './cents.ts';
import { FinnhubProvider, type FetchLike } from './finnhub.ts';
import {
  candleNoData,
  candleOk,
  quoteMalformed,
  quoteNoData,
  quoteOk,
  quoteRoundingEdge,
} from './__fixtures__/finnhub.ts';

/** Build a fetch that returns a JSON 200, keyed by a substring of the URL. */
function fixtureFetch(routes: Array<[match: string, body: unknown, status?: number]>): {
  fetchImpl: FetchLike;
  calls: string[];
} {
  const calls: string[] = [];
  const fetchImpl: FetchLike = (url) => {
    calls.push(url);
    for (const [match, body, status] of routes) {
      if (url.includes(match)) {
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: status ?? 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  };
  return { fetchImpl, calls };
}

/** A provider wired for tests: no pacing, no real backoff delays. */
function testProvider(fetchImpl: FetchLike, overrides = {}): FinnhubProvider {
  return new FinnhubProvider({
    apiKey: 'test-key',
    fetchImpl,
    minRequestIntervalMs: 0,
    backoffBaseMs: 0,
    sleep: () => Promise.resolve(),
    ...overrides,
  });
}

Deno.test('name is finnhub (written to quotes.source)', () => {
  const provider = testProvider(() => Promise.resolve(new Response('{}')));
  assertEquals(provider.name, 'finnhub');
});

Deno.test('getSnapshots maps a well-formed quote to provider dollars', async () => {
  const { fetchImpl } = fixtureFetch([['symbol=AAPL', quoteOk]]);
  const provider = testProvider(fetchImpl);

  const [quote] = await provider.getSnapshots(['AAPL']);
  assertExists(quote);
  assertEquals(quote.symbol, 'AAPL');
  assertEquals(quote.price, 189.95);
  assertEquals(quote.prevClose, 188.72);
  assertEquals(quote.open, 188.5);
  assertEquals(quote.high, 190.4);
  assertEquals(quote.low, 188.1);
  // asOf is the provider epoch (seconds) rendered as ISO.
  assertEquals(quote.asOf, new Date(1_712_000_000 * 1000).toISOString());
});

Deno.test('getSnapshots dollars convert cleanly at the cents boundary', async () => {
  const { fetchImpl } = fixtureFetch([['symbol=AAPL', quoteOk]]);
  const [quote] = await testProvider(fetchImpl).getSnapshots(['AAPL']);
  // The ingest function will run this conversion once; assert it is exact.
  assertEquals(dollarsToCents(quote.price), 18995);
  assertEquals(dollarsToCents(quote.prevClose!), 18872);
});

Deno.test('getSnapshots skips a no-data (zero-price) symbol', async () => {
  // Last-known-good behavior: a zero/halted quote is omitted so the ingest
  // function keeps the previous row (requirement 2.3).
  const { fetchImpl } = fixtureFetch([['symbol=ZZZZ', quoteNoData]]);
  const quotes = await testProvider(fetchImpl).getSnapshots(['ZZZZ']);
  assertEquals(quotes, []);
});

Deno.test('getSnapshots drops a malformed quote without aborting the batch', async () => {
  // AAPL ok, BADX missing required `c` -> only AAPL survives.
  const { fetchImpl } = fixtureFetch([
    ['symbol=AAPL', quoteOk],
    ['symbol=BADX', quoteMalformed],
  ]);
  const quotes = await testProvider(fetchImpl).getSnapshots(['AAPL', 'BADX']);
  assertEquals(quotes.length, 1);
  assertEquals(quotes[0].symbol, 'AAPL');
});

Deno.test('getSnapshots collapses zero optional fields to undefined', async () => {
  // quoteRoundingEdge has o/h/l = 0; those must not surface as 0-dollar fields.
  const { fetchImpl } = fixtureFetch([['symbol=EDGE', quoteRoundingEdge]]);
  const [quote] = await testProvider(fetchImpl).getSnapshots(['EDGE']);
  assertExists(quote);
  assertEquals(quote.price, 1.005);
  assertEquals(dollarsToCents(quote.price), 101); // the half-cent edge rounds up
  assertEquals(quote.open, undefined);
  assertEquals(quote.high, undefined);
  assertEquals(quote.low, undefined);
});

Deno.test('getSnapshots retries on 429 then succeeds (rate-limit handling)', async () => {
  let attempts = 0;
  const fetchImpl: FetchLike = (url) => {
    attempts++;
    if (attempts === 1) {
      return Promise.resolve(new Response('rate limited', { status: 429 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify(quoteOk), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  const [quote] = await testProvider(fetchImpl).getSnapshots(['AAPL']);
  assertExists(quote);
  assertEquals(attempts, 2); // one 429, one success
  assertEquals(quote.symbol, 'AAPL');
});

Deno.test('getSnapshots gives up after maxRetries 429s and skips the symbol', async () => {
  let attempts = 0;
  const fetchImpl: FetchLike = () => {
    attempts++;
    return Promise.resolve(new Response('rate limited', { status: 429 }));
  };
  const provider = testProvider(fetchImpl, { maxRetries: 2 });
  const quotes = await provider.getSnapshots(['AAPL']);
  assertEquals(quotes, []); // persistent rate limit -> no quote, batch intact
  assertEquals(attempts, 3); // initial try + 2 retries
});

Deno.test('getSnapshots paces one request per symbol', async () => {
  const { fetchImpl, calls } = fixtureFetch([['symbol=', quoteOk]]);
  await testProvider(fetchImpl).getSnapshots(['AAPL', 'MSFT', 'DIS']);
  assertEquals(calls.length, 3);
});

Deno.test('getDailyBars maps candle arrays into ProviderBar rows', async () => {
  const { fetchImpl } = fixtureFetch([['stock/candle', candleOk]]);
  const bars = await testProvider(fetchImpl).getDailyBars('AAPL', '2024-04-01', '2024-04-03');
  assertEquals(bars.length, 3);
  assertEquals(bars[0], {
    date: '2024-04-01',
    open: 188.5,
    high: 190.4,
    low: 187.9,
    close: 189.95,
    volume: 52_000_000,
  });
  assertEquals(bars[2].close, 191.75);
  assertEquals(dollarsToCents(bars[0].close), 18995);
});

Deno.test('getDailyBars returns [] when the range has no data', async () => {
  const { fetchImpl } = fixtureFetch([['stock/candle', candleNoData]]);
  const bars = await testProvider(fetchImpl).getDailyBars('ZZZZ', '2024-04-01', '2024-04-03');
  assertEquals(bars, []);
});
