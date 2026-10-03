/**
 * The geometry of school solids, pure and exported for tests (ADR 0046).
 *
 * A polyhedron is its vertices and its faces; every edge is read off the
 * faces, every outward normal is computed. A round solid is its axis
 * (always z, upright, as the textbook draws it), its radius and its height;
 * its rims are `projectCircle` ellipses and its outline generators come from
 * `tangentParamsParallelTo` / `tangentParamsFrom`.
 *
 * Visibility is PER SOLID and exact for a convex body: a point of the
 * surface is seen when a surface through it faces the reader. So a
 * polyhedron edge is visible when either face that meets there faces the
 * viewer, a rim point when its cap or the lateral surface at that point
 * does. Nothing tests one solid against another: composites are drawn
 * transparent (ADR 0046, "What was refused").
 */

import { add, cross3, dot, length, scale, sub } from "../../geometry/vec.ts";
import type { Vec2, Vec3 } from "../../geometry/vec.ts";
import { facesViewer, project, projectCircle, projectDirection, sphereOutline, tangentParamsFrom, tangentParamsParallelTo } from "../../geometry/projection.ts";
import type { Camera, ProjectedCircle } from "../../geometry/projection.ts";

const Z: Vec3 = [0, 0, 1];
const TAU = 2 * Math.PI;

// ---- polyhedra ----------------------------------------------------------------

export interface Polyhedron {
  readonly vertices: Vec3[];
  /** Each face's vertex indices in order around it. */
  readonly faces: number[][];
  /** Base vertices are 0..n−1; a prism's top vertices n..2n−1; a pyramid's apex is index n. */
  readonly n: number;
}

/**
 * The regular n-gon of side `edge` about `centre` in the plane z = centre.z,
 * counter-clockwise seen from above, with its first edge FACING THE READER:
 * vertex 0 at angle −π/n and vertex 1 at +π/n from +x (toward the reader in
 * the cavalier view), so A is front-left and B front-right, the textbook's
 * lettering.
 */
export function regularPolygon(centre: Vec3, sides: number, edge: number): Vec3[] {
  const R = edge / (2 * Math.sin(Math.PI / sides));
  return Array.from({ length: sides }, (_, k) => {
    const t = -Math.PI / sides + (TAU * k) / sides;
    return [centre[0] + R * Math.cos(t), centre[1] + R * Math.sin(t), centre[2]] as Vec3;
  });
}

/** A rectangle `width` along y and `depth` along x, lettered like the square: A front-left, B front-right, C back-right, D back-left. */
export function rectangle(centre: Vec3, width: number, depth: number): Vec3[] {
  const [x, y, z] = centre;
  return [
    [x + depth / 2, y - width / 2, z],
    [x + depth / 2, y + width / 2, z],
    [x - depth / 2, y + width / 2, z],
    [x - depth / 2, y - width / 2, z],
  ];
}

export function prism(base: Vec3[], height: number): Polyhedron {
  const n = base.length;
  const top = base.map((p) => add(p, [0, 0, height]));
  const faces = [
    base.map((_, i) => i),
    base.map((_, i) => n + i),
    ...base.map((_, i) => [i, (i + 1) % n, n + ((i + 1) % n), n + i]),
  ];
  return { vertices: [...base, ...top], faces, n };
}

export function pyramid(base: Vec3[], apex: Vec3): Polyhedron {
  const n = base.length;
  const faces = [base.map((_, i) => i), ...base.map((_, i) => [i, (i + 1) % n, n])];
  return { vertices: [...base, apex], faces, n };
}

export function centroid(pts: readonly Vec3[]): Vec3 {
  return scale(pts.reduce<Vec3>((s, p) => add(s, p), [0, 0, 0]), 1 / pts.length);
}

/** The outward normal of face `f`: its plane's normal, turned away from the solid's centroid. */
export function faceNormal(poly: Polyhedron, f: number): Vec3 {
  const idx = poly.faces[f]!;
  const [a, b, c] = idx.map((i) => poly.vertices[i]!) as [Vec3, Vec3, Vec3];
  let n = cross3(sub(b, a), sub(c, a));
  const out = sub(centroid(idx.map((i) => poly.vertices[i]!)), centroid(poly.vertices));
  if (dot(n, out) < 0) n = scale(n, -1);
  return scale(n, 1 / length(n));
}

export type Edge = { i: number; j: number; faces: number[] };

/** Every edge, once, with the faces that meet there (two, for a closed polyhedron). */
export function edgesOf(poly: Polyhedron): Edge[] {
  const by = new Map<string, Edge>();
  poly.faces.forEach((face, f) => {
    face.forEach((i, k) => {
      const j = face[(k + 1) % face.length]!;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      const e = by.get(key) ?? { i: Math.min(i, j), j: Math.max(i, j), faces: [] };
      e.faces.push(f);
      by.set(key, e);
    });
  });
  return [...by.values()];
}

/** Does face `f` face the reader? */
export function faceVisible(camera: Camera, poly: Polyhedron, f: number): boolean {
  return facesViewer(camera, faceNormal(poly, f));
}

/** An edge is seen when either face meeting there faces the reader; hidden -- dashed -- when neither does. */
export function classifyEdges(camera: Camera, poly: Polyhedron): (Edge & { visible: boolean })[] {
  const seen = poly.faces.map((_, f) => faceVisible(camera, poly, f));
  return edgesOf(poly).map((e) => ({ ...e, visible: e.faces.some((f) => seen[f]) }));
}

// ---- rims and arcs ------------------------------------------------------------

export type Arc = { t0: number; t1: number; visible: boolean };

/**
 * A full circle's parameter range cut at `params` and each piece classified
 * at its midpoint. Visibility can change only at the cuts, so the midpoint
 * decides the whole arc. Neighbours in the same state are merged.
 */
export function splitCircle(params: readonly number[], visibleAt: (t: number) => boolean): Arc[] {
  if (params.length === 0) return [{ t0: 0, t1: TAU, visible: visibleAt(0) }];
  const base = params[0]!;
  const cuts = [...new Set(params.map((t) => ((((t - base) % TAU) + TAU) % TAU) + base))].sort((a, b) => a - b);
  cuts.push(base + TAU);
  const arcs: Arc[] = [];
  for (let k = 0; k < cuts.length - 1; k += 1) {
    const t0 = cuts[k]!;
    const t1 = cuts[k + 1]!;
    if (t1 - t0 < 1e-12) continue;
    const visible = visibleAt((t0 + t1) / 2);
    const last = arcs[arcs.length - 1];
    if (last !== undefined && last.visible === visible) last.t1 = t1;
    else arcs.push({ t0, t1, visible });
  }
  // The last arc and the first are neighbours round the circle.
  if (arcs.length > 1 && arcs[0]!.visible === arcs[arcs.length - 1]!.visible) {
    const first = arcs.shift()!;
    arcs[arcs.length - 1]!.t1 = first.t1 + TAU;
  }
  return arcs;
}

/** The unit radial direction of a circle's parameter t. */
export function radial(pc: ProjectedCircle, t: number): Vec3 {
  return add(scale(pc.u, Math.cos(t)), scale(pc.v, Math.sin(t)));
}

export interface CylinderView {
  bottom: ProjectedCircle;
  top: ProjectedCircle;
  /** Parameters of the two outline generators (tangentParamsParallelTo). */
  silhouette: [number, number];
  bottomArcs: Arc[];
  topArcs: Arc[];
}

/** An upright right circular cylinder: base centre, radius, height. */
export function cylinderView(camera: Camera, centre: Vec3, radius: number, height: number): CylinderView {
  const bottom = projectCircle(camera, centre, Z, radius);
  const top = projectCircle(camera, add(centre, [0, 0, height]), Z, radius);
  const silhouette = tangentParamsParallelTo(bottom, projectDirection(camera, [0, 0, height]));
  const lateral = (t: number): boolean => dot(radial(bottom, t), camera.toward) > 0;
  const topCap = facesViewer(camera, Z);
  const bottomCap = facesViewer(camera, [0, 0, -1]);
  return {
    bottom,
    top,
    silhouette,
    bottomArcs: splitCircle(silhouette, (t) => bottomCap || lateral(t)),
    topArcs: splitCircle(silhouette, (t) => topCap || lateral(t)),
  };
}

export interface ConeView {
  base: ProjectedCircle;
  apex: Vec3;
  /** Parameters where the outline generators from the apex touch the base ellipse (tangentParamsFrom); empty when the apex is seen through the base. */
  silhouette: number[];
  baseArcs: Arc[];
}

/** The cone's outward lateral normal at base parameter t: radial·h + axis·r. */
export function coneNormal(pc: ProjectedCircle, t: number, radius: number, height: number): Vec3 {
  return add(scale(radial(pc, t), height), scale(Z, radius));
}

export function coneView(camera: Camera, centre: Vec3, radius: number, height: number): ConeView {
  const base = projectCircle(camera, centre, Z, radius);
  const apex = add(centre, [0, 0, height]);
  const silhouette = tangentParamsFrom(base, project(camera, apex));
  const baseCap = facesViewer(camera, [0, 0, -1]);
  return {
    base,
    apex,
    silhouette,
    baseArcs: splitCircle(silhouette, (t) => baseCap || dot(coneNormal(base, t, radius, height), camera.toward) > 0),
  };
}

export interface SphereView {
  outline: ProjectedCircle;
  equator: ProjectedCircle;
  equatorArcs: Arc[];
}

export function sphereView(camera: Camera, centre: Vec3, radius: number): SphereView {
  const outline = sphereOutline(camera, centre, radius);
  const equator = projectCircle(camera, centre, Z, radius);
  const fc = equator.frontCenter;
  return {
    outline,
    equator,
    equatorArcs: splitCircle([fc - Math.PI / 2, fc + Math.PI / 2], (t) => dot(radial(equator, t), camera.toward) > 0),
  };
}

/** Page points of a circle's arc, sampled at most 4° apart (a flattening far under a pixel at school sizes). */
export function arcPoints(pc: ProjectedCircle, t0: number, t1: number): Vec2[] {
  const steps = Math.max(2, Math.ceil((t1 - t0) / (Math.PI / 45)));
  return Array.from({ length: steps + 1 }, (_, k) => pc.point(t0 + ((t1 - t0) * k) / steps));
}

/** The page-rightmost parameter of a projected circle. */
export function rightmostParam(pc: ProjectedCircle): number {
  return Math.atan2(pc.q[0], pc.p[0]);
}

/** Convex hull, monotone chain, counter-clockwise. */
export function convexHull(pts: readonly Vec2[]): Vec2[] {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (s.length < 3) return s;
  const cross = (o: Vec2, a: Vec2, b: Vec2): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [];
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (const p of [...s].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

// ---- frustums, inverted cones, hemispheres, bores (ADR 0068) ----------------------

/**
 * A piecewise classification of the parameter range [t0, t1] by a visibility
 * predicate with no closed form (a bore's rim seen through its opening):
 * sampled `samples` times, each change of state refined by bisection to
 * 1e-12 of the range, neighbours in one state merged. The predicate must be
 * piecewise constant with finitely many changes, as every visibility here is.
 */
export function splitParam(visibleAt: (t: number) => boolean, t0: number, t1: number, samples = 360): Arc[] {
  const span = t1 - t0;
  const pieces: Arc[] = [];
  let start = t0;
  let prevT = t0;
  let prev = visibleAt(t0 + span * 1e-9);
  for (let k = 1; k <= samples; k += 1) {
    const t = k === samples ? t1 : t0 + (span * k) / samples;
    const now = visibleAt(k === samples ? t1 - span * 1e-9 : t);
    if (now !== prev) {
      let lo = prevT;
      let hi = t;
      while (hi - lo > 1e-12 * Math.max(1, Math.abs(span))) {
        const mid = (lo + hi) / 2;
        if (visibleAt(mid) === prev) lo = mid;
        else hi = mid;
      }
      const cut = (lo + hi) / 2;
      pieces.push({ t0: start, t1: cut, visible: prev });
      start = cut;
      prev = now;
    }
    prevT = t;
  }
  pieces.push({ t0: start, t1, visible: prev });
  return pieces.filter((p) => p.t1 - p.t0 > 1e-12 * Math.max(1, Math.abs(span)));
}

/** A circle's whole range split by `visibleAt`, merged across 2π like `splitCircle`. */
export function splitWholeCircle(visibleAt: (t: number) => boolean, samples = 720): Arc[] {
  const arcs = splitParam(visibleAt, 0, TAU, samples);
  if (arcs.length > 1 && arcs[0]!.visible === arcs[arcs.length - 1]!.visible) {
    const first = arcs.shift()!;
    arcs[arcs.length - 1]!.t1 = first.t1 + TAU;
  }
  return arcs;
}

export interface FrustumView {
  bottom: ProjectedCircle;
  top: ProjectedCircle;
  /** Parameters of the two outline generators: tangents from the image of the cone's virtual apex. */
  silhouette: number[];
  /** The outward lateral normal at parameter t. */
  lateral: (t: number) => Vec3;
}

/**
 * A frustum of a right circular cone (bottom radius R, top radius r ≠ R,
 * height h), or -- with R = 0 -- a cone standing on its apex. The outline
 * generators are the full cone's: tangents to the bottom ellipse from the
 * image of the virtual apex, at height h·R/(R − r) (below the base when the
 * frustum widens upward). The lateral normal at t is radial·h + ẑ·(R − r).
 */
export function frustumView(camera: Camera, centre: Vec3, R: number, r: number, height: number): FrustumView {
  const top = projectCircle(camera, add(centre, [0, 0, height]), Z, r);
  const bottom = R > 0 ? projectCircle(camera, centre, Z, R) : top;
  const apexZ = (height * R) / (R - r);
  const apex = add(centre, [0, 0, apexZ]);
  const silhouette = tangentParamsFrom(R > 0 ? bottom : top, project(camera, apex));
  return { bottom, top, silhouette, lateral: (t) => add(scale(radial(top, t), height), scale(Z, R - r)) };
}

export interface DomeView {
  /** The sphere's outline circle (perpendicular to `toward`), as a parameterised circle. */
  outline: ProjectedCircle;
  /** The parameter range of the outline lying on the upper half (z ≥ centre): [t0, t0 + π]. */
  upper: [number, number];
  base: ProjectedCircle;
}

/** A hemisphere (dome) on the plane z = centre.z: its base rim, and the half of the sphere's outline above that plane. */
export function domeView(camera: Camera, centre: Vec3, radius: number): DomeView {
  const outline = sphereOutline(camera, centre, radius);
  // z of the outline point is r(cos t·u_z + sin t·v_z): it is highest at
  // atan2(v_z, u_z), and the upper half is the π around that.
  const top = Math.atan2(outline.v[2], outline.u[2]);
  return { outline, upper: [top - Math.PI / 2, top + Math.PI / 2], base: projectCircle(camera, centre, Z, radius) };
}

/**
 * Is a point of a bore's wall seen THROUGH an opening? The bore is a vertical
 * convex hole from z = zBottom to z = zTop; its cross-section is `inside`
 * (strict). The ray from p toward the reader meets the cap plane it rises (or
 * falls) to; the point is seen when it leaves through the hole there, never
 * through the solid's material. Convexity makes that one test exact: the ray
 * from a point on the wall to a point inside the opening runs inside the hole.
 */
export function seenThroughOpening(camera: Camera, p: Vec3, zBottom: number, zTop: number, inside: (x: number, y: number) => boolean): boolean {
  const tz = camera.toward[2];
  if (Math.abs(tz) < 1e-12) return false;
  const zCap = tz > 0 ? zTop : zBottom;
  const s = (zCap - p[2]) / tz;
  const q = add(p, scale(camera.toward, s));
  return inside(q[0], q[1]);
}
