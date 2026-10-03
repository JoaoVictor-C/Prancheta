/**
 * statistics -- descriptive statistics of RAW DATA, for Estatística and ENEM:
 * "construa o histograma", "desenhe o boxplot e identifique os outliers".
 *
 * The data are the only typed numbers. Everything drawn and printed is computed
 * from them by `src/math/statistics.ts`:
 *
 *  - the classes (Sturges' rule with a round width, or the author's start and
 *    width, or explicit edges), each observation counted into [a; b) with the
 *    last class closed, the frequencies fᵢ, frᵢ, Fᵢ, xᵢ and the bar heights;
 *  - the quartiles by ONE stated method, the fences Q₁ − 1,5·IQR and
 *    Q₃ + 1,5·IQR, the whiskers (the most extreme observations inside them) and
 *    the outliers beyond;
 *  - n, x̄, Md, Mo, the variance and standard deviation (sample or population,
 *    said in the figure), amplitude, IQR.
 *
 * This is not `chart`, which plots values it is handed: a chart's bars are
 * separated categories with a gap, a histogram's bars TOUCH because the classes
 * are consecutive intervals of one numeric scale, and no bar height is typed.
 *
 * Drawing follows the project's rules: horizontal frequency gridlines are the
 * frame's own (grid furniture), the axes and bars are ink, tick numbers are
 * grid furniture too, and every other label is placed only after all the ink is
 * down, each declaring what it names (ADR 0035).
 */

import type { Block, FigureSpec, Frame, Point, Scene } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { LOCALES, MINUS, formatNumber, roundKeepingNonzero, formatSignificant, parseNumber, snapExact } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";
import type { LabelOptions } from "../function-graph/board.ts";
import { Placer } from "../construction/place.ts";
import type { Claim } from "../construction/place.ts";
import {
  QUARTILE_METHODS,
  boxStats,
  decimalsOf,
  frequencyTable,
  mean,
  modalClasses,
  modes,
  standardDeviation,
  startWidthClasses,
  sturges,
  sturgesClasses,
  variance,
} from "../../math/statistics.ts";
import type { BoxStats, ClassScheme, FrequencyRow, QuartileMethod, VarianceKind } from "../../math/statistics.ts";
import { distanceToPolyline, rectAt } from "../../geometry/hit.ts";
import { niceStep } from "../shared/scale.ts";
import { packItems } from "../shared/text.ts";
import { runsWidth, layoutPanel } from "../shared/panel.ts";
import type { PanelLineInput } from "../shared/panel.ts";
import { tidy } from "../../math/numeric.ts";

// ---- input ------------------------------------------------------------------------

export type StatisticsKind = "histogram" | "boxplot" | "both";
export type FrequencyKind = "absolute" | "relative" | "percent" | "density";
export type DataGroup = { values: number[]; label?: string };
export type ClassesInput = { start: number; width: number } | number[] | "sturges";

export type StatisticsInput = {
  title?: string;
  locale?: Locale;
  kind: StatisticsKind;
  data: number[] | DataGroup[];
  classes?: ClassesInput;
  frequency?: FrequencyKind;
  /** Join the class midpoints (closed to the axis at the empty neighbouring classes). */
  polygon?: boolean;
  showTable?: boolean;
  showStats?: boolean;
  quartileMethod?: QuartileMethod;
  /** `sample`: s² divides by n − 1 (default); `population`: σ² divides by n. */
  variance?: VarianceKind;
  unit?: string;
  /** What the observations are ("Altura"): names the x axis. */
  variable?: string;
  /** false: the figure of the QUESTION -- the drawing and the classes, none of the computed statistics (see PRESET.md). Default true. */
  answers?: boolean;
};

// ---- palette and constants --------------------------------------------------------------

const PAPER = "#FCFBF7";
const INK = "#181B21";
const SOFT = "#4E5763";
const AXIS = "#3A424D";
const LIGHT = "#D8DCE3";
const HEAD_TINT = "#EEF1F6";
const BAR_FILL = "#BFD4EC";
const BAR_EDGE = "#2F5D9B";
const POLY = "#B3400C";
const POLY_TEXT = "#9A3508";
const GROUPS = [
  { fill: "#CFE0F3", edge: "#2F5D9B" },
  { fill: "#F6D9C7", edge: "#B3400C" },
  { fill: "#CFE9D8", edge: "#1E7A46" },
  { fill: "#E4D6F0", edge: "#6B3FA0" },
];

const M = 24;
const TICK_SIZE = 12;
const LABEL_SIZE = 13;
const PLOT_H = 300;
const BOX_ROW = 96;
const BOX_HALF = 16;
const TABLE_ROW = 26;
const TABLE_HEAD = 34;
const NOTE_LINE = 22;
const MAX_GROUPS = 4;
const MAX_CLASSES = 30;

// ---- number writing ------------------------------------------------------------------------

/**
 * formatNumber keeps three decimal places, which is three significant figures
 * from 0,1 up and NONE below 0,001: a variance of 0,00000622 g² printed as
 * "0", and 0,0042 as "0,004". Below 0,1 the places follow the magnitude
 * instead -- three significant figures, trailing zeros dropped.
 */
function plain(t: number, locale: Locale): string {
  const a = Math.abs(t);
  if (a === 0 || a >= 0.1) return formatNumber(t, locale, { fractions: false });
  return formatSignificant(t, 3, locale);
}

/** A value the way a statistics text writes it: exact when it is short ("172,5"), "√5 ≈ 2,236" when a root, else rounded and flagged. */
export function describeNumber(x: number, locale: Locale = "pt-BR"): { sym: "=" | "≈"; text: string } {
  const t = tidy(x);
  if (Math.abs(t) < 1e-12) return { sym: "=", text: "0" };
  const short = plain(t, locale);
  const back = parseNumber(short, locale);
  if (back !== null && Math.abs(back - t) <= 1e-9 * Math.abs(t)) return { sym: "=", text: short };
  const e = snapExact(t, 1e-9);
  if (e.exact && e.form === "sqrt") return { sym: "=", text: `${e.value < 0 ? MINUS : ""}√${e.n} ≈ ${short}` };
  return { sym: "≈", text: short };
}

const withUnit = (text: string, unit: string | undefined, power = 1): string => (unit === undefined ? text : `${text} ${unit}${power === 2 ? "²" : ""}`);

const num = (x: number, locale: Locale): string => plain(tidy(x), locale);

/** Three significant figures, for a density that may be 0,0214. */
const sig3 = (x: number, locale: Locale): string => formatNumber(Number(x.toPrecision(3)), locale, { fractions: false });

// ---- validation and normalisation -----------------------------------------------------------------

type Group = { values: number[]; label: string | undefined };

function readGroups(raw: unknown): Group[] {
  const path = "statistics.data";
  if (!Array.isArray(raw) || raw.length === 0) throw new SpecError(`${path} must be a non-empty array of numbers, or of groups {values, label}`);
  if (raw.every((x) => typeof x === "number")) {
    return [{ values: readValues(raw, path), label: undefined }];
  }
  if (raw.some((x) => typeof x === "number")) throw new SpecError(`${path} mixes numbers and groups; give all numbers, or all {values, label} groups`);
  if (raw.length > MAX_GROUPS) throw new SpecError(`${path} has ${raw.length} groups; at most ${MAX_GROUPS} fit side by side`);
  const groups = raw.map((g, i) => {
    const at = `${path}[${i}]`;
    const o = v.object(g, at);
    for (const key of Object.keys(o)) if (key !== "values" && key !== "label") throw new SpecError(`${at}.${key} is not a field; use values and label`);
    const label = v.optionalString(o, "label", at);
    return { values: readValues(o.values, `${at}.values`), label };
  });
  if (groups.length > 1) {
    const seen = new Set<string>();
    groups.forEach((g, i) => {
      const name = g.label ?? `Grupo ${i + 1}`;
      if (seen.has(name)) throw new SpecError(`${path}: the group name ${JSON.stringify(name)} is used twice`);
      seen.add(name);
    });
  }
  return groups;
}

function readValues(raw: unknown, path: string): number[] {
  if (!Array.isArray(raw)) throw new SpecError(`${path} must be an array of numbers, got ${JSON.stringify(raw)}`);
  if (raw.length < 2) throw new SpecError(`${path} has ${raw.length} observation(s); quartiles and a histogram need at least two`);
  return raw.map((x, i) => v.finite(x, `${path}[${i}]`));
}

/** The classes for a histogram of `xs`, and where they came from. */
export function classSchemeFor(xs: readonly number[], classes: ClassesInput | undefined): ClassScheme {
  const path = "statistics.classes";
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  let scheme: ClassScheme;
  if (classes === undefined || classes === "sturges") {
    if (!(hi > lo)) throw new SpecError("statistics: every observation is the same value, so there is no interval to divide into classes");
    scheme = sturgesClasses(xs);
  } else if (Array.isArray(classes)) {
    const edges = classes.map((e, i) => v.finite(e, `${path}[${i}]`));
    if (edges.length < 2) throw new SpecError(`${path} must list at least two class edges`);
    for (let i = 1; i < edges.length; i += 1) {
      if (!(edges[i]! > edges[i - 1]!)) throw new SpecError(`${path} must be strictly increasing; edge ${i} (${edges[i]}) does not exceed edge ${i - 1} (${edges[i - 1]})`);
    }
    scheme = { edges, origin: "edges" };
  } else if (typeof classes === "object" && classes !== null) {
    const o = v.object(classes, path);
    for (const key of Object.keys(o)) if (key !== "start" && key !== "width") throw new SpecError(`${path}.${key} is not a field; use start and width`);
    const start = v.requiredNumber(o, "start", path);
    const width = v.requiredNumber(o, "width", path);
    if (!(width > 0)) throw new SpecError(`${path}.width must be positive, got ${width}`);
    if (start > lo) throw new SpecError(`${path}.start = ${start} is above the smallest observation ${lo}; the first class must reach it`);
    scheme = startWidthClasses(xs, start, width);
  } else {
    throw new SpecError(`${path} must be "sturges", {start, width} or a list of edges, got ${JSON.stringify(classes)}`);
  }
  const first = scheme.edges[0]!;
  const last = scheme.edges[scheme.edges.length - 1]!;
  if (first > lo + 1e-9) throw new SpecError(`${path}: the first edge ${first} is above the smallest observation ${lo}; nothing is dropped silently`);
  if (last < hi - 1e-9) throw new SpecError(`${path}: the last edge ${last} is below the largest observation ${hi}; nothing is dropped silently`);
  if (scheme.edges.length - 1 > MAX_CLASSES) throw new SpecError(`${path}: ${scheme.edges.length - 1} classes; at most ${MAX_CLASSES} are legible`);
  return scheme;
}

// ---- text helpers over the board ---------------------------------------------------------------------

type Anchor = "start" | "center" | "end";
type PutOptions = LabelOptions & { anchor?: Anchor };

/** A label whose anchor edge (or centre) sits at x, vertically centred on y. */
function put(board: Board, text: string, x: number, y: number, o: PutOptions = {}): Block {
  const anchor = o.anchor ?? "center";
  const { w } = board.extent(text, o);
  const cx = anchor === "start" ? x + w / 2 : anchor === "end" ? x - w / 2 : x;
  const { anchor: _a, ...rest } = o;
  return board.label(text, cx, y, { ...rest, width: w, align: anchor });
}

const tickWidth = (board: Board, text: string, size = TICK_SIZE): number => board.extent(text, { size }).w;

// ---- tables -----------------------------------------------------------------------------------------------

type TableSpec = { id: string; head: string[]; rows: string[][]; foot?: string[]; firstColumnStart?: boolean };

function tableMeasure(board: Board, t: TableSpec): { colW: number[]; w: number; h: number } {
  const all = [t.head, ...t.rows, ...(t.foot === undefined ? [] : [t.foot])];
  // Head and foot are set bold, the body at 500: each measured at its own weight.
  const weightOf = (ri: number): number => (ri === 0 || (t.foot !== undefined && ri === all.length - 1) ? 700 : 500);
  const colW = t.head.map((_, c) => Math.max(46, ...all.map((r, ri) => board.measure(r[c] ?? "", LABEL_SIZE, 0.1, weightOf(ri)) + (ri === 0 ? 26 : 22))));
  return { colW, w: colW.reduce((s, x) => s + x, 0), h: TABLE_HEAD + (t.rows.length + (t.foot === undefined ? 0 : 1)) * TABLE_ROW };
}

/** A ruled table with every column as wide as its widest cell; returns the bottom edge. */
function tableDraw(board: Board, t: TableSpec, x0: number, y0: number): number {
  const { colW, w, h } = tableMeasure(board, t);
  const right = x0 + w;
  const bottom = y0 + h;
  board.marks.push({
    id: `${t.id}-head-tint`,
    from: { x: x0, y: y0 },
    segments: [{ line: { x: right, y: y0 } }, { line: { x: right, y: y0 + TABLE_HEAD } }, { line: { x: x0, y: y0 + TABLE_HEAD } }],
    close: true,
    fill: HEAD_TINT,
    stroke: "none",
    strokeWidth: 0,
  });
  board.poly([{ x: x0, y: y0 }, { x: right, y: y0 }], { stroke: AXIS, width: 1.6, id: `${t.id}-rule-top` });
  board.poly([{ x: x0, y: y0 + TABLE_HEAD }, { x: right, y: y0 + TABLE_HEAD }], { stroke: AXIS, width: 1.4, id: `${t.id}-rule-head` });
  board.poly([{ x: x0, y: bottom }, { x: right, y: bottom }], { stroke: AXIS, width: 1.6, id: `${t.id}-rule-bottom` });
  for (let r = 1; r < t.rows.length + (t.foot === undefined ? 0 : 1); r += 1) {
    const y = y0 + TABLE_HEAD + r * TABLE_ROW;
    const isFoot = t.foot !== undefined && r === t.rows.length;
    board.poly([{ x: x0, y }, { x: right, y }], { stroke: isFoot ? AXIS : LIGHT, width: isFoot ? 1.2 : 1, id: `${t.id}-rule-${r}` });
  }
  let cx = x0;
  colW.forEach((cw, c) => {
    if (c > 0) board.poly([{ x: cx, y: y0 }, { x: cx, y: bottom }], { stroke: LIGHT, width: 1, id: `${t.id}-col-${c}` });
    const mid = cx + cw / 2;
    put(board, t.head[c]!, mid, y0 + TABLE_HEAD / 2, { size: LABEL_SIZE, weight: 700, colour: INK, freeStanding: true, id: `${t.id}-head-${c}` });
    t.rows.forEach((row, r) => {
      put(board, row[c] ?? "", mid, y0 + TABLE_HEAD + r * TABLE_ROW + TABLE_ROW / 2, { size: LABEL_SIZE, weight: 500, colour: INK, freeStanding: true, id: `${t.id}-cell-${r}-${c}` });
    });
    if (t.foot !== undefined) {
      put(board, t.foot[c] ?? "", mid, y0 + TABLE_HEAD + t.rows.length * TABLE_ROW + TABLE_ROW / 2, { size: LABEL_SIZE, weight: 700, colour: INK, freeStanding: true, id: `${t.id}-foot-${c}` });
    }
    cx += cw;
  });
  return bottom;
}

// ---- the model: everything computed before anything is drawn -------------------------------------------------

type Hist = {
  scheme: ClassScheme;
  rows: FrequencyRow[];
  heights: number[];
  polygon: boolean;
  /** Every edge the x axis spans: the classes', plus the two empty neighbours when the polygon is drawn. */
  axisEdges: number[];
  ytop: number;
  ystep: number;
  yticks: number[];
  yTitle: string;
  valueText: (i: number) => string;
  tickText: (y: number) => string;
  modalIdx: number[];
};

function buildHist(xs: number[], input: StatisticsInput, locale: Locale, answers: boolean): Hist {
  const scheme = classSchemeFor(xs, input.classes);
  const rows = frequencyTable(xs, scheme.edges);
  const frequency = input.frequency ?? "absolute";
  const uniform = rows.every((r) => Math.abs(r.width - rows[0]!.width) < 1e-9);
  if (!uniform && frequency !== "density") {
    throw new SpecError(
      `statistics.frequency: the classes have unequal widths (${rows.map((r) => num(r.width, locale)).join("; ")}), so bar heights by ${frequency} frequency would make a wide class look crowded; use frequency "density", which divides by the width`,
    );
  }
  const unit = input.unit;
  const heights = rows.map((r) => (frequency === "absolute" ? r.count : frequency === "relative" ? r.relative : frequency === "percent" ? r.relative * 100 : r.density));
  // The frequency polygon is a derived drawing: an exercise that draws it asks for it.
  const polygon = input.polygon === true && answers;
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  const axisEdges = polygon ? [round(first.lo - first.width), ...scheme.edges, round(last.hi + last.width)] : scheme.edges;
  const ymax = Math.max(...heights);
  let ystep = niceStep(ymax * 1.1, 8);
  if (frequency === "absolute") ystep = Math.max(1, ystep);
  const ytop = tidy(Math.max(ystep, Math.ceil((ymax * 1.06) / ystep - 1e-9) * ystep));
  const yticks: number[] = [];
  for (let i = 0; i * ystep <= ytop + 1e-9; i += 1) yticks.push(tidy(i * ystep));
  const yTitle =
    frequency === "absolute"
      ? "frequência absoluta (fᵢ)"
      : frequency === "relative"
        ? "frequência relativa (frᵢ)"
        : frequency === "percent"
          ? "frequência relativa (%)"
          : `densidade de frequência (fᵢ / (n·hᵢ))${unit === undefined ? "" : `, em 1/${unit}`}`;
  const valueText = (i: number): string =>
    frequency === "absolute" ? String(rows[i]!.count) : frequency === "percent" ? `${num(heights[i]!, locale)}%` : frequency === "density" ? sig3(heights[i]!, locale) : num(heights[i]!, locale);
  return {
    scheme,
    rows,
    heights,
    polygon,
    axisEdges,
    ytop,
    ystep,
    yticks,
    yTitle,
    valueText,
    tickText: (y) => (frequency === "density" ? sig3(y, locale) : num(y, locale)),
    modalIdx: modalClasses(rows, frequency === "density" ? "density" : "count"),
  };
}

const round = (x: number): number => Number(x.toFixed(10));

type GroupModel = { name: string; values: number[]; stats: BoxStats; colour: { fill: string; edge: string } };

type Model = {
  locale: Locale;
  kind: StatisticsKind;
  groups: GroupModel[];
  hist: Hist | undefined;
  method: QuartileMethod;
  varianceKind: VarianceKind;
  unit: string | undefined;
  variable: string;
  showTable: boolean;
  showStats: boolean;
  /** false: hide every computed statistic (panel, quartile labels, bar frequencies, computed table columns, polygon). */
  answers: boolean;
};

function buildModel(input: StatisticsInput): Model {
  const locale = input.locale ?? "pt-BR";
  if (input.kind !== "histogram" && input.kind !== "boxplot" && input.kind !== "both") {
    throw new SpecError(`statistics.kind must be "histogram", "boxplot" or "both", got ${JSON.stringify(input.kind)}`);
  }
  const groupsRaw = readGroups(input.data);
  if (input.kind !== "boxplot" && groupsRaw.length > 1) {
    throw new SpecError(`statistics: a histogram summarises ONE data set, but data has ${groupsRaw.length} groups; give a single list, or use kind "boxplot" to set groups side by side`);
  }
  const method = input.quartileMethod ?? "halves";
  if (!QUARTILE_METHODS.includes(method)) throw new SpecError(`statistics.quartileMethod must be one of ${QUARTILE_METHODS.join(", ")}, got ${JSON.stringify(method)}`);
  const varianceKind = input.variance ?? "sample";
  if (varianceKind !== "sample" && varianceKind !== "population") throw new SpecError(`statistics.variance must be "sample" or "population", got ${JSON.stringify(varianceKind)}`);
  const freq = input.frequency;
  if (freq !== undefined && !["absolute", "relative", "percent", "density"].includes(freq)) {
    throw new SpecError(`statistics.frequency must be absolute, relative, percent or density, got ${JSON.stringify(freq)}`);
  }
  const groups: GroupModel[] = groupsRaw.map((g, i) => ({
    name: g.label ?? (groupsRaw.length > 1 ? `Grupo ${i + 1}` : ""),
    values: g.values,
    stats: boxStats(g.values, method),
    colour: GROUPS[i % GROUPS.length]!,
  }));
  const wantsHist = input.kind !== "boxplot";
  return {
    locale,
    kind: input.kind,
    groups,
    hist: wantsHist ? buildHist(groups[0]!.values, input, locale, input.answers !== false) : undefined,
    method,
    varianceKind,
    unit: input.unit,
    variable: input.variable ?? "x",
    showTable: input.showTable === true,
    showStats: input.showStats !== false,
    answers: input.answers !== false,
  };
}

// ---- the reading panel: text computed from the data ---------------------------------------------------------------

const METHOD_NOTE: Record<QuartileMethod, string> = {
  halves: "quartis: Q₁ e Q₃ são as medianas da metade inferior e da metade superior (com n ímpar, a mediana fica fora das metades)",
  tukey: "quartis: Q₁ e Q₃ são as medianas das metades, e com n ímpar a mediana entra nas duas (dobradiças de Tukey)",
  linear: "quartis: interpolação linear entre os valores ordenados, na posição 1 + (n − 1)·p (QUARTIL.INC do Excel, tipo 7 do R)",
};

function modeText(values: number[], locale: Locale, unit: string | undefined): string {
  const ms = modes(values);
  if (ms.length === 0) return "Mo: amodal (nenhum valor se repete)";
  const list = ms.map((m) => num(m, locale)).join("; ");
  return `Mo = ${withUnit(list, unit)}${ms.length > 1 ? (ms.length === 2 ? " (bimodal)" : " (multimodal)") : ""}`;
}

function classLabel(r: FrequencyRow, i: number, k: number, locale: Locale): string {
  return `[${num(r.lo, locale)}; ${num(r.hi, locale)}${i === k - 1 ? "]" : ")"}`;
}

/** Lines of text: each an array of items packed left to right within the width, a new line per group. */
function panelGroups(m: Model): { items: string[]; colour: string; weight: number }[] {
  const { locale, unit } = m;
  const out: { items: string[]; colour: string; weight: number }[] = [];
  const say = (items: string[], colour = INK, weight = 500): void => {
    out.push({ items, colour, weight });
  };
  const eq = (name: string, x: number, u: string | undefined, power = 1): string => {
    const d = describeNumber(x, locale);
    return `${name} ${d.sym} ${withUnit(d.text, u, power)}`;
  };
  const s2 = m.varianceKind === "sample" ? "s²" : "σ²";
  const s1 = m.varianceKind === "sample" ? "s" : "σ";
  const divisor = m.varianceKind === "sample" ? "amostral: divisor n − 1" : "populacional: divisor n";

  if (m.groups.length === 1) {
    const g = m.groups[0]!;
    const st = g.stats;
    const first: string[] = [`n = ${st.n}`, eq("x̄", mean(g.values), unit), eq("Md", st.median, unit), modeText(g.values, locale, unit)];
    if (m.hist !== undefined) {
      const ks = m.hist.modalIdx.map((i) => classLabel(m.hist!.rows[i]!, i, m.hist!.rows.length, locale));
      first.push(`classe modal: ${ks.join(" e ")}`);
    }
    say(first);
    if (m.varianceKind === "sample" && st.n < 2) say([`${s2}: indefinida com n = 1`]);
    else {
      say([eq(s2, variance(g.values, m.varianceKind), unit, 2), eq(s1, standardDeviation(g.values, m.varianceKind), unit), `(${divisor})`, `A = ${num(st.max, locale)} ${MINUS} ${num(st.min, locale)} = ${withUnit(num(st.max - st.min, locale), unit)}`]);
    }
    if (m.kind !== "histogram") {
      say([
        `Q₁ = ${num(st.q1, locale)}`,
        `Q₃ = ${num(st.q3, locale)}`,
        `IQR = Q₃ ${MINUS} Q₁ = ${num(st.q3, locale)} ${MINUS} ${num(st.q1, locale)} = ${withUnit(num(st.iqr, locale), unit)}`,
      ]);
      say([`limites: [Q₁ ${MINUS} 1,5·IQR; Q₃ + 1,5·IQR] = [${num(st.lowFence, locale)}; ${num(st.highFence, locale)}]`, outlierText(st.outliers, locale, unit)]);
    }
  }
  return out;
}

function outlierText(outliers: number[], locale: Locale, unit: string | undefined): string {
  if (outliers.length === 0) return "nenhum outlier";
  const distinct = [...new Set(outliers)];
  const list = distinct.map((x) => `${num(x, locale)}${outliers.filter((y) => y === x).length > 1 ? ` (×${outliers.filter((y) => y === x).length})` : ""}`).join("; ");
  return `${outliers.length === 1 ? "outlier" : "outliers"}: ${withUnit(list, unit)}`;
}

/** The notes every figure carries: conventions, the method, the variance divisor. All statements, none a number typed by hand. */
function noteSentences(m: Model, xs: number[] | undefined): string[] {
  const out: string[] = [];
  const { locale } = m;
  if (m.hist !== undefined && xs !== undefined) {
    const h = m.hist;
    out.push("classes [a; b): fechadas à esquerda e abertas à direita; a última classe é fechada nas duas pontas");
    if (h.scheme.origin === "sturges" && m.answers) {
      const n = xs.length;
      const lo = Math.min(...xs);
      const hi = Math.max(...xs);
      const k = h.scheme.requested ?? sturges(n);
      const raw = 1 + 3.3 * Math.log10(n);
      const width = h.rows[0]!.width;
      out.push(
        `Sturges: k = 1 + 3,3·log ${n} = ${formatNumber(Number(raw.toFixed(2)), locale)} ≈ ${k}; amplitude A = ${num(hi, locale)} ${MINUS} ${num(lo, locale)} = ${num(hi - lo, locale)}; largura h ≥ A/k = ${formatNumber(roundKeepingNonzero((hi - lo) / k, 3), locale)}, arredondada para ${num(width, locale)}`,
      );
    }
    if (h.polygon && m.answers) out.push("polígono de frequências: une os pontos médios das classes, fechado no eixo pelas classes vizinhas de frequência 0");
    if (h.rows.some((r) => Math.abs(r.width - h.rows[0]!.width) > 1e-9)) out.push("classes de larguras diferentes: a altura é a densidade fᵢ/(n·hᵢ), e é a ÁREA da barra que vale a frequência relativa");
  }
  if (m.kind !== "histogram") {
    out.push(METHOD_NOTE[m.method]);
    out.push(`outlier: valor fora de [Q₁ ${MINUS} 1,5·IQR; Q₃ + 1,5·IQR]; os bigodes vão até a observação mais extrema dentro desses limites`);
  }
  if (m.answers && (m.groups.length > 1 || m.showStats)) {
    out.push(m.varianceKind === "sample" ? "s² e s amostrais: soma dos quadrados dos desvios dividida por n − 1" : "σ² e σ populacionais: soma dos quadrados dos desvios dividida por n");
  }
  if (m.unit !== undefined && m.groups.length > 1) out.push(`valores em ${m.unit}`);
  return out;
}

function summaryTable(m: Model): TableSpec {
  const { locale } = m;
  const sd = m.varianceKind === "sample" ? "s" : "σ";
  return {
    id: "summary",
    head: ["grupo", "n", "x̄", "Md", sd, "Q₁", "Q₃", "IQR", "outliers"],
    rows: m.groups.map((g) => {
      const st = g.stats;
      if (!m.answers) return [g.name, "", "", "", "", "", "", "", ""];
      return [
        g.name,
        String(st.n),
        describeNumber(mean(g.values), locale).text,
        num(st.median, locale),
        num(standardDeviation(g.values, m.varianceKind), locale),
        num(st.q1, locale),
        num(st.q3, locale),
        num(st.iqr, locale),
        st.outliers.length === 0 ? "nenhum" : [...new Set(st.outliers)].map((x) => num(x, locale)).join("; "),
      ];
    }),
  };
}

function frequencyTableSpec(m: Model): TableSpec {
  const h = m.hist!;
  const { locale } = m;
  const k = h.rows.length;
  const density = h.yTitle.startsWith("densidade");
  const percent = h.yTitle.includes("(%)");
  const head = ["classe", "fᵢ", percent ? "frᵢ (%)" : "frᵢ", "Fᵢ", "xᵢ"];
  if (density) head.push("dᵢ");
  const rows = h.rows.map((r, i) => {
    if (!m.answers) return head.map((_, c) => (c === 0 ? classLabel(r, i, k, locale) : ""));
    const row = [classLabel(r, i, k, locale), String(r.count), percent ? num(r.relative * 100, locale) : num(r.relative, locale), String(r.cumulative), num(r.mid, locale)];
    if (density) row.push(sig3(r.density, locale));
    return row;
  });
  const total = h.rows.reduce((s, r) => s + r.count, 0);
  const foot = m.answers ? ["Σ", String(total), percent ? "100" : "1", "", ""] : head.map((_, c) => (c === 0 ? "Σ" : ""));
  if (density && m.answers) foot.push("");
  return { id: "freq", head, rows, foot };
}

// ---- the build ---------------------------------------------------------------------------------------------------------

type XScale = { lo: number; hi: number; left: number; width: number; px: (d: number) => number };

const makeScale = (lo: number, hi: number, left: number, width: number): XScale => ({ lo, hi, left, width, px: (d) => left + ((d - lo) / (hi - lo)) * width });

/** Nice tick values of a numeric x axis: multiples of a round step within [lo, hi]. */
function axisTicks(lo: number, hi: number): number[] {
  const step = niceStep(hi - lo, 9);
  const out: number[] = [];
  for (let i = Math.ceil(lo / step - 1e-9); i * step <= hi + 1e-9; i += 1) out.push(round(i * step));
  return out;
}

export function expandStatistics(input: StatisticsInput): FigureSpec {
  const m = buildModel(input);
  const { locale, unit } = m;
  const probe = new Board(10, 10, PAPER);
  const xs = m.groups[0]!.values;
  const hist = m.hist;

  // ---- widths, from the text ---------------------------------------------------------------
  const slots = hist === undefined ? 0 : hist.axisEdges.length - 1;
  const plotW = hist === undefined ? 600 : Math.min(660, Math.max(420, slots * 66));
  const yTickW = hist === undefined ? 0 : Math.max(...hist.yticks.map((y) => tickWidth(probe, hist.tickText(y))));
  const nameW = m.kind === "histogram" || (m.groups.length === 1 && m.groups[0]!.name === "") ? 0 : Math.max(...m.groups.map((g) => probe.measure(g.name, LABEL_SIZE)));
  const leftPad = Math.max(hist === undefined ? 0 : yTickW + 26, nameW === 0 ? 0 : nameW + 22, 40);
  const rightPad = 34;
  const plotBlockW = leftPad + plotW + rightPad;

  const tables: { spec: TableSpec; w: number }[] = [];
  if (hist !== undefined && m.showTable) {
    const spec = frequencyTableSpec(m);
    tables.push({ spec, w: tableMeasure(probe, spec).w });
  }
  if (m.groups.length > 1 && m.showStats) {
    const spec = summaryTable(m);
    tables.push({ spec, w: tableMeasure(probe, spec).w });
  }
  const W0 = Math.max(plotBlockW, 520, ...tables.map((t) => t.w));
  const W = Math.ceil(W0 + 2 * M);
  const ox = M + (W0 - plotBlockW) / 2;
  const plotLeft = ox + leftPad;

  const board = new Board(W, 10, PAPER);
  const frames: Frame[] = [];
  const placer = new Placer({ x: 4, y: 4, width: W - 8, height: 6000 });
  let y = M;

  const line = (id: string, pts: Point[], stroke: string, width: number): void => {
    board.poly(pts, { stroke, width, id });
    placer.addInk(id, pts, false);
  };

  // ---- the histogram --------------------------------------------------------------------------------
  let histScale: XScale | undefined;
  if (hist !== undefined) {
    const xlo = hist.axisEdges[0]!;
    const xhi = hist.axisEdges[hist.axisEdges.length - 1]!;
    const sc = makeScale(xlo, xhi, plotLeft, plotW);
    histScale = sc;
    const plotTop = y + 34;
    const base = plotTop + PLOT_H;
    const yUnit = PLOT_H / hist.ytop;
    const xUnit = plotW / (xhi - xlo);
    const frame: Frame & { origin: Point } = {
      id: "hist-plane",
      origin: { x: plotLeft - xlo * xUnit, y: base },
      xUnit,
      yUnit,
      grid: { x: { from: xlo, to: xhi, step: 2 * (xhi - xlo) }, y: { from: 0, to: hist.ytop, step: hist.ystep, origin: 0 }, axes: false, labels: false, locale },
    };
    frames.push(frame);
    board.addFrame(frame);
    const py = (val: number): number => base - val * yUnit;

    // Bars: touching, each a closed outline on the classes' own edges.
    hist.rows.forEach((r, i) => {
      const x0 = sc.px(r.lo);
      const x1 = sc.px(r.hi);
      const top = py(hist.heights[i]!);
      const pts = [{ x: x0, y: base }, { x: x1, y: base }, { x: x1, y: top }, { x: x0, y: top }];
      board.poly(pts, { close: true, fill: BAR_FILL, stroke: BAR_EDGE, width: 1.6, id: `bar-${i}` });
      placer.addInk(`bar-${i}`, [...pts, pts[0]!]);
    });

    // Axes, ticks.
    line("axis-y-hist", [{ x: plotLeft, y: base }, { x: plotLeft, y: plotTop }], AXIS, 1.8);
    line("axis-x-hist", [{ x: plotLeft, y: base }, { x: plotLeft + plotW, y: base }], AXIS, 1.8);
    hist.yticks.forEach((t, i) => {
      const yy = py(t);
      line(`tick-y-${i}`, [{ x: plotLeft - 5, y: yy }, { x: plotLeft, y: yy }], AXIS, 1.2);
      put(board, hist.tickText(t), plotLeft - 9, yy, { anchor: "end", size: TICK_SIZE, colour: SOFT, gridOf: frame.id });
    });
    // x numbers at the class edges, thinned when they would touch.
    const edgeTexts = hist.axisEdges.map((e) => num(e, locale));
    const widest = Math.max(...edgeTexts.map((t) => tickWidth(probe, t)));
    const gaps = hist.axisEdges.slice(1).map((e, i) => sc.px(e) - sc.px(hist.axisEdges[i]!));
    const stride = Math.max(1, Math.ceil((widest + 8) / Math.min(...gaps)));
    hist.axisEdges.forEach((e, i) => {
      const xx = sc.px(e);
      line(`tick-x-${i}`, [{ x: xx, y: base }, { x: xx, y: base + 5 }], AXIS, 1.2);
      if (i % stride === 0) put(board, edgeTexts[i]!, xx, base + 5 + 4 + 10, { size: TICK_SIZE, colour: SOFT, gridOf: frame.id });
    });
    put(board, `${m.variable}${unit === undefined ? "" : ` (${unit})`}`, plotLeft + plotW / 2, base + 5 + 4 + 20 + 14 + 8, { size: LABEL_SIZE, weight: 600, colour: INK, freeStanding: true, id: "axis-title-x-hist" });
    put(board, hist.yTitle, plotLeft - 8, plotTop - 22, { anchor: "start", size: LABEL_SIZE, weight: 600, colour: INK, freeStanding: true, id: "axis-title-y-hist" });

    // The frequency polygon.
    let polyPts: Point[] | undefined;
    if (hist.polygon) {
      const first = hist.rows[0]!;
      const last = hist.rows[hist.rows.length - 1]!;
      polyPts = [
        { x: sc.px(round(first.lo - first.width / 2)), y: base },
        ...hist.rows.map((r, i) => ({ x: sc.px(r.mid), y: py(hist.heights[i]!) })),
        { x: sc.px(round(last.hi + last.width / 2)), y: base },
      ];
      board.poly(polyPts, { stroke: POLY, width: 2.4, id: "polygon" });
      placer.addInk("polygon", polyPts);
    }

    // Dots last, so no line covers them.
    if (polyPts !== undefined) {
      polyPts.forEach((p, i) => {
        board.circle(p, 3.4, { fill: POLY, id: `polygon-dot-${i}` });
        placer.addInk(`polygon-dot-${i}`, [p], true, { c: p, r: 3.4 });
      });
    }

    // Labels: the frequency of each bar, wherever it fits clear of ink; then the polygon's name.
    const valueSize = 12;
    hist.rows.forEach((r, i) => {
      if (!m.answers) return;
      const text = hist.valueText(i);
      const { w, h } = board.extent(text, { size: valueSize, weight: 700 });
      const cx = (sc.px(r.lo) + sc.px(r.hi)) / 2;
      const top = py(hist.heights[i]!);
      const spots: { p: Point; inside: boolean }[] = [{ p: { x: cx, y: top - 5 - h / 2 }, inside: false }];
      const barH = base - top;
      if (barH >= h + 12) {
        const bw = sc.px(r.hi) - sc.px(r.lo);
        for (const t of [top + 5 + h / 2, (top + base) / 2, base - 5 - h / 2]) {
          for (const dx of [0, -bw / 4, bw / 4]) if (w / 2 + 4 <= bw / 2 + Math.abs(dx)) spots.push({ p: { x: cx + dx, y: t }, inside: true });
        }
      }
      const claim: Claim = { kind: "element", id: `bar-${i}` };
      const best = placer.choose(claim, w, h, spots.map((s) => s.p));
      if (best.cost !== 0) return;
      const inside = spots.find((s) => s.p === best.centre)?.inside ?? false;
      const block = board.label(text, best.centre.x, best.centre.y, { size: valueSize, weight: 700, colour: INK, width: w, annotates: `bar-${i}`, ...(inside ? { fill: BAR_FILL } : { fill: PAPER }) });
      placer.commit(rectAt(best.centre, w, h));
      void block;
    });
    if (polyPts !== undefined) {
      const text = "polígono";
      const { w, h } = board.extent(text, { size: LABEL_SIZE, weight: 700 });
      const spots = ringAround(polyPts, w, h);
      const best = placer.choose({ kind: "element", id: "polygon" }, w, h, spots);
      board.label(text, best.centre.x, best.centre.y, { size: LABEL_SIZE, weight: 700, colour: POLY_TEXT, width: w, annotates: "polygon", fill: PAPER });
      placer.commit(rectAt(best.centre, w, h));
    }
    y = base + 5 + 4 + 20 + 14 + 8 + 20;
  }

  // ---- the boxplots ------------------------------------------------------------------------------------
  if (m.kind !== "histogram") {
    if (hist !== undefined) y += 26;
    const ng = m.groups.length;
    const rowH = BOX_ROW;
    const secH = ng * rowH;
    let scale: XScale;
    if (histScale !== undefined) scale = histScale;
    else {
      const lo = Math.min(...m.groups.map((g) => Math.min(g.stats.min, g.stats.lowWhisker)));
      const hi = Math.max(...m.groups.map((g) => g.stats.max));
      const span = hi > lo ? hi - lo : 2;
      const pad = span * 0.06;
      const step = niceStep(span + 2 * pad, 9);
      const tlo = round(Math.floor((lo - pad) / step + 1e-9) * step);
      const thi = round(Math.ceil((hi + pad) / step - 1e-9) * step);
      scale = makeScale(tlo, thi === tlo ? tlo + step : thi, plotLeft, plotW);
    }
    const top = y;
    const axisY = top + secH + 10;
    const xUnit = plotW / (scale.hi - scale.lo);
    const ticks = axisTicks(scale.lo, scale.hi);
    const frame: Frame & { origin: Point } = {
      id: "box-plane",
      origin: { x: plotLeft - scale.lo * xUnit, y: axisY },
      xUnit,
      yUnit: 1,
      grid: { x: { from: scale.lo, to: scale.hi, step: niceStep(scale.hi - scale.lo, 9), origin: 0 }, y: { from: 0, to: secH + 10, step: 2 * (secH + 10) }, axes: false, labels: false, locale },
    };
    frames.push(frame);
    board.addFrame(frame);

    line("axis-x-box", [{ x: plotLeft, y: axisY }, { x: plotLeft + plotW, y: axisY }], AXIS, 1.8);
    ticks.forEach((t, i) => {
      const xx = scale.px(t);
      line(`box-tick-${i}`, [{ x: xx, y: axisY }, { x: xx, y: axisY + 5 }], AXIS, 1.2);
      put(board, num(t, locale), xx, axisY + 5 + 4 + 10, { size: TICK_SIZE, colour: SOFT, gridOf: frame.id });
    });
    put(board, `${m.variable}${unit === undefined ? "" : ` (${unit})`}`, plotLeft + plotW / 2, axisY + 5 + 4 + 20 + 14 + 8, { size: LABEL_SIZE, weight: 600, colour: INK, freeStanding: true, id: "axis-title-x-box" });

    // Ink first, for every group; then the labels.
    type Anchors = { q1: number; med: number; q3: number; cy: number };
    const spots: Anchors[] = [];
    m.groups.forEach((g, gi) => {
      const st = g.stats;
      const cy = top + gi * rowH + rowH / 2;
      const X = scale.px;
      const c = g.colour;
      const seg = (id: string, a: Point, b: Point, colour: string, width: number, style?: "dotted"): void => {
        board.poly([a, b], { stroke: colour, width, id, ...(style === undefined ? {} : { lineStyle: style }) });
        placer.addInk(id, [a, b], !id.startsWith("row-"));
      };
      seg(`row-${gi}`, { x: plotLeft, y: cy }, { x: plotLeft + plotW, y: cy }, LIGHT, 1.2, "dotted");
      const boxPts = [{ x: X(st.q1), y: cy - BOX_HALF }, { x: X(st.q3), y: cy - BOX_HALF }, { x: X(st.q3), y: cy + BOX_HALF }, { x: X(st.q1), y: cy + BOX_HALF }];
      board.poly(boxPts, { close: true, fill: c.fill, stroke: c.edge, width: 2, id: `box-${gi}` });
      placer.addInk(`box-${gi}`, [...boxPts, boxPts[0]!]);
      seg(`whisker-lo-${gi}`, { x: X(st.lowWhisker), y: cy }, { x: X(st.q1), y: cy }, c.edge, 2);
      seg(`whisker-hi-${gi}`, { x: X(st.q3), y: cy }, { x: X(st.highWhisker), y: cy }, c.edge, 2);
      seg(`cap-lo-${gi}`, { x: X(st.lowWhisker), y: cy - 8 }, { x: X(st.lowWhisker), y: cy + 8 }, c.edge, 2);
      seg(`cap-hi-${gi}`, { x: X(st.highWhisker), y: cy - 8 }, { x: X(st.highWhisker), y: cy + 8 }, c.edge, 2);
      seg(`median-${gi}`, { x: X(st.median), y: cy - BOX_HALF }, { x: X(st.median), y: cy + BOX_HALF }, INK, 3.2);
      [...new Set(st.outliers)].forEach((o, oi) => {
        const p = { x: X(o), y: cy };
        board.circle(p, 3.8, { stroke: c.edge, width: 1.8, fill: PAPER, id: `outlier-${gi}-${oi}` });
        placer.addInk(`outlier-${gi}-${oi}`, [p], true, { c: p, r: 4 });
      });
      spots.push({ q1: X(st.q1), med: X(st.median), q3: X(st.q3), cy });
    });

    m.groups.forEach((g, gi) => {
      const a = spots[gi]!;
      const st = g.stats;
      if (g.name !== "") {
        put(board, g.name, plotLeft - 14, a.cy, { anchor: "end", size: LABEL_SIZE, weight: 700, colour: INK, annotates: `row-${gi}` });
      }
      const items: { key: string; text: string; x: number; sides: (-1 | 1)[]; outward: -1 | 0 | 1 }[] = m.answers ? [
        { key: "q1", text: withUnit(`Q₁ = ${describeNumber(st.q1, locale).text}`, unit), x: a.q1, sides: [-1, 1], outward: -1 },
        { key: "med", text: withUnit(`Md = ${describeNumber(st.median, locale).text}`, unit), x: a.med, sides: [1, -1], outward: 0 },
        { key: "q3", text: withUnit(`Q₃ = ${describeNumber(st.q3, locale).text}`, unit), x: a.q3, sides: [-1, 1], outward: 1 },
      ] : [];
      for (const it of items) {
        const { w, h } = board.extent(it.text, { size: LABEL_SIZE, weight: 700 });
        let chosen: { centre: Point; cost: number; anchor: Point } | undefined;
        for (const side of it.sides) {
          const anchor = { x: it.x, y: a.cy + side * BOX_HALF };
          const centres: Point[] = [];
          for (const rowsOut of [0, 1]) {
            // Centred over its edge first; then hanging OUTWARD from it (Q₁'s text ending at Q₁,
            // Q₃'s starting at Q₃), which still reads as that edge's label; sideways shifts last.
            const out = it.outward === 0 ? [] : [it.outward * (w / 2 - 4)];
            const rest = [-w / 4, w / 4, -w / 2 + 4, w / 2 - 4].filter((d) => !out.includes(d));
            for (const dx of [0, ...out, ...rest]) {
              centres.push({ x: it.x + dx, y: a.cy + side * (BOX_HALF + 5 + h / 2 + rowsOut * (h + 3)) });
            }
          }
          const id = `${it.key}-${gi}-${side}`;
          const best = placer.choose({ kind: "place", id, at: anchor }, w, h, centres);
          if (chosen === undefined || best.cost < chosen.cost) chosen = { ...best, anchor };
          if (best.cost === 0) break;
        }
        const c = chosen!;
        const block = board.label(it.text, c.centre.x, c.centre.y, { size: LABEL_SIZE, weight: 700, colour: INK, width: w, annotatesPlace: c.anchor });
        placer.addPlace(`${it.key}-${gi}`, c.anchor);
        placer.commit(rectAt(c.centre, w, h));
        void block;
      }
    });
    y = axisY + 5 + 4 + 20 + 14 + 8 + 20;
  }

  // ---- tables ---------------------------------------------------------------------------------------------
  for (const t of tables) {
    y += 22;
    const tw = tableMeasure(probe, t.spec).w;
    y = tableDraw(board, t.spec, (W - tw) / 2, y);
  }

  // ---- the reading panel --------------------------------------------------------------------------------------
  // The statistics, packed a group to a line with "·" between items; then the notes, soft.
  const maxLine = W0;
  const textLines: PanelLineInput[] = [];
  if (m.showStats && m.answers) {
    for (const g of panelGroups(m)) {
      for (const l of packItems(g.items, "   ·   ", maxLine, (t) => runsWidth([{ text: t }], LABEL_SIZE))) textLines.push({ text: [{ text: l }], wrap: false });
    }
  }
  for (const s of noteSentences(m, hist === undefined ? undefined : xs)) textLines.push({ text: [{ text: s }], emphasis: "soft" });
  const readingPanel = layoutPanel(textLines, { width: maxLine, size: LABEL_SIZE, lineHeight: NOTE_LINE });
  if (!readingPanel.empty) {
    const cut = y + 8;
    y += 22;
    y = readingPanel.draw(board, { left: (W - maxLine) / 2, top: y, cut });
  }

  const height = Math.ceil(y + M);
  const title = input.title ?? (m.kind === "histogram" ? "histograma" : m.kind === "boxplot" ? "boxplot" : "histograma e boxplot");
  const spec = board.spec(title);
  const scene = spec.root as Scene;
  scene.height = height;
  scene.frames = frames;
  scene.connectors = [];
  return parseSpec(spec);
}

/** Centres around a polyline for a label `w`×`h`, nearest the line first. */
function ringAround(pts: Point[], w: number, h: number): Point[] {
  const scored: { p: Point; score: number }[] = [];
  const samples: Point[] = [];
  for (let i = 1; i < pts.length; i += 1) {
    for (const t of [0.5, 0.35, 0.65]) samples.push({ x: pts[i - 1]!.x + (pts[i]!.x - pts[i - 1]!.x) * t, y: pts[i - 1]!.y + (pts[i]!.y - pts[i - 1]!.y) * t });
  }
  for (const s of samples) {
    for (const gap of [6, 12, 20, 30, 44]) {
      for (let k = 0; k < 24; k += 1) {
        const ang = (k * Math.PI * 2) / 24;
        const u = { x: Math.cos(ang), y: Math.sin(ang) };
        const reach = Math.abs(u.x) * (w / 2) + Math.abs(u.y) * (h / 2);
        const p = { x: s.x + u.x * (reach + gap), y: s.y + u.y * (reach + gap) };
        scored.push({ p, score: distanceToPolyline(p, pts) + (u.y > 0 ? 8 : 0) });
      }
    }
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.map((s) => s.p);
}

// ---- validation ---------------------------------------------------------------------------------------------------------

export function validateStatisticsInput(raw: Record<string, unknown>): void {
  const path = "statistics";
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  v.optionalString(raw, "unit", path);
  v.optionalString(raw, "variable", path);
  for (const key of ["polygon", "showTable", "showStats", "answers"]) v.optionalBoolean(raw, key, path);
  if (raw.kind === undefined) throw new SpecError(`${path}.kind is required: "histogram", "boxplot" or "both"`);
  v.optionalEnum(raw, "kind", path, ["histogram", "boxplot", "both"] as const);
  v.optionalEnum(raw, "frequency", path, ["absolute", "relative", "percent", "density"] as const);
  v.optionalEnum(raw, "quartileMethod", path, QUARTILE_METHODS);
  v.optionalEnum(raw, "variance", path, ["sample", "population"] as const);
  if (raw.data === undefined) throw new SpecError(`${path}.data is required: a list of numbers, or groups {values, label}`);
  // Arithmetic, classes and layout are exercised by building the figure.
  expandStatistics(raw as unknown as StatisticsInput);
}
