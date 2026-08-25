/**
 * Easing, and why it costs the motion check nothing (ADR 0014).
 *
 * The obvious worry is that easing breaks `boxes-do-not-overlap-during-
 * transition`: a box's position stops being affine in t, and the closed-form
 * solver in interval.ts assumes it is. It doesn't, and the reason is worth
 * stating rather than rediscovering.
 *
 * Every box shares ONE easing `e`, so position is `lerp(from, to, e(t))` for
 * all of them. Two boxes overlap at time `t` exactly when they overlap at
 * parameter `s = e(t)`. If `e` is continuous, non-decreasing, and maps 0 to 0
 * and 1 to 1, then:
 *
 *   - for any s in (0,1), the intermediate value theorem gives a t with
 *     e(t) = s, and that t is in (0,1) because e(0) and e(1) are 0 and 1;
 *   - conversely any t in (0,1) has some e(t) in [0,1], and e(t) can only
 *     equal 0 or 1 at an interior point if e is flat there -- impossible for a
 *     cubic Bezier, which is a non-constant polynomial and so has finitely
 *     many roots.
 *
 * So "the boxes overlap somewhere strictly inside the transition" is
 * INVARIANT under the easing. The solver answers the question in `s` and its
 * answer is already the answer in `t`. No sampling, no tolerance, no change
 * to interval.ts -- the same discipline ADR 0012 used to reject sampling
 * outright, applied to a degree of freedom that turns out to be free.
 *
 * The invariance needs all three of its premises, which is exactly what the
 * guard below enforces:
 *
 *   - ONE SHARED EASING. Per-element easing or a staggered `animation-delay`
 *     puts boxes on different clocks, the substitution differs per box, and
 *     the argument collapses. Neither is offered; both are M12 work with real
 *     new math behind them.
 *   - NON-DECREASING. An overshoot easing (`cubic-bezier(.68,-.55,.27,1.55)`
 *     and friends) sends the box past its own endpoint, somewhere no
 *     trajectory in trajectory.ts describes. Refused.
 *   - CONTINUOUS. `steps()` is monotone but skips whole ranges of `s`, so a
 *     real overlap can sit in a value the animation never takes -- surjectivity
 *     is the half of the argument it breaks. Refused.
 */

import { SpecError } from "../ir/types.ts";

/** CSS's named easings, as their cubic-bezier control points. */
const NAMED: Record<string, [number, number, number, number] | null> = {
  linear: null,
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};

const CUBIC_BEZIER = /^cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/;

/**
 * Validate an easing and return it as a CSS `animation-timing-function`.
 * Throws SpecError on anything the invariance argument above does not cover --
 * honest refusal, because here the tool genuinely cannot say whether the
 * animation is sound.
 */
export function parseEasing(value: string): string {
  const easing = value.trim();

  if (Object.prototype.hasOwnProperty.call(NAMED, easing)) {
    // Every CSS named easing satisfies the guard below; `ease` is the tightest
    // at y1 = 0.1, y2 = 1. Checked here rather than asserted, so a future
    // addition to the table cannot quietly bypass it.
    const points = NAMED[easing]!;
    if (points !== null) requireNonDecreasing(easing, points);
    return easing;
  }

  const match = CUBIC_BEZIER.exec(easing);
  if (match === null) {
    throw new SpecError(
      `animate: easing "${value}" is not supported. Use one of ` +
        `${Object.keys(NAMED).join(", ")}, or cubic-bezier(x1, y1, x2, y2). ` +
        `steps() is refused: it skips ranges of the transition, so a real ` +
        `overlap can fall in a value the animation never takes`,
    );
  }

  const numbers = match.slice(1, 5).map((part) => Number(part.trim()));
  if (numbers.some((n) => !Number.isFinite(n))) {
    throw new SpecError(`animate: easing "${value}" has a non-numeric control point`);
  }
  const [x1, y1, x2, y2] = numbers as [number, number, number, number];

  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
    throw new SpecError(
      `animate: easing "${value}" has an x control point outside [0,1], which CSS does not allow`,
    );
  }
  requireNonDecreasing(value, [x1, y1, x2, y2]);
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
}

/**
 * Refuse anything not provably non-decreasing.
 *
 * The derivative of the Bezier's y component, written in Bernstein form over
 * the quadratic basis, has control values `y1`, `y2 - y1` and `1 - y2`. A
 * Bezier lies within the convex hull of its control values, so all three
 * being non-negative -- that is, `0 <= y1 <= y2 <= 1` -- is SUFFICIENT for a
 * non-negative derivative everywhere.
 *
 * It is not necessary: `cubic-bezier(.5, 1, .5, 0)` is monotone (its
 * derivative works out to a perfect square) and this rejects it. A stated
 * conservative bound is the trade this project has made before -- the same
 * choice as the flattening tolerance -- and the alternative is sampling the
 * derivative, which is the one thing ADR 0012 ruled out by name.
 */
function requireNonDecreasing(value: string, [, y1, , y2]: [number, number, number, number]): void {
  if (!(y1 >= 0 && y2 >= y1 && y2 <= 1)) {
    throw new SpecError(
      `animate: easing "${value}" is not provably non-decreasing (needs 0 <= y1 <= y2 <= 1, ` +
        `got y1=${y1}, y2=${y2}). An overshooting easing carries a box past its own endpoint, ` +
        `which no trajectory describes and boxes-do-not-overlap-during-transition cannot verify`,
    );
  }
}
