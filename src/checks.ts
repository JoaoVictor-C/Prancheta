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
  MeasuredIn,
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
import {
  WCAG_AA_NORMAL,
  compositeOver,
  contrastRatio,
  isOpaque,
  isTransparent,
  sameOpaqueColour,
} from "./colour/contrast.ts";
import {
  DICHROMACY_KINDS,
  MIN_DISTINGUISHABLE_DISTANCE,
  simulatedDistance,
} from "./colour/colourblind.ts";
import type { Constraint } from "./constraints/types.ts";
import { parseNumber } from "./locale/format.ts";
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
  // Its complement (ADR 0035): the text may be clear because it sits on a
  // paper backing, and the backing then erased the line under it.
  | "backing-hides-no-ink"
  | "content-within-canvas"
  // A canvas the size of a building is not a figure (review of 2026-09-29):
  // a sequence aₙ = 1000n drawn at a fixed pixels-per-unit came out 396 280px
  // tall and passed every other check, because every other check measures
  // the figure against itself.
  | "canvas-size-sane"
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
  // Its twin for straight runs (ADR 0028): a dimension line drawn 42 units
  // long beside a label reading "50 m", or a velocity arrow scaled at 2px
  // per m/s whose length disagrees with its printed "vA = 50 m/s".
  | "length-matches-its-label"
  // The same defect one degree of freedom further out (ADR 0037): a shaded
  // region -- "area under the curve", a Riemann rectangle -- is one closed
  // mark, and its printed area ("A = 4/3", "8/3 u.a.") is typed
  // independently of the polygon that draws it.
  | "area-matches-its-label"
  // The obligation a PLACE label pays (ADR 0028). `annotation-nearest-its-owner`
  // cannot measure a label naming a point where two lines meet -- the lines
  // are always nearer -- so a place is measured by its own rule, under its
  // own name, because the method differs.
  | "label-nearest-its-place"
  // What every proximity check above assumes (ADR 0035): that a label SAYS
  // what it names. One that says nothing is invisible to all of them unless
  // it is declared free-standing.
  | "label-declares-what-it-names"
  // An "arc" whose two ends are not the same distance from its centre is not
  // an arc, and nothing else notices: the renderer averages the two radii and
  // draws a curve matching neither.
  | "arc-is-circular"
  // Didactic checks (ADR 0024). A figure made to teach from can be
  // well-formed and still fail the reader: a number the exercise cites is
  // missing from the axis, or two curves differ only in a colour a
  // photocopy or a colour-blind student cannot see.
  | "axis-number-present"
  | "series-distinguishable-without-colour"
  | "curve-label-nearest-its-curve"
  // The core counterpart of module-feature-on-its-stroke (ADR 0025): a
  // marker that claims to lie on a curve, an axis or both is measured there.
  | "feature-on-its-curve"
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
  checks.push(canvasSizeSane(figure));
  checks.push(effectWithinCanvas(figure));
  checks.push(...contrastSufficient(figure, boxes));
  checks.push(categoricalColoursDistinguishable(boxes));
  checks.push(tickLabelsDoNotCollide(figure));
  checks.push(constraintsSatisfied(figure, boxes));
  checks.push(declaredSizeHonoured(boxes));
  checks.push(annotationNearestItsOwner(figure, boxes));
  checks.push(sweepMatchesItsLabel(figure, boxes));
  checks.push(...lengthMatchesItsLabel(figure, boxes));
  checks.push(...areaMatchesItsLabel(figure, boxes));
  checks.push(labelNearestItsPlace(figure, boxes));
  checks.push(labelDeclaresWhatItNames(figure, boxes));
  checks.push(backingHidesNoInk(figure, boxes));
  checks.push(arcIsCircular(figure));
  checks.push(axisNumberPresent(figure));
  checks.push(seriesDistinguishableWithoutColour(figure, boxes));
  checks.push(curveLabelNearestItsCurve(figure, boxes));
  checks.push(featureOnItsCurve(figure));
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
 *   - grid LATTICE lines (`Mark.gridOf`, not an axis) -- a label crossing a
 *     faint ruled line is not a collision, exactly as it is not one against a
 *     tick's own gridline. The two axes are NOT skipped (ADR 0035): text
 *     struck through by the heaviest line on the plane is a defect a reader
 *     sees, whatever the line is called
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
  // An axis number on a paper backing is the one deliberate exception, and
  // only for grid furniture. A number is never dropped (function-graph's
  // tick rule): when no spot within half a division of its tick is clear,
  // it keeps its spot and paints paper under itself, interrupting the curve
  // for the width of one numeral. The glyph is then set on paper, not on the
  // ink, which is what this check protects; `contrast-sufficient` still
  // measures it against the backing it actually sits on.
  const backedGridNumber = owner?.gridOf !== undefined && !isTransparent(owner.fill);
  if (backedGridNumber) {
    return {
      id: "text-clear-of-ink",
      target: text.id,
      status: "pass",
      detail: "an axis number on its own opaque backing; the ink beneath it is covered, not crossed",
    };
  }

  const touching: string[] = [];
  for (const element of ink) {
    if (hidesWhatItAnnotates && owner?.annotates === element.id) continue;
    if (element.kind === "mark") {
      // The lattice is still exempt: a faint ruled line under a number is
      // what a grid is, and every tick sits on its own. An AXIS is not
      // (ADR 0035): it is the heaviest line on the plane, a reader sees text
      // struck through by it, and presets had come to treat "exempt from the
      // check" as "free room" -- the unit circle's arc label was biased onto
      // the x axis for exactly that reason.
      if (element.gridOf !== undefined && !isAxis(element)) continue;
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
 * Is this mark one of a grid's two axes?
 *
 * Frame resolution gives the zero lines stable ids, `<frame>-axis-x` and
 * `<frame>-axis-y` (ir/frames.ts), so a mark can claim to lie on an axis by
 * name. The same ids tell an axis from the lattice: both are grid furniture,
 * but the lattice is a faint ruled line a number may sit on and an axis is
 * the heaviest line on the plane (ADR 0035).
 */
export function isAxis(mark: PlacedMark): boolean {
  return mark.gridOf !== undefined && (mark.id === `${mark.gridOf}-axis-x` || mark.id === `${mark.gridOf}-axis-y`);
}

/** Does this mark or connector put a visible line on the page? */
function drawsLine(element: PlacedMark | PlacedConnector): boolean {
  if (element.kind === "mark" && (element.place === true || element.tick !== undefined)) return false;
  if (element.stroke === "none" || element.strokeWidth <= 0) return false;
  return !isTransparent(element.stroke);
}

/** Does this polyline cross the box AS DRAWN (in its own frame when it is turned)? */
function polylineCrossesBox(points: Point[], box: PlacedBox): boolean {
  return polylineIntersectsBox(points.map((point) => inFramePoint(point, box)), localRect(box));
}

/** The ids of every box that owns a label. */
function labelledBoxes(figure: LaidOutFigure): Set<string> {
  const owners = new Set<string>();
  for (const element of figure.elements) {
    if (element.kind === "text" && element.ownerId !== null) owners.add(element.ownerId);
  }
  return owners;
}

/**
 * Does any label's opaque backing hide a line it does not name? (ADR 0035)
 *
 * A label gets a paper fill so its text stays legible over ink, and
 * `text-clear-of-ink` then passes it: the GLYPHS are clear, set on paper.
 * What nothing measured was the paper itself. Painter's order draws marks
 * first and boxes over them, so the backing erases every mark under it for
 * its whole width -- a tick number's backing cut a gap in a hyperbola at its
 * vertex and in a polar rose at the origin; a unit-circle angle label's
 * backing cut gaps in OP and in both axes. Every check passed, because each
 * asked about the text and none about what the paper covered.
 *
 * A backing may cover:
 *   - what its label `annotates` -- a tangent's value set on its own segment
 *     is the relief ADR 0019 grants, and the reader reads that line as named
 *     there, not as broken;
 *   - grid LATTICE lines -- the halo ADR 0034 designed, which a tick number
 *     earns only where its spot is otherwise clear of ink, and which breaks
 *     a faint ruled line a reader still completes across one numeral.
 *
 * It may NOT cover an axis, a curve, a guide or any other stroked mark: a
 * reader sees a gap in a line they are reading, whatever the checks call it.
 *
 * Only marks can be hidden. Connectors are painted after every box, so a
 * backing is always under them; a label on a connector it does not name is
 * `text-clear-of-ink`'s to report.
 */
function backingHidesNoInk(figure: LaidOutFigure, boxes: Map<string, PlacedBox>): Check {
  const id = "backing-hides-no-ink" as const;
  const labelled = labelledBoxes(figure);
  const backings = [...boxes.values()].filter((box) => labelled.has(box.id) && !isTransparent(box.fill));
  if (backings.length === 0) {
    return {
      id,
      target: "figure",
      status: "not-applicable",
      examined: 0,
      detail: "not applicable: no label is set on an opaque backing",
    };
  }
  const order = new Map<string, number>();
  figure.elements.forEach((element, index) => order.set(element.id, index));
  const marks = figure.elements.filter(
    (element): element is PlacedMark => element.kind === "mark" && drawsLine(element),
  );

  const hidden: string[] = [];
  let lattice = 0;
  for (const box of backings) {
    const painted = order.get(box.id) ?? Infinity;
    const cut: string[] = [];
    for (const mark of marks) {
      if ((order.get(mark.id) ?? -1) > painted) continue; // drawn over the backing, not under it
      if (box.annotates === mark.id) continue;
      if (!polylineCrossesBox(mark.points, box)) continue;
      if (mark.gridOf !== undefined && !isAxis(mark)) {
        lattice += 1;
        continue;
      }
      cut.push(mark.id);
    }
    if (cut.length > 0) hidden.push(`${box.id}'s backing hides ${cut.join(", ")}`);
  }

  const latticeNote = lattice === 0 ? "" : `; ${lattice} gridline crossing(s) under a backing allowed as a halo`;
  return hidden.length === 0
    ? {
        id,
        target: "figure",
        status: "pass",
        examined: backings.length,
        detail: `no backing hides a line it does not name across ${backings.length} backed label(s)${latticeNote}`,
      }
    : {
        id,
        target: "figure",
        status: "fail",
        examined: backings.length,
        detail: `${hidden.length} label backing(s) cut a gap in ink they do not name: ${hidden.join("; ")}`,
      };
}

/**
 * Text drawn on no shape of its own: no stroke, no border, and a fill that is
 * either nothing or the paper itself. That is what a reader takes for a
 * LABEL -- something that names what it sits beside -- rather than for a
 * node, a bar or a cell that is itself the thing.
 */
function isBareLabel(box: PlacedBox, background: string): boolean {
  const stroked = box.strokeWidth > 0 && box.stroke !== "none" && !isTransparent(box.stroke);
  const bordered =
    box.border !== undefined &&
    Object.values(box.border).some((side) => side !== undefined && (side.width ?? 0) > 0 && side.color !== "none");
  const filled = !isTransparent(box.fill) && !sameOpaqueColour(box.fill, background);
  return !stroked && !bordered && !filled;
}

/**
 * Does every bare label say what it names -- or say that it names nothing?
 * (ADR 0035)
 *
 * The two proximity checks only examine a label that makes a claim:
 * `annotation-nearest-its-owner` one with `annotates`, `label-nearest-its-place`
 * one naming a place, `curve-label-nearest-its-curve` one with `names`. A
 * label declaring none of them was invisible to all three, so it could sit
 * beside the wrong thing and pass: the unit circle's sin value "√3/2" sat
 * beside a symmetric point it did not name. Not a false pass inside any check,
 * a figure that never made the claim those checks hold it to.
 *
 * So unclaimed is no longer the silent default. A bare label either declares
 * what it names, or declares `freeStanding` -- a title, a caption, a note --
 * which is a visible choice in the spec and in this check's count. Grid
 * furniture (tick numbers) is the frame's own, and not asked.
 */
function labelDeclaresWhatItNames(figure: LaidOutFigure, boxes: Map<string, PlacedBox>): Check {
  const id = "label-declares-what-it-names" as const;
  const labelled = labelledBoxes(figure);
  const bare = [...boxes.values()].filter(
    (box) => labelled.has(box.id) && box.gridOf === undefined && isBareLabel(box, figure.background),
  );
  if (bare.length === 0) {
    return {
      id,
      target: "figure",
      status: "not-applicable",
      examined: 0,
      detail: "not applicable: no text is set bare, as a label, on the figure",
    };
  }
  const unclaimed = bare.filter(
    (box) => box.annotates === undefined && box.names === undefined && box.freeStanding !== true,
  );
  const free = bare.filter((box) => box.freeStanding === true).length;
  return unclaimed.length === 0
    ? {
        id,
        target: "figure",
        status: "pass",
        examined: bare.length,
        detail: `every one of ${bare.length} bare label(s) names something or is declared free-standing (${free} free-standing)`,
      }
    : {
        id,
        target: "figure",
        status: "fail",
        examined: bare.length,
        detail:
          `${unclaimed.length} label(s) name nothing and are not declared free-standing, so no check can tell ` +
          `whether they sit beside what they mean: ${unclaimed.map((box) => box.id).join(", ")}. ` +
          `Give each annotates, annotatesPlace or names -- or freeStanding: true for a title or caption.`,
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

/** The largest side a figure may have, in CSS pixels: an A4 page is about 800 wide and 1100 tall, and a sheet scales a figure to its column. */
export const CANVAS_MAX_SIDE = 4000;
/** Below this a figure cannot hold a label and its ink. */
export const CANVAS_MIN_SIDE = 60;

function canvasSizeSane(figure: LaidOutFigure): Check {
  const { width, height } = figure;
  const problems: string[] = [];
  if (width > CANVAS_MAX_SIDE || height > CANVAS_MAX_SIDE) problems.push(`${Math.round(width)}×${Math.round(height)}px exceeds ${CANVAS_MAX_SIDE}px on a side -- the scale was fixed per unit and not fitted to the data`);
  if (width < CANVAS_MIN_SIDE || height < CANVAS_MIN_SIDE) problems.push(`${Math.round(width)}×${Math.round(height)}px is under ${CANVAS_MIN_SIDE}px on a side`);
  return problems.length === 0
    ? { id: "canvas-size-sane", target: "figure", status: "pass" }
    : { id: "canvas-size-sane", target: "figure", status: "fail", detail: problems.join("; ") };
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
 * every label in the picture reads as overlapping it.
 *
 * Answered by separating axes over the two rectangles AS ORIENTED, which is
 * exact in both directions and costs four projections. Mapping the label into
 * the box's frame with `inFrameOf` and re-bounding it was conservative about
 * the LABEL instead, and that trade only holds while the label is small: the
 * re-bound grows with the label's ASPECT and the angle, so a 1112x30 title
 * back-rotated 62 degrees bounds to roughly 548x996 and collides with every
 * steeply turned box on the canvas. A figure carrying a page-wide title and a
 * column of angled counts could not be made to pass by moving anything --
 * the false positive was a function of the title's WIDTH, not of any
 * distance. Two of the four axes are (1, 0) and (0, 1), which is why the
 * unrotated case still goes straight to `intersects`: those two reduce to it
 * exactly, and the shortcut says so rather than leaving it to be rediscovered.
 */
function overlapsBox(rect: Rect, box: PlacedBox): boolean {
  if (box.rotation === undefined || box.rotationCenter === undefined) {
    return intersects(rect, localRect(box));
  }
  const radians = (box.rotation * Math.PI) / 180;
  const axes: Point[] = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: Math.cos(radians), y: Math.sin(radians) },
    { x: -Math.sin(radians), y: Math.cos(radians) },
  ];
  const label = cornersOf(rect);
  const drawn = cornersOf(localRect(box)).map((corner) =>
    rotatePoint(corner, box.rotationCenter!, box.rotation!),
  );
  return axes.every((axis) => !separatedAlong(axis, label, drawn));
}

/** A rect's four corners, clockwise from its top-left. */
function cornersOf(rect: Rect): Point[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

/**
 * Do these two point sets' projections onto `axis` fall clear of one another?
 *
 * `axis` must be a UNIT vector, so the slack below stays in world pixels --
 * the same EPSILON slack `intersects` applies, in the same direction: a
 * shared edge, or an overlap thinner than half a pixel, is not a collision.
 */
function separatedAlong(axis: Point, a: Point[], b: Point[]): boolean {
  const project = (points: Point[]): { min: number; max: number } => {
    const onto = points.map((point) => point.x * axis.x + point.y * axis.y);
    return { min: Math.min(...onto), max: Math.max(...onto) };
  };
  const first = project(a);
  const second = project(b);
  return first.max <= second.min + EPSILON || second.max <= first.min + EPSILON;
}

/**
 * A world-space rect expressed in one box's own unrotated frame.
 *
 * Returned unchanged when the box never turned. When it did, the rect's four
 * corners are rotated back about the same centre `attachBoxRotation` used and
 * their axis-aligned bound is taken -- exact when the box never turned, and
 * generous by a factor that grows with the rect's ASPECT and the angle when
 * it did, which is not slight: a 1112x30 rect back-rotated 62 degrees bounds
 * to about 548x996. `overlapsBox` was built on this and is not any more, for
 * precisely that reason. What is left are the two callers that need a RECT
 * back rather than a yes/no -- a surface test and an enclosure test -- and
 * both err toward naming a box rather than toward silence.
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

/**
 * The em box of a label's text: each line box trimmed vertically to its font
 * size. A line box carries the line-height's leading above and below the
 * glyphs, and a gridline running through that leading is under no glyph.
 */
function textInkBox(text: PlacedText): Rect {
  return unionOf(
    text.lines.map((line) => {
      const inset = Math.max(0, (line.box.height - text.fontSize) / 2);
      return { x: line.box.x, y: line.box.y + inset, width: line.box.width, height: line.box.height - inset * 2 };
    }),
  );
}

/**
 * Every stroked line that visibly runs under a label's glyphs, with the
 * colour a reader sees it in (ADR 0035).
 *
 * `surfacesUnder` treats a gridline as "not substrate", and for a FILL that
 * is right: a 1px line does not decide what colour a label sits on. But a
 * glyph crossed by that line is read against it along the crossing, and pale
 * grey tick numbers over grey gridlines passed this check on the strength of
 * the paper beside them. So every line through the text's em box counts --
 * lattice, axis, curve or connector alike, since a glyph does not care what
 * the line under it is called -- unless an opaque box painted after it
 * covers the whole em box: a label's own paper backing hides the lattice it
 * interrupts, and then the paper is what the glyphs sit on. A connector is
 * painted after every box, so no backing ever hides one.
 */
function strokesUnder(
  text: PlacedText,
  boxes: Map<string, PlacedBox>,
  lines: (PlacedMark | PlacedConnector)[],
  order: Map<string, number>,
  covered: string,
): { id: string; colour: string }[] {
  const ink = textInkBox(text);
  if (ink.width <= 0 || ink.height <= 0) return [];
  const coverers = [...boxes.values()].filter(
    (box) => isOpaque(box.fill) && contains(localRect(box), inFrameOf(ink, box)),
  );
  const out: { id: string; colour: string }[] = [];
  for (const line of lines) {
    if (!polylineIntersectsBox(line.points, ink)) continue;
    const painted = order.get(line.id) ?? -1;
    if (line.kind === "mark" && coverers.some((box) => (order.get(box.id) ?? -1) > painted)) continue;
    out.push({ id: line.id, colour: compositeOver(line.stroke, covered) ?? line.stroke });
  }
  return out;
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

  const order = new Map<string, number>();
  figure.elements.forEach((element, index) => order.set(element.id, index));
  const lines = figure.elements.filter(
    (element): element is PlacedMark | PlacedConnector =>
      (element.kind === "mark" || element.kind === "connector") && drawsLine(element),
  );

  return texts.map((text) => {
    const surfaces = surfacesUnder(text, boxes, figure.background, marks);
    // Every line visibly running under the glyphs is part of what they are
    // read against (ADR 0035). Composited over the covered surface, and
    // named in the detail so a failure says WHICH line.
    const strokes = strokesUnder(text, boxes, lines, order, surfaces[0]!);
    const named = new Map<string, string>();
    for (const stroke of strokes) {
      if (!named.has(stroke.colour)) named.set(stroke.colour, stroke.id);
      if (!surfaces.includes(stroke.colour)) surfaces.push(stroke.colour);
    }
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
    const against = named.has(background) ? `${background} (the line ${named.get(background)} running under it)` : background;
    return ratio >= WCAG_AA_NORMAL
      ? {
          id: "contrast-sufficient",
          target: text.id,
          status: "pass",
          examined: 1,
          detail: `${rounded}:1 against ${against}`,
        }
      : {
          id: "contrast-sufficient",
          target: text.id,
          status: "fail",
          examined: 1,
          detail: `${rounded}:1 against ${against}, below the ${WCAG_AA_NORMAL}:1 WCAG AA threshold for normal text`,
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

/**
 * The number of degrees a label states, or null when it states none.
 *
 * Read in either locale: a figure printed in pt-BR says "37,5°" and "−30°"
 * (decimal comma, typographic minus), and reading only "37.5" and "-30" left
 * every pt-BR angle label silently outside the check that exists to guard it
 * -- found when the unit-circle preset had to print its degrees in ASCII to be
 * checked at all. A comma in a degree or a share is always the decimal mark:
 * no angle or percentage is large enough to carry a thousands separator.
 */
function statedDegrees(text: string): number | null {
  const trimmed = text.trim().replace(/−/g, "-").replace(/(\d),(\d)/g, "$1.$2");
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
  // A label naming a PLACE is measured by `label-nearest-its-place` instead,
  // and a place is not ink: it competes for nobody's "nearest" here, since a
  // reader cannot attribute a label to something that is not drawn.
  const places = placesOf(figure);
  const annotations = [...boxes.values()].filter(
    (box) => box.annotates !== undefined && !places.has(box.annotates),
  );
  if (annotations.length === 0) {
    return {
      id: "annotation-nearest-its-owner",
      target: "figure",
      status: "not-applicable",
      examined: 0,
      detail: "not applicable: no block declares an element it annotates",
    };
  }

  // Every candidate reduced to one metric -- distance from the annotation's
  // own centre -- so a box and a connector are compared on the same terms. A
  // connector measured by its BOUNDING BOX would beat every box in the figure
  // whenever it ran diagonally, since that box is mostly empty space.
  const candidates: { id: string; distance: (from: Point) => number; encloses: (r: Rect) => boolean }[] =
    [];
  const named = new Set(annotations.map((annotation) => annotation.annotates!));
  for (const [id, box] of boxes) {
    if (box.gridOf !== undefined) continue;
    // Another LABEL is not a rival (ADR 0035, extending ADR 0028's rule for
    // places): a reader attributes a label to something drawn, never to a
    // second label. Measured centre to centre, two wide callouts stacked on
    // one side of a cell read as each other's nearest neighbour while each
    // sits at the end of its own leader. A box counts as a label once it
    // makes a claim of its own -- `annotates`, `names`, or `freeStanding` --
    // unless some annotation names it.
    const isLabel = box.annotates !== undefined || box.names !== undefined || box.freeStanding === true;
    if (isLabel && !named.has(id)) continue;
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
    if (element.kind === "mark" && element.place === true) continue;
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
 * The places this figure's labels name, by the id of the mark that carries
 * each one (ADR 0028). A place mark is a single point with no ink; see
 * `Mark.place`.
 */
function placesOf(figure: LaidOutFigure): Map<string, Point> {
  const places = new Map<string, Point>();
  for (const element of figure.elements) {
    if (element.kind === "mark" && element.place === true && element.points.length > 0) {
      places.set(element.id, element.points[0]!);
    }
  }
  return places;
}

/**
 * A length a label claims: its magnitude, how finely it was written, and the
 * unit it names, if any.
 *
 * `resolution` is half the last digit the label prints. That is the whole of
 * the tolerance a reader grants it -- "50" covers anything that rounds to 50,
 * "2,5" anything that rounds to 2,5 -- and it is the length counterpart of
 * the one degree `sweep-matches-its-label` allows: tolerate what a reader
 * could not see, and nothing a reader could.
 */
type StatedLength = { value: number; resolution: number; unit: string | null };

/**
 * The length a label states, or null when it states none.
 *
 * Read as the project's own formatter writes numbers (ADR 0023): pt-BR, so a
 * COMMA is the decimal mark and "2,5" is two and a half. A dot is ambiguous
 * between the two locales and is decided the way a Brazilian reader decides
 * it -- "1.500" is fifteen hundred, being a dot followed by groups of exactly
 * three digits -- and otherwise, as in "2.5", read as a decimal point, since
 * no pt-BR writer puts a thousands mark before a single digit.
 *
 * A name in front is allowed and ignored: "vA = 50 m/s" and "d = 2,5 m" state
 * 50 and 2,5 exactly as "50 m/s" does, and they are how an exam writes them.
 * A unit after is kept -- "50m" and "50 m" alike -- so the caller can refuse
 * to compare it against a frame that says it measures something else. A
 * degree sign or a percentage is an ANGLE, which is the sweep check's to
 * read, so it is not a length claim at all. Anything else that is not a
 * number -- "N", "mg", "h" -- names the length without claiming a value and
 * is null, the same rule and the same hole ADR 0019 records for "theta".
 *
 * The sign is dropped. A length is a magnitude, and "vx = −3 m/s" drawn as an
 * arrow pointing left is three units long; checking that the arrow points
 * the way its sign says is a different claim this check does not make.
 */
function statedLength(text: string): StatedLength | null {
  let t = text.trim().replaceAll("−", "-").replaceAll(" ", " ");
  const equals = t.lastIndexOf("=");
  if (equals >= 0) t = t.slice(equals + 1).trim();
  // An exact root -- "√13", "2√13", "3√2/2" -- is a stated length too, and
  // the one a Brazilian exercise prints: reading only decimals left every
  // exact length off the drawing, in a readings panel no check could reach.
  // Exact, so no digit of resolution is forgiven; the caller's half pixel
  // still is.
  const root = /^(\d+)?\s*√\s*(\d+)(?:\s*\/\s*(\d+))?\s*([^\s\d.,=+\-/][^\s]*)?$/.exec(t);
  if (root !== null) {
    const value = (Number(root[1] ?? 1) * Math.sqrt(Number(root[2]))) / Number(root[3] ?? 1);
    const unit = root[4] ?? null;
    if (!Number.isFinite(value) || value === 0) return null;
    return { value, resolution: 0, unit };
  }
  const match = /^[+-]?(\d[\d.]*(?:,\d+)?)\s*([^\s\d.,=+\-][^\s]*)?$/.exec(t);
  if (match === null) return null;
  const token = match[1]!;
  const unit = match[2] ?? null;
  if (unit !== null && /^(?:°|º|%|deg|degrees|rad)$/.test(unit)) return null;

  let value: number;
  let decimals: number;
  if (token.includes(",")) {
    const parsed = parseNumber(token, "pt-BR");
    if (parsed === null) return null;
    value = parsed;
    decimals = token.length - token.indexOf(",") - 1;
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(token)) {
    value = Number(token.replaceAll(".", ""));
    decimals = 0;
  } else if (/^\d+(?:\.\d+)?$/.test(token)) {
    value = Number(token);
    decimals = token.includes(".") ? token.length - token.indexOf(".") - 1 : 0;
  } else {
    return null;
  }
  if (!Number.isFinite(value)) return null;
  return { value: Math.abs(value), resolution: 0.5 * 10 ** -decimals, unit };
}

/** Units compared as written, less spacing: "m/s" and "m / s" are one unit, "cm" and "m" are not. */
function sameUnit(a: string, b: string): boolean {
  return a.replace(/\s+/g, "") === b.replace(/\s+/g, "");
}

/**
 * How long the run from `from` to `to` is in the units of the frame it was
 * stated in: the inverse of `resolveInFrame`, without the origin, since a
 * length does not care where it starts.
 */
function lengthInUnits(from: Point, to: Point, scale: MeasuredIn): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const radians = (scale.rotation * Math.PI) / 180;
  const along = dx * Math.cos(radians) - dy * Math.sin(radians);
  const across = dx * Math.sin(radians) + dy * Math.cos(radians);
  return Math.hypot(along / scale.xUnit, across / scale.yUnit);
}

/**
 * Is every straight run as long as the length its label prints? (ADR 0028)
 *
 * The twin `sweep-matches-its-label` never got. Both reproduced exam figures
 * this project has drawn depend on it: a dimension line and the "50 m" beside
 * it are two numbers free to disagree, and so are "vA = 50 m/s" and an arrow
 * scaled at 2px per m/s. Derivation makes the LINE agree with the frame it is
 * stated in -- the 50 that draws it appears once -- but the label is typed
 * independently, which is exactly the gap ADR 0019 says a check is for.
 *
 * Same shape as the sweep check, deliberately: the label is found through
 * `annotates`, never by proximity; only a label that states a number is read;
 * and the tolerance is what a reader could not see -- half the label's last
 * digit, plus the half pixel every other check forgives, turned into units.
 *
 * The one real difference is units. An angle is degrees wherever it is
 * drawn; a length is pixels unless a frame says otherwise, and a pixel count
 * compared with "50 m" is not a check but a coincidence. So a run is measured
 * only when frame resolution recorded the scale it was stated at
 * (`MeasuredIn`), and a numeric label on a run with no such scale is
 * reported NOT APPLICABLE, per run, naming why. Never a pass: a figure whose
 * dimension line was drawn in canvas pixels has had nothing about its length
 * verified, and a manifest must not say otherwise.
 *
 * Reported per run rather than once per figure, unlike the sweep check,
 * because the runs of one figure can land in different states -- one
 * measured and right, one unmeasurable -- and a single figure-level verdict
 * would have to hide one of the two.
 */
function lengthMatchesItsLabel(figure: LaidOutFigure, boxes: Map<string, PlacedBox>): Check[] {
  const id = "length-matches-its-label" as const;
  const texts = figure.elements.filter((element): element is PlacedText => element.kind === "text");
  // A sweep's label is an angle and belongs to the sweep check; grid lines
  // and places are not runs anyone labels with a length.
  const runs = new Map<string, PlacedConnector | PlacedMark>();
  for (const element of figure.elements) {
    if (element.kind === "connector" && element.curve?.kind !== "sweep") runs.set(element.id, element);
    // A closed mark is a region, not a run: its label states an area and
    // belongs to area-matches-its-label (ADR 0037). Measured here, "A = 8/3"
    // read as a length of 8 in the unit "/3".
    if (element.kind === "mark" && element.gridOf === undefined && element.place !== true && element.closed !== true) {
      runs.set(element.id, element);
    }
  }

  const results: Check[] = [];
  for (const [labelId, box] of boxes) {
    if (box.annotates === undefined) continue;
    const run = runs.get(box.annotates);
    if (run === undefined) continue;
    const text = texts.find((candidate) => candidate.ownerId === labelId);
    if (text === undefined) continue;
    const printed = text.lines.map((line) => line.text).join(" ");
    const stated = statedLength(printed);
    if (stated === null) continue; // names the length without claiming a value

    const notApplicable = (why: string): void => {
      results.push({
        id,
        target: run.id,
        status: "not-applicable",
        examined: 0,
        detail: `not applicable: ${labelId} states "${truncate(printed)}" but ${why}`,
      });
    };

    if (run.kind === "connector" && run.curve !== undefined) {
      notApplicable(`${run.id} is a curved route, and a stated length measures a straight run`);
      continue;
    }
    if (run.measuredIn === undefined) {
      notApplicable(
        run.kind === "mark" && (run.arcCentres.length > 0 || run.points.length > 3)
          ? `${run.id} is not one straight segment, so it has no single length to compare`
          : `${run.id} was not stated in a frame (or its ends sit in frames of different scale), ` +
              `so its length has no unit to be measured in`,
      );
      continue;
    }
    const scale = run.measuredIn;
    if (stated.unit !== null && scale.unit !== undefined && !sameUnit(stated.unit, scale.unit)) {
      notApplicable(
        `${run.id} is drawn in frame "${scale.frame}", whose unit is "${scale.unit}", not "${stated.unit}"`,
      );
      continue;
    }

    const from = run.points[0]!;
    // A mark's single segment is its first two points; closing it back to the
    // start adds a third that retraces the same line.
    const to = run.kind === "mark" ? run.points[1]! : run.points[run.points.length - 1]!;
    const drawn = lengthInUnits(from, to, scale);
    const tolerance = stated.resolution + EPSILON / Math.min(scale.xUnit, scale.yUnit);
    const unit = stated.unit ?? scale.unit ?? "units";
    if (Math.abs(drawn - stated.value) > tolerance) {
      results.push({
        id,
        target: run.id,
        status: "fail",
        examined: 1,
        ownerId: labelId,
        detail:
          `${labelId} says ${fmt(stated.value)} but ${run.id} is drawn ${fmt(drawn)} ${unit} long ` +
          `in frame "${scale.frame}" (${fmt(scale.xUnit)}px per unit)`,
      });
    } else {
      results.push({
        id,
        target: run.id,
        status: "pass",
        examined: 1,
        detail: `${run.id} is ${fmt(drawn)} ${unit} long, as ${labelId} states`,
      });
    }
  }

  if (results.length === 0) {
    return [
      {
        id,
        target: "figure",
        status: "not-applicable",
        examined: 0,
        detail: "not applicable: no line or arrow is annotated with a stated length",
      },
    ];
  }
  return results;
}

/**
 * An area a label claims: its magnitude, how finely it was written, and
 * whether it was written as an exact fraction rather than a decimal.
 *
 * `resolution` is the length check's own rule (half the last printed digit)
 * carried over unchanged; it is zero for a fraction, which claims to be exact
 * rather than rounded, so nothing beyond the polygon's own sampling error is
 * forgiven there.
 */
type StatedArea = { value: number; resolution: number; exact: boolean };

/**
 * The area a label states, or null when it states none.
 *
 * Same reading as `statedLength` (ADR 0028), plus the one shape an area is
 * routinely written in that a length never is: an exact fraction, "4/3" or
 * "8/3", read as the rational number it spells rather than rounded to a
 * decimal first. A leading name and an operator are stripped the same way --
 * "A = 4/3" and "d = 2,5 m" are one grammar -- and so is a bare leading
 * "≈", which a length label never needs because a length is never written
 * "≈ 50" in this project's fixtures but an area routinely is ("≈ 1,33" for
 * 4/3). A trailing "u.a." ("unidades de área") is accepted and ignored, the
 * same relief a length gives a trailing unit, but nothing is compared
 * against it: unlike a frame's `unit`, "u.a." names no physical quantity to
 * be wrong about. A degree sign or a percentage is `sweep-matches-its-label`'s
 * to read, exactly as in the length check, so it is refused here too.
 */
function statedArea(text: string): StatedArea | null {
  let t = text.trim().replaceAll("−", "-");
  const equals = t.lastIndexOf("=");
  if (equals >= 0) {
    t = t.slice(equals + 1).trim();
  } else {
    // No "=" -- strip a leading name and/or approx marker: "A ≈ 2,67" and
    // "≈ 1,33" both read as their number. A token that is purely a fraction
    // or a decimal never matches this prefix, so "8/3 u.a." is untouched.
    t = t.replace(/^[A-Za-zΑ-Ωα-ω]*[₀-₉]*\s*[≈~]?\s*/, "").trim();
  }

  const isRefusedUnit = (unit: string | null): boolean => unit !== null && /^(?:°|º|%)$/.test(unit);

  const fraction = /^(\d+)\s*\/\s*(\d+)\s*([^\s\d][^\s]*)?$/.exec(t);
  if (fraction !== null) {
    const den = Number(fraction[2]);
    if (den === 0 || isRefusedUnit(fraction[3] ?? null)) return null;
    return { value: Number(fraction[1]) / den, resolution: 0, exact: true };
  }

  const match = /^(\d[\d.]*(?:,\d+)?)\s*([^\s\d.,][^\s]*)?$/.exec(t);
  if (match === null) return null;
  const token = match[1]!;
  if (isRefusedUnit(match[2] ?? null)) return null;

  let value: number;
  let decimals: number;
  if (token.includes(",")) {
    const parsed = parseNumber(token, "pt-BR");
    if (parsed === null) return null;
    value = parsed;
    decimals = token.length - token.indexOf(",") - 1;
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(token)) {
    value = Number(token.replaceAll(".", ""));
    decimals = 0;
  } else if (/^\d+(?:\.\d+)?$/.test(token)) {
    value = Number(token);
    decimals = token.includes(".") ? token.length - token.indexOf(".") - 1 : 0;
  } else {
    return null;
  }
  if (!Number.isFinite(value)) return null;
  return { value: Math.abs(value), resolution: 0.5 * 10 ** -decimals, exact: false };
}

/** The shoelace sum, halved and made positive: this polygon's area in whatever space `points` is given in. */
function shoelaceArea(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** This polygon's perimeter, in whatever space `points` is given in. */
function perimeterOf(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return sum;
}

/**
 * This closed mark's area in the units its outline was stated in (ADR 0037).
 *
 * `resolveInFrame` maps frame units to canvas pixels by an anisotropic scale
 * (`xUnit`, `yUnit`) composed with a rotation. A rotation preserves area, and
 * the anisotropic scale multiplies it by `xUnit * yUnit` regardless of which
 * way the frame is turned -- unlike `lengthInUnits`, which has to decompose a
 * vector into along/across components because the two axes are scaled
 * differently, an AREA is one number and the rotation drops out of it
 * entirely. So converting back is one division, not a rotation.
 */
function areaInUnits(points: Point[], scale: MeasuredIn): number {
  return shoelaceArea(points) / (scale.xUnit * scale.yUnit);
}

/**
 * How far a printed area may sit from the polygon's own computed one and
 * still be the same claim, beyond what the label's own decimal resolution
 * already forgives.
 *
 * The polygon is not authored by hand the way a dimension line's two ends
 * are: `x²`'s area under a curve is drawn by sampling the curve, and every
 * sample is placed to within `FLAT_PX` of the true mathematical curve (the
 * same bound `function-graph`'s own curve sampler holds itself to, for the
 * same reason -- a quarter of an output pixel is where a reader's eye stops
 * noticing the difference). Perturbing every point of a closed polygon's
 * boundary by at most `ε` moves its enclosed area by at most `ε` times the
 * polygon's own perimeter: the symmetric difference between the true and the
 * perturbed region is contained in a strip of width `ε` running along the
 * boundary, and a strip of width `ε` and length `L` has area `ε·L`. That is
 * the whole derivation -- no curvature term is needed because the bound does
 * not assume the boundary is straight between samples, only that no sample is
 * farther than `ε` from where it should be. `EPSILON` (0.5px) is folded in
 * beside it: the half pixel every other check forgives is exactly the same
 * kind of positional slack, so a polygon whose vertices are honest to the
 * nearest half-pixel of rounding is not additionally penalised for it.
 *
 * The result is in PIXELS²; the caller divides by `xUnit * yUnit` to reach
 * the label's own units, exactly as `areaInUnits` does for the measurement
 * itself. For a region of bounded aspect ratio this bound is small relative
 * to the area it guards -- perimeter grows like the square root of area for
 * shapes that are not needle-thin, so the relative error `ε·P/A` shrinks as
 * the figure gets bigger, which is the "small relative error" this function
 * exists to make precise rather than assert.
 */
const AREA_SAMPLE_FLAT_PX = 0.125;

function areaSampleTolerance(points: Point[], scale: MeasuredIn): number {
  return ((AREA_SAMPLE_FLAT_PX + EPSILON) * perimeterOf(points)) / (scale.xUnit * scale.yUnit);
}

function fmtArea(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * Is every closed mark's area as its label prints? (ADR 0037)
 *
 * The area check's own version of the defect ADR 0028 closes for a straight
 * run: a shaded region -- "área sob a curva", a Riemann rectangle, a triangle
 * -- is one closed mark whose vertices are all stated in one frame, and its
 * printed area is a number typed independently of that polygon. Nothing
 * connects them unless something compares them.
 *
 * Shaped like `lengthMatchesItsLabel`: the label is found through
 * `annotates`, never by proximity, and this reports per mark rather than once
 * per figure, because one figure can hold a measured region and an
 * unmeasurable one. It departs from that check in one place: HERE, a label
 * that states no number is also `not-applicable` rather than silently
 * skipped, because an area label with no scale to check it against and an
 * area label with no number in it are the same kind of gap from a reader's
 * seat -- a claim this check cannot examine -- and the project's
 * not-applicable-never-pass rule (ADR 0019) says that gap is reported, never
 * passed over.
 */
function areaMatchesItsLabel(figure: LaidOutFigure, boxes: Map<string, PlacedBox>): Check[] {
  const id = "area-matches-its-label" as const;
  const texts = figure.elements.filter((element): element is PlacedText => element.kind === "text");
  const regions = new Map<string, PlacedMark>();
  for (const element of figure.elements) {
    if (element.kind === "mark" && element.closed && element.gridOf === undefined && element.place !== true) {
      regions.set(element.id, element);
    }
  }

  const results: Check[] = [];
  for (const [labelId, box] of boxes) {
    if (box.annotates === undefined) continue;
    const region = regions.get(box.annotates);
    if (region === undefined) continue;
    const text = texts.find((candidate) => candidate.ownerId === labelId);
    if (text === undefined) continue;
    const printed = text.lines.map((line) => line.text).join(" ");

    const notApplicable = (why: string): void => {
      results.push({
        id,
        target: region.id,
        status: "not-applicable",
        examined: 0,
        detail: `not applicable: ${labelId} (${truncate(printed)}) ${why}`,
      });
    };

    const stated = statedArea(printed);
    if (stated === null) {
      notApplicable(`states no area this check can read`);
      continue;
    }
    if (region.measuredIn === undefined) {
      notApplicable(
        `annotates ${region.id}, which was not stated in one frame (or its vertices sit in frames of ` +
          `different scale), so its area has no unit to be measured in`,
      );
      continue;
    }

    const scale = region.measuredIn;
    const drawn = areaInUnits(region.points, scale);
    const tolerance = (stated.exact ? 0 : stated.resolution) + areaSampleTolerance(region.points, scale);
    const unit = scale.unit ?? "units";
    if (Math.abs(drawn - stated.value) > tolerance) {
      results.push({
        id,
        target: region.id,
        status: "fail",
        examined: 1,
        ownerId: labelId,
        detail:
          `${labelId} says ${fmtArea(stated.value)} but ${region.id} encloses ${fmtArea(drawn)} ${unit}² ` +
          `in frame "${scale.frame}" (${fmt(scale.xUnit)}px per unit)`,
      });
    } else {
      results.push({
        id,
        target: region.id,
        status: "pass",
        examined: 1,
        detail: `${region.id} encloses ${fmtArea(drawn)} ${unit}², as ${labelId} states`,
      });
    }
  }

  if (results.length === 0) {
    return [
      {
        id,
        target: "figure",
        status: "not-applicable",
        examined: 0,
        detail: "not applicable: no closed region is annotated with a stated area",
      },
    ];
  }
  return results;
}

/**
 * Does every label that names a PLACE read as naming it? (ADR 0028)
 *
 * `annotation-nearest-its-owner` asks "is this label nearer what it names
 * than anything else", and for a place the question has no good answer: the
 * `0` at an origin is always nearer the two axes that MAKE the origin than
 * the point itself, and a legend's texts are always nearer each other than
 * their own swatches. Both failed the element rule while being correct, and
 * twice the fix was to delete the annotation -- which leaves a figure's
 * commonest labels claiming nothing. So a place is measured by its own rule:
 *
 *   - From the label's NEAR EDGE, not its centre: a wide legend text names
 *     the swatch its left edge sits against, and its centre is nowhere near
 *     it. `curve-label-nearest-its-curve` measures the same way for the same
 *     reason.
 *   - Beside means within the label's own size. A place has no extent, so
 *     nothing competes with it along the lines that meet there -- a `0` slid
 *     40px down the x axis is nearer nothing else, and would pass without
 *     this bound. Farther from its point than it is big, a label has stopped
 *     reading as beside it.
 *   - Anything that PASSES THROUGH the place does not compete. Those are the
 *     lines that make it a place: the axes at an origin, the swatch whose end
 *     a legend row names. Everything else does, and so do the OTHER places
 *     labels name -- which is what catches a legend row that has slid next
 *     to its neighbour's swatch.
 *   - Another label is not a competitor. A reader attributes a label to
 *     something drawn, never to a second label, and legend rows are always
 *     nearest each other.
 *
 * A place carries no ink, so a place label buys no relief from any collision
 * check. This is an obligation without a matching freedom, which is why it
 * can be measured more strictly than the element rule.
 */
/** The largest outline still read as a marker at a point rather than a region: a 24px dot or ring. */
const MARKER_EXTENT = 24;

function isMarkerSized(points: Point[]): boolean {
  const bounds = unionOf(points.map((point) => ({ x: point.x, y: point.y, width: 0, height: 0 })));
  return bounds.width <= MARKER_EXTENT && bounds.height <= MARKER_EXTENT;
}

function labelNearestItsPlace(figure: LaidOutFigure, boxes: Map<string, PlacedBox>): Check {
  const id = "label-nearest-its-place" as const;
  const places = placesOf(figure);
  const labels = [...boxes.values()].filter(
    (box) => box.annotates !== undefined && places.has(box.annotates),
  );
  if (labels.length === 0) {
    return {
      id,
      target: "figure",
      status: "not-applicable",
      examined: 0,
      detail: "not applicable: no block names a place",
    };
  }

  type Competitor = {
    id: string;
    /** Distance from a label's rect to this thing, 0 when they touch. */
    distance: (rect: Rect) => number;
    /** Does this thing pass through the point? Then it is what makes the place. */
    through: (point: Point) => boolean;
    encloses: (rect: Rect) => boolean;
  };
  const competitors: Competitor[] = [];
  for (const [boxId, box] of boxes) {
    if (box.gridOf !== undefined) continue;
    // A label is not what a label names -- whether it names an element, a
    // series, or (declared free-standing) nothing at all.
    if (box.annotates !== undefined || box.names !== undefined || box.freeStanding === true) continue;
    const drawn = cornersOf(localRect(box)).map((corner) =>
      box.rotation === undefined || box.rotationCenter === undefined
        ? corner
        : rotatePoint(corner, box.rotationCenter, box.rotation),
    );
    const outline = [...drawn, drawn[0]!];
    competitors.push({
      id: boxId,
      distance: (rect) => (overlapsBox(rect, box) ? 0 : distanceRectToPolyline(rect, outline)),
      through: (point) => distancePointToRect(inFramePoint(point, box), localRect(box)) <= EPSILON,
      encloses: (rect) => contains(localRect(box), inFrameOf(rect, box)),
    });
  }
  for (const element of figure.elements) {
    if (element.kind !== "connector" && element.kind !== "mark") continue;
    if (element.kind === "mark" && (element.gridOf !== undefined || element.place === true)) continue;
    const points = element.points;
    // A MARKER drawn at the place -- a dot, a small ring -- is the place made
    // visible, exactly as the lines that cross there are (ADR 0035). ADR 0031
    // refused `annotatesPlace` for a point's own label because its dot
    // competed: the dot's outline is always nearer the label than its centre
    // is. Only a closed mark CONTAINING the place and no larger than a marker
    // counts; a shaded region that merely contains the place still competes.
    const marker =
      element.kind === "mark" && element.closed && isMarkerSized(points)
        ? (point: Point) => inPolyline(points, point)
        : () => false;
    competitors.push({
      id: element.id,
      distance: (rect) => distanceRectToPolyline(rect, points),
      through: (point) => distancePointToPolyline(point, points) <= EPSILON || marker(point),
      encloses: () => false,
    });
  }
  for (const [placeId, at] of places) {
    competitors.push({
      id: placeId,
      distance: (rect) => distancePointToRect(at, rect),
      through: (point) => Math.hypot(point.x - at.x, point.y - at.y) <= EPSILON,
      encloses: () => false,
    });
  }

  const misread: string[] = [];
  for (const label of labels) {
    const placeId = label.annotates!;
    const place = places.get(placeId)!;
    const rect = checkRect(label);
    const toPlace = distancePointToRect(place, rect);
    const reach = Math.max(rect.width, rect.height);
    if (toPlace > reach + EPSILON) {
      misread.push(
        `${label.id} sits ${fmt(toPlace)}px from the place it names, farther than its own size (${fmt(reach)}px)`,
      );
      continue;
    }
    for (const competitor of competitors) {
      if (competitor.id === placeId) continue;
      if (competitor.through(place)) continue;
      if (competitor.encloses(rect)) continue;
      const distance = competitor.distance(rect);
      if (distance < toPlace - EPSILON) {
        misread.push(
          `${label.id} names a place ${fmt(toPlace)}px away but sits ${fmt(distance)}px from ${competitor.id}`,
        );
        break;
      }
    }
  }

  return misread.length === 0
    ? {
        id,
        target: "figure",
        status: "pass",
        examined: labels.length,
        detail: `every place label sits beside its place across ${labels.length} label(s)`,
      }
    : {
        id,
        target: "figure",
        status: "fail",
        examined: labels.length,
        detail: `${misread.length} place label(s) do not read as naming their place: ${misread.join("; ")}`,
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

/**
 * Is every number an axis promised actually printed at its tick?
 *
 * The promise is `GridAxis.require`, which leaves a zero-ink `Mark.tick` at
 * each value. The number counts as present when some text on the figure
 * reads as that value -- in either locale's spelling, "−1" or "0,5" or
 * "17/3" -- and sits within half a division of the tick ALONG the axis (so
 * it is nearer its own tick than the next) and within `reach` across it
 * (so a number that slid along its gridline still counts, and a stray "4"
 * in a label elsewhere does not).
 *
 * The defect this exists for: the Cálculo 1 sheet shipped a figure of
 * y = x + 4 without the 4 on the y axis. The placer had dropped it because
 * the line ran through its spot -- the one number the exercise was about.
 */
function axisNumberPresent(figure: LaidOutFigure): Check {
  const ticks = figure.elements.filter(
    (e): e is PlacedMark => e.kind === "mark" && e.tick !== undefined,
  );
  if (ticks.length === 0) {
    return {
      id: "axis-number-present",
      target: "figure",
      status: "not-applicable",
      examined: 0,
      detail: "not applicable: no axis declares a required number",
    };
  }
  const texts = figure.elements.filter((e): e is PlacedText => e.kind === "text");
  const missing: string[] = [];
  for (const mark of ticks) {
    const tick = mark.tick!;
    const at = mark.points[0]!;
    const found = texts.some((text) => {
      if (text.lines.length !== 1) return false;
      const line = text.lines[0]!;
      const value = parseNumber(line.text, "pt-BR") ?? parseNumber(line.text, "en");
      if (value === null || Math.abs(value - tick.value) > 1e-6 * Math.max(1, Math.abs(tick.value))) return false;
      const cx = line.box.x + line.box.width / 2;
      const cy = line.box.y + line.box.height / 2;
      const along = tick.axis === "x" ? Math.abs(cx - at.x) : Math.abs(cy - at.y);
      const across = tick.axis === "x" ? Math.abs(cy - at.y) : Math.abs(cx - at.x);
      return along <= tick.within + EPSILON && across <= tick.reach + EPSILON;
    });
    if (!found) missing.push(`${tick.axis} = ${tick.value}`);
  }
  return missing.length === 0
    ? {
        id: "axis-number-present",
        target: "figure",
        status: "pass",
        examined: ticks.length,
        detail: `all ${ticks.length} required axis number(s) are printed at their ticks`,
      }
    : {
        id: "axis-number-present",
        target: "figure",
        status: "fail",
        examined: ticks.length,
        detail: `${missing.length} required axis number(s) missing or away from their tick: ${missing.join(", ")}`,
      };
}

/** Every series a figure declares, with its marks. */
function seriesOf(figure: LaidOutFigure): Map<string, PlacedMark[]> {
  const series = new Map<string, PlacedMark[]>();
  for (const element of figure.elements) {
    if (element.kind !== "mark" || element.series === undefined) continue;
    if (!series.has(element.series)) series.set(element.series, []);
    series.get(element.series)!.push(element);
  }
  return series;
}

/**
 * Can a reader tell every series apart without seeing colour?
 *
 * Colour is the channel a photocopy, a projector and one boy in twelve do
 * not carry. The Cálculo 1 sheet's figure 2.5 drew a parabola and three
 * secants, all solid, told apart by colour alone -- and its legend, being
 * rows of coloured swatches, said the same thing again in the same channel.
 *
 * So a series passes when it has a DIRECT label on the drawing (a block that
 * `names` it) or a stroke pattern no other series shares. A legend row does
 * not count. Two series drawn solid, one of them unlabelled, fail.
 */
function seriesDistinguishableWithoutColour(
  figure: LaidOutFigure,
  boxes: Map<string, PlacedBox>,
): Check {
  const series = seriesOf(figure);
  if (series.size < 2) {
    return {
      id: "series-distinguishable-without-colour",
      target: "figure",
      status: "not-applicable",
      examined: series.size,
      detail: "not applicable: fewer than two series are declared",
    };
  }
  const labelled = new Set<string>();
  for (const box of boxes.values()) if (box.names !== undefined) labelled.add(box.names);
  const pattern = (marks: PlacedMark[]): string => [...new Set(marks.map((m) => m.lineStyle))].sort().join("+");
  const byPattern = new Map<string, string[]>();
  for (const [name, marks] of series) {
    const key = pattern(marks);
    if (!byPattern.has(key)) byPattern.set(key, []);
    byPattern.get(key)!.push(name);
  }
  const colourOnly: string[] = [];
  for (const [name, marks] of series) {
    if (labelled.has(name)) continue;
    const sharing = byPattern.get(pattern(marks))!.filter((other) => other !== name);
    if (sharing.length > 0) colourOnly.push(`${name} (${pattern(marks)}, like ${sharing.join(", ")})`);
  }
  return colourOnly.length === 0
    ? {
        id: "series-distinguishable-without-colour",
        target: "figure",
        status: "pass",
        examined: series.size,
        detail: `each of ${series.size} series has a direct label or a stroke pattern of its own`,
      }
    : {
        id: "series-distinguishable-without-colour",
        target: "figure",
        status: "fail",
        examined: series.size,
        detail:
          `${colourOnly.length} series told apart by colour alone: ${colourOnly.join("; ")}. ` +
          `Label each on the drawing (Block.names) or give it a stroke pattern of its own; a legend does not count.`,
      };
}

/** Distance from a rect to a polyline: 0 when they touch. */
function distanceRectToPolyline(rect: Rect, points: Point[]): number {
  let best = Infinity;
  const visit = (p: Point): void => {
    best = Math.min(best, distancePointToRect(p, rect));
  };
  if (points.length === 1) visit(points[0]!);
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
    for (let k = 0; k <= steps; k += 1) visit({ x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps });
  }
  return best;
}

/**
 * Is every curve label nearer its own curve than any other curve?
 *
 * A direct label is what makes `series-distinguishable-without-colour` pass,
 * so it has to be read as naming the curve it names. A reader attributes a
 * label to the curve it sits closest to: "y = 3x − 1" placed where the
 * parabola passes nearer than the line names the parabola, whatever colour
 * it is set in. Measured from the label's box, not its centre, because the
 * near edge of a wide label is what sits against a curve.
 */
function curveLabelNearestItsCurve(figure: LaidOutFigure, boxes: Map<string, PlacedBox>): Check {
  const named = [...boxes.values()].filter((box) => box.names !== undefined);
  if (named.length === 0) {
    return {
      id: "curve-label-nearest-its-curve",
      target: "figure",
      status: "not-applicable",
      examined: 0,
      detail: "not applicable: no label names a series",
    };
  }
  const series = seriesOf(figure);
  const distanceTo = (rect: Rect, name: string): number =>
    Math.min(...(series.get(name) ?? []).map((mark) => distanceRectToPolyline(rect, mark.points)));
  const misread: string[] = [];
  for (const label of named) {
    const rect = checkRect(label);
    const own = distanceTo(rect, label.names!);
    for (const other of series.keys()) {
      if (other === label.names) continue;
      const d = distanceTo(rect, other);
      if (d < own - EPSILON) {
        misread.push(`${label.id} names ${label.names} at ${fmt(own)}px but sits ${fmt(d)}px from ${other}`);
        break;
      }
    }
  }
  return misread.length === 0
    ? {
        id: "curve-label-nearest-its-curve",
        target: "figure",
        status: "pass",
        examined: named.length,
        detail: `every one of ${named.length} curve label(s) is nearest the curve it names`,
      }
    : {
        id: "curve-label-nearest-its-curve",
        target: "figure",
        status: "fail",
        examined: named.length,
        detail: `${misread.length} curve label(s) sit nearer another curve: ${misread.join("; ")}`,
      };
}

/**
 * Does every marker lie on what it claims to lie on?
 *
 * The one relation a function plot asserts about its own arithmetic: a root
 * is where the curve meets the x axis, an extremum is on its curve. The
 * arithmetic that found them is not trusted; the drawing is measured. A
 * marker's centre must be within 1.5px of every series or mark it names --
 * a root that is on its curve but off the axis, or on the axis but off the
 * curve, fails on the half it got wrong.
 */
function featureOnItsCurve(figure: LaidOutFigure): Check {
  const claiming = figure.elements.filter(
    (e): e is PlacedMark => e.kind === "mark" && e.on !== undefined && e.on.length > 0,
  );
  if (claiming.length === 0) {
    return {
      id: "feature-on-its-curve",
      target: "figure",
      status: "not-applicable",
      examined: 0,
      detail: "not applicable: no mark claims to lie on anything",
    };
  }
  const marks = figure.elements.filter((e): e is PlacedMark => e.kind === "mark");
  const broken: string[] = [];
  for (const feature of claiming) {
    const centre =
      feature.arcCentres.length > 0
        ? feature.arcCentres[0]!.centre
        : {
            x: feature.points.reduce((sum, p) => sum + p.x, 0) / feature.points.length,
            y: feature.points.reduce((sum, p) => sum + p.y, 0) / feature.points.length,
          };
    for (const name of feature.on!) {
      const targets = marks.filter((m) => m.id !== feature.id && (m.series === name || m.id === name));
      if (targets.length === 0) {
        broken.push(`${feature.id} claims to lie on ${name}, which nothing in the figure is`);
        continue;
      }
      const distance = Math.min(...targets.map((m) => distancePointToPolyline(centre, m.points)));
      if (distance > 1.5) broken.push(`${feature.id} does not lie on ${name} (${fmt(distance)}px away)`);
    }
  }
  return broken.length === 0
    ? {
        id: "feature-on-its-curve",
        target: "figure",
        status: "pass",
        examined: claiming.length,
        detail: `all ${claiming.length} marker(s) lie on what they claim`,
      }
    : {
        id: "feature-on-its-curve",
        target: "figure",
        status: "fail",
        examined: claiming.length,
        detail: `${broken.join("; ")}. The drawing refutes a relation the figure asserted about it.`,
      };
}
