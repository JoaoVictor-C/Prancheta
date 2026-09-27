/**
 * number-line: the reta real, found from text.
 *
 * Every boundary is parsed from an inequality chain or interval brackets,
 * every combined row is found by the interval algebra (`unionAll`,
 * `intersectAll`) from the rows it names -- so these tests pin the parsing
 * (both notations, ou/e, ∪/∩, ±∞, open vs. closed) and the algebra, and then
 * that the figures render clean.
 *
 * These tests call `expandNumberLine` directly and render the resulting
 * `FigureSpec` the way other tests render raw IR, so they exercise the
 * preset without the dispatch in `src/presets/index.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import {
  expandNumberLine,
  intersectAll,
  parseNumberLineSet,
  unionAll,
} from "../src/presets/number-line/preset.ts";
import type { NumberLineInput, NLSet } from "../src/presets/number-line/preset.ts";
import { SpecError } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";
import type { Block, Scene } from "../src/ir/types.ts";

const dir = fileURLToPath(new URL("../fixtures/number-line/", import.meta.url));
const fixtures = readdirSync(dir).filter((n) => n.endsWith(".json"));

const set = (text: string, variable = "x"): NLSet => parseNumberLineSet(text, "test", variable, "pt-BR");

const asText = (v: NLSet): string[] =>
  v.map((iv) => `${iv.loIncl ? "[" : "("}${iv.lo.exact};${iv.hi.exact}${iv.hiIncl ? "]" : ")"}`);

const texts = (input: NumberLineInput): Map<string, string> =>
  new Map(((expandNumberLine(input).root as Scene).children as Block[]).map((b) => [String(b.id), b.label ?? ""]));

const axisLabels = (input: NumberLineInput): string[] =>
  [...texts(input)].filter(([id]) => id.startsWith("x-")).map(([, t]) => t);

// --- parsing: inequality chains ------------------------------------------------

test("a one-sided inequality is a ray", () => {
  assert.deepEqual(asText(set("x < 5")), ["(−∞;5)"]);
  assert.deepEqual(asText(set("x <= 5")), ["(−∞;5]"]);
  assert.deepEqual(asText(set("x ≥ -2")), ["[−2;+∞)"]);
  assert.deepEqual(asText(set("x > -2")), ["(−2;+∞)"]);
});

test("a reversed one-sided inequality reads the same way as the direct form", () => {
  assert.deepEqual(asText(set("5 > x")), asText(set("x < 5")));
  assert.deepEqual(asText(set("-2 <= x")), asText(set("x >= -2")));
});

test("a two-sided chain is one bounded interval", () => {
  assert.deepEqual(asText(set("2 ≤ x < 5")), ["[2;5)"]);
  assert.deepEqual(asText(set("-1 < x <= 3")), ["(−1;3]"]);
});

test('two one-sided inequalities joined by "e" intersect into one interval', () => {
  assert.deepEqual(asText(set("x > 1 e x < 5")), ["(1;5)"]);
  assert.deepEqual(asText(set("x ≥ -1 ∩ x ≤ 4")), ["[−1;4]"]);
});

// --- parsing: interval brackets -------------------------------------------------

test("bracket notation: [ ] inclusive, ( ) exclusive", () => {
  assert.deepEqual(asText(set("[-2, 3]")), ["[−2;3]"]);
  assert.deepEqual(asText(set("(-2, 3)")), ["(−2;3)"]);
  assert.deepEqual(asText(set("[-2, 3)")), ["[−2;3)"]);
});

test("Brazilian ]a, b[ notation for an open end", () => {
  assert.deepEqual(asText(set("]-2, 3[")), ["(−2;3)"]);
  assert.deepEqual(asText(set("]-2, 3]")), ["(−2;3]"]);
  assert.deepEqual(asText(set("[-2, 3[")), ["[−2;3)"]);
});

test("±∞ as a bound, always exclusive", () => {
  assert.deepEqual(asText(set("(-∞, 3)")), ["(−∞;3)"]);
  assert.deepEqual(asText(set("[4, +∞)")), ["[4;+∞)"]);
  assert.throws(() => set("[4, +∞]"), /never a member/);
  assert.throws(() => set("[-∞, 3]"), /never a member/);
});

test("the bracket separator: ; first, else the first comma", () => {
  assert.deepEqual(asText(set("[2,5; 3,7]")), ["[2,5;3,7]"]);
  assert.deepEqual(asText(set("[2.5, 3.7]")), ["[2,5;3,7]"]);
});

// --- parsing: union and exact endpoints ------------------------------------------

test("∪ and ou both join branches into a union", () => {
  assert.deepEqual(asText(set("x < -1 ou 2 ≤ x < 5")), ["(−∞;−1)", "[2;5)"]);
  assert.deepEqual(asText(set("[-2, 3) ∪ (4, +∞)")), ["[−2;3)", "(4;+∞)"]);
});

test("a fraction or a square root endpoint is kept exact, not rounded", () => {
  assert.deepEqual(asText(set("x < 5/3")), ["(−∞;5/3)"]);
  assert.deepEqual(asText(set("x >= -√2")), ["[−√2;+∞)"]);
});

test("R and ∅ are the whole line and the empty set", () => {
  assert.deepEqual(asText(set("R")), ["(−∞;+∞)"]);
  assert.deepEqual(set("∅"), []);
  assert.deepEqual(set("vazio"), []);
});

// --- the interval algebra: union and intersection, never typed ------------------

test("unionAll merges overlapping and touching-and-covered pieces", () => {
  assert.deepEqual(asText(unionAll([set("(1, 3)"), set("[3, 5)")])), ["(1;5)"]);
  assert.deepEqual(asText(unionAll([set("(1, 2)"), set("(2, 3)")])), ["(1;2)", "(2;3)"]);
  assert.deepEqual(asText(unionAll([set("x < -1"), set("x > 1")])), ["(−∞;−1)", "(1;+∞)"]);
});

test("intersectAll narrows to the common part, empty when there is none", () => {
  assert.deepEqual(asText(intersectAll([set("x >= -1"), set("x < 3")])), ["[−1;3)"]);
  assert.deepEqual(intersectAll([set("x < 1"), set("x > 5")]), []);
  assert.deepEqual(asText(intersectAll([set("[0, 4]"), set("[2, 6]"), set("[3, 10]")])), ["[3;4]"]);
});

test("a computed row is found from the rows it names, and never states a bound itself", () => {
  const input: NumberLineInput = {
    rows: [
      { label: "A", set: "x >= -1" },
      { label: "B", set: "x < 3" },
      { label: "A ∩ B", op: "intersection" },
    ],
  };
  assert.deepEqual(axisLabels(input), ["−1", "3"]);
  const spec = expandNumberLine(input);
  const kids = (spec.root as Scene).children as Block[];
  assert.ok(kids.some((k) => k.label === "A"));
  assert.ok(kids.some((k) => k.label === "B"));
  assert.ok(kids.some((k) => k.label === "A ∩ B"));
});

test("a computed row may name which earlier rows feed it", () => {
  const input: NumberLineInput = {
    rows: [
      { label: "A", set: "x < 5" },
      { label: "B", set: "x > -5" },
      { label: "C", set: "x > 0" },
      { label: "A ∪ C", op: "union", of: ["A", "C"] },
    ],
  };
  // A ∪ C = x < 5 ∪ x > 0 = R (B's own boundary still pools onto the shared axis).
  assert.deepEqual(axisLabels(input), ["−5", "0", "5"]);
});

// --- open and closed endpoints ---------------------------------------------------

test("open and closed endpoints are marked by id, filled for included", () => {
  const input: NumberLineInput = { set: "[-2, 3)" };
  const spec = expandNumberLine(input);
  const kids = (spec.root as Scene).children as Block[];
  const marks = (spec.root as Scene).marks ?? [];
  const lo = marks.find((m) => m.id === "row-1-lo-1");
  const hi = marks.find((m) => m.id === "row-1-hi-1");
  assert.ok(lo, "the lower endpoint is drawn");
  assert.ok(hi, "the upper endpoint is drawn");
  assert.equal(lo!.fill, "#181B21"); // [ -2 is included: filled
  assert.equal(hi!.fill, "#FCFBF7"); // 3) is excluded: open (paper-coloured)
  assert.deepEqual(
    kids.filter((k) => k.id?.startsWith("x-")).map((k) => k.label),
    ["−2", "3"],
  );
});

// --- refusals ----------------------------------------------------------------

test("validation refuses what cannot be drawn", () => {
  assert.throws(() => set("x banana 5"), SpecError);
  assert.throws(() => set("[4, +∞]"), /never a member/);
  assert.throws(() => set("[5, 2]"), /left bound less than its right bound/);
  assert.throws(() => set("[2,5, 3,7]"), SpecError);
  assert.throws(
    () =>
      expandNumberLine({
        rows: [
          { label: "A", set: "x < 5" },
          { label: "A ∪ B", op: "union", of: ["A", "Z"] },
        ],
      }),
    /not declared/,
  );
  assert.throws(
    () => expandNumberLine({ set: "x < 5", rows: [{ set: "x < 5" }] } as unknown as NumberLineInput),
    /either "set" or "rows"/,
  );
  assert.throws(() => expandNumberLine({} as NumberLineInput), /give either/);
});

// --- rendering ---------------------------------------------------------------

for (const name of fixtures) {
  test(`${name} renders with every check passing`, { timeout: 240000 }, async () => {
    const input = JSON.parse(readFileSync(join(dir, name), "utf8")) as NumberLineInput;
    const spec = expandNumberLine(input);
    const result = await render(spec, { raster: false });
    const failing = result.manifest.checks.filter((c) => c.status === "fail");
    assert.equal(result.manifest.ok, true, failing.map((c) => `${c.id} ${c.target}: ${c.detail}`).join("\n"));
  });
}
