/**
 * pictogram -- data drawn as rows of icons, and figurate-number patterns
 * (ADR 0072). ENEM prints both: "cada ícone representa 5 % dos entrevistados",
 * and "a sequência de figuras formadas por pontos".
 *
 * What is typed is the data. Everything drawn is computed from it:
 *
 *  - icons: each row's value divided by what one icon stands for (`per`)
 *    gives the icons filled; a fractional remainder fills the last icon by
 *    exactly that fraction (the icon's polygons clipped at that width), or is
 *    rounded when `partial: "round"`. With `of` (default 100 for "%") every row
 *    shows the same number of slots, the unfilled ones in outline.
 *  - figurate: figure k of a polygonal sequence is the union of the
 *    perimeters of nested regular polygons of sides 0..k-1 sharing one vertex,
 *    dots at unit spacing, deduplicated. The count is never typed: it comes out
 *    of the construction and equals the polygonal number
 *    ((s-2)k² - (s-4)k)/2, which the tests hold it to.
 *
 * answers:false hides what a question asks the reader to read off: each
 * row's value, and each figure's count. The icons, the key and the figures stay.
 */

import type { FigureSpec, Point } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { LOCALES, formatNumber } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";

// ---- input ------------------------------------------------------------------

export const ICONS = ["person", "circle", "square", "smiley", "house", "star"] as const;
export type IconName = (typeof ICONS)[number];
export const FIGURATE = ["triangular", "square", "pentagonal", "hexagonal"] as const;
export type FigurateShape = (typeof FIGURATE)[number];

export type PictogramInput = {
  title?: string;
  locale?: Locale;
  /** "icons" (default): rows of icons. "figurate": a sequence of dot figures. */
  kind?: "icons" | "figurate";
  /** icons: the shape of one icon. Default "person". */
  icon?: IconName;
  /** icons: one row per item. */
  rows?: { label: string; value: number }[];
  /** icons: what one icon stands for, in the rows' unit. Default 1. */
  per?: number;
  /** icons: the rows' unit, printed after each value and in the key ("%", "pessoas"). */
  unit?: string;
  /** icons: the whole each row is a part of, drawn as outline slots. Default 100 when unit is "%", else none. */
  of?: number;
  /** icons: icons per line before a row wraps. Default 20. */
  perLine?: number;
  /** icons: "exact" (default) fills the last icon by its fraction; "round" rounds to whole icons. */
  partial?: "exact" | "round";
  /** icons: the key line "Cada ícone representa …". Default true. */
  key?: boolean;
  /** figurate: the polygon. */
  shape?: FigurateShape;
  /** figurate: how many figures, 1..terms. Default 4. */
  terms?: number;
  /** figurate: what each figure is called. Default "Figura". */
  name?: string;
  /** false: the question's figure -- no row values, no figure counts. Default true. */
  answers?: boolean;
};

// ---- palette ------------------------------------------------------------------

const PAPER = "#FBFAF7";
const INK = "#181B21";
const SOFT = "#5B6270";
const KEY = "#1D4E89";
const EMPTY = "#C3C8D0";
const FAINT = "#D9DDE3";
const M = 24;

// ---- geometry -----------------------------------------------------------------

type Poly = Point[];

/** The part of a polygon left of the vertical line x = cut (one Sutherland–Hodgman pass). */
export function clipLeft(poly: Poly, cut: number): Poly {
  const out: Poly = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const ain = a.x <= cut;
    const bin = b.x <= cut;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (cut - a.x) / (b.x - a.x);
      out.push({ x: cut, y: a.y + t * (b.y - a.y) });
    }
  }
  return out;
}

function disc(cx: number, cy: number, r: number, n = 28): Poly {
  return Array.from({ length: n }, (_, k) => ({ x: cx + r * Math.cos((2 * Math.PI * k) / n), y: cy + r * Math.sin((2 * Math.PI * k) / n) }));
}

/** An icon as filled polygons in a w×h box at (x, y), plus details drawn over the fill. */
export function iconShape(icon: IconName, x: number, y: number): { w: number; h: number; parts: Poly[]; details: Poly[][] } {
  switch (icon) {
    case "person":
      return {
        w: 18,
        h: 44,
        parts: [disc(x + 9, y + 8, 6.5), [{ x: x + 1, y: y + 44 }, { x: x + 1, y: y + 27 }, { x: x + 4, y: y + 18 }, { x: x + 14, y: y + 18 }, { x: x + 17, y: y + 27 }, { x: x + 17, y: y + 44 }]],
        details: [],
      };
    case "circle":
      return { w: 22, h: 22, parts: [disc(x + 11, y + 11, 10.5)], details: [] };
    case "square":
      return { w: 20, h: 20, parts: [[{ x, y }, { x: x + 20, y }, { x: x + 20, y: y + 20 }, { x, y: y + 20 }]], details: [] };
    case "smiley": {
      const mouth = Array.from({ length: 9 }, (_, k) => {
        const a = Math.PI * (0.2 + (0.6 * k) / 8);
        return { x: x + 13 + 7 * Math.cos(a), y: y + 13 + 7 * Math.sin(a) };
      });
      return { w: 26, h: 26, parts: [disc(x + 13, y + 13, 12.5)], details: [[disc(x + 9, y + 10, 1.8, 10)], [disc(x + 17, y + 10, 1.8, 10)], [mouth]] };
    }
    case "house":
      return { w: 24, h: 24, parts: [[{ x: x + 12, y }, { x: x + 24, y: y + 11 }, { x: x + 21, y: y + 11 }, { x: x + 21, y: y + 24 }, { x: x + 3, y: y + 24 }, { x: x + 3, y: y + 11 }, { x, y: y + 11 }]], details: [] };
    case "star": {
      const pts: Poly = [];
      for (let k = 0; k < 10; k += 1) {
        const a = -Math.PI / 2 + (Math.PI * k) / 5;
        const r = k % 2 === 0 ? 12.5 : 5.2;
        pts.push({ x: x + 12.5 + r * Math.cos(a), y: y + 13 + r * Math.sin(a) });
      }
      return { w: 25, h: 25, parts: [pts], details: [] };
    }
  }
}

const SIDES: Record<FigurateShape, number> = { triangular: 3, square: 4, pentagonal: 5, hexagonal: 6 };

/** The polygonal number: ((s - 2)k² - (s - 4)k) / 2. */
export function polygonalNumber(shape: FigurateShape, k: number): number {
  const s = SIDES[shape];
  return ((s - 2) * k * k - (s - 4) * k) / 2;
}

/**
 * Figure k of a polygonal sequence, in unit spacing, y up: the dots on the
 * perimeters of nested regular polygons of sides 0..k-1 sharing the origin,
 * deduplicated, and those polygons' outlines.
 */
export function figurateDots(shape: FigurateShape, k: number): { dots: Point[]; outlines: Poly[] } {
  const s = SIDES[shape];
  const seen = new Map<string, Point>();
  const outlines: Poly[] = [];
  const add = (p: Point): void => {
    const key = `${Math.round(p.x * 1e6)},${Math.round(p.y * 1e6)}`;
    if (!seen.has(key)) seen.set(key, p);
  };
  add({ x: 0, y: 0 });
  for (let m = 1; m < k; m += 1) {
    let at = { x: 0, y: 0 };
    const outline: Poly = [];
    for (let j = 0; j < s; j += 1) {
      const a = (2 * Math.PI * j) / s;
      const d = { x: Math.cos(a), y: Math.sin(a) };
      outline.push(at);
      for (let t = 0; t < m; t += 1) add({ x: at.x + d.x * t, y: at.y + d.y * t });
      at = { x: at.x + d.x * m, y: at.y + d.y * m };
    }
    outlines.push(outline);
  }
  return { dots: [...seen.values()], outlines };
}

// ---- validation -------------------------------------------------------------------

const KEYS = ["preset", "title", "locale", "kind", "icon", "rows", "per", "unit", "of", "perLine", "partial", "key", "shape", "terms", "name", "answers"];
const ICON_KEYS = ["icon", "rows", "per", "unit", "of", "perLine", "partial", "key"];
const FIG_KEYS = ["shape", "terms", "name"];
const MAX_ICONS = 400;

export function validatePictogramInput(raw: Record<string, unknown>): void {
  const path = "pictogram";
  for (const k of Object.keys(raw)) {
    if (!KEYS.includes(k)) throw new SpecError(`${path}.${k} is not a field of pictogram (${KEYS.filter((x) => x !== "preset").join(", ")})`);
  }
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  const kind = v.optionalEnum(raw, "kind", path, ["icons", "figurate"]) ?? "icons";
  const foreign = (kind === "icons" ? FIG_KEYS : ICON_KEYS).filter((k) => raw[k] !== undefined);
  if (foreign.length > 0) throw new SpecError(`${path}: ${foreign.join(", ")} belong(s) to kind "${kind === "icons" ? "figurate" : "icons"}", not "${kind}"`);
  if (kind === "icons") {
    v.optionalEnum(raw, "icon", path, ICONS);
    const rows = v.array(raw, "rows", path, "rows of { label, value }");
    if (rows.length === 0) throw new SpecError(`${path}.rows must not be empty`);
    rows.forEach((r, i) => {
      const o = v.object(r, `${path}.rows[${i}]`);
      v.requiredString(o, "label", `${path}.rows[${i}]`);
      const value = v.requiredNumber(o, "value", `${path}.rows[${i}]`);
      if (value < 0) throw new SpecError(`${path}.rows[${i}].value must not be negative, got ${value}`);
    });
    const per = v.optionalNumber(raw, "per", path);
    if (per !== undefined && !(per > 0)) throw new SpecError(`${path}.per must be positive, got ${per}`);
    v.optionalString(raw, "unit", path);
    const of = v.optionalNumber(raw, "of", path);
    if (of !== undefined && !(of > 0)) throw new SpecError(`${path}.of must be positive, got ${of}`);
    const perLine = v.optionalNumber(raw, "perLine", path);
    if (perLine !== undefined && (!Number.isInteger(perLine) || perLine < 1 || perLine > 40)) throw new SpecError(`${path}.perLine must be an integer from 1 to 40, got ${perLine}`);
    v.optionalEnum(raw, "partial", path, ["exact", "round"]);
    v.optionalBoolean(raw, "key", path);
  } else {
    if (raw.shape === undefined) throw new SpecError(`${path}.shape is required for kind "figurate" (${FIGURATE.join(", ")})`);
    v.optionalEnum(raw, "shape", path, FIGURATE);
    const terms = v.optionalNumber(raw, "terms", path);
    if (terms !== undefined && (!Number.isInteger(terms) || terms < 1 || terms > 6)) throw new SpecError(`${path}.terms must be an integer from 1 to 6, got ${terms}`);
    v.optionalString(raw, "name", path);
  }
  v.optionalBoolean(raw, "answers", path);
  v.probe(() => expandPictogram(raw as unknown as PictogramInput));
}

// ---- drawing --------------------------------------------------------------------

function unitText(value: number, unit: string | undefined, locale: Locale): string {
  const n = formatNumber(value, locale);
  if (unit === undefined || unit === "") return n;
  return `${n} ${unit}`;
}

function drawIcons(input: PictogramInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const answers = input.answers !== false;
  const icon = input.icon ?? "person";
  const rows = input.rows!;
  const per = input.per ?? 1;
  const of = input.of ?? (input.unit === "%" ? 100 : undefined);
  const exact = (input.partial ?? "exact") === "exact";
  const counts = rows.map((r) => (exact ? r.value / per : Math.round(r.value / per)));
  const slots = of === undefined ? Math.ceil(Math.max(...counts) - 1e-9) : Math.ceil(of / per - 1e-9);
  if (of !== undefined && counts.some((c) => c > of / per + 1e-9)) throw new SpecError(`pictogram: a row's value exceeds \`of\` (${of})`);
  if (slots * rows.length > MAX_ICONS) throw new SpecError(`pictogram: ${slots * rows.length} icons is too many to read; raise \`per\` (each icon = ${per})`);
  const perLine = Math.min(input.perLine ?? 20, Math.max(1, slots));
  const lines = Math.max(1, Math.ceil(slots / perLine));

  const probe = new Board(10, 10, PAPER);
  const shape0 = iconShape(icon, 0, 0);
  const gap = shape0.w + 6;
  const lineH = shape0.h + 10;
  const rowH = lines * lineH + 16;
  const labelW = Math.max(...rows.map((r) => probe.measure(r.label, 15, 0.1, 600))) + 24;
  const values = rows.map((r) => unitText(r.value, input.unit, locale));
  const valueW = answers ? Math.max(...values.map((t) => probe.measure(t, 15, 0.1, 700))) + 20 : 0;
  const keyText = input.key === false ? undefined : `Cada ícone representa ${unitText(per, input.unit, locale)}.`;
  const iconsW = perLine * gap - 6;
  const W = Math.ceil(M + labelW + iconsW + 12 + valueW + M);
  const titleH = input.title === undefined ? 0 : 34;
  const H = Math.ceil(M + titleH + rows.length * rowH + (keyText === undefined ? 0 : 30) + M - 16);
  // Wide enough for every line of text, not only the icons: the title and the key can be the widest thing.
  const textW = Math.max(keyText === undefined ? 0 : probe.measure(keyText, 13), input.title === undefined ? 0 : probe.measure(input.title, 16, 0.1, 700));
  const b = new Board(Math.ceil(Math.max(W, textW + 2 * M + 8)), H, PAPER);
  if (input.title !== undefined) b.label(input.title, M + b.measure(input.title, 16, 0.1, 700) / 2, M + 10, { size: 16, weight: 700, colour: INK, freeStanding: true });

  rows.forEach((row, r) => {
    const top = M + titleH + r * rowH;
    b.label(row.label, M + b.measure(row.label, 15, 0.1, 600) / 2, top + (lines * lineH) / 2 - 5, { size: 15, weight: 600, colour: INK, freeStanding: true });
    const n = counts[r]!;
    let last = "";
    for (let i = 0; i < Math.max(slots, Math.ceil(n - 1e-9)); i += 1) {
      const x = M + labelW + (i % perLine) * gap;
      const y = top + Math.floor(i / perLine) * lineH;
      const s = iconShape(icon, x, y);
      const fill = Math.min(1, Math.max(0, n - i)); // 1 full, 0 empty, between: the fraction
      const id = `r${r + 1}-i${i + 1}`;
      s.parts.forEach((poly, k) => {
        const pid = `${id}-${k + 1}`;
        if (fill >= 1 - 1e-9) {
          b.poly(poly, { fill: KEY, stroke: KEY, width: 1.4, close: true, id: pid });
        } else {
          b.poly(poly, { fill: PAPER, stroke: fill > 1e-9 ? KEY : EMPTY, width: 1.4, close: true, id: pid });
          if (fill > 1e-9) {
            const part = clipLeft(poly, x + fill * s.w);
            if (part.length >= 3) b.poly(part, { fill: KEY, stroke: "none", close: true, id: `${pid}-part` });
          }
        }
      });
      s.details.forEach((group, k) => group.forEach((poly, j) => {
        const on = fill >= 1 - 1e-9;
        b.poly(poly, { fill: k < 2 && icon === "smiley" ? (on ? PAPER : EMPTY) : "none", stroke: on ? PAPER : EMPTY, width: 1.6, close: k < 2, id: `${id}-d${k + 1}-${j + 1}` });
      }));
      last = `${id}-${s.parts.length}`;
    }
    if (answers) {
      const t = values[r]!;
      b.label(t, M + labelW + iconsW + 12 + b.measure(t, 15, 0.1, 700) / 2, top + (lines * lineH) / 2 - 5, { size: 15, weight: 700, colour: KEY, annotates: last });
    }
  });
  if (keyText !== undefined) {
    b.label(keyText, M + b.measure(keyText, 13) / 2, H - M - 4, { size: 13, colour: SOFT, freeStanding: true });
  }
  return parseSpec(b.spec(input.title ?? "pictograma"));
}

function drawFigurate(input: PictogramInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const answers = input.answers !== false;
  const shape = input.shape!;
  const terms = input.terms ?? 4;
  const name = input.name ?? "Figura";
  const unit = 26; // px between neighbouring dots
  const figs = Array.from({ length: terms }, (_, i) => figurateDots(shape, i + 1));
  const boxes = figs.map((f) => {
    const xs = f.dots.map((p) => p.x);
    const ys = f.dots.map((p) => p.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  });
  const tallest = Math.max(...boxes.map((bx) => bx.y1 - bx.y0)) * unit;
  const probe = new Board(10, 10, PAPER);
  const captions = figs.map((f, i) => `${name} ${i + 1}`);
  const counts = figs.map((f) => `${formatNumber(f.dots.length, locale)} ${f.dots.length === 1 ? "ponto" : "pontos"}`);
  const colW = boxes.map((bx, i) => Math.max((bx.x1 - bx.x0) * unit + 16, probe.measure(captions[i]!, 14, 0.1, 600) + 12, probe.measure(counts[i]!, 13) + 12));
  const gapX = 40;
  const titleH = input.title === undefined ? 0 : 34;
  const W = Math.ceil(Math.max(2 * M + colW.reduce((s, w) => s + w, 0) + gapX * (terms - 1), input.title === undefined ? 0 : probe.measure(input.title, 16, 0.1, 700) + 2 * M + 8));
  const base = M + titleH + tallest + 10;
  const H = Math.ceil(base + 30 + (answers ? 30 : 0) + M);
  const b = new Board(W, H, PAPER);
  if (input.title !== undefined) b.label(input.title, M + b.measure(input.title, 16, 0.1, 700) / 2, M + 10, { size: 16, weight: 700, colour: INK, freeStanding: true });
  let left = M;
  figs.forEach((f, i) => {
    const bx = boxes[i]!;
    const cx = left + colW[i]! / 2;
    const ox = cx - ((bx.x0 + bx.x1) / 2) * unit;
    const X = (p: Point): Point => ({ x: ox + p.x * unit, y: base - (p.y - bx.y0) * unit });
    f.outlines.forEach((o, k) => b.poly(o.map(X), { stroke: FAINT, width: 1.2, close: true, id: `f${i + 1}-outline-${k + 1}` }));
    f.dots.forEach((p, k) => b.circle(X(p), 4.6, { fill: KEY, stroke: KEY, width: 1, id: `f${i + 1}-dot-${k + 1}` }));
    b.label(captions[i]!, cx, base + 24, { size: 14, weight: 600, colour: INK, freeStanding: true });
    if (answers) b.label(counts[i]!, cx, base + 54, { size: 13, colour: SOFT, freeStanding: true });
    left += colW[i]! + gapX;
  });
  return parseSpec(b.spec(input.title ?? `sequência ${shape}`));
}

export function expandPictogram(input: PictogramInput): FigureSpec {
  return (input.kind ?? "icons") === "figurate" ? drawFigurate(input) : drawIcons(input);
}
