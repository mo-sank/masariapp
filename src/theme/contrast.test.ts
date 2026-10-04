/**
 * Documented contrast check of the theme tokens (requirement 10.4).
 *
 * This test IS the "documented contrast check" the requirement calls for: it
 * asserts every color pairing the app renders meets the relevant WCAG 2.1 AA
 * threshold, in both light and dark mode. If a token changes and drops a
 * pairing below AA, this test fails — so contrast cannot silently regress.
 *
 * Thresholds:
 *   - Normal body text: >= 4.5:1 (AA_NORMAL)
 *   - Large text and the visible boundary of UI components: >= 3:1 (AA_LARGE)
 *
 * Note (requirement 10.4): this verifies the token math only. Full WCAG AA
 * conformance also needs manual assistive-technology testing, tracked in task
 * 13's device pass.
 */
import { contrastRatio, hexToRgb, AA_NORMAL, AA_LARGE } from './contrast';
import { getTheme } from './tokens';

describe('hexToRgb', () => {
  it('parses #rrggbb', () => {
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('#1b5e20')).toEqual({ r: 27, g: 94, b: 32 });
  });

  it('expands #rgb shorthand', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('rejects malformed hex', () => {
    expect(() => hexToRgb('#12')).toThrow();
    expect(() => hexToRgb('#zzzzzz')).toThrow();
  });
});

describe('contrastRatio', () => {
  it('is 21:1 for black on white and 1:1 for identical colors', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('is order-independent', () => {
    expect(contrastRatio('#111111', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#111111'), 5);
  });
});

describe('theme token contrast (WCAG AA)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    describe(`${scheme} mode`, () => {
      const { colors } = getTheme(scheme);

      // Normal-size text must clear 4.5:1 against every surface it sits on.
      const normalText: [string, string, string][] = [
        ['text on background', colors.text, colors.background],
        ['textMuted on background', colors.textMuted, colors.background],
        ['text on surface', colors.text, colors.surface],
        ['textMuted on surface', colors.textMuted, colors.surface],
        ['onPrimary on primary (button fill)', colors.onPrimary, colors.primary],
        ['onDanger on danger (button/toast fill)', colors.onDanger, colors.danger],
        ['primary as text on background (secondary label)', colors.primary, colors.background],
        ['primary as text on surface', colors.primary, colors.surface],
        ['danger as text on background', colors.danger, colors.background],
        ['danger as text on surface', colors.danger, colors.surface],
      ];

      it.each(normalText)('%s meets 4.5:1', (_label, fg, bg) => {
        expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
      });

      // A control's visible boundary needs only 3:1 (UI component contrast).
      const uiBoundaries: [string, string, string][] = [
        ['border on background', colors.border, colors.background],
        ['border on surface', colors.border, colors.surface],
      ];

      it.each(uiBoundaries)('%s meets 3:1', (_label, fg, bg) => {
        expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_LARGE);
      });
    });
  }
});
