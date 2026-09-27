/**
 * The legend finds its own place.
 *
 * The Cálculo 1 sheet's figure 2.5 set its legend by hand-typed coordinate,
 * over the axis numbers. The legend is now placed by the same search a label
 * gets, widened to two dimensions: clear of curves, guides, axes, axis
 * numbers and every other label, with the most room around it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { render } from "../src/pipeline.ts";
import { parseFigureInput } from "../src/presets/index.ts";
import { expandFunctionGraph } from "../src/presets/function-graph/preset.ts";
import type { FunctionGraphInput } from "../src/presets/function-graph/preset.ts";
import type { Block, Mark, Point, Rect, Scene } from "../src/ir/types.ts";

const load = (name: string): FunctionGraphInput =>
  JSON.parse(readFileSync(new URL(`../fixtures/function-graph/${name}`, import.meta.url), "utf8"));

function segmentHitsRect(a: Point, b: Point, r: Rect): boolean {
  const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
  for (let i = 0; i <= steps; i += 1) {
    const x = a.x + ((b.x - a.x) * i) / steps;
    const y = a.y + ((b.y - a.y) * i) / steps;
    if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) return true;
  }
  return false;
}

function inkPoints(mark: Mark): Point[] {
  return [mark.from as Point, ...mark.segments.map((s) => ("line" in s ? s.line : s.arc) as Point)];
}

test("2.5: the legend is placed without a coordinate, clear of everything", async () => {
  const input = load("calc1-q2-5.json");
  assert.equal(input.legend, undefined, "the fixture states no legend position");
  const spec = parseFigureInput({ preset: "function-graph", ...input });
  const scene = spec.root as Scene;
  const blocks = scene.children as Block[];
  const rows = blocks.filter((b) => String(b.id).startsWith("legend-"));
  const swatches = (scene.marks ?? []).filter((m) => m.id.startsWith("legend-swatch-"));
  assert.equal(rows.length, 4);

  // The legend's whole extent: swatches and rows.
  const xs = [...rows.flatMap((r) => [r.x!, r.x! + r.width!]), ...swatches.flatMap((m) => inkPoints(m).map((p) => p.x))];
  const ys = [...rows.flatMap((r) => [r.y!, r.y! + r.height!]), ...swatches.flatMap((m) => inkPoints(m).map((p) => p.y))];
  const area: Rect = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };

  for (const mark of scene.marks ?? []) {
    if (mark.id.startsWith("legend-swatch-") || mark.stroke === "none") continue;
    // Dashed lattice lines are the paper; the axes (2px grid marks) are not.
    if (mark.gridOf !== undefined && mark.strokeWidth !== 2) continue;
    const pts = inkPoints(mark);
    for (let i = 1; i < pts.length; i += 1) {
      assert.ok(!segmentHitsRect(pts[i - 1]!, pts[i]!, area), `legend overlaps ${mark.id}`);
    }
  }
  for (const other of blocks) {
    if (String(other.id).startsWith("legend-")) continue;
    const overlap =
      other.x! < area.x + area.width && other.x! + other.width! > area.x &&
      other.y! < area.y + area.height && other.y! + other.height! > area.y;
    assert.ok(!overlap, `legend overlaps ${other.id} ("${other.label}")`);
  }

  const result = await render(spec, { raster: false });
  const failing = result.manifest.checks.filter((c) => c.status === "fail");
  assert.equal(result.manifest.ok, true, failing.map((c) => `${c.id} ${c.target}: ${c.detail}`).join("\n"));
});

test("with no free spot the legend still takes the least bad one -- it is never dropped", () => {
  // Every row as wide as the plot: nowhere is clear.
  const spec = expandFunctionGraph({
    x: { range: [-1, 1], unit: 40 },
    y: { range: [-1, 1], unit: 40 },
    functions: [{ id: "f", expr: "x", legend: "uma legenda muito mais larga do que o gráfico inteiro" }],
  });
  const row = ((spec.root as Scene).children as Block[]).find((b) => b.id === "legend-1");
  assert.ok(row, "the legend is still drawn");
});

test("`legend.at` still pins it, for the figure that needs to", () => {
  const input: FunctionGraphInput = {
    x: { range: [0, 4], unit: 60 },
    y: { range: [0, 4], unit: 60 },
    functions: [{ id: "f", expr: "x", legend: "y = x" }],
    legend: { at: [2, 1] },
  };
  const swatch = ((expandFunctionGraph(input).root as Scene).marks ?? []).find((m) => m.id === "legend-swatch-1")!;
  assert.deepEqual(swatch.from, { x: 46 + 2 * 60, y: 30 + 3 * 60 });
});
