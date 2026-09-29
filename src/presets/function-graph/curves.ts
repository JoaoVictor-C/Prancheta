/**
 * Sampling and clipping for curves that are not graphs of a function
 * (ADR 0029): parametric (x(t), y(t)), polar r(θ), and the polylines an
 * implicit equation's contour produces.
 *
 * A graph y = f(x) is drawn from 240 evenly spaced samples, and that has
 * been enough: x advances steadily across the page, so even samples are
 * even on paper. A parameter does not advance steadily across anything. A
 * cardioid crawls near its cusp and races on the far side; r = 1/cos θ goes
 * to infinity in the middle of its interval. Even samples in t are uneven on
 * paper -- a polygon where the curve is fast, and a chord straight across
 * the page where it passes through infinity.
 *
 * So sampling here is adaptive, and in PIXELS: an interval of the parameter
 * is split while the curve's midpoint strays from the chord by more than a
 * quarter of an output pixel, while the two half-chords turn by more than a
 * few degrees, or while the chord is longer than a short run of ink. Where it
 * will not settle -- the chord stays long however small the interval gets --
 * the curve has jumped (a pole, an asymptote, a branch change) and the run is
 * BROKEN there instead of joined across. Where the curve is undefined
 * (NaN), the run ends at the last defined sample the refinement finds.
 *
 * Clipping is exact: a segment leaving the plotted range is cut at the edge
 * (Liang–Barsky), so a curve reaches the border instead of stopping one
 * sample short of it, and nothing outside the range is drawn.
 */

import type { Point } from "../../ir/types.ts";
import { distanceToSegment } from "../../geometry/hit.ts";

export type Rect = { x0: number; x1: number; y0: number; y1: number };

/** Base intervals before any refinement: enough to see every loop of a rose. */
const BASE = 128;
/** Halvings of a base interval: 128 · 2¹² ≈ 500 000 effective samples where needed. */
const MAX_DEPTH = 12;
/** A curve evaluation budget per stroke; past it, chords are accepted as they are. */
const BUDGET = 200_000;
/**
 * How far (px) a midpoint may stray from its chord before the interval is
 * split: a quarter of an OUTPUT pixel. The PNG is rasterised at 2x (and the
 * SVG is zoomed at will), so a quarter of a CSS pixel was half a pixel of
 * what the reader sees.
 */
const FLAT = 0.125;
/**
 * The most (radians, about 4 deg) a chord may turn from its neighbour. The
 * eye reads a polygon by its corners, not by how far its chords stray: at a
 * rose's petal tip (radius of curvature 30px) chords of 7px met the
 * quarter-pixel bound yet turned 14 deg at every vertex, and the petal was
 * visibly faceted. Bounding the turn bounds both, since a chord's sagitta
 * is about a quarter of its length times its turn.
 */
const TURN = 0.07;
/** Chords shorter than this (px) are not refined for their turn: below a pixel a corner is a cusp, not a facet. */
const TINY = 0.5;
/** The longest chord (px) accepted without looking at its middle more closely. */
const LONG = 24;
/** At the deepest level, a chord longer than this (px) is a jump, not a curve. */
const JUMP = 2;

/** The angle (radians) between chords a→m and m→b: how sharply a polyline through them turns at m. */
function turn(a: Point, m: Point, b: Point): number {
  const ux = m.x - a.x;
  const uy = m.y - a.y;
  const vx = b.x - m.x;
  const vy = b.y - m.y;
  if ((ux === 0 && uy === 0) || (vx === 0 && vy === 0)) return 0;
  return Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
}

/** Are all these points outside the rect beyond the SAME edge? Then nothing between them can be seen. */
function outsideTogether(points: Point[], r: Rect): boolean {
  return (
    points.every((p) => p.x < r.x0) ||
    points.every((p) => p.x > r.x1) ||
    points.every((p) => p.y < r.y0) ||
    points.every((p) => p.y > r.y1)
  );
}

/**
 * A parametric curve over [a, b] as runs of pixel points, unclipped. `at`
 * maps a parameter value to a pixel point, or null where the curve is
 * undefined. `view` is only used to stop refining where the curve is
 * off the page on one side -- where it cannot be seen, straightness does not
 * matter.
 */
export function sampleParametric(at: (s: number) => Point | null, a: number, b: number, view: Rect): Point[][] {
  const runs: Point[][] = [];
  let run: Point[] = [];
  let spent = 0;
  const evaluate = (s: number): Point | null => {
    spent += 1;
    const p = at(s);
    return p === null || !Number.isFinite(p.x) || !Number.isFinite(p.y) ? null : p;
  };
  const brk = (): void => {
    if (run.length > 1) runs.push(run);
    run = [];
  };
  const emit = (p: Point): void => {
    run.push(p);
  };
  const refine = (s0: number, p0: Point | null, s1: number, p1: Point | null, depth: number): void => {
    if (p0 === null && p1 === null) return;
    const exhausted = spent >= BUDGET;
    if (p0 !== null && p1 !== null && exhausted) {
      emit(p1);
      return;
    }
    const sm = (s0 + s1) / 2;
    if (depth >= MAX_DEPTH || exhausted || sm === s0 || sm === s1) {
      // As fine as it goes. A short chord is the curve; a long one is a jump.
      if (p0 !== null && p1 !== null && Math.hypot(p1.x - p0.x, p1.y - p0.y) <= JUMP) {
        emit(p1);
        return;
      }
      brk();
      if (p1 !== null) emit(p1);
      return;
    }
    const pm = evaluate(sm);
    if (p0 !== null && p1 !== null && pm !== null) {
      if (outsideTogether([p0, pm, p1], view)) {
        emit(p1);
        return;
      }
      const chord = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      if (chord <= LONG && distanceToSegment(pm, p0, p1) <= FLAT && (chord <= TINY || turn(p0, pm, p1) <= TURN)) {
        emit(p1);
        return;
      }
    }
    refine(s0, p0, sm, pm, depth + 1);
    refine(sm, pm, s1, p1, depth + 1);
  };
  let s0 = a;
  let p0 = evaluate(a);
  if (p0 !== null) emit(p0);
  for (let i = 1; i <= BASE; i += 1) {
    const s1 = a + ((b - a) * i) / BASE;
    const p1 = evaluate(s1);
    refine(s0, p0, s1, p1, 0);
    s0 = s1;
    p0 = p1;
  }
  brk();
  return runs;
}

/** Liang–Barsky: the part of segment a→b inside r, as parameters [t0, t1] along it, or null. */
function clipSegment(a: Point, b: Point, r: Rect): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [p, q] of [
    [-dx, a.x - r.x0],
    [dx, r.x1 - a.x],
    [-dy, a.y - r.y0],
    [dy, r.y1 - a.y],
  ] as const) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return t0 <= t1 ? [t0, t1] : null;
}

/**
 * Runs cut to the rect: a run that leaves and re-enters becomes two, each
 * ending exactly on the border where it crossed it.
 */
export function clipRuns(runs: Point[][], r: Rect): Point[][] {
  const out: Point[][] = [];
  for (const source of runs) {
    let current: Point[] = [];
    const flush = (): void => {
      if (current.length > 1) out.push(current);
      current = [];
    };
    for (let i = 1; i < source.length; i += 1) {
      const a = source[i - 1]!;
      const b = source[i]!;
      const cut = clipSegment(a, b, r);
      if (cut === null) {
        flush();
        continue;
      }
      const [t0, t1] = cut;
      const start = { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 };
      const end = { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 };
      if (t0 > 0 || current.length === 0) {
        flush();
        current.push(start);
      }
      current.push(end);
      if (t1 < 1) flush();
    }
    flush();
  }
  return out;
}
