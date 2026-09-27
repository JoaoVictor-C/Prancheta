/**
 * function-graph areas and Riemann sums (ADR 0036).
 *
 * Everything here is read back from the figure as the preset states it --
 * `functionGraphIR`, before frame resolution, where every region is still a
 * closed mark with its vertices in the plane's own axis units -- and measured
 * against the expressions and against numeric.ts. "It looks shaded" is never
 * the evidence: a vertex lies on its curve or on the axis, a bound found at an
 * intersection IS the intersection, a printed number IS numeric.integrate's,
 * a rectangle IS the one numeric.riemann summed. Then the refusals: a pole, a
 * region the plot would clip, curves that do not meet twice.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { expandFunctionGraph, functionGraphIR, validateFunctionGraphInput } from "../src/presets/function-graph/preset.ts";
import type { AreaInput, FunctionGraphInput, RiemannInput } from "../src/presets/function-graph/preset.ts";
import { shoelace, subscript } from "../src/presets/function-graph/areas.ts";
import { integrate, riemann } from "../src/math/numeric.ts";
import { formatNumber } from "../src/locale/format.ts";
import type { Block, FigureSpec, FramedPoint, Mark, Scene } from "../src/ir/types.ts";

const plane = (extra: Partial<FunctionGraphInput>): FunctionGraphInput => ({
  x: { range: [-0.6, 2.6], unit: 110, step: 0.5, labelEvery: 2 },
  y: { range: [-1.5, 4.8], unit: 50 },
  functions: [{ id: "f", expr: "x^2" }],
  ...extra,
});

const marks = (spec: FigureSpec): Mark[] => ((spec.root as Scene).marks ?? []) as Mark[];
const blocks = (spec: FigureSpec): Block[] => (spec.root as Scene).children as Block[];
const mark = (spec: FigureSpec, id: string): Mark => {
  const found = marks(spec).find((m) => m.id === id);
  assert.ok(found, `no mark ${id}; marks: ${marks(spec).map((m) => m.id).join(", ")}`);
  return found;
};
const block = (spec: FigureSpec, id: string): Block => {
  const found = blocks(spec).find((b) => b.id === id);
  assert.ok(found, `no block ${id}; blocks: ${blocks(spec).map((b) => b.id).join(", ")}`);
  return found;
};

/** A closed mark's vertices, asserting every one is stated in the plane's frame. */
function vertices(m: Mark): { x: number; y: number }[] {
  const all = [m.from, ...m.segments.map((s) => {
    assert.ok("line" in s, `${m.id} has an arc segment`);
    return s.line;
  })];
  return all.map((p) => {
    const framed = p as FramedPoint;
    assert.equal(framed.frame, "plane", `${m.id} has a vertex not stated in the plane's frame`);
    return { x: framed.x, y: framed.y };
  });
}

const areaOf = (input: FunctionGraphInput, area: AreaInput): FigureSpec => functionGraphIR({ ...input, areas: [area] });
const sumOf = (input: FunctionGraphInput, sum: RiemannInput): FigureSpec => functionGraphIR({ ...input, riemann: [sum] });

// --- the region is sampled from the curves ----------------------------------------

test("area under x² on [0, 2]: one closed mark, every vertex on the curve or on the axis, in frame units", () => {
  const spec = areaOf(plane({}), { id: "A", of: "f", from: 0, to: 2 });
  const region = mark(spec, "A");
  assert.equal(region.close, true);
  assert.equal(region.stroke, "none", "a region is a fill, not ink a label must avoid");
  const pts = vertices(region);
  assert.ok(pts.length > 50, `${pts.length} vertices: sampled, not typed`);
  for (const p of pts) {
    const onCurve = Math.abs(p.y - p.x * p.x) < 1e-12;
    const onAxis = Math.abs(p.y) < 1e-12;
    assert.ok(onCurve || onAxis, `(${p.x}, ${p.y}) is on neither y = x² nor the axis`);
    assert.ok(p.x >= 0 && p.x <= 2, `(${p.x}, ${p.y}) outside [0, 2]`);
  }
  assert.equal(Math.min(...pts.map((p) => p.x)), 0);
  assert.equal(Math.max(...pts.map((p) => p.x)), 2);
  // The polygon's own area is the integral, well inside what
  // area-matches-its-label forgives (ADR 0037).
  assert.ok(Math.abs(Math.abs(shoelace(pts)) - 8 / 3) < 1e-4, `polygon area ${shoelace(pts)}`);
});

test("the printed value is numeric.integrate's, formatted by the one formatter, and the label annotates its region", () => {
  const spec = areaOf(plane({}), { id: "A", of: "f", from: 0, to: 2 });
  const label = block(spec, "A-label");
  const value = integrate((x) => x * x, 0, 2).value;
  assert.equal(label.label, `A = ${formatNumber(value)}`);
  assert.equal(label.label, "A = 8/3");
  assert.equal(label.annotates, "A");
});

test("a value that is no short decimal and no fraction is rounded, and the = becomes ≈", () => {
  const spec = areaOf(plane({ functions: [{ id: "f", expr: "exp(x)" }] }), { id: "A", of: "f", from: 0, to: 1 });
  const value = integrate(Math.exp, 0, 1).value;
  assert.equal(block(spec, "A-label").label, `A ≈ ${formatNumber(value)}`);
  assert.equal(block(spec, "A-label").label, "A ≈ 1,718");
});

test("bounds may be expressions: from 0 to pi/2 under cos is exactly 1", () => {
  const spec = areaOf(plane({ functions: [{ id: "f", expr: "cos(x)" }] }), { id: "A", of: "f", from: 0, to: "pi/2" });
  assert.equal(block(spec, "A-label").label, "A = 1");
  const pts = vertices(mark(spec, "A"));
  assert.equal(Math.max(...pts.map((p) => p.x)), Math.PI / 2);
});

test("a template chooses the words; {area} and {integral} are computed", () => {
  const spec = areaOf(plane({}), { id: "A", of: "f", from: 0, to: 2, label: "{area} u.a." });
  assert.equal(block(spec, "A-label").label, "8/3 u.a.");
});

// --- between two curves --------------------------------------------------------------

test("between x² and x + 2 with no bounds: the bounds are the intersections, −1 and 2, found and snapped", () => {
  const input = plane({
    x: { range: [-1.8, 2.8], unit: 100 },
    y: { range: [-0.8, 5.4], unit: 55 },
    functions: [
      { id: "g", expr: "x + 2" },
      { id: "f", expr: "x^2" },
    ],
  });
  const spec = areaOf(input, { id: "A", between: ["g", "f"] });
  const pts = vertices(mark(spec, "A"));
  assert.equal(Math.min(...pts.map((p) => p.x)), -1, "left bound is the intersection x = −1, exactly");
  assert.equal(Math.max(...pts.map((p) => p.x)), 2, "right bound is the intersection x = 2, exactly");
  for (const p of pts) {
    const onG = Math.abs(p.y - (p.x + 2)) < 1e-12;
    const onF = Math.abs(p.y - p.x * p.x) < 1e-12;
    assert.ok(onG || onF, `(${p.x}, ${p.y}) is on neither curve`);
  }
  assert.equal(block(spec, "A-label").label, "A = 4,5");
  assert.ok(Math.abs(Math.abs(shoelace(pts)) - 4.5) < 1e-3, `polygon area ${shoelace(pts)}`);
});

test("between x and x²: bounds 0 and 1 found, area 1/6", () => {
  const input = plane({
    x: { range: [-0.3, 1.4], unit: 400 },
    y: { range: [-0.3, 1.4], unit: 400 },
    functions: [
      { id: "g", expr: "x" },
      { id: "f", expr: "x^2" },
    ],
  });
  const spec = areaOf(input, { id: "A", between: ["g", "f"] });
  const pts = vertices(mark(spec, "A"));
  assert.equal(Math.min(...pts.map((p) => p.x)), 0);
  assert.equal(Math.max(...pts.map((p) => p.x)), 1);
  assert.equal(block(spec, "A-label").label, "A = 1/6");
});

test("curves that do not meet twice are refused an area with no bounds", () => {
  const input = plane({ functions: [{ id: "f", expr: "x^2" }, { id: "g", expr: "x^2 + 1" }] });
  assert.throws(() => areaOf(input, { between: ["f", "g"] }), /meet nowhere.*give "from" and "to"/);
});

// --- where the integrand changes sign ------------------------------------------

test("sin on [0, 2π]: two parts split at π, one above and one below the axis, each labelled with its own area", () => {
  const input = plane({
    x: { range: [-0.5, 7], unit: 70 },
    y: { range: [-1.5, 1.5], unit: 90, step: 0.5, labelEvery: 2 },
    functions: [{ id: "f", expr: "sin(x)" }],
  });
  const spec = areaOf(input, { id: "A", of: "f", from: 0, to: "2pi" });
  const above = vertices(mark(spec, "A-1"));
  const below = vertices(mark(spec, "A-2"));
  assert.ok(above.every((p) => p.y >= -1e-12), "the first part lies above the axis");
  assert.ok(below.every((p) => p.y <= 1e-12), "the second part lies below it");
  assert.ok(Math.abs(Math.max(...above.map((p) => p.x)) - Math.PI) < 1e-9, "split at the root π");
  assert.ok(Math.abs(Math.min(...below.map((p) => p.x)) - Math.PI) < 1e-9);
  assert.notEqual(mark(spec, "A-1").fill, mark(spec, "A-2").fill, "the two signs are shaded differently");
  // Each part's label states that part's own (geometric) area, so
  // area-matches-its-label can measure it; the total names no single mark.
  assert.equal(block(spec, "A-1-label").label, `A${subscript(1)} = 2`);
  assert.equal(block(spec, "A-2-label").label, `A${subscript(2)} = 2`);
  assert.equal(block(spec, "A-1-label").annotates, "A-1");
  assert.equal(block(spec, "A-2-label").annotates, "A-2");
  const total = block(spec, "A-total");
  assert.equal(total.label, "A = 4");
  assert.equal(total.freeStanding, true);
  assert.equal(total.annotates, undefined);
});

test("value: integral prints the signed integral as the caption; the parts keep their areas", () => {
  const input = plane({
    x: { range: [-0.5, 7], unit: 70 },
    y: { range: [-1.5, 1.5], unit: 90 },
    functions: [{ id: "f", expr: "sin(x)" }],
  });
  const spec = areaOf(input, { id: "A", of: "f", from: 0, to: "2pi", value: "integral" });
  assert.equal(block(spec, "A-total").label, "∫ = 0");
  assert.equal(block(spec, "A-2-label").label, `A${subscript(2)} = 2`);
  // One part below the axis alone: its caption is negative, its label is not.
  const one = areaOf(input, { id: "B", of: "f", from: "pi", to: "2pi", value: "integral" });
  assert.equal(block(one, "B-label").label, "A = 2");
  assert.equal(block(one, "B-total").label, "∫ = −2");
});

// --- refusals ---------------------------------------------------------------------

test("a pole inside [a, b] is refused, not printed", () => {
  const input = plane({ x: { range: [-1.5, 2.6], unit: 80 }, y: { range: [-5, 5], unit: 30 }, functions: [{ id: "f", expr: "1/x" }] });
  assert.throws(() => areaOf(input, { of: "f", from: -1, to: 1 }), /refused, not printed.*pole/);
  assert.throws(() => sumOf(input, { of: "f", from: 0, to: 1, n: 4, rule: "left" }), /refused, not printed/);
  // A sum whose samples miss the pole is computable, but its integral is not.
  const mid = { of: "f", from: -1, to: 1, n: 2, rule: "mid" as const };
  assert.throws(() => sumOf(input, { ...mid, integral: true }), /refused, not printed/);
});

test("a region the plotted range would clip is refused", () => {
  assert.throws(() => areaOf(plane({ y: { range: [-1, 3], unit: 50 } }), { of: "f", from: 0, to: 2 }), /outside the plotted y range/);
  assert.throws(() => areaOf(plane({}), { of: "f", from: 0, to: 3 }), /outside the plotted x range/);
});

test("areas and sums take only graphs of functions", () => {
  const input = plane({ functions: [{ id: "c", x: "cos(t)", y: "sin(t)", t: [0, "2pi"] }] });
  assert.throws(() => areaOf(input, { of: "c", from: 0, to: 1 }), /parametric curve; an area is taken under the graph/);
});

test("validation: one of `of` or `between`, both bounds or none", () => {
  const raw = (area: unknown) => ({ ...plane({}), areas: [area] }) as unknown as Record<string, unknown>;
  assert.throws(() => validateFunctionGraphInput(raw({ of: "f", between: ["f", "f"], from: 0, to: 1 })), /exactly one of "of"/);
  assert.throws(() => validateFunctionGraphInput(raw({ of: "f", from: 0 })), /needs "from" and "to"/);
  assert.throws(() => validateFunctionGraphInput(raw({ between: ["f", "f"], from: 0 })), /both "from" and "to", or neither/);
  validateFunctionGraphInput(raw({ of: "f", from: 0, to: "pi/2" }));
});

// --- Riemann sums --------------------------------------------------------------------

for (const rule of ["left", "right", "mid", "trapezoid"] as const) {
  for (const n of [4, 8]) {
    test(`riemann ${rule}, n = ${n}: the rectangles are exactly the ones numeric.riemann summed`, () => {
      const spec = sumOf(plane({}), { id: "S", of: "f", from: 0, to: 2, n, rule, label: true });
      const summed = riemann((x) => x * x, 0, 2, n, rule);
      summed.rectangles.forEach((r, k) => {
        const [h0, h1] = r.heights ?? [r.height!, r.height!];
        assert.deepEqual(vertices(mark(spec, `S-rect-${k + 1}`)), [
          { x: r.x0, y: 0 },
          { x: r.x1, y: 0 },
          { x: r.x1, y: h1 },
          { x: r.x0, y: h0 },
        ]);
      });
      assert.equal(marks(spec).filter((m) => m.id.startsWith("S-rect-")).length, n);
      // The sum's label names the union's outline, whose area IS the sum.
      const outline = vertices(mark(spec, "S"));
      assert.ok(Math.abs(Math.abs(shoelace(outline)) - summed.sum) < 1e-12);
      const label = block(spec, "S-sum");
      assert.equal(label.annotates, "S");
      assert.match(label.label as string, new RegExp(`^S${subscript(n)} [=≈] `));
      // The sample points sit on the curve and say so.
      const dots = marks(spec).filter((m) => m.id.startsWith("S-sample-"));
      assert.equal(dots.length, rule === "trapezoid" ? 0 : n);
      for (const dot of dots) assert.deepEqual(dot.on, ["f"]);
    });
  }
}

test("riemann: the printed sum is numeric.riemann's, the integral beside it numeric.integrate's", () => {
  const cases: [RiemannInput["rule"], number, string][] = [
    ["left", 4, "S₄ = 1,75"],
    ["left", 8, "S₈ = 2,1875"],
    ["mid", 4, "S₄ = 2,625"],
    ["mid", 8, "S₈ = 2,65625"],
  ];
  for (const [rule, n, text] of cases) {
    const spec = sumOf(plane({}), { id: "S", of: "f", from: 0, to: 2, n, rule, label: true, integral: true });
    assert.equal(block(spec, "S-sum").label, text);
    const caption = block(spec, "S-integral");
    assert.equal(caption.label, "∫ = 8/3");
    assert.equal(caption.freeStanding, true, "the integral is the area of nothing a Riemann figure draws");
  }
});

test("riemann: where f < 0 the rectangles stand below the axis", () => {
  const input = plane({ functions: [{ id: "f", expr: "x - 1" }] });
  const spec = sumOf(input, { id: "S", of: "f", from: 0, to: 2, n: 4, rule: "left" });
  const heights = [-1, -0.5, 0, 0.5];
  heights.forEach((h, k) => {
    const ys = vertices(mark(spec, `S-rect-${k + 1}`)).map((p) => p.y);
    if (h < 0) assert.ok(ys.every((y) => y <= 0) && Math.min(...ys) === h, `rect ${k + 1}: ${ys}`);
    if (h > 0) assert.ok(ys.every((y) => y >= 0) && Math.max(...ys) === h, `rect ${k + 1}: ${ys}`);
  });
  assert.notEqual(mark(spec, "S-rect-1").fill, mark(spec, "S-rect-4").fill);
});

test("the expansion resolves: every region leaves in canvas pixels, and validation agrees with drawing", () => {
  const input = plane({ areas: [{ of: "f", from: 0, to: 2 }], riemann: [{ of: "f", from: 0, to: 2, n: 4, rule: "mid", label: true }] });
  const spec = expandFunctionGraph(input);
  for (const m of marks(spec)) assert.equal((m.from as FramedPoint).frame, undefined);
  validateFunctionGraphInput(input as unknown as Record<string, unknown>);
});
