// Core logic for the ingest-quotes Edge Function, separated from the HTTP
// wrapper (index.ts) so it can be unit-tested without a live Supabase stack or
// a real market-data provider. Everything the core touches — the provider, the
// market-open check, the active-symbol list, the upsert, the logger, and the
// clock — is injected via `IngestDeps`.
//
// Requirements covered here (docs/db-and-api-reference.md section 7, requirements
// 2.1, 2.2, 2.3, 2.6):
//   2.1 On a scheduled run during market hours (or within 25 minutes after
//       close) fetch snapshots for all active instruments and upsert quotes in
//       integer cents.
//   2.2 When the market is fully closed (overnight / weekend / holiday) exit
//       without calling the provider. (Extended: we also ingest during the
//       pre-market and after-hours sessions, not just the regular session.)
//   2.3 On provider failure or partial data, keep the last-known-good rows, log
//       the failure, and never write a zero or null price.
//   2.6 Each written row records as_of, is_delayed, and source.
//
// The x-cron-secret check (2.4) and verify_jwt = false live in the HTTP wrapper
// and config.toml respectively.
import type { ProviderQuote, QuoteProvider } from '../_shared/providers/types.ts';
import { CentsConversionError, optionalDollarsToCents, positiveDollarsToCents } from '../_shared/providers/cents.ts';

/** US market session at an instant, as classified by public.market_session. */
export type MarketSession = 'regular' | 'extended' | 'closed';

/** A row ready to upsert into public.quotes. Money is already integer cents. */
export interface QuoteRow {
  symbol: string;
  price_cents: number;
  prev_close_cents: number | null;
  open_cents: number | null;
  high_cents: number | null;
  low_cents: number | null;
  volume: number | null;
  as_of: string; // provider timestamp (ISO 8601)
  is_delayed: boolean;
  source: string;
  updated_at: string; // when we wrote the row (ISO 8601)
}

/** Minimal structured logger; the wrapper passes one backed by console. */
export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/** Everything the core needs, injected so tests can supply fakes. */
export interface IngestDeps {
  /** The configured market-data provider (from getProvider()). */
  provider: QuoteProvider;
  /**
   * The market session at the given instant (public.market_session):
   * 'regular' | 'extended' | 'closed'. The ingest runs during 'regular' and
   * 'extended' and skips only when 'closed'.
   */
  marketSession(at: Date): Promise<MarketSession>;
  /** Active instrument symbols to refresh (instruments.is_active = true). */
  listActiveSymbols(): Promise<string[]>;
  /**
   * Upsert the given rows into public.quotes (on conflict (symbol) do update).
   * Only ever called with validated, positive-price rows, so it never writes a
   * zero or null price (requirement 2.3).
   */
  upsertQuotes(rows: QuoteRow[]): Promise<void>;
  logger: Logger;
  /** Clock, injectable for deterministic tests. Defaults to Date in the wrapper. */
  now(): Date;
}

/** Outcome of a run, returned to the HTTP wrapper and used as the JSON body. */
export interface IngestResult {
  /** True when the run exited early because the market was closed. */
  skipped: boolean;
  /** Reason for a skip (only set when skipped is true). */
  reason?: 'market_closed';
  /** Number of active symbols requested from the provider. */
  requested: number;
  /** Number of provider quotes received (before validation). */
  received: number;
  /** Number of rows upserted (valid, positive price). */
  upserted: number;
  /** Symbols that were requested but produced no written row. */
  missing: string[];
  /** The market session this run observed ('regular' | 'extended' | 'closed'). */
  session?: MarketSession;
}

/** 25-minute closing window (requirement 2.1) so the final close is captured. */
const CLOSING_WINDOW_MS = 25 * 60 * 1000;

/**
 * Run one ingest cycle. Pure with respect to its injected dependencies.
 *
 * Steps:
 *   1. Skip unless the market is open now OR was open 25 minutes ago (the
 *      closing window). When skipping, the provider is NEVER called (2.2).
 *   2. List active symbols; if none, return a no-op success.
 *   3. Ask the provider for snapshots. A provider throw is caught: we keep the
 *      last-known-good rows and return without writing (2.3).
 *   4. Map each snapshot to a validated QuoteRow (dollars -> integer cents once;
 *      a non-positive or malformed price is dropped, not written) and upsert.
 *   5. Log any shortfall (requested symbols with no written row) and return
 *      counts.
 */
export async function runIngest(deps: IngestDeps): Promise<IngestResult> {
  const now = deps.now();
  const windowStart = new Date(now.getTime() - CLOSING_WINDOW_MS);

  // 1. Session gate. We ingest during the regular AND extended (pre/after-hours)
  // sessions. We check both `now` and `now - 25 min` so a run fired just after a
  // session boundary still captures the final print; a run only skips when BOTH
  // instants are fully closed (overnight / weekend / holiday) — then the
  // provider is never called (requirement 2.2).
  const [sessionNow, sessionInWindow] = await Promise.all([
    deps.marketSession(now),
    deps.marketSession(windowStart),
  ]);
  const activeSession: MarketSession =
    sessionNow !== 'closed' ? sessionNow : sessionInWindow !== 'closed' ? sessionInWindow : 'closed';
  if (activeSession === 'closed') {
    deps.logger.info('ingest-quotes skipped: market fully closed (overnight/weekend/holiday)');
    return {
      skipped: true,
      reason: 'market_closed',
      requested: 0,
      received: 0,
      upserted: 0,
      missing: [],
      session: 'closed',
    };
  }

  // 2. Which instruments to refresh.
  const symbols = await deps.listActiveSymbols();
  if (symbols.length === 0) {
    deps.logger.warn('ingest-quotes found no active instruments');
    return { skipped: false, requested: 0, received: 0, upserted: 0, missing: [], session: activeSession };
  }

  // 3. Fetch snapshots. If the whole call fails (timeout / persistent rate
  // limit), keep every last-known-good row by writing nothing (requirement
  // 2.3). The provider itself already drops individual bad symbols.
  let snapshots: ProviderQuote[];
  try {
    snapshots = await deps.provider.getSnapshots(symbols);
  } catch (err) {
    deps.logger.error('ingest-quotes provider call failed; keeping last-known-good', {
      error: err instanceof Error ? err.message : String(err),
      requested: symbols.length,
    });
    return { skipped: false, requested: symbols.length, received: 0, upserted: 0, missing: symbols, session: activeSession };
  }

  // 4. Validate + convert to integer cents, exactly once, at this boundary.
  const writtenAt = now.toISOString();
  const rows: QuoteRow[] = [];
  for (const quote of snapshots) {
    const row = toQuoteRow(quote, deps.provider.name, writtenAt, deps.logger, activeSession);
    if (row) rows.push(row);
  }

  if (rows.length > 0) {
    await deps.upsertQuotes(rows);
  }

  // 5. Report the shortfall: any requested symbol that produced no written row
  // keeps its previous quote. This is expected for halted / unknown symbols and
  // is logged (not an error) so a full trading day can be reviewed later.
  const writtenSymbols = new Set(rows.map((r) => r.symbol));
  const requestedSet = new Set(symbols.map((s) => s.trim().toUpperCase()));
  const missing = [...requestedSet].filter((s) => !writtenSymbols.has(s)).sort();
  if (missing.length > 0) {
    deps.logger.warn('ingest-quotes kept last-known-good for symbols with no fresh quote', {
      missing,
      requested: symbols.length,
      written: rows.length,
    });
  }

  deps.logger.info('ingest-quotes complete', {
    requested: symbols.length,
    received: snapshots.length,
    upserted: rows.length,
  });

  return {
    skipped: false,
    requested: symbols.length,
    received: snapshots.length,
    upserted: rows.length,
    missing,
    session: activeSession,
  };
}

/**
 * Map a provider snapshot to a validated quote row, converting dollars to
 * integer cents exactly once. Returns null (and logs) when the primary price is
 * missing, non-positive, or otherwise unconvertible, so a bad quote is dropped
 * and the previous row is kept (requirement 2.3) rather than overwritten with a
 * zero or null price.
 *
 * The row records as_of (provider timestamp), is_delayed (true — all quotes
 * here are delayed, never real-time), and source. The source is suffixed with
 * the session (e.g. "finnhub+alpaca:extended") so the client can label a price
 * as regular / pre- or after-hours honestly (requirement 2.6).
 */
export function toQuoteRow(
  quote: ProviderQuote,
  source: string,
  writtenAt: string,
  logger: Logger,
  session: MarketSession = 'regular',
): QuoteRow | null {
  const symbol = quote.symbol?.trim().toUpperCase();
  if (!symbol) {
    logger.warn('ingest-quotes dropped a quote with no symbol');
    return null;
  }

  try {
    // Primary price must be strictly positive; this throws otherwise and the
    // symbol keeps its last-known-good row.
    const priceCents = positiveDollarsToCents(quote.price);

    // Optional fields convert to cents or stay null; a present-but-invalid
    // optional value still throws (caught below) so bad data is never written.
    const prevCloseCents = optionalDollarsToCents(quote.prevClose);
    const openCents = optionalDollarsToCents(quote.open);
    const highCents = optionalDollarsToCents(quote.high);
    const lowCents = optionalDollarsToCents(quote.low);
    const volume = normalizeVolume(quote.volume);

    return {
      symbol,
      price_cents: priceCents,
      prev_close_cents: prevCloseCents ?? null,
      open_cents: openCents ?? null,
      high_cents: highCents ?? null,
      low_cents: lowCents ?? null,
      volume,
      as_of: quote.asOf,
      is_delayed: true,
      // Suffix the provider name with the session so the client banner/badge can
      // distinguish a regular-hours delayed quote from a pre/after-hours one.
      source: `${source}:${session}`,
      updated_at: writtenAt,
    };
  } catch (err) {
    const reason = err instanceof CentsConversionError ? err.message : String(err);
    logger.warn('ingest-quotes dropped an invalid quote; keeping last-known-good', { symbol, reason });
    return null;
  }
}

/** Coerce a provider volume to a non-negative whole number, or null. */
function normalizeVolume(volume: number | undefined): number | null {
  if (volume === undefined || !Number.isFinite(volume) || volume < 0) {
    return null;
  }
  return Math.trunc(volume);
}
