import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';

import { Screen, StateView } from '../src/components/ui';
import { reviewRewindItem } from '../src/features/lessons/api/review-rewind-item';
import { trackRewindSessionCompleted } from '../src/features/lessons/analytics';
import { RewindSession } from '../src/features/lessons/components/RewindSession';
import { useRewind } from '../src/features/lessons/hooks/use-rewind';
import { invalidateRewind } from '../src/features/lessons/hooks/use-save-rewind-items';
import { buildReviewItems } from '../src/features/lessons/rewind-session';
import { useSession } from '../src/lib/auth0';

/**
 * Rewind session route (requirements 7.3, 7.4, 10.1).
 *
 * The screen behind `/rewind`, reached from the Learn tab's Rewind card. It
 * loads the learner's due items (via {@link useRewind}), resolves them into the
 * steps to re-present ({@link buildReviewItems}, capped at ~5 for a ~90-second
 * session, requirement 7.3), and drives the walkthrough through
 * {@link RewindSession}.
 *
 * The route owns the side effects the session view intentionally does not:
 *   - per reviewed item it calls `review_rewind_item` (requirement 7.4) so the
 *     spaced-repetition box advances on a correct re-answer or resets on a wrong
 *     one. The call is best-effort and fire-and-forget — a failure must not
 *     stall the session (the item simply stays due);
 *   - on completion it logs `rewind_session_completed` with the reviewed count
 *     and session duration (requirement 10.1) and invalidates `['rewind']` so
 *     the Learn tab's card reflects the now-smaller queue;
 *   - navigation: "Back to learning" returns to the Learn tab.
 *
 * The due items are read once and the review list is memoised for the life of
 * the screen so reviews moving items out of the due set (which would otherwise
 * refetch and reshuffle mid-session) do not change what the learner is working
 * through. If nothing is due (e.g. the card's count went stale, or a deep link),
 * the session view shows a friendly "nothing to review" state.
 */
export default function RewindScreen() {
  const { isSignedIn } = useSession();
  const queryClient = useQueryClient();
  const { isLoading, isError, refetch, data } = useRewind(isSignedIn);

  // Snapshot the due items into a stable review list for this session. Keyed by
  // the fetched array identity: it is computed once the query resolves and does
  // not change as individual reviews update the server-side queue.
  const items = useMemo(() => buildReviewItems(data?.items ?? []), [data?.items]);

  // Session start time for the completed-event duration (requirement 10.1).
  // Stamped in an effect (not during render) so the clock read is a side effect,
  // and read back in the completion handler to compute the elapsed time.
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  if (isLoading) {
    return (
      <Screen>
        <StateView kind="loading" />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <StateView
          kind="error"
          message="We couldn't load your Rewind items. Please try again."
          onRetry={refetch}
        />
      </Screen>
    );
  }

  const goBack = () => router.replace('/(tabs)/learn');

  return (
    <RewindSession
      items={items}
      onReview={(itemId, correct) => {
        // Best-effort: advance/reset the box on the server; never block the UI.
        void reviewRewindItem(itemId, correct).catch(() => {
          // A failed review leaves the item due; it will come back next session.
        });
      }}
      onComplete={({ reviewed }) => {
        const durationMs = startedAt.current != null ? Date.now() - startedAt.current : 0;
        trackRewindSessionCompleted(reviewed, durationMs);
        // The queue changed (items moved out / reset); refresh the card's count.
        invalidateRewind(queryClient);
      }}
      onDone={goBack}
    />
  );
}
