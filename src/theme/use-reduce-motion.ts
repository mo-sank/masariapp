/**
 * useReduceMotion (requirement 10.3).
 *
 * Reports the OS "reduce motion" accessibility setting so components can skip
 * non-essential animations when the user has asked the system to minimize
 * motion. Reads the current value once on mount and subscribes to changes, so a
 * toggle in Settings takes effect without an app restart.
 *
 * Uses React Native's core `AccessibilityInfo` API (stable across SDKs): the
 * `isReduceMotionEnabled()` query plus the `reduceMotionChanged` event. Defaults
 * to `false` (motion allowed) until the first async read resolves, so animations
 * never block first paint.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** True when the OS "reduce motion" setting is on. */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Seed with the current OS value. Guard against a late resolve after unmount.
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) {
          setReduceMotion(enabled);
        }
      })
      .catch(() => {
        // If the query fails for any reason, keep the safe default (motion on).
      });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) =>
      setReduceMotion(enabled),
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
