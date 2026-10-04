import { QueryClientProvider } from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary, ToastProvider } from '../src/components/ui';
import { AuthGate } from '../src/features/auth/auth-gate';
import { useCompletionQueue } from '../src/features/lessons/hooks/use-completion-queue';
import { useSessionAnalytics } from '../src/features/progress/use-session-analytics';
import { AuthProvider } from '../src/lib/auth0';
import { queryClient } from '../src/lib/query-client';
import { initSentry } from '../src/lib/sentry';
import { ThemeProvider } from '../src/theme/theme-provider';

// Initialize Sentry as early as possible, before the provider tree renders, so
// an error during startup is still captured. A no-op when no DSN is configured
// (local development, tests). See src/lib/sentry.ts (requirement 9.1).
initSentry();

/**
 * Root navigator and provider stack.
 *
 * Order follows design.md: Auth0Provider -> QueryClientProvider -> ThemeProvider
 * -> AuthGate, wrapped by SafeAreaProvider so the shared Screen component can
 * read safe-area insets anywhere in the tree. The Auth0 provider must sit
 * outermost of the data/UI providers so both the session hooks
 * and the Supabase client's token callback resolve against it; React Query wraps
 * everything that reads server state (including the AuthGate's profile lookup);
 * the theme wraps the UI; and the AuthGate renders beneath them all, alongside
 * the router Stack, so it can read every provider while driving redirects.
 *
 * The ErrorBoundary (requirement 9.1) sits just inside the ThemeProvider so its
 * fallback can render themed, safe-area-inset content, and wraps everything that
 * actually renders UI. The whole component is additionally exported through
 * Sentry.wrap so the SDK can attach routing/touch context to reports.
 *
 * The AuthGate renders no UI — it only decides routing and manages the splash
 * screen — so it sits next to <Stack />, which renders the actual screens.
 * useSessionAnalytics logs the session_start event once per app session, and
 * useCompletionQueue retries any lesson completions queued while offline.
 */
function RootLayout() {
  useSessionAnalytics();
  // Retry any lesson completions that were queued offline (requirement 5.5).
  useCompletionQueue();

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <ErrorBoundary>
              <ToastProvider>
                <AuthGate />
                <Stack screenOptions={{ headerShown: false }} />
              </ToastProvider>
            </ErrorBoundary>
          </ThemeProvider>
        </QueryClientProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(RootLayout);
