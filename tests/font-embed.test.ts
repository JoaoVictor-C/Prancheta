/**
 * SLOW TESTS: launch real Chromium. Decision 0008's font-embed feature only
 * means anything verified end to end -- unit tests over `src/export/fonts.ts`
 * alone would have missed both real bugs this milestone's manual testing
 * found (resvg silently ignoring `@font-face`, and the CJK notdef fallback
 * needing to degrade to `<text>` rather than draw a blank box), because both
 * are properties of the FULL pipeline, not of any one pure function.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";
import { parseSpec } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";
import type { FigureSpec } from "../src/ir/types.ts";
import {
  BUNDLED_FONT_FAMILY,
  loadOutlineFont,
  lineNeedsTextFallback,
  outlineForChar,
} from "../src/export/fonts.ts";

function specWith(label: string): FigureSpec {
  return parseSpec({
    version: 1,
    root: { type: "block", id: "subject", label, width: 460 },
  });
}

// --- pure glyph functions (fast) --------------------------------------------

test("loadOutlineFont parses the bundled WOFF and covers ordinary Latin", () => {
  const font = loadOutlineFont();
  assert.ok(font.unitsPerEm > 0);
  assert.equal(lineNeedsTextFallback(font, "Hello, world!"), false);
});

test("lineNeedsTextFallback is true for a script the bundled font does not cover", () => {
  const font = loadOutlineFont();
  assert.equal(lineNeedsTextFallback(font, "这是中文"), true);
});

test("lineNeedsTextFallback ignores plain and non-breaking spaces", () => {
  const font = loadOutlineFont();
  assert.equal(lineNeedsTextFallback(font, "a b c"), false);
});

test("outlineForChar returns real path data for a covered character", () => {
  const font = loadOutlineFont();
  const outline = outlineForChar(font, "H", 0, 0, 24);
  assert.ok(outline.d.length > 0);
  assert.equal(outline.notdef, false);
  assert.ok(outline.advance > 0);
});

test("outlineForChar reports notdef for an uncovered character without throwing", () => {
  const font = loadOutlineFont();
  const outline = outlineForChar(font, "中", 0, 0, 24);
  assert.equal(outline.notdef, true);
});

test("outlineForChar returns empty path data but real advance for a space", () => {
  const font = loadOutlineFont();
  const outline = outlineForChar(font, " ", 0, 0, 24);
  assert.equal(outline.d, "");
  assert.ok(outline.advance > 0);
});

// --- end-to-end (slow: real Chromium) ---------------------------------------

test(
  "fontEmbed: \"embed\" is the default (ADR 0063); \"none\" ships no font bytes but still names the face",
  { timeout: 60000 },
  async () => {
    const withoutOption = await render(specWith("Plain text"));
    const withEmbed = await render(specWith("Plain text"), { fontEmbed: "embed" });
    const withNone = await render(specWith("Plain text"), { fontEmbed: "none" });
    // The default carries the face: an SVG that only names it is a different
    // figure on every machine that lacks it.
    assert.equal(withoutOption.svg, withEmbed.svg);
    assert.ok(withoutOption.svg.includes("data:font/woff;base64,"));

    // What "none" means is that no font is INLINED, not that the bundled face
    // went unused. This assertion used to read `!includes(BUNDLED_FONT_FAMILY)`
    // -- "renders exactly as before this feature existed" -- and that premise
    // turned out to be the bug rather than the contract: measuring against
    // whatever face the host machine happened to resolve made the same spec a
    // different figure on a different machine, which CI found the first time it
    // ran on Linux. Every mode now measures against the bundled font, so every
    // mode names it, and only the export payload differs.
    assert.ok(!withNone.svg.includes("data:font/woff;base64,"));
    assert.ok(
      withNone.svg.includes(`font-family="&quot;${BUNDLED_FONT_FAMILY}&quot;`),
      "the exported svg must name the face it was measured against, FIRST",
    );
    // and the viewer is told not to kern, as the mirror did not
    assert.match(withNone.svg, /text \{ font-kerning: none; \}/);
  },
);

test(
  "fontEmbed: \"embed\" inlines a real @font-face and measures against it",
  { timeout: 60000 },
  async () => {
    const result = await render(specWith("Embedded font test"), { fontEmbed: "embed" });
    assert.match(result.svg, /<style>@font-face/);
    assert.match(result.svg, /data:font\/woff;base64,/);
    // the weight axis is declared, so a bold label is drawn at wght 700, not synthesised
    assert.match(result.svg, /font-weight: 400 700;/);
    assert.equal(result.manifest.ok, true);
  },
);

test(
  "fontEmbed: \"outline\" emits filled <path> glyphs, not <text>, for covered script",
  { timeout: 60000 },
  async () => {
    const result = await render(specWith("Outline test"), { fontEmbed: "outline" });
    assert.match(result.svg, /<path data-pr-id="subject--label"/);
    assert.ok(!result.svg.includes("<text"));
  },
);

test(
  "fontEmbed: \"outline\" falls back to <text> and warns for an uncovered script, rather than a blank glyph",
  { timeout: 60000 },
  async () => {
    const result = await render(specWith("这是中文测试"), { fontEmbed: "outline" });
    assert.match(result.svg, /<text data-pr-id="subject--label"/);
    assert.ok(!result.svg.includes("<path data-pr-id=\"subject--label\""));
    assert.ok(
      result.manifest.warnings.some((warning) => warning.includes("does not cover")),
      "expected a manifest warning naming the fallback",
    );
  },
);

test(
  "outline mode survives resvg with zero system fonts; the ordinary <text> baseline does not",
  { timeout: 60000 },
  async () => {
    const spec = specWith("Portable outline glyphs");
    const outlineResult = await render(spec, { fontEmbed: "outline" });
    const plainResult = await render(spec, { fontEmbed: "none" });

    const outlinePng = new Resvg(outlineResult.svg, { font: { loadSystemFonts: false } })
      .render()
      .asPng();
    const plainPng = new Resvg(plainResult.svg, { font: { loadSystemFonts: false } })
      .render()
      .asPng();

    // This is the actual claim of the feature: with resvg denied every
    // system font, outline mode must produce something visibly different
    // from what ordinary <text> produces under the same starvation -- proof
    // the glyph paths carry real ink rather than depending on a font resvg
    // does not have.
    const identical = outlinePng.length === plainPng.length && outlinePng.equals(plainPng);
    assert.equal(identical, false);
  },
);

test(
  "embed mode registers its @font-face in a fresh, unrelated Chromium page",
  { timeout: 60000 },
  async () => {
    // Not the page that rendered the figure -- a brand new one, which is
    // decision 0008's whole point about what "embed" claims: that the FILE
    // is self-contained, not that the process that made it remembers the font.
    const result = await render(specWith("Fresh page test"), { fontEmbed: "embed" });
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(`<!doctype html><html><body>${result.svg}</body></html>`, {
        waitUntil: "load",
      });
      await page.evaluate(() => document.fonts.ready);
      const families: string[] = await page.evaluate(() => {
        const set = new Set<string>();
        document.fonts.forEach((face) => set.add(face.family));
        return [...set];
      });
      assert.ok(
        families.some((family) => family.includes(BUNDLED_FONT_FAMILY)),
        `expected "${BUNDLED_FONT_FAMILY}" among registered fonts, got: ${families.join(", ")}`,
      );
    } finally {
      await browser.close();
    }
  },
);

test("the bundled font file exists, is the WOFF every mode reads, and carries the weight axis", () => {
  const woff = readFileSync(new URL("../assets/fonts/Inter-Text-Variable.woff", import.meta.url));
  assert.equal(woff.subarray(0, 4).toString("ascii"), "wOFF");
  const font = loadOutlineFont();
  const axes = (font.tables as { fvar?: { axes: { tag: string; minValue: number; maxValue: number }[] } }).fvar?.axes ?? [];
  // opsz is pinned out (ADR 0063): only weight varies, 400-700.
  assert.deepEqual(axes.map((a) => [a.tag, a.minValue, a.maxValue]), [["wght", 400, 700]]);

  // The upstream source it is derived from (scripts/make-font-instance.py).
  const ttf = readFileSync(new URL("../assets/fonts/Inter-Variable.ttf", import.meta.url));
  // sfnt version tag for TrueType-flavoured OpenType: 0x00010000.
  assert.deepEqual([...ttf.subarray(0, 4)], [0, 1, 0, 0]);
});

test("outlineForChar draws and advances a bold glyph at its weight", () => {
  const font = loadOutlineFont();
  const regular = outlineForChar(font, "W", 0, 0, 24, 400);
  const bold = outlineForChar(font, "W", 0, 0, 24, 700);
  assert.ok(bold.advance > regular.advance, `${bold.advance} > ${regular.advance}`);
  assert.notEqual(bold.d, regular.d);
  // and outlining at 700 does not leak 700's advance into a later 400 lookup
  assert.equal(outlineForChar(font, "W", 0, 0, 24, 400).advance, regular.advance);
});
