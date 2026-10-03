/**
 * function-graph -- curves y = f(x) on a numbered plane, stated as data.
 *
 * Promoted from the `graph()` helper that drew the Cálculo 1 sheet
 * (experiments/exercises/calculo1). That helper was code: every figure was a
 * script, every label's coordinates were typed by hand, and five defects
 * reached the student through it -- intercepts without their number, an
 * axis missing because the lattice did not land on zero, a legend over the
 * axis numbers, curves told apart only by colour, and "(2, 5)" beside the
 * decimal "0,5". Each of those is now either impossible by construction here
 * or refused by a check downstream:
 *
 *  - a figure is a document: functions are expressions (src/math/expr.ts),
 *    points are evaluated from them, and a label's numbers are formatted
 *    from those values by the one locale formatter (src/locale/format.ts);
 *  - a coordinate pair typed into a label is REFUSED, so the only way to
 *    print one is to compute it;
 *  - axis numbers are never dropped: a number with ink on its usual spot
 *    slides along its own gridline, at most half a division, then steps
 *    off it by at most a quarter, and only then falls back to a paper
 *    backing (see `ticks`);
 *  - the zero line is drawn whenever the range contains zero;
 *  - the legend searches for free space instead of taking a coordinate.
 *
 * Curves that are not graphs of a function -- parametric, polar, implicit
 * -- came later (ADR 0029) and follow the same rule: stated as expressions,
 * drawn from them (adaptive sampling in ./curves.ts, marching squares in
 * src/math/contour.ts), never from typed points.
 *
 * Like every preset it is a macro: it expands to ordinary IR, and the
 * measuring, checking and repair downstream do not know it exists.
 */

import type { Block, FigureSpec, LineStyle, Mark, Point } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { ExprError, compile, compileTree, constantValue, derivative, parse, parseEquation, parseIn, pretty } from "../../math/expr.ts";
import type { Node } from "../../math/expr.ts";
import { contour } from "../../math/contour.ts";
import { LOCALES, MINUS, formatNumber, formatPoint, parseNumber } from "../../locale/format.ts";
import { NumericError, riemann } from "../../math/numeric.ts";
import type { RiemannRule } from "../../math/numeric.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";
import { Board, lineBox } from "./board.ts";
import type { Box, LabelOptions } from "./board.ts";
import { clipRuns, sampleParametric } from "./curves.ts";
import type { Rect } from "./curves.ts";
import {
  boxInside,
  boxMeetsPolygon,
  integral,
  intersections,
  sampleEdge,
  signParts,
  subscript,
} from "./areas.ts";
import type { XYPoint } from "./areas.ts";
import { distanceToPolyline, pointInPolygon } from "../../geometry/hit.ts";
import { atInfinity, classify, coincides, describeLimit, sameLine, snapExact, verticalsAndHoles, writeExact } from "./asymptotes.ts";
import type { Exact, Hole, SideResult, Slant } from "./asymptotes.ts";
import type { Printed } from "../../locale/write.ts";
import { alongPolyline, edgeOf, measure } from "./measured.ts";
import { composePanels, panelInput } from "./panels.ts";
import type { Interpolation, Measured } from "./measured.ts";
import { niceStep, widenToTicks, fitUnits, ticksIn } from "../shared/scale.ts";
import { labelWidth as labelWidthOf } from "../shared/text.ts";
import { hasScripts, rich, runsWidth } from "../shared/panel.ts";
import { runsText } from "../../ir/types.ts";

// ---- input ---------------------------------------------------------------

export type Dir = "R" | "L" | "U" | "D" | "NE" | "NW" | "SE" | "SW";
export type XY = [number, number];
/**
 * A number, or an expression with no variables that evaluates to one:
 * `"2pi"`, `"π/2"`, `"sqrt(2)"`. JSON has no way to write 2π, and a
 * parameter interval that stops at 6.2832 is a second, rounded statement of
 * a number the author meant exactly.
 */
export type Bound = number | string;
/**
 * A literal point, a point declared earlier by id, or a point read off a
 * curve: at an x for a graph or a line, at a parameter t for a parametric
 * curve, at an angle θ for a polar one (ADR 0029).
 */
export type PointRef =
  | XY
  | string
  | { of: string; x: number; side?: "left" | "right" }
  | { of: string; t: Bound }
  | { of: string; theta: Bound };

export type AxisInput = {
  /**
   * [min, max] shown, in axis units. May be left out on a category axis
   * (it is then [0,5; n + 0,5]) and on a y axis drawn for series or bars (it
   * is then fitted to the data, widened to whole steps).
   */
  range: [number, number];
  /** Pixels per axis unit. Or give `length`; with neither, the unit is fitted (ADR 0066). */
  unit: number;
  /** The axis's length in pixels, instead of `unit`: what keeps five panels the same size whatever their ranges. */
  length?: number;
  /** Lattice spacing. Default 1. */
  step?: number;
  /** Print every nth lattice number. Default 1. */
  labelEvery?: number;
  /** Axis name drawn at its positive end. Default "x" / "y"; "" for none. */
  name?: string;
  /** Numbers that must be printed on this axis even off the lattice -- an intercept the text cites. */
  require?: number[];
  /**
   * An axis without numbers (ADR 0066): a qualitative graph's P against T,
   * the "Tempo" of a five-option question. It prints no lattice number and
   * says so to `axis-number-present`, which fails an axis that prints none
   * WITHOUT saying so.
   */
  schematic?: boolean;
  /**
   * Symbolic ticks: a place on the axis named by text ("T", "P_0", "t_1").
   * The label is typed and claims nothing numeric -- a number is refused --
   * and it declares the place it names, so `label-nearest-its-place` holds it
   * beside its tick. `_0` / `_{10}` set real subscripts.
   */
  ticks?: TickInput[];
  /**
   * A category axis: one name per category, at x = 1, 2, … n. Series give
   * `values` (one per category) and bars stand on it. Numberless by nature,
   * so declared as such, and every name declares its place.
   */
  categories?: string[];
  /** The colour of this axis's numbers and name: a dual-axis chart colours each axis to its series. */
  colour?: string;
};

export type TickInput = { at: number; label: string };

/** Arrows on a curve: where along its drawn length (0 to 1), and whether against the drawing order. */
export type ArrowsInput = number[] | { at: number[]; reverse?: boolean };

/**
 * A measured series (ADR 0066): a curve through given points, on the same
 * plane, under the same labelling rules, as an expression's curve.
 */
export type SeriesInput = StrokeInput & {
  id: string;
  /** The data, [x, y] in the order drawn. */
  points?: XY[];
  /** On a category axis instead: one value per category. */
  values?: number[];
  /** "linear" (default), "smooth" (monotone cubic, never overshoots), "step", or "none" (markers only). */
  interpolate?: Interpolation;
  /** A marker at every data point: true or "circle", "square". Default false (true for "none"). */
  markers?: boolean | "circle" | "square";
  /**
   * Each data point's value printed beside it, through the locale formatter:
   * true for every point, a list of indices for some, or an object.
   */
  valueLabels?: boolean | number[] | { at?: number[]; decimals?: number; suffix?: string; towards?: Dir[] };
  /** Which y axis the values are read on: "y" (default) or "y2" (the right axis). */
  axis?: "y" | "y2";
  arrows?: ArrowsInput;
  label?: CurveLabelInput;
  legend?: string;
};

/** Grouped bars on a category axis; each entry is one series of bars, one value per category. */
export type BarsInput = {
  id: string;
  values: number[];
  colour?: string;
  legend?: string;
  /** Print each bar's value above it. */
  valueLabels?: boolean;
};

/** The axes as a whole. */
export type AxesInput = {
  /** Both axes schematic. Per axis: `x.schematic`, `y.schematic`. */
  schematic?: boolean;
  /** Draw the lattice. Default: unless every axis is schematic. */
  grid?: boolean;
  /** Arrowheads at the axes' positive ends. Default: when an axis is schematic. */
  arrows?: boolean;
};

export type StrokeInput = {
  /** A named colour (ink, key, ask, warm, soft, purple, ochre, rust) or #rrggbb. */
  colour?: string;
  width?: number;
  style?: "solid" | "dashed" | "dotted" | "dashdot";
};

export type CurveLabelInput = {
  /** May use {expr} (the curve's own formula) and every placeholder a label may. */
  text: string;
  /** Where on the curve: an x value, or any point. */
  at: number | PointRef;
  towards?: Dir[];
  size?: number;
};

export type FunctionInput = StrokeInput & {
  id: string;
  /** One expression over one domain, or `pieces` for a piecewise function. */
  expr?: string;
  domain?: [number, number];
  pieces?: { expr: string; domain: [number, number] }[];
  /** A parametric curve (ADR 0029): x(t) and y(t), drawn for t in `t`. */
  x?: string;
  y?: string;
  t?: [Bound, Bound];
  /** A polar curve: r(θ), drawn for θ in `theta`. Negative r is drawn opposite, as the textbooks do. */
  r?: string;
  theta?: [Bound, Bound];
  /** An implicit curve: an equation in x and y, "x^2/9 + y^2/4 = 1", drawn where it holds. */
  implicit?: string;
  label?: CurveLabelInput;
  legend?: string;
  /** Arrows on the curve showing the direction it is travelled (ADR 0066): increasing x, or `reverse`. */
  arrows?: ArrowsInput;
  /** Mark computed roots and local extrema, each declared to lie on this curve (ADR 0025). */
  features?: ("roots" | "extrema")[];
  /**
   * Asymptotes, FOUND from the expression (ADR 0038): `true` draws every one
   * the numerics confirm and refuses a function that has none; an object
   * picks kinds. A kind set to `true` must exist or the figure is refused; a
   * kind left out is drawn if found; `false` draws none. `vertical` may list
   * the x of each asymptote the figure claims, each confirmed by its limits.
   */
  asymptotes?: boolean | AsymptoteInput;
  /**
   * Removable discontinuities, drawn as ○ at (a, lim f): `true` finds them
   * (and refuses a function with none), a list names the x of each (a hole
   * the expression never visibly skips must be declared), an object adds a
   * label template. y is always the limit, never typed.
   */
  holes?: boolean | Bound[] | HoleInput;
};

export type AsymptoteInput = {
  vertical?: boolean | Bound[];
  horizontal?: boolean;
  oblique?: boolean;
};

export type HoleInput = {
  /** The x of each hole; unset: found. */
  at?: Bound[];
  /** A template for each hole's label: "{coords}" prints the computed (a; L). */
  label?: string;
  towards?: Dir[];
};

export type LineInput = StrokeInput & {
  id: string;
  /** Through two points (a secant)... */
  through?: [PointRef, PointRef];
  /** ...or through a point with a slope... */
  point?: PointRef;
  slope?: number;
  /**
   * ...or tangent to a curve, its slope computed. `at` is the x of a graph,
   * the t of a parametric curve or the θ of a polar one, and may be written
   * as an expression ("pi/2") like any other bound.
   */
  tangent?: { of: string; at: Bound };
  /** The x interval to draw. */
  domain: [number, number];
  /** Several lines may be one series ("tangentes"); default: the line's own id. */
  series?: string;
  label?: CurveLabelInput;
  legend?: string;
};

export type PointInput = {
  id?: string;
  at: PointRef;
  /** closed (●, belongs to the graph) or open (○, does not). Default closed. */
  style?: "closed" | "open";
  colour?: string;
  /** A template: "P{coords}" prints "P(3; 9)" from the computed point. */
  label?: string;
  towards?: Dir[];
  /** Dashed guides from the point to both axes; "x" only down (or up) to the x axis, "y" only across to the y axis. */
  guides?: boolean | "x" | "y";
  /** Label size. Default 14. */
  size?: number;
};

export type GuideInput = {
  /** A vertical guide at x, or a horizontal one at y, between `from` and `to` on the other axis. */
  x?: number;
  y?: number;
  from?: number;
  to?: number;
  colour?: string;
};

export type LabelInput = {
  text: string;
  at: PointRef;
  towards?: Dir[];
  colour?: string;
  size?: number;
  weight?: number;
  /** The series this label names, if it names one. */
  names?: string;
};

export type LegendInput = {
  /** Top-left of the legend in axis units. Unset: searched for (the default, and the point). */
  at?: XY;
};

/**
 * A shaded region (ADR 0036): under one curve, `{of, from, to}` -- between it
 * and the x axis -- or between two, `{between: [f, g]}` with `from`/`to`, or
 * with neither, when the bounds are the curves' first and last intersections.
 * Where the integrand changes sign the region is cut into parts, each its own
 * closed mark and its own label, shaded by sign.
 */
export type AreaInput = {
  id?: string;
  of?: string;
  between?: [string, string];
  from?: Bound;
  to?: Bound;
  /**
   * What the printed number is: "area" (default) the geometric area, every
   * part counted positive -- what "calcule a área" asks; "integral" the
   * signed integral, a part below the axis (or where g is above f) negative.
   */
  value?: "area" | "integral";
  /** The tint where f > 0 (or f > g). Default: the first curve's colour. */
  colour?: string;
  /** The tint where f < 0 (or f < g). Default rust. */
  negativeColour?: string;
  /**
   * The label printed in each part, a template: {value} (per `value`), {area},
   * {integral}, {i} (the part's index as a subscript). Default "A = {value}",
   * "A{i} = {value}" when there are several parts, and "∫" for "A" when
   * `value` is "integral". `false` prints none.
   */
  label?: string | false | { text?: string; towards?: Dir[] };
  /**
   * With several parts, the whole region's value as a caption: `true` (the
   * default when there are several parts) or a template ({value}, {area},
   * {integral}); `false` prints none.
   */
  total?: boolean | string;
  legend?: string;
};

/** A Riemann sum (ADR 0036): exactly the rectangles numeric.riemann summed. */
export type RiemannInput = {
  id?: string;
  of: string;
  from: Bound;
  to: Bound;
  n: number;
  rule: RiemannRule;
  /** The rectangles' colour where f > 0. Default warm. */
  colour?: string;
  /** Where f < 0. Default rust. */
  negativeColour?: string;
  /** Mark the sample points on the curve (left/right/mid). Default true. */
  points?: boolean;
  /** Print the sum: `true` ("S{n} = {sum}") or a template ({sum}, {n} as a subscript, {integral}). */
  label?: boolean | string;
  /** Print the exact integral beside the sum: `true` ("∫ = {integral}") or a template. */
  integral?: boolean | string;
  legend?: string;
};

export type FunctionGraphInput = {
  title?: string;
  /** Number formatting for ticks and computed labels. Default pt-BR. */
  locale?: Locale;
  x: AxisInput;
  y: AxisInput;
  functions?: FunctionInput[];
  lines?: LineInput[];
  points?: PointInput[];
  guides?: GuideInput[];
  labels?: LabelInput[];
  areas?: AreaInput[];
  riemann?: RiemannInput[];
  /** Measured series: curves through given points (ADR 0066). */
  series?: SeriesInput[];
  /** Grouped bars on a category axis (ADR 0066). */
  bars?: BarsInput[];
  /** A second y axis on the right, for a series on another scale; its unit is fitted to the y axis's height. */
  y2?: AxisInput;
  axes?: AxesInput;
  legend?: LegendInput;
  /**
   * Labelled panels (A)–(E) of small graphs in one figure (ADR 0066): each a
   * function-graph of its own, every field it leaves out taken from this
   * input, laid out `columns` across on cells of one size.
   */
  panels?: PanelInput[];
  /** Panels per row. Default 2. */
  columns?: number;
  /**
   * false: the question's figure. Everything drawn stays -- curves, regions,
   * sums, series and their given values -- but what the figure COMPUTES is
   * not printed: area, sum and integral values, asymptotes (lines and
   * equations), and in any label the part from its first computed placeholder
   * on ("P{coords}" prints "P"; a label left empty is not drawn).
   */
  answers?: boolean;
};

export type PanelInput = Partial<Omit<FunctionGraphInput, "panels" | "columns" | "x" | "y" | "y2">> & {
  /** The panel's letter. Default A, B, C… in order. */
  label?: string;
  x?: Partial<AxisInput>;
  y?: Partial<AxisInput>;
  y2?: Partial<AxisInput>;
};

// ---- palette -------------------------------------------------------------

const PAPER = "#FCFBF7";
const INK = "#181B21";
const SOFT = "#4E5763";
const FAINT = "#5E6773";
const GRID = "#E4E8ED";
const AXIS = "#9AA3AE";

export const COLOURS: Record<string, string> = {
  ink: INK,
  soft: SOFT,
  key: "#1D4E89",
  ask: "#B3400C",
  rust: "#B3400C",
  warm: "#0F7360",
  purple: "#6B3FA0",
  ochre: "#8A5A00",
};

const DIRS: Record<Dir, Point> = {
  R: { x: 1, y: 0 },
  L: { x: -1, y: 0 },
  U: { x: 0, y: -1 },
  D: { x: 0, y: 1 },
  NE: { x: 0.7, y: -0.7 },
  NW: { x: -0.7, y: -0.7 },
  SE: { x: 0.7, y: 0.7 },
  SW: { x: -0.7, y: 0.7 },
};

function colourOf(name: string | undefined, fallback: string, path: string): string {
  if (name === undefined) return fallback;
  if (/^#[0-9a-fA-F]{6}$/.test(name)) return name;
  const named = Object.hasOwn(COLOURS, name) ? COLOURS[name] : undefined;
  if (named === undefined) {
    throw new SpecError(
      `${path} is ${JSON.stringify(name)}; a colour is #rrggbb or one of ${Object.keys(COLOURS).join(", ")}`,
    );
  }
  return named;
}

// ---- hand-typed coordinates ---------------------------------------------

/**
 * A literal ordered pair in label text: "(2; 5)", "(2, 5)", "(2,5; 7,25)".
 *
 * Refused outright. Every one that reached the student was typed by hand,
 * and a typed coordinate is a second statement of a number the figure
 * already computes -- free to disagree with it, and free to use the wrong
 * separator. Write "{P}" or "{coords}" and the formatter writes the pair.
 */
// The separator is a semicolon, or a comma FOLLOWED BY A SPACE: "(1,2)" is
// the decimal one-point-two in brackets -- "1000·(1,2)ᵗ" -- and refusing it
// would refuse the very notation the semicolon rule exists to protect.
const TYPED_PAIR = /\(\s*[−-]?\d+(?:[.,]\d+)?(?:\/\d+)?\s*(?:;|,\s)\s*[−-]?\d+(?:[.,]\d+)?(?:\/\d+)?\s*\)/;

export function typedCoordinate(text: string): string | null {
  const m = TYPED_PAIR.exec(text);
  return m === null ? null : m[0];
}

// ---- the build ------------------------------------------------------------

type Curve = {
  id: string;
  series: string;
  colour: string;
  width: number;
  lineStyle: LineStyle | undefined;
  /** y at x, NaN off its domain. */
  at: (x: number) => number;
  pieces: { f: (x: number) => number; domain: [number, number]; source: string }[];
  slope?: number;
  intercept?: number;
  expr?: string;
  /**
   * What the curve is (ADR 0029). A graph or a line has a y at each x; the
   * other three do not, so everything that reads "the value at x" -- `{of,
   * x}`, a tangent's `at`, a label's numeric `at` -- asks this first.
   */
  kind: "graph" | "line" | "parametric" | "polar" | "implicit";
  /** Parametric and polar: the point at parameter s, over `interval`. */
  param?: (s: number) => Resolved;
  interval?: [number, number];
  /** Implicit: the level set, as polylines in axis units, found by contour. */
  paths?: { points: Resolved[]; closed: boolean }[];
  /** A measured series (ADR 0066): its given points and how they are joined. */
  measured?: Measured;
  /** Read on the right axis: its values are mapped onto the plane, so a point read off it would print the wrong number. */
  onY2?: boolean;
  /** Parametric, polar, implicit: what `{expr}` prints. */
  display?: string;
};

type Resolved = { x: number; y: number };

type LegendRow = { text: string; colour: string; width: number; lineStyle: LineStyle | undefined; fill?: string; textColour?: string };

/**
 * A label that names a region or a sum (ADR 0036). It `annotates` the closed
 * mark `owner`, and is placed so that mark is the nearest thing drawn to it
 * -- inside the region when it fits, else outside against it -- because
 * `annotation-nearest-its-owner` holds it to exactly that, and
 * `area-matches-its-label` (ADR 0037) measures the owner's area against it.
 */
type RegionLabel = {
  id: string;
  owner: string;
  polygon: Point[];
  /** "" when no label is printed (only a caption). */
  text: string;
  colour: string;
  inside: boolean;
  towards?: Dir[];
  /** A free-standing caption set beside the label: a total, or the integral a sum is compared with. */
  caption?: { id: string; text: string; colour: string };
  /** Every part the caption speaks for; default the owner alone. */
  group?: Point[][];
  /**
   * A sum whose rectangles all stand on one side of the x axis is labelled on
   * the OTHER side, centred under (or over) them, past the tick numbers: 1
   * below the axis, -1 above it.
   */
  across?: 1 | -1;
};

/**
 * An asymptote as drawn (ADR 0038): a dashed line in canvas px, clipped to the
 * plot, its own series so its label can name it, and the ends its label
 * prefers to sit beside (the end toward the side it describes first).
 */
type AsymptoteLine = {
  id: string;
  colour: string;
  pts: Point[];
  text: string;
  /** Preferred label anchors, best first, each with a score penalty. */
  prefer: { at: Point; bias: number }[];
};

/**
 * How opaque a region's tint is (11%): light enough that a tick number set
 * inside a region keeps 4.5:1 -- FAINT on every palette colour's tint measures
 * 4.65 to 4.74:1, where 17% had the rust tint of a region below the axis at
 * 4.3:1 under "3" and "4" -- and a label in the region's own colour keeps
 * 4.7:1 or better; dark enough to read as a region.
 */
const TINT_ALPHA = "1C";
const tint = (colour: string): string => `${colour}${TINT_ALPHA}`;

/** Bar fills, in order: the palette's darker inks, so a value label on paper beside them reads, and they read apart. */
const BAR_COLOURS = ["#E07B54", "#1F7A4D", "#1D4E89", "#8A5A00"];

const LEFT = 46;
const RIGHT = 40;
const TOP = 30;
const BOTTOM = 34;

class Build {
  readonly input: FunctionGraphInput;
  /** false: print nothing the figure computes (see FunctionGraphInput.answers). */
  readonly answers: boolean;
  readonly locale: Locale;
  readonly board: Board;
  readonly xr: [number, number];
  readonly yr: [number, number];
  readonly ux: number;
  readonly uy: number;
  readonly sx: number;
  readonly sy: number;
  readonly ox: number;
  readonly oy: number;
  readonly curves = new Map<string, Curve>();
  readonly points = new Map<string, Resolved>();
  readonly seriesColour = new Map<string, { colour: string; width: number; lineStyle: LineStyle | undefined }>();
  readonly guideMarks: Mark[] = [];
  readonly tickBoxes: Box[] = [];
  readonly required: { x: Set<number>; y: Set<number>; y2?: Set<number> } = { x: new Set<number>(), y: new Set<number>() };
  /** Every shaded region and Riemann outline, in canvas px: what the legend keeps off. */
  readonly regionsPx: Point[][] = [];
  /** Labels of regions and sums, placed once every other mark exists. */
  readonly regionLabels: RegionLabel[] = [];
  /** Sample points of Riemann sums, drawn with the other dots (above the curves). */
  readonly sampleDots: { at: Point; colour: string; id: string; series: string }[] = [];
  /** Legend rows for areas and sums, after the curves'. */
  readonly regionLegend: LegendRow[] = [];
  /** Asymptotes drawn (ADR 0038), labelled once every other mark exists. */
  readonly asymptoteLines: AsymptoteLine[] = [];
  /** Holes: open rings at (a, lim f), drawn with the other dots, over the curve. */
  readonly holeDots: { at: Resolved; colour: string; id: string; series: string; label?: string; towards?: Dir[]; path: string }[] = [];
  /** Where a graph with asymptotes or holes is broken while sampling: never joined across a pole. */
  readonly graphBreaks = new Map<string, number[]>();

  /** The right axis (ADR 0066): its range, unit and step, when there is one. */
  readonly y2: { range: [number, number]; unit: number; step: number } | undefined;
  /** Every mark drawn for a series, in drawing order: what its arrows are set along. */
  readonly seriesRuns = new Map<string, Point[][]>();
  /** Labels naming a data point (value labels), placed after the curve labels. */
  readonly valueLabelsPending: { text: string; at: Point; colour: string; towards: Dir[] }[] = [];

  constructor(input: FunctionGraphInput) {
    this.input = input;
    this.answers = input.answers !== false;
    this.locale = input.locale ?? "pt-BR";
    this.xr = input.x.range;
    this.yr = input.y.range;
    this.ux = input.x.unit;
    this.uy = input.y.unit;
    this.sx = input.x.step ?? 1;
    this.sy = input.y.step ?? 1;
    let right = RIGHT;
    if (input.y2 !== undefined) {
      const span = input.y2.range[1] - input.y2.range[0];
      const step = input.y2.step ?? niceStep(span, 6);
      this.y2 = { range: input.y2.range, unit: ((this.yr[1] - this.yr[0]) * this.uy) / span, step };
      // Room for the right axis's numbers beside it.
      const widest = Math.max(
        0,
        ...ticksIn(input.y2.range[0], input.y2.range[1], step).map((v) => labelWidthOf(formatNumber(v, this.locale), 11)),
      );
      right = Math.max(RIGHT, Math.ceil(widest + 22));
    }
    if (this.schematic("x") && (input.x.name ?? "x") !== "") {
      right = Math.max(right, Math.ceil(labelWidthOf(input.x.name ?? "x", 15, 0.1, 600) + 36));
    }
    const W = Math.round(LEFT + (this.xr[1] - this.xr[0]) * this.ux + right);
    // Room above the plot for the axis names set there (ADR 0066).
    const top = this.measuredMode && ((input.y.name ?? "y") !== "" || (input.y2?.name ?? "") !== "") ? TOP + 16 : TOP;
    const bottom = this.measuredMode && !this.schematic("x") && (input.x.name ?? "x") !== "" ? BOTTOM + 34 : BOTTOM;
    const H = Math.round(top + (this.yr[1] - this.yr[0]) * this.uy + bottom);
    this.board = new Board(W, H, PAPER);
    this.ox = LEFT - this.xr[0] * this.ux;
    this.oy = top + this.yr[1] * this.uy;
  }

  at(u: number, w: number): Point {
    return { x: this.ox + u * this.ux, y: this.oy - w * this.uy };
  }

  /** Where the x axis runs: y = 0 when in range, else the low edge. */
  get baseY(): number {
    return this.yr[0] <= 0 && this.yr[1] >= 0 ? 0 : this.yr[0];
  }

  get baseX(): number {
    return this.xr[0] <= 0 && this.xr[1] >= 0 ? 0 : this.xr[0];
  }

  fmt(value: number, decimals?: number): string {
    return formatNumber(value, this.locale, decimals === undefined ? {} : { decimals });
  }

  // ---- axes without numbers, measured series (ADR 0066) -------------------

  /** Declared schematic: the axis prints no number, and says so. */
  schematic(axis: "x" | "y"): boolean {
    return this.input.axes?.schematic === true || this.input[axis].schematic === true;
  }

  /** An axis that prints no lattice number: schematic, or a category axis. */
  numberless(axis: "x" | "y"): boolean {
    return this.schematic(axis) || (this.input[axis].categories !== undefined);
  }

  /** Any of this ADR's features in use: only then are edge axes drawn, so every older figure is unchanged. */
  get measuredMode(): boolean {
    const i = this.input;
    return (
      (i.series ?? []).length > 0 ||
      (i.bars ?? []).length > 0 ||
      i.y2 !== undefined ||
      this.numberless("x") ||
      this.numberless("y") ||
      (i.x.ticks ?? []).length > 0 ||
      (i.y.ticks ?? []).length > 0 ||
      i.axes?.arrows === true
    );
  }

  /** A value read on the right axis, stated on the plane's own y. */
  fromY2(v: number): number {
    const y2 = this.y2!;
    return this.yr[0] + ((v - y2.range[0]) * (this.yr[1] - this.yr[0])) / (y2.range[1] - y2.range[0]);
  }

  /** Where the right axis runs, in canvas px. */
  get rightEdge(): number {
    return this.at(this.xr[1], 0).x;
  }

  /**
   * A label set with real sub/superscripts (ADR 0062) when its text has
   * any (`P_0`, `t_{1}`, `m^2`), searched clear of ink like any other.
   */
  richPlace(text: string, cx: number, cy: number, dirs: Point[], o: LabelOptions & { steps?: number }): Block {
    const marked = text.replace(/([_^])([A-Za-z0-9])(?![A-Za-z0-9{])/g, "$1{$2}");
    const runs = rich(marked);
    const plain = runsText(runs);
    if (!hasScripts(runs)) return this.board.place(plain, cx, cy, dirs, o);
    const width = runsWidth(runs, o.size ?? 13, o.weight ?? 400);
    const block = this.board.place(plain, cx, cy, dirs, { ...o, width });
    block.runs = runs;
    return block;
  }

  /** An arrowhead at an axis's positive end, its base on the end of the line. */
  axisArrow(end: Point, dir: Point, id: string): void {
    const n = { x: -dir.y, y: dir.x };
    const tip = { x: end.x + dir.x * 10, y: end.y + dir.y * 10 };
    const b1 = { x: end.x + n.x * 4.5, y: end.y + n.y * 4.5 };
    const b2 = { x: end.x - n.x * 4.5, y: end.y - n.y * 4.5 };
    this.board.poly([tip, b1, b2], { stroke: AXIS, width: 1, fill: AXIS, close: true, id });
  }

  /** A filled marker in canvas px, declared to lie on its series. */
  marker(c: Point, shape: "circle" | "square", colour: string, id: string, series: string): void {
    if (shape === "circle") {
      this.board.circle(c, 4.2, { fill: colour, id, on: [series] });
    } else {
      const r = 4;
      const corners = [
        { x: c.x - r, y: c.y - r },
        { x: c.x + r, y: c.y - r },
        { x: c.x + r, y: c.y + r },
        { x: c.x - r, y: c.y + r },
      ];
      this.board.marks.push({ id, from: corners[0]!, segments: corners.slice(1).map((p) => ({ line: p })), close: true, fill: colour, stroke: "none", strokeWidth: 0, on: [series] });
      this.board.trace([...corners, corners[0]!], colour, 1, id);
    }
    this.board.reserve(c.x, c.y, 11, 11);
  }

  /**
   * A filled arrowhead on a curve at `at`, pointing along `dir`. Its
   * centroid is the point on the curve, so `feature-on-its-curve` holds the
   * arrow to the curve it claims.
   */
  arrowhead(at: Point, dir: Point, colour: string, id: string, on?: string): void {
    const n = { x: -dir.y, y: dir.x };
    const tip = { x: at.x + dir.x * 8, y: at.y + dir.y * 8 };
    const back = { x: at.x - dir.x * 4, y: at.y - dir.y * 4 };
    const b1 = { x: back.x + n.x * 5.5, y: back.y + n.y * 5.5 };
    const b2 = { x: back.x - n.x * 5.5, y: back.y - n.y * 5.5 };
    this.board.marks.push({
      id,
      from: tip,
      segments: [{ line: b1 }, { line: b2 }],
      close: true,
      fill: colour,
      stroke: "none",
      strokeWidth: 0,
      ...(on === undefined ? {} : { on: [on] }),
    });
    this.board.trace([tip, b1, b2, tip], colour, 1, id);
  }

  /** Every measured series as a curve: its pieces where it is a function of x, its path always. */
  seriesCurve(s: SeriesInput, path: string): Curve {
    const cats = this.input.x.categories;
    const raw: XY[] =
      s.points ?? (s.values ?? []).map((v, i) => [i + 1, v] as XY);
    if (s.values !== undefined && cats === undefined) {
      throw new SpecError(`${path}.values gives one value per category, and x has no "categories"; give "points" [[x, y], …]`);
    }
    if (s.values !== undefined && cats !== undefined && s.values.length !== cats.length) {
      throw new SpecError(`${path}.values has ${s.values.length} value(s) for ${cats.length} categories`);
    }
    const onY2 = s.axis === "y2";
    if (onY2 && this.y2 === undefined) throw new SpecError(`${path}.axis is "y2", and the figure declares no "y2" axis`);
    const ry = onY2 ? this.y2!.range : this.yr;
    raw.forEach(([x, y], i) => {
      if (x < this.xr[0] - 1e-9 || x > this.xr[1] + 1e-9 || y < ry[0] - 1e-9 || y > ry[1] + 1e-9) {
        throw new SpecError(
          `${path}: point ${i + 1} (${x}, ${y}) lies outside the plotted range; widen the ${onY2 ? "y2" : "x or y"} range -- ` +
            `a measured point is never clipped silently`,
        );
      }
    });
    const interpolate = s.interpolate ?? "linear";
    const points = raw.map(([x, y]) => ({ x, y: onY2 ? this.fromY2(y) : y }));
    const m = measure(points, interpolate);
    if ((interpolate === "smooth" || interpolate === "step") && !m.isFunction) {
      throw new SpecError(`${path}: a "${interpolate}" series needs x to run one way, strictly; these points turn back`);
    }
    const curve: Curve = {
      id: s.id,
      series: s.id,
      colour: colourOf(s.colour, COLOURS.key!, `${path}.colour`),
      width: s.width ?? 2.4,
      lineStyle: s.style === "solid" ? undefined : s.style,
      kind: "graph",
      at: () => Number.NaN,
      pieces: m.pieces,
      measured: m,
      ...(onY2 ? { onY2: true } : {}),
    };
    curve.at = (x) => this.valueOn(curve, x);
    return curve;
  }

  /** The measured series, drawn as their own polylines (vertices at the data), then markers. */
  seriesStrokes(): void {
    for (const [i, s] of (this.input.series ?? []).entries()) {
      const curve = this.curveById(s.id, `series[${i}]`);
      const m = curve.measured!;
      if (m.interpolate !== "none" && m.path.length > 1) {
        const px = m.path.map((p) => this.at(p.x, p.y));
        this.board.poly(px, {
          id: s.id,
          stroke: curve.colour,
          width: curve.width,
          ...(curve.lineStyle === undefined ? {} : { lineStyle: curve.lineStyle }),
          series: curve.series,
        });
        this.seriesRuns.set(s.id, [px]);
      } else {
        // Markers only: an invisible-free series still needs ink that names
        // it, so the markers carry the series.
        this.seriesRuns.set(s.id, [m.points.map((p) => this.at(p.x, p.y))]);
      }
    }
  }

  /** Markers and value labels of every series, after the guides so they paint over them. */
  seriesDots(): void {
    for (const [i, s] of (this.input.series ?? []).entries()) {
      const path = `series[${i}]`;
      const curve = this.curveById(s.id, path);
      const m = curve.measured!;
      const shape = s.markers === "square" ? "square" : s.markers === false ? null : s.markers === undefined ? (m.interpolate === "none" ? "circle" : null) : "circle";
      m.points.forEach((p, k) => {
        const c = this.at(p.x, p.y);
        if (shape !== null) {
          this.markerCentres.push(c);
          // A markers-only series has no line, so its markers ARE the series.
          if (m.interpolate === "none") {
            this.board.circle(c, 4.2, { fill: curve.colour, id: `${s.id}-marker-${k + 1}` });
            const mark = this.board.marks[this.board.marks.length - 1]!;
            mark.series = curve.series;
            this.board.reserve(c.x, c.y, 11, 11);
          } else {
            this.marker(c, shape, curve.colour, `${s.id}-marker-${k + 1}`, curve.series);
          }
        }
      });
      if (s.valueLabels === undefined || s.valueLabels === false) continue;
      const o = typeof s.valueLabels === "object" && !Array.isArray(s.valueLabels) ? s.valueLabels : {};
      const which = Array.isArray(s.valueLabels) ? s.valueLabels : o.at ?? m.points.map((_, k) => k);
      const given: XY[] = s.points ?? (s.values ?? []).map((v, k) => [k + 1, v] as XY);
      for (const k of which) {
        if (!Number.isInteger(k) || k < 0 || k >= m.points.length) {
          throw new SpecError(`${path}.valueLabels: ${k} is not the index of a point (0 to ${m.points.length - 1})`);
        }
        const p = m.points[k]!;
        // The ORIGINAL value, as given -- on the right axis too.
        const text = `${this.fmt(given[k]![1], o.decimals)}${o.suffix ?? ""}`;
        this.valueLabelsPending.push({ text, at: this.at(p.x, p.y), colour: curve.colour, towards: o.towards ?? ["U", "D", "NE", "NW", "SE", "SW", "R", "L"] });
      }
    }
  }

  /**
   * Value labels: each names its data point (a place), so it is held beside
   * it -- and a spot is taken only where that point is nearer the label than
   * any ink that does not pass through it, the measure
   * `label-nearest-its-place` applies. The first such clear spot in the
   * directions asked wins; with none, the least bad spot `place` finds.
   */
  valueLabels(): void {
    const b = this.board;
    const size = 12.5;
    for (const v of this.valueLabelsPending) {
      const w = b.measure(v.text, size, 0.1, 600);
      const h = Math.ceil(lineBox(size));
      const through = (s: { ax: number; ay: number; bx: number; by: number }): boolean =>
        segmentPointDistance(s, v.at) < 0.5;
      const rivals = b.ink.filter((s) => !through(s));
      let spot: Point | null = null;
      search: for (const d of dirsOf(v.towards, ["U"])) {
        // Straight above or below, the box may also slide sideways while it
        // still spans the point: off the axis beside the first category.
        const shifts = d.x === 0 ? [0, 4, -4, 8, -8, 12, -12, 16, -16].filter((t) => Math.abs(t) < w / 2 - 2) : [0];
        for (let k = 0; k <= 10; k += 1) {
          for (const shift of shifts) {
            const gap = 4 + 2 * k;
            // Beside the point in that direction: the box's near edge `gap` from it.
            const x = v.at.x + Math.sign(d.x) * (w / 2 + gap) + shift;
            const y = v.at.y + Math.sign(d.y) * (h / 2 + gap);
            const box = b.box(x, y, w, h);
            if (x - w / 2 < 4 || x + w / 2 > b.W - 4 || y - h / 2 < 4 || y + h / 2 > b.H - 4) continue;
            if (!b.clear(box, 1)) continue;
            const toPlace = rectPointDistance(box, v.at);
            if (toPlace > Math.max(w, h)) continue;
            if (rivals.some((s) => rectSegmentDistance(box, s) < toPlace + 1)) continue;
            // Other data points' markers: dots, which the ink record does not hold.
            if (this.markerCentres.some((c) => (c.x !== v.at.x || c.y !== v.at.y) && rectPointDistance(box, c) - 5 < toPlace + 1)) continue;
            spot = { x, y };
            break search;
          }
        }
      }
      const o = { size, weight: 600, colour: v.colour, annotatesPlace: v.at };
      if (spot !== null) b.label(v.text, spot.x, spot.y, { ...o, width: w });
      else b.place(v.text, v.at.x, v.at.y - h / 2 - 5, dirsOf(v.towards, ["U"]), { ...o, steps: 8 });
    }
  }

  /** Arrows along curves that ask for them: functions (increasing x) and series (their drawing order). */
  curveArrows(): void {
    const items: { id: string; arrows: ArrowsInput; path: string }[] = [
      ...(this.input.functions ?? []).flatMap((f, i) => (f.arrows === undefined ? [] : [{ id: f.id, arrows: f.arrows, path: `functions[${i}]` }])),
      ...(this.input.series ?? []).flatMap((s, i) => (s.arrows === undefined ? [] : [{ id: s.id, arrows: s.arrows, path: `series[${i}]` }])),
    ];
    for (const item of items) {
      const curve = this.curveById(item.id, item.path);
      const at = Array.isArray(item.arrows) ? item.arrows : item.arrows.at;
      const reverse = !Array.isArray(item.arrows) && item.arrows.reverse === true;
      let runs = this.seriesRuns.get(item.id);
      if (runs === undefined) {
        runs = this.polylines()
          .filter((r) => this.board.marks.find((m) => m.id === r.id)?.series === curve.series)
          .map((r) => r.pts);
      }
      const pts = runs.flat();
      if (pts.length < 2) throw new SpecError(`${item.path}.arrows: ${item.id} draws nothing to set an arrow on`);
      const ordered = reverse ? [...pts].reverse() : pts;
      at.forEach((f, k) => {
        const hit = alongPolyline(ordered, f);
        if (hit === null) return;
        this.arrowhead(hit.at, hit.dir, curve.colour, `${item.id}-arrow-${k + 1}`, curve.series);
      });
    }
  }

  /**
   * Grouped bars on the category axis: a bar's height IS its value, from
   * zero, so a y range that does not include zero is refused -- a truncated
   * bar is a different number drawn.
   */
  barsDraw(): void {
    const groups = this.input.bars ?? [];
    if (groups.length === 0) return;
    const cats = this.input.x.categories;
    if (cats === undefined) throw new SpecError(`bars stand on a category axis; give x "categories"`);
    if (this.yr[0] > 0 || this.yr[1] < 0) {
      throw new SpecError(`bars: the y range [${this.yr.join(", ")}] leaves out zero, and a bar's length is its value from zero`);
    }
    const width = 0.72;
    const each = width / groups.length;
    groups.forEach((g, j) => {
      const path = `bars[${j}]`;
      if (g.values.length !== cats.length) throw new SpecError(`${path}.values has ${g.values.length} value(s) for ${cats.length} categories`);
      const colour = colourOf(g.colour, BAR_COLOURS[j % BAR_COLOURS.length]!, `${path}.colour`);
      g.values.forEach((v, i) => {
        if (v < this.yr[0] - 1e-9 || v > this.yr[1] + 1e-9) throw new SpecError(`${path}.values[${i}] = ${v} lies outside the y range`);
        const x0 = i + 1 - width / 2 + j * each;
        const id = `${g.id}-${i + 1}`;
        const px = this.region(id, [
          { x: x0, y: 0 },
          { x: x0 + each, y: 0 },
          { x: x0 + each, y: v },
          { x: x0, y: v },
        ], colour);
        this.regionsPx.push(px);
        // The bar is ink a label search must keep off.
        this.board.trace([...px, px[0]!], colour, 1, id);
        if (g.valueLabels === true) {
          const top = this.at(i + 1 - width / 2 + (j + 0.5) * each, v);
          this.barLabels.push({ text: this.fmt(v), at: top, owner: id, colour: INK });
        }
      });
      if (g.legend !== undefined) {
        // A bar's fill is a surface colour, not an ink: the row's text is ink.
        this.regionLegend.push({ text: this.fill(g.legend, {}, `${path}.legend`), colour, width: 1, lineStyle: undefined, fill: colour, textColour: INK });
      }
    });
  }

  readonly barLabels: { text: string; at: Point; owner: string; colour: string }[] = [];
  /** Every series marker's centre: what a value label must stay farther from than its own point. */
  readonly markerCentres: Point[] = [];

  /** A bar's value above it, naming the bar. */
  barValueLabels(): void {
    for (const l of this.barLabels) {
      const { h } = this.board.extent(l.text, { size: 12 });
      this.board.place(l.text, l.at.x, l.at.y - h / 2 - 2, [DIRS.U], { size: 12, weight: 600, colour: l.colour, annotates: l.owner, steps: 6 });
    }
  }

  /**
   * Symbolic ticks and category names: a short tick on the axis, and the
   * typed name of the place beside it, declared to name that place.
   */
  symbolicTicks(): void {
    const b = this.board;
    for (const axis of ["x", "y"] as const) {
      const a = this.input[axis];
      const ticks: TickInput[] = [
        ...(a.categories ?? []).map((label, i) => ({ at: i + 1, label })),
        ...(a.ticks ?? []),
      ];
      const colour = colourOf(a.colour, SOFT, `${axis}.colour`);
      ticks.forEach((t, i) => {
        const c = axis === "x" ? this.at(t.at, this.baseY) : this.at(this.baseX, t.at);
        const id = `${axis}-symbol-${i + 1}`;
        const half = 4;
        const isCategory = axis === "x" && i < (a.categories ?? []).length;
        if (!isCategory) b.poly(axis === "x" ? [{ x: c.x, y: c.y - half }, { x: c.x, y: c.y + half }] : [{ x: c.x - half, y: c.y }, { x: c.x + half, y: c.y }], {
          stroke: AXIS,
          width: 1.6,
          id: `${id}-tick`,
        });
        const size = 13;
        const { h } = b.extent(t.label, { size });
        const w = b.measure(t.label, size, 0.1, 600);
        const start = axis === "x" ? { x: c.x, y: c.y + (isCategory ? 3 : 7) + h / 2 } : { x: c.x - 8 - w / 2, y: c.y };
        this.richPlace(t.label, start.x, start.y, axis === "x" ? [DIRS.D, DIRS.SE, DIRS.SW] : [DIRS.L, DIRS.NW, DIRS.SW], {
          size,
          weight: 600,
          colour,
          id,
          annotatesPlace: c,
          steps: 4,
        });
      });
    }
  }

  // ---- references ---------------------------------------------------------

  resolve(ref: PointRef, path: string): Resolved {
    if (Array.isArray(ref)) return { x: ref[0], y: ref[1] };
    if (typeof ref === "string") return this.pointById(ref, path);
    const curve = this.curveById(ref.of, `${path}.of`);
    if ("t" in ref || "theta" in ref) {
      const key = "t" in ref ? "t" : "theta";
      const wanted = key === "t" ? "parametric" : "polar";
      if (curve.kind !== wanted) {
        throw new SpecError(
          `${path}: {of, ${key}} reads a point off a ${wanted} curve by its ${key === "t" ? "parameter t" : "angle θ"}, ` +
            `and ${ref.of} is ${this.kindName(curve)}${this.readHint(curve)}`,
        );
      }
      const s = bound((ref as Record<string, Bound>)[key]!, `${path}.${key}`);
      const p = curve.param!(s);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        throw new SpecError(`${path}: ${ref.of} is not defined at ${key === "t" ? "t" : "θ"} = ${s}`);
      }
      return p;
    }
    if (curve.kind !== "graph" && curve.kind !== "line") {
      throw new SpecError(
        `${path}: {of, x} reads the value of a function at x, and ${ref.of} is ${this.kindName(curve)}, ` +
          `which has no single point at an x${this.readHint(curve)}`,
      );
    }
    if (curve.onY2 === true) {
      throw new SpecError(`${path}: ${ref.of} is read on the right axis; a point read off it would print the plane's y, not its own value -- use its "valueLabels"`);
    }
    if (curve.measured !== undefined && curve.pieces.length === 0) {
      throw new SpecError(`${path}: ${ref.of} is a series whose x does not run one way, so it has no single point at an x`);
    }
    const y = this.valueOn(curve, ref.x, ref.side);
    if (!Number.isFinite(y)) {
      throw new SpecError(`${path}: ${ref.of} is not defined at x = ${ref.x}`);
    }
    return { x: ref.x, y };
  }

  private readonly resolving = new Set<string>();

  /** Guard against a point defined through a line defined through that point. */
  private once<T>(key: string, path: string, make: () => T): T {
    if (this.resolving.has(key)) throw new SpecError(`${path}: ${key} is defined in terms of itself`);
    this.resolving.add(key);
    try {
      return make();
    } finally {
      this.resolving.delete(key);
    }
  }

  pointById(id: string, path: string): Resolved {
    const known = this.points.get(id);
    if (known !== undefined) return known;
    const inputs = this.input.points ?? [];
    const index = inputs.findIndex((p) => p.id === id);
    if (index < 0) {
      v.knownId(id, new Set(inputs.flatMap((p) => (p.id === undefined ? [] : [p.id]))), path, "a point");
    }
    const at = this.once(`point ${id}`, path, () => this.resolve(inputs[index]!.at, `points[${index}].at`));
    this.points.set(id, at);
    return at;
  }

  curveById(id: string, path: string): Curve {
    const known = this.curves.get(id);
    if (known !== undefined) return known;
    const fi = (this.input.functions ?? []).findIndex((f) => f.id === id);
    const li = (this.input.lines ?? []).findIndex((l) => l.id === id);
    const si = (this.input.series ?? []).findIndex((l) => l.id === id);
    if (fi < 0 && li < 0 && si < 0) {
      const ids = [...(this.input.functions ?? []), ...(this.input.lines ?? []), ...(this.input.series ?? [])].map((c) => c.id);
      v.knownId(id, new Set(ids), path, "a function, line or series");
    }
    const curve = this.once(`curve ${id}`, path, () =>
      fi >= 0
        ? this.functionCurve(this.input.functions![fi]!, `functions[${fi}]`)
        : li >= 0
          ? this.lineCurve(this.input.lines![li]!, `lines[${li}]`)
          : this.seriesCurve(this.input.series![si]!, `series[${si}]`),
    );
    this.curves.set(id, curve);
    if (!this.seriesColour.has(curve.series)) {
      this.seriesColour.set(curve.series, { colour: curve.colour, width: curve.width, lineStyle: curve.lineStyle });
    }
    return curve;
  }

  /** A curve's value at x, choosing the piece that ends (left) or starts (right) there. */
  valueOn(curve: Curve, x: number, side?: "left" | "right"): number {
    const eps = 1e-12;
    const inside = curve.pieces.filter((p) => x >= p.domain[0] - eps && x <= p.domain[1] + eps);
    if (inside.length === 0) return Number.NaN;
    let piece = inside[0]!;
    if (side === "left") piece = inside.find((p) => x > p.domain[0] + eps) ?? piece;
    if (side === "right") piece = inside.find((p) => x < p.domain[1] - eps) ?? piece;
    return piece.f(x);
  }

  // ---- templates ------------------------------------------------------

  /**
   * Fill "{...}" placeholders from computed values. Unknown placeholders are
   * refused: a label that silently printed "{Q}" would ship.
   */
  fill(template: string, own: { point?: Resolved; curve?: Curve }, path: string): string {
    const typed = typedCoordinate(template);
    if (typed !== null) {
      throw new SpecError(
        `${path} types the coordinate ${JSON.stringify(typed)} by hand. Compute it instead: ` +
          `"{coords}" for the labelled point's own, "{P}" for point P's, so the pair is written ` +
          `like ${formatPoint(2.5, 7.25, this.locale)} from the value the figure draws.`,
      );
    }
    return template.replace(/\{([^{}]*)\}/g, (_, body: string) => {
      const [head, decimalsText] = body.split(":");
      const decimals = decimalsText === undefined ? undefined : Number(decimalsText);
      if (decimals !== undefined && (!Number.isInteger(decimals) || decimals < 0 || decimals > 6)) {
        throw new SpecError(`${path}: "{${body}}" -- decimals after ":" must be an integer 0..6`);
      }
      const key = head!.trim();
      const opts = decimals === undefined ? {} : { decimals };
      if (key.startsWith("=")) {
        try {
          return this.fmt(compile(key.slice(1))(0), decimals);
        } catch (error) {
          throw new SpecError(`${path}: "{${body}}": ${(error as Error).message}`);
        }
      }
      if (key === "coords" || key === "x" || key === "y") {
        if (own.point === undefined) throw new SpecError(`${path}: "{${key}}" needs a point to belong to`);
        if (key === "coords") return formatPoint(own.point.x, own.point.y, this.locale, opts);
        return this.fmt(own.point[key], decimals);
      }
      if (key === "expr" || key === "slope" || key === "eq") {
        const curve = own.curve;
        if (curve === undefined) throw new SpecError(`${path}: "{${key}}" needs a curve to belong to`);
        return this.curveField(curve, key, path, decimals);
      }
      const dot = key.indexOf(".");
      const name = dot < 0 ? key : key.slice(0, dot);
      const field = dot < 0 ? "" : key.slice(dot + 1);
      if ((this.input.points ?? []).some((p) => p.id === name)) {
        const p = this.pointById(name, path);
        if (field === "") return formatPoint(p.x, p.y, this.locale, opts);
        if (field === "x" || field === "y") return this.fmt(p[field], decimals);
      }
      const isCurve = [...(this.input.functions ?? []), ...(this.input.lines ?? []), ...(this.input.series ?? [])].some((c) => c.id === name);
      if (isCurve && (field === "slope" || field === "expr" || field === "eq")) {
        return this.curveField(this.curveById(name, path), field, path, decimals);
      }
      throw new SpecError(
        `${path}: unknown placeholder "{${body}}". Available: {coords} {x} {y} (own point), {expr} {slope} ` +
          `{eq} (own curve), {P} {P.x} {P.y} (point P), {f.expr} {L.slope} {L.eq} (curve f, line L), {=2.5} (a number); ` +
          `add ":2" for fixed decimals.`,
      );
    });
  }

  /**
   * `fill` (or `fillValues`) for a label that may state an answer. With
   * answers:false it keeps only what precedes the first placeholder the
   * figure COMPUTES -- trailing "=", "≈", ":" and spaces dropped -- and gives
   * null when nothing is left: that label is not drawn. The whole template is
   * still filled first, so a broken one is refused either way.
   *
   * Computed: an area, integral or sum; a slope or a line's equation; a
   * line's {expr}; and a point's coordinates unless they were typed ([x, y]
   * given; for {of, x} only its x). A function's {expr} and {=…} are given.
   */
  asked(
    template: string,
    own: { point?: Resolved; curve?: Curve; at?: unknown },
    path: string,
    values?: Record<string, number | string>,
  ): string | null {
    const full = values === undefined ? this.fill(template, own, path) : this.fillValues(template, values, path);
    if (this.answers) return full;
    const lineIds = new Set((this.input.lines ?? []).map((l) => l.id));
    const typed = (at: unknown, key: string): boolean =>
      Array.isArray(at) || (key === "x" && typeof at === "object" && at !== null && (at as { x?: unknown }).x !== undefined);
    const computes = (key: string): boolean => {
      if (key.startsWith("=")) return false;
      if (values !== undefined && Object.hasOwn(values, key)) return key === "area" || key === "integral" || key === "sum";
      if (key === "coords" || key === "x" || key === "y") return !typed(own.at, key === "coords" ? "coords" : key);
      if (key === "slope" || key === "eq") return true;
      if (key === "expr") return own.curve !== undefined && lineIds.has(own.curve.id);
      const dot = key.indexOf(".");
      const name = dot < 0 ? key : key.slice(0, dot);
      const field = dot < 0 ? "coords" : key.slice(dot + 1);
      const point = (this.input.points ?? []).find((p) => p.id === name);
      if (point !== undefined) return !typed(point.at, field);
      return field === "slope" || field === "eq" || (field === "expr" && lineIds.has(name));
    };
    for (const m of template.matchAll(/\{([^{}]*)\}/g)) {
      if (!computes(m[1]!.split(":")[0]!.trim())) continue;
      const head = template.slice(0, m.index).replace(/[\s=≈:]+$/u, "");
      if (head.trim() === "") return null;
      return values === undefined ? this.fill(head, own, path) : this.fillValues(head, values, path);
    }
    return full;
  }

  curveField(curve: Curve, field: "expr" | "slope" | "eq", path: string, decimals?: number): string {
    if (field === "expr") return this.exprText(curve, path);
    if (field === "slope") return this.slopeText(curve, path, decimals);
    return this.eqText(curve, path);
  }

  /** A line's right-hand side, "9x \u2212 16", from its computed slope and intercept. */
  eqText(curve: Curve, path: string): string {
    if (curve.slope === undefined || curve.intercept === undefined) {
      throw new SpecError(`${path}: ${curve.id} is not a line, so "{eq}" has nothing to print`);
    }
    const variable = this.input.x.name || "x";
    const m = Math.abs(curve.slope) < 1e-9 ? 0 : curve.slope;
    const b = Math.abs(curve.intercept) < 1e-9 ? 0 : curve.intercept;
    if (m === 0) return this.fmt(b);
    const coefficient = Math.abs(m - 1) < 1e-9 ? "" : Math.abs(m + 1) < 1e-9 ? MINUS : this.fmt(m);
    const head = `${coefficient}${variable}`;
    if (b === 0) return head;
    return `${head} ${b < 0 ? MINUS : "+"} ${this.fmt(Math.abs(b))}`;
  }

  exprText(curve: Curve, path: string): string {
    if (curve.display !== undefined) return curve.display;
    if (curve.expr === undefined) throw new SpecError(`${path}: ${curve.id} has no single expression to print`);
    return pretty(parse(curve.expr, this.input.x.name || "x"), this.input.x.name || "x", this.locale === "pt-BR" ? "," : ".");
  }

  slopeText(curve: Curve, path: string, decimals?: number): string {
    if (curve.slope === undefined) throw new SpecError(`${path}: ${curve.id} is not a line, so it has no single slope`);
    return this.fmt(curve.slope, decimals);
  }

  // ---- drawing ----------------------------------------------------------

  frame(): void {
    const { input } = this;
    // Every number this figure prints is also REQUIRED, so the check that
    // the axis carries its numbers is not only about the ones the author
    // remembered to list.
    const lattice = (axis: AxisInput, step: number): number[] => {
      const every = Math.max(1, Math.round(axis.labelEvery ?? 1));
      const out: number[] = [];
      for (let k = Math.ceil(axis.range[0] / step - 1e-9); k * step <= axis.range[1] + 1e-9; k += 1) {
        if (k === 0 || k % every !== 0) continue;
        out.push(Number((k * step).toPrecision(12)));
      }
      return out;
    };
    // An axis without numbers requires none: it prints none, and says so below.
    if (!this.numberless("x")) for (const value of [...lattice(input.x, this.sx), ...(input.x.require ?? [])]) this.required.x.add(value);
    if (!this.numberless("y")) for (const value of [...lattice(input.y, this.sy), ...(input.y.require ?? [])]) this.required.y.add(value);
    // With no x numbers there is no "0" at the origin to stand for both
    // axes; a numbered y axis prints its own (a bar chart's baseline).
    if (this.numberless("x") && !this.numberless("y") && this.yr[0] <= 0 && this.yr[1] >= 0) this.required.y.add(0);
    const gridShown = input.axes?.grid ?? !(this.numberless("x") && this.numberless("y"));
    this.board.frames.push({
      id: "plane",
      origin: { x: this.ox, y: this.oy },
      xUnit: this.ux,
      yUnit: this.uy,
      grid: {
        // A category axis rules no line across its categories: the only
        // vertical line is its own edge (ADR 0066).
        x:
          input.x.categories === undefined
            ? { from: this.xr[0], to: this.xr[1], step: this.sx, origin: 0, require: [...this.required.x] }
            : { from: this.xr[0], to: this.xr[1], step: 2 * (this.xr[1] - this.xr[0]), origin: this.xr[0], require: [] },
        y: { from: this.yr[0], to: this.yr[1], step: this.sy, origin: 0, require: [...this.required.y] },
        axes: true,
        labels: false,
        stroke: gridShown ? GRID : "none",
        axisStroke: AXIS,
        labelColor: FAINT,
        lineStyle: "dashed",
      },
    });
    // An axis that prints no number DECLARES it (ADR 0066): a zero-ink mark
    // `<frame>-schematic-<axis>`, grid furniture, which `axis-number-present`
    // reads. The stand-in for a `GridAxis.schematic` the core does not have.
    for (const axis of ["x", "y"] as const) {
      if (!this.numberless(axis)) continue;
      const p = axis === "x" ? this.at(this.xr[1], this.baseY) : this.at(this.baseX, this.yr[1]);
      this.board.marks.push({
        id: `plane-schematic-${axis}`,
        gridOf: "plane",
        from: p,
        segments: [{ line: p }],
        close: false,
        fill: "none",
        stroke: "none",
        strokeWidth: 0,
      });
    }
    if (this.y2 !== undefined) {
      const y2 = this.y2;
      const required = this.input.y2!.schematic === true
        ? []
        : [...ticksIn(y2.range[0], y2.range[1], y2.step), ...(this.input.y2!.require ?? [])];
      this.required.y2 = new Set(required);
      // A frame of its own, only to carry the right axis's required numbers
      // to `axis-number-present`: no lines drawn, no numbers printed by it.
      // Its x step is wide so the check's reach across the axis covers a
      // number set beside the right edge.
      this.board.frames.push({
        id: "plane-y2",
        origin: { x: this.rightEdge, y: this.at(0, this.fromY2(0)).y },
        xUnit: 1,
        yUnit: y2.unit,
        grid: {
          x: { from: 0, to: 0, step: 60, origin: 0 },
          y: { from: y2.range[0], to: y2.range[1], step: y2.step, origin: 0, require: [...required] },
          axes: false,
          labels: false,
          stroke: "none",
        },
      });
    }
    if (this.measuredMode) {
      // Where zero is outside a range, the axis is ruled at the low edge:
      // a chart of 250 to 600 tonnes still stands on a line.
      if (this.baseY !== 0) {
        this.board.poly([this.at(this.xr[0], this.baseY), this.at(this.xr[1], this.baseY)], { stroke: AXIS, width: 2, id: "axis-edge-x" });
      }
      if (this.baseX !== 0) {
        this.board.poly([this.at(this.baseX, this.yr[0]), this.at(this.baseX, this.yr[1])], { stroke: AXIS, width: 2, id: "axis-edge-y" });
      }
      if (this.y2 !== undefined) {
        const colour = colourOf(this.input.y2!.colour, AXIS, "y2.colour");
        this.board.poly([this.at(this.xr[1], this.yr[0]), this.at(this.xr[1], this.yr[1])], { stroke: colour, width: 2, id: "axis-y2" });
      }
    }
    if (input.axes?.arrows ?? (this.schematic("x") || this.schematic("y"))) {
      const ex = this.at(this.xr[1], this.baseY);
      const ey = this.at(this.baseX, this.yr[1]);
      this.axisArrow(ex, { x: 1, y: 0 }, "axis-arrow-x");
      this.axisArrow(ey, { x: 0, y: -1 }, "axis-arrow-y");
    }
    // The axes are drawn by the core grid, not by this board, so the search
    // below would not see them. They are claimed as INK for the legend and
    // for labels: a legend over an axis was one of the defects this exists
    // to end.
    const a = this.at(this.xr[0], this.baseY);
    const b = this.at(this.xr[1], this.baseY);
    const c = this.at(this.baseX, this.yr[0]);
    const d = this.at(this.baseX, this.yr[1]);
    this.board.trace([a, b], AXIS, 2, "axis-x");
    this.board.trace([c, d], AXIS, 2, "axis-y");
  }

  curve(fn: (x: number) => number, a: number, b: number, style: Curve, idBase: string): void {
    const n = 240;
    let run: Point[] = [];
    const runs: Point[][] = [];
    const inside = (y: number): boolean => y >= this.yr[0] && y <= this.yr[1];
    let last: { x: number; y: number } | null = null;
    for (let i = 0; i <= n; i += 1) {
      const x = a + ((b - a) * i) / n;
      const y = fn(x);
      if (Number.isFinite(y) && inside(y)) {
        // Two samples both in range can straddle a pole (1/(x − 1) on a
        // tall y range: +60 at one sample, −60 at the next) or a jump. They
        // are joined only if the curve between them is continuous.
        if (last !== null && run.length > 0 && Math.abs(y - last.y) * this.uy > 8 && this.jumps(fn, last.x, x)) {
          if (run.length > 1) runs.push(run);
          run = [];
        }
        run.push(this.at(x, y));
        last = { x, y };
      } else {
        if (run.length > 1) runs.push(run);
        run = [];
        last = null;
      }
    }
    if (run.length > 1) runs.push(run);
    runs.forEach((r, i) =>
      this.board.poly(r, {
        id: `${idBase}${runs.length === 1 ? "" : `-${i + 1}`}`,
        stroke: style.colour,
        width: style.width,
        ...(style.lineStyle === undefined ? {} : { lineStyle: style.lineStyle }),
        series: style.series,
      }),
    );
  }

  /**
   * Does fn jump between x0 and x1 -- a pole or a discontinuity -- rather than
   * climb steeply? Bisect toward the half that changes more: a continuous
   * curve's change shrinks with the interval, a jump's does not.
   */
  jumps(fn: (x: number) => number, x0: number, x1: number): boolean {
    let a = x0;
    let b = x1;
    let ya = fn(a);
    let yb = fn(b);
    for (let k = 0; k < 60; k += 1) {
      if (Math.abs(yb - ya) * this.uy < 0.5) return false;
      const m = (a + b) / 2;
      if (m === a || m === b) break;
      const ym = fn(m);
      if (!Number.isFinite(ym)) return true;
      if (Math.abs(ym - ya) >= Math.abs(yb - ym)) {
        b = m;
        yb = ym;
      } else {
        a = m;
        ya = ym;
      }
    }
    return Math.abs(yb - ya) * this.uy > 2;
  }

  /**
   * A graph with asymptotes or holes (ADR 0038): sampled adaptively, like a
   * parametric curve in x, on each stretch between its breaks, and clipped
   * exactly to the plot -- so it runs up to the border beside a vertical
   * asymptote instead of stopping one even sample short, and no run is ever
   * joined across a pole. A hole's stretches end at the hole itself, under
   * its ring.
   */
  graphRuns(curve: Curve, a: number, b: number, breaks: number[], idBase: string): void {
    const view = this.view;
    const cuts = [a, ...breaks.filter((x) => x > a && x < b).sort((p, q) => p - q), b];
    const runs: Point[][] = [];
    for (let i = 0; i + 1 < cuts.length; i += 1) {
      const lo = i === 0 ? cuts[i]! : cuts[i]! + 1e-9 * Math.max(1, Math.abs(cuts[i]!));
      const hi = i + 2 === cuts.length ? cuts[i + 1]! : cuts[i + 1]! - 1e-9 * Math.max(1, Math.abs(cuts[i + 1]!));
      if (!(lo < hi)) continue;
      const sampled = sampleParametric(
        (s) => {
          const y = curve.at(s);
          return Number.isFinite(y) ? this.at(s, y) : null;
        },
        lo,
        hi,
        view,
      );
      runs.push(...clipRuns(sampled, view));
    }
    runs.forEach((r, i) =>
      this.board.poly(r, {
        id: `${idBase}${runs.length === 1 ? "" : `-${i + 1}`}`,
        stroke: curve.colour,
        width: curve.width,
        ...(curve.lineStyle === undefined ? {} : { lineStyle: curve.lineStyle }),
        series: curve.series,
      }),
    );
  }

  functionCurve(fn: FunctionInput, path: string): Curve {
    if (fn.implicit !== undefined || fn.r !== undefined || fn.x !== undefined || fn.y !== undefined) {
      return this.otherCurve(fn, path);
    }
    const variable = this.input.x.name || "x";
    const pieces = fn.pieces ?? [{ expr: fn.expr!, domain: fn.domain ?? this.xr }];
    const compiled = pieces.map((p, j) => {
      try {
        return { f: compile(p.expr, variable), domain: p.domain, source: p.expr };
      } catch (error) {
        throw new SpecError(`${path}${fn.pieces ? `.pieces[${j}]` : ""}.expr: ${(error as ExprError).message}`);
      }
    });
    const curve: Curve = {
      id: fn.id,
      series: fn.id,
      colour: colourOf(fn.colour, COLOURS.key!, `${path}.colour`),
      width: fn.width ?? 2.6,
      lineStyle: fn.style === "solid" ? undefined : fn.style,
      kind: "graph",
      at: () => Number.NaN,
      pieces: compiled,
      ...(fn.pieces === undefined ? { expr: fn.expr! } : {}),
    };
    curve.at = (x) => this.valueOn(curve, x);
    return curve;
  }

  /** What a curve is, for a message: "a parametric curve", "the graph of a function". */
  kindName(curve: Curve): string {
    return {
      graph: "the graph of a function",
      line: "a line",
      parametric: "a parametric curve",
      polar: "a polar curve",
      implicit: "an implicit curve",
    }[curve.kind];
  }

  /** How a point IS read off a curve of this kind, for a refusal to end on. */
  readHint(curve: Curve): string {
    switch (curve.kind) {
      case "parametric":
        return `; read a point off it by its parameter, {"of": "${curve.id}", "t": ...}`;
      case "polar":
        return `; read a point off it by its angle, {"of": "${curve.id}", "theta": ...}`;
      case "implicit":
        return `; an implicit curve has no parameter to read a point by, so place the point by its coordinates`;
      default:
        return `; read a point off it at an x, {"of": "${curve.id}", "x": ...}`;
    }
  }

  /** The plotted range in canvas pixels: where every curve is clipped. */
  get view(): Rect {
    const lo = this.at(this.xr[0], this.yr[1]);
    const hi = this.at(this.xr[1], this.yr[0]);
    return { x0: lo.x, x1: hi.x, y0: lo.y, y1: hi.y };
  }

  /**
   * A parametric, polar or implicit curve (ADR 0029). None has a y at each
   * x, so `at` is NaN everywhere and `pieces` is empty; what they have
   * instead is a point at each parameter (`param`) or a level set found by
   * contour (`paths`). Every expression is parsed over its OWN variables --
   * t, θ, or x and y -- and a name outside them is refused by name.
   */
  otherCurve(fn: FunctionInput, path: string): Curve {
    const style = {
      id: fn.id,
      series: fn.id,
      colour: colourOf(fn.colour, COLOURS.key!, `${path}.colour`),
      width: fn.width ?? 2.6,
      lineStyle: fn.style === "solid" ? undefined : fn.style,
      at: () => Number.NaN,
      pieces: [],
    };
    const decimal = this.locale === "pt-BR" ? "," : ".";
    const tree = (source: string, variables: string[], at: string): Node => {
      try {
        return parseIn(source, variables);
      } catch (error) {
        throw new SpecError(`${path}.${at}: ${(error as ExprError).message}`);
      }
    };
    const interval = (key: "t" | "theta"): [number, number] => {
      const raw = fn[key]!;
      const a = bound(raw[0], `${path}.${key}[0]`);
      const b = bound(raw[1], `${path}.${key}[1]`);
      if (!(a < b)) throw new SpecError(`${path}.${key} must have min < max, got [${a}, ${b}]`);
      return [a, b];
    };
    if (fn.implicit !== undefined) {
      // The axes' own names are further spellings of x and y, as a graph's
      // expression may be written in its axis's name: on an axis called "t"
      // the equation may say t. A name that is not a name ("t (h)") is not.
      const aliases: Record<string, string> = {};
      const xn = this.input.x.name ?? "x";
      const yn = this.input.y.name ?? "y";
      const usable = (name: string, other: string): boolean =>
        /^[A-Za-z][A-Za-z0-9]*$/.test(name) && name !== other && name !== "x" && name !== "y" && xn !== yn;
      if (usable(xn, "y")) aliases[xn] = "x";
      if (usable(yn, "x")) aliases[yn] = "y";
      let sides: { left: Node; right: Node };
      try {
        sides = parseEquation(fn.implicit, ["x", "y"], aliases);
      } catch (error) {
        throw new SpecError(`${path}.implicit: ${(error as ExprError).message}`);
      }
      const g = compileTree({ kind: "bin", op: "-", left: sides.left, right: sides.right }, ["x", "y"]);
      // About 3px a cell: the chord a cell draws then strays from the true
      // curve by well under a pixel at any curvature a figure can show.
      const cells = (pixels: number): number => Math.max(8, Math.min(400, Math.ceil(pixels / 3)));
      const view = this.view;
      const lines = contour(g, { x: this.xr, y: this.yr }, { cells: [cells(view.x1 - view.x0), cells(view.y1 - view.y0)] });
      const names: Record<string, string> = {};
      if (aliases[xn] === "x") names.x = xn;
      if (aliases[yn] === "y") names.y = yn;
      return {
        ...style,
        kind: "implicit",
        paths: lines,
        display: `${pretty(sides.left, names, decimal)} = ${pretty(sides.right, names, decimal)}`,
      };
    }
    if (fn.r !== undefined) {
      const r = tree(fn.r, ["θ"], "r");
      const rf = compileTree(r, ["θ"]);
      return {
        ...style,
        kind: "polar",
        interval: interval("theta"),
        param: (s) => {
          const radius = rf(s);
          return { x: radius * Math.cos(s), y: radius * Math.sin(s) };
        },
        display: pretty(r, undefined, decimal),
      };
    }
    const xt = tree(fn.x!, ["t"], "x");
    const yt = tree(fn.y!, ["t"], "y");
    const xf = compileTree(xt, ["t"]);
    const yf = compileTree(yt, ["t"]);
    const pair = this.locale === "pt-BR" ? "; " : ", ";
    return {
      ...style,
      kind: "parametric",
      interval: interval("t"),
      param: (s) => ({ x: xf(s), y: yf(s) }),
      display: `(${pretty(xt, undefined, decimal)}${pair}${pretty(yt, undefined, decimal)})`,
    };
  }

  /**
   * The nearest point of an implicit curve's level set to `p`: where a label
   * given near the curve is anchored ON it. An implicit curve has no
   * parameter to name a point by, so "near here" is how one is named.
   * Measured in pixels, so "nearest" is what a reader sees as nearest on a
   * plane whose axes have different units.
   */
  nearestOn(curve: Curve, p: Resolved): Resolved {
    let best: Resolved | null = null;
    let distance = Infinity;
    const pp = this.at(p.x, p.y);
    for (const line of curve.paths ?? []) {
      for (let i = 1; i < line.points.length; i += 1) {
        const a = line.points[i - 1]!;
        const b = line.points[i]!;
        const pa = this.at(a.x, a.y);
        const pb = this.at(b.x, b.y);
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const len2 = dx * dx + dy * dy;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((pp.x - pa.x) * dx + (pp.y - pa.y) * dy) / len2));
        const d = Math.hypot(pp.x - (pa.x + t * dx), pp.y - (pa.y + t * dy));
        if (d < distance) {
          distance = d;
          best = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        }
      }
    }
    return best ?? p;
  }

  lineCurve(line: LineInput, path: string): Curve {
    let p0: Resolved;
    let m: number;
    if (line.tangent !== undefined) {
      const of = this.curveById(line.tangent.of, `${path}.tangent.of`);
      if (of.kind === "parametric" || of.kind === "polar") {
        // `at` is the parameter here -- t, or θ -- and the slope is
        // y'(s)/x'(s), each a symmetric difference. A vertical tangent is
        // refused: a line in this preset is y = mx + b.
        const s = bound(line.tangent.at, `${path}.tangent.at`);
        const name = of.kind === "parametric" ? "t" : "θ";
        p0 = of.param!(s);
        const dx = derivative((u) => of.param!(u).x, s);
        const dy = derivative((u) => of.param!(u).y, s);
        if (![p0.x, p0.y, dx, dy].every(Number.isFinite) || Math.hypot(dx, dy) === 0) {
          throw new SpecError(`${path}.tangent: ${line.tangent.of} has no tangent at ${name} = ${s}`);
        }
        if (Math.abs(dx) <= 1e-9 * Math.hypot(dx, dy)) {
          throw new SpecError(
            `${path}.tangent: ${line.tangent.of} has a vertical tangent at ${name} = ${s}, and a line here is y = mx + b`,
          );
        }
        m = dy / dx;
      } else if (of.kind === "implicit") {
        throw new SpecError(
          `${path}.tangent: ${line.tangent.of} is an implicit curve, and a tangent's "at" names an x or a parameter ` +
            `it does not have. Draw the line through two computed points, or state the curve parametrically.`,
        );
      } else {
        const x = bound(line.tangent.at, `${path}.tangent.at`);
        p0 = { x, y: of.at(x) };
        m = derivative(of.at, x);
        if (!Number.isFinite(p0.y) || !Number.isFinite(m)) {
          throw new SpecError(`${path}.tangent: ${line.tangent.of} has no tangent at x = ${x}`);
        }
      }
    } else if (line.through !== undefined) {
      const a = this.resolve(line.through[0], `${path}.through[0]`);
      const b = this.resolve(line.through[1], `${path}.through[1]`);
      if (a.x === b.x) {
        throw new SpecError(`${path}.through: two points with the same x make a vertical line, not y = mx + b`);
      }
      p0 = a;
      m = (b.y - a.y) / (b.x - a.x);
    } else {
      p0 = this.resolve(line.point!, `${path}.point`);
      m = line.slope!;
    }
    const curve: Curve = {
      id: line.id,
      series: line.series ?? line.id,
      colour: colourOf(line.colour, COLOURS.warm!, `${path}.colour`),
      width: line.width ?? 2,
      lineStyle: line.style === "solid" ? undefined : line.style,
      kind: "line",
      at: (x) => p0.y + m * (x - p0.x),
      pieces: [],
      slope: m,
      intercept: p0.y - m * p0.x,
    };
    curve.pieces = [{ f: curve.at, domain: line.domain, source: "" }];
    return curve;
  }

  /** Every function, then every line, drawn in declaration order. */
  strokes(): void {
    for (const [i, fn] of (this.input.functions ?? []).entries()) {
      const curve = this.curveById(fn.id, `functions[${i}]`);
      if (curve.kind !== "graph") {
        this.otherStroke(curve, `functions[${i}]`);
        continue;
      }
      const breaks = this.graphBreaks.get(fn.id);
      if (breaks !== undefined) {
        const p = curve.pieces[0]!;
        this.graphRuns(curve, Math.max(p.domain[0], this.xr[0]), Math.min(p.domain[1], this.xr[1]), breaks, fn.id);
        continue;
      }
      curve.pieces.forEach((p, j) =>
        this.curve(p.f, p.domain[0], p.domain[1], curve, curve.pieces.length === 1 ? fn.id : `${fn.id}-p${j + 1}`),
      );
    }
    for (const [i, line] of (this.input.lines ?? []).entries()) {
      const curve = this.curveById(line.id, `lines[${i}]`);
      this.curve(curve.at, line.domain[0], line.domain[1], curve, line.id);
    }
  }

  /**
   * Draw a parametric, polar or implicit curve: sampled adaptively (or
   * traced by contour), clipped exactly to the plotted range, one mark per
   * visible run, every run carrying the curve's series -- so the checks that
   * hold graphs to being told apart and labelled hold these too. A run that
   * returns to where it started (a circle over [0, 2π]) is closed, so its
   * ends meet without a seam. A curve that draws nothing inside the range is
   * refused: the figure would assert a curve the reader cannot see.
   */
  otherStroke(curve: Curve, path: string): void {
    const view = this.view;
    let runs: Point[][];
    if (curve.kind === "implicit") {
      runs = clipRuns(
        (curve.paths ?? []).map((line) => line.points.map((p) => this.at(p.x, p.y))),
        view,
      );
    } else {
      const [a, b] = curve.interval!;
      runs = clipRuns(
        sampleParametric(
          (s) => {
            const p = curve.param!(s);
            return Number.isFinite(p.x) && Number.isFinite(p.y) ? this.at(p.x, p.y) : null;
          },
          a,
          b,
          view,
        ),
        view,
      );
    }
    if (runs.length === 0) {
      throw new SpecError(
        `${path}: ${curve.id} (${this.kindName(curve)}) draws nothing inside the plotted range ` +
          `x in [${this.xr.join(", ")}], y in [${this.yr.join(", ")}]`,
      );
    }
    runs.forEach((run, i) => {
      const first = run[0]!;
      const last = run[run.length - 1]!;
      const closed = run.length > 3 && Math.hypot(first.x - last.x, first.y - last.y) < 0.01;
      this.board.poly(closed ? run.slice(0, -1) : run, {
        id: `${curve.id}${runs.length === 1 ? "" : `-${i + 1}`}`,
        stroke: curve.colour,
        width: curve.width,
        ...(curve.lineStyle === undefined ? {} : { lineStyle: curve.lineStyle }),
        series: curve.series,
        close: closed,
      });
    });
  }

  guide(a: Point, b: Point, colour: string, width: number): void {
    const mark = this.board.poly([a, b], { stroke: colour, width, lineStyle: "dashed" });
    if (mark !== null) this.guideMarks.push(mark);
  }

  guides(): void {
    for (const [i, p] of (this.input.points ?? []).entries()) {
      if (p.guides === undefined || p.guides === false) continue;
      const at = this.resolve(p.at, `points[${i}].at`);
      if (p.guides !== "y") this.guide(this.at(at.x, this.baseY), this.at(at.x, at.y), SOFT, 1.1);
      if (p.guides !== "x") this.guide(this.at(this.baseX, at.y), this.at(at.x, at.y), SOFT, 1.1);
    }
    for (const [i, g] of (this.input.guides ?? []).entries()) {
      const colour = colourOf(g.colour, SOFT, `guides[${i}].colour`);
      if (g.x !== undefined) this.guide(this.at(g.x, g.from ?? this.yr[0]), this.at(g.x, g.to ?? this.yr[1]), colour, 1);
      else this.guide(this.at(g.from ?? this.xr[0], g.y!), this.at(g.to ?? this.xr[1], g.y!), colour, 1);
    }
  }

  dots(): void {
    for (const [i, p] of (this.input.points ?? []).entries()) {
      const at = this.resolve(p.at, `points[${i}].at`);
      const c = this.at(at.x, at.y);
      if (p.style === "open") {
        const colour = colourOf(p.colour, COLOURS.key!, `points[${i}].colour`);
        this.board.circle(c, 5.5, { stroke: colour, width: 2.2, fill: PAPER, ...(p.id === undefined ? {} : { id: `point-${p.id}` }) });
        this.board.reserve(c.x, c.y, 14, 14);
      } else {
        const colour = colourOf(p.colour, INK, `points[${i}].colour`);
        this.board.circle(c, 5, { fill: colour, ...(p.id === undefined ? {} : { id: `point-${p.id}` }) });
        this.board.reserve(c.x, c.y, 12, 12);
      }
    }
    // A Riemann sum's sample points: where f was read for each height. Each
    // is declared to lie on its curve, so `feature-on-its-curve` holds the
    // dot to the curve it claims -- a rectangle's top corner that missed the
    // curve would show as a dot beside it.
    for (const dot of this.sampleDots) {
      this.board.circle(dot.at, 3.6, { fill: dot.colour, id: dot.id, on: [dot.series] });
      this.board.reserve(dot.at.x, dot.at.y, 9, 9);
    }
    // A hole (ADR 0038): an open ring at (a, lim f), painted over the curve
    // with paper inside, so the stroke that runs up to the hole from either
    // side never shows through it. It is declared to lie on its curve, and
    // `feature-on-its-curve` holds the computed limit to the drawn curve.
    for (const hole of this.holeDots) {
      const c = this.at(hole.at.x, hole.at.y);
      this.board.circle(c, 5.5, { stroke: hole.colour, width: 2.2, fill: PAPER, id: hole.id, on: [hole.series] });
      this.board.reserve(c.x, c.y, 14, 14);
    }
  }

  /**
   * Tick numbers, drawn here rather than by the grid. A number is never
   * dropped: the intercept a curve runs through is often the very number the
   * exercise is about. If the usual spot has ink, the number slides along
   * its own gridline -- to either side of the axis, at most half a grid
   * step, so it always stays nearer its own tick than the next one. If the
   * gridline is inked all the way (a curve with a vertical tangent on it, a
   * curve through the origin along the diagonal "0" slides on), it may also
   * step off its line by up to a quarter division, the nearest clear spot
   * first -- but only when a backing would cut a curve: a backing over a
   * guide alone is the designed fallback, the guide being cut around the
   * number. Only if nothing is clear does the number keep the usual spot on
   * a paper backing, and a backing that CUTS a curve reads as a curve with a
   * gap (the hyperbola's vertex on x = -2, the rose through the origin), so
   * it is the last resort, not the second.
   */
  ticks(): void {
    const b = this.board;
    const size = 11;
    // Every spot within `rx` across and `ry` down of (x, y), 2px apart,
    // nearest first: where a number goes once its own line is all ink.
    const around = (x: number, y: number, rx: number, ry: number, minDy = 0): [number, number][] => {
      const out: [number, number, number][] = [];
      for (let dx = -Math.floor(rx / 2) * 2; dx <= rx; dx += 2) {
        for (let dy = -Math.floor(ry / 2) * 2; dy <= ry; dy += 2) {
          if (Math.abs(dy) < minDy) continue;
          out.push([x + dx, y + dy, Math.hypot(dx, dy)]);
        }
      }
      return out.sort((p, q) => p[2] - q[2]).map(([px, py]) => [px, py]);
    };
    const tryTick = (text: string, id: string, cands: [number, number][], spread: () => [number, number][] = () => [], colour = FAINT): void => {
      // Sized to the line box the browser will actually set (11px at a 1.45
      // line height), not to the glyphs: `text-clear-of-ink` measures the
      // line box, and a number cleared by a tighter estimate was reported
      // sitting on the curve it had just slid away from.
      const w = b.measure(text, size) - 8;
      const h = Math.ceil(size * 1.45);
      // A spot with a 3px margin is preferred to one with 1px: the width is an
      // estimate, and the same digits set in another machine's fallback font
      // came out wide enough on CI (Linux) to touch a curve that hugs the
      // axis -- "0" and "−3" beside the x = 0 asymptote of (x² + 1)/x. The
      // 1px spot stays the fallback, so no number loses a spot it had.
      const roomy = ([x, y]: [number, number]): boolean => b.clear(b.box(x, y, w, h), 3);
      const fits = ([x, y]: [number, number]): boolean => b.clear(b.box(x, y, w, h));
      // A backing over nothing but guides is the fallback as designed: the
      // guide is cut around the number (`breakGuides`) and no curve loses
      // ink. Only a backing that would cut a curve sends the number off its
      // gridline.
      const cutsCurve = ([x, y]: [number, number]): boolean => {
        const box = b.box(x, y, w, h);
        const all = b.inkThrough(box, 1);
        const guides = this.guideMarks.reduce((n, m) => n + all - b.inkThrough(box, 1, m.id), 0);
        return all - guides > 0;
      };
      const hit =
        cands.find(roomy) ??
        cands.find(fits) ??
        (cutsCurve(cands[0]!) ? (spread().find(roomy) ?? spread().find(fits)) : undefined);
      const [x, y] = hit ?? cands[0]!;
      const block = b.label(text, x, y, { size, colour, width: w, id, gridOf: id.startsWith("tick-y2") ? "plane-y2" : "plane", ...(hit ? {} : { fill: PAPER }) });
      this.tickBoxes.push(b.box(x, y, block.width!, block.height!));
    };
    // Every 2px up to the limit itself: a number that fits only at the last
    // few pixels of its half division must still find that spot rather than
    // fall back to a paper backing one step short of it.
    const walk = (x: number, y: number, dx: number, dy: number, max: number): [number, number][] => {
      const out: [number, number][] = [];
      for (let d = 0; d < max; d += 2) out.push([x + dx * d, y + dy * d]);
      out.push([x + dx * max, y + dy * max]);
      return out;
    };
    const halfX = (this.sx * this.ux) / 2;
    const halfY = (this.sy * this.uy) / 2;
    // The "0" at the origin belongs to the x axis's numbers: an x axis
    // without numbers prints none (ADR 0066).
    const origin = this.baseX === 0 && this.baseY === 0 && !this.numberless("x");
    const xZero = !this.numberless("x") && !(this.baseX === 0 && this.baseY === 0);
    if (origin) {
      const o = this.at(0, 0);
      const reach = Math.min(halfX, halfY);
      tryTick("0", "tick-origin", [...walk(o.x - 10, o.y + 13, -0.7, 0.7, reach), [o.x + 10, o.y + 13]], () =>
        // Off the axes: a "0" on either axis line is ink over ink.
        around(o.x, o.y, reach, reach).filter(([x, y]) => Math.abs(x - o.x) >= 8 && Math.abs(y - o.y) >= 11),
      );
    }
    const xs = [...this.required.x, ...(xZero && this.xr[0] <= 0 && 0 <= this.xr[1] ? [0] : [])].sort((p, q) => p - q);
    xs.forEach((value, i) => {
      const c = this.at(value, this.baseY);
      tryTick(this.fmt(value), `tick-x-${i}`, [...walk(c.x, c.y + 14, 0, 1, halfY), ...walk(c.x, c.y - 14, 0, -1, halfY)], () =>
        around(c.x, c.y, halfX / 2, 14 + halfY, 14),
      );
    });
    const ys = [...this.required.y].sort((p, q) => p - q);
    const yColour = colourOf(this.input.y.colour, FAINT, "y.colour");
    ys.forEach((value, i) => {
      const c = this.at(this.baseX, value);
      const t = this.fmt(value);
      const half = (b.measure(t, size) - 8) / 2;
      tryTick(t, `tick-y-${i}`, [...walk(c.x - 8 - half, c.y, -1, 0, halfX - half), ...walk(c.x + 8 + half, c.y, 1, 0, halfX - half)], () =>
        around(c.x, c.y, 8 + halfX, halfY / 2).filter(([x]) => Math.abs(x - c.x) >= 8 + half),
        yColour,
      );
    });
    // The right axis's numbers, beside it, outside the plot, in its colour.
    if (this.y2 !== undefined) {
      const colour = colourOf(this.input.y2!.colour, FAINT, "y2.colour");
      [...(this.required.y2 ?? [])].sort((p, q) => p - q).forEach((value, i) => {
        const y = this.at(0, this.fromY2(value)).y;
        const t = this.fmt(value);
        const half = (b.measure(t, size) - 8) / 2;
        const x = this.rightEdge + 8 + half;
        tryTick(t, `tick-y2-${i}`, walk(x, y, 1, 0, 8), () => [], colour);
      });
    }
  }

  /**
   * Guides yield to numbers. A dashed guide down to x = 2 runs along the
   * very gridline the number "2" slides on, so the number cannot get off it;
   * the guide is cut around the number instead.
   */
  breakGuides(): void {
    for (const mark of this.guideMarks) {
      const a = mark.from as Point;
      const bEnd = (mark.segments[0] as { line: Point }).line;
      const vertical = Math.abs(a.x - bEnd.x) < 1e-6;
      const horizontal = Math.abs(a.y - bEnd.y) < 1e-6;
      if (!vertical && !horizontal) continue;
      const lo = vertical ? Math.min(a.y, bEnd.y) : Math.min(a.x, bEnd.x);
      const hi = vertical ? Math.max(a.y, bEnd.y) : Math.max(a.x, bEnd.x);
      const gaps: [number, number][] = [];
      for (const t of this.tickBoxes) {
        const pad = 3;
        if (vertical && Math.abs(t.x - a.x) < t.hw + pad) gaps.push([t.y - t.hh - pad, t.y + t.hh + pad]);
        if (horizontal && Math.abs(t.y - a.y) < t.hh + pad) gaps.push([t.x - t.hw - pad, t.x + t.hw + pad]);
      }
      const cuts = gaps.filter(([g0, g1]) => g1 > lo && g0 < hi).sort((p, q) => p[0] - q[0]);
      if (cuts.length === 0) continue;
      const spans: [number, number][] = [];
      let cursor = lo;
      for (const [g0, g1] of cuts) {
        if (g0 > cursor) spans.push([cursor, g0]);
        cursor = Math.max(cursor, g1);
      }
      if (cursor < hi) spans.push([cursor, hi]);
      const point = (s: number): Point => (vertical ? { x: a.x, y: s } : { x: s, y: a.y });
      const index = this.board.marks.indexOf(mark);
      const replacement: Mark[] = spans
        .filter(([s0, s1]) => s1 - s0 > 2)
        .map(([s0, s1], j) => ({ ...mark, id: `${mark.id}-${j + 1}`, from: point(s0), segments: [{ line: point(s1) }] }));
      this.board.marks.splice(index, 1, ...replacement);
    }
  }

  curveLabels(): void {
    const all: [FunctionInput | LineInput | SeriesInput, string][] = [
      ...(this.input.functions ?? []).map((f, i) => [f, `functions[${i}]`] as [FunctionInput, string]),
      ...(this.input.lines ?? []).map((l, i) => [l, `lines[${i}]`] as [LineInput, string]),
      ...(this.input.series ?? []).map((l, i) => [l, `series[${i}]`] as [SeriesInput, string]),
    ];
    for (const [item, path] of all) {
      if (item.label === undefined) continue;
      const curve = this.curveById(item.id, path);
      const where = this.labelAnchor(curve, item.label.at, `${path}.label.at`);
      if (!Number.isFinite(where.y)) throw new SpecError(`${path}.label.at: ${item.id} is not defined there`);
      const c = this.at(where.x, where.y);
      const text = this.asked(item.label.text, { curve }, `${path}.label.text`);
      if (text === null) continue;
      this.board.place(text, c.x, c.y, dirsOf(item.label.towards, ["R", "U", "L", "D"]), {
        size: item.label.size ?? 14,
        weight: 600,
        colour: curve.colour,
        names: curve.series,
      });
    }
  }

  /**
   * Where a curve's label is anchored. A number is the curve's own
   * coordinate: x on a graph or a line, t on a parametric curve, θ on a
   * polar one. An implicit curve has no such coordinate, so it takes a point
   * and anchors at the nearest point OF the curve -- the label then walks
   * out from the curve like any other, instead of from wherever the author
   * guessed the curve would be.
   */
  labelAnchor(curve: Curve, at: number | PointRef, path: string): Resolved {
    if (curve.kind === "implicit") {
      if (typeof at === "number") {
        throw new SpecError(
          `${path}: ${curve.id} is an implicit curve, so a number names no point on it. ` +
            `Give a point near where the label belongs, [x, y]; it is anchored at the curve's nearest point.`,
        );
      }
      return this.nearestOn(curve, this.resolve(at, path));
    }
    if (typeof at !== "number") return this.resolve(at, path);
    if (curve.kind === "parametric" || curve.kind === "polar") return curve.param!(at);
    return { x: at, y: curve.at(at) };
  }

  pointLabels(): void {
    for (const [i, p] of (this.input.points ?? []).entries()) {
      if (p.label === undefined) continue;
      const at = this.resolve(p.at, `points[${i}].at`);
      const c = this.at(at.x, at.y);
      const colour = colourOf(p.colour, INK, `points[${i}].colour`);
      const text = this.asked(p.label, { point: at, at: p.at }, `points[${i}].label`);
      if (text === null) continue;
      const preferred = dirsOf(p.towards, ["NE", "NW", "SE", "SW"]);
      // The author's directions were chosen for the whole label; one cut down
      // to its name may take any side, the closest clear one.
      const dirs = this.answers ? preferred : [...preferred, ...Object.values(DIRS).filter((d) => !preferred.includes(d))];
      this.board.place(text, c.x, c.y, dirs, {
        size: p.size ?? 14,
        weight: 600,
        colour,
        // A label cut down to its name ("A") is small, and must sit within its own
        // size of the point: take the closest clear spot, not the first direction's.
        ...(this.answers ? {} : { nearest: true }),
        // It names the point (ADR 0035), so `label-nearest-its-place` holds
        // it beside that point; the dot drawn there is the place made
        // visible and does not compete.
        annotatesPlace: c,
      });
    }
  }

  freeLabels(): void {
    for (const [i, l] of (this.input.labels ?? []).entries()) {
      const path = `labels[${i}]`;
      const at = this.resolve(l.at, `${path}.at`);
      const c = this.at(at.x, at.y);
      if (l.names !== undefined && !this.seriesColour.has(l.names)) {
        v.knownId(l.names, new Set(this.seriesColour.keys()), `${path}.names`, "a series");
      }
      const fallback = l.names === undefined ? INK : this.seriesColour.get(l.names)!.colour;
      const text = this.asked(l.text, { point: at, at: l.at }, `${path}.text`);
      if (text === null) continue;
      this.board.place(text, c.x, c.y, dirsOf(l.towards, ["R", "U", "L", "D"]), {
        size: l.size ?? 14,
        weight: l.weight ?? 600,
        colour: colourOf(l.colour, fallback, `${path}.colour`),
        // A free label names its series when it says so, and otherwise the
        // point it was anchored at (ADR 0035): never nothing.
        ...(l.names === undefined ? { annotatesPlace: c } : { names: l.names }),
      });
    }
  }

  /** Where the axis names usually go, as boxes: what a label placed before them keeps off. */
  axisNameSpots(): Box[] {
    const out: Box[] = [];
    const xn = this.input.x.name ?? "x";
    const yn = this.input.y.name ?? "y";
    if (xn !== "") {
      const ex = this.at(this.xr[1], this.baseY);
      const { w, h } = this.board.extent(xn, { size: 15 });
      out.push(this.board.box(ex.x + 14, ex.y - 12, w, h));
    }
    if (yn !== "") {
      const ey = this.at(this.baseX, this.yr[1]);
      const { w, h } = this.board.extent(yn, { size: 15 });
      out.push(this.board.box(ey.x + 16, ey.y + 4, w, h));
    }
    return out;
  }

  axisNames(): void {
    const xn = this.input.x.name ?? "x";
    const yn = this.input.y.name ?? "y";
    // An axis name names its axis, but the axis is grid furniture the
    // resolver draws after this preset returns, so there is no id to name
    // yet; it is declared free-standing instead (ADR 0035).
    const o = { size: 15, weight: 600, colour: SOFT, serif: true, freeStanding: true as const };
    const of = (axis: "x" | "y" | "y2") => {
      const c = this.input[axis]?.colour;
      return c === undefined ? o : { ...o, colour: colourOf(c, SOFT, `${axis}.colour`) };
    };
    if (xn !== "") {
      const ex = this.at(this.xr[1], this.baseY);
      if (this.schematic("x")) {
        // At the arrow's tip: a qualitative graph names its axis where it points.
        const { w } = this.board.extent(xn, { size: 15, weight: 600 });
        this.placeName(xn, ex.x + 16 + w / 2, ex.y + 14, [DIRS.R, DIRS.D, DIRS.U], of("x"));
      } else if (this.measuredMode) {
        // Under the axis's numbers or names, centred, as a chart sets it (ADR 0066).
        const mid = this.at((this.xr[0] + this.xr[1]) / 2, this.yr[0]);
        this.placeName(xn, mid.x, mid.y + 44, [DIRS.D, DIRS.R, DIRS.L], of("x"));
      } else {
        this.placeName(xn, ex.x + 14, ex.y - 12, [DIRS.R, DIRS.U], of("x"));
      }
    }
    if (yn !== "") {
      const ey = this.at(this.baseX, this.yr[1]);
      if (this.measuredMode) {
        // Above the axis, outside the plot (ADR 0066): a chart's data runs
        // to its top corner, where a name inside would sit on it.
        const { w } = this.board.extent(yn, { size: 15, weight: 600 });
        this.placeName(yn, ey.x - 10 + w / 2, ey.y - 24, [DIRS.R, DIRS.U], of("y"));
      } else {
        this.placeName(yn, ey.x + 16, ey.y + 4, [DIRS.R, DIRS.D], of("y"));
      }
    }
    const y2n = this.input.y2?.name ?? "";
    if (this.y2 !== undefined && y2n !== "") {
      const { w } = this.board.extent(y2n, { size: 15, weight: 600 });
      this.placeName(y2n, this.rightEdge + 10 - w / 2, this.at(0, this.yr[1]).y - 24, [DIRS.L, DIRS.U], of("y2"));
    }
  }

  /** An axis name; with real subscripts when it has any ("NO_x (ppm)"). */
  placeName(text: string, cx: number, cy: number, dirs: Point[], o: LabelOptions): void {
    if (/[_^]/.test(text)) this.richPlace(text, cx, cy, dirs, o);
    else this.board.place(text, cx, cy, dirs, o);
  }

  /** Legend rows in declaration order: functions first, then lines, one per series. */
  legendRows(): LegendRow[] {
    const rows: LegendRow[] = [];
    const all: [FunctionInput | LineInput | SeriesInput, string][] = [
      ...(this.input.functions ?? []).map((f, i) => [f, `functions[${i}]`] as [FunctionInput, string]),
      ...(this.input.lines ?? []).map((l, i) => [l, `lines[${i}]`] as [LineInput, string]),
      ...(this.input.series ?? []).map((l, i) => [l, `series[${i}]`] as [SeriesInput, string]),
    ];
    for (const [item, path] of all) {
      if (item.legend === undefined) continue;
      const curve = this.curveById(item.id, path);
      const text = this.asked(item.legend, { curve }, `${path}.legend`);
      if (text === null) continue;
      rows.push({
        text,
        colour: curve.colour,
        width: curve.width,
        lineStyle: curve.lineStyle,
      });
    }
    // Then areas and sums (ADR 0036), each with a filled swatch.
    return [...rows, ...this.regionLegend];
  }

  /**
   * A legend of swatch + text rows, placed where nothing is.
   *
   * The search is the one `place()` makes for a label, widened to two
   * dimensions: every position on a 6px lattice inside the plot, scored by
   * the ink it would cover (curves, guides, the axes) and the labels and
   * numbers it would overlap. Plot corners are tried first -- a legend in a
   * corner reads as furniture; one in the middle reads as data -- and the
   * first clear spot wins. Only a figure with no clear spot at all falls
   * back to the least bad one, and the checks say so.
   */
  legend(): void {
    const rows = this.legendRows();
    if (rows.length === 0) return;
    const b = this.board;
    const size = 13.5;
    const rowH = 24;
    const widths = rows.map((r) => b.measure(r.text, size));
    const W = 34 + Math.max(...widths);
    const H = (rows.length - 1) * rowH + Math.ceil(size * 1.45 + 3);
    let origin: Point;
    if (this.input.legend?.at !== undefined) {
      const c = this.at(this.input.legend.at[0], this.input.legend.at[1]);
      origin = { x: c.x, y: c.y };
    } else {
      const plot = { x0: this.at(this.xr[0], 0).x, x1: this.at(this.xr[1], 0).x, y0: this.at(0, this.yr[1]).y, y1: this.at(0, this.yr[0]).y };
      const inset = 6;
      const score = (x: number, y: number): number => {
        // (x, y) is the centre of the first row's swatch start; the box is
        // the whole legend, padded so it does not sit flush against ink.
        const box = b.box(x + W / 2, y - rowH / 2 + H / 2 + 1, W + 8, H + 8);
        const ink = b.inkThrough(box, 0);
        const labels = b.taken.filter((t) => b.hits(box, t, 0)).length;
        // A legend over a shaded region reads as part of it.
        return ink + labels * 3 + (this.overRegion(box) ? 2 : 0);
      };
      const candidates: { x: number; y: number; rank: number }[] = [];
      const corners: Point[] = [
        { x: plot.x0 + inset, y: plot.y0 + inset + rowH / 2 },
        { x: plot.x1 - inset - W, y: plot.y0 + inset + rowH / 2 },
        { x: plot.x1 - inset - W, y: plot.y1 - inset - H + rowH / 2 },
        { x: plot.x0 + inset, y: plot.y1 - inset - H + rowH / 2 },
      ];
      for (let x = plot.x0 + inset; x + W <= plot.x1 - inset; x += 6) {
        for (let y = plot.y0 + inset + rowH / 2; y + H - rowH / 2 <= plot.y1 - inset; y += 6) {
          const rank = Math.min(...corners.map((c) => Math.hypot(c.x - x, c.y - y)));
          candidates.push({ x, y, rank });
        }
      }
      candidates.sort((p, q) => p.rank - q.rank);
      // Among the spots that touch nothing, the one with the most room around
      // it: the first clear spot near a corner was, in figure 2.5, a spot
      // pressed against P and the tangent -- clear by a pixel, and read as
      // part of the data. Clearance is measured in steps up to 24px; the
      // corner ranking only breaks ties.
      const clearance = (x: number, y: number): number => {
        let room = 0;
        for (const pad of [4, 8, 12, 16, 20, 24]) {
          const box = b.box(x + W / 2, y - rowH / 2 + H / 2 + 1, W + 8 + 2 * pad, H + 8 + 2 * pad);
          if (b.inkThrough(box, 0) > 0 || b.taken.some((t) => b.hits(box, t, 0)) || this.overRegion(box)) break;
          room = pad;
        }
        return room;
      };
      let best: { x: number; y: number; n: number; room: number } | null = null;
      for (const cand of candidates) {
        const n = score(cand.x, cand.y);
        const room = n === 0 ? clearance(cand.x, cand.y) : -1;
        if (best === null || n < best.n || (n === 0 && room > best.room)) best = { x: cand.x, y: cand.y, n, room };
        if (n === 0 && room >= 24) break;
      }
      origin = best === null ? corners[0]! : { x: best.x, y: best.y };
    }
    rows.forEach((row, i) => {
      const yy = origin.y + i * rowH;
      // A region's swatch is a small filled box, not a line; its row names a
      // point just inside the box's right edge, and a closed marker that
      // small containing the place IS the place (ADR 0035). The box is 10px
      // tall so the next row's box stays farther from this row's text than
      // its own place is.
      const place = row.fill === undefined ? { x: origin.x + 26, y: yy } : { x: origin.x + 21, y: yy };
      if (row.fill === undefined) {
        b.poly(
          [
            { x: origin.x, y: yy },
            { x: origin.x + 26, y: yy },
          ],
          { stroke: row.colour, width: 2.4, ...(row.lineStyle === undefined ? {} : { lineStyle: row.lineStyle }), id: `legend-swatch-${i + 1}` },
        );
      } else {
        b.poly(
          [
            { x: origin.x + 2, y: yy - 5 },
            { x: origin.x + 22, y: yy - 5 },
            { x: origin.x + 22, y: yy + 5 },
            { x: origin.x + 2, y: yy + 5 },
          ],
          { stroke: row.colour, width: row.width, fill: row.fill, close: true, id: `legend-swatch-${i + 1}` },
        );
      }
      b.label(row.text, origin.x + 34 + widths[i]! / 2, yy, {
        size,
        weight: 600,
        colour: row.textColour ?? row.colour,
        width: widths[i]!,
        align: "start",
        id: `legend-${i + 1}`,
        // A legend row names the end of its own swatch (ADR 0028).
        annotatesPlace: place,
      });
    });
  }

  // ---- areas and Riemann sums (ADR 0036) ----------------------------------

  /** A graph or a line: what an area or a sum is taken under. Anything else is refused by name. */
  graphOf(id: string, path: string, what: string): Curve {
    const curve = this.curveById(id, path);
    if (curve.kind !== "graph" && curve.kind !== "line") {
      throw new SpecError(
        `${path}: ${id} is ${this.kindName(curve)}; ${what} is taken under the graph of a function y = f(x) or a line`,
      );
    }
    if (curve.measured !== undefined && (curve.pieces.length === 0 || curve.onY2 === true)) {
      throw new SpecError(
        `${path}: ${id} is a series ${curve.onY2 === true ? "read on the right axis, on another scale" : "that is no function of x"}; ${what} is taken under a series on the y axis whose x runs one way`,
      );
    }
    return curve;
  }

  /** A region's edge along a curve: a measured series' own vertices, else sampled from the expression. */
  edge(curve: Curve, a: number, b: number): XYPoint[] {
    return curve.measured !== undefined ? edgeOf(curve.measured, curve.at, a, b) : sampleEdge(curve.at, a, b, this.ux, this.uy);
  }

  /** The x interval a graph or line is drawn over, within the plotted range. */
  extentOf(curve: Curve): [number, number] {
    const lo = Math.min(...curve.pieces.map((p) => p.domain[0]));
    const hi = Math.max(...curve.pieces.map((p) => p.domain[1]));
    return [Math.max(lo, this.xr[0]), Math.min(hi, this.xr[1])];
  }

  /** Where a piecewise curve joins: an integral is split there so Simpson never straddles a jump. */
  breaksOf(...curves: Curve[]): number[] {
    return curves.flatMap((c) => (c.pieces.length > 1 ? c.pieces.flatMap((p) => p.domain) : []));
  }

  /**
   * A closed region, stated in the plane's own frame: every vertex is
   * `{frame: "plane", x, y}` in axis units, so frame resolution -- not this
   * preset -- turns it into pixels and records the scale
   * `area-matches-its-label` measures it in (ADR 0037). Returns the outline in
   * canvas px for the label search.
   */
  region(id: string, vertices: XYPoint[], fill: string, stroke?: { colour: string; width: number }): Point[] {
    const framed = vertices.map((p) => ({ frame: "plane", x: p.x, y: p.y }));
    const px = vertices.map((p) => this.at(p.x, p.y));
    this.board.marks.push({
      id,
      from: framed[0]!,
      segments: framed.slice(1).map((p) => ({ line: p })),
      close: true,
      fill,
      stroke: stroke?.colour ?? "none",
      strokeWidth: stroke?.width ?? 0,
    });
    if (stroke !== undefined) this.board.trace([...px, px[0]!], stroke.colour, stroke.width, id);
    return px;
  }

  /** The bounds of an area or a sum: two Bounds, inside the plotted x range, a < b. */
  bounds(item: { from?: Bound; to?: Bound }, path: string): [number, number] {
    if (item.from === undefined || item.to === undefined) {
      throw new SpecError(`${path} needs both "from" and "to"`);
    }
    const a = bound(item.from, `${path}.from`);
    const b = bound(item.to, `${path}.to`);
    if (!(a < b)) throw new SpecError(`${path}: "from" must be less than "to", got [${a}, ${b}]`);
    if (a < this.xr[0] - 1e-9 || b > this.xr[1] + 1e-9) {
      throw new SpecError(`${path}: [${a}, ${b}] reaches outside the plotted x range [${this.xr.join(", ")}]`);
    }
    return [a, b];
  }

  /** Refuse a region the plotted y range would cut: its drawn area would not be the one printed. */
  insideY(vertices: XYPoint[], path: string): void {
    const ys = vertices.map((p) => p.y);
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    const slack = 1e-9 * Math.max(1, this.yr[1] - this.yr[0]);
    if (lo < this.yr[0] - slack || hi > this.yr[1] + slack) {
      throw new SpecError(
        `${path}: the region reaches y = ${Number((lo < this.yr[0] - slack ? lo : hi).toPrecision(4))}, outside the ` +
          `plotted y range [${this.yr.join(", ")}]; widen y.range so the whole region is drawn -- a clipped region ` +
          `would not have the area printed in it`,
      );
    }
  }

  /**
   * A value for a label: an exact decimal of up to six places when that is
   * what the value is (2, 0,25, a Riemann sum 2,65625); else the formatter's
   * exact fraction (4/3, 8/3); else the formatter's three decimals, flagged
   * inexact so the "=" before it becomes "≈".
   */
  valueText(value: number, decimals?: number): Printed {
    // The formatter's own tolerance (a fraction is what a float within 1e-7
    // of it IS), and a much tighter one for a long decimal: 1,718282 is e's
    // integral to within 2e-7, and printing it without "≈" would claim it
    // exact.
    const close = (t: string, tolerance = 1e-7): boolean => {
      const back = parseNumber(t, this.locale);
      return back !== null && Math.abs(back - value) <= tolerance * Math.max(1, Math.abs(value));
    };
    if (decimals !== undefined) {
      const text = this.fmt(value, decimals);
      return { text, exact: close(text, 1e-9) };
    }
    // An exact decimal first: a Riemann sum of 35/16 is compared with the
    // integral beside it, and 2,1875 is how a student compares it.
    for (let d = 0; d <= 6; d += 1) {
      const fixed = this.fmt(value, d);
      if (close(fixed, 1e-9)) return { text: fixed, exact: true };
    }
    const text = this.fmt(value);
    return { text, exact: close(text) };
  }

  /**
   * Fill a region's or a sum's template: its own values first -- a number
   * that had to be rounded turns the "=" just before it into "≈" -- then every
   * placeholder any label may use, through `fill`.
   */
  fillValues(template: string, values: Record<string, number | string>, path: string): string {
    let out = "";
    let last = 0;
    for (const match of template.matchAll(/\{([^{}]*)\}/g)) {
      const [head, decimalsText] = match[1]!.split(":");
      const key = head!.trim();
      if (!Object.hasOwn(values, key)) continue;
      out += template.slice(last, match.index);
      last = match.index! + match[0].length;
      const value = values[key]!;
      if (typeof value === "string") {
        out += value;
        continue;
      }
      const decimals = decimalsText === undefined ? undefined : Number(decimalsText);
      if (decimals !== undefined && (!Number.isInteger(decimals) || decimals < 0 || decimals > 6)) {
        throw new SpecError(`${path}: "${match[0]}" -- decimals after ":" must be an integer 0..6`);
      }
      const { text, exact } = this.valueText(value, decimals);
      if (!exact) out = out.replace(/=(\s*)$/, "≈$1");
      out += text;
    }
    out += template.slice(last);
    return this.fill(out, {}, path);
  }

  /**
   * Every `areas` entry: split where the integrand changes sign, each part
   * one closed mark sampled from the curves and labelled with its own area
   * from numeric.integrate. Drawn before the curves, so they paint over it.
   */
  areas(): void {
    for (const [i, area] of (this.input.areas ?? []).entries()) {
      const path = `areas[${i}]`;
      const id = area.id ?? `area-${i + 1}`;
      const f =
        area.between === undefined
          ? this.graphOf(area.of!, `${path}.of`, "an area")
          : this.graphOf(area.between[0], `${path}.between[0]`, "an area");
      const g = area.between === undefined ? undefined : this.graphOf(area.between[1], `${path}.between[1]`, "an area");
      const h = g === undefined ? (x: number) => f.at(x) : (x: number) => f.at(x) - g.at(x);
      let a: number;
      let b: number;
      if (area.from !== undefined || area.to !== undefined || g === undefined) {
        [a, b] = this.bounds(area, path);
      } else {
        // Bounded by the curves themselves: their first and last intersection.
        const [f0, f1] = this.extentOf(f);
        const [g0, g1] = this.extentOf(g);
        const lo = Math.max(f0, g0);
        const hi = Math.min(f1, g1);
        const roots = lo < hi ? intersections(h, lo, hi) : [];
        if (roots.length < 2) {
          throw new SpecError(
            `${path}: ${f.id} and ${g.id} meet ${roots.length === 0 ? "nowhere" : "once"} in x ∈ [${lo}, ${hi}], ` +
              `and an area between them with no "from"/"to" is bounded by two intersections; give "from" and "to"`,
          );
        }
        a = roots[0]!;
        b = roots[roots.length - 1]!;
      }
      const breaks = this.breaksOf(f, ...(g === undefined ? [] : [g]));
      let parts: { from: number; to: number; sign: 1 | -1; value: number }[];
      try {
        parts = signParts(h, a, b).map((p) => ({ ...p, value: integral(h, p.from, p.to, breaks) }));
      } catch (error) {
        if (!(error instanceof NumericError)) throw error;
        throw new SpecError(`${path}: the area on [${a}, ${b}] is refused, not printed: ${error.message}`);
      }
      if (parts.length === 0) {
        throw new SpecError(
          `${path}: ${g === undefined ? `${f.id} is zero` : `${f.id} and ${g.id} coincide`} on [${a}, ${b}], so there is no region to shade`,
        );
      }
      const positive = colourOf(area.colour, f.colour, `${path}.colour`);
      const negative = colourOf(area.negativeColour, COLOURS.rust!, `${path}.negativeColour`);
      const several = parts.length > 1;
      const labelObject = typeof area.label === "object" ? area.label : undefined;
      const template =
        area.label === false
          ? null
          : (typeof area.label === "string" ? area.label : labelObject?.text) ?? (several ? "A{i} = {area}" : "A = {area}");
      const totalArea = parts.reduce((sum, p) => sum + Math.abs(p.value), 0);
      const totalIntegral = parts.reduce((sum, p) => sum + p.value, 0);
      const totals = { area: totalArea, integral: totalIntegral };
      const captionTemplate =
        area.total === false
          ? null
          : typeof area.total === "string"
            ? area.total
            : area.value === "integral"
              ? "∫ = {integral}"
              : several || area.total === true
                ? "A = {area}"
                : null;
      // A total or an integral is all answer: under answers:false no caption at all, not a bare "A".
      const captionText = captionTemplate === null || !this.answers ? null : this.fillValues(captionTemplate, totals, `${path}.total`);
      const caption = captionText === null ? undefined : { id: `${id}-total`, text: captionText, colour: INK };
      parts.forEach((part, k) => {
        const partId = several ? `${id}-${k + 1}` : id;
        const top = this.edge(f, part.from, part.to);
        const bottom =
          g === undefined
            ? [
                { x: part.to, y: 0 },
                { x: part.from, y: 0 },
              ]
            : this.edge(g, part.from, part.to).reverse();
        const vertices = [...top, ...bottom];
        this.insideY(vertices, path);
        const colour = part.sign > 0 ? positive : negative;
        const px = this.region(partId, vertices, tint(colour));
        this.regionsPx.push(px);
        const text =
          template === null
            ? ""
            : (this.asked(template, {}, `${path}.label`, { area: Math.abs(part.value), integral: part.value, i: subscript(k + 1) }) ?? "");
        this.regionLabels.push({
          id: `${partId}-label`,
          owner: partId,
          polygon: px,
          text,
          colour,
          inside: true,
          ...(labelObject?.towards === undefined ? {} : { towards: labelObject.towards }),
        });
      });
      // The total rides with the first part's label, placed clear of every part.
      if (caption !== undefined) {
        const first = this.regionLabels[this.regionLabels.length - parts.length]!;
        first.caption = caption;
        first.group = this.regionsPx.slice(-parts.length);
      }
      const areaLegend = area.legend === undefined ? null : this.asked(area.legend, {}, `${path}.legend`, totals);
      if (areaLegend !== null) {
        this.regionLegend.push({
          text: areaLegend,
          colour: positive,
          width: 1,
          lineStyle: undefined,
          fill: tint(positive),
        });
      }
    }
  }

  /**
   * Every `riemann` entry: exactly the rectangles (or trapezoids)
   * numeric.riemann summed, each a closed mark in the plane's frame, and
   * their union's outline -- the mark the sum's label names, since the sum
   * is the area of that outline and of no single rectangle.
   */
  riemannSums(): void {
    for (const [i, sum] of (this.input.riemann ?? []).entries()) {
      const path = `riemann[${i}]`;
      const id = sum.id ?? `riemann-${i + 1}`;
      const curve = this.graphOf(sum.of, `${path}.of`, "a Riemann sum");
      const [a, b] = this.bounds(sum, path);
      let result: ReturnType<typeof riemann>;
      let exact: number | undefined;
      try {
        result = riemann(curve.at, a, b, sum.n, sum.rule);
        if (sum.integral !== undefined && sum.integral !== false) exact = integral(curve.at, a, b, this.breaksOf(curve));
      } catch (error) {
        if (!(error instanceof NumericError)) throw error;
        throw new SpecError(`${path}: the sum on [${a}, ${b}] is refused, not printed: ${error.message}`);
      }
      const positive = colourOf(sum.colour, COLOURS.warm!, `${path}.colour`);
      const negative = colourOf(sum.negativeColour, COLOURS.rust!, `${path}.negativeColour`);
      const heights = result.rectangles.map((r) => r.heights ?? ([r.height!, r.height!] as [number, number]));
      const outline: XYPoint[] = [{ x: a, y: 0 }];
      result.rectangles.forEach((rect, k) => {
        const [h0, h1] = heights[k]!;
        const vertices = [
          { x: rect.x0, y: 0 },
          { x: rect.x1, y: 0 },
          { x: rect.x1, y: h1 },
          { x: rect.x0, y: h0 },
        ];
        this.insideY(vertices, path);
        const colour = h0 + h1 >= 0 ? positive : negative;
        this.region(`${id}-rect-${k + 1}`, vertices, tint(colour), { colour, width: 1.1 });
        outline.push({ x: rect.x0, y: h0 }, { x: rect.x1, y: h1 });
        if (sum.rule !== "trapezoid" && sum.points !== false) {
          const x = sum.rule === "left" ? rect.x0 : sum.rule === "right" ? rect.x1 : (rect.x0 + rect.x1) / 2;
          this.sampleDots.push({ at: this.at(x, h0), colour, id: `${id}-sample-${k + 1}`, series: curve.series });
        }
      });
      outline.push({ x: b, y: 0 });
      const deduped = outline.filter((p, k) => k === 0 || p.x !== outline[k - 1]!.x || p.y !== outline[k - 1]!.y);
      const signs = new Set(heights.flat().filter((y) => y !== 0).map(Math.sign));
      const mixed = signs.size > 1;
      const edge = mixed ? INK : signs.has(-1) ? negative : positive;
      // Rectangles on both sides of the axis already draw every edge of the
      // union in their own two colours; a stroke of a third colour on top
      // read as a separate element. The outline still exists, unstroked, as
      // the one shape the sum's label names (ADR 0037 measures it).
      const px = mixed ? this.region(id, deduped, "none") : this.region(id, deduped, "none", { colour: edge, width: 1.8 });
      this.regionsPx.push(px);
      const values = { sum: result.sum, n: subscript(sum.n), ...(exact === undefined ? {} : { integral: exact }) };
      const integralText = exact === undefined || !this.answers ? null : this.fillValues(typeof sum.integral === "string" ? sum.integral : "∫ = {integral}", values, `${path}.integral`);
      const caption = integralText === null ? undefined : { id: `${id}-integral`, text: integralText, colour: INK };
      const labelled = sum.label !== undefined && sum.label !== false;
      this.regionLabels.push({
        id: `${id}-sum`,
        owner: id,
        polygon: px,
        text: labelled ? (this.asked(typeof sum.label === "string" ? sum.label : "S{n} = {sum}", {}, `${path}.label`, values) ?? "") : "",
        colour: edge,
        inside: false,
        ...(signs.size === 1 ? { across: signs.has(-1) ? (-1 as const) : (1 as const) } : {}),
        ...(caption === undefined ? {} : { caption }),
      });
      const sumLegend = sum.legend === undefined ? null : this.asked(sum.legend, {}, `${path}.legend`, values);
      if (sumLegend !== null) {
        this.regionLegend.push({
          text: sumLegend,
          colour: edge,
          width: 1.1,
          lineStyle: undefined,
          fill: tint(positive),
        });
      }
    }
  }

  /** Every mark drawn so far as a polyline in canvas px, as the checks will walk it. */
  polylines(): { id: string; pts: Point[]; closed: boolean }[] {
    const px = (p: Point | { frame: string; x: number; y: number }): Point =>
      "frame" in p ? this.at(p.x, p.y) : { x: p.x, y: p.y };
    return this.board.marks.map((m) => {
      const pts: Point[] = [px(m.from as Point)];
      for (const s of m.segments) {
        if ("line" in s) {
          pts.push(px(s.line as Point));
          continue;
        }
        // An arc (a dot's quarter): sampled, so a dot is measured by its rim.
        const c = px(s.centre as Point);
        const from = pts[pts.length - 1]!;
        const to = px(s.arc as Point);
        const r = Math.hypot(from.x - c.x, from.y - c.y);
        const a0 = Math.atan2(from.y - c.y, from.x - c.x);
        let a1 = Math.atan2(to.y - c.y, to.x - c.x);
        while (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
        while (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
        for (let k = 1; k <= 8; k += 1) {
          const t = a0 + ((a1 - a0) * k) / 8;
          pts.push({ x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) });
        }
      }
      return { id: m.id, pts, closed: m.close ?? m.fill !== undefined };
    });
  }

  /**
   * Labels of regions and sums, placed after the other data labels so every
   * mark they must stay nearest their own against already exists.
   *
   * The spot is searched, not guessed: a region's label is set INSIDE it
   * where it fits whole -- the deepest clear spot -- and otherwise, like a
   * sum's, outside against its owner. Either way a spot is taken only if the
   * owner is the nearest mark to the label's centre, measured the way
   * `annotation-nearest-its-owner` measures it: a spot where the curve the
   * region lies under is nearer would have the label read as the curve's.
   */
  regionLabelsPlace(): void {
    const b = this.board;
    const size = 14;
    for (const label of this.regionLabels) {
      let at: Point | null = null;
      let h = 0;
      if (label.text !== "") {
        const ext = b.extent(label.text, { size });
        h = ext.h;
        const spot = this.searchNear(label, ext.w, ext.h);
        at = spot;
        b.label(label.text, at.x, at.y, {
          size,
          weight: 600,
          colour: label.colour,
          width: ext.w,
          id: label.id,
          annotates: label.owner,
          // A halo that hides only the faint lattice under the text (ADR
          // 0035 allows a backing exactly that): the region's own tint when
          // the label sits wholly inside it, so the halo is invisible against
          // it; paper outside. The search has already kept the box clear of
          // every curve and axis, which a backing may never cover.
          fill: spot.inside ? this.tintOnPaper(label.colour) : PAPER,
        });
      }
      if (label.caption !== undefined) {
        // A caption names no single mark -- a total spans every part, and the
        // exact integral is the area of nothing a Riemann figure draws -- so
        // it is declared free-standing (ADR 0035). It is kept OFF every
        // region: "A = 4" set inside the first lobe of sin x reads as that
        // lobe's area. A sum's integral goes on the sum's own line, after it;
        // a total above the parts it adds up.
        const group = label.group ?? [label.polygon];
        const xs = group.flat().map((p) => p.x);
        const ys = group.flat().map((p) => p.y);
        const ext = b.extent(label.caption.text, { size });
        const start =
          label.group === undefined && at !== null
            ? { x: at.x + b.extent(label.text, { size }).w / 2 + ext.w / 2 + 16, y: at.y }
            : { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.min(...ys) - 18 };
        const spot = this.searchFree(start, ext.w, ext.h);
        b.label(label.caption.text, spot.x, spot.y, {
          size,
          weight: 600,
          colour: label.caption.colour,
          width: ext.w,
          id: label.caption.id,
          freeStanding: true,
          fill: PAPER,
        });
      }
    }
  }

  /**
   * How many lattice lines a label box would sit on, horizontal ones counted
   * double. The lattice is exempt from the checks -- every tick number sits
   * on its own gridline -- but a data label struck through by a gridline is
   * text on a line to a reader, so the searches below prefer spots between
   * the lines.
   */
  latticeUnder(x: number, y: number, w: number, h: number): number {
    let n = 0;
    for (let k = Math.ceil(this.xr[0] / this.sx - 1e-9); k * this.sx <= this.xr[1] + 1e-9; k += 1) {
      if (Math.abs(this.at(k * this.sx, 0).x - x) < w / 2 + 1) n += 1;
    }
    for (let k = Math.ceil(this.yr[0] / this.sy - 1e-9); k * this.sy <= this.yr[1] + 1e-9; k += 1) {
      if (Math.abs(this.at(0, k * this.sy).y - y) < h / 2 + 1) n += 2;
    }
    return n;
  }

  /** The nearest clear spot to `start` that sits on no region and on as few gridlines as it can. */
  searchFree(start: Point, w: number, h: number): Point {
    const b = this.board;
    let best: { x: number; y: number; score: number } | null = null;
    for (let y = start.y - 200; y <= start.y + 200; y += 3) {
      for (let x = start.x - 240; x <= start.x + 240; x += 3) {
        if (x - w / 2 < 16 || x + w / 2 > b.W - 16 || y - h / 2 < 10 || y + h / 2 > b.H - 10) continue;
        if (!b.clear(b.box(x, y, w, h), 5) || this.overRegion(b.box(x, y, w + 6, h + 6))) continue;
        const score = Math.hypot(x - start.x, y - start.y) + 10 * this.latticeUnder(x, y, w, h);
        if (best === null || score < best.score) best = { x, y, score };
      }
    }
    return best ?? start;
  }

  /** The spot for a region's or a sum's label; see `regionLabelsPlace`. */
  searchNear(label: RegionLabel, w: number, h: number): Point & { inside: boolean } {
    const b = this.board;
    const poly = label.polygon;
    const rivals = this.polylines().filter((r) => r.id !== label.owner);
    const own = (c: Point): number => distanceToPolyline(c, poly, true);
    // The check fails a label that a rival is nearer by more than half a
    // pixel; a spot is taken only with a margin inside that.
    const nearestIsOwner = (c: Point, d: number): boolean =>
      rivals.every((r) => distanceToPolyline(c, r.pts, r.closed) >= d - 0.2);
    const inCanvas = (x: number, y: number): boolean =>
      x - w / 2 >= 16 && x + w / 2 <= b.W - 16 && y - h / 2 >= 10 && y + h / 2 <= b.H - 10;
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    const centre = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
    if (label.inside) {
      let best: { x: number; y: number; score: number } | null = null;
      for (let y = box.y0 + h / 2; y <= box.y1 - h / 2; y += 3) {
        for (let x = box.x0 + w / 2; x <= box.x1 - w / 2; x += 3) {
          const bx = b.box(x, y, w, h);
          if (!inCanvas(x, y) || !boxInside(bx, poly, 3) || !b.clear(bx, 2)) continue;
          const d = own({ x, y });
          if (!nearestIsOwner({ x, y }, d)) continue;
          // Deepest first, off the gridlines; among near-equals, nearest the
          // middle of the region.
          const score = d - 0.05 * Math.hypot(x - centre.x, y - centre.y) - 8 * this.latticeUnder(x, y, w, h);
          if (best === null || score > best.score) best = { x, y, score };
        }
      }
      if (best !== null) return { x: best.x, y: best.y, inside: true };
    }
    // A sum on one side of the axis: its label across the axis from it,
    // under the middle of the rectangles, clear of the tick numbers -- where
    // a caption of the rectangles sits in a textbook, and where the curve,
    // which runs over their tops, is farthest.
    if (label.across !== undefined) {
      const axis = this.at(0, this.baseY).y;
      let best: { x: number; y: number; score: number } | null = null;
      for (let off = h / 2 + 4; off <= h / 2 + 90; off += 2) {
        const y = axis + label.across * off;
        for (let x = box.x0; x <= box.x1; x += 3) {
          const bx = b.box(x, y, w, h);
          if (!inCanvas(x, y) || !b.clear(bx, 5) || this.overRegion(bx)) continue;
          if (!nearestIsOwner({ x, y }, own({ x, y }))) continue;
          const score = Math.abs(x - centre.x) + 0.5 * off + 12 * this.latticeUnder(x, y, w, h);
          if (best === null || score < best.score) best = { x, y, score };
        }
      }
      if (best !== null) return { x: best.x, y: best.y, inside: false };
    }
    // Outside: against the owner, beside its middle rather than at a tip (a
    // label at the pointed end of a lens reads as the crossing's), and off
    // the gridlines.
    const reach = Math.max(w, h) + 60;
    let best: { x: number; y: number; d: number } | null = null;
    let fallback: { x: number; y: number; d: number } | null = null;
    for (let y = box.y0 - reach; y <= box.y1 + reach; y += 3) {
      for (let x = box.x0 - reach; x <= box.x1 + reach; x += 3) {
        const bx = b.box(x, y, w, h);
        if (!inCanvas(x, y) || boxMeetsPolygon(bx, poly) || !b.clear(bx, 5)) continue;
        if (this.regionsPx.some((r) => r !== poly && boxMeetsPolygon(bx, r))) continue;
        const near = own({ x, y });
        const d = near + 0.35 * Math.abs(x - centre.x) + 0.1 * Math.abs(y - centre.y) + 6 * this.latticeUnder(x, y, w, h);
        if (fallback === null || d < fallback.d) fallback = { x, y, d };
        if (!nearestIsOwner({ x, y }, near)) continue;
        if (best === null || d < best.d) best = { x, y, d };
      }
    }
    const spot = best ?? fallback ?? centre;
    return { x: spot.x, y: spot.y, inside: false };
  }

  /** A region's tint as the opaque colour it shows on paper: an inside label's invisible halo. */
  tintOnPaper(colour: string): string {
    const parse = (hex: string, at: number): number => parseInt(hex.slice(at, at + 2), 16);
    const alpha = parseInt(TINT_ALPHA, 16) / 255;
    const channel = (at: number): string =>
      Math.round(parse(colour, at) * alpha + parse(PAPER, at) * (1 - alpha))
        .toString(16)
        .padStart(2, "0");
    return `#${channel(1)}${channel(3)}${channel(5)}`;
  }

  /** A box that would lie over a shaded region: the legend keeps off them. */
  overRegion(box: { x: number; y: number; hw: number; hh: number }): boolean {
    return this.regionsPx.some((r) => boxMeetsPolygon(box, r) || pointInPolygon({ x: box.x, y: box.y }, r));
  }

  // ---- asymptotes and holes (ADR 0038) -------------------------------------

  /** The name an equation label uses for an axis: its own when it is a plain name, else x or y. */
  axisVariable(axis: "x" | "y"): string {
    const name = this.input[axis].name ?? axis;
    return /^[A-Za-zθ][A-Za-z0-9]*$/.test(name) ? name : axis;
  }

  /** "=" or "≈": an equation's sign follows whether every number in it is exact. */
  eq(exact: boolean): string {
    return exact ? "=" : "≈";
  }

  /** The right-hand side of y = mx + q, written as a reader writes it: "x", "2x − 1", "(1/2)x + 3", "π/2". */
  slantText(line: Slant): string {
    const x = this.axisVariable("x");
    const neg = (e: Exact): Exact => (e.exact && e.form === "pi" ? { ...e, value: -e.value, k: -e.k } : { ...e, value: -e.value });
    const abs = (e: Exact): Exact => (e.value < 0 ? neg(e) : e);
    const q = line.q;
    if (line.m.value === 0) return writeExact(q, this.locale);
    const m = abs(line.m);
    const sign = line.m.value < 0 ? MINUS : "";
    let coefficient = Math.abs(m.value - 1) < 1e-15 ? "" : writeExact(m, this.locale);
    if (coefficient.includes("/")) coefficient = `(${coefficient})`;
    const head = `${sign}${coefficient}${x}`;
    if (q.value === 0) return head;
    return `${head} ${q.value < 0 ? MINUS : "+"} ${writeExact(abs(q), this.locale)}`;
  }

  /**
   * Every function's asymptotes and holes, found from its expression and
   * confirmed by its limits (ADR 0038). The dashed lines are drawn here,
   * before the curves, so a curve paints over the line it approaches; their
   * labels and the holes' rings come later.
   */
  asymptotes(): void {
    for (const [i, fn] of (this.input.functions ?? []).entries()) {
      const wantsAsymptotes = fn.asymptotes !== undefined && fn.asymptotes !== false;
      const wantsHoles = fn.holes !== undefined && fn.holes !== false;
      if (!wantsAsymptotes && !wantsHoles) continue;
      const path = `functions[${i}]`;
      const curve = this.curveById(fn.id, path);
      if (curve.kind !== "graph" || fn.pieces !== undefined) {
        throw new SpecError(
          `${path}.${wantsAsymptotes ? "asymptotes" : "holes"}: ${fn.id} is ` +
            `${fn.pieces !== undefined ? "a piecewise function" : this.kindName(curve)}; asymptotes and holes are found from ` +
            `a function given by one expression, "expr". Mark a piecewise function's open and closed ends with "points".`,
        );
      }
      const variable = this.input.x.name || "x";
      const tree = parse(fn.expr!, variable);
      const f = compile(fn.expr!, variable);
      const domain = fn.domain ?? this.xr;
      const lo = Math.max(domain[0], this.xr[0]);
      const hi = Math.min(domain[1], this.xr[1]);
      const found = verticalsAndHoles(f, tree, variable, lo, hi);
      // The curve is broken at every pole found, drawn or not: it is never
      // joined across one.
      const breaks = found.verticals.map((v) => v.x.value);
      const x = this.axisVariable("x");
      const y = this.axisVariable("y");
      const colour = curve.colour;
      let drawn = 0;
      const line = (pts: Point[], text: string, prefer: { at: Point; bias: number }[]): void => {
        // answers:false: found and confirmed (a wrong claim is still refused), never drawn.
        if (!this.answers) {
          drawn += 1;
          return;
        }
        const id = `${fn.id}-asymptote-${drawn + 1}`;
        const mark = this.board.poly(pts, { id, stroke: colour, width: 1.4, lineStyle: "dashed", series: id });
        // A vertical or horizontal asymptote runs along a gridline, through
        // the very spot of that line's axis number ("1" under x = 1). It
        // yields to the number as a guide does: the number keeps its spot
        // and the dashed line is cut around it (`breakGuides`). An oblique
        // one crosses numbers only in passing, and they step off it as they
        // step off a curve.
        const straight = Math.abs(pts[0]!.x - pts[pts.length - 1]!.x) < 1e-6 || Math.abs(pts[0]!.y - pts[pts.length - 1]!.y) < 1e-6;
        if (mark !== null && straight) this.guideMarks.push(mark);
        this.asymptoteLines.push({ id, colour, pts, text, prefer });
        drawn += 1;
      };

      if (wantsAsymptotes) {
        const options: AsymptoteInput = fn.asymptotes === true ? {} : (fn.asymptotes as AsymptoteInput);
        const opath = `${path}.asymptotes`;
        // Vertical: every pole found, or exactly the ones claimed, each confirmed.
        let verticals = options.vertical === false ? [] : found.verticals;
        if (Array.isArray(options.vertical)) {
          verticals = options.vertical.map((raw, k) => {
            const a = bound(raw, `${opath}.vertical[${k}]`);
            const hit = found.verticals.find((v) => Math.abs(v.x.value - a) <= 1e-7 * Math.max(1, Math.abs(a)));
            if (hit !== undefined) return hit;
            if (a <= lo || a >= hi) {
              throw new SpecError(`${opath}.vertical[${k}]: ${x} = ${a} is outside where ${fn.id} is drawn, ${x} ∈ [${lo}, ${hi}]`);
            }
            const verdict = classify(f, a);
            if ("vertical" in verdict) return verdict.vertical;
            const sides = "hole" in verdict ? verdict.hole : verdict.neither;
            throw new SpecError(
              `${opath}.vertical[${k}]: ${fn.id} has no vertical asymptote at ${x} = ${a}: as ${x} → ${a}⁻, f(${x}) ` +
                `${describeLimit(sides.left)}; as ${x} → ${a}⁺, f(${x}) ${describeLimit(sides.right)}` +
                ("hole" in verdict ? ` -- that is a hole, which "holes" draws` : ""),
            );
          });
        } else if (options.vertical === true && verticals.length === 0) {
          throw new SpecError(
            `${opath}.vertical: ${fn.id} has no vertical asymptote in ${x} ∈ [${lo}, ${hi}]: no point there where a one-sided limit is ±∞`,
          );
        }
        for (const v of verticals) {
          const top = this.at(v.x.value, this.yr[1]);
          const bottom = this.at(v.x.value, this.yr[0]);
          line([top, bottom], `${x} ${this.eq(v.x.exact)} ${writeExact(v.x, this.locale)}`, [
            { at: top, bias: 0 },
            { at: bottom, bias: 40 },
          ]);
        }

        // At ±∞: only on a side the function is drawn out to the plot's edge.
        const side = (dir: 1 | -1): SideResult => {
          const reaches = dir > 0 ? domain[1] >= this.xr[1] : domain[0] <= this.xr[0];
          if (!reaches) {
            return {
              kind: "none",
              evidence: { kind: "none", reason: "outside the function's domain", samples: [] },
              why: `${fn.id} is defined only up to ${x} = ${dir > 0 ? domain[1] : domain[0]}`,
            };
          }
          const r = atInfinity(f, dir);
          if (r.kind !== "none" && coincides(f, r.line, lo, hi)) {
            return { kind: "none", evidence: r.evidence, why: `${fn.id} is itself the line ${y} = ${this.slantText(r.line)}` };
          }
          return r;
        };
        const pos = side(1);
        const neg = side(-1);
        const why = (r: SideResult): string =>
          r.kind === "none"
            ? r.why
            : `it has the ${r.kind} asymptote ${y} = ${this.slantText(r.line)}`;
        for (const kind of ["horizontal", "oblique"] as const) {
          if (options[kind] === true && pos.kind !== kind && neg.kind !== kind) {
            throw new SpecError(
              `${opath}.${kind}: ${fn.id} has no ${kind} asymptote: as ${x} → +∞, ${why(pos)}; as ${x} → −∞, ${why(neg)}`,
            );
          }
        }
        const keep = (r: SideResult): Slant | null => (r.kind === "none" || options[r.kind] === false ? null : r.line);
        const right = keep(pos);
        const left = keep(neg);
        const exactOf = (l: Slant): boolean => l.m.exact && l.q.exact;
        const across = (l: Slant, x0: number, x1: number, towards: 1 | -1 | 0): void => {
          const a = this.at(x0, l.m.value * x0 + l.q.value);
          const b = this.at(x1, l.m.value * x1 + l.q.value);
          const clipped = clipRuns([[a, b]], this.view);
          if (clipped.length === 0) {
            const kind = l.m.value === 0 ? "horizontal" : "oblique";
            if (options[kind] === true) {
              throw new SpecError(`${opath}.${kind}: ${y} = ${this.slantText(l)} lies outside the plotted range; widen it to show the asymptote`);
            }
            return;
          }
          const pts = clipped[0]!;
          const first = pts[0]!;
          const last = pts[pts.length - 1]!;
          // The label goes first toward the end it describes: x → +∞ is the right.
          const [near, far] = towards < 0 ? [last, first] : [first, last];
          line(pts, `${y} ${this.eq(exactOf(l))} ${this.slantText(l)}`, [
            { at: far, bias: 0 },
            { at: near, bias: towards === 0 ? 40 : 80 },
          ]);
        };
        // One line across when both ends agree; else each only toward its
        // own side, meeting in the middle of the plot (arctan: y = π/2 on
        // the right, y = −π/2 on the left).
        const mid = (this.xr[0] + this.xr[1]) / 2;
        if (right !== null && left !== null && sameLine(right, left)) across(right, this.xr[0], this.xr[1], 0);
        else {
          if (right !== null) across(right, mid, this.xr[1], 1);
          if (left !== null) across(left, this.xr[0], mid, -1);
        }
        if (fn.asymptotes === true && drawn === 0) {
          throw new SpecError(
            `${opath}: ${fn.id} has no asymptote the numerics can confirm: no vertical one in ${x} ∈ [${lo}, ${hi}]; ` +
              `as ${x} → +∞, ${why(pos)}; as ${x} → −∞, ${why(neg)}`,
          );
        }
      }

      if (wantsHoles) {
        const hpath = `${path}.holes`;
        const options: HoleInput = fn.holes === true ? {} : Array.isArray(fn.holes) ? { at: fn.holes } : (fn.holes as HoleInput);
        let holes: Hole[];
        if (options.at !== undefined) {
          holes = options.at.map((raw, k) => {
            const a = bound(raw, `${hpath}.at[${k}]`);
            if (a <= lo || a >= hi) throw new SpecError(`${hpath}: ${x} = ${a} is outside where ${fn.id} is drawn, ${x} ∈ [${lo}, ${hi}]`);
            const hit = found.holes.find((h) => Math.abs(h.x.value - a) <= 1e-7 * Math.max(1, Math.abs(a)));
            if (hit !== undefined) return hit;
            const verdict = classify(f, a);
            if ("hole" in verdict) return verdict.hole;
            const sides = "vertical" in verdict ? verdict.vertical : verdict.neither;
            // Declared where the expression never skips (ADR 0027: "x + 4,
            // x ≠ 4"): the hole is still drawn at the limit, if there is one.
            if (
              sides.left.kind === "finite" &&
              sides.right.kind === "finite" &&
              Math.abs(sides.left.value - sides.right.value) <= 2e-5 * (1 + Math.abs(sides.left.value))
            ) {
              return {
                x: snapExact(a, 1e-7),
                y: snapExact((sides.left.value + sides.right.value) / 2, 1e-5),
                left: sides.left,
                right: sides.right,
              };
            }
            throw new SpecError(
              `${hpath}: ${fn.id} has no hole at ${x} = ${a}, since a hole needs one finite limit from both sides: ` +
                `as ${x} → ${a}⁻, f(${x}) ${describeLimit(sides.left)}; as ${x} → ${a}⁺, f(${x}) ${describeLimit(sides.right)}`,
            );
          });
        } else {
          holes = found.holes;
          if (holes.length === 0) {
            throw new SpecError(
              `${hpath}: ${fn.id} has no hole in ${x} ∈ [${lo}, ${hi}]: nowhere is it undefined with one finite limit from both sides`,
            );
          }
        }
        holes.forEach((h, k) => {
          if (h.y.value < this.yr[0] || h.y.value > this.yr[1]) {
            throw new SpecError(`${hpath}: the hole at ${x} = ${h.x.value} is at ${y} = ${h.y.value}, outside the plotted y range`);
          }
          breaks.push(h.x.value);
          this.holeDots.push({
            at: { x: h.x.value, y: h.y.value },
            colour,
            id: `${fn.id}-hole-${k + 1}`,
            series: curve.series,
            ...(options.label === undefined ? {} : { label: options.label }),
            ...(options.towards === undefined ? {} : { towards: options.towards }),
            path: `${hpath}.label`,
          });
        });
      }
      this.graphBreaks.set(fn.id, breaks);
    }
  }

  /** Each hole's label, if asked for: it names the hole's place, like a point's label (ADR 0035). */
  holeLabels(): void {
    for (const hole of this.holeDots) {
      if (hole.label === undefined) continue;
      const c = this.at(hole.at.x, hole.at.y);
      const text = this.asked(hole.label, { point: hole.at }, hole.path);
      if (text === null) continue;
      this.board.place(text, c.x, c.y, dirsOf(hole.towards, ["NW", "SE", "NE", "SW"]), {
        size: 14,
        weight: 600,
        colour: hole.colour,
        annotatesPlace: c,
      });
    }
  }

  /**
   * Each asymptote's equation, set BESIDE its line, never on it (ADR 0038).
   * It names the line twice over -- `annotates` its mark and `names` its
   * series -- so `annotation-nearest-its-owner` and
   * `curve-label-nearest-its-curve` both hold it there: a spot is taken only
   * if this line is nearer the label than any other mark (centre to
   * polyline) and than any other series (box to polyline). Its paper halo
   * hides only the lattice under it; the search keeps the box clear of every
   * stroke, which no backing may cover (ADR 0035).
   */
  asymptoteLabels(): void {
    const b = this.board;
    const size = 13;
    for (const line of this.asymptoteLines) {
      const { w, h } = b.extent(line.text, { size });
      const pts = line.pts;
      const p0 = pts[0]!;
      const p1 = pts[pts.length - 1]!;
      const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
      const u = { x: (p1.x - p0.x) / len, y: (p1.y - p0.y) / len };
      const n = { x: -u.y, y: u.x };
      const across = Math.abs(n.x) * (w / 2) + Math.abs(n.y) * (h / 2);
      const inCanvas = (x: number, y: number): boolean =>
        x - w / 2 >= 16 && x + w / 2 <= b.W - 16 && y - h / 2 >= 10 && y + h / 2 <= b.H - 10;
      // The axis names are placed last, at the ends of the axes; an
      // asymptote's label keeps off their usual spots rather than push them
      // up into the curves.
      const names = this.axisNameSpots();
      const candidates: { x: number; y: number; score: number }[] = [];
      for (let t = 0; t <= len; t += 3) {
        for (const side of [1, -1]) {
          for (const gap of [5, 8, 12, 16, 22, 30]) {
            const x = p0.x + u.x * t + n.x * side * (across + gap);
            const y = p0.y + u.y * t + n.y * side * (across + gap);
            if (!inCanvas(x, y) || !b.clear(b.box(x, y, w, h), 3)) continue;
            if (names.some((spot) => b.hits(b.box(x, y, w, h), spot, 2))) continue;
            const anchor = Math.min(...line.prefer.map((p) => Math.hypot(x - p.at.x, y - p.at.y) + p.bias));
            candidates.push({ x, y, score: anchor + 0.5 * gap + 10 * this.latticeUnder(x, y, w, h) });
          }
        }
      }
      candidates.sort((p, q) => p.score - q.score);
      const all = this.polylines();
      // The line as drawn: in pieces, if an axis number cut it.
      const pieces = all.filter((r) => b.marks.some((m) => m.id === r.id && m.series === line.id));
      const rivals = all.filter((r) => !pieces.includes(r));
      const series = new Map<string, Point[][]>();
      for (const m of b.marks) {
        if (m.series === undefined || m.series === line.id) continue;
        const poly = all.find((r) => r.id === m.id);
        if (poly === undefined) continue;
        if (!series.has(m.series)) series.set(m.series, []);
        series.get(m.series)!.push(poly.pts);
      }
      const rectTo = (x: number, y: number, poly: Point[]): number => {
        let best = Infinity;
        const visit = (p: Point): void => {
          const dx = Math.max(x - w / 2 - p.x, 0, p.x - (x + w / 2));
          const dy = Math.max(y - h / 2 - p.y, 0, p.y - (y + h / 2));
          best = Math.min(best, Math.hypot(dx, dy));
        };
        if (poly.length === 1) visit(poly[0]!);
        for (let i = 1; i < poly.length; i += 1) {
          const a = poly[i - 1]!;
          const c = poly[i]!;
          const steps = Math.max(1, Math.ceil(Math.hypot(c.x - a.x, c.y - a.y) / 2));
          for (let k = 0; k <= steps; k += 1) visit({ x: a.x + ((c.x - a.x) * k) / steps, y: a.y + ((c.y - a.y) * k) / steps });
        }
        return best;
      };
      const nearestPiece = (c: { x: number; y: number }): { id: string; d: number } =>
        pieces
          .map((r) => ({ id: r.id, d: distanceToPolyline(c, r.pts, false) }))
          .reduce((p, q) => (q.d < p.d ? q : p), { id: line.id, d: Infinity });
      const honest = (c: { x: number; y: number }): boolean => {
        const own = nearestPiece(c).d;
        if (!rivals.every((r) => distanceToPolyline(c, r.pts, r.closed) >= own + 1)) return false;
        const ownBox = Math.min(...pieces.map((r) => rectTo(c.x, c.y, r.pts)));
        return [...series.values()].every((polys) => polys.every((poly) => rectTo(c.x, c.y, poly) >= ownBox + 1));
      };
      const spot =
        candidates.find(honest) ??
        candidates[0] ?? { x: (p0.x + p1.x) / 2 + n.x * (across + 8), y: (p0.y + p1.y) / 2 + n.y * (across + 8) };
      b.label(line.text, spot.x, spot.y, {
        size,
        weight: 600,
        colour: line.colour,
        width: w,
        id: `${line.id}-label`,
        // The piece of the line beside it: a line cut around an axis number
        // is several marks of one series.
        annotates: nearestPiece(spot).id,
        names: line.id,
        fill: PAPER,
      });
    }
  }

  /** Roots and local extrema, found numerically and declared to lie on their curve (ADR 0025). */
  features(): void {
    for (const fn of this.input.functions ?? []) {
      const wanted = new Set(fn.features ?? []);
      if (wanted.size === 0) continue;
      const curve = this.curveById(fn.id, "functions");
      if (curve.kind !== "graph") {
        throw new SpecError(`functions: ${fn.id} is ${this.kindName(curve)}; "features" finds roots and extrema of y = f(x) only`);
      }
      for (const piece of curve.pieces) {
        const found = findFeatures(piece.f, piece.domain[0], piece.domain[1]);
        const marks: { x: number; y: number; kind: string }[] = [
          ...(wanted.has("roots") ? found.roots.map((x) => ({ x, y: 0, kind: "root" })) : []),
          ...(wanted.has("extrema") ? found.extrema.map((e) => ({ x: e.x, y: e.y, kind: e.kind })) : []),
        ];
        for (const m of marks) {
          if (m.y < this.yr[0] || m.y > this.yr[1]) continue;
          if (m.kind === "root" && this.baseY !== 0) continue;
          const c = this.at(m.x, m.y);
          const id = `${fn.id}-${m.kind}-${this.board.id("")}`;
          // What makes a root a root, stated as a relation the drawing can
          // refute: on its curve AND on the x axis. Either half alone leaves
          // a place to be wrong and still pass -- the lesson the plot module
          // learned first (ADR 0025).
          this.board.circle(c, 4.5, {
            stroke: curve.colour,
            width: 2,
            fill: m.kind === "root" ? PAPER : curve.colour,
            id,
            on: m.kind === "root" ? [curve.series, "plane-axis-x"] : [curve.series],
          });
          this.board.reserve(c.x, c.y, 11, 11);
        }
      }
    }
  }
}

type Seg = { ax: number; ay: number; bx: number; by: number };

function segmentPointDistance(s: Seg, p: Point): number {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - s.ax) * dx + (p.y - s.ay) * dy) / len2));
  return Math.hypot(p.x - (s.ax + t * dx), p.y - (s.ay + t * dy));
}

function rectPointDistance(b: Box, p: Point): number {
  const dx = Math.max(Math.abs(p.x - b.x) - b.hw, 0);
  const dy = Math.max(Math.abs(p.y - b.y) - b.hh, 0);
  return Math.hypot(dx, dy);
}

/** Distance from a box to a segment: 0 when they meet, else the nearest of the segment's points and the box's corners. */
function rectSegmentDistance(b: Box, s: Seg): number {
  const n = 24;
  let best = Infinity;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    best = Math.min(best, rectPointDistance(b, { x: s.ax + (s.bx - s.ax) * t, y: s.ay + (s.by - s.ay) * t }));
  }
  for (const c of [
    { x: b.x - b.hw, y: b.y - b.hh },
    { x: b.x + b.hw, y: b.y - b.hh },
    { x: b.x + b.hw, y: b.y + b.hh },
    { x: b.x - b.hw, y: b.y + b.hh },
  ]) {
    best = Math.min(best, segmentPointDistance(s, c));
  }
  return best;
}

/** A Bound as a number: itself, or its expression evaluated ("2pi" → 6.283…). */
function bound(value: Bound, path: string): number {
  if (typeof value === "number") return v.finite(value, path);
  if (typeof value !== "string") throw new SpecError(`${path} must be a number or an expression like "2pi", got ${JSON.stringify(value)}`);
  try {
    return constantValue(value);
  } catch (error) {
    throw new SpecError(`${path}: ${(error as ExprError).message}`);
  }
}

function dirsOf(names: Dir[] | undefined, fallback: Dir[]): Point[] {
  return (names ?? fallback).map((n) => DIRS[n]);
}

/**
 * Roots by sign change and bisection; extrema by a sign change of the
 * slope, refined by golden-section search. Sampled finely enough for a
 * teaching figure (1200 intervals), and a root exactly at a sample counts.
 */
export function findFeatures(
  f: (x: number) => number,
  a: number,
  b: number,
): { roots: number[]; extrema: { x: number; y: number; kind: "max" | "min" }[] } {
  const n = 1200;
  const xs = Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  const ys = xs.map(f);
  const roots: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const ya = ys[i]!;
    const yb = ys[i + 1]!;
    if (!Number.isFinite(ya) || !Number.isFinite(yb)) continue;
    if (ya === 0) {
      roots.push(xs[i]!);
      continue;
    }
    if (ya * yb < 0) {
      let lo = xs[i]!;
      let hi = xs[i + 1]!;
      for (let k = 0; k < 60; k += 1) {
        const mid = (lo + hi) / 2;
        if (Math.sign(f(mid)) === Math.sign(ya)) lo = mid;
        else hi = mid;
      }
      roots.push((lo + hi) / 2);
    }
  }
  if (ys[n] === 0) roots.push(b);
  const extrema: { x: number; y: number; kind: "max" | "min" }[] = [];
  for (let i = 1; i < n; i += 1) {
    const [y0, y1, y2] = [ys[i - 1]!, ys[i]!, ys[i + 1]!];
    if (![y0, y1, y2].every(Number.isFinite)) continue;
    const kind = y1 > y0 && y1 >= y2 ? "max" : y1 < y0 && y1 <= y2 ? "min" : null;
    if (kind === null) continue;
    // Golden-section on [x(i-1), x(i+1)].
    let lo = xs[i - 1]!;
    let hi = xs[i + 1]!;
    const g = (Math.sqrt(5) - 1) / 2;
    const better = (p: number, q: number): boolean => (kind === "max" ? p > q : p < q);
    for (let k = 0; k < 80; k += 1) {
      const c = hi - g * (hi - lo);
      const d = lo + g * (hi - lo);
      if (better(f(c), f(d))) hi = d;
      else lo = c;
    }
    const x = (lo + hi) / 2;
    extrema.push({ x, y: f(x), kind });
  }
  return { roots, extrema };
}

/**
 * Every named point of a figure, resolved to its coordinates -- what a sheet
 * cites when its text says "P = {{fig.P}}", so the sentence and the label on
 * the drawing are formatted from the same number.
 */
export function functionGraphPoints(input: FunctionGraphInput): Map<string, { x: number; y: number }> {
  if (input.panels !== undefined) return new Map();
  const g = new Build(normaliseFunctionGraph(input));
  const out = new Map<string, { x: number; y: number }>();
  for (const [i, p] of (input.points ?? []).entries()) {
    if (p.id !== undefined) out.set(p.id, g.pointById(p.id, `points[${i}]`));
  }
  return out;
}

/**
 * What an input may leave to its data (ADR 0066), filled in: a category
 * axis's range, a y range fitted to its series and bars (widened to whole
 * steps of 1, 2 or 5 × 10ᵏ), and a unit from `length` or fitted to a target
 * size. Every input that states its range and unit comes back unchanged.
 */
export function normaliseFunctionGraph(input: FunctionGraphInput): FunctionGraphInput {
  const out: FunctionGraphInput = { ...input, x: { ...input.x }, y: { ...input.y }, ...(input.y2 === undefined ? {} : { y2: { ...input.y2 } }) };
  const cats = out.x.categories;
  if (out.x.range === undefined && cats !== undefined) out.x.range = [0.5, cats.length + 0.5];
  const seriesPoints = (axis: "y" | "y2"): XY[] =>
    (out.series ?? [])
      .filter((s) => (s.axis ?? "y") === axis)
      .flatMap((s) => s.points ?? (s.values ?? []).map((v, i) => [i + 1, v] as XY));
  if (out.x.range === undefined) {
    const xs = [...seriesPoints("y"), ...seriesPoints("y2")].map((p) => p[0]);
    if (xs.length > 1) {
      const lo = Math.min(...xs);
      const hi = Math.max(...xs);
      const step = out.x.step ?? niceStep(hi - lo || 1, 8);
      out.x.range = widenToTicks(lo, hi, step);
      out.x.step ??= step;
    }
  }
  const fit = (axis: AxisInput, values: number[], fromZero: boolean): void => {
    if (axis.range !== undefined || values.length === 0) return;
    let lo = Math.min(...values, ...(fromZero ? [0] : []));
    let hi = Math.max(...values, ...(fromZero ? [0] : []));
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    const step = axis.step ?? niceStep(hi - lo, 6);
    axis.range = widenToTicks(lo, hi, step);
    axis.step ??= step;
  };
  fit(out.y, [...seriesPoints("y").map((p) => p[1]), ...(out.bars ?? []).flatMap((b) => b.values)], (out.bars ?? []).length > 0);
  if (out.y2 !== undefined) fit(out.y2, seriesPoints("y2").map((p) => p[1]), false);
  if (out.x.range !== undefined && out.y.range !== undefined) {
    const sx = out.x.range[1] - out.x.range[0];
    const sy = out.y.range[1] - out.y.range[0];
    const fitted = fitUnits(sx, sy, { equal: false, targetWidth: 480, targetHeight: 300 });
    if (out.x.unit === undefined) out.x.unit = out.x.length !== undefined ? out.x.length / sx : fitted.xUnit;
    if (out.y.unit === undefined) out.y.unit = out.y.length !== undefined ? out.y.length / sy : fitted.yUnit;
  }
  return out;
}

export function expandFunctionGraph(input: FunctionGraphInput): FigureSpec {
  // Through the IR parser on the way out: it validates what this preset
  // produced and resolves the plane's frame into canvas coordinates, which
  // is the one step a preset's output otherwise never gets (every other
  // preset states canvas coordinates directly).
  return parseSpec(functionGraphIR(input));
}

/**
 * The figure as this preset states it, BEFORE frame resolution: every region,
 * rectangle and outline still in the plane's own frame (`{frame: "plane", x,
 * y}` in axis units). What the area tests read, so "the rectangle is the one
 * numeric.riemann returned" is compared number for number, not through a
 * round trip into pixels.
 */
export function functionGraphIR(input: FunctionGraphInput): FigureSpec {
  if (input.panels !== undefined) return composePanels(input, (one) => functionGraphIR(one));
  const g = new Build(normaliseFunctionGraph(input));
  g.frame();
  // Regions and sums first: they paint beneath the curves they lie under.
  g.areas();
  g.riemannSums();
  // Asymptotes under the curves that approach them (ADR 0038).
  g.asymptotes();
  // Bars beneath every curve; measured series with the other curves.
  g.barsDraw();
  g.strokes();
  g.seriesStrokes();
  g.guides();
  g.features();
  g.curveArrows();
  g.seriesDots();
  g.dots();
  g.ticks();
  g.breakGuides();
  g.symbolicTicks();
  // A hole's label before the curve labels: it names a place, and a curve
  // label can sit anywhere along its curve.
  g.holeLabels();
  g.curveLabels();
  g.pointLabels();
  g.valueLabels();
  g.barValueLabels();
  g.asymptoteLabels();
  g.regionLabelsPlace();
  g.freeLabels();
  g.axisNames();
  g.legend();
  return g.board.spec(input.title ?? "function graph");
}

// ---- validation ------------------------------------------------------------

function range(parent: Record<string, unknown>, key: string, path: string, required: boolean): void {
  const value = parent[key];
  if (value === undefined) {
    if (required) v.array(parent, key, path, "two numbers [min, max]");
    return;
  }
  if (!Array.isArray(value) || value.length !== 2) {
    throw new SpecError(`${path}.${key} must be [min, max], got ${JSON.stringify(value)}`);
  }
  const a = v.finite(value[0], `${path}.${key}[0]`);
  const b = v.finite(value[1], `${path}.${key}[1]`);
  if (!(a < b)) throw new SpecError(`${path}.${key} must have min < max, got [${a}, ${b}]`);
}

function pointRef(value: unknown, path: string): void {
  if (typeof value === "string") return;
  if (Array.isArray(value)) {
    if (value.length !== 2) throw new SpecError(`${path} must be [x, y], a point id, or {of, x}`);
    v.finite(value[0], `${path}[0]`);
    v.finite(value[1], `${path}[1]`);
    return;
  }
  const o = v.object(value, path);
  v.requiredString(o, "of", path);
  const by = ["x", "t", "theta"].filter((k) => o[k] !== undefined);
  if (by.length > 1) {
    throw new SpecError(`${path} reads a point off a curve by one of x, t or theta, not ${by.join(" and ")}`);
  }
  if (by[0] === "t" || by[0] === "theta") {
    bound(o[by[0]] as Bound, `${path}.${by[0]}`);
    if (o.side !== undefined) throw new SpecError(`${path}.side picks a piece at a break of a piecewise function, read by x`);
    return;
  }
  v.requiredNumber(o, "x", path);
  v.optionalEnum(o, "side", path, ["left", "right"]);
}

/** A [min, max] whose ends may be expressions: "t": [0, "2pi"]. */
function boundRange(parent: Record<string, unknown>, key: string, path: string): void {
  const value = parent[key];
  if (value === undefined) v.array(parent, key, path, "two bounds [min, max]");
  if (!Array.isArray(value) || value.length !== 2) {
    throw new SpecError(`${path}.${key} must be [min, max], got ${JSON.stringify(value)}`);
  }
  const a = bound(value[0] as Bound, `${path}.${key}[0]`);
  const b = bound(value[1] as Bound, `${path}.${key}[1]`);
  if (!(a < b)) throw new SpecError(`${path}.${key} must have min < max, got [${a}, ${b}]`);
}

function dirs(parent: Record<string, unknown>, path: string): void {
  const value = parent.towards;
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length === 0 || value.some((d) => typeof d !== "string" || !Object.hasOwn(DIRS, d))) {
    throw new SpecError(`${path}.towards must be a non-empty array of ${Object.keys(DIRS).join(", ")}`);
  }
}

function stroke(o: Record<string, unknown>, path: string): void {
  v.optionalString(o, "colour", path);
  const width = v.optionalNumber(o, "width", path);
  if (width !== undefined && width <= 0) throw new SpecError(`${path}.width must be positive`);
  v.optionalEnum(o, "style", path, ["solid", "dashed", "dotted", "dashdot"]);
}

function curveLabel(o: Record<string, unknown>, path: string): void {
  if (o.label === undefined) return;
  const l = v.object(o.label, `${path}.label`);
  v.requiredString(l, "text", `${path}.label`);
  if (l.at === undefined) v.requiredNumber(l, "at", `${path}.label`);
  if (typeof l.at !== "number") pointRef(l.at, `${path}.label.at`);
  dirs(l, `${path}.label`);
  v.optionalNumber(l, "size", `${path}.label`);
}

/**
 * Structure first, then a dry run of the expansion: the expander resolves
 * every reference and parses every expression, and it throws SpecError on
 * the first it cannot honour -- so validation and drawing cannot disagree
 * about what a document means.
 */
export function validateFunctionGraphInput(raw: Record<string, unknown>): void {
  const path = "function-graph";
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  if (raw.panels !== undefined) {
    validatePanels(raw, path);
    return;
  }
  const schematicAll = raw.axes !== undefined && (raw.axes as Record<string, unknown>).schematic === true;
  if (raw.axes !== undefined) {
    const o = v.object(raw.axes, `${path}.axes`);
    for (const key of Object.keys(o)) {
      if (!["schematic", "grid", "arrows"].includes(key)) throw new SpecError(`${path}.axes.${key} is not known; axes take schematic, grid and arrows`);
    }
    v.optionalBoolean(o, "schematic", `${path}.axes`);
    v.optionalBoolean(o, "grid", `${path}.axes`);
    v.optionalBoolean(o, "arrows", `${path}.axes`);
  }
  const hasData = (optionalList(raw, "series", path)).length > 0 || (optionalList(raw, "bars", path)).length > 0;
  for (const axis of ["x", "y", "y2"] as const) {
    if (raw[axis] === undefined) {
      if (axis === "y2") continue;
      v.object(raw[axis], `${path}.${axis}`);
    }
    const at = `${path}.${axis}`;
    const a = v.object(raw[axis], at);
    const categories = a.categories;
    if (categories !== undefined) {
      if (axis !== "x") throw new SpecError(`${at}.categories: categories stand on the x axis`);
      const list = v.nonEmptyArray(a, "categories", at, "category names");
      list.forEach((c, i) => {
        if (typeof c !== "string" || c.trim() === "") throw new SpecError(`${at}.categories[${i}] must be a non-empty name`);
      });
    }
    // A range may be left to the data: on a category axis, on a y axis
    // drawn for series or bars, and on an x axis drawn for series.
    range(a, "range", at, !(categories !== undefined || (hasData && axis !== "x") || (axis === "x" && hasData)));
    const unit = v.optionalNumber(a, "unit", at);
    if (unit !== undefined && unit <= 0) throw new SpecError(`${at}.unit must be positive (pixels per unit)`);
    const length = v.optionalNumber(a, "length", at);
    if (length !== undefined && length <= 0) throw new SpecError(`${at}.length must be positive (pixels)`);
    if (unit !== undefined && length !== undefined) throw new SpecError(`${at} gives both "unit" and "length"; one decides the other`);
    if (axis === "y2" && (unit !== undefined || length !== undefined)) {
      throw new SpecError(`${at}: the right axis runs the y axis's height, so its unit is derived, never given`);
    }
    const step = v.optionalNumber(a, "step", at);
    if (step !== undefined && step <= 0) throw new SpecError(`${at}.step must be positive`);
    const every = v.optionalNumber(a, "labelEvery", at);
    if (every !== undefined && (every < 1 || !Number.isInteger(every))) {
      throw new SpecError(`${at}.labelEvery must be a positive integer`);
    }
    v.optionalString(a, "name", at);
    v.optionalString(a, "colour", at);
    v.optionalBoolean(a, "schematic", at);
    const numberless = schematicAll || a.schematic === true || categories !== undefined;
    if (a.require !== undefined) {
      if (numberless) {
        throw new SpecError(`${at}.require asks for numbers on an axis declared ${categories !== undefined ? "a category axis" : "schematic"}, which prints none`);
      }
      const r = v.array(a, "require", at, "numbers");
      const rr = a.range as [number, number] | undefined;
      r.forEach((value, i) => {
        const n = v.finite(value, `${at}.require[${i}]`);
        if (rr !== undefined && (n < rr[0] || n > rr[1])) throw new SpecError(`${at}.require[${i}] is ${n}, outside the axis range [${rr[0]}, ${rr[1]}]`);
      });
    }
    if (a.ticks !== undefined) {
      if (axis === "y2") throw new SpecError(`${at}.ticks: symbolic ticks go on x or y`);
      v.array(a, "ticks", at, "ticks").forEach((t, i) => {
        const w = `${at}.ticks[${i}]`;
        const o = v.object(t, w);
        v.requiredNumber(o, "at", w);
        const label = v.requiredString(o, "label", w);
        // A number on an axis is printed by a numbered axis from its value,
        // never typed beside a tick (ADR 0066).
        if (parseNumber(label.trim(), "pt-BR") !== null || parseNumber(label.trim(), "en") !== null) {
          throw new SpecError(`${w}.label is the number ${JSON.stringify(label)}; a number on an axis is printed by the axis -- leave the axis numbered, or name the place with a symbol ("T", "P_0")`);
        }
      });
    }
  }
  const ids: { id: string; at: string }[] = [];
  for (const [i, f] of (optionalList(raw, "functions", path)).entries()) {
    const at = `${path}.functions[${i}]`;
    const o = v.object(f, at);
    ids.push({ id: v.requiredString(o, "id", at), at });
    // One form per curve (ADR 0029). A parametric curve is recognised by
    // ANY of its three keys and a polar one by either of its two, so a
    // curve missing one of them is told which, rather than told it is no
    // form at all.
    const parametric = o.x !== undefined || o.y !== undefined || o.t !== undefined;
    const polar = o.r !== undefined || o.theta !== undefined;
    const forms = [o.expr !== undefined, o.pieces !== undefined, parametric, polar, o.implicit !== undefined];
    if (forms.filter(Boolean).length !== 1) {
      throw new SpecError(
        `${at} needs exactly one of "expr" (with an optional "domain"), "pieces", "x" + "y" + "t" (parametric), ` +
          `"r" + "theta" (polar) or "implicit"`,
      );
    }
    if (o.expr !== undefined) {
      v.requiredString(o, "expr", at);
      range(o, "domain", at, false);
    } else if (o.pieces !== undefined) {
      v.nonEmptyArray(o, "pieces", at, "pieces").forEach((p, j) => {
        const po = v.object(p, `${at}.pieces[${j}]`);
        v.requiredString(po, "expr", `${at}.pieces[${j}]`);
        range(po, "domain", `${at}.pieces[${j}]`, true);
      });
    } else {
      if (parametric) {
        v.requiredString(o, "x", at);
        v.requiredString(o, "y", at);
        boundRange(o, "t", at);
      } else if (polar) {
        v.requiredString(o, "r", at);
        boundRange(o, "theta", at);
      } else {
        v.requiredString(o, "implicit", at);
      }
      if (o.domain !== undefined) {
        throw new SpecError(
          `${at}.domain is an x interval, and this curve is not a function of x: ` +
            (parametric ? `its extent is "t"` : polar ? `its extent is "theta"` : `it is drawn wherever its equation holds in the plotted range`),
        );
      }
      if (o.features !== undefined) {
        throw new SpecError(`${at}.features finds roots and extrema of y = f(x), and this curve is not one`);
      }
    }
    stroke(o, at);
    curveLabel(o, at);
    v.optionalString(o, "legend", at);
    if (o.features !== undefined) {
      const fs = v.array(o, "features", at, "feature kinds");
      fs.forEach((k, j) => {
        if (k !== "roots" && k !== "extrema") throw new SpecError(`${at}.features[${j}] must be "roots" or "extrema"`);
      });
    }
    // Asymptotes and holes (ADR 0038): the shape here, the mathematics in
    // the dry run -- a claimed asymptote or hole the limits do not confirm is
    // refused there, by name.
    const boundList = (value: unknown, where: string): void => {
      if (!Array.isArray(value) || value.length === 0) throw new SpecError(`${where} must be a non-empty list of x values`);
      value.forEach((b, j) => {
        if (typeof b !== "number" && typeof b !== "string") throw new SpecError(`${where}[${j}] must be a number or an expression like "pi/2"`);
        bound(b as Bound, `${where}[${j}]`);
      });
    };
    if (o.asymptotes !== undefined && typeof o.asymptotes !== "boolean") {
      const a = v.object(o.asymptotes, `${at}.asymptotes`);
      for (const key of Object.keys(a)) {
        if (!["vertical", "horizontal", "oblique"].includes(key)) {
          throw new SpecError(`${at}.asymptotes.${key} is not a kind of asymptote; the kinds are vertical, horizontal and oblique`);
        }
      }
      if (a.vertical !== undefined && typeof a.vertical !== "boolean") boundList(a.vertical, `${at}.asymptotes.vertical`);
      v.optionalBoolean(a, "horizontal", `${at}.asymptotes`);
      v.optionalBoolean(a, "oblique", `${at}.asymptotes`);
    }
    if (o.holes !== undefined && typeof o.holes !== "boolean") {
      if (Array.isArray(o.holes)) boundList(o.holes, `${at}.holes`);
      else {
        const h = v.object(o.holes, `${at}.holes`);
        if (h.at !== undefined) boundList(h.at, `${at}.holes.at`);
        v.optionalString(h, "label", `${at}.holes`);
        dirs(h, `${at}.holes`);
      }
    }
    if ((o.asymptotes !== undefined && o.asymptotes !== false) || (o.holes !== undefined && o.holes !== false)) {
      if (o.expr === undefined) {
        throw new SpecError(
          `${at}: asymptotes and holes are found from a function given by one expression, "expr"; ` +
            `mark a piecewise function's open and closed ends with "points"`,
        );
      }
    }
  }
  for (const [i, l] of (optionalList(raw, "lines", path)).entries()) {
    const at = `${path}.lines[${i}]`;
    const o = v.object(l, at);
    ids.push({ id: v.requiredString(o, "id", at), at });
    const ways = [o.through !== undefined, o.point !== undefined || o.slope !== undefined, o.tangent !== undefined].filter(Boolean).length;
    if (ways !== 1) {
      throw new SpecError(`${at} needs exactly one of "through" [A, B], "point" + "slope", or "tangent" {of, at}`);
    }
    if (o.through !== undefined) {
      if (!Array.isArray(o.through) || o.through.length !== 2) throw new SpecError(`${at}.through must be two points`);
      o.through.forEach((p, j) => pointRef(p, `${at}.through[${j}]`));
    }
    if (o.point !== undefined || o.slope !== undefined) {
      pointRef(o.point, `${at}.point`);
      v.requiredNumber(o, "slope", at);
    }
    if (o.tangent !== undefined) {
      const t = v.object(o.tangent, `${at}.tangent`);
      v.requiredString(t, "of", `${at}.tangent`);
      if (t.at === undefined) v.requiredNumber(t, "at", `${at}.tangent`);
      bound(t.at as Bound, `${at}.tangent.at`);
    }
    range(o, "domain", at, true);
    v.optionalString(o, "series", at);
    stroke(o, at);
    curveLabel(o, at);
    v.optionalString(o, "legend", at);
  }
  for (const [i, sr] of (optionalList(raw, "series", path)).entries()) {
    const at = `${path}.series[${i}]`;
    const o = v.object(sr, at);
    ids.push({ id: v.requiredString(o, "id", at), at });
    if ((o.points === undefined) === (o.values === undefined)) {
      throw new SpecError(`${at} needs exactly one of "points" [[x, y], …] or "values" (one per category)`);
    }
    if (o.points !== undefined) {
      const pts = v.nonEmptyArray(o, "points", at, "points");
      pts.forEach((p, j) => {
        if (!Array.isArray(p) || p.length !== 2) throw new SpecError(`${at}.points[${j}] must be [x, y]`);
        v.finite(p[0], `${at}.points[${j}][0]`);
        v.finite(p[1], `${at}.points[${j}][1]`);
      });
    } else {
      v.nonEmptyArray(o, "values", at, "numbers").forEach((x, j) => v.finite(x, `${at}.values[${j}]`));
    }
    v.optionalEnum(o, "interpolate", at, ["linear", "smooth", "step", "none"]);
    if (o.markers !== undefined && typeof o.markers !== "boolean" && o.markers !== "circle" && o.markers !== "square") {
      throw new SpecError(`${at}.markers must be true, false, "circle" or "square"`);
    }
    if (o.valueLabels !== undefined && typeof o.valueLabels !== "boolean") {
      if (Array.isArray(o.valueLabels)) o.valueLabels.forEach((k, j) => v.finite(k, `${at}.valueLabels[${j}]`));
      else {
        const l = v.object(o.valueLabels, `${at}.valueLabels`);
        if (l.at !== undefined) v.array(l, "at", `${at}.valueLabels`, "indices").forEach((k, j) => v.finite(k, `${at}.valueLabels.at[${j}]`));
        const d = v.optionalNumber(l, "decimals", `${at}.valueLabels`);
        if (d !== undefined && (!Number.isInteger(d) || d < 0 || d > 6)) throw new SpecError(`${at}.valueLabels.decimals must be an integer 0..6`);
        v.optionalString(l, "suffix", `${at}.valueLabels`);
        dirs(l, `${at}.valueLabels`);
      }
    }
    v.optionalEnum(o, "axis", at, ["y", "y2"]);
    if (o.axis === "y2" && raw.y2 === undefined) throw new SpecError(`${at}.axis is "y2", and the figure declares no "y2" axis`);
    arrowsShape(o, at);
    stroke(o, at);
    curveLabel(o, at);
    v.optionalString(o, "legend", at);
  }
  for (const [i, f] of (optionalList(raw, "functions", path)).entries()) arrowsShape(f as Record<string, unknown>, `${path}.functions[${i}]`);
  for (const [i, b] of (optionalList(raw, "bars", path)).entries()) {
    const at = `${path}.bars[${i}]`;
    const o = v.object(b, at);
    ids.push({ id: v.requiredString(o, "id", at), at });
    v.nonEmptyArray(o, "values", at, "numbers").forEach((x, j) => v.finite(x, `${at}.values[${j}]`));
    v.optionalString(o, "colour", at);
    v.optionalString(o, "legend", at);
    v.optionalBoolean(o, "valueLabels", at);
    if ((raw.x as Record<string, unknown>).categories === undefined) throw new SpecError(`${at}: bars stand on a category axis; give x "categories"`);
  }
  v.unique(ids, "function, line, series or bars");
  const pointIds: { id: string; at: string }[] = [];
  for (const [i, p] of (optionalList(raw, "points", path)).entries()) {
    const at = `${path}.points[${i}]`;
    const o = v.object(p, at);
    const id = v.optionalString(o, "id", at);
    if (id !== undefined) pointIds.push({ id, at });
    if (o.at === undefined) v.requiredString(o, "at", at);
    pointRef(o.at, `${at}.at`);
    v.optionalEnum(o, "style", at, ["closed", "open"]);
    v.optionalString(o, "colour", at);
    v.optionalString(o, "label", at);
    dirs(o, at);
    if (o.guides !== undefined && typeof o.guides !== "boolean" && o.guides !== "x" && o.guides !== "y") {
      throw new SpecError(`${at}.guides must be true, false, "x" or "y"`);
    }
    v.optionalNumber(o, "size", at);
  }
  v.unique(pointIds, "point");
  for (const [i, g] of (optionalList(raw, "guides", path)).entries()) {
    const at = `${path}.guides[${i}]`;
    const o = v.object(g, at);
    if ((o.x === undefined) === (o.y === undefined)) throw new SpecError(`${at} needs exactly one of "x" or "y"`);
    v.optionalNumber(o, "x", at);
    v.optionalNumber(o, "y", at);
    v.optionalNumber(o, "from", at);
    v.optionalNumber(o, "to", at);
    v.optionalString(o, "colour", at);
  }
  for (const [i, l] of (optionalList(raw, "labels", path)).entries()) {
    const at = `${path}.labels[${i}]`;
    const o = v.object(l, at);
    v.requiredString(o, "text", at);
    if (o.at === undefined) v.requiredString(o, "at", at);
    pointRef(o.at, `${at}.at`);
    dirs(o, at);
    v.optionalString(o, "colour", at);
    v.optionalNumber(o, "size", at);
    v.optionalNumber(o, "weight", at);
    v.optionalString(o, "names", at);
  }
  // Areas and Riemann sums (ADR 0036): their marks and labels take ids, so
  // those are unique among themselves and against every curve's.
  const regionIds: { id: string; at: string }[] = [...ids];
  const boundOf = (o: Record<string, unknown>, key: string, at: string): void => {
    if (o[key] === undefined) return;
    if (typeof o[key] !== "number" && typeof o[key] !== "string") {
      throw new SpecError(`${at}.${key} must be a number or an expression like "pi/2"`);
    }
    bound(o[key] as Bound, `${at}.${key}`);
  };
  const template = (o: Record<string, unknown>, key: string, at: string, allowBoolean: boolean): void => {
    const value = o[key];
    if (value === undefined || typeof value === "string" || (allowBoolean && typeof value === "boolean")) return;
    throw new SpecError(`${at}.${key} must be ${allowBoolean ? "true, false or " : ""}a template string`);
  };
  for (const [i, a] of (optionalList(raw, "areas", path)).entries()) {
    const at = `${path}.areas[${i}]`;
    const o = v.object(a, at);
    const id = v.optionalString(o, "id", at);
    regionIds.push({ id: id ?? `area-${i + 1}`, at });
    if ((o.of === undefined) === (o.between === undefined)) {
      throw new SpecError(`${at} needs exactly one of "of" (the area under a curve) or "between": [f, g]`);
    }
    if (o.of !== undefined) {
      v.requiredString(o, "of", at);
      if (o.from === undefined || o.to === undefined) {
        throw new SpecError(`${at}: the area under ${String(o.of)} needs "from" and "to"`);
      }
    } else {
      if (!Array.isArray(o.between) || o.between.length !== 2 || o.between.some((c) => typeof c !== "string")) {
        throw new SpecError(`${at}.between must be two curve ids, ["f", "g"]`);
      }
      if ((o.from === undefined) !== (o.to === undefined)) {
        throw new SpecError(`${at}: give both "from" and "to", or neither to bound the area by the curves' intersections`);
      }
    }
    boundOf(o, "from", at);
    boundOf(o, "to", at);
    v.optionalEnum(o, "value", at, ["area", "integral"]);
    v.optionalString(o, "colour", at);
    v.optionalString(o, "negativeColour", at);
    if (o.label !== undefined && o.label !== false && typeof o.label !== "string") {
      const l = v.object(o.label, `${at}.label`);
      v.optionalString(l, "text", `${at}.label`);
      dirs(l, `${at}.label`);
    }
    template(o, "total", at, true);
    v.optionalString(o, "legend", at);
  }
  for (const [i, r] of (optionalList(raw, "riemann", path)).entries()) {
    const at = `${path}.riemann[${i}]`;
    const o = v.object(r, at);
    const id = v.optionalString(o, "id", at);
    regionIds.push({ id: id ?? `riemann-${i + 1}`, at });
    v.requiredString(o, "of", at);
    if (o.from === undefined || o.to === undefined) throw new SpecError(`${at} needs "from" and "to"`);
    boundOf(o, "from", at);
    boundOf(o, "to", at);
    const n = v.requiredNumber(o, "n", at);
    if (!Number.isInteger(n) || n < 1 || n > 200) throw new SpecError(`${at}.n must be an integer from 1 to 200, got ${n}`);
    if (o.rule === undefined) throw new SpecError(`${at}.rule is required: "left", "right", "mid" or "trapezoid"`);
    v.optionalEnum(o, "rule", at, ["left", "right", "mid", "trapezoid"]);
    v.optionalString(o, "colour", at);
    v.optionalString(o, "negativeColour", at);
    v.optionalBoolean(o, "points", at);
    template(o, "label", at, true);
    template(o, "integral", at, true);
    v.optionalString(o, "legend", at);
  }
  v.unique(regionIds, "function, line, area or Riemann sum");
  if (raw.legend !== undefined) {
    const o = v.object(raw.legend, `${path}.legend`);
    if (o.at !== undefined) {
      if (!Array.isArray(o.at) || o.at.length !== 2) throw new SpecError(`${path}.legend.at must be [x, y]`);
      v.finite(o.at[0], `${path}.legend.at[0]`);
      v.finite(o.at[1], `${path}.legend.at[1]`);
    }
  }
  // The dry run: references, expressions, templates and colours.
  v.probe(() => expandFunctionGraph(raw as unknown as FunctionGraphInput));
}

/** `arrows`: a list of fractions of the curve's drawn length, or {at, reverse}. */
function arrowsShape(o: Record<string, unknown>, path: string): void {
  if (o.arrows === undefined) return;
  const list = Array.isArray(o.arrows) ? o.arrows : (v.object(o.arrows, `${path}.arrows`).at as unknown);
  if (!Array.isArray(list) || list.length === 0) throw new SpecError(`${path}.arrows must be a list of positions along the curve, 0 to 1, or {at, reverse}`);
  list.forEach((f, j) => {
    const n = v.finite(f, `${path}.arrows[${j}]`);
    if (n < 0 || n > 1) throw new SpecError(`${path}.arrows[${j}] is ${n}; a position along the curve runs from 0 to 1`);
  });
  if (!Array.isArray(o.arrows)) v.optionalBoolean(o.arrows as Record<string, unknown>, "reverse", `${path}.arrows`);
}

/** A set of panels: each validated as the figure it is, with the set's fields filled in. */
function validatePanels(raw: Record<string, unknown>, path: string): void {
  const panels = v.nonEmptyArray(raw, "panels", path, "panels");
  const columns = v.optionalNumber(raw, "columns", path);
  if (columns !== undefined && (!Number.isInteger(columns) || columns < 1)) throw new SpecError(`${path}.columns must be a positive integer`);
  const letters = new Set<string>();
  panels.forEach((p, i) => {
    const o = v.object(p, `${path}.panels[${i}]`);
    if (o.panels !== undefined) throw new SpecError(`${path}.panels[${i}] holds panels of its own; a set is one level deep`);
    const label = v.optionalString(o, "label", `${path}.panels[${i}]`);
    const letter = label ?? String.fromCharCode(65 + i);
    if (letters.has(letter)) throw new SpecError(`${path}.panels[${i}] repeats the letter ${letter}`);
    if (!/^[A-Za-z0-9]{1,3}$/.test(letter)) throw new SpecError(`${path}.panels[${i}].label must be a short letter, like "A"`);
    letters.add(letter);
    try {
      validateFunctionGraphInput(panelInput(raw as unknown as FunctionGraphInput, o as PanelInput) as unknown as Record<string, unknown>);
    } catch (error) {
      if (error instanceof SpecError) throw new SpecError(`${path}.panels[${i}] (${letter}): ${error.message}`);
      throw error;
    }
  });
  v.probe(() => expandFunctionGraph(raw as unknown as FunctionGraphInput));
}

function optionalList(raw: Record<string, unknown>, key: string, path: string): unknown[] {
  if (raw[key] === undefined) return [];
  return v.array(raw, key, path, key);
}
