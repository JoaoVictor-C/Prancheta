/**
 * Hit-testing in canvas pixels: distances from a point, a segment or a rect
 * to one another, whether a segment passes through a rect, whether a point is
 * inside a polygon, and the candidate centres a label is tried at beside a
 * straight run.
 *
 * Every preset that places a label measures it the way the checks measure it
 * -- box to ink, centre to ink -- and each had grown its own copy of the same
 * dozen lines (review of 2026-09-29: `distanceToSegment` in five files,
 * `segmentHitsRect` in five, `rectsMeet` in four). One implementation means a
 * fix to an edge case reaches every preset, and a preset cannot pass its own
 * placer while the check that judges it computes the distance differently.
 *
 * This is 2D canvas space only. Distances in R³ live with the space preset.
 */

import type { Point, Rect } from "../ir/types.ts";

/** Distance from (px, py) to the segment (ax, ay)–(bx, by): the coordinate form of `distanceToSegment`, for callers that hold no Point objects. */
export function distanceToSegmentXY(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Distance from p to the segment a–b (to the nearer end when a = b). */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  return distanceToSegmentXY(p.x, p.y, a.x, a.y, b.x, b.y);
}

/**
 * Distance from p to a polyline (`closed`: including the edge back to the
 * start). One point is a point; none is Infinity.
 */
export function distanceToPolyline(p: Point, pts: readonly Point[], closed = false): number {
  if (pts.length === 1) return Math.hypot(p.x - pts[0]!.x, p.y - pts[0]!.y);
  let best = Infinity;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i += 1) best = Math.min(best, distanceToSegment(p, pts[i]!, pts[(i + 1) % pts.length]!));
  return best;
}

/** Distance from p to a rect: 0 inside or on its edge. */
export function pointToRect(p: Point, r: Rect): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height));
  return Math.hypot(dx, dy);
}

/** Liang–Barsky: does segment ab pass through rect r? */
export function segmentHitsRect(a: Point, b: Point, r: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [p, q] of [
    [-dx, a.x - r.x],
    [dx, r.x + r.width - a.x],
    [-dy, a.y - r.y],
    [dy, r.y + r.height - a.y],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }
  return true;
}

/** Distance from a rect to a segment: 0 when they meet. */
function rectToSegment(r: Rect, a: Point, b: Point): number {
  if (segmentHitsRect(a, b, r)) return 0;
  const corners = [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x, y: r.y + r.height },
    { x: r.x + r.width, y: r.y + r.height },
  ];
  return Math.min(pointToRect(a, r), pointToRect(b, r), ...corners.map((c) => distanceToSegment(c, a, b)));
}

/** Distance from a rect to a polyline: 0 when any stretch of it passes through the rect. */
export function rectToPolyline(r: Rect, pts: readonly Point[]): number {
  if (pts.length === 1) return pointToRect(pts[0]!, r);
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i += 1) best = Math.min(best, rectToSegment(r, pts[i]!, pts[i + 1]!));
  return best;
}

/** Do two rects overlap, `a` grown by `pad` on every side first? Touching is not overlapping. */
export function rectsMeet(a: Rect, b: Rect, pad = 0): boolean {
  return a.x - pad < b.x + b.width && b.x - pad < a.x + a.width && a.y - pad < b.y + b.height && b.y - pad < a.y + a.height;
}

/** The rect of size w × h centred on c. */
export const rectAt = (c: Point, w: number, h: number): Rect => ({ x: c.x - w / 2, y: c.y - h / 2, width: w, height: h });

/** Even-odd: is p inside the polygon (an implicit edge closes it)? */
export function pointInPolygon(p: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export type BesideRun = {
  /** Distance kept between the box's near edge and the run, before `extras`. */
  gap: number;
  /** Further distances off the run, tried in turn after just clearing it. */
  extras: readonly number[];
  /** Which side of the normal (−dy, dx) is tried first: +1 or −1. Default +1. */
  side?: number;
};

/**
 * Candidate centres for a `w`×`h` box beside the straight run a→b: at each
 * fraction `t` of its length, on the preferred side then the other, just
 * clear of the run (the box's half-extent along the run's normal, plus `gap`)
 * and then a little further out. The presets differ only in `gap` and
 * `extras`, so each keeps a named wrapper with its own numbers.
 */
export function candidatesBeside(a: Point, b: Point, w: number, h: number, ts: readonly number[], how: BesideRun): Point[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const n = { x: -d.y, y: d.x };
  const clearance = Math.abs(n.x) * (w / 2) + Math.abs(n.y) * (h / 2) + how.gap;
  const side = how.side ?? 1;
  const out: Point[] = [];
  for (const extra of how.extras) {
    for (const t of ts) {
      for (const s of [side, -side]) {
        out.push({
          x: a.x + d.x * len * t + n.x * s * (clearance + extra),
          y: a.y + d.y * len * t + n.y * s * (clearance + extra),
        });
      }
    }
  }
  return out;
}
