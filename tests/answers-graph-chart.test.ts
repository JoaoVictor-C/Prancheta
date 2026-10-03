/**
 * answers:false on function-graph and chart: the question's figure keeps what
 * an exercise GIVES (curves, regions, given values, a function's formula) and
 * prints nothing the figure COMPUTES (areas, sums, integrals, slopes, read-off
 * coordinates, asymptotes, a pie's shares, a stack's total).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expandFunctionGraph } from "../src/presets/function-graph/preset.ts";
import type { FunctionGraphInput } from "../src/presets/function-graph/preset.ts";
import { expandChart } from "../src/presets/chart/preset.ts";
import type { ChartInput } from "../src/presets/chart/preset.ts";
import { ANSWER_AWARE, validatePresetInput } from "../src/presets/index.ts";
import type { FigureNode, FigureSpec } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";

const fixture = <T>(rel: string): T => JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/${rel}`, import.meta.url)), "utf8")) as T;

/** Every label printed anywhere in the figure. */
function labels(spec: FigureSpec): string[] {
  const out: string[] = [];
  const walk = (n: FigureNode): void => {
    const o = n as { label?: string; children?: FigureNode[] };
    if (typeof o.label === "string" && o.label !== "") out.push(o.label);
    o.children?.forEach(walk);
  };
  walk(spec.root);
  return out;
}
const marks = (spec: FigureSpec): { id?: string }[] => (spec.root as { marks?: { id?: string }[] }).marks ?? [];

test("both presets are answer-aware", () => {
  assert.ok(ANSWER_AWARE.includes("function-graph"));
  assert.ok(ANSWER_AWARE.includes("chart"));
});

test("an area keeps its region and its name, and loses its value and total", () => {
  const input = fixture<FunctionGraphInput>("function-graph/area-sine-sign-change.json");
  const shown = labels(expandFunctionGraph(input));
  const hidden = labels(expandFunctionGraph({ ...input, answers: false }));
  assert.ok(shown.some((t) => /^A₁ = /.test(t)), `with answers: ${shown.join(" | ")}`);
  assert.ok(hidden.includes("A₁") && hidden.includes("A₂"), `names stay: ${hidden.join(" | ")}`);
  assert.ok(!hidden.some((t) => /=|≈/.test(t) && /^A/.test(t)), `no value: ${hidden.join(" | ")}`);
  assert.ok(!hidden.includes("A"), "no bare total caption");
  // The regions themselves are still drawn.
  const regions = (s: FigureSpec) => marks(s).filter((m) => /^area-1-\d$/.test(m.id ?? "")).length;
  assert.equal(regions(expandFunctionGraph({ ...input, answers: false })), regions(expandFunctionGraph(input)));
});

test("a Riemann sum keeps its rectangles and S₄, not the sum or the integral", () => {
  const input: FunctionGraphInput = {
    x: { range: [-0.5, 2.5], unit: 120 },
    y: { range: [-0.5, 4.5], unit: 60 },
    functions: [{ id: "f", expr: "x^2" }],
    riemann: [{ of: "f", from: 0, to: 2, n: 4, rule: "left", label: true, integral: true }],
  };
  const hidden = labels(expandFunctionGraph({ ...input, answers: false }));
  assert.ok(hidden.includes("S₄"), hidden.join(" | "));
  assert.ok(!hidden.some((t) => t.includes("1,75") || t.includes("∫")), hidden.join(" | "));
  assert.ok(labels(expandFunctionGraph(input)).some((t) => t.includes("1,75")));
});

test("labels keep what precedes their first computed placeholder", () => {
  const input: FunctionGraphInput = {
    x: { range: [-1, 5], unit: 60 },
    y: { range: [-2, 16], unit: 18, labelEvery: 2 },
    functions: [{ id: "f", expr: "x^2", label: { text: "y = {expr}", at: -0.6, towards: ["U", "R"] } }],
    lines: [{ id: "t", tangent: { of: "f", at: 3 }, domain: [1.4, 4.4], label: { text: "inclinação = {slope}", at: 1.8, towards: ["R", "D"] } }],
    points: [
      { id: "P", at: { of: "f", x: 3 }, label: "P{coords}", towards: ["L", "NW"] },
      { id: "Q", at: [1, 1], label: "Q{coords}", towards: ["R", "SE"] },
      { id: "R", at: { of: "f", x: 2 }, label: "{coords}", towards: ["L"] },
    ],
  };
  const hidden = labels(expandFunctionGraph({ ...input, answers: false }));
  assert.ok(hidden.includes("y = x²"), "a function's formula is given");
  assert.ok(hidden.includes("inclinação"), "a slope is computed");
  assert.ok(hidden.includes("P"), "a point read off a curve: its coordinates are computed");
  assert.ok(hidden.includes("Q(1; 1)"), "a typed point's coordinates are given");
  assert.ok(!hidden.some((t) => t.includes("(2; 4)")), "a label that was all answer is not drawn");
});

test("asymptotes are still found (a wrong claim is refused) but not drawn", () => {
  const input = fixture<FunctionGraphInput>("function-graph/asym-rational-vertical-horizontal.json");
  const asym = (s: FigureSpec) => marks(s).filter((m) => (m.id ?? "").includes("-asymptote-")).length;
  assert.ok(asym(expandFunctionGraph(input)) > 0);
  assert.equal(asym(expandFunctionGraph({ ...input, answers: false })), 0);
  // No "x = 1" / "y = 2"; the function's own "y = (2x + 1)/(x − 1)" is given and stays.
  assert.ok(!labels(expandFunctionGraph({ ...input, answers: false })).some((t) => /^[xy] = [−\d]/.test(t)));
  const claimed: FunctionGraphInput = {
    x: { range: [-3, 5], unit: 50 }, y: { range: [-5, 5], unit: 30 },
    functions: [{ id: "f", expr: "1/(x - 1)", asymptotes: { vertical: [2] } }],
    answers: false,
  };
  assert.throws(() => expandFunctionGraph(claimed));
});

test("a pie keeps its slices and names, without shares; a stack loses its total", () => {
  const pie = fixture<ChartInput>("chart-pie-market-share.json");
  const shown = labels(expandChart(pie));
  const hidden = labels(expandChart({ ...pie, answers: false }));
  assert.ok(shown.some((t) => t.endsWith("%")));
  assert.ok(!hidden.some((t) => t.includes("%")), hidden.join(" | "));
  for (const c of pie.categories) assert.ok(hidden.includes(c.label), `${c.label} named`);
  const stacked = fixture<ChartInput>("chart-stacked-budget.json");
  assert.ok(labels(expandChart({ ...stacked, answers: false })).length < labels(expandChart(stacked)).length);
  // Grouped bars' printed values are the data: they stay.
  const grouped: ChartInput = { categories: [{ label: "A", values: [3] }, { label: "B", values: [5] }] };
  assert.deepEqual(labels(expandChart({ ...grouped, answers: false })), labels(expandChart(grouped)));
});

test("answers:false is accepted by validation on both presets", () => {
  validatePresetInput({ preset: "chart", categories: [{ label: "A", values: [1] }], answers: false });
  validatePresetInput({ preset: "function-graph", x: { range: [0, 1], unit: 100 }, y: { range: [0, 1], unit: 100 }, functions: [{ id: "f", expr: "x" }], answers: false });
});

test("question figures render with every check passing", { timeout: 240000 }, async () => {
  for (const rel of ["function-graph/area-sine-sign-change.json", "function-graph/riemann-right-sign-change.json", "function-graph/asym-tangent.json"]) {
    const result = await render(expandFunctionGraph({ ...fixture<FunctionGraphInput>(rel), answers: false }), { raster: false });
    const bad = result.manifest.checks.filter((c) => c.status === "fail");
    assert.deepEqual(bad.map((c) => `${c.id}: ${c.detail}`), [], rel);
  }
  for (const rel of ["chart-pie-market-share.json", "chart-stacked-budget.json"]) {
    const result = await render(expandChart({ ...fixture<ChartInput>(rel), answers: false }), { raster: false });
    const bad = result.manifest.checks.filter((c) => c.status === "fail");
    assert.deepEqual(bad.map((c) => `${c.id}: ${c.detail}`), [], rel);
  }
});
