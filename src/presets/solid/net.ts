/**
 * Nets (planificações) of solids, flat and in true size (ADR 0068).
 *
 * A polyhedron is unfolded along a spanning tree of its faces: the root face
 * is laid in its own plane, and each child is turned about the edge it shares
 * with its parent until it lies in the page, on the far side of that edge.
 * Tree edges are the fold lines; every other edge is cut. Prisms use the
 * textbook strip (the lateral faces in a row, one base above and one below
 * the same lateral face); everything else unfolds from its largest face
 * outward, breadth first, which gives a pyramid its star. A net whose faces
 * overlap is not a net: another root is tried, and the figure is refused when
 * none works.
 *
 * Round solids have closed forms: a cylinder unrolls to a 2πr × h rectangle
 * with its two discs, a cone to a sector of radius g and angle 360°·r/g, a
 * cone's frustum to an annular sector.
 *
 * Coordinates are in units of length, y up. Pure and exported for tests.
 */

import { add, cross3, dot, length, scale, sub } from "../../geometry/vec.ts";
import type { Vec2, Vec3 } from "../../geometry/vec.ts";
import { insidePolygon, meshEdges, meshNormals } from "./mesh.ts";
import type { Mesh } from "./mesh.ts";

export type NetFace = { face: number; pts: Vec2[] };
export type Seg2 = [Vec2, Vec2];
export interface PolyNet {
  faces: NetFace[];
  /** Fold lines: edges shared by two faces of the net (drawn dashed). */
  folds: Seg2[];
  /** The cut outline: every other edge (drawn solid). */
  cuts: Seg2[];
}

export class NetError extends Error {}

const norm3 = (v: Vec3): Vec3 => scale(v, 1 / length(v));

/**
 * Unfold along a tree given as parent[f] = the face f hangs from (−1 for the
 * root). Each face is laid out from outside, so the net is the outside of the
 * solid seen flat.
 */
export function unfold(mesh: Mesh, parent: readonly number[]): PolyNet {
  const V = mesh.vertices;
  const normals = meshNormals(mesh);
  const placed = new Map<number, Map<number, Vec2>>();
  const root = parent.indexOf(-1);
  if (root < 0) throw new NetError("the unfolding tree has no root");
  // Root: its own frame, x along its first edge, y = n × x (counter-clockwise from outside).
  {
    const f = mesh.faces[root]!;
    const o = V[f[0]!]!;
    const x = norm3(sub(V[f[1]!]!, o));
    const y = cross3(normals[root]!, x);
    placed.set(root, new Map(f.map((i) => [i, [dot(sub(V[i]!, o), x), dot(sub(V[i]!, o), y)] as Vec2])));
  }
  const children = (p: number): number[] => parent.map((q, f) => (q === p ? f : -1)).filter((f) => f >= 0);
  const queue = [root];
  while (queue.length > 0) {
    const p = queue.shift()!;
    for (const c of children(p)) {
      const shared = mesh.faces[c]!.filter((i) => mesh.faces[p]!.includes(i));
      if (shared.length < 2) throw new NetError(`faces ${p} and ${c} share no edge`);
      // The shared edge as the child runs it: a → b.
      const fc = mesh.faces[c]!;
      let a = -1;
      let b = -1;
      fc.forEach((i, k) => {
        const j = fc[(k + 1) % fc.length]!;
        if (shared.includes(i) && shared.includes(j)) [a, b] = [i, j];
      });
      const A = V[a]!;
      const x = norm3(sub(V[b]!, A));
      const y = cross3(normals[c]!, x);
      const pp = placed.get(p)!;
      const A2 = pp.get(a)!;
      const B2 = pp.get(b)!;
      const L = Math.hypot(B2[0] - A2[0], B2[1] - A2[1]);
      const X: Vec2 = [(B2[0] - A2[0]) / L, (B2[1] - A2[1]) / L];
      const Y: Vec2 = [-X[1], X[0]];
      placed.set(c, new Map(fc.map((i) => {
        const s = dot(sub(V[i]!, A), x);
        const t = dot(sub(V[i]!, A), y);
        return [i, [A2[0] + s * X[0] + t * Y[0], A2[1] + s * X[1] + t * Y[1]] as Vec2];
      })));
      queue.push(c);
    }
  }
  if (placed.size !== mesh.faces.length) throw new NetError("the unfolding tree does not reach every face");
  const faces = mesh.faces.map((f, k) => ({ face: k, pts: f.map((i) => placed.get(k)!.get(i)!) }));
  const folds: Seg2[] = [];
  const cuts: Seg2[] = [];
  for (const e of meshEdges(mesh)) {
    const [f, g] = e.faces as [number, number];
    const isFold = parent[f] === g || parent[g] === f;
    if (isFold) folds.push([placed.get(f)!.get(e.i)!, placed.get(f)!.get(e.j)!]);
    else {
      cuts.push([placed.get(f)!.get(e.i)!, placed.get(f)!.get(e.j)!]);
      cuts.push([placed.get(g)!.get(e.i)!, placed.get(g)!.get(e.j)!]);
    }
  }
  return { faces, folds, cuts };
}

/** A breadth-first tree of faces from `root`, neighbours taken in face order. */
export function bfsTree(mesh: Mesh, root: number): number[] {
  const parent = new Array<number>(mesh.faces.length).fill(-2);
  parent[root] = -1;
  const adj = new Map<number, number[]>();
  for (const e of meshEdges(mesh)) {
    const [f, g] = e.faces as [number, number];
    adj.set(f, [...(adj.get(f) ?? []), g]);
    adj.set(g, [...(adj.get(g) ?? []), f]);
  }
  const queue = [root];
  while (queue.length > 0) {
    const f = queue.shift()!;
    for (const g of [...(adj.get(f) ?? [])].sort((a, b) => a - b)) {
      if (parent[g] !== -2) continue;
      parent[g] = f;
      queue.push(g);
    }
  }
  return parent;
}

const cross2 = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];

function properCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2, eps: number): boolean {
  const r: Vec2 = [b[0] - a[0], b[1] - a[1]];
  const s: Vec2 = [d[0] - c[0], d[1] - c[1]];
  const den = cross2(r, s);
  if (Math.abs(den) < 1e-15) return false;
  const ca: Vec2 = [c[0] - a[0], c[1] - a[1]];
  const t = cross2(ca, s) / den;
  const u = cross2(ca, r) / den;
  const lr = Math.hypot(...r);
  const ls = Math.hypot(...s);
  return t * lr > eps && (1 - t) * lr > eps && u * ls > eps && (1 - u) * ls > eps;
}

function interiorPoint(poly: readonly Vec2[]): Vec2 {
  // A point just inside the first corner, along its bisector; the centroid when that fails (convex faces).
  const c: Vec2 = [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
  if (insidePolygon(poly, c, 0)) return c;
  for (let k = 0; k < poly.length; k += 1) {
    const p = poly[k]!;
    const a = poly[(k + poly.length - 1) % poly.length]!;
    const b = poly[(k + 1) % poly.length]!;
    const q: Vec2 = [(a[0] + b[0] + 4 * p[0]) / 6, (a[1] + b[1] + 4 * p[1]) / 6];
    if (insidePolygon(poly, q, 0)) return q;
  }
  return c;
}

/** Do the interiors of two faces of a net overlap? Touching along a fold or at a corner is not overlap. */
export function facesOverlap(p: readonly Vec2[], q: readonly Vec2[], eps = 1e-7): boolean {
  for (let i = 0; i < p.length; i += 1) {
    for (let j = 0; j < q.length; j += 1) {
      if (properCross(p[i]!, p[(i + 1) % p.length]!, q[j]!, q[(j + 1) % q.length]!, eps)) return true;
    }
  }
  return insidePolygon(q, interiorPoint(p), eps) || insidePolygon(p, interiorPoint(q), eps);
}

export function netOverlaps(net: PolyNet): [number, number] | null {
  for (let a = 0; a < net.faces.length; a += 1) {
    for (let b = a + 1; b < net.faces.length; b += 1) {
      if (facesOverlap(net.faces[a]!.pts, net.faces[b]!.pts)) return [net.faces[a]!.face, net.faces[b]!.face];
    }
  }
  return null;
}

/**
 * The textbook strip of a prism whose faces are [bottom, top, lateral 0 …
 * lateral n−1] (as `geometry.ts` builds them): laterals in a row, the bases
 * hanging from lateral `hinge` -- by default the second one, which gives the cube its cross;
 * a stair hangs its two profiles from its floor, the one band face its whole profile stands on.
 */
export function prismTree(n: number, hinge = n >= 3 ? 1 : 0): number[] {
  const parent = new Array<number>(n + 2).fill(-1);
  parent[2] = -1;
  for (let i = 1; i < n; i += 1) parent[2 + i] = 2 + i - 1;
  parent[0] = 2 + hinge;
  parent[1] = 2 + hinge;
  return parent;
}

/**
 * The net of a polyhedron: the given tree first (when there is one), then
 * breadth-first trees from each face, largest first; the first without
 * overlapping faces wins. Refused when every one overlaps.
 */
export function polyhedronNet(mesh: Mesh, preferred?: number[]): PolyNet {
  const areas = meshNormals(mesh).map((_, f) => {
    const face = mesh.faces[f]!;
    let n: Vec3 = [0, 0, 0];
    face.forEach((i, k) => {
      n = add(n, cross3(mesh.vertices[i]!, mesh.vertices[face[(k + 1) % face.length]!]!));
    });
    return length(n);
  });
  const roots = mesh.faces.map((_, f) => f).sort((a, b) => areas[b]! - areas[a]! || a - b);
  const trees = [...(preferred === undefined ? [] : [preferred]), ...roots.map((r) => bfsTree(mesh, r))];
  let last: [number, number] | null = null;
  for (const tree of trees) {
    const net = unfold(mesh, tree);
    const clash = netOverlaps(net);
    if (clash === null) return orientNet(net);
    last = clash;
  }
  throw new NetError(`no unfolding of this polyhedron tried lies flat without overlapping faces (faces ${last![0]} and ${last![1]} overlap)`);
}

/** Turn a net so its longest extent runs across the page and it sits in the first quadrant. */
function orientNet(net: PolyNet): PolyNet {
  const pts = net.faces.flatMap((f) => f.pts);
  // Principal direction of the points.
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    sxx += (p[0] - cx) ** 2;
    syy += (p[1] - cy) ** 2;
    sxy += (p[0] - cx) * (p[1] - cy);
  }
  let angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  // Snap to the nearest direction of some net edge, so a strip lies exactly level.
  let best = angle;
  let bestGap = Infinity;
  for (const [a, b] of [...net.folds, ...net.cuts]) {
    let t = Math.atan2(b[1] - a[1], b[0] - a[0]);
    while (t - angle > Math.PI / 2) t -= Math.PI;
    while (t - angle < -Math.PI / 2) t += Math.PI;
    if (Math.abs(t - angle) < bestGap) {
      bestGap = Math.abs(t - angle);
      best = t;
    }
  }
  angle = bestGap < 0.3 ? best : angle;
  const c = Math.cos(-angle);
  const s = Math.sin(-angle);
  const rot = (p: Vec2): Vec2 => [c * (p[0] - cx) - s * (p[1] - cy), s * (p[0] - cx) + c * (p[1] - cy)];
  const r = { faces: net.faces.map((f) => ({ face: f.face, pts: f.pts.map(rot) })), folds: net.folds.map(([a, b]) => [rot(a), rot(b)] as Seg2), cuts: net.cuts.map(([a, b]) => [rot(a), rot(b)] as Seg2) };
  const all = r.faces.flatMap((f) => f.pts);
  const mx = Math.min(...all.map((p) => p[0]));
  const my = Math.min(...all.map((p) => p[1]));
  const sh = (p: Vec2): Vec2 => [p[0] - mx, p[1] - my];
  return { faces: r.faces.map((f) => ({ face: f.face, pts: f.pts.map(sh) })), folds: r.folds.map(([a, b]) => [sh(a), sh(b)] as Seg2), cuts: r.cuts.map(([a, b]) => [sh(a), sh(b)] as Seg2) };
}

// ---- round nets --------------------------------------------------------------------

export type RoundPiece = { name: "base" | "lateral"; outline: Vec2[]; centre: Vec2 };
export interface RoundNet {
  pieces: RoundPiece[];
  /** Straight edges that carry a length: their ends, and which. */
  runs: { which: "circumference" | "height" | "slant" | "radius" | "topRadius"; a: Vec2; b: Vec2 }[];
  /** A sector's apex and its angle in radians, for the angle mark. */
  sector?: { apex: Vec2; from: number; to: number; radius: number };
}

const circle = (c: Vec2, r: number, n = 120): Vec2[] => Array.from({ length: n }, (_, k) => [c[0] + r * Math.cos((2 * Math.PI * k) / n), c[1] + r * Math.sin((2 * Math.PI * k) / n)] as Vec2);

/** A cylinder: the 2πr × h rectangle, a disc touching the middle of its top side and one touching the bottom. */
export function cylinderNet(r: number, h: number): RoundNet {
  const w = 2 * Math.PI * r;
  const rect: Vec2[] = [[0, 0], [w, 0], [w, h], [0, h]];
  const top: Vec2 = [w / 2, h + r];
  const bottom: Vec2 = [w / 2, -r];
  return {
    pieces: [
      { name: "lateral", outline: rect, centre: [w / 2, h / 2] },
      { name: "base", outline: circle(top, r), centre: top },
      { name: "base", outline: circle(bottom, r), centre: bottom },
    ],
    runs: [
      { which: "circumference", a: [0, 0], b: [w, 0] },
      { which: "height", a: [w, 0], b: [w, h] },
      { which: "radius", a: top, b: [top[0] + r, top[1]] },
    ],
  };
}

/** A cone: the sector of radius g and angle 2πr/g, its arc centred on the downward vertical, and the base disc touching the arc's middle. */
export function coneNet(r: number, g: number): RoundNet {
  const theta = (2 * Math.PI * r) / g;
  const apex: Vec2 = [0, 0];
  const from = -Math.PI / 2 - theta / 2;
  const to = -Math.PI / 2 + theta / 2;
  const steps = Math.max(8, Math.ceil(theta / (Math.PI / 90)));
  const arc = Array.from({ length: steps + 1 }, (_, k) => {
    const t = from + ((to - from) * k) / steps;
    return [g * Math.cos(t), g * Math.sin(t)] as Vec2;
  });
  const sector: Vec2[] = theta < 2 * Math.PI - 1e-9 ? [apex, ...arc] : arc;
  const base: Vec2 = [0, -g - r];
  return {
    pieces: [
      { name: "lateral", outline: sector, centre: [0, -g * 0.55] },
      { name: "base", outline: circle(base, r), centre: base },
    ],
    runs: [
      { which: "slant", a: apex, b: arc[arc.length - 1]! },
      { which: "radius", a: base, b: [base[0] + r, base[1]] },
    ],
    sector: { apex, from, to, radius: g },
  };
}

/** A cone's frustum (R > r): the annular sector of radii L = gR/(R − r) and L − g, angle 2πR/L, with both discs. */
export function frustumNet(R: number, r: number, g: number): RoundNet {
  const L = (g * R) / (R - r);
  const l = L - g;
  const theta = (2 * Math.PI * R) / L;
  if (theta >= 2 * Math.PI) throw new NetError("this frustum's lateral surface does not unroll inside one turn");
  const from = -Math.PI / 2 - theta / 2;
  const to = -Math.PI / 2 + theta / 2;
  const steps = Math.max(8, Math.ceil(theta / (Math.PI / 90)));
  const arcAt = (rad: number): Vec2[] => Array.from({ length: steps + 1 }, (_, k) => {
    const t = from + ((to - from) * k) / steps;
    return [rad * Math.cos(t), rad * Math.sin(t)] as Vec2;
  });
  const outer = arcAt(L);
  const inner = arcAt(l).reverse();
  const big: Vec2 = [0, -L - R];
  const small: Vec2 = [0, -l + r];
  return {
    pieces: [
      { name: "lateral", outline: [...outer, ...inner], centre: [0, -(L + l) / 2] },
      { name: "base", outline: circle(big, R), centre: big },
      { name: "base", outline: circle(small, r), centre: small },
    ],
    runs: [
      { which: "slant", a: inner[0]!, b: outer[outer.length - 1]! },
      { which: "radius", a: big, b: [big[0] + R, big[1]] },
      { which: "topRadius", a: small, b: [small[0] + r, small[1]] },
    ],
  };
}
