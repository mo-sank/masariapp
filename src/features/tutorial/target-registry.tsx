/**
 * Tutorial target registry (onboarding-revamp, first-run tour).
 *
 * The coachmark overlay needs to know WHERE each spotlighted UI element is on
 * screen so it can draw a highlight ring and position its tooltip. Elements can
 * live anywhere in the tree (e.g. individual tab buttons), so they publish their
 * measured rectangle into a shared registry via React context rather than the
 * overlay reaching into the layout.
 *
 * Flow:
 *   - {@link TutorialTargetProvider} holds a map of `id -> rect` in state and
 *     sits above both the overlay and the targets.
 *   - A target calls {@link useRegisterTutorialTarget}(id), gets back an
 *     `onLayout` handler and a ref-measuring callback, and reports its rect with
 *     `measureInWindow` once laid out.
 *   - {@link useTutorialTargets} returns the current map for the overlay.
 *
 * A rect is `{ x, y, width, height }` in window coordinates (what
 * `measureInWindow` yields), which is what the overlay positions against.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { View } from 'react-native';

/** A measured rectangle in window coordinates. */
export interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Map of registered target id -> its latest measured rect. */
export type TargetMap = Record<string, TargetRect>;

interface RegistryValue {
  targets: TargetMap;
  setTarget: (id: string, rect: TargetRect) => void;
}

const TutorialTargetContext = createContext<RegistryValue | null>(null);

/** Provide the shared target registry. Place above the overlay and the targets. */
export function TutorialTargetProvider({ children }: { children: ReactNode }) {
  const [targets, setTargets] = useState<TargetMap>({});

  const setTarget = useCallback((id: string, rect: TargetRect) => {
    setTargets((prev) => {
      const existing = prev[id];
      // Skip a state update when the rect is unchanged, so repeated layout
      // callbacks do not cause render churn.
      if (
        existing &&
        existing.x === rect.x &&
        existing.y === rect.y &&
        existing.width === rect.width &&
        existing.height === rect.height
      ) {
        return prev;
      }
      return { ...prev, [id]: rect };
    });
  }, []);

  const value = useMemo(() => ({ targets, setTarget }), [targets, setTarget]);

  return (
    <TutorialTargetContext.Provider value={value}>{children}</TutorialTargetContext.Provider>
  );
}

/** Read the current target map (used by the overlay). Empty outside a provider. */
export function useTutorialTargets(): TargetMap {
  return useContext(TutorialTargetContext)?.targets ?? {};
}

/**
 * Register a spotlightable target under `id`. Returns a `measure` callback that,
 * given the target's `View` ref, measures it in window coordinates and publishes
 * the rect. Call `measure` from the element's `onLayout` (and optionally after
 * interactions that move it). A no-op outside a provider so targets can render
 * standalone (e.g. in tests) without a registry.
 */
export function useRegisterTutorialTarget(id: string): (node: View | null) => void {
  const ctx = useContext(TutorialTargetContext);

  return useCallback(
    (node: View | null) => {
      if (!ctx || !node) {
        return;
      }
      node.measureInWindow((x, y, width, height) => {
        // Guard against the transient 0-size measurement some platforms emit
        // before layout settles.
        if (width > 0 && height > 0) {
          ctx.setTarget(id, { x, y, width, height });
        }
      });
    },
    [ctx, id],
  );
}
