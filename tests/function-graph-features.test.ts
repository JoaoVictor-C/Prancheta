/**
 * Roots and extrema, absorbed from the plot module (ADR 0025).
 *
 * The plot module's function mode found roots by bisection and extrema by
 * sampling, and declared each to lie on its curve (a root also on the x
 * axis) so the core could refute the claim by measuring the drawing. The
 * same claims now live in function-graph, and `feature-on-its-curve` is the
 * core check that measures them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { render } from "../src/pipeline.ts";
import { expandFunctionGraph, findFeatures } from "../src/presets/function-graph/preset.ts";
import type { FunctionGraphInput } from "../src/presets/function-graph/preset.ts";
import type { Mark, Point, Scene } from "../src/ir/types.ts";
import { compile } from "../src/math/expr.ts";

const cubic: FunctionGraphInput = {
  x: { range: [-3, 3], unit: 90 },
  y: { range: [-4, 4], unit: 40 },
  functions: [
    { id: "f", expr: "x^3 - 4x", features: ["roots", "extrema"], label: { text: "y = {expr}", at: [-2.4, 3], towards: ["U", "R"] } },
  ],
};

test("roots and extrema are found numerically, to the precision a figure needs", () => {
  const { roots, extrema } = findFeatures(compile("x^3 - 4x"), -3, 3);
  assert.deepEqual(roots.map((r) => Math.round(r * 1e6) / 1e6), [-2, 0, 2]);
  const e = 2 / Math.sqrt(3);
  assert.equal(extrema.length, 2);
  assert.ok(Math.abs(extrema[0]!.x + e) < 1e-6 && extrema[0]!.kind === "max");
  assert.ok(Math.abs(extrema[1]!.x - e) < 1e-6 && extrema[1]!.kind === "min");
});

test("each marker declares what it lies on: a root its curve AND the x axis", () => {
  const marks = ((expandFunctionGraph(cubic).root as Scene).marks ?? []) as Mark[];
  const roots = marks.filter((m) => m.id.includes("-root-"));
  const extrema = marks.filter((m) => m.id.includes("-max-") || m.id.includes("-min-"));
  assert.equal(roots.length, 3);
  assert.equal(extrema.length, 2);
  for (const r of roots) assert.deepEqual(r.on, ["f", "plane-axis-x"]);
  for (const e of extrema) assert.deepEqual(e.on, ["f"]);
});

test("an honest figure passes feature-on-its-curve", { timeout: 240000 }, async () => {
  const result = await render(expandFunctionGraph(cubic), { raster: false });
  const check = result.manifest.checks.find((c) => c.id === "feature-on-its-curve")!;
  assert.equal(check.status, "pass", check.detail);
  assert.equal(check.examined, 5);
  assert.equal(result.manifest.ok, true, JSON.stringify(result.manifest.checks.filter((c) => c.status === "fail")));
});

test("a root moved off both its curve and its axis fails on BOTH halves", { timeout: 240000 }, async () => {
  const spec = expandFunctionGraph(cubic);
  const root = ((spec.root as Scene).marks as Mark[]).find((m) => m.id.includes("-root-"))!;
  const lift = (p: Point): Point => ({ x: p.x, y: p.y - 60 });
  root.from = lift(root.from as Point);
  root.segments = root.segments.map((s) =>
    "arc" in s ? { arc: lift(s.arc as Point), centre: lift(s.centre as Point) } : { line: lift(s.line as Point) },
  );
  const result = await render(spec, { raster: false, repair: false });
  const check = result.manifest.checks.find((c) => c.id === "feature-on-its-curve")!;
  assert.equal(check.status, "fail");
  assert.match(check.detail!, new RegExp(`${root.id} does not lie on f `));
  assert.match(check.detail!, new RegExp(`${root.id} does not lie on plane-axis-x`));
});

test("the plot module's `quadratic` shortcut, restated as function-graph data", { timeout: 240000 }, async () => {
  // modules/plot used to draw x**2/4 - 2*x + 1 over [-3, 11]; this is the
  // same figure as data the core evaluates, with the claims it made.
  const result = await render(
    expandFunctionGraph({
      x: { range: [-3, 11], unit: 45, labelEvery: 2 },
      y: { range: [-4, 10], unit: 28, step: 2 },
      functions: [
        { id: "q", expr: "x^2/4 - 2x + 1", features: ["roots", "extrema"], label: { text: "y = {expr}", at: 9.5, towards: ["L", "U"] } },
      ],
    }),
    { raster: false },
  );
  assert.equal(result.manifest.ok, true, JSON.stringify(result.manifest.checks.filter((c) => c.status === "fail")));
  assert.equal(result.manifest.checks.find((c) => c.id === "feature-on-its-curve")!.examined, 3);
});
