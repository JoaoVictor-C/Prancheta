/**
 * Label placement for constructions, measured the way the checks measure.
 *
 * A construction puts many lines through one point -- three bisectors through
 * an incentre, two sides and a circle through a vertex -- so a label cannot
 * be "somewhere near" its point; it has to sit in the gap the lines leave and
 * still be nearer its own thing than anything else. Every spot offered here
 * is scored against the rules the finished figure is held to, computed with
 * the same metrics the checks use, so a spot this accepts is one they pass:
 *
 *  - `text-clear-of-ink`: the label's box, padded by MARGIN, crosses no ink
 *    at all -- not even what it names, because every label here is set on
 *    NO backing (ADR 0035: a backing over a line is the defect, not the cure);
 *  - `text-clear-of-other-boxes`: it meets no other label or tick number;
 *  - `label-nearest-its-place` (a point's name): the box's near edge is within
 *    the box's own size of the place, and nothing that does not pass through
 *    the place -- no line, no other point -- is nearer the box than the place;
 *  - `annotation-nearest-its-owner` (a length, an angle, a line's name): from
 *    the box's centre, its own ink is nearer than any other ink.
 *
 * MARGIN is the reviewer's rule: ≥ 3px, so a slightly wider font on another
 * machine does not push a glyph onto a line the estimate said it cleared.
 */

import type { Point } from "../../ir/types.ts";

export type Rect = { x: number; y: number; width: number; height: number };

/** Clearance kept between a label's box and any ink or other box. */
export const MARGIN = 3;

type Ink = {
  id: string;
  pts: Point[];
  /** False for an axis: no check lets grid furniture win "nearest", but text must still stay off it. */
  competes: boolean;
  /** A point's dot: counts as passing through its own point (ADR 0035's marker rule). */
  dot?: { c: Point; r: number };
};

export function pointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function pointToPolyline(p: Point, pts: Point[]): number {
  if (pts.length === 1) return Math.hypot(p.x - pts[0]!.x, p.y - pts[0]!.y);
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i += 1) best = Math.min(best, pointToSegment(p, pts[i]!, pts[i + 1]!));
  return best;
}

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

function rectToSegment(r: Rect, a: Point, b: Point): number {
  if (segmentHitsRect(a, b, r)) return 0;
  const corners = [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x, y: r.y + r.height },
    { x: r.x + r.width, y: r.y + r.height },
  ];
  return Math.min(pointToRect(a, r), pointToRect(b, r), ...corners.map((c) => pointToSegment(c, a, b)));
}

export function rectToPolyline(r: Rect, pts: Point[]): number {
  if (pts.length === 1) return pointToRect(pts[0]!, r);
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i += 1) best = Math.min(best, rectToSegment(r, pts[i]!, pts[i + 1]!));
  return best;
}

function rectsMeet(a: Rect, b: Rect, pad: number): boolean {
  return a.x - pad < b.x + b.width && b.x - pad < a.x + a.width && a.y - pad < b.y + b.height && b.y - pad < a.y + a.height;
}

export const rectAt = (c: Point, w: number, h: number): Rect => ({ x: c.x - w / 2, y: c.y - h / 2, width: w, height: h });

export type Claim = { kind: "place"; id: string; at: Point } | { kind: "element"; id: string };

export class Placer {
  private ink: Ink[] = [];
  private places: { id: string; at: Point }[] = [];
  private boxes: Rect[] = [];
  private readonly bounds: Rect;

  constructor(bounds: Rect) {
    this.bounds = bounds;
  }

  addInk(id: string, pts: Point[], competes = true, dot?: { c: Point; r: number }): void {
    this.ink.push({ id, pts, competes, ...(dot === undefined ? {} : { dot }) });
  }

  removeInk(id: string): void {
    this.ink = this.ink.filter((i) => i.id !== id);
  }

  addPlace(id: string, at: Point): void {
    this.places.push({ id, at });
  }

  reserve(r: Rect): void {
    this.boxes.push(r);
  }

  /** The directions (radians, canvas space) in which ink leaves `at` -- the lines a point's label must sit between. */
  incident(at: Point): number[] {
    const out: number[] = [];
    for (const ink of this.ink) {
      if (ink.dot !== undefined) continue;
      if (pointToPolyline(at, ink.pts) > 1) continue;
      // Walk 14px along the polyline each way from the point nearest `at`.
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < ink.pts.length - 1; i += 1) {
        const d = pointToSegment(at, ink.pts[i]!, ink.pts[i + 1]!);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      for (const dir of [1, -1]) {
        let k = dir === 1 ? best + 1 : best;
        let target: Point | undefined;
        while (k >= 0 && k < ink.pts.length) {
          const p = ink.pts[k]!;
          if (Math.hypot(p.x - at.x, p.y - at.y) >= 14) {
            target = p;
            break;
          }
          k += dir;
        }
        if (target === undefined) {
          const end = ink.pts[dir === 1 ? ink.pts.length - 1 : 0]!;
          if (Math.hypot(end.x - at.x, end.y - at.y) > 2) target = end;
        }
        if (target !== undefined) out.push(Math.atan2(target.y - at.y, target.x - at.x));
      }
    }
    return out;
  }

  /** How badly a label box `r` making `claim` breaks the rules; 0 is honest. */
  cost(claim: Claim, r: Rect, margin: number): number {
    const b = this.bounds;
    if (r.x < b.x || r.y < b.y || r.x + r.width > b.x + b.width || r.y + r.height > b.y + b.height) return Infinity;
    const padded = { x: r.x - MARGIN, y: r.y - MARGIN, width: r.width + 2 * MARGIN, height: r.height + 2 * MARGIN };
    let cost = 0;
    for (const ink of this.ink) {
      for (let i = 0; i < ink.pts.length - 1; i += 1) {
        if (segmentHitsRect(ink.pts[i]!, ink.pts[i + 1]!, padded)) {
          // Text on a line is the worst thing a label can do: worse than
          // sitting a little far from its point, which only a check sees.
          cost += 100;
          break;
        }
      }
    }
    for (const other of this.boxes) if (rectsMeet(r, other, MARGIN)) cost += 50;

    if (claim.kind === "place") {
      const d0 = pointToRect(claim.at, r);
      if (d0 > Math.max(r.width, r.height)) cost += 20;
      for (const ink of this.ink) {
        if (!ink.competes) continue;
        const through =
          pointToPolyline(claim.at, ink.pts) <= 0.75 ||
          (ink.dot !== undefined && Math.hypot(claim.at.x - ink.dot.c.x, claim.at.y - ink.dot.c.y) <= ink.dot.r + 0.5);
        if (through) continue;
        const d = rectToPolyline(r, ink.pts);
        if (d < d0 + margin) cost += d < d0 - 0.5 ? 5 : 1;
      }
      for (const p of this.places) {
        if (p.id === claim.id) continue;
        if (Math.hypot(p.at.x - claim.at.x, p.at.y - claim.at.y) <= 0.75) continue;
        const d = pointToRect(p.at, r);
        if (d < d0 + margin) cost += d < d0 - 0.5 ? 5 : 1;
      }
      return cost;
    }

    const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    const own = this.ink.filter((i) => i.id === claim.id);
    const d0 = own.length === 0 ? Infinity : Math.min(...own.map((i) => pointToPolyline(c, i.pts)));
    for (const ink of this.ink) {
      if (ink.id === claim.id || !ink.competes) continue;
      const d = pointToPolyline(c, ink.pts);
      if (d < d0 + margin) cost += d < d0 - 0.5 ? 5 : 1;
    }
    return cost;
  }

  /**
   * The first spot, in the caller's order of preference, that costs nothing
   * with a clear margin; then one that ties; then the least bad. A label with
   * no honest spot keeps its least-bad one beside its own ink and the checks
   * say what is wrong -- it never goes looking for room beside something else.
   */
  choose(claim: Claim, w: number, h: number, centres: Point[]): { centre: Point; cost: number } {
    for (const margin of [4, 0]) {
      for (const c of centres) if (this.cost(claim, rectAt(c, w, h), margin) === 0) return { centre: c, cost: 0 };
    }
    let best = { centre: centres[0]!, cost: Infinity };
    for (const c of centres) {
      const cost = this.cost(claim, rectAt(c, w, h), 0);
      if (cost < best.cost) best = { centre: c, cost };
    }
    return best;
  }

  commit(r: Rect): void {
    this.boxes.push(r);
  }

  /**
   * Whether `r` is inside the bounds and meets no ink but `except`'s and no
   * committed box, with MARGIN to spare -- the test for a label set INTO a
   * gap cut in its own line, where the own ink is about to be removed.
   */
  clearOf(r: Rect, except: string): boolean {
    const b = this.bounds;
    if (r.x < b.x || r.y < b.y || r.x + r.width > b.x + b.width || r.y + r.height > b.y + b.height) return false;
    const padded = { x: r.x - MARGIN, y: r.y - MARGIN, width: r.width + 2 * MARGIN, height: r.height + 2 * MARGIN };
    for (const ink of this.ink) {
      if (ink.id === except) continue;
      if (ink.dot !== undefined && pointToRect(ink.dot.c, padded) <= ink.dot.r) return false;
      for (let i = 0; i < ink.pts.length - 1; i += 1) if (segmentHitsRect(ink.pts[i]!, ink.pts[i + 1]!, padded)) return false;
    }
    for (const other of this.boxes) if (rectsMeet(r, other, MARGIN)) return false;
    return true;
  }
}

/**
 * Centres for a `w`×`h` label beside `at`, ordered by how far each direction
 * is from the ink leaving the point (`incident`) and, second, by how well it
 * faces `outward` -- a triangle's vertex names go outside the triangle.
 */
export function aroundPoint(at: Point, w: number, h: number, incident: number[], outward: Point | null): Point[] {
  const dirs: { a: number; score: number }[] = [];
  for (let k = 0; k < 48; k += 1) {
    const a = (k * Math.PI * 2) / 48;
    let gap = Math.PI;
    for (const i of incident) {
      let d = Math.abs(a - i) % (2 * Math.PI);
      if (d > Math.PI) d = 2 * Math.PI - d;
      gap = Math.min(gap, d);
    }
    const u = { x: Math.cos(a), y: Math.sin(a) };
    const facing = outward === null ? 0 : u.x * outward.x + u.y * outward.y;
    // Up-and-right is where a reader looks first, all else equal.
    const habit = -0.05 * u.y + 0.02 * u.x;
    dirs.push({ a, score: Math.min(gap, 1.2) + 0.45 * facing + habit });
  }
  dirs.sort((p, q) => q.score - p.score);
  const out: Point[] = [];
  for (const gap of [3, 6, 10, 14, 18, 22]) {
    for (const d of dirs) {
      const u = { x: Math.cos(d.a), y: Math.sin(d.a) };
      const reach = Math.abs(u.x) * (w / 2) + Math.abs(u.y) * (h / 2);
      out.push({ x: at.x + u.x * (gap + reach), y: at.y + u.y * (gap + reach) });
    }
  }
  return out;
}

/**
 * Centres beside the straight run `a`→`b`, at each fraction `t` of its
 * length, on the preferred side first (`side` = +1 or −1 along the normal
 * (−dy, dx)), just clear of the run and then a little further out.
 */
export function besideRun(a: Point, b: Point, w: number, h: number, ts: number[], side = 1): Point[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const n = { x: -d.y, y: d.x };
  const clearance = Math.abs(n.x) * (w / 2) + Math.abs(n.y) * (h / 2) + MARGIN + 2;
  const out: Point[] = [];
  for (const extra of [0, 4, 9, 15]) {
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

/** Centres beside a polyline at fractions of its arc length, using the local direction there. */
export function besidePolyline(pts: Point[], w: number, h: number, ts: number[], outwardOf?: Point): Point[] {
  const lens: number[] = [0];
  for (let i = 1; i < pts.length; i += 1) lens.push(lens[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  const total = lens[lens.length - 1]!;
  const out: Point[] = [];
  for (const extra of [0, 4, 9, 15]) {
    for (const t of ts) {
      const s = t * total;
      let i = 1;
      while (i < lens.length - 1 && lens[i]! < s) i += 1;
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const seg = lens[i]! - lens[i - 1]! || 1;
      const f = (s - lens[i - 1]!) / seg;
      const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      const d = { x: (b.x - a.x) / seg, y: (b.y - a.y) / seg };
      let n = { x: -d.y, y: d.x };
      if (outwardOf !== undefined && n.x * (p.x - outwardOf.x) + n.y * (p.y - outwardOf.y) < 0) n = { x: -n.x, y: -n.y };
      const clearance = Math.abs(n.x) * (w / 2) + Math.abs(n.y) * (h / 2) + MARGIN + 2;
      for (const side of [1, -1]) {
        out.push({ x: p.x + n.x * side * (clearance + extra), y: p.y + n.y * side * (clearance + extra) });
      }
    }
  }
  return out;
}
