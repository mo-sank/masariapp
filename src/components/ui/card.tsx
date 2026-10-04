/**
 * Card (requirement 7.4).
 *
 * A rounded surface that groups related content. It reads its background,
 * border, radius, and padding from theme tokens so it sits correctly on the
 * screen background in both light and dark mode. Purely presentational: pass
 * children and an optional `style` to tune layout.
 */
import { View, type ViewProps } from 'react-native';

import { useTheme } from '../../theme/theme-provider';

export type CardProps = ViewProps;

export function Card({ style, children, ...rest }: CardProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: StyleSheetHairline,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.md,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

// A thin hairline border keeps the card edge crisp without a heavy outline.
const StyleSheetHairline = 1;
