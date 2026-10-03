/**
 * What every check asks, in one sentence, keyed by its id.
 *
 * A `Record<CheckId, ...>`, so a check added to the union without a line here
 * is a type error. The README's check table is generated from this
 * (scripts/gen-views.ts): it used to be typed by hand, and said "nineteen
 * checks" long after there were thirty-three.
 */

import type { CheckId } from "./checks.ts";

export type CheckFamily =
  /** Is the figure malformed: overflow, collision, clipping, contrast. */
  | "form"
  /** Does a label sit by, and say, what it names. */
  | "attribution"
  /** Does the figure agree with itself: a printed number against the ink drawn for it. */
  | "agreement"
  /** What a figure made to teach from owes its reader (ADR 0024). */
  | "didactic"
  /** Run over the interior of an animated transition (ADR 0012, 0017). */
  | "motion"
  /** Run on a figure module's foreign SVG (ADR 0005). */
  | "module";

export const CHECK_FAMILIES: Record<CheckFamily, string> = {
  form: "Is the figure malformed?",
  attribution: "Does every label sit by, and say, what it names?",
  agreement: "Does the figure agree with itself?",
  didactic: "What a figure made to teach from owes its reader",
  motion: "Animation: over the interior of each transition",
  module: "Figure modules: foreign SVG, measured by the core",
};

export const CHECK_CATALOGUE: Record<CheckId, { family: CheckFamily; asks: string }> = {
  "text-fits-box": { family: "form", asks: "Does every line of a label sit inside its block's content box?" },
  "label-within-shape": { family: "form", asks: "Does a label sit inside the shape actually drawn, not just its bounding rectangle?" },
  "text-clear-of-other-boxes": { family: "form", asks: "Does a label overlap a block that is not its own?" },
  "text-clear-of-ink": { family: "form", asks: "Does a label sit on a line, curve, arc or arrow it does not belong to?" },
  "backing-hides-no-ink": { family: "form", asks: "Does a label's paper backing erase ink that carries meaning?" },
  "boxes-do-not-overlap": { family: "form", asks: "Do two boxes partially overlap? (Nesting is fine; partial overlap never is.)" },
  "connector-clear-of-boxes": { family: "form", asks: "Does a connector pass through a box it does not join?" },
  "content-within-canvas": { family: "form", asks: "Is everything inside the canvas?" },
  "canvas-size-sane": { family: "form", asks: "Is the canvas a size a figure can be (not 400 000 px tall)?" },
  "effect-within-canvas": { family: "form", asks: "Does an effect's ink stay on the canvas?" },
  "contrast-sufficient": { family: "form", asks: "Does every label clear WCAG AA against whatever it actually sits on?" },
  "categorical-colours-distinguishable": { family: "form", asks: "Do the colours in a shared `categoryGroup` stay distinct under deuteranopia and protanopia?" },
  "tick-labels-do-not-collide": { family: "form", asks: "Do a scale's tick labels overlap each other?" },
  "constraints-satisfied": { family: "form", asks: "Does every declared layout constraint (align, distribute, keepClear, sameSize, anchor) hold as laid out?" },
  "declared-size-honoured": { family: "form", asks: "Was every block drawn at the size it asked for?" },
  "annotation-nearest-its-owner": { family: "attribution", asks: "Is every label nearer the element it names than any other?" },
  "label-nearest-its-place": { family: "attribution", asks: "Is a label that names a place (where two lines meet) near that place?" },
  "label-declares-what-it-names": { family: "attribution", asks: "Does every label say what it names, or declare itself free-standing?" },
  "sweep-matches-its-label": { family: "agreement", asks: "Does an angle mark or a pie slice sweep the angle or share its label prints?" },
  "length-matches-its-label": { family: "agreement", asks: "Is a dimension line or a scaled arrow as long as its printed length?" },
  "area-matches-its-label": { family: "agreement", asks: "Does a shaded region have the area its label prints?" },
  "arc-is-circular": { family: "agreement", asks: "Are both ends of every arc the same distance from its centre?" },
  "feature-on-its-curve": { family: "agreement", asks: "Does every marker lie on what it claims (a root on its curve and on the x axis)?" },
  "axis-number-present": { family: "didactic", asks: "Is every number an axis promised printed by its tick?" },
  "series-distinguishable-without-colour": { family: "didactic", asks: "Can every data series be told apart without colour? A legend does not count." },
  "curve-label-nearest-its-curve": { family: "didactic", asks: "Is every curve label nearer the curve it names than any other curve?" },
  "boxes-do-not-overlap-during-transition": { family: "motion", asks: "Do two boxes collide at any instant between two states?" },
  "connector-clear-of-boxes-during-transition": { family: "motion", asks: "Does a moving route sweep through a box it does not join?" },
  "module-ids-resolve": { family: "module", asks: "Does every id a module declares exist in what it drew?" },
  "module-geometry-agrees": { family: "module", asks: "Does each declared box match the geometry measured in the browser?" },
  "module-label-within-feature": { family: "module", asks: "Does a label sit inside the filled feature it names?" },
  "module-labels-do-not-collide": { family: "module", asks: "Do a module's labels overlap each other?" },
  "module-labels-clear-of-strokes": { family: "module", asks: "Does a label sit on a drawn stroke?" },
  "module-feature-on-its-stroke": { family: "module", asks: "Does a feature declared to lie on a stroke lie on it, by measurement?" },
  "module-contrast-sufficient": { family: "module", asks: "Does every module label clear WCAG AA against the surfaces under it?" },
};
