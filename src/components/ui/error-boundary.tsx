/**
 * App error boundary (requirement 9.1).
 *
 * Catches render-time errors from the component tree below it so an unhandled
 * exception shows a friendly recovery screen instead of a white screen or a
 * native crash. It wraps Sentry's `ErrorBoundary`, so a caught error is also
 * reported to Sentry (through the privacy scrubbers configured in
 * src/lib/sentry.ts). When Sentry is disabled (no DSN in dev/tests) the
 * component still renders the fallback — reporting is simply skipped.
 *
 * The fallback reuses the shared Screen + StateView so it matches the app's
 * error state everywhere else, and offers a "Try again" action that resets the
 * boundary to re-mount the subtree. This complements — but does not replace —
 * the per-screen StateView(error) used for expected failures (network, RPC
 * errors); this boundary is the last line of defense for the unexpected.
 */
import * as Sentry from '@sentry/react-native';
import type { ReactNode } from 'react';

import { Screen } from './screen';
import { StateView } from './state-view';

export interface ErrorBoundaryProps {
  children: ReactNode;
}

/**
 * The fallback UI. Sentry's ErrorBoundary passes a `resetError` callback we wire
 * to the StateView retry so the user can attempt to recover without restarting.
 */
function Fallback({ resetError }: { resetError: () => void }) {
  return (
    <Screen center>
      <StateView
        kind="error"
        title="Something went wrong"
        message="The app hit an unexpected problem. You can try again."
        onRetry={resetError}
      />
    </Screen>
  );
}

/**
 * Wrap the app (or a subtree) to catch render errors, report them to Sentry, and
 * show a recoverable fallback. Place it high in the tree, beneath the theme and
 * safe-area providers so the fallback can render themed, inset content.
 */
export function ErrorBoundary({ children }: ErrorBoundaryProps) {
  return (
    <Sentry.ErrorBoundary fallback={({ resetError }) => <Fallback resetError={resetError} />}>
      {children}
    </Sentry.ErrorBoundary>
  );
}
