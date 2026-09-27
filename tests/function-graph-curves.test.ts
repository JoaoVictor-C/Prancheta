/**
 * function-graph beyond graphs of functions (ADR 0029): parametric, polar
 * and implicit curves.
 *
 * Every curve here is stated as expressions and drawn from them; the tests
 * read the drawn marks back into axis units and measure them against the
 * curve's own equation, so "it looks like a circle" is never the evidence.
 * Then the places adaptive sampling and contouring exist for -- a pole is
 * not joined across, a curve leaving the range stops exactly on its border
 * -- and the refusals, each naming what to write instead.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { expandFunctionGraph } from "../src/presets/function-graph/preset.ts";
import type { FunctionGraphInput, FunctionInput } from "../src/presets/function-graph/preset.ts";
import { parseFigureInput } from "../src/presets/index.ts";
import { render } from "../src/pipeline.ts";
import type { Block, Mark, Point, Scene } from "../src/ir/types.ts";

// The preset's margins (LEFT, TOP in preset.ts): a pixel back to axis units.
const LEFT = 46;
const TOP = 30;

const plane = (fns: FunctionInput[], extra: Partial<FunctionGraphInput> = {}): FunctionGraphInput => ({
  x: { range: [-2, 2], unit: 80 },
  y: { range: [-2, 2], unit: 80 },
  functions: fns,
  ...extra,
});

/** Every mark of a series, with its vertices in axis units. */
function drawn(input: FunctionGraphInput, series: string): { mark: Mark; points: Point[] }[] {
  const spec = expandFunctionGraph(input);
  const toAxis = (p: Point): Point => ({
    x: input.x.range[0] + (p.x - LEFT) / input.x.unit,
    y: input.y.range[1] - (p.y - TOP) / input.y.unit,
  });
  return ((spec.root as Scene).marks as Mark[])
    .filter((m) => m.series === series)
    .map((mark) => ({
      mark,
      points: [mark.from as Point, ...mark.segments.map((s) => (s as { line: Point }).line)].map(toAxis),
    }));
}

const labels = (input: FunctionGraphInput): Block[] => ((expandFunctionGraph(input).root as Scene).children as Block[]);

// --- parametric --------------------------------------------------------------------

test("parametric: the unit circle is one closed mark, every vertex on it", () => {
  const marks = drawn(plane([{ id: "c", x: "cos(t)", y: "sin(t)", t: [0, "2pi"] }]), "c");
  assert.equal(marks.length, 1);
  assert.equal(marks[0]!.mark.close, true, "a curve that returns to its start is closed, so no seam");
  for (const p of marks[0]!.points) assert.ok(Math.abs(Math.hypot(p.x, p.y) - 1) < 1e-9);
  // Flat to a quarter pixel at 80px per unit asks for vertices every few pixels.
  assert.ok(marks[0]!.points.length >= 100, `${marks[0]!.points.length} vertices`);
});

test("parametric: a pole is not joined across -- (t, 1/t) is two marks, one per side", () => {
  const input = plane([{ id: "h", x: "t", y: "1/t", t: [-2, 2] }], { y: { range: [-3, 3], unit: 50 } });
  const marks = drawn(input, "h");
  assert.equal(marks.length, 2);
  for (const { points } of marks) {
    assert.equal(new Set(points.map((p) => Math.sign(p.x))).size, 1, "a mark on both sides of the pole");
    // Sampled vertices are on the curve; the two cut at the border lie on
    // the last chord, whose middle was within a quarter pixel of the curve
    // -- so within half a pixel (0.01 units at 50px) anywhere along it.
    for (const p of points.slice(1, -1)) assert.ok(Math.abs(p.x * p.y - 1) < 1e-9, `(${p.x}, ${p.y})`);
    for (const p of [points[0]!, points.at(-1)!]) {
      const distance = Math.abs(p.x * p.y - 1) / Math.hypot(p.x, p.y);
      assert.ok(distance < 0.5 / 50, `(${p.x}, ${p.y}) is ${distance} off the curve`);
    }
  }
});

test("parametric: a curve leaving the range is cut exactly at the border", () => {
  const marks = drawn(plane([{ id: "l", x: "t", y: "2t", t: [-5, 5] }]), "l");
  assert.equal(marks.length, 1);
  const { points } = marks[0]!;
  assert.ok(Math.abs(points[0]!.y + 2) < 1e-9 && Math.abs(points[0]!.x + 1) < 1e-9, JSON.stringify(points[0]));
  assert.ok(Math.abs(points.at(-1)!.y - 2) < 1e-9, JSON.stringify(points.at(-1)));
  for (const p of points) assert.ok(p.y >= -2 - 1e-9 && p.y <= 2 + 1e-9);
});

test("parametric: a point and a tangent are read off by the parameter, and {expr} prints both coordinates", () => {
  const input = plane(
    [{ id: "c", x: "2cos(t)", y: "sin(t)", t: [0, "2pi"], label: { text: "{expr}", at: 2.2 } }],
    {
      x: { range: [-3, 3], unit: 60 },
      points: [{ id: "P", at: { of: "c", t: "pi/4" }, label: "P{coords:2}" }],
      lines: [{ id: "T", tangent: { of: "c", at: "pi/4" }, domain: [0, 2.5], label: { text: "m = {slope}", at: 2.2 } }],
    },
  );
  const text = labels(input).map((b) => b.label);
  assert.ok(text.includes("(2cos(t); sin(t))"), text.join(" | "));
  assert.ok(text.includes("P(1,41; 0,71)"), text.join(" | "));
  // dy/dx = cos t / (−2 sin t) = −1/2 at t = π/4.
  assert.ok(text.includes("m = −1/2") || text.includes("m = −0,5"), text.join(" | "));
});

// --- polar ---------------------------------------------------------------------------

test("polar: r = 1 + cos θ is the cardioid, and θ may be spelled theta", () => {
  for (const r of ["1 + cos(θ)", "1 + cos(theta)"]) {
    const marks = drawn(plane([{ id: "k", r, theta: [0, "2pi"] }], { x: { range: [-1, 3], unit: 80 } }), "k");
    assert.equal(marks.length, 1);
    for (const p of marks[0]!.points) {
      // On the cardioid: (x² + y² − x)² = x² + y².
      const q = p.x * p.x + p.y * p.y;
      assert.ok(Math.abs((q - p.x) ** 2 - q) < 1e-6, `(${p.x}, ${p.y})`);
    }
  }
});

test("polar: r = 1/cos θ is the line x = 1, with no chord drawn through infinity", () => {
  const marks = drawn(plane([{ id: "v", r: "1/cos(θ)", theta: [0, "2pi"] }]), "v");
  assert.ok(marks.length >= 1);
  for (const { points } of marks) for (const p of points) assert.ok(Math.abs(p.x - 1) < 1e-6, `(${p.x}, ${p.y})`);
});

test("polar: the cardioid fixture computes P and its tangent's slope", () => {
  const input = {
    x: { range: [-1, 3], unit: 100 },
    y: { range: [-2, 2], unit: 100 },
    functions: [{ id: "c", r: "1 + cos(θ)", theta: [0, "2pi"], label: { text: "r = {expr}", at: 0.6 } }],
    lines: [{ id: "t", tangent: { of: "c", at: "pi/2" }, domain: [-1, 0.8], label: { text: "m = {slope}", at: -0.7 } }],
    points: [{ id: "P", at: { of: "c", theta: "pi/2" }, label: "P{coords}" }],
  } as FunctionGraphInput;
  const text = labels(input).map((b) => b.label);
  for (const want of ["r = 1 + cos(θ)", "P(0; 1)", "m = 1"]) assert.ok(text.includes(want), `${want}: ${text.join(" | ")}`);
});

// --- how close the drawn polyline is -------------------------------------------------

const fixture = (name: string): FunctionGraphInput =>
  JSON.parse(readFileSync(new URL(`../fixtures/function-graph/${name}`, import.meta.url), "utf8")) as FunctionGraphInput;

/**
 * The polyline measured against the curve itself, in pixels: the farthest
 * any of 20 000 true points lies from the drawn chords, and the sharpest
 * turn at a vertex between chords of at least half a pixel.
 */
function fidelity(input: FunctionGraphInput, series: string, curve: (s: number) => Point, s: [number, number]) {
  const toPx = (p: Point): Point => ({ x: (p.x - input.x.range[0]) * input.x.unit, y: (input.y.range[1] - p.y) * input.y.unit });
  // A closed mark's last chord is its closing one, back to the first vertex.
  const runs = drawn(input, series).map(({ mark, points }) => (mark.close ? [...points, points[0]!] : points).map(toPx));
  let deviation = 0;
  for (let k = 0; k <= 20000; k += 1) {
    const truth = curve(s[0] + ((s[1] - s[0]) * k) / 20000);
    const q = toPx(truth);
    if (truth.x < input.x.range[0] || truth.x > input.x.range[1] || truth.y < input.y.range[0] || truth.y > input.y.range[1]) continue;
    let best = Infinity;
    for (const run of runs) {
      for (let i = 1; i < run.length; i += 1) {
        const a = run[i - 1]!;
        const b = run[i]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const l2 = dx * dx + dy * dy;
        const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2));
        best = Math.min(best, Math.hypot(q.x - a.x - t * dx, q.y - a.y - t * dy));
      }
    }
    deviation = Math.max(deviation, best);
  }
  let turn = 0;
  for (const run of runs) {
    for (let i = 1; i < run.length - 1; i += 1) {
      const [a, m, b] = [run[i - 1]!, run[i]!, run[i + 1]!];
      const u = { x: m.x - a.x, y: m.y - a.y };
      const v = { x: b.x - m.x, y: b.y - m.y };
      if (Math.hypot(u.x, u.y) < 0.5 || Math.hypot(v.x, v.y) < 0.5) continue;
      turn = Math.max(turn, Math.abs(Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y)));
    }
  }
  return { runs, deviation, turn: (turn * 180) / Math.PI };
}

test("the rose r = cos 2θ is one unbroken, smooth run: flat to an eighth of a CSS pixel, and not cut at r = 0", () => {
  // A reviewer saw its petals faceted (chords of 7–12px turning 14° at every
  // vertex, within the old quarter-CSS-pixel bound but half a pixel of the
  // 2x PNG) and a piece missing beside the origin (the "0" tick's paper
  // backing, painted over the curve where it passes through r = 0).
  const input = fixture("curve-rose-polar.json");
  const rose = (s: number): Point => ({ x: Math.cos(2 * s) * Math.cos(s), y: Math.cos(2 * s) * Math.sin(s) });
  const { runs, deviation, turn } = fidelity(input, "r", rose, [0, 2 * Math.PI]);
  assert.equal(runs.length, 1, "r changing sign through the origin is not a jump");
  assert.equal(drawn(input, "r")[0]!.mark.close, true);
  assert.ok(deviation <= 0.125, `strays ${deviation.toFixed(3)}px from the rose`);
  assert.ok(turn <= 8, `turns ${turn.toFixed(1)}° at a vertex`);
  const through = drawn(input, "r")[0]!.points.filter((p) => Math.hypot(p.x, p.y) < 1e-9).length;
  assert.ok(through >= 4, `passes through the origin ${through} times, want 4`);
});

test("the parametric (2cos t, sin 2t) and the cardioid are held to the same bound", () => {
  const liss = fixture("curve-hyperbola-lissajous.json");
  const l = fidelity(liss, "l", (t) => ({ x: 2 * Math.cos(t), y: Math.sin(2 * t) }), [0, 2 * Math.PI]);
  assert.equal(l.runs.length, 1, "through its own crossing at the origin without a break");
  assert.ok(l.deviation <= 0.125 && l.turn <= 8, `strays ${l.deviation.toFixed(3)}px, turns ${l.turn.toFixed(1)}°`);
  const card = fixture("curve-cardioid-polar.json");
  const c = fidelity(card, "c", (s) => ({ x: (1 + Math.cos(s)) * Math.cos(s), y: (1 + Math.cos(s)) * Math.sin(s) }), [0, 2 * Math.PI]);
  assert.equal(c.runs.length, 1);
  assert.ok(c.deviation <= 0.125, `strays ${c.deviation.toFixed(3)}px`);
});

test("the hyperbola beside (2cos t, sin 2t) is two whole branches, and no tick number is painted over either curve", () => {
  // The gap a reviewer saw below (−2, 0) was the "−2" tick on a paper
  // backing: both curves have a vertical tangent on x = −2 there, so no spot
  // on its own gridline was clear and the number fell back to painting over
  // them. It now steps off the line first.
  for (const name of ["curve-hyperbola-lissajous.json", "curve-rose-polar.json", "curve-cardioid-polar.json"]) {
    const input = fixture(name);
    if (name.includes("hyperbola")) assert.equal(drawn(input, "h").length, 2, "one mark per branch");
    const backed = labels(input).filter((b) => (b.id ?? "").startsWith("tick") && b.fill !== "transparent");
    assert.deepEqual(backed.map((b) => `${b.id} "${b.label}"`), [], `${name}: a tick number on a paper backing cuts the curve under it`);
  }
});

// --- implicit ---------------------------------------------------------------------------

test("implicit: the ellipse x²/9 + y²/4 = 1 is traced where the equation holds", () => {
  const input = plane([{ id: "e", implicit: "x^2/9 + y^2/4 = 1", label: { text: "{expr}", at: [2.5, 2] } }], {
    x: { range: [-4, 4], unit: 50 },
    y: { range: [-3, 3], unit: 50 },
  });
  const marks = drawn(input, "e");
  assert.equal(marks.length, 1);
  assert.equal(marks[0]!.mark.close, true);
  for (const p of marks[0]!.points) assert.ok(Math.abs(p.x ** 2 / 9 + p.y ** 2 / 4 - 1) < 1e-6);
  const label = labels(input).find((b) => b.names === "e")!;
  assert.equal(label.label, "x²/9 + y²/4 = 1");
});

test("implicit: xy = 1 is two branches, never joined across the axes", () => {
  const marks = drawn(plane([{ id: "h", implicit: "xy = 1" }], { x: { range: [-3, 3], unit: 50 }, y: { range: [-3, 3], unit: 50 } }), "h");
  assert.equal(marks.length, 2);
  for (const { points } of marks) assert.equal(new Set(points.map((p) => Math.sign(p.x))).size, 1);
});

test("implicit: the axes' own names are further spellings of x and y, and print back as written", () => {
  const input: FunctionGraphInput = {
    x: { range: [-2, 2], unit: 60, name: "t" },
    y: { range: [-2, 2], unit: 60, name: "v" },
    functions: [{ id: "c", implicit: "t^2 + v^2 = 1", label: { text: "{expr}", at: [1, 1] } }],
  };
  assert.equal(labels(input).find((b) => b.names === "c")!.label, "t² + v² = 1");
  assert.equal(drawn(input, "c").length, 1);
});

test("implicit: a label given near the curve is anchored on it", () => {
  // The same label asked for from two points on the same side of the circle
  // starts from the same point of the curve.
  const at = (p: [number, number]) =>
    labels(plane([{ id: "c", implicit: "x^2 + y^2 = 1", label: { text: "C", at: p, towards: ["NE"] } }])).find((b) => b.names === "c")!;
  const a = at([1.5, 1.5]);
  const b = at([0.2, 0.2]);
  assert.ok(Math.abs(a.x! - b.x!) < 1e-6 && Math.abs(a.y! - b.y!) < 1e-6, `${a.x},${a.y} vs ${b.x},${b.y}`);
});

// --- everything else a curve does -------------------------------------------------------

test("every new kind is a series, labelled directly, and listed in the legend", () => {
  const input = plane([
    { id: "p", x: "cos(t)", y: "sin(t)", t: [0, "pi"], label: { text: "p", at: 1 }, legend: "paramétrica" },
    { id: "r", r: "0.5", theta: [0, "2pi"], style: "dashed", legend: "polar" },
    { id: "i", implicit: "y = x^2 - 1.5", colour: "warm", label: { text: "i", at: [1, -0.5] } },
  ]);
  const spec = expandFunctionGraph(input);
  const series = new Set(((spec.root as Scene).marks as Mark[]).map((m) => m.series).filter(Boolean));
  assert.deepEqual([...series].sort(), ["i", "p", "r"]);
  const blocks = (spec.root as Scene).children as Block[];
  assert.ok(blocks.some((b) => b.names === "p") && blocks.some((b) => b.names === "i"));
  assert.ok(blocks.some((b) => b.label === "paramétrica") && blocks.some((b) => b.label === "polar"));
});

test("the new kinds render with every check passing", { timeout: 240000 }, async () => {
  const result = await render(
    expandFunctionGraph({
      x: { range: [-3, 3], unit: 60 },
      y: { range: [-3, 3], unit: 60 },
      functions: [
        { id: "h", implicit: "xy = 1", label: { text: "{expr}", at: [0.4, 2.6], towards: ["R", "NE", "U"] } },
        { id: "c", x: "2cos(t)", y: "2sin(t)", t: [0, "2pi"], colour: "warm", style: "dashed", legend: "raio 2" },
      ],
    }),
    { raster: false },
  );
  const failing = result.manifest.checks.filter((c) => c.status === "fail");
  assert.equal(result.manifest.ok, true, failing.map((c) => `${c.id} ${c.target}: ${c.detail}`).join("\n"));
});

// --- refusals ---------------------------------------------------------------------------

test("a point is read off each kind by its own coordinate, and the wrong one is refused with the right one", () => {
  const circle: FunctionInput = { id: "c", x: "cos(t)", y: "sin(t)", t: [0, "2pi"] };
  assert.throws(
    () => expandFunctionGraph(plane([circle], { points: [{ at: { of: "c", x: 1 } }] })),
    /c is a parametric curve, which has no single point at an x; read a point off it by its parameter, \{"of": "c", "t": \.\.\.\}/,
  );
  assert.throws(
    () => expandFunctionGraph(plane([{ id: "f", expr: "x^2" }], { points: [{ at: { of: "f", t: 1 } }] })),
    /\{of, t\} reads a point off a parametric curve.*f is the graph of a function; read a point off it at an x/,
  );
  assert.throws(
    () => expandFunctionGraph(plane([{ id: "k", implicit: "x^2 + y^2 = 1" }], { points: [{ at: { of: "k", x: 0 } }] })),
    /an implicit curve has no parameter/,
  );
});

test("an implicit curve refuses what it has no coordinate for", () => {
  const k: FunctionInput = { id: "k", implicit: "x^2 + y^2 = 1" };
  assert.throws(() => expandFunctionGraph(plane([{ ...k, label: { text: "k", at: 1 } }])), /a number names no point on it/);
  assert.throws(
    () => expandFunctionGraph(plane([k], { lines: [{ id: "t", tangent: { of: "k", at: 0 }, domain: [0, 1] }] })),
    /k is an implicit curve.*state the curve parametrically/s,
  );
});

test("a vertical tangent is refused: a line here is y = mx + b", () => {
  assert.throws(
    () =>
      expandFunctionGraph(
        plane([{ id: "c", x: "cos(t)", y: "sin(t)", t: [0, "2pi"] }], { lines: [{ id: "t", tangent: { of: "c", at: 0 }, domain: [0, 1] }] }),
      ),
    /vertical tangent at t = 0/,
  );
});

test("validation: one form per curve, each with its own variables and extent", () => {
  const bad = (fn: Record<string, unknown>) => ({ preset: "function-graph", ...plane([fn as FunctionInput]) });
  assert.throws(() => parseFigureInput(bad({ id: "f", expr: "x", implicit: "x = y" })), /exactly one of "expr"/);
  assert.throws(() => parseFigureInput(bad({ id: "f", x: "cos(t)", t: [0, 1] })), /\.y is required/);
  assert.throws(() => parseFigureInput(bad({ id: "f", r: "1" })), /\.theta is required/);
  assert.throws(() => parseFigureInput(bad({ id: "f", x: "cos(x)", y: "sin(t)", t: [0, 1] })), /\.x: .*unknown name "x"\. The variable is "t"/);
  assert.throws(() => parseFigureInput(bad({ id: "f", r: "1 + t", theta: [0, 1] })), /unknown name "t"\. The variable is "θ"/);
  assert.throws(() => parseFigureInput(bad({ id: "f", implicit: "x^2 + y^2" })), /needs "="/);
  assert.throws(() => parseFigureInput(bad({ id: "f", implicit: "x^2 + z^2 = 1" })), /unknown name "z"/);
  assert.throws(() => parseFigureInput(bad({ id: "f", r: "1", theta: ["2pi", 0] })), /min < max/);
  assert.throws(() => parseFigureInput(bad({ id: "f", r: "1", theta: [0, "2t"] })), /theta\[1\]: .*unknown name "t"/);
  assert.throws(() => parseFigureInput(bad({ id: "f", implicit: "x = y", domain: [0, 1] })), /domain is an x interval/);
  assert.throws(() => parseFigureInput(bad({ id: "f", r: "1", theta: [0, 1], features: ["roots"] })), /features finds roots/);
  assert.throws(() => parseFigureInput(bad({ id: "f", implicit: "x^2 + y^2 = 100" })), /draws nothing inside the plotted range/);
});
