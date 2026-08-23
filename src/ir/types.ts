/**
 * The figure IR.
 *
 * This is the contract (decision 0002): everything crosses this boundary as
 * JSON. M0 keeps it deliberately small — a stack composes, a block draws.
 * Nothing here knows about SVG, the browser, or any renderer.
 */

import { EffectError, resolveEffects } from "../effects/types.ts";
import type { EffectRef, ResolvedEffect } from "../effects/types.ts";
import { SHAPE_KINDS } from "../geometry/shapes.ts";
import type { ShapeKind } from "../geometry/shapes.ts";
import type { Bleed } from "../effects/bleed.ts";

export type FigureSpec = {
  version: 1;
  title?: string;
  canvas?: CanvasSpec;
  root: FigureNode;
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
 */
export type LineStyle = "solid" | "dashed" | "dotted" | "dashdot";

/** Runtime mirror of `LineStyle`, so validation and the generated reference read one list, not two. */
export const LINE_STYLES: readonly LineStyle[] = ["solid", "dashed", "dotted", "dashdot"];

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
  /** Block id the connector leaves from. */
  from: string;
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
  /** Fixed total width, border included. Text wraps to it. */
  width?: number;
  maxWidth?: number;
  minWidth?: number;
  /**
   * Fixed total height. Real schematics need shapes that keep their size, and
   * a fixed height is the first way a label can overflow downward — which is
   * precisely what the repair loop exists to fix.
   */
  height?: number;
  /**
   * "none" forbids wrapping. Needed for labels that must not be broken
   * (identifiers, axis ticks, short codes), and the second way a label can
   * overflow — sideways.
   */
  wrap?: "normal" | "none";
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
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** Supersedes `dashed` when set on Block. Default "solid". */
  lineStyle?: LineStyle;
  radius?: number;
  fontSize?: number;
  /** Font family. Default "Inter, system-ui, sans-serif". */
  fontFamily?: string;
  /** Font weight. Default 400 (normal). Common values: 400, 600, 700. */
  fontWeight?: number;
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
};

export type PlacedElement = PlacedBox | PlacedText | PlacedConnector;

export type PlacedConnector = {
  kind: "connector";
  id: string;
  fromId: string;
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
  fill: string;
  stroke: string;
  strokeWidth: number;
  lineStyle?: LineStyle;
  radius: number;
  /** Content box: the area a label is allowed to occupy. */
  content: Rect;
  effects?: ResolvedEffect[];
  /** How far this element's effects put ink past its own bounds. */
  bleed?: Bleed;
  /** Carried straight from the spec's Block.categoryGroup; see there. */
  categoryGroup?: string;
  /** Carried straight from the spec's Block.shape. Default "rect" when unset. */
  shape?: ShapeKind;
  /**
   * Where the label actually sits in this box, read back from computed style
   * rather than copied from the spec — so the repair loop reasons about what
   * the browser applied, not what we asked for. See Block.verticalAlign.
   */
  verticalAlign?: Align;
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
  // Whether a curve is legal depends on the canvas, so the toggles are
  // resolved once here and carried down rather than looked up per node.
  validateNode(spec.root, "root", resolveConstraints(spec.canvas as CanvasSpec | undefined));
  return spec as FigureSpec;
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
    if (node.shape !== undefined && !SHAPE_KINDS.includes(node.shape as ShapeKind)) {
      throw new SpecError(
        `${path}.shape must be one of ${SHAPE_KINDS.join(", ")}, got ${JSON.stringify(node.shape)}`,
      );
    }
    if (node.rotation !== undefined && (typeof node.rotation !== "number" || !Number.isFinite(node.rotation))) {
      throw new SpecError(`${path}.rotation must be a finite number, got ${JSON.stringify(node.rotation)}`);
    }
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
    if (node.connectors !== undefined) {
      if (!Array.isArray(node.connectors)) {
        throw new SpecError(`${path}.connectors must be an array`);
      }
      node.connectors.forEach((connector, i) => {
        const where = `${path}.connectors[${i}]`;
        const edge = connector as Connector;
        if (typeof edge.from !== "string") throw new SpecError(`${where}.from must be a block id`);
        if (!ids.has(edge.from)) {
          throw new SpecError(`${where}.from names "${edge.from}", which is not a child of this scene`);
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
