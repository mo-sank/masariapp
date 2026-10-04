/**
 * Sort step — place items into labeled buckets (requirements 4.4, 4.8).
 *
 * The learner sorts each item into one of the labeled buckets, then submits for
 * the player to grade. Requirement 4.4 asks for "dragging or tapping", and is
 * explicit that tapping must always work — a learner must never be forced to
 * drag. So this component is built tap-first:
 *
 *   1. Tap an unplaced item to select it (it highlights).
 *   2. Tap a bucket to drop the selected item into it.
 *   3. Tap a placed item inside a bucket to pull it back to the tray.
 *
 * Dragging is layered on as an optional enhancement on top of that same model,
 * built on React Native's core {@link Animated} + {@link PanResponder} (so no
 * gesture/animation dependency is added, matching CardsStep): press-and-drag an
 * item over a bucket and release to drop it there. The drag never gates
 * progress — every placement the drag can make is also reachable by tapping, so
 * the tap path is the accessible fallback (requirement 4.4) and the one the
 * tests exercise.
 *
 * Scoring is all-or-nothing and lives in the pure scorer (`scoring.ts`): the
 * component only reports where the learner put each item as a sort
 * {@link Answer} (`placements`, keyed by item id). It does not read each item's
 * authored `bucketId`, reveal correctness, or show the explanation — the player
 * does that after `onAnswer` (requirement 3.2).
 *
 * Purity (requirement 4.8): props in, `onAnswer` out once, on submit. No
 * network, no scoring, no haptics.
 *
 * Accessibility (requirement 4.8): the prompt is a header; items and buckets are
 * buttons with labels that announce the current placement ("Apple, in Fruit" /
 * "Fruit bucket, 2 items"), and the selected item is exposed via
 * `accessibilityState.selected`. Submit is disabled (and says so) until every
 * item is placed.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View, type LayoutRectangle } from 'react-native';

import type { StepComponentProps } from './types';
import { Button, Card, Text } from '../../../../components/ui';
import { useReduceMotion } from '../../../../theme/use-reduce-motion';
import { useTheme } from '../../../../theme/theme-provider';
import type { SortStep as SortStepType } from '../../schema';

// How long the snap-back animation runs when a drag is released outside any
// bucket (purely cosmetic; placement itself is instant and deterministic).
const SNAP_BACK_MS = 150;

export function SortStep({ step, onAnswer }: StepComponentProps<SortStepType>) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();

  // The learner's placements so far: item id -> bucket id. An item not present
  // here is still in the tray waiting to be placed. A ref mirrors the map so
  // that submitting reads the live placements from its handler rather than a
  // value captured by a stale render (robust to how React batches taps).
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const placementsRef = useRef<Record<string, string>>({});
  const setPlacementsBoth = (updater: (prev: Record<string, string>) => Record<string, string>) => {
    const next = updater(placementsRef.current);
    placementsRef.current = next;
    setPlacements(next);
  };
  // The item currently selected by tapping (null when none). Tapping a bucket
  // places this item; tapping the item again deselects it. A ref mirrors the
  // selection so a bucket tap always reads the current value from its handler
  // (never a value captured by a stale render), which keeps the tap-to-place
  // flow correct regardless of how React batches the two taps.
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const selectItem = (next: string | null) => {
    selectedRef.current = next;
    setSelectedItemId(next);
  };
  // Whether the learner has submitted, so a second submit can't double-report.
  // A ref guards against a rapid double tap (two presses in one batch) that the
  // state value would not yet reflect.
  const submittedRef = useRef(false);

  // On-screen rectangle of each bucket (page coordinates), filled by their
  // `onLayout`. The draggable items hit-test the finger's release point against
  // this shared map to decide which bucket a drag landed on. A ref, not state,
  // because layout changes must not trigger re-renders; the items read it only
  // at gesture time through the stable getter below (never during render).
  const bucketLayoutsRef = useRef<Record<string, LayoutRectangle>>({});
  const getBucketLayouts = useCallback(() => bucketLayoutsRef.current, []);

  const allPlaced = step.items.every((item) => placements[item.id] !== undefined);

  // Place an item into a bucket (tap-to-place, or a drag that landed on it).
  const place = (itemId: string, bucketId: string) => {
    setPlacementsBoth((prev) => ({ ...prev, [itemId]: bucketId }));
    selectItem(null);
  };

  // Return a placed item to the tray so it can be re-sorted.
  const unplace = (itemId: string) => {
    setPlacementsBoth((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    selectItem(null);
  };

  // Tap an item in the tray: select it, or deselect if it was already selected.
  const toggleSelect = (itemId: string) => {
    selectItem(selectedRef.current === itemId ? null : itemId);
  };

  // Tap a bucket: if an item is selected, drop it in; otherwise do nothing.
  // Reads the live selection from the ref so it is correct even if the item tap
  // and the bucket tap are processed in the same batch.
  const handleBucketPress = (bucketId: string) => {
    const selected = selectedRef.current;
    if (selected !== null) {
      place(selected, bucketId);
    }
  };

  // Submit the learner's placements. Reads the live placements from the ref and
  // re-checks completeness there, so it is correct even if the final placement
  // tap and the submit tap are processed in the same batch.
  const handleSubmit = () => {
    const current = placementsRef.current;
    const complete = step.items.every((item) => current[item.id] !== undefined);
    if (!complete || submittedRef.current) return;
    submittedRef.current = true;
    onAnswer({ stepId: step.id, type: 'sort', placements: current });
  };

  // Items still waiting in the tray, in authored order.
  const trayItems = step.items.filter((item) => placements[item.id] === undefined);

  return (
    <Card style={[styles.card, { gap: theme.spacing.md }]}>
      <Text variant="caption" color="textMuted" accessibilityRole="header">
        Sort each item into a bucket
      </Text>
      <Text variant="title">{step.prompt}</Text>

      {/* Tray of unplaced items. Tapping one selects it for placement. */}
      <View
        accessibilityLabel="Items to sort"
        style={[styles.tray, { gap: theme.spacing.sm }]}
      >
        {trayItems.length === 0 ? (
          <Text variant="caption" color="textMuted">
            All items placed.
          </Text>
        ) : (
          trayItems.map((item) => (
            <DraggableItem
              key={item.id}
              label={item.text}
              selected={selectedItemId === item.id}
              reduceMotion={reduceMotion}
              getBucketLayouts={getBucketLayouts}
              onTap={() => toggleSelect(item.id)}
              onDropInBucket={(bucketId) => place(item.id, bucketId)}
            />
          ))
        )}
      </View>

      {/* Buckets. Tapping a bucket places the selected item; placed items are
          shown inside and can be tapped to return them to the tray. */}
      <View style={[styles.buckets, { gap: theme.spacing.sm }]}>
        {step.buckets.map((bucket) => {
          const contents = step.items.filter((item) => placements[item.id] === bucket.id);
          return (
            <Pressable
              key={bucket.id}
              accessibilityRole="button"
              accessibilityLabel={`${bucket.label} bucket, ${contents.length} ${
                contents.length === 1 ? 'item' : 'items'
              }${selectedItemId !== null ? ', tap to place the selected item here' : ''}`}
              onPress={() => handleBucketPress(bucket.id)}
              onLayout={(e) => {
                bucketLayoutsRef.current[bucket.id] = e.nativeEvent.layout;
              }}
              style={({ pressed }) => [
                styles.bucket,
                {
                  borderColor:
                    selectedItemId !== null ? theme.colors.primary : theme.colors.border,
                  borderWidth: selectedItemId !== null ? 2 : 1,
                  borderRadius: theme.radii.md,
                  backgroundColor: theme.colors.surface,
                  padding: theme.spacing.sm,
                  gap: theme.spacing.xs,
                },
                pressed && styles.pressed,
              ]}
            >
              <Text variant="caption" color="textMuted">
                {bucket.label}
              </Text>
              {contents.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.text}, in ${bucket.label}. Tap to remove.`}
                  onPress={() => unplace(item.id)}
                  style={[
                    styles.placedChip,
                    {
                      backgroundColor: theme.colors.background,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radii.sm,
                      paddingVertical: theme.spacing.xs,
                      paddingHorizontal: theme.spacing.sm,
                    },
                  ]}
                >
                  <Text variant="body">{item.text}</Text>
                </Pressable>
              ))}
            </Pressable>
          );
        })}
      </View>

      <Button
        title="Check"
        variant="primary"
        disabled={!allPlaced}
        onPress={handleSubmit}
        accessibilityLabel="Check your answer"
        accessibilityHint={
          allPlaced ? undefined : 'Place every item in a bucket first'
        }
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Draggable tray item
 * ------------------------------------------------------------------ */

interface DraggableItemProps {
  label: string;
  selected: boolean;
  reduceMotion: boolean;
  /**
   * Read the current bucket layouts (bucket id -> on-screen rectangle) for
   * hit-testing a drag release. A getter, not a ref, so the gesture handler
   * closes over a plain function and always sees fresh layouts.
   */
  getBucketLayouts: () => Record<string, LayoutRectangle>;
  /** Report a plain tap (the accessible, no-drag selection path). */
  onTap: () => void;
  /** Report that a drag released over the bucket with this id. */
  onDropInBucket: (bucketId: string) => void;
}

/**
 * A tray item that can be tapped (accessible path) or dragged (enhancement).
 * The drag follows the finger via an {@link Animated.ValueXY}; on release it
 * hit-tests the finger position against the current bucket layouts and, if it
 * landed on one, reports a drop. Otherwise it springs back. The item is always
 * tappable, so dragging is never required (requirement 4.4).
 *
 * Gesture-local state (the last finger position and whether the touch moved far
 * enough to be a drag) lives in plain variables captured by the responder's
 * `useMemo`, mirroring CardsStep: no refs are read inside the handlers, so the
 * handler stays stable without tripping the hooks lint rules. The responder is
 * rebuilt only when its callbacks change.
 */
function DraggableItem({
  label,
  selected,
  reduceMotion,
  getBucketLayouts,
  onTap,
  onDropInBucket,
}: DraggableItemProps) {
  const theme = useTheme();
  const pan = useMemo(() => new Animated.ValueXY({ x: 0, y: 0 }), []);

  // The PanResponder, rebuilt only when its callbacks change (mirroring
  // CardsStep). It holds no mutable closure state: the release handler reads the
  // finger's absolute screen position from the gesture state (`moveX`/`moveY`)
  // to hit-test the buckets, and the responder only claims the gesture once the
  // touch actually moves — so a stationary press falls through to the
  // Pressable's onPress (the tap path) while a real drag is captured here.
  const panHandlers = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
        onPanResponderMove: (_e, g) => {
          pan.setValue({ x: g.dx, y: g.dy });
        },
        onPanResponderRelease: (_e, g) => {
          // `moveX`/`moveY` are the finger's latest screen coordinates, in the
          // same page space as the bucket layouts.
          const hit = Object.entries(getBucketLayouts()).find(([, rect]) =>
            withinRect(g.moveX, g.moveY, rect),
          );
          if (hit) {
            onDropInBucket(hit[0]);
            // The item will unmount from the tray (now placed); reset for safety.
            pan.setValue({ x: 0, y: 0 });
          } else {
            springBack(pan, reduceMotion);
          }
        },
        onPanResponderTerminate: () => springBack(pan, reduceMotion),
      }).panHandlers,
    [pan, getBucketLayouts, onDropInBucket, reduceMotion],
  );

  // The tap target is a plain Pressable (the required, fully accessible path,
  // requirement 4.4). The drag enhancement lives on the wrapping Animated.View:
  // its responder only claims the touch once it actually moves
  // (`onMoveShouldSetPanResponder`), so a stationary press falls straight
  // through to the Pressable's onPress.
  return (
    <Animated.View style={{ transform: pan.getTranslateTransform() }} {...panHandlers}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Tap to select, then tap a bucket to place it"
        accessibilityState={{ selected }}
        onPress={onTap}
        style={({ pressed }) => [
          styles.trayChip,
          {
            borderColor: selected ? theme.colors.primary : theme.colors.border,
            borderWidth: selected ? 2 : 1,
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radii.md,
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
          },
          pressed && styles.pressed,
        ]}
      >
        <Text variant="body" color={selected ? 'primary' : 'text'}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** Whether a page point falls inside a laid-out rectangle. */
function withinRect(x: number, y: number, rect: LayoutRectangle): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

/** Animate a dragged item back to its origin after a miss. */
function springBack(pan: Animated.ValueXY, reduceMotion: boolean) {
  if (reduceMotion) {
    pan.setValue({ x: 0, y: 0 });
    return;
  }
  Animated.timing(pan, {
    toValue: { x: 0, y: 0 },
    duration: SNAP_BACK_MS,
    useNativeDriver: true,
  }).start();
}

const styles = StyleSheet.create({
  card: { width: '100%' },
  tray: { width: '100%', flexDirection: 'row', flexWrap: 'wrap' },
  buckets: { width: '100%' },
  bucket: { width: '100%', minHeight: 56 },
  trayChip: { minHeight: 44, justifyContent: 'center' },
  placedChip: { alignSelf: 'flex-start' },
  pressed: { opacity: 0.8 },
});
