/**
 * Closed-form interval arithmetic over t in [0,1] for affine motion (ADR
 * 0012). A box translating linearly has x(t), y(t) affine in t, so whether
 * two such boxes ever overlap during the transition has an exact answer:
 * solve the linear inequalities `intersects`/`contains` already encode for
 * t, rather than sampling and hoping the sample rate was fine enough --
 * exactly the failure mode the 2026-08-23 curve-flattening fix retired for
 * beziers. No tolerance parameter here because none is needed: the algebra
 * is exact.
 */

export type TRange = { lo: number; hi: number };

/** Solve `c0 + c1*t < 0` for t. Null means never true. */
export function solveLess(c0: number, c1: number): TRange | null {
  if (c1 > 0) return { lo: -Infinity, hi: -c0 / c1 };
  if (c1 < 0) return { lo: -c0 / c1, hi: Infinity };
  return c0 < 0 ? { lo: -Infinity, hi: Infinity } : null;
}

/** Solve `c0 + c1*t > 0` for t. */
export function solveGreater(c0: number, c1: number): TRange | null {
  return solveLess(-c0, -c1);
}

/** Solve `c0 + c1*t <= 0` for t. */
export function solveLessEq(c0: number, c1: number): TRange | null {
  if (c1 > 0) return { lo: -Infinity, hi: -c0 / c1 };
  if (c1 < 0) return { lo: -c0 / c1, hi: Infinity };
  return c0 <= 0 ? { lo: -Infinity, hi: Infinity } : null;
}

/** Solve `c0 + c1*t >= 0` for t. */
export function solveGreaterEq(c0: number, c1: number): TRange | null {
  return solveLessEq(-c0, -c1);
}

export function intersectRange(a: TRange | null, b: TRange | null): TRange | null {
  if (a === null || b === null) return null;
  const lo = Math.max(a.lo, b.lo);
  const hi = Math.min(a.hi, b.hi);
  return lo < hi ? { lo, hi } : null;
}

/** `a` minus `b`, as zero, one, or two disjoint pieces. */
export function subtractRange(a: TRange | null, b: TRange | null): TRange[] {
  if (a === null) return [];
  if (b === null) return [a];
  const pieces: TRange[] = [];
  if (b.lo > a.lo) pieces.push({ lo: a.lo, hi: Math.min(a.hi, b.lo) });
  if (b.hi < a.hi) pieces.push({ lo: Math.max(a.lo, b.hi), hi: a.hi });
  return pieces.filter((piece) => piece.lo < piece.hi);
}

export function subtractRangeFromMany(ranges: TRange[], b: TRange | null): TRange[] {
  return ranges.flatMap((range) => subtractRange(range, b));
}

/** True when any piece has a real (non-degenerate) intersection with the open interval (lo, hi). */
export function anyRangeMeetsOpenInterval(ranges: TRange[], lo: number, hi: number): boolean {
  return ranges.some((range) => Math.min(range.hi, hi) - Math.max(range.lo, lo) > 1e-9);
}
