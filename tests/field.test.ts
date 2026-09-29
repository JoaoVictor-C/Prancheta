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

import { chargeName, chargeRadius, electricField, electricPotential, expandField, frameGeometry, gradient, latticeIn, traceChargeLines, validateFieldInput } from "../src/presets/field/preset.ts";
import type { FieldInput } from "../src/presets/field/preset.ts";
import { niceStep } from "../src/presets/shared/scale.ts";
import { compileIn } from "../src/math/expr.ts";
import { contour } from "../src/math/contour.ts";
import { render } from "../src/pipeline.ts";
import { contrastRatio } from "../src/colour/contrast.ts";
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

test("the tick step is 1, 2 or 5 x 10^k at any magnitude, and the unit is fitted to the range", () => {
  assert.equal(niceStep(8, 8), 1);
  assert.equal(niceStep(40, 8), 5);
  assert.equal(niceStep(0.8, 8), 0.1);
  assert.equal(frameGeometry([0, 5000], [0, 5000]).tickStep, 1000);
  assert.equal(frameGeometry([0, 0.2], [0, 0.2]).tickStep, 0.05);
  for (const r of [[0, 0.2], [-3, 3], [0, 5000]] as [number, number][]) {
    const g = frameGeometry(r, r);
    assert.ok(Math.abs((g.xMax - g.xMin) * g.unit - 460) < 1e-6, `fills ~460px for ${r}`);
  }
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

for (const name of [
  "slope-x-minus-y.json",
  "vector-rotation.json",
  "levels-circles-gradient.json",
  "levels-saddle.json",
  "charges-dipole.json",
  "charges-two-positive.json",
  "charges-two-q-minus-q.json",
  "charges-single-equipotentials.json",
  "charges-dipole-equipotentials.json",
]) {
  test(`fixtures/field/${name} renders with every check passing`, { timeout: 240000 }, async () => {
    const input = loadFixture(name);
    const spec = expandField(input);
    const result = await render(spec, { raster: false });
    const failing = result.manifest.checks.filter((c) => c.status === "fail");
    assert.equal(result.manifest.ok, true, failing.map((c) => `${c.id} ${c.target}: ${c.detail}`).join("\n"));
  });
}

// --- charges: electric field lines and equipotentials -------------------------

type ChargesInput = Extract<FieldInput, { kind: "charges" }>;
const chargesFixture = (name: string): ChargesInput => loadFixture(name) as ChargesInput;

test("charges: a field line is tangent to E along its own drawn points", () => {
  const input = chargesFixture("charges-two-q-minus-q.json");
  const spec = expandField(input);
  const geo = frameGeometry(input.x, input.y);
  const lines = marksOf(spec, "line-").filter((m) => !String(m.id).includes("arrow"));
  assert.equal(lines.length, 16, "one line per seed: round(2 * 8) from +2q");
  let checked = 0;
  for (const m of lines) {
    const pts = markPoints(m).map((p) => invert(geo, p));
    // Skip the first points (the stub under the disc) and the last (which may be the sink's centre).
    for (let i = 3; i < pts.length - 3; i += 5) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const [ex, ey] = electricField(input.charges, (a.x + b.x) / 2, (a.y + b.y) / 2);
      const tx = b.x - a.x;
      const ty = b.y - a.y;
      const cos = (tx * ex + ty * ey) / (Math.hypot(tx, ty) * Math.hypot(ex, ey));
      assert.ok(Math.abs(cos) > 0.999, `${m.id}: chord not along E at (${a.x.toFixed(2)}, ${a.y.toFixed(2)}), cos = ${cos}`);
      checked += 1;
    }
  }
  assert.ok(checked > 60, `only ${checked} segments checked`);
});

test("charges: seeds are evenly spaced, count is proportional to |q|, and one points at the nearest other charge", () => {
  const input = chargesFixture("charges-two-q-minus-q.json");
  const lines = traceChargeLines(input);
  const seeds = lines.filter((l) => l.charge === 0);
  assert.equal(seeds.length, 16);
  assert.equal(lines.filter((l) => l.charge === 1).length, 0, "the negative charge is a sink here, not a source");
  const [cx, cy] = input.charges[0]!.at;
  const angles = seeds.map((l) => Math.atan2(l.points[0]!.y - cy, l.points[0]!.x - cx));
  assert.ok(Math.abs(angles[0]!) < 1e-9, "the first seed points along the line joining the charges");
  for (let k = 1; k < angles.length; k += 1) {
    const step = (angles[k]! - angles[k - 1]! + 2 * Math.PI) % (2 * Math.PI);
    assert.ok(Math.abs(step - (2 * Math.PI) / 16) < 1e-9);
  }
  for (const l of seeds) assert.ok(Math.abs(Math.hypot(l.points[0]!.x - cx, l.points[0]!.y - cy) - chargeRadius(input)) < 1e-9, "every seed sits on the charge's disc");
});

test("charges: Gauss -- about half of the 16 lines of +2q end on -q, and each ends on its rim", () => {
  const input = chargesFixture("charges-two-q-minus-q.json");
  const lines = traceChargeLines(input);
  const ending = lines.filter((l) => l.end === "sink");
  assert.ok(ending.length >= 7 && ending.length <= 9, `${ending.length} lines end on -q; Gauss says 8`);
  const [sx, sy] = input.charges[1]!.at;
  for (const l of ending) {
    assert.equal(l.sink, 1);
    const last = l.points[l.points.length - 1]!;
    assert.ok(Math.abs(Math.hypot(last.x - sx, last.y - sy) - chargeRadius(input)) < 1e-6, "ends on the disc's rim");
  }
  assert.ok(lines.filter((l) => l.end === "box").length >= 7, "the rest leave the box");
});

test("charges: +3 and -1 draw 24 lines and about a third end on the sink", () => {
  const base = { kind: "charges" as const, x: [-5, 5] as [number, number], y: [-4, 4] as [number, number] };
  const three = traceChargeLines({ ...base, charges: [{ at: [-2, 0], q: 3 }, { at: [2, 0], q: -1 }] });
  assert.equal(three.length, 24);
  const ends = three.filter((l) => l.end === "sink").length;
  assert.ok(ends >= 6 && ends <= 9, `${ends} of 24 end on -q; Gauss says 8`);
});

test("charges: two equal positive charges stop honestly at the point where E = 0", () => {
  const input = chargesFixture("charges-two-positive.json");
  const lines = traceChargeLines(input);
  const stopped = lines.filter((l) => l.end === "stagnation");
  assert.equal(stopped.length, 2, "one axis line from each charge");
  for (const l of stopped) {
    const z = l.stagnation!;
    assert.ok(Math.abs(z.x) < 1e-6 && Math.abs(z.y) < 1e-6, `stops at (${z.x}, ${z.y}), not at the midpoint`);
    const [ex, ey] = electricField(input.charges, z.x, z.y);
    assert.ok(Math.hypot(ex, ey) < 1e-6);
    const last = l.points[l.points.length - 1]!;
    assert.deepEqual(last, z, "the line reaches the point, and never runs past it");
    const side = Math.sign(input.charges[l.charge]!.at[0]);
    for (const p of l.points) assert.ok(p.x * side >= -1e-9, "nothing is drawn beyond the saddle");
  }
  const spec = expandField(input);
  assert.equal(marksOf(spec, "null-point-").length, 1, "the point where E = 0 is marked once");
});

test("charges: arrowheads point along E", () => {
  const input = chargesFixture("charges-dipole.json");
  const spec = expandField(input);
  const geo = frameGeometry(input.x, input.y);
  const arrows = marksOf(spec, "line-").filter((m) => String(m.id).includes("-arrow-"));
  assert.ok(arrows.length >= 6);
  for (const m of arrows) {
    const [tip, b1, b2] = markPoints(m).map((p) => invert(geo, p));
    const base = { x: (b1!.x + b2!.x) / 2, y: (b1!.y + b2!.y) / 2 };
    const centre = { x: (tip!.x + base.x) / 2, y: (tip!.y + base.y) / 2 };
    const [ex, ey] = electricField(input.charges, centre.x, centre.y);
    const dx = tip!.x - base.x;
    const dy = tip!.y - base.y;
    const cos = (dx * ex + dy * ey) / (Math.hypot(dx, dy) * Math.hypot(ex, ey));
    assert.ok(cos > 0.98, `${m.id} points ${cos} along E`);
  }
});

test("charges: with only negative charges the lines run against E from the negative charge, arrows pointing in", () => {
  const input: ChargesInput = { kind: "charges", x: [-3, 3], y: [-3, 3], charges: [{ at: [0, 0], q: -1 }] };
  const lines = traceChargeLines(input);
  assert.equal(lines.length, 8);
  for (const l of lines) assert.equal(l.along, -1);
  const spec = expandField(input);
  const geo = frameGeometry(input.x, input.y);
  const arrows = marksOf(spec, "line-").filter((m) => String(m.id).includes("-arrow-"));
  assert.ok(arrows.length >= 4);
  for (const m of arrows) {
    const [tip, b1, b2] = markPoints(m).map((p) => invert(geo, p));
    const base = { x: (b1!.x + b2!.x) / 2, y: (b1!.y + b2!.y) / 2 };
    assert.ok(Math.hypot(tip!.x, tip!.y) < Math.hypot(base.x, base.y), `${m.id} points outward`);
  }
});

test("charges: equipotential points satisfy V = level", () => {
  const input: ChargesInput = { ...chargesFixture("charges-dipole.json"), equipotentials: [-0.5, 0, 0.5] };
  const spec = expandField(input);
  const geo = frameGeometry(input.x, input.y);
  let checked = 0;
  for (const m of marksOf(spec, "equipotential-")) {
    const li = Number(String(m.id).split("-")[1]);
    const level = (input.equipotentials as number[])[li]!;
    assert.equal(m.lineStyle, "dashed");
    for (const p of markPoints(m)) {
      const w = invert(geo, p);
      assert.ok(Math.abs(electricPotential(input.charges, w.x, w.y) - level) < 2e-3, `${m.id}: V = ${electricPotential(input.charges, w.x, w.y)}, want ${level}`);
      checked += 1;
    }
  }
  assert.ok(checked > 100);
});

test("charges: a disc is drawn last with its sign, and white on either colour passes contrast", () => {
  const input = chargesFixture("charges-dipole.json");
  const spec = expandField(input);
  const scene = spec.root as Scene;
  const ids = (scene.marks ?? []).map((m) => String(m.id));
  const firstCharge = ids.findIndex((id) => id.startsWith("charge-"));
  assert.ok(ids.slice(firstCharge).every((id) => id.startsWith("charge-") || id.endsWith("-place")), "nothing but charges is drawn after the first charge");
  assert.ok(ids.includes("charge-0-sign-h") && ids.includes("charge-0-sign-v"), "a positive charge has a plus");
  assert.ok(ids.includes("charge-1-sign-h") && !ids.includes("charge-1-sign-v"), "a negative charge has a minus only");
  const fills = markById(spec, "charge-0").concat(markById(spec, "charge-1")).map((m) => m.fill as string);
  assert.equal(fills.length, 2);
  for (const fill of fills) assert.ok((contrastRatio("#FFFFFF", fill) ?? 0) >= 4.5, `${fill} against white`);
});

test("charges: names are derived from q unless given, and the panel says k is omitted", () => {
  assert.equal(chargeName(1, "pt-BR"), "q");
  assert.equal(chargeName(-1, "pt-BR"), "−q");
  assert.equal(chargeName(2, "pt-BR"), "2q");
  assert.equal(chargeName(-2.5, "pt-BR"), "−2,5q");
  const spec = expandField(chargesFixture("charges-two-q-minus-q.json"));
  const labels = ((spec.root as Scene).children ?? []).map((b) => (b as { label?: string }).label);
  assert.ok(labels.includes("2q") && labels.includes("−q"));
  assert.ok(labels.some((t) => typeof t === "string" && t.includes("k omitido")));
});

test("charges: refuses a zero charge, a charge outside the box, charges too close, and equipotentials attained nowhere", () => {
  const ok = { kind: "charges", x: [-3, 3], y: [-3, 3], charges: [{ at: [-1, 0], q: 1 }, { at: [1, 0], q: -1 }] };
  validateFieldInput(ok);
  assert.throws(() => validateFieldInput({ ...ok, charges: [{ at: [0, 0], q: 0 }] }), /q is 0/);
  assert.throws(() => validateFieldInput({ ...ok, charges: [{ at: [5, 0], q: 1 }] }), /outside the plotted box/);
  assert.throws(() => validateFieldInput({ ...ok, charges: [{ at: [0, 0], q: 1 }, { at: [0.1, 0], q: 1 }] }), /touch/);
  assert.throws(() => validateFieldInput({ ...ok, charges: [] }));
  assert.throws(() => validateFieldInput({ ...ok, linesPerUnitCharge: 0 }), /at least 1/);
  assert.throws(() => validateFieldInput({ ...ok, equipotentials: [1e6] }), /attained/);
});

// --- review of 2026-09-29: the unit follows the data, and answers can be withheld ---

const labelTexts = (spec: ReturnType<typeof expandField>): string[] => ((spec.root as Scene).children as { label?: string }[]).map((b) => b.label ?? "");
const tickCount = (spec: ReturnType<typeof expandField>, axis: "x" | "y"): number =>
  ((spec.root as Scene).children as { id?: string }[]).filter((b) => new RegExp(`^plane-tick-${axis}-|^plane-tick-origin`).test(b.id ?? "")).length;
const sizeOf = (spec: ReturnType<typeof expandField>): { w: number; h: number } => ({ w: (spec.root as Scene).width as number, h: (spec.root as Scene).height as number });
const passes = async (input: FieldInput): Promise<void> => {
  const result = await render(expandField(input), { raster: false });
  const failing = result.manifest.checks.filter((c) => c.status === "fail");
  assert.equal(result.manifest.ok, true, failing.map((c) => `${c.id} ${c.target}: ${c.detail}`).join("\n"));
};

const PROBES: [string, FieldInput][] = [
  ["slope over [0; 5000]", { kind: "slope", f: "x - y", x: [0, 5000], y: [0, 5000] }],
  ["vector field over [-0,1; 0,1]", { kind: "vector", p: "-y", q: "x", x: [-0.1, 0.1], y: [-0.1, 0.1] }],
  ["slope over [0; 0,2]", { kind: "slope", f: "x - y", x: [0, 0.2], y: [0, 0.2] }],
  ["levels over [0; 5000]", { kind: "levels", f: "x + y", x: [0, 5000], y: [0, 5000], levels: [2000, 5000, 8000] }],
];
for (const [name, input] of PROBES) {
  test(`probe: ${name} is a sane canvas, a numbered plane, and a lattice of marks`, { timeout: 240000 }, async () => {
    const spec = expandField(input);
    const { w, h } = sizeOf(spec);
    assert.ok(w >= 60 && w <= 4000 && h >= 60 && h <= 4000, `${w} x ${h}`);
    for (const axis of ["x", "y"] as const) {
      const n = tickCount(spec, axis);
      assert.ok(n >= 3 && n <= 12, `${n} numbers on ${axis}`);
    }
    if (input.kind !== "levels") {
      // The lattice follows the fitted scale: a readable number of marks whatever the range.
      const marks = marksOf(spec, "mark-").length + connectorsOf(spec, "mark-").length;
      assert.ok(marks >= 36 && marks <= 196, `${marks} marks`);
    }
    await passes(input);
  });
}

test("the same field over a range of any magnitude is the same figure", () => {
  const at = (s: number): { w: number; h: number; marks: number } => {
    const spec = expandField({ kind: "slope", f: "x - y", x: [0, 5 * s], y: [0, 5 * s] });
    return { ...sizeOf(spec), marks: marksOf(spec, "mark-").length };
  };
  assert.deepEqual(at(1000), at(1));
  assert.deepEqual(at(0.001), at(1));
});

test("answers: false slope field keeps every mark and the points a curve starts from, and no curve or reading", () => {
  const input = loadFixture("slope-x-minus-y.json");
  const full = expandField(input);
  const bare = expandField({ ...input, answers: false });
  assert.equal(marksOf(bare, "mark-").length, marksOf(full, "mark-").length);
  assert.ok(marksOf(full, "solution-").some((m) => m.id === "solution-0"));
  assert.equal(marksOf(bare, "solution-").filter((m) => /^solution-\d$/.test(String(m.id))).length, 0, "no solution curve");
  assert.equal(marksOf(bare, "solution-").filter((m) => /-start-dot$/.test(String(m.id))).length, 3, "the initial points stay");
  assert.ok(labelTexts(full).some((t) => t.startsWith("solução por")));
  assert.ok(!labelTexts(bare).some((t) => t.startsWith("solução")), labelTexts(bare).join("|"));
  assert.ok(sizeOf(bare).h < sizeOf(full).h, "no room reserved for readings");
});

test("answers: false vector field keeps every arrow and the starting points, and no flow line, label or reading", () => {
  const input = loadFixture("vector-rotation.json");
  const full = expandField(input);
  const bare = expandField({ ...input, answers: false });
  assert.equal(connectorsOf(bare, "mark-").length, connectorsOf(full, "mark-").length);
  assert.equal(marksOf(bare, "flow-").filter((m) => /^flow-\d$/.test(String(m.id))).length, 0);
  assert.equal(marksOf(bare, "flow-").filter((m) => /-start-dot$/.test(String(m.id))).length, 2);
  const text = labelTexts(bare).join("|");
  assert.ok(!/linha de fluxo|r=1|r=2/.test(text), text);
  assert.ok(/linha de fluxo/.test(labelTexts(full).join("|")));
});

test("answers: false levels keeps the plane and the points a gradient is asked at, and no curve, level value or gradient", () => {
  const input = loadFixture("levels-circles-gradient.json");
  const full = expandField(input);
  const bare = expandField({ ...input, answers: false });
  assert.ok(marksOf(full, "level-").length > 0);
  assert.equal(marksOf(bare, "level-").length, 0);
  assert.equal(connectorsOf(bare, "grad-").length, 0);
  assert.equal(connectorsOf(full, "grad-").length, 2);
  assert.equal(marksOf(bare, "grad-").filter((m) => /-foot-dot$/.test(String(m.id))).length, 2, "the points stay");
  // (the axis numbers are blocks too; a level label is one that is not a tick)
  const printed = ((bare.root as Scene).children as { id?: string; label?: string }[]).filter((b) => !String(b.id ?? "").startsWith("plane-tick")).map((b) => b.label ?? "");
  for (const level of ["1", "4", "9"]) assert.ok(!printed.includes(level), `level ${level} is printed`);
  assert.deepEqual(sizeOf(bare), sizeOf(full), "the question plane is the answer plane");
});

test("answers: false charges keeps the charges and their names, and no field line, arrowhead, null point, equipotential or panel", () => {
  const input = loadFixture("charges-dipole-equipotentials.json");
  const full = expandField(input);
  const bare = expandField({ ...input, answers: false });
  const ids = (s: ReturnType<typeof expandField>): string[] => marksOf(s, "").map((m) => String(m.id));
  assert.ok(ids(full).some((i) => i.startsWith("line-")) && ids(full).some((i) => i.startsWith("equipotential-")));
  assert.ok(!ids(bare).some((i) => /^(line-|equipotential-|null-point)/.test(i)), ids(bare).join(","));
  const discs = (s: ReturnType<typeof expandField>): string[] => ids(s).filter((i) => i.startsWith("charge-") && !i.endsWith("-leader"));
  assert.deepEqual(discs(bare), discs(full));
  assert.deepEqual(labelTexts(bare).filter((t) => t !== ""), ["q", "−q"]);
  assert.ok(labelTexts(full).some((t) => t.startsWith("linhas de campo")));
});

test("answers: true (or unset) is exactly the figure it was before the option existed", () => {
  for (const name of ["slope-x-minus-y.json", "vector-rotation.json", "levels-saddle.json", "charges-dipole.json"]) {
    const input = loadFixture(name);
    assert.deepEqual(expandField({ ...input, answers: true }), expandField(input), name);
  }
});

for (const [name, input] of [
  ["slope-x-minus-y-statement.json", loadFixture("slope-x-minus-y-statement.json")],
  ["vector-rotation, answers false", { ...loadFixture("vector-rotation.json"), answers: false }],
  ["levels-saddle, answers false", { ...loadFixture("levels-saddle.json"), answers: false }],
  ["charges-dipole-equipotentials, answers false", { ...loadFixture("charges-dipole-equipotentials.json"), answers: false }],
] as [string, FieldInput][]) {
  test(`${name} renders with every check passing`, { timeout: 240000 }, async () => {
    await passes(input);
  });
}
