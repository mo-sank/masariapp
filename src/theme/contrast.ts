/**
 * Contrast checking for theme tokens (requirement 10.4).
 *
 * A small, dependency-free implementation of the WCAG 2.1 contrast-ratio
 * formula so the theme's color pairings can be verified in a unit test (see
 * contrast.test.ts). Keeping the math here — next to the tokens — gives the
 * "documented contrast check of the theme tokens" the requirement asks for.
 *
 * Only the pairings the app actually renders are checked:
 *   - text / textMuted on background and on surface
 *   - onPrimary on primary, onDanger on danger (button/toast fills)
 *   - primary used as text (secondary button label, links) on background/surface
 *
 * References: WCAG 2.1 SC 1.4.3 (Contrast Minimum). AA requires >= 4.5:1 for
 * normal text and >= 3:1 for large text (>= 24px, or >= 18.66px bold) and for
 * UI component boundaries.
 */

/** WCAG AA minimum contrast ratio for normal-size body text. */
export const AA_NORMAL = 4.5;
/** WCAG AA minimum contrast ratio for large text and UI components. */
export const AA_LARGE = 3;

/** Parse a #rgb or #rrggbb hex string into 0-255 channel values. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '').trim();
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : normalized;
  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Convert one 0-255 channel to its linear-light value per WCAG. */
function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Relative luminance of a hex color per WCAG 2.1. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/**
 * Contrast ratio between two hex colors, from 1 (identical) to 21 (black on
 * white). Order of arguments does not matter.
 */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
