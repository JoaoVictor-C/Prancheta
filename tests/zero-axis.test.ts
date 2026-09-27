/**
 * The zero line is drawn whenever an axis's range CONTAINS zero.
 *
 * It used to be drawn only when a lattice line landed exactly on zero, so a
 * grid over [−13, 13] in steps of 2 (lines at the odd numbers) or over
 * [−0.5, 4.5] in steps of 1 (lines at the halves) lost its axes without a
 * word.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseSpec } from "../src/ir/types.ts";
import type { FigureSpec, Mark, Point, Scene } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";
import { expandFunctionGraph } from "../src/presets/function-graph/preset.ts";

const ORIGIN = { x: 60, y: 400 };
const UNIT = { x: 100, y: 15 };

function rawGrid(origin?: number): FigureSpec {
  return parseSpec({
    version: 1,
    canvas: { padding: 0, theme: "print" },
    root: {
      type: "scene",
      layout: "absolute",
      width: 560,
      height: 620,
      frames: [
        {
          id: "p",
          origin: ORIGIN,
          xUnit: UNIT.x,
          yUnit: UNIT.y,
          grid: {
            x: { from: -0.5, to: 4.5, step: 1, ...(origin === undefined ? {} : { origin }) },
            y: { from: -13, to: 13, step: 2, ...(origin === undefined ? {} : { origin }) },
          },
        },
      ],
      children: [],
    },
  });
}

/** Axis lines are the 2px grid marks; gridlines are 1px. */
function axes(spec: FigureSpec): { vertical: number[]; horizontal: number[] } {
  const marks = ((spec.root as Scene).marks ?? []) as Mark[];
  const out = { vertical: [] as number[], horizontal: [] as number[] };
  for (const m of marks) {
    if (m.gridOf === undefined || m.strokeWidth !== 2) continue;
    const a = m.from as Point;
    const b = (m.segments[0] as { line: Point }).line;
    if (Math.abs(a.x - b.x) < 1e-9) out.vertical.push(a.x);
    else out.horizontal.push(a.y);
  }
  return out;
}

test("a raw grid over x ∈ [−0.5, 4.5], y ∈ [−13, 13] draws both zero lines", () => {
  const { vertical, horizontal } = axes(rawGrid());
  assert.deepEqual(vertical, [ORIGIN.x], "the y axis, at x = 0");
  assert.deepEqual(horizontal, [ORIGIN.y], "the x axis, at y = 0");
});

test("the zero line spans the whole range, not only the lattice", () => {
  const marks = ((rawGrid().root as Scene).marks ?? []) as Mark[];
  const yAxis = marks.find((m) => m.id === "p-axis-y")!;
  const ends = [(yAxis.from as Point).y, (yAxis.segments[0] as { line: Point }).line.y].sort((a, b) => a - b);
  assert.deepEqual(ends, [ORIGIN.y - 13 * UNIT.y, ORIGIN.y + 13 * UNIT.y]);
});

test("`origin: 0` anchors the lattice at zero, so the axis IS a lattice line", () => {
  const marks = ((rawGrid(0).root as Scene).marks ?? []) as Mark[];
  const verticals = marks
    .filter((m) => m.id.startsWith("p-grid-v-") || m.id === "p-axis-y")
    .map((m) => (m.from as Point).x)
    .sort((a, b) => a - b);
  assert.deepEqual(verticals, [0, 1, 2, 3, 4].map((v) => ORIGIN.x + v * UNIT.x));
  assert.ok(marks.some((m) => m.id === "p-axis-y" && m.strokeWidth === 2), "the lattice line at zero is the axis, by name");
  const { vertical, horizontal } = axes(rawGrid(0));
  assert.deepEqual(vertical, [ORIGIN.x]);
  assert.deepEqual(horizontal, [ORIGIN.y]);
});

test("a range that does not contain zero draws no zero line", () => {
  const spec = parseSpec({
    version: 1,
    root: {
      type: "scene",
      layout: "absolute",
      width: 400,
      height: 300,
      frames: [{ id: "p", origin: { x: 0, y: 300 }, xUnit: 50, yUnit: 50, grid: { x: { from: 1, to: 5 }, y: { from: 1, to: 5 } } }],
      children: [],
    },
  });
  assert.deepEqual(axes(spec), { vertical: [], horizontal: [] });
});

test("function-graph over the same ranges shows both axes and renders clean", { timeout: 240000 }, async () => {
  const spec = expandFunctionGraph({
    x: { range: [-0.5, 4.5], unit: 100 },
    y: { range: [-13, 13], unit: 15, step: 2, labelEvery: 2 },
    functions: [{ id: "f", expr: "x^2 - 4x - 5", label: { text: "y = {expr}", at: 1, towards: ["D", "SW"] } }],
  });
  const { vertical, horizontal } = axes(spec);
  assert.equal(vertical.length, 1);
  assert.equal(horizontal.length, 1);
  const result = await render(spec, { raster: false });
  assert.equal(result.manifest.ok, true, JSON.stringify(result.manifest.checks.filter((c) => c.status === "fail")));
});
