/**
 * The app-wide TanStack Query client (requirements 3.4, 3.5).
 *
 * A single `QueryClient` instance lives here so two things can share it: the
 * `QueryClientProvider` in the root layout, and the logout flow, which must
 * clear this exact cache when the user signs out (requirement 3.4). Keeping the
 * instance in a plain module — rather than creating it inside a component — is
 * what lets `clearQueryCache()` reach it from outside React.
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Server data is the source of truth; a short stale time avoids hammering
      // the backend while keeping screens reasonably fresh. Individual queries
      // override this as needed.
      staleTime: 30_000,
      retry: 1,
    },
  },
});

/**
 * Drop all cached server data. Called on logout so the next user never sees the
 * previous user's data. `clear()` removes every query and mutation from the
 * cache immediately.
 */
export function clearQueryCache(): void {
  queryClient.clear();
}
