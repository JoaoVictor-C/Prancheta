/**
 * The bundled font, and what it costs to embed or outline it (decision 0008).
 *
 * Neither mode below tries to locate and embed whatever font Chromium
 * happened to resolve on the machine that rendered a figure -- that is a
 * cross-platform font-file-discovery problem with no clean answer, and this
 * project does not need to solve it to keep its actual promise. Instead
 * Prancheta ships one font of its own, under `assets/fonts/`: Inter, SIL Open
 * Font License, redistributable, named internally as "Prancheta Sans" so it
 * is never confused with a claim about system Inter.
 *
 * Both files matter and are not interchangeable:
 *   - `Inter-Regular.woff2` is what `embed` mode inlines, and what the HTML
 *     mirror loads via `@font-face` so Chromium *measures* against the exact
 *     bytes that will ship (decision 0001's invariant, kept rather than
 *     excepted).
 *   - `Inter-Variable.ttf` is what `outline` mode parses with `opentype.js`
 *     to get real glyph outlines. `opentype.js` cannot decode WOFF2's Brotli
 *     compression, hence the second file; both come from the same upstream
 *     release so their glyph shapes and metrics agree.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import type { Font } from "opentype.js";

const here = dirname(fileURLToPath(import.meta.url));
const fontsDir = join(here, "..", "..", "assets", "fonts");

export const BUNDLED_FONT_FAMILY = "Prancheta Sans";

const WOFF2_PATH = join(fontsDir, "Inter-Regular.woff2");
const OUTLINE_PATH = join(fontsDir, "Inter-Variable.ttf");

/**
 * The `@font-face` rule embedding the bundled WOFF2, base64-encoded.
 * Synchronous, for callers (the HTML mirror builder) that cannot go async
 * without rippling an `await` through every layout function above them.
 * Not cached, but the
 * OS page cache makes the repeat cost negligible against a headless-Chromium
 * layout pass.
 */
export function bundledFontFaceCssSync(): string {
  const bytes = readFileSync(WOFF2_PATH);
  return (
    `@font-face { font-family: "${BUNDLED_FONT_FAMILY}"; ` +
    `src: url(data:font/woff2;base64,${bytes.toString("base64")}) format("woff2"); }`
  );
}

let cachedOutlineFont: Font | undefined;

/** The bundled font's glyph table, parsed once. Used only by `outline` mode. */
export function loadOutlineFont(): Font {
  if (cachedOutlineFont === undefined) {
    const bytes = readFileSync(OUTLINE_PATH);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    cachedOutlineFont = opentype.parse(arrayBuffer);
  }
  return cachedOutlineFont;
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
 * One character's outline, already positioned at (x, y) -- y is the
 * baseline, matching every other coordinate render/svg.ts works in.
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
): GlyphOutline {
  const glyph = font.charToGlyph(char);
  const scale = fontSize / font.unitsPerEm;
  const advance = (glyph.advanceWidth ?? 0) * scale;
  if (char === " " || char === " ") return { d: "", advance, notdef: false };
  const path = glyph.getPath(x, y, fontSize);
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
