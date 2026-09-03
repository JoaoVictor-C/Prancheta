/**
 * Geometric checks.
 *
 * Deterministic, cheap, and model-free. They answer "is this figure
 * *malformed*", not "is this figure *right*" — semantic checks (does the arrow
 * point the correct way, is anything invented or missing) need a model in the
 * loop and are worth nothing while labels still overflow their boxes.
 *
 * Every failure carries structured overflow numbers, not just prose, because
 * the repair engine has to act on them and parsing English back out of a
 * message would be absurd.
 */

import type {
  ConstraintToggles,
  LaidOutFigure,
  PlacedBox,
  PlacedConnector,
  PlacedMark,
  PlacedText,
  Point,
  Rect,
} from "./ir/types.ts";
import { resolveConstraints } from "./ir/types.ts";
import { polylineIntersectsBox, sweptDegrees } from "./layout/connectors.ts";
import { inkBounds, isEmpty as bleedIsEmpty, unionRects } from "./effects/bleed.ts";
import type { Bleed } from "./effects/bleed.ts";
import { containsPoint } from "./geometry/shapes.ts";
import { rotatePoint, rotatedBounds } from "./geometry/rotate.ts";
import { WCAG_AA_NORMAL, compositeOver, contrastRatio, isTransparent } from "./colour/contrast.ts";
import {
  DICHROMACY_KINDS,
  MIN_DISTINGUISHABLE_DISTANCE,
  simulatedDistance,
} from "./colour/colourblind.ts";
import type { Constraint } from "./constraints/types.ts";
import { isConstraintSatisfied } from "./constraints/types.ts";

export type CheckId =
  // Core checks: the core computed the geometry, so these are exact.
  | "text-fits-box"
  | "label-within-shape"
  | "text-clear-of-other-boxes"
  // text-fits-box, text-clear-of-other-boxes and boxes-do-not-overlap all
  // reason about BOXES. A Mark's outline and a Connector's route are neither
  // -- polylines drawn wherever a spec puts them, un-boxed by construction --
  // so a label set straight across a curve, an angle arc or an arrow shaft
  // passed every one of those checks while sitting on the very ink it named
  // or crossing ink it had no business touching. The module protocol already
  // learned this lesson for foreign SVG (module-labels-clear-of-strokes);
  // this is its core-side counterpart, over geometry this project laid out
  // itself and can therefore test exactly rather than by DOM hit-testing.
  | "text-clear-of-ink"
  | "content-within-canvas"
  | "connector-clear-of-boxes"
  | "boxes-do-not-overlap"
  | "effect-within-canvas"
  | "contrast-sufficient"
  | "categorical-colours-distinguishable"
  | "tick-labels-do-not-collide"
  | "constraints-satisfied"
  // Does the box that got drawn have the size the spec asked for? The one
  // relationship the other core checks never look at: they all measure the
  // figure against ITSELF (does this label fit, do these boxes collide),
  // never against what was requested.
  | "declared-size-honoured"
  // The obligation that pays for `annotates`. A label may lie on the element
  // it names; in exchange it must be nearer to that element than to any
  // other, because a reader attributes a label to whatever it sits closest to.
  | "annotation-nearest-its-owner"
  // An angle mark that says one thing and draws another is the original
  // defect this whole line of work exists to prevent, reappearing inside the
  // primitive meant to cure it.
  | "sweep-matches-its-label"
  // An "arc" whose two ends are not the same distance from its centre is not
  // an arc, and nothing else notices: the renderer averages the two radii and
  // draws a curve matching neither.
  | "arc-is-circular"
  // Animation (ADR 0012, M11). Motion-aware: verified over an interval of
  // time, not a single instant, so it is intentionally named apart from
  // "boxes-do-not-overlap" even though it reuses that check's same
  // intersects/contains geometry -- a manifest reader must be able to tell
  // "these two states are each fine" from "the transition between them is
  // fine" without reading detail text.
  | "boxes-do-not-overlap-during-transition"
  // The same distinction one degree of freedom further out (ADR 0017, M15).
  // A connector's ROUTE can now travel, so a line clear of every box in both
  // states can still sweep across one on the way -- which no instant check
  // can see, and which the static connector-clear-of-boxes is not named to
  // cover.
  | "connector-clear-of-boxes-during-transition"
  // Module checks (decision 0005). Named apart WHERE THE METHOD DIFFERS: a
  // foreign SVG has no content boxes and no wrapped line boxes, so a check
  // called text-fits-box would promise something it cannot deliver.
  // content-within-canvas is deliberately absent from this list — same method,
  // same meaning, so it keeps its name in both worlds.
  | "module-ids-resolve"
  | "module-geometry-agrees"
  | "module-label-within-feature"
  | "module-labels-do-not-collide"
  | "module-labels-clear-of-strokes"
  // The one module check that is about MEANING rather than malformation. A
  // module may claim a feature lies on a stroke it also drew -- a root on its
  // curve, an LCL where two traces meet -- and that claim is falsified by
  // measuring the drawing, not by trusting the arithmetic behind it.
  | "module-feature-on-its-stroke"
  // A module's own surfaces, composited under its labels. Decision 0005
  // excluded the content-box checks because a bare SVG has no box model;
  // contrast was never excluded on that ground, and since the substrate
  // became geometric it needs only ink bounds and the fills beneath them.
  | "module-contrast-sufficient";

export type Overflow = {
  /** Positive numbers only; each is how far past that edge the content went. */
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type Check = {
  id: CheckId;
  target: string;
  /**
   * "not-applicable" is a real third state, not a polite pass. A check that
   * examined zero elements has verified nothing, and reporting that as a pass
   * reads as coverage — the exact trap M3's dangling-reference test fell into.
   */
  status: "pass" | "fail" | "not-applicable";
  /** How many elements this check actually examined. Zero means it proved nothing. */
  examined?: number;
  detail?: string;
  /** Present on failures the repair engine can act on. */
  overflow?: Overflow;
  /** The node a repair should edit. */
  ownerId?: string;
};

/** Sub-pixel noise is not a defect; a rounded coordinate can land half a pixel out. */
export const EPSILON = 0.5;

export function runChecks(figure: LaidOutFigure): Check[] {
  const boxes = new Map<string, PlacedBox>();
  for (const element of figure.elements) {
    if (element.kind === "box") boxes.set(element.id, element);
  }
  // Marks and connectors together: both are polylines a label can sit on,
  // and text-clear-of-ink tests every label against the same combined list
  // regardless of which vocabulary drew the ink.
  const ink: (PlacedMark | PlacedConnector)[] = [];
  for (const element of figure.elements) {
    if (element.kind === "mark" || element.kind === "connector") ink.push(element);
  }

  // Decision 0010. A relaxed constraint reports "not-applicable" with the
  // toggle named, never "pass": a figure that was excused and a figure that
  // was sound must not read the same way in a manifest.
  const toggles = resolveConstraints({ constraints: figure.constraints });

  const checks: Check[] = [];
  for (const element of figure.elements) {
    if (element.kind === "text") {
      checks.push(textFitsBox(element, boxes));
      checks.push(labelWithinShape(element, boxes));
      checks.push(textClearOfOtherBoxes(element, boxes));
      checks.push(textClearOfInk(element, boxes, ink));
    } else if (element.kind === "connector") {
      checks.push(
        toggles.allowConnectorCrossing
          ? relaxed("connector-clear-of-boxes", element.id, "allowConnectorCrossing")
          : connectorClearOfBoxes(element, boxes),
      );
    }
  }
  checks.push(
    ...(toggles.allowOverlap
      ? [relaxed("boxes-do-not-overlap", "figure", "allowOverlap")]
      : boxesDoNotOverlap(boxes)),
  );
  checks.push(contentWithinCanvas(figure));
  checks.push(effectWithinCanvas(figure));
  checks.push(...contrastSufficient(figure, boxes));
  checks.push(categoricalColoursDistinguishable(boxes));
  checks.push(tickLabelsDoNotCollide(figure));
  checks.push(constraintsSatisfied(figure, boxes));
  checks.push(declaredSizeHonoured(boxes));
  checks.push(annotationNearestItsOwner(figure, boxes));
  checks.push(sweepMatchesItsLabel(figure, boxes));
  checks.push(arcIsCircular(figure));
  return checks;
}

/**
 * A check the figure asked to stand down (decision 0010).
 *
 * Reported as "not-applicable" and never as "pass", and it names the toggle
 * that excused it. The distinction is the whole point: a manifest that said
 * "pass" here would claim the figure had been examined and found sound, when
 * in fact it was not examined at all.
 */
function relaxed(id: CheckId, target: string, toggle: keyof ConstraintToggles & string): Check {
  return {
    id,
    target,
    status: "not-applicable",
    detail: `not applicable: canvas.constraints.${toggle} is on, so this constraint was not enforced`,
  };
}

/**
 * Two boxes may nest, but they may not partially overlap.
 *
 * In flow layout this was unreachable — siblings cannot collide. Absolute
 * scenes make it reachable, and it is exactly what a repair can cause: growing
 * a layer of a cross-section to fit its label pushes it into the layer below,
 * fixing one defect by creating another. Containment is deliberate structure
 * (a case holds its parts); partial overlap never is.
 */
function boxesDoNotOverlap(boxes: Map<string, PlacedBox>): Check[] {
  // A lattice crosses itself at every intersection and passes under
  // everything standing on it, so grid furniture takes no part in collision.
  // Set aside rather than skipped: the count is reported, because a check
  // that quietly ignores half a figure reads exactly like one that examined
  // it. This is earned by the geometry being DERIVED from its frame -- it
  // cannot be in the wrong place -- and paid for by
  // tick-labels-do-not-collide, which guards the way a grid really fails.
  const furniture = [...boxes.values()].filter((box) => box.gridOf !== undefined).length;
  const entries = [...boxes.values()].filter((box) => box.gridOf === undefined);
  const pairs = (entries.length * (entries.length - 1)) / 2;

  // Fewer than two boxes means no pair could be resolved at all. Reporting
  // that as a pass would be a vacuous pass — the same standard decision 0005
  // imposes on modules, applied to the core so it is not held to a looser one.
  if (pairs === 0) {
    return [
      {
        id: "boxes-do-not-overlap",
        target: "figure",
        status: "not-applicable",
        examined: 0,
        detail:
          "not applicable: fewer than two boxes, so no pair could overlap" +
          (furniture === 0 ? "" : ` (${furniture} grid element(s) set aside as substrate)`),
      },
    ];
  }

  // Sweep along x instead of walking all n(n-1)/2 pairs. A box leaves the
  // active list once its right edge is behind the sweep line, and everything
  // still to come starts at or after that line — so the pairs the sweep never
  // forms are exactly those whose x intervals are disjoint, which *proves*
  // they cannot intersect rather than declining to look at them.
  //
  // Every pair is still resolved. The distinction the detail line reports is
  // between a pair resolved by the sweep's geometry and one resolved by an
  // explicit test; it is not the difference between checked and skipped.
  const ordered = entries
    .map((box, index) => ({ index, rect: rectOf(box) }))
    .sort((a, b) => a.rect.x - b.rect.x || a.index - b.index);

  const failures: [number, number][] = [];
  const active: typeof ordered = [];
  let tested = 0;

  for (const current of ordered) {
    let keep = 0;
    for (let i = 0; i < active.length; i += 1) {
      const other = active[i]!;
      // Exactly the condition `intersects` uses on this axis, so a box is
      // dropped only when it cannot intersect `current` — nor anything after
      // it, since the sweep line only moves right.
      if (other.rect.x + other.rect.width > current.rect.x + EPSILON) {
        active[keep] = other;
        keep += 1;
      }
    }
    active.length = keep;

    for (const other of active) {
      tested += 1;
      if (!intersects(current.rect, other.rect)) continue;
      if (contains(current.rect, other.rect) || contains(other.rect, current.rect)) continue;
      // Same relief, on the boxes rather than the text: an annotation and the
      // element it names are one thing said twice, not two things colliding.
      if (annotationPair(entries[current.index]!, entries[other.index]!)) continue;
      failures.push(
        other.index < current.index
          ? [other.index, current.index]
          : [current.index, other.index],
      );
    }
    active.push(current);
  }

  if (failures.length > 0) {
    // Reported in the boxes' own order, not the sweep's, so the output does
    // not depend on how the comparison happened to be organised.
    failures.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return failures.map(([i, j]) => ({
      id: "boxes-do-not-overlap" as const,
      target: entries[i]!.id,
      status: "fail" as const,
      detail: `overlaps ${entries[j]!.id} without containing it`,
    }));
  }

  return [
    {
      id: "boxes-do-not-overlap",
      target: "figure",
      status: "pass",
      examined: pairs,
      detail: `resolved ${pairs} pair(s); ${tested} needed an overlap test`,
    },
  ];
}

function rectOf(box: PlacedBox): Rect {
  return checkRect(box);
}

/**
 * The rect every geometry check reasons about for this box: its exact
 * rotated bounding box when Block.rotateBox turned it, or its plain
 * x/y/width/height otherwise (`bounds` is only ever set by
 * geometry/rotate.ts's `attachBoxRotation`, which runs iff the block asked
 * for it). This is what keeps a rotated block from silently overlapping a
 * neighbour or crossing a connector a check had just cleared -- see
 * PlacedBox.bounds.
 */
/** Exported so anim/checks.ts reasons about the same rotated-or-not footprint the static check does. */
export function checkRect(box: PlacedBox): Rect {
  return box.bounds ?? { x: box.x, y: box.y, width: box.width, height: box.height };
}

/**
 * A connector may touch the two boxes it joins and nothing else. A line that
 * runs through an unrelated box is the third documented defect (after text
 * overflow and collision) and the one a reader misreads rather than notices:
 * it looks like a connection that was never claimed.
 */
function connectorClearOfBoxes(connector: PlacedConnector, boxes: Map<string, PlacedBox>): Check {
  const endpoints = [connector.fromId, connector.toId].filter(
    (id): id is string => id !== null,
  );
  const endpointRects = endpoints
    .map((id) => boxes.get(id))
    .filter((box): box is PlacedBox => box !== undefined)
    .map((box) => checkRect(box));

  const crossed: string[] = [];
  for (const [id, box] of boxes) {
    if (endpoints.includes(id)) continue;
    const rect = checkRect(box);
    // A container necessarily lies between a callout and a part inside it. On a
    // cross-section every leader line crosses the outer case, and reporting that
    // would fail every well-formed annotated figure. Enclosure is structure,
    // not collision — the same guard the text check needs for nesting.
    if (endpointRects.some((endpoint) => contains(rect, endpoint))) continue;
    // A label naming this connector may lie on it. That is the same relief
    // `annotates` buys against the box checks, extended to the one thing a
    // force label in a free-body diagram actually names: the arrow itself.
    if (box.annotates === connector.id) continue;
    if (polylineIntersectsBox(connector.points, rect)) crossed.push(id);
  }
  return crossed.length === 0
    ? { id: "connector-clear-of-boxes", target: connector.id, status: "pass" }
    : {
        id: "connector-clear-of-boxes",
        target: connector.id,
        status: "fail",
        detail: `connector passes through ${crossed.join(", ")}, which it does not join`,
      };
}

/** Does every line of a label sit inside its own block's content box? */
function textFitsBox(text: PlacedText, boxes: Map<string, PlacedBox>): Check {
  const owner = text.ownerId === null ? undefined : boxes.get(text.ownerId);
  if (!owner) {
    return {
      id: "text-fits-box",
      target: text.id,
      status: "pass",
      detail: "no owning box; nothing to overflow",
    };
  }
  // localBox (pre-rotation) when the owner box itself also rotates: box and
  // label turn rigidly together, so whether the label fits is exactly the
  // question "did it fit before either rotated" -- see TextLine.localBox.
  const boxOf = (line: PlacedText["lines"][number]): Rect => line.localBox ?? line.box;
  const overflow = overflowOf(unionOf(text.lines.map(boxOf)), owner.content);
  if (!overflow) return { id: "text-fits-box", target: text.id, status: "pass" };

  const worst = text.lines
    .filter((line) => overflowOf(boxOf(line), owner.content) !== null)
    .map((line) => `"${truncate(line.text)}"`);
  return {
    id: "text-fits-box",
    target: text.id,
    status: "fail",
    ownerId: owner.id,
    overflow,
    detail: `${worst.length} line(s) overflow ${owner.id} — ${describe(overflow)}: ${worst.join(", ")}`,
  };
}

/**
 * Does every corner of every line sit inside the actual SHAPE drawn in its
 * owner's box, not just inside the box's bounding rectangle?
 *
 * text-fits-box answers the bounding-box question and stops there — a label
 * centred in a diamond can pass it while its corners already sit outside the
 * diamond's slanted sides. Not-applicable for "rect" (or an unset shape):
 * text-fits-box already answers exactly that question for a rectangle, and a
 * second check reporting the same pass/fail would be noise, not coverage.
 */
function labelWithinShape(text: PlacedText, boxes: Map<string, PlacedBox>): Check {
  const owner = text.ownerId === null ? undefined : boxes.get(text.ownerId);
  const shape = owner?.shape ?? "rect";
  if (!owner || shape === "rect") {
    return {
      id: "label-within-shape",
      target: text.id,
      status: "not-applicable",
      detail: owner ? "rect shape; text-fits-box already covers this" : "no owning box",
    };
  }

  // Deliberately the owner's own unrotated rect, not checkRect(owner): this
  // check tests each line's corners against the actual polygon a non-rect
  // shape draws, computed from the box's local geometry. A rotated box's
  // shape rotates with it (render/svg.ts), and getting THAT case exactly
  // right needs the shape's vertices rotated the same way -- out of scope
  // here; label-within-shape is simply not-applicable-precision for a
  // rotated non-rect shape today, same spirit as the known stroke-inset
  // simplification render/svg.ts already documents for non-rect shapes.
  const box = { x: owner.x, y: owner.y, width: owner.width, height: owner.height };
  const outside: string[] = [];
  for (const line of text.lines) {
    const corners = [
      { x: line.box.x, y: line.box.y },
      { x: line.box.x + line.box.width, y: line.box.y },
      { x: line.box.x, y: line.box.y + line.box.height },
      { x: line.box.x + line.box.width, y: line.box.y + line.box.height },
    ];
    if (corners.some((corner) => !containsPoint(shape, box, corner))) {
      outside.push(`"${truncate(line.text)}"`);
    }
  }

  return outside.length === 0
    ? { id: "label-within-shape", target: text.id, status: "pass", examined: text.lines.length }
    : {
        id: "label-within-shape",
        target: text.id,
        status: "fail",
        examined: text.lines.length,
        ownerId: owner.id,
        detail: `${outside.length} line(s) fall outside ${owner.id}'s ${shape} shape: ${outside.join(", ")}`,
      };
}

/**
 * A label that escapes its own box usually lands on top of a neighbour. That
 * is the defect a reader actually notices, so it is worth reporting separately
 * from the containment failure that caused it.
 */
function textClearOfOtherBoxes(text: PlacedText, boxes: Map<string, PlacedBox>): Check {
  const bounds = unionOf(text.lines.map((line) => line.box));
  const owner = text.ownerId === null ? undefined : boxes.get(text.ownerId);
  const ownerRect = owner === undefined ? undefined : checkRect(owner);

  const collided: string[] = [];
  for (const [id, box] of boxes) {
    if (id === text.ownerId) continue;
    const rect = checkRect(box);
    // An ancestor necessarily encloses its descendant's label. Once blocks can
    // nest (M2), reporting that as a collision would fire on every well-formed
    // nested figure, so containment of the owner is treated as ancestry.
    if (ownerRect !== undefined && contains(rect, ownerRect)) continue;
    // The one relief `annotates` buys: a label that NAMES this box may lie on
    // it. Only this box -- everything else still collides, and the annotation
    // pays for the relief with `annotation-nearest-its-owner`.
    if (owner?.annotates !== undefined && owner.annotates === id) continue;
    // Grid furniture is what the figure is drawn ON; a label crossing a
    // gridline is not a collision. See PlacedBox.gridOf.
    if (box.gridOf !== undefined) continue;
    if (overlapsBox(bounds, box)) collided.push(id);
  }
  return collided.length === 0
    ? { id: "text-clear-of-other-boxes", target: text.id, status: "pass" }
    : {
        id: "text-clear-of-other-boxes",
        target: text.id,
        status: "fail",
        ownerId: text.ownerId ?? undefined,
        detail: `label overlaps ${collided.join(", ")}`,
      };
}

/**
 * Does every label sit clear of every Mark outline and Connector route it
 * does not name?
 *
 * `textClearOfOtherBoxes` catches a label landing on another BOX; nothing
 * caught it landing on a hand-drawn LINE. A Mark's outline and a Connector's
 * route are polylines with no bounding box a check ever compares against, so
 * an angle label set on its own arc, or a caption crossing a plotted curve,
 * passed text-fits-box, text-clear-of-other-boxes and boxes-do-not-overlap
 * without a single one of them examining the ink itself.
 *
 * Skipped, both mirroring precedent already established for boxes:
 *   - a mark or connector this label's OWNER names via `annotates` -- the
 *     same relief `annotates` buys against a box or a connector, extended to
 *     the mark id ir/types.ts's own validation already allows it to name
 *   - grid furniture (`Mark.gridOf`) -- a label crossing a ruled line is not
 *     a collision, exactly as it is not one against a tick's own gridline
 *   - a mark with no visible stroke -- a filled region with no border is a
 *     surface a label may sit ON (contrast-sufficient scores that), not a
 *     line it can touch
 */
function textClearOfInk(
  text: PlacedText,
  boxes: Map<string, PlacedBox>,
  ink: (PlacedMark | PlacedConnector)[],
): Check {
  const bounds = unionOf(text.lines.map((line) => line.box));
  const owner = text.ownerId === null ? undefined : boxes.get(text.ownerId);
  // A label may cross the one thing it `annotates` ONLY if its own box
  // actually paints over it. A transparent label sitting astride its own
  // annotated arc still shows that arc sliced across the glyph -- exempting
  // it unconditionally hid exactly that defect behind a legitimate-looking
  // pass. `annotation-nearest-its-owner` is what earns the proximity; this is
  // what earns the overlap, and only an opaque owner earns it.
  const hidesWhatItAnnotates = owner !== undefined && !isTransparent(owner.fill);

  const touching: string[] = [];
  for (const element of ink) {
    if (hidesWhatItAnnotates && owner?.annotates === element.id) continue;
    if (element.kind === "mark") {
      if (element.gridOf !== undefined) continue;
      if (element.stroke === "none" || element.strokeWidth <= 0) continue;
    }
    if (polylineIntersectsBox(element.points, bounds)) touching.push(element.id);
  }

  return touching.length === 0
    ? { id: "text-clear-of-ink", target: text.id, status: "pass" }
    : {
        id: "text-clear-of-ink",
        target: text.id,
        status: "fail",
        ownerId: text.ownerId ?? undefined,
        detail: `label sits on ${touching.join(", ")}`,
      };
}

/**
 * Does every effect's ink land on the canvas?
 *
 * A shadow is ink, and ink outside the canvas is not drawn. This is the check
 * that stops the effects layer from being decoration: a glow sheared off flat
 * by the figure's own edge is a defect with a number attached, reported like
 * any overflow and repaired by the same loop — here by growing the canvas
 * padding, since the element itself is exactly where it should be.
 *
 * Kept apart from content-within-canvas rather than folded into it, and for
 * the reason decision 0005 gives about naming: the two answer different
 * questions. One says an element is off the page, which is a layout failure.
 * This one says an element is on the page and its halo is not, which is a
 * framing failure, and the repairs differ accordingly.
 */
function effectWithinCanvas(figure: LaidOutFigure): Check {
  const canvas: Rect = { x: 0, y: 0, width: figure.width, height: figure.height };
  const clipped: string[] = [];
  let worst: Overflow = { left: 0, top: 0, right: 0, bottom: 0 };
  let examined = 0;

  for (const element of figure.elements) {
    // A mark carries no effect, so it has no halo to clip. Its own stroke
    // reach is ordinary ink and is accounted for by content-within-canvas.
    const bleed: Bleed | undefined = element.kind === "mark" ? undefined : element.bleed;
    if (bleed === undefined || bleedIsEmpty(bleed)) continue;
    examined += 1;
    // A rotated box's filter region is local (pre-rotation), but the halo it
    // paints rotates to the canvas along with the box it is attached to, so
    // canvas containment has to test the ROTATED bled rect, not the local
    // one -- the same "rotate the ink, not just the shape" correction
    // PlacedBox.bounds already makes for the bare box.
    const localBled = inkBounds(ownBounds(element), bleed);
    const bled =
      element.kind === "box" && element.rotation !== undefined && element.rotationCenter !== undefined
        ? rotatedBounds(localBled, element.rotationCenter, element.rotation)
        : localBled;
    const overflow = overflowOf(bled, canvas);
    if (!overflow) continue;
    clipped.push(`${element.id} ${describe(overflow)}`);
    worst = {
      left: Math.max(worst.left, overflow.left),
      top: Math.max(worst.top, overflow.top),
      right: Math.max(worst.right, overflow.right),
      bottom: Math.max(worst.bottom, overflow.bottom),
    };
  }

  if (examined === 0) {
    return {
      id: "effect-within-canvas",
      target: "figure",
      status: "not-applicable",
      examined: 0,
      detail: "not applicable: no element carries an effect that reaches past its own bounds",
    };
  }
  return clipped.length === 0
    ? {
        id: "effect-within-canvas",
        target: "figure",
        status: "pass",
        examined,
        detail: `examined ${examined} element(s) with effect bleed`,
      }
    : {
        id: "effect-within-canvas",
        target: "figure",
        status: "fail",
        examined,
        overflow: worst,
        detail: clipped.join("; "),
      };
}

/** An element's own bounds, before any effect is taken into account. */
function ownBounds(element: LaidOutFigure["elements"][number]): Rect {
  if (element.kind === "box") {
    // Deliberately the box's own LOCAL (unrotated) rect, not checkRect: an
    // effect's filter region is defined pre-rotation, inside the rotated
    // group render/svg.ts emits (see effect-within-canvas below, which
    // rotates the bled rect itself when this element is rotated).
    return { x: element.x, y: element.y, width: element.width, height: element.height };
  }
  if (element.kind === "connector") {
    return unionRects(
      element.points.map((point) => ({ x: point.x, y: point.y, width: 0, height: 0 })),
    );
  }
  if (element.kind === "mark") {
    return unionRects(
      element.points.map((point) => ({ x: point.x, y: point.y, width: 0, height: 0 })),
    );
  }
  return unionRects(element.lines.map((line) => line.box));
}

function contentWithinCanvas(figure: LaidOutFigure): Check {
  const canvas: Rect = { x: 0, y: 0, width: figure.width, height: figure.height };
  const escaped: string[] = [];
  for (const element of figure.elements) {
    const box =
      element.kind === "box"
        ? checkRect(element)
        : element.kind === "connector"
          ? unionOf(
              element.points.map((point) => ({ x: point.x, y: point.y, width: 0, height: 0 })),
            )
          : element.kind === "mark"
            ? // A stroked outline lays ink half its own width past the path,
              // which is the mark's whole bleed: no effect, no halo, just the
              // pen. Ignoring it would let a mark's edge fall off the canvas
              // while its centreline sat inside.
              padRect(
                unionOf(
                  element.points.map((point) => ({ x: point.x, y: point.y, width: 0, height: 0 })),
                ),
                element.strokeWidth / 2,
              )
            : unionOf(element.lines.map((line) => line.box));
    const overflow = overflowOf(box, canvas);
    if (overflow) escaped.push(`${element.id} ${describe(overflow)}`);
  }
  return escaped.length === 0
    ? {
        id: "content-within-canvas",
        target: "figure",
        status: figure.elements.length === 0 ? "not-applicable" : "pass",
        examined: figure.elements.length,
        detail:
          figure.elements.length === 0
            ? "not applicable: the figure has no elements"
            : `examined ${figure.elements.length} element(s)`,
      }
    : {
        id: "content-within-canvas",
        target: "figure",
        status: "fail",
        detail: escaped.join("; "),
      };
}

/**
 * Is every label readable against what it actually sits on? (decision 0007)
 *
 * One check per text element, the same granularity text-fits-box uses,
 * because a contrast defect is a property of one label against one
 * background, not of the figure as a whole. A label whose owner has a
 * transparent fill (the callout role) is compared against the canvas colour
 * instead -- that is genuinely what a reader sees behind it, detected by
 * alpha rather than by matching the literal string "transparent" (a
 * transparent CSS colour normalises to `rgba(0, 0, 0, 0)` by the time this
 * runs) -- and a label whose colours cannot be parsed at all (a raw CSS
 * colour name never seen from a real render) is reported not-applicable for
 * that element specifically rather than silently skipped, so "nothing was
 * wrong" and "nothing could be checked" never look the same in the
 * manifest.
 */
/** A rect grown by `pad` on every side. */
function padRect(rect: Rect, pad: number): Rect {
  return {
    x: rect.x - pad,
    y: rect.y - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
}

/** A world-space point expressed in one box's own unrotated frame. */
function inFramePoint(point: Point, box: PlacedBox): Point {
  if (box.rotation === undefined || box.rotationCenter === undefined) return point;
  return rotatePoint(point, box.rotationCenter, -box.rotation);
}

/** This box's own unrotated rect — what `inFrameOf` maps a world rect into. */
function localRect(box: PlacedBox): Rect {
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

/**
 * Does `rect` overlap the box AS DRAWN, rather than its rotated bounding box?
 *
 * `checkRect` returns `bounds` for a rotated box, which is exact as a bound
 * and hopeless as an answer for a long thin bar on a diagonal: a 430px rule
 * at 30 degrees has a 372x215 bounding box covering most of the figure, and
 * every label in the picture reads as overlapping it. Mapping the rect into
 * the box's own frame first is still conservative -- an axis-aligned bound is
 * taken of the mapped corners -- but conservative about the LABEL, which is
 * small, instead of about the bar, which is not.
 */
function overlapsBox(rect: Rect, box: PlacedBox): boolean {
  return intersects(inFrameOf(rect, box), localRect(box));
}

/**
 * A world-space rect expressed in one box's own unrotated frame.
 *
 * Returned unchanged when the box never turned. When it did, the rect's four
 * corners are rotated back about the same centre `attachBoxRotation` used and
 * their axis-aligned bound is taken -- which is exact for an unrotated rect
 * and slightly generous for a rotated one, erring toward "this box might be
 * under the label" rather than toward silence.
 */
function inFrameOf(rect: Rect, box: PlacedBox): Rect {
  if (box.rotation === undefined || box.rotationCenter === undefined) return rect;
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x, y: rect.y + rect.height },
    { x: rect.x + rect.width, y: rect.y + rect.height },
  ].map((corner) => rotatePoint(corner, box.rotationCenter!, -box.rotation!));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

/**
 * What a label actually sits on.
 *
 * Its owner's own fill whenever the owner has one -- unchanged, and the case
 * nearly every figure takes.
 *
 * Otherwise the question is geometric, and answering it structurally was a
 * real defect rather than a simplification: a label whose own box is unfilled
 * fell straight through to the canvas background even when it sat squarely
 * inside a filled shape it did not happen to own. Text at #141414 centred in
 * a rect filled #101010 is invisible on the page, and this check reported
 * 18.42:1 and passed it -- while `text-clear-of-other-boxes` passed the same
 * figure too, because that box CONTAINS the label's owner and containment is
 * excused there as ancestry. Two checks stood down on one illegible label.
 *
 * Painted later wins, because that is the surface a reader sees; `boxes` is
 * built in element order, so the last match is the topmost. A label whose ink
 * is not fully covered by that surface gets both it and the background, and
 * the caller reports the worse -- it lies on both, and choosing one would be
 * a guess dressed as a measurement.
 */
/** Is `point` inside this closed polyline? Ray casting, same rule as inPolygon. */
function inPolyline(points: Point[], point: Point): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i]!;
    const b = points[j]!;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function surfacesUnder(
  text: PlacedText,
  boxes: Map<string, PlacedBox>,
  background: string,
  marks: PlacedMark[] = [],
): string[] {
  const owner = text.ownerId === null ? undefined : boxes.get(text.ownerId);
  if (owner !== undefined && !isTransparent(owner.fill)) return [owner.fill];

  const ink = unionOf(text.lines.map((line) => line.box));

  // Paint order, so each layer composites onto what is already beneath it.
  // Covering layers hide the whole label; straddling ones only part of it, so
  // they are kept apart -- see the return below.
  let covered = background;
  const straddling: PlacedBox[] = [];
  for (const [id, box] of boxes) {
    if (id === text.ownerId) continue;
    if (isTransparent(box.fill)) continue;
    // A 1px gridline does not decide whether text is legible, and treating it
    // as the surface under a label would fail a perfectly readable figure for
    // crossing one. Recorded as a decision here rather than left to fall out
    // of the geometry: grid furniture is not substrate.
    if (box.gridOf !== undefined) continue;
    // The label's ink in THIS box's own frame. checkRect would hand back the
    // rotated bounding box, and for a long thin bar drawn on a diagonal that
    // box covers most of the figure -- every label in the picture would be
    // scored against a 3px rule it is nowhere near.
    const local = inFrameOf(ink, box);
    const rect = { x: box.x, y: box.y, width: box.width, height: box.height };
    if (!intersects(local, rect)) continue;
    if (contains(rect, local)) {
      covered = compositeOver(box.fill, covered) ?? box.fill;
    } else {
      straddling.push(box);
    }
  }

  // A filled mark is a surface a label can sit on, and this is the obligation
  // ADR 0019 named as the Mark's price: without it, shading a region under a
  // label would change what a reader sees and nothing would measure it. Only
  // a CLOSED, filled mark counts -- an open outline is a line, not a ground --
  // and containment is tested against the flattened polyline, which is the
  // same geometry the renderer fills.
  const inkCentre = { x: ink.x + ink.width / 2, y: ink.y + ink.height / 2 };
  for (const mark of marks) {
    if (!mark.closed || mark.fill === "none" || isTransparent(mark.fill)) continue;
    if (!inPolyline(mark.points, inkCentre)) continue;
    covered = compositeOver(mark.fill, covered) ?? mark.fill;
  }

  if (straddling.length === 0) return [covered];
  // Part of the label lies on the covered stack and part on that stack plus
  // whatever it half-crosses. Both are real surfaces under real glyphs, and
  // the caller reports the worse of them.
  return [
    covered,
    ...straddling.map((box) => compositeOver(box.fill, covered) ?? box.fill),
  ];
}

function contrastSufficient(figure: LaidOutFigure, boxes: Map<string, PlacedBox>): Check[] {
  const texts = figure.elements.filter((element): element is PlacedText => element.kind === "text");
  const marks = figure.elements.filter((element): element is PlacedMark => element.kind === "mark");
  if (texts.length === 0) {
    return [
      {
        id: "contrast-sufficient",
        target: "figure",
        status: "not-applicable",
        examined: 0,
        detail: "not applicable: the figure has no text",
      },
    ];
  }

  return texts.map((text) => {
    const surfaces = surfacesUnder(text, boxes, figure.background, marks);
    // Worst surface wins: a label straddling two of them has to be legible
    // against both, and reporting the kinder one would be the same silent
    // pass this check exists to prevent.
    let background = surfaces[0]!;
    let ratio = contrastRatio(text.fill, background);
    for (const surface of surfaces.slice(1)) {
      const other = contrastRatio(text.fill, surface);
      if (other === null) {
        background = surface;
        ratio = null;
        break;
      }
      if (ratio !== null && other < ratio) {
        background = surface;
        ratio = other;
      }
    }

    if (ratio === null) {
      return {
        id: "contrast-sufficient",
        target: text.id,
        status: "not-applicable",
        detail: `not applicable: "${text.fill}" or "${background}" is not a colour this check understands`,
      };
    }

    const rounded = Math.round(ratio * 100) / 100;
    return ratio >= WCAG_AA_NORMAL
      ? {
          id: "contrast-sufficient",
          target: text.id,
          status: "pass",
          examined: 1,
          detail: `${rounded}:1 against ${background}`,
        }
      : {
          id: "contrast-sufficient",
          target: text.id,
          status: "fail",
          examined: 1,
          detail: `${rounded}:1 against ${background}, below the ${WCAG_AA_NORMAL}:1 WCAG AA threshold for normal text`,
        };
  });
}

/**
 * Does an angle mark sweep the angle its label prints?
 *
 * A sweep's geometry is derived -- the arc subtends whatever its two arms
 * subtend -- so the drawing cannot disagree with the coordinates that made
 * it. What it can still disagree with is a LABEL typed independently, and
 * that is exactly the defect this whole line of work started from: a slope
 * drawn at one angle beside a label reading another, passing every check.
 * Shipping an angle mark without this would rebuild that defect inside the
 * primitive meant to cure it.
 *
 * The label is found through `annotates`, so the connection is authored
 * rather than guessed at by proximity. Only labels that actually state a
 * number are compared -- "theta" names the angle without claiming a value,
 * and reporting it would punish correct figures. A degree sign, spaces and a
 * leading sign are tolerated; anything else is treated as not a claim.
 *
 * One degree of tolerance, because a label is written to the precision a
 * reader sees: an arc swept 29.97 degrees beside a label reading 30 is not a
 * defect, and demanding EPSILON here would fail every figure whose arm
 * endpoints were rounded to whole pixels.
 */
const SWEEP_LABEL_TOLERANCE_DEGREES = 1;

function sweepMatchesItsLabel(figure: LaidOutFigure, boxes: Map<string, PlacedBox>): Check {
  const sweeps = figure.elements.filter(
    (element): element is PlacedConnector =>
      element.kind === "connector" && element.curve?.kind === "sweep",
  );
  // A SECTOR is a swept angle too. A pie slice runs out to the rim, round an
  // arc and back; a donut slice adds a second arc along the hole. Both are
  // closed regions whose arcs turn about ONE centre, and that is the test --
  // not the number of arcs, which would have quietly excused every donut in
  // the repertoire from the check its slices most need. `arcCentres` already
  // keeps the three points each arc needs, for `arc-is-circular`, so nothing
  // new is measured here.
  const sectors = figure.elements.filter(
    (element): element is PlacedMark =>
      element.kind === "mark" &&
      element.closed &&
      element.arcCentres.length > 0 &&
      element.arcCentres.every(
        (arc) =>
          Math.abs(arc.centre.x - element.arcCentres[0]!.centre.x) < EPSILON &&
          Math.abs(arc.centre.y - element.arcCentres[0]!.centre.y) < EPSILON,
      ),
  );
  if (sweeps.length === 0 && sectors.length === 0) {
    return {
      id: "sweep-matches-its-label",
      target: "figure",
      status: "not-applicable",
      examined: 0,
      detail: "not applicable: nothing in this figure draws a swept angle",
    };
  }

  const texts = figure.elements.filter((element): element is PlacedText => element.kind === "text");
  const disagreements: string[] = [];
  let compared = 0;

  const swept: { id: string; drawn: number }[] = [
    ...sweeps.map((sweep) => {
      const centre = (sweep.curve as { kind: "sweep"; centre: Point }).centre;
      const first = sweep.points[0]!;
      const last = sweep.points[sweep.points.length - 1]!;
      return { id: sweep.id, drawn: sweptDegrees(first, last, centre) };
    }),
    ...sectors.map((sector) => ({ id: sector.id, drawn: sectorDegrees(sector) })),
  ];

  for (const { id: sweptId, drawn } of swept) {
    for (const [id, box] of boxes) {
      if (box.annotates !== sweptId) continue;
      const text = texts.find((candidate) => candidate.ownerId === id);
      if (text === undefined) continue;
      const stated = statedDegrees(text.lines.map((line) => line.text).join(""));
      if (stated === null) continue; // names the angle without claiming a value
      compared += 1;
      if (Math.abs(stated - drawn) > SWEEP_LABEL_TOLERANCE_DEGREES) {
        disagreements.push(
          `${id} says ${fmt(stated)} but ${sweptId} sweeps ${fmt(drawn)} degrees`,
        );
      }
    }
  }

  if (compared === 0) {
    return {
      id: "sweep-matches-its-label",
      target: "figure",
      status: "not-applicable",
      examined: 0,
      detail: `not applicable: ${sweeps.length} sweep(s), none annotated with a stated angle`,
    };
  }

  return disagreements.length === 0
    ? {
        id: "sweep-matches-its-label",
        target: "figure",
        status: "pass",
        examined: compared,
        detail: `every stated angle matches the arc drawn for it across ${compared} mark(s)`,
      }
    : {
        id: "sweep-matches-its-label",
        target: "figure",
        status: "fail",
        examined: compared,
        detail: `${disagreements.length} angle mark(s) disagree with their own label: ${disagreements.join("; ")}`,
      };
}

/**
 * Are both ends of every arc the same distance from the centre it turns about?
 *
 * An arc is stated as two endpoints and a centre, which is one number more
 * than a circle needs -- so the three can disagree, and when they do nothing
 * else in the pipeline notices. `sweepCommands` averages the two radii and
 * draws a perfectly smooth curve matching neither end's distance, and every
 * other check is happy because the polyline it walks is the polyline that
 * gets drawn. The figure is well-formed and the arc is not the arc that was
 * asked for.
 *
 * This was a known gap when the sweep shipped (ADR 0019 records it as
 * implied-but-unwritten) and the Mark made it reachable a second way, which
 * is the point at which a gap becomes a defect. One check covers both.
 *
 * Half a pixel, the same EPSILON everything else tolerates: an author
 * computing both arms from one radius lands exactly, and rounding to whole
 * pixels is not a defect.
 */
function arcIsCircular(figure: LaidOutFigure): Check {
  const arcs: { id: string; centre: Point; from: Point; to: Point }[] = [];
  for (const element of figure.elements) {
    if (element.kind === "connector" && element.curve?.kind === "sweep") {
      arcs.push({
        id: element.id,
        centre: element.curve.centre as Point,
        from: element.points[0]!,
        to: element.points[element.points.length - 1]!,
      });
    }
    if (element.kind === "mark") {
      for (const [i, arc] of element.arcCentres.entries()) {
        arcs.push({ id: `${element.id}#${i}`, centre: arc.centre, from: arc.from, to: arc.to });
      }
    }
  }

  if (arcs.length === 0) {
    return {
      id: "arc-is-circular",
      target: "figure",
      status: "not-applicable",
      examined: 0,
      detail: "not applicable: the figure draws no arcs",
    };
  }

  const wrong: string[] = [];
  for (const arc of arcs) {
    const r1 = Math.hypot(arc.from.x - arc.centre.x, arc.from.y - arc.centre.y);
    const r2 = Math.hypot(arc.to.x - arc.centre.x, arc.to.y - arc.centre.y);
    if (Math.abs(r1 - r2) > EPSILON) {
      wrong.push(`${arc.id} reaches ${fmt(r1)}px one side of its centre and ${fmt(r2)}px the other`);
    }
  }

  return wrong.length === 0
    ? {
        id: "arc-is-circular",
        target: "figure",
        status: "pass",
        examined: arcs.length,
        detail: `both ends of every arc sit on one circle across ${arcs.length} arc(s)`,
      }
    : {
        id: "arc-is-circular",
        target: "figure",
        status: "fail",
        examined: arcs.length,
        detail: `${wrong.length} arc(s) are not circular: ${wrong.join("; ")}`,
      };
}

/** The number a label claims, in degrees, or null when it claims none. */
/**
 * The angle a label claims, in degrees, or null when it claims no value.
 *
 * A PERCENTAGE counts, and converts. A pie slice's label says "34%", not
 * "122.4 degrees", but it is making exactly the same kind of claim about
 * exactly the same drawn sweep -- and a slice whose angle does not match its
 * own percentage is the classic pie-chart lie. Decision 0005's rule is a
 * distinct name where the method differs and the same name where it does not;
 * here the method is identical (measure the sweep, read the label, compare)
 * and only the unit differs, so this check keeps its name rather than growing
 * a near-duplicate beside it.
 */
/**
 * How far round a sector actually goes, in degrees.
 *
 * Not `sweptDegrees` of its first and last arc points, which is what this
 * tried first and what a reflex slice defeats: that function is an `acos`, so
 * it cannot return more than 180, and a 58% slice reported itself as the 151
 * degrees of its own complement. The arc a Mark draws is subject to the same
 * limit from the other side -- an arc named by two endpoints and a centre is
 * genuinely ambiguous about which way round it goes, and the minor arc is the
 * convention -- so a sector past a half turn has to be BUILT from more than
 * one arc, and is.
 *
 * Summing every arc would then double-count a donut, whose slice is bounded by
 * an outer rim and an inner one covering the same angle in reverse. So the
 * arcs are grouped by their radius and the largest group's total wins: the
 * angle a sector subtends is the angle its rim covers, once.
 */
function sectorDegrees(sector: PlacedMark): number {
  const byRadius = new Map<number, number>();
  for (const arc of sector.arcCentres) {
    const radius = Math.round(Math.hypot(arc.from.x - arc.centre.x, arc.from.y - arc.centre.y) * 2) / 2;
    const swept = sweptDegrees(arc.from, arc.to, arc.centre);
    byRadius.set(radius, (byRadius.get(radius) ?? 0) + swept);
  }
  return Math.max(0, ...byRadius.values());
}

function statedDegrees(text: string): number | null {
  const trimmed = text.trim();
  const share = /^\s*([+-]?\d+(?:\.\d+)?)\s*%\s*$/.exec(trimmed);
  if (share !== null) {
    const percent = Number(share[1]);
    return Number.isFinite(percent) ? (percent / 100) * 360 : null;
  }
  const match = /^\s*([+-]?\d+(?:\.\d+)?)\s*(?:°|deg|degrees)?\s*$/.exec(trimmed);
  if (match === null) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/** True when one of these two boxes is an annotation naming the other. */
function annotationPair(a: PlacedBox, b: PlacedBox): boolean {
  return a.annotates === b.id || b.annotates === a.id;
}

/** Distance from a point to a rect; 0 when the point is inside it. */
function distancePointToRect(point: Point, rect: Rect): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

/** Distance from a point to the nearest place on a polyline. */
function distancePointToPolyline(point: Point, points: Point[]): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    best = Math.min(best, distancePointToSegment(point, points[i - 1]!, points[i]!));
  }
  return points.length === 1 ? Math.hypot(point.x - points[0]!.x, point.y - points[0]!.y) : best;
}

function distancePointToSegment(point: Point, a: Point, b: Point): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const lengthSquared = vx * vx + vy * vy;
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * vx + (point.y - a.y) * vy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * vx), point.y - (a.y + t * vy));
}

/**
 * Is every annotation nearer to the element it names than to any other?
 *
 * This is what `Block.annotates` costs. The relief it buys is real -- an
 * annotation may lie on its owner, where any other box would be reported as a
 * collision -- so it arrives with a constraint that did not exist before
 * rather than as a bare exemption, which is the house rule (CONTRIBUTING.md:
 * every new degree of freedom ships with the check that constrains it).
 *
 * Proximity, not containment, because that is how a reader actually resolves
 * a label: "N" written between two arrows belongs to the nearer one, and a
 * figure where it has drifted closer to the wrong one is misread rather than
 * malformed. Boxes that CONTAIN the annotation are skipped -- a backdrop
 * encloses everything and is nobody's nearest neighbour in the sense that
 * matters -- as is the owner itself.
 */
function annotationNearestItsOwner(figure: LaidOutFigure, boxes: Map<string, PlacedBox>): Check {
  const annotations = [...boxes.values()].filter((box) => box.annotates !== undefined);
  if (annotations.length === 0) {
    return {
      id: "annotation-nearest-its-owner",
      target: "figure",
      status: "not-applicable",
      examined: 0,
      detail: "not applicable: no block declares what it annotates",
    };
  }

  // Every candidate reduced to one metric -- distance from the annotation's
  // own centre -- so a box and a connector are compared on the same terms. A
  // connector measured by its BOUNDING BOX would beat every box in the figure
  // whenever it ran diagonally, since that box is mostly empty space.
  const candidates: { id: string; distance: (from: Point) => number; encloses: (r: Rect) => boolean }[] =
    [];
  for (const [id, box] of boxes) {
    if (box.gridOf !== undefined) continue;
    const rect = localRect(box);
    candidates.push({
      id,
      // Measured in the box's own frame, for the same reason overlapsBox is:
      // a diagonal bar's bounding box is nobody's true nearest neighbour.
      distance: (from) => distancePointToRect(inFramePoint(from, box), rect),
      encloses: (r) => contains(rect, inFrameOf(r, box)),
    });
  }
  for (const element of figure.elements) {
    // A mark is measured exactly like a connector -- both are polylines, and
    // both would beat every real neighbour if measured by a bounding box.
    if (element.kind !== "connector" && element.kind !== "mark") continue;
    // A dense lattice puts a line within a few pixels of everything, so grid
    // furniture would win "nearest" against whatever a label actually names.
    // Excluded in its mark form for the same reason it is excluded in its
    // block form: it is what the figure is drawn ON.
    if (element.kind === "mark" && element.gridOf !== undefined) continue;
    const points = element.points;
    candidates.push({
      id: element.id,
      distance: (from) => distancePointToPolyline(from, points),
      encloses: () => false,
    });
  }

  const misattributed: string[] = [];
  for (const annotation of annotations) {
    const target = annotation.annotates!;
    const owner = candidates.find((candidate) => candidate.id === target);
    if (owner === undefined) continue; // refused at parse time; nothing to say here
    const rect = checkRect(annotation);
    const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    const toOwner = owner.distance(centre);
    for (const candidate of candidates) {
      if (candidate.id === annotation.id || candidate.id === target) continue;
      if (candidate.encloses(rect)) continue;
      const distance = candidate.distance(centre);
      if (distance < toOwner - EPSILON) {
        misattributed.push(
          `${annotation.id} names ${target} at ${fmt(toOwner)}px but sits ${fmt(distance)}px from ${candidate.id}`,
        );
        break;
      }
    }
  }

  return misattributed.length === 0
    ? {
        id: "annotation-nearest-its-owner",
        target: "figure",
        status: "pass",
        examined: annotations.length,
        detail: `every annotation is nearest what it names across ${annotations.length} label(s)`,
      }
    : {
        id: "annotation-nearest-its-owner",
        target: "figure",
        status: "fail",
        examined: annotations.length,
        detail: `${misattributed.length} annotation(s) sit nearer something they do not name: ${misattributed.join("; ")}`,
      };
}

/**
 * Did the box that got drawn have the size the spec asked for?
 *
 * Every other core check measures the figure against ITSELF -- does this
 * label fit its box, do these two boxes collide. None of them ever asks
 * whether the box is the box that was requested, so a spec could state one
 * number and the figure draw another with nothing in the output saying so.
 *
 * The case that found this: a 3px-tall rule for an inclined plane came out
 * 28px tall. Under `box-sizing: border-box` a height below padding plus
 * border is unsatisfiable, and CSS resolves it by growing the box -- correct,
 * since honouring the height would have to silently violate the padding
 * instead. Both axes behave this way; `width: 3` floors at 28 too.
 *
 * So this check does NOT report a bug in the layout. It reports that a
 * request could not be met, which is the part that was missing: the figure is
 * well-formed and the author's instruction was still overruled. There is no
 * repair for it -- growing is what already happened -- so it surfaces as
 * `unrepaired`, and the author fixes it by lowering the padding or raising
 * the size.
 *
 * Compared against the spec that was actually drawn (see PlacedBox.declared),
 * so a repaired block is measured against its repaired size. A repair that
 * lands is not a broken promise.
 */
function declaredSizeHonoured(boxes: Map<string, PlacedBox>): Check {
  const claimed = [...boxes.values()].filter((box) => box.declared !== undefined);
  if (claimed.length === 0) {
    return {
      id: "declared-size-honoured",
      target: "figure",
      status: "not-applicable",
      examined: 0,
      detail: "not applicable: no block declared a width or a height",
    };
  }

  const broken: string[] = [];
  for (const box of claimed) {
    const declared = box.declared!;
    if (declared.width !== undefined && Math.abs(box.width - declared.width) > EPSILON) {
      broken.push(`${box.id} asked for width ${fmt(declared.width)} and got ${fmt(box.width)}`);
    }
    if (declared.height !== undefined && Math.abs(box.height - declared.height) > EPSILON) {
      broken.push(`${box.id} asked for height ${fmt(declared.height)} and got ${fmt(box.height)}`);
    }
  }

  return broken.length === 0
    ? {
        id: "declared-size-honoured",
        target: "figure",
        status: "pass",
        examined: claimed.length,
        detail: `every declared size was honoured across ${claimed.length} block(s)`,
      }
    : {
        id: "declared-size-honoured",
        target: "figure",
        status: "fail",
        examined: claimed.length,
        detail:
          `${broken.length} declared size(s) could not be honoured: ${broken.join("; ")}` +
          ` — a size below its own padding and border cannot be drawn`,
      };
}

/**
 * Do the colours in a declared category still look different to a colourblind
 * reader? (decision 0007)
 *
 * Grouped, not per-element, because the question is inherently about a SET:
 * "series" only means something once there are at least two colours claiming
 * to be told apart. A group of one is not a comparison and is reported
 * not-applicable rather than a vacuous pass.
 */
function categoricalColoursDistinguishable(boxes: Map<string, PlacedBox>): Check {
  const groups = new Map<string, PlacedBox[]>();
  for (const box of boxes.values()) {
    if (box.categoryGroup === undefined) continue;
    const bucket = groups.get(box.categoryGroup);
    if (bucket) bucket.push(box);
    else groups.set(box.categoryGroup, [box]);
  }

  const comparableGroups = [...groups.values()].filter((members) => members.length >= 2);
  if (comparableGroups.length === 0) {
    return {
      id: "categorical-colours-distinguishable",
      target: "figure",
      status: "not-applicable",
      examined: 0,
      detail: "not applicable: no categoryGroup has two or more members to compare",
    };
  }

  const failures: string[] = [];
  let pairs = 0;
  for (const members of comparableGroups) {
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        const a = members[i]!;
        const b = members[j]!;
        for (const kind of DICHROMACY_KINDS) {
          pairs += 1;
          const distance = simulatedDistance(a.fill, b.fill, kind);
          if (distance === null) continue; // unparsable colour; not this check's problem
          if (distance < MIN_DISTINGUISHABLE_DISTANCE) {
            failures.push(
              `${a.id} and ${b.id} (group "${a.categoryGroup}") are only ${Math.round(distance)} apart under ${kind}`,
            );
          }
        }
      }
    }
  }

  return failures.length === 0
    ? {
        id: "categorical-colours-distinguishable",
        target: "figure",
        status: "pass",
        examined: pairs,
        detail: `compared ${pairs} pair(s) across ${comparableGroups.length} categorical group(s)`,
      }
    : {
        id: "categorical-colours-distinguishable",
        target: "figure",
        status: "fail",
        examined: pairs,
        detail: failures.join("; "),
      };
}

export function overflowOf(inner: Rect, outer: Rect): Overflow | null {
  const left = outer.x - inner.x;
  const top = outer.y - inner.y;
  const right = inner.x + inner.width - (outer.x + outer.width);
  const bottom = inner.y + inner.height - (outer.y + outer.height);
  const overflow: Overflow = {
    left: Math.max(0, left),
    top: Math.max(0, top),
    right: Math.max(0, right),
    bottom: Math.max(0, bottom),
  };
  const worst = Math.max(overflow.left, overflow.top, overflow.right, overflow.bottom);
  return worst > EPSILON ? overflow : null;
}

export function describe(overflow: Overflow): string {
  const parts: string[] = [];
  if (overflow.left > EPSILON) parts.push(`left by ${fmt(overflow.left)}px`);
  if (overflow.top > EPSILON) parts.push(`top by ${fmt(overflow.top)}px`);
  if (overflow.right > EPSILON) parts.push(`right by ${fmt(overflow.right)}px`);
  if (overflow.bottom > EPSILON) parts.push(`bottom by ${fmt(overflow.bottom)}px`);
  return `overflows ${parts.join(" and ")}`;
}

export function unionOf(rects: Rect[]): Rect {
  return unionRects(rects);
}

/** Does `outer` fully enclose `inner`? Used to recognise an ancestor box. */
/** Exported so anim/checks.ts's transition check tests the same containment-excused relationship, not a redefinition of it. */
export function contains(outer: Rect, inner: Rect): boolean {
  return (
    outer.x <= inner.x + EPSILON &&
    outer.y <= inner.y + EPSILON &&
    outer.x + outer.width >= inner.x + inner.width - EPSILON &&
    outer.y + outer.height >= inner.y + inner.height - EPSILON
  );
}

/** Exported so anim/checks.ts's transition check tests the same intersection relationship, not a redefinition of it. */
export function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width - EPSILON &&
    a.x + a.width > b.x + EPSILON &&
    a.y < b.y + b.height - EPSILON &&
    a.y + a.height > b.y + EPSILON
  );
}

function fmt(value: number): string {
  return String(Math.round(value * 10) / 10);
}

export function truncate(value: string): string {
  return value.length <= 32 ? value : `${value.slice(0, 32)}…`;
}

/**
 * Tick labels on axes should not overlap (M8, stage 5, step 26).
 *
 * Applies only to text elements marked as axis ticks (by metadata or naming
 * convention). Not all text is a tick — most labels are box labels, connector
 * labels, or titles. This check is only applicable when the figure declares
 * tick labels, which it does by setting a metadata flag or following a naming
 * pattern (e.g., id starts with "tick-").
 *
 * For now, returns not-applicable — full implementation comes with axis support
 * in chart preset (step 27). The check is added now so the CheckId type is
 * complete and repair.ts can reference it.
 */
function tickLabelsDoNotCollide(figure: LaidOutFigure): Check {
  const tickLabels: PlacedText[] = [];

  for (const element of figure.elements) {
    if (element.kind === "text") {
      // Identify tick labels by id pattern (temporary heuristic until metadata exists)
      if (element.id.startsWith("tick-") || element.id.includes("-tick-")) {
        tickLabels.push(element);
      }
    }
  }

  if (tickLabels.length < 2) {
    return {
      id: "tick-labels-do-not-collide",
      target: "figure",
      status: "not-applicable",
      examined: 0,
      detail: "not applicable: no axis tick labels found",
    };
  }

  // Check pairwise collisions
  const collisions: string[] = [];
  for (let i = 0; i < tickLabels.length; i++) {
    for (let j = i + 1; j < tickLabels.length; j++) {
      const a = tickLabels[i]!;
      const b = tickLabels[j]!;

      // Union of all line boxes for each text element
      const aBox = unionOf(a.lines.map((line) => line.box));
      const bBox = unionOf(b.lines.map((line) => line.box));

      if (intersects(aBox, bBox)) {
        collisions.push(`${a.id} overlaps ${b.id}`);
      }
    }
  }

  if (collisions.length > 0) {
    return {
      id: "tick-labels-do-not-collide",
      target: "figure",
      status: "fail",
      examined: tickLabels.length,
      detail: `${collisions.length} collision(s): ${collisions.slice(0, 3).join(", ")}${collisions.length > 3 ? "..." : ""}`,
    };
  }

  return {
    id: "tick-labels-do-not-collide",
    target: "figure",
    status: "pass",
    examined: tickLabels.length,
    detail: `checked ${tickLabels.length} tick label(s), no collisions`,
  };
}

/** One line per violated constraint, naming its kind and the elements involved. */
function describeConstraint(constraint: Constraint): string {
  switch (constraint.kind) {
    case "align":
      return `align(${constraint.elements.join(", ")}, ${constraint.axis})`;
    case "distribute":
      return `distribute(${constraint.elements.join(", ")}, ${constraint.axis})`;
    case "keepClear":
      return `keepClear(${constraint.element1}, ${constraint.element2}, ${constraint.minDistance})`;
    case "sameSize":
      return `sameSize(${constraint.elements.join(", ")}, ${constraint.dimension})`;
    case "anchor":
      return `anchor(${constraint.element})`;
  }
}

/**
 * Constraints satisfied (M10, stage 6, step 33).
 *
 * Verifies that every constraint declared in `spec.layoutConstraints` (align,
 * distribute, keepClear, sameSize, anchor -- decision 0010's vocabulary) holds
 * for the figure's actual laid-out positions, via `isConstraintSatisfied`
 * from src/constraints/types.ts. Reports not-applicable when nothing is
 * declared -- never a pass with nothing checked, per the house rule that a
 * check indistinguishable from "not running" does not count.
 *
 * This verifies; it does not move anything. Translation repair (step 34,
 * src/layout/repair.ts) is a separate, still-unwired mechanism that would act
 * on a failure reported here.
 */
function constraintsSatisfied(figure: LaidOutFigure, boxes: Map<string, PlacedBox>): Check {
  const constraints = figure.layoutConstraints ?? [];

  if (constraints.length === 0) {
    return {
      id: "constraints-satisfied",
      target: "figure",
      status: "not-applicable",
      examined: 0,
      detail: "not applicable: no constraints declared",
    };
  }

  const violated = constraints.filter((c) => !isConstraintSatisfied(c, boxes));

  if (violated.length > 0) {
    return {
      id: "constraints-satisfied",
      target: "figure",
      status: "fail",
      examined: constraints.length,
      detail: `${violated.length} of ${constraints.length} constraint(s) violated: ${violated.map(describeConstraint).join("; ")}`,
    };
  }

  return {
    id: "constraints-satisfied",
    target: "figure",
    status: "pass",
    examined: constraints.length,
    detail: `checked ${constraints.length} constraint(s), all satisfied`,
  };
}
