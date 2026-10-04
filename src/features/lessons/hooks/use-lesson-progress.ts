/**
 * Lesson progress query (requirements 2.1, 2.2, 2.5).
 *
 * Fetches the signed-in learner's `lesson_progress` rows so the Learn tab can
 * tell which lessons are completed and compute each node's status. RLS scopes
 * the result to the caller's own rows (migration
 * 20250104000002_learning_rls_and_grants.sql, policy "own rows"), so no user id
 * is passed from the client — same convention as `useProfile`.
 *
 * The query key `['lesson-progress']` is what the completion flow (task 11)
 * invalidates after `complete_lesson` succeeds, which refreshes the path
 * (requirement 2.5).
 */
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../../lib/supabase';
import type { Database } from '../../../types/db';

type LessonProgressRow = Database['public']['Tables']['lesson_progress']['Row'];

/** React Query key for the learner's lesson progress. */
export const LESSON_PROGRESS_QUERY_KEY = ['lesson-progress'] as const;

/** Fetch the caller's lesson_progress rows (lesson id + status is all the path needs). */
export async function fetchLessonProgress(): Promise<Pick<LessonProgressRow, 'lesson_id' | 'status'>[]> {
  const { data, error } = await supabase.from('lesson_progress').select('lesson_id, status');
  if (error) {
    throw error;
  }
  return data ?? [];
}

/**
 * Query the learner's lesson progress. Pass `enabled = isSignedIn` so it does
 * not run while signed out (an anonymous request would return no rows anyway).
 */
export function useLessonProgress(enabled = true) {
  return useQuery({
    queryKey: LESSON_PROGRESS_QUERY_KEY,
    queryFn: fetchLessonProgress,
    enabled,
  });
}
