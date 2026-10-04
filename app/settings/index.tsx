import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen, Text, useToast } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/features/auth/onboarding-store';
import { useLogout } from '../../src/features/auth/use-logout';
import { legalLinks, openUrl } from '../../src/features/settings/legal-links';
import { useTheme } from '../../src/theme/theme-provider';

/**
 * Settings index (requirement 8.1).
 *
 * Lists exactly the entries the requirement calls for: Privacy Policy, Terms,
 * Send feedback (a placeholder for now), Log out, and Delete account. The screen
 * is thin — it composes feature hooks and shared UI, with no business logic:
 *
 * - Legal links open the configured URLs in the in-app system browser
 *   (src/features/settings/legal-links). URLs come from config (placeholders in
 *   development).
 * - Send feedback is a placeholder that shows a toast; a real destination is
 *   wired up in a later milestone.
 * - Log out runs the composed logout (Auth0 + query cache + stores). The
 *   AuthGate then routes back to the age screen.
 * - Delete account navigates to the confirmation screen, which explains the
 *   deletion is permanent before anything happens (requirement 8.2).
 */
console.log('[dev-button] __DEV__ =', __DEV__);
export default function SettingsScreen() {
  const theme = useTheme();
  const toast = useToast();
  const logout = useLogout();

  const onOpenLegal = async (url: string, label: string) => {
    try {
      await openUrl(url);
    } catch {
      toast.show(`Couldn't open ${label}. Please try again.`, { tone: 'error' });
    }
  };

  const onLogout = async () => {
    try {
      await logout();
      // The AuthGate observes the signed-out session and returns to the age
      // screen; no explicit navigation needed here.
    } catch {
      toast.show("Couldn't log out. Please try again.", { tone: 'error' });
    }
  };

  return (
    <Screen scroll style={{ gap: theme.spacing.lg }}>
      <Text variant="title" accessibilityRole="header">
        Settings
      </Text>

      <View
        style={[styles.group, { borderColor: theme.colors.border, borderRadius: theme.radii.lg }]}
      >
        {legalLinks().map((link, index) => (
          <SettingsRow
            key={link.key}
            label={link.label}
            onPress={() => onOpenLegal(link.url, link.label)}
            showDivider={index > 0}
            accessibilityHint={`Opens ${link.label} in your browser`}
          />
        ))}
        <SettingsRow
          label="Send feedback"
          onPress={() => toast.show('Feedback is coming soon.')}
          showDivider
          accessibilityHint="Feedback is coming soon"
        />
      </View>

      <View
        style={[styles.group, { borderColor: theme.colors.border, borderRadius: theme.radii.lg }]}
      >
        <SettingsRow label="Log out" onPress={onLogout} />
        <SettingsRow
          label="Delete account"
          tone="danger"
          onPress={() => router.push('/settings/delete-account')}
          showDivider
          accessibilityHint="Permanently delete your account"
        />
      </View>

      {__DEV__ && (
        <View
          style={[styles.group, { borderColor: theme.colors.border, borderRadius: theme.radii.lg }]}
        >
          <Text
            variant="caption"
            style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}
            accessibilityLiveRegion="polite"
          >
            Developer tools
          </Text>
          <SettingsRow
            label="Reset onboarding (dev)"
            tone="danger"
            onPress={() => {
              useOnboardingStore.getState().reset();
              toast.show('Onboarding state reset.');
            }}
            accessibilityHint="Clears onboarding data to restart sign-up flow"
          />
        </View>
      )}
    </Screen>
  );
}

/** A single tappable settings row. */
function SettingsRow({
  label,
  onPress,
  tone = 'default',
  showDivider = false,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
  showDivider?: boolean;
  accessibilityHint?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: showDivider ? StyleSheet.hairlineWidth : 0,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text variant="body" color={tone === 'danger' ? 'danger' : 'text'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
