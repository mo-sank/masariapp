/**
 * Analytics queue and flush (requirements 9.2, 9.4; Property 7).
 *
 * The app records analytics by calling {@link track}. Events are NOT sent one by
 * one; they are appended to an in-memory queue (mirrored to AsyncStorage so a
 * queued batch survives a cold start) and flushed in batches to the
 * `log_events` RPC. A flush happens when:
 *   - the queue reaches {@link FLUSH_AT_COUNT} events,
 *   - {@link FLUSH_INTERVAL_MS} elapses, or
 *   - the app goes to the background (wired up in
 *     src/features/progress/use-session-analytics.ts).
 *
 * Offline / failure handling (9.2): a failed flush (no network, RPC error)
 * leaves the events in the queue so the next flush retries them. Nothing is
 * dropped on transient failure.
 *
 * Privacy (9.4, Property 7): before an event is queued, {@link sanitizeEvent}
 *   - rejects any name NOT in the shared allowlist
 *     (src/features/progress/analytics-events.ts), and
 *   - strips disallowed prop keys (email / token / free text) so no PII or
 *     secret is ever queued or sent. The RPC enforces the same rules server-side
 *     as defense in depth.
 *
 * The core is a plain class with its dependencies injected (storage, transport,
 * clock, timer) so it can be unit tested without React, a device, or a real
 * Supabase client. The module also exports a configured singleton and a thin
 * {@link track} for the rest of the app.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

import { isAllowedEventName, type AnalyticsEventName } from '../features/progress/analytics-events';
import type { Json } from '../types/db';

/**
 * The running app's version string (e.g. "1.0.0"), attached to every event so a
 * report can be tied to a release. Read once from the Expo config; falls back to
 * 'unknown' if unavailable (e.g. in a bare test environment).
 */
const APP_VERSION: string = Constants.expoConfig?.version ?? 'unknown';

/** AsyncStorage key the queue is persisted under. Carries no PII by design. */
export const ANALYTICS_QUEUE_KEY = 'analytics_queue_v1';

/** Flush once the queue holds at least this many events. */
export const FLUSH_AT_COUNT = 20;

/** Flush at least this often while events are waiting. */
export const FLUSH_INTERVAL_MS = 30_000;

/** The `log_events` RPC accepts at most 50 events per call. */
export const MAX_BATCH = 50;

/**
 * Prop keys that must never be sent. These cover the disallowed categories from
 * requirement 9.4: no email, no token, and no free-text fields. The RPC strips
 * the same keys server-side.
 */
export const DISALLOWED_PROP_KEYS: readonly string[] = ['email', 'token', 'text'];

/** JSON-serializable prop values an event may carry. */
export type PropValue = string | number | boolean | null;

/** The event shape stored in the queue and sent to the RPC. */
export interface QueuedEvent {
  name: AnalyticsEventName;
  props: Record<string, PropValue>;
  session_id?: string;
  app_version?: string;
  /** ISO-8601 timestamp of when the event occurred on the client. */
  client_ts: string;
}

/** What a caller passes to {@link track}; most fields are optional. */
export interface TrackInput {
  session_id?: string;
  app_version?: string;
  props?: Record<string, PropValue>;
}

/** Dependencies injected into {@link AnalyticsQueue} for testability. */
export interface AnalyticsDeps {
  /** Persist the queue (debounced writes are fine). */
  save: (events: QueuedEvent[]) => Promise<void>;
  /** Load any persisted queue at startup. */
  load: () => Promise<QueuedEvent[]>;
  /** Send a batch to the backend; resolves on success, rejects on failure. */
  send: (events: QueuedEvent[]) => Promise<void>;
  /** Current time in ms (injectable so tests control it). */
  now: () => number;
}

/**
 * Sanitize a raw track call into a {@link QueuedEvent}, or return `null` when the
 * event must be dropped (name not in the allowlist). Disallowed prop keys are
 * removed rather than causing a drop, so a mostly-fine event still gets through
 * without its sensitive fields. Exported for unit testing (Property 7).
 */
export function sanitizeEvent(name: string, input: TrackInput, nowIso: string): QueuedEvent | null {
  // Name allowlist: anything outside the shared list is dropped before queueing.
  if (!isAllowedEventName(name)) {
    return null;
  }

  const rawProps = input.props ?? {};
  const props: Record<string, PropValue> = {};
  const denied = new Set(DISALLOWED_PROP_KEYS);
  for (const [key, value] of Object.entries(rawProps)) {
    if (denied.has(key)) {
      continue; // strip email / token / free text
    }
    props[key] = value;
  }

  return {
    name,
    props,
    session_id: input.session_id,
    app_version: input.app_version,
    client_ts: nowIso,
  };
}

/**
 * The batching queue. Holds pending events in memory, mirrors them to storage,
 * and flushes them to the transport. A single in-flight flush is enforced so two
 * triggers (count + timer) cannot double-send the same events.
 */
export class AnalyticsQueue {
  private queue: QueuedEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private loaded = false;

  constructor(private readonly deps: AnalyticsDeps) {}

  /**
   * Load any persisted queue once at startup. Safe to call more than once; only
   * the first call reads storage. Keeps previously queued (unsent) events across
   * a cold start so they are retried.
   */
  async hydrate(): Promise<void> {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    try {
      const saved = await this.deps.load();
      // Prepend persisted events so they flush before anything queued since.
      this.queue = [...saved, ...this.queue];
    } catch {
      // A corrupt/absent store is not fatal; start with whatever is in memory.
    }
  }

  /** Number of events currently waiting to be sent (for tests/diagnostics). */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Queue an event. Drops it silently when the name is not allowlisted; strips
   * disallowed prop keys otherwise. Triggers an immediate flush once the queue
   * reaches {@link FLUSH_AT_COUNT}.
   */
  async track(name: string, input: TrackInput = {}): Promise<void> {
    const event = sanitizeEvent(name, input, new Date(this.deps.now()).toISOString());
    if (!event) {
      return;
    }
    this.queue.push(event);
    await this.persist();
    if (this.queue.length >= FLUSH_AT_COUNT) {
      await this.flush();
    }
  }

  /** Start the periodic flush timer. Idempotent. */
  start(): void {
    if (this.timer != null) {
      return;
    }
    this.timer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  /** Stop the periodic flush timer. */
  stop(): void {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Flush up to {@link MAX_BATCH} events to the transport. On success the sent
   * events are removed from the queue and persisted; on failure the queue is
   * left intact so the batch is retried on the next trigger (offline-safe).
   * Only one flush runs at a time.
   */
  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) {
      return;
    }
    this.flushing = true;
    try {
      const batch = this.queue.slice(0, MAX_BATCH);
      await this.deps.send(batch);
      // Success: drop exactly the events we sent (the queue may have grown).
      this.queue = this.queue.slice(batch.length);
      await this.persist();
    } catch {
      // Keep the events queued; the next flush retries them (requirement 9.2).
    } finally {
      this.flushing = false;
    }
  }

  private async persist(): Promise<void> {
    try {
      await this.deps.save(this.queue);
    } catch {
      // Persistence is best-effort; the in-memory queue is still authoritative.
    }
  }
}

// --- Configured singleton for app use ---------------------------------------

async function loadFromStorage(): Promise<QueuedEvent[]> {
  const raw = await AsyncStorage.getItem(ANALYTICS_QUEUE_KEY);
  if (!raw) {
    return [];
  }
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as QueuedEvent[]) : [];
}

async function saveToStorage(events: QueuedEvent[]): Promise<void> {
  if (events.length === 0) {
    await AsyncStorage.removeItem(ANALYTICS_QUEUE_KEY);
    return;
  }
  await AsyncStorage.setItem(ANALYTICS_QUEUE_KEY, JSON.stringify(events));
}

async function sendViaRpc(events: QueuedEvent[]): Promise<void> {
  // Imported lazily so unit tests of the pure queue never pull in the Supabase
  // client (which constructs itself at import time and reads config).
  const { supabase } = await import('./supabase');
  const { error } = await supabase.rpc('log_events', {
    p_events: events as unknown as Json,
  });
  if (error) {
    throw error;
  }
}

/** The app-wide analytics queue. Use {@link track} rather than this directly. */
export const analytics = new AnalyticsQueue({
  save: saveToStorage,
  load: loadFromStorage,
  send: sendViaRpc,
  now: () => Date.now(),
});

/**
 * The current app-session id, attached to every tracked event so a run's events
 * can be grouped without identifying the user. Set once at startup by
 * {@link setSessionId}; `undefined` until then (early events simply omit it).
 */
let currentSessionId: string | undefined;

/** Set the ephemeral per-run session id attached to subsequent events. */
export function setSessionId(sessionId: string | undefined): void {
  currentSessionId = sessionId;
}

/**
 * Record an analytics event. Thin wrapper over the singleton so callers import a
 * single function. The current session id and the app version are attached
 * automatically (callers may still override via `input`). Fire-and-forget: it
 * never throws, so a logging failure cannot break a user flow.
 */
export function track(name: AnalyticsEventName, input: TrackInput = {}): void {
  const enriched: TrackInput = {
    session_id: input.session_id ?? currentSessionId,
    app_version: input.app_version ?? APP_VERSION,
    props: input.props,
  };
  void analytics.track(name, enriched).catch(() => {
    // Analytics must never surface an error to the UI.
  });
}
