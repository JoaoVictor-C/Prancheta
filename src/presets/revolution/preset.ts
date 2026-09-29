/**
 * revolution -- the Cálculo 2 figure "volume de sólido de revolução"
 * (ADR 0049).
 *
 * A plane region (under y = f(x), or between two curves) is turned about the
 * x axis, the y axis, or a line y = c or x = c. The figure is DERIVED from
 * the expressions and the axis; nothing drawn and nothing printed is typed:
 *
 *  - the solid through the camera of ADR 0045: its silhouette (the envelope
 *    of the cross-section ellipses, `geometry.silhouette`), the rims where
 *    its surfaces meet, a few cross-sections, all dashed where the solid
 *    itself hides them (a viewing ray cast against the solid's own
 *    membership test);
 *  - one highlighted slice -- a disc, a washer or a cylindrical shell --
 *    with its radius R(x) (and r(x), or the shell's radius and height)
 *    printed from the expressions, and its thickness dx;
 *  - a companion plane view: the region, the representative rectangle, and
 *    the same radii as dimension segments;
 *  - the volume, from `numeric.integrate`, printed exact when it is a
 *    rational multiple of π (8π, 2π/15), with the integral written out.
 */

import type { FigureSpec, Frame, GridSpec, Mark, Point, Rect, Scene } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { tickPlan } from "../../ir/frames.ts";
import { LOCALES, MINUS, formatNumber, snapExact, writeExact } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";
import { ExprError, compile, constantValue, parse, pretty } from "../../math/expr.ts";
import type { Node } from "../../math/expr.ts";
import { NumericError } from "../../math/numeric.ts";
import { contour } from "../../math/contour.ts";
import { intersections, signParts } from "../function-graph/areas.ts";
import { GeometryError, normalize, scale as vscale, sub as vsub } from "../../geometry/vec.ts";
import type { Vec2, Vec3 } from "../../geometry/vec.ts";
import { makeCamera, orthographicCamera, project, projectDirection, tangentParamsParallelTo } from "../../geometry/projection.ts";
import type { Camera, CameraSpec, ProjectedCircle } from "../../geometry/projection.ts";
import { SpacePlacer, aroundPlace } from "../space/placer.ts";
import { convexHull, splitCircle } from "../solid/geometry.ts";
import { fitUnits, niceStep } from "../shared/scale.ts";
import * as G from "./geometry.ts";

// ---- input ------------------------------------------------------------------------

export type Bound = number | string;
export type RegionSpec = { of: string; from: Bound; to: Bound } | { between: [string, string]; from?: Bound; to?: Bound };
export type AxisSpec = "x" | "y" | { y: number } | { x: number };
export type Method = "discs" | "washers" | "shells";
export const METHODS: readonly Method[] = ["discs", "washers", "shells"];

export type RevolutionInput = {
  title?: string;
  locale?: Locale;
  /** The plane region: under a curve (and over the x axis), or between two curves. */
  region: RegionSpec;
  /** The axis of revolution: the x axis, the y axis, a line y = c or x = c. */
  axis: AxisSpec;
  /** Default: discs, or washers when the region leaves a hole, about a horizontal axis; shells about a vertical one. */
  method?: Method;
  /** The highlighted slice: true (default) at a point chosen inside the interval, {at} at that x, false for none. */
  slice?: boolean | { at: Bound };
  /** How many cross-sections to draw inside the solid, 0 to 6. Default 3. */
  sections?: number;
  /** The companion plane view: the region and its representative rectangle. Default true. */
  plane?: boolean;
  /** Default: orthographic, looking slightly along the axis (ADR 0049). */
  camera?: CameraSpec;
  /** false: the question's figure -- the solid and the region as given, the slice named by letters only, no expressions and no volume. Default true. */
  answers?: boolean;
};

// ---- palette and sizes -------------------------------------------------------------

const PAPER = "#FCFBF7";
const INK = "#181B21";
const ACCENT = "#9A3409";
const AXIS_BLUE = "#1D4E89";
const SOFT = "#4E5763";
/** Measure labels: the accent, darkened so it reads on the slice's own tint. */
const ACCENT_TEXT = "#7A2807";
/** The solid's tint, also the region's tint in the plane view: one object, one colour. */
const SOLID_TINT = `${INK}1A`;
const SLICE_TINT = `${ACCENT}1F`;
const SLICE_FACE = `${ACCENT}1F`;
const TARGET_3D = 420;
const TARGET_2D = 340;
const PAD = 58;
const GAP = 36;
const W_OUTLINE = 1.9;
const W_HIDDEN = 1.1;
const W_SECTION = 1.0;
const W_SLICE = 1.5;
const W_AXIS = 1.4;
const CAPTION_LINE_H = 20;
/** The 3D camera's azimuth off the plane of the region, degrees. Sets how open the cross-section ellipses are. */
const OPEN = 22;

// ---- expressions and words ---------------------------------------------------------

type Curve = { fn: G.Fn; src: string; node: Node; text: string };

function curve(src: unknown, path: string): Curve {
  if (typeof src !== "string" || src.trim() === "") throw new SpecError(`${path} must be an expression in x, such as "sqrt(x)"`);
  let node: Node;
  try {
    node = parse(src, "x");
  } catch (e) {
    if (e instanceof ExprError) throw new SpecError(`${path} "${src}": ${e.message}`);
    throw e;
  }
  return { fn: compile(src, "x"), src, node, text: readable(node) };
}

/** An expression as a reader writes it: √x, not √(x). */
function readable(node: Node): string {
  return pretty(node).replace(/√\(([A-Za-z0-9²³]+)\)/g, "√$1");
}

/** Does this term need brackets when subtracted or multiplied? */
function compound(node: Node | null, text: string): boolean {
  if (node === null) return /[+−-]/.test(text.slice(1));
  return node.kind === "neg" || (node.kind === "bin" && (node.op === "+" || node.op === "-"));
}

function bound(value: unknown, path: string): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new SpecError(`${path} must be finite`);
    return value;
  }
  if (typeof value === "string") {
    try {
      return constantValue(value);
    } catch (e) {
      if (e instanceof ExprError) throw new SpecError(`${path} "${value}": ${e.message}`);
      throw e;
    }
  }
  throw new SpecError(`${path} must be a number or a constant expression such as "pi/2"`);
}

const WORDS = {
  "pt-BR": { discs: "Discos", washers: "Arruelas", shells: "Cascas cilíndricas", with: "com", and: "e", from: "de", to: "a" },
  en: { discs: "Discs", washers: "Washers", shells: "Cylindrical shells", with: "with", and: "and", from: "from", to: "to" },
} as const;

const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "−": "₋" };
const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "−": "⁻" };

/** "∫₀⁴" when both limits are whole numbers; otherwise a plain ∫ and the limits said in words after the integrand. */
function integralSign(aText: string, bText: string): { sign: string; tail: string } | { sign: string; tail: null } {
  const whole = /^−?\d+$/;
  if (whole.test(aText) && whole.test(bText)) {
    return { sign: `∫${[...aText].map((c) => SUB[c]).join("")}${[...bText].map((c) => SUP[c]).join("")}`, tail: null };
  }
  return { sign: "∫", tail: `${aText}|${bText}` };
}

/** A squared term: x², (√x)², (x − 1)². */
function squared(text: string): string {
  return /^[A-Za-z]$|^\d+(,\d+)?$/.test(text) ? `${text}²` : `(${text})²`;
}

/**
 * The exact value of a volume when it has one: a rational multiple of π
 * (8π, 2π/15, 56π/3), or whatever `snapExact` recognises. Otherwise null,
 * and the volume prints rounded after "≈".
 */
export function exactVolume(V: number, locale: Locale = "pt-BR"): string | null {
  const snapped = snapExact(V, 1e-8);
  if (snapped.exact) return writeExact(snapped, locale);
  const I = V / Math.PI;
  for (let q = 1; q <= 64; q += 1) {
    const p = Math.round(I * q);
    if (p !== 0 && Math.abs(p / q - I) <= 1e-8 * Math.max(1, Math.abs(I))) {
      const sign = p < 0 ? MINUS : "";
      const k = Math.abs(p);
      return `${sign}${k === 1 ? "" : k}π${q === 1 ? "" : `/${q}`}`;
    }
  }
  return null;
}

/** A volume as the panel prints it: "= 8π ≈ 25,133", or "≈ 7,137" when it is not exact. */
export function volumeText(V: number, locale: Locale = "pt-BR"): { text: string; exact: boolean } {
  const exact = exactVolume(V, locale);
  const approx = formatNumber(V, locale, { decimals: 3 });
  return exact === null ? { text: `≈ ${approx}`, exact: false } : { text: `= ${exact} ≈ ${approx}`, exact: true };
}

// ---- resolution --------------------------------------------------------------------

export type Resolved = {
  model: G.Model;
  method: Method;
  /** The upper and lower boundary curves; null for the x axis (y = 0). */
  upper: Curve | null;
  lower: Curve | null;
  a: number;
  b: number;
  aText: string;
  bText: string;
  sliceAt: number | null;
  sections: number;
  axisName: string;
  /** What the slice's measures are, as expressions of x. */
  texts: { R?: string; r?: string; radius?: string; height?: string };
  volume: number;
};

const ZERO: Curve = { fn: () => 0, src: "0", node: { kind: "num", value: 0 }, text: "0" };

function numeric<T>(what: string, run: () => T): T {
  try {
    return run();
  } catch (e) {
    if (e instanceof NumericError) throw new SpecError(`${what}: ${e.message.replace(/pole/g, "pole or undefined point")}`);
    if (e instanceof GeometryError) throw new SpecError(`${what}: ${e.message}`);
    throw e;
  }
}

export function resolveRevolution(input: RevolutionInput): Resolved {
  const locale = input.locale ?? "pt-BR";
  const fmt = (x: number): string => formatNumber(x, locale);
  const raw = v.object(input.region, "revolution.region");
  let f: Curve;
  let g: Curve | null;
  let a: number;
  let b: number;
  if (raw.of !== undefined) {
    if (raw.between !== undefined) throw new SpecError("revolution.region gives both of and between -- one region at a time");
    f = curve(raw.of, "revolution.region.of");
    g = null;
    if (raw.from === undefined || raw.to === undefined) throw new SpecError("revolution.region needs from and to: the region under a curve is bounded by two vertical lines");
    a = bound(raw.from, "revolution.region.from");
    b = bound(raw.to, "revolution.region.to");
  } else if (raw.between !== undefined) {
    if (!Array.isArray(raw.between) || raw.between.length !== 2) throw new SpecError("revolution.region.between must be two expressions, [f, g]");
    f = curve(raw.between[0], "revolution.region.between[0]");
    g = curve(raw.between[1], "revolution.region.between[1]");
    if ((raw.from === undefined) !== (raw.to === undefined)) throw new SpecError("revolution.region gives one bound of from and to -- give both, or neither to take the curves' intersections");
    if (raw.from !== undefined) {
      a = bound(raw.from, "revolution.region.from");
      b = bound(raw.to, "revolution.region.to");
    } else {
      const fx = f.fn;
      const gx = g.fn;
      const meet = numeric("revolution.region", () => intersections((x) => fx(x) - gx(x), -20, 20));
      if (meet.length < 2) throw new SpecError(`revolution.region: "${f.src}" and "${g.src}" meet ${meet.length === 0 ? "nowhere" : "once"} in [−20, 20] -- give from and to`);
      a = meet[0]!;
      b = meet[meet.length - 1]!;
    }
  } else throw new SpecError('revolution.region needs "of" (under a curve) or "between" (two curves)');
  if (!(b > a)) throw new SpecError(`revolution.region: from (${fmt(a)}) must be less than to (${fmt(b)})`);

  // Which boundary is on top; refused where the two cross.
  const G0 = g ?? ZERO;
  const gap = (x: number): number => f.fn(x) - G0.fn(x);
  const parts = numeric(`revolution.region on [${fmt(a)}, ${fmt(b)}]`, () => signParts(gap, a, b));
  if (parts.length === 0) throw new SpecError(`revolution.region: "${f.src}" and "${G0.src}" coincide on [${fmt(a)}, ${fmt(b)}] -- the region has no area`);
  if (parts.some((p) => p.sign !== parts[0]!.sign)) {
    const where = parts[1]!.from;
    throw new SpecError(
      `revolution.region: ${g === null ? `"${f.src}" crosses the x axis` : `"${f.src}" and "${g.src}" cross`} at x = ${writeExact(snapExact(where, 1e-9), locale)} -- ` +
        `the region is two pieces there; revolve each piece on its own`,
    );
  }
  const fOnTop = parts[0]!.sign > 0;
  const upperC = fOnTop ? f : G0;
  const lowerC = fOnTop ? G0 : f;
  const region: G.Region = { lo: lowerC.fn, hi: upperC.fn, a, b };
  for (const x of [a, b, (a + b) / 2]) {
    if (!Number.isFinite(region.lo(x)) || !Number.isFinite(region.hi(x))) throw new SpecError(`revolution.region is undefined at x = ${fmt(x)}`);
  }

  // The axis, and which side of it the region lies on.
  let axis: G.Axis;
  let axisName: string;
  const ax = input.axis as unknown;
  if (ax === "x" || ax === "y") {
    axis = { kind: ax === "x" ? "h" : "v", c: 0 };
    axisName = ax;
  } else if (typeof ax === "object" && ax !== null && !Array.isArray(ax)) {
    const o = ax as Record<string, unknown>;
    if ((o.y === undefined) === (o.x === undefined)) throw new SpecError('revolution.axis must be "x", "y", {"y": c} or {"x": c}');
    const c = v.finite(o.y ?? o.x, "revolution.axis");
    axis = { kind: o.y !== undefined ? "h" : "v", c };
    axisName = c === 0 ? (o.y !== undefined ? "x" : "y") : `${o.y !== undefined ? "y" : "x"} = ${fmt(c)}`;
  } else throw new SpecError('revolution.axis is required: "x", "y", {"y": c} or {"x": c}');

  let side: 1 | -1;
  const lineName = axis.kind === "h" ? `y = ${fmt(axis.c)}` : `x = ${fmt(axis.c)}`;
  if (axis.kind === "h") {
    const signs = new Set<number>();
    for (const cv of [upperC, lowerC]) {
      const ps = numeric("revolution.region", () => signParts((x) => cv.fn(x) - axis.c, a, b));
      for (const p of ps) signs.add(p.sign);
      if (ps.length > 1 && ps.some((p) => p.sign !== ps[0]!.sign)) {
        const at = ps.find((p) => p.sign !== ps[0]!.sign)!.from;
        throw new SpecError(
          `revolution.region crosses the axis of revolution ${lineName} at x = ${writeExact(snapExact(at, 1e-9), locale)} -- ` +
            `a solid of revolution is swept by a region on ONE side of its axis; split the region there`,
        );
      }
    }
    if (signs.size > 1) {
      throw new SpecError(`revolution.region lies on both sides of the axis of revolution ${lineName} -- a solid of revolution is swept by a region on ONE side of its axis`);
    }
    side = signs.has(-1) ? -1 : 1;
  } else {
    const tol = 1e-12 * Math.max(1, Math.abs(axis.c));
    if (axis.c > a + tol && axis.c < b - tol) {
      throw new SpecError(
        `revolution.region crosses the axis of revolution ${lineName}: it runs from x = ${fmt(a)} to x = ${fmt(b)} -- ` +
          `a solid of revolution is swept by a region on ONE side of its axis; split the region there`,
      );
    }
    side = a >= axis.c - tol ? 1 : -1;
  }
  const model = G.makeModel(region, axis, side);

  // The method.
  const hole = (() => {
    if (axis.kind === "v") return false;
    for (let i = 0; i <= 200; i += 1) if (G.washerRadii(model, a + ((b - a) * i) / 200).r > 1e-9) return true;
    return false;
  })();
  const asked = v.optionalEnum(input as unknown as Record<string, unknown>, "method", "revolution", METHODS);
  let method: Method;
  if (axis.kind === "h") {
    if (asked === "shells") {
      throw new SpecError(
        `revolution.method "shells" about the horizontal line ${lineName} slices along y, and would need the region's width as a function of y, which the region, stated in x, does not give -- ` +
          `use "${hole ? "washers" : "discs"}" (the volume is the same)`,
      );
    }
    if (asked === "discs" && hole) throw new SpecError(`revolution.method "discs": the region does not reach the axis ${lineName}, so each slice has a hole -- use "washers"`);
    if (asked === "washers" && !hole) throw new SpecError(`revolution.method "washers": the region reaches the axis ${lineName} all along, so each slice is a whole disc -- use "discs"`);
    method = hole ? "washers" : "discs";
  } else {
    if (asked !== undefined && asked !== "shells") {
      throw new SpecError(
        `revolution.method "${asked}" about the vertical line ${lineName} slices along y, and would need x as a function of y, which the region, stated in x, does not give -- use "shells" (the volume is the same)`,
      );
    }
    method = "shells";
  }

  // The slice.
  let sliceAt: number | null;
  const sl = input.slice as unknown;
  if (sl === false) sliceAt = null;
  else if (sl === undefined || sl === true) sliceAt = a + 0.62 * (b - a);
  else {
    const o = v.object(sl, "revolution.slice");
    sliceAt = bound(o.at, "revolution.slice.at");
    if (!(sliceAt > a && sliceAt < b)) throw new SpecError(`revolution.slice.at (${fmt(sliceAt)}) must lie inside the region, between ${fmt(a)} and ${fmt(b)}`);
  }
  const sections = input.sections === undefined ? 3 : input.sections;
  if (!Number.isInteger(sections) || sections < 0 || sections > 6) throw new SpecError(`revolution.sections must be a whole number from 0 to 6, got ${String(input.sections)}`);

  // What the slice's measures are, written from the expressions.
  const cText = fmt(Math.abs(axis.c));
  const distanceFromAxis = (cv: Curve | null): string => {
    if (cv === null) return fmt(Math.abs(axis.c));
    const t = cv.text;
    if (side === 1) return axis.c === 0 ? t : `${t} ${axis.c < 0 ? "+" : "−"} ${cText}`;
    if (axis.c === 0) return compound(cv.node, t) ? `${MINUS}(${t})` : `${MINUS}${t}`;
    return `${fmt(axis.c)} − ${compound(cv.node, t) ? `(${t})` : t}`;
  };
  const texts: Resolved["texts"] = {};
  const upper = upperC === ZERO ? null : upperC;
  const lower = lowerC === ZERO ? null : lowerC;
  if (axis.kind === "h") {
    const far = side === 1 ? upper : lower;
    const near = side === 1 ? lower : upper;
    texts.R = distanceFromAxis(far);
    if (method === "washers") texts.r = distanceFromAxis(near);
  } else {
    texts.radius = side === 1 ? (axis.c === 0 ? "x" : `x ${axis.c < 0 ? "+" : "−"} ${cText}`) : axis.c === 0 ? `${MINUS}x` : `${fmt(axis.c)} − x`;
    if (lower === null) texts.height = upper!.text;
    else if (upper === null) texts.height = compound(lower.node, lower.text) ? `${MINUS}(${lower.text})` : `${MINUS}${lower.text}`;
    else texts.height = `${upper.text} − ${compound(lower.node, lower.text) ? `(${lower.text})` : lower.text}`;
  }

  const volume = numeric("revolution: the volume", () => G.volumeInX(model));
  const aText = writeExact(snapExact(a, 1e-9), locale);
  const bText = writeExact(snapExact(b, 1e-9), locale);
  return { model, method, upper, lower, a, b, aText, bText, sliceAt, sections, axisName, texts, volume };
}

/** The panel's lines: the method and its integral, then the integral of these curves and its value. */
export function volumeLines(r: Resolved, locale: Locale = "pt-BR"): string[] {
  const w = WORDS[locale];
  const { sign, tail } = integralSign(r.aText, r.bText);
  const limits = tail === null ? "" : `, x ${w.from} ${r.aText} ${w.to} ${r.bText}`;
  const t = r.texts;
  const value = volumeText(r.volume, locale).text;
  if (r.method === "discs") {
    return [`${w.discs}: V = π${sign} R(x)² dx, ${w.with} R(x) = ${t.R}${limits}`, `V = π${sign} ${squared(t.R!)} dx ${value}`];
  }
  if (r.method === "washers") {
    return [
      `${w.washers}: V = π${sign} (R(x)² − r(x)²) dx, ${w.with} R(x) = ${t.R} ${w.and} r(x) = ${t.r}${limits}`,
      `V = π${sign} (${squared(t.R!)} − ${squared(t.r!)}) dx ${value}`,
    ];
  }
  const factor = (s: string): string => (/^[A-Za-z0-9,√²³]+$/.test(s) ? s : `(${s})`);
  const rad = factor(t.radius!);
  const hgt = factor(t.height!);
  const product = hgt.startsWith("(") ? `${rad}${hgt}` : `${rad}·${hgt}`;
  return [`${w.shells}: V = 2π${sign} r(x)·h(x) dx, ${w.with} r(x) = ${t.radius} ${w.and} h(x) = ${t.height}${limits}`, `V = 2π${sign} ${product} dx ${value}`];
}

/** The default camera (ADR 0049): orthographic, the region's plane nearly facing the reader, turned 22° so the cross-sections open into ellipses and the reader sees the end the axis points to (the top, for a vertical axis). */
export function defaultCamera(axis: G.Axis): Camera {
  return axis.kind === "h" ? orthographicCamera(-OPEN, 0) : orthographicCamera(0, OPEN);
}

// ---- drawing -------------------------------------------------------------------------

type Stroke = {
  id: string;
  pts: Vec2[];
  colour: string;
  width: number;
  dashed: boolean;
  /** Paint order: 0 hidden, 1 axis hidden, 2 sections, 3 outline, 4 slice, 5 axis visible, 6 measures. */
  layer: number;
  group: string;
  /** A straight run carrying a label: its 3D direction (for the ruler) and its texts, longest first. */
  measure?: { dir3: Vec3; texts: string[]; reading: string | null; alts?: { pts: Vec2[]; dir3: Vec3 }[]; ext?: Vec2[][] };
};
type Fill = { id: string; pts: Vec2[]; colour: string };

function composite(over: string, under: string): string {
  const rgb = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = over.length === 9 ? parseInt(over.slice(7, 9), 16) / 255 : 1;
  const o = rgb(over);
  const u = rgb(under);
  return `#${o.map((c, i) => Math.round(c * a + u[i]! * (1 - a)).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function sampleClosed(pc: ProjectedCircle, n = 180): Vec3[] {
  return Array.from({ length: n + 1 }, (_, i) => pc.point3((2 * Math.PI * i) / n));
}

export function expandRevolution(input: RevolutionInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  if (input.locale !== undefined && !LOCALES.includes(input.locale)) throw new SpecError(`revolution.locale must be one of ${LOCALES.join(", ")}`);
  const res = resolveRevolution(input);
  const m = res.model;
  let camera: Camera;
  try {
    camera = input.camera === undefined ? defaultCamera(m.axis) : makeCamera(input.camera);
  } catch (e) {
    if (e instanceof GeometryError) throw new SpecError(`revolution.camera: ${e.message}`);
    throw e;
  }
  const view = G.viewInFrame(m, camera);
  if (view.R < 0.05) throw new SpecError("revolution.camera looks along the axis of revolution: the solid would draw as its own cross-section");
  if (Math.abs(view.gamma) < 0.05) throw new SpecError("revolution.camera sees the cross-sections edge-on, as straight lines -- turn it off the plane perpendicular to the axis");

  // answers: false: the solid, the region and the axis are the given; the slice
  // keeps its letters (R, r, h, dx) but not the expressions they equal, and the
  // panel -- the method's integral and the volume -- is not printed.
  const hide = input.answers === false;
  const size = G.solidSize(m);
  const P = (p: Vec3): Vec2 => project(camera, p);
  const strokes: Stroke[] = [];
  const fills: Fill[] = [];
  const addRuns = (id: string, pts: Vec3[], o: { colour: string; width: number; hiddenWidth?: number; layer: number; hiddenLayer?: number; closed?: boolean; group?: string; skipHidden?: boolean }): void => {
    G.splitByVisibility(m, camera, pts, size, o.closed ?? false).forEach((run, i) => {
      if (!run.visible && o.skipHidden) return;
      strokes.push({
        id: `${id}-${run.visible ? "v" : "h"}${i}`,
        pts: run.pts.map(P),
        colour: o.colour,
        width: run.visible ? o.width : (o.hiddenWidth ?? W_HIDDEN),
        dashed: !run.visible,
        layer: run.visible ? o.layer : (o.hiddenLayer ?? 0),
        group: o.group ?? id,
      });
    });
  };

  // ---- the solid ----
  const pieces = G.pieces(m.region);
  const circlesForFill: ProjectedCircle[] = [];
  let sMin = Infinity;
  let sMax = -Infinity;
  for (const pc of pieces) {
    for (let i = 0; i <= 120; i += 1) {
      const { x, y } = pc.point(pc.u0 + ((pc.u1 - pc.u0) * i) / 120);
      const { s, rho } = G.meridian(m, x, y);
      sMin = Math.min(sMin, s);
      sMax = Math.max(sMax, s);
      if (rho > 1e-6 * size) circlesForFill.push(G.crossSection(m, camera, s, rho));
    }
    G.silhouette(m, camera, pc).forEach((line, k) => addRuns(`outline-${pc.id}-${k}`, line.map((p) => p.p3), { colour: INK, width: W_OUTLINE, layer: 3, group: "solid" }));
  }
  // Rims: the circles swept by the region's corners, where two surfaces meet.
  const corners: { s: number; rho: number }[] = [];
  for (const x of [m.region.a, m.region.b]) {
    for (const y of [m.region.lo(x), m.region.hi(x)]) {
      const q = G.meridian(m, x, y);
      if (q.rho > 1e-6 * size && !corners.some((c) => Math.abs(c.s - q.s) < 1e-9 * size && Math.abs(c.rho - q.rho) < 1e-9 * size)) corners.push(q);
    }
  }
  corners.forEach((c, i) => addRuns(`rim-${i}`, sampleClosed(G.crossSection(m, camera, c.s, c.rho), 240), { colour: INK, width: W_OUTLINE, layer: 3, closed: true, group: "solid" }));

  // Cross-sections on the outer surface, clear of the slice and the ends.
  const outer = m.axis.kind === "h" ? (m.side === 1 ? "upper" : "lower") : "upper";
  const outerPiece = pieces.find((p) => p.id === outer)!;
  const span = m.region.b - m.region.a;
  const sliceClear = 0.15 * span;
  for (let i = 1; i <= res.sections; i += 1) {
    const u = m.region.a + (span * i) / (res.sections + 1);
    if (res.sliceAt !== null && Math.abs(u - res.sliceAt) < sliceClear) continue;
    const { x, y } = outerPiece.point(u);
    const q = G.meridian(m, x, y);
    if (q.rho <= 1e-3 * size) continue;
    addRuns(`section-${i}`, sampleClosed(G.crossSection(m, camera, q.s, q.rho), 200), { colour: INK, width: W_SECTION, hiddenWidth: 0.9, layer: 2, closed: true, group: `section-${i}` });
  }

  // The axis of revolution, past the solid at both ends.
  const reach = 0.2 * size + G.solidRadius(m) * Math.abs(view.gamma);
  const axisPts = Array.from({ length: 241 }, (_, i) => G.axisPoint(m, sMin - reach + ((sMax - sMin + 2 * reach) * i) / 240));
  addRuns("axis", axisPts, { colour: AXIS_BLUE, width: W_AXIS, hiddenWidth: 1.1, layer: 5, hiddenLayer: 1, group: "axis" });

  // The fill: the union of every cross-section's disc, outlined by marching squares.
  const tests = circlesForFill.map(G.ellipseTest).filter((t): t is (x: number, y: number) => number => t !== null);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const pc of circlesForFill) {
    const e = pc.ellipse;
    x0 = Math.min(x0, e.center[0] - e.semiMajor);
    x1 = Math.max(x1, e.center[0] + e.semiMajor);
    y0 = Math.min(y0, e.center[1] - e.semiMajor);
    y1 = Math.max(y1, e.center[1] + e.semiMajor);
  }
  const padBox = 0.03 * size;
  const union = (x: number, y: number): number => {
    let best = -Infinity;
    for (const t of tests) {
      const val = t(x, y);
      if (val > best) best = val;
    }
    return best;
  };
  const cellsX = Math.max(40, Math.round(((x1 - x0) / size) * 150));
  const cellsY = Math.max(40, Math.round(((y1 - y0) / size) * 150));
  const lines = contour(union, { x: [x0 - padBox, x1 + padBox], y: [y0 - padBox, y1 + padBox] }, { cells: [cellsX, cellsY], tolerance: size * 1e-5 });
  const outline = lines.filter((l) => l.closed).sort((p, q) => q.points.length - p.points.length)[0];
  if (outline !== undefined) fills.push({ id: "solid-fill", pts: outline.points.map((p) => [p.x, p.y] as Vec2), colour: SOLID_TINT });

  // ---- the highlighted slice ----
  const readings: string[] = [];
  const dxLen = Math.min(0.07 * span, 0.12 * size);
  if (res.sliceAt !== null) {
    const xs = res.sliceAt;
    const front = view.gamma > 0 ? 1 : -1;
    const tangentsOf = (pc: ProjectedCircle, along: Vec3): [number, number] => tangentParamsParallelTo(pc, projectDirection(camera, along));
    // Convex rule for the slab's back rim: a rim point is seen when the lateral surface there faces the reader.
    const lateralSeen = (pc: ProjectedCircle) => (t: number): boolean => Math.cos(t) * dotT(pc.u) + Math.sin(t) * dotT(pc.v) > 0;
    const dotT = (d: Vec3): number => d[0] * camera.toward[0] + d[1] * camera.toward[1] + d[2] * camera.toward[2];
    const arcPts = (pc: ProjectedCircle, t0: number, t1: number): Vec2[] => {
      const n = Math.max(8, Math.ceil(Math.abs(t1 - t0) / (Math.PI / 60)));
      return Array.from({ length: n + 1 }, (_, i) => pc.point(t0 + ((t1 - t0) * i) / n));
    };
    const full = (pc: ProjectedCircle): Vec2[] => arcPts(pc, 0, 2 * Math.PI);
    const holeColour = composite(SOLID_TINT, PAPER);

    if (m.axis.kind === "h") {
      const { R, r } = G.washerRadii(m, xs);
      const sF = xs + (front * dxLen) / 2;
      const sB = xs - (front * dxLen) / 2;
      const outF = G.crossSection(m, camera, sF, R);
      const outB = G.crossSection(m, camera, sB, R);
      const tt = tangentsOf(outF, vscale(m.A, sB - sF));
      fills.push({ id: "slice-fill", pts: convexHull([...full(outF), ...full(outB)]), colour: SLICE_TINT });
      fills.push({ id: "slice-face", pts: full(outF), colour: SLICE_FACE });
      splitCircle(tt, lateralSeen(outB)).forEach((arc, i) => {
        if (arc.visible) strokes.push({ id: `slice-back-${i}`, pts: arcPts(outB, arc.t0, arc.t1), colour: ACCENT, width: W_SLICE, dashed: false, layer: 4, group: "slice" });
      });
      tt.forEach((t, i) => strokes.push({ id: `slice-side-${i}`, pts: [outB.point(t), outF.point(t)], colour: ACCENT, width: W_SLICE, dashed: false, layer: 4, group: "slice" }));
      strokes.push({ id: "slice-front", pts: full(outF), colour: ACCENT, width: W_SLICE, dashed: false, layer: 4, group: "slice" });
      const cF = G.axisPoint(m, sF);
      const radiusRun = (rad: number, th: number): { pts: Vec2[]; dir3: Vec3 } => {
        const e = G.sweep(m, sF, rad, th);
        return { pts: [P(cF), P(e)], dir3: vsub(e, cF) };
      };
      const ANGLES = [0, Math.PI, Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4];
      const R0 = radiusRun(R, 0);
      strokes.push({ id: "slice-R", pts: R0.pts, colour: ACCENT, width: W_SLICE, dashed: false, layer: 6, group: "slice-R", measure: { dir3: R0.dir3, texts: hide ? ["R"] : hide ? ["R"] : [`R(x) = ${res.texts.R}`, "R"], reading: null, alts: ANGLES.slice(1).map((th) => radiusRun(R, th)) } });
      if (res.method === "washers" && r > 1e-9) {
        const inF = G.crossSection(m, camera, sF, r);
        fills.push({ id: "slice-hole", pts: full(inF), colour: holeColour });
        strokes.push({ id: "slice-front-inner", pts: full(inF), colour: ACCENT, width: W_SLICE, dashed: false, layer: 4, group: "slice" });
        const r0 = radiusRun(r, Math.PI);
        strokes.push({ id: "slice-r", pts: r0.pts, colour: ACCENT, width: W_SLICE, dashed: false, layer: 6, group: "slice-r", measure: { dir3: r0.dir3, texts: hide ? ["r"] : hide ? ["r"] : [`r(x) = ${res.texts.r}`, "r"], reading: null, alts: [0, ...ANGLES.slice(2)].map((th) => radiusRun(r, th)) } });
      }
      // dx: a dimension run under the solid, the slab's own thickness along the axis.
      const below = G.solidRadius(m) + 0.08 * size;
      const d0 = G.sweep(m, xs - dxLen / 2, below, Math.PI);
      const d1 = G.sweep(m, xs + dxLen / 2, below, Math.PI);
      const e0 = G.sweep(m, xs - dxLen / 2, R + 0.02 * size, Math.PI);
      const e1 = G.sweep(m, xs + dxLen / 2, R + 0.02 * size, Math.PI);
      strokes.push({ id: "slice-dx", pts: [P(d0), P(d1)], colour: ACCENT, width: W_SLICE, dashed: false, layer: 6, group: "slice-dx", measure: { dir3: vsub(d1, d0), texts: ["dx"], reading: null, ext: [[P(e0), P(d0)], [P(e1), P(d1)]] } });
    } else {
      const { radius } = G.shellAt(m, xs);
      const sBot = m.region.lo(xs);
      const sTop = m.region.hi(xs);
      const r2 = radius + dxLen / 2;
      const r1 = Math.max(radius - dxLen / 2, 1e-3 * size);
      const [capS, baseS] = front > 0 ? [sTop, sBot] : [sBot, sTop];
      const oCap = G.crossSection(m, camera, capS, r2);
      const oBase = G.crossSection(m, camera, baseS, r2);
      const iCap = G.crossSection(m, camera, capS, r1);
      const tt = tangentsOf(oCap, vscale(m.A, baseS - capS));
      fills.push({ id: "slice-fill", pts: convexHull([...full(oCap), ...full(oBase)]), colour: SLICE_TINT });
      fills.push({ id: "slice-face", pts: full(oCap), colour: SLICE_FACE });
      fills.push({ id: "slice-hole", pts: full(iCap), colour: holeColour });
      splitCircle(tt, lateralSeen(oBase)).forEach((arc, i) => {
        if (arc.visible) strokes.push({ id: `slice-back-${i}`, pts: arcPts(oBase, arc.t0, arc.t1), colour: ACCENT, width: W_SLICE, dashed: false, layer: 4, group: "slice" });
      });
      strokes.push({ id: "slice-front", pts: full(oCap), colour: ACCENT, width: W_SLICE, dashed: false, layer: 4, group: "slice" });
      strokes.push({ id: "slice-front-inner", pts: full(iCap), colour: ACCENT, width: W_SLICE, dashed: false, layer: 4, group: "slice" });
      // The two outline generators; the one on the region's side carries the height.
      const sideOf = (t: number): number => oCap.point(t)[0] * (m.side === 1 ? 1 : -1);
      const hT = sideOf(tt[0]) >= sideOf(tt[1]) ? tt[0] : tt[1];
      tt.forEach((t, i) => {
        const a3 = oBase.point3(t);
        const b3 = oCap.point3(t);
        const carries = t === hT;
        strokes.push({
          id: `slice-side-${i}`,
          pts: [P(a3), P(b3)],
          colour: ACCENT,
          width: W_SLICE,
          dashed: false,
          layer: carries ? 6 : 4,
          group: carries ? "slice-h" : "slice",
          ...(carries ? { measure: { dir3: vsub(b3, a3), texts: hide ? ["h"] : hide ? ["h"] : [`h(x) = ${res.texts.height}`, "h"], reading: null } } : {}),
        });
      });
      const c0 = G.axisPoint(m, sTop);
      const rEnd = G.sweep(m, sTop, radius, 0);
      const radAlt = (th: number): { pts: Vec2[]; dir3: Vec3 } => {
        const e = G.sweep(m, sTop, radius, th);
        return { pts: [P(c0), P(e)], dir3: vsub(e, c0) };
      };
      strokes.push({ id: "slice-radius", pts: [P(c0), P(rEnd)], colour: ACCENT, width: W_SLICE, dashed: false, layer: 6, group: "slice-radius", measure: { dir3: vsub(rEnd, c0), texts: hide ? ["r"] : hide ? ["r"] : [`r(x) = ${res.texts.radius}`, "r"], reading: null, alts: [Math.PI, 0.6, -0.6].map(radAlt) } });
      // dx: a dimension run below the solid, the shell's own thickness across the axis.
      // Below everything drawn so far on the page: solve the page height of the run for s.
      const pageLow = Math.min(...strokes.filter((st) => st.group !== "axis").flatMap((st) => st.pts.map((q) => q[1])), ...fills.flatMap((fl) => fl.pts.map((q) => q[1])));
      const dy = projectDirection(camera, m.A)[1];
      const y0 = P(G.sweep(m, 0, radius, 0))[1];
      const low = (pageLow - 0.07 * size - y0) / dy;
      const d0 = G.sweep(m, low, radius - dxLen / 2, 0);
      const d1 = G.sweep(m, low, radius + dxLen / 2, 0);
      const e0 = G.sweep(m, sBot - 0.02 * size, radius - dxLen / 2, 0);
      const e1 = G.sweep(m, sBot - 0.02 * size, radius + dxLen / 2, 0);
      strokes.push({ id: "slice-dx", pts: [P(d0), P(d1)], colour: ACCENT, width: W_SLICE, dashed: false, layer: 6, group: "slice-dx", measure: { dir3: vsub(d1, d0), texts: ["dx"], reading: null, ext: [[P(e0), P(d0)], [P(e1), P(d1)]] } });
    }
  }
  if (!hide) readings.push(...volumeLines(res, locale));

  // ---- page transform for the 3D view ----
  const every3: Vec2[] = [...strokes.flatMap((s) => s.pts), ...fills.flatMap((f) => f.pts)];
  const us = every3.map((p) => p[0]);
  const vs = every3.map((p) => p[1]);
  const [uMin, uMax, vMin, vMax] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  // Fitted to the solid: a region running to x = 400 is as big on the page as
  // one running to x = 4, with the same 3D view of it.
  // A solid much longer than it is wide (sqrt x to 400: 10 to 1) may run wider,
  // up to 1,6 times the target, so its slice still has room for a label.
  const spanU = Math.max(uMax - uMin, 1e-9);
  const spanV = Math.max(vMax - vMin, 1e-9);
  const longer = Math.min(1.6, Math.max(1, spanU / spanV / 2.5));
  const { xUnit: unit3 } = fitUnits(spanU, spanV, { equal: true, targetWidth: TARGET_3D * longer, targetHeight: TARGET_3D });
  const w3 = Math.ceil((uMax - uMin) * unit3 + 2 * PAD);
  const h3 = Math.ceil((vMax - vMin) * unit3 + 2 * PAD);
  const ox3 = PAD - uMin * unit3;
  const oy3 = PAD + vMax * unit3;
  const page3 = (q: Vec2): Point => ({ x: ox3 + q[0] * unit3, y: oy3 - q[1] * unit3 });

  // ---- the companion plane view ----
  const plane = input.plane !== false;
  let plan2: PlaneLayout | null = null;
  if (plane) plan2 = planeLayout(res);
  const w2 = plan2 === null ? 0 : plan2.width;
  const h2 = plan2 === null ? 0 : plan2.height;
  const plotH = Math.max(h3, h2);
  const board0 = new Board(1, 1, PAPER);
  const captionStyle = { size: 13, colour: SOFT };
  const captionW = Math.max(0, ...readings.map((t) => board0.extent(t, captionStyle).w));
  const width = Math.max(w3 + (plan2 === null ? 0 : GAP + w2), Math.ceil(captionW + 48));
  const height = plotH + readings.length * CAPTION_LINE_H + 22;
  const shift3 = { x: 0, y: (plotH - h3) / 2 };
  const at3 = (q: Vec2): Point => {
    const p = page3(q);
    return { x: p.x + shift3.x, y: p.y + shift3.y };
  };
  const board = new Board(width, height, PAPER);
  const bounds3 = { x: 6, y: 6, width: w3 - 12, height: plotH - 6 };
  // Everything already committed to the 3D view, so a label search can be
  // re-run for each candidate position of a measured run.
  const baseInk: { id: string; group: string; pts: Point[]; stroked: boolean }[] = [];
  const committed: Rect[] = [];
  const placerWith = (extra: { id: string; group: string; pts: Point[] }[]): SpacePlacer => {
    const pl = new SpacePlacer(bounds3);
    for (const k of baseInk) pl.addInk(k.id, k.group, k.pts, k.stroked);
    for (const k of extra) pl.addInk(k.id, k.group, k.pts);
    for (const r of committed) pl.reserve(r);
    return pl;
  };

  for (const f of fills) {
    const pts = f.pts.map(at3);
    board.poly(pts, { stroke: "none", width: 0, fill: f.colour, close: true, id: f.id });
    baseInk.push({ id: f.id, group: f.id, pts: [...pts, pts[0]!], stroked: false });
  }
  const measuredStrokes: Stroke[] = [];
  for (const s of [...strokes].sort((p, q) => p.layer - q.layer)) {
    if (s.measure !== undefined) {
      measuredStrokes.push(s);
      continue;
    }
    const pts = s.pts.map(at3);
    board.poly(pts, { stroke: s.colour, width: s.width, id: s.id, ...(s.dashed ? { lineStyle: "dashed" as const } : {}) });
    baseInk.push({ id: s.id, group: s.group, pts, stroked: true });
  }

  // The axis's name at its far end.
  const axisEnd = at3(P(axisPts[axisPts.length - 1]!));
  if (strokes.some((s) => s.group === "axis" && !s.dashed)) {
    const pl = placerWith([]);
    const style = { size: 14, weight: 700, colour: AXIS_BLUE };
    const { w, h } = board.extent(res.axisName, style);
    const best = pl.choose(aroundPlace(axisEnd, w, h, 2), w, h, (q) => pl.elementCost("axis", q, w, h, 4));
    committed.push({ x: best.centre.x - w / 2, y: best.centre.y - h / 2, width: w, height: h });
    board.label(res.axisName, best.centre.x, best.centre.y, { ...style, width: w, id: "axis-label", annotates: pl.nearestOf("axis", best.centre) });
  }

  // Each measured run: its candidate positions in order, each with its texts
  // longest first; the first that has an honest spot wins.
  const TS = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
  for (const s of measuredStrokes) {
    const style = { size: 14, weight: 700, colour: ACCENT_TEXT };
    const cands = [{ pts: s.pts, dir3: s.measure!.dir3 }, ...(s.measure!.alts ?? [])];
    let pick: { cand: number; text: string; w: number; h: number; centre: Point; cost: number } | null = null;
    cands.forEach((c, ci) => {
      if (pick !== null && pick.cost === 0) return;
      const a = at3(c.pts[0]!);
      const b = at3(c.pts[1]!);
      const pl = placerWith([{ id: s.id, group: s.group, pts: [a, b] }]);
      const len = dist(a, b) || 1;
      const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      const nrm = { x: -dir.y, y: dir.x };
      for (const text of s.measure!.texts) {
        const { w, h } = board.extent(text, style);
        const clearance = Math.abs(nrm.x) * (w / 2) + Math.abs(nrm.y) * (h / 2) + 6;
        const spots: Point[] = [];
        for (const extra of [0, 3, 7, 12, 18]) for (const t of TS) for (const sgn of [1, -1]) spots.push({ x: a.x + dir.x * len * t + nrm.x * sgn * (clearance + extra), y: a.y + dir.y * len * t + nrm.y * sgn * (clearance + extra) });
        const best = pl.choose(spots, w, h, (q) => pl.elementCost(s.group, q, w, h, 4), false);
        if (pick === null || best.cost < pick.cost) pick = { cand: ci, text, w, h, ...best };
        if (best.cost === 0) break;
      }
    });
    // No honest spot anywhere: the run and its label are left to the plane view and the panel rather than print a label nearer something else (ADR 0049).
    if (pick!.cost > 0) continue;
    const chosen = cands[pick!.cand]!;
    const a = at3(chosen.pts[0]!);
    const b = at3(chosen.pts[1]!);
    const px = dist(a, b);
    const shrink = Math.hypot(...projectDirection(camera, normalize(chosen.dir3)));
    // A run stated in a frame laid along it, whose unit is what ONE TRUE unit
    // along its 3D direction draws: a printed number is measured in true
    // length (ADR 0046). A symbolic label names the run and claims no number.
    const frame: Frame = { id: `${s.id}-ruler`, origin: a, rotation: (Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI, xUnit: unit3 * shrink };
    board.frames.push(frame);
    board.marks.push({
      id: s.id,
      from: { frame: frame.id, x: 0, y: 0 },
      segments: [{ line: { frame: frame.id, x: px / (unit3 * shrink), y: 0 } }],
      close: false,
      fill: "none",
      stroke: s.colour,
      strokeWidth: s.width,
    } satisfies Mark);
    board.trace([a, b], s.colour, s.width, s.id);
    baseInk.push({ id: s.id, group: s.group, pts: [a, b], stroked: true });
    // Extension lines tie a dimension run drawn off the solid back to the slice.
    for (const [k, e] of (s.measure!.ext ?? []).entries()) {
      const pts = e.map(at3);
      board.poly(pts, { stroke: ACCENT, width: 0.8, id: `${s.id}-ext-${k}` });
      baseInk.push({ id: `${s.id}-ext-${k}`, group: s.group, pts, stroked: true });
    }
    const p = pick!;
    committed.push({ x: p.centre.x - p.w / 2, y: p.centre.y - p.h / 2, width: p.w, height: p.h });
    board.label(p.text, p.centre.x, p.centre.y, { ...style, width: p.w, id: `${s.id}-label`, annotates: s.id });
  }

  // ---- the plane view, drawn into its own box to the right ----
  if (plan2 !== null) drawPlane(board, plan2, res, { x: w3 + GAP, y: (plotH - h2) / 2 }, locale, hide);

  // ---- the panel ----
  readings.forEach((text, i) => {
    board.label(text, 24 + (width - 48) / 2, plotH + 14 + i * CAPTION_LINE_H, { ...captionStyle, align: "start", width: width - 48, id: `reading-${i}`, claim: false, freeStanding: true });
  });

  const spec = board.spec(input.title ?? "sólido de revolução");
  const scene = spec.root as Scene;
  scene.connectors = [];
  spec.canvas = { ...spec.canvas, constraints: { allowOverlap: true, allowConnectorCrossing: true, allowCurvedConnectors: true } };
  return parseSpec(spec);
}

function dist(p: Point, q: Point): number {
  return Math.hypot(p.x - q.x, p.y - q.y);
}

// ---- the plane view ------------------------------------------------------------------

type PlaneLayout = { width: number; height: number; ux: number; uy: number; xr: [number, number]; yr: [number, number]; step: number };

function planeLayout(res: Resolved): PlaneLayout {
  const r = res.model.region;
  let xa = Math.min(r.a, 0);
  let xb = Math.max(r.b, 0);
  let ya = 0;
  let yb = 0;
  for (let i = 0; i <= 200; i += 1) {
    const x = r.a + ((r.b - r.a) * i) / 200;
    ya = Math.min(ya, r.lo(x));
    yb = Math.max(yb, r.hi(x));
  }
  if (res.model.axis.kind === "h") {
    ya = Math.min(ya, res.model.axis.c);
    yb = Math.max(yb, res.model.axis.c);
  } else {
    xa = Math.min(xa, res.model.axis.c);
    xb = Math.max(xb, res.model.axis.c);
  }
  const step = niceStep(Math.max(xb - xa, yb - ya), 6);
  // A plane whose content is all on one side of an axis ends at that axis, as the textbook draws the first quadrant.
  const lowEnd = (lo: number): number => (lo >= 0 ? 0 : Math.floor(lo / step - 0.5) * step);
  const xr: [number, number] = [lowEnd(xa), Math.ceil(xb / step + 0.6) * step];
  const yr: [number, number] = [lowEnd(ya), Math.ceil(yb / step + 0.6) * step];
  // Equal scales while the plane is not extremely long or tall; a region that
  // runs to x = 400 under a curve reaching y = 20 would be a 340 x 14px strip,
  // so once the plane is longer than 3 to 1 the shorter axis is stretched to hold it at 3 to 1 (the tick numbers say so). Planes up to 3 to 1 stay equal-scaled.
  const u = fitUnits(xr[1] - xr[0], yr[1] - yr[0], { equal: false, targetWidth: TARGET_2D, targetHeight: TARGET_2D });
  const equal = Math.min(u.xUnit, u.yUnit);
  const aspect = equal === u.xUnit ? u.yUnit / u.xUnit : u.xUnit / u.yUnit;
  const stretch = Math.max(1, aspect / 3);
  const ux = Math.min(u.xUnit, stretch * equal);
  const uy = Math.min(u.yUnit, stretch * equal);
  return { width: Math.ceil((xr[1] - xr[0]) * ux + 2 * 30), height: Math.ceil((yr[1] - yr[0]) * uy + 2 * 30), ux, uy, xr, yr, step };
}

function drawPlane(board: Board, L: PlaneLayout, res: Resolved, origin: Point, locale: Locale, hide = false): void {
  const m = res.model;
  const r = m.region;
  const frame: Frame & { origin: Point } = {
    id: "plane",
    origin: { x: origin.x + 30 - L.xr[0] * L.ux, y: origin.y + 30 + L.yr[1] * L.uy },
    xUnit: L.ux,
    yUnit: L.uy,
    grid: {
      x: { from: L.xr[0], to: L.xr[1], step: L.step, origin: 0 },
      y: { from: L.yr[0], to: L.yr[1], step: L.step, origin: 0 },
      locale,
      lineStyle: "dashed",
    } satisfies GridSpec,
  };
  board.addFrame(frame);
  const at = (x: number, y: number): Point => ({ x: frame.origin.x + x * L.ux, y: frame.origin.y - y * L.uy });
  const placer = new SpacePlacer({ x: origin.x + 4, y: origin.y + 4, width: L.width - 8, height: L.height - 8 });
  placer.addInk("plane-axis-x", "plane-axis", [at(L.xr[0], 0), at(L.xr[1], 0)]);
  placer.addInk("plane-axis-y", "plane-axis", [at(0, L.yr[0]), at(0, L.yr[1])]);
  for (const t of tickPlan(frame, frame.grid!)) {
    const b = t.spots[0]!.box;
    placer.reserve(b as Rect);
  }

  // The region, in the solid's own tint.
  const n = 160;
  const top = Array.from({ length: n + 1 }, (_, i) => r.a + ((r.b - r.a) * i) / n).map((x) => at(x, r.hi(x)));
  const bottom = Array.from({ length: n + 1 }, (_, i) => r.b - ((r.b - r.a) * i) / n).map((x) => at(x, r.lo(x)));
  const regionPts = [...top, ...bottom];
  board.poly(regionPts, { stroke: "none", width: 0, fill: SOLID_TINT, close: true, id: "plane-region" });
  placer.addInk("plane-region", "plane-region", [...regionPts, regionPts[0]!], false);

  // The curves, across the plotted range where they are defined and inside it.
  const drawCurve = (cv: Curve, id: string): Point[][] => {
    const runs: Point[][] = [];
    let run: Point[] = [];
    const N = 320;
    for (let i = 0; i <= N; i += 1) {
      const x = L.xr[0] + ((L.xr[1] - L.xr[0]) * i) / N;
      const y = cv.fn(x);
      if (Number.isFinite(y) && y >= L.yr[0] && y <= L.yr[1]) run.push(at(x, y));
      else if (run.length > 0) {
        runs.push(run);
        run = [];
      }
    }
    if (run.length > 0) runs.push(run);
    runs.filter((p) => p.length >= 2).forEach((pts, k) => {
      board.poly(pts, { stroke: INK, width: 1.8, id: `${id}-${k}` });
      placer.addInk(`${id}-${k}`, id, pts);
    });
    return runs;
  };
  const curves: { cv: Curve; id: string; runs: Point[][] }[] = [];
  for (const [cv, id] of [[res.upper, "plane-curve-upper"], [res.lower, "plane-curve-lower"]] as const) {
    if (cv !== null) curves.push({ cv, id, runs: drawCurve(cv, id) });
  }

  // The axis of revolution, in the same blue as in the solid.
  const ax = m.axis;
  const axA = ax.kind === "h" ? at(L.xr[0], ax.c) : at(ax.c, L.yr[0]);
  const axB = ax.kind === "h" ? at(L.xr[1], ax.c) : at(ax.c, L.yr[1]);
  board.poly([axA, axB], { stroke: AXIS_BLUE, width: 1.8, id: "plane-rev-axis" });
  placer.addInk("plane-rev-axis", "plane-rev-axis", [axA, axB]);

  // The representative rectangle and its measures.
  type M2 = { id: string; a: Point; b: Point; texts: string[]; pa: [number, number]; pb: [number, number] };
  const dims: M2[] = [];
  const extensions: Point[][] = [];
  if (res.sliceAt !== null) {
    const xs = res.sliceAt;
    const half = Math.min(0.035 * (r.b - r.a), 0.06 * (L.xr[1] - L.xr[0]));
    const x0 = xs - half;
    const x1 = xs + half;
    const rect = [at(x0, r.lo(xs)), at(x1, r.lo(xs)), at(x1, r.hi(xs)), at(x0, r.hi(xs))];
    board.poly(rect, { stroke: ACCENT, width: W_SLICE, fill: `${ACCENT}40`, close: true, id: "plane-rect" });
    placer.addInk("plane-rect", "plane-rect", [...rect, rect[0]!]);
    const gap = 7 / L.ux;
    const dimLine = (id: string, pa: [number, number], pb: [number, number], texts: string[]): void => {
      const A = at(...pa);
      const B = at(...pb);
      placer.addInk(id, id, [A, B]);
      dims.push({ id, a: A, b: B, texts, pa, pb });
    };
    if (ax.kind === "h") {
      const { R, r: rr } = G.washerRadii(m, xs);
      const s = m.side;
      dimLine("plane-R", [x1 + gap, ax.c], [x1 + gap, ax.c + s * R], hide ? ["R"] : [`R(x) = ${res.texts.R}`, "R"]);
      // r beside R, further out: R's label sits above the top of r, r's below it.
      if (res.method === "washers" && rr > 1e-9) dimLine("plane-r", [x1 + 2.2 * gap, ax.c], [x1 + 2.2 * gap, ax.c + s * rr], hide ? ["r"] : [`r(x) = ${res.texts.r}`, "r"]);
    } else {
      // The radius runs above the region, from the axis to the strip's middle, clear of the curves.
      let top = -Infinity;
      for (let i = 0; i <= 200; i += 1) top = Math.max(top, r.hi(r.a + ((r.b - r.a) * i) / 200));
      const yr = top + 0.35 * L.step;
      dimLine("plane-radius", [ax.c, yr], [xs, yr], hide ? ["r"] : [`r(x) = ${res.texts.radius}`, "r"]);
      extensions.push([at(xs, r.hi(xs)), at(xs, yr)]);
      placer.addInk("plane-ext-0", "plane-radius", extensions[0]!);
      const outside = m.side === 1 ? x1 + gap : x0 - gap;
      dimLine("plane-height", [outside, r.lo(xs)], [outside, r.hi(xs)], hide ? ["h"] : [`h(x) = ${res.texts.height}`, "h"]);
    }
  }

  // Labels: the measures first (least freedom), then the curves' names, then the axis names.
  const TS = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
  for (const d of dims) {
    const style = { size: 14, weight: 700, colour: ACCENT_TEXT };
    const len = dist(d.a, d.b) || 1;
    const dir = { x: (d.b.x - d.a.x) / len, y: (d.b.y - d.a.y) / len };
    const nrm = { x: -dir.y, y: dir.x };
    let pick: { text: string; w: number; h: number; centre: Point; cost: number } | null = null;
    for (const text of d.texts) {
      const { w, h } = board.extent(text, style);
      const clearance = Math.abs(nrm.x) * (w / 2) + Math.abs(nrm.y) * (h / 2) + 6;
      const spots: Point[] = [];
      for (const extra of [0, 3, 7, 12, 18]) for (const t of TS) for (const sgn of [1, -1]) spots.push({ x: d.a.x + dir.x * len * t + nrm.x * sgn * (clearance + extra), y: d.a.y + dir.y * len * t + nrm.y * sgn * (clearance + extra) });
      const best = placer.choose(spots, w, h, (q) => placer.elementCost(d.id, q, w, h, 4), false);
      if (pick === null || best.cost < pick.cost) pick = { text, w, h, ...best };
      if (best.cost === 0) break;
    }
    // No honest spot: the plane view leaves this measure to the solid and the panel rather than print a label nearer something else.
    if (pick!.cost > 0) continue;
    if (d.id === "plane-radius") for (const [k, e] of extensions.entries()) board.poly(e, { stroke: ACCENT, width: 0.8, id: `plane-ext-${k}` });
    board.marks.push({ id: d.id, from: { frame: "plane", x: d.pa[0], y: d.pa[1] }, segments: [{ line: { frame: "plane", x: d.pb[0], y: d.pb[1] } }], close: false, fill: "none", stroke: ACCENT, strokeWidth: W_SLICE });
    board.trace([d.a, d.b], ACCENT, W_SLICE, d.id);
    placer.reserve({ x: pick!.centre.x - pick!.w / 2, y: pick!.centre.y - pick!.h / 2, width: pick!.w, height: pick!.h });
    board.label(pick!.text, pick!.centre.x, pick!.centre.y, { ...style, width: pick!.w, id: `${d.id}-label`, annotates: d.id });
  }
  for (const c of curves) {
    const text = `y = ${c.cv.text}`;
    const style = { size: 14, weight: 600, colour: INK };
    const { w, h } = board.extent(text, style);
    const spots: Point[] = [];
    const longest = c.runs.filter((p) => p.length >= 2).sort((p, q) => q.length - p.length)[0];
    if (longest === undefined) continue;
    for (const frac of [0.9, 0.8, 0.7, 0.95, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1]) {
      const i = Math.min(longest.length - 1, Math.round(frac * (longest.length - 1)));
      spots.push(...aroundPlace(longest[i]!, w, h, 2));
    }
    const best = placer.choose(spots, w, h, (q) => placer.elementCost(c.id, q, w, h, 4));
    board.label(text, best.centre.x, best.centre.y, { ...style, width: w, id: `${c.id}-label`, annotates: placer.nearestOf(c.id, best.centre) });
  }
  if (ax.c !== 0) {
    const text = ax.kind === "h" ? `y = ${formatNumber(ax.c, locale)}` : `x = ${formatNumber(ax.c, locale)}`;
    const style = { size: 13, weight: 700, colour: AXIS_BLUE };
    const { w, h } = board.extent(text, style);
    const end = ax.kind === "h" ? axB : axB;
    const spots: Point[] = [];
    for (const frac of [0.92, 0.85, 0.08, 0.15, 0.75, 0.25]) spots.push(...aroundPlace({ x: axA.x + (end.x - axA.x) * frac, y: axA.y + (end.y - axA.y) * frac }, w, h, 2));
    const best = placer.choose(spots, w, h, (q) => placer.elementCost("plane-rev-axis", q, w, h, 4));
    board.label(text, best.centre.x, best.centre.y, { ...style, width: w, id: "plane-rev-axis-label", annotates: "plane-rev-axis" });
  }
  for (const [name, p, off] of [["x", at(L.xr[1], 0), { x: -8, y: -14 }], ["y", at(0, L.yr[1]), { x: 14, y: 8 }]] as const) {
    board.label(name, p.x + off.x, p.y + off.y, { size: 13, colour: SOFT, freeStanding: true, id: `plane-name-${name}` });
  }
}

// ---- validation -------------------------------------------------------------------------

export function validateRevolutionInput(raw: Record<string, unknown>): void {
  const path = "revolution";
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  v.optionalBoolean(raw, "plane", path);
  if (raw.camera !== undefined && typeof raw.camera !== "string") {
    const o = v.object(raw.camera, `${path}.camera`);
    v.optionalEnum(o, "kind", `${path}.camera`, ["cavalier", "isometric", "orthographic"]);
    if (o.kind === undefined) throw new SpecError(`${path}.camera.kind is required`);
    if (o.kind === "orthographic") {
      v.requiredNumber(o, "azimuth", `${path}.camera`);
      v.requiredNumber(o, "elevation", `${path}.camera`);
    }
  } else if (raw.camera !== undefined) v.optionalEnum(raw, "camera", path, ["cavalier", "isometric", "orthographic"]);
  // Every rule -- the region, the axis, the method, the slice -- is exercised
  // by building the figure: one implementation, not a shadow copy.
  expandRevolution(raw as unknown as RevolutionInput);
}
