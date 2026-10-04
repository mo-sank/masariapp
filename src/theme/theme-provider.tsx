/**
 * Theme provider and `useTheme` hook (requirement 7.4).
 *
 * Resolves the active theme from the OS color scheme and exposes it through
 * context so components read tokens instead of hard-coding colors. It sits in
 * the root provider stack (per the design: Auth0Provider -> QueryClientProvider
 * -> ThemeProvider -> AuthGate). The full UI kit task builds the shared
 * components on top of this; here we provide the context the stack needs and a
 * safe default so components work even if rendered outside a provider in tests.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { getTheme, type Theme } from './tokens';

const ThemeContext = createContext<Theme>(getTheme('light'));

/**
 * Provide the resolved theme to the tree. Reads the OS color scheme via React
 * Native's `useColorScheme` (a stable core hook) so the app follows the system
 * light/dark setting and re-renders when it changes.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const theme = useMemo(() => getTheme(scheme === 'dark' ? 'dark' : 'light'), [scheme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** Read the active theme. Defaults to the light theme outside a provider. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
