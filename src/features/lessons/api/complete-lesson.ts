/**
 * complete_lesson RPC wrapper and result model (requirements 5.2, 5.4, 5.6).
 *
 * The lesson player calls this when a run ends. It wraps the Supabase
 * `complete_lesson` RPC (supabase/migrations/20250104000003_complete_lesson_rpc.sql,
 * docs/db-and-api-reference.md section 5.3), which runs SECURITY DEFINER, derives
 * the user from the verified session, logs the attempt, and — on a pass — awards
 * XP (first completion only), advances the streak, and grants feature unlocks.
 * The client never passes a user id, matching the `create_profile` convention in
 * src/features/auth/api/create-profile.ts.
 *
 * The RPC returns a loosely-typed `jsonb` object with two shapes:
 *   - below the pass score: `{ passed: false, xp_awarded: 0, unlocked: [] }`
 *   - at/above the pass score:
 *     `{ passed: true, first_completion, xp_awarded, streak, streak_freezes, unlocked[] }`
 * This module narrows that into the typed {@link CompletionResult} union so the
 * results and retry screens can branch on `passed` with full type safety instead
 * of poking at raw JSON. On a replay (`first_completion === false`) XP is 0 and
 * `unlocked` is empty (requirement 5.6); the parsed shape carries that through
 * unchanged.
 *
 * The server calls are safe to repeat (XP/unlocks are gated on first completion),
 * which is what lets the offline queue (src/features/lessons/completion-queue.ts)
 * retry a persisted completion without risking double-awarding.
 *
 * Pure parsing + a single RPC call. The Supabase client is imported lazily
 * inside {@link completeLesson} (as the analytics module does) so unit tests of
 * `parseCompletionResult` never pull in the native-backed client at import time.
 */
import type { Json } from '../../../types/db';

/** The payload sent to the RPC. Mirrors the lesson player's completion event. */
export interface CompleteLessonInput {
  lessonId: string;
  /** The lesson score, 0-100. */
  scorePct: number;
  /** The run's actual duration in milliseconds (requirement 3.5). */
  durationMs: number;
  /** Per-item answers used to build the `p_answers` payload (concept + correct). */
  answers: CompletionAnswer[];
}

/**
 * A single per-item answer in the completion payload. Derived from the scored
 * `perItem` breakdown — concept and correctness are what the server records and
 * what the Rewind queue needs — so no free-text or option content is sent.
 */
export interface CompletionAnswer {
  stepId: string;
  concept: string | undefined;
  correct: boolean;
}

/** A passing completion result (score met the pass threshold). */
export interface CompletionPassed {
  passed: true;
  /** True only the first time this lesson is completed; false on a replay. */
  firstCompletion: boolean;
  /** XP awarded by this completion. 0 on a replay (requirement 5.6). */
  xpAwarded: number;
  /** The learner's current streak after this completion. */
  streak: number;
  /** Streak Freezes the learner holds after this completion. */
  streakFreezes: number;
  /** Feature keys newly unlocked by this completion (empty on a replay). */
  unlocked: string[];
}

/** A sub-pass completion result (score below the pass threshold). */
export interface CompletionFailed {
  passed: false;
  /** Always 0 below the pass score. */
  xpAwarded: 0;
  /** Always empty below the pass score. */
  unlocked: [];
}

/** The narrowed result of a completion call. Branch on `passed`. */
export type CompletionResult = CompletionPassed | CompletionFailed;

/** Read a numeric field from the raw RPC object, defaulting to 0. */
function num(obj: Record<string, unknown>, key: string): number {
  const value = obj[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Read the `unlocked` string array from the raw RPC object (defensively). */
function unlockedArray(obj: Record<string, unknown>): string[] {
  const value = obj['unlocked'];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((v): v is string => typeof v === 'string');
}

/**
 * Narrow the RPC's raw `jsonb` result into a typed {@link CompletionResult}.
 *
 * Treats a missing/false `passed` as the sub-pass shape and anything else as a
 * pass, reading each field defensively so a slightly-off server response can
 * never throw in the UI. Exported for unit testing.
 */
export function parseCompletionResult(raw: unknown): CompletionResult {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  if (obj['passed'] !== true) {
    return { passed: false, xpAwarded: 0, unlocked: [] };
  }

  return {
    passed: true,
    firstCompletion: obj['first_completion'] === true,
    xpAwarded: num(obj, 'xp_awarded'),
    streak: num(obj, 'streak'),
    streakFreezes: num(obj, 'streak_freezes'),
    unlocked: unlockedArray(obj),
  };
}

/**
 * Call the `complete_lesson` RPC and return the parsed, typed result.
 *
 * Throws the raw supabase error on failure (offline, RPC error) so the caller —
 * the mutation / offline queue — can decide to persist and retry. Because the
 * RPC is idempotent for XP and unlocks, a retried call is safe.
 */
export async function completeLesson(input: CompleteLessonInput): Promise<CompletionResult> {
  // Imported lazily so unit tests of the pure parser never pull in the Supabase
  // client (which constructs itself at import time and reads config/native deps).
  const { supabase } = await import('../../../lib/supabase');
  const { data, error } = await supabase.rpc('complete_lesson', {
    p_lesson_id: input.lessonId,
    p_score: input.scorePct,
    p_duration_ms: input.durationMs,
    p_answers: input.answers as unknown as Json,
  });

  if (error) {
    throw error;
  }

  return parseCompletionResult(data);
}
