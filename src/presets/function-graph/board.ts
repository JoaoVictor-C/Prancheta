/**
 * A drawing board that remembers its own ink.
 *
 * Ported from `experiments/exercises/sheet.mjs` (the `Plate` class), keeping
 * only what a function graph uses. The point of that class survives the port
 * intact: every stroked run is ALSO recorded as plain segments in a coarse
 * grid, so a label search can keep text off a LINE and not merely off other
 * labels. `text-clear-of-ink` checks the finished figure for exactly that; a
 * preset that did not look for ink while placing would hand the check a
 * figure it already knew would fail.
 *
 * Text is sized by a deliberately generous estimate rather than measured --
 * a preset expands synchronously, before any browser exists. Generous is the
 * safe direction: a box a little too wide costs whitespace, a box too narrow
 * costs a wrap that the repair loop then has to undo.
 */

import type { Block, FigureSpec, Frame, LineStyle, Mark, Point, Readings } from "../../ir/types.ts";
import { resolveInFrame } from "../../ir/frames.ts";
import { estimateWidth } from "../shared/text.ts";

export type Box = { x: number; y: number; hw: number; hh: number };

type Ink = { ax: number; ay: number; bx: number; by: number; owner: string | undefined };

const INK_CELL = 24;
const SANS = "Segoe UI, Noto Sans, system-ui, sans-serif";
const SERIF = "Palatino Linotype, Book Antiqua, Georgia, Times New Roman, serif";

/** One rendered line box at the theme's 1.45 line-height, plus ink slack. */
export const lineBox = (fs: number, lines = 1): number => lines * fs * 1.45 + 3;

/** Liang–Barsky: does the segment pass through the rect `lo`–`hi`? */
function segmentCrossesRect(s: Ink, lo: Point, hi: Point): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  for (const [p, q] of [
    [-dx, s.ax - lo.x],
    [dx, hi.x - s.ax],
    [-dy, s.ay - lo.y],
    [dy, hi.y - s.ay],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return true;
}

export type LabelOptions = {
  size?: number;
  colour?: string;
  align?: "start" | "center" | "end";
  weight?: number;
  tracking?: number;
  serif?: boolean;
  width?: number;
  id?: string;
  fill?: string;
  /** The series this label names, for `curve-label-nearest-its-curve`. */
  names?: string;
  /** Grid furniture: a tick number belongs to the frame it numbers. */
  gridOf?: string;
  claim?: boolean;
  /**
   * What this label names, when it is not a series (ADR 0035): an element
   * id, or a place. A label that names nothing says so with
   * `freeStanding`; `label-declares-what-it-names` fails one that does
   * neither.
   */
  annotates?: string;
  annotatesPlace?: Point;
  freeStanding?: boolean;
};

export type PolyOptions = {
  stroke?: string;
  width?: number;
  fill?: string;
  close?: boolean;
  lineStyle?: LineStyle;
  series?: string;
  id?: string;
};

export class Board {
  readonly W: number;
  readonly H: number;
  readonly background: string;
  marks: Mark[] = [];
  kids: Block[] = [];
  frames: Frame[] = [];
  taken: Box[] = [];
  ink: Ink[] = [];
  /** The reading panel as data (ADR 0062), set by shared/panel.ts when a panel is drawn. */
  readings: Readings | undefined;
  private inkGrid: Map<string, number[]> | null = null;
  private n = 0;

  constructor(width: number, height: number, background: string) {
    this.W = width;
    this.H = height;
    this.background = background;
  }

  id(prefix: string): string {
    this.n += 1;
    return `${prefix}${this.n}`;
  }

  // ---- ink ------------------------------------------------------------

  trace(pts: Point[], stroke: string | undefined, width: number | undefined, owner?: string): void {
    if (stroke === "none" || stroke === undefined || (width ?? 0) <= 0) return;
    for (let i = 0; i < pts.length - 1; i += 1) {
      this.ink.push({ ax: pts[i]!.x, ay: pts[i]!.y, bx: pts[i + 1]!.x, by: pts[i + 1]!.y, owner });
    }
    this.inkGrid = null;
  }

  poly(pts: Point[], o: PolyOptions = {}): Mark | null {
    if (pts.length < 2) return null;
    const stroke = o.stroke ?? "#181B21";
    const width = o.width ?? 1.4;
    const id = o.id ?? this.id("m");
    const close = o.close ?? false;
    this.trace(close ? [...pts, pts[0]!] : pts, stroke, width, id);
    const mark: Mark = {
      id,
      from: pts[0]!,
      segments: pts.slice(1).map((p) => ({ line: p })),
      close,
      fill: o.fill ?? "none",
      stroke,
      strokeWidth: width,
      ...(o.lineStyle === undefined ? {} : { lineStyle: o.lineStyle }),
      ...(o.series === undefined ? {} : { series: o.series }),
    };
    this.marks.push(mark);
    return mark;
  }

  /** A full circle about `c`, as four quarter arcs so each is minor. */
  circle(c: Point, r: number, o: { stroke?: string; width?: number; fill?: string; id?: string; on?: string[] } = {}): Mark {
    const at = (a: number): Point => ({
      x: c.x + r * Math.cos((a * Math.PI) / 180),
      y: c.y - r * Math.sin((a * Math.PI) / 180),
    });
    const id = o.id ?? this.id("m");
    const stroke = o.stroke ?? "none";
    const width = o.width ?? 0;
    this.trace(
      Array.from({ length: 61 }, (_, i) => at(i * 6)),
      stroke,
      width,
      id,
    );
    const mark: Mark = {
      id,
      from: at(0),
      segments: [90, 180, 270, 360].map((a) => ({ arc: at(a), centre: c })),
      close: true,
      fill: o.fill ?? "none",
      stroke,
      strokeWidth: width,
      ...(o.on === undefined ? {} : { on: o.on }),
    };
    this.marks.push(mark);
    return mark;
  }

  /**
   * A frame, with the axes its grid will draw recorded as ink here.
   *
   * The grid is expanded by frame resolution AFTER a preset returns, so its
   * lines never pass through `trace` and the label search cannot see them.
   * For the faint lattice that is right -- a label may sit on it. For the
   * axes it is not (ADR 0035): the checks now fail text on an axis and a
   * backing over one, and a search that cannot see the axis will keep
   * choosing spots on it, which is how the unit circle's "−π/2" came to be
   * printed across the y axis. The lines traced here are the ones
   * `expandGrid` draws: the zero line of each axis whose range spans zero.
   */
  addFrame(frame: Frame): void {
    this.frames.push(frame);
    const grid = frame.grid;
    if (grid === undefined || grid.axes === false) return;
    const origin = frame.origin as Point;
    if (typeof origin.x !== "number" || typeof origin.y !== "number") return;
    const placed = { ...frame, origin };
    const spans = (a: { from: number; to: number }): boolean => Math.min(a.from, a.to) <= 0 && Math.max(a.from, a.to) >= 0;
    if (spans(grid.y)) {
      this.trace([resolveInFrame(placed, grid.x.from, 0), resolveInFrame(placed, grid.x.to, 0)], grid.axisStroke ?? "#8A93A3", 2, `${frame.id}-axis-x`);
    }
    if (spans(grid.x)) {
      this.trace([resolveInFrame(placed, 0, grid.y.from), resolveInFrame(placed, 0, grid.y.to)], grid.axisStroke ?? "#8A93A3", 2, `${frame.id}-axis-y`);
    }
  }

  // ---- boxes ----------------------------------------------------------

  box(cx: number, cy: number, w: number, h: number): Box {
    return { x: cx, y: cy, hw: w / 2, hh: h / 2 };
  }

  hits(a: Box, b: Box, pad = 3): boolean {
    return Math.abs(a.x - b.x) < a.hw + b.hw + pad && Math.abs(a.y - b.y) < a.hh + b.hh + pad;
  }

  /** How many recorded strokes pass through this box. */
  inkThrough(box: Box, pad = 2, excludeOwner?: string): number {
    if (this.inkGrid === null) {
      const g = new Map<string, number[]>();
      this.ink.forEach((s, i) => {
        const x0 = Math.floor(Math.min(s.ax, s.bx) / INK_CELL);
        const x1 = Math.floor(Math.max(s.ax, s.bx) / INK_CELL);
        const y0 = Math.floor(Math.min(s.ay, s.by) / INK_CELL);
        const y1 = Math.floor(Math.max(s.ay, s.by) / INK_CELL);
        for (let x = x0; x <= x1; x += 1) {
          for (let y = y0; y <= y1; y += 1) {
            const k = `${x},${y}`;
            if (!g.has(k)) g.set(k, []);
            g.get(k)!.push(i);
          }
        }
      });
      this.inkGrid = g;
    }
    const lo = { x: box.x - box.hw - pad, y: box.y - box.hh - pad };
    const hi = { x: box.x + box.hw + pad, y: box.y + box.hh + pad };
    const seen = new Set<number>();
    let n = 0;
    for (let x = Math.floor(lo.x / INK_CELL); x <= Math.floor(hi.x / INK_CELL); x += 1) {
      for (let y = Math.floor(lo.y / INK_CELL); y <= Math.floor(hi.y / INK_CELL); y += 1) {
        for (const i of this.inkGrid.get(`${x},${y}`) ?? []) {
          if (seen.has(i)) continue;
          seen.add(i);
          if (excludeOwner !== undefined && this.ink[i]!.owner === excludeOwner) continue;
          if (segmentCrossesRect(this.ink[i]!, lo, hi)) n += 1;
        }
      }
    }
    return n;
  }

  /** Is this box clear of ink and of every claimed region? */
  clear(b: Box, pad = 1): boolean {
    return this.inkThrough(b, pad) === 0 && !this.taken.some((t) => this.hits(b, t, pad));
  }

  /** A region no label may enter. */
  reserve(cx: number, cy: number, w: number, h: number): void {
    this.taken.push(this.box(cx, cy, w, h));
  }

  /** A generous guess at a set line, so a declared box is never too narrow. */
  measure(text: string, fs: number, tracking = 0.1): number {
    return estimateWidth(text, fs, tracking);
  }

  /** The box a label of this text and size would occupy. */
  extent(text: string, o: LabelOptions = {}): { w: number; h: number } {
    const size = o.size ?? 13;
    return {
      w: o.width ?? this.measure(text, size, o.tracking ?? 0.1),
      h: Math.ceil(lineBox(size, text.split("\n").length)),
    };
  }

  /** A label centred on (cx, cy). */
  label(text: string, cx: number, cy: number, o: LabelOptions = {}): Block {
    const size = o.size ?? 13;
    const { w, h } = this.extent(text, o);
    const block: Block = {
      type: "block",
      id: o.id ?? this.id("t"),
      label: text,
      x: cx - w / 2,
      y: cy - h / 2,
      width: w,
      height: h,
      padding: 0,
      fill: o.fill ?? "transparent",
      stroke: "transparent",
      strokeWidth: 0,
      wrap: text.includes("\n") ? "normal" : "none",
      textAlign: o.align ?? "center",
      verticalAlign: "center",
      textColor: o.colour ?? "#181B21",
      fontFamily: o.serif ? SERIF : SANS,
      fontSize: size,
      fontWeight: o.weight ?? 400,
      letterSpacing: o.tracking ?? 0.1,
      ...(o.names === undefined ? {} : { names: o.names }),
      ...(o.gridOf === undefined ? {} : { gridOf: o.gridOf }),
      ...(o.annotates === undefined ? {} : { annotates: o.annotates }),
      ...(o.annotatesPlace === undefined ? {} : { annotatesPlace: o.annotatesPlace }),
      ...(o.freeStanding === true ? { freeStanding: true as const } : {}),
    };
    this.kids.push(block);
    if (o.claim !== false) this.taken.push(this.box(cx, cy, w, h));
    return block;
  }

  /**
   * A label that walks out along each escape direction in turn until its box
   * is clear of everything already claimed -- other labels AND ink. Falls
   * back to the least bad spot rather than the starting one.
   */
  place(
    text: string,
    cx: number,
    cy: number,
    dirs: Point[],
    o: LabelOptions & { steps?: number; avoidInk?: boolean } = {},
  ): Block {
    const { w, h } = this.extent(text, o);
    // Start inside the canvas. An anchor near the edge -- an axis name at the
    // end of its axis, "t (anos)" after the last tick -- otherwise begins out
    // of bounds, every step of the search breaks at once, and the label is
    // set where it started: off the page.
    cx = Math.min(Math.max(cx, 16 + w / 2), this.W - 16 - w / 2);
    cy = Math.min(Math.max(cy, 10 + h / 2), this.H - 10 - h / 2);
    let best: { x: number; y: number; n: number } | null = null;
    outer: for (const d of dirs) {
      for (let k = 0; k <= (o.steps ?? 26); k += 1) {
        const px = cx + d.x * 6 * k;
        const py = cy + d.y * 6 * k;
        const b = this.box(px, py, w, h);
        if (px - b.hw < 16 || px + b.hw > this.W - 16 || py - b.hh < 10 || py + b.hh > this.H - 10) break;
        const boxes = this.taken.filter((t) => this.hits(b, t)).length;
        const lines = o.avoidInk === false ? 0 : Math.min(this.inkThrough(b, 2), 4);
        const n = boxes * 3 + lines;
        if (best === null || n < best.n) best = { x: px, y: py, n };
        if (n === 0) break outer;
      }
    }
    const at = best ?? { x: cx, y: cy };
    return this.label(text, at.x, at.y, { ...o, width: w });
  }

  spec(title: string): FigureSpec {
    return {
      version: 1,
      title,
      ...(this.readings === undefined ? {} : { readings: this.readings }),
      canvas: { padding: 0, background: this.background, theme: "print" },
      root: {
        type: "scene",
        layout: "absolute",
        width: this.W,
        height: this.H,
        ...(this.frames.length > 0 ? { frames: this.frames } : {}),
        children: this.kids,
        connectors: [],
        marks: this.marks,
      },
    };
  }
}
