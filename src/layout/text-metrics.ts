/**
 * Planning-time text measurement against the bundled font (ADR 0063).
 *
 * A preset expands synchronously, before any browser exists, yet it must
 * size a label's box, wrap a panel and space tick numbers. It used to guess
 * (0.56em a character), and the figure it planned was then laid out by
 * Chromium in whatever face the host resolved -- Segoe UI on Windows, Noto
 * Sans on the Linux CI -- so the same input planned one figure and drew
 * another, differently on each OS.
 *
 * Now both sides read the same bytes. `measureText` sums the bundled face's
 * own advance widths at the requested weight (HVAR on the weight axis), which
 * is exactly what Chromium's HTML mirror does with the same file: kerning is
 * off in the mirror and in the exported SVG (html.ts, svg.ts), and GSUB
 * substitutions in this face keep their advances, so the sum is Chromium's
 * width to within its 1/64px layout unit. `tests/text-metrics.test.ts` holds
 * the two to 1px across strings, sizes, weights and tracking.
 *
 * What it cannot know:
 *   - A character the bundled face lacks (ℝ, ∈, ∪, CJK) is drawn by a host
 *     fallback whose width depends on the host. It is budgeted at
 *     `FALLBACK_EM` of the size -- the old estimate, slightly generous.
 *   - Whitespace collapsing and wrapping: the caller passes a line as it
 *     will be set, or several separated by "\n" (the widest is returned).
 */

import type { Font } from "opentype.js";
import { bundledWeight, glyphAdvanceUnits, loadBundledFont } from "../export/fonts.ts";

export type TextStyle = {
  /** Font size in px. */
  size: number;
  /** CSS weight; clamped into the bundled face's 400–700 axis. Default 400. */
  weight?: number;
  /** Letter spacing in px, added after every character as CSS does. Default 0. */
  tracking?: number;
};

/** Width budgeted for a character the bundled face does not cover, in em. */
export const FALLBACK_EM = 0.6;

/** Default-ignorable characters: no advance whether or not the face maps them. */
const ZERO_WIDTH = /[​-‏⁠-⁤﻿­]/u;
const COMBINING = /\p{M}/u;
const LETTER = /\p{L}/u;
const NARROW_NBSP = " ";

type Advance = { units: number; covered: boolean };

let font: Font | undefined;
let unitsPerEm = 1000;
/** Per weight: code point -> advance in font units (or uncovered). */
const advanceCache = new Map<number, Map<string, Advance>>();
/** Whole-string results; cleared rather than evicted, it is only a speed-up. */
const widthCache = new Map<string, number>();
const WIDTH_CACHE_LIMIT = 50_000;

function advanceOf(ch: string, weight: number): Advance {
  if (font === undefined) {
    font = loadBundledFont();
    unitsPerEm = font.unitsPerEm;
  }
  let table = advanceCache.get(weight);
  if (table === undefined) {
    table = new Map();
    advanceCache.set(weight, table);
  }
  let hit = table.get(ch);
  if (hit === undefined) {
    const glyph = font.charToGlyph(ch);
    hit = glyph.index === 0 ? { units: 0, covered: false } : { units: glyphAdvanceUnits(font, glyph, weight), covered: true };
    table.set(ch, hit);
  }
  return hit;
}

/**
 * Whether letter spacing applies to this line, as Chromium decides it.
 *
 * Chromium turns letter spacing off for a run it itemises as a cursive
 * script. U+202F -- the narrow no-break space that groups digits, "12 000"
 * -- belongs to both Latin and Mongolian, so a line with no letter to
 * settle it ("12 000", "(12 000; 3)") is itemised as Mongolian and set with
 * no tracking at all, while "P = 12 000 W" is Latin and tracked. Measured,
 * not derived from the spec: see tests/text-metrics.test.ts. One case is
 * not modelled: brackets are itemised apart from what they hold, and the
 * bracketed group comes out with ONE character tracked -- a single tracking
 * unit, 0.1px at the presets' tracking.
 */
export function trackingApplies(line: string): boolean {
  if (!line.includes(NARROW_NBSP)) return true;
  for (const ch of line) if (LETTER.test(ch)) return true;
  return false;
}

function lineWidth(line: string, size: number, weight: number, tracking: number): number {
  let units = 0;
  let fallbackPx = 0;
  let characters = 0;
  for (const ch of line) {
    if (ZERO_WIDTH.test(ch)) continue;
    const advance = advanceOf(ch, weight);
    if (advance.covered) units += advance.units;
    else if (!COMBINING.test(ch)) fallbackPx += FALLBACK_EM * size;
    // Tracking goes after each character a reader sees; a combining mark
    // joins the character before it.
    if (!COMBINING.test(ch)) characters += 1;
  }
  const spacing = tracking !== 0 && trackingApplies(line) ? characters * tracking : 0;
  return (units * size) / unitsPerEm + fallbackPx + spacing;
}

/**
 * The width, in px, of the widest line of `text` set in the bundled face --
 * what Chromium will lay out, not a bound on it. Callers add their own slack.
 */
export function measureText(text: string, style: TextStyle): number {
  const weight = bundledWeight(style.weight);
  const tracking = style.tracking ?? 0;
  const key = `${style.size}|${weight}|${tracking}|${text}`;
  const hit = widthCache.get(key);
  if (hit !== undefined) return hit;
  let widest = 0;
  for (const line of text.split("\n")) widest = Math.max(widest, lineWidth(line, style.size, weight, tracking));
  if (widthCache.size >= WIDTH_CACHE_LIMIT) widthCache.clear();
  widthCache.set(key, widest);
  return widest;
}

/** True when every visible character of `text` is drawn by the bundled face. */
export function bundledCovers(text: string): boolean {
  for (const ch of text) {
    if (ch === "\n" || ZERO_WIDTH.test(ch) || COMBINING.test(ch)) continue;
    if (!advanceOf(ch, 400).covered) return false;
  }
  return true;
}
