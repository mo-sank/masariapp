/**
 * Save-missed-items mutation (requirements 7.1, 7.2).
 *
 * After a lesson completes, the lesson route hands this hook the run's *missed*
 * scored items so they are queued for later practice (requirement 7.1). It wraps
 * the `save_rewind_items` RPC (via {@link saveRewindItems}) and, on success,
 * invalidates the `['rewind']` query so the Learn tab's Rewind card refreshes
 * with the new due count (requirement 7.2). It is the Rewind sibling of
 * {@link useCompleteLesson}: completion awards XP and unlocks; this quietly
 * grows the practice queue.
 *
 * Saving the queue is best-effort. Unlike completion there is no offline queue:
 * a missed item is not progress the learner would notice losing, and the RPC
 * upserts idempotently, so the worst case is this run's misses not re-surfacing.
 * The caller (the lesson route) therefore fires this without blocking the
 * results screen and ignores a rejection; `onSuccess` invalidation only runs
 * when the save actually landed.
 *
 * The query client and the RPC caller are injected (defaulting to the app-wide
 * instances) so the hook can be unit tested without the real cache or network.
 */
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { REWIND_QUERY_KEY } from './use-rewind';
import { saveRewindItems, type RewindItemInput } from '../api/save-rewind-items';

/** Invalidate the Rewind query so the Learn tab's card refreshes (requirement 7.2). */
export function invalidateRewind(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: REWIND_QUERY_KEY });
}

/** Options for {@link useSaveRewindItems} (mainly test seams). */
export interface UseSaveRewindItemsOptions {
  /** The RPC caller. Defaults to the real {@link saveRewindItems}. */
  mutationFn?: (items: readonly RewindItemInput[]) => Promise<number>;
}

/**
 * Mutation that saves missed scored items to the Rewind queue.
 * `mutate`/`mutateAsync` take the `{ lesson_id, item_id }` array (build it with
 * `buildRewindItems`); on success you get the number of items processed and the
 * Rewind card's count is refreshed.
 */
export function useSaveRewindItems(options: UseSaveRewindItemsOptions = {}) {
  const client = useQueryClient();
  const run = options.mutationFn ?? saveRewindItems;

  return useMutation<number, Error, readonly RewindItemInput[]>({
    mutationFn: (items) => run(items),
    onSuccess: () => {
      invalidateRewind(client);
    },
  });
}
