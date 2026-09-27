/**
 * Axis numbers are never dropped (function-graph's tick rule).
 *
 * The Cálculo 1 sheet lost numbers that the exercises cite: the 4 of
 * y = x + 4, the −1 at the vertex of figure 1.6. The rule now is that a
 * number whose usual spot has ink slides along its own gridline, on either
 * side of the axis, by at most half a division -- and only if nothing there
 * is clear keeps its spot on a paper backing. `axis-number-present` checks
 * the result against every number the axis declared.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { render } from "../src/pipeline.ts";
import { parseFigureInput } from "../src/presets/index.ts";
import { expandFunctionGraph } from "../src/presets/function-graph/preset.ts";
import type { FunctionGraphInput } from "../src/presets/function-graph/preset.ts";
import type { Block, Scene } from "../src/ir/types.ts";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/function-graph/${name}`, import.meta.url), "utf8"));

const tickBlocks = (input: FunctionGraphInput): Block[] =>
  ((expandFunctionGraph(input).root as Scene).children as Block[]).filter((b) => String(b.id).startsWith("tick-"));

// The five figures named in the task list, each with the numbers the
// exercise text depends on.
const cases: [string, string][] = [
  ["calc1-s1-3.json", "1.3: y = x + 4, intercept 4"],
  ["calc1-s1-6.json", "1.6: vertex at −1"],
  ["calc1-s3-3.json", "3.3"],
  ["calc1-s3-6.json", "3.6"],
  ["calc1-s4-5.json", "4.5"],
];

for (const [name, what] of cases) {
  test(`${what}: every axis number is printed at its tick`, { timeout: 240000 }, async () => {
    const result = await render(parseFigureInput(fixture(name)), { raster: false });
    const check = result.manifest.checks.find((c) => c.id === "axis-number-present")!;
    assert.equal(check.status, "pass", check.detail);
    assert.ok((check.examined ?? 0) >= 5, `only ${check.examined} numbers examined`);
  });
}

test("1.3 and 1.6 print the numbers their exercises cite", () => {
  const s13 = tickBlocks(fixture("calc1-s1-3.json") as FunctionGraphInput).map((b) => b.label);
  assert.ok(s13.includes("4") && s13.includes("8"), s13.join(" "));
  const s16 = tickBlocks(fixture("calc1-s1-6.json") as FunctionGraphInput).map((b) => b.label);
  assert.ok(s16.includes("−1"), s16.join(" "));
});

test("a number with ink on its spot slides along its gridline, within half a division", () => {
  // y = 2 − x crosses the y axis at 2 and the x axis at 2, straight through
  // both numbers' usual spots.
  const input: FunctionGraphInput = {
    x: { range: [-1, 4], unit: 60 },
    y: { range: [-1, 4], unit: 60 },
    functions: [{ id: "f", expr: "2 - x" }],
  };
  const blocks = tickBlocks(input);
  const two = blocks.filter((b) => b.label === "2");
  assert.equal(two.length, 2, "both 2s are printed");
  for (const b of two) assert.notEqual(b.fill, "#FCFBF7", `${b.id} fell back to a paper backing`);
  const x2 = two.find((b) => b.id!.startsWith("tick-x"))!;
  const centreY = x2.y! + x2.height! / 2;
  const axisY = 30 + 4 * 60;
  assert.ok(centreY !== axisY + 14, "the x number moved off its usual spot");
  assert.ok(Math.abs(centreY - axisY) <= 14 + 30, "…but by no more than half a division");
});

test("a number that fits nowhere keeps its spot on a paper backing -- it is never dropped", async () => {
  // A dense fan of steep lines through (1, 0): no spot within half a
  // division of the "1" under the axis is clear.
  const input: FunctionGraphInput = {
    x: { range: [-1, 3], unit: 30 },
    y: { range: [-1, 1], unit: 30 },
    lines: [-40, -20, -10, 10, 20, 40, 80, -80].map((m, i) => ({
      id: `l${i}`,
      point: [1, 0] as [number, number],
      slope: m,
      domain: [0.9, 1.1] as [number, number],
      colour: "soft",
      width: 1,
      style: i % 2 === 0 ? ("dashed" as const) : ("solid" as const),
    })),
  };
  const one = tickBlocks(input).find((b) => b.id!.startsWith("tick-x") && b.label === "1");
  assert.ok(one, "the 1 is printed");
  assert.equal(one!.fill, "#FCFBF7");
  const result = await render(expandFunctionGraph(input), { raster: false });
  const present = result.manifest.checks.find((c) => c.id === "axis-number-present")!;
  assert.equal(present.status, "pass", present.detail);
  const ink = result.manifest.checks.find((c) => c.id === "text-clear-of-ink" && c.target.startsWith(one!.id!))!;
  assert.equal(ink.status, "pass", "a paper-backed number covers the ink rather than crossing it");
});
