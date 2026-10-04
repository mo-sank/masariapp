/**
 * Offline completion queue (requirement 5.5).
 *
 * When a lesson ends the app sends the result to `complete_lesson`. If the
 * device is offline or the RPC fails, the completion must NOT be lost: it is
 * appended to this queue (mirrored to AsyncStorage so it survives a cold start)
 * and retried later — when the app returns to the foreground or on the next
 * launch. This mirrors the analytics queue (src/lib/analytics.ts): a plain class
 * with its dependencies injected (storage + transport) so the core is unit
 * testable without React, a device, or a real Supabase client, plus a configured
 * singleton for app use.
 *
 * Never-lose + don't-double-submit (requirement 5.5): a failed flush leaves the
 * pending completion in the queue so the next flush retries it; a successful
 * flush removes exactly the one that succeeded. The `complete_lesson` RPC is
 * idempotent for XP and unlocks (gated on first completion), so even if a
 * completion is sent, succeeds server-side, but the app dies before recording
 * success, the retry is harmless. A single in-flight flush is enforced so two
 * triggers (foreground + launch) cannot send the same item twice.
 *
 * The queue is a fallback path: it carries just enough to replay the RPC and
 * does NOT surface a results screen (the learner has already moved on). The
 * live, online completion path is {@link useCompleteLesson}, which shows results
 * and only falls back to enqueueing on failure.
 *
 * No React/React Native imports in the core class — only the injected deps and
 * the plain input types — so it loads cleanly under Jest.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { completeLesson, type CompleteLessonInput } from './api/complete-lesson';

/** AsyncStorage key the pending-completion queue is persisted under. */
export const COMPLETION_QUEUE_KEY = 'lesson_completion_queue_v1';

/**
 * One queued completion: the RPC input plus a client-generated id used to
 * de-duplicate (so the same completion is never enqueued twice) and an enqueue
 * timestamp for ordering/diagnostics. Carries no PII — only a lesson id, a
 * score, a duration, and per-item concept/correctness.
 */
export interface QueuedCompletion extends CompleteLessonInput {
  /** Stable client id for this completion; dedupes repeated enqueues. */
  id: string;
  /** Epoch ms when the completion was first enqueued. */
  queuedAt: number;
}

/** Dependencies injected into {@link CompletionQueue} for testability. */
export interface CompletionQueueDeps {
  /** Persist the queue (best-effort). */
  save: (items: QueuedCompletion[]) => Promise<void>;
  /** Load any persisted queue at startup. */
  load: () => Promise<QueuedCompletion[]>;
  /** Send one completion to the backend; resolves on success, rejects on failure. */
  send: (item: CompleteLessonInput) => Promise<void>;
  /** Current time in ms (injectable so tests control it). */
  now: () => number;
}

/**
 * The pending-completion queue. Holds completions that could not be sent live,
 * mirrors them to storage, and flushes them to the transport one at a time. A
 * single in-flight flush is enforced so two triggers cannot double-send.
 */
export class CompletionQueue {
  private queue: QueuedCompletion[] = [];
  private flushing = false;
  private loaded = false;

  constructor(private readonly deps: CompletionQueueDeps) {}

  /**
   * Load any persisted queue once at startup. Safe to call more than once; only
   * the first call reads storage. Keeps completions queued across a cold start
   * so a result captured offline is retried on the next launch.
   */
  async hydrate(): Promise<void> {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    try {
      const saved = await this.deps.load();
      // Prepend persisted items so they flush before anything queued since.
      this.queue = [...saved, ...this.queue];
    } catch {
      // A corrupt/absent store is not fatal; start with whatever is in memory.
    }
  }

  /** Number of completions currently waiting to be sent (for tests/diagnostics). */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Enqueue a completion for later retry and persist. Idempotent per `id`: a
   * completion already in the queue is not added again (don't-double-submit).
   * Does NOT trigger a flush — the caller enqueues precisely because a live send
   * just failed; the flush fires on the next foreground/launch.
   */
  async enqueue(input: CompleteLessonInput, id?: string): Promise<void> {
    const completionId = id ?? `${input.lessonId}-${this.deps.now()}`;
    if (this.queue.some((item) => item.id === completionId)) {
      return;
    }
    this.queue.push({ ...input, id: completionId, queuedAt: this.deps.now() });
    await this.persist();
  }

  /**
   * Flush the queue, sending each pending completion in order. A send that fails
   * stops the flush and leaves that item (and the rest) queued for the next
   * attempt — nothing is dropped on a transient failure (requirement 5.5). A
   * send that succeeds removes exactly that item and persists before moving on,
   * so a crash mid-flush cannot resend an already-confirmed completion. Only one
   * flush runs at a time.
   */
  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) {
      return;
    }
    this.flushing = true;
    try {
      // Snapshot the head each iteration; the queue only shrinks from the front
      // on success, so re-reading index 0 is safe.
      while (this.queue.length > 0) {
        const item = this.queue[0];
        try {
          await this.deps.send(item);
        } catch {
          // Keep this item (and the rest) queued; retry on the next trigger.
          break;
        }
        // Success: drop exactly this item and persist before the next send.
        this.queue = this.queue.slice(1);
        await this.persist();
      }
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

async function loadFromStorage(): Promise<QueuedCompletion[]> {
  const raw = await AsyncStorage.getItem(COMPLETION_QUEUE_KEY);
  if (!raw) {
    return [];
  }
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as QueuedCompletion[]) : [];
}

async function saveToStorage(items: QueuedCompletion[]): Promise<void> {
  if (items.length === 0) {
    await AsyncStorage.removeItem(COMPLETION_QUEUE_KEY);
    return;
  }
  await AsyncStorage.setItem(COMPLETION_QUEUE_KEY, JSON.stringify(items));
}

async function sendViaRpc(item: CompleteLessonInput): Promise<void> {
  // completeLesson throws on error, which is exactly the reject the queue wants.
  await completeLesson(item);
}

/** The app-wide completion queue. Hydrate + flush it from the app shell. */
export const completionQueue = new CompletionQueue({
  save: saveToStorage,
  load: loadFromStorage,
  send: sendViaRpc,
  now: () => Date.now(),
});
