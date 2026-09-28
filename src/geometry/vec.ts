/**
 * Vector algebra shared by every construction that reasons in R² or R³.
 *
 * Phase 3 (`docs/PLAN-COVERAGE.md`) needs two things next: a ruler-and-compass
 * 2D construction kernel (Geometria Plana loci -- intersections, feet of
 * perpendiculars, bisectors, the circle through three points) and a R³
 * projection for Geometria Analítica and school solids (lines, planes, their
 * relative positions). Both are the SAME algebra -- add, scale, dot, a
 * length, an angle between two directions -- differing only in how many
 * components a tuple has. Writing it twice (as ADR 0032's vectors preset did,
 * for R² alone) would let the two copies drift the moment one of them fixed
 * a rounding edge the other still has. So there is ONE implementation here,
 * generic over `Vec2 | Vec3`, and the two callers reuse it rather than
 * restate it.
 *
 * `Vec2`/`Vec3` are plain readonly tuples, not classes: a construction is
 * data (an author's point, a computed intersection), not an object with
 * behaviour, and a tuple is what every other IR type in this project already
 * uses for a coordinate (`ir/types.ts`'s `Point`, `paths.ts`'s commands).
 *
 * ## The tolerance policy
 *
 * The project's standing rule (`math/numeric.ts`, ADR 0027) is that a number
 * which cannot be trusted is refused, never printed -- or here, never
 * returned as a silent `NaN` or an arbitrary tie-break. Every function that
 * can hit a genuine degenerate case (a zero vector, two coincident points,
 * three collinear points, two parallel lines) either throws `GeometryError`
 * naming exactly what degenerated, or -- where the degenerate case is itself
 * a meaningful answer, such as "these two lines are parallel" -- returns a
 * named outcome (`{ kind: "parallel" }`) instead of a point full of `NaN`.
 * A caller that forgets to check `kind` gets a type error, not a figure that
 * silently draws garbage at the origin.
 *
 * Every check here is **scale-invariant**, because the same algebra draws a
 * unit circle and a ramp fifty metres long, and one absolute tolerance
 * cannot be right for both:
 *
 *  - **Direction comparisons** (parallel? collinear? coplanar?) compare the
 *    SINE of the angle between two directions -- `|cross| / (|a| · |b|)` in
 *    2D, `|cross3| / (|a| · |b|)` in 3D -- against `tolerance` directly.
 *    That ratio is dimensionless and independent of how long the vectors
 *    happen to be, so `tolerance = 1e-9` means "within about 1e-9 radian of
 *    parallel" whether the vectors are 1 unit or 1e6 units long.
 *  - **Incidence comparisons** (is this point ON that line/plane? are two
 *    points the same point?) compare a distance against
 *    `tolerance · max(1, |coordinates involved|)` -- the same "relative
 *    unless the numbers are small" shape `locale/format.ts`'s `snapExact`
 *    already uses for snapping a computed value to an exact one.
 *
 * `DEFAULT_TOLERANCE` (`1e-9`) is tight enough for values that came from
 * exact arithmetic or from `math/numeric.ts` at its own default precision.
 * A caller classifying a construction drawn from ROUNDED input (a problem
 * statement that says "37°", already rounded before it reached here) should
 * pass a looser one explicitly -- the tolerance is always a parameter, never
 * a hidden constant a caller cannot see.
 *
 * ## Degenerate outcomes named in this file
 *
 * `parallel`, `coincident` (2D lines); `none`, `tangent`, `two` (line/circle
 * and circle/circle intersections); `parallel`, `contained` (3D line vs
 * plane); `parallel`, `coincident` (3D plane vs plane); `concorrentes`,
 * `paralelas`, `coincidentes`, `reversas` (relative position of two 3D
 * lines, named in Portuguese because that is the vocabulary the Geometria
 * Analítica course this feeds uses and a translated label would not match
 * the exercise text a sheet quotes).
 */

import { snapExact, writeExact, type Exact, type Locale } from "../locale/format.ts";

/** A degenerate input -- a zero vector, coincident points, collinear points, an under-determined system -- refused rather than answered with `NaN`. */
export class GeometryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeometryError";
  }
}

// --- types -------------------------------------------------------------

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
/** Either dimension the shared algebra below is generic over. */
export type Vec = Vec2 | Vec3;

/** See the file header: `1e-9` unless a caller states its own input is coarser. */
export const DEFAULT_TOLERANCE = 1e-9;

// --- shared algebra ------------------------------------------------------

function combine<V extends Vec>(a: V, b: V, f: (x: number, y: number) => number): V {
  return a.map((x, i) => f(x, b[i])) as unknown as V;
}

function apply<V extends Vec>(a: V, f: (x: number) => number): V {
  return a.map(f) as unknown as V;
}

/** The largest coordinate magnitude among the given vectors, floored at 1 -- the scale a relative (incidence) tolerance is measured against. */
function extentOf(...vs: readonly Vec[]): number {
  let m = 1;
  for (const v of vs) for (const c of v) if (Math.abs(c) > m) m = Math.abs(c);
  return m;
}

export function add<V extends Vec>(a: V, b: V): V {
  return combine(a, b, (x, y) => x + y);
}

export function sub<V extends Vec>(a: V, b: V): V {
  return combine(a, b, (x, y) => x - y);
}

export function scale<V extends Vec>(v: V, k: number): V {
  return apply(v, (x) => x * k);
}

export function dot<V extends Vec>(a: V, b: V): number {
  return a.reduce((sum, x, i) => sum + x * b[i], 0);
}

/** The scalar "cross product" of two 2D vectors -- `a.x·b.y − a.y·b.x`, the signed area of the parallelogram they span. */
export function cross2(a: Vec2, b: Vec2): number {
  return a[0] * b[1] - a[1] * b[0];
}

/** The 3D cross product: perpendicular to both, magnitude the area of the parallelogram they span. */
export function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function lengthSquared<V extends Vec>(v: V): number {
  return dot(v, v);
}

export function length<V extends Vec>(v: V): number {
  return Math.sqrt(lengthSquared(v));
}

export function distance<V extends Vec>(a: V, b: V): number {
  return length(sub(a, b));
}

/** `a + t·(b − a)`; `t = 0` gives `a`, `t = 1` gives `b`, and `t` outside `[0, 1]` extrapolates past either end. */
export function lerp<V extends Vec>(a: V, b: V, t: number): V {
  return add(a, scale(sub(b, a), t));
}

/** `v` scaled to unit length. Refuses the zero vector -- a direction it does not have. */
export function normalize<V extends Vec>(v: V, tolerance = DEFAULT_TOLERANCE): V {
  const len = length(v);
  if (len <= tolerance) {
    throw new GeometryError(`normalize: the zero vector has no direction (length ${len}).`);
  }
  return scale(v, 1 / len);
}

/** Rotates a 2D vector 90° counter-clockwise: `(x, y) → (−y, x)`. The one dimension-specific primitive here, since "perpendicular to a single vector" is not a well-defined operation in R³ (a whole plane of vectors qualifies). */
export function perpendicular2(v: Vec2): Vec2 {
  return [-v[1], v[0]];
}

/**
 * The angle between `a` and `b`, in radians, `[0, π]`. Refuses either input
 * being the zero vector -- undirected, so no angle. `cos` is clamped to
 * `[-1, 1]` before `acos` so that floating-point rounding on two nearly
 * (anti)parallel vectors never hands `acos` a value just outside its domain,
 * which would otherwise return `NaN` instead of the ~0 or ~π the geometry
 * actually calls for.
 */
export function angleBetween<V extends Vec>(a: V, b: V, tolerance = DEFAULT_TOLERANCE): number {
  const la = length(a);
  const lb = length(b);
  if (la <= tolerance || lb <= tolerance) {
    throw new GeometryError("angleBetween: the zero vector has no angle to anything.");
  }
  const cos = Math.min(1, Math.max(-1, dot(a, b) / (la * lb)));
  return Math.acos(cos);
}

/** The vector projection of `u` onto `v`: `(u·v / v·v) · v`. Refuses `v` being the zero vector -- there is no direction to project onto. */
export function projection<V extends Vec>(u: V, v: V, tolerance = DEFAULT_TOLERANCE): V {
  const lv = length(v);
  if (lv <= tolerance) {
    throw new GeometryError("projection: cannot project onto the zero vector.");
  }
  return scale(v, dot(u, v) / (lv * lv));
}

/** Whether `a` and `b` are the same point/vector within a tolerance relative to their own coordinates -- `distance(a, b) ≤ tolerance · max(1, |coordinates|)`, the same shape `locale/format.ts`'s `snapExact` uses. */
export function approxEqual<V extends Vec>(a: V, b: V, tolerance = DEFAULT_TOLERANCE): boolean {
  return distance(a, b) <= tolerance * extentOf(a, b);
}

/** Sine of the angle between two nonzero 2D directions: `0` when parallel, `1` when perpendicular. Used by every 2D "are these parallel" test, since it is dimensionless (scale-invariant) unlike the raw cross product. */
function sinAngle2(a: Vec2, b: Vec2): number {
  return Math.abs(cross2(a, b)) / (length(a) * length(b));
}

/** Sine of the angle between two nonzero 3D directions. */
function sinAngle3(a: Vec3, b: Vec3): number {
  return length(cross3(a, b)) / (length(a) * length(b));
}

// --- exactness helpers (reuse locale/format.ts, ADR 0040 -- do not re-snap) ---

/** Each coordinate of `v` snapped to its exact form (`locale/format.ts`'s `snapExact`) -- what a printer wants for a computed point's label, one component at a time. */
export function snapVec<V extends Vec>(v: V, tolerance = DEFAULT_TOLERANCE): Exact[] {
  return v.map((c) => snapExact(c, tolerance));
}

/** `v` written the way a reader sees a point: `"(2; 5)"`, `"(1/2; √3; 0)"` -- each coordinate through `snapExact`/`writeExact`, joined the way `locale/format.ts` joins coordinate pairs. */
export function writeVec<V extends Vec>(v: V, locale: Locale = "pt-BR", tolerance = DEFAULT_TOLERANCE): string {
  return `(${snapVec(v, tolerance)
    .map((e) => writeExact(e, locale))
    .join("; ")})`;
}

// =========================================================================
// 2D construction kernel
// =========================================================================

/** An infinite line, given by one point on it and a (not necessarily unit) direction. */
export interface Line2 {
  readonly point: Vec2;
  readonly direction: Vec2;
}

export interface Circle2 {
  readonly center: Vec2;
  readonly radius: number;
}

/** The line through `a` and `b`. Refuses coincident points -- infinitely many lines pass through one point. */
export function lineThrough2(a: Vec2, b: Vec2, tolerance = DEFAULT_TOLERANCE): Line2 {
  if (approxEqual(a, b, tolerance)) {
    throw new GeometryError(`lineThrough2: ${writeVec(a)} and ${writeVec(b)} coincide -- no single line is determined.`);
  }
  return { point: a, direction: sub(b, a) };
}

/** The perpendicular distance from `point` to `line`. */
export function distancePointToLine2(point: Vec2, line: Line2): number {
  return Math.abs(cross2(line.direction, sub(point, line.point))) / length(line.direction);
}

/** The foot of the perpendicular from `point` onto `line` -- the closest point on `line` to `point`. */
export function footOfPerpendicular2(point: Vec2, line: Line2): Vec2 {
  const t = dot(sub(point, line.point), line.direction) / lengthSquared(line.direction);
  return add(line.point, scale(line.direction, t));
}

/** The perpendicular bisector of segment `ab`: the line through its midpoint, perpendicular to `ab`. Refuses coincident points, same as `lineThrough2`. */
export function perpendicularBisector2(a: Vec2, b: Vec2, tolerance = DEFAULT_TOLERANCE): Line2 {
  if (approxEqual(a, b, tolerance)) {
    throw new GeometryError(`perpendicularBisector2: ${writeVec(a)} and ${writeVec(b)} coincide -- no segment to bisect.`);
  }
  return { point: lerp(a, b, 0.5), direction: perpendicular2(sub(b, a)) };
}

export type LineIntersection2 =
  | { readonly kind: "point"; readonly point: Vec2 }
  | { readonly kind: "parallel" }
  | { readonly kind: "coincident" };

/**
 * Where `l1` and `l2` meet. Never `NaN`: directions within `tolerance`
 * (as a sine) of parallel are classified explicitly, distinguishing truly
 * parallel lines from the same line stated twice by checking whether `l2`'s
 * point lies on `l1`.
 */
export function intersectLines2(l1: Line2, l2: Line2, tolerance = DEFAULT_TOLERANCE): LineIntersection2 {
  if (sinAngle2(l1.direction, l2.direction) <= tolerance) {
    return distancePointToLine2(l2.point, l1) <= tolerance * extentOf(l1.point, l2.point)
      ? { kind: "coincident" }
      : { kind: "parallel" };
  }
  const d = cross2(l1.direction, l2.direction);
  const t = cross2(sub(l2.point, l1.point), l2.direction) / d;
  return { kind: "point", point: add(l1.point, scale(l1.direction, t)) };
}

/**
 * The two perpendicular angle bisectors at the point where `l1` and `l2`
 * meet, or the single bisector midway between them when they are parallel.
 * Undirected lines have TWO bisectors of their four angles (perpendicular
 * to each other) when they meet, computed as the sum and the difference of
 * each line's own unit direction -- the standard construction, valid
 * because the lines are not parallel in that branch so neither sum nor
 * difference can vanish.
 */
export type AngleBisectors2 =
  | { readonly kind: "pair"; readonly bisectors: readonly [Line2, Line2] }
  | { readonly kind: "parallel"; readonly bisector: Line2 }
  | { readonly kind: "coincident" };

export function angleBisectors2(l1: Line2, l2: Line2, tolerance = DEFAULT_TOLERANCE): AngleBisectors2 {
  const meet = intersectLines2(l1, l2, tolerance);
  if (meet.kind === "coincident") return { kind: "coincident" };
  if (meet.kind === "parallel") {
    const p1 = l1.point;
    const p2 = footOfPerpendicular2(p1, l2);
    return { kind: "parallel", bisector: { point: lerp(p1, p2, 0.5), direction: l1.direction } };
  }
  const u1 = normalize(l1.direction, tolerance);
  const u2 = normalize(l2.direction, tolerance);
  const d1 = normalize(add(u1, u2), tolerance);
  const d2 = normalize(sub(u1, u2), tolerance);
  return {
    kind: "pair",
    bisectors: [
      { point: meet.point, direction: d1 },
      { point: meet.point, direction: d2 },
    ],
  };
}

export type LineCircleIntersection2 =
  | { readonly kind: "none" }
  | { readonly kind: "tangent"; readonly point: Vec2 }
  | { readonly kind: "two"; readonly points: readonly [Vec2, Vec2] };

/**
 * Where `line` meets `circle`. The `"two"` case orders its points
 * lexicographically (by `x`, then by `y`) -- an arbitrary but FIXED rule, so
 * a caller and a test that both call this function agree on which point is
 * "first" without depending on the sign of a perpendicular offset that
 * floating point could flip. Every multi-point result in this module
 * (`intersectCircles2` included) uses the same rule.
 */
export function intersectLineCircle2(line: Line2, circle: Circle2, tolerance = DEFAULT_TOLERANCE): LineCircleIntersection2 {
  const u = normalize(line.direction, tolerance);
  const toCenter = sub(circle.center, line.point);
  const tClosest = dot(toCenter, u);
  const closest = add(line.point, scale(u, tClosest));
  const offset = distance(closest, circle.center);
  const scaleAmount = extentOf([circle.radius, circle.radius] as Vec2, circle.center, line.point);
  const slack = tolerance * scaleAmount;

  if (offset > circle.radius + slack) return { kind: "none" };
  if (offset >= circle.radius - slack) return { kind: "tangent", point: closest };

  const half = Math.sqrt(circle.radius * circle.radius - offset * offset);
  const p1 = add(closest, scale(u, -half));
  const p2 = add(closest, scale(u, half));
  return { kind: "two", points: orderLex2(p1, p2) };
}

export type CircleCircleIntersection2 =
  | { readonly kind: "none" }
  | { readonly kind: "coincident" }
  | { readonly kind: "tangent"; readonly point: Vec2 }
  | { readonly kind: "two"; readonly points: readonly [Vec2, Vec2] };

/** Where `c1` and `c2` meet, same ordering rule as `intersectLineCircle2`. */
export function intersectCircles2(c1: Circle2, c2: Circle2, tolerance = DEFAULT_TOLERANCE): CircleCircleIntersection2 {
  const scaleAmount = extentOf(c1.center, c2.center, [c1.radius, c1.radius] as Vec2, [c2.radius, c2.radius] as Vec2);
  const slack = tolerance * scaleAmount;
  const d = distance(c1.center, c2.center);

  if (d <= slack && Math.abs(c1.radius - c2.radius) <= slack) return { kind: "coincident" };
  if (d > c1.radius + c2.radius + slack) return { kind: "none" };
  if (d < Math.abs(c1.radius - c2.radius) - slack) return { kind: "none" };

  // Standard two-circle-intersection construction: `a` is the distance from
  // c1's centre to the radical line along the centre-to-centre axis.
  const a = (d * d + c1.radius * c1.radius - c2.radius * c2.radius) / (2 * d);
  const h2 = c1.radius * c1.radius - a * a;

  const axis = normalize(sub(c2.center, c1.center), tolerance);
  const perp = perpendicular2(axis);
  const base = add(c1.center, scale(axis, a));

  if (h2 <= slack * slack) return { kind: "tangent", point: base };

  const h = Math.sqrt(Math.max(0, h2));
  const p1 = add(base, scale(perp, -h));
  const p2 = add(base, scale(perp, h));
  return { kind: "two", points: orderLex2(p1, p2) };
}

function orderLex2(p1: Vec2, p2: Vec2): readonly [Vec2, Vec2] {
  return p1[0] < p2[0] || (p1[0] === p2[0] && p1[1] <= p2[1]) ? [p1, p2] : [p2, p1];
}

/** The circle through `a`, `b` and `c`. Refuses three collinear points -- no circle passes through all of them (or infinitely many lines do, never a circle). */
export function circleThroughThreePoints2(a: Vec2, b: Vec2, c: Vec2, tolerance = DEFAULT_TOLERANCE): Circle2 {
  if (sinAngle2(sub(b, a), sub(c, a)) <= tolerance) {
    throw new GeometryError(`circleThroughThreePoints2: ${writeVec(a)}, ${writeVec(b)}, ${writeVec(c)} are collinear -- no circle passes through all three.`);
  }
  const bisAB = perpendicularBisector2(a, b, tolerance);
  const bisBC = perpendicularBisector2(b, c, tolerance);
  const meet = intersectLines2(bisAB, bisBC, tolerance);
  if (meet.kind !== "point") {
    throw new GeometryError("circleThroughThreePoints2: unreachable -- non-collinear points give non-parallel bisectors.");
  }
  return { center: meet.point, radius: distance(meet.point, a) };
}

// =========================================================================
// 3D analytic geometry (Geometria Analítica)
// =========================================================================

export interface Line3 {
  readonly point: Vec3;
  readonly direction: Vec3;
}

/** A plane given by a point on it and its (not necessarily unit) normal. */
export interface Plane3 {
  readonly point: Vec3;
  readonly normal: Vec3;
}

export function lineThrough3(a: Vec3, b: Vec3, tolerance = DEFAULT_TOLERANCE): Line3 {
  if (approxEqual(a, b, tolerance)) {
    throw new GeometryError(`lineThrough3: ${writeVec(a)} and ${writeVec(b)} coincide -- no single line is determined.`);
  }
  return { point: a, direction: sub(b, a) };
}

/** A line through `point` in `direction`. Refuses the zero direction. */
export function lineFromPointDirection3(point: Vec3, direction: Vec3, tolerance = DEFAULT_TOLERANCE): Line3 {
  if (length(direction) <= tolerance) {
    throw new GeometryError("lineFromPointDirection3: the zero vector is not a direction.");
  }
  return { point, direction };
}

/** A plane through `point` with the given `normal`. Refuses the zero normal. */
export function planeFromPointNormal3(point: Vec3, normal: Vec3, tolerance = DEFAULT_TOLERANCE): Plane3 {
  if (length(normal) <= tolerance) {
    throw new GeometryError("planeFromPointNormal3: the zero vector is not a normal.");
  }
  return { point, normal };
}

/** The unit normal of the plane through `a`, `b`, `c` -- `cross3(b−a, c−a)` normalized. Refuses collinear points, since they determine no plane (or every plane through the line). */
export function normalOfThreePoints3(a: Vec3, b: Vec3, c: Vec3, tolerance = DEFAULT_TOLERANCE): Vec3 {
  const n = cross3(sub(b, a), sub(c, a));
  if (length(n) <= tolerance * extentOf(sub(b, a), sub(c, a))) {
    throw new GeometryError(`normalOfThreePoints3: ${writeVec(a)}, ${writeVec(b)}, ${writeVec(c)} are collinear -- no plane normal is determined.`);
  }
  return normalize(n, tolerance);
}

/** The plane through three non-collinear points. */
export function planeFromThreePoints3(a: Vec3, b: Vec3, c: Vec3, tolerance = DEFAULT_TOLERANCE): Plane3 {
  return { point: a, normal: normalOfThreePoints3(a, b, c, tolerance) };
}

/** The plane `ax + by + cz + d = 0`. Refuses `(a, b, c) = (0, 0, 0)`, which is not a plane. */
export function planeFromEquation3(a: number, b: number, c: number, d: number, tolerance = DEFAULT_TOLERANCE): Plane3 {
  const normal: Vec3 = [a, b, c];
  if (length(normal) <= tolerance) {
    throw new GeometryError(`planeFromEquation3: (a, b, c) = (0, 0, 0) is not a plane's normal.`);
  }
  // Any point solving n·p = −d: pick the component of largest magnitude to
  // divide by, so a plane like x = 5 (b = c = 0) does not divide by zero.
  const i = Math.abs(a) >= Math.abs(b) && Math.abs(a) >= Math.abs(c) ? 0 : Math.abs(b) >= Math.abs(c) ? 1 : 2;
  const point: [number, number, number] = [0, 0, 0];
  point[i] = -d / normal[i];
  return { point, normal };
}

/** `{a, b, c, d}` such that `ax + by + cz + d = 0` describes `plane` -- the inverse of `planeFromEquation3`. */
export function planeEquation3(plane: Plane3): { readonly a: number; readonly b: number; readonly c: number; readonly d: number } {
  const [a, b, c] = plane.normal;
  return { a, b, c, d: -dot(plane.normal, plane.point) };
}

export function distancePointToPlane3(point: Vec3, plane: Plane3): number {
  return Math.abs(dot(plane.normal, sub(point, plane.point))) / length(plane.normal);
}

export function distancePointToLine3(point: Vec3, line: Line3): number {
  return length(cross3(sub(point, line.point), line.direction)) / length(line.direction);
}

function assertNonZero(v: Vec3, tolerance: number, where: string): void {
  if (length(v) <= tolerance) throw new GeometryError(`${where}: the zero vector has no direction/normal.`);
}

/** The acute angle between two lines' directions, `[0, π/2]` -- a line is undirected, so the obtuse alternative and its supplement are the same geometric angle and the acute one is the one reported. */
export function angleBetweenLines3(l1: Line3, l2: Line3, tolerance = DEFAULT_TOLERANCE): number {
  assertNonZero(l1.direction, tolerance, "angleBetweenLines3");
  assertNonZero(l2.direction, tolerance, "angleBetweenLines3");
  const cos = Math.min(1, Math.abs(dot(l1.direction, l2.direction)) / (length(l1.direction) * length(l2.direction)));
  return Math.acos(cos);
}

/** The angle between `line` and `plane`, `[0, π/2]` -- 90° minus the angle between the line's direction and the plane's normal. */
export function angleLinePlane3(line: Line3, plane: Plane3, tolerance = DEFAULT_TOLERANCE): number {
  assertNonZero(line.direction, tolerance, "angleLinePlane3");
  assertNonZero(plane.normal, tolerance, "angleLinePlane3");
  const sin = Math.min(1, Math.abs(dot(line.direction, plane.normal)) / (length(line.direction) * length(plane.normal)));
  return Math.asin(sin);
}

/** The acute angle between two planes -- the angle between their normals, folded into `[0, π/2]` the same way as `angleBetweenLines3`. */
export function angleBetweenPlanes3(p1: Plane3, p2: Plane3, tolerance = DEFAULT_TOLERANCE): number {
  assertNonZero(p1.normal, tolerance, "angleBetweenPlanes3");
  assertNonZero(p2.normal, tolerance, "angleBetweenPlanes3");
  const cos = Math.min(1, Math.abs(dot(p1.normal, p2.normal)) / (length(p1.normal) * length(p2.normal)));
  return Math.acos(cos);
}

export type LinePlaneIntersection3 =
  | { readonly kind: "point"; readonly point: Vec3 }
  | { readonly kind: "parallel" }
  | { readonly kind: "contained" };

/** Where `line` meets `plane`. A direction within `tolerance` (as a sine) of lying IN the plane is classified as `"parallel"` unless the line's own point also lies on the plane, in which case the whole line does (`"contained"`). */
export function intersectLinePlane3(line: Line3, plane: Plane3, tolerance = DEFAULT_TOLERANCE): LinePlaneIntersection3 {
  const denom = dot(plane.normal, line.direction);
  const sin = Math.abs(denom) / (length(plane.normal) * length(line.direction));
  if (sin <= tolerance) {
    const onPlane = distancePointToPlane3(line.point, plane) <= tolerance * extentOf(line.point, plane.point);
    return onPlane ? { kind: "contained" } : { kind: "parallel" };
  }
  const t = dot(plane.normal, sub(plane.point, line.point)) / denom;
  return { kind: "point", point: add(line.point, scale(line.direction, t)) };
}

export type PlanePlaneIntersection3 =
  | { readonly kind: "line"; readonly line: Line3 }
  | { readonly kind: "parallel" }
  | { readonly kind: "coincident" };

/**
 * Where `p1` and `p2` meet -- a line, unless their normals are within
 * `tolerance` of parallel, in which case they are the same plane or two
 * distinct parallel ones. The intersection point used to anchor the
 * returned line is the standard two-plane solve: writing it as
 * `a·n1 + b·n2` (never needing the direction `n1×n2` itself, since a
 * component along that direction would not change which line it is) and
 * solving the 2×2 system `nᵢ·(a·n1+b·n2) = dᵢ` for `a, b`.
 */
export function intersectPlanes3(p1: Plane3, p2: Plane3, tolerance = DEFAULT_TOLERANCE): PlanePlaneIntersection3 {
  const n1 = p1.normal;
  const n2 = p2.normal;
  const direction = cross3(n1, n2);
  if (length(direction) <= tolerance * length(n1) * length(n2)) {
    const onPlane = distancePointToPlane3(p2.point, p1) <= tolerance * extentOf(p1.point, p2.point);
    return onPlane ? { kind: "coincident" } : { kind: "parallel" };
  }

  const n1n1 = dot(n1, n1);
  const n1n2 = dot(n1, n2);
  const n2n2 = dot(n2, n2);
  const d1 = dot(n1, p1.point);
  const d2 = dot(n2, p2.point);
  const det = n1n1 * n2n2 - n1n2 * n1n2; // = |direction|^2, nonzero here
  const a = (d1 * n2n2 - d2 * n1n2) / det;
  const b = (d2 * n1n1 - d1 * n1n2) / det;
  const point = add(scale(n1, a), scale(n2, b));
  return { kind: "line", line: { point, direction } };
}

export type LinePosition3 =
  | { readonly kind: "coincidentes" }
  | { readonly kind: "paralelas" }
  | { readonly kind: "concorrentes"; readonly point: Vec3 }
  | { readonly kind: "reversas" };

/**
 * The relative position of two 3D lines: the same classification a
 * Geometria Analítica course makes, named in the vocabulary its exercises
 * use (see the file header). Parallel directions are split into
 * `coincidentes`/`paralelas` by whether `l2`'s point lies on `l1`.
 * Non-parallel directions are split into `concorrentes` (meet at a point)
 * and `reversas` (skew, never meet) by the scalar triple product
 * `direction1 · (direction2 × (l2.point − l1.point))`, normalized by the
 * product of the three vectors' lengths so the test is the sine of the
 * angle between `l2.point − l1.point` and the plane the two directions
 * span -- zero exactly when the four points/directions are coplanar.
 */
export function relativePosition3(l1: Line3, l2: Line3, tolerance = DEFAULT_TOLERANCE): LinePosition3 {
  const d1 = l1.direction;
  const d2 = l2.direction;
  if (sinAngle3(d1, d2) <= tolerance) {
    const onLine = distancePointToLine3(l2.point, l1) <= tolerance * extentOf(l1.point, l2.point);
    return onLine ? { kind: "coincidentes" } : { kind: "paralelas" };
  }

  const w0 = sub(l2.point, l1.point);
  const n = cross3(d1, d2);
  const triple = Math.abs(dot(n, w0));
  const scaleAmount = length(d1) * length(d2) * length(w0);
  if (scaleAmount > 0 && triple / scaleAmount > tolerance) {
    return { kind: "reversas" };
  }

  // Coplanar and non-parallel: the classic closest-point-between-two-lines
  // formula, whose denominator `a·c − b·b = |d1×d2|^2` is nonzero exactly
  // because the directions are not parallel in this branch.
  const a = dot(d1, d1);
  const b = dot(d1, d2);
  const c = dot(d2, d2);
  const w0neg = sub(l1.point, l2.point);
  const d = dot(d1, w0neg);
  const e = dot(d2, w0neg);
  const denom = a * c - b * b;
  const t = (b * e - c * d) / denom;
  return { kind: "concorrentes", point: add(l1.point, scale(d1, t)) };
}
