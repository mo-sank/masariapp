// Finnhub market-data provider (default implementation of QuoteProvider).
//
// Spike decision (see supabase/functions/_shared/providers/README.md):
// Finnhub's free tier allows 60 API calls/minute with delayed US stock quotes
// and daily candles, and its terms permit displaying delayed data in a published
// app. The ~50-symbol universe refreshed every 5 minutes needs ~50 calls per
// cycle, comfortably under 60/min. Finnhub's /quote endpoint is per-symbol
// rather than a single batch call, so `getSnapshots` fans out one request per
// symbol while pacing to stay within the limit — the QuoteProvider interface
// hides that from the ingest function, so a future swap to a true batch provider
// changes only this file (requirement 2.5).
//
// All external JSON is validated with Zod at the boundary (tech.md convention),
// then converted from dollars to integer cents exactly once via ./cents.ts.
//
// Imports use `npm:`/`jsr:` specifiers with pinned versions, per Supabase's
// current Edge Function guidance.
import { z } from 'npm:zod@^3';

import type { ProviderBar, ProviderQuote, QuoteProvider } from './types.ts';

/** Minimal fetch signature so tests can inject a recorded-fixture transport. */
export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

/** Tuning knobs; defaults suit the free tier. All overridable in tests. */
export interface FinnhubOptions {
  /** API key (Finnhub `token` query param). Required. */
  apiKey: string;
  /** Base REST URL. Defaults to the public API host. */
  baseUrl?: string;
  /** Injected fetch (defaults to the global). Tests pass a fixture transport. */
  fetchImpl?: FetchLike;
  /**
   * Minimum milliseconds between requests, to pace under the rate limit. The
   * free tier is 60/min, i.e. one call per second; the default leaves headroom.
   * Set to 0 in tests to avoid real delays.
   */
  minRequestIntervalMs?: number;
  /** Max retries on a 429 / transient error before giving up on a symbol. */
  maxRetries?: number;
  /** Base backoff in ms (doubled each retry). Set to 0 in tests. */
  backoffBaseMs?: number;
  /** Sleep function; injectable so tests do not actually wait. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_BASE_URL = 'https://finnhub.io/api/v1';

/** Finnhub /quote response. `c`=current, `pc`=prev close, `o/h/l`=OHLC, `t`=epoch secs. */
const quoteResponseSchema = z.object({
  c: z.number(), // current price
  pc: z.number().optional(), // previous close
  o: z.number().optional(), // open
  h: z.number().optional(), // high
  l: z.number().optional(), // low
  t: z.number().optional(), // UNIX timestamp (seconds)
});

/** Finnhub /stock/candle response (resolution=D). Parallel arrays; `s` is status. */
const candleResponseSchema = z.object({
  s: z.string(), // "ok" | "no_data"
  t: z.array(z.number()).optional(), // epoch seconds per bar
  o: z.array(z.number()).optional(),
  h: z.array(z.number()).optional(),
  l: z.array(z.number()).optional(),
  c: z.array(z.number()).optional(),
  v: z.array(z.number()).optional(),
});

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Does an HTTP status warrant a retry (rate limit or transient server error)? */
function isRetryable(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/** Finnhub returns UNIX seconds; the DB wants ISO 8601 UTC strings. */
function epochSecondsToIso(seconds: number | undefined): string {
  const ms = seconds && seconds > 0 ? seconds * 1000 : Date.now();
  return new Date(ms).toISOString();
}

/** Finnhub epoch seconds -> ISO date (YYYY-MM-DD) in UTC for a daily bar. */
function epochSecondsToIsoDate(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

/** ISO date (YYYY-MM-DD) -> UNIX seconds at UTC midnight, for candle range. */
function isoDateToEpochSeconds(isoDate: string): number {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(ms)) {
    throw new Error(`invalid ISO date: ${isoDate}`);
  }
  return Math.floor(ms / 1000);
}

export class FinnhubProvider implements QuoteProvider {
  readonly name = 'finnhub';

  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #minIntervalMs: number;
  readonly #maxRetries: number;
  readonly #backoffBaseMs: number;
  readonly #sleep: (ms: number) => Promise<void>;
  /** Timestamp of the last request start, for pacing. */
  #lastRequestAt = 0;

  constructor(opts: FinnhubOptions) {
    if (!opts.apiKey) {
      throw new Error('FinnhubProvider requires an apiKey');
    }
    this.#apiKey = opts.apiKey;
    this.#baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.#fetch = opts.fetchImpl ?? ((url, init) => fetch(url, init));
    this.#minIntervalMs = opts.minRequestIntervalMs ?? 1100;
    this.#maxRetries = opts.maxRetries ?? 3;
    this.#backoffBaseMs = opts.backoffBaseMs ?? 1000;
    this.#sleep = opts.sleep ?? defaultSleep;
  }

  /**
   * Fetch latest snapshots for all symbols. Fans out one /quote call per symbol,
   * paced under the rate limit. A symbol whose price is missing/invalid is
   * SKIPPED (not included in the result) so the ingest function keeps its
   * last-known-good row instead of writing bad data (requirement 2.3). A single
   * symbol's failure never aborts the batch.
   */
  async getSnapshots(symbols: string[]): Promise<ProviderQuote[]> {
    const out: ProviderQuote[] = [];
    for (const rawSymbol of symbols) {
      const symbol = rawSymbol.trim().toUpperCase();
      if (!symbol) continue;
      try {
        const quote = await this.#fetchQuote(symbol);
        if (quote) out.push(quote);
      } catch {
        // Swallow per-symbol failures: a bad or rate-limited symbol must not
        // drop the rest of the batch. The ingest function logs the shortfall by
        // comparing requested vs returned symbols.
      }
    }
    return out;
  }

  /** Fetch daily bars for one symbol over [from, to] (inclusive ISO dates). */
  async getDailyBars(symbol: string, from: string, to: string): Promise<ProviderBar[]> {
    const sym = symbol.trim().toUpperCase();
    const fromSec = isoDateToEpochSeconds(from);
    const toSec = isoDateToEpochSeconds(to) + 24 * 60 * 60 - 1; // include the `to` day
    const url =
      `${this.#baseUrl}/stock/candle?symbol=${encodeURIComponent(sym)}` +
      `&resolution=D&from=${fromSec}&to=${toSec}&token=${encodeURIComponent(this.#apiKey)}`;

    const json = await this.#getJson(url);
    const parsed = candleResponseSchema.parse(json);
    if (parsed.s !== 'ok' || !parsed.t || parsed.t.length === 0) {
      return [];
    }

    const bars: ProviderBar[] = [];
    for (let i = 0; i < parsed.t.length; i++) {
      const o = parsed.o?.[i];
      const h = parsed.h?.[i];
      const l = parsed.l?.[i];
      const c = parsed.c?.[i];
      if (o === undefined || h === undefined || l === undefined || c === undefined) {
        continue; // skip a malformed bar rather than fabricate values
      }
      bars.push({
        date: epochSecondsToIsoDate(parsed.t[i]),
        open: o,
        high: h,
        low: l,
        close: c,
        volume: parsed.v?.[i],
      });
    }
    return bars;
  }

  /** Fetch and map a single /quote. Returns null when the price is unusable. */
  async #fetchQuote(symbol: string): Promise<ProviderQuote | null> {
    const url =
      `${this.#baseUrl}/quote?symbol=${encodeURIComponent(symbol)}` +
      `&token=${encodeURIComponent(this.#apiKey)}`;
    const json = await this.#getJson(url);
    const q = quoteResponseSchema.parse(json);

    // Finnhub returns c=0 (and zeros elsewhere) for an unknown/halted symbol.
    // Treat a non-positive current price as "no data" so we never write a zero
    // price; the ingest function keeps the last-known-good row.
    if (!Number.isFinite(q.c) || q.c <= 0) {
      return null;
    }

    // ProviderQuote carries provider DOLLARS. The dollars -> integer cents
    // conversion happens exactly once downstream, at the ingest boundary
    // (./cents.ts, called by ingest-quotes), per docs section 7.1. The provider
    // only validates and normalizes shape here.
    return {
      symbol,
      price: q.c,
      prevClose: positiveOrUndefined(q.pc),
      open: positiveOrUndefined(q.o),
      high: positiveOrUndefined(q.h),
      low: positiveOrUndefined(q.l),
      asOf: epochSecondsToIso(q.t),
    };
  }

  /** GET JSON with pacing and bounded retry/backoff on rate limits. */
  async #getJson(url: string): Promise<unknown> {
    let attempt = 0;
    for (;;) {
      await this.#pace();
      let res: Response;
      try {
        res = await this.#fetch(url);
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
      throw new Error(`Finnhub request failed: ${res.status}`);
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

/**
 * Finnhub reports 0 for a field it has no value for (e.g. no session open yet).
 * Collapse a non-positive optional dollar value to `undefined` so the ingest
 * function stores NULL rather than a misleading zero for that column.
 */
function positiveOrUndefined(dollars: number | undefined): number | undefined {
  if (dollars === undefined || !Number.isFinite(dollars) || dollars <= 0) {
    return undefined;
  }
  return dollars;
}
