/**
 * number-line -- the "reta real" used to answer an inequality, a domain, or a
 * union/intersection of intervals: a horizontal line with the boundary points
 * marked (filled for included, open for excluded) and the solution picked out
 * in ink, rays to ±∞ carrying an arrow.
 *
 * The input is TEXT -- "x < -1 ou 2 ≤ x < 5", "[-2, 3) ∪ (4, +∞)" -- and
 * everything drawn is found from it: which points are boundaries, whether
 * each is open or closed, and where the line ends. A row that combines two
 * others (`op: "union" | "intersection"`) is never typed by hand either --
 * its interval set is computed from the rows it names, the same discipline
 * ADR 0027 holds `sign-chart` to for a function's roots and signs.
 */

import type { FigureSpec, Point } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { LOCALES, MINUS, formatNumber } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";

// ---- input -----------------------------------------------------------------

export type NumberLineRow =
  | { label?: string; set: string; op?: undefined; of?: undefined }
  | { label: string; op: "union" | "intersection"; of?: string[]; set?: undefined };

export type NumberLineInput = {
  title?: string;
  locale?: Locale;
  /** The variable's name, read in inequality chains and printed by the axis. Default "x". */
  variable?: string;
  /** A single, unlabelled row -- shorthand for `rows: [{ set }]`. */
  set?: string;
  /** Rows, top to bottom. A leaf row states a set in text; a computed row combines earlier rows. */
  rows?: NumberLineRow[];
  /** When false, draw only the axis and row names but leave intervals empty. Default true. */
  answers?: boolean;
};

// ---- palette -----------------------------------------------------------------

const PAPER = "#FCFBF7";
const INK = "#181B21";
const SOFT = "#4E5763";
const RULE = "#9AA3AE";
const LIGHT = "#C7CDD5";
const ACCENT = "#1D4E89";

// ---- bounds: a value, and the exact text it was given or is written as ------

export type Bound = { value: number; exact: string };

export type Interval = { lo: Bound; loIncl: boolean; hi: Bound; hiIncl: boolean };

/** A set of disjoint, non-touching, sorted intervals -- possibly empty (∅). */
export type NLSet = Interval[];

const INF = Infinity;

function bound(value: number, exact: string): Bound {
  return { value, exact };
}

function infBound(negative: boolean): Bound {
  return bound(negative ? -INF : INF, `${negative ? MINUS : "+"}∞`);
}

// ---- parsing a written endpoint ("5/3", "√2", "-1", "2,5") ------------------

const FRACTION = /^([+-]?\d+)\s*\/\s*(\d+)$/;
const INFINITY = /^([+-]?)\s*(?:∞|inf(?:inito)?)$/i;

function parseBound(raw: string, path: string, locale: Locale): Bound {
  const t = raw.trim();
  if (t === "") throw new SpecError(`${path}: an interval bound is empty`);
  const inf = INFINITY.exec(t);
  if (inf !== null) return infBound(inf[1] === "-");

  const frac = FRACTION.exec(t);
  if (frac !== null) {
    const p = Number(frac[1]);
    const q = Number(frac[2]);
    if (q === 0) throw new SpecError(`${path}: "${t}" divides by zero`);
    const value = p / q;
    const negative = value < 0;
    return bound(value, `${negative ? MINUS : ""}${Math.abs(p)}/${q}`);
  }

  const root = /^([+-]?)√\s*(\d+(?:[.,]\d+)?)$/.exec(t) ?? /^([+-]?)raiz\s*\(?\s*(\d+(?:[.,]\d+)?)\)?$/i.exec(t);
  if (root !== null) {
    const n = Number(root[2]!.replace(",", "."));
    const value = (root[1] === "-" ? -1 : 1) * Math.sqrt(n);
    const nText = Number.isInteger(n) ? String(n) : formatNumber(n, locale);
    return bound(value, `${root[1] === "-" ? MINUS : ""}√${nText}`);
  }

  const plain = t.replace(/^\+/, "");
  const normalised = /^-?\d+,\d+$/.test(plain) ? plain.replace(",", ".") : plain;
  if (!/^-?\d+(\.\d+)?$/.test(normalised)) {
    throw new SpecError(`${path}: "${t}" is not a number, a fraction (5/3), √n, or ±∞`);
  }
  const value = Number(normalised);
  return bound(value, formatNumber(value, locale));
}

// ---- parsing one branch of a set (joined by ∪/"ou") into one interval ------

const REL = "(?:<=|>=|≤|≥|<|>)";
const WHOLE_REAL_LINE = /^(r|ℝ|todos\s+os\s+reais|reais)$/i;
const EMPTY_SET = /^(∅|vazio|nenhum)$/i;

type Rel = "<" | "<=" | ">" | ">=";

function normaliseRel(text: string): Rel {
  if (text === "<" || text === ">") return text;
  return text === "≤" ? "<=" : text === "≥" ? ">=" : (text as Rel);
}

/** One `VAR rel NUM` or `NUM rel VAR` half-constraint, as an open-ended interval. */
function parseOneSided(part: string, path: string, variable: string, locale: Locale): Interval {
  const esc = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const varFirst = new RegExp(`^${esc}\\s*(${REL})\\s*(.+)$`, "i").exec(part.trim());
  if (varFirst !== null) {
    const rel = normaliseRel(varFirst[1]!);
    const b = parseBound(varFirst[2]!, path, locale);
    if (rel === "<") return { lo: infBound(true), loIncl: false, hi: b, hiIncl: false };
    if (rel === "<=") return { lo: infBound(true), loIncl: false, hi: b, hiIncl: true };
    if (rel === ">") return { lo: b, loIncl: false, hi: infBound(false), hiIncl: false };
    return { lo: b, loIncl: true, hi: infBound(false), hiIncl: false };
  }
  const numFirst = new RegExp(`^(.+?)\\s*(${REL})\\s*${esc}$`, "i").exec(part.trim());
  if (numFirst !== null) {
    const rel = normaliseRel(numFirst[2]!);
    const b = parseBound(numFirst[1]!, path, locale);
    // "N < x" means x > N; "N > x" means x < N.
    if (rel === "<") return { lo: b, loIncl: false, hi: infBound(false), hiIncl: false };
    if (rel === "<=") return { lo: b, loIncl: true, hi: infBound(false), hiIncl: false };
    if (rel === ">") return { lo: infBound(true), loIncl: false, hi: b, hiIncl: false };
    return { lo: infBound(true), loIncl: false, hi: b, hiIncl: true };
  }
  throw new SpecError(
    `${path}: "${part.trim()}" is not an inequality about ${variable} (expected "${variable} < 5", "5 ≤ ${variable}", ...)`,
  );
}

/** The tighter of two lower bounds (the one further right), and of two upper bounds. */
function tighterLo(a: { b: Bound; incl: boolean }, b: { b: Bound; incl: boolean }): { b: Bound; incl: boolean } {
  if (a.b.value > b.b.value) return a;
  if (b.b.value > a.b.value) return b;
  return { b: a.b, incl: a.incl && b.incl };
}
function tighterHi(a: { b: Bound; incl: boolean }, b: { b: Bound; incl: boolean }): { b: Bound; incl: boolean } {
  if (a.b.value < b.b.value) return a;
  if (b.b.value < a.b.value) return b;
  return { b: a.b, incl: a.incl && b.incl };
}

function intersectTwo(a: Interval, b: Interval): Interval | null {
  const lo = tighterLo({ b: a.lo, incl: a.loIncl }, { b: b.lo, incl: b.loIncl });
  const hi = tighterHi({ b: a.hi, incl: a.hiIncl }, { b: b.hi, incl: b.hiIncl });
  if (lo.b.value > hi.b.value) return null;
  if (lo.b.value === hi.b.value && !(lo.incl && hi.incl)) return null;
  return { lo: lo.b, loIncl: lo.incl, hi: hi.b, hiIncl: hi.incl };
}

function parseBranch(branchRaw: string, path: string, variable: string, locale: Locale): Interval | null {
  const branch = branchRaw.trim();
  if (branch === "") throw new SpecError(`${path}: an empty member between "ou"/"∪"`);
  if (WHOLE_REAL_LINE.test(branch)) return { lo: infBound(true), loIncl: false, hi: infBound(false), hiIncl: false };
  if (EMPTY_SET.test(branch)) return null;

  const bracket = /^([[(\]])(.*)([\])[])$/s.exec(branch);
  if (bracket !== null) {
    const [, openChar, inner, closeChar] = bracket as unknown as [string, string, string, string];
    const sepIdx = inner.includes(";") ? inner.indexOf(";") : inner.indexOf(",");
    if (sepIdx < 0) {
      throw new SpecError(`${path}: interval "${branch}" has no separator between its two bounds (use ";" or ",")`);
    }
    const loStr = inner.slice(0, sepIdx).trim();
    const hiStr = inner.slice(sepIdx + 1).trim();
    const loIncl = openChar === "[";
    const hiIncl = closeChar === "]";
    const lo = parseBound(loStr, path, locale);
    const hi = parseBound(hiStr, path, locale);
    if (lo.value === -INF && loIncl) throw new SpecError(`${path}: "${branch}" closes on −∞, which is never a member`);
    if (hi.value === INF && hiIncl) throw new SpecError(`${path}: "${branch}" closes on +∞, which is never a member`);
    if (!(lo.value < hi.value)) {
      throw new SpecError(`${path}: interval "${branch}" must have its left bound less than its right bound`);
    }
    return { lo, loIncl, hi, hiIncl };
  }

  const chain = new RegExp(
    `^(.+?)\\s*(${REL})\\s*${variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(${REL})\\s*(.+)$`,
    "i",
  ).exec(branch);
  if (chain !== null) {
    const [, loStr, rel1, rel2, hiStr] = chain as unknown as [string, string, string, string, string];
    const relLo = normaliseRel(rel1);
    const relHi = normaliseRel(rel2);
    if (!(relLo === "<" || relLo === "<=") || !(relHi === "<" || relHi === "<=")) {
      throw new SpecError(`${path}: "${branch}" must read as low < ${variable} < high (both relations the same direction)`);
    }
    const lo = parseBound(loStr, path, locale);
    const hi = parseBound(hiStr, path, locale);
    if (!(lo.value < hi.value)) throw new SpecError(`${path}: "${branch}" must have its left bound less than its right bound`);
    return { lo, loIncl: relLo === "<=", hi, hiIncl: relHi === "<=" };
  }

  const parts = branch.split(/\s+e\s+|\s*∩\s*/i).filter((p) => p.trim() !== "");
  if (parts.length === 2) {
    const a = parseOneSided(parts[0]!, path, variable, locale);
    const b = parseOneSided(parts[1]!, path, variable, locale);
    return intersectTwo(a, b);
  }
  if (parts.length === 1) return parseOneSided(parts[0]!, path, variable, locale);
  throw new SpecError(`${path}: "${branch}" is not one interval -- join at most two inequalities with "e"`);
}

/** Sorted, merged: overlapping or touching-and-covered intervals become one. */
export function normaliseUnion(pieces: Interval[]): NLSet {
  const sorted = [...pieces].sort((a, b) => a.lo.value - b.lo.value);
  const out: Interval[] = [];
  for (const next of sorted) {
    const cur = out.at(-1);
    if (cur === undefined) {
      out.push({ ...next });
      continue;
    }
    if (next.lo.value === cur.lo.value) cur.loIncl = cur.loIncl || next.loIncl;
    if (next.lo.value < cur.hi.value || (next.lo.value === cur.hi.value && (cur.hiIncl || next.loIncl))) {
      if (next.hi.value > cur.hi.value) {
        cur.hi = next.hi;
        cur.hiIncl = next.hiIncl;
      } else if (next.hi.value === cur.hi.value) {
        cur.hiIncl = cur.hiIncl || next.hiIncl;
      }
    } else {
      out.push({ ...next });
    }
  }
  return out;
}

/** The union of several sets: every interval from every set, merged. */
export function unionAll(sets: NLSet[]): NLSet {
  return normaliseUnion(sets.flatMap((s) => s));
}

/** The intersection of several sets, reduced pairwise. */
export function intersectAll(sets: NLSet[]): NLSet {
  if (sets.length === 0) return [];
  let acc: NLSet = normaliseUnion(sets[0]!);
  for (const s of sets.slice(1)) {
    const next: Interval[] = [];
    for (const a of acc) for (const b of normaliseUnion(s)) {
      const piece = intersectTwo(a, b);
      if (piece !== null) next.push(piece);
    }
    acc = normaliseUnion(next);
  }
  return acc;
}

/** A set of intervals, from text such as "x < -1 ou 2 ≤ x < 5" or "[-2, 3) ∪ (4, +∞)". */
export function parseNumberLineSet(text: string, path: string, variable: string, locale: Locale): NLSet {
  const branches = text
    .split(/\s*∪\s*|\s+ou\s+/i)
    .map((b) => b.trim())
    .filter((b) => b !== "");
  if (branches.length === 0) throw new SpecError(`${path}: "${text}" has no interval in it`);
  const pieces = branches.map((b) => parseBranch(b, path, variable, locale)).filter((p): p is Interval => p !== null);
  return normaliseUnion(pieces);
}

// ---- geometry ----------------------------------------------------------------

type LaidRow = { label: string; set: NLSet };

const M = 26;
const EDGE = 44;
const ROW_H = 56;
const AXIS_H = 62;
const MIN_TICK_GAP = 14;
const PLOT_UNIT = 70;

function keyOf(v: number): string {
  return v.toFixed(6);
}

export function expandNumberLine(input: NumberLineInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const variable = input.variable ?? "x";
  const answers = input.answers ?? true;

  if (input.set === undefined && (input.rows === undefined || input.rows.length === 0)) {
    throw new SpecError(`number-line: give either "set" or a non-empty "rows"`);
  }
  if (input.set !== undefined && input.rows !== undefined) {
    throw new SpecError(`number-line: give either "set" or "rows", not both`);
  }

  const declaredRows: NumberLineRow[] = input.set !== undefined ? [{ set: input.set }] : input.rows!;
  const labelled = input.rows !== undefined;

  const byLabel = new Map<string, NLSet>();
  const rows: LaidRow[] = [];
  declaredRows.forEach((row, i) => {
    const path = `number-line.rows[${i}]`;
    if (row.op === undefined) {
      const set = parseNumberLineSet(row.set!, path, variable, locale);
      const label = row.label ?? "";
      if (label !== "") {
        if (byLabel.has(label)) throw new SpecError(`${path}.label "${label}" repeats an earlier row's label`);
        byLabel.set(label, set);
      }
      rows.push({ label, set });
      return;
    }
    const known = new Set(byLabel.keys());
    const of = row.of ?? [...byLabel.keys()];
    if (of.length === 0) throw new SpecError(`${path}: an "${row.op}" row has no earlier row to combine`);
    of.forEach((name, j) => v.knownId(name, known, `${path}.of[${j}]`, "row"));
    const sets = of.map((name) => byLabel.get(name)!);
    const set = row.op === "union" ? unionAll(sets) : intersectAll(sets);
    if (byLabel.has(row.label)) throw new SpecError(`${path}.label "${row.label}" repeats an earlier row's label`);
    byLabel.set(row.label, set);
    rows.push({ label: row.label, set });
  });

  // Every finite boundary, from every row, pooled once.
  const critMap = new Map<string, Bound>();
  for (const row of rows) {
    for (const iv of row.set) {
      if (Number.isFinite(iv.lo.value)) critMap.set(keyOf(iv.lo.value), iv.lo);
      if (Number.isFinite(iv.hi.value)) critMap.set(keyOf(iv.hi.value), iv.hi);
    }
  }
  const crits = [...critMap.values()].sort((a, b) => a.value - b.value);

  const domainLo = crits.length > 0 ? crits[0]!.value : -1;
  const domainHi = crits.length > 0 ? crits.at(-1)!.value : 1;
  const span = Math.max(domainHi - domainLo, 2);
  const plotLo = domainLo - span * 0.2 - 0.5;
  const plotHi = domainHi + span * 0.2 + 0.5;

  const probe = new Board(10, 10, PAPER);
  const labelW = labelled ? Math.max(...rows.map((r) => probe.measure(r.label, 14, 0.1, 600)), 10) + 18 : 0;

  const naiveX = (value: number): number => (value - plotLo) / (plotHi - plotLo) * (crits.length * PLOT_UNIT + PLOT_UNIT);
  const critLabels = crits.map((c) => exactLabel(c));
  const critWidths = critLabels.map((t) => probe.measure(t, 13));
  const px: number[] = crits.map((c) => naiveX(c.value));
  for (let i = 1; i < px.length; i += 1) {
    const gap = Math.max(MIN_TICK_GAP, (critWidths[i - 1]! + critWidths[i]!) / 2 + 8);
    if (px[i]! < px[i - 1]! + gap) px[i] = px[i - 1]! + gap;
  }
  const plotStart = M + labelW + EDGE;
  const xOf = new Map<string, number>();
  crits.forEach((c, i) => xOf.set(keyOf(c.value), plotStart + (px[i] ?? 0)));
  const plotEnd = crits.length > 0 ? plotStart + px.at(-1)! : plotStart + PLOT_UNIT * 2;
  const width = Math.ceil(plotEnd + EDGE + Math.max(...critWidths, 0) / 2 + M + 60);
  const leftArrowX = M + labelW + EDGE / 2;
  const rightArrowX = width - M - EDGE / 2;

  const height = Math.ceil(M * 2 + rows.length * ROW_H + AXIS_H);
  const board = new Board(width, height, PAPER);

  const xOfValue = (value: number): number => {
    if (value === -INF) return leftArrowX;
    if (value === INF) return rightArrowX;
    return xOf.get(keyOf(value)) ?? plotStart;
  };

  let top = M;
  rows.forEach((row, ri) => {
    const cy = top + ROW_H / 2;
    if (labelled) {
      board.label(row.label, M + labelW / 2, cy, {
        size: 14,
        weight: 600,
        colour: INK,
        align: "start",
        width: labelW - 16,
        // A row heading ("A", "A ∩ B") names its row, as a table's does:
        // free-standing (ADR 0035).
        freeStanding: true,
      });
    }
    drawLine(board, row.set, cy, leftArrowX, rightArrowX, xOfValue, `row-${ri + 1}`, answers);
    if (!answers) {
      // An empty row is where the reader draws: a tick under each boundary says so.
      crits.forEach((c, i) => {
        const x = xOfValue(c.value);
        board.poly([{ x, y: cy - 5 }, { x, y: cy + 5 }], { stroke: SOFT, width: 1.2, id: `row-${ri + 1}-tick-${i + 1}` });
      });
    }
    top += ROW_H;
  });

  // The shared axis: reference line, tick marks and numbers, both arrows.
  const axisY = top + 24;
  if (!answers) {
    // Dashed guides carry each axis number up to the rows to be completed,
    // broken at every row so they never draw over its tick.
    const stops = [...rows.map((_, ri) => M + ri * ROW_H + ROW_H / 2), axisY];
    crits.forEach((c, i) => {
      const x = xOfValue(c.value);
      for (let k = 0; k + 1 < stops.length; k += 1) {
        board.poly([{ x, y: stops[k]! + 7 }, { x, y: stops[k + 1]! - 7 }], { stroke: LIGHT, width: 1.1, lineStyle: "dashed", id: `guide-${i + 1}-${k + 1}` });
      }
    });
  }
  board.poly([{ x: leftArrowX - 4, y: axisY }, { x: rightArrowX + 4, y: axisY }], { stroke: RULE, width: 1.6 });
  arrowHead(board, { x: rightArrowX + 4, y: axisY }, { x: 1, y: 0 }, RULE);
  arrowHead(board, { x: leftArrowX - 4, y: axisY }, { x: -1, y: 0 }, RULE);
  crits.forEach((c, i) => {
    const x = xOfValue(c.value);
    // Each number names its own tick mark (ADR 0035), so
    // `annotation-nearest-its-owner` holds it under that tick.
    board.poly([{ x, y: axisY - 5 }, { x, y: axisY + 5 }], { stroke: SOFT, width: 1.2, id: `tick-${i + 1}` });
    board.label(critLabels[i]!, x, axisY + 18, { size: 13, colour: SOFT, id: `x-${i + 1}`, annotates: `tick-${i + 1}` });
  });
  // The axis name: free-standing, like every preset's (ADR 0035).
  board.label(variable, rightArrowX + 20, axisY, { size: 15, weight: 600, serif: true, colour: INK, id: "variable", freeStanding: true });

  return parseSpec(board.spec(input.title ?? (labelled ? "reta real" : `reta real: ${variable} ∈ ${input.set}`)));
}

/**
 * One row's line: a thin reference stroke the full width, a thick coloured
 * overlay over every included interval, a filled or open circle at each
 * finite endpoint, and an arrowhead where an interval runs to ±∞.
 * When answers:false, only the reference stroke is drawn (intervals are empty).
 */
function drawLine(
  board: Board,
  set: NLSet,
  y: number,
  leftX: number,
  rightX: number,
  xOfValue: (value: number) => number,
  idPrefix: string,
  answers: boolean = true,
): void {
  // An empty row (answers:false) is drawn as firmly as the axis: it is the
  // reader's line to complete, not a faint backdrop for intervals.
  board.poly([{ x: leftX, y }, { x: rightX, y }], { stroke: answers ? LIGHT : RULE, width: answers ? 1.4 : 1.6 });
  if (answers) {
    set.forEach((iv, i) => {
      const x0 = iv.lo.value === -INF ? leftX : xOfValue(iv.lo.value);
      const x1 = iv.hi.value === INF ? rightX : xOfValue(iv.hi.value);
      board.poly([{ x: x0, y }, { x: x1, y }], { stroke: ACCENT, width: 4.5 });
      if (iv.lo.value === -INF) arrowHead(board, { x: leftX, y }, { x: -1, y: 0 }, ACCENT);
      else endpoint(board, { x: x0, y }, iv.loIncl, `${idPrefix}-lo-${i + 1}`);
      if (iv.hi.value === INF) arrowHead(board, { x: rightX, y }, { x: 1, y: 0 }, ACCENT);
      else endpoint(board, { x: x1, y }, iv.hiIncl, `${idPrefix}-hi-${i + 1}`);
    });
  }
}

function endpoint(board: Board, at: Point, filled: boolean, id: string): void {
  board.circle(at, 5.5, {
    stroke: INK,
    width: 2,
    fill: filled ? INK : PAPER,
    id,
  });
}

function arrowHead(board: Board, at: Point, dir: Point, colour: string): void {
  const len = 10;
  const n = { x: -dir.y, y: dir.x };
  const tip = { x: at.x + dir.x * len, y: at.y + dir.y * len };
  board.poly(
    [
      tip,
      { x: at.x + n.x * len * 0.4, y: at.y + n.y * len * 0.4 },
      { x: at.x - n.x * len * 0.4, y: at.y - n.y * len * 0.4 },
    ],
    { stroke: colour, width: 0.8, fill: colour, close: true },
  );
}

/** A value as a reader writes it: a whole/decimal number via the pt-BR formatter, or the literal exact form it was given ("5/3", "√2"). */
export function exactLabel(b: Bound): string {
  return b.exact;
}

// ---- validation ----------------------------------------------------------------

export function validateNumberLineInput(raw: Record<string, unknown>): void {
  const path = "number-line";
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  v.optionalString(raw, "variable", path);
  if (raw.set !== undefined) v.requiredString(raw, "set", path);
  if (raw.rows !== undefined) {
    v.nonEmptyArray(raw, "rows", path, "rows").forEach((r, i) => {
      const o = v.object(r, `${path}.rows[${i}]`);
      if (o.op !== undefined) {
        v.optionalEnum(o, "op", `${path}.rows[${i}]`, ["union", "intersection"]);
        v.requiredString(o, "label", `${path}.rows[${i}]`);
        if (o.of !== undefined) v.array(o, "of", `${path}.rows[${i}]`, "row labels").forEach((name, j) => {
          if (typeof name !== "string") throw new SpecError(`${path}.rows[${i}].of[${j}] must be a string`);
        });
      } else {
        v.requiredString(o, "set", `${path}.rows[${i}]`);
        v.optionalString(o, "label", `${path}.rows[${i}]`);
      }
    });
  }
  expandNumberLine(raw as unknown as NumberLineInput);
}
