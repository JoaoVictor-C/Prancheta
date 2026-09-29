/**
 * The geometry of a solid of revolution, pure and exported for tests
 * (ADR 0049).
 *
 * A plane region -- under y = f(x), or between two curves, on [a, b] -- is
 * turned about a horizontal line y = c or a vertical line x = c. Everything
 * here is derived from the region's expressions and the axis:
 *
 *  - **the meridian model.** Every boundary piece of the region (the two
 *    curves and the two side segments) is a profile curve u ↦ (s(u), ρ(u)):
 *    s along the axis, ρ its distance from it. Revolving the piece sweeps
 *    X(u, θ) = O + s·A + ρ·(cos θ·P + sin θ·Q), with (A, P, Q) a right-handed
 *    frame: A the axis, P the direction the region lies in, Q = A × P.
 *  - **the silhouette** is where the surface normal is perpendicular to the
 *    camera's `toward`. The normal of X is ρ'·A − s'·e(θ), so the condition
 *    is s'·(α cos θ + β sin θ) = ρ'·γ, with α = P·t, β = Q·t, γ = A·t.
 *    Writing α cos θ + β sin θ = R cos(θ − φ), each u has the two
 *    solutions θ = φ ± acos(ρ'γ / (s'R)) where that ratio is within ±1 and
 *    none elsewhere. This IS the envelope of the projected cross-section
 *    ellipses: at a silhouette point the tangent of the outline and the
 *    tangent of the cross-section's ellipse are the same page line (tested).
 *  - **visibility** is decided by casting the viewing ray from a point
 *    toward the reader and asking the solid's own membership test -- map a
 *    3D point back to (x, y) in the region's plane and test the region --
 *    whether the ray passes through the solid. That is exact for this one
 *    solid, holes and non-convex profiles included, up to the ray's step;
 *    nothing else in the figure is an occluder.
 *  - **volumes**: π∫(R² − r²) dx for discs and washers, 2π∫ρ·h dx for
 *    shells, by `numeric.integrate`; and the OTHER method, slicing along y,
 *    computed independently from the region's cross-sections at each
 *    height, which the tests hold equal to the first.
 */

import { integrate } from "../../math/numeric.ts";
import { add, cross3, dot, scale, sub } from "../../geometry/vec.ts";
import type { Vec2, Vec3 } from "../../geometry/vec.ts";
import { project, projectCircle } from "../../geometry/projection.ts";
import type { Camera, ProjectedCircle } from "../../geometry/projection.ts";

export type Fn = (x: number) => number;

/** A region between lo(x) and hi(x) (lo ≤ hi) on [a, b]. */
export interface Region {
  readonly lo: Fn;
  readonly hi: Fn;
  readonly a: number;
  readonly b: number;
}

/** Revolution about y = c ("h", a horizontal line) or x = c ("v", a vertical one). */
export interface Axis {
  readonly kind: "h" | "v";
  readonly c: number;
}

/**
 * The 3D model. The region lies in the plane X = 0 of R³ with the point
 * (x, y) at (0, x, y): x runs along world y, y along world z (up).
 * `side` is +1 when the region lies on the positive side of the axis (above
 * y = c, right of x = c), −1 otherwise.
 */
export interface Model {
  readonly region: Region;
  readonly axis: Axis;
  readonly side: 1 | -1;
  readonly O: Vec3;
  readonly A: Vec3;
  readonly P: Vec3;
  readonly Q: Vec3;
}

export function makeModel(region: Region, axis: Axis, side: 1 | -1): Model {
  const A: Vec3 = axis.kind === "h" ? [0, 1, 0] : [0, 0, 1];
  const P: Vec3 = axis.kind === "h" ? [0, 0, side] : [0, side, 0];
  const O: Vec3 = axis.kind === "h" ? [0, 0, axis.c] : [0, axis.c, 0];
  return { region, axis, side, O, A, P, Q: cross3(A, P) };
}

/** (s, ρ) of the region point (x, y): along the axis, and distance from it. */
export function meridian(m: Model, x: number, y: number): { s: number; rho: number } {
  return m.axis.kind === "h" ? { s: x, rho: m.side * (y - m.axis.c) } : { s: y, rho: m.side * (x - m.axis.c) };
}

/** The region point (x, y) of the meridian coordinates (s, ρ) on the region's side. */
export function planePoint(m: Model, s: number, rho: number): { x: number; y: number } {
  return m.axis.kind === "h" ? { x: s, y: m.axis.c + m.side * rho } : { x: m.axis.c + m.side * rho, y: s };
}

/** e(θ) = cos θ·P + sin θ·Q: θ = 0 is the region's own half-plane. */
export function radialDir(m: Model, theta: number): Vec3 {
  return add(scale(m.P, Math.cos(theta)), scale(m.Q, Math.sin(theta)));
}

/** The 3D point on the axis at s. */
export function axisPoint(m: Model, s: number): Vec3 {
  return add(m.O, scale(m.A, s));
}

/** The 3D point swept from (s, ρ) turned by θ. */
export function sweep(m: Model, s: number, rho: number, theta: number): Vec3 {
  return add(axisPoint(m, s), scale(radialDir(m, theta), rho));
}

/** The circle swept by the point at (s, ρ), as `projectCircle` draws it. */
export function crossSection(m: Model, camera: Camera, s: number, rho: number): ProjectedCircle {
  return projectCircle(camera, axisPoint(m, s), m.A, rho);
}

/** The parameter, in `projectCircle`'s own basis, at which the circle about `centre` passes through the 3D point `p`. */
export function circleParam(pc: ProjectedCircle, centre: Vec3, p: Vec3): number {
  const d = sub(p, centre);
  return Math.atan2(dot(d, pc.v), dot(d, pc.u));
}

// ---- the boundary pieces ------------------------------------------------------------

/** One boundary piece of the region, parameterised on [u0, u1]. */
export interface Piece {
  readonly id: "lower" | "upper" | "left" | "right";
  readonly u0: number;
  readonly u1: number;
  point(u: number): { x: number; y: number };
  /** d(x, y)/du, one-sided at the ends so a √ at its domain's edge is never sampled outside it. */
  velocity(u: number): { dx: number; dy: number };
}

function slope(fn: Fn, u: number, a: number, b: number): number {
  const h = 1e-6 * Math.max(1, Math.abs(u), b - a);
  if (u - h < a) return (fn(u + h) - fn(u)) / h;
  if (u + h > b) return (fn(u) - fn(u - h)) / h;
  return (fn(u + h) - fn(u - h)) / (2 * h);
}

/** The region's boundary: the two curves, and each side segment that has length. */
export function pieces(r: Region): Piece[] {
  const out: Piece[] = [
    { id: "lower", u0: r.a, u1: r.b, point: (u) => ({ x: u, y: r.lo(u) }), velocity: (u) => ({ dx: 1, dy: slope(r.lo, u, r.a, r.b) }) },
    { id: "upper", u0: r.a, u1: r.b, point: (u) => ({ x: u, y: r.hi(u) }), velocity: (u) => ({ dx: 1, dy: slope(r.hi, u, r.a, r.b) }) },
  ];
  const span = Math.max(1, r.b - r.a);
  for (const [id, x] of [["left", r.a], ["right", r.b]] as const) {
    const y0 = r.lo(x);
    const y1 = r.hi(x);
    if (y1 - y0 > 1e-9 * span) out.push({ id, u0: y0, u1: y1, point: (u) => ({ x, y: u }), velocity: () => ({ dx: 0, dy: 1 }) });
  }
  return out;
}

// ---- the silhouette -------------------------------------------------------------------

export interface SilhouettePoint {
  readonly u: number;
  readonly s: number;
  readonly rho: number;
  readonly theta: number;
  readonly p3: Vec3;
}

/** The camera's view direction in the model's frame: α = P·t, β = Q·t, γ = A·t, and R, φ with α cos θ + β sin θ = R cos(θ − φ). */
export function viewInFrame(m: Model, camera: Camera): { alpha: number; beta: number; gamma: number; R: number; phi: number } {
  const t = camera.toward;
  const alpha = dot(m.P, t);
  const beta = dot(m.Q, t);
  const gamma = dot(m.A, t);
  return { alpha, beta, gamma, R: Math.hypot(alpha, beta), phi: Math.atan2(beta, alpha) };
}

/** k(u) = ρ'γ / (s'R) for a piece: the silhouette exists at u exactly when |k| ≤ 1. */
export function silhouetteRatio(m: Model, camera: Camera, piece: Piece, u: number): number {
  const { gamma, R } = viewInFrame(m, camera);
  const { dx, dy } = piece.velocity(u);
  const ds = m.axis.kind === "h" ? dx : dy;
  const dr = m.side * (m.axis.kind === "h" ? dy : dx);
  const num = dr * gamma;
  const den = ds * R;
  if (!Number.isFinite(num) || !Number.isFinite(den)) return Infinity;
  if (Math.abs(den) < 1e-300) return num === 0 ? 0 : Infinity;
  return num / den;
}

/**
 * The silhouette of one boundary piece's surface, as polylines of 3D points.
 * Each maximal u-run on which |k(u)| ≤ 1 gives two branches, θ = φ ± acos k;
 * where a run stops inside the piece, its end is bisected to |k| = 1, where
 * the two branches meet (θ = φ or φ + π).
 */
export function silhouette(m: Model, camera: Camera, piece: Piece, samples = 360): SilhouettePoint[][] {
  const { phi } = viewInFrame(m, camera);
  const k = (u: number): number => silhouetteRatio(m, camera, piece, u);
  const at = (u: number, sign: 1 | -1): SilhouettePoint => {
    const { x, y } = piece.point(u);
    const { s, rho } = meridian(m, x, y);
    const kk = Math.max(-1, Math.min(1, k(u)));
    const theta = phi + sign * Math.acos(kk);
    return { u, s, rho, theta, p3: sweep(m, s, rho, theta) };
  };
  const us = Array.from({ length: samples + 1 }, (_, i) => piece.u0 + ((piece.u1 - piece.u0) * i) / samples);
  const ok = us.map((u) => Math.abs(k(u)) <= 1);
  const edge = (inside: number, outside: number): number => {
    let lo = us[inside]!;
    let hi = us[outside]!;
    for (let i = 0; i < 60; i += 1) {
      const mid = (lo + hi) / 2;
      if (Math.abs(k(mid)) <= 1) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  const out: SilhouettePoint[][] = [];
  let i = 0;
  while (i < us.length) {
    if (!ok[i]) {
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < us.length && ok[j + 1]) j += 1;
    const run: number[] = [];
    if (i > 0) run.push(edge(i, i - 1));
    for (let q = i; q <= j; q += 1) run.push(us[q]!);
    if (j < us.length - 1) run.push(edge(j, j + 1));
    if (run.length >= 2) {
      out.push(run.map((u) => at(u, 1)));
      out.push(run.map((u) => at(u, -1)));
    }
    i = j + 1;
  }
  // A point with no radius sweeps no circle: it is the axis, not an outline.
  return out.map((line) => line.filter((p) => p.rho > 1e-12)).filter((line) => line.length >= 2);
}

// ---- membership and visibility --------------------------------------------------

/** Is the 3D point strictly inside the solid (by more than `eps`, in region units)? */
export function insideSolid(m: Model, q: Vec3, eps: number): boolean {
  const d = sub(q, m.O);
  const s = dot(d, m.A);
  const w = sub(d, scale(m.A, s));
  const rho = Math.hypot(w[0], w[1], w[2]);
  const { x, y } = planePoint(m, s, rho);
  const r = m.region;
  if (!(x > r.a + eps && x < r.b - eps)) return false;
  return y > r.lo(x) + eps && y < r.hi(x) - eps;
}

/** The solid's largest radius. */
export function solidRadius(m: Model): number {
  let maxRho = 0;
  for (const pc of pieces(m.region)) {
    for (let i = 0; i <= 400; i += 1) {
      const { x, y } = pc.point(pc.u0 + ((pc.u1 - pc.u0) * i) / 400);
      maxRho = Math.max(maxRho, meridian(m, x, y).rho);
    }
  }
  return maxRho;
}

/** The solid's size: the larger of its length along the axis and its diameter. */
export function solidSize(m: Model): number {
  let maxRho = 0;
  let sMin = Infinity;
  let sMax = -Infinity;
  for (const pc of pieces(m.region)) {
    for (let i = 0; i <= 200; i += 1) {
      const { x, y } = pc.point(pc.u0 + ((pc.u1 - pc.u0) * i) / 200);
      const { s, rho } = meridian(m, x, y);
      maxRho = Math.max(maxRho, rho);
      sMin = Math.min(sMin, s);
      sMax = Math.max(sMax, s);
    }
  }
  return Math.max(sMax - sMin, 2 * maxRho, 1e-9);
}

/**
 * Is the point `p` (on or near the surface) seen by the reader? The ray
 * p + λ·toward is marched out past the solid; a sample strictly inside the
 * solid means something of it stands between p and the reader.
 */
export function visibleFrom(m: Model, camera: Camera, p: Vec3, size: number): boolean {
  const eps = 2e-5 * size;
  const step = size / 320;
  const reach = 2.5 * size;
  for (let lambda = 4e-4 * size; lambda <= reach; lambda += lambda < 20 * step ? step / 4 : step) {
    if (insideSolid(m, add(p, scale(camera.toward, lambda)), eps)) return false;
  }
  return true;
}

export type Run3 = { pts: Vec3[]; visible: boolean };

/**
 * A 3D polyline cut into visible and hidden runs, each sample classified by
 * `visibleFrom`. A single sample that disagrees with both neighbours is ray
 * noise at a grazing point, not a change, and takes their state.
 */
export function splitByVisibility(m: Model, camera: Camera, pts: Vec3[], size: number, closed = false): Run3[] {
  if (pts.length < 2) return [];
  const vis = pts.map((p) => visibleFrom(m, camera, p, size));
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < vis.length; i += 1) {
      const prev = i > 0 ? vis[i - 1] : closed ? vis[vis.length - 2] : undefined;
      const next = i < vis.length - 1 ? vis[i + 1] : closed ? vis[1] : undefined;
      if (prev !== undefined && next !== undefined && prev === next && vis[i] !== prev) vis[i] = prev;
    }
  }
  const runs: Run3[] = [];
  let cur: Run3 = { pts: [pts[0]!], visible: vis[0]! };
  for (let i = 1; i < pts.length; i += 1) {
    if (vis[i] === cur.visible) cur.pts.push(pts[i]!);
    else {
      // The boundary sample belongs to both runs, so they meet.
      cur.pts.push(pts[i]!);
      runs.push(cur);
      cur = { pts: [pts[i]!], visible: vis[i]! };
    }
  }
  runs.push(cur);
  if (closed && runs.length > 1 && runs[0]!.visible === runs[runs.length - 1]!.visible) {
    const first = runs.shift()!;
    runs[runs.length - 1]!.pts.push(...first.pts.slice(1));
  }
  return runs.filter((r) => r.pts.length >= 2);
}

/** The page image of a 3D polyline. */
// ---- volumes ------------------------------------------------------------------------

/** Outer and inner radius of the washer at x (axis y = c). */
export function washerRadii(m: Model, x: number): { R: number; r: number } {
  const c = m.axis.c;
  const u = Math.abs(m.region.hi(x) - c);
  const v = Math.abs(m.region.lo(x) - c);
  return { R: Math.max(u, v), r: Math.min(u, v) };
}

/** Shell radius and height at x (axis x = c). */
export function shellAt(m: Model, x: number): { radius: number; height: number } {
  return { radius: Math.abs(x - m.axis.c), height: m.region.hi(x) - m.region.lo(x) };
}

const TOL = 1e-10;

/** The volume by the method in x: π∫(R² − r²) dx about y = c, 2π∫ρ·h dx about x = c. */
export function volumeInX(m: Model): number {
  const { a, b } = m.region;
  if (m.axis.kind === "h") {
    return Math.PI * integrate((x) => {
      const { R, r } = washerRadii(m, x);
      return R * R - r * r;
    }, a, b, { tolerance: TOL }).value;
  }
  return 2 * Math.PI * integrate((x) => {
    const { radius, height } = shellAt(m, x);
    return radius * height;
  }, a, b, { tolerance: TOL }).value;
}

/**
 * The region's cross-section at height y: the x-intervals where
 * lo(x) ≤ y ≤ hi(x), found on a grid and bisected to their ends.
 */
export function levelSet(r: Region, y: number, grid = 1200): [number, number][] {
  const inside = (x: number): boolean => r.lo(x) <= y && y <= r.hi(x);
  const xs = Array.from({ length: grid + 1 }, (_, i) => r.a + ((r.b - r.a) * i) / grid);
  const ins = xs.map(inside);
  const cross = (p: number, q: number): number => {
    let lo = xs[p]!;
    let hi = xs[q]!;
    const want = ins[p]!;
    for (let i = 0; i < 60; i += 1) {
      const mid = (lo + hi) / 2;
      if (inside(mid) === want) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const out: [number, number][] = [];
  let start: number | null = ins[0] ? r.a : null;
  for (let i = 1; i < xs.length; i += 1) {
    if (ins[i] === ins[i - 1]) continue;
    const x = cross(i - 1, i);
    if (ins[i]) start = x;
    else if (start !== null) {
      out.push([start, x]);
      start = null;
    }
  }
  if (start !== null) out.push([start, r.b]);
  return out;
}

/**
 * The volume by the OTHER method, slicing the region along y: shells
 * 2π∫|y − c|·L(y) dy about y = c, washers π∫Σ(ρ₂² − ρ₁²) dy about x = c,
 * where L(y) and the ρ come from the region's cross-section at each height
 * (`levelSet`). Independent of `volumeInX` -- no formula is shared -- which
 * is what lets a test hold the two to the same number.
 */
export function volumeInY(m: Model, tolerance = 1e-8): number {
  const r = m.region;
  const n = 2000;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (let i = 0; i <= n; i += 1) {
    const x = r.a + ((r.b - r.a) * i) / n;
    yMin = Math.min(yMin, r.lo(x));
    yMax = Math.max(yMax, r.hi(x));
  }
  const marks = [r.lo(r.a), r.hi(r.a), r.lo(r.b), r.hi(r.b)];
  const c = m.axis.c;
  const integrand = (y: number): number => {
    const set = levelSet(r, y);
    if (m.axis.kind === "h") return 2 * Math.PI * Math.abs(y - c) * set.reduce((s, [x0, x1]) => s + (x1 - x0), 0);
    return Math.PI * set.reduce((s, [x0, x1]) => {
      const p = Math.abs(x0 - c);
      const q = Math.abs(x1 - c);
      return s + Math.abs(q * q - p * p);
    }, 0);
  };
  const cuts = [...new Set([yMin, ...marks.filter((y) => y > yMin && y < yMax), yMax])].sort((p, q) => p - q);
  let total = 0;
  for (let i = 0; i + 1 < cuts.length; i += 1) {
    if (cuts[i + 1]! - cuts[i]! < 1e-12) continue;
    total += integrate(integrand, cuts[i]!, cuts[i + 1]!, { tolerance, maxDepth: 18 }).value;
  }
  return total;
}

// ---- the page outline ---------------------------------------------------------------

/** 1 − (the ellipse's own quadratic form): positive inside the projected disc, zero on its ellipse. Null when the circle is seen edge-on. */
export function ellipseTest(pc: ProjectedCircle): ((x: number, y: number) => number) | null {
  const [p0, p1] = pc.p;
  const [q0, q1] = pc.q;
  const det = p0 * q1 - p1 * q0;
  if (Math.abs(det) < 1e-12) return null;
  const [cx, cy] = pc.ellipse.center;
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const w0 = (q1 * dx - q0 * dy) / det;
    const w1 = (-p1 * dx + p0 * dy) / det;
    return 1 - (w0 * w0 + w1 * w1);
  };
}
