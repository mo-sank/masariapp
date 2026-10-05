/**
 * Disclaimer (requirements 5.4, 13.1).
 *
 * The persistent safety footer shown on every price and trade screen:
 * "Paper money. Educational only. Not financial advice." It makes clear the app
 * is a learning sandbox, not real trading or investment advice (requirement
 * 13.1). The copy is intentionally fixed — screens render this component rather
 * than retyping the words so the wording stays identical everywhere and a copy
 * review (task 16) has one source of truth.
 *
 * Lives in the shared UI kit (not the trading feature) because both the trading
 * screens and the broader copy-review task use it. Purely presentational and
 * themed; marked as a note for assistive tech.
 */
import { StyleSheet, View } from 'react-native';

import { Text } from './text';
import { useTheme } from '../../theme/theme-provider';

export interface DisclaimerProps {
  /** Optional style merged onto the container (e.g. extra top margin). */
  style?: object;
}

/** The exact, reviewed disclaimer copy (requirement 13.1). */
export const DISCLAIMER_TEXT = 'Paper money. Educational only. Not financial advice.';

export function Disclaimer({ style }: DisclaimerProps) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={DISCLAIMER_TEXT}
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.sm,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
        },
        style,
      ]}
    >
      <Text variant="caption" color="textMuted" style={styles.text}>
        {DISCLAIMER_TEXT}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
  },
  text: {
    textAlign: 'center',
  },
});
