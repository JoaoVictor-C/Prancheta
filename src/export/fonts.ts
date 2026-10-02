/**
 * The bundled font: the face every figure is set in, measured, embedded and
 * outlined (decisions 0008 and 0063).
 *
 * Neither export mode tries to locate and embed whatever font Chromium
 * happened to resolve on the machine that rendered a figure -- that is a
 * cross-platform font-file-discovery problem with no clean answer, and this
 * project does not need to solve it to keep its actual promise. Instead
 * Prancheta ships one font of its own, under `assets/fonts/`: Inter, SIL Open
 * Font License, redistributable, named internally as "Prancheta Sans" so it
 * is never confused with a claim about system Inter.
 *
 * ONE file serves every consumer (ADR 0063): `Inter-Text-Variable.woff`,
 * derived from upstream `Inter-Variable.ttf` by
 * `scripts/make-font-instance.py` -- optical size pinned at 14 ("Text"), the
 * weight axis kept from 400 to 700. The HTML mirror loads it as `@font-face`
 * so Chromium lays figures out in it at their real weight (no synthesised
 * bold); `embed` inlines the same bytes; `outline` and planning-time
 * measurement (`layout/text-metrics.ts`) parse it with opentype.js, which
 * reads WOFF but not WOFF2. Four consumers of one file cannot disagree about
 * which glyphs they are looking at.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import type { Font, Glyph, RenderOptions } from "opentype.js";

const here = dirname(fileURLToPath(import.meta.url));
const fontsDir = join(here, "..", "..", "assets", "fonts");

export const BUNDLED_FONT_FAMILY = "Prancheta Sans";

/**
 * The stack every figure names: the bundled face first, then what a host
 * falls back to for a character the bundled face does not cover (CJK, ℝ, ∈).
 * Only the fallback is host-dependent, and only for those characters.
 */
export const BUNDLED_FONT_STACK = `"${BUNDLED_FONT_FAMILY}", "Segoe UI", "Noto Sans", system-ui, sans-serif`;

/** The weight axis the bundled face carries; a weight outside it is clamped, by the browser and by measurement alike. */
export const BUNDLED_WEIGHT_RANGE = { min: 400, max: 700 } as const;

const FONT_PATH = join(fontsDir, "Inter-Text-Variable.woff");

/** Clamp a CSS weight into the bundled face's axis, as Chromium's font matching does. */
export function bundledWeight(weight: number | undefined): number {
  const w = weight ?? 400;
  return Math.min(BUNDLED_WEIGHT_RANGE.max, Math.max(BUNDLED_WEIGHT_RANGE.min, w));
}

let cachedFaceCss: string | undefined;

/**
 * The `@font-face` rule embedding the bundled WOFF, base64-encoded, with
 * its weight range declared so a bold label is drawn at wght 700 rather than
 * synthesised. Synchronous, for callers (the HTML mirror builder) that cannot
 * go async without rippling an `await` through every layout function above
 * them; built once per process, since every layout pass asks for it.
 */
export function bundledFontFaceCssSync(): string {
  if (cachedFaceCss === undefined) {
    const bytes = readFileSync(FONT_PATH);
    cachedFaceCss =
      `@font-face { font-family: "${BUNDLED_FONT_FAMILY}"; ` +
      `src: url(data:font/woff;base64,${bytes.toString("base64")}) format("woff"); ` +
      `font-weight: ${BUNDLED_WEIGHT_RANGE.min} ${BUNDLED_WEIGHT_RANGE.max}; }`;
  }
  return cachedFaceCss;
}

let cachedFont: Font | undefined;

/** The bundled font's glyph table, parsed once. */
export function loadBundledFont(): Font {
  if (cachedFont === undefined) {
    const bytes = readFileSync(FONT_PATH);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    cachedFont = opentype.parse(arrayBuffer);
  }
  return cachedFont;
}

/** The name `outline` mode has always used; the same parsed font. */
export const loadOutlineFont = loadBundledFont;

type VariationProcessor = {
  getVariableAdjustment(gid: number, table: string, parameter: string, coords: Record<string, number>): number;
};

/**
 * A glyph's advance at `weight`, in font units: the default advance plus the
 * HVAR delta for that point on the weight axis.
 *
 * Read from `_advanceWidth` when opentype.js has stashed one: its
 * `getTransform` (which `getPath` calls for a variable font) OVERWRITES
 * `glyph.advanceWidth` with the varied value of whatever weight it was last
 * asked for, and keeps the original in `_advanceWidth`. Reading
 * `advanceWidth` after an outline at 700 would otherwise give 700's advance
 * to a later measurement at 400.
 */
export function glyphAdvanceUnits(font: Font, glyph: Glyph, weight: number): number {
  const stash = glyph as Glyph & { _advanceWidth?: number };
  const base = stash._advanceWidth ?? glyph.advanceWidth ?? 0;
  const w = bundledWeight(weight);
  if (w === 400) return base;
  const processor = (font as Font & { variation?: { process?: VariationProcessor } }).variation?.process;
  if (processor === undefined || !(font.tables as Record<string, unknown>).hvar) return base;
  return base + processor.getVariableAdjustment(glyph.index, "hvar", "advanceWidth", { wght: w });
}

export type GlyphOutline = {
  /** SVG path data, positioned with its own origin at (0, 0) on the baseline. */
  d: string;
  /** How far this glyph advances the pen, in the same units as fontSize. */
  advance: number;
  /** True when the bundled font has no real glyph for this character. */
  notdef: boolean;
};

/**
 * One character's outline at `weight`, already positioned at (x, y) -- y is
 * the baseline, matching every other coordinate render/svg.ts works in.
 *
 * Per-character, not per-string: `font.getPath(fullString, ...)` runs
 * opentype.js's OpenType-feature (GSUB) shaping pipeline, which throws on a
 * ligature-substitution format this build of Inter's variable font uses and
 * opentype.js does not implement. `charToGlyph` bypasses that pipeline
 * entirely, which is also exactly what this project needs: every position is
 * already known per character from measure.ts's own Range-based measurement,
 * so no shaping was ever going to be used for placement. Positioning here
 * rather than via an SVG `transform` keeps every emitted `<path>`'s `d`
 * attribute self-contained -- one fewer thing a downstream tool has to apply
 * correctly to see the glyph where it belongs.
 */
export function outlineForChar(
  font: Font,
  char: string,
  x: number,
  y: number,
  fontSize: number,
  weight = 400,
): GlyphOutline {
  const glyph = font.charToGlyph(char);
  const scale = fontSize / font.unitsPerEm;
  const advance = glyphAdvanceUnits(font, glyph, weight) * scale;
  if (char === " " || char === " ") return { d: "", advance, notdef: false };
  const w = bundledWeight(weight);
  const path =
    w === 400
      ? glyph.getPath(x, y, fontSize)
      : glyph.getPath(x, y, fontSize, { variation: { wght: w } } as RenderOptions, font);
  return { d: path.toPathData(2), advance, notdef: glyph.index === 0 };
}

/**
 * Does any character in this string fall outside the bundled font's real
 * coverage? True for the first `.notdef` (glyph index 0) hit -- the bundled
 * font is Latin/Greek/Cyrillic; CJK and other scripts it was never designed
 * for are the expected, not-a-bug case this is built to catch, so a line
 * containing one can fall back to ordinary `<text>` instead of a blank box
 * glyph or a silently wrong claim of full outline coverage.
 */
export function lineNeedsTextFallback(font: Font, text: string): boolean {
  for (const char of text) {
    if (char === " " || char === " ") continue;
    if (font.charToGlyph(char).index === 0) return true;
  }
  return false;
}
