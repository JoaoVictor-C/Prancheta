/**
 * Shaded areas and Riemann sums for function-graph (ADR 0036): the pure
 * part -- where a region's parts begin and end, what each one's outline is
 * in the graph's own axis units, and the polygon arithmetic a label search
 * needs. Nothing here draws or places; `preset.ts` does, from these.
 *
 * The rule is the preset's: a region is stated by the curves and bounds it
 * lies between and is DERIVED from them. Its outline is sampled from the
 * expressions by the same adaptive sampler parametric curves use
 * (`sampleParametric`), its bounds between two curves are the curves'
 * intersections found numerically (`criticalPoints`, the root finder the
 * sign chart already trusts, snapped to the exact value when there is
 * one), and the number printed beside it comes from `numeric.integrate`.
 * No vertex and no value is typed.
 */

import type { Point } from "../../ir/types.ts";
import { pointInPolygon } from "../../geometry/hit.ts";
import { NumericError, integrate } from "../../math/numeric.ts";
import { criticalPoints } from "../sign-chart/preset.ts";
import { sampleParametric } from "./curves.ts";

export type XYPoint = { x: number; y: number };

/**
 * How much finer than a CSS pixel a region's edge is sampled.
 *
 * A region carries no stroke, so its vertices cost nothing a reader sees; what
 * they buy is ACCURACY OF ITS AREA. `area-matches-its-label` (ADR 0037)
 * measures the polygon against the number printed in it and forgives the
 * sampler's own eighth of a pixel per pixel of outline; a label rounded to
 * three decimals forgives little else. Sampling at 8× puts every chord within
 * about a sixtieth of a pixel of the curve: on the fixtures the polygon's area
 * agrees with the integral to 2e-4 square units or better (about one square
 * pixel over the whole region), where the check forgives hundreds, at a few
 * hundred vertices for a typical region.
 */
export const EDGE_MAGNIFICATION = 8;

/**
 * The curve y = fn(x) on [a, b] as vertices in axis units, sampled adaptively
 * at `EDGE_MAGNIFICATION` times the plane's own scale. Every vertex is
 * (x, fn(x)) evaluated -- x read back from the sampler, y computed afresh --
 * so each lies ON the curve, and the two ends are exactly a and b.
 *
 * A jump inside [a, b] (a piecewise function's break) breaks the sampler's
 * run; the runs are joined here, which draws the jump as the vertical edge
 * the region really has there.
 */
export function sampleEdge(fn: (x: number) => number, a: number, b: number, ux: number, uy: number): XYPoint[] {
  const kx = ux * EDGE_MAGNIFICATION;
  const ky = uy * EDGE_MAGNIFICATION;
  const huge = { x0: -Infinity, x1: Infinity, y0: -Infinity, y1: Infinity };
  const runs = sampleParametric(
    (s) => {
      const y = fn(s);
      return Number.isFinite(y) ? { x: s * kx, y: -y * ky } : null;
    },
    a,
    b,
    huge,
  );
  const xs = runs.flat().map((p) => p.x / kx);
  const out: XYPoint[] = [];
  for (const x of xs) {
    if (x <= a || x >= b) continue;
    if (out.length > 0 && x <= out[out.length - 1]!.x) continue;
    out.push({ x, y: fn(x) });
  }
  return [{ x: a, y: fn(a) }, ...out, { x: b, y: fn(b) }];
}

/** Signed area of a polygon (shoelace), positive counter-clockwise in axis units. */
export function shoelace(points: XYPoint[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    twice += p.x * q.y - q.x * p.y;
  }
  return twice / 2;
}

/** One stretch of a region on which the integrand keeps one sign. */
export type Part = { from: number; to: number; sign: 1 | -1 };

/**
 * Split [a, b] where h changes sign: the parts of an area above and below
 * the axis (h = f), or where two curves swap which is on top (h = f − g).
 *
 * The cuts are h's roots inside (a, b) found by `criticalPoints` -- sign
 * change and bisection, snapped to an exact value when h vanishes there -- and
 * a root that only touches ((x − 1)² at 1) splits nothing, since the parts on
 * either side have the same sign and are merged. A pole inside [a, b] is
 * refused: the region there is unbounded and has no area to print.
 */
export function signParts(h: (x: number) => number, a: number, b: number): Part[] {
  const critical = criticalPoints(h, a, b);
  const pole = critical.find((c) => c.kind === "pole");
  if (pole !== undefined) {
    throw new NumericError(`the integrand has a pole at x = ${round(pole.x)} inside [${round(a)}, ${round(b)}]`);
  }
  const width = b - a;
  const cuts = critical
    .filter((c) => c.x > a + 1e-9 * Math.max(1, width) && c.x < b - 1e-9 * Math.max(1, width))
    .map((c) => c.x);
  const edges = [a, ...cuts, b];
  const parts: Part[] = [];
  for (let i = 0; i + 1 < edges.length; i += 1) {
    const lo = edges[i]!;
    const hi = edges[i + 1]!;
    const sign = signOn(h, lo, hi);
    if (sign === 0) continue;
    const last = parts[parts.length - 1];
    if (last !== undefined && last.sign === sign && last.to === lo) last.to = hi;
    else parts.push({ from: lo, to: hi, sign });
  }
  return parts;
}

/** The sign h keeps on (lo, hi), read at a few interior points; 0 if it is zero there. */
function signOn(h: (x: number) => number, lo: number, hi: number): 1 | -1 | 0 {
  let best = 0;
  for (const t of [0.5, 0.25, 0.75, 0.1, 0.9]) {
    const y = h(lo + (hi - lo) * t);
    if (Number.isFinite(y) && Math.abs(y) > Math.abs(best)) best = y;
  }
  return best > 0 ? 1 : best < 0 ? -1 : 0;
}

/**
 * The intersections of two curves inside [lo, hi], as h = f − g's roots,
 * snapped. What `{between: [f, g]}` with no bounds takes its bounds from.
 */
export function intersections(h: (x: number) => number, lo: number, hi: number): number[] {
  return criticalPoints(h, lo, hi)
    .filter((c) => c.kind === "root")
    .map((c) => c.x);
}

/**
 * ∫ h over [a, b], integrated piece by piece between `breaks` (a piecewise
 * function's joins), each piece by `numeric.integrate`. Splitting at a join
 * keeps adaptive Simpson off a jump, which it would otherwise bisect until it
 * gave up -- refusing a perfectly good area.
 */
export function integral(h: (x: number) => number, a: number, b: number, breaks: number[]): number {
  const cuts = [a, ...breaks.filter((x) => x > a && x < b).sort((p, q) => p - q), b];
  let total = 0;
  for (let i = 0; i + 1 < cuts.length; i += 1) total += integrate(h, cuts[i]!, cuts[i + 1]!).value;
  return total;
}

function round(x: number): string {
  return Number(x.toPrecision(6)).toString();
}

// ---- polygon arithmetic in canvas pixels (for the label search) ------------

export type PxBox = { x: number; y: number; hw: number; hh: number };

function segmentCrossesBox(a: Point, b: Point, box: PxBox): boolean {
  const lo = { x: box.x - box.hw, y: box.y - box.hh };
  const hi = { x: box.x + box.hw, y: box.y + box.hh };
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [p, q] of [
    [-dx, a.x - lo.x],
    [dx, hi.x - a.x],
    [-dy, a.y - lo.y],
    [dy, hi.y - a.y],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return true;
}

/** Is the whole box inside the polygon, at least `margin` px from its outline? */
export function boxInside(box: PxBox, poly: Point[], margin: number): boolean {
  const grown = { ...box, hw: box.hw + margin, hh: box.hh + margin };
  if (!pointInPolygon({ x: box.x, y: box.y }, poly)) return false;
  for (let i = 0; i < poly.length; i += 1) {
    if (segmentCrossesBox(poly[i]!, poly[(i + 1) % poly.length]!, grown)) return false;
  }
  return true;
}

/** Does the box touch the polygon's area at all -- overlap, contain or be contained? */
export function boxMeetsPolygon(box: PxBox, poly: Point[]): boolean {
  if (pointInPolygon({ x: box.x, y: box.y }, poly)) return true;
  for (let i = 0; i < poly.length; i += 1) {
    if (segmentCrossesBox(poly[i]!, poly[(i + 1) % poly.length]!, box)) return true;
  }
  return false;
}

/** Subscript digits: 8 → "₈", 12 → "₁₂". */
export function subscript(n: number): string {
  const digits = "₀₁₂₃₄₅₆₇₈₉";
  return String(n)
    .split("")
    .map((d) => (d >= "0" && d <= "9" ? digits[Number(d)] : d))
    .join("");
}
