/**
 * The geometry of a surface z = f(x, y), with no drawing in it: the sampled
 * grid, which cells are honest to draw, the painter's order, and which
 * points of a line the painted surface hides (ADR 0048).
 *
 * ## Why painter's order is exact here
 *
 * Every camera is a parallel projection whose kernel `toward` has a
 * horizontal part h = (toward_x, toward_y) ≠ 0 (an orthographic camera
 * cannot look straight down; the preset refuses a camera that does not look
 * from above). Along a viewing ray, the horizontal position moves along h,
 * so on a ray the point nearer the reader is the one with the larger
 * s = h · (x, y). For a HEIGHT FIELD -- one z per (x, y) -- a ray meets
 * the surface at most once per horizontal position, so the surface points on
 * one ray are ordered by s alone. A straight horizontal track crosses the
 * cells of a regular grid in steps of +i or +j only (for h with positive
 * parts; mirrored otherwise), and each such step raises the centre's s. So
 * sorting cells by the s of their centres paints every ray back to front:
 * exact, up to the one cell a track can straddle. Ties -- cells of two
 * height fields over the same rectangle (the surface and its tangent
 * plane) -- are broken by height: a ray coming down from the reader meets
 * the higher one first, so the lower is painted first.
 *
 * What it cannot do, and the preset therefore refuses: a surface with two
 * z over one (x, y) (a sphere, a torus, x = g(y, z)), or one that crosses
 * another inside a cell (the error is then one cell).
 *
 * ## Which line points are hidden
 *
 * A line is drawn after every fill, and only where the fills would not
 * have painted over it. A point p with painter position `own` is hidden
 * exactly when a cell painted after `own` covers p's page image -- the same
 * rule the fills obey, so a line and the surface it runs on never disagree.
 * A point ON the surface takes the position of its own cell; any other
 * point (an axis, the floor, a guide) the position its (s, z) key would have
 * in the sorted list. Page containment is tested with a small inset, so a
 * grid line on the edge two cells share is not hidden by the nearer one.
 */

import { distanceToSegment, pointInPolygon } from "../../geometry/hit.ts";
import type { Point } from "../../ir/types.ts";
import type { Camera } from "../../geometry/projection.ts";
import { project } from "../../geometry/projection.ts";
import type { Vec2, Vec3 } from "../../geometry/vec.ts";

export type Fn2 = (x: number, y: number) => number;
export type Range = [number, number];

// ---- sampling ----------------------------------------------------------------

export type Grid = {
  nx: number;
  ny: number;
  xs: number[];
  ys: number[];
  /** z[i][j] = f(xs[i], ys[j]); NaN where f is not a finite number. */
  z: number[][];
};

export function finiteOr(f: Fn2): Fn2 {
  return (x, y) => {
    const v = f(x, y);
    return Number.isFinite(v) ? v : Number.NaN;
  };
}

export function sampleGrid(f: Fn2, xr: Range, yr: Range, nx: number, ny: number): Grid {
  const xs = Array.from({ length: nx + 1 }, (_, i) => xr[0] + ((xr[1] - xr[0]) * i) / nx);
  const ys = Array.from({ length: ny + 1 }, (_, j) => yr[0] + ((yr[1] - yr[0]) * j) / ny);
  const g = finiteOr(f);
  return { nx, ny, xs, ys, z: xs.map((x) => ys.map((y) => g(x, y))) };
}

/**
 * Is f continuous along the segment t ↦ g(t), t ∈ [0, 1]?
 *
 * Seventeen samples must all be finite. Then the widest step between
 * neighbours is followed by bisection, always into the half with the larger
 * step, fifty times. A continuous function's step shrinks with the
 * interval, to rounding noise; a pole's grows and a jump's stays. The step
 * left over is compared with the size of the values involved -- the same
 * reasoning `contour.ts` uses to tell a crossing from a pole. So a cell is
 * never drawn across a place where f jumps or blows up.
 */
export function segmentContinuous(g: (t: number) => number): boolean {
  const n = 16;
  const vals: number[] = [];
  for (let k = 0; k <= n; k += 1) {
    const v = g(k / n);
    if (!Number.isFinite(v)) return false;
    vals.push(v);
  }
  let k = 0;
  for (let m = 1; m < n; m += 1) if (Math.abs(vals[m + 1]! - vals[m]!) > Math.abs(vals[k + 1]! - vals[k]!)) k = m;
  let lo = k / n;
  let hi = (k + 1) / n;
  let a = vals[k]!;
  let b = vals[k + 1]!;
  const scale = Math.max(1, ...vals.map(Math.abs));
  for (let it = 0; it < 50; it += 1) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    const m = g(mid);
    if (!Number.isFinite(m)) return false;
    if (Math.abs(m - a) >= Math.abs(b - m)) {
      hi = mid;
      b = m;
    } else {
      lo = mid;
      a = m;
    }
  }
  return Math.abs(b - a) <= 1e-6 * Math.max(scale, Math.abs(a), Math.abs(b));
}

// ---- cells --------------------------------------------------------------------

export type Field = "surface" | "plane";

export type Cell = {
  id: string;
  field: Field;
  i: number;
  j: number;
  /** The cell's rectangle in the (x, y) plane. */
  rect: { x: Range; y: Range };
  /** The polygon drawn: the quad's corners with their heights, clipped to the z range. World coordinates, unscaled. */
  poly: Vec3[];
  /** (x, y) of the rectangle's centre and the mean height of the drawn polygon. */
  centre: Vec3;
  /** Painter's key: s of the centre, then height (see the module note). */
  s: number;
  zKey: number;
  /** Position in the painter's order, 0 = painted first. */
  order: number;
};

/** Sutherland–Hodgman against one half-space `inside(p) ≥ 0`, with linear interpolation along each edge. */
export function clipPoly(poly: Vec3[], side: (p: Vec3) => number): Vec3[] {
  const out: Vec3[] = [];
  for (let k = 0; k < poly.length; k += 1) {
    const a = poly[k]!;
    const b = poly[(k + 1) % poly.length]!;
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

export function clipToZ(poly: Vec3[], zr: Range): Vec3[] {
  return clipPoly(clipPoly(poly, (p) => p[2] - zr[0]), (p) => zr[1] - p[2]);
}

/** Where f stops being defined along a grid edge whose other end it is defined at. */
export type EdgeEnd = { p: Vec3; fromStart: boolean };

export type SurfaceMesh = {
  grid: Grid;
  /** hOk[i][j]: f is finite and continuous along (xs[i], ys[j]) → (xs[i+1], ys[j]). */
  hOk: boolean[][];
  /** vOk[i][j]: along (xs[i], ys[j]) → (xs[i], ys[j+1]). */
  vOk: boolean[][];
  /** On an edge with one end undefined: the last point where f is, found by bisection, if f is continuous up to it. */
  hEnd: (EdgeEnd | null)[][];
  vEnd: (EdgeEnd | null)[][];
  /** cellOk[i][j]: the whole cell [xs[i], xs[i+1]] × [ys[j], ys[j+1]] may be drawn. */
  cellOk: boolean[][];
  /** The polygon drawn for each cell: its four corners, the defined part of a cell at the edge of f's domain, or null. */
  cellPoly: (Vec3[] | null)[][];
  /** Cells not drawn whole: f is undefined on part of them, or jumps or blows up there. */
  holes: number;
};

/**
 * The last point from `a` (where f is defined) toward `b` (where it is not)
 * at which f is still a number: bisection on "is finite", forty halvings.
 * Null when f is not continuous on the way (a pole before the edge of the
 * domain), so nothing is joined across it.
 */
export function edgeEnd(g: Fn2, a: [number, number], b: [number, number]): Vec3 | null {
  let lo = 0;
  let hi = 1;
  for (let it = 0; it < 40; it += 1) {
    const mid = (lo + hi) / 2;
    if (Number.isFinite(g(a[0] + (b[0] - a[0]) * mid, a[1] + (b[1] - a[1]) * mid))) lo = mid;
    else hi = mid;
  }
  // f defined only at the corner itself (√(4 − x² − y²) on the circle): the edge ends there.
  if (lo === 0) return [a[0], a[1], g(a[0], a[1])];
  const x = a[0] + (b[0] - a[0]) * lo;
  const y = a[1] + (b[1] - a[1]) * lo;
  if (!segmentContinuous((t) => g(a[0] + (x - a[0]) * t, a[1] + (y - a[1]) * t))) return null;
  return [x, y, g(x, y)];
}

/** Which edges and cells of the grid f may be drawn across. */
export function meshOf(f: Fn2, grid: Grid): SurfaceMesh {
  const { nx, ny, xs, ys, z } = grid;
  const g = finiteOr(f);
  const along = (x0: number, y0: number, x1: number, y1: number): boolean => segmentContinuous((t) => g(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t));
  const fin = (i: number, j: number): boolean => Number.isFinite(z[i]![j]!);
  const hOk = xs.slice(0, nx).map((_, i) => ys.map((_, j) => fin(i, j) && fin(i + 1, j) && along(xs[i]!, ys[j]!, xs[i + 1]!, ys[j]!)));
  const vOk = xs.map((_, i) => ys.slice(0, ny).map((_, j) => fin(i, j) && fin(i, j + 1) && along(xs[i]!, ys[j]!, xs[i]!, ys[j + 1]!)));
  const end = (i0: number, j0: number, i1: number, j1: number): EdgeEnd | null => {
    if (fin(i0, j0) === fin(i1, j1)) return null;
    const fromStart = fin(i0, j0);
    const a: [number, number] = fromStart ? [xs[i0]!, ys[j0]!] : [xs[i1]!, ys[j1]!];
    const b: [number, number] = fromStart ? [xs[i1]!, ys[j1]!] : [xs[i0]!, ys[j0]!];
    const p = edgeEnd(g, a, b);
    return p === null ? null : { p, fromStart };
  };
  const hEnd = xs.slice(0, nx).map((_, i) => ys.map((_, j) => end(i, j, i + 1, j)));
  const vEnd = xs.map((_, i) => ys.slice(0, ny).map((_, j) => end(i, j, i, j + 1)));
  let holes = 0;
  const cellPoly: (Vec3[] | null)[][] = [];
  const cellOk = xs.slice(0, nx).map((_, i) => {
    const row: (Vec3[] | null)[] = [];
    cellPoly.push(row);
    return ys.slice(0, ny).map((_, j) => {
      const ok =
        hOk[i]![j]! &&
        hOk[i]![j + 1]! &&
        vOk[i]![j]! &&
        vOk[i + 1]![j]! &&
        // Both diagonals: a pole at a cell's centre touches no edge.
        along(xs[i]!, ys[j]!, xs[i + 1]!, ys[j + 1]!) &&
        along(xs[i + 1]!, ys[j]!, xs[i]!, ys[j + 1]!);
      const corner = (a: number, b: number): Vec3 => [xs[a]!, ys[b]!, z[a]![b]!];
      if (ok) {
        row.push([corner(i, j), corner(i + 1, j), corner(i + 1, j + 1), corner(i, j + 1)]);
        return true;
      }
      holes += 1;
      // The defined part of a cell at the edge of f's domain: walk the four
      // corners, keep the defined ones, and where an edge leaves the domain
      // add the point where it does. Refused when an edge between two
      // defined corners is broken (a jump), or an edge's end was not found.
      const ring: { c: [number, number]; ok: boolean; end: EdgeEnd | null }[] = [
        { c: [i, j], ok: hOk[i]![j]!, end: hEnd[i]![j]! },
        { c: [i + 1, j], ok: vOk[i + 1]![j]!, end: vEnd[i + 1]![j]! },
        { c: [i + 1, j + 1], ok: hOk[i]![j + 1]!, end: hEnd[i]![j + 1]! },
        { c: [i, j + 1], ok: vOk[i]![j]!, end: vEnd[i]![j]! },
      ];
      const poly: Vec3[] = [];
      let broken = false;
      ring.forEach((e, k) => {
        const next = ring[(k + 1) % 4]!.c;
        const here = fin(e.c[0], e.c[1]);
        const there = fin(next[0], next[1]);
        if (here) poly.push(corner(e.c[0], e.c[1]));
        if (here && there && !e.ok) broken = true;
        if (here !== there) {
          if (e.end === null) broken = true;
          else poly.push(e.end.p);
        }
      });
      row.push(!broken && poly.length >= 3 ? poly : null);
      return false;
    });
  });
  return { grid, hOk, vOk, hEnd, vEnd, cellOk, cellPoly, holes };
}

/** The painter's key of a point: s = h · (x, y), then height, signed so the one a ray from the reader meets first sorts later. */
export function keyOf(camera: Camera, p: Vec3): { s: number; zKey: number } {
  return { s: camera.toward[0] * p[0] + camera.toward[1] * p[1], zKey: Math.sign(camera.toward[2]) * p[2] };
}

function makeCell(camera: Camera, field: Field, i: number, j: number, rect: { x: Range; y: Range }, corners: Vec3[], zr: Range): Cell | null {
  const poly = clipToZ(corners, zr);
  if (poly.length < 3) return null;
  const cx = (rect.x[0] + rect.x[1]) / 2;
  const cy = (rect.y[0] + rect.y[1]) / 2;
  const cz = poly.reduce((acc, p) => acc + p[2], 0) / poly.length;
  const centre: Vec3 = [cx, cy, cz];
  const k = keyOf(camera, centre);
  return { id: `${field === "surface" ? "s" : "t"}-${i}-${j}`, field, i, j, rect, poly, centre, s: k.s, zKey: k.zKey, order: -1 };
}

/** The surface's drawable cells, each clipped to the z range. Cells wholly outside the range are dropped (clipped, not holes). */
export function surfaceCells(camera: Camera, mesh: SurfaceMesh, zr: Range): Cell[] {
  const { xs, ys, nx, ny } = mesh.grid;
  const out: Cell[] = [];
  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < ny; j += 1) {
      const corners = mesh.cellPoly[i]![j]!;
      if (corners === null) continue;
      const c = makeCell(camera, "surface", i, j, { x: [xs[i]!, xs[i + 1]!], y: [ys[j]!, ys[j + 1]!] }, corners, zr);
      if (c !== null) out.push(c);
    }
  }
  return out;
}

/** Cells of a plane z = a + b(x − x0) + c(y − y0) over the grid cells [i0, i1) × [j0, j1), on the surface's own rectangles so the two share keys. */
export function planeCells(camera: Camera, grid: Grid, plane: (x: number, y: number) => number, ii: Range, jj: Range, zr: Range): Cell[] {
  const out: Cell[] = [];
  const { xs, ys } = grid;
  for (let i = ii[0]; i < ii[1]; i += 1) {
    for (let j = jj[0]; j < jj[1]; j += 1) {
      const corner = (a: number, b: number): Vec3 => [xs[a]!, ys[b]!, plane(xs[a]!, ys[b]!)];
      const c = makeCell(camera, "plane", i, j, { x: [xs[i]!, xs[i + 1]!], y: [ys[j]!, ys[j + 1]!] }, [corner(i, j), corner(i + 1, j), corner(i + 1, j + 1), corner(i, j + 1)], zr);
      if (c !== null) out.push(c);
    }
  }
  return out;
}

/**
 * How the tangent plane's cells are ordered against the surface's.
 *
 *  - "merged": one list by key, as for any two height fields. Exact to a
 *    cell -- which is not enough where the two nearly coincide: around the
 *    point of tangency, cells of one field a step nearer overlap cells of
 *    the other on the page, and paint through each other in a grid.
 *  - "plane-first" / "plane-last": the plane is painted wholly behind or
 *    wholly in front of the surface. The preset chooses one only when, over
 *    the plane's patch, the surface lies on one side of the plane AND is
 *    seen from one side (no silhouette crosses the patch). Then along every
 *    ray through the patch the two never swap: the plane is on the reader's
 *    side exactly when it is above a surface seen from above, or below a
 *    surface seen from beneath (a bowl's outer wall). What it assumes, and
 *    ADR 0048 states: no OTHER part of the surface passes between the
 *    reader and the patch.
 */
export type Stacking = "merged" | "plane-first" | "plane-last";

function keyCompare(a: { s: number; zKey: number }, b: { s: number; zKey: number }): number {
  return a.s - b.s || a.zKey - b.zKey;
}

/** Sort far to near and number the order. Returns the same array. */
export function painterSort(cells: Cell[], stacking: Stacking = "merged"): Cell[] {
  const byKey = (a: Cell, b: Cell): number => keyCompare(a, b) || (a.field === b.field ? 0 : a.field === "plane" ? -1 : 1);
  if (stacking === "merged") cells.sort(byKey);
  else {
    const surface = cells.filter((c) => c.field === "surface").sort(byKey);
    const plane = cells.filter((c) => c.field === "plane").sort(byKey);
    cells.splice(0, cells.length, ...(stacking === "plane-first" ? [...plane, ...surface] : [...surface, ...plane]));
  }
  cells.forEach((c, k) => {
    c.order = k;
  });
  return cells;
}

// ---- the upward normal and a light ---------------------------------------------

/** The cell's upward normal in the DRAWN world (z scaled by k), from its diagonals. */
export function cellNormal(c: Cell, k: number): Vec3 {
  const p = c.poly.map((q): Vec3 => [q[0], q[1], q[2] * k]);
  // Newell's method: robust for the clipped (possibly five- or six-sided) polygon.
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let a = 0; a < p.length; a += 1) {
    const u = p[a]!;
    const v = p[(a + 1) % p.length]!;
    nx += (u[1] - v[1]) * (u[2] + v[2]);
    ny += (u[2] - v[2]) * (u[0] + v[0]);
    nz += (u[0] - v[0]) * (u[1] + v[1]);
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  const n: Vec3 = [nx / len, ny / len, nz / len];
  return n[2] < 0 ? [-n[0], -n[1], -n[2]] : n;
}

// ---- visibility -------------------------------------------------------------------

type Indexed = { cell: Cell; page: Vec2[]; poly: Point[]; lo: Vec2; hi: Vec2 };

/** Where a point sits in the painter's order; `home` names its own cells when it lies on a field. */
export type Position = {
  /** The point's own painter key. */
  key: { s: number; zKey: number };
  /** The field the point lies on; absent for a point on none (an axis, the floor, a guide). */
  field?: Field;
  /** On a field: the latest paint position among its own cells there. */
  order?: number;
  /** On a field: its own cells' grid indices. */
  home?: [number, number][];
  /** The point lies on BOTH fields (the point of tangency): neither hides it where they touch. */
  both?: boolean;
};

/**
 * The painted surface as an occluder. Page coordinates here are the
 * camera's own (math units, y up) of the DRAWN world (z scaled by k);
 * `inset` is in the same units.
 */
export class Occluder {
  private readonly items: Indexed[];
  private readonly buckets = new Map<string, number[]>();
  private readonly size: number;
  private readonly bySurface = new Map<string, Cell[]>();

  private readonly camera: Camera;
  private readonly k: number;
  private readonly inset: number;

  private readonly stacking: Stacking;

  constructor(camera: Camera, k: number, cells: Cell[], inset: number, stacking: Stacking = "merged") {
    this.stacking = stacking;
    this.camera = camera;
    this.k = k;
    this.inset = inset;
    this.items = cells.map((cell) => {
      const page = cell.poly.map((q) => project(camera, [q[0], q[1], q[2] * k]));
      const lo: Vec2 = [Math.min(...page.map((q) => q[0])), Math.min(...page.map((q) => q[1]))];
      const hi: Vec2 = [Math.max(...page.map((q) => q[0])), Math.max(...page.map((q) => q[1]))];
      return { cell, page, poly: page.map((q) => ({ x: q[0], y: q[1] })), lo, hi };
    });
    const span = Math.max(1e-9, ...this.items.map((it) => Math.max(it.hi[0] - it.lo[0], it.hi[1] - it.lo[1])));
    this.size = span;
    this.items.forEach((it, n) => {
      for (let bx = Math.floor(it.lo[0] / span); bx <= Math.floor(it.hi[0] / span); bx += 1) {
        for (let by = Math.floor(it.lo[1] / span); by <= Math.floor(it.hi[1] / span); by += 1) {
          const key = `${bx},${by}`;
          if (!this.buckets.has(key)) this.buckets.set(key, []);
          this.buckets.get(key)!.push(n);
        }
      }
    });
    for (const c of cells) {
      const key = `${c.field}:${c.i},${c.j}`;
      if (!this.bySurface.has(key)) this.bySurface.set(key, []);
      this.bySurface.get(key)!.push(c);
    }
  }

  /** The page point (camera units) of a world point, z scaled. */
  page(p: Vec3): Vec2 {
    return project(this.camera, [p[0], p[1], p[2] * this.k]);
  }

  /**
   * The painter position of a point lying ON a field: the latest of the
   * cells of that field whose rectangle holds (x, y) (two on a shared edge,
   * four at a shared corner). Null where the field has no cell there (a
   * hole, or clipped away).
   */
  onField(field: Field, grid: Grid, x: number, y: number, z: number): Position | null {
    const { xs, ys, nx, ny } = grid;
    const dx = (xs[nx]! - xs[0]!) / nx;
    const dy = (ys[ny]! - ys[0]!) / ny;
    const fi = (x - xs[0]!) / dx;
    const fj = (y - ys[0]!) / dy;
    const eps = 1e-7;
    const is = new Set([Math.floor(fi + eps), Math.floor(fi - eps)].map((v) => Math.min(nx - 1, Math.max(0, v))));
    const js = new Set([Math.floor(fj + eps), Math.floor(fj - eps)].map((v) => Math.min(ny - 1, Math.max(0, v))));
    let best: number | null = null;
    const home: [number, number][] = [];
    for (const i of is) {
      for (const j of js) {
        for (const c of this.bySurface.get(`${field}:${i},${j}`) ?? []) {
          best = best === null ? c.order : Math.max(best, c.order);
          home.push([i, j]);
        }
      }
    }
    return best === null ? null : { key: keyOf(this.camera, [x, y, z]), field, order: best, home };
  }

  /** The painter position of a point on no field: its key alone decides, cell by cell. */
  free(p: Vec3): Position {
    return { key: keyOf(this.camera, p) };
  }

  /** Is cell c painted after (nearer than) the point at `pos`? See `Stacking`. */
  private after(c: Cell, pos: Position): boolean {
    if (pos.field === undefined) return keyCompare(c, pos.key) > 0;
    if (c.field === pos.field) return c.order > pos.order!;
    if (pos.both === true && pos.home!.some(([i, j]) => Math.abs(i - c.i) <= 1 && Math.abs(j - c.j) <= 1)) return false;
    if (this.stacking === "merged") return keyCompare(c, pos.key) > 0;
    if (this.stacking === "plane-first") return c.field === "surface";
    return c.field === "plane";
  }

  /**
   * Is the point p covered by a cell painted after its position? Plain page
   * containment -- except against a cell next to the point's own cells in the
   * grid, which must hold the point by more than `inset`: a grid line on the
   * edge two cells share lies in both images, and is not hidden by the
   * nearer one. A cell folded over from further away (a silhouette) holds
   * it deep inside and still hides it.
   */
  hidden(p: Vec3, pos: Position): boolean {
    const q = this.page(p);
    const qp = { x: q[0], y: q[1] };
    const key = `${Math.floor(q[0] / this.size)},${Math.floor(q[1] / this.size)}`;
    for (const n of this.buckets.get(key) ?? []) {
      const it = this.items[n]!;
      if (!this.after(it.cell, pos)) continue;
      if (q[0] < it.lo[0] || q[0] > it.hi[0] || q[1] < it.lo[1] || q[1] > it.hi[1]) continue;
      if (!pointInPolygon(qp, it.poly)) continue;
      const c = it.cell;
      const neighbour = pos.home !== undefined && pos.field === c.field && pos.home.some(([i, j]) => Math.abs(i - c.i) <= 1 && Math.abs(j - c.j) <= 1);
      if (!neighbour) return true;
      let clear = true;
      for (let a = 0; a < it.page.length; a += 1) {
        if (distanceToSegment(qp, it.poly[a]!, it.poly[(a + 1) % it.poly.length]!) < this.inset) {
          clear = false;
          break;
        }
      }
      if (clear) return true;
    }
    return false;
  }
}

// ---- lines -----------------------------------------------------------------------

/** A 3D polyline point with its painter position; null drops the point (it is in a hole). */
export type LinePoint = { p: Vec3; own: Position | null };

/**
 * Split a polyline into the runs a reader sees. Consecutive visible points
 * form a run; where visibility changes between two samples the run ends
 * halfway between them. A point with no position breaks the line.
 */
export function visibleRuns(pts: LinePoint[], occ: Occluder): Vec3[][] {
  const runs: Vec3[][] = [];
  let cur: Vec3[] = [];
  let prev: { p: Vec3; vis: boolean } | null = null;
  const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const flush = (): void => {
    if (cur.length >= 2) runs.push(cur);
    cur = [];
  };
  for (const lp of pts) {
    if (lp.own === null) {
      flush();
      prev = null;
      continue;
    }
    const vis = !occ.hidden(lp.p, lp.own);
    if (prev !== null && prev.vis !== vis) {
      const m = mid(prev.p, lp.p);
      if (prev.vis) {
        cur.push(m);
        flush();
      } else {
        cur = [m];
      }
    }
    if (vis) cur.push(lp.p);
    prev = { p: lp.p, vis };
  }
  flush();
  return runs;
}

/** Insert points so no step of the polyline is longer than `step` on the page (camera units). */
export function densify(pts: Vec3[], page: (p: Vec3) => Vec2, step: number): Vec3[] {
  const out: Vec3[] = [];
  for (let a = 0; a < pts.length; a += 1) {
    const p = pts[a]!;
    if (a > 0) {
      const q = pts[a - 1]!;
      const pa = page(q);
      const pb = page(p);
      const n = Math.ceil(Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / step);
      for (let m = 1; m < n; m += 1) {
        const t = m / n;
        out.push([q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t, q[2] + (p[2] - q[2]) * t]);
      }
    }
    out.push(p);
  }
  return out;
}

/** Cut a polyline to the slab zr[0] ≤ z ≤ zr[1], interpolating where it leaves. */
export function clipLineToZ(pts: Vec3[], zr: Range): Vec3[][] {
  const out: Vec3[][] = [];
  let cur: Vec3[] = [];
  const inside = (p: Vec3): boolean => p[2] >= zr[0] - 1e-12 && p[2] <= zr[1] + 1e-12;
  const cross = (a: Vec3, b: Vec3): Vec3 => {
    const bound = b[2] > zr[1] || a[2] > zr[1] ? zr[1] : zr[0];
    const t = (bound - a[2]) / (b[2] - a[2]);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, bound];
  };
  for (let k = 0; k < pts.length; k += 1) {
    const p = pts[k]!;
    const prev = k > 0 ? pts[k - 1]! : null;
    if (inside(p)) {
      if (prev !== null && !inside(prev)) cur.push(cross(p, prev));
      cur.push(p);
    } else if (prev !== null && inside(prev)) {
      cur.push(cross(prev, p));
      if (cur.length >= 2) out.push(cur);
      cur = [];
    }
  }
  if (cur.length >= 2) out.push(cur);
  return out;
}

// ---- the tangent plane --------------------------------------------------------------

export type Tangent = { z0: number; fx: number; fy: number };

/**
 * Partial derivatives at (x0, y0) by central difference, with the one-sided
 * slopes compared first: where they disagree (a cone's tip, |x| + |y| at
 * the origin) f has no tangent plane, and none is drawn.
 */
export function tangentAt(f: Fn2, x0: number, y0: number): Tangent | { refused: string } {
  const z0 = f(x0, y0);
  if (!Number.isFinite(z0)) return { refused: `f is not defined at (${x0}, ${y0})` };
  const slope = (g: (t: number) => number, t0: number, which: string): number | string => {
    const h = 1e-5 * Math.max(1, Math.abs(t0));
    const fwd = (g(t0 + h * 10) - g(t0)) / (h * 10);
    const bwd = (g(t0) - g(t0 - h * 10)) / (h * 10);
    const central = (g(t0 + h) - g(t0 - h)) / (2 * h);
    if (![fwd, bwd, central].every(Number.isFinite)) return `f is not differentiable in ${which} there`;
    if (Math.abs(fwd - bwd) > 1e-3 * Math.max(1, Math.abs(central))) {
      return `the slope in ${which} from the left (${bwd.toFixed(3)}) and from the right (${fwd.toFixed(3)}) differ -- f has no tangent plane there`;
    }
    return central;
  };
  const fx = slope((t) => f(t, y0), x0, "x");
  if (typeof fx === "string") return { refused: fx };
  const fy = slope((t) => f(x0, t), y0, "y");
  if (typeof fy === "string") return { refused: fy };
  return { z0, fx, fy };
}
