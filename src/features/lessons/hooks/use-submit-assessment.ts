/**
 * Placement assessment submission mutation (requirements 6.2, 6.3, 6.4).
 *
 * The Placement Quest route hands a finished L0 run to this hook, which sends
 * the per-item results to the `submit_assessment` RPC (via
 * {@link submitAssessment}) so the diagnostic baseline is recorded. It is the
 * assessment-specific sibling of {@link useCompleteLesson}: a placement run has
 * no pass/fail and no XP (requirement 6.2/6.3), so its results are stored for the
 * learning-gain evaluation rather than scored on screen.
 *
 * On success it invalidates the three learning queries the Learn tab reads so the
 * path refreshes after the placement completes (requirement 2.5 / 6.4). The L0
 * node itself is marked completed and its unlock granted by `complete_lesson`,
 * which the route calls alongside this (design "Completion flow": "L0
 * additionally calls submit_assessment"); invalidation here keeps the refresh in
 * one place regardless of ordering.
 *
 * Unlike completion, there is no offline queue: a placement baseline is a
 * one-time diagnostic, and re-submitting would insert a second `assessment_results`
 * row. If the RPC fails the mutation simply rejects and the route lets the
 * learner continue to the path (the baseline is best-effort, requirement 6.4).
 *
 * The query client and the RPC caller are injected (defaulting to the app-wide
 * instances) so the hook can be unit tested without the real cache or network.
 */
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { LESSON_PROGRESS_QUERY_KEY } from './use-lesson-progress';
import { STATS_QUERY_KEY } from './use-stats';
import { UNLOCKS_QUERY_KEY } from './use-unlocks';
import {
  submitAssessment,
  type AssessmentResult,
  type SubmitAssessmentInput,
} from '../api/submit-assessment';

/**
 * Invalidate the learning queries so the Learn tab refreshes after a placement
 * completes (requirement 2.5 / 6.4). Exported for unit testing and shared with
 * {@link useSubmitAssessment}'s `onSuccess`.
 */
export function invalidateLearningQueries(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: LESSON_PROGRESS_QUERY_KEY });
  void client.invalidateQueries({ queryKey: STATS_QUERY_KEY });
  void client.invalidateQueries({ queryKey: UNLOCKS_QUERY_KEY });
}

/** Options for {@link useSubmitAssessment} (mainly test seams). */
export interface UseSubmitAssessmentOptions {
  /** The RPC caller. Defaults to the real {@link submitAssessment}. */
  mutationFn?: (input: SubmitAssessmentInput) => Promise<AssessmentResult>;
}

/**
 * Mutation that submits a placement assessment. `mutate`/`mutateAsync` take a
 * {@link SubmitAssessmentInput}; on success you get the parsed
 * {@link AssessmentResult} (whose score the no-reveal screen ignores) and the
 * learning queries are refreshed.
 */
export function useSubmitAssessment(options: UseSubmitAssessmentOptions = {}) {
  const client = useQueryClient();
  const run = options.mutationFn ?? submitAssessment;

  return useMutation<AssessmentResult, Error, SubmitAssessmentInput>({
    mutationFn: (input) => run(input),
    onSuccess: () => {
      invalidateLearningQueries(client);
    },
  });
}
