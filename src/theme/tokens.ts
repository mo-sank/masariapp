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
  sm: 8,
  md: 14,
  lg: 20,
  pill: 9999,
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
  /** Darker primary shade for 3D button press bevels. */
  primaryDark: string;
  /** Error / destructive color. */
  danger: string;
  /** Text drawn on top of `danger`. */
  onDanger: string;
  /** Darker danger shade for 3D button press bevels. */
  dangerDark: string;
  /** Hairline borders and dividers. */
  border: string;
  /** Gamification: Streak fire color. */
  streak: string;
  /** Gamification: XP bolt color. */
  xp: string;
  /** Gamification: Freeze ice color. */
  freeze: string;
}

const lightColors: ColorTokens = {
  background: '#ffffff',
  surface: '#f8fafc',
  text: '#0f172a',
  textMuted: '#475569',
  primary: '#15803d',
  onPrimary: '#ffffff',
  primaryDark: '#166534',
  danger: '#dc2626',
  onDanger: '#ffffff',
  dangerDark: '#991b1b',
  border: '#828fa0',
  streak: '#ea580c',
  xp: '#2563eb',
  freeze: '#0284c7',
};

const darkColors: ColorTokens = {
  background: '#0f172a',
  surface: '#1e293b',
  text: '#f8fafc',
  textMuted: '#94a3b8',
  primary: '#4ade80',
  onPrimary: '#052e16',
  primaryDark: '#22c55e',
  danger: '#f87171',
  onDanger: '#450a0a',
  dangerDark: '#ef4444',
  border: '#64748b',
  streak: '#fb923c',
  xp: '#60a5fa',
  freeze: '#38bdf8',
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
