/**
 * Validation guards and the linear tween timeline (ADR 0012, M11).
 *
 * Two guards run before any check, both refusing rather than silently
 * trusting an unproven match -- the same discipline the rest of this project
 * applies (parseSpec's shape validation, the constraints-satisfied fix).
 */

import type { Block, FigureNode, FigureSpec, LaidOutFigure, PlacedBox } from "../ir/types.ts";
import { SpecError } from "../ir/types.ts";
import type { Delta, FigureDiff } from "./diff.ts";

const TWEENED_KINDS = new Set(["moved", "resized", "restyled", "retexted"]);

/**
 * Ids the author actually wrote, mirroring normalise.ts's own traversal so
 * "declared" means exactly what normalise.ts would NOT have had to invent.
 * Connectors are included: a moved connector endpoint needs the same
 * guarantee a moved box does.
 */
export function collectDeclaredIds(spec: FigureSpec): Set<string> {
  const declared = new Set<string>();

  const visit = (node: FigureNode): void => {
    if (node.id !== undefined) declared.add(node.id);
    if (node.type === "stack") {
      node.children.forEach(visit);
      return;
    }
    if (node.type === "scene") {
      node.children.forEach((child) => visit(child as Block));
      for (const connector of node.connectors ?? []) {
        if (connector.id !== undefined) declared.add(connector.id);
      }
    }
  };

  visit(spec.root);
  return declared;
}

/**
 * Guard 1 (id-stability). A delta's id must be author-declared on BOTH
 * sides before it is trusted as a real cross-state match -- normalise.ts's
 * counter-derived fallback (`${type}-${counter}`) is positional, and two
 * independently authored specs with even a minor structural difference can
 * silently misalign it onto the wrong pair of elements.
 *
 * Text deltas are exempt: a label's id is always `${ownerId}--label`
 * (measure.ts), a deterministic function of its OWN owner's id, never a
 * positional counter guess -- so its identity is already exactly as sound as
 * its owner box's, and requiring authors to separately id every label they
 * never wrote an id for would refuse the common case for no safety gained.
 */
export function requireDeclaredIds(
  diff: FigureDiff,
  declaredBefore: Set<string>,
  declaredAfter: Set<string>,
  textIds: Set<string>,
): void {
  for (const delta of diff.deltas) {
    if (!TWEENED_KINDS.has(delta.kind)) continue;
    if (textIds.has(delta.id)) continue;
    if (!declaredBefore.has(delta.id) || !declaredAfter.has(delta.id)) {
      throw new SpecError(
        `animate: "${delta.id}" is ${delta.kind} but was not given an explicit id in both states ` +
          `(one side relied on positional auto-numbering) -- refusing to trust an unproven identity match`,
      );
    }
  }
}

/** Block id -> declared rotation (rotateBox angle), for guard 2. Unset means "no rotation declared". */
function collectRotations(spec: FigureSpec): Map<string, number | undefined> {
  const rotations = new Map<string, number | undefined>();

  const visit = (node: FigureNode): void => {
    if (node.type === "stack") {
      node.children.forEach(visit);
      return;
    }
    if (node.type === "scene") {
      node.children.forEach((child) => visit(child as Block));
      return;
    }
    const block = node as Block;
    if (block.id !== undefined) {
      rotations.set(block.id, block.rotateBox === true ? block.rotation : undefined);
    }
  };

  visit(spec.root);
  return rotations;
}

/**
 * Guard 2 (rotation-identity). diffFigures's boxOf() reads only
 * x/y/width/height and never inspects PlacedBox.rotation or .bounds -- a box
 * that changes only its rotation between states compares as "unchanged".
 * Confirmed by reading src/anim/diff.ts directly, not assumed. Without this
 * guard, a rotating box's non-affine motion would be silently exempted from
 * every check, or fed to the analytic transition solver on a false premise.
 */
export function requireIdenticalRotation(
  diff: FigureDiff,
  rotationsBefore: Map<string, number | undefined>,
  rotationsAfter: Map<string, number | undefined>,
): void {
  for (const delta of diff.deltas) {
    if (delta.kind !== "moved" && delta.kind !== "unchanged") continue;
    const before = rotationsBefore.get(delta.id);
    const after = rotationsAfter.get(delta.id);
    if (before !== after) {
      throw new SpecError(
        `animate: "${delta.id}" declares rotateBox rotation ${String(before)} in the first state ` +
          `and ${String(after)} in the second -- rotation changes are not tweened in M11 (ADR 0012), ` +
          `and a rotating box's motion is not affine, so it cannot be fed to boxes-do-not-overlap-during-transition`,
      );
    }
  }
}

/** Runs both guards. Throws SpecError on the first violation found. */
export function validateAnimationSpecs(
  specBefore: FigureSpec,
  specAfter: FigureSpec,
  diff: FigureDiff,
  before: LaidOutFigure,
  after: LaidOutFigure,
): void {
  const textIds = new Set(
    [...before.elements, ...after.elements].filter((e) => e.kind === "text").map((e) => e.id),
  );
  requireDeclaredIds(diff, collectDeclaredIds(specBefore), collectDeclaredIds(specAfter), textIds);
  requireIdenticalRotation(diff, collectRotations(specBefore), collectRotations(specAfter));
}

export type BoxTween = { id: string; from: { x: number; y: number }; to: { x: number; y: number } };
export type FadeTween = { id: string; direction: "in" | "out" };

export type AnimationTimeline = {
  moved: BoxTween[];
  faded: FadeTween[];
};

/**
 * The linear tween itself: position for moved boxes, opacity for
 * appeared/disappeared elements. Nothing else moves in M11 -- resize,
 * restyle and retext deltas hard-cut between the two states, same as a
 * connector whose route changed (ADR 0012).
 */
export function buildTimeline(diff: FigureDiff, before: LaidOutFigure, after: LaidOutFigure): AnimationTimeline {
  const beforeBoxes = new Map(before.elements.filter((e): e is PlacedBox => e.kind === "box").map((b) => [b.id, b]));
  const afterBoxes = new Map(after.elements.filter((e): e is PlacedBox => e.kind === "box").map((b) => [b.id, b]));

  const moved: BoxTween[] = [];
  const faded: FadeTween[] = [];

  for (const delta of diff.deltas) {
    if (delta.kind === "moved") {
      const from = beforeBoxes.get(delta.id);
      const to = afterBoxes.get(delta.id);
      if (from !== undefined && to !== undefined) {
        moved.push({ id: delta.id, from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y } });
      }
    } else if (delta.kind === "appeared") {
      faded.push({ id: delta.id, direction: "in" });
    } else if (delta.kind === "disappeared") {
      faded.push({ id: delta.id, direction: "out" });
    }
  }

  return { moved, faded };
}
