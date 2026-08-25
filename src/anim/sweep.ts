/**
 * When does a MOVING line segment meet a MOVING box? (ADR 0017, M15.)
 *
 * The box solver in interval.ts gets to be pure linear algebra: two
 * axis-aligned rectangles overlap exactly when four affine inequalities hold
 * at once, so the answer is an intersection of half-lines. A segment against a
 * rectangle is not that, because the segment carries a third separating axis
 * -- its own normal -- and that axis TURNS as the segment moves.
 *
 * The separating-axis theorem for a segment (a degenerate 2-gon) against an
 * axis-aligned box needs exactly three axes:
 *
 *   x  -- the segment's x-extent against the box's
 *   y  -- likewise
 *   n  -- the segment's normal, on which the whole segment projects to a
 *         single value, so this axis separates exactly when all four box
 *         corners lie strictly on one side of the line through A and B
 *
 * With A(t), B(t) and the box's edges all affine in t, the first two axes give
 * affine inequalities, and the third gives the cross products
 *
 *     cross_i(t) = (B-A) x (C_i - A)
 *
 * which are products of two affine functions -- QUADRATIC in t. That is the
 * whole difficulty, and it is why this file exists instead of another call
 * into interval.ts.
 *
 * The method is a sign-invariant partition, and it is worth being precise
 * about why it is not the sampling this project keeps refusing. Between two
 * consecutive real roots of a polynomial, that polynomial cannot change sign
 * -- that is the intermediate value theorem, not an assumption about how
 * finely we looked. So: take the twelve polynomials the predicate is built
 * from, find all their real roots exactly (affine ones by division, quadratic
 * ones by the discriminant), and cut [0,1] at every root. On each open
 * subinterval every one of the twelve has a constant sign, so the predicate is
 * constant there too, and ONE evaluation anywhere inside settles the whole
 * subinterval. A sampling scheme is wrong when the sample rate misses a
 * feature; here there is provably no feature between the cuts to miss. The
 * cost is a partition of at most fifteen pieces, not a tolerance.
 */

import type { Rect } from "../ir/types.ts";
import type { TRange } from "./interval.ts";

/** `c[0] + c[1]*t`. */
type Affine = readonly [number, number];
/** `c[0] + c[1]*t + c[2]*t^2`. */
type Quadratic = readonly [number, number, number];

const affineAt = (a: Affine, t: number): number => a[0] + a[1] * t;
const quadraticAt = (q: Quadratic, t: number): number => q[0] + (q[1] + q[2] * t) * t;

/** Two endpoint values of an affine function of t on [0,1], as coefficients. */
const ends = (at0: number, at1: number): Affine => [at0, at1 - at0];

const subAffine = (a: Affine, b: Affine): Affine => [a[0] - b[0], a[1] - b[1]];

const mulAffine = (a: Affine, b: Affine): Quadratic => [
  a[0] * b[0],
  a[0] * b[1] + a[1] * b[0],
  a[1] * b[1],
];

const subQuadratic = (a: Quadratic, b: Quadratic): Quadratic => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];

/**
 * The same half-pixel the static `polylineIntersectsBox` shrinks a box by
 * (src/layout/connectors.ts). Sharing it is what lets this check delegate its
 * endpoints: at t=0 and t=1 the two must agree about what "clear" means, or
 * the transition check would contradict the state checks it defers to.
 */
export const EDGE_EPSILON = 0.5;

/**
 * Every span of t in [0,1] where the segment A->B is inside the box.
 *
 * `a0`/`a1` and `b0`/`b1` are the two segment endpoints at t=0 and t=1;
 * `box0`/`box1` the box's rect at the same two instants. All four travel
 * affinely between them, which is what the caller guarantees by cutting the
 * transition at every motion-window edge first.
 */
export function segmentSweepsBox(
  a0: { x: number; y: number },
  a1: { x: number; y: number },
  b0: { x: number; y: number },
  b1: { x: number; y: number },
  box0: Rect,
  box1: Rect,
): TRange[] {
  const ax = ends(a0.x, a1.x);
  const ay = ends(a0.y, a1.y);
  const bx = ends(b0.x, b1.x);
  const by = ends(b0.y, b1.y);

  const left = ends(box0.x + EDGE_EPSILON, box1.x + EDGE_EPSILON);
  const right = ends(
    box0.x + box0.width - EDGE_EPSILON,
    box1.x + box1.width - EDGE_EPSILON,
  );
  const top = ends(box0.y + EDGE_EPSILON, box1.y + EDGE_EPSILON);
  const bottom = ends(
    box0.y + box0.height - EDGE_EPSILON,
    box1.y + box1.height - EDGE_EPSILON,
  );

  // A box thinner than the epsilon it is shrunk by has no interior left to be
  // inside of, exactly as the static check decides.
  if (
    box0.width <= 2 * EDGE_EPSILON ||
    box1.width <= 2 * EDGE_EPSILON ||
    box0.height <= 2 * EDGE_EPSILON ||
    box1.height <= 2 * EDGE_EPSILON
  ) {
    return [];
  }

  // Axis x and axis y. min(ax,bx) < right  <=>  ax < right OR bx < right, and
  // symmetrically for the max -- so the min/max never needs its own cut point.
  const slab: Affine[] = [
    subAffine(right, ax),
    subAffine(right, bx),
    subAffine(ax, left),
    subAffine(bx, left),
    subAffine(bottom, ay),
    subAffine(bottom, by),
    subAffine(ay, top),
    subAffine(by, top),
  ];

  // Axis n: the four corner cross products.
  const dx = subAffine(bx, ax);
  const dy = subAffine(by, ay);
  const corners: [Affine, Affine][] = [
    [left, top],
    [right, top],
    [left, bottom],
    [right, bottom],
  ];
  const cross: Quadratic[] = corners.map(([cx, cy]) =>
    subQuadratic(mulAffine(dx, subAffine(cy, ay)), mulAffine(dy, subAffine(cx, ax))),
  );

  const inside = (t: number): boolean => {
    const s = slab.map((p) => affineAt(p, t));
    if (!(s[0]! > 0 || s[1]! > 0)) return false;
    if (!(s[2]! > 0 || s[3]! > 0)) return false;
    if (!(s[4]! > 0 || s[5]! > 0)) return false;
    if (!(s[6]! > 0 || s[7]! > 0)) return false;
    const values = cross.map((q) => quadraticAt(q, t));
    if (values.every((v) => v > 0)) return false;
    if (values.every((v) => v < 0)) return false;
    return true;
  };

  const cuts = new Set<number>([0, 1]);
  for (const p of slab) for (const root of affineRoots(p)) cuts.add(root);
  for (const q of cross) for (const root of quadraticRoots(q)) cuts.add(root);
  const ordered = [...cuts].filter((t) => t >= 0 && t <= 1).sort((x, y) => x - y);

  const out: TRange[] = [];
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const lo = ordered[i]!;
    const hi = ordered[i + 1]!;
    if (hi - lo < 1e-12) continue;
    if (!inside((lo + hi) / 2)) continue;
    const last = out[out.length - 1];
    if (last !== undefined && lo - last.hi < 1e-12) last.hi = hi;
    else out.push({ lo, hi });
  }
  return out;
}

function affineRoots(a: Affine): number[] {
  if (a[1] === 0) return [];
  return [-a[0] / a[1]];
}

function quadraticRoots(q: Quadratic): number[] {
  const [c0, c1, c2] = q;
  // Degenerate to affine rather than dividing by a near-zero leading term: a
  // route whose two states share a vertex position gives exactly c2 = 0.
  if (c2 === 0) return affineRoots([c0, c1]);
  const discriminant = c1 * c1 - 4 * c2 * c0;
  if (discriminant < 0) return [];
  if (discriminant === 0) return [-c1 / (2 * c2)];
  const root = Math.sqrt(discriminant);
  // The numerically stable pair: computing both roots from the same
  // subtraction loses precision when c1 dominates.
  const branch = -0.5 * (c1 + Math.sign(c1 || 1) * root);
  return [branch / c2, c0 / branch];
}
