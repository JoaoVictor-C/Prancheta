/**
 * function-graph: expansion without a browser.
 *
 * The render test (function-graph-render.test.ts) proves the fifteen-figure
 * list draws clean; this file pins what the preset promises BEFORE anything
 * is measured -- expressions are data, labels are computed, a typed
 * coordinate is refused, and every reference resolves or is refused by name.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { parseFigureInput } from "../src/presets/index.ts";
import { expandFunctionGraph, typedCoordinate } from "../src/presets/function-graph/preset.ts";
import type { FunctionGraphInput } from "../src/presets/function-graph/preset.ts";
import { compile, parse, pretty, ExprError } from "../src/math/expr.ts";
import { commandByName } from "../src/commands.ts";
import type { Block, FigureSpec, Mark, Scene } from "../src/ir/types.ts";

const dir = fileURLToPath(new URL("../fixtures/function-graph/", import.meta.url));
const fixtures = readdirSync(dir).filter((name) => name.endsWith(".json"));

const load = (name: string): FunctionGraphInput & { preset: "function-graph" } =>
  JSON.parse(readFileSync(join(dir, name), "utf8"));

const labels = (spec: FigureSpec): string[] =>
  ((spec.root as Scene).children as Block[]).map((b) => b.label ?? "");

const base = (): FunctionGraphInput => ({
  x: { range: [-1, 4], unit: 60 },
  y: { range: [-1, 10], unit: 20 },
  functions: [{ id: "f", expr: "x^2" }],
});

// --- expressions --------------------------------------------------------

test("expressions: implicit multiplication, superscripts, typographic minus, ** and precedence", () => {
  assert.equal(compile("2x")(3), 6);
  assert.equal(compile("3(x + 1)")(1), 6);
  assert.equal(compile("x²")(4), 16);
  assert.equal(compile("−x^2 + 6x")(1), 5);
  assert.equal(compile("-x^2")(3), -9, "-x^2 is -(x^2)");
  assert.equal(compile("x**3")(2), 8);
  assert.equal(compile("2^3^2")(0), 512, "^ is right-associative");
  assert.equal(compile("t^2", "t")(3), 9);
  assert.ok(Math.abs(compile("ln(e)")(0) - 1) < 1e-12);
  assert.equal(compile("log(100)")(0), 2, "log is base 10 (Brazilian school convention)");
  assert.equal(compile("x^(1/3)")(-8), -2, "odd root of a negative is real");
  assert.ok(Number.isNaN(compile("sqrt(x)")(-1)), "undefined is NaN, never a throw");
});

test("expressions: unknown names, commas and stray tokens are refused by name", () => {
  assert.throws(() => parse("y + 1"), (e: Error) => e instanceof ExprError && /unknown name "y"/.test(e.message));
  assert.throws(() => parse("1,2x"), /comma/);
  assert.throws(() => parse("x +"), ExprError);
  assert.throws(() => parse("process.exit(1)"), ExprError);
  assert.throws(() => parse("constructor(x)"), /unknown name "constructor"/);
});

test("expressions: pretty-printing is how a reader writes them", () => {
  assert.equal(pretty(parse("x^2 - 4x + 1")), "x² − 4x + 1");
  assert.equal(pretty(parse("-x^2 + 6x")), "−x² + 6x");
  assert.equal(pretty(parse("5/3 x^2 - 1")), "(5/3)x² − 1");
  assert.equal(pretty(parse("1000(1 + 0.2t)", "t"), "t"), "1000(1 + 0,2t)");
});

// --- the Cálculo 1 figures ------------------------------------------------

test("all fourteen function figures of the Cálculo 1 sheet are fixtures", () => {
  // The directory also holds the curve fixtures of ADR 0029 (curve-*.json);
  // the sheet's own figures are the calc1-* ones.
  const sheet = fixtures.filter((name) => name.startsWith("calc1-"));
  assert.equal(sheet.length, 14, sheet.join(", "));
});

for (const name of fixtures) {
  test(`${name}: validates, expands and resolves its frame`, () => {
    const spec = parseFigureInput(load(name));
    const scene = spec.root as Scene;
    assert.equal(scene.frames, undefined, "the plane's frame is resolved to canvas coordinates");
    assert.ok((scene.marks ?? []).some((m) => m.gridOf === "plane"), "the grid is drawn");
  });
}

test("computed labels: P(3; 9), (2; 17/3), 2073,60 and the tangent's equation come from the values", () => {
  const q32 = labels(expandFunctionGraph(load("calc1-q3-2.json")));
  assert.ok(q32.includes("P(3; 9)"), q32.join(" | "));
  const s16 = labels(expandFunctionGraph(load("calc1-s1-6.json")));
  assert.ok(s16.includes("(2; 17/3)"), s16.join(" | "));
  const s23 = labels(expandFunctionGraph(load("calc1-s2-3.json")));
  assert.ok(s23.includes("2073,60"), s23.join(" | "));
  const s44 = labels(expandFunctionGraph(load("calc1-s4-4.json")));
  assert.ok(s44.includes("y = 9x − 16"), s44.join(" | "));
  const q25 = labels(expandFunctionGraph(load("calc1-q2-5.json")));
  assert.ok(q25.includes("secante h = 0,5, Q(2,5; 7,25)"), q25.join(" | "));
});

// --- refusals -------------------------------------------------------------

test("a coordinate typed into a label is refused, with the placeholder to use instead", () => {
  const input = { ...base(), points: [{ id: "P", at: [3, 9] as [number, number], label: "P(3; 9)" }] };
  assert.throws(() => expandFunctionGraph(input), /types the coordinate "\(3; 9\)" by hand.*\{coords\}/s);
  const comma = { ...base(), labels: [{ text: "ponto (2, 5)", at: [2, 5] as [number, number] }] };
  assert.throws(() => expandFunctionGraph(comma), /by hand/);
  // A decimal in brackets is not a pair.
  const decimal = { ...base(), labels: [{ text: "1000·(1,2)ᵗ", at: [2, 5] as [number, number] }] };
  assert.doesNotThrow(() => expandFunctionGraph(decimal));
});

test("unknown placeholders, points and curves are refused by name", () => {
  assert.throws(
    () => expandFunctionGraph({ ...base(), labels: [{ text: "{Q}", at: [1, 1] }] }),
    /unknown placeholder "\{Q\}"/,
  );
  assert.throws(
    () => expandFunctionGraph({ ...base(), points: [{ at: { of: "g", x: 1 } }] }),
    /refers to a function or line "g"/,
  );
  assert.throws(
    () => expandFunctionGraph({ ...base(), lines: [{ id: "s", through: ["A", "B"], domain: [0, 1] }] }),
    /refers to a point "A"/,
  );
});

test("validation: malformed input is refused before drawing", () => {
  const bad = (patch: Record<string, unknown>) => ({ preset: "function-graph", ...base(), ...patch });
  assert.throws(() => parseFigureInput(bad({ x: { range: [3, 1], unit: 60 } })), /min < max/);
  assert.throws(() => parseFigureInput(bad({ functions: [{ id: "f" }] })), /exactly one of "expr"/);
  assert.throws(
    () => parseFigureInput(bad({ lines: [{ id: "l", slope: 2, tangent: { of: "f", at: 1 }, domain: [0, 1] }] })),
    /exactly one of "through"/,
  );
  assert.throws(() => parseFigureInput(bad({ functions: [{ id: "f", expr: "x^2", colour: "pink" }] })), /colour/);
  assert.throws(() => parseFigureInput(bad({ functions: [{ id: "f", expr: "2y" }] })), /unknown name "y"/);
  assert.throws(() => parseFigureInput(bad({ y: { range: [-1, 10], unit: 20, require: [11] } })), /outside/);
});

test("a tangent's slope and a secant's are computed, and piecewise values honour `side`", () => {
  const spec = expandFunctionGraph({
    x: { range: [-1, 5], unit: 50 },
    y: { range: [-1, 20], unit: 10, labelEvery: 5 },
    functions: [
      { id: "f", pieces: [{ expr: "x + 1", domain: [0, 2] }, { expr: "x^2", domain: [2, 4] }] },
    ],
    lines: [{ id: "t", tangent: { of: "f", at: 3 }, domain: [2, 4], label: { text: "m = {slope}", at: 2.5 } }],
    points: [
      { id: "L", at: { of: "f", x: 2, side: "left" }, label: "{coords}" },
      { id: "R", at: { of: "f", x: 2, side: "right" }, label: "{coords}" },
    ],
  });
  const text = labels(spec);
  assert.ok(text.includes("m = 6"), text.join(" | "));
  assert.ok(text.includes("(2; 3)") && text.includes("(2; 4)"), text.join(" | "));
});

test("every curve's ink declares its series", () => {
  const spec = expandFunctionGraph(load("calc1-q2-5.json"));
  const series = new Set(((spec.root as Scene).marks as Mark[]).map((m) => m.series).filter(Boolean));
  assert.deepEqual([...series].sort(), ["f", "s1", "s2", "s3", "t"]);
});

// --- exposure -----------------------------------------------------------

test("the validate command (CLI and MCP share it) accepts a function-graph input", async () => {
  const result = await commandByName("validate")!.run({ spec: join(dir, "calc1-q3-2.json") });
  assert.equal(result.exitCode, 0);
  assert.match(result.text, /preset function-graph/);
});

// --- task 7: no coordinate is typed by hand -----------------------------------

test("no figure of the list types a coordinate: every printed pair is computed", () => {
  const pair = /\(\s*[−-]?\d[\d.,/]*\s*[;,]\s*[−-]?\d[\d.,/]*\s*\)/;
  let computed = 0;
  for (const name of fixtures) {
    const source = readFileSync(join(dir, name), "utf8");
    const strings: string[] = [];
    JSON.parse(source, (_key, value) => {
      if (typeof value === "string") strings.push(value);
      return value;
    });
    for (const s of strings) assert.equal(typedCoordinate(s), null, `${name} types ${JSON.stringify(s)}`);
    // Every pair the expanded figure prints came out of a template.
    for (const text of labels(expandFunctionGraph(load(name)))) {
      if (pair.test(text)) computed += 1;
    }
  }
  assert.ok(computed >= 12, `expected the list's point labels to print computed pairs, saw ${computed}`);
});

test("a label's coordinates follow the function, not the author", () => {
  const input = load("calc1-q3-2.json");
  input.functions![0]!.expr = "x^2 + 1";
  const text = labels(expandFunctionGraph(input));
  assert.ok(text.includes("P(3; 10)"), text.join(" | "));
});
