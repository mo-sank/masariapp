/**
 * Screen (requirements 7.3, 7.4, 10.1).
 *
 * The outer container every screen renders into. It paints the themed
 * background, applies safe-area insets so content clears the notch and home
 * indicator, and offers an optional `scroll` mode for content taller than the
 * viewport (which keeps larger dynamic-type layouts usable — requirement 10.1).
 *
 * Pass `center` to vertically and horizontally center a short piece of content
 * (used by loading/empty/locked states). Non-scroll screens fill the viewport.
 */
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../theme/theme-provider';

export interface ScreenProps {
  children: React.ReactNode;
  /** Render inside a vertical ScrollView for tall content. */
  scroll?: boolean;
  /** Center children on both axes (short content, states). */
  center?: boolean;
  /** Extra style merged onto the content container. */
  style?: ViewStyle;
}

export function Screen({ children, scroll = false, center = false, style }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const padding: ViewStyle = {
    paddingTop: insets.top + theme.spacing.md,
    paddingBottom: insets.bottom + theme.spacing.md,
    paddingLeft: insets.left + theme.spacing.lg,
    paddingRight: insets.right + theme.spacing.lg,
  };

  const background = { backgroundColor: theme.colors.background };

  if (scroll) {
    return (
      <ScrollView
        style={[styles.flex, background]}
        contentContainerStyle={[
          padding,
          center && styles.centerContent,
          !center && styles.grow,
          style,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.flex, background, padding, center && styles.center, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
});
