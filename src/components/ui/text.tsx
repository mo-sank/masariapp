/**
 * Text (requirements 7.4, 10.1).
 *
 * A thin wrapper over React Native's `Text` that pulls size, line height, and
 * color from theme tokens instead of hard-coded values, so every screen renders
 * consistent typography that follows light/dark mode. Pick a `variant` for the
 * size/weight and a `color` token for the ink; both default to body text.
 *
 * Dynamic type: we do NOT cap `maxFontSizeMultiplier`, so the OS text-size
 * setting scales this text freely (requirement 10.1). Line heights in the
 * tokens leave room for the larger sizes.
 */
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme } from '../../theme/theme-provider';
import type { ColorTokens, TypographyVariant } from '../../theme/tokens';

export interface TextProps extends RNTextProps {
  /** Typographic scale step. Defaults to `body`. */
  variant?: TypographyVariant;
  /** Which color token to paint the text with. Defaults to `text`. */
  color?: keyof ColorTokens;
}

/** Themed text. Composes token styles under any caller-supplied `style`. */
export function Text({ variant = 'body', color = 'text', style, ...rest }: TextProps) {
  const theme = useTheme();
  const typeStyle = theme.typography[variant];
  return <RNText style={[typeStyle, { color: theme.colors[color] }, style]} {...rest} />;
}
