/**
 * acid-base -- the three figures of aqueous acid-base equilibrium, every drawn
 * point COMPUTED from the equilibrium, never typed (ADR 0064).
 *
 *   kind "titration"    pH against volume of titrant added. At every volume
 *                       the pH is the root of the CHARGE BALANCE, found by
 *                       bisection on pH -- no Henderson-Hasselbalch, no
 *                       "the salt hydrolyses" shortcut -- so the buffer
 *                       region, the jump and the plateau are all one
 *                       equation. The initial, half-equivalence and
 *                       equivalence points are computed the same way, and
 *                       each is declared to lie ON the curve.
 *   kind "distribution" the fraction alpha of each species of a mono-, di- or
 *                       triprotic acid against pH, from the pKa list; the
 *                       curves cross at pH = pKa, and each crossing is marked
 *                       on both curves it claims.
 *   kind "ph-scale"     the pH scale 0-14 as a colour bar, with substances at
 *                       their pH (given, or computed from [H+] or [OH-] with
 *                       the arithmetic printed) and indicator ranges.
 *
 * `answers: false` draws the question's figure (see PRESET.md).
 */

import type { Block, Connector, FigureSpec, Frame, GridSpec, Mark, Point, Scene, TextRun } from "../../ir/types.ts";
import { SpecError, parseSpec, runsText } from "../../ir/types.ts";
import { tickPlan } from "../../ir/frames.ts";
import { LOCALES, MINUS, formatNumber } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";
import type { Box, LabelOptions } from "../function-graph/board.ts";
import { fitUnits, niceStep, widenToTicks } from "../shared/scale.ts";
import { layoutPanel, rich } from "../shared/panel.ts";
import type { PanelLineInput } from "../shared/panel.ts";
import type { WrapRules } from "../shared/text.ts";
import { BUNDLED_FONT_STACK } from "../../export/fonts.ts";

// ==== the chemistry =============================================================================

/** pKw at 25 degrees C. Kw = 1,0e-14. */
export const PKW = 14;
export const KW = 1e-14;

/**
 * The fraction of each species of a polyprotic acid H_nA at `pH`, most
 * protonated first: alpha[j] is the species that has lost j protons. With
 * K_i = 10^-pKa_i and h = 10^-pH the j-th term is K_1...K_j * h^(n-j), and
 * alpha[j] = term_j / (sum of the terms). Evaluated in logarithms so that a
 * triprotic acid at pH 0 or 14 neither underflows nor overflows.
 */
export function speciesFractions(pKas: readonly number[], pH: number): number[] {
  const n = pKas.length;
  const logs: number[] = [];
  let acc = 0;
  for (let j = 0; j <= n; j += 1) {
    if (j > 0) acc -= pKas[j - 1]!;
    logs.push(acc - (n - j) * pH);
  }
  const top = Math.max(...logs);
  const w = logs.map((l) => 10 ** (l - top));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
}

/**
 * The pH at which `f(h)` -- a function of [H+] that INCREASES with it, as a
 * charge balance written "positive minus negative" does -- is zero. Bisection
 * on pH itself (that is on log[H+]), so the root is found to machine
 * precision whether it is 10^-1 or 10^-13.
 */
export function solvePH(f: (h: number) => number): number {
  let lo = -2; // h = 100: strongly positive
  let hi = 16; // h = 1e-16: strongly negative
  for (let i = 0; i < 100; i += 1) {
    const mid = (lo + hi) / 2;
    if (f(10 ** -mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** -log10, for a concentration that must be positive. */
export const pOf = (concentration: number): number => -Math.log10(concentration);

/** The pH of a solution with the given [H+] (mol/L). */
export const phFromH = (h: number): number => pOf(h);
/** The pH of a solution with the given [OH-] (mol/L): pH = pKw - pOH. */
export const phFromOH = (oh: number): number => PKW - pOf(oh);

export type TitrationModel = {
  /** What is in the flask: an acid (titrated by a strong base) or a base (titrated by a strong acid). */
  side: "acid" | "base";
  strong: boolean;
  /**
   * The acid family's pKa list, ascending: for an acid H_nA its own; for a
   * base B the pKa of B's conjugate acids (a base of pKb b has one pKa =
   * 14 - b). Empty for a strong analyte.
   */
  pKas: number[];
  /** Steps of the analyte: 1 for a strong one, pKas.length for a weak one. */
  n: number;
  /** mol/L and mL of the analyte; mol/L of the titrant. */
  c: number;
  volume: number;
  titrantC: number;
  name: string;
  titrantName: string;
};

/**
 * The pH after `vt` mL of titrant. The charge balance, [H+] as the unknown:
 *   acid + strong base:  [B+] + [H+] = [OH-] + c_t * sum_j j * alpha_j
 *   base + strong acid:  c_t * sum_j (n-j) * alpha_j + [H+] = [OH-] + [X-]
 * with c_t the analyte's concentration and [B+], [X-] the titrant's, both
 * after dilution. A strong analyte contributes its whole charge.
 */
export function titrationPH(m: TitrationModel, vt: number): number {
  const total = m.volume + vt;
  const ct = (m.c * m.volume) / total;
  const tt = (m.titrantC * vt) / total;
  return solvePH((h) => {
    const pH = pOf(h);
    if (m.side === "acid") {
      let charge = 1;
      if (!m.strong) {
        const a = speciesFractions(m.pKas, pH);
        charge = a.reduce((s, x, j) => s + j * x, 0);
      }
      return tt + h - KW / h - ct * charge;
    }
    let charge = 1;
    if (!m.strong) {
      const a = speciesFractions(m.pKas, pH);
      charge = a.reduce((s, x, j) => s + (m.n - j) * x, 0);
    }
    return ct * charge + h - KW / h - tt;
  });
}

/** The volume of the k-th equivalence point: k * c * V / c_titrant. */
export const equivalenceVolume = (m: TitrationModel, k = 1): number => (k * m.c * m.volume) / m.titrantC;

export type TitrationMarks = {
  initial: number;
  half: { k: number; volume: number; pH: number }[];
  eq: { k: number; volume: number; pH: number; jump: { lo: number; hi: number }; visible: boolean }[];
  vMax: number;
};

/** An equivalence point is drawn when the curve jumps at least this much across 99% - 101% of its volume. */
const MIN_JUMP = 0.8;

/** Every marked point of the curve, computed. */
export function titrationMarks(m: TitrationModel, volumeMax?: number): TitrationMarks {
  const v1 = equivalenceVolume(m, 1);
  // a half-equivalence point reads pKa only where its neighbours do not crowd it: where the pH there is more than
  // 0,3 from the pKa (the third step of H₃PO₄, lost against water) the point is not marked, and no pKa is claimed
  const half = m.strong
    ? []
    : Array.from({ length: m.n }, (_, i) => ({ k: i + 1, volume: (i + 0.5) * v1, pH: titrationPH(m, (i + 0.5) * v1) })).filter((h) => Math.abs(h.pH - m.pKas[h.k - 1]!) <= 0.3);
  const eq = Array.from({ length: m.n }, (_, i) => {
    const k = i + 1;
    const vk = k * v1;
    const jump = { lo: titrationPH(m, vk * 0.999), hi: titrationPH(m, vk * 1.001) };
    const wide = Math.abs(titrationPH(m, vk * 1.01) - titrationPH(m, vk * 0.99));
    return { k, volume: vk, pH: titrationPH(m, vk), jump, visible: wide >= MIN_JUMP };
  });
  const vMax = volumeMax ?? (m.n === 1 ? 2 : m.n + 0.5) * v1;
  return { initial: titrationPH(m, 0), half, eq, vMax };
}

// ==== indicators ================================================================================

export type Indicator = { name: string; from: number; to: number };

const INDICATORS: { name: string; aliases: string[]; from: number; to: number }[] = [
  { name: "alaranjado de metila", aliases: ["methyl orange", "laranja de metila"], from: 3.1, to: 4.4 },
  { name: "vermelho de metila", aliases: ["methyl red"], from: 4.4, to: 6.2 },
  { name: "tornassol", aliases: ["litmus"], from: 5, to: 8 },
  { name: "azul de bromotimol", aliases: ["bromothymol blue"], from: 6, to: 7.6 },
  { name: "vermelho de fenol", aliases: ["phenol red"], from: 6.8, to: 8.4 },
  { name: "fenolftaleína", aliases: ["phenolphthalein", "fenolftaleina"], from: 8.2, to: 10 },
  { name: "amarelo de alizarina", aliases: ["alizarin yellow"], from: 10.1, to: 12 },
];

const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export const INDICATOR_NAMES: readonly string[] = INDICATORS.map((i) => i.name);

function parseIndicators(raw: unknown, path: string): Indicator[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new SpecError(`${path} must be an array of indicator names or {name, from, to}`);
  return raw.map((item, i) => {
    const at = `${path}[${i}]`;
    if (typeof item === "string") {
      const hit = INDICATORS.find((x) => fold(x.name) === fold(item) || x.aliases.some((a) => fold(a) === fold(item)));
      if (hit === undefined) throw new SpecError(`${at}: "${item}" is not a known indicator (${INDICATOR_NAMES.join(", ")}); give {name, from, to} for another`);
      return { name: hit.name, from: hit.from, to: hit.to };
    }
    const o = v.object(item, at);
    const name = v.requiredString(o, "name", at);
    const from = v.finite(o.from, `${at}.from`);
    const to = v.finite(o.to, `${at}.to`);
    if (!(from < to)) throw new SpecError(`${at}: from (${from}) must be below to (${to})`);
    return { name, from, to };
  });
}

// ==== input =====================================================================================

export type AcidBaseInput =
  | ({ kind: "titration" } & TitrationInput)
  | ({ kind: "distribution" } & DistributionInput)
  | ({ kind: "ph-scale" } & PhScaleInput);

type Common = { title?: string; locale?: Locale; answers?: boolean };

export type TitrationInput = Common & {
  analyte: {
    type: "acid" | "base";
    strength: "strong" | "weak";
    /** A weak acid's pKa (a list for a polyprotic one), or the pKa of a weak base's conjugate acid. */
    pKa?: number | number[];
    Ka?: number | number[];
    /** A weak base's pKb (a list: successive steps). */
    pKb?: number | number[];
    Kb?: number | number[];
    /** mol/L */
    concentration: number;
    /** mL */
    volume: number;
    name?: string;
  };
  titrant: { concentration: number; name?: string };
  /** mL: the axis runs to here. Default 2 x V_eq (n + 1/2 x V_eq for an n-protic analyte). */
  volumeMax?: number;
  indicators?: (string | Indicator)[];
};

export type DistributionInput = Common & {
  /** Name of the acid, for the title. */
  name?: string;
  pKa: number | number[];
  /** The n + 1 species, most protonated first: ["H₂CO₃", "HCO₃⁻", "CO₃²⁻"]. Default H₂A, HA⁻, A²⁻. */
  species?: string[];
  /** A vertical line at this pH, with the fractions printed. */
  pH?: number;
};

export type PhScaleInput = Common & {
  substances: { name: string; pH?: number; H?: number; OH?: number }[];
  indicators?: (string | Indicator)[];
};

const KEYS: Record<string, string[]> = {
  titration: ["preset", "kind", "title", "locale", "answers", "analyte", "titrant", "volumeMax", "indicators"],
  distribution: ["preset", "kind", "title", "locale", "answers", "name", "pKa", "species", "pH"],
  "ph-scale": ["preset", "kind", "title", "locale", "answers", "substances", "indicators"],
};

// ==== palette and constants =====================================================================

const PAPER = "#FCFBF7";
const INK = "#181B21";
const SOFT = "#4E5763";
const AXIS = "#3F4855";
const FAINT = "#8A93A3";
const LATTICE = "#E5E9F0";
const CURVE = "#1D4E89";
const POINT = "#B3400C";
const POINT_TEXT = "#9A3508";
const BAND_COLOURS = ["#E69F00", "#56B4E9", "#009E73", "#CC79A7", "#F0E442", "#D55E00"];
const BAND_TINT = "4D";
/** Okabe-Ito, darkened until each clears 4,5:1 against the paper: the labels are set in the curve's own colour. */
const SPECIES_COLOURS = ["#1A5490", "#A93A08", "#086340", "#6E3590"];
const SPECIES_DASH: (Mark["lineStyle"])[] = ["solid", "dashed", "dashdot", "dotted"];
const SANS = BUNDLED_FONT_STACK;

const ML = 66;
const MR = 46;
const PANEL_FONT = 13;
const PANEL_LINE_H = 23;
const ARROW_OVERSHOOT = 16;

const OPERATORS = new Set(["=", "≈", "+", MINUS, "·", "<", ">", "≤", "≥", "/", "±", "→"]);
const OPERATOR_RULES: WrapRules = { joinsPrevious: (w) => OPERATORS.has(w), joinsNext: (w) => OPERATORS.has(w) };

// ==== small helpers =============================================================================

const tidy = (x: number): number => Number(x.toPrecision(12));

type Fmt = { short: (x: number) => string; dec: (x: number, d: number) => string; pH: (x: number) => string; sci: (x: number) => string };

function fmtFor(locale: Locale): Fmt {
  const short = (x: number): string => formatNumber(tidy(x), locale);
  const dec = (x: number, d: number): string => formatNumber(x, locale, { decimals: d });
  // a mantissa times a power of ten, written with a real superscript mark for rich(): 1,8·10^{−5}
  const sci = (x: number): string => {
    let e = Math.floor(Math.log10(x));
    let m = x / 10 ** e;
    m = Number(m.toPrecision(3));
    if (m >= 10) {
      m /= 10;
      e += 1;
    }
    const exp = `^{${e < 0 ? MINUS : ""}${Math.abs(e)}}`;
    return m === 1 ? `10${exp}` : `${short(m)}·10${exp}`;
  };
  return { short, dec, pH: (x) => dec(x, 2), sci };
}

/** The text of a rich string with no marks. */
const plain = (s: string): string => runsText(rich(s));

const asList = (raw: unknown, path: string): number[] | undefined => {
  if (raw === undefined) return undefined;
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.length === 0) throw new SpecError(`${path} must not be empty`);
  return list.map((x, i) => v.finite(x, Array.isArray(raw) ? `${path}[${i}]` : path));
};

const SUBS = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];
const SUPS: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³" };

/** Default names of the n + 1 species of an anonymous acid: H₂A, HA⁻, A²⁻. */
export function defaultSpecies(n: number): string[] {
  return Array.from({ length: n + 1 }, (_, j) => {
    const protons = n - j;
    const h = protons === 0 ? "" : protons === 1 ? "H" : `H${SUBS[protons]}`;
    const charge = j === 0 ? "" : j === 1 ? "⁻" : `${SUPS[String(j)] ?? String(j)}⁻`;
    return `${h}A${charge}`;
  });
}

/** Distance from `p` to the box `b`, 0 inside. */
function boxDistance(p: Point, b: Box): number {
  const dx = Math.max(b.x - b.hw - p.x, 0, p.x - (b.x + b.hw));
  const dy = Math.max(b.y - b.hh - p.y, 0, p.y - (b.y + b.hh));
  return Math.hypot(dx, dy);
}

type Seg = { ax: number; ay: number; bx: number; by: number };

/** Distance from a segment to a box (0 when they touch), sampled every 2px as the checks sample. */
function segmentBoxDistance(s: Seg, b: Box): number {
  const len = Math.hypot(s.bx - s.ax, s.by - s.ay);
  const n = Math.max(1, Math.ceil(len / 2));
  let best = Infinity;
  for (let k = 0; k <= n; k += 1) {
    const t = k / n;
    best = Math.min(best, boxDistance({ x: s.ax + (s.bx - s.ax) * t, y: s.ay + (s.by - s.ay) * t }, b));
  }
  return best;
}

/** Nearest approach of the ink drawn by the owners `pick` selects to a box. */
function inkDistance(board: Board, b: Box, pick: (owner: string | undefined) => boolean): number {
  let best = Infinity;
  for (const s of board.ink) {
    if (!pick(s.owner)) continue;
    // a cheap bound before the sampling
    const bbDx = Math.max(b.x - b.hw - Math.max(s.ax, s.bx), 0, Math.min(s.ax, s.bx) - (b.x + b.hw));
    const bbDy = Math.max(b.y - b.hh - Math.max(s.ay, s.by), 0, Math.min(s.ay, s.by) - (b.y + b.hh));
    if (Math.hypot(bbDx, bbDy) >= best) continue;
    best = Math.min(best, segmentBoxDistance(s, b));
  }
  return best;
}

/** The owners of ink that passes through `p`: what makes a place, which no label is judged nearer to than the place itself. */
function ownersThrough(board: Board, p: Point): Set<string> {
  const out = new Set<string>();
  // a marker drawn AT the place (a dot, a small ring) is the place made visible, as the check reads it
  const boxes = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
  for (const s of board.ink) {
    if (s.owner === undefined) continue;
    const b = boxes.get(s.owner) ?? { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    b.x0 = Math.min(b.x0, s.ax, s.bx);
    b.x1 = Math.max(b.x1, s.ax, s.bx);
    b.y0 = Math.min(b.y0, s.ay, s.by);
    b.y1 = Math.max(b.y1, s.ay, s.by);
    boxes.set(s.owner, b);
  }
  for (const [owner, b] of boxes) {
    if (b.x1 - b.x0 <= 14 && b.y1 - b.y0 <= 14 && p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1) out.add(owner);
  }
  for (const s of board.ink) {
    if (s.owner === undefined) continue;
    const vx = s.bx - s.ax;
    const vy = s.by - s.ay;
    const l2 = vx * vx + vy * vy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - s.ax) * vx + (p.y - s.ay) * vy) / l2));
    if (Math.hypot(p.x - (s.ax + t * vx), p.y - (s.ay + t * vy)) <= 1) out.add(s.owner);
  }
  return out;
}

const SEARCH_GAPS = [5, 9, 14, 20, 27, 35, 45, 57, 71, 88, 108, 132];

/** Directions to try, nearest to `prefer` (degrees, 0 = right, 90 = down) first. */
function anglesFrom(prefer: number): number[] {
  const all = Array.from({ length: 24 }, (_, i) => i * 15);
  const turn = (a: number): number => Math.min(Math.abs(a - prefer) % 360, 360 - (Math.abs(a - prefer) % 360));
  return all.sort((a, b) => turn(a) - turn(b));
}

type Bounds = { l: number; t: number; r: number; b: number };

export function richLabel(board: Board, text: string, cx: number, cy: number, o: LabelOptions): Block {
  const runs = rich(text);
  const block = board.label(runsText(runs), cx, cy, o);
  if (runs.some((r) => r.script !== undefined)) block.runs = runs.map((r) => ({ ...r }));
  return block;
}

/**
 * A label for a computed POINT: the nearest clear spot around it, judged the
 * way `label-nearest-its-place` will judge it -- no ink that does not pass
 * through the point may be nearer the label than the point is.
 */
function labelBesidePlace(board: Board, text: string, at: Point, prefer: number, bounds: Bounds, o: LabelOptions): Block {
  const measured = board.extent(plain(text), o);
  const { w, h } = measured;
  const through = ownersThrough(board, at);
  let fallback: { x: number; y: number } | null = null;
  for (const gap of SEARCH_GAPS) {
    for (const deg of anglesFrom(prefer)) {
      const dx = Math.cos((deg * Math.PI) / 180);
      const dy = Math.sin((deg * Math.PI) / 180);
      const cx = at.x + dx * (gap + (w / 2) * Math.abs(dx));
      const cy = at.y + dy * (gap + (h / 2) * Math.abs(dy));
      if (cx - w / 2 < bounds.l || cx + w / 2 > bounds.r || cy - h / 2 < bounds.t || cy + h / 2 > bounds.b) continue;
      const box = board.box(cx, cy, w, h);
      if (!board.clear(box, 1)) continue;
      fallback ??= { x: cx, y: cy };
      // what the check sees: the text's own rectangle, a little inside the slack
      const tight = board.box(cx, cy, w - 4, h - 2);
      const toPlace = boxDistance(at, tight);
      if (inkDistance(board, tight, (id) => id !== undefined && !through.has(id)) < toPlace + 1) continue;
      return richLabel(board, text, cx, cy, { ...o, width: w, annotatesPlace: at });
    }
  }
  const at2 = fallback ?? { x: at.x + w / 2 + 8, y: at.y };
  return richLabel(board, text, at2.x, at2.y, { ...o, width: w, annotatesPlace: at });
}

// ==== the numbered plane ========================================================================

type Plane = {
  board: Board;
  frame: Frame & { origin: Point };
  at: (x: number, y: number) => Point;
  connectors: Connector[];
  bounds: Bounds;
  xUnit: number;
  yUnit: number;
};

type PlaneSpec = {
  width: number;
  height: number;
  marginLeft: number;
  marginTop: number;
  marginBottom: number;
  x: [number, number];
  y: [number, number];
  xStep: number;
  yStep: number;
  xUnit: number;
  yUnit: number;
  /** ticks at these values only (the last, past `y[1]`, is the axis's arrow room). */
  locale: Locale;
  xName: string;
  yName: string;
  /** Room reserved for the axis names. */
  background: string;
};

function buildPlane(p: PlaneSpec): Plane {
  const board = new Board(p.width, p.height, p.background);
  const frame: Frame & { origin: Point } = {
    id: "plane",
    origin: { x: p.marginLeft - p.x[0] * p.xUnit, y: p.marginTop + p.y[1] * p.yUnit },
    xUnit: p.xUnit,
    yUnit: p.yUnit,
  };
  const at = (x: number, y: number): Point => ({ x: frame.origin.x + x * p.xUnit, y: frame.origin.y - y * p.yUnit });
  const grid: GridSpec = {
    x: { from: p.x[0], to: p.x[1], step: p.xStep, origin: 0 },
    y: { from: p.y[0], to: p.y[1], step: p.yStep, origin: 0 },
    axes: false,
    labels: true,
    locale: p.locale,
    stroke: LATTICE,
  };
  frame.grid = grid;
  board.frames.push(frame);
  for (const t of tickPlan(frame, grid)) {
    const b = t.spots[0]!.box;
    board.reserve(b.x + b.width / 2, b.y + b.height / 2, b.width, b.height);
  }
  const left = at(p.x[0], 0).x;
  const right = at(p.x[1], 0).x;
  const top = at(0, p.y[1]).y;
  const bottom = at(0, p.y[0]).y;
  const connectors: Connector[] = [];
  const arrow = (id: string, from: Point, to: Point): void => {
    connectors.push({ id, from, to, arrow: "end", stroke: AXIS, strokeWidth: 1.8 });
    board.trace([from, to], AXIS, 1.8, id);
  };
  arrow("plane-axis-y", { x: left, y: bottom }, { x: left, y: top - ARROW_OVERSHOOT });
  arrow("plane-axis-x", { x: left, y: bottom }, { x: right + ARROW_OVERSHOOT, y: bottom });
  const name = { size: 14, weight: 600, colour: SOFT, freeStanding: true as const };
  // the y axis's name to the right of the arrow's head, the x axis's centred under its numbers
  richLabel(board, p.yName, left + 8 + board.extent(plain(p.yName), name).w / 2, top - ARROW_OVERSHOOT + 4, { ...name, id: "axis-name-y" });
  richLabel(board, p.xName, (left + right) / 2, bottom + 40, { ...name, id: "axis-name-x" });
  return { board, frame, at, connectors, bounds: { l: left + 3, t: top + 2, r: right - 3, b: bottom - 3 }, xUnit: p.xUnit, yUnit: p.yUnit };
}

/** The scene, once the drawing is done. */
function finish(plane: Plane, title: string, height: number, kids?: Block[]): FigureSpec {
  const board = plane.board;
  const spec = board.spec(title);
  const scene = spec.root as Scene;
  scene.connectors = plane.connectors;
  scene.height = height;
  if (kids !== undefined) scene.children = kids;
  return parseSpec(spec);
}

function heading(board: Board, text: string): void {
  const runs = rich(text);
  const w = board.extent(runsText(runs), { size: 15, weight: 700 }).w;
  richLabel(board, text, ML + w / 2, 26, { size: 15, weight: 700, colour: INK, align: "start", width: w, freeStanding: true, id: "heading", claim: false });
  board.reserve(ML + w / 2, 26, w, 26);
}

const measureHeading = (text: string): number => new Board(10, 10, PAPER).extent(plain(text), { size: 15, weight: 700 }).w;

/** A shaded horizontal band across the plane: substrate, like the lattice, not ink a label is measured against. */
function bandMark(id: string, colour: string, l: Point, r: Point): Mark {
  return {
    id,
    gridOf: "plane",
    from: { x: l.x, y: l.y },
    segments: [{ line: { x: r.x, y: l.y } }, { line: { x: r.x, y: r.y } }, { line: { x: l.x, y: r.y } }],
    close: true,
    fill: `${colour}${BAND_TINT}`,
    stroke: "none",
    strokeWidth: 0,
  };
}

// ==== titration =================================================================================

function parseTitration(raw: Record<string, unknown>): { model: TitrationModel; indicators: Indicator[]; volumeMax: number | undefined } {
  const path = "acid-base";
  const a = v.object(raw.analyte, `${path}.analyte`);
  const t = v.object(raw.titrant, `${path}.titrant`);
  const type = v.optionalEnum(a, "type", `${path}.analyte`, ["acid", "base"]);
  const strength = v.optionalEnum(a, "strength", `${path}.analyte`, ["strong", "weak"]);
  if (type === undefined) throw new SpecError(`${path}.analyte.type is required: "acid" or "base"`);
  if (strength === undefined) throw new SpecError(`${path}.analyte.strength is required: "strong" or "weak"`);
  for (const key of Object.keys(a)) {
    if (!["type", "strength", "pKa", "Ka", "pKb", "Kb", "concentration", "volume", "name"].includes(key)) throw new SpecError(`${path}.analyte.${key} is not a field`);
  }
  for (const key of Object.keys(t)) if (!["concentration", "name"].includes(key)) throw new SpecError(`${path}.titrant.${key} is not a field`);
  const c = v.requiredNumber(a, "concentration", `${path}.analyte`);
  const volume = v.requiredNumber(a, "volume", `${path}.analyte`);
  const titrantC = v.requiredNumber(t, "concentration", `${path}.titrant`);
  for (const [name, x] of [["analyte.concentration", c], ["analyte.volume", volume], ["titrant.concentration", titrantC]] as const) {
    if (!(x > 0)) throw new SpecError(`${path}.${name} must be positive, got ${x}`);
  }
  const strong = strength === "strong";
  const given = ["pKa", "Ka", "pKb", "Kb"].filter((k) => a[k] !== undefined);
  let pKas: number[] = [];
  if (strong) {
    if (given.length > 0) throw new SpecError(`${path}.analyte: a strong ${type} has no ${given.join("/")}; it is dissociated completely`);
  } else {
    if (given.length !== 1) throw new SpecError(`${path}.analyte: a weak ${type} needs exactly one of ${type === "acid" ? "pKa or Ka" : "pKb, Kb or (the conjugate acid's) pKa"}; got ${given.length === 0 ? "none" : given.join(" and ")}`);
    const key = given[0]!;
    if (type === "acid" && (key === "pKb" || key === "Kb")) throw new SpecError(`${path}.analyte: a weak acid is given by pKa or Ka, not ${key}`);
    if (type === "base" && key === "Ka") throw new SpecError(`${path}.analyte: a weak base is given by pKb, Kb or the conjugate acid's pKa, not Ka`);
    const list = asList(a[key], `${path}.analyte.${key}`)!;
    const isK = key === "Ka" || key === "Kb";
    const ps = list.map((x, i) => {
      if (isK && !(x > 0)) throw new SpecError(`${path}.analyte.${key}[${i}] must be positive, got ${x}`);
      return isK ? pOf(x) : x;
    });
    if (list.length > 4) throw new SpecError(`${path}.analyte.${key}: at most four steps`);
    // successive pKa or pKb: each step weaker than the last
    for (let i = 1; i < ps.length; i += 1) if (!(ps[i]! > ps[i - 1]!)) throw new SpecError(`${path}.analyte.${key} must increase with each step (${ps.join(", ")})`);
    pKas = key === "pKb" || key === "Kb" ? ps.map((p) => PKW - p).sort((x, y) => x - y) : [...ps];
  }
  const name = v.optionalString(a, "name", `${path}.analyte`) ?? (type === "acid" ? "HA" : strong ? "MOH" : "B");
  const titrantName = v.optionalString(t, "name", `${path}.titrant`) ?? (type === "acid" ? "NaOH" : "HCl");
  const volumeMax = v.optionalNumber(raw, "volumeMax", path);
  const model: TitrationModel = { side: type, strong, pKas, n: strong ? 1 : pKas.length, c, volume, titrantC, name, titrantName };
  if (volumeMax !== undefined && !(volumeMax > equivalenceVolume(model, 1))) throw new SpecError(`${path}.volumeMax (${volumeMax}) must be past the first equivalence point (${tidy(equivalenceVolume(model, 1))} mL)`);
  return { model, indicators: parseIndicators(raw.indicators, `${path}.indicators`), volumeMax };
}

/** Does the indicator's colour change fall inside the jump at this equivalence point? Its midpoint must lie between the pH at 99,9% and at 100,1% of V_eq. */
export function indicatorSuits(ind: Indicator, jump: { lo: number; hi: number }): boolean {
  const mid = (ind.from + ind.to) / 2;
  return mid >= Math.min(jump.lo, jump.hi) && mid <= Math.max(jump.lo, jump.hi);
}

type Sample = { v: number; pH: number };

/**
 * The curve as dense as it must be: every marked volume is a node, and any
 * chord whose midpoint is more than half a pixel off the curve is split.
 */
function sampleCurve(m: TitrationModel, vMax: number, must: number[], pxX: number, pxY: number): Sample[] {
  const nodes = [...new Set([0, vMax, ...must, ...Array.from({ length: 41 }, (_, i) => (vMax * i) / 40)])].filter((x) => x >= 0 && x <= vMax).sort((a, b) => a - b);
  const out: Sample[] = [];
  const cache = new Map<number, number>();
  const ph = (x: number): number => {
    let y = cache.get(x);
    if (y === undefined) {
      y = titrationPH(m, x);
      cache.set(x, y);
    }
    return y;
  };
  const refine = (a: number, b: number, depth: number): void => {
    const mid = (a + b) / 2;
    const chord = (ph(a) + ph(b)) / 2;
    const off = Math.abs(ph(mid) - chord) * pxY;
    const run = Math.hypot((b - a) * pxX, (ph(b) - ph(a)) * pxY);
    if (depth < 18 && b - a > vMax * 1e-7 && (off > 0.4 || run > 14)) {
      refine(a, mid, depth + 1);
      out.push({ v: mid, pH: ph(mid) });
      refine(mid, b, depth + 1);
    }
  };
  out.push({ v: nodes[0]!, pH: ph(nodes[0]!) });
  for (let i = 0; i + 1 < nodes.length; i += 1) {
    refine(nodes[i]!, nodes[i + 1]!, 0);
    out.push({ v: nodes[i + 1]!, pH: ph(nodes[i + 1]!) });
  }
  return out;
}

function titrationLines(m: TitrationModel, marks: TitrationMarks, inds: Indicator[], t: Fmt): PanelLineInput[] {
  const lines: PanelLineInput[] = [];
  const acid = m.side === "acid";
  const constants = m.strong
    ? `${acid ? "ácido" : "base"} forte`
    : acid
      ? m.pKas.length === 1
        ? `pK_{a} = ${t.short(tidy(m.pKas[0]!))}`
        : `${m.pKas.map((p, i) => `pK_{a${i + 1}} = ${t.short(tidy(p))}`).join("; ")}`
      : m.pKas.length === 1
        ? `pK_{b} = ${t.short(tidy(PKW - m.pKas[0]!))}`
        : `${[...m.pKas].reverse().map((p, i) => `pK_{b${i + 1}} = ${t.short(tidy(PKW - p))}`).join("; ")}`;
  lines.push({ text: `Analito: ${t.short(m.volume)} mL de ${m.name} ${t.short(m.c)} mol/L (${constants}); titulante: ${m.titrantName} ${t.short(m.titrantC)} mol/L.`, emphasis: "soft" });
  const v1 = equivalenceVolume(m, 1);
  const veq = `${t.short(m.c)} · ${t.short(m.volume)} / ${t.short(m.titrantC)}`;
  lines.push({
    text: m.n === 1 ? `V_{eq} = c_{analito} · V_{analito} / c_{titulante} = ${veq} = ${t.short(tidy(v1))} mL` : `V_{eq,k} = k · c_{analito} · V_{analito} / c_{titulante} = k · ${veq} = k · ${t.short(tidy(v1))} mL`,
    emphasis: "strong",
  });
  lines.push({ text: `pH inicial = ${t.pH(marks.initial)}`, emphasis: "strong" });
  for (const h of marks.half) {
    const pKa = m.pKas[h.k - 1]!;
    const sym = m.n === 1 ? "pK_{a}" : `pK_{a${h.k}}`;
    const near = Math.abs(h.pH - pKa) < 0.005;
    const what = acid ? sym : `${sym} do ácido conjugado`;
    let extra = "";
    if (!acid) extra = `, logo pK_{b} = ${t.short(PKW)} − ${t.pH(h.pH)} = ${t.pH(PKW - h.pH)}`;
    lines.push({
      text: `V = ${m.n === 1 ? "½ V_{eq}" : `${t.short(tidy(h.k - 0.5))} V_{eq,1}`} = ${t.short(tidy(h.volume))} mL: pH = ${t.pH(h.pH)} ${near ? "=" : "≈"} ${what}${extra}`,
      emphasis: "strong",
    });
  }
  for (const e of marks.eq) {
    if (!e.visible) continue;
    const where = m.n === 1 ? "Equivalência" : `${e.k}º ponto de equivalência`;
    const verdict = e.pH > 7.05 ? "solução básica" : e.pH < 6.95 ? "solução ácida" : "solução neutra";
    const why =
      m.strong ? "sal de ácido forte e base forte" : acid ? (e.k < m.n ? "predomina a espécie anfiprótica" : "o ânion do ácido hidrolisa") : "o cátion da base hidrolisa";
    lines.push({ text: `${where} (V = ${t.short(tidy(e.volume))} mL): pH = ${t.pH(e.pH)} (${verdict}; ${why})`, emphasis: "strong" });
  }
  const seen = marks.eq.filter((e) => e.visible);
  for (const ind of inds) {
    const range = `${t.dec(ind.from, 1)}–${t.dec(ind.to, 1)}`;
    const ks = seen.filter((e) => indicatorSuits(ind, e.jump));
    const jumps = seen.map((e) => `pH ${t.pH(Math.min(e.jump.lo, e.jump.hi))} a ${t.pH(Math.max(e.jump.lo, e.jump.hi))}`);
    const suits = ks.length > 0;
    const which = suits && seen.length > 1 ? ` para o ${ks.map((e) => `${e.k}º`).join(" e o ")} ponto de equivalência` : "";
    lines.push({
      text: `${ind.name} (${range}, ponto médio ${t.dec((ind.from + ind.to) / 2, 2)}): ${suits ? "serve" : "não serve"}${which}; o salto (${t.dec(99.9, 1)}% a ${t.dec(100.1, 1)}% de V_{eq}) vai de ${jumps.join("; e de ")}, e o ponto médio da faixa ${suits ? "cai dentro dele" : "cai fora dele"}`,
      emphasis: "normal",
    });
  }
  lines.push({
    text: `O pH de cada volume vem do balanço de cargas, com K_{w} = ${t.dec(1, 1)}·10^{−14} (25 °C); nenhuma aproximação de Henderson–Hasselbalch.`,
    emphasis: "soft",
    gap: 4,
  });
  return lines;
}

export function expandTitration(raw: Record<string, unknown>): FigureSpec {
  const locale = (raw.locale as Locale | undefined) ?? "pt-BR";
  const t = fmtFor(locale);
  const answers = v.optionalBoolean(raw, "answers", "acid-base") !== false;
  const { model: m, indicators, volumeMax } = parseTitration(raw);
  const marks = titrationMarks(m, volumeMax);

  // ---- the plane's extent -------------------------------------------------------------
  const xStep = niceStep(marks.vMax, 10);
  const [, xHi] = widenToTicks(0, marks.vMax, xStep);
  const vEnd = volumeMax === undefined ? xHi : Math.max(xHi, marks.vMax);
  const pHs = [marks.initial, titrationPH(m, vEnd), ...marks.half.map((h) => h.pH), ...marks.eq.map((e) => e.pH)];
  const yLo = Math.min(0, Math.floor(Math.min(...pHs)));
  const yHi = Math.max(14, Math.ceil(Math.max(...pHs)));
  const { xUnit, yUnit } = fitUnits(vEnd, yHi - yLo, { equal: false, targetWidth: 520, targetHeight: (yHi - yLo) * 26 });
  const marginTop = 76;
  const plotH = (yHi - yLo) * yUnit;
  const plotW = vEnd * xUnit;
  const marginBottom = 64;

  // ---- text ---------------------------------------------------------------------------
  const acid = m.side === "acid";
  const titleText = `Titulação de ${t.short(m.volume)} mL de ${m.name} ${t.short(m.c)} mol/L com ${m.titrantName} ${t.short(m.titrantC)} mol/L`;
  const lines = answers ? titrationLines(m, marks, indicators, t) : [];
  const minWidth = Math.max(ML + MR + plotW, ML + measureHeading(titleText) + MR);
  const W = Math.ceil(minWidth);
  const panel = layoutPanel(lines, { width: W - 2 * ML + 20, size: PANEL_FONT, lineHeight: PANEL_LINE_H, rules: OPERATOR_RULES });
  const plotBottom = marginTop + plotH;
  const cut = plotBottom + marginBottom - 8;
  const H = Math.ceil(panel.empty ? plotBottom + marginBottom : cut + 22 + panel.height + 16);

  const plane = buildPlane({
    width: W, height: H, marginLeft: ML, marginTop, marginBottom, x: [0, vEnd], y: [yLo, yHi], xStep, yStep: niceStep(yHi - yLo, 7), xUnit, yUnit,
    locale, xName: `V(${m.titrantName}) / mL`, yName: "pH", background: PAPER,
  });
  const { board, at, bounds } = plane;
  heading(board, titleText);

  // ---- the indicator bands: given, so they stay in the question's figure ----------------------
  const bandLabels: { text: string; ind: Indicator; i: number }[] = [];
  indicators.forEach((ind, i) => {
    const colour = BAND_COLOURS[i % BAND_COLOURS.length]!;
    const lo = Math.max(ind.from, yLo);
    const hi = Math.min(ind.to, yHi);
    if (!(lo < hi)) return;
    board.marks.push(bandMark(`indicator-band-${i}`, colour, at(0, hi), at(vEnd, lo)));
    bandLabels.push({ text: `${ind.name} (${t.dec(ind.from, 1)}–${t.dec(ind.to, 1)})`, ind, i });
  });

  // ---- the curve, and the drop lines of the marked points ------------------------------------
  const shown = answers ? { half: marks.half, eq: marks.eq.filter((e) => e.visible) } : { half: [], eq: [] };
  const must = [...shown.half.map((h) => h.volume), ...shown.eq.map((e) => e.volume)];
  const curve = sampleCurve(m, vEnd, must, xUnit, yUnit);
  const guide = (id: string, from: Point, to: Point): void => {
    board.poly([from, to], { stroke: FAINT, width: 1.3, lineStyle: "dashed", id });
  };
  const pointsAt: { id: string; x: number; y: number; text: string; prefer: number }[] = [];
  if (answers) {
    pointsAt.push({ id: "initial", x: 0, y: marks.initial, text: `pH_{0} = ${t.pH(marks.initial)}`, prefer: acid ? 20 : -20 });
    for (const h of marks.half) {
      const pKa = m.pKas[h.k - 1]!;
      const near = Math.abs(h.pH - pKa) < 0.005;
      const sym = m.n === 1 ? "pK_{a}" : `pK_{a${h.k}}`;
      pointsAt.push({
        id: `half-${h.k}`, x: h.volume, y: h.pH,
        text: `${m.n === 1 ? "½V_{eq}" : `V = ${t.short(tidy(h.k - 0.5))}V_{eq,1}`}: pH = ${t.pH(h.pH)} ${near ? "=" : "≈"} ${acid ? sym : `${sym}(BH⁺)`}`,
        prefer: acid ? 60 : -60,
      });
    }
    for (const e of shown.eq) {
      pointsAt.push({ id: `equivalence-${e.k}`, x: e.volume, y: e.pH, text: `${m.n === 1 ? "V_{eq}" : `V_{eq,${e.k}}`} = ${t.short(tidy(e.volume))} mL; pH = ${t.pH(e.pH)}`, prefer: acid ? 40 : -40 });
    }
    // a plane with many marked points keeps its labels clear of a web of guides: the labels carry the values then
    const guided = pointsAt.length <= 4;
    for (const p of pointsAt) {
      if (p.id === "initial" || !guided) continue;
      const at0 = at(p.x, p.y);
      guide(`drop-${p.id}-x`, at0, at(p.x, yLo));
      guide(`drop-${p.id}-y`, at0, at(0, p.y));
    }
  }
  board.poly(curve.map((s) => at(s.v, s.pH)), { stroke: CURVE, width: 2.6, series: "curva", id: "titration-curve" });
  for (const p of pointsAt) {
    board.circle(at(p.x, p.y), 4.6, { stroke: PAPER, fill: POINT, width: 1.4, id: `point-${p.id}`, on: ["curva"] });
  }

  // ---- labels: every piece of ink is down ----------------------------------------------------
  for (const b of bandLabels) {
    const size = 13;
    const o = { size, weight: 600, colour: INK, freeStanding: true as const, id: `band-label-${b.i}` };
    const { w, h } = board.extent(b.text, o);
    const bandTop = at(0, Math.min(b.ind.to, yHi)).y;
    const bandBottom = at(0, Math.max(b.ind.from, yLo)).y;
    const cy = (bandTop + bandBottom) / 2;
    let placed = false;
    for (let x = bounds.r - w / 2 - 6; x - w / 2 > bounds.l + 6 && !placed; x -= 6) {
      const box = board.box(x, cy, w, h);
      if (board.clear(box, 1) && cy - h / 2 >= bandTop - 1 && cy + h / 2 <= bandBottom + 1) {
        board.label(b.text, x, cy, { ...o, width: w });
        placed = true;
      }
    }
    if (!placed) board.label(b.text, bounds.r - w / 2 - 6, cy, { ...o, width: w });
  }
  for (const p of pointsAt) {
    labelBesidePlace(board, p.text, at(p.x, p.y), p.prefer, bounds, { size: 13, weight: 700, colour: POINT_TEXT, id: `label-${p.id}` });
  }

  // ---- the panel ------------------------------------------------------------------------------
  if (!panel.empty) panel.draw(board, { left: ML - 6, top: cut + 22, cut });
  const title = (raw.title as string | undefined) ?? titleText;
  return finish(plane, title, H);
}

// ==== distribution ==============================================================================

function parseDistribution(raw: Record<string, unknown>): { pKas: number[]; species: string[]; name: string | undefined; pH: number | undefined } {
  const path = "acid-base";
  const pKas = asList(raw.pKa, `${path}.pKa`);
  if (pKas === undefined) throw new SpecError(`${path}.pKa is required: a number, or a list for a polyprotic acid`);
  if (pKas.length > 3) throw new SpecError(`${path}.pKa: mono-, di- and triprotic acids only (at most three)`);
  for (let i = 1; i < pKas.length; i += 1) if (!(pKas[i]! > pKas[i - 1]!)) throw new SpecError(`${path}.pKa must increase with each step (${pKas.join(", ")})`);
  let species = defaultSpecies(pKas.length);
  if (raw.species !== undefined) {
    const list = v.array(raw, "species", path, "species names").map((x, i) => {
      if (typeof x !== "string" || x === "") throw new SpecError(`${path}.species[${i}] must be a non-empty string`);
      return x;
    });
    if (list.length !== pKas.length + 1) throw new SpecError(`${path}.species needs ${pKas.length + 1} names (most protonated first) for ${pKas.length} pKa, got ${list.length}`);
    species = list;
  }
  const pH = v.optionalNumber(raw, "pH", path);
  if (pH !== undefined && (pH < 0 || pH > 14)) throw new SpecError(`${path}.pH must lie on the axis, 0 to 14, got ${pH}`);
  return { pKas, species, name: v.optionalString(raw, "name", path), pH };
}

export function expandDistributionDiagram(raw: Record<string, unknown>): FigureSpec {
  const locale = (raw.locale as Locale | undefined) ?? "pt-BR";
  const t = fmtFor(locale);
  const answers = v.optionalBoolean(raw, "answers", "acid-base") !== false;
  const { pKas, species, name, pH: atPH } = parseDistribution(raw);
  const n = pKas.length;
  const alpha = (pH: number): number[] => speciesFractions(pKas, pH);

  const titleText = `Distribuição das espécies${name === undefined ? "" : ` de ${name}`}: fração α em função do pH`;
  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: `α = [espécie] / (soma das espécies), com [H⁺] = 10^{−pH}; cada curva sai da constante de equilíbrio, nenhum ponto é digitado.`, emphasis: "soft" });
    pKas.forEach((p, i) => {
      const a = alpha(p);
      const sym = n === 1 ? "pK_{a}" : `pK_{a${i + 1}}`;
      lines.push({ text: `pH = ${sym} = ${t.short(tidy(p))}: α(${species[i]}) = ${dec3(a[i]!, t)} e α(${species[i + 1]}) = ${dec3(a[i + 1]!, t)}, iguais`, emphasis: "strong" });
    });
    if (atPH !== undefined) {
      const a = alpha(atPH);
      lines.push({ text: `pH = ${t.pH(atPH)}: ${species.map((s, j) => `α(${s}) = ${dec3(a[j]!, t)}`).join("; ")}; Σα = 1`, emphasis: "strong" });
    }
  }
  const plotW = 540;
  const yTop = 1.12;
  const plotH = 330;
  const marginTop = 76;
  const marginBottom = 64;
  const W = Math.ceil(Math.max(ML + MR + plotW, ML + measureHeading(titleText) + MR));
  const panel = layoutPanel(lines, { width: W - 2 * ML + 20, size: PANEL_FONT, lineHeight: PANEL_LINE_H, rules: OPERATOR_RULES });
  const plotBottom = marginTop + plotH;
  const cut = plotBottom + marginBottom - 8;
  const H = Math.ceil(panel.empty ? plotBottom + marginBottom : cut + 22 + panel.height + 16);
  const { xUnit, yUnit } = fitUnits(14, yTop, { equal: false, targetWidth: plotW, targetHeight: plotH });
  const plane = buildPlane({
    width: W, height: H, marginLeft: ML, marginTop, marginBottom, x: [0, 14], y: [0, yTop], xStep: 1, yStep: 0.2, xUnit, yUnit,
    locale, xName: "pH", yName: "fração α", background: PAPER,
  });
  const { board, at, bounds } = plane;
  heading(board, titleText);

  // ---- curves: sampled every 0,05 of pH, and at every pKa and the marked pH exactly ------------------
  const grid = new Set<number>(Array.from({ length: 281 }, (_, i) => tidy(i * 0.05)));
  for (const p of pKas) if (p >= 0 && p <= 14) grid.add(p);
  if (atPH !== undefined) grid.add(atPH);
  const phs = [...grid].sort((a, b) => a - b);
  const table = phs.map((p) => alpha(p));
  const sid = (j: number): string => `alpha-${j}`;

  // the pH line and the crossing drops go down first: they are ink the labels must avoid
  if (atPH !== undefined) {
    board.poly([at(atPH, 0), at(atPH, yTop)], { stroke: INK, width: 1.5, lineStyle: "dashed", id: "ph-line" });
  }
  if (answers) {
    pKas.forEach((p, i) => {
      if (p < 0 || p > 14) return;
      board.poly([at(p, 0), at(p, alpha(p)[i]!)], { stroke: FAINT, width: 1.3, lineStyle: "dashed", id: `drop-pka-${i + 1}` });
    });
  }
  species.forEach((_s, j) => {
    board.poly(phs.map((p, k) => at(p, table[k]![j]!)), { stroke: SPECIES_COLOURS[j]!, width: 2.6, lineStyle: SPECIES_DASH[j]!, series: sid(j), id: `curve-${j}` });
  });
  if (answers) {
    pKas.forEach((p, i) => {
      if (p < 0 || p > 14) return;
      board.circle(at(p, alpha(p)[i]!), 4.6, { stroke: PAPER, fill: INK, width: 1.4, id: `point-pka-${i + 1}`, on: [sid(i), sid(i + 1)] });
    });
    if (atPH !== undefined) {
      const a = alpha(atPH);
      species.forEach((_s, j) => {
        board.circle(at(atPH, a[j]!), 4.2, { stroke: PAPER, fill: SPECIES_COLOURS[j]!, width: 1.4, id: `point-at-ph-${j}`, on: [sid(j)] });
      });
    }
  }

  // ---- labels ------------------------------------------------------------------------------------------
  // each species is named where it dominates: the middle of its own stretch of pH
  species.forEach((s, j) => {
    const from = j === 0 ? 0 : pKas[j - 1]!;
    const to = j === n ? 14 : pKas[j]!;
    const mid = (Math.max(0, from) + Math.min(14, to)) / 2;
    const o = { size: 14, weight: 700, colour: SPECIES_COLOURS[j]!, names: sid(j), id: `label-species-${j}` };
    const { w, h } = board.extent(s, o);
    const own = (id: string | undefined): boolean => id === `curve-${j}`;
    const other = (id: string | undefined): boolean => id !== undefined && id.startsWith("curve-") && !own(id);
    let best: { x: number; y: number } | null = null;
    // above the curve where it peaks; nearest that clears its own curve first
    for (let dx = 0; dx <= 260 && best === null; dx += 8) {
      for (const sign of dx === 0 ? [1] : [1, -1]) {
        const px = at(mid, 0).x + sign * dx;
        if (px - w / 2 < bounds.l || px + w / 2 > bounds.r) continue;
        const pH = (px - at(0, 0).x) / plane.xUnit;
        const top = at(pH, alpha(pH)[j]!).y;
        for (const lift of [h / 2 + 9, h / 2 + 15, h / 2 + 24]) {
          const cy = top - lift;
          if (cy - h / 2 < bounds.t - 4) continue;
          const box = board.box(px, cy, w, h);
          if (!board.clear(box, 1)) continue;
          const tight = board.box(px, cy, w - 4, h - 2);
          if (inkDistance(board, tight, own) > inkDistance(board, tight, other)) continue;
          best = { x: px, y: cy };
          break;
        }
        if (best !== null) break;
      }
    }
    const at0 = best ?? { x: at(mid, 0).x, y: at(mid, alpha(mid)[j]!).y - h / 2 - 10 };
    board.label(s, at0.x, at0.y, { ...o, width: w });
  });
  if (answers) {
    pKas.forEach((p, i) => {
      if (p < 0 || p > 14) return;
      const sym = n === 1 ? "pK_{a}" : `pK_{a${i + 1}}`;
      labelBesidePlace(board, `${sym} = ${t.short(tidy(p))}`, at(p, alpha(p)[i]!), 0, bounds, { size: 13, weight: 700, colour: INK, id: `label-pka-${i + 1}` });
    });
  }
  if (atPH !== undefined) {
    const text = `pH = ${t.pH(atPH)}`;
    const o = { size: 13, weight: 700, colour: INK, annotates: "ph-line", id: "label-ph-line" };
    const { w, h } = board.extent(text, o);
    const cx = Math.min(Math.max(at(atPH, 0).x, bounds.l + w / 2), bounds.r + 30 - w / 2);
    board.label(text, cx, at(atPH, yTop).y - ARROW_OVERSHOOT - h / 2 + 2, { ...o, width: w });
  }
  if (!panel.empty) panel.draw(board, { left: ML - 6, top: cut + 22, cut });
  return finish(plane, (raw.title as string | undefined) ?? titleText, H);
}

/** A fraction to three decimals; one too small for that to three significant digits (never "0,000"). */
function dec3(x: number, t: Fmt): string {
  return x >= 0.0005 ? t.dec(x, 3) : formatNumber(x, "pt-BR") === "0" ? "0" : sig3(x, t);
}
function sig3(x: number, t: Fmt): string {
  // the shortest honest form: 0,000215
  return t.short(Number(x.toPrecision(2)));
}

// ==== pH scale ==================================================================================

type Substance = { name: string; pH: number; from: "pH" | "H" | "OH"; value: number | undefined };

function parseSubstances(raw: Record<string, unknown>): Substance[] {
  const path = "acid-base.substances";
  const list = v.nonEmptyArray(raw, "substances", "acid-base", "substances").map((item, i): Substance => {
    const at = `${path}[${i}]`;
    const o = v.object(item, at);
    for (const key of Object.keys(o)) if (!["name", "pH", "H", "OH"].includes(key)) throw new SpecError(`${at}.${key} is not a field; use name and one of pH, H, OH`);
    const name = v.requiredString(o, "name", at);
    const given = ["pH", "H", "OH"].filter((k) => o[k] !== undefined);
    if (given.length !== 1) throw new SpecError(`${at}: give exactly one of pH, H ([H⁺] in mol/L) or OH ([OH⁻] in mol/L); got ${given.length === 0 ? "none" : given.join(" and ")}`);
    const key = given[0] as "pH" | "H" | "OH";
    const x = v.finite(o[key], `${at}.${key}`);
    if (key !== "pH" && !(x > 0)) throw new SpecError(`${at}.${key} is a concentration and must be positive, got ${x}`);
    const pH = key === "pH" ? x : key === "H" ? phFromH(x) : phFromOH(x);
    if (pH < -1e-9 || pH > 14 + 1e-9) throw new SpecError(`${at}: pH ${tidy(pH)} lies off the 0 to 14 scale`);
    return { name, pH: Math.min(14, Math.max(0, pH)), from: key, value: key === "pH" ? undefined : x };
  });
  return list;
}

/** A piece of the colour bar: acid warm, neutral pale, base cool -- a ramp that survives colour blindness, and every region also carries its word. */
const SCALE_STOPS: [number, string][] = [
  [0, "#B7410E"],
  [3, "#E8853B"],
  [5.5, "#F4D58D"],
  [7, "#EEF2E6"],
  [9, "#A9D6E5"],
  [11.5, "#4F9DC7"],
  [14, "#1F4E8C"],
];

export function expandPhScale(raw: Record<string, unknown>): FigureSpec {
  const locale = (raw.locale as Locale | undefined) ?? "pt-BR";
  const t = fmtFor(locale);
  const answers = v.optionalBoolean(raw, "answers", "acid-base") !== false;
  const subs = parseSubstances(raw);
  const indicators = parseIndicators(raw.indicators, "acid-base.indicators");
  const W = 780;
  const X0 = 56;
  const BAR_W = W - 2 * X0;
  const xOf = (pH: number): number => X0 + (pH / 14) * BAR_W;
  const BAR_H = 36;

  // what the drawing places: given pH always; a concentration only in the solution
  const placed = subs.filter((s) => answers || s.from === "pH");
  const measurer = new Board(W, 10, PAPER);
  const pHText = (x: number): string => formatNumber(Number(x.toFixed(2)), locale);
  // A pin is one or more substances at (nearly) one pH: they share the pole, one name to a line.
  type Item = { names: string[]; nameWs: number[]; valueLine: string | undefined; valueW: number; w: number; row: number; x: number; flag: "right" | "left"; left: number };
  const FLAG_GAP = 7;
  const NAME_H = 22;
  const sorted = [...placed].sort((a, b) => b.pH - a.pH);
  const groups: Substance[][] = [];
  for (const sub of sorted) {
    const last = groups[groups.length - 1];
    if (last !== undefined && Math.abs(xOf(last[0]!.pH) - xOf(sub.pH)) < 8) last.push(sub);
    else groups.push([sub]);
  }
  const items: Item[] = groups.map((g) => {
    const texts = g.map((s) => pHText(s.pH));
    const shared = texts.every((x) => x === texts[0]);
    // one value under the names when they agree; otherwise each name carries its own
    const names = g.map((s, i) => (shared ? s.name : `${s.name}: pH ${texts[i]}`));
    const nameWs = names.map((n) => measurer.extent(n, { size: 13, weight: 700 }).w);
    const valueLine = shared ? `pH ${texts[0]}` : undefined;
    const valueW = valueLine === undefined ? 0 : measurer.extent(valueLine, { size: 12 }).w;
    const x = g.reduce((a, s) => a + xOf(s.pH), 0) / g.length;
    const w = Math.max(valueW, ...nameWs);
    return { names, nameWs, valueLine, valueW, w, row: 0, x, flag: "right", left: x + FLAG_GAP };
  });
  const stackH = (it: Item): number => it.names.length * NAME_H + (it.valueLine === undefined ? 0 : NAME_H);
  const MAX_STACK = Math.max(NAME_H, ...items.map(stackH));
  // A flag: a pole up from the pin, its label set beside it (7px from its own pole, at least 8px from any other: the reader
  // attributes by the edge of the text, which the layout guarantees; the centre-distance rule of `annotates` would misjudge a wide label). Each is put in the lowest row whose labels neither
  // overlap it nor stand on its pole, and whose poles do not run through it; right of the pole unless the page ends.
  const done: Item[] = [];
  const conflict = (it: Item, r: number, d: Item): boolean => {
    const a0 = it.left - 4;
    const a1 = it.left + it.w + 4;
    const b0 = d.left - 4;
    const b1 = d.left + d.w + 4;
    if (d.row === r) return a0 < b1 + 6 && b0 < a1 + 6;
    if (d.row > r) return d.x > a0 - 8 && d.x < a1 + 12; // d's pole rises through row r
    return it.x > b0 - 8 && it.x < b1 + 12; // our pole rises through d's label
  };
  for (const it of items) {
    let best: { r: number; flag: "right" | "left"; left: number } | undefined;
    for (const flag of ["right", "left"] as const) {
      it.flag = flag;
      it.left = flag === "right" ? it.x + FLAG_GAP : it.x - FLAG_GAP - it.w;
      if (it.left < 10 || it.left + it.w > W - 14) continue;
      let r = 0;
      while (r < 12 && done.some((d) => conflict(it, r, d))) r += 1;
      if (r >= 12) continue;
      best = { r, flag, left: it.left };
      break; // right of the pole unless the page ends there
    }
    if (best === undefined) throw new SpecError(`acid-base: no room for the label of "${it.names.join(", ")}" on the scale`);
    it.row = best.r;
    it.flag = best.flag;
    it.left = best.left;
    done.push(it);
  }
  const rows = done.length === 0 ? 0 : Math.max(...done.map((d) => d.row)) + 1;
  const ROW_H = MAX_STACK + 12;
  const zoneTop = 54;
  const barTop = zoneTop + rows * ROW_H + 22;
  const barBottom = barTop + BAR_H;
  const tickY = barBottom + 18;
  const wordY = barBottom + 44;
  const indTop = wordY + 34;
  const IND_H = 30;
  const titleText = (raw.title as string | undefined) ?? "A escala de pH";

  // ---- the panel: the arithmetic of every substance given by a concentration ---------------------
  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: `pH = −log[H⁺];  pOH = −log[OH⁻];  pH + pOH = pK_{w} = 14 (K_{w} = ${t.dec(1, 1)}·10^{−14} a 25 °C)`, emphasis: "soft" });
    for (const s of subs) {
      if (s.from === "H") {
        lines.push({ text: `${s.name}: [H⁺] = ${t.sci(s.value!)} mol/L → pH = −log(${t.sci(s.value!)}) = ${t.pH(s.pH)}`, emphasis: "strong" });
      } else if (s.from === "OH") {
        const pOH = pOf(s.value!);
        lines.push({ text: `${s.name}: [OH⁻] = ${t.sci(s.value!)} mol/L → pOH = −log(${t.sci(s.value!)}) = ${t.pH(pOH)} → pH = 14 − ${t.pH(pOH)} = ${t.pH(s.pH)}`, emphasis: "strong" });
      }
    }
  }
  const panel = layoutPanel(lines, { width: W - 2 * ML + 20, size: PANEL_FONT, lineHeight: PANEL_LINE_H, rules: OPERATOR_RULES });
  const scaleBottom = indTop + indicators.length * IND_H;
  const cut = scaleBottom + 6;
  const H = Math.ceil(panel.empty ? scaleBottom + 24 : cut + 20 + panel.height + 16);
  const board = new Board(W, H, PAPER);
  heading(board, titleText);

  // ---- the bar: one block, a gradient computed from the stops -------------------------------------
  const bar: Block = {
    type: "block",
    id: "ph-bar",
    label: "",
    x: X0,
    y: barTop,
    width: BAR_W,
    height: BAR_H,
    padding: 0,
    fill: { kind: "linear", angle: 90, stops: SCALE_STOPS.map(([pH, color]) => ({ offset: pH / 14, color })) },
    // the scale is what the figure is read against, as the plane's lattice is: substrate, not a rival for a label's nearest thing
    gridOf: "ph-scale",
    stroke: AXIS,
    strokeWidth: 1.4,
    wrap: "none",
    textAlign: "center",
    verticalAlign: "center",
    textColor: INK,
    fontFamily: SANS,
    fontSize: 12,
    fontWeight: 400,
    letterSpacing: 0.1,
  };
  board.kids.push(bar);
  board.trace([{ x: X0, y: barTop }, { x: X0 + BAR_W, y: barTop }, { x: X0 + BAR_W, y: barBottom }, { x: X0, y: barBottom }, { x: X0, y: barTop }], AXIS, 1.4, "ph-bar-outline");
  for (let k = 0; k <= 14; k += 1) {
    board.poly([{ x: xOf(k), y: barBottom }, { x: xOf(k), y: barBottom + 6 }], { stroke: AXIS, width: 1.4, id: `scale-tick-${k}` });
    board.label(formatNumber(k, locale), xOf(k), tickY + 4, { size: 12, colour: SOFT, freeStanding: true, id: `scale-number-${k}` });
  }
  board.label("pH", X0 - 26, tickY + 4, { size: 13, weight: 700, colour: SOFT, freeStanding: true, id: "scale-name" });
  for (const [text, pH] of [["ÁCIDO", 3.5], ["NEUTRO", 7], ["BÁSICO", 10.5]] as const) {
    board.label(text, xOf(pH), wordY, { size: 12, weight: 700, colour: SOFT, tracking: 1.2, freeStanding: true, id: `scale-word-${text}` });
  }

  // ---- substances: pin on the bar, a leader up to a label -----------------------------------------
  done.forEach((it, i) => {
    const rowBottom = barTop - 12 - it.row * ROW_H;
    const leaderId = `leader-${i}`;
    const stackTop = rowBottom - stackH(it);
    board.poly([{ x: it.x, y: barTop }, { x: it.x, y: stackTop }], { stroke: INK, width: 1.5, id: leaderId });
    const align = it.flag === "right" ? "start" : "end";
    const at = (w: number): number => (it.flag === "right" ? it.left + w / 2 : it.left + it.w - w / 2);
    it.names.forEach((name, k) => {
      board.label(name, at(it.nameWs[k]!), stackTop + NAME_H * k + NAME_H / 2, { size: 13, weight: 700, colour: INK, width: it.nameWs[k]!, align, freeStanding: true, id: `substance-${i}-${k}` });
    });
    if (it.valueLine !== undefined) {
      board.label(it.valueLine, at(it.valueW), rowBottom - NAME_H / 2, { size: 12, colour: SOFT, width: it.valueW, align, freeStanding: true, id: `substance-${i}-ph` });
    }
  });

  // ---- indicator ranges: a bracket under the bar, named and numbered ------------------------------
  indicators.forEach((ind, i) => {
    const y = indTop + i * IND_H + IND_H / 2 - 2;
    const colour = BAND_COLOURS[i % BAND_COLOURS.length]!;
    const a = xOf(Math.max(0, ind.from));
    const b = xOf(Math.min(14, ind.to));
    board.poly([{ x: a, y: y }, { x: b, y: y }], { stroke: colour, width: 9, id: `indicator-range-${i}` });
    board.poly([{ x: a, y: y - 8 }, { x: a, y: y + 8 }], { stroke: INK, width: 1.6, id: `indicator-lo-${i}` });
    board.poly([{ x: b, y: y - 8 }, { x: b, y: y + 8 }], { stroke: INK, width: 1.6, id: `indicator-hi-${i}` });
    const text = `${ind.name}  ${t.dec(ind.from, 1)}–${t.dec(ind.to, 1)}`;
    const o = { size: 13, weight: 600, colour: INK, freeStanding: true as const, id: `indicator-label-${i}` };
    const { w } = board.extent(text, o);
    const right = b + 10 + w / 2;
    const cx = right + w / 2 <= W - 16 ? right : a - 10 - w / 2;
    board.label(text, cx, y, { ...o, width: w });
  });

  if (!panel.empty) panel.draw(board, { left: ML - 6, top: cut + 20, cut });
  const spec = board.spec(titleText);
  (spec.root as Scene).height = H;
  return parseSpec(spec);
}

// ==== entry points ==============================================================================

export function expandAcidBase(input: AcidBaseInput): FigureSpec {
  const raw = input as unknown as Record<string, unknown>;
  switch (raw.kind) {
    case "titration":
      return expandTitration(raw);
    case "distribution":
      return expandDistributionDiagram(raw);
    case "ph-scale":
      return expandPhScale(raw);
    default:
      throw new SpecError(`acid-base.kind must be one of titration, distribution, ph-scale, got ${JSON.stringify(raw.kind)}`);
  }
}

export function validateAcidBaseInput(raw: Record<string, unknown>): void {
  const path = "acid-base";
  const keys = KEYS[String(raw.kind)];
  if (keys === undefined) throw new SpecError(`${path}.kind must be one of titration, distribution, ph-scale, got ${JSON.stringify(raw.kind)}`);
  for (const key of Object.keys(raw)) {
    if (!keys.includes(key)) throw new SpecError(`${path}.${key} is not a field of kind "${String(raw.kind)}"; use ${keys.filter((k) => k !== "preset").join(", ")}`);
  }
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  v.optionalBoolean(raw, "answers", path);
  // every number is exercised by building the figure
  v.probe(() => expandAcidBase(raw as unknown as AcidBaseInput));
}
