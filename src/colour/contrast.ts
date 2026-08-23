/**
 * WCAG contrast, and nothing more than WCAG contrast (decision 0007).
 *
 * This is the whole of what `contrast-sufficient` needs, and it is
 * deliberately the standard formula rather than a perceptual model this
 * project invented: WCAG 2.x relative luminance and contrast ratio, computed
 * from the colour string a browser actually reports, the way every browser
 * devtools contrast checker computes it. Anyone can independently verify a
 * failure this check reports.
 *
 * The parser matters more than it looks. The first version of this module
 * only understood `#rrggbb`, on the assumption that a spec author writes hex
 * and that is what would be measured. It is not: `getComputedStyle` in
 * Chromium normalises EVERY colour -- hex, named, already-`rgb()` -- to
 * `rgb(r, g, b)` or `rgba(r, g, b, a)` before this project ever sees it, and
 * a `background: transparent` block normalises to `rgba(0, 0, 0, 0)`, not the
 * string `"transparent"`. A hex-only parser made the check pass on every real
 * render for the wrong reason -- everything came back not-applicable -- which
 * is the exact vacuous-check failure this project's own philosophy warns
 * against, caught only by running a real fixture through the full pipeline
 * rather than trusting synthetic PlacedBox/PlacedText objects built by hand.
 * `parseColour` below understands hex and `rgb()`/`rgba()` for that reason.
 *
 * Two known simplifications, both documented rather than hidden:
 *
 *   - A colour with 0 < alpha < 1 is measured on its own R/G/B, uncomposited
 *     against whatever sits behind it. Real alpha compositing needs the
 *     background colour as an input this function does not have; this project
 *     only actually produces alpha 0 (fully transparent, handled explicitly
 *     as "unmeasurable, fall back to what is behind it") or alpha 1 today.
 *   - "Large text" (the 3:1 WCAG threshold instead of 4.5:1) is never
 *     applied, because the IR carries no bold/weight flag to combine with
 *     font size the way the WCAG definition requires. Every check here uses
 *     the stricter 4.5:1 normal-text threshold unconditionally, which can
 *     only produce a false failure on genuinely large bold text, never a
 *     false pass.
 */

export const WCAG_AA_NORMAL = 4.5;

export type ParsedColour = { r: number; g: number; b: number; a: number };

const HEX_PATTERN = /^#([0-9a-fA-F]{3,8})$/;
const RGB_FUNCTION_PATTERN = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/;

/**
 * Parses `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa`, `rgb(r, g, b)`,
 * `rgba(r, g, b, a)`, or the literal `"transparent"`. Returns null for
 * anything else (a named CSS colour like `"red"`, which is never what a real
 * render reports but could appear in a hand-built figure never sent through
 * the browser).
 */
export function parseColour(value: string): ParsedColour | null {
  const trimmed = value.trim();
  if (trimmed === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

  const hexMatch = HEX_PATTERN.exec(trimmed);
  if (hexMatch) {
    let hex = hexMatch[1]!;
    if (hex.length === 3 || hex.length === 4) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }
    if (hex.length !== 6 && hex.length !== 8) return null;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    if ([r, g, b].some((c) => Number.isNaN(c))) return null;
    return { r, g, b, a };
  }

  const rgbMatch = RGB_FUNCTION_PATTERN.exec(trimmed);
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    const a = rgbMatch[4] === undefined ? 1 : Number(rgbMatch[4]);
    if ([r, g, b, a].some((c) => Number.isNaN(c))) return null;
    return { r, g, b, a };
  }

  return null;
}

/** Legacy name kept for callers that only ever handed this hex; identical to parseColour. */
export const parseHexColour = parseColour;

/** True for a colour this project would treat as "nothing painted there". */
export function isTransparent(value: string): boolean {
  const parsed = parseColour(value);
  return parsed !== null && parsed.a === 0;
}

function channelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance, 0 (black) to 1 (white). Ignores alpha. */
export function relativeLuminance(value: string): number | null {
  const rgb = parseColour(value);
  if (rgb === null) return null;
  return (
    0.2126 * channelToLinear(rgb.r) + 0.7152 * channelToLinear(rgb.g) + 0.0722 * channelToLinear(rgb.b)
  );
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
