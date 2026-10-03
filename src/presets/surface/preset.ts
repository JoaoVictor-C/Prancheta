/**
 * surface -- the graph of a function of two variables, z = f(x, y), as
 * Cálculo 2/3 textbooks draw it: a shaded mesh on three axes, its level
 * curves on the surface and projected onto a floor, a point on it with its
 * tangent plane (ADR 0048).
 *
 * The expression is the only geometry typed. Every mesh vertex is f at a
 * grid point; every level-curve vertex is found by `math/contour.ts` on the
 * (x, y) grid and lies where f = c; the point's height is f(x0, y0); the
 * tangent plane's coefficients are the partial derivatives, by central
 * difference, snapped exact. Hidden parts are decided by painting cells far
 * to near (`mesh.ts`), and every line is drawn only where the painted
 * surface would not cover it.
 */

import type { FigureSpec, Point, Rect, Scene } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { LOCALES, formatNumber, snapExact, writeExact } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import { ExprError, compileTree, constantValue, parseIn, pretty } from "../../math/expr.ts";
import { contour } from "../../math/contour.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";
import { layoutPanel } from "../shared/panel.ts";
import type { TextRun } from "../../ir/types.ts";
import { GeometryError, normalize } from "../../geometry/vec.ts";
import type { Vec2, Vec3 } from "../../geometry/vec.ts";
import { makeCamera, project, projectDirection } from "../../geometry/projection.ts";
import type { Camera, CameraSpec } from "../../geometry/projection.ts";
import { MARGIN, SpacePlacer, aroundPlace, besideRun } from "../space/placer.ts";
import { fitUnits, niceStep } from "../shared/scale.ts";
import { printExact, printTriple, typesANumber } from "../space/numbers.ts";
import { boxEdges } from "../space/preset.ts";
import { Occluder, cellNormal, clipLineToZ, densify, meshOf, painterSort, planeCells, sampleGrid, surfaceCells, tangentAt, visibleRuns } from "./mesh.ts";
import type { Cell, Fn2, LinePoint, Range, Stacking, Tangent } from "./mesh.ts";
import { distanceToPolyline, segmentHitsRect } from "../../geometry/hit.ts";

// ---- input --------------------------------------------------------------------

export type Bound = number | string;

export type SurfaceInput = {
  title?: string;
  locale?: Locale;
  /** f(x, y), in x and y: "x^2 + y^2", "e^(-(x^2 + y^2))", "xy". */
  expr: string;
  x: [Bound, Bound];
  y: [Bound, Bound];
  /** The visible height range; the surface is cut where it leaves it. Derived from f when omitted. */
  z?: [Bound, Bound];
  /** Drawn length of one unit of z, against one unit of x and y. Derived when omitted (a very tall or very flat graph is scaled to read). */
  zScale?: number;
  camera?: CameraSpec;
  /** Cells per side of the shaded mesh (default 24). */
  mesh?: number;
  /** Grid lines per side (default 12); must divide `mesh`. */
  lines?: number;
  axes?: { ticks?: boolean; names?: boolean };
  /** Levels c of the curves f(x, y) = c. */
  levels?: number[];
  /** Where the level curves are drawn: at their height on the surface, projected onto the floor, or both (default). */
  levelsOn?: "surface" | "floor" | "both";
  /** Height of the floor plane the level curves are projected onto; default the bottom of the z range. */
  floor?: Bound;
  /** A point on the surface: (x, y) typed, z computed. */
  point?: { name?: string; x: Bound; y: Bound; guide?: boolean; tangentPlane?: boolean };
  /** false: the question's figure -- the surface as given; no tangent plane or printed derivatives, no z of the point, no level values. Default true. */
  answers?: boolean;
};

// ---- palette -------------------------------------------------------------------

const PAPER = "#FCFBF7";
const INK = "#181B21";
const SOFT = "#4E5763";
const AXIS = "#3F4652";
const GUIDE = "#7A8494";
const MESH_LINE = "#33445C";
const LEVEL = "#B0261C";
const PLANE_LINE = "#2F6B3A";
/** Shade ramps, dark to light: the top of the surface, its underside, the tangent plane. */
const TOP: [string, string] = ["#567FB4", "#E1ECF8"];
const UNDER: [string, string] = ["#4C6A8E", "#BFCFE2"];
const PLANE: [string, string] = ["#6FA06F", "#DCEFD9"];

// ---- sizes (canvas px) -----------------------------------------------------------

const TARGET = 500;
const PAD = 64;
const DOT_R = 3.6;
const HEAD_LEN = 11;
const HEAD_HALF = 4.2;
const TICK_HALF = 4;
const CAPTION_LINE_H = 20;
/** Longest page step of a sampled line, px. */
const STEP_PX = 1.5;
/** How far inside a cell's page outline a point must be for that cell to hide it, px. */
const INSET_PX = 0.6;

const DEFAULT_CAMERA: CameraSpec = { kind: "orthographic", azimuth: 30, elevation: 26 };

function hex(c: string): [number, number, number] {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}
function mix(ramp: [string, string], t: number): string {
  const a = hex(ramp[0]);
  const b = hex(ramp[1]);
  const u = Math.max(0, Math.min(1, t));
  return `#${a.map((x, i) => Math.round(x + (b[i]! - x) * u).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function bound(raw: unknown, path: string): number {
  if (typeof raw === "number") return v.finite(raw, path);
  if (typeof raw === "string") {
    try {
      return constantValue(raw);
    } catch (e) {
      if (e instanceof ExprError) throw new SpecError(`${path}: ${e.message}`);
      throw e;
    }
  }
  throw new SpecError(`${path} must be a number or a constant expression like "pi/2"`);
}

function rangeOf(raw: unknown, path: string): Range {
  if (!Array.isArray(raw) || raw.length !== 2) throw new SpecError(`${path} must be [low, high]`);
  const a = bound(raw[0], `${path}[0]`);
  const b = bound(raw[1], `${path}[1]`);
  if (!(a < b)) throw new SpecError(`${path} must be [low, high] with low < high, got [${a}, ${b}]`);
  return [a, b];
}

/** The expression compiled over x and y; any other name is refused by the parser. */
export function compileSurface(expr: string): { f: Fn2; text: string } {
  try {
    const tree = parseIn(expr, ["x", "y"]);
    const g = compileTree(tree, ["x", "y"]);
    return { f: (x, y) => g(x, y), text: pretty(tree, undefined, ",") };
  } catch (e) {
    if (e instanceof ExprError) throw new SpecError(`expr: ${e.message}`);
    throw e;
  }
}

/** A number below `x` on a grid of step 10^⌊log₁₀ span⌋/2: the floor of the derived range, so it reads as a round height. */
export function niceBelow(x: number, span: number): number {
  const step = 10 ** Math.floor(Math.log10(Math.max(span, 1e-12))) / 2;
  return Math.floor(x / step + 1e-9) * step;
}

// ---- tangent plane, printed --------------------------------------------------

export type PrintedPlane = { fx: number; fy: number; z0: number; d: number; text: string; exact: boolean; fxText: string; fyText: string };

/**
 * The tangent plane z = z0 + fx(x − x0) + fy(y − y0), expanded to
 * z = fx·x + fy·y + d. Each coefficient is snapped with the tolerance a
 * central difference earns (1e-6); d is computed from the snapped values
 * and snapped again. A coefficient that snaps to nothing prints rounded and
 * the equation says ≈.
 */
export function printTangentPlane(t: Tangent, x0: number, y0: number, locale: Locale = "pt-BR"): PrintedPlane {
  const sfx = snapExact(t.fx, 1e-6);
  const sfy = snapExact(t.fy, 1e-6);
  const sz0 = snapExact(t.z0, 1e-9);
  const fx = sfx.value;
  const fy = sfy.value;
  const z0 = sz0.value;
  const sd = snapExact(z0 - fx * x0 - fy * y0, 1e-6);
  const exact = sfx.exact && sfy.exact && sz0.exact && sd.exact;
  const coef = (e: ReturnType<typeof snapExact>): string => (e.exact ? writeExact(e, locale) : formatNumber(e.value, locale, { decimals: 2 }));
  const terms: string[] = [];
  const push = (e: ReturnType<typeof snapExact>, name: string): void => {
    if (Math.abs(e.value) < 1e-12) return;
    const neg = e.value < 0;
    const body = coef({ ...e, value: Math.abs(e.value) } as ReturnType<typeof snapExact>).replace(/^−/, "");
    const withVar = name === "" ? body : body === "1" ? name : /^[\d,]+$/.test(body) ? `${body}${name}` : `${body}·${name}`;
    if (terms.length === 0) terms.push(neg ? `−${withVar}` : withVar);
    else terms.push(neg ? `− ${withVar}` : `+ ${withVar}`);
  };
  push(sfx, "x");
  push(sfy, "y");
  push(sd, "");
  const rhs = terms.length === 0 ? "0" : terms.join(" ");
  return {
    fx,
    fy,
    z0,
    d: sd.value,
    exact,
    text: `z ${exact ? "=" : "≈"} ${rhs}`,
    fxText: coef(sfx),
    fyText: coef(sfy),
  };
}

// ---- the build -------------------------------------------------------------------

type Run = { id: string; group: string; pts: Vec3[]; colour: string; width: number; dashed?: boolean };

export function expandSurface(input: SurfaceInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  if (typeof input.expr !== "string" || input.expr.trim() === "") throw new SpecError(`surface.expr must be an expression in x and y, like "x^2 + y^2"`);
  const { f, text: fText } = compileSurface(input.expr);
  // answers: false: the surface, its domain, the point's place and name are the
  // given. Not drawn or printed: the tangent plane and every derivative, the
  // point's z and its guides, the level curves and their values.
  const hide = input.answers === false;
  const xr = rangeOf(input.x, "x");
  const yr = rangeOf(input.y, "y");

  let camera: Camera;
  try {
    camera = makeCamera(input.camera ?? DEFAULT_CAMERA);
  } catch (e) {
    if (e instanceof GeometryError) throw new SpecError(`camera: ${e.message}`);
    throw e;
  }
  if (!(camera.toward[2] > 1e-6)) {
    throw new SpecError("camera: a surface is drawn from above -- this camera looks at it edge-on or from below, where the painter's order would draw its underside over its top");
  }
  if (Math.hypot(camera.toward[0], camera.toward[1]) < 1e-6) throw new SpecError("camera: looking straight down, a surface's heights do not show");

  const N = input.mesh ?? 24;
  const L = input.lines ?? 12;
  if (!Number.isInteger(N) || N < 4 || N > 64) throw new SpecError(`mesh must be a whole number of cells from 4 to 64, got ${N}`);
  if (!Number.isInteger(L) || L < 1 || N % L !== 0) throw new SpecError(`lines (${L}) must be a whole number dividing mesh (${N})`);
  const lineStep = N / L;

  // ---- 1. samples, and which cells may be drawn ----
  const grid = sampleGrid(f, xr, yr, N, N);
  const mesh = meshOf(f, grid);
  const heights: number[] = [];
  for (let i = 0; i < N; i += 1) {
    for (let j = 0; j < N; j += 1) {
      for (const q of mesh.cellPoly[i]![j]! ?? []) heights.push(q[2]);
    }
  }
  if (heights.length === 0) throw new SpecError(`f(x, y) = ${fText} is not defined (or not continuous) on any cell of [${xr.join(", ")}] × [${yr.join(", ")}] -- there is no surface to draw`);
  const fMin = Math.min(...heights);
  const fMax = Math.max(...heights);
  const fSpan = Math.max(fMax - fMin, 1e-9);
  const stated = input.z !== undefined;
  const zr: Range = stated ? rangeOf(input.z, "z") : [niceBelow(fMin, fSpan), fMax === fMin ? fMax + 1 : fMax];
  const zlo = zr[0];
  const zhi = zr[1];
  const floor = input.floor === undefined ? zlo : bound(input.floor, "floor");
  if (floor > zlo + 1e-12) throw new SpecError(`floor (${floor}) must be at or below the bottom of the z range (${zlo}) -- the level curves are projected down onto it`);

  // ---- 2. vertical scale ----
  const hspan = Math.max(xr[1] - xr[0], yr[1] - yr[0]);
  const zspan = zhi - floor;
  let k = input.zScale ?? 1;
  if (input.zScale === undefined) {
    const ratio = zspan / hspan;
    if (ratio > 1.0) k = (0.9 * hspan) / zspan;
    else if (ratio < 0.4) k = (0.55 * hspan) / zspan;
  } else if (!(k > 0) || !Number.isFinite(k)) throw new SpecError(`zScale must be a positive number, got ${input.zScale}`);
  const W = (p: Vec3): Vec3 => [p[0], p[1], p[2] * k];

  // ---- 3. the point, its tangent plane ----
  // A reading is plain text, or runs when it needs a real subscript (f_x, f_y).
  const readings: (string | TextRun[])[] = [];
  const sep = locale === "pt-BR" ? "; " : ", ";
  let P: { name: string; p: Vec3; tangent: Tangent | null } | null = null;
  if (input.point !== undefined) {
    const pt = v.object(input.point, "point");
    const name = pt.name === undefined ? "P" : String(pt.name);
    if (name.trim() === "" || typesANumber(name)) throw new SpecError(`point.name "${name}" must be a name without digits -- its coordinates are computed, never typed`);
    const x0 = bound(pt.x, "point.x");
    const y0 = bound(pt.y, "point.y");
    if (x0 < xr[0] || x0 > xr[1] || y0 < yr[0] || y0 > yr[1]) throw new SpecError(`point (${x0}, ${y0}) is outside the domain [${xr.join(", ")}] × [${yr.join(", ")}]`);
    const z0 = f(x0, y0);
    if (!Number.isFinite(z0)) throw new SpecError(`point: f is not defined at (${x0}, ${y0})`);
    if (z0 < zlo - 1e-12 || z0 > zhi + 1e-12) throw new SpecError(`point: f(${x0}, ${y0}) = ${z0} is outside the visible range z ∈ [${zlo}, ${zhi}]`);
    let tangent: Tangent | null = null;
    if (pt.tangentPlane === true && !hide) {
      const t = tangentAt(f, x0, y0);
      if ("refused" in t) throw new SpecError(`point.tangentPlane: ${t.refused}`);
      tangent = t;
    }
    P = { name, p: [x0, y0, z0], tangent };
  }

  // ---- 4. cells, far to near ----
  const cells: Cell[] = surfaceCells(camera, mesh, zr);
  let stacking: Stacking = "merged";
  const dx = (xr[1] - xr[0]) / N;
  const dy = (yr[1] - yr[0]) / N;
  let planeRect: { ii: Range; jj: Range; eq: (x: number, y: number) => number } | null = null;
  if (P !== null && P.tangent !== null) {
    const t = P.tangent;
    const [x0, y0, z0] = P.p;
    const eq = (x: number, y: number): number => z0 + t.fx * (x - x0) + t.fy * (y - y0);
    const half = Math.max(2, Math.round(N * 0.22));
    const ci = Math.round((x0 - xr[0]) / dx);
    const cj = Math.round((y0 - yr[0]) / dy);
    const ii: Range = [Math.max(0, ci - half), Math.min(N, ci + half)];
    const jj: Range = [Math.max(0, cj - half), Math.min(N, cj + half)];
    planeRect = { ii, jj, eq };
    cells.push(...planeCells(camera, grid, eq, ii, jj, zr));
    // Which side of its tangent plane the surface lies on over the patch,
    // and which side of the surface the reader sees there, decide whether
    // the plane is painted wholly behind or wholly in front (mesh.ts, Stacking).
    let above = 0;
    let below = 0;
    let top = 0;
    let under = 0;
    const tol = 1e-9 * Math.max(1, Math.abs(z0));
    for (let i = ii[0]; i <= ii[1]; i += 1) {
      for (let j = jj[0]; j <= jj[1]; j += 1) {
        const d = grid.z[i]![j]! - eq(grid.xs[i]!, grid.ys[j]!);
        if (!Number.isFinite(d)) continue;
        if (d > tol) above += 1;
        else if (d < -tol) below += 1;
      }
    }
    for (const c of cells) {
      if (c.field !== "surface" || c.i < ii[0] || c.i >= ii[1] || c.j < jj[0] || c.j >= jj[1]) continue;
      const n = cellNormal(c, k);
      const facing = n[0] * camera.toward[0] + n[1] * camera.toward[1] + n[2] * camera.toward[2];
      if (facing > 1e-9) top += 1;
      else if (facing < -1e-9) under += 1;
    }
    if (above > 0 && below > 0) {
      throw new SpecError(
        `point.tangentPlane: the surface crosses its tangent plane near ${P.name} (it lies above it in some directions and below in others, as at a saddle point). ` +
          "The painter's order cannot stack two surfaces that cross -- no module draws it yet (modules/plot fits least squares only); choose a point off the saddle or draw the plane without its tangency",
      );
    }
    if (top > 0 && under > 0) {
      throw new SpecError(
        `point.tangentPlane: a silhouette of the surface crosses the plane's patch around ${P.name} -- part of it is seen from above and part from beneath, and the plane cannot be stacked wholly in front or behind. Choose another camera or point`,
      );
    }
    // Plane below a surface seen from beneath, or above one seen from above: in front.
    stacking = (below > 0) === (top > 0) ? "plane-last" : "plane-first";
  }
  painterSort(cells, stacking);

  // ---- 5. axes, floor, and the page scale ----
  const ext = 0.2 * hspan;
  const axisEnds: [Vec3, [number, number, number]][] = [
    [[Math.min(0, xr[0]), 0, 0], [Math.max(0, xr[1]) + ext, 0, 0]],
    [[0, Math.min(0, yr[0]), 0], [0, Math.max(0, yr[1]) + ext, 0]],
    [[0, 0, Math.min(0, floor)], [0, 0, Math.max(0, zhi) + ext / k]],
  ];
  // The z axis leaves the drawing above the surface's highest image, so its
  // arrow and name are never set inside a bowl's rim.
  if (camera.ez[1] > 1e-9) {
    const vs0 = cells.flatMap((c) => c.poly.map((q) => project(camera, W(q))[1]));
    const top = Math.max(...vs0);
    const span0 = top - Math.min(...vs0);
    const need = (top + 0.1 * span0) / (camera.ez[1] * k);
    if (need > axisEnds[2]![1][2]) axisEnds[2]![1][2] = need;
  }
  const levels = input.levels ?? [];
  const levelsOn = input.levelsOn ?? "both";
  const onFloor = !hide && levels.length > 0 && levelsOn !== "surface";
  const onSurface = !hide && levels.length > 0 && levelsOn !== "floor";
  const floorRect: Vec3[] = [
    [xr[0], yr[0], floor],
    [xr[1], yr[0], floor],
    [xr[1], yr[1], floor],
    [xr[0], yr[1], floor],
  ];

  const pagePts: Vec2[] = [];
  for (const c of cells) for (const q of c.poly) pagePts.push(project(camera, W(q)));
  for (const [a, b] of axisEnds) pagePts.push(project(camera, W(a)), project(camera, W(b)));
  if (onFloor) for (const q of floorRect) pagePts.push(project(camera, W(q)));
  const us = pagePts.map((p) => p[0]);
  const vs = pagePts.map((p) => p[1]);
  const uMin = Math.min(...us);
  const uMax = Math.max(...us);
  const vMin = Math.min(...vs);
  const vMax = Math.max(...vs);
  // Fitted to the page extent of the drawing (x and y are already in world
  // units, so a domain of [-100, 100] draws as big as one of [-1, 1]).
  const { xUnit: unit } = fitUnits(Math.max(uMax - uMin, 1e-9), Math.max(vMax - vMin, 1e-9), { equal: true, targetWidth: TARGET, targetHeight: TARGET });
  const occ = new Occluder(camera, k, cells, INSET_PX / unit, stacking);
  const step = STEP_PX / unit;
  const pageU = (p: Vec3): Vec2 => project(camera, W(p));

  if (P !== null) {
    const own = occ.onField("surface", grid, P.p[0], P.p[1], P.p[2]);
    if (own === null) throw new SpecError(`point: (${P.p[0]}, ${P.p[1]}) lies in a cell that is not drawn (f is undefined or jumps nearby)`);
    // The point is on the surface AND on its tangent plane: neither hides it where they touch.
    if (occ.hidden(P.p, { ...own, both: true })) throw new SpecError(`point: ${P.name} is on a part of the surface this camera does not see -- choose another camera or another point`);
  }

  // ---- 6. lines, cut to what the reader sees ----
  const runs: Run[] = [];
  const addRuns = (id: string, group: string, pts: LinePoint[], colour: string, width: number, dashed = false): void => {
    visibleRuns(pts, occ).forEach((r, n) => runs.push({ id: `${id}-${n}`, group, pts: r, colour, width, dashed }));
  };
  const free = (pts: Vec3[]): LinePoint[] => densify(pts, pageU, step).map((p) => ({ p, own: occ.free(p) }));
  const onSurf = (pts: Vec3[]): LinePoint[] => densify(pts, pageU, step).map((p) => ({ p, own: occ.onField("surface", grid, p[0], p[1], p[2]) }));

  // The floor's outline, then the level curves projected onto it.
  const levelGroups: { c: number; floor?: string; surface?: string }[] = [];
  const levelLines = levels.map((c, n) => {
    if (typeof c !== "number" || !Number.isFinite(c)) throw new SpecError(`levels[${n}] must be a number`);
    if (c <= fMin || c >= fMax) {
      throw new SpecError(`levels[${n}]: f(x, y) = ${fText} ranges over [${formatNumber(fMin, locale)}, ${formatNumber(fMax, locale)}] on the domain -- the level ${formatNumber(c, locale)} is never crossed there`);
    }
    if (c < zlo || c > zhi) throw new SpecError(`levels[${n}]: the level ${c} is outside the visible range z ∈ [${zlo}, ${zhi}]`);
    const lines = contour(f, { x: xr, y: yr }, { level: c, cells: 4 * N });
    if (lines.length === 0) throw new SpecError(`levels[${n}]: no curve f(x, y) = ${c} was found on the grid`);
    return { c, lines };
  });
  if (onFloor) {
    floorRect.forEach((a, n) => {
      const b = floorRect[(n + 1) % 4]!;
      addRuns(`floor-edge${n}`, "floor", free([a, b]), GUIDE, 1);
    });
    levelLines.forEach(({ c, lines }, n) => {
      const group = `level-${n}-floor`;
      levelGroups[n] = { ...(levelGroups[n] ?? { c }), floor: group };
      lines.forEach((l, m) => addRuns(`${group}-${m}`, group, free(l.points.map((q): Vec3 => [q.x, q.y, floor])), LEVEL, 1.5));
    });
  }

  // Axes.
  const axisNames = ["x", "y", "z"] as const;
  axisEnds.forEach(([a, b], n) => addRuns(`axis-${axisNames[n]}`, `axis-${axisNames[n]}`, free([a, b]), AXIS, 1.4));

  // Grid lines along constant x and constant y, each piece only where f is continuous.
  const sub = (a: Vec3, b: Vec3): number => Math.max(2, Math.ceil(Math.hypot(...(([p, q]) => [q[0] - p[0], q[1] - p[1]])([pageU(a), pageU(b)])) / step));
  const gridLine = (fixed: "x" | "y", idx: number): Vec3[][] => {
    const pieces: Vec3[][] = [];
    let cur: Vec3[] = [];
    const sampled = (a: Vec3, b: Vec3): Vec3[] => {
      const n = sub(a, b);
      const out: Vec3[] = [];
      for (let q = 1; q <= n; q += 1) {
        const t = q / n;
        const x = a[0] + (b[0] - a[0]) * t;
        const y = a[1] + (b[1] - a[1]) * t;
        out.push(q === n ? b : [x, y, f(x, y)]);
      }
      return out;
    };
    for (let m = 0; m < N; m += 1) {
      const ok = fixed === "x" ? mesh.vOk[idx]![m]! : mesh.hOk[m]![idx]!;
      const a: Vec3 = fixed === "x" ? [grid.xs[idx]!, grid.ys[m]!, grid.z[idx]![m]!] : [grid.xs[m]!, grid.ys[idx]!, grid.z[m]![idx]!];
      const b: Vec3 = fixed === "x" ? [grid.xs[idx]!, grid.ys[m + 1]!, grid.z[idx]![m + 1]!] : [grid.xs[m + 1]!, grid.ys[idx]!, grid.z[m + 1]![idx]!];
      if (!ok) {
        // At the edge of f's domain the line runs to where f stops, never across.
        const end = fixed === "x" ? mesh.vEnd[idx]![m]! : mesh.hEnd[m]![idx]!;
        if (end !== null && end.fromStart) {
          if (cur.length === 0) cur.push(a);
          cur.push(...sampled(a, end.p));
        }
        if (cur.length >= 2) pieces.push(cur);
        cur = [];
        if (end !== null && !end.fromStart) cur = [end.p, ...sampled(end.p, b)];
        continue;
      }
      if (cur.length === 0) cur.push(a);
      cur.push(...sampled(a, b));
    }
    if (cur.length >= 2) pieces.push(cur);
    return pieces.flatMap((p) => clipLineToZ(p, zr));
  };
  for (let i = 0; i <= N; i += lineStep) {
    const edge = i === 0 || i === N;
    gridLine("x", i).forEach((pc, m) => addRuns(`grid-x${i}-${m}`, "mesh", onSurf(pc), MESH_LINE, edge ? 1.2 : 0.7));
    gridLine("y", i).forEach((pc, m) => addRuns(`grid-y${i}-${m}`, "mesh", onSurf(pc), MESH_LINE, edge ? 1.2 : 0.7));
  }
  // Where a stated z range cuts the surface, its rim is the level curve at that height.
  for (const [bound0, name] of [
    [zhi, "top"],
    [zlo, "bottom"],
  ] as const) {
    if (!(stated && bound0 > fMin && bound0 < fMax)) continue;
    contour(f, { x: xr, y: yr }, { level: bound0, cells: 4 * N }).forEach((l, m) =>
      addRuns(`rim-${name}-${m}`, "mesh", onSurf(l.points.map((q): Vec3 => [q.x, q.y, bound0])), MESH_LINE, 1.2),
    );
  }

  // The tangent plane's outline.
  if (planeRect !== null) {
    const { ii, jj, eq } = planeRect;
    const [x0, x1] = [grid.xs[ii[0]]!, grid.xs[ii[1]]!];
    const [y0, y1] = [grid.ys[jj[0]]!, grid.ys[jj[1]]!];
    const corners: [number, number][] = [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ];
    corners.forEach(([ax, ay], n) => {
      const [bx, by] = corners[(n + 1) % 4]!;
      const pts: Vec3[] = Array.from({ length: 65 }, (_, s) => {
        const x = ax + ((bx - ax) * s) / 64;
        const y = ay + ((by - ay) * s) / 64;
        return [x, y, eq(x, y)];
      });
      for (const pc of clipLineToZ(pts, zr)) {
        addRuns(`plane-edge${n}`, "plane", densify(pc, pageU, step).map((p) => ({ p, own: occ.onField("plane", grid, p[0], p[1], p[2]) })), PLANE_LINE, 1.5);
      }
    });
  }

  // Level curves at their height.
  if (onSurface) {
    levelLines.forEach(({ c, lines }, n) => {
      const group = `level-${n}-surface`;
      levelGroups[n] = { ...(levelGroups[n] ?? { c }), surface: group };
      lines.forEach((l, m) => addRuns(`${group}-${m}`, group, onSurf(l.points.map((q): Vec3 => [q.x, q.y, c])), LEVEL, 1.9));
    });
  }

  // The point's guides: down (or up) to the xy-plane, then to the axes.
  if (P !== null && input.point?.guide !== false && !hide) {
    boxEdges(P.p, "floor").forEach(([a, b], n) => addRuns(`guide-${n}`, "guide", free([a, b]), GUIDE, 1.1, true));
  }

  // ---- 7. the page ----
  const eqOr = (exact: boolean): string => (exact ? "=" : "≈");
  readings.push(`z = f(x${sep}y) = ${fText}`);
  if (stated && (zlo > fMin || zhi < fMax)) readings.push(`cortada em ${formatNumber(zlo, locale)} ≤ z ≤ ${formatNumber(zhi, locale)}`);
  if (levels.length > 0 && !hide) {
    readings.push(`curvas de nível f(x${sep}y) = c: c = ${levels.map((c) => formatNumber(c, locale)).join(sep)}${onFloor ? ` (projetadas em z = ${formatNumber(floor, locale)})` : ""}`);
  }
  let plane: PrintedPlane | null = null;
  if (P !== null) {
    const coords = printTriple(P.p, locale);
    if (hide) readings.push(`${P.name}: x = ${printExact(P.p[0], locale).text}${sep}y = ${printExact(P.p[1], locale).text}`);
    else readings.push(`${P.name} = ${coords.text.replace(/^\(/, `(`)}${coords.exact ? "" : " (z arredondado)"}`);
    if (P.tangent !== null) {
      plane = printTangentPlane(P.tangent, P.p[0], P.p[1], locale);
      const at = `(${printExact(P.p[0], locale).text}${sep}${printExact(P.p[1], locale).text})`;
      readings.push([{ text: "f" }, { text: "x", script: "sub" }, { text: `${at} ${eqOr(plane.exact)} ${plane.fxText}${sep}f` }, { text: "y", script: "sub" }, { text: `${at} ${eqOr(plane.exact)} ${plane.fyText}` }]);
      readings.push(`plano tangente em ${P.name}: ${plane.text}`);
    }
  }
  if (mesh.holes > 0) readings.push(`f não está definida (ou salta) em parte de [${formatNumber(xr[0], locale)}${sep}${formatNumber(xr[1], locale)}] × [${formatNumber(yr[0], locale)}${sep}${formatNumber(yr[1], locale)}]: ali o desenho para, nunca emenda`);
  if (Math.abs(k - 1) > 1e-9) readings.push(`eixo z desenhado na escala ${formatNumber(k, locale, { decimals: 2 })} : 1`);
  // One reading a line, never wrapped: an equation parted across lines reads wrong.
  const readingPanel = layoutPanel(
    readings.map((r) => ({ text: typeof r === "string" ? [{ text: r }] : r, wrap: false })),
    { width: Infinity, size: 13, lineHeight: CAPTION_LINE_H, emphasis: "soft" },
  );
  const captionW = readingPanel.width;
  const plotW = Math.ceil((uMax - uMin) * unit + 2 * PAD);
  const width = Math.max(plotW, Math.ceil(captionW + 48));
  const plotH = Math.ceil((vMax - vMin) * unit + 2 * PAD);
  const height = plotH + readingPanel.height + 18;
  const ox = (width - (uMax - uMin) * unit) / 2 - uMin * unit;
  const oy = PAD + vMax * unit;
  const page = (p: Vec3): Point => {
    const q = pageU(p);
    return { x: ox + q[0] * unit, y: oy - q[1] * unit };
  };
  const pageDir = (d: Vec3): Point => {
    const q = projectDirection(camera, W(d));
    const len = Math.hypot(q[0], q[1]) || 1;
    return { x: q[0] / len, y: -q[1] / len };
  };

  const board = new Board(width, height, PAPER);
  const placer = new SpacePlacer({ x: 6, y: 6, width: width - 12, height: plotH - 6 });
  /** Every stroked polyline on the page, for the leader search (the placer keeps its own copy private). */
  const inkPx: { id: string; group: string; pts: Point[]; box: Rect }[] = [];
  const labelRects: Rect[] = [];
  const addInk = (id: string, group: string, pts: Point[]): void => {
    placer.addInk(id, group, pts);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    inkPx.push({ id, group, pts, box: { x: x0, y: y0, width: Math.max(...xs) - x0, height: Math.max(...ys) - y0 } });
  };

  // ---- 8. fills, far to near, shaded by a light up and to the left of the reader ----
  const right = normalize([camera.ex[0], camera.ey[0], camera.ez[0]]);
  const light = normalize([0.55 * camera.toward[0] - 0.45 * right[0], 0.55 * camera.toward[1] - 0.45 * right[1], 0.55 * camera.toward[2] - 0.45 * right[2] + 0.7]);
  for (const c of cells) {
    const n = cellNormal(c, k);
    const facing = n[0] * camera.toward[0] + n[1] * camera.toward[1] + n[2] * camera.toward[2];
    const seen: Vec3 = facing >= 0 ? n : [-n[0], -n[1], -n[2]];
    const lambert = Math.max(0, seen[0] * light[0] + seen[1] * light[1] + seen[2] * light[2]);
    const ramp = c.field === "plane" ? PLANE : facing >= 0 ? TOP : UNDER;
    const colour = mix(ramp, 0.25 + 0.75 * lambert);
    const pts = c.poly.map(page);
    // Stroked in its own colour: adjacent fills otherwise leave a hairline
    // of paper between them where the rasteriser antialiases both edges.
    board.poly(pts, { stroke: colour, width: 0.6, fill: colour, close: true, id: c.id });
    addInk(c.id, "fill", [...pts, pts[0]!]);
  }

  // ---- 9. lines ----
  const drawRun = (r: Run): void => {
    const pts = r.pts.map(page);
    let len = 0;
    for (let a = 1; a < pts.length; a += 1) len += Math.hypot(pts[a]!.x - pts[a - 1]!.x, pts[a]!.y - pts[a - 1]!.y);
    // A run shorter than a few px is the sampling's noise at a silhouette, not something a reader sees.
    if (len < 3) return;
    board.poly(pts, { stroke: r.colour, width: r.width, id: r.id, ...(r.dashed ? { lineStyle: "dashed" as const } : {}) });
    addInk(r.id, r.group, pts);
  };
  const layer = (r: Run): number => (r.group === "floor" || r.group.endsWith("-floor") ? 0 : r.group.startsWith("axis") ? 1 : r.group === "mesh" ? 2 : r.group === "plane" ? 3 : r.group === "guide" ? 5 : 4);
  const ordered = [...runs].sort((a, b) => layer(a) - layer(b));
  for (const r of ordered) drawRun(r);

  // Axis arrowheads, where the tip is seen.
  const headAt = (id: string, group: string, tip: Point, dir: Point, colour: string): void => {
    const base = { x: tip.x - dir.x * HEAD_LEN, y: tip.y - dir.y * HEAD_LEN };
    const nrm = { x: -dir.y, y: dir.x };
    const pts = [tip, { x: base.x + nrm.x * HEAD_HALF, y: base.y + nrm.y * HEAD_HALF }, { x: base.x - nrm.x * HEAD_HALF, y: base.y - nrm.y * HEAD_HALF }];
    board.poly(pts, { stroke: colour, width: 1, fill: colour, close: true, id });
    addInk(id, group, [...pts, pts[0]!]);
  };
  const tips: { n: number; tip: Point; dir: Point }[] = [];
  axisEnds.forEach(([, b], n) => {
    if (occ.hidden(b, occ.free(b))) return;
    const d: [number, number, number] = [0, 0, 0];
    d[n] = 1;
    const tip = page(b);
    const dir = pageDir(d);
    headAt(`axis-${axisNames[n]}-head`, `axis-${axisNames[n]}`, tip, dir, AXIS);
    tips.push({ n, tip, dir });
  });

  // Ticks.
  const ticks: { id: string; at: Point; dir: Point; text: string }[] = [];
  if (input.axes?.ticks === true) {
    const ranges: Range[] = [
      [Math.min(0, xr[0]), Math.max(0, xr[1])],
      [Math.min(0, yr[0]), Math.max(0, yr[1])],
      [Math.min(0, floor), Math.max(0, zhi)],
    ];
    ranges.forEach((r, n) => {
      const st = niceStep(r[1] - r[0], 5);
      const d: [number, number, number] = [0, 0, 0];
      d[n] = 1;
      const dir = pageDir(d);
      const nrm = { x: -dir.y, y: dir.x };
      for (let t = Math.ceil(r[0] / st - 1e-9) * st; t <= r[1] + 1e-9; t += st) {
        if (Math.abs(t) < 1e-12) continue;
        const p: [number, number, number] = [0, 0, 0];
        p[n] = t;
        if (occ.hidden(p, occ.free(p))) continue;
        const c = page(p);
        const id = `tick-${axisNames[n]}-${t < 0 ? "m" : ""}${formatNumber(Math.abs(t), "en", { grouping: false }).replace(/\./g, "_")}`;
        const pts = [
          { x: c.x - nrm.x * TICK_HALF, y: c.y - nrm.y * TICK_HALF },
          { x: c.x + nrm.x * TICK_HALF, y: c.y + nrm.y * TICK_HALF },
        ];
        board.poly(pts, { stroke: AXIS, width: 1.2, id });
        addInk(id, id, pts);
        ticks.push({ id, at: c, dir: nrm, text: formatNumber(t, locale) });
      }
    });
  }

  // The point, last: nothing is ever drawn over it.
  let pDot: Point | null = null;
  if (P !== null) {
    pDot = page(P.p);
    board.circle(pDot, DOT_R, { stroke: INK, width: 1, fill: INK, id: "point" });
    addInk("point", "point", Array.from({ length: 13 }, (_, i) => ({ x: pDot!.x + DOT_R * Math.cos((i * Math.PI) / 6), y: pDot!.y + DOT_R * Math.sin((i * Math.PI) / 6) })));
    placer.addPlace(pDot);
  }

  // ---- 10. labels ----
  const bounds = { x: 6, y: 6, width: width - 12, height: plotH - 6 };
  const rectAt = (c: Point, w: number, h: number): Rect => ({ x: c.x - w / 2, y: c.y - h / 2, width: w, height: h });
  const reserve = (r: Rect): void => {
    placer.reserve(r);
    labelRects.push(r);
  };

  /**
   * A label at the end of a leader line, for a place on the surface: the
   * fills are ink, so no spot ON the surface is clear, and a label beside
   * the place would sit nearer a cell's edge than the place. The label is
   * set off the surface and names its leader (the annotated-figure
   * precedent, ADR 0035); the leader stops short of the label so no line
   * touches the text.
   */
  const leaderLabel = (id: string, text: string, targets: Point[], colour: string, style: { size: number; weight: number }, gap: number): boolean => {
    const { w, h } = board.extent(text, style);
    let best: { cost: number; centre: Point; leader: [Point, Point] } | null = null;
    for (const target of targets) {
      for (const len of [22, 32, 44, 58, 76, 98, 124]) {
        for (let a = 0; a < 24; a += 1) {
          const ang = -Math.PI / 4 - (a * Math.PI) / 12;
          const d = { x: Math.cos(ang), y: Math.sin(ang) };
          // Distance from a box centre to its edge along d.
          const reach = Math.min(Math.abs(d.x) > 1e-9 ? w / 2 / Math.abs(d.x) : Infinity, Math.abs(d.y) > 1e-9 ? h / 2 / Math.abs(d.y) : Infinity);
          const centre = { x: target.x + d.x * (len + reach + MARGIN + 1), y: target.y + d.y * (len + reach + MARGIN + 1) };
          const box = rectAt(centre, w, h);
          if (box.x < bounds.x || box.y < bounds.y || box.x + w > bounds.x + bounds.width || box.y + h > bounds.y + bounds.height) continue;
          const grown = { x: box.x - MARGIN, y: box.y - MARGIN, width: w + 2 * MARGIN, height: h + 2 * MARGIN };
          if (labelRects.some((r) => r.x - MARGIN < box.x + w && box.x - MARGIN < r.x + r.width && r.y - MARGIN < box.y + h && box.y - MARGIN < r.y + r.height)) continue;
          const near = (l: { box: Rect }, r: Rect, pad: number): boolean => l.box.x - pad <= r.x + r.width && r.x - pad <= l.box.x + l.box.width && l.box.y - pad <= r.y + r.height && r.y - pad <= l.box.y + l.box.height;
          if (inkPx.some((l) => near(l, grown, 0) && l.pts.some((p, i) => i > 0 && segmentHitsRect(l.pts[i - 1]!, p, grown)))) continue;
          const from = { x: target.x + d.x * gap, y: target.y + d.y * gap };
          const to = { x: target.x + d.x * len, y: target.y + d.y * len };
          if (labelRects.some((r) => segmentHitsRect(from, to, r))) continue;
          // The label must be nearer its leader than anything else drawn.
          const toLeader = distanceToPolyline(centre, [from, to]);
          const reachBox = { x: centre.x, y: centre.y, width: 0, height: 0 };
          if (inkPx.some((l) => near(l, reachBox, toLeader + 4) && distanceToPolyline(centre, l.pts) < toLeader + 4)) continue;
          // Prefer a leader that crosses few lines, then a short one.
          let crossings = 0;
          const span = { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), width: Math.abs(to.x - from.x), height: Math.abs(to.y - from.y) };
          for (const l of inkPx) {
            if (l.group === "fill" || !near(l, span, 0)) continue;
            for (let i = 1; i < l.pts.length; i += 1) {
              if (segmentsCross(from, to, l.pts[i - 1]!, l.pts[i]!)) {
                crossings += 1;
                break;
              }
            }
          }
          // A leader must not run along another line: a reader follows the wrong one.
          let along = 0;
          for (const t of [0.2, 0.4, 0.6, 0.8]) {
            const q = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
            if (inkPx.some((l) => l.group !== "fill" && near(l, { x: q.x, y: q.y, width: 0, height: 0 }, 3) && distanceToPolyline(q, l.pts) < 3)) along += 1;
          }
          if (along >= 2) continue;
          const cost = crossings * 200 + along * 60 + len;
          if (best === null || cost < best.cost) best = { cost, centre, leader: [from, to] };
        }
      }
    }
    if (best === null) return false;
    const leaderId = `${id}-leader`;
    board.poly(best.leader, { stroke: colour, width: 1, id: leaderId });
    addInk(leaderId, leaderId, best.leader);
    reserve(rectAt(best.centre, w, h));
    board.label(text, best.centre.x, best.centre.y, { ...style, colour, width: w, id, annotates: leaderId });
    return true;
  };

  // The point's name: beside it when some spot there is honest, else on a leader.
  if (P !== null && pDot !== null) {
    const style = { size: 14, weight: 700 };
    const { w, h } = board.extent(P.name, style);
    const direct = placer.choose(aroundPlace(pDot, w, h, DOT_R).slice(0, 24), w, h, (c) => placer.placeCost(pDot!, "point", c, w, h, 1), false);
    if (direct.cost === 0) {
      reserve(rectAt(direct.centre, w, h));
      board.label(P.name, direct.centre.x, direct.centre.y, { ...style, colour: INK, width: w, id: "point-label", annotatesPlace: { x: pDot.x, y: pDot.y } });
    } else if (!leaderLabel("point-label", P.name, [pDot], INK, style, DOT_R + 3)) {
      throw new SpecError(`point: no room for the label "${P.name}" anywhere near it -- widen the figure's domain or choose another camera`);
    }
  }

  // Level labels: beside a visible piece of the floor curve when one is
  // clear, else on a leader to it (or to the curve on the surface).
  const unlabelled: number[] = [];
  levelGroups.forEach((g, n) => {
    if (g === undefined) return;
    const text = `z = ${formatNumber(g.c, locale)}`;
    const style = { size: 13, weight: 700 };
    const { w, h } = board.extent(text, style);
    // The floor first: that is where the textbook names its curves, and a
    // label there is off the surface.
    const groups = [g.floor, g.surface].filter((x): x is string => x !== undefined);
    for (const group of groups) {
      const pieces = inkPx.filter((l) => l.group === group);
      const spots: Point[] = [];
      for (const pc of pieces) {
        for (let a = 0; a + 1 < pc.pts.length; a += Math.max(1, Math.floor(pc.pts.length / 40))) {
          spots.push(...besideRun(pc.pts[a]!, pc.pts[Math.min(pc.pts.length - 1, a + 1)]!, w, h, [0.5]));
        }
      }
      if (spots.length > 0) {
        const best = placer.choose(spots, w, h, (c) => placer.elementCost(group, c, w, h, 4), false);
        if (best.cost === 0) {
          reserve(rectAt(best.centre, w, h));
          board.label(text, best.centre.x, best.centre.y, { ...style, colour: LEVEL, width: w, id: `level-${n}-label`, annotates: placer.nearestOf(group, best.centre) });
          return;
        }
      }
      const targets: Point[] = [];
      for (const pc of pieces) {
        for (let a = 0; a < pc.pts.length; a += Math.max(1, Math.floor(pc.pts.length / 6))) targets.push(pc.pts[a]!);
      }
      if (targets.length > 0 && leaderLabel(`level-${n}-label`, text, targets, LEVEL, style, 0)) return;
    }
    unlabelled.push(n);
  });
  if (unlabelled.length > 0) {
    throw new SpecError(`levels: no honest spot for the label of ${unlabelled.map((n) => `z = ${levels[n]}`).join(", ")} -- every curve must be named on the drawing`);
  }

  // Tick numbers: beside the tick, or left off (their tick stays), as in space.
  for (const t of ticks) {
    const style = { size: 11, weight: 400 };
    const { w, h } = board.extent(t.text, style);
    const spots: Point[] = [];
    for (const extra of [0, 3, 7]) {
      for (const side of [1, -1]) {
        const reach = Math.abs(t.dir.x) * (w / 2) + Math.abs(t.dir.y) * (h / 2);
        const d = TICK_HALF + 3 + reach + extra;
        spots.push({ x: t.at.x + t.dir.x * side * d, y: t.at.y + t.dir.y * side * d });
      }
    }
    spots.push(...aroundPlace(t.at, w, h, TICK_HALF));
    const best = placer.choose(spots, w, h, (c) => placer.placeCost(t.at, t.id, c, w, h, 1), false);
    if (best.cost > 0) continue;
    reserve(rectAt(best.centre, w, h));
    board.label(t.text, best.centre.x, best.centre.y, { ...style, colour: SOFT, width: w, id: `${t.id}-label`, annotatesPlace: { x: t.at.x, y: t.at.y } });
  }

  // Axis names at their tips.
  if (input.axes?.names !== false) {
    for (const { n, tip, dir } of tips) {
      const name = axisNames[n]!;
      const style = { size: 14, weight: 600, colour: AXIS };
      const { w, h } = board.extent(name, style);
      const spots: Point[] = [];
      for (const extra of [0, 4, 9, 15, 22]) {
        const reach = Math.abs(dir.x) * (w / 2) + Math.abs(dir.y) * (h / 2);
        const c = { x: tip.x + dir.x * (reach + 5 + extra), y: tip.y + dir.y * (reach + 5 + extra) };
        spots.push(c);
        const nrm = { x: -dir.y, y: dir.x };
        for (const side of [1, -1]) spots.push({ x: c.x + nrm.x * side * (w / 2 + 4), y: c.y + nrm.y * side * (h / 2 + 4) });
      }
      const best = placer.choose(spots, w, h, (c) => placer.elementCost(`axis-${name}`, c, w, h, 0), false);
      reserve(rectAt(best.centre, w, h));
      board.label(name, best.centre.x, best.centre.y, { ...style, width: w, id: `axis-${name}-name`, freeStanding: true });
    }
  }

  // ---- 11. the readings panel ----
  readingPanel.draw(board, { left: 24, top: plotH + 2, cut: plotH });

  const spec = board.spec(input.title ?? `z = ${fText}`);
  const scene = spec.root as Scene;
  scene.connectors = [];
  spec.canvas = { ...spec.canvas, constraints: { allowOverlap: true, allowConnectorCrossing: true, allowCurvedConnectors: true } };
  return parseSpec(spec);
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

// ---- validation ----------------------------------------------------------------

export function validateSurfaceInput(raw: Record<string, unknown>): void {
  const path = "surface";
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  v.requiredString(raw, "expr", path);
  if (raw.x === undefined) throw new SpecError(`${path}.x is required: [low, high]`);
  if (raw.y === undefined) throw new SpecError(`${path}.y is required: [low, high]`);
  v.optionalNumber(raw, "zScale", path);
  v.optionalNumber(raw, "mesh", path);
  v.optionalNumber(raw, "lines", path);
  v.optionalEnum(raw, "levelsOn", path, ["surface", "floor", "both"]);
  if (raw.levels !== undefined) v.array(raw, "levels", path, "levels");
  if (raw.axes !== undefined) {
    const a = v.object(raw.axes, `${path}.axes`);
    v.optionalBoolean(a, "ticks", `${path}.axes`);
    v.optionalBoolean(a, "names", `${path}.axes`);
  }
  if (raw.point !== undefined) {
    const p = v.object(raw.point, `${path}.point`);
    v.optionalString(p, "name", `${path}.point`);
    v.optionalBoolean(p, "guide", `${path}.point`);
    v.optionalBoolean(p, "tangentPlane", `${path}.point`);
    if (p.x === undefined || p.y === undefined) throw new SpecError(`${path}.point needs x and y; its z is computed`);
    if (p.z !== undefined) throw new SpecError(`${path}.point.z is computed from f, never typed`);
  }
  if (raw.camera !== undefined && typeof raw.camera !== "string") {
    const o = v.object(raw.camera, `${path}.camera`);
    v.optionalEnum(o, "kind", `${path}.camera`, ["cavalier", "isometric", "orthographic"]);
    if (o.kind === undefined) throw new SpecError(`${path}.camera.kind is required`);
    if (o.kind === "orthographic") {
      v.requiredNumber(o, "azimuth", `${path}.camera`);
      v.requiredNumber(o, "elevation", `${path}.camera`);
    }
  } else if (typeof raw.camera === "string") v.optionalEnum(raw, "camera", path, ["cavalier", "isometric", "orthographic"]);
  // Every refusal that needs f -- a level never crossed, a point in a hole,
  // a corner with no tangent plane -- is exercised by building the figure:
  // one implementation of the rules, not a shadow copy.
  v.probe(() => expandSurface(raw as unknown as SurfaceInput));
}
