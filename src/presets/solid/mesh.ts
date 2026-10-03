/**
 * Polyhedra that are not convex, or not school solids: a stair, and any
 * polyhedron typed as vertices and faces (ADR 0068).
 *
 * A convex body is seen exactly where a face through the point faces the
 * reader -- the rule `geometry.ts` uses. A stair is not convex: a riser faces
 * the reader and can still be behind a nearer step. So here an edge is cut
 * where its page image crosses the outline of any face that faces the
 * reader, and where it pierces that face's plane; each piece is decided at
 * its midpoint by asking whether some front face covers that page point and
 * is nearer there. That is hidden-line removal for one closed polyhedron,
 * exact up to the tolerance of a point-in-polygon test, and it reduces to
 * the convex rule on a convex body (tested).
 *
 * Faces are oriented here, never trusted: adjacent faces are made to run
 * their shared edge in opposite directions, and the whole is turned outward
 * by the sign of its volume. Volumes and areas are exact from the typed
 * coordinates (`exact.ts`): the volume by the divergence theorem over a fan
 * of each face, an area as half the length of the face's Newell normal.
 *
 * Pure and exported for tests.
 */

import { add, cross3, dot, length, scale, sub } from "../../geometry/vec.ts";
import type { Vec2, Vec3 } from "../../geometry/vec.ts";
import { depth, facesViewer, planeDepthAt, project } from "../../geometry/projection.ts";
import type { Camera } from "../../geometry/projection.ts";
import { add as xadd, mul, rat, scale as xscale, sqrt as xsqrt, sub as xsub } from "./exact.ts";
import type { Exact } from "./exact.ts";

export interface Mesh {
  readonly vertices: Vec3[];
  /** Each face's vertex indices in order round it, counter-clockwise seen from outside once oriented. */
  readonly faces: number[][];
}

export class MeshError extends Error {}

/** The Newell normal of a polygon: robust for a non-convex face, and twice its area long. */
export function newellNormal(V: readonly Vec3[], face: readonly number[]): Vec3 {
  let n: Vec3 = [0, 0, 0];
  for (let k = 0; k < face.length; k += 1) {
    n = add(n, cross3(V[face[k]!]!, V[face[(k + 1) % face.length]!]!));
  }
  return n;
}

const key = (i: number, j: number): string => (i < j ? `${i}-${j}` : `${j}-${i}`);

/**
 * Checks a mesh and orients it outward. Refused by name: a face with fewer
 * than three distinct vertices or an index out of range, a face that is not
 * planar, an edge not shared by exactly two faces (the surface is open or
 * pinched), and faces that cannot be oriented consistently.
 */
export function orientMesh(mesh: Mesh): Mesh {
  const V = mesh.vertices;
  const span = Math.max(1e-300, ...[0, 1, 2].map((i) => Math.max(...V.map((p) => p[i]!)) - Math.min(...V.map((p) => p[i]!))));
  if (V.length < 4) throw new MeshError(`a polyhedron has at least 4 vertices, got ${V.length}`);
  if (mesh.faces.length < 4) throw new MeshError(`a polyhedron has at least 4 faces, got ${mesh.faces.length}`);
  mesh.faces.forEach((f, k) => {
    if (f.length < 3 || new Set(f).size !== f.length) throw new MeshError(`faces[${k}] needs at least 3 distinct vertices`);
    for (const i of f) if (!Number.isInteger(i) || i < 0 || i >= V.length) throw new MeshError(`faces[${k}] names vertex ${i}, but there are ${V.length} (0 to ${V.length - 1})`);
    const n = newellNormal(V, f);
    const len = length(n);
    if (len <= 1e-12 * span * span) throw new MeshError(`faces[${k}] has no area -- its vertices are collinear`);
    const p0 = V[f[0]!]!;
    for (const i of f) {
      if (Math.abs(dot(n, sub(V[i]!, p0))) / len > 1e-7 * span) throw new MeshError(`faces[${k}] is not planar: vertex ${i} is off the plane of the others`);
    }
  });
  const byEdge = new Map<string, { f: number; i: number; j: number }[]>();
  mesh.faces.forEach((f, k) => {
    f.forEach((i, m) => {
      const j = f[(m + 1) % f.length]!;
      const list = byEdge.get(key(i, j)) ?? [];
      list.push({ f: k, i, j });
      byEdge.set(key(i, j), list);
    });
  });
  for (const [e, list] of byEdge) {
    if (list.length !== 2) throw new MeshError(`edge ${e} belongs to ${list.length} face(s) -- every edge of a closed polyhedron is shared by exactly two`);
  }
  // Orient by flooding: a neighbour runs the shared edge the other way.
  const flip = new Array<boolean | undefined>(mesh.faces.length).fill(undefined);
  for (let seed = 0; seed < mesh.faces.length; seed += 1) {
    if (flip[seed] !== undefined) continue;
    flip[seed] = false;
    const queue = [seed];
    while (queue.length > 0) {
      const f = queue.shift()!;
      const face = mesh.faces[f]!;
      face.forEach((i, m) => {
        const j = face[(m + 1) % face.length]!;
        const [a, b] = flip[f] ? [j, i] : [i, j];
        for (const other of byEdge.get(key(i, j))!) {
          if (other.f === f) continue;
          // `other` must run b → a once flipped as decided.
          const want = other.i === b && other.j === a ? false : true;
          if (flip[other.f] === undefined) {
            flip[other.f] = want;
            queue.push(other.f);
          } else if (flip[other.f] !== want) throw new MeshError(`faces cannot be oriented consistently (at edge ${key(i, j)}) -- the surface is one-sided`);
        }
      });
    }
  }
  let faces = mesh.faces.map((f, k) => (flip[k] ? [...f].reverse() : [...f]));
  if (signedVolume(V, faces) < 0) faces = faces.map((f) => [...f].reverse());
  return { vertices: [...V], faces };
}

function signedVolume(V: readonly Vec3[], faces: readonly number[][]): number {
  let s = 0;
  for (const f of faces) {
    const a = V[f[0]!]!;
    for (let k = 1; k < f.length - 1; k += 1) s += dot(a, cross3(V[f[k]!]!, V[f[k + 1]!]!));
  }
  return s / 6;
}

/** Unit outward normals of an oriented mesh. */
export function meshNormals(mesh: Mesh): Vec3[] {
  return mesh.faces.map((f) => {
    const n = newellNormal(mesh.vertices, f);
    return scale(n, 1 / length(n));
  });
}

export type MeshEdge = { i: number; j: number; faces: number[] };

export function meshEdges(mesh: Mesh): MeshEdge[] {
  const by = new Map<string, MeshEdge>();
  mesh.faces.forEach((face, f) => {
    face.forEach((i, k) => {
      const j = face[(k + 1) % face.length]!;
      const e = by.get(key(i, j)) ?? { i: Math.min(i, j), j: Math.max(i, j), faces: [] };
      e.faces.push(f);
      by.set(key(i, j), e);
    });
  });
  return [...by.values()];
}

const cross2 = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];

function distToSegment2(p: Vec2, a: Vec2, b: Vec2): number {
  const d: Vec2 = [b[0] - a[0], b[1] - a[1]];
  const L = d[0] * d[0] + d[1] * d[1];
  const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / L));
  return Math.hypot(p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1]);
}

/** Is p strictly inside the polygon (any winding, convex or not), farther than `margin` from every side? */
export function insidePolygon(poly: readonly Vec2[], p: Vec2, margin = 1e-9): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (distToSegment2(p, a, b) <= margin) return false;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

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

export type EdgePiece = { a: Vec3; b: Vec3; visible: boolean };
export type SeenEdge = MeshEdge & { pieces: EdgePiece[] };

/**
 * Hidden-line removal for one closed, oriented polyhedron. An edge with no
 * front face is hidden whole. Otherwise it is cut where its image crosses the
 * outline of a front face it does not belong to, or pierces that face's
 * plane, and each piece is hidden when its midpoint's image is strictly
 * inside such a face and the face is nearer the reader there.
 */
export function seeEdges(camera: Camera, mesh: Mesh): SeenEdge[] {
  const V = mesh.vertices;
  const normals = meshNormals(mesh);
  const front = normals.map((n) => facesViewer(camera, n));
  const pages = mesh.faces.map((f) => f.map((i) => project(camera, V[i]!)));
  const span = Math.max(1e-300, ...[0, 1, 2].map((i) => Math.max(...V.map((p) => p[i]!)) - Math.min(...V.map((p) => p[i]!))));
  const margin = 1e-7 * span;
  return meshEdges(mesh).map((e) => {
    const a = V[e.i]!;
    const b = V[e.j]!;
    if (!e.faces.some((f) => front[f])) return { ...e, pieces: [{ a, b, visible: false }] };
    const occluders = mesh.faces.map((_, f) => f).filter((f) => front[f] && !e.faces.includes(f));
    const pa = project(camera, a);
    const pb = project(camera, b);
    const d = sub(b, a);
    const ts = new Set<number>([0, 1]);
    for (const f of occluders) {
      const n = normals[f]!;
      const p0 = V[mesh.faces[f]![0]!]!;
      const denom = dot(n, d);
      if (Math.abs(denom) > 1e-15) {
        const t = dot(n, sub(p0, a)) / denom;
        if (t > 0 && t < 1) ts.add(t);
      }
      const poly = pages[f]!;
      for (let k = 0; k < poly.length; k += 1) {
        const t = crossingParam(pa, pb, poly[k]!, poly[(k + 1) % poly.length]!);
        if (t !== null && t > 0 && t < 1) ts.add(t);
      }
    }
    const sorted = [...ts].sort((x, y) => x - y).filter((t, k, arr) => k === 0 || t - arr[k - 1]! > 1e-9);
    const at = (t: number): Vec3 => add(a, scale(d, t));
    const raw: EdgePiece[] = [];
    for (let k = 0; k < sorted.length - 1; k += 1) {
      const mid = at((sorted[k]! + sorted[k + 1]!) / 2);
      const page = project(camera, mid);
      const own = depth(camera, mid);
      const hidden = occluders.some((f) => {
        if (!insidePolygon(pages[f]!, page, margin)) return false;
        const dd = planeDepthAt(camera, V[mesh.faces[f]![0]!]!, normals[f]!, page);
        return dd !== null && dd > own + 1e-9 * span;
      });
      raw.push({ a: at(sorted[k]!), b: at(sorted[k + 1]!), visible: !hidden });
    }
    const merged: EdgePiece[] = [];
    for (const p of raw) {
      const last = merged[merged.length - 1];
      if (last !== undefined && last.visible === p.visible) merged[merged.length - 1] = { ...last, b: p.b };
      else merged.push(p);
    }
    return { ...e, pieces: merged };
  });
}

/**
 * Is a face's point seen? A front face can still be covered by a nearer
 * front face of a non-convex body; used for tinting only the faces a reader sees.
 */
export function faceSeenAt(camera: Camera, mesh: Mesh, f: number, p: Vec3): boolean {
  const normals = meshNormals(mesh);
  if (!facesViewer(camera, normals[f]!)) return false;
  const page = project(camera, p);
  const own = depth(camera, p);
  const V = mesh.vertices;
  return !mesh.faces.some((face, g) => {
    if (g === f || !facesViewer(camera, normals[g]!)) return false;
    if (!insidePolygon(face.map((i) => project(camera, V[i]!)), page, 1e-9)) return false;
    const dd = planeDepthAt(camera, V[face[0]!]!, normals[g]!, page);
    return dd !== null && dd > own + 1e-9;
  });
}

// ---- exact measures from typed coordinates -------------------------------------------

const xv = (p: Vec3): [Exact, Exact, Exact] => [rat(p[0]), rat(p[1]), rat(p[2])];

function xcross(a: [Exact, Exact, Exact], b: [Exact, Exact, Exact]): [Exact, Exact, Exact] {
  return [xsub(mul(a[1], b[2]), mul(a[2], b[1])), xsub(mul(a[2], b[0]), mul(a[0], b[2])), xsub(mul(a[0], b[1]), mul(a[1], b[0]))];
}

const xdot = (a: [Exact, Exact, Exact], b: [Exact, Exact, Exact]): Exact => xadd(xadd(mul(a[0], b[0]), mul(a[1], b[1])), mul(a[2], b[2]));

/** The volume of an oriented closed mesh, exact from its coordinates: Σ a·(b × c)/6 over a fan of each face. */
export function meshVolume(mesh: Mesh): Exact {
  let s: Exact = rat(0);
  for (const f of mesh.faces) {
    const a = xv(mesh.vertices[f[0]!]!);
    for (let k = 1; k < f.length - 1; k += 1) s = xadd(s, xdot(a, xcross(xv(mesh.vertices[f[k]!]!), xv(mesh.vertices[f[k + 1]!]!))));
  }
  return xscale(s, 1 / 6);
}

/** The area of one face, exact: half the length of its Newell normal. */
export function faceArea(mesh: Mesh, f: number): Exact {
  const face = mesh.faces[f]!;
  let n: [Exact, Exact, Exact] = [rat(0), rat(0), rat(0)];
  face.forEach((i, k) => {
    const c = xcross(xv(mesh.vertices[i]!), xv(mesh.vertices[face[(k + 1) % face.length]!]!));
    n = [xadd(n[0], c[0]), xadd(n[1], c[1]), xadd(n[2], c[2])];
  });
  return xscale(xsqrt(xdot(n, n)), 1 / 2);
}

export function meshArea(mesh: Mesh): Exact {
  return mesh.faces.reduce<Exact>((s, _, f) => xadd(s, faceArea(mesh, f)), rat(0));
}

const POLYGON: Record<number, [string, string]> = {
  3: ["triângulo", "triângulos"],
  4: ["quadrilátero", "quadriláteros"],
  5: ["pentágono", "pentágonos"],
  6: ["hexágono", "hexágonos"],
  7: ["heptágono", "heptágonos"],
  8: ["octógono", "octógonos"],
  9: ["eneágono", "eneágonos"],
  10: ["decágono", "decágonos"],
  12: ["dodecágono", "dodecágonos"],
};

/** Is face f a regular polygon (all sides and all vertex-to-centre distances equal)? */
export function isRegularFace(mesh: Mesh, f: number, tolerance = 1e-7): boolean {
  const pts = mesh.faces[f]!.map((i) => mesh.vertices[i]!);
  const c = scale(pts.reduce<Vec3>((s, p) => add(s, p), [0, 0, 0]), 1 / pts.length);
  const sides = pts.map((p, k) => length(sub(pts[(k + 1) % pts.length]!, p)));
  const radii = pts.map((p) => length(sub(p, c)));
  const ok = (xs: number[]): boolean => Math.max(...xs) - Math.min(...xs) <= tolerance * Math.max(...xs);
  return ok(sides) && ok(radii);
}

/** "4 triângulos, 5 quadrados": the faces counted by kind, a regular quadrilateral named a square. */
export function faceCensus(mesh: Mesh): string {
  const counts = new Map<string, { n: number; sides: number; words: [string, string] }>();
  mesh.faces.forEach((face, f) => {
    const sides = face.length;
    const words: [string, string] = sides === 4 && isRegularFace(mesh, f) ? ["quadrado", "quadrados"] : POLYGON[sides] ?? [`polígono de ${sides} lados`, `polígonos de ${sides} lados`];
    const k = words[0];
    const c = counts.get(k) ?? { n: 0, sides, words };
    c.n += 1;
    counts.set(k, c);
  });
  return [...counts.values()]
    .sort((a, b) => a.sides - b.sides)
    .map((c) => `${c.n} ${c.n === 1 ? c.words[0] : c.words[1]}`)
    .join(", ");
}

// ---- the stair ---------------------------------------------------------------------------

/**
 * A stair of `steps` steps, each `tread` deep (along x) and `riser` high,
 * `width` wide (along y): the stair profile in the xz plane extruded across
 * y. The first step is nearest the reader (largest x) and the stair climbs
 * away from them, toward a wall at its back, as the textbook draws it.
 * `at` is the centre of its footprint.
 */
export function stairsMesh(at: Vec3, steps: number, tread: number, riser: number, width: number): Mesh {
  const run = steps * tread;
  const xf = at[0] + run / 2;
  const profile: [number, number][] = [[xf, 0]];
  for (let k = 0; k < steps; k += 1) {
    profile.push([xf - k * tread, (k + 1) * riser]);
    profile.push([xf - (k + 1) * tread, (k + 1) * riser]);
  }
  profile.push([xf - run, 0]);
  // Merge the last tread's back corner with the back wall: (xb, n·riser) is already there.
  const m = profile.length;
  const left = profile.map(([x, z]) => [x, at[1] - width / 2, at[2] + z] as Vec3);
  const right = profile.map(([x, z]) => [x, at[1] + width / 2, at[2] + z] as Vec3);
  const vertices = [...left, ...right];
  const faces: number[][] = [
    profile.map((_, k) => k),
    profile.map((_, k) => m + k),
    ...profile.map((_, k) => [k, (k + 1) % m, m + ((k + 1) % m), m + k]),
  ];
  return { vertices, faces };
}
