/**
 * Tunable app configuration read from the server (requirement 8.1).
 *
 * The team keeps caps and limits in the `app_config` table so they can be tuned
 * without shipping a new release. The server reads them inside its RPCs (e.g.
 * `watchlist_add` enforces `app_config.watchlist_max`,
 * `place_market_order` reads `starter_position_cap_cents` and
 * `quote_stale_minutes`); this hook is the matching client side, so the UI shows
 * the *same* numbers the server enforces rather than copies hardcoded in the
 * bundle (requirement 8.1: "the client SHALL read display values from
 * app_config").
 *
 * `app_config` is a reference table readable by any authenticated user (the
 * foundation RLS "read reference" policy), so no user id is passed — RLS and the
 * grant decide visibility, matching src/features/auth/use-profile.ts and
 * src/features/watchlist/use-watchlist.ts.
 *
 * Values are stored as JSON (`value` is `jsonb`); the numeric keys we care about
 * are stored as JSON numbers. {@link readConfigNumber} coerces a raw value to a
 * finite number and otherwise returns the caller's fallback, so a missing,
 * malformed, or not-yet-loaded config never breaks the UI — it just falls back
 * to the same safe default the server coalesces to. These fallbacks are kept in
 * sync with the server coalesce defaults in the migrations.
 */
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';
import type { Database, Json } from '../../types/db';

type AppConfigRow = Database['public']['Tables']['app_config']['Row'];

/** React Query key for the shared app_config reference data. */
export const APP_CONFIG_QUERY_KEY = ['app-config'] as const;

/**
 * Safe client-side fallbacks for the numeric config keys, matching the server's
 * coalesce defaults so the UI shows the right number even before app_config
 * loads (or if a key is ever missing). Kept in sync with the migrations:
 *   - watchlist_max: supporting_rpcs.sql (default 5)
 *   - starter_cash_cents / starter_position_cap_cents: create_profile_rpc.sql /
 *     place_market_order_rpc.sql (defaults 1_000_000 / 100_000)
 *   - quote_stale_minutes: place_market_order_rpc.sql (default 30)
 */
export const APP_CONFIG_FALLBACKS = {
  watchlist_max: 5,
  starter_cash_cents: 1_000_000,
  starter_position_cap_cents: 100_000,
  quote_stale_minutes: 30,
} as const;

/** A numeric config key the client reads for display (requirement 8.1). */
export type AppConfigNumberKey = keyof typeof APP_CONFIG_FALLBACKS;

/** A map of config key -> raw JSON value, as loaded from app_config. */
export type AppConfigMap = Readonly<Record<string, Json>>;

/**
 * Coerce a raw app_config value to a finite number, falling back when the value
 * is missing or not usable as a number. Accepts JSON numbers (how the numeric
 * keys are stored) and numeric strings (defensive, in case a value was seeded as
 * a string), and rejects anything else (null, objects, NaN, Infinity).
 */
export function readConfigNumber(
  config: AppConfigMap | undefined,
  key: AppConfigNumberKey,
): number {
  const fallback = APP_CONFIG_FALLBACKS[key];
  const raw = config?.[key];
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

/**
 * Fetch every app_config row into a `{ key: value }` map. RLS/grant limit this
 * to the readable reference rows. Throws on a real Supabase error so React Query
 * can surface it (callers fall back to {@link APP_CONFIG_FALLBACKS} meanwhile).
 */
export async function fetchAppConfig(): Promise<AppConfigMap> {
  const { data, error } = await supabase.from('app_config').select('key, value');
  if (error) {
    throw error;
  }
  const map: Record<string, Json> = {};
  for (const row of (data ?? []) as AppConfigRow[]) {
    map[row.key] = row.value;
  }
  return map;
}

export interface UseAppConfigResult {
  /** The raw config map, or undefined until the first load resolves. */
  config: AppConfigMap | undefined;
  /** True while the config is being fetched for the first time. */
  isLoading: boolean;
  /** True when the fetch failed (callers still get safe fallbacks). */
  isError: boolean;
  /**
   * Read a numeric config key with a safe fallback (requirement 8.1). Before the
   * config loads, or if the key is missing/malformed, this returns the same
   * default the server coalesces to, so the UI never shows a wrong or empty cap.
   */
  getNumber: (key: AppConfigNumberKey) => number;
}

/**
 * Query the shared app_config reference data (requirement 8.1). Enabled only
 * when signed in, so a signed-out app issues no request. The config is reference
 * data shared across the app, so it uses a generous `staleTime` and the readers
 * fall back to {@link APP_CONFIG_FALLBACKS} while it loads or on error.
 */
export function useAppConfig(enabled = true): UseAppConfigResult {
  const query = useQuery({
    queryKey: APP_CONFIG_QUERY_KEY,
    queryFn: fetchAppConfig,
    enabled,
    // Reference data that changes rarely; avoid refetching it on every mount.
    staleTime: 5 * 60 * 1000,
  });

  const config = query.data;
  return {
    config,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    getNumber: (key) => readConfigNumber(config, key),
  };
}
