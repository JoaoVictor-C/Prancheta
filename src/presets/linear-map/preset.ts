/**
 * linear-map -- a linear map of the plane, T(v) = A v, for Álgebra Linear and
 * Geometria Analítica ("represente a transformação T(x, y) = (2x + y, x + y)",
 * "mostre a imagem do quadrado unitário e calcule a área", "encontre os
 * autovetores").
 *
 * The 2x2 matrix is the only typed number. Everything drawn and printed is
 * computed from it:
 *
 *  - the transformed lattice is the image of the lines x = k and y = k
 *    (k·T(e₁) + t·T(e₂) and k·T(e₂) + t·T(e₁)), clipped to the plotted box;
 *  - T(e₁), T(e₂) are the columns of A; the unit square's image is the
 *    parallelogram on them, and its area |det A| is printed AND measured by
 *    `area-matches-its-label` against the polygon that is drawn (ADR 0037);
 *  - the eigen-lines are the null spaces of A − λI, λ from the characteristic
 *    polynomial; complex eigenvalues draw no line and are stated as a ± bi;
 *  - a shape's image is its vertices mapped through A; its primed names
 *    follow the vertices.
 *
 * Numbers go through the one locale formatter and are written exact when they
 * are (√2/2, 1/3, (3 + √5)/2) -- see `exactText`.
 *
 * Drawing order: the image lattice, the regions, the eigen-lines, the arrows,
 * then the dots; and every label is placed only after ALL the ink is down
 * (the vectors preset's lesson), each anchored to what it names (ADR 0035).
 */

import type { Block, Connector, Frame, FigureSpec, FramedPoint, GridSpec, Mark, Point, Scene } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { resolveInFrame, tickPlan, ticksOf } from "../../ir/frames.ts";
import { LOCALES, MINUS, asFraction, formatNumber, parseNumber, snapExact, writeExact } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import { compileIn, constantValue } from "../../math/expr.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";
import type { LabelOptions } from "../function-graph/board.ts";
import { Placer, aroundPoint, pointToPolyline, rectAt, segmentHitsRect } from "../construction/place.ts";
import type { Claim, Rect } from "../construction/place.ts";
import { fitUnits, niceStep } from "../shared/scale.ts";
import { sqrtLabel, splitSquare } from "../vectors/preset.ts";

// ---- input ------------------------------------------------------------------

export type Entry = number | string;

export type NamedMap =
  | { rotation: number | string }
  | { reflection: { line: number | string } }
  | { shear: { x: Entry } | { y: Entry } }
  | { scale: [Entry, Entry] }
  | { projection: { onto: number | string | [number, number] } };

export type LinearMapShape = { points: [number, number][]; label?: string };
export type LinearMapPoint = { name: string; at: [number, number] };

export type LinearMapShow = { grid?: boolean; basis?: boolean; unitSquare?: boolean; eigen?: boolean };

export type LinearMapInput = {
  title?: string;
  locale?: Locale;
  matrix?: [[Entry, Entry], [Entry, Entry]];
  named?: NamedMap;
  x?: [number, number];
  y?: [number, number];
  show?: LinearMapShow;
  shapes?: LinearMapShape[];
  points?: LinearMapPoint[];
  /** false: the question's figure -- the given and its frame, no image, T(e₁), T(e₂), parallelogram, eigen-lines or results. Default true. */
  answers?: boolean;
};

export type Matrix = [[number, number], [number, number]];
export type Vec = [number, number];

// ---- palette ----------------------------------------------------------------

const PAPER = "#FCFBF7";
const INK = "#181B21";
const SOFT = "#4E5763";
const ORIGINAL = "#5B6675"; // slate -- what the map is applied to
const IMAGE = "#B3400C"; // rust -- what the map produces
const LATTICE = "#7FA3D1"; // light blue -- the transformed lattice
const LATTICE_AXES = "#4F7FBF"; // the images of the two axes
const EIGEN = "#1E7A46"; // green -- an eigen-line
const IMAGE_TEXT = "#9A3508"; // the image's colour, darkened until its text keeps 4.5:1 on its own tint
const EIGEN_TEXT = "#17603A";
const TINT = "1C";

// ---- geometry constants ---------------------------------------------------------

const MARGIN = 56;
const PLOT_TARGET_PX = 460;
const MAX_UNIT = 90;
const MIN_WIDTH = 620;
const RANGE_MARGIN = 0.5;
const MAX_LATTICE_LINES = 24;
const MIN_LATTICE_GAP_PX = 14;
const STRICT_SLACK = 12;
const PANEL_LINE_H = 24;
const PANEL_FONT = 13;
const EPS = 1e-9;

// ---- small pure helpers -----------------------------------------------------------

/** A float within rounding noise of a round number IS that number (cos 90° is 6e-17, not a value). */
export function tidy(x: number): number {
  const r = Math.round(x * 1e12) / 1e12;
  return Math.abs(x - r) < 2e-15 ? r + 0 : x;
}

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

const isInt = (x: number): boolean => Math.abs(x - Math.round(x)) < 1e-9;

export function determinant(A: Matrix): number {
  return tidy(A[0][0] * A[1][1] - A[0][1] * A[1][0]);
}

export function traceOf(A: Matrix): number {
  return tidy(A[0][0] + A[1][1]);
}

export function applyMatrix(A: Matrix, p: readonly [number, number]): Vec {
  return [tidy(A[0][0] * p[0] + A[0][1] * p[1]), tidy(A[1][0] * p[0] + A[1][1] * p[1])];
}

/** Is |det A| zero to the precision the entries carry? */
export function isSingular(A: Matrix): boolean {
  const scale = Math.max(1, Math.abs(A[0][0] * A[1][1]) + Math.abs(A[0][1] * A[1][0]));
  return Math.abs(A[0][0] * A[1][1] - A[0][1] * A[1][0]) <= EPS * scale;
}

/** The shoelace area of a polygon, positive. */
export function polygonArea(pts: readonly (readonly [number, number])[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    s += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(s) / 2;
}

// ---- the map: from a matrix or from a name -------------------------------------------

function entryOf(raw: unknown, path: string): number {
  if (typeof raw === "number") return tidy(v.finite(raw, path));
  if (typeof raw === "string") {
    try {
      return tidy(constantValue(raw));
    } catch (e) {
      throw new SpecError(`${path}: ${JSON.stringify(raw)} is not a number or a constant expression (${(e as Error).message})`);
    }
  }
  throw new SpecError(`${path} must be a number or an expression string like "sqrt(3)/2", got ${JSON.stringify(raw)}`);
}

/** An angle in RADIANS from a number of degrees, "90°", or an expression in radians ("pi/3"). */
function rotationAngle(raw: unknown, path: string): number {
  if (typeof raw === "number") return (v.finite(raw, path) * Math.PI) / 180;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s.endsWith("°")) return (entryOf(s.slice(0, -1), path) * Math.PI) / 180;
    return entryOf(s, path);
  }
  throw new SpecError(`${path} must be degrees (a number or "90°") or radians as an expression ("pi/3"), got ${JSON.stringify(raw)}`);
}

/**
 * The angle, in radians in [0, π), of a line through the origin: "y = x",
 * "y = -2x", "x" (the x axis), "y" (the y axis), "x = 0", or an angle in
 * degrees (a number, "30°") or radians ("pi/6").
 */
export function lineAngle(raw: unknown, path: string): number {
  if (typeof raw === "number") return norm((v.finite(raw, path) * Math.PI) / 180);
  if (typeof raw !== "string") throw new SpecError(`${path} must be a line ("y = x", "x", "y") or an angle, got ${JSON.stringify(raw)}`);
  const s = raw.replace(/\s+/g, "").replace(/−/g, "-").toLowerCase();
  if (s === "x" || s === "y=0" || s === "eixox") return 0;
  if (s === "y" || s === "x=0" || s === "eixoy") return Math.PI / 2;
  if (s.startsWith("y=")) {
    let f: (x: number) => number;
    try {
      f = compileIn(s.slice(2), ["x"]);
    } catch (e) {
      throw new SpecError(`${path}: cannot read the line ${JSON.stringify(raw)} (${(e as Error).message})`);
    }
    const m = f(1) - f(0);
    if (!Number.isFinite(m) || Math.abs(f(0)) > 1e-9 || Math.abs(f(3) - 3 * m) > 1e-9) {
      throw new SpecError(`${path}: ${JSON.stringify(raw)} is not a line through the origin -- a linear map fixes the origin, so its lines are y = m x`);
    }
    return norm(Math.atan2(m, 1));
  }
  if (s.endsWith("°")) return norm((entryOf(s.slice(0, -1), path) * Math.PI) / 180);
  return norm(entryOf(s, path));
}

function norm(theta: number): number {
  let t = theta % Math.PI;
  if (t < 0) t += Math.PI;
  return t < 1e-12 || Math.PI - t < 1e-12 ? 0 : t;
}

function clean(A: Matrix): Matrix {
  return [
    [tidy(A[0][0]), tidy(A[0][1])],
    [tidy(A[1][0]), tidy(A[1][1])],
  ];
}

/** The matrix of a named map, computed. */
export function namedMatrix(named: NamedMap, path = "linear-map.named"): Matrix {
  const keys = Object.keys(named as Record<string, unknown>);
  if (keys.length !== 1) {
    throw new SpecError(`${path} must have exactly one of rotation, reflection, shear, scale, projection -- found ${keys.length === 0 ? "none" : keys.join(" and ")}`);
  }
  const n = named as Record<string, unknown>;
  if ("rotation" in n) {
    const t = rotationAngle(n.rotation, `${path}.rotation`);
    return clean([
      [Math.cos(t), -Math.sin(t)],
      [Math.sin(t), Math.cos(t)],
    ]);
  }
  if ("reflection" in n) {
    const o = v.object(n.reflection, `${path}.reflection`);
    const t = lineAngle(o.line, `${path}.reflection.line`);
    return clean([
      [Math.cos(2 * t), Math.sin(2 * t)],
      [Math.sin(2 * t), -Math.cos(2 * t)],
    ]);
  }
  if ("shear" in n) {
    const o = v.object(n.shear, `${path}.shear`);
    const has = ["x", "y"].filter((k) => o[k] !== undefined);
    if (has.length !== 1) throw new SpecError(`${path}.shear must be {x: k} (x' = x + k·y) or {y: k} (y' = y + k·x), found ${has.length === 0 ? "neither" : "both"}`);
    if (has[0] === "x") return clean([[1, entryOf(o.x, `${path}.shear.x`)], [0, 1]]);
    return clean([[1, 0], [entryOf(o.y, `${path}.shear.y`), 1]]);
  }
  if ("scale" in n) {
    const s = n.scale;
    if (!Array.isArray(s) || s.length !== 2) throw new SpecError(`${path}.scale must be [sx, sy]`);
    return clean([[entryOf(s[0], `${path}.scale[0]`), 0], [0, entryOf(s[1], `${path}.scale[1]`)]]);
  }
  if ("projection" in n) {
    const o = v.object(n.projection, `${path}.projection`);
    let d: Vec;
    if (Array.isArray(o.onto)) {
      if (o.onto.length !== 2) throw new SpecError(`${path}.projection.onto must be a direction [dx, dy], a line or an angle`);
      d = [entryOf(o.onto[0], `${path}.projection.onto[0]`), entryOf(o.onto[1], `${path}.projection.onto[1]`)];
      if (Math.hypot(d[0], d[1]) < 1e-12) throw new SpecError(`${path}.projection.onto: the zero vector is not a direction`);
    } else {
      const t = lineAngle(o.onto, `${path}.projection.onto`);
      d = [Math.cos(t), Math.sin(t)];
    }
    const q = d[0] * d[0] + d[1] * d[1];
    return clean([
      [(d[0] * d[0]) / q, (d[0] * d[1]) / q],
      [(d[0] * d[1]) / q, (d[1] * d[1]) / q],
    ]);
  }
  throw new SpecError(`${path} must be one of rotation, reflection, shear, scale, projection, got ${keys[0]}`);
}

/** The matrix the input states: `matrix` typed, or `named` computed. Exactly one. */
export function matrixOf(input: Pick<LinearMapInput, "matrix" | "named">): Matrix {
  const both = input.matrix !== undefined && input.named !== undefined;
  if (both) throw new SpecError("linear-map: give either `matrix` or `named`, not both");
  if (input.named !== undefined) return namedMatrix(input.named);
  const m = input.matrix;
  if (m === undefined) throw new SpecError("linear-map: give `matrix: [[a, b], [c, d]]` or `named` ({rotation}, {reflection}, {shear}, {scale} or {projection})");
  if (!Array.isArray(m) || m.length !== 2 || !Array.isArray(m[0]) || !Array.isArray(m[1]) || m[0].length !== 2 || m[1].length !== 2) {
    throw new SpecError(`linear-map.matrix must be [[a, b], [c, d]], got ${JSON.stringify(m)}`);
  }
  return [
    [entryOf(m[0][0], "linear-map.matrix[0][0]"), entryOf(m[0][1], "linear-map.matrix[0][1]")],
    [entryOf(m[1][0], "linear-map.matrix[1][0]"), entryOf(m[1][1], "linear-map.matrix[1][1]")],
  ];
}

// ---- eigen ----------------------------------------------------------------------------

export type Eigen =
  | { kind: "real"; values: [number, number]; repeated: boolean; scalar: boolean; lines: { value: number; direction: Vec }[] }
  | { kind: "complex"; re: number; im: number };

/** The unit direction of the null space of the rows (p, q), (r, s): perpendicular to the longer row. */
function nullDirection(p: number, q: number, r: number, s: number): Vec | null {
  const first = Math.hypot(p, q);
  const second = Math.hypot(r, s);
  const row: Vec = first >= second ? [p, q] : [r, s];
  const len = Math.max(first, second);
  if (len < 1e-12) return null;
  let d: Vec = [row[1] / len, -row[0] / len];
  if (d[0] < -1e-12 || (Math.abs(d[0]) <= 1e-12 && d[1] < 0)) d = [-d[0], -d[1]];
  return [tidy(d[0]) + 0, tidy(d[1]) + 0];
}

/** Eigenvalues and eigen-lines of a 2x2, by the characteristic polynomial λ² − tr·λ + det. */
export function eigen2x2(A: Matrix): Eigen {
  const [[a, b], [c, d]] = A;
  const tr = a + d;
  const dt = a * d - b * c;
  const disc = tr * tr - 4 * dt;
  const scale = Math.max(1, tr * tr, Math.abs(4 * dt));
  if (disc < -EPS * scale) return { kind: "complex", re: tidy(tr / 2), im: tidy(Math.sqrt(-disc) / 2) };
  if (Math.abs(disc) <= EPS * scale) {
    const lambda = tidy(tr / 2);
    const tiny = 1e-12 * Math.max(1, Math.abs(a), Math.abs(d));
    const scalar = Math.abs(b) <= tiny && Math.abs(c) <= tiny && Math.abs(a - d) <= tiny;
    const dir = scalar ? null : nullDirection(a - lambda, b, c, d - lambda);
    return { kind: "real", values: [lambda, lambda], repeated: true, scalar, lines: dir === null ? [] : [{ value: lambda, direction: dir }] };
  }
  const root = Math.sqrt(disc);
  const values: [number, number] = [tidy((tr + root) / 2), tidy((tr - root) / 2)];
  const lines: { value: number; direction: Vec }[] = [];
  for (const value of values) {
    const dir = nullDirection(a - value, b, c, d - value);
    if (dir !== null) lines.push({ value, direction: dir });
  }
  return { kind: "real", values, repeated: false, scalar: false, lines };
}

/** What a singular map's image and kernel are: only the origin, or a line each. */
export function singularParts(A: Matrix): { rank: 0 } | { rank: 1; image: Vec; kernel: Vec } {
  const col0 = Math.hypot(A[0][0], A[1][0]);
  const col1 = Math.hypot(A[0][1], A[1][1]);
  if (Math.max(col0, col1) < 1e-12) return { rank: 0 };
  const col: Vec = col0 >= col1 ? [A[0][0], A[1][0]] : [A[0][1], A[1][1]];
  const len = Math.hypot(col[0], col[1]);
  let image: Vec = [col[0] / len, col[1] / len];
  if (image[0] < -1e-12 || (Math.abs(image[0]) <= 1e-12 && image[1] < 0)) image = [-image[0], -image[1]];
  const kernel = nullDirection(A[0][0], A[0][1], A[1][0], A[1][1]);
  return { rank: 1, image: [tidy(image[0]) + 0, tidy(image[1]) + 0], kernel: kernel ?? [1, 0] };
}

// ---- exact writing ---------------------------------------------------------------------

export type Written = { text: string; exact: boolean };

/**
 * A number as a reader writes it: whole, a short decimal, p/q, √n, kπ/q -- and,
 * beyond `snapExact`, the rationalised roots a rotation's matrix is made of
 * (√2/2, √3/2), found through the square: x² a small-denominator rational.
 * Anything else is the formatter's rounded decimal, flagged inexact.
 */
export function exactText(x: number, locale: Locale = "pt-BR", fractions = false): Written {
  const t = tidy(x);
  if (Math.abs(t) < 1e-12) return { text: "0", exact: true };
  const e = snapExact(t, 1e-9);
  if (e.exact && e.form === "rational" && fractions) {
    const f = asFraction(Math.abs(t));
    if (f !== null && f.q > 1) return { text: `${t < 0 ? MINUS : ""}${f.p}/${f.q}`, exact: true };
  }
  if (e.exact) return { text: writeExact(e, locale), exact: true };
  const sq = t * t;
  for (let q = 1; q <= 64; q += 1) {
    const p = sq * q;
    if (Math.abs(p - Math.round(p)) <= 1e-9 * Math.max(1, p)) return { text: (t < 0 ? MINUS : "") + sqrtLabel(sq, locale), exact: true };
  }
  const short = formatNumber(t, locale);
  const back = parseNumber(short, locale);
  return { text: short, exact: back !== null && Math.abs(back - t) <= 1e-9 * Math.max(1, Math.abs(t)) };
}

/**
 * Does this matrix have entries a reader writes as fractions or roots? Then its
 * half is "1/2", not "0,5" -- one spelling across the matrix and the formula.
 */
export function wantsFractions(A: Matrix): boolean {
  return A.flat().some((x) => {
    const e = snapExact(tidy(x), 1e-9);
    return (e.exact && e.form === "sqrt") || (!e.exact && Math.abs(x) > 1e-12 && exactText(x).exact);
  });
}

/** `c·v` as a reader writes a term, with a leading − and no leading +: x, −x, 2x, x/2, 3x/2, (√3/2)x. */
export function termText(c: number, variable: string, locale: Locale = "pt-BR", fractions = false): string {
  const sign = c < 0 ? MINUS : "";
  const abs = Math.abs(c);
  if (Math.abs(abs - 1) < 1e-9) return `${sign}${variable}`;
  const w = exactText(abs, locale, fractions).text;
  if (/^\d+([.,]\d+)?$/.test(w)) return `${sign}${w}${variable}`;
  const frac = /^(\d+)\/(\d+)$/.exec(w);
  if (frac !== null) return `${sign}${frac[1] === "1" ? "" : frac[1]}${variable}/${frac[2]}`;
  return w.includes("/") ? `${sign}(${w})${variable}` : `${sign}${w}·${variable}`;
}

/** One component of T(x; y): "2x + y", "x − y", "−x", "0". */
export function rowText(p: number, q: number, locale: Locale = "pt-BR", fractions = false): string {
  const parts: { c: number; v: string }[] = [];
  if (Math.abs(p) > 1e-12) parts.push({ c: p, v: "x" });
  if (Math.abs(q) > 1e-12) parts.push({ c: q, v: "y" });
  if (parts.length === 0) return "0";
  return parts
    .map((part, i) => (i === 0 ? termText(part.c, part.v, locale, fractions) : `${part.c < 0 ? ` ${MINUS} ` : " + "}${termText(Math.abs(part.c), part.v, locale, fractions)}`))
    .join("");
}

const pairSep = (locale: Locale): string => (locale === "pt-BR" ? "; " : ", ");

/** "T(x; y) = (2x + y; x + y)", built from the entries. */
export function formulaOf(A: Matrix, locale: Locale = "pt-BR"): string {
  const fr = wantsFractions(A);
  return `T(x${pairSep(locale)}y) = (${rowText(A[0][0], A[0][1], locale, fr)}${pairSep(locale)}${rowText(A[1][0], A[1][1], locale, fr)})`;
}

function pairText(p: readonly [number, number], locale: Locale, fractions = false): Written {
  const a = exactText(p[0], locale, fractions);
  const b = exactText(p[1], locale, fractions);
  return { text: `(${a.text}${pairSep(locale)}${b.text})`, exact: a.exact && b.exact };
}

/** A direction as the smallest integer vector along it, when it is one: (1; 1), (1; −2), (0; 1). */
export function directionInts(d: Vec): [number, number] | null {
  if (Math.abs(d[0]) < 1e-9) return [0, 1];
  if (Math.abs(d[1]) < 1e-9) return [1, 0];
  const f = asFraction(Math.abs(d[1] / d[0]));
  if (f === null) return null;
  const sign = d[1] / d[0] < 0 ? -1 : 1;
  return [f.q, sign * f.p];
}

function directionText(d: Vec, locale: Locale): Written {
  const ints = directionInts(d);
  if (ints !== null) return pairText(ints, locale);
  const r = d[1] / d[0];
  const w = exactText(r, locale);
  return { text: `(1${pairSep(locale)}${w.text})`, exact: w.exact };
}

/** The equation of the line through the origin along `d`: y = x, y = −x/2, x = 0. */
export function lineEquation(d: Vec, locale: Locale = "pt-BR"): string {
  if (Math.abs(d[0]) < 1e-9) return "x = 0";
  const m = d[1] / d[0];
  if (Math.abs(m) < 1e-9) return "y = 0";
  return `y = ${termText(m, "x", locale, true)}`;
}

const SUB = ["₁", "₂"];

/** An eigenvalue written exact: an integer, a fraction, √n, or the quadratic (a ± b√r)/2 when it has one. */
export function eigenvalueText(lambda: number, tr: number, disc: number, locale: Locale = "pt-BR"): Written {
  const direct = exactText(lambda, locale);
  if (direct.exact) return direct;
  if (isInt(tr) && isInt(disc) && disc > 0) {
    const T = Math.round(tr);
    const D = Math.round(disc);
    const plus = lambda >= tr / 2;
    const { k, r } = splitSquare(D);
    const g = gcd(gcd(Math.abs(T), k), 2);
    const t = T / g;
    const kk = k / g;
    const den = 2 / g;
    const root = `${kk === 1 ? "" : kk}√${r}`;
    const sign = plus ? "+" : MINUS;
    const body = t === 0 ? `${plus ? "" : MINUS}${root}` : `${formatNumber(t, locale)} ${sign} ${root}`;
    return { text: den === 1 ? body : t === 0 ? `${body}/${den}` : `(${body})/${den}`, exact: true };
  }
  return direct;
}

/** The complex pair a ± bi, exact when it is. */
export function complexPairText(re: number, im: number, locale: Locale = "pt-BR"): Written {
  const a = exactText(re, locale);
  const b = exactText(Math.abs(im), locale);
  const coefficient = Math.abs(Math.abs(im) - 1) < 1e-9 ? "i" : /^\d+([.,]\d+)?$/.test(b.text) ? `${b.text}i` : `(${b.text})i`;
  const text = a.text === "0" ? `±${coefficient}` : `${a.text} ± ${coefficient}`;
  return { text, exact: a.exact && b.exact };
}

// ---- the plot's frame ---------------------------------------------------------------------

/** Where the line P0 + t·D (t ∈ ℝ) is inside the box, as two endpoints, or null. */
export function clipLineToBox(p0: Vec, dir: Vec, box: { xlo: number; xhi: number; ylo: number; yhi: number }): [Vec, Vec] | null {
  let t0 = -Infinity;
  let t1 = Infinity;
  const slab = (origin: number, d: number, lo: number, hi: number): boolean => {
    if (Math.abs(d) < 1e-12) return origin >= lo - 1e-9 && origin <= hi + 1e-9;
    let a = (lo - origin) / d;
    let b = (hi - origin) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    return t0 <= t1;
  };
  if (!slab(p0[0], dir[0], box.xlo, box.xhi)) return null;
  if (!slab(p0[1], dir[1], box.ylo, box.yhi)) return null;
  if (!(t1 - t0 > 1e-9) || !Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  return [
    [p0[0] + dir[0] * t0, p0[1] + dir[1] * t0],
    [p0[0] + dir[0] * t1, p0[1] + dir[1] * t1],
  ];
}

/**
 * The lines of the image lattice: the images of x = k (through k·T(e₁), along
 * T(e₂)) and of y = k (through k·T(e₂), along T(e₁)), clipped to the box. `k`
 * runs over the multiples of `step` whose pre-image lines can meet the box,
 * found by mapping the box's corners back through A⁻¹, and `step` widens until
 * each family has at most `MAX_LATTICE_LINES` lines so a stretched or nearly
 * singular map stays legible.
 */
export function imageLattice(A: Matrix, box: { xlo: number; xhi: number; ylo: number; yhi: number }, unit = 50): { step: number; lines: { id: string; axis: boolean; a: Vec; b: Vec }[] } {
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
  const inv: Matrix = [
    [A[1][1] / det, -A[0][1] / det],
    [-A[1][0] / det, A[0][0] / det],
  ];
  const corners: Vec[] = [
    [box.xlo, box.ylo],
    [box.xhi, box.ylo],
    [box.xlo, box.yhi],
    [box.xhi, box.yhi],
  ].map((c) => applyMatrix(inv, c as Vec));
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const range: [number, number][] = [
    [Math.min(...xs), Math.max(...xs)],
    [Math.min(...ys), Math.max(...ys)],
  ];
  const count = (r: [number, number], s: number): number => Math.floor(r[1] / s) - Math.ceil(r[0] / s) + 1;
  const col1: Vec = [A[0][0], A[1][0]];
  const col2: Vec = [A[0][1], A[1][1]];
  // Adjacent lines of a family are |det|/|direction| apart: widen the step until
  // that is a gap a reader can tell apart, and each family has few enough lines.
  const gapOf = (along: Vec): number => (Math.abs(det) / (Math.hypot(along[0], along[1]) || 1)) * unit;
  let step = 1;
  for (const s of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]) {
    step = s;
    const roomy = Math.min(gapOf(col1), gapOf(col2)) * s >= MIN_LATTICE_GAP_PX;
    if (roomy && count(range[0], s) <= MAX_LATTICE_LINES && count(range[1], s) <= MAX_LATTICE_LINES) break;
  }
  const lines: { id: string; axis: boolean; a: Vec; b: Vec }[] = [];
  const family = (name: string, r: [number, number], through: Vec, along: Vec): void => {
    for (let k = Math.ceil(r[0] / step); k <= Math.floor(r[1] / step); k += 1) {
      const kk = k * step;
      const seg = clipLineToBox([through[0] * kk, through[1] * kk], along, box);
      if (seg !== null) lines.push({ id: `lattice-${name}${k < 0 ? "m" : ""}${Math.abs(kk)}`, axis: k === 0, a: seg[0], b: seg[1] });
    }
  };
  family("x", range[0], col1, col2);
  family("y", range[1], col2, col1);
  return { step, lines };
}

// ---- placement: a strict pass that avoids the image lattice, then the checks' own rules ---------

/**
 * The image lattice is grid furniture (`Mark.gridOf`): no check counts a label
 * on it as a collision. But a label that CAN sit in a cell is easier to read,
 * so every label is tried first against a placer that treats the lattice as
 * ink, and only then against one that does not.
 */
class Duo {
  private readonly strict: Placer;
  private readonly loose: Placer;

  constructor(bounds: Rect) {
    this.strict = new Placer(bounds);
    this.loose = new Placer(bounds);
  }

  addInk(id: string, pts: Point[], competes = true, dot?: { c: Point; r: number }): void {
    this.strict.addInk(id, pts, competes, dot);
    this.loose.addInk(id, pts, competes, dot);
  }

  /** Lattice lines, the original's and the image's: ink for the strict placer only. */
  addLattice(id: string, pts: Point[]): void {
    this.strict.addInk(id, pts, false);
  }

  reserve(r: Rect): void {
    this.strict.reserve(r);
    this.loose.reserve(r);
  }

  incident(at: Point): number[] {
    return this.loose.incident(at);
  }

  /**
   * Each group is tried against the strict placer in turn (a label that sits in
   * clear paper needs no backing); when none is clean, or the clean one is more
   * than `SLACK` px farther from what the label names (`away`) than the best
   * spot the loose placer has, the loose placer wins and the label takes a
   * backing. A label a few pixels from its owner on a backing reads better
   * than a bare one across the figure. `strict` says which kind of spot it is.
   */
  choose(claim: Claim, w: number, h: number, groups: Point[][], away?: (p: Point) => number): { centre: Point; cost: number; strict: boolean } {
    const loose = this.loose.choose(claim, w, h, groups.flat());
    for (const g of groups) {
      if (g.length === 0) continue;
      const s = this.strict.choose(claim, w, h, g);
      if (s.cost !== 0) continue;
      if (away !== undefined && loose.cost === 0 && away(s.centre) > away(loose.centre) + STRICT_SLACK) break;
      return { ...s, strict: true };
    }
    return { ...loose, strict: false };
  }

  commit(r: Rect): void {
    this.strict.commit(r);
    this.loose.commit(r);
  }
}

/** The point at fraction t of a polyline's length. */
function alongPolyline(pts: Point[], t: number): Point {
  const lens: number[] = [0];
  for (let i = 1; i < pts.length; i += 1) lens.push(lens[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  const total = lens[lens.length - 1]!;
  let target = Math.min(Math.max(t, 0), 1) * total;
  for (let i = 1; i < pts.length; i += 1) {
    const seg = lens[i]! - lens[i - 1]!;
    if (target <= seg && seg > 0) return { x: pts[i - 1]!.x + ((pts[i]!.x - pts[i - 1]!.x) * target) / seg, y: pts[i - 1]!.y + ((pts[i]!.y - pts[i - 1]!.y) * target) / seg };
    target -= seg;
  }
  return pts[pts.length - 1]!;
}

/**
 * Candidate centres for a `w`x`h` label around a polyline it names: rings of
 * growing radius about samples along it, nearest the polyline first (earlier
 * samples win a tie of a few pixels). The Placer then takes the first that
 * breaks no rule, so the label clings as close as the figure allows.
 */
export function ringSpots(own: Point[], w: number, h: number, ts: number[]): Point[] {
  const scored: { p: Point; score: number }[] = [];
  ts.forEach((t, rank) => {
    const s = alongPolyline(own, t);
    for (const gap of [4, 8, 13, 19, 26, 34, 44, 56]) {
      for (let k = 0; k < 24; k += 1) {
        const ang = (k * Math.PI * 2) / 24;
        const u = { x: Math.cos(ang), y: Math.sin(ang) };
        const reach = Math.abs(u.x) * (w / 2) + Math.abs(u.y) * (h / 2);
        const p = { x: s.x + u.x * (reach + gap), y: s.y + u.y * (reach + gap) };
        scored.push({ p, score: pointToPolyline(p, own) + rank * 2.5 });
      }
    }
  });
  scored.sort((a, b) => a.score - b.score);
  return scored.map((x) => x.p);
}

// ---- the build --------------------------------------------------------------------------------

type Item = { name: string; p: Vec };

function parseShow(raw: LinearMapShow | undefined, anything: boolean): Required<LinearMapShow> {
  // A figure about a shape or a point shows that; a bare map shows the lattice, the basis and the unit square.
  const base = anything ? { grid: false, basis: false, unitSquare: false, eigen: false } : { grid: true, basis: true, unitSquare: true, eigen: false };
  return { ...base, ...(raw ?? {}) } as Required<LinearMapShow>;
}

const framedOf = (frameId: string, p: Vec): FramedPoint => ({ frame: frameId, x: p[0], y: p[1] });

const fmtInt = (n: number): string => String(n).replace("-", MINUS);

/**
 * The plane's geometry from its box alone: px per unit, the tick step, the
 * canvas width and the plot's height, and where (0, 0) lands. Exported so a
 * test can invert a rendered figure's canvas coordinates with the EXACT
 * arithmetic that placed them (the field preset's `frameGeometry` does the same).
 */
export function planeGeometry(x: [number, number], y: [number, number]): { unit: number; step: number; plotWidth: number; plotHeight: number; width: number; origin: Point } {
  const spanX = x[1] - x[0];
  const spanY = y[1] - y[0];
  // One unit on both axes (angles and areas must survive), FITTED to the box:
  // a stretch of 300 gives a plane of the same size as a stretch of 3, with
  // the unit square correspondingly small -- that is what the map does.
  const { xUnit: unit } = fitUnits(spanX, spanY, { equal: true, targetWidth: PLOT_TARGET_PX, targetHeight: PLOT_TARGET_PX, maxUnit: MAX_UNIT });
  // Whole units while the box is a few units wide (as it always was); 1, 2 or 5 x 10^k at any other magnitude.
  const span = Math.max(spanX, spanY);
  const step = span >= 4 ? Math.max(1, niceStep(span, 10)) : niceStep(span, 10);
  const plotWidth = Math.ceil(MARGIN * 2 + spanX * unit);
  const plotHeight = Math.ceil(MARGIN * 2 + spanY * unit);
  const width = Math.max(plotWidth, MIN_WIDTH);
  const shiftX = (width - plotWidth) / 2;
  return { unit, step, plotWidth, plotHeight, width, origin: { x: MARGIN + shiftX - x[0] * unit, y: MARGIN + y[1] * unit } };
}

export function expandLinearMap(input: LinearMapInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const A = matrixOf(input);
  const [[a, b], [c, d]] = A;
  const det = determinant(A);
  const tr = traceOf(A);
  const singular = isSingular(A);
  const T = (p: readonly [number, number]): Vec => applyMatrix(A, p);

  // ---- shapes and points ---------------------------------------------------
  const shapes = (input.shapes ?? []).map((s, i) => {
    const path = `linear-map.shapes[${i}]`;
    if (!Array.isArray(s.points) || s.points.length < 3) throw new SpecError(`${path}.points must be at least three vertices [[x, y], ...]`);
    const pts = s.points.map((p, j) => {
      if (!Array.isArray(p) || p.length !== 2) throw new SpecError(`${path}.points[${j}] must be [x, y]`);
      return [v.finite(p[0], `${path}.points[${j}][0]`), v.finite(p[1], `${path}.points[${j}][1]`)] as Vec;
    });
    let names: string[] | undefined;
    if (s.label !== undefined) {
      names = [...s.label];
      if (names.length !== pts.length || names.some((n) => n.trim() === "")) {
        throw new SpecError(`${path}.label ${JSON.stringify(s.label)} must name each of the ${pts.length} vertices with one letter, in order`);
      }
    }
    return { pts, names, image: pts.map((p) => T(p)) };
  });
  const named: Item[] = (input.points ?? []).map((p, i) => {
    const path = `linear-map.points[${i}]`;
    if (typeof p.name !== "string" || p.name.trim() === "") throw new SpecError(`${path}.name must be a non-empty string`);
    if (!Array.isArray(p.at) || p.at.length !== 2) throw new SpecError(`${path}.at must be [x, y]`);
    return { name: p.name, p: [v.finite(p.at[0], `${path}.at[0]`), v.finite(p.at[1], `${path}.at[1]`)] as Vec };
  });
  {
    const seen = new Set<string>();
    for (const n of named) {
      if (seen.has(n.name)) throw new SpecError(`linear-map.points: the name "${n.name}" is used twice`);
      seen.add(n.name);
    }
  }
  const show = parseShow(input.show, shapes.length > 0 || named.length > 0);
  // answers: false draws what the exercise GIVES (the plane, e₁ e₂, the unit
  // square, the original shapes and points, the matrix as typed) and nothing
  // it ASKS FOR (every image, T(e₁) T(e₂), the parallelogram and its area,
  // the eigen-lines, the image line, det/tr and every reading). The box is
  // still fitted to the images, so the question and its solution share one page.
  const hide = input.answers === false;

  // ---- what must be inside the box ------------------------------------------
  const must: { what: string; p: Vec }[] = [{ what: "the origin", p: [0, 0] }];
  const e1: Vec = [1, 0];
  const e2: Vec = [0, 1];
  const t1 = T(e1);
  const t2 = T(e2);
  const corner: Vec = [1, 1];
  const t12 = T(corner);
  if (show.basis) {
    must.push({ what: "e₁", p: e1 }, { what: "e₂", p: e2 }, { what: "T(e₁)", p: t1 }, { what: "T(e₂)", p: t2 });
  }
  if (show.unitSquare) must.push({ what: "the unit square", p: corner }, { what: "T(1; 1)", p: t12 }, { what: "T(e₁)", p: t1 }, { what: "T(e₂)", p: t2 }, { what: "e₁", p: e1 }, { what: "e₂", p: e2 });
  shapes.forEach((s, i) => {
    s.pts.forEach((p, j) => must.push({ what: `shapes[${i}] vertex ${s.names?.[j] ?? j + 1}`, p }));
    s.image.forEach((p, j) => must.push({ what: `the image of shapes[${i}] vertex ${s.names?.[j] ?? j + 1}`, p }));
  });
  named.forEach((n) => must.push({ what: `point ${n.name}`, p: n.p }, { what: `the image ${n.name}′`, p: T(n.p) }));

  const spanOf = (values: number[], given: [number, number] | undefined, axis: string): [number, number] => {
    if (given !== undefined) {
      if (!Array.isArray(given) || given.length !== 2) throw new SpecError(`linear-map.${axis} must be [lo, hi]`);
      const lo = v.finite(given[0], `linear-map.${axis}[0]`);
      const hi = v.finite(given[1], `linear-map.${axis}[1]`);
      if (!(hi > lo)) throw new SpecError(`linear-map.${axis} must be [lo, hi] with lo < hi, got ${JSON.stringify(given)}`);
      return [lo, hi];
    }
    let lo = Math.floor(Math.min(...values) - RANGE_MARGIN);
    let hi = Math.ceil(Math.max(...values) + RANGE_MARGIN);
    while (hi - lo < 4) {
      lo -= 1;
      if (hi - lo < 4) hi += 1;
    }
    return [lo, hi];
  };
  const [xlo, xhi] = spanOf(must.map((m) => m.p[0]), input.x, "x");
  const [ylo, yhi] = spanOf(must.map((m) => m.p[1]), input.y, "y");
  for (const m of must) {
    const out = m.p[0] < xlo - 1e-9 || m.p[0] > xhi + 1e-9 || m.p[1] < ylo - 1e-9 || m.p[1] > yhi + 1e-9;
    if (out) {
      throw new SpecError(
        `linear-map: ${m.what} = ${pairText(m.p, "en").text} lies outside the plotted box x ∈ [${xlo}, ${xhi}], y ∈ [${ylo}, ${yhi}] -- widen x/y (or drop the flag that draws it); nothing is clipped silently`,
      );
    }
  }
  const box = { xlo, xhi, ylo, yhi };

  // ---- the panel's text first: its height decides the canvas -----------------------
  const panel = buildPanel(A, det, tr, singular, show, shapes, named, locale, hide ? input.named : undefined, hide);

  // ---- frame ----------------------------------------------------------------------
  const { unit, step, plotHeight, width, origin } = planeGeometry([xlo, xhi], [ylo, yhi]);

  const board0 = new Board(width, plotHeight, PAPER); // measuring only: extents do not depend on the canvas
  const panelLayout = layoutPanel(board0, panel, width);
  const height = plotHeight + panelLayout.height;

  const grid: GridSpec = {
    x: { from: xlo, to: xhi, step, origin: 0 },
    y: { from: ylo, to: yhi, step, origin: 0 },
    locale,
  };
  const frame: Frame & { origin: Point } = {
    id: "plane",
    origin,
    xUnit: unit,
    yUnit: unit,
    grid,
  };
  const board = new Board(width, height, PAPER);
  board.addFrame(frame);
  const placer = new Duo({ x: 12, y: 8, width: width - 24, height: plotHeight - 12 });
  for (const t of tickPlan(frame, grid)) {
    const bx = t.spots[0]!.box;
    board.reserve(bx.x + bx.width / 2, bx.y + bx.height / 2, bx.width, bx.height);
    placer.reserve(bx);
  }
  const at = (p: readonly [number, number]): Point => resolveInFrame(frame, p[0], p[1]);
  if (ylo <= 0 && yhi >= 0) placer.addInk("plane-axis-x", [at([xlo, 0]), at([xhi, 0])], false);
  if (xlo <= 0 && xhi >= 0) placer.addInk("plane-axis-y", [at([0, ylo]), at([0, yhi])], false);
  // The plane's own faint lattice: ink to the strict placer, so a label that needs no backing is found first.
  ticksOf(grid.x).forEach((x, i) => placer.addLattice(`plane-lattice-v${i}`, [at([x, ylo]), at([x, yhi])]));
  ticksOf(grid.y).forEach((y, i) => placer.addLattice(`plane-lattice-h${i}`, [at([xlo, y]), at([xhi, y])]));

  const connectors: Connector[] = [];

  // ---- regions ------------------------------------------------------------------------
  /** A closed region stated IN THE FRAME, so frame resolution records the scale `area-matches-its-label` measures it in. */
  const region = (id: string, pts: Vec[], fill: string, stroke: string, width2: number): Point[] => {
    const px = pts.map((p) => at(p));
    const first = framedOf(frame.id, pts[0]!);
    const mark: Mark = {
      id,
      from: first,
      segments: pts.slice(1).map((p) => ({ line: framedOf(frame.id, p) })),
      close: true,
      fill,
      stroke,
      strokeWidth: width2,
    };
    board.marks.push(mark);
    placer.addInk(id, [...px, px[0]!]);
    return px;
  };
  const canvasRegion = (id: string, pts: Vec[], fill: string, stroke: string, width2: number): Point[] => {
    const px = pts.map((p) => at(p));
    board.poly(px, { stroke, width: width2, fill, close: true, id });
    placer.addInk(id, [...px, px[0]!]);
    return px;
  };

  // The image lattice, as grid furniture beneath everything else.
  let latticeStep = 1;
  if (show.grid && !singular && !hide) {
    const lattice = imageLattice(A, box, unit);
    latticeStep = lattice.step;
    for (const line of lattice.lines) {
      const pa = at(line.a);
      const pb = at(line.b);
      board.marks.push({
        id: line.id,
        gridOf: frame.id,
        from: pa,
        segments: [{ line: pb }],
        close: false,
        fill: "none",
        stroke: line.axis ? LATTICE_AXES : LATTICE,
        strokeWidth: line.axis ? 1.8 : 1.1,
      });
      placer.addLattice(line.id, [pa, pb]);
    }
  }

  const squareIds = { original: "unit-square", image: "unit-square-image" };
  let imagePoly: Point[] | undefined;
  let imageOrder: Vec[] | undefined;
  let imageSegment: Point[] | undefined;
  if (show.unitSquare) {
    const original: Vec[] = [[0, 0], e1, corner, e2];
    // The unit square is the DOMAIN, drawn as reference furniture like the original lattice
    // (`gridOf`): a name set beside an arrow is not misread as naming the square's edge.
    const px = original.map((p) => at(p));
    board.marks.push({
      id: squareIds.original,
      gridOf: frame.id,
      from: px[0]!,
      segments: px.slice(1).map((pt) => ({ line: pt })),
      close: true,
      fill: `${ORIGINAL}${TINT}`,
      stroke: ORIGINAL,
      strokeWidth: 1.6,
    });
    placer.addInk(squareIds.original, [...px, px[0]!], false);
    imageOrder = [[0, 0], t1, t12, t2];
    if (hide) {
      // the parallelogram is the answer
    } else if (singular) {
      // The parallelogram has collapsed onto a segment: draw the segment, as ink.
      const along = imageOrder.map((p) => p);
      const dirv = singularParts(A);
      if (dirv.rank === 1) {
        const s = along.map((p) => p[0] * dirv.image[0] + p[1] * dirv.image[1]);
        const lo = Math.min(...s);
        const hi = Math.max(...s);
        imageSegment = [at([dirv.image[0] * lo, dirv.image[1] * lo]), at([dirv.image[0] * hi, dirv.image[1] * hi])];
        board.poly(imageSegment, { stroke: IMAGE, width: 4.5, id: squareIds.image });
        placer.addInk(squareIds.image, imageSegment);
      }
    } else {
      imagePoly = region(squareIds.image, imageOrder, `${IMAGE}${TINT}`, IMAGE, 2);
    }
  }

  // Shapes and their images.
  type Vertex = { id: string; name: string; c: Point; colour: string; outward: Point };
  const vertices: Vertex[] = [];
  const centroidOf = (pts: Point[]): Point => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
  shapes.forEach((s, i) => {
    const px = canvasRegion(`shape-${i}`, s.pts, `${ORIGINAL}${TINT}`, ORIGINAL, 1.8);
    const ix = hide ? [] : canvasRegion(`shape-${i}-image`, s.image, `${IMAGE}${TINT}`, IMAGE, 2.2);
    if (s.names === undefined) return;
    const ctr = centroidOf(px);
    const ictr = hide ? ctr : centroidOf(ix);
    s.names.forEach((n, j) => {
      const same = Math.hypot(s.pts[j]![0] - s.image[j]![0], s.pts[j]![1] - s.image[j]![1]) < 1e-9;
      const dir = (p: Point, o: Point): Point => {
        const len = Math.hypot(p.x - o.x, p.y - o.y) || 1;
        return { x: (p.x - o.x) / len, y: (p.y - o.y) / len };
      };
      if (hide) vertices.push({ id: `shape-${i}-v${j}`, name: n, c: px[j]!, colour: INK, outward: dir(px[j]!, ctr) });
      else if (same) vertices.push({ id: `shape-${i}-v${j}`, name: `${n} = ${n}′`, c: px[j]!, colour: INK, outward: dir(px[j]!, ctr) });
      else {
        vertices.push({ id: `shape-${i}-v${j}`, name: n, c: px[j]!, colour: INK, outward: dir(px[j]!, ctr) });
        vertices.push({ id: `shape-${i}-v${j}-image`, name: `${n}′`, c: ix[j]!, colour: IMAGE, outward: dir(ix[j]!, ictr) });
      }
    });
  });
  named.forEach((n, i) => {
    const p = at(n.p);
    const q = T(n.p);
    if (hide) vertices.push({ id: `point-${i}`, name: n.name, c: p, colour: INK, outward: { x: 0, y: -1 } });
    else if (Math.hypot(n.p[0] - q[0], n.p[1] - q[1]) < 1e-9) vertices.push({ id: `point-${i}`, name: `${n.name} = ${n.name}′`, c: p, colour: INK, outward: { x: 0, y: -1 } });
    else {
      vertices.push({ id: `point-${i}`, name: n.name, c: p, colour: INK, outward: { x: 0, y: -1 } });
      vertices.push({ id: `point-${i}-image`, name: `${n.name}′`, c: at(q), colour: IMAGE, outward: { x: 0, y: -1 } });
    }
  });

  // Lines through the origin: the eigen-lines and, for a singular map, the image.
  const O = at([0, 0]);
  const eig = eigen2x2(A);
  const disc = tr * tr - 4 * det;
  type Through = { id: string; seg: [Point, Point]; stroke: string; width: number; dashed: boolean; text: string; textColour: string };
  const through: Through[] = [];
  if (show.eigen && !hide && eig.kind === "real") {
    eig.lines.forEach((line, i) => {
      const seg = clipLineToBox([0, 0], line.direction, box);
      if (seg === null) return;
      const w = eigenvalueText(line.value, tr, disc, locale);
      through.push({ id: `eigen-${i}`, seg: [at(seg[0]), at(seg[1])], stroke: EIGEN, width: 1.9, dashed: true, text: `λ ${w.exact ? "=" : "≈"} ${w.text}`, textColour: EIGEN_TEXT });
    });
  }
  if (singular && !hide) {
    const parts = singularParts(A);
    if (parts.rank === 1) {
      const seg = clipLineToBox([0, 0], parts.image, box);
      if (seg !== null) through.push({ id: "image-line", seg: [at(seg[0]), at(seg[1])], stroke: IMAGE, width: 1.8, dashed: false, text: "Im T", textColour: IMAGE_TEXT });
    }
  }

  // The frame prints ONE "0" in a corner of the origin, in the first of four
  // spots that no ink crosses. Two lines through the origin at 45° cross all
  // four; then the lines are drawn with a small gap round the origin, which a
  // dashed line reads as anyway, instead of leaving the "0" struck through.
  const arrowTips: Vec[] = show.basis ? (hide ? [e1, e2] : [e1, e2, t1, t2]) : [];
  const drawn: Point[][] = [
    ...arrowTips.map((tip) => [O, at(tip)]),
    ...(show.unitSquare ? [[...([[0, 0], e1, corner, e2, [0, 0]] as Vec[]).map((p) => at(p))], ...(hide ? [] : [[...([[0, 0], t1, t12, t2, [0, 0]] as Vec[]).map((p) => at(p))]])] : []),
    ...shapes.flatMap((sh) => [[...sh.pts, sh.pts[0]!].map((p) => at(p)), ...(hide ? [] : [[...sh.image, sh.image[0]!].map((p) => at(p))])]),
  ];
  const originSpots = tickPlan(frame, grid).find((t) => t.id === `${frame.id}-tick-origin`)?.spots.map((sp) => sp.box) ?? [];
  const hitsRect = (poly: Point[], r: Rect): boolean => {
    const padded = { x: r.x - 2, y: r.y - 2, width: r.width + 4, height: r.height + 4 };
    return poly.some((pt, i) => i > 0 && segmentHitsRect(poly[i - 1]!, pt, padded));
  };
  const allOrigin = [...drawn, ...through.map((t) => t.seg as Point[])];
  const cut = originSpots.length > 0 && originSpots.every((r) => allOrigin.some((poly) => hitsRect(poly, r)));
  const GAP = 30;

  type LineDraw = { id: string; text: string; textColour: string; pts: Point[] };
  const lineDraws: LineDraw[] = [];
  for (const t of through) {
    let parts: Point[][] = [t.seg];
    if (cut) {
      parts = t.seg
        .map((end) => {
          const len = Math.hypot(end.x - O.x, end.y - O.y);
          return len > GAP + 12 ? [{ x: O.x + ((end.x - O.x) * GAP) / len, y: O.y + ((end.y - O.y) * GAP) / len }, end] : null;
        })
        .filter((x): x is Point[] => x !== null);
      if (parts.length === 0) parts = [t.seg];
    }
    parts.sort((m, n) => Math.hypot(n[1]!.x - n[0]!.x, n[1]!.y - n[0]!.y) - Math.hypot(m[1]!.x - m[0]!.x, m[1]!.y - m[0]!.y));
    parts.forEach((pts, k) => {
      const id = k === 0 ? t.id : `${t.id}-${k}`;
      board.poly(pts, { stroke: t.stroke, width: t.width, id, ...(t.dashed ? { lineStyle: "dashed" as const } : {}) });
      placer.addInk(id, pts);
      if (k === 0) lineDraws.push({ id, text: t.text, textColour: t.textColour, pts });
    });
  }

  // Arrows: T(e₁), T(e₂) then e₁, e₂ over them.
  type Arrow = { id: string; tail: Point; head: Point; text: string; colour: string };
  const arrows: Arrow[] = [];
  if (show.basis) {
    // Equal vectors are ONE arrow with all its names: T(e₁) = e₂, T(e₁) = T(e₂).
    const same = (p: Vec, q: Vec): boolean => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-9;
    type Named = { name: string; v: Vec; image: boolean; id: string };
    const items: Named[] = [
      ...(hide ? [] : [
        { name: "T(e₁)", v: t1, image: true, id: "image-e1" },
        { name: "T(e₂)", v: t2, image: true, id: "image-e2" },
      ]),
      { name: "e₁", v: e1, image: false, id: "basis-e1" },
      { name: "e₂", v: e2, image: false, id: "basis-e2" },
    ];
    const groups: Named[][] = [];
    for (const it of items) {
      const g = groups.find((grp) => same(grp[0]!.v, it.v));
      if (g === undefined) groups.push([it]);
      else g.push(it);
    }
    for (const g of [...groups.filter((grp) => grp.some((x) => x.image)), ...groups.filter((grp) => !grp.some((x) => x.image))]) {
      const image = g.some((x) => x.image);
      const head = at(g[0]!.v);
      if (Math.hypot(head.x - O.x, head.y - O.y) < 4) continue;
      const id = g[0]!.id;
      const colour = image ? IMAGE : ORIGINAL;
      const width2 = image ? 2.6 : 2.2;
      connectors.push({ id, from: O, to: head, arrow: "end", stroke: colour, strokeWidth: width2 });
      board.trace([O, head], colour, width2, id);
      placer.addInk(id, [O, head]);
      arrows.push({ id, tail: O, head, text: g.map((x) => x.name).join(" = "), colour });
    }
  }

  // Dots last.
  for (const vtx of vertices) {
    board.circle(vtx.c, 3, { fill: vtx.colour, id: `${vtx.id}-dot` });
    placer.addInk(`${vtx.id}-dot`, [vtx.c], true, { c: vtx.c, r: 3 });
  }

  // ---- labels, every piece of ink now down --------------------------------------------------
  const style = (colour: string, size = 13, weight = 700): LabelOptions => ({ size, weight, colour });
  /**
   * A label on clear paper is set bare; one that must cross a gridline is set
   * on a paper backing (the halo ADR 0034 designed: a lattice line under it is
   * allowed to break, nothing else is), so `contrast-sufficient` reads the
   * paper and not the line.
   */
  const put = (claim: Claim, text: string, o: LabelOptions, groups: (w: number, h: number) => Point[][], own?: Point[]): Block => {
    const { w, h } = board.extent(text, o);
    const best = placer.choose(claim, w, h, groups(w, h), own === undefined ? undefined : (c) => pointToPolyline(c, own));
    const block = board.label(text, best.centre.x, best.centre.y, { ...o, width: w, ...(best.strict ? {} : { fill: PAPER }) });
    placer.commit(rectAt(best.centre, w, h));
    return block;
  };

  for (const vtx of vertices) {
    const o = style(vtx.colour === IMAGE ? IMAGE_TEXT : vtx.colour, 13, 700);
    const block = put({ kind: "place", id: vtx.id, at: vtx.c }, vtx.name, o, (w, h) => [aroundPoint(vtx.c, w, h, placer.incident(vtx.c), vtx.outward)], [vtx.c]);
    block.annotatesPlace = vtx.c;
  }

  // The names on the arrows: the images first, they are the point of the figure.
  const isImage = (r: Arrow): boolean => r.colour === IMAGE;
  for (const r of [...arrows.filter(isImage), ...arrows.filter((x) => !isImage(x))]) {
    const o = style(r.colour === IMAGE ? IMAGE_TEXT : SOFT, 14, 700);
    const block = put({ kind: "element", id: r.id }, r.text, o, (w, h) => [ringSpots([r.tail, r.head], w, h, [1, 0.7, 0.5, 0.3])], [r.tail, r.head]);
    block.annotates = r.id;
  }

  for (const e of lineDraws) {
    const o = style(e.textColour, 13, 700);
    const block = put({ kind: "element", id: e.id }, e.text, o, (w, h) => [ringSpots(e.pts, w, h, [0.92, 0.08, 0.84, 0.16, 0.74, 0.26, 0.64, 0.36, 0.5])], e.pts);
    block.annotates = e.id;
  }

  if (imagePoly !== undefined) {
    // The area, printed and then MEASURED against the polygon drawn (ADR 0037).
    const area = Math.abs(det);
    const exact = asFraction(area);
    const text = exact !== null ? `S = ${formatNumber(area, locale)}` : `S ≈ ${formatNumber(area, locale, { decimals: 2 })}`;
    const [pO, p1, , p2] = imagePoly as [Point, Point, Point, Point];
    const o = style(IMAGE_TEXT, 14, 700);
    const outline = [...imagePoly, imagePoly[0]!];
    const block = put({ kind: "element", id: squareIds.image }, text, o, (w, h) => {
      const inside: { p: Point; score: number }[] = [];
      for (const u of [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85]) {
        for (const vv of [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85]) {
          inside.push({
            p: { x: pO.x + (p1.x - pO.x) * u + (p2.x - pO.x) * vv, y: pO.y + (p1.y - pO.y) * u + (p2.y - pO.y) * vv },
            score: u + vv + 0.6 * Math.max(u, vv),
          });
        }
      }
      inside.sort((s1, s2) => s2.score - s1.score);
      return [inside.map((x) => x.p), ringSpots(outline, w, h, [0.5, 0.25, 0.75, 0.4, 0.6, 0.1, 0.9])];
    });
    block.annotates = squareIds.image;
  }

  // ---- the reading panel ---------------------------------------------------------------------------
  drawPanel(board, panelLayout, plotHeight, width);

  void a;
  void b;
  void c;
  void d;
  void latticeStep;
  void imageSegment;
  const title = input.title ?? `transformação linear ${formulaOf(A, locale)}`;
  const spec = board.spec(title);
  const scene = spec.root as Scene;
  scene.connectors = connectors;
  spec.canvas = { ...spec.canvas, constraints: { allowOverlap: true, allowConnectorCrossing: true, allowCurvedConnectors: true } };
  return parseSpec(spec);
}

// ---- the reading panel -------------------------------------------------------------------------------

type PanelData = {
  /** Absent when the map is given by name and the matrix is what is asked for. */
  entries?: [[string, string], [string, string]];
  head: string[]; // the lines beside the matrix
  body: string[]; // full-width lines beneath
};

/** A named map in words, as the exercise would state it. */
function namedText(named: NamedMap, locale: Locale): string {
  const n = named as Record<string, unknown>;
  const num = (x: unknown): string => (typeof x === "number" ? formatNumber(x, locale) : String(x));
  const angle = (x: unknown): string => (typeof x === "number" ? `${formatNumber(x, locale)}°` : String(x));
  if ("rotation" in n) return `rotação de ${angle(n.rotation)}`;
  if ("reflection" in n) {
    const line = (n.reflection as { line: unknown }).line;
    return typeof line === "number" ? `reflexão na reta de ângulo ${angle(line)}` : `reflexão na reta ${String(line)}`;
  }
  if ("shear" in n) {
    const sh = n.shear as { x?: unknown; y?: unknown };
    return sh.x !== undefined ? `cisalhamento horizontal de fator ${num(sh.x)}` : `cisalhamento vertical de fator ${num(sh.y)}`;
  }
  if ("scale" in n) {
    const sc = n.scale as unknown[];
    return `escala de fatores ${num(sc[0])} e ${num(sc[1])}`;
  }
  const onto = (n.projection as { onto: unknown }).onto;
  if (Array.isArray(onto)) return `projeção sobre o vetor (${num(onto[0])}; ${num(onto[1])})`;
  return typeof onto === "number" ? `projeção sobre a reta de ângulo ${angle(onto)}` : `projeção sobre a reta ${String(onto)}`;
}

function buildPanel(
  A: Matrix,
  det: number,
  tr: number,
  singular: boolean,
  show: Required<LinearMapShow>,
  shapes: { pts: Vec[]; names: string[] | undefined; image: Vec[] }[],
  named: Item[],
  locale: Locale,
  givenName: NamedMap | undefined,
  hide: boolean,
): PanelData {
  const fr = wantsFractions(A);
  const w = A.map((row) => row.map((x) => exactText(x, locale, fr))) as Written[][];
  const entries: [[string, string], [string, string]] = [
    [w[0]![0]!.text, w[0]![1]!.text],
    [w[1]![0]!.text, w[1]![1]!.text],
  ];
  const detW = exactText(det, locale);
  const trW = exactText(tr, locale);
  if (hide) {
    // The question's panel: the map as the exercise states it and nothing computed from it.
    // A map given by name is stated by its name -- its matrix would be the answer.
    if (givenName !== undefined) return { head: [`T: ${namedText(givenName, locale)}`], body: [] };
    return { entries, head: [formulaOf(A, locale)], body: [] };
  }
  const head = [formulaOf(A, locale), `det A ${detW.exact ? "=" : "≈"} ${detW.text}; tr A ${trW.exact ? "=" : "≈"} ${trW.text}`];
  const body: string[] = [];
  const inexact = w.flat().some((x) => !x.exact);

  if (show.basis) {
    const t1 = pairText([A[0][0], A[1][0]], locale, fr);
    const t2 = pairText([A[0][1], A[1][1]], locale, fr);
    body.push(`T(e₁) ${t1.exact ? "=" : "≈"} ${t1.text} e T(e₂) ${t2.exact ? "=" : "≈"} ${t2.text}: as colunas de A`);
  }
  if (show.unitSquare && !singular) {
    const s = exactText(Math.abs(det), locale);
    body.push(`imagem do quadrado unitário: paralelogramo de área S ${s.exact ? "=" : "≈"} |det A| = ${s.text}${det < 0 ? "; det A < 0: a orientação se inverte" : ""}`);
  }
  if (singular) {
    const parts = singularParts(A);
    if (parts.rank === 0) body.push("A é a matriz nula (det A = 0): a imagem do plano é só a origem");
    else {
      const im = lineEquation(parts.image, locale);
      const gen = directionText(parts.image, locale);
      const ker = lineEquation(parts.kernel, locale);
      body.push(`A é singular (det A = 0): a imagem do plano é a reta ${im}, gerada por ${gen.text}`);
      body.push(`o núcleo é a reta ${ker}: seus pontos vão todos para a origem`);
      if (show.unitSquare) {
        // The unit square collapses onto a segment of the image line: its ends are the extreme images of the corners.
        const along = ([[0, 0], [1, 0], [1, 1], [0, 1]] as Vec[]).map((c) => applyMatrix(A, c));
        const s = along.map((q) => q[0] * parts.image[0] + q[1] * parts.image[1]);
        const lo = along[s.indexOf(Math.min(...s))]!;
        const hi = along[s.indexOf(Math.max(...s))]!;
        body.push(`o quadrado unitário vira o segmento de ${pairText(lo, locale, fr).text} a ${pairText(hi, locale, fr).text}, de área 0`);
      }
    }
  }
  if (show.eigen) {
    const disc = tr * tr - 4 * det;
    const eig = eigen2x2(A);
    if (eig.kind === "complex") {
      const z = complexPairText(eig.re, eig.im, locale);
      body.push(`autovalores complexos: ${z.text}${z.exact ? "" : " (aprox.)"}`);
      body.push("nenhuma reta pela origem é levada nela mesma");
    } else if (eig.scalar) {
      body.push(`A = λI com λ = ${exactText(eig.values[0], locale).text}: todo vetor não nulo é autovetor`);
    } else if (eig.repeated) {
      const line = eig.lines[0]!;
      body.push(`autovalor duplo λ = ${exactText(eig.values[0], locale).text}`);
      body.push(`único autovetor, a menos de múltiplo: ${directionText(line.direction, locale).text}`);
    } else {
      const vals = eig.values.map((x) => eigenvalueText(x, tr, disc, locale));
      body.push(`autovalores: ${vals.map((x, i) => `λ${SUB[i]} ${x.exact ? "=" : "≈"} ${x.text}`).join(" e ")}`);
      eig.lines.forEach((line, i) => {
        const dir = directionText(line.direction, locale);
        body.push(`autovetor de λ ${vals[i]!.exact ? "=" : "≈"} ${vals[i]!.text}: ${dir.exact ? "" : "≈ "}${dir.text}`);
      });
    }
  }
  shapes.forEach((s, i) => {
    const names = s.names;
    const img = s.image.map((p, j) => {
      const pt = pairText(p, locale);
      return `${names === undefined ? `V${j + 1}` : names[j]!}′ ${pt.exact ? "=" : "≈"} ${pt.text}`;
    });
    for (const line of chunk(img, ", ", 480)) body.push(line);
    const area0 = polygonArea(s.pts);
    const area1 = polygonArea(s.image);
    const a0 = exactText(area0, locale);
    const a1 = exactText(area1, locale);
    const tag = names === undefined ? `figura ${i + 1}` : names.join("");
    body.push(`área ${tag} ${a0.exact ? "=" : "≈"} ${a0.text}; área ${names === undefined ? tag + "′" : names.map((n) => `${n}′`).join("")} ${a1.exact ? "=" : "≈"} ${a1.text} (|det A| vezes a original)`);
  });
  if (named.length > 0) {
    const img = named.map((n) => {
      const pt = pairText(applyMatrix(A, n.p), locale);
      return `${n.name}′ ${pt.exact ? "=" : "≈"} ${pt.text}`;
    });
    for (const line of chunk(img, ", ", 480)) body.push(line);
  }
  if (inexact) body.push("entradas não exatas arredondadas a três casas");
  void fmtInt;
  return { entries, head, body };
}

/** Items joined by `sep`, split into lines no wider than `maxPx` at the panel's size. */
function chunk(items: string[], sep: string, maxPx: number): string[] {
  const per = (s: string): number => Math.ceil([...s].length * (PANEL_FONT * 0.56 + 0.1) + 10);
  const out: string[] = [];
  let cur = "";
  for (const it of items) {
    const next = cur === "" ? it : `${cur}${sep}${it}`;
    if (cur !== "" && per(next) > maxPx) {
      out.push(cur);
      cur = it;
    } else cur = next;
  }
  if (cur !== "") out.push(cur);
  return out;
}

/** A line broken at spaces into lines no wider than `maxPx`, the way a paragraph wraps. */
function wrapWords(text: string, maxPx: number, extent: (t: string) => number): string[] {
  if (extent(text) <= maxPx) return [text];
  // "=" and "≈" stay with both neighbours: a line never ends on "S ≈ |det A| =".
  const words: string[] = [];
  let glue = false;
  for (const w of text.split(" ")) {
    if (words.length > 0 && (glue || w === "=" || w === "≈")) words[words.length - 1] += ` ${w}`;
    else words.push(w);
    glue = w === "=" || w === "≈" || w.endsWith("det");
  }
  const out: string[] = [];
  let cur = "";
  for (const word of words) {
    const next = cur === "" ? word : `${cur} ${word}`;
    if (cur !== "" && extent(next) > maxPx) {
      out.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur !== "") out.push(cur);
  return out;
}

type PanelLayout = {
  height: number;
  labels: { id: string; text: string; x: number; y: number; w: number; colour: string; weight?: number; align?: "start" | "center" | "end" }[];
  brackets: { id: string; pts: Point[] }[];
};

function layoutPanel(board: Board, panel: PanelData, width: number): PanelLayout {
  const labels: PanelLayout["labels"] = [];
  const brackets: PanelLayout["brackets"] = [];
  const o = { size: PANEL_FONT };
  if (panel.entries === undefined) {
    // A map given by name: one line, no matrix.
    const text = panel.head[0]!;
    labels.push({ id: "panel-head-0", text, x: MARGIN, y: 46, w: board.extent(text, o).w, colour: INK, align: "start", weight: 700 });
    return { height: 46 + 28, labels, brackets };
  }
  const entries = panel.entries;
  const extent = (text: string): number => board.extent(text, o).w;
  const rowH = 28;
  const top = 46; // the first row centre, below the plot: the matrix brackets start 28px under it
  const y1 = top;
  const y2 = top + rowH;
  const left = MARGIN;
  const wA = extent("A =");
  labels.push({ id: "panel-name", text: "A =", x: left, y: (y1 + y2) / 2, w: wA, colour: INK, weight: 700 });
  const bx0 = left + wA + 12;
  const colW = [0, 1].map((j) => Math.max(extent(entries[0][j]!), extent(entries[1][j]!)));
  const gap = 22;
  const pad = 12;
  const c0 = bx0 + pad;
  const c1 = c0 + colW[0]! + gap;
  const bx1 = c1 + colW[1]! + pad;
  const cell = (id: string, text: string, x: number, w: number, y: number): void => {
    labels.push({ id, text, x, y, w, colour: INK, align: "center" });
  };
  cell("matrix-a11", entries[0][0], c0, colW[0]!, y1);
  cell("matrix-a12", entries[0][1], c1, colW[1]!, y1);
  cell("matrix-a21", entries[1][0], c0, colW[0]!, y2);
  cell("matrix-a22", entries[1][1], c1, colW[1]!, y2);
  const yt = y1 - 18;
  const yb = y2 + 18;
  const serif = 5;
  brackets.push({ id: "matrix-bracket-left", pts: [{ x: bx0 + serif, y: yt }, { x: bx0, y: yt }, { x: bx0, y: yb }, { x: bx0 + serif, y: yb }] });
  brackets.push({ id: "matrix-bracket-right", pts: [{ x: bx1 - serif, y: yt }, { x: bx1, y: yt }, { x: bx1, y: yb }, { x: bx1 - serif, y: yb }] });

  const xText = bx1 + 36;
  const room = width - xText - 16;
  const overflow: string[] = [];
  panel.head.forEach((text, i) => {
    const w = extent(text);
    if (w > room) overflow.push(text);
    else labels.push({ id: `panel-head-${i}`, text, x: xText, y: i === 0 ? y1 : y2, w, colour: INK, align: "start" });
  });
  // A head line that did not fit beside the matrix goes with the rest, first.
  const maxLine = width - MARGIN * 2;
  const body = [...overflow, ...panel.body].flatMap((text) => wrapWords(text, maxLine, extent));
  let y = y2 + 18 + 26;
  body.forEach((text, i) => {
    labels.push({ id: `panel-line-${i}`, text, x: left, y, w: extent(text), colour: SOFT, align: "start" });
    y += PANEL_LINE_H;
  });
  const lastCentre = body.length > 0 ? y - PANEL_LINE_H : y2 + 18;
  return { height: Math.ceil(lastCentre + 28), labels, brackets };
}

function drawPanel(board: Board, layout: PanelLayout, plotHeight: number, _width: number): void {
  for (const br of layout.brackets) {
    board.poly(
      br.pts.map((p) => ({ x: p.x, y: p.y + plotHeight })),
      { stroke: INK, width: 1.5, id: br.id },
    );
  }
  for (const l of layout.labels) {
    const align = l.align ?? "start";
    const cx = align === "center" ? l.x + l.w / 2 : l.x + l.w / 2; // the block is exactly as wide as its text, so its centre is x + w/2 either way
    board.label(l.text, cx, plotHeight + l.y, {
      size: PANEL_FONT,
      colour: l.colour,
      weight: l.weight ?? 400,
      align: align === "center" ? "center" : "start",
      width: l.w,
      id: l.id,
      claim: false,
      freeStanding: true,
    });
  }
}

// ---- validation -------------------------------------------------------------------------------------------

export function validateLinearMapInput(raw: Record<string, unknown>): void {
  const path = "linear-map";
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  if (raw.matrix === undefined && raw.named === undefined) {
    throw new SpecError(`${path}: give \`matrix: [[a, b], [c, d]]\` or \`named\` ({rotation}, {reflection}, {shear}, {scale} or {projection})`);
  }
  if (raw.matrix !== undefined && raw.named !== undefined) throw new SpecError(`${path}: give either \`matrix\` or \`named\`, not both`);
  if (raw.named !== undefined) v.object(raw.named, `${path}.named`);
  if (raw.show !== undefined) {
    const s = v.object(raw.show, `${path}.show`);
    for (const key of ["grid", "basis", "unitSquare", "eigen"]) v.optionalBoolean(s, key, `${path}.show`);
    for (const key of Object.keys(s)) {
      if (!["grid", "basis", "unitSquare", "eigen"].includes(key)) throw new SpecError(`${path}.show.${key} is not a flag; use grid, basis, unitSquare or eigen`);
    }
  }
  if (raw.shapes !== undefined) {
    v.array(raw, "shapes", path, "shapes").forEach((s, i) => {
      const o = v.object(s, `${path}.shapes[${i}]`);
      v.nonEmptyArray(o, "points", `${path}.shapes[${i}]`, "vertices");
      v.optionalString(o, "label", `${path}.shapes[${i}]`);
    });
  }
  if (raw.points !== undefined) {
    v.array(raw, "points", path, "points").forEach((p, i) => {
      const o = v.object(p, `${path}.points[${i}]`);
      v.requiredString(o, "name", `${path}.points[${i}]`);
    });
  }
  // Arithmetic, geometry and every reference are exercised by building the figure.
  expandLinearMap(raw as unknown as LinearMapInput);
}
