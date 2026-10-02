/**
 * Measured series, schematic axes, bars and panels (ADR 0066): what the
 * preset draws is computed from the data given, nothing is invented between
 * the points, and an axis without numbers says so.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { functionGraphIR, normaliseFunctionGraph, validateFunctionGraphInput } from "../src/presets/function-graph/preset.ts";
import type { FunctionGraphInput } from "../src/presets/function-graph/preset.ts";
import { measure, monotoneSlopes } from "../src/presets/function-graph/measured.ts";
import { expandChart, validateChartInput } from "../src/presets/chart/preset.ts";
import type { ChartInput } from "../src/presets/chart/preset.ts";
import type { Block, Mark, Scene } from "../src/ir/types.ts";

const fixture = (name: string): FunctionGraphInput =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/function-graph/${name}`, import.meta.url)), "utf8"));

const scene = (input: FunctionGraphInput): Scene => functionGraphIR(input).root as Scene;
const blocks = (input: FunctionGraphInput): Block[] => scene(input).children as Block[];
const marks = (input: FunctionGraphInput): Mark[] => scene(input).marks ?? [];
const validate = (input: unknown): void => validateFunctionGraphInput(input as Record<string, unknown>);

const plane = (extra: Partial<FunctionGraphInput>): FunctionGraphInput => ({
  x: { range: [0, 10], unit: 30 },
  y: { range: [0, 10], unit: 20 },
  ...extra,
} as FunctionGraphInput);

// --- interpolation ------------------------------------------------------------

test("a smooth series passes through every point and never overshoots between two", () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 10 },
    { x: 3, y: 10 },
    { x: 4, y: 2 },
  ];
  const m = measure(pts, "smooth");
  for (const [i, piece] of m.pieces.entries()) {
    const [a, b] = piece.domain;
    assert.ok(Math.abs(piece.f(a) - pts[i]!.y) < 1e-12);
    assert.ok(Math.abs(piece.f(b) - pts[i + 1]!.y) < 1e-12);
    const lo = Math.min(pts[i]!.y, pts[i + 1]!.y);
    const hi = Math.max(pts[i]!.y, pts[i + 1]!.y);
    for (let k = 0; k <= 100; k += 1) {
      const y = piece.f(a + ((b - a) * k) / 100);
      assert.ok(y >= lo - 1e-9 && y <= hi + 1e-9, `overshoot on [${a}, ${b}]: ${y}`);
    }
  }
  // Flat data stays flat: a plateau's slopes are zero.
  const slopes = monotoneSlopes([0, 1, 2, 3], [5, 5, 5, 5]);
  assert.deepEqual(slopes, [0, 0, 0, 0]);
});

test("a step series holds each value until the next point, risers at the points", () => {
  const m = measure([{ x: 0, y: 1 }, { x: 2, y: 3 }, { x: 5, y: 2 }], "step");
  assert.deepEqual(m.path, [
    { x: 0, y: 1 },
    { x: 2, y: 1 },
    { x: 2, y: 3 },
    { x: 5, y: 3 },
    { x: 5, y: 2 },
  ]);
  assert.equal(m.pieces[0]!.f(1.9), 1);
});

test("a linear series whose x turns back is a path, not a function", () => {
  const m = measure([{ x: 5, y: 5 }, { x: 2, y: 5 }, { x: 2, y: 1 }], "linear");
  assert.equal(m.isFunction, false);
  assert.equal(m.pieces.length, 0);
  assert.throws(
    () => validate(plane({ series: [{ id: "p", points: [[5, 5], [2, 5], [2, 1]], interpolate: "smooth" }] })),
    /needs x to run one way/,
  );
  assert.throws(
    () => validate(plane({ series: [{ id: "p", points: [[5, 5], [2, 5], [2, 1]] }], points: [{ at: { of: "p", x: 3 } }] })),
    /no single point at an x/,
  );
});

test("a measured point outside the plotted range is refused, never clipped", () => {
  assert.throws(() => validate(plane({ series: [{ id: "s", points: [[1, 2], [3, 12]] }] })), /outside the plotted range/);
});

// --- what is drawn and printed ------------------------------------------------

test("a linear series is drawn through its own points, vertex for vertex", () => {
  const input = plane({ series: [{ id: "s", points: [[1, 2], [4, 8], [9, 3]] }] });
  const g = normaliseFunctionGraph(input);
  const s = marks(input).find((m) => m.id === "s")!;
  // A measured figure keeps 16px more above the plot for the y name set there.
  const at = (x: number, y: number) => ({ x: 46 + (x - g.x.range[0]) * g.x.unit, y: 46 + (g.y.range[1] - y) * g.y.unit });
  const drawn = [s.from, ...s.segments.map((seg) => ("line" in seg ? seg.line : seg.arc))];
  assert.deepEqual(drawn, [at(1, 2), at(4, 8), at(9, 3)]);
  assert.equal(s.series, "s");
});

test("value labels print the given values through the locale formatter and name their points", () => {
  const input = fixture("series-monthly-temperature.json");
  const labels = blocks(input).filter((b) => b.annotatesPlace !== undefined && /^\d/.test(b.label ?? ""));
  assert.deepEqual(
    labels.map((b) => b.label),
    ["26,4", "26,9", "25,8", "23,1", "19,7", "17,2", "16,5", "18", "19,9", "22,3", "24,1", "25,6"],
  );
});

test("a series on the right axis prints its own values, and the right axis requires its numbers", () => {
  const input = fixture("series-dual-axis.json");
  const s = scene(input);
  const y2 = s.frames!.find((f) => f.id === "plane-y2")!;
  assert.deepEqual(y2.grid!.y.require, [20, 40, 60, 80, 100]);
  const ticks = blocks(input).filter((b) => b.id?.startsWith("tick-y2-")).map((b) => b.label);
  assert.deepEqual(ticks, ["20", "40", "60", "80", "100"]);
  // A point read off it would print the plane's y, not its own value.
  assert.throws(() => validate({ ...input, points: [{ at: { of: "umid", x: 3 } }] }), /read on the right axis/);
});

test("the area between two series is bounded by their data points", () => {
  const input = fixture("series-fill-between.json");
  const regions = marks(input).filter((m) => m.id.startsWith("area-1"));
  assert.ok(regions.length >= 2, "split where the series cross, each part shaded by sign");
  const xs = new Set(regions.flatMap((m) => [m.from, ...m.segments.map((s) => ("line" in s ? s.line : s.arc))]).map((p) => (p as { x: number }).x));
  for (const year of [2016, 2017, 2019, 2020, 2021, 2022, 2023]) assert.ok(xs.has(year), `vertex at ${year}`);
});

// --- schematic axes, ticks and categories ----------------------------------------

test("a schematic axis prints no number, declares itself, and its symbolic ticks name their places", () => {
  const input = fixture("schematic-position-time.json");
  const bs = blocks(input);
  assert.equal(bs.filter((b) => b.id?.startsWith("tick-")).length, 0, "no number on either axis");
  const declared = marks(input).filter((m) => /^plane-schematic-(x|y)$/.test(m.id));
  assert.deepEqual(declared.map((m) => [m.id, m.gridOf]), [["plane-schematic-x", "plane"], ["plane-schematic-y", "plane"]]);
  const t1 = bs.find((b) => b.label === "t1")!;
  assert.ok(t1.annotatesPlace !== undefined);
  assert.deepEqual(t1.runs, [{ text: "t" }, { text: "1", script: "sub" }]);
  // Arrows on the curve, each claiming to lie on it.
  const arrows = marks(input).filter((m) => m.id.startsWith("s-arrow-"));
  assert.equal(arrows.length, 3);
  assert.ok(arrows.every((a) => a.on?.[0] === "s"));
});

test("a schematic axis refuses required numbers, and a symbolic tick refuses a typed number", () => {
  assert.throws(() => validate(plane({ axes: { schematic: true }, y: { range: [0, 10], unit: 20, require: [4] } })), /declared schematic/);
  assert.throws(() => validate(plane({ x: { range: [0, 10], unit: 30, ticks: [{ at: 2, label: "2,5" }] } })), /printed by the axis/);
});

test("a category axis spans [0,5; n + 0,5], names each category's place, and a y range is fitted to the data", () => {
  const input = { x: { categories: ["A", "B", "C"], unit: 60 }, y: { unit: 2 }, series: [{ id: "s", values: [12, 47, 33] }] } as unknown as FunctionGraphInput;
  const g = normaliseFunctionGraph(input);
  assert.deepEqual(g.x.range, [0.5, 3.5]);
  assert.deepEqual(g.y.range, [10, 50]);
  const names = blocks(input).filter((b) => b.id?.startsWith("x-symbol-"));
  assert.deepEqual(names.map((b) => b.label), ["A", "B", "C"]);
  assert.ok(names.every((b) => b.annotatesPlace !== undefined));
});

// --- bars ----------------------------------------------------------------------

test("a bar's height is its value from zero, and a range that leaves out zero is refused", () => {
  const input = fixture("bars-with-line.json");
  const bar = marks(input).find((m) => m.id === "manha-3")!;
  const ys = [bar.from, ...bar.segments.map((s) => ("line" in s ? s.line : s.arc))].map((p) => (p as { y: number }).y);
  assert.deepEqual([...new Set(ys)].sort((a, b) => a - b), [0, 60]);
  assert.throws(() => validate({ ...input, y: { range: [10, 140], step: 20, unit: 2 } }), /leaves out zero/);
});

// --- panels --------------------------------------------------------------------

test("panels: each a graph of its own, ids prefixed by letter, cells of one size", () => {
  const input = fixture("panels-five-options.json");
  const s = scene(input);
  assert.deepEqual(s.frames!.map((f) => f.id), ["pA-plane", "pB-plane", "pC-plane", "pD-plane", "pE-plane"]);
  const letters = (s.children as Block[]).filter((b) => b.id?.endsWith("-letter")).map((b) => b.label);
  assert.deepEqual(letters, ["(A)", "(B)", "(C)", "(D)", "(E)"]);
  const origins = s.frames!.map((f) => f.origin as { x: number; y: number });
  // Same column, same x; same row, same y: one cell size, one scale.
  assert.equal(origins[0]!.x, origins[2]!.x);
  assert.equal(origins[0]!.y, origins[1]!.y);
  assert.equal(origins[1]!.x - origins[0]!.x, origins[3]!.x - origins[2]!.x);
  const arrow = (s.marks ?? []).find((m) => m.id === "pE-v-arrow-1")!;
  assert.deepEqual(arrow.on, ["pE-v"]);
  assert.throws(() => validate({ ...input, panels: [{ label: "A" }, { label: "A" }] }), /repeats the letter A/);
});

// --- chart: a ruled bar chart is drawn on function-graph's plane -----------------

test("chart: bars with a line overlay are function-graph's bars and series, on a numbered y axis", () => {
  const input = JSON.parse(readFileSync(fileURLToPath(new URL("../fixtures/chart-bars-overlay.json", import.meta.url)), "utf8")) as ChartInput;
  validateChartInput(input as unknown as Record<string, unknown>);
  const spec = expandChart(input);
  const root = spec.root as Scene;
  const ids = (root.marks ?? []).map((m) => m.id);
  assert.ok(ids.includes("bars-1-1") && ids.includes("bars-2-4"), ids.join(" "));
  assert.ok(ids.includes("overlay-1"));
  assert.ok((root.marks ?? []).some((m) => m.tick?.axis === "y" && m.tick.value === 100));
  assert.throws(
    () => validateChartInput({ ...input, chartType: "line" } as unknown as Record<string, unknown>),
    /function-graph's "series"/,
  );
});
