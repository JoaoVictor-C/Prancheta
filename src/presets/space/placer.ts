/**
 * Label placement for the space preset, measured the way the checks measure.
 *
 * Every label is chosen from candidates beside its own ink, and a candidate
 * is accepted only when:
 *
 *  - its box, grown by MARGIN px, crosses no stroked ink and no other label
 *    (`text-clear-of-ink`, `text-clear-of-other-boxes`) -- the margin is
 *    what survives another machine's slightly wider font;
 *  - an ELEMENT label's centre is nearer its own ink than any other ink by
 *    a few px (`annotation-nearest-its-owner`, centre-to-polyline);
 *  - a PLACE label's box is within its own size of the place, and nearer the
 *    place than any ink that does not pass through it, and than any other
 *    place (`label-nearest-its-place`, edge-to-polyline).
 *
 * Labels carry no backing, so nothing here ever covers ink (ADR 0035's
 * `backing-hides-no-ink` has nothing to find).
 */

import type { Point, Rect } from "../../ir/types.ts";
import { candidatesBeside, distanceToPolyline, pointToRect, rectAt, rectToPolyline, segmentHitsRect } from "../../geometry/hit.ts";

/** Extra room kept around every label, px. */
export const MARGIN = 3;

type Ink = { id: string; group: string; pts: Point[]; stroked: boolean; box: Rect };

/** The bounding box of a polyline, kept so a label far from a line skips its segments. */
function boundsOf(pts: Point[]): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of pts) {
    if (q.x < x0) x0 = q.x;
    if (q.x > x1) x1 = q.x;
    if (q.y < y0) y0 = q.y;
    if (q.y > y1) y1 = q.y;
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export class SpacePlacer {
  private readonly ink: Ink[] = [];
  private readonly labels: Rect[] = [];
  private readonly places: Point[] = [];
  private readonly bounds: Rect;

  constructor(bounds: Rect) {
    this.bounds = bounds;
  }

  /** A drawn polyline. `group` ties the pieces of one object together (a line split into visible and hidden stretches). */
  addInk(id: string, group: string, pts: Point[], stroked = true): void {
    this.ink.push({ id, group, pts, stroked, box: boundsOf(pts) });
  }

  addPlace(p: Point): void {
    this.places.push(p);
  }

  reserve(r: Rect): void {
    this.labels.push(r);
  }

  private clash(box: Rect): number {
    const b = this.bounds;
    if (box.x < b.x || box.y < b.y || box.x + box.width > b.x + b.width || box.y + box.height > b.y + b.height) return Infinity;
    const grown = { x: box.x - MARGIN, y: box.y - MARGIN, width: box.width + 2 * MARGIN, height: box.height + 2 * MARGIN };
    let cost = 0;
    for (const line of this.ink) {
      if (!line.stroked) continue;
      const lb = line.box;
      if (lb.x > grown.x + grown.width || lb.x + lb.width < grown.x || lb.y > grown.y + grown.height || lb.y + lb.height < grown.y) continue;
      for (let i = 0; i < line.pts.length - 1; i += 1) {
        if (segmentHitsRect(line.pts[i]!, line.pts[i + 1]!, grown)) {
          cost += 10;
          break;
        }
      }
    }
    for (const other of this.labels) {
      if (other.x - MARGIN < box.x + box.width && box.x - MARGIN < other.x + other.width && other.y - MARGIN < box.y + box.height && box.y - MARGIN < other.y + other.height) cost += 10;
    }
    return cost;
  }

  /** Cost of a label naming the ink `group`, centred at `c`. 0 is honest. */
  elementCost(group: string, c: Point, w: number, h: number, lead = 4): number {
    const box = rectAt(c, w, h);
    let cost = this.clash(box);
    if (cost === Infinity) return cost;
    const own = this.ink.filter((l) => l.group === group);
    const toOwner = Math.min(...own.map((l) => distanceToPolyline(c, l.pts)));
    let rival = Infinity;
    for (const l of this.ink) if (l.group !== group) rival = Math.min(rival, distanceToPolyline(c, l.pts));
    if (rival < toOwner + lead) cost += rival < toOwner - 0.5 ? 5 : 1;
    return cost;
  }

  /**
   * Cost of a label naming the place `p`, centred at `c`. Ink competes
   * unless it passes through the place itself (measured per piece, exactly
   * as the check does: a box edge that merely belongs to the same guide
   * group still competes) or belongs to `own` (the place's own dot).
   */
  placeCost(p: Point, own: string | null, c: Point, w: number, h: number, lead = 3): number {
    const box = rectAt(c, w, h);
    let cost = this.clash(box);
    if (cost === Infinity) return cost;
    const toPlace = pointToRect(p, box);
    if (toPlace > Math.max(w, h) - 2) cost += 5;
    for (const l of this.ink) {
      if (own !== null && l.group === own) continue;
      if (distanceToPolyline(p, l.pts) <= 0.5) continue;
      if (rectToPolyline(box, l.pts) < toPlace + lead) {
        cost += 5;
        break;
      }
    }
    for (const q of this.places) {
      if (Math.hypot(q.x - p.x, q.y - p.y) <= 0.5) continue;
      if (pointToRect(q, box) < toPlace + lead) cost += 5;
    }
    return cost;
  }

  /** The first zero-cost spot, else the least bad one; the chosen box is reserved unless `keep` is false. */
  choose(spots: Point[], w: number, h: number, cost: (c: Point) => number, keep = true): { centre: Point; cost: number } {
    let best = { centre: spots[0]!, cost: Infinity };
    for (const c of spots) {
      const k = cost(c);
      if (k === 0) {
        best = { centre: c, cost: 0 };
        break;
      }
      if (k < best.cost) best = { centre: c, cost: k };
    }
    if (keep) this.labels.push(rectAt(best.centre, w, h));
    return best;
  }

  /** The id of the ink piece of `group` nearest `c` -- what an element label `annotates`. */
  nearestOf(group: string, c: Point): string {
    let best = { id: "", d: Infinity };
    for (const l of this.ink) {
      if (l.group !== group) continue;
      const d = distanceToPolyline(c, l.pts);
      if (d < best.d) best = { id: l.id, d };
    }
    return best.id;
  }
}

/**
 * Candidate centres around a place, the way a hand places a point's name:
 * the box's nearest corner or edge `gap` px from the place, at eight
 * compass positions (upper-right first, the textbook habit), plus the
 * half-shifted positions above and below, at growing gaps.
 */
export function aroundPlace(p: Point, w: number, h: number, r: number): Point[] {
  const out: Point[] = [];
  for (const extra of [0, 3, 7, 12, 18, 26, 38, 52, 70]) {
    const g = r + MARGIN + 2 + extra;
    const d = g * Math.SQRT1_2;
    out.push(
      { x: p.x + d + w / 2, y: p.y - d - h / 2 }, // NE
      { x: p.x + g + w / 2, y: p.y }, // E
      { x: p.x - d - w / 2, y: p.y - d - h / 2 }, // NW
      { x: p.x, y: p.y - g - h / 2 }, // N
      { x: p.x + d + w / 2, y: p.y + d + h / 2 }, // SE
      { x: p.x - g - w / 2, y: p.y }, // W
      { x: p.x - d - w / 2, y: p.y + d + h / 2 }, // SW
      { x: p.x, y: p.y + g + h / 2 }, // S
      { x: p.x + w / 4, y: p.y - g - h / 2 },
      { x: p.x - w / 4, y: p.y - g - h / 2 },
      { x: p.x + w / 4, y: p.y + g + h / 2 },
      { x: p.x - w / 4, y: p.y + g + h / 2 },
    );
  }
  return out;
}

/** Candidate centres beside the straight run a→b at fractions `ts`, on both sides, just clear of it and then further out. */
export function besideRun(a: Point, b: Point, w: number, h: number, ts: number[]): Point[] {
  return candidatesBeside(a, b, w, h, ts, { gap: MARGIN + 3, extras: [0, 5, 10, 16] });
}
