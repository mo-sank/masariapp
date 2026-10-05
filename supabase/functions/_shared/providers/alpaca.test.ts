// Deno tests for AlpacaProvider.getDailyBars. No live calls: a fixture transport
// returns recorded JSON. Run with: deno test supabase/functions/_shared/providers/
import { assertEquals, assertRejects } from 'jsr:@std/assert@^1';

import { AlpacaProvider, type FetchLike } from './alpaca.ts';
import { barsExtraSymbol, barsNoData, barsOnePage, barsPage1, barsPage2 } from './__fixtures__/alpaca.ts';

/** A fetch stub that returns the given JSON bodies in sequence per call. */
function sequenceFetch(bodies: unknown[]): { fetch: FetchLike; urls: string[] } {
  const urls: string[] = [];
  let i = 0;
  const fetch: FetchLike = (url) => {
    urls.push(url);
    const body = bodies[Math.min(i, bodies.length - 1)];
    i += 1;
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  };
  return { fetch, urls };
}

/** A provider wired to a fixture transport with no real delays. */
function providerWith(fetchImpl: FetchLike): AlpacaProvider {
  return new AlpacaProvider({
    keyId: 'PKTEST',
    secretKey: 'secret',
    fetchImpl,
    minRequestIntervalMs: 0,
    backoffBaseMs: 0,
  });
}

Deno.test('maps a single page of daily bars to ProviderBar (dollars, date from t)', async () => {
  const { fetch, urls } = sequenceFetch([barsOnePage]);
  const provider = providerWith(fetch);

  const bars = await provider.getDailyBars('aapl', '2026-09-01', '2026-09-03');

  assertEquals(bars.length, 3);
  assertEquals(bars[0], {
    date: '2026-09-01', // date portion of t, not the full RFC-3339 timestamp
    open: 316.97,
    high: 327.3,
    low: 314.73,
    close: 325.25, // dollars preserved (cents conversion happens downstream)
    volume: 1_709_875,
  });
  assertEquals(bars[2].date, '2026-09-03');
  // One request, with the expected query params and upper-cased symbol.
  assertEquals(urls.length, 1);
  assertEquals(urls[0].includes('symbols=AAPL'), true);
  assertEquals(urls[0].includes('timeframe=1Day'), true);
  assertEquals(urls[0].includes('adjustment=split'), true);
  assertEquals(urls[0].includes('feed=iex'), true);
  assertEquals(urls[0].includes('start=2026-09-01'), true);
  assertEquals(urls[0].includes('end=2026-09-03'), true);
});

Deno.test('follows next_page_token across pages and joins the results', async () => {
  const { fetch, urls } = sequenceFetch([barsPage1, barsPage2]);
  const provider = providerWith(fetch);

  const bars = await provider.getDailyBars('AAPL', '2026-09-01', '2026-09-03');

  assertEquals(bars.map((b) => b.date), ['2026-09-01', '2026-09-02', '2026-09-03']);
  // Two requests; the second carries the page token from the first response.
  assertEquals(urls.length, 2);
  assertEquals(urls[1].includes('page_token=PAGE2'), true);
});

Deno.test('returns an empty array for a symbol with no data (never throws)', async () => {
  const { fetch } = sequenceFetch([barsNoData]);
  const provider = providerWith(fetch);
  assertEquals(await provider.getDailyBars('AAPL', '2026-09-01', '2026-09-03'), []);
});

Deno.test('reads only the requested symbol key, ignoring others', async () => {
  const { fetch } = sequenceFetch([barsExtraSymbol]);
  const provider = providerWith(fetch);
  const bars = await provider.getDailyBars('AAPL', '2026-09-01', '2026-09-01');
  assertEquals(bars.length, 1);
  assertEquals(bars[0].close, 325.25); // AAPL, not MSFT (503.0)
});

Deno.test('retries a 429 then succeeds', async () => {
  let calls = 0;
  const fetch: FetchLike = () => {
    calls += 1;
    if (calls === 1) {
      return Promise.resolve(new Response('rate limited', { status: 429 }));
    }
    return Promise.resolve(new Response(JSON.stringify(barsOnePage), { status: 200 }));
  };
  const provider = providerWith(fetch);
  const bars = await provider.getDailyBars('AAPL', '2026-09-01', '2026-09-03');
  assertEquals(calls, 2);
  assertEquals(bars.length, 3);
});

Deno.test('throws after exhausting retries on a persistent error', async () => {
  const fetch: FetchLike = () => Promise.resolve(new Response('boom', { status: 500 }));
  const provider = new AlpacaProvider({
    keyId: 'PKTEST',
    secretKey: 'secret',
    fetchImpl: fetch,
    minRequestIntervalMs: 0,
    backoffBaseMs: 0,
    maxRetries: 2,
  });
  await assertRejects(() => provider.getDailyBars('AAPL', '2026-09-01', '2026-09-03'), Error, 'Alpaca request failed: 500');
});

Deno.test('getSnapshots is not supported (quotes come from Finnhub)', async () => {
  const { fetch } = sequenceFetch([barsNoData]);
  const provider = providerWith(fetch);
  await assertRejects(() => provider.getSnapshots(['AAPL']), Error, 'not used');
});

Deno.test('sends the Alpaca auth headers', async () => {
  const seen: Record<string, string>[] = [];
  const fetch: FetchLike = (_url, init) => {
    seen.push((init?.headers ?? {}) as Record<string, string>);
    return Promise.resolve(new Response(JSON.stringify(barsNoData), { status: 200 }));
  };
  const provider = providerWith(fetch);
  await provider.getDailyBars('AAPL', '2026-09-01', '2026-09-03');
  assertEquals(seen[0]['APCA-API-KEY-ID'], 'PKTEST');
  assertEquals(seen[0]['APCA-API-SECRET-KEY'], 'secret');
});
