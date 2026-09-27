/**
 * Marching squares with refinement (src/math/contour.ts, ADR 0029).
 *
 * Each test is a level set whose true shape is known in closed form, so the
 * polylines are measured against the curve itself rather than against a
 * stored drawing: every vertex on the curve within the stated tolerance, the
 * right number of pieces, closed where the curve is closed -- and the three
 * places the textbook algorithm draws something the function did not say:
 * across a pole, across a jump, and through a saddle cell.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { contour } from "../src/math/contour.ts";
import type { ContourLine } from "../src/math/contour.ts";
import { compileIn } from "../src/math/expr.ts";

const box = (a: number, b: number) => ({ x: [a, b] as [number, number], y: [a, b] as [number, number] });
const vertices = (lines: ContourLine[]) => lines.flatMap((l) => l.points);

test("a circle is one closed line, and every vertex is on it within the tolerance", () => {
  const tolerance = 1e-9;
  const lines = contour((x, y) => x * x + y * y, box(-2, 2), { level: 1, cells: 40, tolerance });
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.closed, true);
  const pts = lines[0]!.points;
  assert.deepEqual(pts[0], pts[pts.length - 1], "a closed line repeats its first vertex");
  for (const p of pts) assert.ok(Math.abs(Math.hypot(p.x, p.y) - 1) <= tolerance, `${p.x}, ${p.y}`);
  assert.ok(pts.length > 40, `enough vertices to be round, saw ${pts.length}`);
});

test("the tolerance is honoured when it is loose, too: vertices are bisected, not interpolated", () => {
  // A coarse grid on a strongly curved function: linear interpolation along a
  // cell edge would miss by far more than 1e-3; bisection does not.
  const tolerance = 1e-3;
  const f = (x: number, y: number) => Math.exp(x) + y * y * y;
  const lines = contour(f, box(-2, 2), { level: 2, cells: 6, tolerance });
  assert.ok(lines.length > 0);
  for (const p of vertices(lines)) {
    // Distance to the true curve, measured along x: y is exact on a
    // horizontal edge, x on a vertical one, and the error is along the edge.
    const onCurveX = Math.log(2 - p.y ** 3);
    const onCurveY = Math.cbrt(2 - Math.exp(p.x));
    const off = Math.min(Math.abs(p.x - onCurveX), Math.abs(p.y - onCurveY));
    assert.ok(off <= tolerance, `vertex (${p.x}, ${p.y}) is ${off} off the curve`);
  }
});

test("an ellipse through an expression: x²/9 + y²/4 = 1", () => {
  const g = compileIn("x^2/9 + y^2/4 - 1", ["x", "y"]);
  const lines = contour(g, { x: [-4, 4], y: [-3, 3] }, { cells: [80, 60] });
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.closed, true);
  for (const p of lines[0]!.points) assert.ok(Math.abs(p.x ** 2 / 9 + p.y ** 2 / 4 - 1) < 1e-6);
  const xs = lines[0]!.points.map((p) => p.x);
  assert.ok(Math.max(...xs) > 2.99 && Math.min(...xs) < -2.99, "reaches its vertices");
});

test("a curve leaving the box is an open line ending on the border", () => {
  const lines = contour((x, y) => y - x * x, box(-2, 2), { cells: 30 });
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.closed, false);
  const ends = [lines[0]!.points[0]!, lines[0]!.points.at(-1)!];
  for (const e of ends) assert.ok(Math.abs(Math.abs(e.y) - 2) < 1e-9 || Math.abs(Math.abs(e.x) - 2) < 1e-9, JSON.stringify(e));
});

test("a hyperbola is never joined across its asymptotes: xy = 1 and 1/(xy) = 1 draw the same two branches", () => {
  for (const f of [(x: number, y: number) => x * y, (x: number, y: number) => 1 / (x * y)]) {
    // An even count puts grid lines ON the axes, an odd count between them;
    // neither may draw a crossing where the function changes sign through a pole.
    for (const cells of [40, 41]) {
      const lines = contour(f, box(-3, 3), { level: 1, cells });
      assert.equal(lines.length, 2, `cells ${cells}: ${lines.length} lines`);
      for (const line of lines) {
        const signs = new Set(line.points.map((p) => Math.sign(p.x)));
        assert.equal(signs.size, 1, "one branch per line, never both quadrants");
        for (const p of line.points) assert.ok(Math.abs(p.x * p.y - 1) < 1e-6, `(${p.x}, ${p.y}) is off xy = 1`);
      }
    }
  }
});

test("a vertical tangent on the grid loses nothing: each branch of x²/4 − y² = 1 is one unbroken line", () => {
  // The figure a reviewer saw "gapped" below its left vertex: the vertices
  // (±2, 0) lie exactly on a grid vertex at 160 × 120 cells, where the curve
  // is tangent to a vertical cell edge -- the case most likely to lose a
  // crossing. (The gap was a tick number's paper backing, not the contour;
  // this pins that the contour was never the cause.) Offset grids put the
  // vertex mid-edge and mid-cell too.
  const f = (x: number, y: number) => (x * x) / 4 - y * y;
  for (const cells of [[160, 120], [161, 121], [37, 29]] as [number, number][]) {
    const lines = contour(f, { x: [-4, 4], y: [-3, 3] }, { level: 1, cells });
    const where = `${cells.join(" × ")} cells`;
    assert.equal(lines.length, 2, `${where}: ${lines.length} lines, want one per branch`);
    const diagonal = Math.hypot(8 / cells[0], 6 / cells[1]);
    for (const line of lines) {
      const pts = line.points;
      assert.equal(line.closed, false, where);
      assert.equal(new Set(pts.map((p) => Math.sign(p.x))).size, 1, `${where}: a line on both branches`);
      for (const p of pts) assert.ok(Math.abs((p.x * p.x) / 4 - p.y * p.y - 1) < 1e-6, `${where}: (${p.x}, ${p.y}) off the curve`);
      // Border to border, through the vertex, y monotone along the way, and
      // no chord longer than the cell it lies in: nothing is skipped.
      for (const e of [pts[0]!, pts.at(-1)!]) assert.ok(Math.abs(Math.abs(e.x) - 4) < 1e-9, `${where}: ends at ${JSON.stringify(e)}`);
      assert.ok(Math.min(...pts.map((p) => Math.abs(p.x))) < 2 + diagonal / 4, `${where}: misses the vertex`);
      const direction = Math.sign(pts.at(-1)!.y - pts[0]!.y);
      for (let k = 1; k < pts.length; k += 1) {
        const a = pts[k - 1]!;
        const b = pts[k]!;
        assert.ok(Math.hypot(b.x - a.x, b.y - a.y) <= diagonal + 1e-9, `${where}: a ${Math.hypot(b.x - a.x, b.y - a.y)} chord at (${a.x}, ${a.y})`);
        assert.ok(Math.sign(b.y - a.y) !== -direction, `${where}: the line doubles back at (${a.x}, ${a.y})`);
      }
    }
  }
});

test("a jump is not a crossing: sign(x) never takes the value 0.5", () => {
  assert.deepEqual(contour((x) => Math.sign(x), box(-1, 1), { level: 0.5, cells: 21 }), []);
});

test("saddle cells follow the function: the branches of x² − y² = ±0.01 are never joined", () => {
  // Five cells over [−1, 1]: the origin, where the branches come closest, is
  // the centre of the middle cell and every corner of it alternates sign.
  for (const [level, axis] of [[0.01, "x"], [-0.01, "y"]] as const) {
    const lines = contour((x, y) => x * x - y * y, box(-1, 1), { level, cells: 5 });
    assert.equal(lines.length, 2, `level ${level}`);
    for (const line of lines) {
      const signs = new Set(line.points.map((p) => Math.sign(p[axis])));
      assert.equal(signs.size, 1, `level ${level}: a line crosses ${axis} = 0, joining the two branches`);
    }
  }
});

test("a level exactly at a saddle draws the X as an X: xy = 0 meets at the centre", () => {
  const lines = contour((x, y) => x * y, box(-1, 1), { cells: 5 });
  assert.equal(lines.length, 4, "four arms from the centre");
  for (const line of lines) {
    const ends = [line.points[0]!, line.points.at(-1)!];
    assert.ok(ends.some((p) => Math.hypot(p.x, p.y) < 1e-12), "each arm ends at the crossing");
    // On an axis to within the default tolerance, 1e-9 of the box.
    for (const p of line.points) assert.ok(Math.min(Math.abs(p.x), Math.abs(p.y)) <= 2e-9);
  }
});

test("where the function is undefined, nothing is drawn: x² + y² = 1 with √x", () => {
  const g = compileIn("x^2 + y^2 + 0 sqrt(x)", ["x", "y"]);
  const lines = contour(g, box(-2, 2), { level: 1, cells: 40 });
  assert.equal(lines.length, 1);
  assert.ok(vertices(lines).every((p) => p.x >= 0), "no vertex where √x is undefined");
});

test("what cannot be seen is stated, not faked: a touching level and an isolated point draw nothing", () => {
  assert.deepEqual(contour((x, y) => (x * x + y * y - 1) ** 2, box(-2, 2), { cells: 40 }), []);
  assert.deepEqual(contour((x, y) => x * x + y * y, box(-2, 2), { cells: 41 }), []);
});

test("bad input is refused", () => {
  assert.throws(() => contour(() => 0, box(-1, 1), { cells: 0 }), /cells must be positive integers/);
  assert.throws(() => contour(() => 0, { x: [1, 0], y: [0, 1] }), /min < max/);
});
