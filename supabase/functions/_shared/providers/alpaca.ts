// Alpaca market-data provider — DAILY BARS only.
//
// Why this exists: the Finnhub free tier returns 403 on its daily-candle
// endpoint (historical bars are a paid feature), so charts had no data. Alpaca's
// free market-data plan DOES serve historical daily bars (IEX feed, ~15 min
// delayed), which is exactly what the stock-detail chart needs. The QuoteProvider
// interface lets us slot Alpaca in for bars without touching the ingest
// functions or the app (requirement 2.5); see ./index.ts for the split wiring
// that keeps Finnhub for quotes and uses Alpaca for bars.
//
// Endpoint (verified against https://docs.alpaca.markets/reference/stockbars and
// a live 200 response):
//   GET https://data.alpaca.markets/v2/stocks/bars
//     ?symbols=<SYM>&timeframe=1Day&start=<YYYY-MM-DD>&end=<YYYY-MM-DD>
//     &adjustment=split&feed=iex&limit=10000
//   Auth headers: APCA-API-KEY-ID, APCA-API-SECRET-KEY.
//   Response: { bars: { "<SYM>": [ { t,o,h,l,c,v,n,vw }, ... ] }, next_page_token }
//   `t` is an RFC-3339 UTC timestamp; for a daily bar the date portion is the
//   trading day. Prices are DOLLARS. start/end are inclusive and accept YYYY-MM-DD.
//   feed=iex is used because the free plan has no SIP access (sip would 403).
//
// All external JSON is validated with Zod at the boundary (tech.md convention).
// Prices stay in DOLLARS here; the single dollars->cents conversion happens
// downstream in ingest-bars via ./cents.ts.
import { z } from 'npm:zod@^3';

import type { ProviderBar, ProviderQuote, QuoteProvider } from './types.ts';

/** Minimal fetch signature so tests can inject a recorded-fixture transport. */
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<Response>;

/** Tuning knobs; defaults suit the free tier. All overridable in tests. */
export interface AlpacaOptions {
  /** Alpaca API key id (the "PK..." value). Required. */
  keyId: string;
  /** Alpaca API secret key. Required. */
  secretKey: string;
  /** Base data-API URL. Defaults to the public data host. */
  baseUrl?: string;
  /** Data feed. Free plans must use "iex"; "sip" needs a paid plan. */
  feed?: string;
  /** Injected fetch (defaults to the global). Tests pass a fixture transport. */
  fetchImpl?: FetchLike;
  /** Minimum ms between requests, to pace under the rate limit (0 in tests). */
  minRequestIntervalMs?: number;
  /** Max retries on a 429 / transient error before giving up. */
  maxRetries?: number;
  /** Base backoff in ms (doubled each retry). Set to 0 in tests. */
  backoffBaseMs?: number;
  /** Sleep function; injectable so tests do not actually wait. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_BASE_URL = 'https://data.alpaca.markets/v2';
/** Page size cap we request; Alpaca may return fewer and a next_page_token. */
const PAGE_LIMIT = 10_000;

/** One Alpaca bar. t=RFC3339 UTC; o/h/l/c dollars; v volume. Extra fields ignored. */
const barSchema = z.object({
  t: z.string(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number().optional(),
});

/** The /stocks/bars response: bars keyed by symbol, plus an optional page token. */
const barsResponseSchema = z.object({
  bars: z.record(z.string(), z.array(barSchema).nullable()).nullable().optional(),
  next_page_token: z.string().nullable().optional(),
});

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Does an HTTP status warrant a retry (rate limit or transient server error)? */
function isRetryable(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export class AlpacaProvider implements QuoteProvider {
  readonly name = 'alpaca';

  readonly #keyId: string;
  readonly #secretKey: string;
  readonly #baseUrl: string;
  readonly #feed: string;
  readonly #fetch: FetchLike;
  readonly #minIntervalMs: number;
  readonly #maxRetries: number;
  readonly #backoffBaseMs: number;
  readonly #sleep: (ms: number) => Promise<void>;
  #lastRequestAt = 0;

  constructor(opts: AlpacaOptions) {
    if (!opts.keyId || !opts.secretKey) {
      throw new Error('AlpacaProvider requires keyId and secretKey');
    }
    this.#keyId = opts.keyId;
    this.#secretKey = opts.secretKey;
    this.#baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.#feed = opts.feed ?? 'iex';
    this.#fetch = opts.fetchImpl ?? ((url, init) => fetch(url, init));
    this.#minIntervalMs = opts.minRequestIntervalMs ?? 350;
    this.#maxRetries = opts.maxRetries ?? 3;
    this.#backoffBaseMs = opts.backoffBaseMs ?? 1000;
    this.#sleep = opts.sleep ?? defaultSleep;
  }

  /**
   * Not used in this deployment: quotes come from Finnhub (see ./index.ts). The
   * method exists to satisfy QuoteProvider; calling it is a misconfiguration, so
   * it throws loudly rather than silently returning nothing.
   */
  getSnapshots(_symbols: string[]): Promise<ProviderQuote[]> {
    return Promise.reject(
      new Error('AlpacaProvider.getSnapshots is not used; quotes come from Finnhub'),
    );
  }

  /**
   * Fetch daily bars for one symbol over [from, to] (inclusive ISO dates),
   * following next_page_token until the range is exhausted. Returns bars
   * oldest-first. A symbol with no data yields an empty array (never throws for
   * "no data"). Malformed bars are dropped rather than fabricated.
   */
  async getDailyBars(symbol: string, from: string, to: string): Promise<ProviderBar[]> {
    const sym = symbol.trim().toUpperCase();
    const bars: ProviderBar[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        symbols: sym,
        timeframe: '1Day',
        start: from,
        end: to,
        adjustment: 'split',
        feed: this.#feed,
        limit: String(PAGE_LIMIT),
      });
      if (pageToken) {
        params.set('page_token', pageToken);
      }
      const url = `${this.#baseUrl}/stocks/bars?${params.toString()}`;
      const json = await this.#getJson(url);
      const parsed = barsResponseSchema.parse(json);

      const symbolBars = parsed.bars?.[sym] ?? [];
      for (const bar of symbolBars) {
        // Shape is already validated by Zod; guard finiteness defensively and
        // drop anything unusable rather than writing a bogus price downstream.
        if (
          !Number.isFinite(bar.o) ||
          !Number.isFinite(bar.h) ||
          !Number.isFinite(bar.l) ||
          !Number.isFinite(bar.c)
        ) {
          continue;
        }
        bars.push({
          date: bar.t.slice(0, 10), // RFC-3339 -> YYYY-MM-DD (the trading day)
          open: bar.o,
          high: bar.h,
          low: bar.l,
          close: bar.c,
          volume: bar.v,
        });
      }

      pageToken = parsed.next_page_token ?? undefined;
    } while (pageToken);

    // Alpaca returns ascending by timestamp already, but sort to be safe so a
    // chart can plot left-to-right regardless of page ordering.
    bars.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return bars;
  }

  /** GET JSON with the auth headers, pacing, and bounded retry/backoff. */
  async #getJson(url: string): Promise<unknown> {
    const headers = {
      'APCA-API-KEY-ID': this.#keyId,
      'APCA-API-SECRET-KEY': this.#secretKey,
    };
    let attempt = 0;
    for (;;) {
      await this.#pace();
      let res: Response;
      try {
        res = await this.#fetch(url, { headers });
      } catch (err) {
        if (attempt < this.#maxRetries) {
          await this.#backoff(attempt++);
          continue;
        }
        throw err;
      }

      if (res.ok) {
        return await res.json();
      }
      if (isRetryable(res.status) && attempt < this.#maxRetries) {
        await this.#backoff(attempt++);
        continue;
      }
      throw new Error(`Alpaca request failed: ${res.status}`);
    }
  }

  /** Wait until at least minRequestIntervalMs has passed since the last call. */
  async #pace(): Promise<void> {
    if (this.#minIntervalMs <= 0) {
      this.#lastRequestAt = Date.now();
      return;
    }
    const now = Date.now();
    const wait = this.#lastRequestAt + this.#minIntervalMs - now;
    if (wait > 0) {
      await this.#sleep(wait);
    }
    this.#lastRequestAt = Date.now();
  }

  /** Exponential backoff: base * 2^attempt. */
  async #backoff(attempt: number): Promise<void> {
    if (this.#backoffBaseMs <= 0) return;
    await this.#sleep(this.#backoffBaseMs * 2 ** attempt);
  }
}
