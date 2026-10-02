/**
 * Planning-time measurement agrees with Chromium (ADR 0063).
 *
 * The property that makes a figure the same figure on every OS: a preset
 * plans its layout with `measureText`, before any browser exists, and
 * Chromium then lays the label out in the same bundled face. If the two
 * disagree, planning is a guess again -- and a guess that is right on one
 * machine's fonts was what made CI fail on Linux. So the two are held to
 * 1px, on the page the mirror builds (same @font-face, kerning off,
 * geometricPrecision) and on a real rendered preset.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { chromium } from "playwright";
import { bundledFontFaceCssSync, BUNDLED_FONT_FAMILY } from "../src/export/fonts.ts";
import { FALLBACK_EM, bundledCovers, measureText, trackingApplies } from "../src/layout/text-metrics.ts";
import { parseFigureInput } from "../src/presets/index.ts";
import { render } from "../src/pipeline.ts";

const NNBSP = " ";

const STRINGS = [
  "Hello world",
  "f(x) = x² − 4x + 1",
  "P(3; 9)",
  `12${NNBSP}000`,
  `P = 12${NNBSP}000 W`,
  "−π/2",
  "AVATAR Tokyo",
  "U = 12 V",
  "0,000215",
  "Variação média",
  "WAVY Tj fi ff",
  "1 2 3 4 5 6 7 8 9 10",
  "θ sen α ≈ ≤ → ′ ″ ∫ √ ∞ ∅",
  "Ω µ Δ λ σ² x̄",
  "→a aceita",
  "Q₁ = 3,5 · IQR",
];
const SIZES = [9.1, 11, 12.5, 13, 14, 16, 21, 30];
const WEIGHTS = [400, 500, 600, 650, 700];
const TRACKINGS = [0, 0.1, 1.5];

test("measureText agrees with Chromium to 1px: strings × sizes × weights × tracking", { timeout: 120000 }, async () => {
  for (const s of STRINGS) assert.ok(bundledCovers(s), `the sample must be covered by the bundled face: ${s}`);
  const cases: [string, number, number, number][] = [];
  for (const s of STRINGS) for (const size of SIZES) for (const weight of WEIGHTS) for (const tracking of TRACKINGS) cases.push([s, size, weight, tracking]);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>${bundledFontFaceCssSync()}
       body { font-family: "${BUNDLED_FONT_FAMILY}"; font-kerning: none; text-rendering: geometricPrecision; }
       span { white-space: pre; }</style></head><body></body></html>`,
    );
    await page.evaluate(async (family) => {
      for (const w of [400, 700]) await document.fonts.load(`${w} 16px "${family}"`);
    }, BUNDLED_FONT_FAMILY);
    const widths = await page.evaluate((all) =>
      all.map(([s, size, weight, tracking]) => {
        const span = document.createElement("span");
        span.style.cssText = `font-size:${size}px;font-weight:${weight};letter-spacing:${tracking}px`;
        span.textContent = s;
        document.body.appendChild(span);
        const width = span.getBoundingClientRect().width;
        span.remove();
        return width;
      }), cases);

    let worst = { diff: 0, at: "" };
    cases.forEach(([s, size, weight, tracking], i) => {
      const diff = Math.abs(measureText(s, { size, weight, tracking }) - widths[i]!);
      if (diff > worst.diff) worst = { diff, at: `${JSON.stringify(s)} ${size}px w${weight} t${tracking}: chromium ${widths[i]}` };
    });
    assert.ok(worst.diff <= 1, `worst disagreement ${worst.diff.toFixed(3)}px at ${worst.at}`);
  } finally {
    await browser.close();
  }
});

test("a digit group with no letter is set untracked, as Chromium sets it", () => {
  assert.equal(trackingApplies(`12${NNBSP}000`), false);
  assert.equal(trackingApplies(`P = 12${NNBSP}000 W`), true);
  assert.equal(trackingApplies("12 000"), true);
  assert.equal(
    measureText(`12${NNBSP}000`, { size: 13, tracking: 2 }),
    measureText(`12${NNBSP}000`, { size: 13, tracking: 0 }),
  );
});

test("weight is clamped into the face's axis; bold is wider; a missing glyph is budgeted", () => {
  const at = (weight: number): number => measureText("Variação média", { size: 14, weight });
  assert.equal(at(300), at(400));
  assert.equal(at(900), at(700));
  assert.ok(at(700) > at(600) && at(600) > at(400));
  // ℝ is not in the bundled face: it is budgeted, not measured
  assert.equal(bundledCovers("x ∈ ℝ"), false);
  assert.equal(measureText("ℝ", { size: 20 }), FALLBACK_EM * 20);
  // the widest of several lines
  assert.equal(measureText("ab\nabcdef", { size: 13 }), measureText("abcdef", { size: 13 }));
});

// A plain graph, a table set bold and at 500, a panel and a tree of fractions.
const FIXTURES = [
  "fixtures/function-graph/area-between-parabola-line.json",
  "fixtures/statistics/",
  "fixtures/truth-table/",
  "fixtures/probability-tree/",
];

test("presets' planned label widths are the widths Chromium lays out", { timeout: 120000 }, async () => {
  const files = FIXTURES.map((f) => (f.endsWith("/") ? `${f}${readdirSync(f).filter((n) => n.endsWith(".json")).sort()[0]}` : f));
  let checked = 0;
  let worst = { diff: 0, at: "" };
  for (const file of files) {
    const spec = parseFigureInput(JSON.parse(readFileSync(file, "utf8")));
    const result = await render(spec, { raster: false });
    for (const element of result.figure.elements) {
      if (element.kind !== "text") continue;
      for (const line of element.lines) {
        if (line.runs !== undefined || line.text.trim() === "" || !bundledCovers(line.text)) continue;
        const planned = measureText(line.text, {
          size: element.fontSize,
          weight: element.fontWeight,
          tracking: element.letterSpacing,
        });
        const diff = Math.abs(planned - line.box.width);
        checked += 1;
        if (diff > worst.diff) worst = { diff, at: `${file} ${element.id} "${line.text}": planned ${planned}, laid out ${line.box.width}` };
      }
    }
  }
  assert.ok(checked >= 40, `checked ${checked} lines`);
  assert.ok(worst.diff <= 1, `worst disagreement ${worst.diff.toFixed(3)}px at ${worst.at}`);
});
