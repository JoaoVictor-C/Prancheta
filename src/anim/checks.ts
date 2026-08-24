/**
 * Motion-aware checks (ADR 0012, M11).
 *
 * Every check in checks.ts examines one instant. This examines an interval:
 * given two laid-out states of the same figure and a linear tween between
 * them, does any pair of boxes overlap at some point during the transition
 * that neither authored endpoint shows? That is a real, easily-constructed
 * defect (a diagonal swap: two boxes clear at t=0 and t=1, crossing at
 * t=0.5) that `boxes-do-not-overlap` run twice -- once per frame -- cannot
 * see by construction.
 *
 * Solved exactly, not sampled: box motion here is always affine (M11 ships
 * no resize tweening), so whether two boxes overlap over t in [0,1] reduces
 * to solving the same linear inequalities `intersects`/`contains` already
 * encode, via src/anim/interval.ts. See ADR 0012 for why sampling was
 * rejected outright rather than adopted-with-a-tolerance.
 */

import type { PlacedBox, Rect } from "../ir/types.ts";
import type { Check } from "../checks.ts";
import { EPSILON, checkRect } from "../checks.ts";
import {
  anyRangeMeetsOpenInterval,
  intersectRange,
  solveGreater,
  solveGreaterEq,
  solveLess,
  solveLessEq,
  subtractRangeFromMany,
} from "./interval.ts";
import type { TRange } from "./interval.ts";

/**
 * Every pair of boxes present in BOTH states (their affine trajectory is
 * only defined where both endpoints exist -- an appearing or disappearing
 * box has no "during transition" position for this check to reason about;
 * ADR 0012 covers those with an opacity fade that sweeps no region instead).
 */
export function boxesDoNotOverlapDuringTransition(
  before: Map<string, PlacedBox>,
  after: Map<string, PlacedBox>,
): Check[] {
  const ids = [...before.keys()].filter((id) => after.has(id));
  const pairs = (ids.length * (ids.length - 1)) / 2;

  if (pairs === 0) {
    return [
      {
        id: "boxes-do-not-overlap-during-transition",
        target: "figure",
        status: "not-applicable",
        examined: 0,
        detail: "not applicable: fewer than two boxes persist across both states",
      },
    ];
  }

  const failures: [string, string][] = [];

  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const idA = ids[i]!;
      const idB = ids[j]!;
      const a0 = checkRect(before.get(idA)!);
      const a1 = checkRect(after.get(idA)!);
      const b0 = checkRect(before.get(idB)!);
      const b1 = checkRect(after.get(idB)!);
      if (overlapsDuringTransition(a0, a1, b0, b1)) failures.push([idA, idB]);
    }
  }

  if (failures.length > 0) {
    failures.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    return failures.map(([idA, idB]) => ({
      id: "boxes-do-not-overlap-during-transition" as const,
      target: idA,
      status: "fail" as const,
      detail: `overlaps ${idB} during the transition, though clear of it at both authored endpoints`,
    }));
  }

  return [
    {
      id: "boxes-do-not-overlap-during-transition",
      target: "figure",
      status: "pass",
      examined: pairs,
      detail: `resolved ${pairs} pair(s) exactly over t in [0,1]; none overlap during the transition`,
    },
  ];
}

/**
 * True iff box A (moving a0 -> a1) and box B (moving b0 -> b1), both
 * translating rigidly, overlap for some t strictly inside (0,1) without one
 * containing the other -- the same exception `boxes-do-not-overlap` grants,
 * carried through time rather than redefined.
 */
export function overlapsDuringTransition(a0: Rect, a1: Rect, b0: Rect, b1: Rect): boolean {
  const dx0 = a0.x - b0.x;
  const ddx = a1.x - a0.x - (b1.x - b0.x);
  const dy0 = a0.y - b0.y;
  const ddy = a1.y - a0.y - (b1.y - b0.y);

  // Overlap on x: dx(t) in (EPSILON - a.width, b.width - EPSILON).
  const xOverlap = intersectRange(
    solveLess(dx0 - (b0.width - EPSILON), ddx),
    solveGreater(dx0 - (EPSILON - a0.width), ddx),
  );
  const yOverlap = intersectRange(
    solveLess(dy0 - (b0.height - EPSILON), ddy),
    solveGreater(dy0 - (EPSILON - a0.height), ddy),
  );
  const overlap = intersectRange(xOverlap, yOverlap);
  if (overlap === null) return false;

  // A contains B: dx(t) in [b.width - a.width - EPSILON, EPSILON], same on y.
  const containAB = intersectRange(
    intersectRange(
      solveLessEq(dx0 - EPSILON, ddx),
      solveGreaterEq(dx0 - (b0.width - a0.width - EPSILON), ddx),
    ),
    intersectRange(
      solveLessEq(dy0 - EPSILON, ddy),
      solveGreaterEq(dy0 - (b0.height - a0.height - EPSILON), ddy),
    ),
  );

  // B contains A: dx(t) in [-EPSILON, b.width - a.width + EPSILON], same on y.
  const containBA = intersectRange(
    intersectRange(
      solveGreaterEq(dx0 + EPSILON, ddx),
      solveLessEq(dx0 - (b0.width - a0.width + EPSILON), ddx),
    ),
    intersectRange(
      solveGreaterEq(dy0 + EPSILON, ddy),
      solveLessEq(dy0 - (b0.height - a0.height + EPSILON), ddy),
    ),
  );

  let remainder: TRange[] = [overlap];
  remainder = subtractRangeFromMany(remainder, containAB);
  remainder = subtractRangeFromMany(remainder, containBA);

  return anyRangeMeetsOpenInterval(remainder, 0, 1);
}
