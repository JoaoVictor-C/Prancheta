/**
 * linear-map: a linear map of the plane. The matrix is the only typed number,
 * so these tests pin the arithmetic (named maps, eigen, exact writing, the
 * image lattice) and then decode the DRAWN geometry back through the frame's
 * own affine map, the way a reviewer with a ruler would, instead of trusting
 * the preset's numbers a second time.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import {
  applyMatrix,
  clipLineToBox,
  complexPairText,
  determinant,
  directionInts,
  eigen2x2,
  eigenvalueText,
  exactText,
  expandLinearMap,
  formulaOf,
  imageLattice,
  planeGeometry,
  isSingular,
  lineAngle,
  lineEquation,
  matrixOf,
  namedMatrix,
  polygonArea,
  singularParts,
  traceOf,
  validateLinearMapInput,
} from "../src/presets/linear-map/preset.ts";
import type { LinearMapInput, Matrix, Vec } from "../src/presets/linear-map/preset.ts";
import { SpecError } from "../src/ir/types.ts";
import type { Block, Mark, Point, Scene } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";

const dir = fileURLToPath(new URL("../fixtures/linear-map/", import.meta.url));
const fixtures = readdirSync(dir).filter((n) => n.endsWith(".json"));

const near = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps;
function assertMatrix(got: Matrix, want: Matrix, eps = 1e-12): void {
  for (const i of [0, 1] as const) {
    for (const j of [0, 1] as const) assert.ok(near(got[i][j], want[i][j], eps), `entry [${i}][${j}] is ${got[i][j]}, wanted ${want[i][j]}`);
  }
}

// ---- named maps compute their matrix ------------------------------------------------

test("rotation by 90 degrees is exactly [[0, -1], [1, 0]] -- cos 90° is 0, not 6e-17", () => {
  const A = namedMatrix({ rotation: 90 });
  assert.deepEqual(A, [[0, -1], [1, 0]]);
  assert.equal(Object.is(A[0][0], -0), false);
});

test("rotation accepts degrees, '90°' and radians as an expression", () => {
  assertMatrix(namedMatrix({ rotation: 30 }), namedMatrix({ rotation: "pi/6" }));
  assertMatrix(namedMatrix({ rotation: "30°" }), namedMatrix({ rotation: "pi/6" }));
  assertMatrix(namedMatrix({ rotation: 30 }), [[Math.sqrt(3) / 2, -0.5], [0.5, Math.sqrt(3) / 2]]);
  assertMatrix(namedMatrix({ rotation: -90 }), [[0, 1], [-1, 0]]);
});

test("reflection about y = x, the axes, y = -x and an angle", () => {
  assert.deepEqual(namedMatrix({ reflection: { line: "y = x" } }), [[0, 1], [1, 0]]);
  assert.deepEqual(namedMatrix({ reflection: { line: "x" } }), [[1, 0], [0, -1]]);
  assert.deepEqual(namedMatrix({ reflection: { line: "y" } }), [[-1, 0], [0, 1]]);
  assert.deepEqual(namedMatrix({ reflection: { line: "y = -x" } }), [[0, -1], [-1, 0]]);
  assert.deepEqual(namedMatrix({ reflection: { line: "y = −x" } }), [[0, -1], [-1, 0]]);
  assert.deepEqual(namedMatrix({ reflection: { line: 45 } }), [[0, 1], [1, 0]]);
  assertMatrix(namedMatrix({ reflection: { line: "y = x/2" } }), [[0.6, 0.8], [0.8, -0.6]]);
});

test("a reflection squares to the identity and has determinant -1", () => {
  for (const line of ["y = x", "y = 2x", "y = -x/3", 17, "pi/5"] as const) {
    const A = namedMatrix({ reflection: { line } });
    assert.ok(near(determinant(A), -1));
    assert.ok(near(traceOf(A), 0));
    const twice: Matrix = [
      [A[0][0] * A[0][0] + A[0][1] * A[1][0], A[0][0] * A[0][1] + A[0][1] * A[1][1]],
      [A[1][0] * A[0][0] + A[1][1] * A[1][0], A[1][0] * A[0][1] + A[1][1] * A[1][1]],
    ];
    assertMatrix(twice, [[1, 0], [0, 1]], 1e-12);
  }
});

test("shear, scale and projection", () => {
  assert.deepEqual(namedMatrix({ shear: { x: 1 } }), [[1, 1], [0, 1]]);
  assert.deepEqual(namedMatrix({ shear: { y: -2 } }), [[1, 0], [-2, 1]]);
  assert.deepEqual(namedMatrix({ scale: [2, 0.5] }), [[2, 0], [0, 0.5]]);
  assert.deepEqual(namedMatrix({ scale: ["sqrt(2)", 3] }), [[Math.SQRT2, 0], [0, 3]]);
  assertMatrix(namedMatrix({ projection: { onto: "y = x" } }), [[0.5, 0.5], [0.5, 0.5]]);
  assertMatrix(namedMatrix({ projection: { onto: [1, 0] } }), [[1, 0], [0, 0]]);
  assertMatrix(namedMatrix({ projection: { onto: [3, 4] } }), [[9 / 25, 12 / 25], [12 / 25, 16 / 25]]);
});

test("a projection is idempotent and singular", () => {
  const P = namedMatrix({ projection: { onto: 30 } });
  assert.ok(isSingular(P));
  const image = applyMatrix(P, [3, -2]);
  const again = applyMatrix(P, image);
  assert.ok(near(image[0], again[0]) && near(image[1], again[1]));
});

test("matrix entries may be expressions", () => {
  const A = matrixOf({ matrix: [["sqrt(3)/2", "-1/2"], ["1/2", "cos(pi/6)"]] });
  assertMatrix(A, [[Math.sqrt(3) / 2, -0.5], [0.5, Math.sqrt(3) / 2]]);
});

test("lineAngle reads lines, and refuses one that misses the origin", () => {
  assert.ok(near(lineAngle("y = x", "t"), Math.PI / 4));
  assert.ok(near(lineAngle("y = 0", "t"), 0));
  assert.ok(near(lineAngle("x = 0", "t"), Math.PI / 2));
  assert.ok(near(lineAngle(135, "t"), (3 * Math.PI) / 4));
  assert.ok(near(lineAngle(-45, "t"), (3 * Math.PI) / 4));
  assert.throws(() => lineAngle("y = x + 1", "t"), SpecError);
  assert.throws(() => lineAngle("y = x^2", "t"), SpecError);
  assert.throws(() => lineAngle("banana", "t"), SpecError);
});

// ---- determinant, trace, images -----------------------------------------------------

test("determinant, trace and the image of a point", () => {
  const A: Matrix = [[2, 1], [1, 1]];
  assert.equal(determinant(A), 1);
  assert.equal(traceOf(A), 3);
  assert.deepEqual(applyMatrix(A, [1, 0]), [2, 1]);
  assert.deepEqual(applyMatrix(A, [0, 1]), [1, 1]);
  assert.deepEqual(applyMatrix(A, [3, -2]), [4, 1]);
  assert.equal(isSingular([[1, 2], [2, 4]]), true);
  assert.equal(isSingular([[1, 2], [2, 4.001]]), false);
});

test("a polygon's image has |det A| times its area", () => {
  const A: Matrix = [[2, 1], [-1, 3]];
  const tri: Vec[] = [[0, 0], [4, 1], [1, 3]];
  const image = tri.map((p) => applyMatrix(A, p));
  assert.ok(near(polygonArea(image), Math.abs(determinant(A)) * polygonArea(tri), 1e-9));
});

// ---- eigen -----------------------------------------------------------------------------

test("[[2, 1], [1, 2]]: eigenvalues 3 and 1 along (1, 1) and (1, -1)", () => {
  const e = eigen2x2([[2, 1], [1, 2]]);
  assert.equal(e.kind, "real");
  if (e.kind !== "real") return;
  assert.deepEqual(e.values, [3, 1]);
  assert.equal(e.repeated, false);
  assert.equal(e.lines.length, 2);
  assert.deepEqual(directionInts(e.lines[0]!.direction), [1, 1]);
  assert.deepEqual(directionInts(e.lines[1]!.direction), [1, -1]);
});

test("every eigen-line satisfies A v = λ v", () => {
  for (const A of [[[2, 1], [1, 1]], [[4, 1], [2, 3]], [[1, 2], [0, 3]], [[0.5, 1.5], [1.5, 0.5]], [[3, -2], [5, -4]]] as Matrix[]) {
    const e = eigen2x2(A);
    assert.equal(e.kind, "real");
    if (e.kind !== "real") continue;
    for (const line of e.lines) {
      const [vx, vy] = line.direction;
      const [ax, ay] = applyMatrix(A, [vx, vy]);
      assert.ok(near(ax, line.value * vx, 1e-9) && near(ay, line.value * vy, 1e-9), `${JSON.stringify(A)}: A v != λ v`);
      assert.ok(near(Math.hypot(vx, vy), 1, 1e-9), "unit direction");
    }
  }
});

test("complex eigenvalues: a rotation-scale has 1 ± i and no eigen-line", () => {
  const e = eigen2x2([[1, -1], [1, 1]]);
  assert.equal(e.kind, "complex");
  if (e.kind !== "complex") return;
  assert.ok(near(e.re, 1) && near(e.im, 1));
  const r90 = eigen2x2([[0, -1], [1, 0]]);
  assert.equal(r90.kind, "complex");
  if (r90.kind === "complex") assert.ok(near(r90.re, 0) && near(r90.im, 1));
});

test("repeated eigenvalue: a shear has one line, 2I has all of them", () => {
  const shear = eigen2x2([[1, 1], [0, 1]]);
  assert.equal(shear.kind, "real");
  if (shear.kind === "real") {
    assert.equal(shear.repeated, true);
    assert.equal(shear.scalar, false);
    assert.equal(shear.lines.length, 1);
    assert.deepEqual(directionInts(shear.lines[0]!.direction), [1, 0]);
  }
  const twice = eigen2x2([[2, 0], [0, 2]]);
  assert.equal(twice.kind, "real");
  if (twice.kind === "real") {
    assert.equal(twice.scalar, true);
    assert.equal(twice.lines.length, 0);
    assert.deepEqual(twice.values, [2, 2]);
  }
});

test("a projection has eigenvalues 1 and 0, the kernel being the λ = 0 line", () => {
  const e = eigen2x2(namedMatrix({ projection: { onto: "y = x" } }));
  assert.equal(e.kind, "real");
  if (e.kind !== "real") return;
  assert.ok(near(e.values[0], 1) && near(e.values[1], 0));
  assert.deepEqual(directionInts(e.lines[0]!.direction), [1, 1]);
  assert.deepEqual(directionInts(e.lines[1]!.direction), [1, -1]);
});

test("eigenvalues print exact: 3, (3 + √5)/2, 1 ± i, ±i", () => {
  assert.equal(eigenvalueText(3, 4, 4).text, "3");
  const A: Matrix = [[2, 1], [1, 1]];
  const e = eigen2x2(A);
  assert.equal(e.kind, "real");
  if (e.kind !== "real") return;
  const tr = traceOf(A);
  const disc = tr * tr - 4 * determinant(A);
  assert.equal(eigenvalueText(e.values[0], tr, disc).text, "(3 + √5)/2");
  assert.equal(eigenvalueText(e.values[1], tr, disc).text, "(3 − √5)/2");
  assert.equal(eigenvalueText(e.values[0], tr, disc).exact, true);
  assert.equal(complexPairText(1, 1).text, "1 ± i");
  assert.equal(complexPairText(0, 1).text, "±i");
  assert.equal(complexPairText(1, 2).text, "1 ± 2i");
  assert.equal(complexPairText(0.5, Math.sqrt(3) / 2).text, "0,5 ± (√3/2)i");
  // λ = 1 + √2: tr 2, disc 8 -> the square factor comes out.
  assert.equal(eigenvalueText(1 + Math.SQRT2, 2, 8).text, "1 + √2");
});

// ---- exact writing ------------------------------------------------------------------------

test("numbers are written exact when they are", () => {
  assert.equal(exactText(Math.SQRT2 / 2).text, "√2/2");
  assert.equal(exactText(-Math.sqrt(3) / 2).text, "−√3/2");
  assert.equal(exactText(1 / 3).text, "1/3");
  assert.equal(exactText(-0.5).text, "−0,5");
  assert.equal(exactText(-0.5, "pt-BR", true).text, "−1/2");
  assert.equal(exactText(0.5, "en").text, "0.5");
  assert.equal(exactText(Math.SQRT2).text, "√2");
  assert.equal(exactText((2 * Math.PI) / 3).text, "2π/3");
  assert.equal(exactText(0.05).exact, true);
  assert.equal(exactText(1e-17).text, "0");
  assert.equal(exactText(0.123457).exact, false);
  assert.equal(exactText(0.123457).text, "0,123");
});

test("T(x; y) is built from the entries: zeros omitted, 1 dropped, signs right", () => {
  assert.equal(formulaOf([[2, 1], [1, 1]]), "T(x; y) = (2x + y; x + y)");
  assert.equal(formulaOf([[1, -1], [0, 3]]), "T(x; y) = (x − y; 3y)");
  assert.equal(formulaOf([[0, -1], [1, 0]]), "T(x; y) = (−y; x)");
  assert.equal(formulaOf([[0, 0], [0, 0]]), "T(x; y) = (0; 0)");
  assert.equal(formulaOf([[-1, 0], [0, -1]]), "T(x; y) = (−x; −y)");
  assert.equal(formulaOf([[0.5, 0], [0, -2]]), "T(x; y) = (0,5x; −2y)");
  assert.equal(formulaOf([[2, -3], [-1, 0]]), "T(x; y) = (2x − 3y; −x)");
  assert.equal(formulaOf([[2, 1], [1, 1]], "en"), "T(x, y) = (2x + y, x + y)");
  const r30 = namedMatrix({ rotation: 30 });
  assert.equal(formulaOf(r30), "T(x; y) = ((√3/2)x − y/2; x/2 + (√3/2)y)");
});

test("lines through the origin are written as equations", () => {
  assert.equal(lineEquation([1, 1]), "y = x");
  assert.equal(lineEquation([1, -1]), "y = −x");
  assert.equal(lineEquation([0, 1]), "x = 0");
  assert.equal(lineEquation([1, 0]), "y = 0");
  assert.equal(lineEquation([2, 1]), "y = x/2");
  assert.equal(lineEquation([1, -2]), "y = −2x");
  assert.equal(lineEquation([2, 3]), "y = 3x/2");
});

// ---- singular maps ---------------------------------------------------------------------------

test("a singular map says what its image and kernel are", () => {
  const parts = singularParts(namedMatrix({ projection: { onto: "y = x" } }));
  assert.equal(parts.rank, 1);
  if (parts.rank === 1) {
    assert.deepEqual(directionInts(parts.image), [1, 1]);
    assert.deepEqual(directionInts(parts.kernel), [1, -1]);
  }
  const rows = singularParts([[1, 2], [2, 4]]);
  assert.equal(rows.rank, 1);
  if (rows.rank === 1) {
    assert.deepEqual(directionInts(rows.image), [1, 2]);
    assert.deepEqual(directionInts(rows.kernel), [2, -1]);
  }
  assert.equal(singularParts([[0, 0], [0, 0]]).rank, 0);
});

// ---- the image lattice -------------------------------------------------------------------------

test("clipLineToBox keeps the part of a line inside the box", () => {
  const box = { xlo: -2, xhi: 2, ylo: -1, yhi: 1 };
  const seg = clipLineToBox([0, 0], [1, 1], box)!;
  assert.ok(near(seg[0][0], -1) && near(seg[0][1], -1) && near(seg[1][0], 1) && near(seg[1][1], 1));
  assert.equal(clipLineToBox([0, 5], [1, 0], box), null);
  const flat = clipLineToBox([0, 0.5], [1, 0], box)!;
  assert.ok(near(flat[0][0], -2) && near(flat[1][0], 2));
});

test("every lattice line is the image of one line x = k or y = k, clipped to the box", () => {
  const A: Matrix = [[2, 1], [1, 1]];
  const box = { xlo: -3, xhi: 4, ylo: -2, yhi: 5 };
  const { step, lines } = imageLattice(A, box);
  assert.equal(step, 1);
  assert.ok(lines.length > 6);
  const det = determinant(A);
  const inv: Matrix = [[A[1][1] / det, -A[0][1] / det], [-A[1][0] / det, A[0][0] / det]];
  for (const line of lines) {
    for (const end of [line.a, line.b]) {
      assert.ok(end[0] >= box.xlo - 1e-9 && end[0] <= box.xhi + 1e-9 && end[1] >= box.ylo - 1e-9 && end[1] <= box.yhi + 1e-9, `${line.id} leaves the box`);
    }
    const pa = applyMatrix(inv, line.a);
    const pb = applyMatrix(inv, line.b);
    const onX = near(pa[0], pb[0], 1e-9) && near(pa[0], Math.round(pa[0]), 1e-9);
    const onY = near(pa[1], pb[1], 1e-9) && near(pa[1], Math.round(pa[1]), 1e-9);
    assert.ok(onX || onY, `${line.id} is not the image of a lattice line`);
  }
  assert.equal(lines.filter((l) => l.axis).length, 2);
});

test("a nearly singular map widens the lattice step instead of drawing a smear", () => {
  const box = { xlo: -1, xhi: 3, ylo: -1, yhi: 3 };
  const { step, lines } = imageLattice([[1, 1], [1, 1.05]], box, 130);
  assert.ok(step > 1, `step ${step}`);
  assert.ok(lines.length <= 2 * 24 + 2);
  const dense = imageLattice([[3, 0], [0, 3]], { xlo: -6, xhi: 6, ylo: -6, yhi: 6 }, 40);
  assert.equal(dense.step, 1);
});

// ---- decoded geometry ------------------------------------------------------------------------------

type Decoder = { world: (p: Point) => Vec; canvas: (p: Vec) => Point; unit: number };
/** Decodes canvas points back to (x, y) with the geometry the preset itself placed them by; the box must be stated. */
function decoderFor(x: [number, number], y: [number, number]): Decoder {
  const g = planeGeometry(x, y);
  return {
    unit: g.unit,
    world: (p) => [(p.x - g.origin.x) / g.unit, (g.origin.y - p.y) / g.unit],
    canvas: (p) => ({ x: g.origin.x + p[0] * g.unit, y: g.origin.y - p[1] * g.unit }),
  };
}
const BOX: { x: [number, number]; y: [number, number] } = { x: [-4, 6], y: [-3, 5] };
const decoder = decoderFor(BOX.x, BOX.y);
const blocksOf = (spec: ReturnType<typeof expandLinearMap>): Block[] => (spec.root as Scene).children as Block[];
const marksOf = (spec: ReturnType<typeof expandLinearMap>): Mark[] => (spec.root as Scene).marks ?? [];
const textOf = (spec: ReturnType<typeof expandLinearMap>, id: string): string => blocksOf(spec).find((b) => b.id === id)?.label ?? "";

test("vertex dots sit at the vertices and at A·vertex", () => {
  const A: Matrix = [[2, -1], [1, 1]];
  const input: LinearMapInput = { matrix: A, ...BOX, shapes: [{ points: [[1, 1], [3, 1], [1, 2]], label: "ABC" }] };
  const spec = expandLinearMap(input);
  const dec = decoder;
  const dot = (id: string): Vec => {
    const m = marksOf(spec).find((x) => x.id === `${id}-dot`);
    assert.ok(m, `no dot ${id}`);
    const from = m!.from as Point;
    const first = m!.segments[0] as { arc: Point; centre: Point };
    return dec.world(first.centre ?? from);
  };
  const names = ["A", "B", "C"];
  const pts: Vec[] = [[1, 1], [3, 1], [1, 2]];
  names.forEach((_, j) => {
    const at = dot(`shape-0-v${j}`);
    assert.ok(near(at[0], pts[j]![0], 1e-6) && near(at[1], pts[j]![1], 1e-6));
    const img = dot(`shape-0-v${j}-image`);
    const want = applyMatrix(A, pts[j]!);
    assert.ok(near(img[0], want[0], 1e-6) && near(img[1], want[1], 1e-6), `${names[j]}′ is at ${img}, wanted ${want}`);
  });
  const labels = blocksOf(spec).map((b) => b.label);
  for (const n of ["A", "B", "C", "A′", "B′", "C′"]) assert.ok(labels.includes(n), `missing label ${n}`);
});

test("the shape's image polygon has |det A| times the area, and the panel says so", () => {
  const A: Matrix = [[2, -1], [1, 1]];
  const spec = expandLinearMap({ matrix: A, ...BOX, shapes: [{ points: [[1, 1], [3, 1], [1, 2]], label: "ABC" }] });
  const dec = decoder;
  const poly = (id: string): Vec[] => {
    const m = marksOf(spec).find((x) => x.id === id)!;
    return [m.from as Point, ...m.segments.map((s) => (s as { line: Point }).line)].map((p) => dec.world(p));
  };
  assert.ok(near(polygonArea(poly("shape-0")), 1, 1e-6));
  assert.ok(near(polygonArea(poly("shape-0-image")), 3, 1e-6));
  const panel = blocksOf(spec).map((b) => b.label ?? "");
  assert.ok(panel.some((t) => /área ABC = 1; área A′B′C′ = 3/.test(t)), panel.join(" | "));
  assert.ok(panel.some((t) => t.startsWith("A′ = (1; 2), B′ = (5; 4), C′ = (0; 3)")), panel.join(" | "));
});

test("the unit square's image is the parallelogram on the columns; its area |det A| is printed, and measured", () => {
  const A: Matrix = [[2, 1], [1, 1]];
  const spec = expandLinearMap({ matrix: A, ...BOX, show: { grid: false, basis: false, unitSquare: true } });
  const mark = marksOf(spec).find((m) => m.id === "unit-square-image")!;
  assert.ok(mark, "no image parallelogram");
  const pts = [mark.from as Point, ...mark.segments.map((s) => (s as { line: Point }).line)];
  assert.equal(pts.length, 4);
  // Stated in the frame, so frame resolution recorded the scale the area check measures it in.
  assert.ok(mark.measuredIn !== undefined, "the region was not stated in one frame");
  const world = pts.map((p) => decoder.world(p).map((x) => Math.round(x * 1e6) / 1e6) as Vec);
  assert.deepEqual(world, [[0, 0], [2, 1], [3, 2], [1, 1]]);
  assert.ok(near(polygonArea(world), Math.abs(determinant(A))));
  const label = blocksOf(spec).find((b) => b.annotates === "unit-square-image")!;
  assert.equal(label.label, "S = 1");
});

test("an area that is not a short fraction is printed rounded, and the label still names its region", () => {
  const spec = expandLinearMap({ named: { rotation: 30 }, show: { grid: false, basis: false, unitSquare: true } });
  assert.equal(blocksOf(spec).find((b) => b.annotates === "unit-square-image")!.label, "S = 1");
  const stretch = expandLinearMap({ matrix: [[1.3, 0], [0, 0.77]], show: { grid: false, basis: false, unitSquare: true } });
  const label = blocksOf(stretch).find((b) => b.annotates === "unit-square-image")!;
  assert.match(label.label!, /^S = 1,001$|^S = 1$|^S ≈ 1,00$|^S = 1,001/);
});

test("basis arrows end at e₁, e₂ and at the columns of A; equal vectors share one arrow", () => {
  const A: Matrix = [[2, 1], [1, 1]];
  const spec = expandLinearMap({ matrix: A, ...BOX, show: { grid: false, basis: true, unitSquare: false } });
  const dec = decoder;
  const arrows = ((spec.root as Scene).connectors ?? []).map((c) => ({ id: c.id!, to: dec.world(c.to as Point) }));
  const to = (id: string): Vec => arrows.find((a) => a.id === id)!.to;
  assert.deepEqual(to("basis-e1").map((x) => Math.round(x * 1e6) / 1e6), [1, 0]);
  assert.deepEqual(to("basis-e2").map((x) => Math.round(x * 1e6) / 1e6), [0, 1]);
  assert.deepEqual(to("image-e1").map((x) => Math.round(x * 1e6) / 1e6), [2, 1]);
  assert.deepEqual(to("image-e2").map((x) => Math.round(x * 1e6) / 1e6), [1, 1]);
  // T(e₁) is column 1: the label says which vector, the panel gives its coordinates.
  const labels = blocksOf(spec).map((b) => b.label);
  assert.ok(labels.includes("T(e₁)") && labels.includes("T(e₂)"));
  assert.ok(labels.some((t) => t?.startsWith("T(e₁) = (2; 1) e T(e₂) = (1; 1)")));

  const swap = expandLinearMap({ named: { reflection: { line: "y = x" } }, show: { grid: false, basis: true, unitSquare: false } });
  const swapLabels = blocksOf(swap).map((b) => b.label);
  assert.ok(swapLabels.includes("T(e₁) = e₂") && swapLabels.includes("T(e₂) = e₁"), swapLabels.join(" | "));
  const ids = ((swap.root as Scene).connectors ?? []).map((c) => c.id);
  assert.equal(ids.length, 2, "e₂ and T(e₁) are one arrow");

  const proj = expandLinearMap({ named: { projection: { onto: "y = x" } }, show: { grid: false, basis: true, unitSquare: false } });
  assert.ok(blocksOf(proj).some((b) => b.label === "T(e₁) = T(e₂)"));
});

test("the image lattice is drawn as furniture of the plane, in its own colour", () => {
  const spec = expandLinearMap({ matrix: [[2, 1], [1, 1]], ...BOX, show: { grid: true, basis: false, unitSquare: false } });
  const lattice = marksOf(spec).filter((m) => m.id.startsWith("lattice-"));
  assert.ok(lattice.length >= 10);
  assert.ok(lattice.every((m) => m.gridOf === "plane"));
  const colours = new Set(lattice.map((m) => m.stroke));
  assert.equal(colours.size, 2, "the lattice and the images of the axes");
  const dec = decoder;
  const A: Matrix = [[2, 1], [1, 1]];
  const inv: Matrix = [[1, -1], [-1, 2]];
  for (const m of lattice) {
    const a = dec.world(m.from as Point);
    const b = dec.world((m.segments[0] as { line: Point }).line);
    const pa = applyMatrix(inv, a);
    const pb = applyMatrix(inv, b);
    const onX = near(pa[0], pb[0], 1e-6) && near(pa[0], Math.round(pa[0]), 1e-6);
    const onY = near(pa[1], pb[1], 1e-6) && near(pa[1], Math.round(pa[1]), 1e-6);
    assert.ok(onX || onY, `${m.id} is not an image line`);
  }
  void A;
});

test("eigen-lines pass through the origin along the eigenvectors, dashed, each labelled with its λ", () => {
  const spec = expandLinearMap({ matrix: [[2, 1], [1, 2]], ...BOX, show: { grid: false, basis: false, unitSquare: false, eigen: true } });
  const dec = decoder;
  const lines = marksOf(spec).filter((m) => m.id.startsWith("eigen-"));
  assert.ok(lines.length >= 2);
  for (const m of lines) {
    assert.equal(m.lineStyle, "dashed");
    const a = dec.world(m.from as Point);
    const b = dec.world((m.segments[0] as { line: Point }).line);
    // On y = x or y = −x, the eigenvectors of [[2, 1], [1, 2]].
    assert.ok(near(Math.abs(a[0]), Math.abs(a[1]), 1e-6) && near(Math.abs(b[0]), Math.abs(b[1]), 1e-6));
  }
  const labels = blocksOf(spec).filter((b) => b.annotates?.startsWith("eigen-")).map((b) => b.label);
  assert.ok(labels.includes("λ = 3") && labels.includes("λ = 1"), labels.join(" | "));
  const panel = blocksOf(spec).map((b) => b.label ?? "");
  assert.ok(panel.includes("autovalores: λ₁ = 3 e λ₂ = 1"));
  assert.ok(panel.includes("autovetor de λ = 3: (1; 1)"));
  assert.ok(panel.includes("autovetor de λ = 1: (1; −1)"));
});

test("complex eigenvalues draw no line and the panel states a ± bi", () => {
  const spec = expandLinearMap({ matrix: [[1, -1], [1, 1]], show: { grid: false, basis: false, unitSquare: false, eigen: true } });
  assert.equal(marksOf(spec).filter((m) => m.id.startsWith("eigen-")).length, 0);
  const panel = blocksOf(spec).map((b) => b.label ?? "");
  assert.ok(panel.includes("autovalores complexos: 1 ± i"), panel.join(" | "));
});

test("repeated eigenvalues are stated honestly: defective and scalar", () => {
  const shear = expandLinearMap({ matrix: [[1, 1], [0, 1]], show: { grid: false, basis: false, unitSquare: false, eigen: true } });
  const shearPanel = blocksOf(shear).map((b) => b.label ?? "");
  assert.ok(shearPanel.includes("autovalor duplo λ = 1"));
  assert.ok(shearPanel.some((t) => t.startsWith("único autovetor")));
  assert.equal(marksOf(shear).filter((m) => m.id.startsWith("eigen-")).length, 1);
  const twice = expandLinearMap({ matrix: [[2, 0], [0, 2]], show: { grid: false, basis: false, unitSquare: false, eigen: true } });
  assert.ok(blocksOf(twice).some((b) => b.label === "A = λI com λ = 2: todo vetor não nulo é autovetor"));
  assert.equal(marksOf(twice).filter((m) => m.id.startsWith("eigen-")).length, 0);
});

test("a singular map: the panel says what the image is, and the image line is drawn", () => {
  const spec = expandLinearMap({ named: { projection: { onto: "y = x" } }, show: { grid: true, basis: false, unitSquare: true, eigen: false } });
  const panel = blocksOf(spec).map((b) => b.label ?? "").join(" ");
  assert.ok(panel.includes("a imagem do plano é a reta y = x, gerada por (1; 1)"), panel);
  assert.ok(panel.includes("o núcleo é a reta y = −x"));
  assert.ok(marksOf(spec).some((m) => m.id === "image-line"));
  assert.equal(marksOf(spec).filter((m) => m.id.startsWith("lattice-")).length, 0, "a collapsed lattice is not drawn");
  const zero = expandLinearMap({ matrix: [[0, 0], [0, 0]], show: { grid: false, basis: false, unitSquare: false } });
  assert.ok(blocksOf(zero).some((b) => (b.label ?? "").includes("só a origem")));
});

test("the matrix is typeset in four cells and the panel prints its entries exact", () => {
  const spec = expandLinearMap({ named: { rotation: "pi/6" }, show: { grid: false, basis: false, unitSquare: false } });
  assert.equal(textOf(spec, "matrix-a11"), "√3/2");
  assert.equal(textOf(spec, "matrix-a12"), "−1/2");
  assert.equal(textOf(spec, "matrix-a21"), "1/2");
  assert.equal(textOf(spec, "matrix-a22"), "√3/2");
  assert.equal(textOf(spec, "matrix-head-0"), "T(x; y) = ((√3/2)x − y/2; x/2 + (√3/2)y)");
  assert.equal(textOf(spec, "matrix-head-1"), "det A = 1; tr A = √3");
  const plain = expandLinearMap({ matrix: [[2, 1], [1, 1]], show: { grid: false, basis: false, unitSquare: false } });
  assert.equal(textOf(plain, "matrix-head-0"), "T(x; y) = (2x + y; x + y)");
  assert.equal(textOf(plain, "matrix-head-1"), "det A = 1; tr A = 3");
  assert.equal(textOf(plain, "matrix-a11"), "2");
});

test("the locale changes decimal marks and the pair separator, not the maths", () => {
  const pt = expandLinearMap({ matrix: [[0.5, 0], [0, 2]], show: { grid: false, basis: true, unitSquare: false } });
  const en = expandLinearMap({ matrix: [[0.5, 0], [0, 2]], locale: "en", show: { grid: false, basis: true, unitSquare: false } });
  assert.equal(textOf(pt, "matrix-a11"), "0,5");
  assert.equal(textOf(en, "matrix-a11"), "0.5");
  assert.equal(textOf(pt, "matrix-head-0"), "T(x; y) = (0,5x; 2y)");
  assert.equal(textOf(en, "matrix-head-0"), "T(x, y) = (0.5x, 2y)");
});

test("default ranges contain the unit square, its image and every shape and point", () => {
  // Decoded from the drawing alone: the origin is where the axes cross, and e₁'s arrow is one unit long.
  const boxOf = (spec: ReturnType<typeof expandLinearMap>): { xlo: number; xhi: number; ylo: number; yhi: number } => {
    const marks = marksOf(spec);
    const ax = marks.find((m) => m.id === "plane-axis-x")!;
    const ay = marks.find((m) => m.id === "plane-axis-y")!;
    const axEnd = (ax.segments[0] as { line: Point }).line;
    const ayEnd = (ay.segments[0] as { line: Point }).line;
    const origin = { x: (ay.from as Point).x, y: (ax.from as Point).y };
    const e1 = ((spec.root as Scene).connectors ?? []).find((c) => c.id === "basis-e1")!;
    const unit = Math.hypot((e1.to as Point).x - origin.x, (e1.to as Point).y - origin.y);
    const xs = [(ax.from as Point).x, axEnd.x].map((x) => (x - origin.x) / unit);
    const ys = [(ay.from as Point).y, ayEnd.y].map((y) => (origin.y - y) / unit);
    return { xlo: Math.min(...xs), xhi: Math.max(...xs), ylo: Math.min(...ys), yhi: Math.max(...ys) };
  };
  const inside = (b: ReturnType<typeof boxOf>, p: Vec): boolean => p[0] >= b.xlo - 1e-6 && p[0] <= b.xhi + 1e-6 && p[1] >= b.ylo - 1e-6 && p[1] <= b.yhi + 1e-6;
  const A: Matrix = [[3, 1], [0, 2]];
  const spec = expandLinearMap({ matrix: A, show: { grid: false, basis: true, unitSquare: true } });
  const b = boxOf(spec);
  for (const p of [[0, 0], [1, 0], [0, 1], [1, 1], [3, 0], [1, 2], [4, 2]] as Vec[]) assert.ok(inside(b, p), `${p} outside ${JSON.stringify(b)}`);
  assert.ok(b.yhi - b.ylo >= 4 - 1e-9 && b.xhi - b.xlo >= 4 - 1e-9);
  const shapes = expandLinearMap({ named: { rotation: 90 }, shapes: [{ points: [[1, 1], [4, 1], [1, 3]], label: "ABC" }], show: { basis: true } });
  const sb = boxOf(shapes);
  for (const p of [[1, 1], [4, 1], [1, 3], [-1, 1], [-1, 4], [-3, 1]] as Vec[]) assert.ok(inside(sb, p), `${p} outside ${JSON.stringify(sb)}`);
});

// ---- validation -------------------------------------------------------------------------------------------

test("refusals name what is wrong", () => {
  const bad = (raw: Record<string, unknown>, pattern: RegExp): void =>
    assert.throws(() => validateLinearMapInput(raw), (e: unknown) => e instanceof SpecError && pattern.test(e.message), JSON.stringify(raw));
  bad({}, /matrix.*named/);
  bad({ matrix: [[1, 0], [0, 1]], named: { rotation: 90 } }, /either.*not both/);
  bad({ matrix: [[1, 0, 0], [0, 1, 0]] }, /matrix must be \[\[a, b\], \[c, d\]\]/);
  bad({ matrix: [[1, 0]] }, /matrix must be/);
  bad({ matrix: [[1, "banana"], [0, 1]] }, /matrix\[0\]\[1\].*not a number/);
  bad({ matrix: [[1, null], [0, 1]] }, /matrix\[0\]\[1\] must be a number/);
  bad({ named: {} }, /exactly one of rotation/);
  bad({ named: { rotation: 30, scale: [1, 2] } }, /exactly one of rotation/);
  bad({ named: { skew: 3 } }, /must be one of rotation/);
  bad({ named: { shear: {} } }, /shear must be/);
  bad({ named: { shear: { x: 1, y: 1 } } }, /shear must be/);
  bad({ named: { scale: [1] } }, /scale must be \[sx, sy\]/);
  bad({ named: { reflection: { line: "y = x + 1" } } }, /not a line through the origin/);
  bad({ named: { reflection: {} } }, /line/);
  bad({ named: { projection: { onto: [0, 0] } } }, /zero vector/);
  bad({ named: { rotation: "pi/" } }, /rotation/);
  bad({ matrix: [[1, 0], [0, 1]], show: { grid: "yes" } }, /show.grid must be true or false/);
  bad({ matrix: [[1, 0], [0, 1]], show: { pretty: true } }, /not a flag/);
  bad({ matrix: [[1, 0], [0, 1]], locale: "fr" }, /locale must be one of/);
  bad({ matrix: [[1, 0], [0, 1]], x: [3, 1] }, /lo < hi/);
  bad({ matrix: [[1, 0], [0, 1]], shapes: [{ points: [[0, 0], [1, 1]] }] }, /at least three vertices/);
  bad({ matrix: [[1, 0], [0, 1]], shapes: [{ points: [[0, 0], [1, 0], [0, 1]], label: "AB" }] }, /must name each of the 3 vertices/);
  bad({ matrix: [[1, 0], [0, 1]], points: [{ name: "P", at: [1, 1] }, { name: "P", at: [2, 2] }] }, /used twice/);
  bad({ matrix: [[1, 0], [0, 1]], points: [{ name: "P", at: [1] }] }, /at must be \[x, y\]/);
});

test("nothing is clipped silently: a box that cuts a shape is refused", () => {
  assert.throws(
    () => expandLinearMap({ named: { scale: [4, 1] }, x: [-2, 2], y: [-2, 2], shapes: [{ points: [[0, 0], [1, 0], [0, 1]], label: "ABC" }] }),
    (e: unknown) => e instanceof SpecError && /lies outside the plotted box/.test(e.message),
  );
  assert.throws(
    () => expandLinearMap({ named: { scale: [4, 1] }, x: [-2, 2], y: [-2, 2], show: { basis: true } }),
    (e: unknown) => e instanceof SpecError && /T\(e₁\).*outside/.test(e.message),
  );
  // Given a box that holds everything, it is used exactly.
  const spec = expandLinearMap({ named: { scale: [2, 1] }, x: [-3, 5], y: [-2, 4], show: { grid: true } });
  const dec = decoderFor([-3, 5], [-2, 4]);
  const ax = marksOf(spec).find((m) => m.id === "plane-axis-x")!;
  const ay = marksOf(spec).find((m) => m.id === "plane-axis-y")!;
  const xs = [dec.world(ax.from as Point)[0], dec.world((ax.segments[0] as { line: Point }).line)[0]];
  const ys = [dec.world(ay.from as Point)[1], dec.world((ay.segments[0] as { line: Point }).line)[1]];
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map((x) => Math.round(x * 1e6) / 1e6), [-3, 5, -2, 4]);
});

// ---- every fixture: renders, and every check passes --------------------------------------------------------

test("there are at least five fixtures, covering the required kinds", () => {
  assert.ok(fixtures.length >= 5, `${fixtures.length} fixtures`);
  const names = fixtures.join(" ");
  for (const needle of ["shear", "rotation-90", "symmetric", "reflection", "projection", "complex"]) assert.ok(names.includes(needle), `no ${needle} fixture`);
});

fixtures.forEach((filename) => {
  test(`render fixture ${filename}: every check passes`, async () => {
    const raw = JSON.parse(readFileSync(join(dir, filename), "utf8")) as Record<string, unknown>;
    assert.equal(raw.preset, "linear-map");
    const { preset: _preset, ...input } = raw;
    validateLinearMapInput(input);
    const spec = expandLinearMap(input as unknown as LinearMapInput);
    const result = await render(spec, { maxPasses: 3 });
    for (const check of result.manifest.checks) {
      assert.ok(check.status === "pass" || check.status === "not-applicable", `${filename}: ${check.id} ${check.status}: ${check.detail}`);
    }
  });
});

test("the area check reads the parallelogram: a wrong label would fail it", async () => {
  const spec = expandLinearMap({ matrix: [[2, 1], [1, 1]], show: { grid: false, basis: false, unitSquare: true } });
  const ok = await render(spec, { maxPasses: 2, raster: false });
  const areaChecks = ok.manifest.checks.filter((c) => c.id === "area-matches-its-label");
  assert.ok(areaChecks.some((c) => c.status === "pass"), JSON.stringify(areaChecks));
  const label = blocksOf(spec).find((b) => b.annotates === "unit-square-image")!;
  label.label = "S = 5";
  const bad = await render(spec, { maxPasses: 2, raster: false });
  assert.ok(bad.manifest.checks.some((c) => c.id === "area-matches-its-label" && c.status === "fail"));
});

// ---- scale fitted to the box (review of 2026-09-29) ----------------------------------------------------

function svgSize(svg: string): { w: number; h: number } {
  const m = svg.match(/<svg[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/);
  assert.ok(m, "svg has a size");
  return { w: Number(m![1]), h: Number(m![2]) };
}

const numericTexts = (svg: string): string[] => (svg.match(/<text[^>]*>[^<]*<\/text>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).filter((t) => /^[−-]?[\d.,]+$/.test(t));

async function renderPassing(input: LinearMapInput) {
  const result = await render(expandLinearMap(input), { maxPasses: 3, raster: false });
  for (const check of result.manifest.checks) {
    assert.ok(check.status === "pass" || check.status === "not-applicable", `${check.id} ${check.status}: ${check.detail}`);
  }
  return result;
}

test("probe: a stretch by [[200, 0], [0, 300]] fits a page (was 4556 x 6926px)", async () => {
  const { svg } = await renderPassing({ matrix: [[200, 0], [0, 300]] });
  const { w, h } = svgSize(svg);
  assert.ok(w <= 1200 && h <= 1200 && w >= 300 && h >= 300, `${w} x ${h}`);
  assert.ok(numericTexts(svg).length <= 24, `${numericTexts(svg).length} numbers`);
  assert.match(svg, /60\u202f000/, "the area is still printed, grouped from five digits");
  assert.match(svg, /T\(e/, "the image labels stay");
});

test("probe: huge and tiny maps, with eigen-lines and a shape, stay page-sized", async () => {
  for (const input of [
    { matrix: [[200, 10], [0, 300]], show: { eigen: true } },
    { matrix: [[0.001, 0], [0, 0.002]] },
    { matrix: [[1000, 0], [0, 1]], shapes: [{ points: [[0, 0], [1, 0], [0, 1]] as [number, number][], label: "ABC" }] },
  ] as LinearMapInput[]) {
    const { svg } = await renderPassing(input);
    const { w, h } = svgSize(svg);
    assert.ok(w <= 1600 && h <= 2000 && w >= 300, `${JSON.stringify(input.matrix)}: ${w} x ${h}`);
  }
});

test("planeGeometry: whole-unit ticks for a small box, 1-2-5 steps at any larger magnitude", () => {
  assert.equal(planeGeometry([-4, 5], [-1, 5]).step, 1);
  assert.equal(planeGeometry([0, 300], [0, 200]).step, 50);
  assert.ok(planeGeometry([0, 300], [0, 200]).plotWidth <= 700);
  assert.ok(planeGeometry([0, 5000], [0, 5000]).plotHeight <= 700);
});

// ---- answers: false ---------------------------------------------------------------------------------------

test("answers:false keeps the given (grid, e₁ e₂, the unit square, the shape) and hides every image and reading", async () => {
  const input: LinearMapInput = {
    matrix: [[2, 1], [1, 2]],
    show: { grid: true, basis: true, unitSquare: true, eigen: true },
    shapes: [{ points: [[1, 1], [3, 1], [1, 2]], label: "ABC" }],
    points: [{ name: "P", at: [2, 1] }],
  };
  const solution = expandLinearMap(input);
  const question = expandLinearMap({ ...input, answers: false });
  const ids = (s: typeof solution): string[] => [...((s.root as Scene).marks ?? []).map((m) => m.id), ...((s.root as Scene).connectors ?? []).map((c) => c.id ?? "")];
  const texts = (s: typeof solution): string[] => (s.root as Scene).children.filter((c): c is Block => "label" in c).map((c) => c.label ?? "");
  for (const id of ["unit-square-image", "image-e1", "image-e2", "eigen-0", "shape-0-image"]) {
    assert.ok(ids(solution).includes(id), `answers:true is unchanged: ${id}`);
    assert.ok(!ids(question).includes(id), `answers:false has no ${id}`);
  }
  assert.ok(!ids(question).some((id) => id.startsWith("lattice-")), "the image lattice is an answer");
  for (const id of ["unit-square", "basis-e1", "basis-e2", "shape-0"]) assert.ok(ids(question).includes(id), `the given ${id} stays`);
  const q = texts(question).join("\n");
  for (const gone of ["T(e₁)", "T(e₂)", "det", "autovalor", "λ", "′", "área", "S =", "colunas"]) assert.ok(!q.includes(gone), `no "${gone}" in the question figure`);
  for (const kept of ["e₁", "e₂", "A", "T(x; y) = (2x + y; x + 2y)"]) assert.ok(q.includes(kept), `"${kept}" is given`);
  await renderPassing({ ...input, answers: false });
});

test("answers:false on a named map states the map by its name, not its matrix", async () => {
  const input: LinearMapInput = { named: { rotation: 90 }, shapes: [{ points: [[1, 1], [4, 1], [1, 3]], label: "ABC" }], answers: false };
  const spec = expandLinearMap(input);
  const q = (spec.root as Scene).children.filter((c): c is Block => "label" in c).map((c) => c.label!).join("\n");
  assert.match(q, /rotação de 90°/);
  assert.ok(!q.includes("matrix-a11") && !(spec.root as Scene).children.some((c) => "id" in c && (c as Block).id === "matrix-a11"), "no matrix cells");
  assert.ok(!q.includes("A′") && !q.includes("B′"));
  await renderPassing(input);
});
