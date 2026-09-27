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
 */

import type { FigureSpec } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { ExprError, compile } from "../../math/expr.ts";
import { LOCALES, MINUS, formatNumber } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";

// ---- input ---------------------------------------------------------------

export type ValueTableOrientation = "rows" | "columns";

export type ValueTableInput = {
  title?: string;
  locale?: Locale;
  /** The variable's name, printed in the header. Default "x". */
  variable?: string;
  /** The x values (one per column when orientation="rows", one per row when "columns"). */
  xs: number[];
  /** The functions: each { name, expr }. */
  functions: { name: string; expr: string }[];
  /** Table layout: "rows" (default) = functions in rows, "columns" = functions in columns. */
  orientation?: ValueTableOrientation;
};

// ---- palette ---------------------------------------------------------------

const PAPER = "#FCFBF7";
const INK = "#181B21";
const SOFT = "#4E5763";
const RULE = "#9AA3AE";
const LIGHT = "#C7CDD5";

// ---- the build ---------------------------------------------------------------

const M = 20;
const EDGE = 8;
const INTERVAL = 5;
const HEADER = 36;
const CELL_ROW = 42;

export function expandValueTable(input: ValueTableInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const variable = input.variable ?? "x";
  const xs = input.xs;
  const functions = input.functions;
  const orientation = input.orientation ?? "rows";

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

    // Value cells: one per x value.
    for (let xi = 0; xi < xs.length; xi += 1) {
      board.label(cells[fi]![xi]!, centres.xvals[xi]!, cy, { freeStanding: true,
        size: 14,
        weight: 600,
        colour: INK,
        id: `cell-${fi}-${xi}`,
      });
    }

    top += CELL_ROW;
  }

  return parseSpec(board.spec(input.title ?? "tabela de valores"));
}

// ---- validation ---------------------------------------------------------------

export function validateValueTableInput(raw: Record<string, unknown>): void {
  const path = "value-table";
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  v.optionalString(raw, "variable", path);
  v.nonEmptyArray(raw, "xs", path, "numbers").forEach((x, i) => v.finite(x, `${path}.xs[${i}]`));
  v.nonEmptyArray(raw, "functions", path, "functions").forEach((func, i) => {
    const o = v.object(func, `${path}.functions[${i}]`);
    v.requiredString(o, "name", `${path}.functions[${i}]`);
    v.requiredString(o, "expr", `${path}.functions[${i}]`);
  });
  v.optionalEnum(raw, "orientation", path, ["rows", "columns"] as const);
  expandValueTable(raw as unknown as ValueTableInput);
}
