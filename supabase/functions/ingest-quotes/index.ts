// ingest-quotes Edge Function (requirements 2.1, 2.2, 2.3, 2.4, 2.6).
//
// Triggered by pg_cron every 5 minutes on weekdays (see
// docs/db-and-api-reference.md section 5.5). pg_net POSTs to this function with
// an `x-cron-secret` header whose value is read from Supabase Vault. Because the
// caller is cron (not a signed-in user) there is no Supabase JWT, so this
// function sets `verify_jwt = false` in supabase/config.toml and authenticates
// with the shared cron secret itself (requirement 2.4).
//
// Responsibilities (delegated to ./ingest.ts so the logic is unit-testable):
//   1. Reject the request with 401 unless x-cron-secret matches CRON_SECRET.
//   2. Skip (200 {skipped:true}) only when the market is fully closed (overnight
//      / weekend / holiday); otherwise ingest during the regular AND extended
//      (pre/after-hours) sessions. Never calls the provider when skipping.
//   3. Fetch snapshots for all active instruments via the configured provider,
//      convert dollars to integer cents once, and upsert into public.quotes.
//   4. Keep last-known-good rows on failure; never write a zero/null price.
//
// Imports use `npm:` specifiers at pinned versions and the function uses the
// `export default { fetch }` handler contract, per supabase/functions/README.md.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@^2';

import { getProvider } from '../_shared/providers/index.ts';
import type { QuoteProvider } from '../_shared/providers/types.ts';
import { runIngest, type IngestResult, type Logger, type MarketSession, type QuoteRow } from './ingest.ts';

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

/** Build a service-role Supabase client that bypasses RLS to upsert quotes. */
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
 * expected one. We avoid an early-return length check leaking the secret length
 * by comparing over the max length; the inputs are short so cost is negligible.
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

export default {
  fetch: async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (req.method !== 'POST') {
      return json(405, { error: 'method_not_allowed' });
    }

    // 1. Authenticate the cron caller (requirement 2.4).
    const expectedSecret = Deno.env.get('CRON_SECRET');
    if (!expectedSecret) {
      consoleLogger.error('ingest-quotes is missing CRON_SECRET');
      return json(500, { error: 'server_misconfigured' });
    }
    const presented = req.headers.get('x-cron-secret');
    if (!secretMatches(expectedSecret, presented)) {
      return json(401, { error: 'unauthorized' });
    }

    // 2-4. Wire real dependencies and run the ingest cycle.
    let supabase: SupabaseClient;
    let provider: QuoteProvider;
    try {
      supabase = serviceRoleClient();
      provider = getProvider();
    } catch (err) {
      consoleLogger.error('ingest-quotes configuration error', {
        error: err instanceof Error ? err.message : String(err),
      });
      return json(500, { error: 'server_misconfigured' });
    }

    let result: IngestResult;
    try {
      result = await runIngest({
        provider,
        marketSession: (at: Date) => marketSession(supabase, at),
        listActiveSymbols: () => listActiveSymbols(supabase),
        upsertQuotes: (rows: QuoteRow[]) => upsertQuotes(supabase, rows),
        logger: consoleLogger,
        now: () => new Date(),
      });
    } catch (err) {
      consoleLogger.error('ingest-quotes run failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return json(500, { error: 'ingest_failed' });
    }

    return json(200, result);
  },
};

/** Call the public.market_session(timestamptz) DB function. */
async function marketSession(supabase: SupabaseClient, at: Date): Promise<MarketSession> {
  const { data, error } = await supabase.rpc('market_session', { p_at: at.toISOString() });
  if (error) {
    throw new Error(`market_session failed: ${error.message}`);
  }
  // Defensive: an unexpected value is treated as 'closed' so we never ingest on
  // a bad classification.
  return data === 'regular' || data === 'extended' ? data : 'closed';
}

/** Select active instrument symbols (instruments.is_active = true). */
async function listActiveSymbols(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from('instruments').select('symbol').eq('is_active', true);
  if (error) {
    throw new Error(`listActiveSymbols failed: ${error.message}`);
  }
  return (data ?? []).map((row: { symbol: string }) => row.symbol);
}

/** Upsert quote rows on the (symbol) primary key. */
async function upsertQuotes(supabase: SupabaseClient, rows: QuoteRow[]): Promise<void> {
  const { error } = await supabase.from('quotes').upsert(rows, { onConflict: 'symbol' });
  if (error) {
    throw new Error(`upsertQuotes failed: ${error.message}`);
  }
}

/** Build a JSON response with the shared CORS headers. */
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}
