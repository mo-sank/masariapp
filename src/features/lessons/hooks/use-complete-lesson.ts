/**
 * Lesson completion mutation (requirements 5.2, 5.5, 2.5).
 *
 * The lesson player hands a finished run to this hook, which sends it to the
 * `complete_lesson` RPC (via {@link completeLesson}) and returns the typed
 * {@link CompletionResult} so the route can show the results screen (on a pass)
 * or the retry screen (sub-pass, requirement 5.3). It is the live, online path;
 * the offline queue is only the fallback.
 *
 * On success it invalidates the three learning queries the Learn tab reads —
 * `['lesson-progress']`, `['stats']`, `['unlocks']` — so the path, XP, and
 * streak refresh after a completion (requirements 2.5 / 5.5). Invalidation runs
 * for every successful call, including a sub-pass (which bumps attempts) and a
 * replay (which may not change anything but is cheap to refetch).
 *
 * Offline / failure (requirement 5.5): if the RPC rejects (device offline, RPC
 * error) the completion is enqueued to {@link completionQueue} for retry on the
 * next foreground/launch so the result is never lost. The mutation still rejects
 * so the caller can tell the learner "saved, we'll sync" rather than show a live
 * results screen it does not have. Because the RPC is idempotent for XP and
 * unlocks, the later retry cannot double-award.
 *
 * The query client and the queue are injected (defaulting to the app-wide
 * instances) so the hook's behavior can be unit tested without the real cache or
 * AsyncStorage.
 */
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { LESSON_PROGRESS_QUERY_KEY } from './use-lesson-progress';
import { STATS_QUERY_KEY } from './use-stats';
import { UNLOCKS_QUERY_KEY } from './use-unlocks';
import {
  completeLesson,
  type CompleteLessonInput,
  type CompletionResult,
} from '../api/complete-lesson';
import { completionQueue, type CompletionQueue } from '../completion-queue';

/** Invalidate the learning queries so the Learn tab refreshes (requirement 2.5). */
export function invalidateLearningQueries(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: LESSON_PROGRESS_QUERY_KEY });
  void client.invalidateQueries({ queryKey: STATS_QUERY_KEY });
  void client.invalidateQueries({ queryKey: UNLOCKS_QUERY_KEY });
}

/**
 * Run a completion through `run`, falling back to the offline queue on failure
 * (requirement 5.5). This is the mutation's core, factored out so it can be unit
 * tested without React/React Query: on success it returns the parsed result; on
 * failure it enqueues the completion for retry and rethrows so the caller can
 * tell the learner it was saved rather than show a results screen.
 */
export async function runCompletion(
  input: CompleteLessonInput,
  run: (input: CompleteLessonInput) => Promise<CompletionResult>,
  queue: Pick<CompletionQueue, 'enqueue'>,
): Promise<CompletionResult> {
  try {
    return await run(input);
  } catch (error) {
    // Never lose the result: queue it for retry, then rethrow so the UI can show
    // a "saved, will sync" message instead of a results screen.
    await queue.enqueue(input);
    throw error;
  }
}

/** Options for {@link useCompleteLesson} (mainly test seams). */
export interface UseCompleteLessonOptions {
  /** The RPC caller. Defaults to the real {@link completeLesson}. */
  mutationFn?: (input: CompleteLessonInput) => Promise<CompletionResult>;
  /** The offline queue to enqueue into on failure. Defaults to the singleton. */
  queue?: Pick<CompletionQueue, 'enqueue'>;
}

/**
 * Mutation that completes a lesson. `mutate`/`mutateAsync` take a
 * {@link CompleteLessonInput}; on success you get the typed
 * {@link CompletionResult}, on failure the mutation rejects after the completion
 * has been safely enqueued for retry.
 */
export function useCompleteLesson(options: UseCompleteLessonOptions = {}) {
  const client = useQueryClient();
  const run = options.mutationFn ?? completeLesson;
  const queue = options.queue ?? completionQueue;

  return useMutation<CompletionResult, Error, CompleteLessonInput>({
    mutationFn: (input) => runCompletion(input, run, queue),
    onSuccess: () => {
      invalidateLearningQueries(client);
    },
  });
}
