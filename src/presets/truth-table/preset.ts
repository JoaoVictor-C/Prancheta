/**
 * truth-table -- the "tabela-verdade": one row per assignment of the
 * variables, one column per variable, (optionally) per subexpression, and per
 * expression. Every cell is COMPUTED from the parsed expression by
 * `evalBool` (src/math/boolean.ts); nobody types a V or an F. See ADR 0057.
 *
 * Two notations, because two courses draw the same table differently:
 *   "logic"   Lógica / Matemática Discreta: V and F, ¬ ∧ ∨ → ↔, rows from
 *             V…V down to F…F.
 *   "digital" Eletrônica Digital: 1 and 0, · + ′, rows from 0…0 up to 1…1
 *             (the row number is then the minterm number).
 *
 * The panel under the table is what the exercise usually asks next, each line
 * computed from the same columns that were printed:
 *   classify  tautologia / contradição / contingência, per expression;
 *   compare   whether two columns are equal ("P ≡ Q") or on which rows they
 *             differ;
 *   minterms  Σm(…), the canonical sum of products and its Quine–McCluskey
 *             simplification.
 *
 * COLUMN WIDTHS come from the text each column holds (its header lines and
 * its cells), never from a guess about the header alone -- value-table once let
 * a wide value run into its neighbour that way.
 */

import type { FigureSpec } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import {
  BoolParseError,
  MAX_VARIABLES,
  classify,
  equivalent,
  evalBool,
  exprKey,
  formatBool,
  formatSop,
  mintermsOf,
  parseBool,
  simplify,
  sopToExpr,
  subexpressions,
  toSumOfProducts,
  truthRows,
  variablesOf,
} from "../../math/boolean.ts";
import type { BoolExpr, Notation } from "../../math/boolean.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";

// ---- input ---------------------------------------------------------------

export type TruthTableExpression = string | { expr: string; label?: string };

export type TruthTableInput = {
  title?: string;
  /** One or more expressions; each becomes a result column. */
  expressions: TruthTableExpression[];
  /** Variable order (columns, left to right). Default: order of first appearance across the expressions. */
  variables?: string[];
  /** Add a column for every compound subexpression, in evaluation order. */
  showSubexpressions?: boolean;
  /** "logic" (V/F, ∧ ∨ ¬) or "digital" (0/1, · + ′). Default "logic". */
  notation?: Notation;
  /** Panel: canonical sum of minterms and its minimal form; adds a row-number column. */
  minterms?: boolean;
  /** Panel: tautologia / contradição / contingência for each expression. */
  classify?: boolean;
  /** Panel: are the expressions' columns equal? (every pair) */
  compare?: boolean;
  /** false: the frame, the headers and the variable columns only; every computed cell empty, no panel. Default true. */
  answers?: boolean;
};

/** Tables past this many variables would need more rows than a page holds. */
export const MAX_TABLE_VARIABLES = 6;
export const MAX_TABLE_EXPRESSIONS = 6;

// ---- palette ---------------------------------------------------------------

const PAPER = "#FCFBF7";
const INK = "#181B21";
const SOFT = "#4E5763";
const RULE = "#9AA3AE";
const LIGHT = "#D3D8DE";
const ACCENT = "#1D4E89";
const RESULT_TINT = "#E9F0F9";

const M = 24;
const ROW = 30;
const HEAD_LINE = 26;
const CELL_SIZE = 15;
const HEAD_SIZE = 14;
const PANEL_SIZE = 14;
const PANEL_LINE = 26;

// ---- reading the input -----------------------------------------------------

type Column = {
  kind: "index" | "variable" | "sub" | "result";
  /** Header lines, top to bottom. */
  head: string[];
  cells: string[];
  /** Whether each cell is a true value (result and sub columns: for emphasis). */
  bold: boolean;
};

type ParsedExpression = { expr: BoolExpr; label: string | undefined; typeset: string; name: string };

function parseExpression(raw: TruthTableExpression, i: number, notation: Notation): ParsedExpression {
  const path = `truth-table.expressions[${i}]`;
  const source = typeof raw === "string" ? raw : raw.expr;
  const label = typeof raw === "string" ? undefined : raw.label;
  let expr: BoolExpr;
  try {
    expr = parseBool(source);
  } catch (error) {
    if (error instanceof BoolParseError) throw new SpecError(`${path}: ${error.message}\n${error.excerpt()}`);
    throw error;
  }
  const typeset = formatBool(expr, notation);
  return { expr, label, typeset, name: label ?? typeset };
}

const symbolsOf = (notation: Notation): { t: string; f: string } => (notation === "logic" ? { t: "V", f: "F" } : { t: "1", f: "0" });

/** Break `text` at spaces so no line is wider than `maxWidth` by the board's own measure. */
function wrap(board: Board, text: string, size: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (line !== "" && board.measure(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line !== "") lines.push(line);
  return lines;
}

// ---- the build ---------------------------------------------------------------

export function expandTruthTable(input: TruthTableInput): FigureSpec {
  const notation: Notation = input.notation ?? "logic";
  const sym = symbolsOf(notation);
  const answers = input.answers !== false;
  const parsed = input.expressions.map((e, i) => parseExpression(e, i, notation));

  // Variables: the caller's order, or first appearance across the expressions.
  const appearing: string[] = [];
  for (const p of parsed) variablesOf(p.expr, appearing);
  const vars = input.variables ?? appearing;
  if (input.variables !== undefined) {
    const missing = appearing.filter((name) => !vars.includes(name));
    if (missing.length > 0) {
      throw new SpecError(`truth-table.variables leaves out ${missing.join(", ")}, which the expressions use; every variable needs a column.`);
    }
  }
  if (vars.length > MAX_TABLE_VARIABLES) {
    throw new SpecError(
      `truth-table: ${vars.length} variables make ${2 ** vars.length} rows; at most ${MAX_TABLE_VARIABLES} (${2 ** MAX_TABLE_VARIABLES} rows) fit a page.`,
    );
  }
  if (vars.length === 0) {
    throw new SpecError(`truth-table: the expressions have no variables (a constant has a one-row table only if you name a variable in "variables").`);
  }

  const order = notation === "logic" ? "descending" : "ascending";
  const rowsPerExpr = parsed.map((p) => truthRows(p.expr, vars, order));
  const rowCount = 1 << vars.length;
  const rowIndexes = rowsPerExpr[0]!.map((r) => r.index);
  const cellText = (b: boolean): string => (b ? sym.t : sym.f);

  // ---- columns --------------------------------------------------------------
  const columns: Column[] = [];
  if (input.minterms === true) {
    columns.push({ kind: "index", head: ["m"], cells: rowIndexes.map((n) => String(n)), bold: false });
  }
  vars.forEach((name, vi) => {
    columns.push({
      kind: "variable",
      head: [name],
      cells: rowsPerExpr[0]!.map((r) => cellText(r.values[vi]!)),
      bold: false,
    });
  });

  if (input.showSubexpressions === true) {
    const wholes = new Set(parsed.map((p) => exprKey(p.expr)));
    const seen = new Set<string>();
    for (const p of parsed) {
      for (const sub of subexpressions(p.expr)) {
        const key = exprKey(sub);
        if (seen.has(key) || wholes.has(key)) continue;
        seen.add(key);
        columns.push({
          kind: "sub",
          head: [formatBool(sub, notation)],
          cells: truthRows(sub, vars, order).map((r) => (answers ? cellText(r.result) : "")),
          bold: false,
        });
      }
    }
  }

  parsed.forEach((p, ei) => {
    columns.push({
      kind: "result",
      head: p.label === undefined ? [p.typeset] : [p.label, p.typeset],
      cells: rowsPerExpr[ei]!.map((r) => (answers ? cellText(r.result) : "")),
      bold: true,
    });
  });

  // ---- panel text, computed from the same rows ---------------------------------
  const panel: { text: string; weight: number; colour: string }[] = [];
  const say = (text: string, weight = 500, colour: string = INK): void => {
    panel.push({ text, weight, colour });
  };
  const truthWord = (n: number): string => {
    if (notation === "logic") return `verdadeira em ${n} das ${rowCount} linhas`;
    return `vale 1 em ${n} das ${rowCount} linhas`;
  };

  if (answers && input.classify === true) {
    for (const [ei, p] of parsed.entries()) {
      const trues = rowsPerExpr[ei]!.filter((r) => r.result).length;
      const kind = classify(p.expr, vars);
      const verdict =
        kind === "tautology"
          ? notation === "logic"
            ? `é uma tautologia: verdadeira nas ${rowCount} linhas`
            : `é uma tautologia: vale 1 nas ${rowCount} linhas`
          : kind === "contradiction"
            ? notation === "logic"
              ? `é uma contradição: falsa nas ${rowCount} linhas`
              : `é uma contradição: vale 0 nas ${rowCount} linhas`
            : `é uma contingência: ${truthWord(trues)}`;
      say(`${p.name} ${verdict}.`);
    }
  }

  if (answers && input.compare === true) {
    for (let a = 0; a < parsed.length; a += 1) {
      for (let b = a + 1; b < parsed.length; b += 1) {
        const pa = parsed[a]!;
        const pb = parsed[b]!;
        const differ = rowsPerExpr[a]!.flatMap((r, k) => (r.result !== rowsPerExpr[b]![k]!.result ? [k + 1] : []));
        // The same fact decided a second, independent way: the columns are equal
        // exactly when the two expressions are equivalent.
        if ((differ.length === 0) !== equivalent(pa.expr, pb.expr)) {
          throw new Error(`truth-table: internal disagreement comparing ${pa.name} and ${pb.name}`);
        }
        const same = notation === "logic" ? "≡" : "=";
        const not = notation === "logic" ? "≢" : "≠";
        if (differ.length === 0) say(`As colunas de ${pa.name} e ${pb.name} são iguais: ${pa.name} ${same} ${pb.name}.`, 700, ACCENT);
        else {
          const rows = differ.length === 1 ? `na linha ${differ[0]}` : `nas linhas ${differ.slice(0, -1).join(", ")} e ${differ[differ.length - 1]}`;
          say(`As colunas de ${pa.name} e ${pb.name} diferem ${rows}: ${pa.name} ${not} ${pb.name}.`, 700, ACCENT);
        }
      }
    }
  }

  if (answers && input.minterms === true) {
    for (const p of parsed) {
      const prefix = parsed.length > 1 ? `${p.name}: ` : "";
      const ms = mintermsOf(p.expr, vars);
      const sop = toSumOfProducts(p.expr, vars);
      const min = simplify(p.expr, vars);
      if (!equivalentSop(p.expr, sop, vars) || !equivalentSop(p.expr, min, vars)) {
        throw new Error(`truth-table: a sum of products disagrees with ${p.name}`);
      }
      say(`${prefix}Σm(${ms.join(", ")})`, 700);
      say(`${prefix}soma canônica: ${formatSop(sop, notation)}`);
      say(`${prefix}forma simplificada: ${formatSop(min, notation)}`);
    }
  }

  // ---- geometry: every width from the text it holds -----------------------------
  const probe = new Board(10, 10, PAPER);
  const colW = columns.map((c) =>
    Math.max(
      50,
      ...c.head.map((h) => probe.measure(h, HEAD_SIZE) + 26),
      ...(c.cells.every((t) => t === "") ? [probe.measure(sym.t, CELL_SIZE) + 26] : c.cells.map((t) => probe.measure(t, CELL_SIZE) + 26)),
    ),
  );
  const tableW = colW.reduce((s, w) => s + w, 0);
  const headLines = Math.max(...columns.map((c) => c.head.length));
  const headH = headLines * HEAD_LINE + 18;
  const tableH = headH + rowCount * ROW;

  const panelMax = Math.max(tableW, 560);
  const panelLines = panel.flatMap((p) => wrap(probe, p.text, PANEL_SIZE, panelMax).map((text) => ({ ...p, text })));
  const panelW = panelLines.length === 0 ? 0 : Math.max(...panelLines.map((l) => probe.measure(l.text, PANEL_SIZE)));
  const width = Math.ceil(Math.max(tableW, panelW) + 2 * M);
  const panelTop = M + tableH + (panelLines.length === 0 ? 0 : 22);
  const height = Math.ceil(panelTop + panelLines.length * PANEL_LINE + M - (panelLines.length === 0 ? 0 : 6));

  const board = new Board(width, height, PAPER);
  const x0 = M;
  const y0 = M;
  const right = x0 + tableW;
  const bottom = y0 + tableH;

  // Column x positions.
  const xs: number[] = [];
  let cursor = x0;
  for (const w of colW) {
    xs.push(cursor);
    cursor += w;
  }

  // Tint under the result columns: a mark with no stroke, so it is a surface, not ink.
  columns.forEach((c, ci) => {
    if (c.kind !== "result") return;
    board.marks.push({
      id: `tint-${ci}`,
      from: { x: xs[ci]!, y: y0 + headH },
      segments: [{ line: { x: xs[ci]! + colW[ci]!, y: y0 + headH } }, { line: { x: xs[ci]! + colW[ci]!, y: bottom } }, { line: { x: xs[ci]!, y: bottom } }],
      close: true,
      fill: RESULT_TINT,
      stroke: "none",
      strokeWidth: 0,
    });
  });

  // Rules: the frame, light row rules, light column rules, heavier group rules.
  board.poly([{ x: x0, y: y0 }, { x: right, y: y0 }], { stroke: RULE, width: 1.5 });
  board.poly([{ x: x0, y: y0 + headH }, { x: right, y: y0 + headH }], { stroke: INK, width: 1.6 });
  board.poly([{ x: x0, y: bottom }, { x: right, y: bottom }], { stroke: RULE, width: 1.5 });
  for (let r = 1; r < rowCount; r += 1) {
    const y = y0 + headH + r * ROW;
    const heavy = vars.length >= 3 && r % 4 === 0;
    board.poly([{ x: x0, y }, { x: right, y }], { stroke: heavy ? RULE : LIGHT, width: heavy ? 1.2 : 1 });
  }
  columns.forEach((c, ci) => {
    const prev = columns[ci - 1];
    const heavy = ci === 0 || prev === undefined || prev.kind !== c.kind;
    const x = xs[ci]!;
    if (ci === 0) {
      board.poly([{ x, y: y0 }, { x, y: bottom }], { stroke: RULE, width: 1.5 });
    } else {
      board.poly([{ x, y: y0 }, { x, y: bottom }], { stroke: heavy ? INK : LIGHT, width: heavy ? 1.6 : 1 });
    }
  });
  board.poly([{ x: right, y: y0 }, { x: right, y: bottom }], { stroke: RULE, width: 1.5 });

  // Headers and cells. Every text is free-standing (ADR 0035): a cell is read
  // by its row and column, not by what sits beside it.
  columns.forEach((c, ci) => {
    const cx = xs[ci]! + colW[ci]! / 2;
    const topPad = (headH - c.head.length * HEAD_LINE) / 2;
    c.head.forEach((line, li) => {
      const isTypeset = c.kind === "result" && c.head.length === 2 && li === 1;
      board.label(line, cx, y0 + topPad + li * HEAD_LINE + HEAD_LINE / 2, {
        freeStanding: true,
        size: c.kind === "variable" ? 15 : HEAD_SIZE,
        weight: c.kind === "result" && !isTypeset ? 700 : c.kind === "variable" ? 700 : 600,
        colour: c.kind === "result" ? ACCENT : c.kind === "index" ? SOFT : INK,
        serif: c.kind === "variable",
        id: `head-${ci}-${li}`,
      });
    });
    c.cells.forEach((text, r) => {
      if (text === "") return;
      board.label(text, cx, y0 + headH + r * ROW + ROW / 2, {
        freeStanding: true,
        size: CELL_SIZE,
        weight: c.bold ? 700 : 500,
        colour: c.kind === "index" ? SOFT : c.kind === "result" ? ACCENT : INK,
        id: `cell-${r}-${ci}`,
      });
    });
  });

  // Panel.
  panelLines.forEach((l, i) => {
    board.label(l.text, x0 + panelW / 2 - 0, panelTop + i * PANEL_LINE + PANEL_LINE / 2, {
      freeStanding: true,
      size: PANEL_SIZE,
      weight: l.weight,
      colour: l.colour,
      align: "start",
      width: panelW,
      id: `panel-${i}`,
    });
  });

  return parseSpec(board.spec(input.title ?? "tabela-verdade"));
}

/** Does this sum of products compute `e` on every row over `vars`? Decided by evaluation, not by syntax. */
function equivalentSop(e: BoolExpr, sop: { vars: string[]; terms: string[] }, vars: string[]): boolean {
  const back = sopToExpr(sop);
  return truthRows(e, vars).every((row) => {
    const env: Record<string, boolean> = {};
    vars.forEach((name, i) => {
      env[name] = row.values[i]!;
    });
    return evalBool(back, env) === row.result;
  });
}

// ---- validation ---------------------------------------------------------------

export function validateTruthTableInput(raw: Record<string, unknown>): void {
  const path = "truth-table";
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "notation", path, ["logic", "digital"] as const);
  for (const key of ["showSubexpressions", "minterms", "classify", "compare"]) v.optionalBoolean(raw, key, path);
  const list = v.nonEmptyArray(raw, "expressions", path, "expressions");
  if (list.length > MAX_TABLE_EXPRESSIONS) {
    throw new SpecError(`${path}.expressions has ${list.length} entries; at most ${MAX_TABLE_EXPRESSIONS} result columns fit beside the variables.`);
  }
  list.forEach((entry, i) => {
    const at = `${path}.expressions[${i}]`;
    if (typeof entry === "string") return;
    const o = v.object(entry, at);
    v.requiredString(o, "expr", at);
    v.optionalString(o, "label", at);
    for (const key of Object.keys(o)) if (key !== "expr" && key !== "label") throw new SpecError(`${at}.${key} is not a field; use expr and label`);
  });
  if (raw.variables !== undefined) {
    const names = v.nonEmptyArray(raw, "variables", path, "variable names");
    const seen = new Set<string>();
    names.forEach((n, i) => {
      if (typeof n !== "string") throw new SpecError(`${path}.variables[${i}] must be a string, got ${JSON.stringify(n)}`);
      let e: BoolExpr;
      try {
        e = parseBool(n);
      } catch {
        throw new SpecError(`${path}.variables[${i}] is ${JSON.stringify(n)}, which is not a variable name (one letter, optionally with digits: A, p, x1).`);
      }
      if (e.kind !== "var" || e.name !== n.trim()) throw new SpecError(`${path}.variables[${i}] is ${JSON.stringify(n)}, which is not a variable name (one letter, optionally with digits: A, p, x1).`);
      if (seen.has(n)) throw new SpecError(`${path}.variables lists ${n} twice.`);
      seen.add(n);
    });
    if (names.length > MAX_VARIABLES) throw new SpecError(`${path}.variables has too many names.`);
  }
  expandTruthTable(raw as unknown as TruthTableInput);
}
