/**
 * StateView (requirement 7.3).
 *
 * The single component every screen uses for its non-content states — loading,
 * empty, error, and offline — so a user never faces a blank screen. Each state
 * renders a consistent centered layout: an optional icon glyph, a title, an
 * optional message, and (for error/offline) a retry button.
 *
 * Accessibility: the loading state announces a busy spinner; error and offline
 * use the `alert` role so screen readers surface the problem. Copy and colors
 * come from theme tokens.
 */
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from './button';
import { Text } from './text';
import { useTheme } from '../../theme/theme-provider';

export type StateKind = 'loading' | 'empty' | 'error' | 'offline';

export interface StateViewProps {
  /** Which state to render. */
  kind: StateKind;
  /** Headline. Falls back to a sensible default per kind. */
  title?: string;
  /** Supporting line below the title. */
  message?: string;
  /** Retry handler. When provided (error/offline), a Try again button shows. */
  onRetry?: () => void;
}

const DEFAULTS: Record<StateKind, { title: string; icon?: string }> = {
  loading: { title: 'Loading…' },
  empty: { title: 'Nothing here yet', icon: '📭' },
  error: { title: 'Something went wrong', icon: '⚠️' },
  offline: { title: "You're offline", icon: '📡' },
};

export function StateView({ kind, title, message, onRetry }: StateViewProps) {
  const theme = useTheme();
  const defaults = DEFAULTS[kind];
  const heading = title ?? defaults.title;
  const isAlert = kind === 'error' || kind === 'offline';

  return (
    <View
      style={[styles.container, { gap: theme.spacing.md }]}
      accessibilityRole={isAlert ? 'alert' : undefined}
      accessibilityLiveRegion={isAlert ? 'polite' : 'none'}
    >
      {kind === 'loading' ? (
        <ActivityIndicator color={theme.colors.primary} accessibilityLabel="Loading" />
      ) : defaults.icon ? (
        <Text variant="title" style={styles.icon} accessibilityElementsHidden>
          {defaults.icon}
        </Text>
      ) : null}

      <Text variant="title" color="text" style={styles.heading}>
        {heading}
      </Text>

      {message ? (
        <Text variant="body" color="textMuted" style={styles.message}>
          {message}
        </Text>
      ) : null}

      {onRetry && isAlert ? (
        <Button
          title="Try again"
          variant="secondary"
          onPress={onRetry}
          accessibilityLabel="Try again"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  icon: {
    fontSize: 40,
    lineHeight: 48,
  },
  heading: {
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    maxWidth: 320,
  },
});
