/**
 * field: slope fields, vector fields and level curves are all DERIVED --
 * a slope mark's direction from `f(x, y)`, a solution curve from `rk4Scalar`,
 * a vector arrow from `(P, Q)`, a level curve from `contour.ts`, a gradient
 * arrow from central differences -- never typed. These tests decode the
 * frame's own affine map back from canvas pixels to (x, y) and check the
 * DRAWN geometry against the stated expression, the way a reviewer with a
 * ruler would, rather than trusting the preset's own arithmetic a second time
 * with different numbers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expandField, frameGeometry, gradient, latticeIn, niceStep, validateFieldInput } from "../src/presets/field/preset.ts";
import type { FieldInput } from "../src/presets/field/preset.ts";
import { compileIn } from "../src/math/expr.ts";
import { contour } from "../src/math/contour.ts";
import { render } from "../src/pipeline.ts";
import type { Connector, Mark, Point, Scene } from "../src/ir/types.ts";

const fixtureDir = (name: string): string => fileURLToPath(new URL(`../fixtures/field/${name}`, import.meta.url));
const loadFixture = (name: string): FieldInput => JSON.parse(readFileSync(fixtureDir(name), "utf8")) as FieldInput;

type Geometry = ReturnType<typeof frameGeometry>;

/** The frame's own affine map, inverted -- canvas pixels back to (x, y). Every field frame is axis-aligned (no rotation), so this is exact -- `frameGeometry` is the SAME function `expandField` itself calls to place the frame, not a second hand-derived formula that could drift from it. */
function invert(geo: Geometry, p: Point): { x: number; y: number } {
  return { x: (p.x - geo.origin.x) / geo.unit, y: (geo.origin.y - p.y) / geo.unit };
}

function marksOf(spec: ReturnType<typeof expandField>, prefix: string): Mark[] {
  const scene = spec.root as Scene;
  return (scene.marks ?? []).filter((m) => String(m.id ?? "").startsWith(prefix));
}

/** Exact id match -- unlike `marksOf`, not fooled by e.g. "solution-0-start-dot" also starting with "solution-0". */
function markById(spec: ReturnType<typeof expandField>, id: string): Mark[] {
  const scene = spec.root as Scene;
  return (scene.marks ?? []).filter((m) => m.id === id);
}

function markPoints(m: Mark): Point[] {
  const pts: Point[] = [m.from as Point];
  for (const seg of m.segments) {
    if ("line" in seg) pts.push(seg.line as Point);
    else pts.push(seg.arc as Point);
  }
  return pts;
}

function connectorsOf(spec: ReturnType<typeof expandField>, prefix: string): Connector[] {
  const scene = spec.root as Scene;
  return (scene.connectors ?? []).filter((c) => String(c.id ?? "").startsWith(prefix));
}

// --- pure helpers ------------------------------------------------------------

test("niceStep keeps the span within maxLines divisions, on a 1/2/5 schedule", () => {
  assert.equal(niceStep(8, 8), 1);
  assert.equal(niceStep(8.64, 11), 1);
  assert.equal(niceStep(40, 8), 5);
  assert.equal(niceStep(0.8, 8), 0.5);
});

test("latticeIn returns exactly the multiples of step inside [lo, hi]", () => {
  assert.deepEqual(latticeIn(-2, 2, 1), [-2, -1, 0, 1, 2]);
  assert.deepEqual(latticeIn(-1.5, 1.5, 1), [-1, 0, 1]);
  assert.deepEqual(latticeIn(0, 1, 0.5), [0, 0.5, 1]);
});

test("gradient of x^2 + y^2 at (1, 1) is (2, 2), by central differences", () => {
  const [gx, gy] = gradient((x, y) => x * x + y * y, 1, 1);
  assert.ok(Math.abs(gx - 2) < 1e-4);
  assert.ok(Math.abs(gy - 2) < 1e-4);
});

test("gradient is perpendicular to the level curve through the same point (x^2 - y^2, a saddle)", () => {
  const f = (x: number, y: number): number => x * x - y * y;
  const lines = contour(f, { x: [-3, 3], y: [-3, 3] }, { level: 1, cells: 150 });
  // Several interior points along the branch, not just one -- perpendicularity
  // must hold everywhere on the curve, not at a single lucky sample.
  const line = lines.find((l) => l.points.length > 10)!;
  let checked = 0;
  for (let i = 4; i < line.points.length - 4; i += 8) {
    const a = line.points[i - 2]!;
    const b = line.points[i + 2]!;
    const p = line.points[i]!;
    const tangent = { x: b.x - a.x, y: b.y - a.y };
    const [gx, gy] = gradient(f, p.x, p.y);
    const dot = tangent.x * gx + tangent.y * gy;
    const mag = Math.hypot(tangent.x, tangent.y) * Math.hypot(gx, gy);
    if (mag === 0) continue;
    assert.ok(Math.abs(dot) / mag < 0.02, `cos(angle) = ${dot / mag} at (${p.x}, ${p.y}) -- not perpendicular`);
    checked += 1;
  }
  assert.ok(checked >= 3, "too few points checked -- the curve is shorter than expected");
});

// --- slope: marks have the stated slope, solution curves satisfy the ODE ---

test("slope: every mark's direction has exactly the slope f(x, y) reports there", () => {
  const input: FieldInput = { kind: "slope", f: "x - y", x: [-4, 4], y: [-4, 4] };
  const spec = expandField(input);
  const geo = frameGeometry(input.x, input.y);
  const f = compileIn("x - y", ["x", "y"]);
  const marks = marksOf(spec, "mark-");
  assert.ok(marks.length > 20, `expected many marks, found ${marks.length}`);
  for (const m of marks) {
    const pts = markPoints(m).map((p) => invert(geo, p));
    const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }];
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const expected = f(cx, cy);
    const drawnSlope = (b.y - a.y) / (b.x - a.x);
    assert.ok(Math.abs(drawnSlope - expected) < 1e-3, `at (${cx}, ${cy}): mark slope ${drawnSlope}, f says ${expected}`);
  }
});

test("slope: every mark has the same length in page pixels (unit length in canvas space), whatever the local steepness", () => {
  const input: FieldInput = { kind: "slope", f: "x^2 - y", x: [-3, 3], y: [-3, 3] };
  const spec = expandField(input);
  const marks = marksOf(spec, "mark-");
  const lengths = marks.map((m) => {
    const [a, b] = markPoints(m) as [Point, Point];
    return Math.hypot(b.x - a.x, b.y - a.y);
  });
  const first = lengths[0]!;
  for (const len of lengths) assert.ok(Math.abs(len - first) < 1e-6, `mark lengths differ: ${len} vs ${first}`);
});

test("slope: a solution curve satisfies dy/dx = f(x, y) along its own drawn points", () => {
  const input = loadFixture("slope-x-minus-y.json");
  const spec = expandField(input);
  const geo = frameGeometry(input.x, input.y);
  const f = compileIn(input.kind === "slope" ? input.f : "", ["x", "y"]);
  const curve = markById(spec, "solution-0");
  assert.equal(curve.length, 1);
  const pts = markPoints(curve[0]!).map((p) => invert(geo, p));
  assert.ok(pts.length > 10, `expected a real curve, got ${pts.length} points`);
  let checked = 0;
  for (let i = 2; i < pts.length - 2; i += 5) {
    const a = pts[i - 1]!;
    const b = pts[i + 1]!;
    if (Math.abs(b.x - a.x) < 1e-9) continue; // near-vertical step, slope undefined here
    const drawnSlope = (b.y - a.y) / (b.x - a.x);
    const expected = f(pts[i]!.x, pts[i]!.y);
    assert.ok(Math.abs(drawnSlope - expected) < 0.05, `at (${pts[i]!.x}, ${pts[i]!.y}): curve slope ${drawnSlope}, f says ${expected}`);
    checked += 1;
  }
  assert.ok(checked >= 3);
});

// --- vector: arrows point along (P, Q), and are proportional in length -----

test("vector: every arrow points along (P, Q) at its own base", () => {
  const input: FieldInput = { kind: "vector", p: "-y", q: "x", x: [-3, 3], y: [-3, 3] };
  const spec = expandField(input);
  const geo = frameGeometry(input.x, input.y);
  const p = compileIn("-y", ["x", "y"]);
  const q = compileIn("x", ["x", "y"]);
  const arrows = connectorsOf(spec, "mark-");
  assert.ok(arrows.length > 10, `expected many arrows, found ${arrows.length}`);
  for (const c of arrows) {
    const base = invert(geo, c.from as Point);
    const tip = invert(geo, c.to as Point);
    const drawn = { x: tip.x - base.x, y: tip.y - base.y };
    const dlen = Math.hypot(drawn.x, drawn.y);
    if (dlen < 1e-9) continue;
    const want = { x: p(base.x, base.y), y: q(base.x, base.y) };
    const wlen = Math.hypot(want.x, want.y);
    const cos = (drawn.x * want.x + drawn.y * want.y) / (dlen * wlen);
    assert.ok(cos > 0.999, `at (${base.x}, ${base.y}): arrow direction disagrees with (P, Q), cos=${cos}`);
  }
});

test("vector: arrow length is proportional to magnitude WITHIN one figure -- a point with twice the magnitude draws twice the arrow", () => {
  // (P, Q) = (x, 0): magnitude grows linearly outward from the y axis, so a
  // sample at x = 2 has exactly twice the magnitude of one at x = 1, and
  // (this being a single shared SCALE for the whole figure -- the scaling
  // rule stated at `VECTOR_ARROW_FRACTION`) exactly twice the drawn length.
  const input: FieldInput = { kind: "vector", p: "x", q: "0", x: [-4, 4], y: [-4, 4] };
  const spec = expandField(input);
  const lenAt = (x: number, y: number): number => {
    const conns = connectorsOf(spec, `mark-${x}-${y}`);
    if (conns.length === 0) return 0; // drawn as a dot instead: magnitude was ~0
    const conn = conns[0]!;
    return Math.hypot((conn.to as Point).x - (conn.from as Point).x, (conn.to as Point).y - (conn.from as Point).y);
  };
  const len1 = lenAt(1, 0);
  const len2 = lenAt(2, 0);
  assert.ok(len1 > 1, `expected a real arrow at x=1, got length ${len1}`);
  assert.ok(Math.abs(len2 / len1 - 2) < 1e-6, `expected the arrow at x=2 to be exactly twice as long as at x=1, got ratio ${len2 / len1}`);
});

test("vector: a flow line satisfies (x', y') = (P, Q) -- its tangent points along the field along its own drawn points", () => {
  const input = loadFixture("vector-rotation.json");
  const spec = expandField(input);
  const geo = frameGeometry(input.x, input.y);
  const p = compileIn(input.kind === "vector" ? input.p : "", ["x", "y"]);
  const q = compileIn(input.kind === "vector" ? input.q : "", ["x", "y"]);
  const curve = markById(spec, "flow-0");
  assert.equal(curve.length, 1);
  const pts = markPoints(curve[0]!).map((pt) => invert(geo, pt));
  let checked = 0;
  for (let i = 2; i < pts.length - 2; i += 5) {
    const a = pts[i - 1]!;
    const b = pts[i + 1]!;
    const tangent = { x: b.x - a.x, y: b.y - a.y };
    const tlen = Math.hypot(tangent.x, tangent.y);
    if (tlen < 1e-9) continue;
    const want = { x: p(pts[i]!.x, pts[i]!.y), y: q(pts[i]!.x, pts[i]!.y) };
    const wlen = Math.hypot(want.x, want.y);
    const cos = (tangent.x * want.x + tangent.y * want.y) / (tlen * wlen);
    assert.ok(cos > 0.99, `at (${pts[i]!.x}, ${pts[i]!.y}): flow line tangent disagrees with (P, Q), cos=${cos}`);
    checked += 1;
  }
  assert.ok(checked >= 3);
});

// --- levels: curve points satisfy f = c, and the labelled value is right ---

test("levels: every drawn point of every level curve satisfies f(x, y) = c", () => {
  const input = loadFixture("levels-circles-gradient.json");
  const spec = expandField(input);
  const geo = frameGeometry(input.x, input.y);
  const f = compileIn(input.kind === "levels" ? input.f : "", ["x", "y"]);
  const levels = input.kind === "levels" ? input.levels : [];
  let checked = 0;
  for (const level of levels) {
    const curves = marksOf(spec, `level-${levels.indexOf(level)}-`);
    assert.ok(curves.length > 0, `no curve drawn for level ${level}`);
    for (const curve of curves) {
      for (const p of markPoints(curve)) {
        const { x, y } = invert(geo, p);
        assert.ok(Math.abs(f(x, y) - level) < 1e-2, `(${x}, ${y}) on the level-${level} curve has f = ${f(x, y)}, not ${level}`);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 20);
});

test("levels: a circle x^2+y^2=r^2 draws points at distance r from the origin", () => {
  const input: FieldInput = { kind: "levels", f: "x^2 + y^2", x: [-4, 4], y: [-4, 4], levels: [4] };
  const spec = expandField(input);
  const geo = frameGeometry(input.x, input.y);
  const curves = marksOf(spec, "level-0-");
  assert.equal(curves.length, 1);
  for (const p of markPoints(curves[0]!)) {
    const { x, y } = invert(geo, p);
    assert.ok(Math.abs(Math.hypot(x, y) - 2) < 1e-2, `(${x}, ${y}) is not at radius 2`);
  }
});

// --- refusals: a singularity stops a curve, it is never drawn through -----

test("refuses a solution curve that starts on a singularity of f", () => {
  assert.throws(() => expandField({ kind: "slope", f: "1/y", x: [-2, 2], y: [-2, 2], solutions: [{ at: [0, 0] }] }), /not finite/);
});

test("refuses a flow line that starts where (P, Q) is not finite", () => {
  assert.throws(
    () => expandField({ kind: "vector", p: "1/x", q: "0", x: [-2, 2], y: [-2, 2], flowLines: [{ at: [0, 0] }] }),
    /not finite/,
  );
});

test("refuses levels that are attained nowhere in the plotted box", () => {
  assert.throws(() => expandField({ kind: "levels", f: "x^2 + y^2", x: [-1, 1], y: [-1, 1], levels: [100] }), /not.*attained|nothing to draw/);
});

test("refuses an empty x/y range", () => {
  assert.throws(() => expandField({ kind: "slope", f: "x", x: [2, 2], y: [-1, 1] }), /lo < hi/);
});

test("refuses an unknown kind", () => {
  assert.throws(() => expandField({ kind: "spiral" as unknown as "slope", x: [-1, 1], y: [-1, 1] } as unknown as FieldInput));
});

test("validateFieldInput exercises expandField and rejects the same malformed input", () => {
  assert.throws(() => validateFieldInput({ kind: "slope", x: [-2, 2], y: [-2, 2] })); // missing f
  assert.throws(() => validateFieldInput({ kind: "levels", f: "x", x: [-2, 2], y: [-2, 2], levels: [] })); // empty levels
});

// --- rendering: every fixture renders with every check passing -------------

for (const name of ["slope-x-minus-y.json", "vector-rotation.json", "levels-circles-gradient.json", "levels-saddle.json"]) {
  test(`fixtures/field/${name} renders with every check passing`, { timeout: 240000 }, async () => {
    const input = loadFixture(name);
    const spec = expandField(input);
    const result = await render(spec, { raster: false });
    const failing = result.manifest.checks.filter((c) => c.status === "fail");
    assert.equal(result.manifest.ok, true, failing.map((c) => `${c.id} ${c.target}: ${c.detail}`).join("\n"));
  });
}
