# theme

Design tokens (colors, spacing, radii, typography) with light and dark variants,
plus the `ThemeProvider` / `useTheme` that resolve the active scheme from the OS.

- `tokens.ts` — `spacing`, `typography`, `radii`, and `ColorTokens` for light and
  dark, assembled by `getTheme(scheme)`. All visual constants live here so the
  documented contrast check (task 13) has one place to verify.
- `theme-provider.tsx` — `ThemeProvider` (reads `useColorScheme`) and `useTheme()`.

Components in `src/components/ui` read from these tokens rather than hard-coding
colors, so light/dark mode is a single lookup.
