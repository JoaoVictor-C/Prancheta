/**
 * The repair engine.
 *
 * A verifier that can only *detect* is worth little: the whole argument for
 * owning geometry (decision 0001) was that a detected defect must be fixable.
 * This is where that promise is kept.
 *
 * Two properties make the loop trustworthy, and both are structural rather
 * than hoped for:
 *
 *   MONOTONE. Every edit strictly increases one bounded quantity — a width, a
 *   height — or flips `wrap` from "none" to "normal", which can happen at most
 *   once per node. No edit ever shrinks anything. A cycle would require some
 *   quantity to return to a previous value, so the loop cannot oscillate.
 *
 *   BOUNDED. Growth is capped at a multiple of the node's *original* measured
 *   size. A node that would need more than that is reported as unrepaired
 *   rather than inflated without limit, because a box four times the size the
 *   author asked for is not a repair, it is a different figure.
 *
 * Edits are data, never mutations of the caller's spec. The spec they wrote is
 * theirs; what we return is a list of what would have to change and why.
 */

import type { Check } from "./checks.ts";
import { EPSILON } from "./checks.ts";
import type { Block, FigureSpec, LaidOutFigure, PlacedBox } from "./ir/types.ts";
import { cloneNormalised } from "./ir/normalise.ts";
import { theme } from "./theme.ts";

export type RepairEdit = {
  pass: number;
  target: string;
  property: "width" | "height" | "wrap" | "canvasPadding";
  from: number | string | null;
  to: number | string;
  reason: string;
};

export type RepairBudget = {
  /** How far a node may grow, as a multiple of its first measured size. */
  maxScale: number;
  /** Original measured sizes, captured on first sight and never updated. */
  origin: Map<string, { width: number; height: number }>;
};

export function newBudget(maxScale = 3): RepairBudget {
  return { maxScale, origin: new Map() };
}

export type RepairPlan = {
  edits: RepairEdit[];
  /** Failures nothing in this engine knows how to fix, with the reason why. */
  unrepairable: { check: Check; why: string }[];
};

/** Slack added past the measured deficit so a repair does not land exactly on the edge. */
const SLACK = 1;

export function planRepairs(
  checks: Check[],
  figure: LaidOutFigure,
  pass: number,
  budget: RepairBudget,
): RepairPlan {
  const boxes = new Map<string, PlacedBox>();
  for (const element of figure.elements) {
    if (element.kind === "box") boxes.set(element.id, element);
  }
  for (const [id, box] of boxes) {
    if (!budget.origin.has(id)) budget.origin.set(id, { width: box.width, height: box.height });
  }

  const edits: RepairEdit[] = [];
  const unrepairable: RepairPlan["unrepairable"] = [];
  const edited = new Set<string>();

  for (const check of checks) {
    if (check.status !== "fail") continue;

    if (check.id === "text-fits-box") {
      const owner = check.ownerId === undefined ? undefined : boxes.get(check.ownerId);
      const overflow = check.overflow;
      if (!owner || !overflow) {
        unrepairable.push({ check, why: "no owning box to grow" });
        continue;
      }
      // A centred or bottom-aligned label legitimately overflows *upward*:
      // the surplus is split above and below, or sits entirely above. Growing
      // the box does fix that, so it is not the upstream defect the guard
      // below exists to catch.
      const shifted = owner.verticalAlign === "center" || owner.verticalAlign === "end";
      if (overflow.left > EPSILON || (overflow.top > EPSILON && !shifted)) {
        // Flow layout starts a start-aligned label at the content origin, so
        // this should be unreachable. If it ever fires, something upstream is
        // wrong and growing the box would hide it.
        unrepairable.push({
          check,
          why: "label starts before its content box; growing cannot fix that",
        });
        continue;
      }

      const key = `${owner.id}:size`;
      if (edited.has(key)) continue; // one size edit per node per pass
      const origin = budget.origin.get(owner.id)!;

      if (overflow.right > EPSILON) {
        const target = ceil(owner.width + overflow.right + SLACK);
        const ceiling = origin.width * budget.maxScale;
        if (target > ceiling) {
          unrepairable.push({
            check,
            why:
              `growing ${owner.id} to ${target}px would exceed its budget of ` +
              `${round(ceiling)}px (${budget.maxScale}x its original ${round(origin.width)}px)`,
          });
          continue;
        }
        edits.push({
          pass,
          target: owner.id,
          property: "width",
          from: round(owner.width),
          to: target,
          reason: `label overflows right by ${round(overflow.right)}px`,
        });
        edited.add(key);
        continue;
      }

      // The deficit is what sticks out on *both* sides, not just below.
      // Growing by the bottom alone would close half the gap on a centred
      // label, then half of the remainder, converging geometrically and
      // exhausting the pass budget without ever fitting. For a start-aligned
      // label `top` is zero and this is exactly the old expression.
      const vertical = overflow.top + overflow.bottom;
      if (vertical > EPSILON) {
        const target = ceil(owner.height + vertical + SLACK);
        const ceiling = origin.height * budget.maxScale;
        if (target > ceiling) {
          unrepairable.push({
            check,
            why:
              `growing ${owner.id} to ${target}px would exceed its budget of ` +
              `${round(ceiling)}px (${budget.maxScale}x its original ${round(origin.height)}px)`,
          });
          continue;
        }
        edits.push({
          pass,
          target: owner.id,
          property: "height",
          from: round(owner.height),
          to: target,
          reason:
            overflow.top > EPSILON
              ? `label overflows its box vertically by ${round(vertical)}px`
              : `label overflows bottom by ${round(overflow.bottom)}px`,
        });
        edited.add(key);
      }
      continue;
    }

    if (check.id === "effect-within-canvas") {
      // Handled by planCanvasRepairs, which needs the spec's current padding
      // and this function only has the laid-out figure. Skipped rather than
      // reported unrepairable: claiming nothing can fix it while something is
      // about to fix it would put a false entry in the manifest.
      continue;
    }

    if (check.id === "text-clear-of-other-boxes") {
      // Caused by a containment failure in all cases M1 can produce, and that
      // failure has its own repair. Left alone deliberately: repairing the
      // same defect from two directions is how loops start fighting.
      continue;
    }

    unrepairable.push({ check, why: "no repair strategy for this check" });
  }

  return { edits, unrepairable };
}

/**
 * A halo clipped by the canvas edge is repaired by widening the frame, not by
 * moving anything.
 *
 * This is the one repair in the engine that does not touch a node, and that is
 * the correct shape for the defect: the element is exactly where layout put
 * it, and the only thing wrong is that the canvas was sized to the geometry
 * before anyone asked how far the ink would travel. Growing padding is
 * monotone like every other edit here, and it converges in a single pass —
 * the required padding is computed from a bleed that is already known exactly,
 * so there is nothing to iterate toward.
 */
export const MAX_CANVAS_PADDING = 400;

export function planCanvasRepairs(
  checks: readonly Check[],
  spec: FigureSpec,
  pass: number,
): RepairPlan {
  const edits: RepairEdit[] = [];
  const unrepairable: RepairPlan["unrepairable"] = [];
  const current = spec.canvas?.padding ?? theme.canvas.padding;

  for (const check of checks) {
    if (check.status !== "fail" || check.id !== "effect-within-canvas") continue;
    const overflow = check.overflow;
    if (!overflow) {
      unrepairable.push({ check, why: "no overflow numbers to size the padding from" });
      continue;
    }
    const needed = Math.max(overflow.left, overflow.top, overflow.right, overflow.bottom);
    const target = ceil(current + needed + SLACK);
    if (target <= current) continue;
    if (target > MAX_CANVAS_PADDING) {
      unrepairable.push({
        check,
        why:
          `framing the effect would need ${target}px of canvas padding, past the ` +
          `${MAX_CANVAS_PADDING}px ceiling; the effect is larger than the figure it decorates`,
      });
      continue;
    }
    edits.push({
      pass,
      target: "canvas",
      property: "canvasPadding",
      from: current,
      to: target,
      reason: `effect ink is clipped by the canvas edge (${describeWorst(overflow)})`,
    });
  }

  return { edits, unrepairable };
}

function describeWorst(overflow: {
  left: number;
  top: number;
  right: number;
  bottom: number;
}): string {
  const worst = Math.max(overflow.left, overflow.top, overflow.right, overflow.bottom);
  return `worst edge short by ${round(worst)}px`;
}

/**
 * Last resort for a node that has hit its growth budget while forbidden to
 * wrap: honour the size and let the text break. Applied only when a plain
 * growth repair was rejected, so it never competes with one.
 */
export function planWrapFallback(
  plan: RepairPlan,
  spec: FigureSpec,
  pass: number,
): RepairEdit[] {
  const { index } = cloneNormalised(spec);
  const edits: RepairEdit[] = [];
  for (const { check } of plan.unrepairable) {
    if (check.id !== "text-fits-box" || check.ownerId === undefined) continue;
    const node = index.get(check.ownerId);
    if (node === undefined || node.type !== "block") continue;
    if (node.wrap !== "none") continue;
    edits.push({
      pass,
      target: check.ownerId,
      property: "wrap",
      from: "none",
      to: "normal",
      reason: "cannot grow further within budget; allowing the label to wrap instead",
    });
  }
  return edits;
}

/** Apply edits to a copy. The caller's spec is never touched. */
export function applyEdits(spec: FigureSpec, edits: RepairEdit[]): FigureSpec {
  const { spec: copy, index } = cloneNormalised(spec);
  for (const edit of edits) {
    if (edit.property === "canvasPadding") {
      if (typeof edit.to === "number") copy.canvas = { ...copy.canvas, padding: edit.to };
      continue;
    }
    const node = index.get(edit.target);
    if (node === undefined || node.type !== "block") continue;
    const block = node as Block;
    if (edit.property === "width" && typeof edit.to === "number") block.width = edit.to;
    else if (edit.property === "height" && typeof edit.to === "number") block.height = edit.to;
    else if (edit.property === "wrap" && edit.to === "normal") block.wrap = "normal";
  }
  return copy;
}

/**
 * Guard for the monotonicity claim above. An edit that does not strictly
 * increase its quantity is a bug in the planner, not something to apply.
 */
export function isMonotone(edit: RepairEdit): boolean {
  if (edit.property === "wrap") return edit.from === "none" && edit.to === "normal";
  return typeof edit.from === "number" && typeof edit.to === "number" && edit.to > edit.from;
}

function ceil(value: number): number {
  return Math.ceil(value);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
