import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { Text } from '../../src/components/ui';
import { useTheme } from '../../src/theme/theme-provider';

/**
 * Four-tab shell: Learn, Explore, Portfolio, Profile (requirements 7.1, 7.4).
 *
 * The tab bar colors come from theme tokens so it follows light/dark mode, and
 * each tab gets a simple glyph icon that tints with the active/inactive color.
 * We use emoji glyphs rather than pulling in an icon font dependency, keeping
 * the shell self-contained. The icons are decorative — the tab label carries the
 * accessible name — so they are marked `accessibilityElementsHidden`.
 */
function TabIcon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return (
    <Text
      style={{ fontSize: 20, lineHeight: 24, color }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {glyph}
    </Text>
  );
}

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopColor: theme.colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="learn"
        options={{
          title: 'Learn',
          tabBarIcon: ({ color }) => <TabIcon glyph="📚" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => <TabIcon glyph="🧭" color={color} />,
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: 'Portfolio',
          tabBarIcon: ({ color }) => <TabIcon glyph="📈" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabIcon glyph="👤" color={color} />,
        }}
      />
    </Tabs>
  );
}
