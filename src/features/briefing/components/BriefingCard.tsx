/**
 * BriefingCard — the Learn-tab entry point to the Daily Market Briefing
 * (requirement 4.1).
 *
 * When `daily_briefing` is unlocked, the Learn tab shows this card; tapping it
 * opens the three-card recap (requirement 4.1). It is a thin, presentational
 * pressable: it owns no data and no navigation decision beyond calling `onOpen`,
 * so the Learn screen (which already knows the router) decides where it goes and
 * the Gate decides whether it renders at all.
 *
 * The card reads its surface, radius, and spacing from theme tokens like the
 * shared {@link Card}, and exposes a single button accessibility role with a
 * clear label so it is reachable and announced as one tappable element.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';

export interface BriefingCardProps {
  /** Open the full briefing. Wired by the Learn screen to route to /briefing. */
  onOpen: () => void;
}

export function BriefingCard({ onOpen }: BriefingCardProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel="Daily Market Briefing. Open your quick daily recap."
    >
      {({ pressed }) => (
        <Card style={[styles.card, pressed && { opacity: 0.85 }]}>
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="title" accessibilityRole="header">
              Daily Market Briefing
            </Text>
            <Text variant="caption" color="textMuted">
              A quick recap of the market and your portfolio.
            </Text>
          </View>
          <Text variant="body" color="primary">
            Open ›
          </Text>
        </Card>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
});
