/**
 * Button (requirements 7.4, 10.2).
 *
 * A themed pressable with three variants: `primary` (filled brand), `secondary`
 * (outlined), and `danger` (filled destructive). Colors, radius, and spacing all
 * come from theme tokens so the button tracks light/dark mode and stays
 * consistent across screens.
 *
 * Accessibility (10.2): exposes the `button` role, derives an accessibility
 * label from the title (overridable), and reports its disabled/busy state via
 * `accessibilityState`. While `loading` it shows a spinner and blocks presses so
 * a slow action is never triggered twice.
 */
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { Text } from './text';
import { useTheme } from '../../theme/theme-provider';
import type { ColorTokens } from '../../theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style' | 'disabled'> {
  /** Button label; also the default accessibility label. */
  title: string;
  /** Visual treatment. Defaults to `primary`. */
  variant?: ButtonVariant;
  /** Disable interaction and dim the control. */
  disabled?: boolean;
  /** Show a spinner and block presses while an action runs. */
  loading?: boolean;
}

/** Resolve the fill, border, borderBottom, and text colors for a variant. */
function variantColors(variant: ButtonVariant, colors: ColorTokens) {
  switch (variant) {
    case 'secondary':
      return {
        background: 'transparent',
        border: colors.border,
        borderBottom: colors.border,
        text: colors.primary,
      };
    case 'danger':
      return {
        background: colors.danger,
        border: colors.danger,
        borderBottom: colors.dangerDark,
        text: colors.onDanger,
      };
    case 'primary':
    default:
      return {
        background: colors.primary,
        border: colors.primary,
        borderBottom: colors.primaryDark,
        text: colors.onPrimary,
      };
  }
}

export function Button({
  title,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityLabel,
  onPress,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const c = variantColors(variant, theme.colors);
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: c.background,
          borderColor: c.border,
          borderBottomColor: c.borderBottom,
          borderRadius: theme.radii.md,
          paddingVertical: theme.spacing.md - 4,
          paddingHorizontal: theme.spacing.lg,
        },
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={c.text} />
      ) : (
        <View style={styles.content}>
          <Text variant="body" style={[styles.label, { color: c.text }]}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 2,
    borderBottomWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48, // comfortable tap target (>= 44pt)
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  pressed: {
    transform: [{ translateY: 2 }],
    borderBottomWidth: 2,
    opacity: 0.95,
  },
  disabled: {
    opacity: 0.5,
  },
});
