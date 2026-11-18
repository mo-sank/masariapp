/**
 * ScenarioPreviewSheet (FR-11, FR-12).
 *
 * A modal sheet that previews a scenario before the student runs it: the
 * economic environment, what caused it, the conditions simulated, the expected
 * market impacts, and the learning objective. The primary action runs the
 * stress test; it is DISABLED while a run is pending (so a slow run is never
 * double-submitted) and when the student has no holdings (nothing to test).
 *
 * Presentational: the parent owns the run mutation and passes `onRun`,
 * `isRunning`, and `canRun`; this sheet renders copy and the action.
 */
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';
import type { LabScenario } from '../data/use-scenarios';
import { SeverityBadge } from './SeverityBadge';

export interface ScenarioPreviewSheetProps {
  /** The scenario to preview, or null when the sheet is closed. */
  scenario: LabScenario | null;
  /** Run the stress test for this scenario. */
  onRun: () => void;
  /** Dismiss the sheet without running. */
  onClose: () => void;
  /** True while the run mutation is pending (disables + spins the action). */
  isRunning: boolean;
  /** False when there are no holdings to test (disables the action). */
  canRun: boolean;
}

export function ScenarioPreviewSheet({
  scenario,
  onRun,
  onClose,
  isRunning,
  canRun,
}: ScenarioPreviewSheetProps) {
  const theme = useTheme();
  const visible = scenario !== null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close preview"
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.background,
              borderTopLeftRadius: theme.radii.lg,
              borderTopRightRadius: theme.radii.lg,
              padding: theme.spacing.lg,
              paddingBottom: theme.spacing.xl,
              gap: theme.spacing.md,
            },
          ]}
        >
          {scenario ? (
            <>
              <View style={styles.headerRow}>
                <Text variant="title" color="text" style={styles.name} accessibilityRole="header">
                  {scenario.name}
                </Text>
                <SeverityBadge severity={scenario.severity} />
              </View>

              <ScrollView contentContainerStyle={{ gap: theme.spacing.md }}>
                <PreviewSection title="What it is" body={scenario.description} />
                <PreviewSection title="What caused it" body={scenario.cause} />
                <PreviewSection title="Conditions simulated" body={scenario.conditions} />
                <PreviewSection title="Expected market impact" body={scenario.expectedImpacts} />
                <PreviewSection title="What you'll learn" body={scenario.learningObjective} />
                {scenario.hasRecovery ? (
                  <Text variant="caption" color="textMuted">
                    This scenario also has a recovery phase you can explore after the crash.
                  </Text>
                ) : null}
              </ScrollView>

              {!canRun ? (
                <Text variant="caption" color="textMuted">
                  Add holdings in the brokerage to stress test them.
                </Text>
              ) : null}

              <Button
                title="Stress Test My Portfolio"
                variant="primary"
                onPress={onRun}
                loading={isRunning}
                disabled={!canRun || isRunning}
                accessibilityLabel={`Run the ${scenario.name} stress test`}
              />
              <Button title="Close" variant="secondary" onPress={onClose} />
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** One titled paragraph in the preview. */
function PreviewSection({ title, body }: { title: string; body: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="caption" color="textMuted" accessibilityRole="header">
        {title}
      </Text>
      <Text variant="body" color="text">
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '85%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: {
    flex: 1,
    minWidth: 0,
  },
});
