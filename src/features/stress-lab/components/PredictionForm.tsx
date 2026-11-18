/**
 * PredictionForm (FR-33, Phase 2).
 *
 * Captured BEFORE a run: the student commits to a guess — will the portfolio
 * gain or lose, roughly how much, and which holding will do best / worst — so
 * the results screen can show how close they were. Making the guess first is the
 * point: it turns the stress test into a "predict, then check" learning loop.
 *
 * Presentational and controlled by the parent: the parent owns the chosen
 * direction / estimate / picks and the submit action. This form only renders the
 * inputs and reports changes. It does not run the simulation or persist anything.
 */
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-provider';
import type { LabHolding } from '../engine/types';
import type { PredictionDirectionInput } from '../data/use-save-prediction';

/** The prediction the student has entered so far (all optional but direction). */
export interface PredictionDraft {
  direction: PredictionDirectionInput | null;
  /** Whole-percent estimate as typed (e.g. "-20"); parsed to bp on submit. */
  estimatePercent: string;
  pickedBest: string | null;
  pickedWorst: string | null;
}

export interface PredictionFormProps {
  /** Holdings the student can pick a best/worst from. */
  holdings: readonly LabHolding[];
  /** The current draft. */
  value: PredictionDraft;
  /** Report a draft change. */
  onChange: (next: PredictionDraft) => void;
  /** Submit the prediction (enabled once a direction is chosen). */
  onSubmit: () => void;
  /** True while the save is pending. */
  isSaving: boolean;
  /** True once a prediction has been saved (lets the parent lock the form). */
  saved: boolean;
}

export function PredictionForm({
  holdings,
  value,
  onChange,
  onSubmit,
  isSaving,
  saved,
}: PredictionFormProps) {
  const theme = useTheme();
  const canSubmit = value.direction !== null && !isSaving;

  return (
    <Card style={{ gap: theme.spacing.md }}>
      <Text variant="caption" color="textMuted" accessibilityRole="header">
        Before you run it — what do you think will happen?
      </Text>

      {/* Direction. */}
      <View style={[styles.row, { gap: theme.spacing.md }]}>
        {(['gain', 'lose'] as const).map((dir) => {
          const selected = value.direction === dir;
          return (
            <Toggle
              key={dir}
              label={dir === 'gain' ? 'My portfolio will gain' : 'My portfolio will lose'}
              selected={selected}
              disabled={saved || isSaving}
              onPress={() => onChange({ ...value, direction: dir })}
            />
          );
        })}
      </View>

      {/* Rough estimate. */}
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="caption" color="textMuted">
          Roughly how much, in percent? (optional)
        </Text>
        <TextInput
          accessibilityLabel="Estimated percentage change, optional"
          placeholder="e.g. -20"
          placeholderTextColor={theme.colors.textMuted}
          value={value.estimatePercent}
          onChangeText={(text) => onChange({ ...value, estimatePercent: text })}
          editable={!saved && !isSaving}
          keyboardType="numbers-and-punctuation"
          maxLength={6}
          style={[
            styles.input,
            {
              color: theme.colors.text,
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radii.sm,
              padding: theme.spacing.md,
            },
          ]}
        />
      </View>

      {/* Best / worst picks. */}
      {holdings.length > 0 ? (
        <>
          <PickerRow
            title="Which holding will do best? (optional)"
            holdings={holdings}
            selected={value.pickedBest}
            disabled={saved || isSaving}
            onPick={(symbol) => onChange({ ...value, pickedBest: symbol })}
          />
          <PickerRow
            title="Which holding will do worst? (optional)"
            holdings={holdings}
            selected={value.pickedWorst}
            disabled={saved || isSaving}
            onPick={(symbol) => onChange({ ...value, pickedWorst: symbol })}
          />
        </>
      ) : null}

      <Button
        title={saved ? 'Prediction saved' : 'Save my prediction'}
        variant="primary"
        onPress={onSubmit}
        loading={isSaving}
        disabled={!canSubmit || saved}
        accessibilityLabel="Save my prediction"
      />
    </Card>
  );
}

/** A single-select toggle button. */
function Toggle({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      title={label}
      variant={selected ? 'primary' : 'secondary'}
      disabled={disabled}
      onPress={onPress}
      accessibilityLabel={label}
    />
  );
}

/** A horizontal row of holding chips for best/worst picks. */
function PickerRow({
  title,
  holdings,
  selected,
  disabled,
  onPick,
}: {
  title: string;
  holdings: readonly LabHolding[];
  selected: string | null;
  disabled: boolean;
  onPick: (symbol: string | null) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="caption" color="textMuted">
        {title}
      </Text>
      <View style={[styles.chips, { gap: theme.spacing.sm }]}>
        {holdings.map((h) => {
          const isSelected = selected === h.symbol;
          return (
            <Button
              key={h.symbol}
              title={h.symbol}
              variant={isSelected ? 'primary' : 'secondary'}
              disabled={disabled}
              onPress={() => onPick(isSelected ? null : h.symbol)}
              accessibilityLabel={`Pick ${h.symbol}`}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'column',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  input: {
    borderWidth: 1,
  },
});
