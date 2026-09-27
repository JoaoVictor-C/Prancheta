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

import type { FigureSpec, LineStyle, Mark, Point } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { ExprError, compile, compileTree, constantValue, derivative, parse, parseEquation, parseIn, pretty } from "../../math/expr.ts";
import type { Node } from "../../math/expr.ts";
import { contour } from "../../math/contour.ts";
import { LOCALES, MINUS, formatNumber, formatPoint } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";
import { Board } from "./board.ts";
import type { Box } from "./board.ts";
import { clipRuns, sampleParametric } from "./curves.ts";
import type { Rect } from "./curves.ts";

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
  /** [min, max] shown, in axis units. */
  range: [number, number];
  /** Pixels per axis unit. */
  unit: number;
  /** Lattice spacing. Default 1. */
  step?: number;
  /** Print every nth lattice number. Default 1. */
  labelEvery?: number;
  /** Axis name drawn at its positive end. Default "x" / "y"; "" for none. */
  name?: string;
  /** Numbers that must be printed on this axis even off the lattice -- an intercept the text cites. */
  require?: number[];
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
  /** Mark computed roots and local extrema, each declared to lie on this curve (ADR 0025). */
  features?: ("roots" | "extrema")[];
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
  /** Dashed guides from the point to both axes. */
  guides?: boolean;
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
  legend?: LegendInput;
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
  /** Parametric, polar, implicit: what `{expr}` prints. */
  display?: string;
};

type Resolved = { x: number; y: number };

const LEFT = 46;
const RIGHT = 40;
const TOP = 30;
const BOTTOM = 34;

class Build {
  readonly input: FunctionGraphInput;
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
  readonly required = { x: new Set<number>(), y: new Set<number>() };

  constructor(input: FunctionGraphInput) {
    this.input = input;
    this.locale = input.locale ?? "pt-BR";
    this.xr = input.x.range;
    this.yr = input.y.range;
    this.ux = input.x.unit;
    this.uy = input.y.unit;
    this.sx = input.x.step ?? 1;
    this.sy = input.y.step ?? 1;
    const W = Math.round(LEFT + (this.xr[1] - this.xr[0]) * this.ux + RIGHT);
    const H = Math.round(TOP + (this.yr[1] - this.yr[0]) * this.uy + BOTTOM);
    this.board = new Board(W, H, PAPER);
    this.ox = LEFT - this.xr[0] * this.ux;
    this.oy = TOP + this.yr[1] * this.uy;
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
    if (fi < 0 && li < 0) {
      const ids = [...(this.input.functions ?? []), ...(this.input.lines ?? [])].map((c) => c.id);
      v.knownId(id, new Set(ids), path, "a function or line");
    }
    const curve = this.once(`curve ${id}`, path, () =>
      fi >= 0
        ? this.functionCurve(this.input.functions![fi]!, `functions[${fi}]`)
        : this.lineCurve(this.input.lines![li]!, `lines[${li}]`),
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
      const isCurve = [...(this.input.functions ?? []), ...(this.input.lines ?? [])].some((c) => c.id === name);
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
    for (const value of [...lattice(input.x, this.sx), ...(input.x.require ?? [])]) this.required.x.add(value);
    for (const value of [...lattice(input.y, this.sy), ...(input.y.require ?? [])]) this.required.y.add(value);
    this.board.frames.push({
      id: "plane",
      origin: { x: this.ox, y: this.oy },
      xUnit: this.ux,
      yUnit: this.uy,
      grid: {
        x: { from: this.xr[0], to: this.xr[1], step: this.sx, origin: 0, require: [...this.required.x] },
        y: { from: this.yr[0], to: this.yr[1], step: this.sy, origin: 0, require: [...this.required.y] },
        axes: true,
        labels: false,
        stroke: GRID,
        axisStroke: AXIS,
        labelColor: FAINT,
        lineStyle: "dashed",
      },
    });
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
    for (let i = 0; i <= n; i += 1) {
      const x = a + ((b - a) * i) / n;
      const y = fn(x);
      if (Number.isFinite(y) && inside(y)) run.push(this.at(x, y));
      else {
        if (run.length > 1) runs.push(run);
        run = [];
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
      if (p.guides !== true) continue;
      const at = this.resolve(p.at, `points[${i}].at`);
      this.guide(this.at(at.x, this.baseY), this.at(at.x, at.y), SOFT, 1.1);
      this.guide(this.at(this.baseX, at.y), this.at(at.x, at.y), SOFT, 1.1);
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
    const tryTick = (text: string, id: string, cands: [number, number][], spread: () => [number, number][] = () => []): void => {
      // Sized to the line box the browser will actually set (11px at a 1.45
      // line height), not to the glyphs: `text-clear-of-ink` measures the
      // line box, and a number cleared by a tighter estimate was reported
      // sitting on the curve it had just slid away from.
      const w = b.measure(text, size) - 8;
      const h = Math.ceil(size * 1.45);
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
      const hit = cands.find(fits) ?? (cutsCurve(cands[0]!) ? spread().find(fits) : undefined);
      const [x, y] = hit ?? cands[0]!;
      const block = b.label(text, x, y, { size, colour: FAINT, width: w, id, gridOf: "plane", ...(hit ? {} : { fill: PAPER }) });
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
    const origin = this.baseX === 0 && this.baseY === 0;
    if (origin) {
      const o = this.at(0, 0);
      const reach = Math.min(halfX, halfY);
      tryTick("0", "tick-origin", [...walk(o.x - 10, o.y + 13, -0.7, 0.7, reach), [o.x + 10, o.y + 13]], () =>
        // Off the axes: a "0" on either axis line is ink over ink.
        around(o.x, o.y, reach, reach).filter(([x, y]) => Math.abs(x - o.x) >= 8 && Math.abs(y - o.y) >= 11),
      );
    }
    const xs = [...this.required.x, ...(origin ? [] : this.xr[0] <= 0 && 0 <= this.xr[1] ? [0] : [])].sort((p, q) => p - q);
    xs.forEach((value, i) => {
      const c = this.at(value, this.baseY);
      tryTick(this.fmt(value), `tick-x-${i}`, [...walk(c.x, c.y + 14, 0, 1, halfY), ...walk(c.x, c.y - 14, 0, -1, halfY)], () =>
        around(c.x, c.y, halfX / 2, 14 + halfY, 14),
      );
    });
    const ys = [...this.required.y].sort((p, q) => p - q);
    ys.forEach((value, i) => {
      const c = this.at(this.baseX, value);
      const t = this.fmt(value);
      const half = (b.measure(t, size) - 8) / 2;
      tryTick(t, `tick-y-${i}`, [...walk(c.x - 8 - half, c.y, -1, 0, halfX - half), ...walk(c.x + 8 + half, c.y, 1, 0, halfX - half)], () =>
        around(c.x, c.y, 8 + halfX, halfY / 2).filter(([x]) => Math.abs(x - c.x) >= 8 + half),
      );
    });
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
    const all: [FunctionInput | LineInput, string][] = [
      ...(this.input.functions ?? []).map((f, i) => [f, `functions[${i}]`] as [FunctionInput, string]),
      ...(this.input.lines ?? []).map((l, i) => [l, `lines[${i}]`] as [LineInput, string]),
    ];
    for (const [item, path] of all) {
      if (item.label === undefined) continue;
      const curve = this.curveById(item.id, path);
      const where = this.labelAnchor(curve, item.label.at, `${path}.label.at`);
      if (!Number.isFinite(where.y)) throw new SpecError(`${path}.label.at: ${item.id} is not defined there`);
      const c = this.at(where.x, where.y);
      this.board.place(this.fill(item.label.text, { curve }, `${path}.label.text`), c.x, c.y, dirsOf(item.label.towards, ["R", "U", "L", "D"]), {
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
      this.board.place(this.fill(p.label, { point: at }, `points[${i}].label`), c.x, c.y, dirsOf(p.towards, ["NE", "NW", "SE", "SW"]), {
        size: p.size ?? 14,
        weight: 600,
        colour,
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
      this.board.place(this.fill(l.text, { point: at }, `${path}.text`), c.x, c.y, dirsOf(l.towards, ["R", "U", "L", "D"]), {
        size: l.size ?? 14,
        weight: l.weight ?? 600,
        colour: colourOf(l.colour, fallback, `${path}.colour`),
        // A free label names its series when it says so, and otherwise the
        // point it was anchored at (ADR 0035): never nothing.
        ...(l.names === undefined ? { annotatesPlace: c } : { names: l.names }),
      });
    }
  }

  axisNames(): void {
    const xn = this.input.x.name ?? "x";
    const yn = this.input.y.name ?? "y";
    // An axis name names its axis, but the axis is grid furniture the
    // resolver draws after this preset returns, so there is no id to name
    // yet; it is declared free-standing instead (ADR 0035).
    const o = { size: 15, weight: 600, colour: SOFT, serif: true, freeStanding: true };
    if (xn !== "") {
      const ex = this.at(this.xr[1], this.baseY);
      this.board.place(xn, ex.x + 14, ex.y - 12, [DIRS.R, DIRS.U], o);
    }
    if (yn !== "") {
      const ey = this.at(this.baseX, this.yr[1]);
      this.board.place(yn, ey.x + 16, ey.y + 4, [DIRS.R, DIRS.D], o);
    }
  }

  /** Legend rows in declaration order: functions first, then lines, one per series. */
  legendRows(): { text: string; colour: string; width: number; lineStyle: LineStyle | undefined }[] {
    const rows: { text: string; colour: string; width: number; lineStyle: LineStyle | undefined }[] = [];
    const all: [FunctionInput | LineInput, string][] = [
      ...(this.input.functions ?? []).map((f, i) => [f, `functions[${i}]`] as [FunctionInput, string]),
      ...(this.input.lines ?? []).map((l, i) => [l, `lines[${i}]`] as [LineInput, string]),
    ];
    for (const [item, path] of all) {
      if (item.legend === undefined) continue;
      const curve = this.curveById(item.id, path);
      rows.push({
        text: this.fill(item.legend, { curve }, `${path}.legend`),
        colour: curve.colour,
        width: curve.width,
        lineStyle: curve.lineStyle,
      });
    }
    return rows;
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
        return ink + labels * 3;
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
          if (b.inkThrough(box, 0) > 0 || b.taken.some((t) => b.hits(box, t, 0))) break;
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
      b.poly(
        [
          { x: origin.x, y: yy },
          { x: origin.x + 26, y: yy },
        ],
        { stroke: row.colour, width: 2.4, ...(row.lineStyle === undefined ? {} : { lineStyle: row.lineStyle }), id: `legend-swatch-${i + 1}` },
      );
      b.label(row.text, origin.x + 34 + widths[i]! / 2, yy, {
        size,
        weight: 600,
        colour: row.colour,
        width: widths[i]!,
        align: "start",
        id: `legend-${i + 1}`,
        // A legend row names the end of its own swatch (ADR 0028).
        annotatesPlace: { x: origin.x + 26, y: yy },
      });
    });
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
  const g = new Build(input);
  const out = new Map<string, { x: number; y: number }>();
  for (const [i, p] of (input.points ?? []).entries()) {
    if (p.id !== undefined) out.set(p.id, g.pointById(p.id, `points[${i}]`));
  }
  return out;
}

export function expandFunctionGraph(input: FunctionGraphInput): FigureSpec {
  const g = new Build(input);
  g.frame();
  g.strokes();
  g.guides();
  g.features();
  g.dots();
  g.ticks();
  g.breakGuides();
  g.curveLabels();
  g.pointLabels();
  g.freeLabels();
  g.axisNames();
  g.legend();
  // Through the IR parser on the way out: it validates what this preset
  // produced and resolves the plane's frame into canvas coordinates, which
  // is the one step a preset's output otherwise never gets (every other
  // preset states canvas coordinates directly).
  return parseSpec(g.board.spec(input.title ?? "function graph"));
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
  for (const axis of ["x", "y"] as const) {
    if (raw[axis] === undefined) v.object(raw[axis], `${path}.${axis}`);
    const a = v.object(raw[axis], `${path}.${axis}`);
    range(a, "range", `${path}.${axis}`, true);
    const unit = v.requiredNumber(a, "unit", `${path}.${axis}`);
    if (unit <= 0) throw new SpecError(`${path}.${axis}.unit must be positive (pixels per unit)`);
    const step = v.optionalNumber(a, "step", `${path}.${axis}`);
    if (step !== undefined && step <= 0) throw new SpecError(`${path}.${axis}.step must be positive`);
    const every = v.optionalNumber(a, "labelEvery", `${path}.${axis}`);
    if (every !== undefined && (every < 1 || !Number.isInteger(every))) {
      throw new SpecError(`${path}.${axis}.labelEvery must be a positive integer`);
    }
    v.optionalString(a, "name", `${path}.${axis}`);
    if (a.require !== undefined) {
      const r = v.array(a, "require", `${path}.${axis}`, "numbers");
      const [lo, hi] = a.range as [number, number];
      r.forEach((value, i) => {
        const n = v.finite(value, `${path}.${axis}.require[${i}]`);
        if (n < lo || n > hi) throw new SpecError(`${path}.${axis}.require[${i}] is ${n}, outside the axis range [${lo}, ${hi}]`);
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
  v.unique(ids, "function or line");
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
    v.optionalBoolean(o, "guides", at);
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
  if (raw.legend !== undefined) {
    const o = v.object(raw.legend, `${path}.legend`);
    if (o.at !== undefined) {
      if (!Array.isArray(o.at) || o.at.length !== 2) throw new SpecError(`${path}.legend.at must be [x, y]`);
      v.finite(o.at[0], `${path}.legend.at[0]`);
      v.finite(o.at[1], `${path}.legend.at[1]`);
    }
  }
  // The dry run: references, expressions, templates and colours.
  expandFunctionGraph(raw as unknown as FunctionGraphInput);
}

function optionalList(raw: Record<string, unknown>, key: string, path: string): unknown[] {
  if (raw[key] === undefined) return [];
  return v.array(raw, key, path, key);
}
