/**
 * Rich text (ADR 0062): a Block may carry `runs`, some of them real
 * subscripts or superscripts. The mirror lays them out as <sub>/<sup>, the
 * measurement reads each run back where Chromium put it, and the SVG draws
 * each run at that measured spot -- in every font mode. `label` stays the
 * plain concatenation, so every check keeps reading one string.
 *
 * SLOW: renders through Chromium.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SpecError, parseSpec } from "../src/ir/types.ts";
import type { Block, FigureSpec, PlacedText } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";
import { buildHtml } from "../src/layout/html.ts";

const block = (over: Partial<Block>): Block => ({
  type: "block",
  id: "u",
  x: 10,
  y: 10,
  width: 300,
  height: 30,
  padding: 0,
  fill: "transparent",
  stroke: "transparent",
  strokeWidth: 0,
  wrap: "none",
  fontSize: 16,
  freeStanding: true,
  ...over,
});

const figure = (children: Block[]): FigureSpec => ({
  version: 1,
  canvas: { theme: "print", background: "#FFFFFF", padding: 10 },
  root: { type: "scene", layout: "absolute", width: 420, height: 140, children },
});

const UAB = [
  { text: "U" },
  { text: "AB", script: "sub" as const },
  { text: " = V" },
  { text: "A", script: "sub" as const },
  { text: " − V" },
  { text: "B", script: "sub" as const },
  { text: " = 6 V" },
];

// ---- the IR -----------------------------------------------------------------------------------

test("parseSpec keeps runs whose plain text is the label", () => {
  const spec = parseSpec(figure([block({ label: "UAB = VA − VB = 6 V", runs: UAB })]));
  const b = (spec.root as { children: Block[] }).children[0]!;
  assert.deepEqual(b.runs, UAB);
});

test("parseSpec refuses runs that disagree with the label, a missing label, and anything outside the closed form", () => {
  assert.throws(() => parseSpec(figure([block({ label: "U_AB = 6 V", runs: UAB })])), /label must equal the plain text of its runs/);
  assert.throws(() => parseSpec(figure([block({ runs: UAB })])), SpecError);
  assert.throws(() => parseSpec(figure([block({ label: "x", runs: [{ text: "x", script: "under" as never }] })])), /script must be "sub" or "sup"/);
  assert.throws(() => parseSpec(figure([block({ label: "x", runs: [{ text: "x", bold: true } as never] })])), /not a field of a run/);
  assert.throws(() => parseSpec(figure([block({ label: "", runs: [] })])), /non-empty array/);
  assert.throws(() => parseSpec(figure([block({ label: "a\nb", runs: [{ text: "a\nb", script: "sub" }] })])), /line break/);
});

test("the mirror sets scripts as real <sub>/<sup> in the label's span", () => {
  const { html } = buildHtml(parseSpec(figure([block({ label: "UAB = VA − VB = 6 V", runs: UAB })])));
  assert.match(html, /data-pr-rich="1"/);
  assert.equal((html.match(/<sub data-pr-script="sub"/g) ?? []).length, 3);
  assert.match(html, />AB<\/sub>/);
});

// ---- measured and drawn -----------------------------------------------------------------------

const textOf = (elements: { kind: string }[], owner: string): PlacedText =>
  elements.find((e) => e.kind === "text" && (e as PlacedText).ownerId === owner) as PlacedText;

test("a rich line is measured run by run: subscripts smaller, lower, left to right, one line", { timeout: 120000 }, async () => {
  const result = await render(parseSpec(figure([block({ label: "UAB = VA − VB = 6 V", runs: UAB })])), { raster: false });
  const t = textOf(result.figure.elements, "u");
  assert.equal(t.lines.length, 1, "the subscripts did not start lines of their own");
  const line = t.lines[0]!;
  assert.equal(line.text, "UAB = VA − VB = 6 V", "checks read the plain concatenation");
  const runs = line.runs!;
  assert.deepEqual(runs.map((r) => r.text), ["U", "AB", " = V", "A", " − V", "B", " = 6 V"]);
  for (const r of runs) {
    if (r.script === "sub") {
      assert.ok(r.fontSize < t.fontSize, `${r.text} is set smaller`);
      assert.ok(r.y > line.y + 1, `${r.text} sits below the line's baseline`);
    } else {
      assert.equal(r.fontSize, t.fontSize);
      assert.equal(r.y, line.y);
    }
  }
  for (let i = 1; i < runs.length; i += 1) assert.ok(runs[i]!.x > runs[i - 1]!.x, "runs advance left to right");
  // One <text> for the line, each run a tspan at its measured spot.
  assert.equal((result.svg.match(/<text [^>]*data-pr-id="u--label"/g) ?? []).length, 1);
  assert.match(result.svg, /<tspan x="[\d.]+" y="[\d.]+" font-size="[\d.]+">AB<\/tspan>/);
  for (const check of result.manifest.checks) assert.ok(check.status !== "fail", `${check.id} ${check.target}: ${check.detail}`);
});

test("a superscript rises, and a rich label still wraps into lines grouped by baseline", { timeout: 120000 }, async () => {
  const runs = [{ text: "s" }, { text: "2", script: "sup" as const }, { text: " = 4,5 cm" }, { text: "2", script: "sup" as const }, { text: " and a long wrapped line here" }];
  const spec = parseSpec(figure([block({ label: "s2 = 4,5 cm2 and a long wrapped line here", runs, width: 180, height: 70, wrap: "normal" })]));
  const result = await render(spec, { raster: false });
  const t = textOf(result.figure.elements, "u");
  assert.equal(t.lines.length, 2);
  const sup = t.lines[0]!.runs!.find((r) => r.script === "sup")!;
  assert.ok(sup.y < t.lines[0]!.y - 1, "a superscript sits above the baseline");
  assert.ok(t.lines[1]!.y > t.lines[0]!.y + 10);
  for (const check of result.manifest.checks) assert.ok(check.status !== "fail", `${check.id} ${check.target}: ${check.detail}`);
});

test("outline mode draws each run as glyph paths at its measured spot; embed keeps tspans", { timeout: 120000 }, async () => {
  const spec = parseSpec(figure([block({ label: "UAB = VA − VB = 6 V", runs: UAB })]));
  const outline = await render(spec, { raster: false, fontEmbed: "outline" });
  assert.ok(!/<text [^>]*u--label/.test(outline.svg), "no <text> left in outline mode");
  const glyphs = (outline.svg.match(/<path data-pr-id="u--label"/g) ?? []).length;
  assert.equal(glyphs, 12, "every visible glyph (U A B = V A − V B = 6 V) is a path");
  const embed = await render(spec, { raster: false, fontEmbed: "embed" });
  assert.match(embed.svg, /<tspan [^>]*font-size="[\d.]+">AB<\/tspan>/);
});
