/**
 * The figure IR.
 *
 * This is the contract (decision 0002): everything crosses this boundary as
 * JSON. M0 keeps it deliberately small — a stack composes, a block draws.
 * Nothing here knows about SVG, the browser, or any renderer.
 */

import { EffectError, resolveEffects } from "../effects/types.ts";
import { STYLE_IDS, styleById } from "../effects/styles.ts";
import { TYPE_IDS, TYPE_LEVELS, typeById } from "../typography.ts";
import type { TypeLevel } from "../typography.ts";
import type { EffectRef, ResolvedEffect } from "../effects/types.ts";
import { SHAPE_KINDS } from "../geometry/shapes.ts";
import type { ShapeKind } from "../geometry/shapes.ts";
import type { Bleed } from "../effects/bleed.ts";
import type { Constraint } from "../constraints/types.ts";

export type FigureSpec = {
  version: 1;
  title?: string;
  canvas?: CanvasSpec;
  root: FigureNode;
  /**
   * Declarative spatial relationships (decision 0010's constraint vocabulary,
   * M10 step 31) that `constraints-satisfied` verifies against the laid-out
   * positions. Not to be confused with `canvas.constraints`, which *relaxes*
   * checks -- this *adds* one. Unset means no constraints are declared, and
   * the check reports not-applicable rather than a vacuous pass.
   */
  layoutConstraints?: Constraint[];
};

export type CanvasSpec = {
  /** Space between the outermost content and the canvas edge. */
  padding?: number;
  background?: string;
  /**
   * Edge darkening, 0 to 1. Drawn over the whole figure as a radial wash, so
   * unlike a per-element effect it costs no bleed and can never clip: it is
   * bounded by the canvas by construction.
   */
  vignette?: number;
  /** Named palette (decision 0007). Unset renders exactly as before: "dark". */
  theme?: "dark" | "light" | "print";
  /**
   * Named style pack: a whole look, applied by role, instead of writing
   * `effect` on every element by hand. See src/effects/styles.ts. It only ever
   * fills in what an element did not declare, and buys no exemption from the
   * effect checks. Unset renders exactly as before packs existed.
   */
  style?: string;
  /**
   * Named type pack: family, size, weight and tracking per `level`. Fills only
   * what an element did not declare. See src/typography.ts.
   */
  type?: string;
  /**
   * Structural constraints that may be relaxed for this figure (decision 0010).
   * Every toggle defaults to false, so a spec that says nothing is checked
   * exactly as it was before these existed.
   */
  constraints?: ConstraintToggles;
};

/**
 * Opt-in relaxations of the three constraints that block whole diagram genres
 * without earning their keep as simplifying principles (decision 0010).
 *
 * These are per-figure and they only ever *widen* what is allowed. A toggle
 * left unset is the constraint enforced, so the default behaviour is the
 * constrained one: a reader of a manifest never has to wonder whether a check
 * passed because the figure was sound or because it was excused.
 */
export type ConstraintToggles = {
  /** Lets boxes partially overlap; `boxes-do-not-overlap` stands down. */
  allowOverlap?: boolean;
  /** Lets a connector cross boxes it does not join; `connector-clear-of-boxes` stands down. */
  allowConnectorCrossing?: boolean;
  /** Lets a connector carry a `curve`. Without it, a curved connector is refused. */
  allowCurvedConnectors?: boolean;
};

/** Runtime mirror, so validation and the generated reference read one list. */
export const CONSTRAINT_TOGGLES: readonly (keyof ConstraintToggles)[] = [
  "allowOverlap",
  "allowConnectorCrossing",
  "allowCurvedConnectors",
];

/** Every toggle resolved to a definite boolean. Unset means the constraint holds. */
export function resolveConstraints(canvas: CanvasSpec | undefined): Required<ConstraintToggles> {
  const declared = canvas?.constraints;
  return {
    allowOverlap: declared?.allowOverlap === true,
    allowConnectorCrossing: declared?.allowConnectorCrossing === true,
    allowCurvedConnectors: declared?.allowCurvedConnectors === true,
  };
}

/**
 * When, within a transition, this element does its moving (ADR 0015).
 *
 * Both ends are fractions of the whole transition, so `{ start: 0.2, end: 0.7 }`
 * means "hold at the first state until a fifth of the way through, travel, then
 * hold at the second state". Absent means the whole transition, which is what
 * every element did before staggering existed.
 *
 * This is NOT an `animation-delay`. The emitted CSS keeps every element on one
 * clock of one duration and encodes the window as keyframe stops, because the
 * proof that easing costs the motion check nothing depends on every element
 * sharing a single reparametrisation of time. A delay would break that; a
 * keyframe stop does not.
 */
export type MotionWindow = { start: number; end: number };

export type FigureNode = Stack | Block | Scene;

/**
 * A scene places its children by coordinate rather than by flow, and may join
 * them with connectors. Two ways to get those coordinates:
 *
 *   "absolute" — the author gives x/y. This is what an annotated figure needs:
 *                a shape, and callouts pinned to specific points on it.
 *   "graph"    — ELK decides. We measure the children first, hand ELK their
 *                real sizes, and take back positions and edge routes. That is
 *                decision 0001's "delegate the skeleton, own what is layered
 *                on top" made concrete: ELK owns node placement, we still own
 *                text measurement, repair, and everything drawn over it.
 */
export type Scene = {
  type: "scene";
  id?: string;
  layout: "absolute" | "graph";
  /** Only for "absolute"; a graph scene is sized by ELK. */
  width?: number;
  height?: number;
  children: Block[];
  connectors?: Connector[];
  graph?: GraphOptions;
};

export type GraphOptions = {
  /** ELK algorithm. "layered" for flows, "mrtree" for trees, "radial" for mindmaps. */
  algorithm?: "layered" | "mrtree" | "radial" | "force";
  direction?: "RIGHT" | "LEFT" | "DOWN" | "UP";
  /** Space between adjacent nodes. */
  spacing?: number;
  /** Space between layers/ranks. */
  layerSpacing?: number;
  /**
   * Wrap a long chain onto several rows instead of one very wide rank
   * sequence. "multi-edge" is ELK's general strategy and the one to reach for;
   * "single-edge" only wraps where a single edge spans the cut. Layered only.
   */
  wrapping?: "off" | "single-edge" | "multi-edge";
  /**
   * Target width-to-height ratio, honoured only when `wrapping` is on -- it is
   * what tells ELK where to cut. 1 asks for a square.
   */
  aspectRatio?: number;
};

export type Point = { x: number; y: number };

/**
 * The arrowhead shape drawn at every end `arrow` selects. "closed" (the
 * original, only shape) is the default -- unset behaves exactly as it always
 * has. Every shape is drawn as an explicit filled/stroked path, the same
 * portability reasoning render/svg.ts already gives for not using `<marker>`.
 */
export type ArrowStyle = "closed" | "open" | "diamond" | "circle" | "crowsfoot" | "half";

/** Runtime mirror of `ArrowStyle`, so validation and the generated reference read one list, not two. */
export const ARROW_STYLES: readonly ArrowStyle[] = ["closed", "open", "diamond", "circle", "crowsfoot", "half"];

/**
 * The stroke pattern. "solid" and "dashed" are what the old boolean `dashed`
 * meant; `lineStyle` supersedes it when both are given, and is a superset —
 * `dashed: true` and `lineStyle: "dashed"` draw byte-identically.
 *
 * "double", "ridge" and "groove" are structural rather than a dash pattern:
 * they subdivide the same stroke-width inset every line style already draws
 * inside (see render/svg.ts's `boxToSvg`), so they cost no extra bleed — the
 * outermost ink still lands exactly on the box edge the checks measure.
 */
export type LineStyle = "solid" | "dashed" | "dotted" | "dashdot" | "double" | "ridge" | "groove";

/** Runtime mirror of `LineStyle`, so validation and the generated reference read one list, not two. */
export const LINE_STYLES: readonly LineStyle[] = [
  "solid",
  "dashed",
  "dotted",
  "dashdot",
  "double",
  "ridge",
  "groove",
];

/**
 * A stop in a gradient's colour ramp. `offset` is 0 (the gradient's start) to
 * 1 (its end); stops need not be sorted, since a renderer sorts by offset.
 */
export type GradientStop = { offset: number; color: string; opacity?: number };

/**
 * A fill or stroke that varies over the shape's own area, rather than one flat
 * colour. Pure paint: it changes which pixels a shape's own outline is filled
 * with and nothing else, so unlike an Effect it costs no bleed and needs no
 * check — the geometry a gradient-filled block occupies is identical to the
 * geometry the same block would occupy filled with any one of its own stops.
 *
 * "linear" runs along `angle` degrees across the shape's own bounding box,
 * read as a COMPASS BEARING measured clockwise from "up": 0 runs
 * bottom-to-top, 90 left-to-right, 180 top-to-bottom, 270 right-to-left.
 * Default 90. "radial" is centred on the shape and reaches its edge.
 *
 * Bearings rather than the mathematical convention (counterclockwise from
 * "right") because the y axis points DOWN in SVG, so the mathematical reading
 * would invert on the screen and every angle in a spec would mean its own
 * mirror image. A bearing means the same thing here as it does on a map.
 *
 * The stops are in the box's OWN frame, so a gradient on a rotated block
 * (`rotateBox`) turns with it: one definition at angle 90 is "along this
 * shape's long axis" whatever direction the shape ends up facing.
 */
export type Gradient =
  | { kind: "linear"; angle?: number; stops: GradientStop[] }
  | { kind: "radial"; stops: GradientStop[] };

/** A flat colour, or a gradient computed over the shape's own area. */
export type Paint = string | Gradient;

/**
 * Per-side border override. Unset sides fall back to the block's own
 * `stroke`/`strokeWidth`/`lineStyle`; a side with `width: 0` draws nothing on
 * that edge. Independent per-side widths cannot reuse the single
 * inset-rect-plus-stroke-width geometry every other border style shares — see
 * render/svg.ts's `borderPathToSvg` — so this is deliberately a separate,
 * larger code path from `lineStyle` rather than a variant of it.
 */
export type BorderSide = { width?: number; color?: string; style?: LineStyle };

export type PerSideBorder = {
  top?: BorderSide;
  right?: BorderSide;
  bottom?: BorderSide;
  left?: BorderSide;
};

/**
 * How a connector bends (decision 0010). Requires `canvas.constraints.allowCurvedConnectors`.
 *
 *   "arc"    bows the route perpendicular to its chord by `bulge`, a signed
 *            fraction of the chord's length. Derived from the endpoints, so it
 *            works even though routing decides where those endpoints land.
 *   "bezier" takes explicit control points, for an absolute scene where the
 *            author already owns the coordinates.
 *   "spline" rounds the corners of a multi-segment route and leaves its
 *            straight runs straight, which is what a graph edge from ELK needs.
 *
 * `bulge` rather than the radius/sweep pair an SVG arc takes: a radius smaller
 * than half the chord describes no arc at all, and there is no good answer to
 * give when routing later moves the endpoints past it. A fraction of the chord
 * cannot be over-specified into an impossible curve.
 *
 * A spline's `radius` is in px rather than a fraction, because it is a corner
 * fillet and not a property of the route: a dense graph wants the same small
 * rounding on every corner whatever the run lengths are. It is a request, not
 * a promise — each fillet is clamped to half of its adjacent runs, so asking
 * for more than a short segment can hold rounds that corner as far as it goes
 * rather than overrunning the next one.
 */
export type ConnectorCurve =
  | { kind: "arc"; bulge?: number }
  | { kind: "bezier"; control: Point[] }
  | { kind: "spline"; radius?: number };

/** Runtime mirror of `ConnectorCurve`'s tags, so validation reads one list. */
export const CURVE_KINDS: readonly ConnectorCurve["kind"][] = ["arc", "bezier", "spline"];

export type Connector = {
  id?: string;
  /**
   * Block id the connector leaves from, or a bare point.
   *
   * A point origin is what a vector needs. Several forces acting at one place
   * have to LEAVE one place: routed from a block they each start on that
   * block's own boundary, at three different spots, and a free-body diagram
   * whose forces do not share an application point is not a free-body
   * diagram. Both ends may be points, which is a free vector -- it joins no
   * box, so it earns no exemption from `connector-clear-of-boxes` and a
   * figure that wants one crossing a shape must say so.
   */
  from: string | Point;
  /** Block id it arrives at, or a bare point — a callout needs to aim at a place. */
  to: string | Point;
  arrow?: "none" | "end" | "both";
  /** The shape drawn at each end `arrow` selects. Default "closed". */
  arrowStyle?: ArrowStyle;
  dashed?: boolean;
  /** Supersedes `dashed` when set. Default "solid", or "dashed" if `dashed` is true. */
  lineStyle?: LineStyle;
  stroke?: string;
  strokeWidth?: number;
  /** Bend this connector. Refused unless `allowCurvedConnectors` is on. */
  curve?: ConnectorCurve;
  /** Visual effects, by design-system name or literal. See effects/types.ts. */
  effect?: EffectRef | EffectRef[];
};

export type Align = "start" | "center" | "end";

export type Stack = {
  type: "stack";
  id?: string;
  direction: "row" | "column";
  /** Space between children. */
  gap?: number;
  /** Cross-axis alignment. "stretch" makes children fill the cross axis. */
  align?: Align | "stretch";
  children: FigureNode[];
};

export type Block = {
  type: "block";
  id?: string;
  label?: string;
  /**
   * Total width, border included. Text wraps to it.
   *
   * Honoured exactly, with ONE unsatisfiable case: the box is laid out
   * `box-sizing: border-box`, so a width smaller than this block's own
   * padding plus border cannot be drawn at all, and CSS resolves it by
   * growing the box. Honouring the width there would mean silently violating
   * the padding instead — there is no size that satisfies both. When it
   * happens the figure is still well-formed, so no other check notices;
   * `declared-size-honoured` is what reports it.
   */
  width?: number;
  maxWidth?: number;
  minWidth?: number;
  /**
   * Total height. Real schematics need shapes that keep their size, and a
   * fixed height is the first way a label can overflow downward — which is
   * precisely what the repair loop exists to fix.
   *
   * Subject to the same padding-and-border floor as `width`, and reported the
   * same way.
   */
  height?: number;
  /**
   * How a label may be broken.
   *
   * "normal" (the default) breaks between words and never inside one, so an
   * unbreakable run overflows SIDEWAYS — the second way a label can overflow,
   * and the one the repair loop can actually act on by growing the width.
   *
   * "none" forbids wrapping altogether. Needed for labels that must not be
   * broken at all (identifiers, axis ticks, short codes).
   *
   * "anywhere" permits a break inside a word, for a genuinely long
   * unbreakable run — a URL, a hash, a chemical name — where growing the box
   * to hold it whole would blow out the layout instead. It is opt-in
   * precisely because it used to be the unconditional default: applied to
   * every label it turned "30°" into "3" / "0" / "°" the moment that label
   * missed its box by two pixels, and left the repair loop no horizontal
   * overflow to respond to.
   */
  wrap?: "normal" | "none" | "anywhere";
  padding?: number;
  /** Horizontal alignment of the label inside the block. */
  textAlign?: Align;
  /**
   * Vertical placement of the label within the block's content box.
   *
   * Unset means "start", which is where flow layout puts a label anyway, so
   * an unset block is emitted and measured exactly as it was before this
   * existed. It only means anything when the block has a fixed `height`:
   * without one the box hugs its text and all three values coincide.
   *
   * This is not CSS `vertical-align`, which aligns inline boxes against a
   * baseline. It moves the whole label down its box.
   */
  verticalAlign?: Align;
  /** A flat colour or a gradient (Paint). Mirror measurement uses a solid stand-in; the gradient itself is resolved only at SVG emission — the same "measure with it off" rule effects follow. */
  fill?: Paint;
  stroke?: Paint;
  strokeWidth?: number;
  /** Supersedes `dashed` when set on Block. Default "solid". */
  lineStyle?: LineStyle;
  /** Independent width/colour/style per edge. Unset sides fall back to `stroke`/`strokeWidth`/`lineStyle`. */
  border?: PerSideBorder;
  radius?: number;
  fontSize?: number;
  /** Font family. Default "Inter, system-ui, sans-serif". */
  fontFamily?: string;
  /** Font weight. Default 400 (normal). Common values: 400, 600, 700. */
  fontWeight?: number;
  /**
   * Tracking in px. Negative tightens, which is what display sizes want.
   * Applied in the HTML mirror as well as the SVG, so the width Chromium
   * measures is the width that gets drawn.
   */
  letterSpacing?: number;
  /**
   * How LOUD this text is, independent of what it MEANS (`role`). A type pack
   * turns it into family, size, weight and tracking. Undeclared means "body".
   * See src/typography.ts for why this is a separate axis from `role`.
   */
  level?: TypeLevel;
  textColor?: string;
  /** Position within an "absolute" scene. Ignored elsewhere. */
  x?: number;
  y?: number;
  /** Semantic role; the design system maps it to a colour. */
  role?: BlockRole;
  /**
   * Marks this block's `fill` as one entry in a set of colours meant to be
   * told apart at a glance -- a chart series, a legend swatch. Blocks sharing
   * a non-empty `categoryGroup` are checked pairwise for colourblind
   * distinguishability (decision 0007); blocks without one are never
   * compared, so an incidental colour choice is never mistaken for a claim
   * that it needs to differ from anything.
   */
  categoryGroup?: string;
  /**
   * The id of the element this block NAMES, rather than one it sits beside.
   *
   * A label on a figure has always had to be a Block, and a Block collides
   * with everything: writing "N" beside a force arrow failed
   * text-clear-of-other-boxes and boxes-do-not-overlap against the very thing
   * it was labelling. Every figure in the physics and maths repertoire does
   * this, so those checks were firing on well-formed work.
   *
   * Declaring an owner buys exactly one relief -- an annotation may overlap
   * the element it names, and nothing else -- and costs a new obligation in
   * exchange: `annotation-nearest-its-owner` refuses a label that has drifted
   * closer to some other element than to the one it claims to name, because a
   * reader attributes a label to whatever it is nearest.
   *
   * Must name a sibling in the same scene, refused at parse time exactly like
   * a connector's endpoints.
   */
  annotates?: string;
  /**
   * The shape drawn in this block's bounding box. Default "rect", unchanged
   * from every figure rendered before this existed. Every shape shares the
   * block's own axis-aligned bounding box exactly -- the browser lays out a
   * plain rectangular div regardless of shape, so text-fits-box,
   * boxes-do-not-overlap and every other box-based check keep meaning
   * exactly what they meant before. See geometry/shapes.ts and the
   * `label-within-shape` check, which is the one thing a bounding box cannot
   * answer for a non-rectangle: whether a label actually sits inside the
   * shape drawn there, not just inside the box around it.
   */
  shape?: ShapeKind;
  /**
   * Degrees, clockwise, applied to this block's LABEL only -- never the box.
   * The mirror measures the label unrotated (the effects layer's own move:
   * measure with it off, apply at emission); geometry/rotate.ts then derives
   * the true oriented bounding box for every wrapped line as exact arithmetic
   * from those unrotated metrics plus this angle, and render/svg.ts emits the
   * unrotated glyphs under an SVG `rotate()` transform around that same
   * centre, so the box every check reasons about is the box that is actually
   * drawn. Default 0 -- unset behaves exactly as it always has.
   */
  rotation?: number;
  /**
   * When true, `rotation` also turns the box/shape itself (and its label
   * rotates around the box's own centre rather than the label's), not just
   * the label. Default false, which is exactly today's label-only behaviour.
   *
   * This is the box-geometry extension of the same "measure with it off,
   * apply at emission" move `rotation` already makes for labels
   * (geometry/rotate.ts): the mirror never rotates anything, and every check
   * that reasons about this box's position reads the exact axis-aligned
   * bounding box of the rotated shape (`PlacedBox.bounds`), computed as exact
   * corner-rotation arithmetic rather than approximated — so a rotated block
   * cannot silently overlap a neighbour or cross a connector a check had just
   * cleared. See geometry/rotate.ts's `attachBoxRotation`.
   */
  rotateBox?: boolean;
  /**
   * When this block moves within a transition; see MotionWindow. Read from the
   * state being animated TO, since it describes arrival. Has no effect on a
   * static render, and is deliberately not a visual property: a block whose
   * window differs between states is still `moved`, never `restyled`, so it
   * still tweens.
   */
  motion?: MotionWindow;
  /**
   * Visual effects, by design-system name (`"raised-2"`, `"recede"`) or as
   * literal effect objects. Purely visual: an effect never changes where this
   * block sits or how big it is. See effects/types.ts.
   */
  effect?: EffectRef | EffectRef[];
};

export type BlockRole = "default" | "primary" | "accent" | "warning" | "muted" | "callout";

// ---------------------------------------------------------------------------
// Laid-out form: the IR after the browser has told us where everything sits.
// Every coordinate is absolute, in SVG user units, origin at the canvas corner.
// ---------------------------------------------------------------------------

export type LaidOutFigure = {
  width: number;
  height: number;
  background: string;
  elements: PlacedElement[];
  /** Edge darkening over the whole canvas, 0 to 1. */
  vignette?: number;
  /**
   * Carried from `canvas.constraints` so the checks can see which of them the
   * figure asked to stand down. Absent means every constraint is enforced,
   * which is what a figure built by hand in a test gets.
   */
  constraints?: ConstraintToggles;
  /** Carried from `spec.layoutConstraints`; see there. */
  layoutConstraints?: Constraint[];
};

export type PlacedElement = PlacedBox | PlacedText | PlacedConnector;

export type PlacedConnector = {
  kind: "connector";
  id: string;
  /** Null when the connector leaves from a bare point rather than a block. */
  fromId: string | null;
  /** Null when the connector aims at a bare point rather than a block. */
  toId: string | null;
  /**
   * Absolute route, already clipped to the boxes it joins.
   *
   * A curved connector is FLATTENED into this polyline at layout time and the
   * renderer emits these same coordinates. That is deliberate: every check
   * that reasons about a connector reads `points`, so emitting a real bezier
   * while checking its chord would let a curve bow through a box that
   * `connector-clear-of-boxes` had just cleared. What is checked is exactly
   * what is drawn, at the cost of a longer `d` attribute.
   */
  points: Point[];
  /** The curve this route was flattened from, if any. Provenance, not geometry. */
  curve?: ConnectorCurve;
  arrow: "none" | "end" | "both";
  arrowStyle: ArrowStyle;
  dashed: boolean;
  lineStyle: LineStyle;
  stroke: string;
  strokeWidth: number;
  effects?: ResolvedEffect[];
  /** How far this element's effects put ink past its own bounds. */
  bleed?: Bleed;
};

export type PlacedBox = {
  kind: "box";
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Solid fallback colour: what a gradient fill approximates for contrast/module checks that need one real colour. The gradient itself, if any, is `fillPaint`. */
  fill: string;
  stroke: string;
  strokeWidth: number;
  lineStyle?: LineStyle;
  /** Independent per-side border, carried straight from Block.border. */
  border?: PerSideBorder;
  radius: number;
  /** Content box: the area a label is allowed to occupy. */
  content: Rect;
  effects?: ResolvedEffect[];
  /** How far this element's effects put ink past its own bounds. */
  bleed?: Bleed;
  /** Carried straight from the spec's Block.categoryGroup; see there. */
  categoryGroup?: string;
  /** Carried straight from the spec's Block.annotates; see there. */
  annotates?: string;
  /** Carried straight from the spec's Block.motion; see there. Absent means the whole transition. */
  motion?: MotionWindow;
  /** Carried straight from the spec's Block.shape. Default "rect" when unset. */
  shape?: ShapeKind;
  /**
   * The size the block ASKED FOR, carried from the spec that was actually
   * drawn -- so a repaired block declares its repaired size, not its original
   * one. Only the axes the author fixed appear; an auto-sized axis is absent
   * and claims nothing.
   *
   * This exists so `declared-size-honoured` can compare a request against the
   * measurement, which is the one relationship no other core check covers. It
   * is deliberately NOT called `declaredBox`, the module protocol's name for
   * the superficially similar field: a module's declared box is a CLAIM by a
   * foreign process about what it already drew, and this is an INSTRUCTION
   * from the author about what to draw. Compared the same way, earned
   * differently.
   */
  declared?: { width?: number; height?: number };
  /**
   * Where the label actually sits in this box, read back from computed style
   * rather than copied from the spec — so the repair loop reasons about what
   * the browser applied, not what we asked for. See Block.verticalAlign.
   */
  verticalAlign?: Align;
  /** A gradient fill/stroke, resolved at SVG emission only. See Block.fill. */
  fillPaint?: Gradient;
  strokePaint?: Gradient;
  /** Carried straight from Block.rotation, but only when Block.rotateBox is true. Degrees, clockwise. */
  rotation?: number;
  /** The point the box was rotated around -- the box's own (unrotated) centre. Present iff `rotation` is. */
  rotationCenter?: Point;
  /**
   * The exact axis-aligned bounding box of this box after rotation, in world
   * (canvas) space. Present iff `rotation` is. Every check that reasons about
   * where this box sits reads this instead of x/y/width/height directly — see
   * checks.ts's `checkRect` — so the box every check reasons about is the box
   * that is actually drawn, the same guarantee Block.rotation already gives a
   * rotated label.
   */
  bounds?: Rect;
};

export type PlacedText = {
  kind: "text";
  id: string;
  /** The box this text labels, if any. */
  ownerId: string | null;
  lines: TextLine[];
  fontFamily: string;
  fontSize: number;
  fontWeight?: number;
  /** Tracking in px, carried from Block.letterSpacing. */
  letterSpacing?: number;
  fill: string;
  anchor: Align;
  effects?: ResolvedEffect[];
  /** How far this element's effects put ink past its own bounds. */
  bleed?: Bleed;
  /** Carried straight from the spec's Block.rotation; see there. Degrees, clockwise. */
  rotation?: number;
  /** The point every line was rotated around -- the centre of the unrotated label. Present iff `rotation` is. */
  rotationCenter?: Point;
};

export type TextLine = {
  text: string;
  /** Anchor point x — meaning depends on the parent's `anchor`. */
  x: number;
  /** Baseline y. Never a box top: SVG text is positioned on its baseline. */
  y: number;
  /** Ink/advance extents of this line, for overflow checking. */
  box: Rect;
  /**
   * `box` before rotation was applied, present iff the OWNING BOX also
   * rotates (Block.rotateBox). Text-fits-box uses this instead of `box` in
   * that one case: when box and label rotate rigidly together by the same
   * angle around the same centre, whether the label fits its box is exactly
   * the question "did it fit before either rotated" — the rotated *world*
   * bounding box is what text-clear-of-other-boxes needs (checking this label
   * against boxes that have not moved), but comparing it to a content rect
   * that rotated along with it would be a stricter, wrong question.
   */
  localBox?: Rect;
  /** True when a fallback font rendered this line, making the baseline approximate. */
  baselineUncertain: boolean;
};

export type Rect = { x: number; y: number; width: number; height: number };

// ---------------------------------------------------------------------------
// Spec validation. Small and hand-rolled: the IR is the contract, so its
// error messages are part of the product and shouldn't come from a library.
// ---------------------------------------------------------------------------

export class SpecError extends Error {}

export function parseSpec(input: unknown): FigureSpec {
  if (typeof input !== "object" || input === null) {
    throw new SpecError("spec must be an object");
  }
  const spec = input as Record<string, unknown>;
  if (spec.version !== 1) {
    throw new SpecError(`spec.version must be 1, got ${JSON.stringify(spec.version)}`);
  }
  if (spec.root === undefined) throw new SpecError("spec.root is required");
  if (spec.canvas !== undefined) validateCanvas(spec.canvas, "canvas");
  const style = (spec.canvas as CanvasSpec | undefined)?.style;
  if (style !== undefined && styleById(style) === undefined) {
    throw new SpecError(
      `canvas.style must be one of ${STYLE_IDS.join(", ")}, got ${JSON.stringify(style)}`,
    );
  }
  const typePack = (spec.canvas as CanvasSpec | undefined)?.type;
  if (typePack !== undefined && typeById(typePack) === undefined) {
    throw new SpecError(
      `canvas.type must be one of ${TYPE_IDS.join(", ")}, got ${JSON.stringify(typePack)}`,
    );
  }
  if (spec.layoutConstraints !== undefined) {
    validateLayoutConstraints(spec.layoutConstraints, "layoutConstraints");
  }
  // Whether a curve is legal depends on the canvas, so the toggles are
  // resolved once here and carried down rather than looked up per node.
  validateNode(spec.root, "root", resolveConstraints(spec.canvas as CanvasSpec | undefined));
  return spec as FigureSpec;
}

const CONSTRAINT_KINDS = ["align", "distribute", "keepClear", "sameSize", "anchor"] as const;

/**
 * Shape-level validation only: right `kind`, right field types. Whether the
 * named element ids actually exist is a question for the check, not the
 * parser -- same division `validateEffect` draws for effect names.
 */
function validateLayoutConstraints(input: unknown, path: string): void {
  if (!Array.isArray(input)) throw new SpecError(`${path} must be an array`);
  input.forEach((entry, i) => validateConstraint(entry, `${path}[${i}]`));
}

function validateConstraint(input: unknown, path: string): void {
  if (typeof input !== "object" || input === null) {
    throw new SpecError(`${path} must be an object`);
  }
  const c = input as Record<string, unknown>;
  if (!(CONSTRAINT_KINDS as readonly unknown[]).includes(c.kind)) {
    throw new SpecError(`${path}.kind must be one of ${CONSTRAINT_KINDS.join(", ")}, got ${JSON.stringify(c.kind)}`);
  }
  const stringArray = (value: unknown, field: string): void => {
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
      throw new SpecError(`${path}.${field} must be an array of element ids`);
    }
  };
  const requireString = (value: unknown, field: string): void => {
    if (typeof value !== "string") throw new SpecError(`${path}.${field} must be a string, got ${JSON.stringify(value)}`);
  };
  const requireNumber = (value: unknown, field: string): void => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new SpecError(`${path}.${field} must be a finite number, got ${JSON.stringify(value)}`);
    }
  };
  switch (c.kind) {
    case "align":
      stringArray(c.elements, "elements");
      if (!["left", "right", "top", "bottom", "center-x", "center-y"].includes(c.axis as string)) {
        throw new SpecError(`${path}.axis must be a valid alignment axis, got ${JSON.stringify(c.axis)}`);
      }
      break;
    case "distribute":
      stringArray(c.elements, "elements");
      if (c.axis !== "horizontal" && c.axis !== "vertical") {
        throw new SpecError(`${path}.axis must be "horizontal" or "vertical", got ${JSON.stringify(c.axis)}`);
      }
      if (c.spacing !== undefined) requireNumber(c.spacing, "spacing");
      break;
    case "keepClear":
      requireString(c.element1, "element1");
      requireString(c.element2, "element2");
      requireNumber(c.minDistance, "minDistance");
      break;
    case "sameSize":
      stringArray(c.elements, "elements");
      if (!["width", "height", "both"].includes(c.dimension as string)) {
        throw new SpecError(`${path}.dimension must be "width", "height" or "both", got ${JSON.stringify(c.dimension)}`);
      }
      break;
    case "anchor":
      requireString(c.element, "element");
      if (c.position === undefined && c.relativeTo === undefined) {
        throw new SpecError(`${path} needs either position or relativeTo`);
      }
      if (c.position !== undefined) {
        const p = c.position as Record<string, unknown>;
        requireNumber(p?.x, "position.x");
        requireNumber(p?.y, "position.y");
      }
      if (c.relativeTo !== undefined) {
        const r = c.relativeTo as Record<string, unknown>;
        requireString(r?.target, "relativeTo.target");
        if (!["above", "below", "left", "right"].includes(r?.relation as string)) {
          throw new SpecError(`${path}.relativeTo.relation must be above/below/left/right, got ${JSON.stringify(r?.relation)}`);
        }
        requireNumber(r?.offset, "relativeTo.offset");
      }
      break;
  }
}

function validateCanvas(input: unknown, path: string): void {
  if (typeof input !== "object" || input === null) {
    throw new SpecError(`${path} must be an object`);
  }
  const canvas = input as Record<string, unknown>;
  if (canvas.vignette !== undefined) {
    const value = canvas.vignette;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new SpecError(`${path}.vignette must be between 0 and 1, got ${JSON.stringify(value)}`);
    }
  }
  if (canvas.theme !== undefined) {
    if (canvas.theme !== "dark" && canvas.theme !== "light" && canvas.theme !== "print") {
      throw new SpecError(
        `${path}.theme must be "dark", "light" or "print", got ${JSON.stringify(canvas.theme)}`,
      );
    }
  }
  if (canvas.constraints !== undefined) {
    if (typeof canvas.constraints !== "object" || canvas.constraints === null) {
      throw new SpecError(`${path}.constraints must be an object`);
    }
    const toggles = canvas.constraints as Record<string, unknown>;
    for (const [name, value] of Object.entries(toggles)) {
      // An unknown key is refused rather than ignored: a misspelled toggle
      // would silently leave the constraint on, and the figure would fail a
      // check the author believed they had turned off.
      if (!(CONSTRAINT_TOGGLES as readonly string[]).includes(name)) {
        throw new SpecError(
          `${path}.constraints has unknown toggle "${name}"; known toggles are ${CONSTRAINT_TOGGLES.join(", ")}`,
        );
      }
      if (typeof value !== "boolean") {
        throw new SpecError(
          `${path}.constraints.${name} must be a boolean, got ${JSON.stringify(value)}`,
        );
      }
    }
  }
}

/**
 * Effects are resolved here, at parse time, purely to fail early.
 *
 * The alternative is discovering that an effect name is misspelled during SVG
 * emission, after a browser launch and a full layout — and the natural thing
 * to do that late is skip the unknown effect, which is precisely the silent
 * failure effects/types.ts refuses to allow.
 */
function validateEffect(value: unknown, path: string): void {
  if (value === undefined) return;
  try {
    resolveEffects(value as EffectRef | EffectRef[]);
  } catch (error) {
    if (error instanceof EffectError) throw new SpecError(`${path}: ${error.message}`);
    throw error;
  }
}

/**
 * A curve is refused outright when `allowCurvedConnectors` is off, rather than
 * being dropped back to a straight line. Silently straightening it would draw
 * a figure the author did not ask for and report no reason why.
 */
function validateCurve(
  input: unknown,
  path: string,
  toggles: Required<ConstraintToggles>,
): void {
  if (!toggles.allowCurvedConnectors) {
    throw new SpecError(
      `${path} needs canvas.constraints.allowCurvedConnectors: true (decision 0010)`,
    );
  }
  if (typeof input !== "object" || input === null) {
    throw new SpecError(`${path} must be an object`);
  }
  const curve = input as Record<string, unknown>;
  if (!(CURVE_KINDS as readonly unknown[]).includes(curve.kind)) {
    throw new SpecError(
      `${path}.kind must be one of ${CURVE_KINDS.join(", ")}, got ${JSON.stringify(curve.kind)}`,
    );
  }
  if (curve.kind === "arc" && curve.bulge !== undefined) {
    if (typeof curve.bulge !== "number" || !Number.isFinite(curve.bulge)) {
      throw new SpecError(`${path}.bulge must be a finite number, got ${JSON.stringify(curve.bulge)}`);
    }
  }
  if (curve.kind === "bezier") {
    if (!Array.isArray(curve.control) || curve.control.length < 1 || curve.control.length > 2) {
      throw new SpecError(
        `${path}.control must be one or two points (quadratic or cubic), got ${JSON.stringify(curve.control)}`,
      );
    }
    curve.control.forEach((point, i) => {
      if (
        typeof point !== "object" || point === null ||
        typeof (point as Point).x !== "number" || typeof (point as Point).y !== "number"
      ) {
        throw new SpecError(`${path}.control[${i}] must be an {x, y} point`);
      }
    });
  }
  if (curve.kind === "spline" && curve.radius !== undefined) {
    // Zero is refused rather than treated as "no rounding": a spline with no
    // rounding is a straight route, and asking for one by way of a curve is
    // more likely a mistake than an intention.
    if (typeof curve.radius !== "number" || !Number.isFinite(curve.radius) || curve.radius <= 0) {
      throw new SpecError(
        `${path}.radius must be a positive finite number of px, got ${JSON.stringify(curve.radius)}`,
      );
    }
  }
}

/** A flat colour string passes untouched; a gradient object needs at least two stops. */
function validatePaint(value: unknown, path: string): void {
  if (typeof value === "string") return;
  if (typeof value !== "object" || value === null) {
    throw new SpecError(`${path} must be a colour string or a gradient object, got ${JSON.stringify(value)}`);
  }
  const gradient = value as Record<string, unknown>;
  if (gradient.kind !== "linear" && gradient.kind !== "radial") {
    throw new SpecError(`${path}.kind must be "linear" or "radial", got ${JSON.stringify(gradient.kind)}`);
  }
  if (
    gradient.kind === "linear" &&
    gradient.angle !== undefined &&
    (typeof gradient.angle !== "number" || !Number.isFinite(gradient.angle))
  ) {
    throw new SpecError(`${path}.angle must be a finite number, got ${JSON.stringify(gradient.angle)}`);
  }
  if (!Array.isArray(gradient.stops) || gradient.stops.length < 2) {
    throw new SpecError(`${path}.stops must be an array of at least two stops`);
  }
  gradient.stops.forEach((stop, i) => {
    if (typeof stop !== "object" || stop === null) {
      throw new SpecError(`${path}.stops[${i}] must be an object`);
    }
    const s = stop as Record<string, unknown>;
    if (typeof s.offset !== "number" || !Number.isFinite(s.offset) || s.offset < 0 || s.offset > 1) {
      throw new SpecError(`${path}.stops[${i}].offset must be between 0 and 1, got ${JSON.stringify(s.offset)}`);
    }
    // The same hex-or-keyword shape effects/types.ts requires of an effect
    // colour: this string goes into an SVG attribute verbatim at emission, so
    // it is checked here rather than escaped there.
    if (typeof s.color !== "string" || !/^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/.test(s.color)) {
      throw new SpecError(`${path}.stops[${i}].color must be a hex colour or a colour keyword, got ${JSON.stringify(s.color)}`);
    }
    if (s.opacity !== undefined && (typeof s.opacity !== "number" || s.opacity < 0 || s.opacity > 1)) {
      throw new SpecError(`${path}.stops[${i}].opacity must be between 0 and 1, got ${JSON.stringify(s.opacity)}`);
    }
  });
}

function validateBorder(value: unknown, path: string): void {
  if (typeof value !== "object" || value === null) {
    throw new SpecError(`${path} must be an object`);
  }
  const border = value as Record<string, unknown>;
  for (const side of ["top", "right", "bottom", "left"] as const) {
    if (border[side] === undefined) continue;
    const entry = border[side];
    if (typeof entry !== "object" || entry === null) {
      throw new SpecError(`${path}.${side} must be an object`);
    }
    const b = entry as Record<string, unknown>;
    if (b.width !== undefined && (typeof b.width !== "number" || b.width < 0)) {
      throw new SpecError(`${path}.${side}.width must be a non-negative number, got ${JSON.stringify(b.width)}`);
    }
    if (b.color !== undefined && typeof b.color !== "string") {
      throw new SpecError(`${path}.${side}.color must be a string, got ${JSON.stringify(b.color)}`);
    }
    if (b.style !== undefined && !LINE_STYLES.includes(b.style as LineStyle)) {
      throw new SpecError(
        `${path}.${side}.style must be one of ${LINE_STYLES.join(", ")}, got ${JSON.stringify(b.style)}`,
      );
    }
  }
}

function validateNode(
  input: unknown,
  path: string,
  toggles: Required<ConstraintToggles>,
): void {
  if (typeof input !== "object" || input === null) {
    throw new SpecError(`${path} must be an object`);
  }
  const node = input as Record<string, unknown>;
  if (node.type === "stack") {
    if (node.direction !== "row" && node.direction !== "column") {
      throw new SpecError(`${path}.direction must be "row" or "column"`);
    }
    if (!Array.isArray(node.children)) {
      throw new SpecError(`${path}.children must be an array`);
    }
    node.children.forEach((child, i) => validateNode(child, `${path}.children[${i}]`, toggles));
    return;
  }
  if (node.type === "block") {
    if (node.label !== undefined && typeof node.label !== "string") {
      throw new SpecError(`${path}.label must be a string`);
    }
    if (node.categoryGroup !== undefined && typeof node.categoryGroup !== "string") {
      throw new SpecError(`${path}.categoryGroup must be a string`);
    }
    if (node.level !== undefined && !TYPE_LEVELS.includes(node.level as TypeLevel)) {
      throw new SpecError(
        `${path}.level must be one of ${TYPE_LEVELS.join(", ")}, got ${JSON.stringify(node.level)}`,
      );
    }
    if (node.shape !== undefined && !SHAPE_KINDS.includes(node.shape as ShapeKind)) {
      throw new SpecError(
        `${path}.shape must be one of ${SHAPE_KINDS.join(", ")}, got ${JSON.stringify(node.shape)}`,
      );
    }
    if (node.rotation !== undefined && (typeof node.rotation !== "number" || !Number.isFinite(node.rotation))) {
      throw new SpecError(`${path}.rotation must be a finite number, got ${JSON.stringify(node.rotation)}`);
    }
    if (node.rotateBox !== undefined && typeof node.rotateBox !== "boolean") {
      throw new SpecError(`${path}.rotateBox must be a boolean, got ${JSON.stringify(node.rotateBox)}`);
    }
    if (node.motion !== undefined) {
      const motion = node.motion as Record<string, unknown>;
      if (typeof motion !== "object" || motion === null) {
        throw new SpecError(`${path}.motion must be an object with start and end`);
      }
      const { start, end } = motion as { start?: unknown; end?: unknown };
      for (const [name, value] of [["start", start], ["end", end]] as const) {
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
          throw new SpecError(
            `${path}.motion.${name} must be a number in [0,1], got ${JSON.stringify(value)}`,
          );
        }
      }
      if (!((start as number) < (end as number))) {
        throw new SpecError(
          `${path}.motion.start must be strictly less than .end, got ${JSON.stringify(start)} and ${JSON.stringify(end)}`,
        );
      }
    }
    if (node.fill !== undefined) validatePaint(node.fill, `${path}.fill`);
    if (node.stroke !== undefined) validatePaint(node.stroke, `${path}.stroke`);
    if (node.border !== undefined) validateBorder(node.border, `${path}.border`);
    if (
      node.verticalAlign !== undefined &&
      node.verticalAlign !== "start" &&
      node.verticalAlign !== "center" &&
      node.verticalAlign !== "end"
    ) {
      // Validated rather than passed through, because an unrecognised value
      // would emit CSS the browser ignores: the label would sit where it
      // always did and nothing would say why.
      throw new SpecError(
        `${path}.verticalAlign must be "start", "center" or "end", got ${JSON.stringify(node.verticalAlign)}`,
      );
    }
    validateEffect(node.effect, `${path}.effect`);
    return;
  }
  if (node.type === "scene") {
    if (node.layout !== "absolute" && node.layout !== "graph") {
      throw new SpecError(`${path}.layout must be "absolute" or "graph"`);
    }
    if (!Array.isArray(node.children)) {
      throw new SpecError(`${path}.children must be an array`);
    }
    node.children.forEach((child, i) => validateNode(child, `${path}.children[${i}]`, toggles));
    const ids = new Set<string>();
    for (const child of node.children as Block[]) {
      if (child.id !== undefined) ids.add(child.id);
    }
    // A connector is nameable too: in a free-body diagram every force label
    // names an ARROW, not a box, so restricting `annotates` to children would
    // refuse the case the feature exists for. An id is required to be named,
    // which is why only authored ids count here -- normalise's generated ones
    // do not exist yet, and naming one would be naming a coincidence.
    const connectorIds = new Set<string>();
    if (Array.isArray(node.connectors)) {
      for (const edge of node.connectors as Connector[]) {
        if (edge.id !== undefined) connectorIds.add(edge.id);
      }
    }
    // Checked here rather than in the block branch because this is where a
    // block's SIBLINGS are known -- the same reason a connector's endpoints
    // are validated here and not where the connector is shaped.
    for (const [i, child] of (node.children as Block[]).entries()) {
      if (child.annotates === undefined) continue;
      if (typeof child.annotates !== "string") {
        throw new SpecError(`${path}.children[${i}].annotates must be an element id`);
      }
      if (child.annotates === child.id) {
        throw new SpecError(
          `${path}.children[${i}].annotates names itself; an annotation names something else`,
        );
      }
      if (!ids.has(child.annotates) && !connectorIds.has(child.annotates)) {
        throw new SpecError(
          `${path}.children[${i}].annotates names "${child.annotates}", which is not a block or connector in this scene`,
        );
      }
    }
    if (node.connectors !== undefined) {
      if (!Array.isArray(node.connectors)) {
        throw new SpecError(`${path}.connectors must be an array`);
      }
      node.connectors.forEach((connector, i) => {
        const where = `${path}.connectors[${i}]`;
        const edge = connector as Connector;
        if (typeof edge.from === "string") {
          if (!ids.has(edge.from)) {
            throw new SpecError(
              `${where}.from names "${edge.from}", which is not a child of this scene`,
            );
          }
        } else if (
          typeof edge.from !== "object" ||
          edge.from === null ||
          typeof edge.from.x !== "number" ||
          typeof edge.from.y !== "number"
        ) {
          throw new SpecError(`${where}.from must be a block id or a {x, y} point`);
        }
        if (typeof edge.to === "string") {
          if (!ids.has(edge.to)) {
            throw new SpecError(`${where}.to names "${edge.to}", which is not a child of this scene`);
          }
        } else if (
          typeof edge.to !== "object" ||
          edge.to === null ||
          typeof edge.to.x !== "number" ||
          typeof edge.to.y !== "number"
        ) {
          throw new SpecError(`${where}.to must be a block id or a {x, y} point`);
        }
        if (edge.arrowStyle !== undefined) {
          if (!ARROW_STYLES.includes(edge.arrowStyle)) {
            throw new SpecError(
              `${where}.arrowStyle must be one of ${ARROW_STYLES.join(", ")}, got ${JSON.stringify(edge.arrowStyle)}`,
            );
          }
        }
        if (edge.lineStyle !== undefined) {
          if (!LINE_STYLES.includes(edge.lineStyle)) {
            throw new SpecError(
              `${where}.lineStyle must be one of ${LINE_STYLES.join(", ")}, got ${JSON.stringify(edge.lineStyle)}`,
            );
          }
        }
        if (edge.curve !== undefined) validateCurve(edge.curve, `${where}.curve`, toggles);
        validateEffect(edge.effect, `${where}.effect`);
      });
    }
    return;
  }
  throw new SpecError(
    `${path}.type must be "stack", "block" or "scene", got ${JSON.stringify(node.type)}`,
  );
}
