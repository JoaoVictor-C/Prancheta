/**
 * Per-object visibility: which stretches of a straight segment a plane patch
 * hides. ADR 0045.
 *
 * This is NOT hidden-line removal. The only occluders are the plane patches
 * the figure draws (translucent parallelograms/polygons); the only things
 * they hide are straight segments (axes, lines, vectors, traces, other
 * patches' edges). A segment never hides a segment, and a patch never hides
 * a patch's fill -- fills are translucent and simply overlap. That is the
 * whole model a textbook figure of lines and planes needs, and it is small
 * enough to be exact.
 *
 * For one segment and one patch, visibility can only change where
 *   (a) the segment pierces the patch's plane in 3D, or
 *   (b) the segment's page image crosses the patch's page outline.
 * Between two consecutive such parameters it is constant, so it is decided
 * once, at the stretch's midpoint: hidden when that midpoint's page image is
 * strictly inside the patch's page polygon AND the patch, at that page
 * point, is nearer the reader (`planeDepthAt` > the segment's own depth).
 * A segment lying IN the patch's plane is never hidden by it -- the
 * intersection line of two planes lies on both, and a patch's own edges on
 * itself.
 */

import { add, dot, length, scale, sub } from "../../geometry/vec.ts";
import type { Vec2, Vec3 } from "../../geometry/vec.ts";
import { depth, planeDepthAt, project } from "../../geometry/projection.ts";
import type { Camera } from "../../geometry/projection.ts";

export interface Patch {
  readonly id: string;
  /** The patch's corners in 3D, in order around it (a convex planar polygon). */
  readonly corners: readonly Vec3[];
  readonly point: Vec3;
  readonly normal: Vec3;
}

export interface Piece {
  readonly from: Vec3;
  readonly to: Vec3;
  readonly hidden: boolean;
  /** Which patch hides this stretch, when it is hidden. */
  readonly by?: string;
}

const cross2 = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];

/** Is `p` strictly inside the convex polygon `poly` (either winding), by at least `margin` in page units? */
export function insideConvex(poly: readonly Vec2[], p: Vec2, margin = 1e-9): boolean {
  if (poly.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const edge: Vec2 = [b[0] - a[0], b[1] - a[1]];
    const len = Math.hypot(edge[0], edge[1]);
    if (len === 0) continue;
    const c = cross2(edge, [p[0] - a[0], p[1] - a[1]]) / len;
    if (Math.abs(c) <= margin) return false;
    const s = Math.sign(c);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

/** Parameter along a→b where it crosses segment c→d, both in the page; null when parallel or missing. */
function crossingParam(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number | null {
  const r: Vec2 = [b[0] - a[0], b[1] - a[1]];
  const s: Vec2 = [d[0] - c[0], d[1] - c[1]];
  const denom = cross2(r, s);
  if (Math.abs(denom) < 1e-15) return null;
  const ca: Vec2 = [c[0] - a[0], c[1] - a[1]];
  const t = cross2(ca, s) / denom;
  const u = cross2(ca, r) / denom;
  if (u < -1e-12 || u > 1 + 1e-12) return null;
  return t;
}

/** Does the segment lie in the patch's plane (both ends on it, relative to the figure's scale)? */
function liesIn(patch: Patch, a: Vec3, b: Vec3): boolean {
  const n = length(patch.normal);
  const scaleOf = Math.max(1, ...a.map(Math.abs), ...b.map(Math.abs), ...patch.point.map(Math.abs));
  const tol = 1e-9 * scaleOf;
  return Math.abs(dot(patch.normal, sub(a, patch.point))) / n <= tol && Math.abs(dot(patch.normal, sub(b, patch.point))) / n <= tol;
}

/** Is the 3D point `p` hidden by `patch` under `camera`? */
export function hiddenBy(camera: Camera, patch: Patch, p: Vec3): boolean {
  const page = project(camera, p);
  const poly = patch.corners.map((c) => project(camera, c));
  if (!insideConvex(poly, page)) return false;
  const d = planeDepthAt(camera, patch.point, patch.normal, page);
  if (d === null) return false;
  const own = depth(camera, p);
  return d > own + 1e-9 * Math.max(1, Math.abs(own));
}

/**
 * The segment a→b cut into stretches, each wholly visible or wholly hidden
 * by the patches given. `skip` names patches the segment belongs to (its own
 * plane's patch), which never hide it whatever the arithmetic says.
 */
export function splitByVisibility(camera: Camera, a: Vec3, b: Vec3, patches: readonly Patch[], skip: ReadonlySet<string> = new Set()): Piece[] {
  const active = patches.filter((p) => !skip.has(p.id) && !liesIn(p, a, b));
  const ts = new Set<number>([0, 1]);
  const pa = project(camera, a);
  const pb = project(camera, b);
  const d = sub(b, a);
  for (const patch of active) {
    const denom = dot(patch.normal, d);
    if (Math.abs(denom) > 1e-15) {
      const t = dot(patch.normal, sub(patch.point, a)) / denom;
      if (t > 0 && t < 1) ts.add(t);
    }
    const poly = patch.corners.map((c) => project(camera, c));
    for (let i = 0; i < poly.length; i += 1) {
      const t = crossingParam(pa, pb, poly[i]!, poly[(i + 1) % poly.length]!);
      if (t !== null && t > 0 && t < 1) ts.add(t);
    }
  }
  const sorted = [...ts].sort((x, y) => x - y).filter((t, i, arr) => i === 0 || t - arr[i - 1]! > 1e-9);
  const at = (t: number): Vec3 => add(a, scale(d, t));
  const raw: Piece[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const t0 = sorted[i]!;
    const t1 = sorted[i + 1]!;
    const mid = at((t0 + t1) / 2);
    const by = active.find((p) => hiddenBy(camera, p, mid));
    raw.push({ from: at(t0), to: at(t1), hidden: by !== undefined, ...(by === undefined ? {} : { by: by.id }) });
  }
  // Merge neighbours in the same state, so a segment is split only where
  // what the reader sees actually changes.
  const merged: Piece[] = [];
  for (const piece of raw) {
    const last = merged[merged.length - 1];
    if (last !== undefined && last.hidden === piece.hidden && last.by === piece.by) {
      merged[merged.length - 1] = { ...last, to: piece.to };
    } else merged.push(piece);
  }
  return merged;
}

// ---- clipping -------------------------------------------------------------

export type Box3 = { lo: Vec3; hi: Vec3 };

/** The parameter range [t0, t1] of point + t·direction inside the box, or null when the line misses it (Liang–Barsky in 3D). */
export function clipLineToBox(point: Vec3, direction: Vec3, box: Box3): [number, number] | null {
  let t0 = -Infinity;
  let t1 = Infinity;
  for (let i = 0; i < 3; i += 1) {
    const p = point[i]!;
    const dd = direction[i]!;
    if (Math.abs(dd) < 1e-15) {
      if (p < box.lo[i]! - 1e-12 || p > box.hi[i]! + 1e-12) return null;
      continue;
    }
    let a = (box.lo[i]! - p) / dd;
    let b = (box.hi[i]! - p) / dd;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
  }
  return t1 - t0 > 1e-12 ? [t0, t1] : null;
}

/** A convex polygon clipped to the half-space where `f(p) ≤ 0` (Sutherland–Hodgman, one plane). */
export function clipPolygon(poly: readonly Vec3[], f: (p: Vec3) => number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const fp = f(p);
    const fq = f(q);
    if (fp <= 0) out.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
      const t = fp / (fp - fq);
      out.push(add(p, scale(sub(q, p), t)));
    }
  }
  return out;
}

/** A convex polygon clipped to an axis-aligned box. */
export function clipPolygonToBox(poly: readonly Vec3[], box: Box3): Vec3[] {
  let out: Vec3[] = [...poly];
  for (let i = 0; i < 3; i += 1) {
    out = clipPolygon(out, (p) => p[i]! - box.hi[i]!);
    out = clipPolygon(out, (p) => box.lo[i]! - p[i]!);
  }
  // Drop repeated corners a clip through a vertex leaves behind.
  return out.filter((p, i) => {
    const q = out[(i + 1) % out.length]!;
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 1e-9;
  });
}
