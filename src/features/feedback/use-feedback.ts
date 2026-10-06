/**
 * Submit-feedback mutation (requirements 5.1, 5.2, 5.3).
 *
 * The write side of the in-app feedback form. `useSubmitFeedback` wraps the
 * `submit_feedback` RPC
 * (supabase/migrations/20250106000003_submit_feedback_rpc.sql), which runs
 * SECURITY DEFINER, derives the user from the verified session (never from an
 * argument), validates the category and message, enforces the per-user daily
 * rate limit, and inserts exactly one feedback row. The client never passes a
 * user id, matching the no-user-id RPC convention used by
 * src/features/trading/use-reflection.ts and use-place-order.ts.
 *
 * Privacy (requirement 5.3): the row is written for the caller and only ever
 * read back through the owner-scoped `feedback` RLS policy or the team's
 * dashboard. This hook only writes; it never reads feedback back onto any
 * screen.
 *
 * The RPC raises Postgres exceptions whose message is a stable error code
 * (`rate_limited`, `invalid_category`, `message_required`, `message_too_long`,
 * `not_authenticated`). PostgREST surfaces that string as the error's
 * `message`, which {@link mapFeedbackError} turns into friendly copy — including
 * the "you've sent a lot today" limit message required by 5.2. The pure
 * `submitFeedback` caller and `mapFeedbackError` are exported so both can be
 * unit tested without React or the real client.
 */
import { useMutation } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';
import type { FeedbackCategory } from './feedback-logic';
import type { Database } from '../../types/db';

type FeedbackRow = Database['public']['Tables']['feedback']['Row'];

/** The fields the Send-feedback screen collects for one submission. */
export interface SubmitFeedbackInput {
  /** The chosen category: 'bug' | 'idea' | 'confusing' | 'other'. */
  category: FeedbackCategory;
  /** The feedback message (1-1000 chars after trimming). */
  message: string;
  /** The screen the user was on when they opened feedback, or null. */
  screen?: string | null;
}

/**
 * Stable error codes the `submit_feedback` RPC can raise (as the error
 * message). `invalid_category` / `message_required` / `message_too_long` /
 * `not_authenticated` are defensive — the form's own validation should prevent
 * them — but we map them too so the UI never shows a raw code. `rate_limited`
 * is the one a well-behaved client still hits (requirement 5.2).
 */
export type FeedbackErrorCode =
  | 'rate_limited'
  | 'invalid_category'
  | 'message_required'
  | 'message_too_long'
  | 'not_authenticated';

/** Friendly, teen-appropriate copy for each known feedback error code. */
const FEEDBACK_ERROR_MESSAGES: Record<FeedbackErrorCode, string> = {
  rate_limited: "You've sent a lot of feedback today — thank you! Please try again tomorrow.",
  invalid_category: 'Please pick a category before sending.',
  message_required: 'Please add a message before sending.',
  message_too_long: 'That message is a bit long. Please shorten it and try again.',
  not_authenticated: 'Sign in to send feedback.',
};

/** Fallback copy when the error is unrecognised (e.g. network/unknown). */
const FEEDBACK_FALLBACK_MESSAGE = "We couldn't send your feedback. Please try again.";

/**
 * Map a thrown feedback error to friendly UI copy.
 *
 * The RPC raises Postgres exceptions whose message is the stable error code,
 * which PostgREST passes through as the error's `message`. We read that message
 * and look it up; anything unrecognised gets the generic fallback so the UI
 * never shows a raw error string.
 */
export function mapFeedbackError(error: unknown): string {
  const code = feedbackErrorCode(error);
  if (code && isFeedbackErrorCode(code)) {
    return FEEDBACK_ERROR_MESSAGES[code];
  }
  return FEEDBACK_FALLBACK_MESSAGE;
}

/** Narrow an arbitrary string to a known {@link FeedbackErrorCode}. */
function isFeedbackErrorCode(code: string): code is FeedbackErrorCode {
  return Object.prototype.hasOwnProperty.call(FEEDBACK_ERROR_MESSAGES, code);
}

/** Read the error code (the message) off an unknown thrown value, if present. */
function feedbackErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message.trim();
    }
  }
  return null;
}

/**
 * Call `submit_feedback` for one submission. Returns the inserted feedback row.
 * Throws the raw Supabase error on failure so the caller can map it with
 * {@link mapFeedbackError}.
 */
export async function submitFeedback(input: SubmitFeedbackInput): Promise<FeedbackRow> {
  const { data, error } = await supabase.rpc('submit_feedback', {
    p_category: input.category,
    p_message: input.message,
    p_screen: input.screen ?? null,
  });
  if (error) {
    throw error;
  }
  return data as FeedbackRow;
}

/**
 * Mutation that submits in-app feedback. `mutate(input)` / `mutateAsync(input)`.
 * On failure the mutation rejects with the raw error — map it for the UI with
 * {@link mapFeedbackError}. There is no client-side feedback query to
 * invalidate (feedback is write-only from the app's point of view), so there is
 * no onSuccess cache work.
 */
export function useSubmitFeedback() {
  return useMutation<FeedbackRow, Error, SubmitFeedbackInput>({
    mutationFn: (input) => submitFeedback(input),
  });
}
