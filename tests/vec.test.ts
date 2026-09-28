/**
 * vec.ts: the shared 2D/3D vector algebra, its 2D construction kernel and
 * its 3D analytic-geometry primitives -- pinned against known answers, and
 * every degenerate case (coincident points, parallel/tangent/coincident
 * lines and circles, collinear points, concorrentes vs reversas) checked
 * for the named outcome rather than a thrown-away NaN.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  add,
  sub,
  scale,
  dot,
  cross2,
  cross3,
  length,
  lengthSquared,
  normalize,
  distance,
  lerp,
  angleBetween,
  projection,
  perpendicular2,
  approxEqual,
  GeometryError,
  lineThrough2,
  distancePointToLine2,
  footOfPerpendicular2,
  perpendicularBisector2,
  intersectLines2,
  angleBisectors2,
  intersectLineCircle2,
  intersectCircles2,
  circleThroughThreePoints2,
  lineThrough3,
  lineFromPointDirection3,
  planeFromPointNormal3,
  planeFromThreePoints3,
  planeFromEquation3,
  planeEquation3,
  normalOfThreePoints3,
  distancePointToPlane3,
  distancePointToLine3,
  angleBetweenLines3,
  angleLinePlane3,
  angleBetweenPlanes3,
  intersectLinePlane3,
  intersectPlanes3,
  relativePosition3,
  snapVec,
  writeVec,
  type Vec2,
  type Vec3,
} from "../src/geometry/vec.ts";

function close(a: number, b: number, tol = 1e-6): void {
  assert.ok(Math.abs(a - b) < tol, `expected ${a} ~= ${b}`);
}

function closeVec<V extends readonly number[]>(a: V, b: V, tol = 1e-6): void {
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i += 1) close(a[i], b[i], tol);
}

// =========================================================================
// shared algebra
// =========================================================================

test("add/sub: componentwise, both 2D and 3D", () => {
  closeVec(add([1, 2] as Vec2, [3, 4] as Vec2), [4, 6]);
  closeVec(sub([1, 2] as Vec2, [3, 4] as Vec2), [-2, -2]);
  closeVec(add([1, 2, 3] as Vec3, [4, 5, 6] as Vec3), [5, 7, 9]);
  closeVec(sub([1, 2, 3] as Vec3, [4, 5, 6] as Vec3), [-3, -3, -3]);
});

test("scale: multiplies every component", () => {
  closeVec(scale([1, -2] as Vec2, 3), [3, -6]);
  closeVec(scale([1, -2, 3] as Vec3, -2), [-2, 4, -6]);
});

test("dot: 2D and 3D", () => {
  close(dot([1, 2] as Vec2, [3, 4] as Vec2), 11);
  close(dot([1, 0, 0] as Vec3, [0, 1, 0] as Vec3), 0);
  close(dot([1, 2, 3] as Vec3, [4, 5, 6] as Vec3), 32);
});

test("cross2: signed area of the parallelogram", () => {
  close(cross2([1, 0], [0, 1]), 1);
  close(cross2([0, 1], [1, 0]), -1);
  close(cross2([2, 0], [4, 0]), 0);
});

test("cross3: perpendicular to both, right-handed", () => {
  closeVec(cross3([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  closeVec(cross3([0, 1, 0], [1, 0, 0]), [0, 0, -1]);
});

test("length/lengthSquared: 3-4-5 and its 3D analogue", () => {
  close(length([3, 4] as Vec2), 5);
  close(lengthSquared([3, 4] as Vec2), 25);
  close(length([1, 2, 2] as Vec3), 3);
});

test("normalize: unit length, same direction", () => {
  const n = normalize([3, 4] as Vec2);
  close(length(n), 1);
  close(n[0], 0.6);
  close(n[1], 0.8);
});

test("normalize: refuses the zero vector", () => {
  assert.throws(() => normalize([0, 0] as Vec2), GeometryError);
  assert.throws(() => normalize([0, 0, 0] as Vec3), GeometryError);
});

test("distance and lerp", () => {
  close(distance([0, 0] as Vec2, [3, 4] as Vec2), 5);
  closeVec(lerp([0, 0] as Vec2, [10, 20] as Vec2, 0.5), [5, 10]);
  closeVec(lerp([0, 0] as Vec2, [10, 20] as Vec2, 0), [0, 0]);
  closeVec(lerp([0, 0] as Vec2, [10, 20] as Vec2, 1), [10, 20]);
});

test("angleBetween: perpendicular is pi/2, same direction is 0, opposite is pi", () => {
  close(angleBetween([1, 0] as Vec2, [0, 1] as Vec2), Math.PI / 2);
  close(angleBetween([1, 0] as Vec2, [2, 0] as Vec2), 0);
  close(angleBetween([1, 0] as Vec2, [-1, 0] as Vec2), Math.PI);
});

test("angleBetween: refuses a zero vector", () => {
  assert.throws(() => angleBetween([0, 0] as Vec2, [1, 0] as Vec2), GeometryError);
});

test("angleBetween: does not NaN on a floating-point near-miss at the acos boundary", () => {
  // Two vectors that are nearly, but not exactly, antiparallel because of
  // float rounding in how they were built -- cos would land just past -1.
  const a: Vec2 = [1, 1e-16];
  const b: Vec2 = [-1, -1e-16];
  const theta = angleBetween(a, b);
  assert.ok(Number.isFinite(theta), `got ${theta}`);
  close(theta, Math.PI, 1e-6);
});

test("projection: onto an axis picks off that component", () => {
  closeVec(projection([3, 4] as Vec2, [1, 0] as Vec2), [3, 0]);
  closeVec(projection([3, 4] as Vec2, [0, 2] as Vec2), [0, 4]);
});

test("projection: refuses projecting onto the zero vector", () => {
  assert.throws(() => projection([1, 2] as Vec2, [0, 0] as Vec2), GeometryError);
});

test("perpendicular2: rotates 90 degrees counter-clockwise", () => {
  closeVec(perpendicular2([1, 0]), [0, 1]);
  closeVec(perpendicular2([0, 1]), [-1, 0]);
  close(dot(perpendicular2([3, -2]), [3, -2]), 0);
});

test("approxEqual: exact match, a tiny difference within tolerance, and a real difference", () => {
  assert.ok(approxEqual([1, 2] as Vec2, [1, 2] as Vec2));
  assert.ok(approxEqual([1, 2] as Vec2, [1 + 1e-12, 2] as Vec2));
  assert.ok(!approxEqual([1, 2] as Vec2, [1.01, 2] as Vec2));
  // Relative tolerance: the same absolute gap is within a looser tolerance
  // at large coordinates and rejected by the default at small ones.
  assert.ok(!approxEqual([1, 0] as Vec2, [1.0001, 0] as Vec2));
  assert.ok(approxEqual([1, 0] as Vec2, [1.0001, 0] as Vec2, 1e-4));
});

test("snapVec/writeVec: reuse locale/format's exact snapping, do not reimplement it", () => {
  const exact = snapVec([0.5, 2] as Vec2);
  assert.equal(exact[0].exact, true);
  assert.equal(exact[1].exact, true);
  // snapExact's "rational" form still prints through the plain decimal
  // formatter (locale/format.ts writes fractions only for sqrt/pi forms) --
  // this only proves vec.ts routes through it rather than rolling its own.
  assert.equal(writeVec([0.5, 2] as Vec2), "(0,5; 2)");
  assert.equal(writeVec([Math.sqrt(2), 3] as Vec2), "(√2; 3)");
});

// =========================================================================
// 2D construction kernel
// =========================================================================

test("lineThrough2: refuses coincident points", () => {
  assert.throws(() => lineThrough2([1, 1], [1, 1]), GeometryError);
});

test("distancePointToLine2 and footOfPerpendicular2", () => {
  const line = lineThrough2([0, 0], [1, 0]); // the x axis
  close(distancePointToLine2([5, 3], line), 3);
  closeVec(footOfPerpendicular2([5, 3], line), [5, 0]);
});

test("perpendicularBisector2: equidistant from both endpoints, perpendicular to the segment", () => {
  const bis = perpendicularBisector2([0, 0], [4, 0]);
  closeVec(bis.point, [2, 0]);
  close(dot(bis.direction, [4, 0]), 0);
});

test("perpendicularBisector2: refuses coincident points", () => {
  assert.throws(() => perpendicularBisector2([2, 2], [2, 2]), GeometryError);
});

test("intersectLines2: two lines crossing at a known point", () => {
  const l1 = lineThrough2([0, 0], [2, 2]); // y = x
  const l2 = lineThrough2([0, 4], [4, 0]); // y = 4 - x
  const r = intersectLines2(l1, l2);
  assert.equal(r.kind, "point");
  if (r.kind === "point") closeVec(r.point, [2, 2]);
});

test("intersectLines2: parallel lines are reported as parallel, not NaN", () => {
  const l1 = lineThrough2([0, 0], [1, 1]);
  const l2 = lineThrough2([0, 5], [1, 6]);
  assert.deepEqual(intersectLines2(l1, l2), { kind: "parallel" });
});

test("intersectLines2: the same line stated twice is coincident, not parallel", () => {
  const l1 = lineThrough2([0, 0], [2, 2]);
  const l2 = lineThrough2([1, 1], [3, 3]);
  assert.deepEqual(intersectLines2(l1, l2), { kind: "coincident" });
});

test("intersectLines2: nearly-parallel lines are classified by the stated tolerance, not by accident", () => {
  const l1 = lineThrough2([0, 0], [1, 0]);
  const l2 = lineThrough2([0, 1], [1, 1 + 1e-12]); // slope 1e-12, "almost" the x axis's direction
  // Tight tolerance: this is not parallel enough to ignore -- a real point.
  const tight = intersectLines2(l1, l2, 1e-15);
  assert.equal(tight.kind, "point");
  // Loose tolerance: the same pair reads as parallel.
  const loose = intersectLines2(l1, l2, 1e-6);
  assert.equal(loose.kind, "parallel");
});

test("angleBisectors2: perpendicular axes bisect into the diagonals", () => {
  const l1 = lineThrough2([0, 0], [1, 0]);
  const l2 = lineThrough2([0, 0], [0, 1]);
  const r = angleBisectors2(l1, l2);
  assert.equal(r.kind, "pair");
  if (r.kind === "pair") {
    const dirs = r.bisectors.map((b) => normalize(b.direction));
    const alongDiagonal = dirs.some((d) => Math.abs(Math.abs(d[0]) - Math.abs(d[1])) < 1e-6);
    assert.ok(alongDiagonal);
    close(dot(r.bisectors[0].direction, r.bisectors[1].direction), 0);
  }
});

test("angleBisectors2: parallel lines get one bisector, midway between them", () => {
  const l1 = lineThrough2([0, 0], [1, 0]);
  const l2 = lineThrough2([0, 4], [1, 4]);
  const r = angleBisectors2(l1, l2);
  assert.equal(r.kind, "parallel");
  if (r.kind === "parallel") close(r.bisector.point[1], 2);
});

test("angleBisectors2: coincident lines report coincident", () => {
  const l1 = lineThrough2([0, 0], [1, 1]);
  const l2 = lineThrough2([2, 2], [3, 3]);
  assert.deepEqual(angleBisectors2(l1, l2), { kind: "coincident" });
});

test("intersectLineCircle2: a diameter line hits at two ordered points", () => {
  const line = lineThrough2([-10, 0], [10, 0]);
  const circle = { center: [0, 0] as Vec2, radius: 5 };
  const r = intersectLineCircle2(line, circle);
  assert.equal(r.kind, "two");
  if (r.kind === "two") {
    closeVec(r.points[0], [-5, 0]);
    closeVec(r.points[1], [5, 0]);
    assert.ok(r.points[0][0] < r.points[1][0], "ordered lexicographically by x");
  }
});

test("intersectLineCircle2: a tangent line touches at exactly one point", () => {
  const line = lineThrough2([-5, 5], [5, 5]); // y = 5, tangent to the unit-radius-5 circle
  const circle = { center: [0, 0] as Vec2, radius: 5 };
  const r = intersectLineCircle2(line, circle);
  assert.equal(r.kind, "tangent");
  if (r.kind === "tangent") closeVec(r.point, [0, 5], 1e-4);
});

test("intersectLineCircle2: a line missing the circle entirely is none", () => {
  const line = lineThrough2([-5, 100], [5, 100]);
  const circle = { center: [0, 0] as Vec2, radius: 5 };
  assert.deepEqual(intersectLineCircle2(line, circle), { kind: "none" });
});

test("intersectCircles2: two circles crossing at two known points", () => {
  const c1 = { center: [0, 0] as Vec2, radius: 5 };
  const c2 = { center: [8, 0] as Vec2, radius: 5 };
  const r = intersectCircles2(c1, c2);
  assert.equal(r.kind, "two");
  if (r.kind === "two") {
    for (const p of r.points) {
      close(distance(p, c1.center), 5, 1e-4);
      close(distance(p, c2.center), 5, 1e-4);
    }
    assert.ok(r.points[0][1] <= r.points[1][1] || r.points[0][0] < r.points[1][0]);
  }
});

test("intersectCircles2: externally tangent circles touch at one point", () => {
  const c1 = { center: [0, 0] as Vec2, radius: 3 };
  const c2 = { center: [10, 0] as Vec2, radius: 7 };
  const r = intersectCircles2(c1, c2);
  assert.equal(r.kind, "tangent");
  if (r.kind === "tangent") closeVec(r.point, [3, 0], 1e-4);
});

test("intersectCircles2: internally tangent circles (one inside the other, touching) report tangent too", () => {
  const c1 = { center: [0, 0] as Vec2, radius: 10 };
  const c2 = { center: [4, 0] as Vec2, radius: 6 };
  const r = intersectCircles2(c1, c2);
  assert.equal(r.kind, "tangent");
});

test("intersectCircles2: separate circles are none", () => {
  const c1 = { center: [0, 0] as Vec2, radius: 1 };
  const c2 = { center: [100, 0] as Vec2, radius: 1 };
  assert.deepEqual(intersectCircles2(c1, c2), { kind: "none" });
});

test("intersectCircles2: identical circles are coincident", () => {
  const c1 = { center: [1, 2] as Vec2, radius: 3 };
  const c2 = { center: [1, 2] as Vec2, radius: 3 };
  assert.deepEqual(intersectCircles2(c1, c2), { kind: "coincident" });
});

test("circleThroughThreePoints2: the circumcircle of a 3-4-5 right triangle", () => {
  const c = circleThroughThreePoints2([0, 0], [4, 0], [0, 3]);
  // Hypotenuse is the diameter of a right triangle's circumcircle.
  close(c.radius, 2.5);
  closeVec(c.center, [2, 1.5]);
});

test("circleThroughThreePoints2: refuses three collinear points", () => {
  assert.throws(() => circleThroughThreePoints2([0, 0], [1, 1], [2, 2]), GeometryError);
});

// =========================================================================
// 3D analytic geometry
// =========================================================================

test("lineThrough3/lineFromPointDirection3: refuse degenerate input", () => {
  assert.throws(() => lineThrough3([1, 1, 1], [1, 1, 1]), GeometryError);
  assert.throws(() => lineFromPointDirection3([0, 0, 0], [0, 0, 0]), GeometryError);
});

test("planeFromPointNormal3: refuses the zero normal", () => {
  assert.throws(() => planeFromPointNormal3([0, 0, 0], [0, 0, 0]), GeometryError);
});

test("normalOfThreePoints3: the xy plane's three points give the z axis", () => {
  const n = normalOfThreePoints3([0, 0, 0], [1, 0, 0], [0, 1, 0]);
  closeVec(n, [0, 0, 1]);
});

test("normalOfThreePoints3: refuses collinear points", () => {
  assert.throws(() => normalOfThreePoints3([0, 0, 0], [1, 1, 1], [2, 2, 2]), GeometryError);
});

test("planeFromThreePoints3 / planeFromEquation3 / planeEquation3 round-trip", () => {
  const plane = planeFromThreePoints3([1, 0, 0], [0, 1, 0], [0, 0, 1]); // x + y + z = 1
  const eq = planeEquation3(plane);
  // Normalize the equation so the round trip is comparable up to scale.
  const scaleFactor = eq.a;
  close(eq.b / scaleFactor, 1);
  close(eq.c / scaleFactor, 1);
  close(eq.d / scaleFactor, -1);

  const fromEq = planeFromEquation3(1, 1, 1, -1);
  close(distancePointToPlane3([1, 0, 0], fromEq), 0);
  close(distancePointToPlane3([0, 1, 0], fromEq), 0);
  close(distancePointToPlane3([0, 0, 1], fromEq), 0);
});

test("planeFromEquation3: refuses (a,b,c) = (0,0,0)", () => {
  assert.throws(() => planeFromEquation3(0, 0, 0, 5), GeometryError);
});

test("distancePointToPlane3 and distancePointToLine3", () => {
  const plane = planeFromPointNormal3([0, 0, 0], [0, 0, 1]); // the xy plane
  close(distancePointToPlane3([1, 2, 5], plane), 5);

  const line = lineFromPointDirection3([0, 0, 0], [1, 0, 0]); // the x axis
  close(distancePointToLine3([3, 4, 0], line), 4);
});

test("angleBetweenLines3: perpendicular axes", () => {
  const l1 = lineFromPointDirection3([0, 0, 0], [1, 0, 0]);
  const l2 = lineFromPointDirection3([1, 1, 1], [0, 1, 0]);
  close(angleBetweenLines3(l1, l2), Math.PI / 2);
});

test("angleBetweenLines3: reports the acute angle regardless of direction sign", () => {
  const l1 = lineFromPointDirection3([0, 0, 0], [1, 0, 0]);
  const l2 = lineFromPointDirection3([0, 0, 0], [-1, 1, 0]);
  close(angleBetweenLines3(l1, l2), Math.PI / 4);
});

test("angleLinePlane3: a line in the plane has angle 0, a line along the normal has angle pi/2", () => {
  const plane = planeFromPointNormal3([0, 0, 0], [0, 0, 1]);
  close(angleLinePlane3(lineFromPointDirection3([0, 0, 0], [1, 0, 0]), plane), 0);
  close(angleLinePlane3(lineFromPointDirection3([0, 0, 0], [0, 0, 1]), plane), Math.PI / 2);
});

test("angleBetweenPlanes3: the xy and xz planes meet at a right angle", () => {
  const xy = planeFromPointNormal3([0, 0, 0], [0, 0, 1]);
  const xz = planeFromPointNormal3([0, 0, 0], [0, 1, 0]);
  close(angleBetweenPlanes3(xy, xz), Math.PI / 2);
});

test("intersectLinePlane3: a line piercing a plane at a known point", () => {
  const plane = planeFromPointNormal3([0, 0, 0], [0, 0, 1]);
  const line = lineFromPointDirection3([0, 0, 5], [0, 0, -1]);
  const r = intersectLinePlane3(line, plane);
  assert.equal(r.kind, "point");
  if (r.kind === "point") closeVec(r.point, [0, 0, 0]);
});

test("intersectLinePlane3: a line parallel to the plane, not on it", () => {
  const plane = planeFromPointNormal3([0, 0, 0], [0, 0, 1]);
  const line = lineFromPointDirection3([0, 0, 5], [1, 0, 0]);
  assert.deepEqual(intersectLinePlane3(line, plane), { kind: "parallel" });
});

test("intersectLinePlane3: a line lying in the plane is contained, not parallel", () => {
  const plane = planeFromPointNormal3([0, 0, 0], [0, 0, 1]);
  const line = lineFromPointDirection3([1, 1, 0], [1, 0, 0]);
  assert.deepEqual(intersectLinePlane3(line, plane), { kind: "contained" });
});

test("intersectPlanes3: two planes meeting in a known line", () => {
  const xy = planeFromPointNormal3([0, 0, 0], [0, 0, 1]);
  const xz = planeFromPointNormal3([0, 0, 0], [0, 1, 0]);
  const r = intersectPlanes3(xy, xz);
  assert.equal(r.kind, "line");
  if (r.kind === "line") {
    closeVec(r.line.point, [0, 0, 0]);
    close(distancePointToLine3([5, 0, 0], r.line), 0);
  }
});

test("intersectPlanes3: distinct parallel planes", () => {
  const p1 = planeFromPointNormal3([0, 0, 0], [0, 0, 1]);
  const p2 = planeFromPointNormal3([0, 0, 7], [0, 0, 1]);
  assert.deepEqual(intersectPlanes3(p1, p2), { kind: "parallel" });
});

test("intersectPlanes3: the same plane stated twice is coincident", () => {
  const p1 = planeFromPointNormal3([0, 0, 0], [0, 0, 1]);
  const p2 = planeFromPointNormal3([3, 4, 0], [0, 0, 2]);
  assert.deepEqual(intersectPlanes3(p1, p2), { kind: "coincident" });
});

test("relativePosition3: concorrentes -- two lines crossing at a known point", () => {
  const l1 = lineFromPointDirection3([0, 0, 0], [1, 0, 0]);
  const l2 = lineFromPointDirection3([2, -2, 0], [0, 1, 0]);
  const r = relativePosition3(l1, l2);
  assert.equal(r.kind, "concorrentes");
  if (r.kind === "concorrentes") closeVec(r.point, [2, 0, 0]);
});

test("relativePosition3: paralelas -- same direction, different lines", () => {
  const l1 = lineFromPointDirection3([0, 0, 0], [1, 0, 0]);
  const l2 = lineFromPointDirection3([0, 5, 0], [2, 0, 0]);
  assert.deepEqual(relativePosition3(l1, l2), { kind: "paralelas" });
});

test("relativePosition3: coincidentes -- the same line described two different ways", () => {
  const l1 = lineFromPointDirection3([0, 0, 0], [1, 1, 1]);
  const l2 = lineFromPointDirection3([2, 2, 2], [-3, -3, -3]);
  assert.deepEqual(relativePosition3(l1, l2), { kind: "coincidentes" });
});

test("relativePosition3: reversas -- classic skew lines that share no plane", () => {
  const l1 = lineFromPointDirection3([0, 0, 0], [1, 0, 0]); // the x axis
  const l2 = lineFromPointDirection3([0, 0, 1], [0, 1, 0]); // parallel to y, lifted along z
  assert.deepEqual(relativePosition3(l1, l2), { kind: "reversas" });
});

test("relativePosition3: nearly parallel but not quite -- classified by the stated tolerance", () => {
  const l1 = lineFromPointDirection3([0, 0, 0], [1, 0, 0]);
  const l2 = lineFromPointDirection3([0, 5, 0], [1, 1e-12, 0]); // almost parallel, still coplanar (z=0)
  const tight = relativePosition3(l1, l2, 1e-15);
  assert.equal(tight.kind, "concorrentes");
  const loose = relativePosition3(l1, l2, 1e-6);
  assert.equal(loose.kind, "paralelas");
});
