/**
 * Toast (requirements 7.3, 10.2).
 *
 * A lightweight, app-wide transient message. `ToastProvider` owns the single
 * active toast and renders it as an overlay pinned above the safe area; screens
 * trigger one with the `useToast()` hook: `toast.show('Saved')`. A toast
 * auto-dismisses after a timeout and can be dismissed by tapping it.
 *
 * Motion (requirement 10.3): the toast fades in on appear, but only when the OS
 * "reduce motion" setting is off. With reduce-motion on it appears instantly
 * (opacity pinned to 1) — the fade is non-essential, so we skip it. Each toast
 * announces itself with the `alert` role / live region so screen readers read it
 * out regardless of motion.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from './text';
import { useReduceMotion } from '../../theme/use-reduce-motion';
import { useTheme } from '../../theme/theme-provider';

export type ToastTone = 'default' | 'error';

export interface ToastOptions {
  /** Visual tone. `error` uses the danger color. Defaults to `default`. */
  tone?: ToastTone;
  /** Auto-dismiss delay in ms. Defaults to 3000. */
  durationMs?: number;
}

export interface ToastApi {
  /** Show a toast with the given message, replacing any current one. */
  show: (message: string, options?: ToastOptions) => void;
  /** Hide the current toast immediately. */
  hide: () => void;
}

interface ActiveToast {
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION = 3000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [active, setActive] = useState<ActiveToast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // One stable Animated.Value for the fade. A lazy useState initializer keeps a
  // single instance across renders without reading a ref during render.
  const [opacity] = useState(() => new Animated.Value(0));

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setActive(null);
  }, [clearTimer]);

  const show = useCallback(
    (message: string, options?: ToastOptions) => {
      clearTimer();
      setActive({ message, tone: options?.tone ?? 'default' });
      const duration = options?.durationMs ?? DEFAULT_DURATION;
      timer.current = setTimeout(() => setActive(null), duration);
    },
    [clearTimer],
  );

  // Clear any pending auto-dismiss timer when the provider unmounts so a
  // timeout never fires against a torn-down tree.
  useEffect(() => clearTimer, [clearTimer]);

  // Fade the toast in when one becomes active. Under reduce-motion we skip the
  // animation and snap to fully visible (requirement 10.3). The spring-free
  // timing keeps the motion subtle and non-essential.
  useEffect(() => {
    if (!active) {
      opacity.setValue(0);
      return;
    }
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    opacity.setValue(0);
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [active, reduceMotion, opacity]);

  const api = useMemo<ToastApi>(() => ({ show, hide }), [show, hide]);

  const background = active?.tone === 'error' ? theme.colors.danger : theme.colors.text;
  const textColor = active?.tone === 'error' ? theme.colors.onDanger : theme.colors.background;

  return (
    <ToastContext.Provider value={api}>
      {children}
      {active ? (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.overlay, { bottom: insets.bottom + theme.spacing.lg, opacity }]}
        >
          <Pressable
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            accessibilityLabel={active.message}
            onPress={hide}
            style={[styles.toast, { backgroundColor: background, borderRadius: theme.radii.md }]}
          >
            <Text variant="body" style={{ color: textColor }}>
              {active.message}
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

/**
 * Read the toast API. Throws if used outside `ToastProvider` so a missing
 * provider surfaces loudly in development rather than silently no-op'ing.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  toast: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    maxWidth: 480,
    minWidth: 120,
    alignItems: 'center',
    // Subtle shadow so the toast reads as floating above content.
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
