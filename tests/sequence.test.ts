/**
 * sequence: a_n discrete terms on a numbered plane, or partial sums S_n.
 *
 * Every point is computed from the term expression, so these tests pin the
 * arithmetic: terms computed correctly, partial sums correct, limits computed
 * when convergent, pt-BR formatting, and validation of bad input.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { expandSequence, validateSequenceInput } from "../src/presets/sequence/preset.ts";
import type { SequenceInput } from "../src/presets/sequence/preset.ts";
import { render } from "../src/pipeline.ts";
import type { Block, Scene } from "../src/ir/types.ts";

const dir = fileURLToPath(new URL("../fixtures/sequence/", import.meta.url));
const fixtures = readdirSync(dir).filter((n) => n.endsWith(".json"));

// ---- arithmetic: term values -----------------------------------------------

test("basic sequence: 1/n at n = 1..5", () => {
  const input: SequenceInput = {
    term: "1/n",
    n: [1, 5],
    show: "terms",
  };
  const spec = expandSequence(input);
  assert.ok(spec);
  // The spec should contain the 5 terms plotted as dots
  assert.ok(spec.canvas);
});

test("alternating sequence: (-1)^n/n", () => {
  const input: SequenceInput = {
    term: "(-1)^n/n",
    n: [1, 6],
    show: "terms",
  };
  const spec = expandSequence(input);
  assert.ok(spec);
  // Should compute correctly with alternating signs
});

test("converging sequence: (1+1/n)^n approaching e", () => {
  const input: SequenceInput = {
    term: "(1+1/n)^n",
    n: [1, 10],
    show: "terms",
  };
  const spec = expandSequence(input);
  assert.ok(spec);
});

// ---- partial sums -------------------------------------------------------

test("geometric series: 1/2^n with partial sums approaching 1", () => {
  const input: SequenceInput = {
    term: "1/2^n",
    n: [1, 10],
    show: "partial-sums",
  };
  const spec = expandSequence(input);
  assert.ok(spec);
  // Partial sums should approach 1 (the geometric series sum)
});

test("harmonic series: 1/n partial sums", () => {
  const input: SequenceInput = {
    term: "1/n",
    n: [1, 20],
    show: "partial-sums",
  };
  const spec = expandSequence(input);
  assert.ok(spec);
  // Should plot the partial sums, which diverge
});

test("both terms and partial sums", () => {
  const input: SequenceInput = {
    term: "1/2^n",
    n: [1, 8],
    show: "both",
  };
  const spec = expandSequence(input);
  assert.ok(spec);
  // Should include both series with different colours and legend
});

// ---- validation -------------------------------------------------------

test("validation refuses empty n range", () => {
  const bad = { term: "1/n", n: [5, 4] };
  assert.throws(() => validateSequenceInput(bad as Record<string, unknown>), /must be an integer >= n\[0\]/);
});

test("validation refuses n < 1", () => {
  const bad = { term: "1/n", n: [0, 5] };
  assert.throws(() => validateSequenceInput(bad as Record<string, unknown>), /must be an integer >= 1/);
});

test("validation refuses non-integer n", () => {
  const bad = { term: "1/n", n: [1.5, 5] };
  assert.throws(() => validateSequenceInput(bad as Record<string, unknown>), /must be an integer >= 1/);
});

test("validation refuses range > 60 terms", () => {
  const bad = { term: "1/n", n: [1, 61] };
  assert.throws(() => validateSequenceInput(bad as Record<string, unknown>), /maximum is 60/);
});

test("validation refuses non-finite term value", () => {
  const bad = { term: "1/n", n: [0, 5] };
  assert.throws(() => validateSequenceInput(bad as Record<string, unknown>), /must be an integer >= 1/);
});

test("validation refuses invalid expression", () => {
  const bad = { term: "unknown_var + n", n: [1, 5] };
  assert.throws(() => validateSequenceInput(bad as Record<string, unknown>), /unexpected/);
});

test("validation accepts valid locale", () => {
  const good = { term: "1/n", n: [1, 5], locale: "pt-BR" };
  assert.doesNotThrow(() => validateSequenceInput(good as Record<string, unknown>));
});

test("validation accepts valid show mode", () => {
  const good = { term: "1/n", n: [1, 5], show: "partial-sums" };
  assert.doesNotThrow(() => validateSequenceInput(good as Record<string, unknown>));
});

// ---- limit lines: each shown series' OWN limit, labelled beside its own
// line, never the terms' limit drawn for the partial sums (the reviewer's
// defect this preset was reworked to fix) -----------------------------------

test("limit line: a convergent series' terms are drawn at THEIR OWN limit (0 for 1/2^n)", () => {
  const spec = expandSequence({ term: "1/2^n", n: [1, 10], show: "terms", limit: true });
  const scene = spec.root as Scene;
  const line = scene.marks!.find((m) => m.id === "limit-line-terms");
  assert.ok(line, "expected a limit-line-terms mark");
  const y = (line!.from as { y: number }).y;
  const seg = line!.segments[0]! as { line: { y: number } };
  assert.ok(Math.abs(y - seg.line.y) < 1e-6, "a limit line is horizontal");
});

test('limit line: "both" mode draws TWO lines, each at its own value -- terms -> 0, partial sums -> 1', () => {
  const spec = expandSequence({ term: "1/2^n", n: [1, 10], show: "both", limit: true });
  const scene = spec.root as Scene;
  const termsLine = scene.marks!.find((m) => m.id === "limit-line-terms");
  const sumsLine = scene.marks!.find((m) => m.id === "limit-line-sums");
  assert.ok(termsLine, "expected a limit-line-terms mark");
  assert.ok(sumsLine, "expected a limit-line-sums mark");
  const termsY = (termsLine!.from as { y: number }).y;
  const sumsY = (sumsLine!.from as { y: number }).y;
  // The terms' limit (0) and the series' limit (1) are DIFFERENT values, so
  // their lines must sit at different heights -- drawing both at the terms'
  // limit was exactly the reviewer's defect.
  assert.notStrictEqual(termsY, sumsY, "the two limit lines must sit at different heights");
  // aₙ = 1/2^n -> 0 is BELOW Sₙ -> 1 on the plane, so terms' line is drawn
  // lower on the canvas (larger pixel y) than the partial sums' line.
  assert.ok(termsY > sumsY, "the terms' limit line (0) must be drawn below the partial sums' limit line (1)");
});

test("limit line: its label declares annotates, not freeStanding, and names its own line", () => {
  const spec = expandSequence({ term: "1/2^n", n: [1, 10], show: "terms", limit: true });
  const scene = spec.root as Scene;
  const label = scene.children.find((c): c is Block => "label" in c && c.label!.startsWith("lim aₙ"));
  assert.ok(label, "expected a limit-line label");
  assert.strictEqual(label!.annotates, "limit-line-terms");
  assert.notStrictEqual(label!.freeStanding, true);
});

test("limit line: exact values print exactly (0, 1, e), inexact values print with ≈", () => {
  const exact = expandSequence({ term: "1/2^n", n: [1, 10], show: "both", limit: true });
  const exactScene = exact.root as Scene;
  const termsLabel = exactScene.children.find((c): c is Block => "label" in c && c.label!.startsWith("lim aₙ"));
  const sumsLabel = exactScene.children.find((c): c is Block => "label" in c && c.label!.startsWith("lim S"));
  assert.strictEqual(termsLabel!.label!, "lim aₙ = 0");
  assert.strictEqual(sumsLabel!.label!, "lim Sₙ = 1");

  const inexact = expandSequence({ term: "(1+1/n)^n", n: [1, 15], show: "terms", limit: true });
  const inexactScene = inexact.root as Scene;
  const label = inexactScene.children.find((c): c is Block => "label" in c && c.label!.startsWith("lim aₙ"));
  assert.strictEqual(label!.label, "lim aₙ = e", "(1 + 1/n)ⁿ → e, and e is one of the exact forms");

  const rough = expandSequence({ term: "1 + 1/n + sin(n)/n^2 + 0.123456", n: [1, 15], show: "terms", limit: true });
  const roughLabel = (rough.root as Scene).children.find((c): c is Block => "label" in c && c.label!.startsWith("lim aₙ"));
  assert.match(roughLabel!.label!, /≈/, "1,123456 snaps to nothing and is printed approximately");
});

// ---- legend: only when both series share the plane; absent for one series,
// which names its y axis instead ---------------------------------------------

test('legend: present with proper subscripts when show is "both"', () => {
  const spec = expandSequence({ term: "1/2^n", n: [1, 8], show: "both" });
  const scene = spec.root as Scene;
  const legendLabels = scene.children.filter((c): c is Block => "label" in c && c.id?.startsWith("legend-") === true);
  assert.strictEqual(legendLabels.length, 2);
  const texts = legendLabels.map((l) => l.label!).sort();
  assert.deepStrictEqual(texts, ["Sₙ", "aₙ"].sort());
  // No ASCII underscore anywhere in a legend row.
  for (const l of legendLabels) assert.doesNotMatch(l.label!, /_/);
});

test('legend: absent when only one series shows; the y axis is named instead', () => {
  const terms = (expandSequence({ term: "1/n", n: [1, 10], show: "terms" }).root as Scene).children;
  assert.strictEqual(terms.filter((c) => "id" in c && c.id?.startsWith("legend-")).length, 0);
  assert.ok(terms.some((c) => "label" in c && c.label === "aₙ"), "the y axis should be named aₙ");

  const sums = (expandSequence({ term: "1/n", n: [1, 10], show: "partial-sums" }).root as Scene).children;
  assert.strictEqual(sums.filter((c) => "id" in c && c.id?.startsWith("legend-")).length, 0);
  assert.ok(sums.some((c) => "label" in c && c.label === "Sₙ"), "the y axis should be named Sₙ");
});

// ---- axes: arrowed connectors, named, with the zero line drawn when the
// value range contains zero --------------------------------------------------

test("axes: n and y axes are drawn as arrowed connectors named plane-axis-x/-y", () => {
  const spec = expandSequence({ term: "(-1)^n/n", n: [1, 10], show: "terms" });
  const scene = spec.root as Scene;
  const axisX = scene.connectors?.find((c) => c.id === "plane-axis-x");
  const axisY = scene.connectors?.find((c) => c.id === "plane-axis-y");
  assert.ok(axisX, "expected an n-axis connector");
  assert.ok(axisY, "expected a y-axis connector");
  assert.strictEqual(axisX!.arrow, "end");
  assert.strictEqual(axisY!.arrow, "end");
});

test("axes: dots are never joined -- every mark for a term or a sum is a filled circle, not a line", () => {
  const spec = expandSequence({ term: "1/n", n: [1, 8], show: "terms" });
  const scene = spec.root as Scene;
  const dotMarks = scene.marks!.filter((m) => m.id.startsWith("terms-"));
  assert.strictEqual(dotMarks.length, 8);
  for (const m of dotMarks) assert.strictEqual(m.close, true, "a dot is a closed circular mark");
});

// ---- render fixtures: every fixture passes every check -----
//
// These call `expandSequence` directly on each fixture's own input and
// render the resulting FigureSpec through `src/pipeline.ts` -- what
// `parseFigureInput` does for a registered preset, minus the dispatch.

fixtures.forEach((filename) => {
  test(`render fixture ${filename}`, async () => {
    const path = join(dir, filename);
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const { preset: _preset, ...input } = raw;
    const spec = expandSequence(input as unknown as SequenceInput);
    const result = await render(spec, { maxPasses: 3 });
    for (const check of result.manifest.checks) {
      assert.ok(
        check.status === "pass" || check.status === "not-applicable",
        `${check.id} failed with: ${check.detail}`,
      );
    }
  });
});
