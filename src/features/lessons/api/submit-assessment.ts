/**
 * submit_assessment RPC wrapper and result model (requirements 6.2, 6.3, 6.4).
 *
 * The Placement Quest (L0) ends through this wrapper instead of `complete_lesson`
 * (see complete-lesson.ts). A placement assessment has no pass/fail and awards no
 * XP (requirement 6.2/6.3), so it must not flow through the scored-lesson
 * completion RPC; it records a diagnostic baseline instead. This wraps the
 * Supabase `submit_assessment` RPC
 * (supabase/migrations/20250104000004_rewind_and_assessment_rpcs.sql,
 * docs/db-and-api-reference.md section 5.4), which runs SECURITY DEFINER, derives
 * the user from the verified session, and inserts one `assessment_results` row
 * with a *server-computed* `score_pct` so the client cannot spoof a score. The
 * same mechanism records Form B later (requirement 6.4) — only the `form`
 * argument changes.
 *
 * The RPC takes `p_item_results` as an array of `{ item_id, concept, correct }`.
 * {@link buildItemResults} turns the pure scorer's `perItem` breakdown into that
 * shape, dropping any step whose `concept` is missing — every scored item in a
 * placement lesson carries a concept tag (requirement 1.3 / 6.2), so this is a
 * defensive filter, not an expected path.
 *
 * The RPC returns the inserted `assessment_results` row. {@link parseAssessmentResult}
 * narrows it to {@link AssessmentResult}, reading each field defensively so a
 * slightly-off server response can never throw in the UI. Crucially, the
 * placement results screen (requirement 6.3: no reveal) ignores the score and
 * per-item correctness — this parse exists for the server-of-record and for
 * tests, not to grade the learner on screen.
 *
 * Pure parsing + a single RPC call. The Supabase client is imported lazily
 * inside {@link submitAssessment} (as complete-lesson.ts does) so unit tests of
 * the pure helpers never pull in the native-backed client at import time.
 */
import type { PerItemResult } from '../scoring';
import type { Json } from '../../../types/db';

/** The assessment form. Form A is L0 today; Form B returns as the post-test (6.4). */
export type AssessmentForm = 'A' | 'B';

/** A single per-item result sent to the RPC ({ item_id, concept, correct }). */
export interface AssessmentItemResult {
  item_id: string;
  concept: string;
  correct: boolean;
}

/** The payload sent to {@link submitAssessment}. */
export interface SubmitAssessmentInput {
  lessonId: string;
  form: AssessmentForm;
  itemResults: AssessmentItemResult[];
}

/**
 * The narrowed `assessment_results` row returned by the RPC. The score is
 * server-computed; it is stored for the learning-gain evaluation, not shown to
 * the learner (requirement 6.3).
 */
export interface AssessmentResult {
  lessonId: string;
  form: AssessmentForm;
  /** Server-computed score, 0-100. Not revealed to the learner (6.3). */
  scorePct: number;
}

/**
 * Build the RPC's `p_item_results` array from the pure scorer's per-item
 * breakdown. Only items with a concept tag are included — scored placement items
 * always have one (requirement 1.3) — so the server records concept correctness
 * for every question (requirement 6.2). Exported for unit testing.
 */
export function buildItemResults(perItem: readonly PerItemResult[]): AssessmentItemResult[] {
  return perItem
    .filter((item): item is PerItemResult & { concept: string } => item.concept != null)
    .map((item) => ({
      item_id: item.stepId,
      concept: item.concept,
      correct: item.correct,
    }));
}

/** Read a numeric field from the raw RPC row, defaulting to 0. */
function num(obj: Record<string, unknown>, key: string): number {
  const value = obj[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  // score_pct is numeric(5,2); supabase may surface it as a string.
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Narrow the raw `assessment_results` row into a typed {@link AssessmentResult}.
 * Reads fields defensively and falls back to the request's lesson id / form when
 * the row omits them, so the no-reveal results screen always has what it needs.
 * Exported for unit testing.
 */
export function parseAssessmentResult(raw: unknown, input: SubmitAssessmentInput): AssessmentResult {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const form = obj['form'] === 'A' || obj['form'] === 'B' ? obj['form'] : input.form;
  const lessonId = typeof obj['lesson_id'] === 'string' ? obj['lesson_id'] : input.lessonId;
  return {
    lessonId,
    form,
    scorePct: num(obj, 'score_pct'),
  };
}

/**
 * Call the `submit_assessment` RPC and return the parsed result.
 *
 * Throws the raw supabase error on failure (offline, RPC error) so the caller
 * can surface a friendly message. Unlike `complete_lesson`, there is no offline
 * queue here: a placement baseline is a one-time diagnostic, not progress the
 * learner would lose track of, and re-submitting would insert a second row. The
 * caller lets the learner continue to the path either way (requirement 6.4's
 * record is best-effort).
 */
export async function submitAssessment(input: SubmitAssessmentInput): Promise<AssessmentResult> {
  // Imported lazily so unit tests of the pure helpers never pull in the Supabase
  // client (which constructs itself at import time and reads config/native deps).
  const { supabase } = await import('../../../lib/supabase');
  const { data, error } = await supabase.rpc('submit_assessment', {
    p_lesson_id: input.lessonId,
    p_form: input.form,
    p_item_results: input.itemResults as unknown as Json,
  });

  if (error) {
    throw error;
  }

  return parseAssessmentResult(data, input);
}
