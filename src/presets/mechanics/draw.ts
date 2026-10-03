/**
 * What every mechanics kind draws with: the palette, numbers as printed,
 * arrows and their names, dimension lines, springs, hatched surfaces, and the
 * reading panel under the figure. A kind file draws its situation with these
 * and nothing else shared.
 */

import type { Point, TextRun } from "../../ir/types.ts";
import { runsText } from "../../ir/types.ts";
import { formatNumber } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import { Board } from "../function-graph/board.ts";
import { hasScripts, layoutPanel, rich } from "../shared/panel.ts";
import type { PanelLineInput } from "../shared/panel.ts";

// ---- palette ---------------------------------------------------------------------

export const PAPER = "#FBFAF7";
export const INK = "#181B21";
export const SOFT = "#5B6270";
export const KEY = "#1D4E89";
export const RUST = "#B8431B";
export const GREEN = "#2E6B3A";
export const WHEEL = "#E3E6EA";
export const BLOCK = "#F3E6B8";
export const SLOPE = "#E7E3D8";
export const TENSION = "#6B3FA0";
export const M = 28;

// ---- numbers ------------------------------------------------------------------------

/** A number as printed: two decimals at most, and "≈" when that rounded it. */
export function quantity(x: number, locale: Locale): { text: string; approx: boolean } {
  const r = Math.round(x * 100) / 100;
  return { text: formatNumber(r, locale), approx: Math.abs(r - x) > 1e-9 };
}

export function eq(name: string, x: number, unit: string, locale: Locale): string {
  const q = quantity(x, locale);
  return `${name} ${q.approx ? "≈" : "="} ${q.text} ${unit}`;
}

// ---- arrows and names -------------------------------------------------------------------

export function arrow(b: Board, from: Point, to: Point, colour: string, id: string, o: { width?: number; dashed?: boolean } = {}): void {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const u = { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
  const n = { x: -u.y, y: u.x };
  const head = Math.min(11, len * 0.45);
  const half = head / 2;
  const base = { x: to.x - u.x * head, y: to.y - u.y * head };
  b.poly([from, base], { stroke: colour, width: o.width ?? 2.4, id, ...(o.dashed ? { lineStyle: "dashed" as const } : {}) });
  b.poly([to, { x: base.x + n.x * half, y: base.y + n.y * half }, { x: base.x - n.x * half, y: base.y - n.y * half }], { fill: colour, stroke: colour, width: 1, close: true, id: `${id}-head` });
}

/** A label for an arrow, set beyond its tip and naming its head. Scripts by `_{…}` markup. */
export function arrowLabel(b: Board, text: string, tip: Point, dir: Point, colour: string, id: string): void {
  const runs: TextRun[] = rich(text);
  const plain = runsText(runs);
  const { w, h } = b.extent(plain, { size: 15, weight: 700 });
  const reach = Math.abs(dir.x) * (w / 2) + Math.abs(dir.y) * (h / 2) + 6;
  const n = { x: -dir.y, y: dir.x };
  const block = b.place(plain, tip.x + dir.x * reach, tip.y + dir.y * reach, [dir, n, { x: -n.x, y: -n.y }], {
    size: 15,
    weight: 700,
    colour,
    annotates: `${id}-head`,
    steps: 8,
  });
  if (hasScripts(runs)) block.runs = runs.map((r) => ({ ...r }));
}

/** A label for something that is not an arrow (a block, a dimension), with `_{…}` scripts. */
export function name(b: Board, text: string, cx: number, cy: number, annotates: string, colour = INK, size = 15): void {
  const runs = rich(text);
  const block = b.label(runsText(runs), cx, cy, { size, weight: 700, colour, annotates });
  if (hasScripts(runs)) block.runs = runs.map((q) => ({ ...q }));
}

// ---- shapes -------------------------------------------------------------------------------

export const arcPts = (c: Point, r: number, a0: number, a1: number, steps = 24): Point[] =>
  Array.from({ length: steps + 1 }, (_, k) => {
    const a = a0 + ((a1 - a0) * k) / steps;
    return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
  });

export function hatchLine(b: Board, x0: number, x1: number, y: number, side: -1 | 1, id: string): void {
  b.poly([{ x: x0, y }, { x: x1, y }], { stroke: INK, width: 2.4, id });
  for (let x = x0 + 6; x <= x1 - 4; x += 14) b.poly([{ x, y }, { x: x + 10, y: y + side * 10 }], { stroke: INK, width: 1.1, id: `${id}-h${Math.round(x)}` });
}

export function rect(b: Board, cx: number, top: number, w: number, h: number, id: string, fill = BLOCK): void {
  b.poly([{ x: cx - w / 2, y: top }, { x: cx + w / 2, y: top }, { x: cx + w / 2, y: top + h }, { x: cx - w / 2, y: top + h }], { stroke: INK, width: 2.2, fill, close: true, id });
}

/** A vertical dimension line with a head at each end, named by its label. */
export function dimension(b: Board, x: number, y0: number, y1: number, id: string): void {
  b.poly([{ x, y: y0 }, { x, y: y1 }], { stroke: SOFT, width: 1.3, id });
  for (const [end, dir] of [[y0, -1], [y1, 1]] as const) {
    b.poly([{ x, y: end }, { x: x - 4, y: end - dir * 9 }, { x: x + 4, y: end - dir * 9 }], { fill: SOFT, stroke: SOFT, width: 1, close: true, id: `${id}-${dir < 0 ? "top" : "bottom"}` });
  }
}

export function springPath(x: number, y0: number, y1: number, coils = 9, amp = 10): Point[] {
  const lead = 12;
  const pts: Point[] = [{ x, y: y0 }, { x, y: y0 + lead }];
  const n = coils * 2;
  for (let i = 1; i < n; i += 1) pts.push({ x: x + (i % 2 === 1 ? amp : -amp), y: y0 + lead + ((y1 - y0 - 2 * lead) * i) / n });
  pts.push({ x, y: y1 - lead }, { x, y: y1 });
  return pts;
}

/** A horizontal dimension line with a head at each end, named by its label. */
export function dimensionH(b: Board, y: number, x0: number, x1: number, id: string): void {
  b.poly([{ x: x0, y }, { x: x1, y }], { stroke: SOFT, width: 1.3, id });
  for (const [end, dir] of [[x0, -1], [x1, 1]] as const) {
    b.poly([{ x: end, y }, { x: end - dir * 9, y: y - 4 }, { x: end - dir * 9, y: y + 4 }], { fill: SOFT, stroke: SOFT, width: 1, close: true, id: `${id}-${dir < 0 ? "left" : "right"}` });
  }
}

/** The unit vector from p to q. */
export function unitTo(p: Point, q: Point): Point {
  const d = Math.hypot(q.x - p.x, q.y - p.y);
  return { x: (q.x - p.x) / d, y: (q.y - p.y) / d };
}

// ---- the reading panel ----------------------------------------------------------------------

export function panelBelow(b0: { W: number; y: number }, lines: PanelLineInput[]): { height: number; draw: (b: Board) => void; width: number } {
  const panel = layoutPanel(lines, { width: Math.max(460, b0.W - 2 * M), size: 14, lineHeight: 26 });
  return {
    height: panel.empty ? 0 : panel.height + 26,
    width: panel.width,
    draw: (b) => {
      if (!panel.empty) panel.draw(b, { left: M, top: b0.y + 22, cut: b0.y + 10 });
    },
  };
}
