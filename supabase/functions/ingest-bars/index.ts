// ingest-bars Edge Function (requirements 3.1, 3.2; shared cron auth 2.4).
//
// Two triggers:
//   * pg_cron nightly (weeknights) POSTs {"mode":"nightly"} to append the latest
//     daily bar for every active instrument (requirement 3.2).
//   * A deployer POSTs {"mode":"backfill","years":5} once per project to load up
//     to 5 years of history (requirement 3.1). The backfill is resumable: if it
//     is interrupted (timeout, rate limit, crash), re-POSTing the same body
//     continues from where it left off, skipping symbols already loaded for that
//     window.
//
// Like ingest-quotes, the caller is cron / a deployer script, not a signed-in
// user, so there is no Supabase JWT. The function sets `verify_jwt = false` in
// supabase/config.toml and authenticates with the shared `x-cron-secret` header
// (value stored in Supabase Vault), per docs/db-and-api-reference.md section 7.
//
// Logic lives in ./ingest.ts so it is unit-testable without a live stack.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@^2';

import { getProvider } from '../_shared/providers/index.ts';
import type { QuoteProvider } from '../_shared/providers/types.ts';
import {
  IngestBarsRequestError,
  parseRequest,
  runIngestBars,
  type IngestBarsResult,
  type Logger,
  type QuoteBarRow,
} from './ingest.ts';

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-cron-secret',
};

/** console-backed logger; structured data is JSON-stringified for log search. */
const consoleLogger: Logger = {
  info: (message, data) => console.log(message, data ? JSON.stringify(data) : ''),
  warn: (message, data) => console.warn(message, data ? JSON.stringify(data) : ''),
  error: (message, data) => console.error(message, data ? JSON.stringify(data) : ''),
};

/** Build a service-role Supabase client that bypasses RLS to upsert bars. */
function serviceRoleClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? readDefaultSecretKey();
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or service-role key in the environment');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Parse SUPABASE_SECRET_KEYS (JSON map) and return the default secret, if any. */
function readDefaultSecretKey(): string | undefined {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (!raw) return undefined;
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    return map['default'];
  } catch {
    return undefined;
  }
}

/**
 * Constant-time-ish comparison of the presented cron secret against the
 * expected one. Matches the ingest-quotes implementation.
 */
function secretMatches(expected: string, presented: string | null): boolean {
  if (!presented) return false;
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(presented);
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/** Read and parse the JSON request body, tolerating an empty body (nightly). */
async function readBody(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new IngestBarsRequestError('request body is not valid JSON');
  }
}

export default {
  fetch: async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (req.method !== 'POST') {
      return json(405, { error: 'method_not_allowed' });
    }

    // 1. Authenticate the cron / deployer caller (requirement 2.4).
    const expectedSecret = Deno.env.get('CRON_SECRET');
    if (!expectedSecret) {
      consoleLogger.error('ingest-bars is missing CRON_SECRET');
      return json(500, { error: 'server_misconfigured' });
    }
    const presented = req.headers.get('x-cron-secret');
    if (!secretMatches(expectedSecret, presented)) {
      return json(401, { error: 'unauthorized' });
    }

    // 2. Parse the mode/years from the body (defaults to nightly).
    let request;
    try {
      request = parseRequest(await readBody(req));
    } catch (err) {
      if (err instanceof IngestBarsRequestError) {
        return json(400, { error: 'bad_request', message: err.message });
      }
      throw err;
    }

    // 3. Wire real dependencies.
    let supabase: SupabaseClient;
    let provider: QuoteProvider;
    try {
      supabase = serviceRoleClient();
      provider = getProvider();
    } catch (err) {
      consoleLogger.error('ingest-bars configuration error', {
        error: err instanceof Error ? err.message : String(err),
      });
      return json(500, { error: 'server_misconfigured' });
    }

    // 4. Run the cycle.
    let result: IngestBarsResult;
    try {
      result = await runIngestBars(request, {
        provider,
        listActiveSymbols: () => listActiveSymbols(supabase),
        upsertBars: (rows: QuoteBarRow[]) => upsertBars(supabase, rows),
        listCompletedSymbols: (windowKey: string) => listCompletedSymbols(supabase, windowKey),
        markSymbolComplete: (windowKey, symbol, barsWritten) =>
          markSymbolComplete(supabase, windowKey, symbol, barsWritten),
        logger: consoleLogger,
        now: () => new Date(),
      });
    } catch (err) {
      consoleLogger.error('ingest-bars run failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return json(500, { error: 'ingest_failed' });
    }

    return json(200, result);
  },
};

/** Select active instrument symbols (instruments.is_active = true). */
async function listActiveSymbols(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from('instruments').select('symbol').eq('is_active', true);
  if (error) {
    throw new Error(`listActiveSymbols failed: ${error.message}`);
  }
  return (data ?? []).map((row: { symbol: string }) => row.symbol);
}

/** Upsert bar rows on the (symbol, bar_date) primary key. */
async function upsertBars(supabase: SupabaseClient, rows: QuoteBarRow[]): Promise<void> {
  const { error } = await supabase.from('quote_bars').upsert(rows, { onConflict: 'symbol,bar_date' });
  if (error) {
    throw new Error(`upsertBars failed: ${error.message}`);
  }
}

/** Symbols already completed for a backfill window (resume support). */
async function listCompletedSymbols(supabase: SupabaseClient, windowKey: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('ingest_bars_progress')
    .select('symbol')
    .eq('window_key', windowKey);
  if (error) {
    throw new Error(`listCompletedSymbols failed: ${error.message}`);
  }
  return (data ?? []).map((row: { symbol: string }) => row.symbol);
}

/** Record that a symbol finished its backfill for a window (resume support). */
async function markSymbolComplete(
  supabase: SupabaseClient,
  windowKey: string,
  symbol: string,
  barsWritten: number,
): Promise<void> {
  const { error } = await supabase
    .from('ingest_bars_progress')
    .upsert(
      { window_key: windowKey, symbol, bars_written: barsWritten, completed_at: new Date().toISOString() },
      { onConflict: 'window_key,symbol' },
    );
  if (error) {
    throw new Error(`markSymbolComplete failed: ${error.message}`);
  }
}

/** Build a JSON response with the shared CORS headers. */
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}
