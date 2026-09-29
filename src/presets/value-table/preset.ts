/**
 * value-table -- the "tabela de valores": a table of x values (one row) and
 * function values, one row per function. Input gives the expressions; every
 * cell is COMPUTED from them. No author types a function value.
 *
 * The table is the second representation used in Cálculo 1 exercises: the
 * function-graph shows shape, the value-table prints the numeric values at
 * specified points. A sign-chart shows where the function is positive or zero;
 * a value-table shows what it IS at those points.
 *
 * Every f(x) cell is computed by compiling the expression with `compile` from
 * src/math/expr.ts (the same way sign-chart does). Numbers print with the
 * pt-BR formatter from src/locale/format.ts (decimal comma, fractions like 17/3).
 * A value where the function is undefined (non-finite) prints "∄" (symbol for
 * "does not exist").
 *
 * The table reuses sign-chart's table-drawing style: palette, cell sizes, text.
 * Orientation can be "rows" (functions in rows, x values in columns, the default)
 * or "columns" (functions in columns, x values in rows).
 *
 * A SECOND mode (`limit`, ADR 0039) builds the "tabela de valores para
 * estimar um limite" a Cálculo 1 exercise asks the student to complete: x
 * approaching `at` in decimal steps (0,9; 0,99; 0,999; 0,9999 -- the exact
 * schedule `numeric.ts`'s `limit()` samples with `{schedule: "decimal"}`),
 * f(x) computed at each, and a conclusion computed from the SAME samples
 * that were printed -- never a second, independently-typed verdict.
 */

import type { FigureSpec } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { ExprError, compile } from "../../math/expr.ts";
import { decimalUnit, limit } from "../../math/numeric.ts";
import type { LimitResult, LimitSide } from "../../math/numeric.ts";
import { LOCALES, MINUS, formatNumber, snapExact, writeExact } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";

// ---- input ---------------------------------------------------------------

export type ValueTableOrientation = "rows" | "columns";

/** The "tabela de valores para estimar um limite" mode: see ADR 0039. */
export type ValueTableLimitInput = {
  /** The function's expression, in the same language as function-graph/sign-chart. */
  expr: string;
  /** How the function is named in the row label. Default "f". */
  name?: string;
  /** Where x approaches: a finite number, or "inf"/"-inf" for ±infinity. */
  at: number | "inf" | "-inf";
  /**
   * Which side(s) to approach from. Default "both" for a finite `at`; for
   * an infinite `at`, the direction the sign already implies ("right" for
   * "inf", "left" for "-inf") -- matching `numeric.ts`'s own convention that
   * for an infinite `a`, `side` alone picks the direction of travel.
   */
  side?: LimitSide;
  /**
   * Decimal steps per side: x = at ± 10^-1 .. 10^-count (scaled when |at| is
   * large -- see `decimalUnit` in numeric.ts), or 10^1..10^count toward
   * infinity. Default 4, the classic four-row textbook table.
   */
  count?: number;
};

export type ValueTableInput = {
  title?: string;
  locale?: Locale;
  /** The variable's name, printed in the header. Default "x". */
  variable?: string;
  /** The x values (one per column when orientation="rows", one per row when "columns"). Values mode only. */
  xs?: number[];
  /** The functions: each { name, expr }. Values mode only. */
  functions?: { name: string; expr: string }[];
  /** Table layout: "rows" (default) = functions in rows, "columns" = functions in columns. Values mode only. */
  orientation?: ValueTableOrientation;
  /** Limit-table mode (ADR 0039). Mutually exclusive with `xs`/`functions`. */
  limit?: ValueTableLimitInput;
  /** When false, draw the table frame and headers with INPUT cells but leave computed cells empty. Default true. */
  answers?: boolean;
};

/** The shape `expandValuesTable` actually needs: `xs` and `functions` present. */
type ValuesTableInput = ValueTableInput & { xs: number[]; functions: { name: string; expr: string }[] };

// ---- palette ---------------------------------------------------------------

const PAPER = "#FCFBF7";
const INK = "#181B21";
const SOFT = "#4E5763";
const RULE = "#9AA3AE";
const LIGHT = "#C7CDD5";
const ACCENT = "#1D4E89";

// ---- the build ---------------------------------------------------------------

const M = 20;
const EDGE = 8;
const INTERVAL = 5;
const HEADER = 36;
const CELL_ROW = 42;

export function expandValueTable(input: ValueTableInput): FigureSpec {
  if (input.limit !== undefined) return expandLimitTable(input, input.limit, input.answers ?? true);
  if (input.xs === undefined || input.functions === undefined) {
    throw new SpecError(
      `value-table: without "limit", both "xs" and "functions" are required (a values table needs the points ` +
        `to evaluate and the functions to evaluate them with).`,
    );
  }
  return expandValuesTable(input as ValuesTableInput);
}

function expandValuesTable(input: ValuesTableInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const variable = input.variable ?? "x";
  const xs = input.xs;
  const functions = input.functions;
  const orientation = input.orientation ?? "rows";
  const answers = input.answers ?? true;

  // Compile each function expression.
  const compiled: Array<{ name: string; fn: (x: number) => number }> = [];
  for (const [i, func] of functions.entries()) {
    let fn: (x: number) => number;
    try {
      fn = compile(func.expr, variable);
    } catch (error) {
      throw new SpecError(`value-table.functions[${i}].expr: ${(error as ExprError).message}`);
    }
    compiled.push({ name: func.name, fn });
  }

  // Geometry: measure text to determine column widths.
  const probe = new Board(10, 10, PAPER);
  const functionLabels = compiled.map((f) => `${f.name}(${variable})`);
  const labelW = Math.max(...functionLabels.map((label) => probe.measure(label, 14)), probe.measure(variable, 15)) + 20;

  // Every cell's text, computed before any width is chosen: a column is as
  // wide as the widest thing in it, header or value. Sizing from the header
  // alone let f(3,75) = 45,234 run into its neighbour.
  const xLabels = xs.map((x) => formatNumber(x, locale));
  const cells = compiled.map((func) =>
    xs.map((x) => {
      const value = func.fn(x);
      return Number.isFinite(value) ? formatNumber(value, locale) : "∄";
    }),
  );
  const critW = xLabels.map((h, i) =>
    Math.max(40, ...[h, ...cells.map((row) => row[i]!)].map((text) => probe.measure(text, 14) + 24)),
  );

  const tableX = M + labelW;

  // Column centres: left edge, then interval, x-value, interval, ..., right edge.
  const centres: { intervals: number[]; xvals: number[]; left: number; right: number } = {
    intervals: [],
    xvals: [],
    left: tableX + EDGE / 2,
    right: 0,
  };
  let cursor = tableX + EDGE;
  for (let i = 0; i < xs.length; i += 1) {
    centres.intervals.push(cursor + INTERVAL / 2);
    cursor += INTERVAL;
    centres.xvals.push(cursor + critW[i]! / 2);
    cursor += critW[i]!;
  }
  centres.right = cursor + EDGE / 2;

  // Table dimensions.
  const width = Math.ceil(cursor + EDGE + M);
  const height = Math.ceil(M * 2 + HEADER + compiled.length * CELL_ROW);
  const board = new Board(width, height, PAPER);
  const right = width - M;

  // Every text in this table is declared free-standing (ADR 0035): a cell
  // is read by its row and its column, not by what it sits beside, so none
  // of the proximity checks applies to it. Said once per label below rather
  // than defaulted, so a label added here later has to say what it is.
  // Header row: variable name on the left, x values across the top.
  const hy = M + HEADER / 2;
  board.label(variable, M + labelW / 2, hy, { freeStanding: true, size: 15, weight: 600, serif: true, colour: INK });
  xLabels.forEach((h, i) => board.label(h, centres.xvals[i]!, hy, { freeStanding: true, size: 14, weight: 600, colour: INK }));

  // Frame: rule under the header, vertical line for label column.
  board.poly([{ x: M, y: M + HEADER }, { x: right, y: M + HEADER }], { stroke: RULE, width: 1.5 });
  board.poly([{ x: tableX, y: M }, { x: tableX, y: height - M }], { stroke: RULE, width: 1.5 });

  // Rows: one per function.
  let top = M + HEADER;
  for (const [fi, func] of compiled.entries()) {
    const cy = top + CELL_ROW / 2;

    // Function name (label).
    const funcLabel = functionLabels[fi]!;
    board.label(funcLabel, M + labelW / 2, cy, { freeStanding: true,
      size: 14,
      weight: 600,
      colour: INK,
      align: "start",
      width: labelW - 16,
    });

    // Separator line between rows (but not before the first).
    if (fi > 0) board.poly([{ x: M, y: top }, { x: right, y: top }], { stroke: LIGHT, width: 1 });

    // Value cells: one per x value. When answers:false, draw empty cells (same size, no text).
    for (let xi = 0; xi < xs.length; xi += 1) {
      if (answers) {
        board.label(cells[fi]![xi]!, centres.xvals[xi]!, cy, { freeStanding: true,
          size: 14,
          weight: 600,
          colour: INK,
          id: `cell-${fi}-${xi}`,
        });
      } else {
        // Draw empty cell by placing a transparent/invisible placeholder to keep the geometry the same
        board.label("", centres.xvals[xi]!, cy, { freeStanding: true,
          size: 14,
          weight: 600,
          colour: INK,
          id: `cell-${fi}-${xi}`,
        });
      }
    }

    top += CELL_ROW;
  }

  return parseSpec(board.spec(input.title ?? "tabela de valores"));
}

// ---- limit-table mode (ADR 0039) ------------------------------------------

const ARROW_ROW = 26;
// A label's own box is `lines * fontSize * 1.45 + 3` tall (Board.lineBox);
// at size 14 that's ~23.3px, so consecutive caption lines need more than
// that between their centres or their boxes overlap (`boxes-do-not-overlap`).
const CAPTION_LINE = 28;
const CAPTION_GAP = 14;
const SUP_MINUS = "⁻";
const SUP_PLUS = "⁺";

/** How close a limit's numeric value must be to a candidate to snap to it. Looser than
 * `formatNumber`'s own tolerance because a decimal-schedule sample is a coarser estimate. */
const SNAP_TOLERANCE = 1e-4;

/** `value` written exactly (a small fraction, ±√n, kπ/q) if it is close enough to be one, else null. The
 * one snapping helper (ADR 0040), at this caller's tolerance. */
function snapExactText(value: number, locale: Locale): string | null {
  const e = snapExact(value, SNAP_TOLERANCE);
  return e.exact ? writeExact(e, locale) : null;
}

/**
 * A finite limit's value, written the way a reader would: exact when the
 * numeric value is close enough to a small fraction or root (the same
 * discipline `sign-chart`'s `exactLabel` applies to a snapped root), a
 * formatted decimal with "≈" otherwise.
 */
function limitValueText(value: number, locale: Locale): string {
  const snapped = snapExactText(value, locale);
  return snapped ?? `≈ ${formatNumber(value, locale)}`;
}

/** A verdict, printed: an exact or "≈" value, "+∞"/"−∞", or "não existe"/"does not exist". */
function verdictText(result: LimitResult, locale: Locale): string {
  if (result.kind === "finite") return limitValueText(result.value, locale);
  if (result.kind === "infinite") return result.sign > 0 ? "+∞" : `${MINUS}∞`;
  return locale === "pt-BR" ? "não existe" : "does not exist";
}

function cellText(value: number, locale: Locale): string {
  return Number.isFinite(value) ? formatNumber(value, locale) : "∄";
}

/**
 * A sampled value, to at most `decimals` places with trailing zeros dropped.
 * The default shortest form rounds to three places, which printed
 * f(0,9999) = 1,9999 as "2" -- the one column that shows the approach
 * showing the limit instead. A sample is printed to as many places as its
 * own x was stepped by, so 1,9999 stays 1,9999 and −1 stays −1.
 */
function sampleText(value: number, decimals: number, locale: Locale): string {
  if (!Number.isFinite(value)) return "∄";
  const rounded = Number(value.toFixed(decimals));
  let d = decimals;
  while (d > 0 && Number(rounded.toFixed(d - 1)) === rounded) d -= 1;
  return formatNumber(rounded, locale, { decimals: d });
}

/** "lhs = value", or "lhs ≈ value" when the value is only approximate -- never "= ≈". */
function relation(lhs: string, value: string): string {
  return value.startsWith("≈") ? `${lhs} ${value}` : `${lhs} = ${value}`;
}

type LimitCol = { xText: string; valueText: string; group: "left" | "a" | "right" };

function expandLimitTable(input: ValueTableInput, li: ValueTableLimitInput, answers: boolean): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const variable = input.variable ?? "x";
  const name = li.name ?? "f";

  const at: number = li.at === "inf" ? Infinity : li.at === "-inf" ? -Infinity : li.at;
  const side: LimitSide = li.side ?? (at === Infinity ? "right" : at === -Infinity ? "left" : "both");
  const count = li.count ?? 4;

  let fn: (x: number) => number;
  try {
    fn = compile(li.expr, variable);
  } catch (error) {
    throw new SpecError(`value-table.limit.expr: ${(error as ExprError).message}`);
  }

  const wantLeft = side === "left" || side === "both";
  const wantRight = side === "right" || side === "both";

  let leftResult: LimitResult | undefined;
  let rightResult: LimitResult | undefined;
  let combined: LimitResult;
  try {
    if (wantLeft) leftResult = limit(fn, at, "left", { schedule: "decimal", count });
    if (wantRight) rightResult = limit(fn, at, "right", { schedule: "decimal", count });
    combined = side === "both" ? limit(fn, at, "both", { schedule: "decimal", count }) : (wantLeft ? leftResult! : rightResult!);
  } catch (error) {
    throw new SpecError(`value-table.limit: ${(error as Error).message}`);
  }

  const finiteAt = Number.isFinite(at);

  // Header labels for each arm. For an infinite `at`, the direction is
  // stated outright ("x → +∞") rather than with a one-sided superscript,
  // because there is no "other side" of infinity to distinguish it from.
  const atLabel = finiteAt ? formatNumber(at, locale) : "";
  const leftHeader = finiteAt ? `${variable} → ${atLabel}${SUP_MINUS}` : `${variable} → ${MINUS}∞`;
  const rightHeader = finiteAt ? `${variable} → ${atLabel}${SUP_PLUS}` : `${variable} → +∞`;

  // x labels for the decimal schedule are printed at the EXACT decimal width
  // the schedule stepped by (10^-k of `decimalUnit(at)`, k = the sample's own
  // 1-based index) -- never through `formatNumber`'s default "shortest
  // honest form", which would round 0,9999 to 1 and print the fourth
  // decimal step as indistinguishable from `a` itself. `decimalUnit` is the
  // same helper `numeric.ts` scaled the step by, so the two cannot disagree.
  const unitOrder = finiteAt ? Math.round(Math.log10(decimalUnit(at))) : 0;
  // For an infinite `at` the schedule is 10^k -- always a whole number, so
  // plain formatting is exactly right and forcing decimals would be wrong.
  const scheduleXText = (x: number, k: number): string =>
    finiteAt ? formatNumber(x, locale, { decimals: Math.max(0, k - unitOrder) }) : formatNumber(x, locale);

  // At least three places, and as many as the x step itself has, so the
  // value column can show the approach the x column is making.
  const sampleDecimals = (k: number): number => (finiteAt ? Math.max(3, k - unitOrder) : 3);

  // Columns, left to right: the left arm (far from `a` to near it, as
  // sampled), then the column for `a` itself if it is a finite point, then
  // the right arm (as sampled -- textbooks list it far-to-near too, which
  // is why it reads as a mirror of the left arm rather than continuing the
  // same monotone direction).
  const columns: LimitCol[] = [];
  if (leftResult !== undefined) {
    leftResult.samples.forEach((s, i) =>
      columns.push({ xText: scheduleXText(s.x, i + 1), valueText: sampleText(s.y, sampleDecimals(i + 1), locale), group: "left" }),
    );
  }
  if (finiteAt) {
    columns.push({ xText: formatNumber(at, locale), valueText: cellText(fn(at), locale), group: "a" });
  }
  if (rightResult !== undefined) {
    rightResult.samples.forEach((s, i) =>
      columns.push({ xText: scheduleXText(s.x, i + 1), valueText: sampleText(s.y, sampleDecimals(i + 1), locale), group: "right" }),
    );
  }
  if (columns.length === 0) {
    throw new SpecError(`value-table.limit: side ${JSON.stringify(side)} produced no columns to draw.`);
  }

  // Caption: computed from the SAME samples/results just tabulated above --
  // never a second, independently-typed verdict (ADR 0039's whole point).
  // Every line says what x approaches: "x → 1: lim f(x) = 2", the same
  // "x → 1⁻" form the column headers use, so a line cannot be read as a
  // limit somewhere else.
  const lim = `lim ${name}(${variable})`;
  const approach = finiteAt ? `${variable} → ${atLabel}` : side === "left" ? leftHeader : rightHeader;
  let captionLines: string[];
  if (side === "both" && combined.kind === "none") {
    const notExist = locale === "pt-BR" ? "o limite não existe" : "the limit does not exist";
    captionLines = [
      notExist,
      `${leftHeader}: ${relation(lim, verdictText(leftResult!, locale))}`,
      `${rightHeader}: ${relation(lim, verdictText(rightResult!, locale))}`,
    ];
  } else {
    const where = side === "both" ? approach : side === "left" ? leftHeader : rightHeader;
    captionLines = [`${where}: ${relation(lim, verdictText(combined, locale))}`];
  }

  // ---- geometry ------------------------------------------------------------

  const probe = new Board(10, 10, PAPER);
  const labelW = Math.max(probe.measure(`${name}(${variable})`, 14), probe.measure(variable, 15)) + 20;
  const tableX = M + labelW;

  const critW = columns.map((c) => Math.max(40, probe.measure(c.xText, 14) + 24, probe.measure(c.valueText, 14) + 24));

  const xvals: number[] = [];
  let cursor = tableX + EDGE;
  for (let i = 0; i < columns.length; i += 1) {
    xvals.push(cursor + critW[i]! / 2);
    cursor += critW[i]!;
    if (i < columns.length - 1) cursor += INTERVAL;
  }
  const tableRight = cursor + EDGE;

  const captionW = Math.max(...captionLines.map((l) => probe.measure(l, 14)));
  const width = Math.ceil(Math.max(tableRight + M, captionW + 2 * M));
  const captionH = captionLines.length * CAPTION_LINE + CAPTION_GAP;
  const height = Math.ceil(M * 2 + ARROW_ROW + HEADER + CELL_ROW + captionH);

  const board = new Board(width, height, PAPER);
  const right = width - M;

  // Arrow-header row: one label per arm present, centred over its own columns.
  const arrowY = M + ARROW_ROW / 2;
  for (const g of ["left", "right"] as const) {
    const idx = columns.map((c, i) => (c.group === g ? i : -1)).filter((i) => i >= 0);
    if (idx.length === 0) continue;
    const centre = (xvals[idx[0]!]! + xvals[idx[idx.length - 1]!]!) / 2;
    board.label(g === "left" ? leftHeader : rightHeader, centre, arrowY, {
      freeStanding: true,
      size: 13,
      weight: 600,
      colour: SOFT,
    });
  }

  // x-value header row.
  const hy = M + ARROW_ROW + HEADER / 2;
  board.label(variable, M + labelW / 2, hy, { freeStanding: true, size: 15, weight: 600, serif: true, colour: INK });
  columns.forEach((c, i) => {
    const isA = c.group === "a";
    board.label(c.xText, xvals[i]!, hy, {
      freeStanding: true,
      size: 14,
      weight: 600,
      colour: isA ? ACCENT : INK,
    });
  });

  // Frame: rule under the header, vertical line for the label column, and a
  // pair of light rules flanking the `a` column so it reads as the point
  // the two arms are converging on, not just another cell.
  board.poly([{ x: M, y: M + ARROW_ROW + HEADER }, { x: right, y: M + ARROW_ROW + HEADER }], { stroke: RULE, width: 1.5 });
  board.poly([{ x: tableX, y: M + ARROW_ROW }, { x: tableX, y: height - captionH - M }], { stroke: RULE, width: 1.5 });
  const aIndex = columns.findIndex((c) => c.group === "a");
  if (aIndex >= 0) {
    const halfGap = INTERVAL / 2 + 1;
    for (const side2 of [-1, 1] as const) {
      const x = xvals[aIndex]! + (side2 * critW[aIndex]!) / 2 + side2 * halfGap;
      board.poly([{ x, y: M + ARROW_ROW }, { x, y: height - captionH - M }], { stroke: LIGHT, width: 1 });
    }
  }

  // Value row. When answers:false, draw empty cells (same size, no text).
  const cy = M + ARROW_ROW + HEADER + CELL_ROW / 2;
  board.label(`${name}(${variable})`, M + labelW / 2, cy, {
    freeStanding: true,
    size: 14,
    weight: 600,
    colour: INK,
    align: "start",
    width: labelW - 16,
  });
  columns.forEach((c, i) => {
    const isA = c.group === "a";
    if (answers) {
      board.label(c.valueText, xvals[i]!, cy, {
        freeStanding: true,
        size: 14,
        weight: 600,
        colour: isA ? ACCENT : INK,
        id: `cell-0-${i}`,
      });
    } else {
      board.label("", xvals[i]!, cy, {
        freeStanding: true,
        size: 14,
        weight: 600,
        colour: isA ? ACCENT : INK,
        id: `cell-0-${i}`,
      });
    }
  });

  // Caption: separated from the table by its own rule. Hidden when answers:false (the question is what the limit is).
  if (answers) {
    const captionTop = M + ARROW_ROW + HEADER + CELL_ROW + CAPTION_GAP / 2;
    board.poly([{ x: M, y: captionTop - CAPTION_GAP / 2 + 2 }, { x: right, y: captionTop - CAPTION_GAP / 2 + 2 }], { stroke: LIGHT, width: 1 });
    captionLines.forEach((line, i) => {
      board.label(line, width / 2, captionTop + CAPTION_LINE * i + CAPTION_LINE / 2, {
        freeStanding: true,
        size: 14,
        weight: i === 0 ? 700 : 500,
        colour: i === 0 ? INK : SOFT,
      });
    });
  }

  return parseSpec(board.spec(input.title ?? `estimando lim ${name}(${variable})`));
}

// ---- validation ---------------------------------------------------------------

const LIMIT_SIDES = ["left", "right", "both"] as const;

function validateLimitInput(raw: Record<string, unknown>): void {
  const path = "value-table.limit";
  const lo = v.object(raw.limit, path);
  v.requiredString(lo, "expr", path);
  v.optionalString(lo, "name", path);
  const at = lo.at;
  if (at === undefined) {
    throw new SpecError(`${path}.at is required (a finite number, "inf", or "-inf"), and is absent.`);
  }
  const atOk = (typeof at === "number" && Number.isFinite(at)) || at === "inf" || at === "-inf";
  if (!atOk) {
    throw new SpecError(`${path}.at must be a finite number, "inf", or "-inf", got ${JSON.stringify(at)}`);
  }
  v.optionalEnum(lo, "side", path, LIMIT_SIDES);
  const count = v.optionalNumber(lo, "count", path);
  if (count !== undefined && (!Number.isInteger(count) || count < 1 || count > 8)) {
    throw new SpecError(`${path}.count must be an integer between 1 and 8, got ${JSON.stringify(count)}`);
  }
}

export function validateValueTableInput(raw: Record<string, unknown>): void {
  const path = "value-table";
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  v.optionalString(raw, "variable", path);
  v.optionalEnum(raw, "orientation", path, ["rows", "columns"] as const);
  if (raw.limit !== undefined) {
    if (raw.xs !== undefined || raw.functions !== undefined) {
      throw new SpecError(
        `${path}: "limit" is a separate table mode (ADR 0039) and cannot be combined with "xs"/"functions" -- choose one.`,
      );
    }
    validateLimitInput(raw);
  } else {
    v.nonEmptyArray(raw, "xs", path, "numbers").forEach((x, i) => v.finite(x, `${path}.xs[${i}]`));
    v.nonEmptyArray(raw, "functions", path, "functions").forEach((func, i) => {
      const o = v.object(func, `${path}.functions[${i}]`);
      v.requiredString(o, "name", `${path}.functions[${i}]`);
      v.requiredString(o, "expr", `${path}.functions[${i}]`);
    });
  }
  expandValueTable(raw as unknown as ValueTableInput);
}
