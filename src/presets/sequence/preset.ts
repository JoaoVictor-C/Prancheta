/**
 * sequence -- aₙ: discrete terms on a numbered plane, or partial sums Sₙ.
 *
 * A sequence is a function of discrete n (aₙ for n = 1, 2, 3, ...), drawn as
 * filled dots on a gridded Frame with integer n on the horizontal axis and
 * aₙ (or Sₙ) on the vertical axis. Every point is COMPUTED from the
 * expression, never typed. Partial sums Sₙ are computed with `partialSums`
 * from src/math/numeric.ts and drawn as a separate series when requested.
 *
 * The plane is a real gridded `Frame` (ADR 0034): a light lattice, pt-BR
 * ticks through the locale formatter, integer n ticks, and the zero line
 * drawn when the value range actually contains zero. Both axes are drawn as
 * arrowed connectors -- "n" horizontally, "aₙ" / "Sₙ" (or both names, when
 * both series show) vertically -- following the model in
 * src/presets/vectors/preset.ts (a gridded Frame with axes) and
 * src/presets/function-graph/preset.ts (axis names and a legend that
 * searches for free space).
 *
 * A `limit: true` flag draws a dashed limit line for EVERY series shown
 * that converges, each at its OWN computed limit -- terms head to their own
 * limit, partial sums (the series) head to a possibly different one -- each
 * in its series' colour, and each labelled beside the line (never on it,
 * never past the canvas edge), declaring `annotates` the line it names.
 *
 * Input gives the term expression (in variable "n"), the range [n_start,
 * n_end] (inclusive), and what to show: "terms" (aₙ only), "partial-sums"
 * (Sₙ only), or "both" (both series, distinguishable by colour, with a
 * legend that finds its own free space -- never drawn when only one series
 * shows, where the y axis is named instead).
 *
 * Numbers use the pt-BR formatter from src/locale/format.ts. A limit's
 * value is printed exactly when it snaps to a rational, a root or a
 * multiple of π (`snapExact`/`writeExact`), and "≈ 2,718" otherwise.
 */

import type { Connector, FigureSpec, Frame, GridSpec, Point, Scene } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { ExprError, compile } from "../../math/expr.ts";
import { partialSums, limit } from "../../math/numeric.ts";
import type { LimitResult } from "../../math/numeric.ts";
import { LOCALES, formatNumber, snapExact, writeExact } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";
import { tickPlan } from "../../ir/frames.ts";

// ---- input ---------------------------------------------------------------

export type SequenceShowMode = "terms" | "partial-sums" | "both";

export type SequenceInput = {
  title?: string;
  locale?: Locale;
  /** The term expression, compiled with variable "n". */
  term: string;
  /** Range [n_start, n_end], inclusive. Both must be integers >= 1. */
  n: [number, number];
  /** What to show: "terms" (aₙ), "partial-sums" (Sₙ), or "both". Default "terms". */
  show?: SequenceShowMode;
  /** Draw a dashed limit line for every convergent series shown. Default false. */
  limit?: boolean;
};

// ---- palette ---------------------------------------------------------------

const PAPER = "#FCFBF7";
const SOFT = "#4E5763";
const AXIS = "#3F4855";
const LATTICE = "#E5E9F0";
const TERMS_COLOUR = "#1D4E89"; // blue -- the sequence aₙ
const SUMS_COLOUR = "#B3400C"; // rust -- the partial sums Sₙ

// ---- geometry constants (canvas pixels) ----

const MARGIN_LEFT = 60;
const MARGIN_RIGHT = 60;
const MARGIN_TOP = 50;
const MARGIN_BOTTOM = 54;
const ARROW_OVERSHOOT = 16;
const RANGE_PAD = 0.8;
const PLOT_TARGET_PX = 420;
const MIN_UNIT = 22;
const MAX_UNIT = 80;
const DOT_RADIUS = 3;

type Dir = "R" | "L" | "U" | "D";
const DIRS: Record<Dir, Point> = {
  R: { x: 1, y: 0 },
  L: { x: -1, y: 0 },
  U: { x: 0, y: -1 },
  D: { x: 0, y: 1 },
};

/** "=" or "≈": a limit's sign follows whether its printed value is exact. */
function eq(exact: boolean): string {
  return exact ? "=" : "≈";
}

function niceStep(span: number): number {
  const steps = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  for (const s of steps) if (span / s <= 6) return s;
  return steps[steps.length - 1]!;
}

/**
 * The limit of the SERIES (the partial sums Σ term(n), n = n0..∞), not of
 * the terms themselves -- the defect this exists to end drew both at the
 * terms' limit. `term` has no closed form, so the partial sums are summed
 * directly up to a generous cap and the tail is handed to `limit()`
 * exactly as a continuous approach would be, `S(x)` reading off the cached
 * running sum nearest `round(x)`.
 */
function seriesLimit(term: (n: number) => number, n0: number): LimitResult {
  const CAP = 200_000;
  const cache: number[] = [];
  let running = 0;
  for (let k = n0; k < n0 + CAP; k += 1) {
    let t: number;
    try {
      t = term(k);
    } catch {
      break;
    }
    if (!Number.isFinite(t)) break;
    running += t;
    cache.push(running);
  }
  if (cache.length === 0) return { kind: "none", reason: "no terms computed", samples: [] };
  const S = (x: number): number => cache[Math.min(cache.length - 1, Math.max(0, Math.round(x) - n0))]!;
  return limit(S, Infinity, "right");
}

// ---- the build ---------------------------------------------------------------

export function expandSequence(input: SequenceInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const show = input.show ?? "terms";
  const [n_start, n_end] = input.n;

  // Compile the term expression.
  let term: (n: number) => number;
  try {
    term = compile(input.term, "n");
  } catch (error) {
    throw new SpecError(`sequence.term: ${(error as ExprError).message}`);
  }

  // Compute the term values.
  const values: number[] = [];
  const ns: number[] = [];
  for (let k = n_start; k <= n_end; k++) {
    let y: number;
    try {
      y = term(k);
    } catch (error) {
      throw new SpecError(`sequence: term(${k}) threw: ${(error as Error).message}`);
    }
    if (!Number.isFinite(y)) {
      throw new SpecError(`sequence: term(${k}) = ${y} (non-finite). All terms must be finite.`);
    }
    values.push(y);
    ns.push(k);
  }

  // Compute partial sums if needed.
  let partialSumsData: number[] | undefined;
  if (show === "partial-sums" || show === "both") {
    partialSumsData = partialSums(term, n_start, n_end).partialSums;
  }

  // Compute each shown series' own limit, independently (the defect this
  // exists to end drew the partial sums' limit line at the TERMS' limit).
  let termsLimit: { value: number; exact: boolean; text: string } | undefined;
  let sumsLimit: { value: number; exact: boolean; text: string } | undefined;
  if (input.limit) {
    if (show === "terms" || show === "both") {
      // `term` is only ever defined at integer n -- (-1)^n/n is NaN at a
      // fractional x, and `limit()` samples a CONTINUOUS approach to
      // infinity. Rounding to the nearest integer before evaluating is
      // what `seriesLimit` above already does for the same reason.
      const r = limit((x: number) => term(Math.max(n_start, Math.round(x))), Infinity, "right");
      if (r.kind === "finite") {
        const exact = snapExact(r.value, 1e-5);
        termsLimit = { value: r.value, exact: exact.exact, text: writeExact(exact, locale) };
      }
    }
    if (show === "partial-sums" || show === "both") {
      const r = seriesLimit(term, n_start);
      if (r.kind === "finite") {
        const exact = snapExact(r.value, 1e-5);
        sumsLimit = { value: r.value, exact: exact.exact, text: writeExact(exact, locale) };
      }
    }
  }

  // Gather bounds for the frame.
  const yValues: number[] = [];
  if (show === "terms" || show === "both") yValues.push(...values);
  if (show === "partial-sums" || show === "both") yValues.push(...(partialSumsData ?? []));
  if (termsLimit !== undefined) yValues.push(termsLimit.value);
  if (sumsLimit !== undefined) yValues.push(sumsLimit.value);

  if (yValues.length === 0) throw new SpecError("sequence: no values to plot");

  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const ySpan = Math.max(2 * RANGE_PAD, yMax - yMin);
  const yRangeMin = yMin - RANGE_PAD;
  const yRangeMax = yMax + RANGE_PAD;
  const spansZero = yRangeMin <= 0 && yRangeMax >= 0;

  const nSpanUnits = n_end - n_start + 1; // frame units, x = n_start-0.5 .. n_end+0.5
  const ySpanUnits = yRangeMax - yRangeMin;
  // A sequence plot is not a geometric figure whose angles must survive --
  // nothing here is measured diagonally -- so x and y each get their OWN
  // scale. A wide n range (many terms) and a narrow value range (a series
  // that has nearly converged) are common together, and forcing one square
  // unit on both squeezed every dot, its limit line and that line's label
  // into a strip a few px tall, leaving no room a label search could ever
  // find clear.
  const xUnit = Math.min(MAX_UNIT, Math.max(MIN_UNIT, PLOT_TARGET_PX / nSpanUnits));
  const yUnit = Math.min(MAX_UNIT, Math.max(MIN_UNIT, PLOT_TARGET_PX / Math.max(ySpanUnits, ySpan)));

  // "both" plots two series, up to two limit lines and a legend into the
  // same small plane -- often too crowded for a 2-row legend to find any
  // clear spot at all. A dedicated strip above the plot guarantees one
  // exists, exactly as free of data as a margin, and the legend search
  // below still finds its own spot WITHIN it rather than taking a fixed
  // coordinate.
  const legendGutter = show === "both" ? 34 : 0;
  const marginTop = MARGIN_TOP + legendGutter;

  const plotWidth = Math.ceil(MARGIN_LEFT + MARGIN_RIGHT + nSpanUnits * xUnit);
  const plotHeight = Math.ceil(marginTop + MARGIN_BOTTOM + ySpanUnits * yUnit);
  const width = plotWidth;
  const height = plotHeight;

  const board = new Board(width, height, PAPER);

  const frame: Frame & { origin: Point } = {
    id: "plane",
    origin: { x: MARGIN_LEFT - (n_start - 0.5) * xUnit, y: marginTop + yRangeMax * yUnit },
    xUnit,
    yUnit,
  };

  const at = (x: number, y: number): Point => ({
    x: frame.origin.x + x * xUnit,
    y: frame.origin.y - y * yUnit,
  });

  const yStep = niceStep(ySpanUnits);
  const grid: GridSpec = {
    x: { from: n_start - 0.5, to: n_end + 0.5, step: 1, origin: n_start },
    y: { from: yRangeMin, to: yRangeMax, step: yStep, origin: 0 },
    // Both axes are hand-drawn below, as arrowed connectors -- the core
    // grid's own zero lines would otherwise duplicate them. The lattice and
    // its pt-BR ticks (ADR 0034) still come from the core grid.
    axes: false,
    labels: true,
    locale,
    stroke: LATTICE,
  };
  frame.grid = grid;
  board.frames.push(frame);

  // Reserve the tick label spots (their first choice, per `tickPlan`) so
  // nothing placed below competes with a number for the same spot.
  for (const t of tickPlan(frame, grid)) {
    const b = t.spots[0]!.box;
    board.reserve(b.x + b.width / 2, b.y + b.height / 2, b.width, b.height);
  }

  // ---- axes: an n axis and a y axis, both arrowed and named ---------------

  const yAxisX = at(n_start - 0.5, 0).x;
  const nAxisY = at(0, spansZero ? 0 : yRangeMin).y;
  const yAxisTopY = at(0, yRangeMax).y - ARROW_OVERSHOOT;
  const yAxisBottomY = at(0, yRangeMin).y;
  const nAxisLeftX = yAxisX;
  const nAxisRightX = at(n_end + 0.5, 0).x + ARROW_OVERSHOOT;

  const connectors: Connector[] = [];
  const axisArrow = (id: string, from: Point, to: Point): void => {
    connectors.push({ id, from, to, arrow: "end", stroke: AXIS, strokeWidth: 1.8 });
    board.trace([from, to], AXIS, 1.8, id);
  };
  axisArrow("plane-axis-y", { x: yAxisX, y: yAxisBottomY }, { x: yAxisX, y: yAxisTopY });
  axisArrow("plane-axis-x", { x: nAxisLeftX, y: nAxisY }, { x: nAxisRightX, y: nAxisY });

  const axisNameOpts = { size: 14, weight: 600, colour: SOFT, serif: true, freeStanding: true as const };
  board.place("n", nAxisRightX - 6, nAxisY - 4, [DIRS.U, DIRS.R, DIRS.D], axisNameOpts);
  const yAxisName = show === "terms" ? "aₙ" : show === "partial-sums" ? "Sₙ" : "aₙ, Sₙ";
  board.place(yAxisName, yAxisX + 6, yAxisTopY + 6, [DIRS.R, DIRS.U, DIRS.D], axisNameOpts);

  // ---- the dots: discrete, never joined -------------------------------

  // Computed before the limit lines below, which need every dot's canvas
  // position to keep their labels clear of them (`annotation-nearest-its-
  // owner` measures actual distance, not merely visible overlap).
  const termsPoints: Point[] = (show === "terms" || show === "both") ? ns.map((n, i) => at(n, values[i]!)) : [];
  const sumsPoints: Point[] = (show === "partial-sums" || show === "both") ? ns.map((n, i) => at(n, partialSumsData![i]!)) : [];
  for (let i = 0; i < termsPoints.length; i++) {
    board.circle(termsPoints[i]!, DOT_RADIUS, { stroke: TERMS_COLOUR, fill: TERMS_COLOUR, width: 1, id: `terms-${ns[i]}` });
  }
  for (let i = 0; i < sumsPoints.length; i++) {
    board.circle(sumsPoints[i]!, DOT_RADIUS, { stroke: SUMS_COLOUR, fill: SUMS_COLOUR, width: 1, id: `sums-${ns[i]}` });
  }
  const allDots = [...termsPoints, ...sumsPoints];

  // ---- limit lines: one per series shown, each at its OWN limit -----------

  // Every limit line shown is drawn -- and so registered as ink -- BEFORE
  // any of their labels is searched for a spot. Searching label-by-label as
  // each line was drawn let an earlier label's search run before a later
  // line existed to be seen, and it landed straight on top of that line.
  type LimitLine = { id: string; symbol: string; colour: string; p1: Point; p2: Point; l: { value: number; exact: boolean; text: string } };
  const limitLines: LimitLine[] = [];
  if (termsLimit !== undefined) {
    limitLines.push({ id: "limit-line-terms", symbol: "aₙ", colour: TERMS_COLOUR, p1: at(n_start - 0.5, termsLimit.value), p2: at(n_end + 0.5, termsLimit.value), l: termsLimit });
  }
  if (sumsLimit !== undefined) {
    limitLines.push({ id: "limit-line-sums", symbol: "Sₙ", colour: SUMS_COLOUR, p1: at(n_start - 0.5, sumsLimit.value), p2: at(n_end + 0.5, sumsLimit.value), l: sumsLimit });
  }
  for (const line of limitLines) {
    board.poly([line.p1, line.p2], { stroke: line.colour, width: 1.4, lineStyle: "dashed", id: line.id });
  }
  // Beside its line, never on it and never nearer to anything else: the
  // exact rule `annotation-nearest-its-owner` checks (distance to the
  // label's own line's nearest point, against distance to every dot, the
  // axis and the other limit line) is evaluated directly here, growing the
  // offset from the line until a spot clears all of them -- rather than a
  // generic ink search that cannot tell "not overlapping" from "not
  // nearest". A convergent series' dots sit closer and closer to their own
  // limit line as n grows, so nothing short of this rule is safe.
  const placeBesideLine = (text: string, colour: string, lineId: string, p1: Point, p2: Point, aways: Dir[], otherY: number | undefined, dots: Point[]): void => {
    const o = { size: 12, weight: 600, colour, annotates: lineId };
    const { w, h } = board.extent(text, o);
    const lineY = p1.y;
    const axisX = p1.x;
    const margin = 3;
    let chosen: { x: number; y: number } | null = null;
    outer: for (const away of aways) {
      const dy = away === "U" ? -1 : 1;
      for (let step = 0; step < 40; step += 1) {
        const dOwn = h / 2 + 6 + step * 4;
        const y = lineY + dy * dOwn;
        if (y - h / 2 < 10 || y + h / 2 > board.H - 10) break;
        for (let x = p1.x + w / 2 + 6; x <= p2.x - w / 2 - 6; x += 6) {
          if (x - w / 2 < 16 || x + w / 2 > board.W - 16) continue;
          if (Math.abs(x - axisX) <= dOwn + margin) continue;
          if (otherY !== undefined && Math.abs(y - otherY) <= dOwn + margin) continue;
          if (dots.some((d) => Math.hypot(x - d.x, y - d.y) <= dOwn + margin)) continue;
          const b = board.box(x, y, w, h);
          if (board.taken.some((t) => board.hits(b, t))) continue;
          chosen = { x, y };
          break outer;
        }
      }
    }
    const dy0 = aways[0] === "U" ? -1 : 1;
    const at2 = chosen ?? { x: (p1.x + p2.x) / 2, y: lineY + dy0 * (h / 2 + 6) };
    board.label(text, at2.x, at2.y, o);
  };
  for (const line of limitLines) {
    const text = `lim ${line.symbol} ${eq(line.l.exact)} ${line.l.text}`;
    const other = limitLines.find((o) => o !== line);
    // Search only AWAY from the other line shown, when there is one: moving
    // away never approaches it, so its distance only grows. With no other
    // line to avoid, try both sides -- a series need not have more room on
    // one than the other.
    const aways: Dir[] = other === undefined ? ["D", "U"] : [other.p2.y > line.p2.y ? "U" : "D"];
    placeBesideLine(text, line.colour, line.id, line.p1, line.p2, aways, other?.p2.y, allDots);
  }

  // ---- legend: only when both series share the plane, searched for free
  // space like function-graph's (never a fixed coordinate, never on data) --

  if (show === "both") {
    const rows: { text: string; colour: string }[] = [
      { text: "aₙ", colour: TERMS_COLOUR },
      { text: "Sₙ", colour: SUMS_COLOUR },
    ];
    const size = 13;
    const rowH = 22;
    const widths = rows.map((r) => board.measure(r.text, size));
    const swatchW = 20;
    const W = swatchW + 10 + Math.max(...widths);
    const H = (rows.length - 1) * rowH + Math.ceil(size * 1.45 + 3);
    // y0 reaches up into the reserved legend gutter above the plot, not
    // just the plotted area -- the guaranteed-clear strip a crowded "both"
    // plane needs (see `legendGutter` above).
    const plot = { x0: MARGIN_LEFT, x1: width - MARGIN_RIGHT, y0: 8, y1: height - MARGIN_BOTTOM };
    const inset = 8;
    const score = (x: number, y: number): number => {
      const box = board.box(x + W / 2, y - rowH / 2 + H / 2 + 1, W + 8, H + 8);
      const ink = board.inkThrough(box, 0);
      const labels = board.taken.filter((t) => board.hits(box, t, 0)).length;
      return ink + labels * 3;
    };
    const corners: Point[] = [
      { x: plot.x1 - inset - W, y: plot.y0 + inset + rowH / 2 },
      { x: plot.x0 + inset, y: plot.y0 + inset + rowH / 2 },
      { x: plot.x1 - inset - W, y: plot.y1 - inset - H + rowH / 2 },
      { x: plot.x0 + inset, y: plot.y1 - inset - H + rowH / 2 },
    ];
    const candidates: { x: number; y: number; rank: number }[] = [];
    for (let x = plot.x0 + inset; x + W <= plot.x1 - inset; x += 6) {
      for (let y = plot.y0 + inset + rowH / 2; y + H - rowH / 2 <= plot.y1 - inset; y += 6) {
        const rank = Math.min(...corners.map((c) => Math.hypot(c.x - x, c.y - y)));
        candidates.push({ x, y, rank });
      }
    }
    candidates.sort((p, q) => p.rank - q.rank);
    let best: { x: number; y: number; n: number } | null = null;
    for (const cand of candidates) {
      const n = score(cand.x, cand.y);
      if (best === null || n < best.n) best = { x: cand.x, y: cand.y, n };
      if (n === 0) break;
    }
    const origin = best ?? corners[0]!;
    rows.forEach((row, i) => {
      const yy = origin.y + i * rowH;
      const place = { x: origin.x + swatchW / 2, y: yy };
      board.circle(place, DOT_RADIUS, { stroke: row.colour, fill: row.colour, width: 1, id: `legend-swatch-${i + 1}` });
      board.label(row.text, origin.x + swatchW + 6 + widths[i]! / 2, yy, {
        size,
        weight: 600,
        colour: row.colour,
        width: widths[i]!,
        align: "start",
        id: `legend-${i + 1}`,
        // A legend row names the place of its own swatch (ADR 0028/0035).
        annotatesPlace: place,
      });
    });
  }

  const spec = board.spec(input.title ?? "sequência");
  const scene = spec.root as Scene;
  scene.connectors = connectors;
  return parseSpec(spec);
}

// ---- validation ------------------------------------------------------------

export function validateSequenceInput(raw: Record<string, unknown>): void {
  const path = "sequence";
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  v.requiredString(raw, "term", path);

  const n = raw.n;
  if (!Array.isArray(n) || n.length !== 2) {
    throw new SpecError(`${path}.n must be [start, end]`);
  }
  const n_start = v.finite(n[0], `${path}.n[0]`);
  const n_end = v.finite(n[1], `${path}.n[1]`);
  if (!Number.isInteger(n_start) || n_start < 1) {
    throw new SpecError(`${path}.n[0] must be an integer >= 1, got ${n_start}`);
  }
  if (!Number.isInteger(n_end) || n_end < n_start) {
    throw new SpecError(`${path}.n[1] must be an integer >= n[0], got ${n_end}`);
  }
  if (n_end - n_start >= 60) {
    throw new SpecError(`${path}: range is ${n_end - n_start + 1} terms, maximum is 60`);
  }

  if (raw.show !== undefined) {
    v.optionalEnum(raw, "show", path, ["terms", "partial-sums", "both"]);
  }
  if (raw.limit !== undefined && typeof raw.limit !== "boolean") {
    throw new SpecError(`${path}.limit must be boolean`);
  }

  // Perform the actual computation to validate arithmetic.
  expandSequence(raw as unknown as SequenceInput);
}
