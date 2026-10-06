/**
 * UnlockCelebration (requirements 2.1, 2.2, 2.3).
 *
 * Shown on the lesson results screen after a passing first completion to make
 * earning a feature feel rewarding. For every feature key the completion
 * unlocked it renders one celebratory card with:
 *   - the feature name and a short description of what it does (requirement 2.1),
 *   - an unlock animation — the card fades and rises into place, staggered so
 *     multiple unlocks pop in one after another (requirement 2.1), and
 *   - a "Try it now" button that deep-links straight to the feature (Explore,
 *     Watchlist, stock detail, Trade, Portfolio, History) when it has a single
 *     destination route (requirement 2.2).
 *
 * Reduce-motion (requirement 2.3): when the OS "reduce motion" setting is on the
 * cards render in their final position with no animation — a static version with
 * the same copy and the same "Try it now" links. The caller passes `reduceMotion`
 * (from `useReduceMotion`) so this component stays a pure function of its props
 * and is deterministic in tests.
 *
 * Presentational: it takes the unlocked keys and a navigation callback as props
 * (no data fetching, no router import) so it is driven the same way from the
 * results route and from tests. It reuses the shared UI kit and theme tokens,
 * and the deep-link target comes from the single `featureRoute` map so a key
 * without a standalone destination simply omits its button rather than routing
 * somewhere wrong.
 */
import { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';

import { Button, Card, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';
import { featureRoute } from '../../lessons/components/completion/feature-routes';
import { featureDescription } from '../feature-descriptions';
import { FEATURE_KEYS, isFeatureKey } from '../feature-keys';

/** How long one card takes to fade/rise in. */
const ENTER_MS = 320;
/** Delay between consecutive cards so unlocks pop in one after another. */
const STAGGER_MS = 140;
/** How far (points) a card rises as it fades in. */
const RISE_FROM = 12;

export interface UnlockCelebrationProps {
  /**
   * The feature keys the completion unlocked (from `CompletionPassed.unlocked`).
   * Unknown strings are ignored defensively so a newly authored server key can
   * never crash the results screen.
   */
  unlocked: string[];
  /** Deep-link to a feature's route (the "Try it now" button). */
  onTryFeature: (route: string) => void;
  /** OS reduce-motion setting; when true the cards render static (2.3). */
  reduceMotion: boolean;
}

export function UnlockCelebration({ unlocked, onTryFeature, reduceMotion }: UnlockCelebrationProps) {
  const theme = useTheme();

  // Only render keys we know about; map each to its copy and deep-link target.
  const items = unlocked.filter(isFeatureKey).map((key) => ({
    key,
    label: FEATURE_KEYS[key].label,
    description: featureDescription(key),
    route: featureRoute(key),
  }));

  if (items.length === 0) {
    return null;
  }

  return (
    <View style={{ gap: theme.spacing.sm }} accessibilityRole="summary">
      <Text variant="body" accessibilityRole="header">
        You unlocked
      </Text>
      {items.map((item, index) => (
        <UnlockCard
          key={item.key}
          label={item.label}
          description={item.description}
          route={item.route}
          index={index}
          reduceMotion={reduceMotion}
          onTryFeature={onTryFeature}
        />
      ))}
    </View>
  );
}

interface UnlockCardProps {
  label: string;
  description: string;
  route: string | null;
  index: number;
  reduceMotion: boolean;
  onTryFeature: (route: string) => void;
}

/**
 * One unlocked-feature card. It fades and rises into place on mount (staggered
 * by `index`), or renders in its final position with no animation when
 * reduce-motion is on (requirement 2.3).
 */
function UnlockCard({
  label,
  description,
  route,
  index,
  reduceMotion,
  onTryFeature,
}: UnlockCardProps) {
  const theme = useTheme();

  // Drive opacity + translateY from one Animated.Value (0 -> 1). A lazy useState
  // initializer keeps a single stable instance across renders without reading a
  // ref during render (mirrors the shared Toast's fade value and ProgressBar).
  // Start fully visible under reduce-motion so the static version never flashes.
  const [progress] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));

  useEffect(() => {
    if (reduceMotion) {
      // Static version: snap to the final state, no animation (2.3).
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: ENTER_MS,
      delay: index * STAGGER_MS,
      // Animate on the JS thread: the staggered delay means a card's timer can
      // fire after a test has flushed, and the native driver is unavailable
      // under the test runtime. Opacity + a small translate are cheap enough on
      // the JS thread for this one-shot entrance (mirrors ProgressBar).
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduceMotion, index]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [RISE_FROM, 0],
  });

  return (
    <Animated.View style={{ opacity: progress, transform: [{ translateY }] }}>
      <Card style={{ gap: theme.spacing.sm }}>
        <Text variant="body">{`🎉 ${label} unlocked`}</Text>
        <Text variant="caption" color="textMuted">
          {description}
        </Text>
        {route ? (
          <Button
            title="Try it now"
            onPress={() => onTryFeature(route)}
            accessibilityLabel={`Try ${label} now`}
          />
        ) : null}
      </Card>
    </Animated.View>
  );
}
