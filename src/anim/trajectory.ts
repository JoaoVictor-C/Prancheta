/**
 * The rendered trajectory: one derivation of what each box actually does
 * during the transition, consumed by BOTH the emitter and the motion check
 * (ADR 0013, M11.1).
 *
 * M11 shipped two independent derivations of the same motion — emit.ts built
 * its keyframes from the timeline, checks.ts built its affine endpoints from
 * the raw before/after figures — and they disagreed. A box that both moves
 * and changes fill is classified `restyled` by diff.ts's single-label
 * priority, so `buildTimeline` never tweens it and it hard-cuts; the check,
 * reading the two figures directly, modelled it as sliding. That is a false
 * positive on a transition the renderer performs cleanly, and its mirror is a
 * false negative: a hard-cutting box sitting exactly where a genuinely
 * tweened box sweeps through, excused because the check believed it had slid
 * out of the way.
 *
 * The fix is structural rather than corrective. One function owns the answer
 * and both consumers read it, so they cannot drift again — the same
 * discipline scripts/gen-views.ts applies to the generated docs.
 *
 * Three facts about the emitted SVG determine everything here, all read out
 * of emit.ts rather than assumed:
 *
 *   1. The base SVG is the SECOND state's render, and the only property
 *      animated on a box is `transform: translate(...)`. So a persisting box
 *      is at its second-state width, height and rotation for the whole
 *      transition — never its first-state ones. This is why extent comes from
 *      `checkRect` of the second-state box, and why diff.ts's MOVE_EPSILON
 *      does not matter to the check: geometry is read from the figure that
 *      renders, not inferred from a classification.
 *
 *   2. A box with no tween is therefore at its second-state position from
 *      t=0. Its trajectory is a constant — still affine, so the closed-form
 *      solver in interval.ts needs no change, no sampling and no tolerance.
 *
 *   3. Since M11.2 the base also carries the elements that disappear,
 *      re-injected at their first-state position and faded out (ADR 0014).
 *      They are drawn, so they are participants.
 *
 *   4. Since M13 an element may move during only part of the transition
 *      (ADR 0015). It then holds at its first-state position, travels, and
 *      holds at its second-state position — so its motion is PIECEWISE affine
 *      rather than affine, which is what checks.ts decomposes.
 *
 * Easing does not appear here, and that is deliberate: one shared monotone
 * easing reparametrises time without changing which pairs overlap during the
 * transition, so the trajectory endpoints are the same either way. See
 * src/anim/easing.ts for the argument and the guard that keeps it true.
 */

import type { LaidOutFigure, MotionWindow, PlacedBox, Rect } from "../ir/types.ts";
import { SpecError } from "../ir/types.ts";
import { checkRect } from "../checks.ts";
import type { AnimationTimeline } from "./timeline.ts";

/**
 * Where a box is at t=0 and at t=1, as the emitted SVG actually places it.
 * `from` equals `to` for a box that hard-cuts: it never moves.
 *
 * The three flags exist for the delegation policy in checks.ts, which needs
 * to know which frames another check already examines this box in:
 *
 *   `fade`               - "in" while it ramps 0->1, "out" while it ramps
 *                          1->0, null for a box that is opaque throughout.
 *   `inFinishedFigure`   - present in the second state, so the frame at t=1
 *                          is one `boxes-do-not-overlap` already checked.
 *   `atFirstStatePlace`  - at t=0 this box sits exactly where the first state
 *                          put it, so PAIRWISE its t=0 geometry is one the
 *                          first state's own checks already examined. True for
 *                          tweened boxes and for boxes fading out; false for a
 *                          hard-cutter, which is already at its second-state
 *                          position at t=0, and for a newcomer, which the
 *                          first state does not contain at all.
 */
export type Trajectory = {
  id: string;
  from: Rect;
  to: Rect;
  tweened: boolean;
  fade: "in" | "out" | null;
  inFinishedFigure: boolean;
  atFirstStatePlace: boolean;
  /** When within the transition this element travels. The whole of it, unless staggered. */
  window: MotionWindow;
};

/** Every element's window before staggering existed, and still the default. */
export const FULL_WINDOW: MotionWindow = { start: 0, end: 1 };

/** Where a staggered box sits at global time tau. */
export function rectAt(trajectory: Trajectory, tau: number): Rect {
  const { start, end } = trajectory.window;
  const s = tau <= start ? 0 : tau >= end ? 1 : (tau - start) / (end - start);
  return {
    x: trajectory.from.x + (trajectory.to.x - trajectory.from.x) * s,
    y: trajectory.from.y + (trajectory.to.y - trajectory.from.y) * s,
    width: trajectory.to.width,
    height: trajectory.to.height,
  };
}

/**
 * Every box the emitted SVG carries, with the motion it actually performs.
 *
 * The population is what is DRAWN, which is a derivation rather than a
 * choice — and the rule has survived the drawn set changing under it. Under
 * M11.1 that was the second state's boxes alone, which already admitted an
 * APPEARED box: it occupies its full rect from t=0 while it fades in, and a
 * sweeping box can pass straight through it, which no single-frame check can
 * see. Under M11.2 the disappearing boxes are drawn too (ADR 0014), so they
 * joined the population without the rule being touched.
 *
 * Iterating the drawn figures also means a tween naming a box that is not
 * drawn is unrepresentable rather than defended against — no consumer needs a
 * missing-box guard of its own.
 */
export function renderedTrajectories(
  after: LaidOutFigure,
  timeline: AnimationTimeline,
  before?: LaidOutFigure,
): Map<string, Trajectory> {
  const offsets = new Map(timeline.moved.map((move) => [move.id, move] as const));
  const fades = new Map(timeline.faded.map((fade) => [fade.id, fade.direction] as const));
  const trajectories = new Map<string, Trajectory>();

  for (const element of after.elements) {
    if (element.kind !== "box") continue;
    const box = element as PlacedBox;
    const to = checkRect(box);
    const fade = fades.get(box.id) === "in" ? "in" : null;
    const move = offsets.get(box.id);
    if (move === undefined) {
      trajectories.set(box.id, {
        id: box.id,
        from: to,
        to,
        tweened: false,
        fade,
        inFinishedFigure: true,
        atFirstStatePlace: false,
        window: box.motion ?? FULL_WINDOW,
      });
      continue;
    }
    // The tween translates the box, so the offset applies to whatever rect
    // `checkRect` reports -- including a rotated box's bounds, which translate
    // rigidly with it.
    const dx = move.from.x - move.to.x;
    const dy = move.from.y - move.to.y;
    trajectories.set(box.id, {
      id: box.id,
      from: { x: to.x + dx, y: to.y + dy, width: to.width, height: to.height },
      to,
      tweened: true,
      fade,
      inFinishedFigure: true,
      atFirstStatePlace: true,
      window: box.motion ?? FULL_WINDOW,
    });
  }

  // Boxes on their way out. Since M11.2 these are re-injected into the emitted
  // SVG at their first-state position and faded 1->0 (ADR 0014), so they are
  // drawn -- which by this module's own rule makes them participants. Before
  // that they were not drawn at all, and ADR 0013 excluded them for exactly
  // that reason; the rule did not change, the drawn set did.
  for (const element of before?.elements ?? []) {
    if (element.kind !== "box") continue;
    if (fades.get(element.id) !== "out") continue;
    const at = checkRect(element as PlacedBox);
    trajectories.set(element.id, {
      id: element.id,
      from: at,
      to: at,
      tweened: false,
      fade: "out",
      inFinishedFigure: false,
      atFirstStatePlace: true,
      window: (element as PlacedBox).motion ?? FULL_WINDOW,
    });
  }

  return trajectories;
}

/** True when this element does not travel across the whole transition. */
export function isStaggered(trajectory: Trajectory): boolean {
  return trajectory.window.start > 0 || trajectory.window.end < 1;
}

/**
 * Guard 3 (ADR 0015). Stagger and easing may not both be asked for.
 *
 * CSS applies `animation-timing-function` between each PAIR OF KEYFRAMES, not
 * across the whole animation. So easing a staggered element would ease its own
 * ramp — per-element easing — and every element would then be moving under a
 * different reparametrisation of time. That is exactly the premise the easing
 * proof in src/anim/easing.ts needs: overlap is invariant under ONE shared
 * monotone reparametrisation, and under several it is not invariant at all.
 *
 * Refused rather than quietly allowed, because the alternative is emitting an
 * animation the motion check cannot speak about. Easing a staggered figure is
 * still possible in principle — ease the GLOBAL clock and subdivide each
 * element's ramp into the corresponding sub-arc of the same Bezier, which is
 * itself a Bezier — but that is not built, so it is not offered.
 */
export function requireLinearWhenStaggered(
  trajectories: Map<string, Trajectory>,
  easing: string,
): void {
  if (easing === "linear") return;
  const staggered = [...trajectories.values()].filter(isStaggered).map((t) => t.id).sort();
  if (staggered.length === 0) return;
  const named = staggered.slice(0, 3).join(", ");
  const rest = staggered.length > 3 ? ` and ${staggered.length - 3} more` : "";
  throw new SpecError(
    `animate: --easing "${easing}" cannot be combined with a motion window (${named}${rest} declare one). ` +
      `CSS eases each keyframe segment, so this would give every staggered element its own timing curve, ` +
      `and boxes-do-not-overlap-during-transition is only exact while they all share one. Use --easing linear, ` +
      `or drop the windows`,
  );
}
