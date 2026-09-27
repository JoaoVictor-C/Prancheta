/**
 * sign-chart -- the "quadro de sinais": where a function, its derivatives or
 * the factors of a product are positive, negative, zero or undefined, and
 * where the function rises and falls.
 *
 * The table is the second representation of the same function a
 * function-graph draws, and the whole point of it is that it cannot
 * disagree with the first: every column boundary is a root or a pole FOUND
 * from the expression, every sign is the sign the expression takes in that
 * interval, and every value printed at a maximum or a minimum is f evaluated
 * there. An author writes the function once; nothing in the table is typed.
 *
 * Roots are found numerically (sign change and bisection, plus touching
 * roots found as near-zero extrema) and then SNAPPED to the exact number
 * they are when there is one -- a small fraction or the square root of an
 * integer -- so the header prints "√3" and "5/3", not "1,732" and "1,667".
 * A sign change across a pole is not a root; it is recognised by the size of
 * the function there and marked as a point outside the domain.
 */

import type { FigureSpec, Point } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { ExprError, compile, derivative } from "../../math/expr.ts";
import { LOCALES, MINUS, formatNumber, snapExact, writeExact } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";
import { typedCoordinate } from "../function-graph/preset.ts";

// ---- input ---------------------------------------------------------------

export type SignRowKind = "f" | "f'" | "f''" | "variation" | "concavity";

export type SignChartInput = {
  title?: string;
  locale?: Locale;
  /** The variable's name, printed in the header. Default "x". */
  variable?: string;
  /** The function's name, used in the default row labels. Default "f". */
  name?: string;
  /** The function, as an expression in the variable. */
  expr: string;
  /** Where to look for roots and poles. Default [-10, 10]. */
  search?: [number, number];
  /** Points outside the domain the search might miss (a removable hole, say). */
  undefinedAt?: number[];
  /** Rows, top to bottom. Default ["f'", "variation"] -- or ["f"] when factors are given. */
  rows?: (SignRowKind | { row: SignRowKind; label?: string })[];
  /** Factors of a product, each its own sign row above the others: the inequality table. */
  factors?: { label: string; expr: string }[];
};

// ---- palette ---------------------------------------------------------------

const PAPER = "#FCFBF7";
const INK = "#181B21";
const SOFT = "#4E5763";
const RULE = "#9AA3AE";
const LIGHT = "#C7CDD5";
const PLUS = "#1D4E89";
const MINUS_COLOUR = "#B3400C";

// ---- roots, poles and exact values ------------------------------------------

type Fn = (x: number) => number;

const MAX_DENOMINATOR = 12;

/** The exact number `r` is, if it is a small fraction or ±√n: a candidate for snapping. */
function exactCandidates(r: number): number[] {
  const out: number[] = [];
  for (let q = 1; q <= MAX_DENOMINATOR; q += 1) out.push(Math.round(r * q) / q);
  const n = Math.round(r * r);
  if (n > 0 && n <= 400) out.push(Math.sign(r) * Math.sqrt(n));
  return out;
}

/** Snap a numerically found root to the exact value it is, if the function agrees. */
function snap(r: number, g: Fn, scale: number): number {
  let best = r;
  let bestGap = Infinity;
  for (const c of exactCandidates(r)) {
    const gap = Math.abs(c - r);
    if (gap > 1e-5 * Math.max(1, Math.abs(r)) || gap >= bestGap) continue;
    const at = g(c);
    if (Number.isFinite(at) && Math.abs(at) <= 1e-6 * scale) {
      best = c;
      bestGap = gap;
    }
  }
  return Math.abs(best) < 1e-12 ? 0 : best;
}

function snapPole(r: number, g: Fn): number {
  for (const c of exactCandidates(r)) {
    if (Math.abs(c - r) <= 1e-5 * Math.max(1, Math.abs(r)) && !Number.isFinite(g(c))) return c;
  }
  return r;
}

type Critical = { x: number; kind: "root" | "pole" };

/**
 * Roots and poles of `g` on [a, b].
 *
 * A sign change is bisected; if the function is small where it converges it
 * is a root, and if it is huge it is a pole (1/x changes sign at 0 without
 * ever being 0). A local extremum of |g| that is essentially zero is a root
 * that touches without crossing ((x − 1)² at 1). A sample that evaluates to
 * nothing at all is a pole or a hole.
 */
export function criticalPoints(g: Fn, a: number, b: number): Critical[] {
  const n = 2000;
  const xs = Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  const ys = xs.map(g);
  const finite = ys.filter(Number.isFinite).map(Math.abs);
  const scale = Math.max(1, ...finite.sort((p, q) => p - q).slice(0, Math.ceil(finite.length * 0.9)));
  const out: Critical[] = [];
  const add = (x: number, kind: Critical["kind"]): void => {
    if (!out.some((c) => Math.abs(c.x - x) < 1e-6 * Math.max(1, Math.abs(x)))) out.push({ x, kind });
  };
  for (let i = 0; i <= n; i += 1) {
    const y = ys[i]!;
    if (!Number.isFinite(y)) {
      add(snapPole(xs[i]!, g), "pole");
      continue;
    }
    if (y === 0) add(snap(xs[i]!, g, scale), "root");
  }
  for (let i = 0; i < n; i += 1) {
    const ya = ys[i]!;
    const yb = ys[i + 1]!;
    if (!Number.isFinite(ya) || !Number.isFinite(yb) || ya === 0 || yb === 0 || ya * yb > 0) continue;
    let lo = xs[i]!;
    let hi = xs[i + 1]!;
    for (let k = 0; k < 80; k += 1) {
      const mid = (lo + hi) / 2;
      const ym = g(mid);
      if (!Number.isFinite(ym)) {
        lo = hi = mid;
        break;
      }
      if (Math.sign(ym) === Math.sign(ya)) lo = mid;
      else hi = mid;
    }
    const x = (lo + hi) / 2;
    const at = g(x);
    if (!Number.isFinite(at) || Math.abs(at) > 1e-3 * scale) add(snapPole(x, g), "pole");
    else add(snap(x, g, scale), "root");
  }
  // Roots that touch the axis without crossing it.
  for (let i = 1; i < n; i += 1) {
    const [y0, y1, y2] = [ys[i - 1]!, ys[i]!, ys[i + 1]!].map(Math.abs) as [number, number, number];
    if (![y0, y1, y2].every(Number.isFinite) || !(y1 <= y0 && y1 <= y2) || y1 === 0) continue;
    let lo = xs[i - 1]!;
    let hi = xs[i + 1]!;
    const gr = (Math.sqrt(5) - 1) / 2;
    for (let k = 0; k < 100; k += 1) {
      const c = hi - gr * (hi - lo);
      const d = lo + gr * (hi - lo);
      if (Math.abs(g(c)) < Math.abs(g(d))) hi = d;
      else lo = c;
    }
    const x = (lo + hi) / 2;
    if (Math.abs(g(x)) <= 1e-7 * scale) add(snap(x, g, scale), "root");
  }
  return out.sort((p, q) => p.x - q.x);
}

/**
 * A value as a reader writes it: 5/3, √3, −√2, 2,5, π/2. The one snapping
 * helper (ADR 0040) at a root finder's precision.
 */
export function exactLabel(value: number, locale: Locale): string {
  return writeExact(snapExact(value, 1e-9), locale);
}

// ---- the build -------------------------------------------------------------

type Row = {
  kind: SignRowKind | "factor";
  label: string;
  g: Fn;
  /** Roots of this row's own function, which get a 0. */
  roots: number[];
};

const M = 20;
const EDGE = 46;
const INTERVAL = 86;
const HEADER = 36;
const SIGN_ROW = 42;
const VARIATION_ROW = 96;

function second(f: Fn): Fn {
  return (x) => {
    const h = 1e-3 * Math.max(1, Math.abs(x));
    return (f(x + h) - 2 * f(x) + f(x - h)) / (h * h);
  };
}

export function expandSignChart(input: SignChartInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const variable = input.variable ?? "x";
  const name = input.name ?? "f";
  const [a, b] = input.search ?? [-10, 10];
  let f: Fn;
  try {
    f = compile(input.expr, variable);
  } catch (error) {
    throw new SpecError(`sign-chart.expr: ${(error as ExprError).message}`);
  }
  const fp: Fn = (x) => (Number.isFinite(f(x)) ? derivative(f, x) : Number.NaN);
  const fpp: Fn = second(f);

  const labelOf = (kind: SignRowKind): string =>
    ({
      f: `${name}(${variable})`,
      "f'": `${name}′(${variable})`,
      "f''": `${name}″(${variable})`,
      variation: `${name}(${variable})`,
      concavity: `concavidade`,
    })[kind];
  // f's own sign; f′ for its sign and for where f rises and falls; f″ for
  // its sign and for concavity.
  const fnOf = (kind: SignRowKind): Fn =>
    ({ f, "f'": fp, variation: fp, "f''": fpp, concavity: fpp })[kind];

  const rows: Row[] = [];
  for (const [i, factor] of (input.factors ?? []).entries()) {
    let g: Fn;
    try {
      g = compile(factor.expr, variable);
    } catch (error) {
      throw new SpecError(`sign-chart.factors[${i}].expr: ${(error as ExprError).message}`);
    }
    rows.push({ kind: "factor", label: factor.label, g, roots: [] });
  }
  const requested = input.rows ?? (input.factors?.length ? ["f"] : ["f'", "variation"]);
  for (const r of requested) {
    const kind = typeof r === "string" ? r : r.row;
    const label = typeof r === "string" ? labelOf(kind) : (r.label ?? labelOf(kind));
    rows.push({ kind, label, g: fnOf(kind), roots: [] });
  }
  for (const [i, row] of rows.entries()) {
    const typed = typedCoordinate(row.label);
    if (typed !== null) throw new SpecError(`sign-chart row ${i} label types the coordinate "${typed}" by hand`);
  }

  // Every boundary, found. Poles of f are poles of every row that derives from it.
  const poles = new Set<number>();
  for (const c of criticalPoints(f, a, b)) if (c.kind === "pole") poles.add(c.x);
  for (const u of input.undefinedAt ?? []) poles.add(u);
  for (const row of rows) {
    for (const c of criticalPoints(row.g, a, b)) {
      if (c.kind === "pole") poles.add(c.x);
      else row.roots.push(c.x);
    }
  }
  const near = (p: number, q: number): boolean => Math.abs(p - q) < 1e-6 * Math.max(1, Math.abs(p));
  for (const row of rows) row.roots = row.roots.filter((r) => ![...poles].some((p) => near(p, r)));
  const xs: { x: number; pole: boolean }[] = [];
  for (const x of [...poles, ...rows.flatMap((r) => r.roots)]) {
    if (!xs.some((c) => near(c.x, x))) xs.push({ x, pole: [...poles].some((p) => near(p, x)) });
  }
  xs.sort((p, q) => p.x - q.x);

  // Geometry.
  const probe = new Board(10, 10, PAPER);
  const labelW = Math.max(...rows.map((r) => probe.measure(r.label, 14)), probe.measure(variable, 15)) + 20;
  const headers = xs.map((c) => exactLabel(c.x, locale));
  const critW = headers.map((h) => Math.max(40, probe.measure(h, 14) + 10));
  const tableX = M + labelW;
  // Column centres: left edge, then interval, critical, interval, ..., right edge.
  const centres: { intervals: number[]; crit: number[]; left: number; right: number } = {
    intervals: [],
    crit: [],
    left: tableX + EDGE / 2,
    right: 0,
  };
  let cursor = tableX + EDGE;
  for (let i = 0; i <= xs.length; i += 1) {
    centres.intervals.push(cursor + INTERVAL / 2);
    cursor += INTERVAL;
    if (i < xs.length) {
      centres.crit.push(cursor + critW[i]! / 2);
      cursor += critW[i]!;
    }
  }
  centres.right = cursor + EDGE / 2;
  const width = Math.ceil(cursor + EDGE + M);
  const heights = rows.map((r) => (r.kind === "variation" ? VARIATION_ROW : SIGN_ROW));
  const height = Math.ceil(M * 2 + HEADER + heights.reduce((s, h) => s + h, 0));
  const board = new Board(width, height, PAPER);
  const right = width - M;

  // Midpoint of each interval, for its sign.
  const bounds = [a, ...xs.map((c) => c.x), b];
  const mids = bounds.slice(0, -1).map((lo, i) => {
    const hi = bounds[i + 1]!;
    return (lo + hi) / 2;
  });

  // Every text in this table is declared free-standing (ADR 0035): a cell
  // is read by its row and its column, not by what it sits beside, so none
  // of the proximity checks applies to it. Said once per label below rather
  // than defaulted, so a label added here later has to say what it is.
  // Header.
  const hy = M + HEADER / 2;
  board.label(variable, M + labelW / 2, hy, { freeStanding: true, size: 15, weight: 600, serif: true, colour: INK });
  board.label(`${MINUS}∞`, centres.left, hy, { freeStanding: true, size: 14, colour: SOFT });
  board.label("+∞", centres.right, hy, { freeStanding: true, size: 14, colour: SOFT });
  headers.forEach((h, i) => board.label(h, centres.crit[i]!, hy, { freeStanding: true, size: 14, weight: 600, colour: INK, id: `x-${i + 1}` }));

  // Frame: rule under the header, the label column's edge, a line between rows.
  board.poly([{ x: M, y: M + HEADER }, { x: right, y: M + HEADER }], { stroke: RULE, width: 1.5 });
  board.poly([{ x: tableX, y: M }, { x: tableX, y: height - M }], { stroke: RULE, width: 1.5 });

  let top = M + HEADER;
  for (const [ri, row] of rows.entries()) {
    const h = heights[ri]!;
    const cy = top + h / 2;
    if (ri > 0) board.poly([{ x: M, y: top }, { x: right, y: top }], { stroke: LIGHT, width: 1 });
    board.label(row.label, M + labelW / 2, cy, { freeStanding: true, size: 14, weight: 600, colour: INK, align: "start", width: labelW - 16 });

    // Each critical column: 0, a double bar, or a thin dashed rule.
    xs.forEach((c, i) => {
      const x = centres.crit[i]!;
      const isRoot = row.roots.some((r) => near(r, c.x));
      if (c.pole) {
        for (const dx of [-2.5, 2.5]) {
          board.poly([{ x: x + dx, y: top + 4 }, { x: x + dx, y: top + h - 4 }], { stroke: INK, width: 1.3 });
        }
      } else if (isRoot && row.kind !== "variation" && row.kind !== "concavity") {
        board.label("0", x, cy, { freeStanding: true, size: 15, weight: 600, colour: INK });
      } else if (row.kind !== "variation") {
        board.poly([{ x, y: top + 4 }, { x, y: top + h - 4 }], { stroke: LIGHT, width: 1, lineStyle: "dashed" });
      }
    });

    if (row.kind === "variation") drawVariation(board, row, f, xs, centres, mids, top, h, locale);
    else {
      mids.forEach((m, i) => {
        const s = Math.sign(row.g(m));
        const text = row.kind === "concavity" ? (s > 0 ? "∪" : "∩") : s > 0 ? "+" : MINUS;
        board.label(text, centres.intervals[i]!, cy, { freeStanding: true,
          size: row.kind === "concavity" ? 18 : 17,
          weight: 700,
          colour: s > 0 ? PLUS : MINUS_COLOUR,
          id: `sign-${ri + 1}-${i + 1}`,
        });
      });
    }
    top += h;
  }

  return parseSpec(board.spec(input.title ?? `quadro de sinais de ${name}`));
}

/**
 * Arrows for where f rises and falls, from the sign of f′ in each interval,
 * and f's value printed at each critical point: at the top for a maximum, at
 * the bottom for a minimum, in the middle where f′ is zero without changing
 * sign. An arrow runs from the level of its left end to the level of its
 * right end, and stops short of any value printed there.
 */
function drawVariation(
  board: Board,
  row: Row,
  f: Fn,
  xs: { x: number; pole: boolean }[],
  centres: { intervals: number[]; crit: number[]; left: number; right: number },
  mids: number[],
  top: number,
  h: number,
  locale: Locale,
): void {
  const up = mids.map((m) => row.g(m) > 0);
  const TOP = top + 17;
  const BOTTOM = top + h - 17;
  const MID = top + h / 2;
  const level: (number | null)[] = [];
  const half: number[] = [];
  xs.forEach((c, i) => {
    if (c.pole) {
      level.push(null);
      half.push(6);
      return;
    }
    const before = up[i]!;
    const after = up[i + 1]!;
    const y = before && !after ? TOP : !before && after ? BOTTOM : MID;
    const value = f(c.x);
    const text = exactLabel(value, locale);
    const block = board.label(text, centres.crit[i]!, y, { freeStanding: true, size: 14, weight: 600, colour: INK, id: `value-${i + 1}` });
    level.push(y);
    half.push(block.width! / 2 + 6);
  });
  mids.forEach((_, i) => {
    const rising = up[i]!;
    const leftX = i === 0 ? centres.left + 10 : centres.crit[i - 1]! + half[i - 1]!;
    const rightX = i === mids.length - 1 ? centres.right - 10 : centres.crit[i]! - half[i]!;
    let y0 = i === 0 ? null : level[i - 1]!;
    let y1 = i === mids.length - 1 ? null : level[i]!;
    y0 ??= rising ? BOTTOM : TOP;
    y1 ??= rising ? TOP : BOTTOM;
    if (Math.abs(y0 - y1) < 1) {
      y0 += rising ? 10 : -10;
      y1 += rising ? -10 : 10;
    }
    arrow(board, { x: leftX, y: y0 }, { x: rightX, y: y1 }, rising ? PLUS : MINUS_COLOUR);
  });
}

function arrow(board: Board, from: Point, to: Point, colour: string): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const u = { x: dx / len, y: dy / len };
  const n = { x: -u.y, y: u.x };
  const head = 9;
  const base = { x: to.x - u.x * head, y: to.y - u.y * head };
  board.poly([from, base], { stroke: colour, width: 2 });
  board.poly(
    [to, { x: base.x + n.x * head * 0.45, y: base.y + n.y * head * 0.45 }, { x: base.x - n.x * head * 0.45, y: base.y - n.y * head * 0.45 }],
    { stroke: colour, width: 0.8, fill: colour, close: true },
  );
}

// ---- validation ------------------------------------------------------------

const KINDS: SignRowKind[] = ["f", "f'", "f''", "variation", "concavity"];

export function validateSignChartInput(raw: Record<string, unknown>): void {
  const path = "sign-chart";
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  v.optionalString(raw, "variable", path);
  v.optionalString(raw, "name", path);
  v.requiredString(raw, "expr", path);
  if (raw.search !== undefined) {
    if (!Array.isArray(raw.search) || raw.search.length !== 2) throw new SpecError(`${path}.search must be [min, max]`);
    const lo = v.finite(raw.search[0], `${path}.search[0]`);
    const hi = v.finite(raw.search[1], `${path}.search[1]`);
    if (!(lo < hi)) throw new SpecError(`${path}.search must have min < max`);
  }
  if (raw.undefinedAt !== undefined) {
    v.array(raw, "undefinedAt", path, "numbers").forEach((x, i) => v.finite(x, `${path}.undefinedAt[${i}]`));
  }
  if (raw.rows !== undefined) {
    v.nonEmptyArray(raw, "rows", path, "rows").forEach((r, i) => {
      const kind = typeof r === "string" ? r : (v.object(r, `${path}.rows[${i}]`).row as unknown);
      if (typeof kind !== "string" || !(KINDS as string[]).includes(kind)) {
        throw new SpecError(`${path}.rows[${i}] must be one of ${KINDS.join(", ")} (or {row, label})`);
      }
      if (typeof r !== "string") v.optionalString(r as Record<string, unknown>, "label", `${path}.rows[${i}]`);
    });
  }
  if (raw.factors !== undefined) {
    v.array(raw, "factors", path, "factors").forEach((fct, i) => {
      const o = v.object(fct, `${path}.factors[${i}]`);
      v.requiredString(o, "label", `${path}.factors[${i}]`);
      v.requiredString(o, "expr", `${path}.factors[${i}]`);
    });
  }
  expandSignChart(raw as unknown as SignChartInput);
}
