/**
 * space (ADR 0045): R³ analytic geometry. Derived points, lines and vectors
 * agree with vec.ts; plane equations print in canonical pt-BR form; a
 * segment behind a plane patch is dashed exactly there; every relation that
 * gives no answer is refused by name; every fixture renders with no check
 * failing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  boxEdges,
  closestPoints3,
  expandSpace,
  footOnLine3,
  footOnPlane3,
  nicePointOnPlaneLine,
  validateSpaceInput,
} from "../src/presets/space/preset.ts";
import type { SpaceInput } from "../src/presets/space/preset.ts";
import {
  canonicalPlane,
  parsePlaneEquation,
  planeEquationText,
  printDegrees,
  printExact,
  printTriple,
  simplestDirection,
} from "../src/presets/space/numbers.ts";
import { clipLineToBox, clipPolygonToBox, hiddenBy, splitByVisibility } from "../src/presets/space/visibility.ts";
import type { Patch } from "../src/presets/space/visibility.ts";
import { cavalierCamera, depth, isometricCamera, project } from "../src/geometry/projection.ts";
import {
  cross3,
  distance,
  distancePointToLine3,
  distancePointToPlane3,
  dot,
  intersectLinePlane3,
  lerp,
  lineThrough3,
  planeFromEquation3,
  relativePosition3,
  sub,
} from "../src/geometry/vec.ts";
import type { Vec3 } from "../src/geometry/vec.ts";
import { render } from "../src/pipeline.ts";
import type { Block, Mark, Scene } from "../src/ir/types.ts";

const near = (a: number, b: number, tol = 1e-9): void => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const fixturesDir = fileURLToPath(new URL("../fixtures/space/", import.meta.url));
const fixture = (name: string): SpaceInput => {
  const raw = JSON.parse(readFileSync(`${fixturesDir}${name}.json`, "utf8")) as Record<string, unknown>;
  delete raw.preset;
  return raw as SpaceInput;
};
const readings = (input: SpaceInput): string[] =>
  ((expandSpace(input).root as Scene).children as Block[]).filter((b) => String(b.id ?? "").startsWith("reading-")).map((b) => b.label ?? "");
const marks = (input: SpaceInput): Mark[] => (expandSpace(input).root as Scene).marks ?? [];

// ---- numbers -------------------------------------------------------------------

test("plane equations are read with pt-BR commas, the typographic minus and fractions", () => {
  assert.deepEqual(parsePlaneEquation("2x + y − z = 4"), { a: 2, b: 1, c: -1, d: -4 });
  assert.deepEqual(parsePlaneEquation("2x + 3y + 6z = 12"), { a: 2, b: 3, c: 6, d: -12 });
  assert.deepEqual(parsePlaneEquation("x = 3"), { a: 1, b: 0, c: 0, d: -3 });
  assert.deepEqual(parsePlaneEquation("-x + 2,5y = z - 1"), { a: -1, b: 2.5, c: -1, d: 1 });
  assert.deepEqual(parsePlaneEquation("1/2x + 2*y + 3·z = 0"), { a: 0.5, b: 2, c: 3, d: 0 });
  assert.throws(() => parsePlaneEquation("2x + y"), /exactly one "="/);
  assert.throws(() => parsePlaneEquation("x^2 + y = 1"), /cannot read/);
  assert.throws(() => parsePlaneEquation("4 = 4"), /not a plane/);
  assert.throws(() => parsePlaneEquation("2x y = 1"), /expected \+ or −/);
});

test("the equação geral prints canonical: whole coefficients, no common factor, positive lead", () => {
  assert.equal(planeEquationText(parsePlaneEquation("2x + 3y + 6z = 12")).text, "2x + 3y + 6z − 12 = 0");
  assert.equal(planeEquationText(parsePlaneEquation("4x + 2y − 2z = 8")).text, "2x + y − z − 4 = 0");
  assert.equal(planeEquationText(parsePlaneEquation("−2x = 4")).text, "x + 2 = 0");
  assert.equal(planeEquationText(parsePlaneEquation("1/2x + 1/3y + z = 1")).text, "3x + 2y + 6z − 6 = 0");
  assert.equal(planeEquationText(parsePlaneEquation("x − y = 0")).text, "x − y = 0");
  assert.equal(planeEquationText(parsePlaneEquation("-y + z = 0")).text, "y − z = 0");
  const irrational = canonicalPlane({ a: Math.SQRT2, b: 1, c: 0, d: 0 });
  assert.equal(irrational.exact, false);
});

test("printed numbers are exact: rationals, simplified roots, rationalised roots; else flagged", () => {
  assert.deepEqual(printExact(12 / 7), { text: "12/7", exact: true });
  assert.deepEqual(printExact(Math.sqrt(21)), { text: "√21", exact: true });
  assert.deepEqual(printExact(Math.sqrt(20)), { text: "2√5", exact: true });
  assert.deepEqual(printExact(4 / Math.sqrt(14)), { text: "2√14/7", exact: true });
  assert.deepEqual(printExact(-Math.sqrt(2)), { text: "−√2", exact: true });
  assert.deepEqual(printExact(2.5), { text: "2,5", exact: true });
  assert.equal(printExact(Math.E).exact, false);
  assert.equal(printTriple([1.5, -2, 0]).text, "(1,5; −2; 0)");
  assert.deepEqual(printDegrees(Math.PI / 3), { text: "60°", exact: true });
  assert.equal(printDegrees(1).exact, false);
  assert.deepEqual(simplestDirection([2, 4, -6]), [1, 2, -3]);
  assert.deepEqual(simplestDirection([-0.5, 0, 1]), [1, 0, -2]);
});

// ---- derived objects agree with vec.ts ---------------------------------------------

test("a line piercing a plane: the intersection is vec.ts's, printed exact", () => {
  const input = fixture("line-pierces-plane");
  const A: Vec3 = [2, 1, 0];
  const B: Vec3 = [2, 3, 2];
  const eq = parsePlaneEquation("2x + y + 2z = 8");
  const hit = intersectLinePlane3(lineThrough3(A, B), planeFromEquation3(eq.a, eq.b, eq.c, eq.d));
  assert.equal(hit.kind, "point");
  const I = (hit as { point: Vec3 }).point;
  const r = readings(input);
  assert.ok(r.includes(`I = r ∩ π = ${printTriple(I).text}`), r.join(" | "));
  assert.ok(r.includes("I = r ∩ π = (2; 2; 1)"));
  assert.ok(r.includes("ângulo(r, π) = 45°"));
  assert.ok(r.includes(`d(A, π) = ${printExact(distancePointToPlane3(A, planeFromEquation3(eq.a, eq.b, eq.c, eq.d))).text}`));
  assert.ok(r.includes("π: 2x + y + 2z − 8 = 0"));
});

test("midpoint, feet of perpendiculars, sum and cross product are computed, never typed", () => {
  const r = readings({
    points: [
      { name: "A", at: [1, 2, 3] },
      { name: "B", at: [3, 0, 5] },
      { name: "M", midpoint: ["A", "B"] },
      { name: "F", foot: { from: "A", on: "π" } },
      { name: "G", foot: { from: "B", on: "s" } },
    ],
    planes: [{ name: "π", equation: "x + y + z = 1" }],
    lines: [{ name: "s", point: [0, 0, 0], direction: [1, 1, 0] }],
    vectors: [
      { name: "u", components: [1, 2, 3] },
      { name: "v", components: [0, 1, -1] },
      { name: "w", cross: ["u", "v"] },
      { name: "p", sum: ["u", "v"] },
    ],
  });
  const M = lerp<Vec3>([1, 2, 3], [3, 0, 5], 0.5);
  assert.ok(r.includes(`M = ponto médio de AB = ${printTriple(M).text}`), r.join(" | "));
  const plane = planeFromEquation3(1, 1, 1, -1);
  const F = footOnPlane3([1, 2, 3], plane);
  near(distancePointToPlane3(F, plane), 0);
  near(distance(F, [1, 2, 3]), distancePointToPlane3([1, 2, 3], plane));
  assert.ok(r.includes(`F = pé da perpendicular de A a π = ${printTriple(F).text}`));
  const line = { point: [0, 0, 0] as Vec3, direction: [1, 1, 0] as Vec3 };
  const G = footOnLine3([3, 0, 5], line);
  near(distancePointToLine3(G, line), 0);
  near(distance(G, [3, 0, 5]), distancePointToLine3([3, 0, 5], line));
  assert.ok(r.includes(`G = pé da perpendicular de B a s = ${printTriple(G).text}`));
  const w = cross3([1, 2, 3], [0, 1, -1]);
  assert.ok(r.includes(`w = u × v = ${printTriple(w).text}; |w| = ${printExact(Math.hypot(...w)).text}`), r.join(" | "));
  assert.ok(r.includes("p = u + v = (1; 3; 2); |p| = √14"));
});

test("two planes meet in a line through the simplest point, lying on both", () => {
  const r = readings(fixture("two-planes"));
  assert.ok(r.includes("r = α ∩ β: (x; y; z) = (0; 0; 4) + t(1; 1; −2)"), r.join(" | "));
  assert.ok(r.includes("ângulo(α, β) = 90°"));
  const e1 = { a: 2, b: -1, c: 3, d: -7 };
  const e2 = { a: 1, b: 1, c: -1, d: -2 };
  const p = nicePointOnPlaneLine(e1, e2, [0, 0, 0]);
  near(e1.a * p[0] + e1.b * p[1] + e1.c * p[2] + e1.d, 0);
  near(e2.a * p[0] + e2.b * p[1] + e2.c * p[2] + e2.d, 0);
});

test("reversas: the common perpendicular's feet are vec.ts-consistent and its length is the distance", () => {
  const r1 = { point: [3, 0, 0] as Vec3, direction: [-3, 3, 0] as Vec3 };
  const r2 = { point: [0, 0, 3] as Vec3, direction: [1, 1, 0] as Vec3 };
  assert.equal(relativePosition3(r1, r2).kind, "reversas");
  const [f1, f2] = closestPoints3(r1, r2);
  near(distancePointToLine3(f1, r1), 0);
  near(distancePointToLine3(f2, r2), 0);
  const d = sub(f2, f1);
  near(dot(d, r1.direction), 0);
  near(dot(d, r2.direction), 0);
  const n = cross3(r1.direction, r2.direction);
  near(distance(f1, f2), Math.abs(dot(sub(r2.point, r1.point), n)) / Math.hypot(...n));
  const r = readings(fixture("skew-lines"));
  assert.ok(r.includes("r e s: reversas; perpendicular comum de (1,5; 1,5; 0) a (1,5; 1,5; 3); d(r, s) = 3"), r.join(" | "));
});

test("measures: point–plane distance as a rationalised root, line–plane angle by its sine", () => {
  const r = readings({
    points: [{ name: "P", at: [1, 1, 1] }],
    planes: [{ name: "π", equation: "x + 2y + 3z = 0" }],
    lines: [{ name: "r", point: [0, 0, 0], direction: [1, 0, 0] }],
    measures: [{ distance: ["P", "π"] }, { angle: ["r", "π"] }, { position: ["r", "π"] }],
  });
  // |1 + 2 + 3| / √14 = 6/√14 = 3√14/7.
  assert.ok(r.includes("d(P, π) = 3√14/7"), r.join(" | "));
  assert.ok(r.some((t) => t.startsWith("ângulo(r, π): sen θ = √14/14; θ ≈ ")), r.join(" | "));
  assert.ok(r.includes("r e π: concorrentes (um ponto comum)"));
});

// ---- visibility ------------------------------------------------------------------------

const octant: Patch = { id: "p", corners: [[6, 0, 0], [0, 4, 0], [0, 0, 2]], point: [6, 0, 0], normal: [2, 3, 6] };

test("an axis behind the intercept triangle is hidden up to the intercept and visible past it", () => {
  const cam = cavalierCamera();
  for (const [end, hitAt] of [
    [[8, 0, 0], 6],
    [[0, 6, 0], 4],
    [[0, 0, 3], 2],
  ] as [Vec3, number][]) {
    const pieces = splitByVisibility(cam, [0, 0, 0], end, [octant]);
    assert.equal(pieces.length, 2, JSON.stringify(pieces));
    assert.equal(pieces[0]!.hidden, true);
    assert.equal(pieces[1]!.hidden, false);
    near(Math.max(...pieces[0]!.to), hitAt, 1e-9);
  }
});

test("a line piercing a patch is split exactly at the piercing point, dashed on the far side", () => {
  const cam = cavalierCamera();
  const patch: Patch = { id: "q", corners: [[4, -3, 0], [4, 3, 0], [-4, 3, 0], [-4, -3, 0]].map((c) => [c[0]!, c[1]!, 1] as Vec3), point: [0, 0, 1], normal: [0, 0, 1] };
  // Vertical line through (0, 0): below z = 1 it is under the horizontal patch, which the reader sees from above.
  const pieces = splitByVisibility(cam, [0, 0, -2], [0, 0, 4], [patch]);
  const hidden = pieces.filter((p) => p.hidden);
  assert.equal(hidden.length, 1);
  near(hidden[0]!.to[2], 1, 1e-9);
  assert.ok(pieces.some((p) => !p.hidden && Math.abs(p.from[2] - 1) < 1e-9));
  // Depth agrees: just below the patch, the patch is nearer on that page spot.
  assert.equal(hiddenBy(cam, patch, [0, 0, 0.9]), true);
  assert.equal(hiddenBy(cam, patch, [0, 0, 1.1]), false);
  assert.ok(depth(cam, [0, 0, 1.1]) > depth(cam, [0, 0, 0.9]));
});

test("a segment lying in the patch's plane, or passing in front, is never hidden by it", () => {
  const cam = isometricCamera();
  assert.deepEqual(splitByVisibility(cam, [6, 0, 0], [0, 4, 0], [octant]).map((p) => p.hidden), [false]);
  assert.deepEqual(splitByVisibility(cam, [3, 2, 3], [4, 3, 3], [octant]).map((p) => p.hidden), [false]);
});

test("clipping: a line to the region box, a plane's patch to the box", () => {
  const range = clipLineToBox([0, 0, 0], [1, 1, 1], { lo: [0, 0, 0], hi: [2, 3, 4] });
  assert.deepEqual(range, [0, 2]);
  assert.equal(clipLineToBox([5, 5, 5], [1, 0, 0], { lo: [0, 0, 0], hi: [1, 1, 1] }), null);
  const clipped = clipPolygonToBox([[-1, -1, 1], [3, -1, 1], [3, 3, 1], [-1, 3, 1]], { lo: [0, 0, 0], hi: [2, 2, 2] });
  assert.equal(clipped.length, 4);
  for (const p of clipped) assert.ok(p.every((c) => c >= -1e-12 && c <= 2 + 1e-12));
});

test("in the built figure, the line's hidden stretch is dashed and meets the solid one at I's page point", () => {
  const input = fixture("line-pierces-plane");
  const ms = marks(input).filter((m) => /^line-0/.test(m.id));
  assert.ok(ms.some((m) => m.lineStyle === "dashed"));
  assert.ok(ms.some((m) => m.lineStyle === undefined));
  // One colour for the whole line, visible or hidden.
  assert.equal(new Set(ms.map((m) => m.stroke)).size, 1);
  const iDot = marks(input).find((m) => m.id === "pt-2")!;
  const dashed = ms.find((m) => m.lineStyle === "dashed")!;
  const end = dashed.segments[dashed.segments.length - 1] as { line: { x: number; y: number } };
  // The dot's rightmost arc start is (cx + r, cy); its centre is r to the left.
  const from = iDot.from as { x: number; y: number };
  near(end.line.x, from.x - 3.4, 1e-6);
  near(end.line.y, from.y, 1e-6);
  // Points are drawn last: nothing is painted over a dot.
  const all = marks(input);
  const lastLine = Math.max(...all.map((m, i) => (/^(line|axis|plane|vec)/.test(m.id) ? i : -1)));
  assert.ok(all.findIndex((m) => m.id === "pt-0") > lastLine);
});

test("box guides: nine dashed edges for P(2; 3; 4), none on an axis, degenerate ones dropped", () => {
  assert.equal(boxEdges([2, 3, 4], true).length, 9);
  assert.equal(boxEdges([2, 3, 4], "floor").length, 3);
  assert.equal(boxEdges([2, 0, 4], true).length, 2);
  const ms = marks(fixture("point-box")).filter((m) => m.id.startsWith("pt-0-box"));
  assert.equal(ms.length, 9);
  assert.ok(ms.every((m) => m.lineStyle === "dashed"));
});

// ---- refusals ------------------------------------------------------------------------------

test("relations with no answer are refused by name", () => {
  const skew = {
    lines: [
      { name: "r", point: [3, 0, 0], direction: [-3, 3, 0] },
      { name: "s", point: [0, 0, 3], direction: [1, 1, 0] },
    ],
  } as SpaceInput;
  assert.throws(() => expandSpace({ ...skew, points: [{ name: "X", intersection: ["r", "s"] }] }), /reversas.*never meet.*commonPerpendicular/);
  assert.throws(
    () =>
      expandSpace({
        lines: [
          { name: "r", point: [0, 0, 0], direction: [1, 0, 0] },
          { name: "s", point: [0, 1, 0], direction: [2, 0, 0] },
        ],
        points: [{ name: "X", intersection: ["r", "s"] }],
      }),
    /paralelas/,
  );
  assert.throws(
    () =>
      expandSpace({
        planes: [{ name: "π", equation: "z = 1" }],
        lines: [{ name: "r", point: [0, 0, 0], direction: [1, 1, 0] }],
        points: [{ name: "X", intersection: ["r", "π"] }],
      }),
    /parallel to the plane "π"/,
  );
  assert.throws(
    () =>
      expandSpace({
        planes: [
          { name: "α", equation: "x = 1" },
          { name: "β", equation: "y = 1" },
        ],
        points: [{ name: "X", intersection: ["α", "β"] }],
      }),
    /meet in a line, not a point/,
  );
  assert.throws(
    () =>
      expandSpace({
        planes: [
          { name: "α", equation: "x = 1" },
          { name: "β", equation: "2x = 6" },
        ],
        lines: [{ name: "r", intersection: ["α", "β"] }],
      }),
    /parallel -- they never meet/,
  );
  assert.throws(() => expandSpace({ ...skew, measures: [{ commonPerpendicular: ["r", "r"] }] }), /coincidentes, not reversas/);
  assert.throws(
    () => expandSpace({ vectors: [{ name: "u", components: [1, 2, 3] }, { name: "v", components: [2, 4, 6] }, { name: "w", cross: ["u", "v"] }] }),
    /parallel -- their cross product is the zero vector/,
  );
  assert.throws(
    () => expandSpace({ points: [{ name: "A", at: [0, 0, 0] }, { name: "B", at: [1, 1, 1] }, { name: "C", at: [2, 2, 2] }], planes: [{ name: "π", through: ["A", "B", "C"] }] }),
    /collinear/,
  );
});

test("typed numbers, unknown names, wrong kinds and cycles are refused", () => {
  assert.throws(() => expandSpace({ points: [{ name: "P", at: [1, 2, 3], label: "P(1, 2, 3)" }] }), /types a number/);
  assert.throws(() => expandSpace({ points: [{ name: "M", midpoint: ["A", "B"] }] }), /"A" is not declared/);
  assert.throws(
    () => expandSpace({ points: [{ name: "A", at: [0, 0, 0] }], lines: [{ name: "r", through: ["A", "A"] }] }),
    /coincide/,
  );
  assert.throws(
    () => expandSpace({ points: [{ name: "A", at: [0, 0, 0] }], vectors: [{ name: "u", components: [1, 0, 0] }], lines: [{ name: "r", point: "u", direction: [1, 0, 0] }] }),
    /"u" is a vector, not a point/,
  );
  assert.throws(
    () =>
      expandSpace({
        points: [
          { name: "A", midpoint: ["B", "C"] },
          { name: "B", midpoint: ["A", "C"] },
          { name: "C", at: [0, 0, 0] },
        ],
      }),
    /defined in terms of itself/,
  );
  assert.throws(() => expandSpace({ points: [{ name: "A", at: [0, 0, 0] }, { name: "A", at: [1, 0, 0] }] }), /already declared/);
  assert.throws(() => expandSpace({}), /at least one/);
  assert.throws(() => validateSpaceInput({ camera: { kind: "orthographic", azimuth: 10 } }), /elevation/);
});

// ---- every fixture renders clean -----------------------------------------------------------

for (const file of readdirSync(fixturesDir).filter((f) => f.endsWith(".json"))) {
  test(`fixture ${file} expands, validates and renders with no check failing`, async () => {
    const input = fixture(file.replace(/\.json$/, ""));
    validateSpaceInput(input as unknown as Record<string, unknown>);
    const result = await render(expandSpace(input), { raster: false });
    const failing = result.manifest.checks.filter((c) => c.status === "fail");
    assert.deepEqual(
      failing.map((c) => `${c.id} [${c.target}] ${c.detail ?? ""}`),
      [],
    );
  });
}

test("the same figure under another camera moves every point by that camera's own projection", () => {
  const input: SpaceInput = { points: [{ name: "P", at: [2, 3, 4] }] };
  const a = marks({ ...input, camera: "cavalier" }).find((m) => m.id === "pt-0")!;
  const b = marks({ ...input, camera: "isometric" }).find((m) => m.id === "pt-0")!;
  assert.notDeepEqual(a.from, b.from);
  // And the page offset from the origin is the camera's projection, scaled.
  const pc = project(cavalierCamera(), [2, 3, 4]);
  assert.ok(pc[0] > 0 && pc[1] > 0);
});
