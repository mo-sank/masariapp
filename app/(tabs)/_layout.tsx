import { Tabs } from 'expo-router';
import { useRef } from 'react';
import { View, type ColorValue } from 'react-native';

import { Text } from '../../src/components/ui';
import { FirstRunTour } from '../../src/features/tutorial/first-run-tour';
import {
  TutorialTargetProvider,
  useRegisterTutorialTarget,
} from '../../src/features/tutorial/target-registry';
import { TAB_TARGET_IDS } from '../../src/features/tutorial/tour';
import { useTheme } from '../../src/theme/theme-provider';

/**
 * Four-tab shell: Learn, Explore, Portfolio, Profile (requirements 7.1, 7.4).
 *
 * The tab bar colors come from theme tokens so it follows light/dark mode, and
 * each tab gets a simple glyph icon that tints with the active/inactive color.
 * We use emoji glyphs rather than pulling in an icon font dependency, keeping
 * the shell self-contained. The icons are decorative — the tab label carries the
 * accessible name — so they are marked `accessibilityElementsHidden`.
 *
 * First-run tutorial (onboarding-revamp): each tab icon registers itself as a
 * coachmark target, and on a brand-new device the {@link CoachmarkOverlay} walks
 * the user through the four tabs once. The whole shell is wrapped in a
 * {@link TutorialTargetProvider} so the overlay (rendered as a sibling of the
 * tabs) can read each tab's measured position. The one-time flag lives on-device
 * via {@link useTutorialSeen}; completing or skipping marks it seen so it never
 * auto-shows again.
 */

/** A tab icon that also registers itself as a tutorial spotlight target. */
function TabIcon({
  glyph,
  color,
  targetId,
}: {
  glyph: string;
  color: ColorValue;
  targetId: string;
}) {
  const measure = useRegisterTutorialTarget(targetId);
  const ref = useRef<View>(null);

  return (
    <View
      ref={ref}
      // Measure on layout so the overlay knows where to spotlight this tab.
      onLayout={() => measure(ref.current)}
    >
      <Text
        style={{ fontSize: 20, lineHeight: 24, color }}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {glyph}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <TutorialTargetProvider>
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
            tabBarIcon: ({ color }) => (
              <TabIcon glyph="📚" color={color} targetId={TAB_TARGET_IDS.learn} />
            ),
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            title: 'Explore',
            tabBarIcon: ({ color }) => (
              <TabIcon glyph="🧭" color={color} targetId={TAB_TARGET_IDS.explore} />
            ),
          }}
        />
        <Tabs.Screen
          name="portfolio"
          options={{
            title: 'Portfolio',
            tabBarIcon: ({ color }) => (
              <TabIcon glyph="📈" color={color} targetId={TAB_TARGET_IDS.portfolio} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => (
              <TabIcon glyph="👤" color={color} targetId={TAB_TARGET_IDS.profile} />
            ),
          }}
        />
      </Tabs>

      <FirstRunTour />
    </TutorialTargetProvider>
  );
}
