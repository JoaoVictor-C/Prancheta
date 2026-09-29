/**
 * sign-chart: the sign table of a function, found from its expression.
 *
 * Every boundary is a root or pole the preset found, every sign is the one
 * the expression takes there, every printed value is f evaluated -- so these
 * tests pin the arithmetic (roots, poles, touching roots, snapping to √n and
 * fractions) and then that the tables render clean.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { criticalPoints, exactLabel, expandSignChart } from "../src/presets/sign-chart/preset.ts";
import type { SignChartInput } from "../src/presets/sign-chart/preset.ts";
import { parseFigureInput } from "../src/presets/index.ts";
import { compile } from "../src/math/expr.ts";
import { render } from "../src/pipeline.ts";
import type { Block, Scene } from "../src/ir/types.ts";

const dir = fileURLToPath(new URL("../fixtures/sign-chart/", import.meta.url));
const fixtures = readdirSync(dir).filter((n) => n.endsWith(".json"));

const texts = (input: SignChartInput): Map<string, string> =>
  new Map(((expandSignChart(input).root as Scene).children as Block[]).map((b) => [String(b.id), b.label ?? ""]));

const header = (input: SignChartInput): string[] =>
  [...texts(input)].filter(([id]) => id.startsWith("x-")).map(([, t]) => t);

const signs = (input: SignChartInput, row: number): string[] =>
  [...texts(input)].filter(([id]) => id.startsWith(`sign-${row}-`)).map(([, t]) => t);

// --- arithmetic ----------------------------------------------------------------

test("roots and poles: a sign change across a pole is not a root", () => {
  const found = criticalPoints(compile("(x - 1)(x + 2)/(x - 3.5)"), -10, 10);
  assert.deepEqual(found, [
    { x: -2, kind: "root" },
    { x: 1, kind: "root" },
    { x: 3.5, kind: "pole" },
  ]);
});

test("a root that touches without crossing is found", () => {
  assert.deepEqual(criticalPoints(compile("(x - 1.3)^2"), -10, 10), [{ x: 1.3, kind: "root" }]);
});

test("irrational and fractional roots are snapped to the exact value and printed as one", () => {
  const roots = criticalPoints(compile("3x^2 - 5"), -10, 10).map((c) => c.x);
  assert.ok(Math.abs(roots[1]! - Math.sqrt(5 / 3)) < 1e-9);
  assert.deepEqual(criticalPoints(compile("3x - 5"), -10, 10), [{ x: 5 / 3, kind: "root" }]);
  assert.equal(exactLabel(Math.sqrt(3), "pt-BR"), "√3");
  assert.equal(exactLabel(-Math.sqrt(2), "pt-BR"), "−√2");
  assert.equal(exactLabel(5 / 3, "pt-BR"), "5/3");
  assert.equal(exactLabel(2.5, "pt-BR"), "2,5");
  assert.equal(exactLabel(0.125, "pt-BR"), "0,125");
});

// --- the tables ---------------------------------------------------------------

test("x³ − 3x: f′ is + − + around −1 and 1; f has a maximum 2 and a minimum −2", () => {
  const input: SignChartInput = { expr: "x^3 - 3x" };
  assert.deepEqual(header(input), ["−1", "1"]);
  assert.deepEqual(signs(input, 1), ["+", "−", "+"]);
  const t = texts(input);
  assert.equal(t.get("value-1"), "2");
  assert.equal(t.get("value-2"), "−2");
});

test("the sign of f itself, with its irrational roots as √3", () => {
  const input: SignChartInput = { expr: "x^3 - 3x", rows: ["f"] };
  assert.deepEqual(header(input), ["−√3", "0", "√3"]);
  assert.deepEqual(signs(input, 1), ["−", "+", "−", "+"]);
});

test("an inequality: factor rows, the product's row, and ‖ at the pole", () => {
  const input = JSON.parse(readFileSync(join(dir, "inequality-factors.json"), "utf8")) as SignChartInput;
  assert.deepEqual(header(input), ["−2", "1", "3"]);
  assert.deepEqual(signs(input, 1), ["−", "−", "+", "+"]);
  assert.deepEqual(signs(input, 2), ["−", "+", "+", "+"]);
  assert.deepEqual(signs(input, 3), ["−", "−", "−", "+"]);
  assert.deepEqual(signs(input, 4), ["−", "+", "−", "+"]);
});

test("1/x: undefined at 0, decreasing on both sides", () => {
  const input: SignChartInput = { expr: "1/x", rows: ["f", "f'"] };
  assert.deepEqual(header(input), ["0"]);
  assert.deepEqual(signs(input, 1), ["−", "+"]);
  assert.deepEqual(signs(input, 2), ["−", "−"]);
});

test("a hole the search cannot see is marked by `undefinedAt`", () => {
  const input: SignChartInput = { expr: "x + 4", rows: ["f"], undefinedAt: [4] };
  assert.deepEqual(header(input), ["−4", "4"]);
});

test("validation refuses what cannot be drawn", () => {
  const bad = (patch: Record<string, unknown>) => ({ preset: "sign-chart", expr: "x^2 - 1", ...patch });
  assert.throws(() => parseFigureInput(bad({ expr: "2y" })), /unknown name "y"/);
  assert.throws(() => parseFigureInput(bad({ rows: ["g'"] })), /must be one of/);
  assert.throws(() => parseFigureInput(bad({ search: [3, 1] })), /min < max/);
  assert.throws(
    () => parseFigureInput(bad({ rows: [{ row: "f", label: "passa por (1; 0)" }] })),
    /by hand/,
  );
});

// --- answers: false ---------------------------------------------------------------

test("answers:false hides critical points and signs, but keeps row names", () => {
  const input: SignChartInput = { expr: "x^2 - 1", answers: false };
  assert.deepEqual(header(input), []);
  assert.deepEqual(signs(input, 1), []);
});

test("answers:true (default) shows critical points and signs", () => {
  const input: SignChartInput = { expr: "x^2 - 1" };
  // x^2 - 1 has derivative 2x, which has a critical point at x = 0
  assert.deepEqual(header(input), ["0"]);
  assert.deepEqual(signs(input, 1).length > 0, true);
});

test("answers:false renders with every check passing", { timeout: 240000 }, async () => {
  const input: SignChartInput = { expr: "x^2 - 3", rows: ["f"], answers: false };
  const spec = expandSignChart(input);
  const result = await render(spec, { raster: false });
  const failing = result.manifest.checks.filter((c) => c.status === "fail");
  assert.equal(result.manifest.ok, true, failing.map((c) => `${c.id} ${c.target}: ${c.detail}`).join("\n"));
  // Verify no signs are present
  assert.deepEqual(signs(input, 1), []);
});

// --- rendering ---------------------------------------------------------------

for (const name of fixtures) {
  test(`${name} renders with every check passing`, { timeout: 240000 }, async () => {
    const spec = parseFigureInput(JSON.parse(readFileSync(join(dir, name), "utf8")));
    const result = await render(spec, { raster: false });
    const failing = result.manifest.checks.filter((c) => c.status === "fail");
    assert.equal(result.manifest.ok, true, failing.map((c) => `${c.id} ${c.target}: ${c.detail}`).join("\n"));
  });
}
