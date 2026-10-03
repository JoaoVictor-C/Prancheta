/**
 * data-table -- the textbook table of GIVEN text and numbers (ADR 0065).
 *
 * `value-table` computes a function's values from an expression; most tables
 * in an exam are the opposite: the data ARE the content -- a nutrition label,
 * a price list, a ranking, the atomic radius of five elements. This preset
 * draws them: a header row (with units, and optionally grouped headers over
 * several columns), the rows, an outer frame, light row rules, numbers set
 * right-aligned in pt-BR (decimal comma), real sub/superscripts in text
 * (`CO_2`, `m^2`), blanks to fill, highlighted cells.
 *
 * What is DERIVED, never typed:
 *   - a column `{ header, from: "B*C" }` is computed per row from other columns
 *     (column letters A, B, C ... or their `id`s) with the expression language
 *     of src/math/expr.ts;
 *   - a `totals` row sums / averages / takes the min or max of named columns.
 * Those, and every cell given as `{ answer: v }`, are "the answers": under
 * `answers: false` they are drawn empty (or as the `blank` marker), so the
 * question's figure shows what the exercise gives and not what it asks.
 *
 * COLUMN WIDTHS come from the text each column holds (cells and header, each
 * measured in the bundled face at the weight it is drawn); a header wider than
 * its column wraps to lines and a long text cell wraps inside its column
 * instead of running into the next.
 */

import type { Block, FigureSpec, TextRun } from "../../ir/types.ts";
import { SpecError, parseSpec, runsText } from "../../ir/types.ts";
import { ExprError, evaluate, freeVariables, parseIn } from "../../math/expr.ts";
import type { Node } from "../../math/expr.ts";
import { LOCALES, MINUS, NARROW_SPACE, formatNumber } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";
import { hasScripts, runsWidth, wrapRuns } from "../shared/panel.ts";

// ---- input ---------------------------------------------------------------

export type DataTableFormat =
  | "integer"
  | "percent"
  | "money"
  | {
      /** Exactly this many decimals. Unset: as many as the column needs, up to four (two for a derived value that does not terminate). */
      decimals?: number;
      /** true: grouped from four digits with the traditional mark ("1.234,50"); "space": from four digits with a narrow space, as exam booklets print ("2 000,00"). Unset: from five digits, narrow space. */
      grouping?: boolean | "space";
      prefix?: string;
      suffix?: string;
      /** The value is a fraction: print it ×100 with a "%" (0,25 → "25%"). */
      percent?: boolean;
    };

export type DataTableColumn = {
  /** The header text; `_{}`/`^{}` or bare `H_2O`, `m^2` marks give real scripts. */
  header: string;
  /** Printed after the header: "Massa (kg)". */
  unit?: string;
  /** A name other columns' expressions may use besides the letter A, B, C ... (a letter, then letters or digits). */
  id?: string;
  /** "left" for text columns, "right" for numeric ones unless said. */
  align?: "left" | "center" | "right";
  format?: DataTableFormat;
  /** A DERIVED column: an expression over the other columns ("B*C"). Rows do not list a cell for it. */
  from?: string;
};

export type DataTableCell = string | number | null | { answer: string | number };

export type DataTableTotals = {
  /** Text of the totals row's first cell. Default "Total" ("Média" when every column is a mean). */
  label?: string;
  /** Column letter or id -> how to reduce it. */
  by: Record<string, "sum" | "mean" | "min" | "max">;
};

export type DataTableInput = {
  /** Drawn above the table, and the figure's title. */
  title?: string;
  locale?: Locale;
  columns: DataTableColumn[];
  /** One array per row: the cells of the NON-derived columns, in order (or one per column, with null at the derived ones). */
  rows: DataTableCell[][];
  /** Grouped headers above the column headers, outermost first: each row's spans sum to the number of columns. */
  headerRows?: { text: string; span: number }[][];
  /** The first column names the row: set left, semibold, with a heavier rule after it. */
  stub?: boolean;
  /** Cells to emphasise: { row, col } for one cell, { row } for a row, { col } for a column. 0-based; col may be a letter or id. */
  highlight?: { row?: number; col?: number | string }[];
  /** What a cell to fill (null, or an answer not shown) looks like: "?" or "____". Default: empty. */
  blank?: "?" | "____";
  totals?: DataTableTotals;
  /** A note under the table. */
  caption?: string;
  /** "Fonte: ..." under the caption, smaller. */
  source?: string;
  /** false: derived cells, totals and `{ answer }` cells are drawn empty. Default true. */
  answers?: boolean;
};

export const MAX_COLUMNS = 16;
export const MAX_ROWS = 120;

// ---- palette and metrics ---------------------------------------------------

const PAPER = "#FCFBF7";
const INK = "#181B21";
const SOFT = "#4E5763";
const RULE = "#9AA3AE";
const LIGHT = "#D3D8DE";
const ACCENT = "#1D4E89";
const HEAD_FILL = "#E6EBF2";
const HIGHLIGHT_FILL = "#E9F0F9";

const M = 24;
const SIZE = 14;
const LINE = 24; // two stacked 14px labels need more than their 23,3px boxes between centres
const ROW_MIN = 32;
const PAD_X = 14;
const PAD_Y = 5;
const MIN_CONTENT = 44;
const TEXT_CAP = 230; // a text column wider than this wraps its cells
const HEAD_WRAP = 160; // a header this narrow or narrower never wraps
const TITLE_SIZE = 16;
const TITLE_LINE = 28;
const NOTE_SIZE = 13;
const NOTE_LINE = 22;

// ---- scripts markup --------------------------------------------------------

const SUB_BARE = /^_(\d+)/;
const SUP_BARE = /^\^((?:[+\-−]\d+|\d+(?:[+\-−](?!\w))?|[+\-−](?!\w)))/;
const BRACED = /^[_^]\{([^{}]*)\}/;

/**
 * Runs from a string with real scripts: `_{…}` / `^{…}`, or the bare forms a
 * formula is written in -- `H_2O`, `C_6H_12O_6` (digits after `_`), `m^2`,
 * `10^-3`, `Ca^2+`, `Na^+` (a number and/or a charge sign after `^`; a sign
 * followed by a digit or letter is NOT a charge, so `x^2-1` keeps its minus).
 * A lone `_` or `^` is literal text.
 */
export function markup(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const push = (t: string, script?: "sub" | "sup"): void => {
    if (t === "") return;
    const last = runs[runs.length - 1];
    if (last !== undefined && last.script === script) last.text += t;
    else runs.push(script === undefined ? { text: t } : { text: t, script });
  };
  let plain = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (ch === "_" || ch === "^") {
      const rest = text.slice(i);
      const braced = BRACED.exec(rest);
      const bare = braced ?? (ch === "_" ? SUB_BARE.exec(rest) : SUP_BARE.exec(rest));
      if (bare !== null) {
        push(plain);
        plain = "";
        const body = bare[1]!;
        push(ch === "^" ? body.replace(/-/g, MINUS) : body, ch === "_" ? "sub" : "sup");
        i += bare[0].length - 1;
        continue;
      }
    }
    plain += ch;
  }
  push(plain);
  return runs;
}

// ---- reading the input -----------------------------------------------------

const letter = (i: number): string | undefined => (i < 26 ? String.fromCharCode(65 + i) : undefined);

/** A pt-BR number written by hand: 55,5 · 1 200 · −3 · 4,0 · 10^-4 · 2,5 × 10^{3}. */
const WRITTEN_NUMBER = /^[−-]?\d+(?:[ .  ]\d{3})*(?:,\d+)?(?:\s*[·×]\s*10\^\{?[−-]?\d+\}?)?$/;

/** Width of a written number's integer part: what stands left of its comma, or of the "· 10" if it has none. */
function intPartWidth(runs: TextRun[], size: number, weight: number): number {
  const out: TextRun[] = [];
  for (const r of runs) {
    const cut = r.text.search(/,|\s*[·×]/);
    if (cut >= 0) {
      if (cut > 0) out.push({ ...r, text: r.text.slice(0, cut) });
      return runsWidth(out, size, weight);
    }
    out.push(r);
  }
  return runsWidth(out, size, weight);
}

type Kind = "text" | "number" | "blank";
type Cell = {
  runs: TextRun[];
  kind: Kind;
  bold: boolean;
  /** It is an answer (derived, total or { answer }): hidden under answers:false. */
  answer: boolean;
};

type Format = { decimals?: number; grouping?: boolean | "space"; prefix: string; suffix: string; scale: number };

function resolveFormat(f: DataTableFormat | undefined): Format {
  if (f === undefined) return { prefix: "", suffix: "", scale: 1 };
  if (f === "integer") return { decimals: 0, prefix: "", suffix: "", scale: 1 };
  if (f === "percent") return { prefix: "", suffix: "%", scale: 100 };
  if (f === "money") return { decimals: 2, grouping: true, prefix: "", suffix: "", scale: 1 };
  return {
    ...(f.decimals === undefined ? {} : { decimals: f.decimals }),
    ...(f.grouping === undefined ? {} : { grouping: f.grouping }),
    prefix: f.prefix ?? "",
    suffix: f.suffix ?? (f.percent === true ? "%" : ""),
    scale: f.percent === true ? 100 : 1,
  };
}

/** The fewest decimals (0..4) that write every value exactly; two when none does. */
function autoDecimals(values: readonly number[]): number {
  for (let d = 0; d <= 4; d += 1) {
    if (values.every((x) => Math.abs(x - Number(x.toFixed(d))) <= 1e-9 * Math.max(1, Math.abs(x)))) return d;
  }
  return 2;
}

type Reduce = "sum" | "mean" | "min" | "max";
const REDUCERS: readonly Reduce[] = ["sum", "mean", "min", "max"];

function reduce(kind: Reduce, xs: readonly number[]): number {
  if (kind === "sum") return xs.reduce((s, x) => s + x, 0);
  if (kind === "mean") return xs.reduce((s, x) => s + x, 0) / xs.length;
  return kind === "min" ? Math.min(...xs) : Math.max(...xs);
}

/** "2000,5" -> "2 000,5" (a narrow no-break space between groups of three, from four digits). */
function spaceGroups(text: string): string {
  const m = /^(\D*)(\d+)(.*)$/.exec(text);
  if (m === null) return text;
  return `${m[1]}${m[2]!.replace(/\B(?=(\d{3})+(?!\d))/g, NARROW_SPACE)}${m[3]}`;
}

const NBSP = String.fromCharCode(0xa0);

// ---- the build -------------------------------------------------------------

export function expandDataTable(input: DataTableInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const answers = input.answers !== false;
  const cols = input.columns;
  const n = cols.length;
  const stub = input.stub === true;

  // Names a derived column or a totals entry may use for a column.
  const refs = new Map<string, number>();
  cols.forEach((c, i) => {
    for (const name of [letter(i), c.id]) {
      if (name === undefined) continue;
      if (refs.has(name) && refs.get(name) !== i) throw new SpecError(`data-table: the name "${name}" refers to two columns.`);
      refs.set(name, i);
    }
  });
  const refOf = (name: string | number, where: string): number => {
    if (typeof name === "number") {
      if (!Number.isInteger(name) || name < 0 || name >= n) throw new SpecError(`data-table: ${where} column ${name} is out of range (0..${n - 1}).`);
      return name;
    }
    const i = refs.get(name);
    if (i === undefined) throw new SpecError(`data-table: ${where} names column "${name}"; the columns are ${[...refs.keys()].join(", ")}.`);
    return i;
  };

  // Rows -> a cell per column; derived columns get none yet.
  const given = cols.map((c, i) => (c.from === undefined ? i : -1)).filter((i) => i >= 0);
  const raw: (DataTableCell | undefined)[][] = input.rows.map((row, r) => {
    if (row.length === given.length && row.length !== n) {
      const out: (DataTableCell | undefined)[] = Array.from({ length: n }, () => undefined);
      given.forEach((ci, k) => {
        out[ci] = row[k]!;
      });
      return out;
    }
    if (row.length === n) {
      return row.map((cell, ci) => {
        if (cols[ci]!.from === undefined) return cell;
        if (cell !== null) throw new SpecError(`data-table.rows[${r}][${ci}]: column ${ci} is derived (from "${cols[ci]!.from}"); leave its cell null or list rows without it.`);
        return undefined;
      });
    }
    throw new SpecError(
      `data-table.rows[${r}] has ${row.length} cells; the table has ${n} columns` +
        (given.length === n ? "" : `, ${given.length} of them given (the rest derived)`) +
        ".",
    );
  });
  if (raw.length > MAX_ROWS) throw new SpecError(`data-table: ${raw.length} rows; at most ${MAX_ROWS} fit a legible figure.`);

  // Derived columns: parse once, evaluate per row, resolving other derived columns on demand.
  const variables = [...refs.keys()];
  const trees = new Map<number, { source: string; tree: Node; used: string[] }>();
  cols.forEach((c, i) => {
    if (c.from === undefined) return;
    try {
      const tree = parseIn(c.from, variables);
      trees.set(i, { source: c.from, tree, used: [...freeVariables(tree)] });
    } catch (error) {
      if (error instanceof ExprError) throw new SpecError(`data-table.columns[${i}].from: ${error.message}`);
      throw error;
    }
  });
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const numberAt = (r: number, c: number, asker: string): number => {
    const key = `${r}:${c}`;
    const known = memo.get(key);
    if (known !== undefined) return known;
    const d = trees.get(c);
    let value: number;
    if (d !== undefined) {
      if (visiting.has(key)) throw new SpecError(`data-table: derived columns depend on each other in a loop (column ${c}, row ${r}).`);
      visiting.add(key);
      const scope: Record<string, number> = {};
      for (const name of d.used) scope[name] = numberAt(r, refs.get(name)!, `column ${c} ("${d.source}")`);
      try {
        value = evaluate(d.tree, scope);
      } catch (error) {
        if (error instanceof ExprError) throw new SpecError(`data-table.columns[${c}].from: ${error.message}`);
        throw error;
      }
      visiting.delete(key);
      if (!Number.isFinite(value)) throw new SpecError(`data-table: column ${c} ("${d.source}") is not a finite number in row ${r} (a division by zero?).`);
    } else {
      const cell = raw[r]![c];
      const x = cell !== null && typeof cell === "object" ? cell.answer : cell;
      if (typeof x !== "number") {
        throw new SpecError(
          `data-table: ${asker} needs a number at row ${r}, column ${c}, and finds ${x === null ? "a blank cell (null: nothing to compute from)" : JSON.stringify(x)}.`,
        );
      }
      value = x;
    }
    memo.set(key, value);
    return value;
  };

  // Which columns hold numbers: derived ones, and any with a given number.
  const numeric = cols.map((c, ci) => c.from !== undefined || raw.some((row) => {
    const cell = row[ci];
    const x = cell !== null && typeof cell === "object" ? cell.answer : cell;
    return typeof x === "number";
  }));
  // Columns of numbers TYPED as text ("4,0 · 10^-4", "55,5"): drawn aligned on the
  // decimal comma like a number column, since a reader compares them the same way.
  const numberLike = cols.map((c, ci) => {
    if (numeric[ci] || c.from !== undefined || (stub && ci === 0)) return false;
    const texts = raw.map((row) => {
      const cell = row[ci];
      return cell !== null && typeof cell === "object" ? cell.answer : cell;
    }).filter((x): x is string => typeof x === "string" && x.trim() !== "");
    return texts.length > 0 && texts.every((t) => WRITTEN_NUMBER.test(t.trim()));
  });

  // Totals.
  const totalCols: { ci: number; how: Reduce }[] = [];
  if (input.totals !== undefined) {
    for (const [name, how] of Object.entries(input.totals.by)) {
      const ci = refOf(name, "totals");
      if (!REDUCERS.includes(how)) throw new SpecError(`data-table.totals.by.${name} must be one of ${REDUCERS.join(", ")}, got ${JSON.stringify(how)}`);
      if (!numeric[ci]) throw new SpecError(`data-table.totals: column "${name}" has no numbers to ${how}.`);
      totalCols.push({ ci, how });
    }
  }
  const totalValue = new Map<number, number>();
  for (const { ci, how } of totalCols) {
    totalValue.set(ci, reduce(how, raw.map((_, r) => numberAt(r, ci, `the ${how} of column ${ci}`))));
  }
  const hasTotals = totalCols.length > 0;
  const totalsLabel = input.totals?.label ?? (hasTotals && totalCols.every((t) => t.how === "mean") ? "Média" : "Total");

  // Number formats: decimals fitted to what the column holds.
  const formats = cols.map((c, ci): Format => {
    const f = resolveFormat(c.format);
    if (f.decimals === undefined && numeric[ci]) {
      const xs: number[] = [];
      raw.forEach((row, r) => {
        const cell = row[ci];
        const x = cell !== null && typeof cell === "object" ? cell.answer : cell;
        if (typeof x === "number" || c.from !== undefined) xs.push(numberAt(r, ci, "a format") * f.scale);
      });
      if (totalValue.has(ci)) xs.push(totalValue.get(ci)! * f.scale);
      f.decimals = autoDecimals(xs);
    }
    return f;
  });
  const numText = (x: number, ci: number): string => {
    const f = formats[ci]!;
    const space = f.grouping === "space";
    const text = formatNumber(x * f.scale, locale, {
      decimals: f.decimals ?? 0,
      fractions: false,
      ...(f.grouping === "space" ? { grouping: false } : f.grouping === undefined ? {} : { grouping: f.grouping }),
    });
    return `${f.prefix}${space ? spaceGroups(text) : text}${f.suffix}`;
  };

  // The grid of cells.
  const highlights = (input.highlight ?? []).map((h, k) => {
    if (h.row === undefined && h.col === undefined) throw new SpecError(`data-table.highlight[${k}] needs a row, a col, or both.`);
    if (h.row !== undefined && (!Number.isInteger(h.row) || h.row < 0 || h.row >= raw.length)) {
      throw new SpecError(`data-table.highlight[${k}].row ${h.row} is out of range (0..${raw.length - 1}).`);
    }
    return { row: h.row, col: h.col === undefined ? undefined : refOf(h.col, `highlight[${k}]`) };
  });
  const lit = (r: number, ci: number): boolean => highlights.some((h) => (h.row === undefined || h.row === r) && (h.col === undefined || h.col === ci));

  const blankCell: Cell = { runs: [], kind: "blank", bold: false, answer: false };
  const grid: Cell[][] = raw.map((row, r) =>
    cols.map((c, ci): Cell => {
      const bold = lit(r, ci) || (stub && ci === 0);
      if (c.from !== undefined) {
        return { runs: [{ text: numText(numberAt(r, ci, ""), ci) }], kind: "number", bold: lit(r, ci), answer: true };
      }
      const cell = row[ci];
      if (cell === null || cell === undefined) return { ...blankCell };
      const isAnswer = typeof cell === "object";
      const x = isAnswer ? cell.answer : cell;
      if (typeof x === "number") return { runs: [{ text: numText(x, ci) }], kind: "number", bold, answer: isAnswer };
      return { runs: markup(x), kind: "text", bold, answer: isAnswer };
    }),
  );
  const totalsRow: Cell[] | undefined = hasTotals
    ? cols.map((_, ci): Cell => {
        const value = totalValue.get(ci);
        if (value !== undefined) return { runs: [{ text: numText(value, ci) }], kind: "number", bold: true, answer: true };
        if (ci === 0) return { runs: markup(totalsLabel), kind: "text", bold: true, answer: false };
        return { ...blankCell };
      })
    : undefined;
  if (totalsRow !== undefined && totalValue.has(0)) {
    // The label has nowhere to go: column 0 is itself totalled.
    throw new SpecError(`data-table.totals: column 0 is totalled, which leaves no cell for the label "${totalsLabel}"; total another column.`);
  }
  const body: Cell[][] = totalsRow === undefined ? grid : [...grid, totalsRow];

  const shown = (c: Cell): boolean => c.kind !== "blank" && (answers || !c.answer);
  const blankMark = input.blank;
  const markOf = (c: Cell): TextRun[] => (blankMark === undefined ? [] : [{ text: blankMark }]);
  const runsShown = (c: Cell): TextRun[] => (c.kind === "blank" || !shown(c) ? markOf(c) : c.runs);
  const weightOf = (c: Cell, ci: number): number => (c.bold ? 700 : stub && ci === 0 ? 600 : 400);

  // ---- geometry: every width from the text it holds ---------------------------

  const headRuns: TextRun[][] = cols.map((c) => {
    const text = c.unit === undefined ? c.header : `${c.header} (${c.unit})`;
    // A parenthesised unit ("(em real)") is never parted across lines: its spaces do not break.
    return markup(text.replace(/\([^()]*\)/g, (m) => m.replace(/ /g, NBSP)));
  });
  const measureAt = (weight: number) => (runs: TextRun[]): number => runsWidth(runs, SIZE, weight);

  // Content width a column's cells need (numbers and short text never wrap; long text wraps at TEXT_CAP).
  const natural: number[] = cols.map((_, ci) => {
    let w = MIN_CONTENT;
    for (const row of body) {
      const c = row[ci]!;
      // The answer's own width is reserved in the question's figure too: both versions share one geometry.
      const runs = c.kind === "blank" ? markOf(c) : c.runs;
      if (runs.length === 0) continue;
      const cw = runsWidth(runs, SIZE, weightOf(c, ci));
      w = Math.max(w, c.kind === "number" ? cw : Math.min(cw, TEXT_CAP));
    }
    return w;
  });
  // A text cell longer than TEXT_CAP wraps; the column is then as wide as its widest wrapped line.
  const cellLines = (c: Cell, ci: number, room: number): TextRun[][] => {
    const runs = c.kind === "blank" || !shown(c) ? markOf(c) : c.runs;
    if (runs.length === 0) return [[]];
    if (c.kind === "number") return [runs];
    return wrapRuns(runs, room, measureAt(weightOf(c, ci)));
  };
  const content: number[] = cols.map((_, ci) => {
    let w = MIN_CONTENT;
    for (const row of body) {
      const c = row[ci]!;
      // Wrap on the answer when hidden too, so both versions share a geometry.
      const asShown = c.kind === "blank" ? { ...c } : { ...c, answer: false };
      const lines = cellLines(asShown, ci, Math.max(natural[ci]!, MIN_CONTENT));
      for (const line of lines) if (line.length > 0) w = Math.max(w, measureAt(weightOf(c, ci))(line));
    }
    // The header: whole if short; otherwise wrapped no narrower than its own longest word.
    const hr = headRuns[ci]!;
    const hw = measureAt(700)(hr);
    if (hw <= Math.max(w, HEAD_WRAP)) w = Math.max(w, hw);
    else {
      const lines = wrapRuns(hr, Math.max(w, HEAD_WRAP), measureAt(700));
      w = Math.max(w, ...lines.map(measureAt(700)));
    }
    return Math.ceil(w);
  });
  const colW = content.map((w) => w + 2 * PAD_X);

  // Grouped headers: widen the columns under a group that is wider than they are.
  const groupRows = input.headerRows ?? [];
  for (const row of groupRows) {
    let at = 0;
    for (const g of row) {
      const span = colW.slice(at, at + g.span).reduce((s, x) => s + x, 0);
      const runs = markup(g.text);
      const room = Math.max(span, 170) - 2 * PAD_X;
      const need = Math.max(0, ...wrapRuns(runs, room, measureAt(700)).map(measureAt(700))) + 2 * PAD_X;
      if (need > span) for (let k = at; k < at + g.span; k += 1) colW[k] = colW[k]! + (need - span) / g.span;
      at += g.span;
    }
  }
  for (let ci = 0; ci < n; ci += 1) colW[ci] = Math.ceil(colW[ci]!);

  const tableW = colW.reduce((s, w) => s + w, 0);
  const xs: number[] = [];
  {
    let cursor = M;
    for (const w of colW) {
      xs.push(cursor);
      cursor += w;
    }
  }

  // Heading and notes, wrapped to the table (or to a readable measure when the table is narrow).
  const noteW = Math.max(tableW, 340);
  const titleLines = input.title === undefined ? [] : wrapRuns(markup(input.title), noteW, (r) => runsWidth(r, TITLE_SIZE, 700));
  const captionLines = input.caption === undefined ? [] : wrapRuns(markup(input.caption), noteW, (r) => runsWidth(r, NOTE_SIZE, 400));
  const sourceLines = input.source === undefined ? [] : wrapRuns(markup(input.source), noteW, (r) => runsWidth(r, NOTE_SIZE - 1, 400));

  // Row heights.
  const lineCount = (cells: Cell[]): number => Math.max(1, ...cells.map((c, ci) => cellLines(c.kind === "blank" ? c : { ...c, answer: false }, ci, Math.max(natural[ci]!, MIN_CONTENT)).length));
  const rowH = body.map((cells) => Math.max(ROW_MIN, lineCount(cells) * LINE + 2 * PAD_Y));
  const headLinesPer = headRuns.map((r, ci) => wrapRuns(r, colW[ci]! - 2 * PAD_X, measureAt(700)));
  const headH = Math.max(1, ...headLinesPer.map((l) => l.length)) * LINE + 2 * PAD_Y + 2;
  const groupLines = groupRows.map((row) => {
    let at = 0;
    return row.map((g) => {
      const w = colW.slice(at, at + g.span).reduce((s, x) => s + x, 0) - 2 * PAD_X;
      const first = at;
      at += g.span;
      return { from: first, span: g.span, lines: wrapRuns(markup(g.text), w, measureAt(700)) };
    });
  });
  const groupH = groupLines.map((row) => Math.max(1, ...row.map((g) => g.lines.length)) * LINE + 2 * PAD_Y + 2);

  const titleH = titleLines.length === 0 ? 0 : titleLines.length * TITLE_LINE + 10;
  const notesH =
    (captionLines.length === 0 ? 0 : 10 + captionLines.length * NOTE_LINE) +
    (sourceLines.length === 0 ? 0 : (captionLines.length === 0 ? 10 : 0) + sourceLines.length * NOTE_LINE);
  const headBlockH = groupH.reduce((s, h) => s + h, 0) + headH;
  const bodyH = rowH.reduce((s, h) => s + h, 0);
  const tableH = headBlockH + bodyH;

  const noteWidest = Math.max(
    0,
    ...titleLines.map((l) => runsWidth(l, TITLE_SIZE, 700)),
    ...captionLines.map((l) => runsWidth(l, NOTE_SIZE, 400)),
    ...sourceLines.map((l) => runsWidth(l, NOTE_SIZE - 1, 400)),
  );
  const width = Math.ceil(2 * M + Math.max(tableW, noteWidest));
  const height = Math.ceil(2 * M + titleH + tableH + notesH);
  const board = new Board(width, height, PAPER);
  const x0 = M;
  const y0 = M + titleH;
  const right = x0 + tableW;
  const bottom = y0 + tableH;
  const mainTop = y0 + groupH.reduce((s, h) => s + h, 0);

  // ---- ink ---------------------------------------------------------------------

  const fill = (id: string, x: number, y: number, w: number, h: number, colour: string): void => {
    board.marks.push({
      id,
      from: { x, y },
      segments: [{ line: { x: x + w, y } }, { line: { x: x + w, y: y + h } }, { line: { x, y: y + h } }],
      close: true,
      fill: colour,
      stroke: "none",
      strokeWidth: 0,
    });
  };
  fill("head-fill", x0, y0, tableW, headBlockH, HEAD_FILL);
  const rowTop: number[] = [];
  {
    let y = mainTop + headH;
    for (const h of rowH) {
      rowTop.push(y);
      y += h;
    }
  }
  for (const h of highlights) {
    if (h.col === undefined) {
      const rows = h.row === undefined ? [] : [h.row];
      for (const r of rows) fill(`hl-row-${r}`, x0, rowTop[r]!, tableW, rowH[r]!, HIGHLIGHT_FILL);
    } else if (h.row === undefined) {
      fill(`hl-col-${h.col}`, xs[h.col]!, mainTop + headH, colW[h.col]!, bodyH, HIGHLIGHT_FILL);
    } else {
      fill(`hl-${h.row}-${h.col}`, xs[h.col]!, rowTop[h.row]!, colW[h.col]!, rowH[h.row]!, HIGHLIGHT_FILL);
    }
  }

  // Row rules, the header's rules, the totals' rule.
  for (let r = 1; r < body.length; r += 1) {
    const isTotals = hasTotals && r === body.length - 1;
    board.poly([{ x: x0, y: rowTop[r]! }, { x: right, y: rowTop[r]! }], isTotals ? { stroke: INK, width: 1.5 } : { stroke: LIGHT, width: 1 });
  }
  board.poly([{ x: x0, y: mainTop + headH }, { x: right, y: mainTop + headH }], { stroke: INK, width: 1.6 });
  {
    let y = y0;
    for (const h of groupH) {
      y += h;
      board.poly([{ x: x0, y }, { x: right, y }], { stroke: RULE, width: 1.2 });
    }
  }
  // Column rules: full height in the body and column header; at group edges in a group row.
  for (let ci = 1; ci < n; ci += 1) {
    const heavy = stub && ci === 1;
    board.poly([{ x: xs[ci]!, y: mainTop }, { x: xs[ci]!, y: bottom }], heavy ? { stroke: RULE, width: 1.5 } : { stroke: LIGHT, width: 1 });
  }
  {
    let y = y0;
    groupLines.forEach((row, gi) => {
      for (const g of row.slice(1)) board.poly([{ x: xs[g.from]!, y }, { x: xs[g.from]!, y: y + groupH[gi]! }], { stroke: RULE, width: 1.2 });
      y += groupH[gi]!;
    });
  }
  // The frame, last so it sits over the fills.
  board.poly(
    [{ x: x0, y: y0 }, { x: right, y: y0 }, { x: right, y: bottom }, { x: x0, y: bottom }],
    { stroke: INK, width: 1.6, close: true },
  );

  // ---- text ---------------------------------------------------------------------

  const put = (runs: TextRun[], cx: number, cy: number, o: { size: number; weight: number; colour: string; id: string; boxW?: number }): void => {
    const w = o.boxW ?? runsWidth(runs, o.size, o.weight);
    const block: Block = board.label(runsText(runs), cx, cy, { size: o.size, weight: o.weight, colour: o.colour, id: o.id, width: w, freeStanding: true, claim: false });
    if (hasScripts(runs)) block.runs = runs.map((r) => ({ ...r }));
  };
  const stack = (lines: TextRun[][], cy: number): number[] => lines.map((_, k) => cy - (lines.length * LINE) / 2 + k * LINE + LINE / 2);

  titleLines.forEach((line, k) => {
    put(line, x0 + runsWidth(line, TITLE_SIZE, 700) / 2, M + k * TITLE_LINE + TITLE_LINE / 2, { size: TITLE_SIZE, weight: 700, colour: INK, id: `title-${k}` });
  });

  // Group headers.
  {
    let y = y0;
    groupLines.forEach((row, gi) => {
      for (const [k, g] of row.entries()) {
        const gx = xs[g.from]!;
        const gw = colW.slice(g.from, g.from + g.span).reduce((s, w) => s + w, 0);
        const ys = stack(g.lines, y + groupH[gi]! / 2);
        g.lines.forEach((line, li) => line.length > 0 && put(line, gx + gw / 2, ys[li]!, { size: SIZE, weight: 700, colour: INK, id: `group-${gi}-${k}${li === 0 ? "" : `-l${li + 1}`}` }));
      }
      y += groupH[gi]!;
    });
  }
  // Column headers.
  headLinesPer.forEach((lines, ci) => {
    const ys = stack(lines, mainTop + headH / 2);
    lines.forEach((line, li) => put(line, xs[ci]! + colW[ci]! / 2, ys[li]!, { size: SIZE, weight: 700, colour: INK, id: `head-${ci}-${li}` }));
  });

  // Cells.
  body.forEach((cells, r) => {
    const isTotals = hasTotals && r === body.length - 1;
    const cy = rowTop[r]! + rowH[r]! / 2;
    cells.forEach((c, ci) => {
      const lines = cellLines(c, ci, Math.max(natural[ci]!, MIN_CONTENT));
      if (lines.every((l) => l.length === 0)) return;
      const marker = c.kind === "blank" || !shown(c);
      const weight = weightOf(c, ci);
      const align = cols[ci]!.align ?? (numeric[ci] && !(stub && ci === 0) ? "right" : "left");
      // The numbers' common right edge: the widest number sets a block that is centred under the header.
      const numW = Math.max(...body.map((row) => (row[ci]!.kind === "number" ? runsWidth(row[ci]!.runs, SIZE, weightOf(row[ci]!, ci)) : 0)));
      const ys = stack(lines, cy);
      lines.forEach((line, li) => {
        const w = runsWidth(line, SIZE, marker ? 400 : weight);
        const centre = xs[ci]! + colW[ci]! / 2;
        let cx: number;
        if (numberLike[ci] && cols[ci]!.align === undefined && !marker && lines.length === 1 && c.kind === "text") {
          // Commas on one vertical, the block of numbers centred under the header.
          const parts = body
            .map((row) => row[ci]!)
            .filter((cell) => cell.kind === "text" && cell.runs.length > 0)
            .map((cell) => {
              const cw = weightOf(cell, ci);
              const left = intPartWidth(cell.runs, SIZE, cw);
              return { left, right: runsWidth(cell.runs, SIZE, cw) - left };
            });
          const maxL = Math.max(...parts.map((p) => p.left));
          const maxR = Math.max(...parts.map((p) => p.right));
          const comma = centre - (maxL + maxR) / 2 + maxL;
          cx = comma - intPartWidth(line, SIZE, weight) + w / 2;
        } else if (align === "center") cx = centre;
        else if (align === "left") cx = xs[ci]! + PAD_X + w / 2;
        else cx = (c.kind === "number" || marker ? centre + Math.max(numW, 0) / 2 : xs[ci]! + colW[ci]! - PAD_X) - w / 2;
        put(line, cx, ys[li]!, {
          size: SIZE,
          weight: marker ? 400 : weight,
          colour: marker ? SOFT : c.bold && lit(r, ci) && !isTotals ? ACCENT : INK,
          id: li === 0 ? `cell-${r}-${ci}` : `cell-${r}-${ci}-l${li + 1}`,
        });
      });
    });
  });

  // Notes.
  {
    let y = bottom + 10;
    captionLines.forEach((line, k) => {
      put(line, x0 + runsWidth(line, NOTE_SIZE, 400) / 2, y + NOTE_LINE / 2, { size: NOTE_SIZE, weight: 400, colour: SOFT, id: `caption-${k}` });
      y += NOTE_LINE;
    });
    sourceLines.forEach((line, k) => {
      put(line, x0 + runsWidth(line, NOTE_SIZE - 1, 400) / 2, y + NOTE_LINE / 2, { size: NOTE_SIZE - 1, weight: 400, colour: SOFT, id: `source-${k}` });
      y += NOTE_LINE;
    });
  }

  return parseSpec(board.spec(input.title === undefined ? "tabela" : runsText(markup(input.title))));
}

// ---- validation ---------------------------------------------------------------

const ALIGNS = ["left", "center", "right"] as const;
const NAMED_FORMATS = ["integer", "percent", "money"] as const;

export function validateDataTableInput(raw: Record<string, unknown>): void {
  const path = "data-table";
  v.optionalString(raw, "title", path);
  v.optionalString(raw, "caption", path);
  v.optionalString(raw, "source", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  v.optionalBoolean(raw, "stub", path);
  v.optionalBoolean(raw, "answers", path);
  v.optionalEnum(raw, "blank", path, ["?", "____"] as const);

  const columns = v.nonEmptyArray(raw, "columns", path, "columns");
  if (columns.length > MAX_COLUMNS) throw new SpecError(`${path}.columns has ${columns.length} entries; at most ${MAX_COLUMNS} fit a page.`);
  columns.forEach((col, i) => {
    const at = `${path}.columns[${i}]`;
    const o = v.object(col, at);
    v.requiredString(o, "header", at);
    v.optionalString(o, "unit", at);
    v.optionalString(o, "from", at);
    const id = v.optionalString(o, "id", at);
    if (id !== undefined && !/^[A-Za-z][A-Za-z0-9]*$/.test(id)) throw new SpecError(`${at}.id must be a letter followed by letters or digits, got ${JSON.stringify(id)}`);
    v.optionalEnum(o, "align", at, ALIGNS);
    const f = o.format;
    if (f !== undefined && typeof f !== "string") {
      const fo = v.object(f, `${at}.format`);
      const d = v.optionalNumber(fo, "decimals", `${at}.format`);
      if (d !== undefined && (!Number.isInteger(d) || d < 0 || d > 8)) throw new SpecError(`${at}.format.decimals must be an integer from 0 to 8, got ${d}`);
      if (fo.grouping !== undefined && typeof fo.grouping !== "boolean" && fo.grouping !== "space") throw new SpecError(`${at}.format.grouping must be true, false or "space", got ${JSON.stringify(fo.grouping)}`);
      v.optionalBoolean(fo, "percent", `${at}.format`);
      v.optionalString(fo, "prefix", `${at}.format`);
      v.optionalString(fo, "suffix", `${at}.format`);
    } else if (f !== undefined && !(NAMED_FORMATS as readonly string[]).includes(f)) {
      throw new SpecError(`${at}.format must be one of ${NAMED_FORMATS.join(", ")} or an object, got ${JSON.stringify(f)}`);
    }
  });

  const rows = v.nonEmptyArray(raw, "rows", path, "rows");
  rows.forEach((row, r) => {
    if (!Array.isArray(row)) throw new SpecError(`${path}.rows[${r}] must be an array of cells, got ${JSON.stringify(row)}`);
    row.forEach((cell, c) => {
      const at = `${path}.rows[${r}][${c}]`;
      if (cell === null || typeof cell === "string") return;
      if (typeof cell === "number") {
        v.finite(cell, at);
        return;
      }
      const o = v.object(cell, at);
      const a = o.answer;
      if (typeof a === "number") v.finite(a, `${at}.answer`);
      else if (typeof a !== "string") throw new SpecError(`${at} must be text, a number, null, or { "answer": text-or-number }, got ${JSON.stringify(cell)}`);
      for (const key of Object.keys(o)) if (key !== "answer") throw new SpecError(`${at}.${key} is not a field; a cell object has only "answer"`);
    });
  });

  if (raw.headerRows !== undefined) {
    if (!Array.isArray(raw.headerRows)) throw new SpecError(`${path}.headerRows must be an array of rows of { text, span }`);
    raw.headerRows.forEach((row, k) => {
      const at = `${path}.headerRows[${k}]`;
      if (!Array.isArray(row) || row.length === 0) throw new SpecError(`${at} must be a non-empty array of { text, span }`);
      let total = 0;
      row.forEach((g, j) => {
        const o = v.object(g, `${at}[${j}]`);
        v.requiredString(o, "text", `${at}[${j}]`);
        const span = o.span;
        if (typeof span !== "number" || !Number.isInteger(span) || span < 1) throw new SpecError(`${at}[${j}].span must be a positive integer, got ${JSON.stringify(span)}`);
        total += span;
      });
      if (total !== columns.length) throw new SpecError(`${at}: the spans add up to ${total}, but the table has ${columns.length} columns.`);
    });
  }

  if (raw.highlight !== undefined) {
    if (!Array.isArray(raw.highlight)) throw new SpecError(`${path}.highlight must be an array of { row?, col? }`);
    raw.highlight.forEach((h, k) => {
      const o = v.object(h, `${path}.highlight[${k}]`);
      v.optionalNumber(o, "row", `${path}.highlight[${k}]`);
      const col = o.col;
      if (col !== undefined && typeof col !== "string" && typeof col !== "number") throw new SpecError(`${path}.highlight[${k}].col must be an index, a letter or an id, got ${JSON.stringify(col)}`);
    });
  }

  if (raw.totals !== undefined) {
    const t = v.object(raw.totals, `${path}.totals`);
    v.optionalString(t, "label", `${path}.totals`);
    const by = v.object(t.by, `${path}.totals.by`);
    if (Object.keys(by).length === 0) throw new SpecError(`${path}.totals.by must name at least one column`);
  }

  expandDataTable(raw as unknown as DataTableInput);
}
