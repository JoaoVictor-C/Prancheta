/**
 * function-graph asymptotes and holes (ADR 0038).
 *
 * Two layers are tested. The pure one (`asymptotes.ts`): each asymptote and
 * hole is FOUND from the expression and confirmed by numeric.limit, and its
 * position is snapped to the exact number it is -- 1, π/2, 2 -- not to a
 * float near it. The drawn one (`functionGraphIR`, before frame resolution,
 * where every stroke is still in canvas px): the dashed line is where the
 * number says, its label is the computed equation and names the line, a
 * hole's ring sits at (a, lim f) over the curve, and no run of the curve is
 * joined across a vertical asymptote. Then the refusals: an asymptote or a
 * hole the figure claims and the limits deny is refused by name.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { functionGraphIR, validateFunctionGraphInput } from "../src/presets/function-graph/preset.ts";
import type { FunctionGraphInput, FunctionInput } from "../src/presets/function-graph/preset.ts";
import { atInfinity, snapExact, verticalsAndHoles, writeExact } from "../src/presets/function-graph/asymptotes.ts";
import { compile, parse } from "../src/math/expr.ts";
import type { Block, FigureSpec, Mark, Point, Scene } from "../src/ir/types.ts";

// ---- helpers -------------------------------------------------------------------

const find = (expr: string, lo: number, hi: number) => verticalsAndHoles(compile(expr), parse(expr), "x", lo, hi);

const figure = (fn: Partial<FunctionInput> & { expr: string }, extra: Partial<FunctionGraphInput> = {}): FunctionGraphInput => ({
  x: { range: [-4, 6], unit: 48 },
  y: { range: [-6, 8], unit: 28 },
  functions: [{ id: "f", ...fn }],
  ...extra,
});

const marks = (spec: FigureSpec): Mark[] => ((spec.root as Scene).marks ?? []) as Mark[];
const blocks = (spec: FigureSpec): Block[] => (spec.root as Scene).children as Block[];

/** A mark's vertices in canvas px (this preset states strokes in px). */
function points(m: Mark): Point[] {
  return [m.from as Point, ...m.segments.map((s) => ("line" in s ? (s.line as Point) : (s.arc as Point)))];
}

/** Axis units to canvas px, as the preset maps them (LEFT 46, TOP 30). */
const px = (input: FunctionGraphInput) => ({
  x: (u: number) => 46 + (u - input.x.range[0]) * input.x.unit,
  y: (w: number) => 30 + (input.y.range[1] - w) * input.y.unit,
});

const asymptoteMarks = (spec: FigureSpec): Mark[] => marks(spec).filter((m) => /^f-asymptote-\d+(-\d+)?$/.test(m.id));
const labelOf = (spec: FigureSpec, n: number): Block => {
  const block = blocks(spec).find((b) => b.id === `f-asymptote-${n}-label`);
  assert.ok(block, `no label for f-asymptote-${n}; blocks: ${blocks(spec).map((b) => b.id).join(", ")}`);
  return block;
};

// ---- vertical asymptotes: found, snapped, confirmed ---------------------------------

test("1/(x − 1): one vertical asymptote at exactly 1, both sides unbounded", () => {
  const { verticals, holes } = find("1/(x - 1)", -3, 5);
  assert.equal(verticals.length, 1);
  assert.equal(holes.length, 0);
  const v = verticals[0]!;
  assert.equal(v.x.value, 1, "snapped to 1, not a float beside it");
  assert.equal(v.x.exact, true);
  assert.equal(v.left.kind, "infinite");
  assert.equal(v.right.kind, "infinite");
  assert.equal(v.left.kind === "infinite" && v.left.sign, -1);
  assert.equal(v.right.kind === "infinite" && v.right.sign, 1);
});

test("(2x + 1)/(x − 1): x = 1 drawn across the plotted y range and labelled with its computed equation", () => {
  const input = figure({ expr: "(2x + 1)/(x - 1)", asymptotes: true });
  const spec = functionGraphIR(input);
  const map = px(input);
  const vertical = asymptoteMarks(spec).filter((m) => points(m).every((p) => Math.abs(p.x - map.x(1)) < 1e-9));
  assert.ok(vertical.length >= 1, "a vertical line at x = 1");
  const ys = vertical.flatMap(points).map((p) => p.y);
  // Cut around the "1" under the axis, it still reaches both edges of the plot.
  assert.ok(Math.abs(Math.min(...ys) - map.y(8)) < 1e-9 && Math.abs(Math.max(...ys) - map.y(-6)) < 1e-9);
  for (const m of vertical) {
    assert.equal(m.lineStyle, "dashed");
    assert.equal(m.series, "f-asymptote-1");
  }
  assert.equal(labelOf(spec, 1).label, "x = 1");
});

test("tan x on [−4, 4]: vertical asymptotes at exactly ±π/2, written π/2", () => {
  const { verticals } = find("tan(x)", -4, 4);
  assert.deepEqual(
    verticals.map((v) => v.x.value),
    [-Math.PI / 2, Math.PI / 2],
  );
  assert.deepEqual(
    verticals.map((v) => writeExact(v.x, "pt-BR")),
    ["−π/2", "π/2"],
  );
  const spec = functionGraphIR({
    x: { range: [-4, 4], unit: 55 },
    y: { range: [-5, 5], unit: 32 },
    functions: [{ id: "f", expr: "tan(x)", asymptotes: { vertical: true } }],
  });
  assert.deepEqual([labelOf(spec, 1).label, labelOf(spec, 2).label], ["x = −π/2", "x = π/2"]);
});

test("snapping: a small fraction, a root, a multiple of π -- and a number that is none of them is left inexact", () => {
  assert.deepEqual(snapExact(0.6666667, 1e-5), { value: 2 / 3, exact: true, form: "rational" });
  assert.equal(writeExact(snapExact(1.7320508, 1e-5), "pt-BR"), "√3");
  assert.equal(writeExact(snapExact(-4.712389, 1e-5), "pt-BR"), "−3π/2");
  const odd = snapExact(1.23456, 1e-7);
  assert.equal(odd.exact, false);
});

// ---- horizontal asymptotes ---------------------------------------------------------

test("(2x + 1)/(x − 1): the same y = 2 at both ends, drawn once across the whole x range", () => {
  const f = compile("(2x + 1)/(x - 1)");
  for (const side of [1, -1] as const) {
    const r = atInfinity(f, side);
    assert.ok(r.kind === "horizontal" && r.line.q.value === 2, `${r.kind}`);
  }
  const input = figure({ expr: "(2x + 1)/(x - 1)", asymptotes: true });
  const spec = functionGraphIR(input);
  const map = px(input);
  const horizontal = asymptoteMarks(spec).filter((m) => m.series === "f-asymptote-2");
  const pts = horizontal.flatMap(points);
  assert.ok(pts.every((p) => Math.abs(p.y - map.y(2)) < 1e-9), "every point on y = 2");
  const xs = pts.map((p) => p.x);
  assert.ok(Math.abs(Math.min(...xs) - map.x(-4)) < 1e-9 && Math.abs(Math.max(...xs) - map.x(6)) < 1e-9, "edge to edge");
  assert.equal(labelOf(spec, 2).label, "y = 2");
});

test("arctan: y = π/2 as x → +∞ and y = −π/2 as x → −∞, each drawn only toward its own side", () => {
  const f = compile("atan(x)");
  const right = atInfinity(f, 1);
  const left = atInfinity(f, -1);
  assert.equal(right.kind !== "none" && right.line.q.value, Math.PI / 2);
  assert.equal(left.kind !== "none" && left.line.q.value, -Math.PI / 2);
  const input: FunctionGraphInput = {
    x: { range: [-6, 6], unit: 42 },
    y: { range: [-2.5, 2.5], unit: 60, step: 0.5, labelEvery: 2 },
    functions: [{ id: "f", expr: "atan(x)", asymptotes: { horizontal: true } }],
  };
  const spec = functionGraphIR(input);
  const map = px(input);
  const byText = new Map(blocks(spec).filter((b) => (b.id ?? "").endsWith("-label")).map((b) => [b.label, b]));
  assert.ok(byText.has("y = π/2") && byText.has("y = −π/2"), [...byText.keys()].join(", "));
  const extent = (series: string): [number, number] => {
    const xs = marks(spec).filter((m) => m.series === series).flatMap(points).map((p) => p.x);
    return [Math.min(...xs), Math.max(...xs)];
  };
  const up = byText.get("y = π/2")!.names!;
  const down = byText.get("y = −π/2")!.names!;
  assert.deepEqual(extent(up), [map.x(0), map.x(6)], "π/2 from the middle to the right edge");
  assert.deepEqual(extent(down), [map.x(-6), map.x(0)], "−π/2 from the left edge to the middle");
});

// ---- oblique asymptotes ------------------------------------------------------------

test("(x² + 1)/x: the oblique asymptote y = x (m = 1, q = 0, both computed) and the vertical x = 0", () => {
  const f = compile("(x^2 + 1)/x");
  const r = atInfinity(f, 1);
  assert.equal(r.kind, "oblique");
  assert.ok(r.kind === "oblique" && r.line.m.value === 1 && r.line.q.value === 0);
  const input = figure({ expr: "(x^2 + 1)/x", asymptotes: { vertical: [0], oblique: true } }, {
    x: { range: [-5, 5], unit: 44 },
    y: { range: [-7, 7], unit: 30 },
  });
  const spec = functionGraphIR(input);
  const map = px(input);
  const texts = blocks(spec).filter((b) => /^f-asymptote-\d+-label$/.test(b.id ?? "")).map((b) => b.label);
  assert.deepEqual(texts.sort(), ["x = 0", "y = x"]);
  const slant = labelOf(spec, texts.indexOf("y = x") >= 0 ? 2 : 1);
  const line = marks(spec).filter((m) => m.series === slant.names).flatMap(points);
  for (const p of line) {
    const u = (p.x - 46) / input.x.unit + input.x.range[0];
    assert.ok(Math.abs(p.y - map.y(u)) < 1e-6, `(${p.x}, ${p.y}) is not on y = x`);
  }
});

test("√(x² + 1): y = x on the right and y = −x on the left, each on its own side", () => {
  const f = compile("sqrt(x^2 + 1)");
  const right = atInfinity(f, 1);
  const left = atInfinity(f, -1);
  assert.ok(right.kind === "oblique" && right.line.m.value === 1 && right.line.q.value === 0);
  assert.ok(left.kind === "oblique" && left.line.m.value === -1 && left.line.q.value === 0);
  const spec = functionGraphIR(figure({ expr: "sqrt(x^2 + 1)", asymptotes: { oblique: true } }, { y: { range: [-1, 7], unit: 30 } }));
  const texts = blocks(spec).filter((b) => /^f-asymptote-\d+-label$/.test(b.id ?? "")).map((b) => b.label).sort();
  assert.deepEqual(texts, ["y = x", "y = −x"]);
});

// ---- no asymptote where there is none ----------------------------------------------

test("a polynomial has no asymptote: nothing found, and asking for one is refused", () => {
  const { verticals, holes } = find("x^3 - 3x", -3, 3);
  assert.equal(verticals.length + holes.length, 0);
  const f = compile("x^3 - 3x");
  assert.equal(atInfinity(f, 1).kind, "none");
  assert.equal(atInfinity(f, -1).kind, "none");
  assert.throws(
    () => functionGraphIR(figure({ expr: "x^3 - 3x", asymptotes: true })),
    /f has no asymptote the numerics can confirm/,
  );
  // A line is not its own oblique asymptote.
  assert.throws(() => functionGraphIR(figure({ expr: "2x - 1", asymptotes: { oblique: true } })), /is itself the line y = 2x − 1/);
});

// ---- holes -----------------------------------------------------------------------

test("(x² − 1)/(x − 1): a hole found at exactly (1, 2), y computed from the limit", () => {
  const { verticals, holes } = find("(x^2 - 1)/(x - 1)", -3, 4);
  assert.equal(verticals.length, 0, "0/0 is not a pole");
  assert.equal(holes.length, 1);
  assert.equal(holes[0]!.x.value, 1);
  assert.equal(holes[0]!.y.value, 2);
  assert.equal(holes[0]!.y.exact, true);
});

test("the hole is an open ring at (1, 2), on the curve, painted over it with paper inside", () => {
  const input = figure({ expr: "(x^2 - 1)/(x - 1)", holes: true }, { x: { range: [-3, 4], unit: 56 }, y: { range: [-2, 6], unit: 40 } });
  const spec = functionGraphIR(input);
  const map = px(input);
  const all = marks(spec);
  const ring = all.find((m) => m.id === "f-hole-1");
  assert.ok(ring, "a ring for the hole");
  const centre = (ring.segments[0] as { centre: Point }).centre;
  assert.ok(Math.abs(centre.x - map.x(1)) < 1e-9 && Math.abs(centre.y - map.y(2)) < 1e-9, "at (1, 2)");
  assert.deepEqual(ring.on, ["f"], "declared on its curve, so feature-on-its-curve measures it");
  assert.equal(ring.fill, "#FCFBF7", "paper inside: the curve does not show through");
  const lastCurve = Math.max(...all.flatMap((m, i) => (m.series === "f" ? [i] : [])));
  assert.ok(all.indexOf(ring) > lastCurve, "the ring is painted after (over) the curve");
  // The curve runs up to the hole from both sides.
  const curve = all.filter((m) => m.series === "f").flatMap(points);
  const nearest = Math.min(...curve.map((p) => Math.hypot(p.x - centre.x, p.y - centre.y)));
  assert.ok(nearest < 0.5, `the curve reaches the hole (${nearest}px)`);
});

test("a hole may be declared where the expression never skips; its y is still the limit", () => {
  const spec = functionGraphIR(figure({ expr: "x + 4", holes: [4] }, { x: { range: [-1, 7], unit: 50 }, y: { range: [-1, 12], unit: 24 } }));
  const ring = marks(spec).find((m) => m.id === "f-hole-1")!;
  const input = figure({ expr: "x + 4" }, { x: { range: [-1, 7], unit: 50 }, y: { range: [-1, 12], unit: 24 } });
  const centre = (ring.segments[0] as { centre: Point }).centre;
  assert.ok(Math.abs(centre.y - px(input).y(8)) < 1e-9);
});

// ---- refusals ------------------------------------------------------------------------

test("an asymptote or hole the figure claims and the limits deny is refused by name", () => {
  assert.throws(
    () => functionGraphIR(figure({ expr: "1/(x - 1)", asymptotes: { vertical: [2] } })),
    /f has no vertical asymptote at x = 2: as x → 2⁻, f\(x\) → 1; as x → 2⁺, f\(x\) → 1/,
  );
  assert.throws(
    () => functionGraphIR(figure({ expr: "(x^2 - 1)/(x - 1)", asymptotes: { vertical: [1] } })),
    /no vertical asymptote at x = 1.*that is a hole/,
  );
  assert.throws(() => functionGraphIR(figure({ expr: "x^2", asymptotes: { horizontal: true } })), /f has no horizontal asymptote: as x → \+∞, f\(x\) → \+∞/);
  assert.throws(() => functionGraphIR(figure({ expr: "(2x + 1)/(x - 1)", asymptotes: { oblique: true } })), /f has no oblique asymptote/);
  assert.throws(() => functionGraphIR(figure({ expr: "1/(x - 1)", holes: [1] })), /f has no hole at x = 1/);
  assert.throws(() => functionGraphIR(figure({ expr: "x^2", holes: true })), /f has no hole in x/);
  assert.throws(
    () =>
      validateFunctionGraphInput({
        x: { range: [-4, 6], unit: 48 },
        y: { range: [-6, 8], unit: 28 },
        functions: [{ id: "f", pieces: [{ expr: "1/x", domain: [-4, 6] }], asymptotes: true }],
      }),
    /found from a function given by one expression/,
  );
  assert.throws(
    () => validateFunctionGraphInput({ ...figure({ expr: "1/x" }), functions: [{ id: "f", expr: "1/x", asymptotes: { slanted: true } }] }),
    /asymptotes.slanted is not a kind of asymptote/,
  );
});

// ---- never joined across a pole ----------------------------------------------------------

/** Does any run of series f have two consecutive points on opposite sides of x = a (in px)? */
function joinedAcross(spec: FigureSpec, at: number): boolean {
  return marks(spec)
    .filter((m) => m.series === "f")
    .some((m) => {
      const pts = points(m);
      return pts.some((p, i) => i > 0 && (pts[i - 1]!.x - at) * (p.x - at) < 0);
    });
}

test("the curve is never joined across a vertical asymptote -- with asymptotes drawn, and without", () => {
  // Drawn: sampled adaptively on each side of the pole.
  const drawn = figure({ expr: "1/(x - 1)", asymptotes: true });
  assert.equal(joinedAcross(functionGraphIR(drawn), px(drawn).x(1)), false);
  // Not drawn, on a y range tall enough that the even samples on both sides
  // of the pole (±60) are both in range: the jump is found between them.
  const plain: FunctionGraphInput = { x: { range: [-3, 5.3], unit: 50 }, y: { range: [-100, 100], unit: 2, step: 20 }, functions: [{ id: "f", expr: "1/(x - 1)" }] };
  assert.equal(joinedAcross(functionGraphIR(plain), px(plain).x(1)), false);
  // tan, at both poles.
  const tan: FunctionGraphInput = { x: { range: [-4, 4], unit: 55 }, y: { range: [-5, 5], unit: 32 }, functions: [{ id: "f", expr: "tan(x)", asymptotes: { vertical: true } }] };
  const spec = functionGraphIR(tan);
  for (const a of [-Math.PI / 2, Math.PI / 2]) assert.equal(joinedAcross(spec, px(tan).x(a)), false);
  // A steep but continuous stretch is still one run.
  const steep: FunctionGraphInput = { x: { range: [-2, 2], unit: 50 }, y: { range: [-10, 10], unit: 10 }, functions: [{ id: "f", expr: "x^3" }] };
  assert.equal(marks(functionGraphIR(steep)).filter((m) => m.series === "f").length, 1);
});

// ---- what each label claims ------------------------------------------------------------

test("each asymptote label annotates its own dashed line, names its series and sits beside it, not on it", () => {
  const input = figure({ expr: "(2x + 1)/(x - 1)", asymptotes: true });
  const spec = functionGraphIR(input);
  for (const n of [1, 2]) {
    const label = labelOf(spec, n);
    assert.equal(label.names, `f-asymptote-${n}`);
    const owner = marks(spec).find((m) => m.id === label.annotates);
    assert.ok(owner !== undefined && owner.series === `f-asymptote-${n}`, `annotates ${label.annotates}, a piece of its own line`);
    // Beside the line: the box does not cross it.
    const box = { x0: label.x!, x1: label.x! + label.width!, y0: label.y!, y1: label.y! + label.height! };
    for (const m of marks(spec).filter((mm) => mm.series === `f-asymptote-${n}`)) {
      const [a, b] = points(m) as [Point, Point];
      const vertical = Math.abs(a.x - b.x) < 1e-9;
      const crosses = vertical
        ? a.x > box.x0 && a.x < box.x1 && Math.max(a.y, b.y) > box.y0 && Math.min(a.y, b.y) < box.y1
        : a.y > box.y0 && a.y < box.y1 && Math.max(a.x, b.x) > box.x0 && Math.min(a.x, b.x) < box.x1;
      assert.equal(crosses, false, `${label.label} is set on its own line`);
    }
  }
});
