/**
 * Theme tokens (requirement 7.4).
 *
 * Colors, spacing, and typography live here as data so every component reads
 * from one source and light/dark mode is a single lookup. This is the minimal
 * token set the provider stack (task 8) needs; the full UI kit task fleshes out
 * the component-level tokens and the shared presentational components in
 * src/components/ui. Keep values here (not inline in components) so the
 * documented contrast check in task 13 has one place to verify.
 */

/** Spacing scale in points. Multiples of 4 keep layouts on a consistent grid. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/** Font sizes in points, paired with the dynamic-type-friendly line heights. */
export const typography = {
  body: { fontSize: 16, lineHeight: 24 },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '600' },
  caption: { fontSize: 14, lineHeight: 20 },
} as const;

/** The set of text styles components can request by name via `<Text variant>`. */
export type TypographyVariant = keyof typeof typography;

/** Corner radii in points, shared by Card, Button, and other surfaces. */
export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
} as const;

/** The set of semantic colors every screen reads, resolved per color scheme. */
export interface ColorTokens {
  /** Screen background. */
  background: string;
  /** Raised surface (cards, sheets) sitting on `background`. */
  surface: string;
  /** Primary text on `background`. */
  text: string;
  /** Secondary / supporting text. */
  textMuted: string;
  /** Primary brand / action color. */
  primary: string;
  /** Text drawn on top of `primary`. */
  onPrimary: string;
  /** Error / destructive color. */
  danger: string;
  /** Text drawn on top of `danger`. */
  onDanger: string;
  /** Hairline borders and dividers. */
  border: string;
}

const lightColors: ColorTokens = {
  background: '#ffffff',
  surface: '#f4f4f4',
  text: '#111111',
  textMuted: '#444444',
  primary: '#1b5e20',
  onPrimary: '#ffffff',
  danger: '#b00020',
  onDanger: '#ffffff',
  // Darkened from #999999 so a control's visible boundary (e.g. the secondary
  // Button outline) clears WCAG AA 3:1 against both background and surface
  // (requirement 10.4). Verified in contrast.test.ts.
  border: '#767676',
};

const darkColors: ColorTokens = {
  background: '#121212',
  surface: '#1e1e1e',
  text: '#f5f5f5',
  textMuted: '#bbbbbb',
  primary: '#66bb6a',
  onPrimary: '#0a1f0b',
  danger: '#cf6679',
  onDanger: '#1a0005',
  // Lightened from #555555 so a control's visible boundary clears WCAG AA 3:1
  // against both background and surface (requirement 10.4). Verified in
  // contrast.test.ts.
  border: '#8a8a8a',
};

/** A fully resolved theme for one color scheme. */
export interface Theme {
  colorScheme: 'light' | 'dark';
  colors: ColorTokens;
  spacing: typeof spacing;
  typography: typeof typography;
  radii: typeof radii;
}

/** Build the resolved theme for a color scheme. */
export function getTheme(colorScheme: 'light' | 'dark'): Theme {
  return {
    colorScheme,
    colors: colorScheme === 'dark' ? darkColors : lightColors,
    spacing,
    typography,
    radii,
  };
}
