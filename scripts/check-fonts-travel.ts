/**
 * Font-travel check (decision 0008).
 *
 * `check-independent.ts` asks whether an exported SVG survives leaving the
 * browser. This asks a narrower, later question: whether the TEXT in it
 * survives leaving the *machine that has the fonts*.
 *
 * The two font-embed modes earn different verification, not the same one,
 * because they were tested against different tools and one of them failed:
 *
 *   - `outline` converts every glyph to a filled path with zero runtime font
 *     dependency, and resvg is the right tool to prove that -- re-rendered
 *     with `loadSystemFonts: false`, the glyphs must still be there because
 *     nothing about a filled path depends on a font existing at all.
 *   - `embed` inlines the bundled WOFF2 as a `@font-face` data URI, which is
 *     valid per spec and works in Chromium, Illustrator and Inkscape --
 *     empirically verified NOT to work in resvg, because usvg (the parser
 *     resvg is built on) does not load fonts from `@font-face` at all, only
 *     from its own `fontFiles`/`fontDirs`/`loadSystemFonts` options. Testing
 *     `embed` against resvg would not test the file; it would test a known
 *     resvg gap, and either report a false failure or require quietly
 *     handing resvg the font file out-of-band, which would prove nothing
 *     about whether the SVG itself is self-contained. `embed` is instead
 *     verified against a fresh, unrelated Chromium page load: the tool its
 *     `@font-face` actually targets.
 *
 *   node scripts/check-fonts-travel.ts [outline|embed] [fixture.json]
 */

import { chromium } from "playwright";
import { Resvg } from "@resvg/resvg-js";
import { parseSpec } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";
import { readFile } from "node:fs/promises";

const mode = (process.argv[2] as "outline" | "embed" | undefined) ?? "outline";
const fixture = process.argv[3] ?? "fixtures/labelled-blocks.json";

if (mode !== "outline" && mode !== "embed") {
  console.error(`mode must be "outline" or "embed", got "${mode}"`);
  process.exit(2);
}

const spec = parseSpec(JSON.parse(await readFile(fixture, "utf8")));
const result = await render(spec, { fontEmbed: mode });

if (mode === "outline") {
  const png = new Resvg(result.svg, { font: { loadSystemFonts: false } }).render().asPng();

  // The baseline: the SAME figure, rendered the ordinary way (real <text>,
  // no embedding), through the SAME resvg with SAME loadSystemFonts:false.
  // With no fonts available at all, ordinary <text> draws nothing -- that is
  // the known-blank reference outline mode has to differ from to prove it
  // carries real ink rather than nothing, the same differential technique
  // tests/effects-portability.test.ts uses for filter effects.
  const baselineResult = await render(spec, { fontEmbed: "none" });
  const blankPng = new Resvg(baselineResult.svg, { font: { loadSystemFonts: false } })
    .render()
    .asPng();

  const identical = png.length === blankPng.length && png.equals(blankPng);
  if (identical) {
    console.error(
      `FAIL  outline mode rendered identically to plain <text> with no fonts available under ` +
        `resvg -- the outline is not actually carrying ink`,
    );
    process.exit(1);
  }
  console.log(`ok    outline mode: ${png.length} bytes, genuinely different from the no-font baseline`);
} else {
  const browser = await chromium.launch();
  try {
    // A FRESH, unrelated page -- this is not the page that rendered the
    // figure. It has never seen the bundled font except through whatever the
    // SVG itself carries, which is the entire point of the test.
    const page = await browser.newPage();
    await page.setContent(
      `<!doctype html><html><body>${result.svg}</body></html>`,
      { waitUntil: "load" },
    );
    await page.evaluate(() => document.fonts.ready);
    const usedFamilies: string[] = await page.evaluate(() => {
      const families = new Set<string>();
      document.fonts.forEach((fontFace) => families.add(fontFace.family));
      return [...families];
    });
    const hasBundled = usedFamilies.some((family) => family.includes("Prancheta Sans"));
    if (!hasBundled) {
      console.error(
        `FAIL  a fresh page loading the exported SVG never registered the embedded ` +
          `"Prancheta Sans" @font-face -- found: ${usedFamilies.join(", ") || "(none)"}`,
      );
      process.exit(1);
    }
    console.log(`ok    embed mode: fresh page registered ${usedFamilies.join(", ")}`);
  } finally {
    await browser.close();
  }
}
