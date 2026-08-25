/**
 * Motion-aware checks (ADR 0012, M11; corrected by ADR 0013, M11.1).
 *
 * Every check in checks.ts examines one instant. This examines an interval:
 * given the transition the renderer actually performs, does any pair of boxes
 * overlap at some point during it that the finished figure does not show?
 * That is a real, easily-constructed defect (a diagonal swap: two boxes clear
 * at t=0 and t=1, crossing at t=0.5) that `boxes-do-not-overlap` run twice --
 * once per frame -- cannot see by construction.
 *
 * WHAT IT MODELS, stated precisely because M11 overstated it. Not "the
 * emitted SVG": effects put ink past a box's own edges, so this reasons about
 * the same rectangles the static checks reason about -- an inherited limit it
 * shares with every check in this project -- over the interval the renderer
 * actually animates. The trajectories come from src/anim/trajectory.ts, which
 * the emitter reads too; M11's defect was that this file derived the motion
 * independently and got a different answer.
 *
 * Solved exactly, not sampled: a tweened box translates and an untweened one
 * stands still, so every trajectory is affine (a constant is degenerately so)
 * and overlap over t in [0,1] reduces to the same linear inequalities
 * `intersects`/`contains` already encode, via src/anim/interval.ts. See ADR
 * 0012 for why sampling was rejected outright rather than adopted-with-a-
 * tolerance.
 *
 * STAGGER (ADR 0015) does not change that. An element with a motion window
 * holds, ramps, then holds, so it is PIECEWISE affine: cut the timeline at a
 * pair's (at most four) window edges and both boxes are affine again on every
 * sub-interval, where `overlapRangesDuringTransition` -- unchanged -- is the
 * kernel. Still exact, still no tolerance, still O(1) per pair, since the cut
 * count is bounded by four regardless of how many elements the figure has.
 */

import type { LaidOutFigure, Rect } from "../ir/types.ts";
import { resolveConstraints } from "../ir/types.ts";
import type { Check } from "../checks.ts";
import { contains, EPSILON } from "../checks.ts";
import type { Trajectory } from "./trajectory.ts";
import { rectAt } from "./trajectory.ts";
import type { RouteTrajectory } from "./route.ts";
import { pointsAt } from "./route.ts";
import { segmentSweepsBox } from "./sweep.ts";
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

/** t values so close to the endpoints that the interval arithmetic's own slack cannot separate them. */
const T_END = 1 - 1e-9;
const T_START = 1e-9;

/**
 * Every pair of boxes the emitted SVG carries during the transition.
 *
 * The population is the after figure's boxes, because that is what the
 * emitted SVG draws -- see src/anim/trajectory.ts for why that is a
 * derivation rather than a filter, and why appeared boxes belong in it while
 * disappeared ones do not.
 *
 * Standing limit, inherited from ADR 0012 and unchanged here: the population
 * is BOXES. A PlacedText with no owner (a figure title, not a label) is drawn
 * too and is not a participant. Owned text is covered, since it is always
 * contained in its owner's content rect and travels with it.
 */
export function boxesDoNotOverlapDuringTransition(
  trajectories: Map<string, Trajectory>,
  frames: { after: LaidOutFigure; before?: LaidOutFigure },
): Check[] {
  const ids = [...trajectories.keys()].sort();
  const pairs = (ids.length * (ids.length - 1)) / 2;

  if (pairs === 0) {
    return [
      {
        id: "boxes-do-not-overlap-during-transition",
        target: "figure",
        status: "not-applicable",
        examined: 0,
        detail: "not applicable: fewer than two boxes are drawn during the transition",
      },
    ];
  }

  // Read off each frame's own figure, and deliberately so: a delegation is to
  // that frame's own `boxes-do-not-overlap`, so the toggle that governs it is
  // the one on the figure being delegated to. Two independently authored
  // states may set this differently; that is not an oversight.
  const finishedFigureChecked = !resolveConstraints({
    constraints: frames.after.constraints,
  }).allowOverlap;
  const firstStateChecked =
    frames.before !== undefined &&
    !resolveConstraints({ constraints: frames.before.constraints }).allowOverlap;

  const failures: { a: string; b: string; note: string }[] = [];

  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = trajectories.get(ids[i]!)!;
      const b = trajectories.get(ids[j]!)!;

      // A crossfade is not an overlap defect. One box ramps 1->0 while the
      // other ramps 0->1 on the same clock, so neither is ever at full
      // strength while the other is visible -- the composite is the intended
      // reading, the same way the static check excuses full containment
      // rather than pretending it is not there.
      if ((a.fade === "out" && b.fade === "in") || (a.fade === "in" && b.fade === "out")) continue;

      const ranges = pairOverlapRanges(a, b);
      if (!anyRangeMeetsOpenInterval(ranges, 0, 1)) continue;

      // Delegate rather than duplicate, pairwise, and only to a frame that
      // actually examines THIS pair at THAT instant.
      //
      // t=1 is the finished figure, so a pair both present there is one
      // `boxes-do-not-overlap` already reports. t=0 is NOT the first state --
      // it is a hybrid, since hard-cutters sit at their second-state position
      // and newcomers are already there -- but pairwise, two boxes that are
      // both at their first-state place do have exactly their first-state
      // geometry, which manifest.before reports on.
      //
      // Either delegation is void when the toggle from decision 0010 stood
      // the delegate down: silence has to rest on someone actually looking.
      const atEnd = ranges.some((range) => range.hi >= T_END);
      const atStart = ranges.some((range) => range.lo <= T_START);
      if (atEnd && a.inFinishedFigure && b.inFinishedFigure && finishedFigureChecked) continue;
      if (atStart && a.atFirstStatePlace && b.atFirstStatePlace && firstStateChecked) continue;

      failures.push({ a: a.id, b: b.id, note: describe(a, b, atStart, atEnd) });
    }
  }

  if (failures.length > 0) {
    return failures.map(({ a, b, note }) => ({
      id: "boxes-do-not-overlap-during-transition" as const,
      target: a,
      status: "fail" as const,
      detail: `overlaps ${b} during the transition, ${note}`,
    }));
  }

  return [
    {
      id: "boxes-do-not-overlap-during-transition",
      target: "figure",
      status: "pass",
      examined: pairs,
      detail:
        `resolved ${pairs} pair(s) exactly over t in [0,1]; none overlap during the transition ` +
        `beyond what the two states' own checks cover`,
    },
  ];
}

/** Why this violation is being reported here rather than delegated. */
function describe(a: Trajectory, b: Trajectory, atStart: boolean, atEnd: boolean): string {
  if (atEnd && a.inFinishedFigure && b.inFinishedFigure) {
    return "and in the finished figure; canvas.constraints.allowOverlap stood boxes-do-not-overlap down there, so it is reported here";
  }
  if (atStart && a.atFirstStatePlace && b.atFirstStatePlace) {
    return "and where the first state placed them; canvas.constraints.allowOverlap stood boxes-do-not-overlap down there, so it is reported here";
  }
  if (a.fade === "out" || b.fade === "out") {
    return "while one of them is still fading out — a frame neither authored state contains";
  }
  return "though clear of it in the finished figure";
}

/**
 * The global t-intervals over which a pair overlaps, staggering included.
 *
 * With both windows full this is exactly one call to the affine kernel below,
 * which is the whole of the pre-M13 behaviour. With windows, the timeline is
 * cut at their edges and the kernel runs per segment; each segment's answer is
 * clipped to its own domain before being mapped back to global time, because
 * the affine model that produced it is only valid inside that segment.
 */
export function pairOverlapRanges(a: Trajectory, b: Trajectory): TRange[] {
  const cuts = [...new Set([0, a.window.start, a.window.end, b.window.start, b.window.end, 1])]
    .filter((value) => value >= 0 && value <= 1)
    .sort((x, y) => x - y);

  if (cuts.length === 2) {
    return overlapRangesDuringTransition(a.from, a.to, b.from, b.to);
  }

  const out: TRange[] = [];
  for (let i = 0; i < cuts.length - 1; i += 1) {
    const p = cuts[i]!;
    const q = cuts[i + 1]!;
    if (q - p < 1e-12) continue;
    const local = overlapRangesDuringTransition(
      rectAt(a, p),
      rectAt(a, q),
      rectAt(b, p),
      rectAt(b, q),
    );
    for (const range of local) {
      const lo = Math.max(0, range.lo);
      const hi = Math.min(1, range.hi);
      if (hi > lo) out.push({ lo: p + lo * (q - p), hi: p + hi * (q - p) });
    }
  }
  return out;
}

/**
 * The t-intervals over which box A (moving a0 -> a1) and box B (moving
 * b0 -> b1), both translating rigidly, overlap without one containing the
 * other -- the same exception `boxes-do-not-overlap` grants, carried through
 * time rather than redefined. Widths are constant by construction: a
 * trajectory's `from` and `to` always share the after figure's extent.
 */
export function overlapRangesDuringTransition(a0: Rect, a1: Rect, b0: Rect, b1: Rect): TRange[] {
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
  if (overlap === null) return [];

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
  return remainder;
}

/**
 * True iff A and B overlap for some t strictly inside (0,1). The predicate
 * itself, without the delegation policy the check applies on top of it.
 */
export function overlapsDuringTransition(a0: Rect, a1: Rect, b0: Rect, b1: Rect): boolean {
  return anyRangeMeetsOpenInterval(overlapRangesDuringTransition(a0, a1, b0, b1), 0, 1);
}

/**
 * Every connector the emitted SVG carries, against every box it does not join,
 * over the whole transition (ADR 0017, M15).
 *
 * The moving analogue of `connector-clear-of-boxes`, and named apart for the
 * same reason `boxes-do-not-overlap-during-transition` is: a reader must be
 * able to tell "the line is clear in both states" from "the line is clear all
 * the way between them" without parsing detail text. The defect it exists for
 * is the one the M15 secant makes trivially constructible -- a line that
 * pivots past a box, clear at t=0 and clear at t=1, straight through it at
 * t=0.5.
 *
 * Three policies are inherited verbatim from the static check rather than
 * re-decided, because a transition check that disagreed with the state checks
 * it delegates to would be worse than no check:
 *
 *   - a connector may touch the boxes it JOINS, and only those;
 *   - a box that CONTAINS an endpoint is structure, not collision (a callout
 *     necessarily crosses the case it points into);
 *   - a box is shrunk by the same half-pixel (`EDGE_EPSILON`) before the
 *     question is asked.
 *
 * The geometry is in src/anim/sweep.ts, which is where the segment's turning
 * normal makes this quadratic rather than linear.
 */
export function connectorsClearOfBoxesDuringTransition(
  routes: Map<string, RouteTrajectory>,
  trajectories: Map<string, Trajectory>,
  frames: { after: LaidOutFigure; before?: LaidOutFigure },
): Check[] {
  const boxIds = [...trajectories.keys()].sort();
  const examined = routes.size * boxIds.length;

  if (examined === 0) {
    return [
      {
        id: "connector-clear-of-boxes-during-transition",
        target: "figure",
        status: "not-applicable",
        examined: 0,
        detail: "not applicable: no connector and box are both drawn during the transition",
      },
    ];
  }

  // Relaxation is read off each frame's own figure, exactly as the box check
  // reads allowOverlap: a delegation is to THAT frame's connector-clear-of-
  // boxes, so the toggle that governs it is the one on the figure delegated to.
  const finishedFigureChecked = !resolveConstraints({
    constraints: frames.after.constraints,
  }).allowConnectorCrossing;
  const firstStateChecked =
    frames.before !== undefined &&
    !resolveConstraints({ constraints: frames.before.constraints }).allowConnectorCrossing;

  // Where this DIVERGES from the box check above, deliberately.
  //
  // `allowOverlap` does not stand `boxes-do-not-overlap-during-transition`
  // down, and should not: a designed overlap and a transient collision during
  // a swap are two different phenomena, so a mid-transition crossing is news
  // even in a figure that permits static overlap.
  //
  // `allowConnectorCrossing` is not like that. A line crossing a box is one
  // phenomenon whether the line is moving or not, and this check asks exactly
  // the question the toggle just excused, over an interval instead of an
  // instant. Reporting it anyway would fail every figure that marks a point ON
  // a plotted curve -- which is the case the toggle exists for -- and a check
  // that always fires is a check that gets switched off. So it stands down
  // with the toggle named, never silently.
  if (!finishedFigureChecked && (frames.before === undefined || !firstStateChecked)) {
    return [
      {
        id: "connector-clear-of-boxes-during-transition",
        target: "figure",
        status: "not-applicable",
        detail:
          "not applicable: canvas.constraints.allowConnectorCrossing is on, so this constraint " +
          "was not enforced",
      },
    ];
  }

  const failures: { route: string; box: string; note: string }[] = [];

  for (const route of [...routes.values()].sort((x, y) => (x.id < y.id ? -1 : 1))) {
    for (const boxId of boxIds) {
      if (route.endpointIds.includes(boxId)) continue;
      const box = trajectories.get(boxId)!;

      // Enclosure is structure, not collision -- and it has to be judged over
      // the interval too, since a box that contains an endpoint at t=0 and at
      // t=1 contains it throughout only because both travel affinely.
      if (enclosesAnyEndpoint(box, route, trajectories)) continue;

      const ranges = routeSweepsBox(route, box);
      if (!anyRangeMeetsOpenInterval(ranges, 0, 1)) continue;

      const atEnd = ranges.some((range) => range.hi >= T_END);
      const atStart = ranges.some((range) => range.lo <= T_START);
      if (atEnd && route.inFinishedFigure && box.inFinishedFigure && finishedFigureChecked) continue;
      if (atStart && route.atFirstStatePlace && box.atFirstStatePlace && firstStateChecked) continue;

      failures.push({
        route: route.id,
        box: boxId,
        note: describeSweep(ranges, atStart, atEnd),
      });
    }
  }

  if (failures.length > 0) {
    return failures.map(({ route, box, note }) => ({
      id: "connector-clear-of-boxes-during-transition" as const,
      target: route,
      status: "fail" as const,
      detail: `sweeps across ${box}, which it does not join, ${note}`,
    }));
  }

  return [
    {
      id: "connector-clear-of-boxes-during-transition",
      target: "figure",
      status: "pass",
      examined,
      detail:
        `resolved ${examined} connector/box pair(s) exactly over t in [0,1]; no route sweeps ` +
        `across a box it does not join beyond what the two states' own checks cover`,
    },
  ];
}

/** Does any box this connector joins sit inside `box` for the whole transition? */
function enclosesAnyEndpoint(
  box: Trajectory,
  route: RouteTrajectory,
  trajectories: Map<string, Trajectory>,
): boolean {
  for (const endpointId of route.endpointIds) {
    const endpoint = trajectories.get(endpointId);
    if (endpoint === undefined) continue;
    if (contains(rectAt(box, 0), rectAt(endpoint, 0)) && contains(rectAt(box, 1), rectAt(endpoint, 1))) {
      return true;
    }
  }
  return false;
}

/**
 * Every span of t where any of this route's segments is inside this box.
 *
 * Cut at both participants' motion-window edges first, exactly as
 * `pairOverlapRanges` does: within a piece the route's vertices and the box's
 * rect are all affine again, which is the premise `segmentSweepsBox` needs.
 */
export function routeSweepsBox(route: RouteTrajectory, box: Trajectory): TRange[] {
  const cuts = [
    ...new Set([0, route.window.start, route.window.end, box.window.start, box.window.end, 1]),
  ]
    .filter((value) => value >= 0 && value <= 1)
    .sort((x, y) => x - y);

  const out: TRange[] = [];
  for (let i = 0; i < cuts.length - 1; i += 1) {
    const p = cuts[i]!;
    const q = cuts[i + 1]!;
    if (q - p < 1e-12) continue;
    const atP = pointsAt(route, p);
    const atQ = pointsAt(route, q);
    const boxP = rectAt(box, p);
    const boxQ = rectAt(box, q);
    for (let k = 0; k < atP.length - 1; k += 1) {
      const local = segmentSweepsBox(atP[k]!, atQ[k]!, atP[k + 1]!, atQ[k + 1]!, boxP, boxQ);
      for (const range of local) {
        out.push({ lo: p + range.lo * (q - p), hi: p + range.hi * (q - p) });
      }
    }
  }
  return out;
}

function describeSweep(ranges: TRange[], atStart: boolean, atEnd: boolean): string {
  const first = ranges[0]!;
  const where =
    atStart && atEnd
      ? "for the whole transition"
      : atStart
        ? `from the start until t=${first.hi.toFixed(3)}`
        : atEnd
          ? `from t=${ranges[ranges.length - 1]!.lo.toFixed(3)} to the end`
          : `over t in [${first.lo.toFixed(3)}, ${first.hi.toFixed(3)}]`;
  return `${where} -- a defect no single frame shows`;
}
