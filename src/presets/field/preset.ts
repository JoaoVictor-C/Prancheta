/**
 * field -- slope fields, vector fields and level curves for Cálculo 2/3
 * (EDO's "campo de direções", Física's field-line diagrams, the 2D contour
 * map).
 *
 * Three figures share one gridded plane because they share one discipline:
 * every mark, every curve and every printed number is DERIVED from the
 * stated expression, never typed.
 *
 *  - **slope** -- `f(x, y)` is dy/dx. At each grid point a short segment is
 *    drawn with EXACTLY the slope `f` returns there (never a hand-picked
 *    angle), and an optional solution curve through a given point is
 *    integrated by `rk4Scalar` (src/math/numeric.ts) in both directions
 *    from that point until it leaves the plotted box, a derivative goes
 *    non-finite, or it has run long enough -- the same refusal discipline
 *    `numeric.ts` and `contour.ts` already keep: a singularity stops the
 *    curve, it never draws through one.
 *  - **vector** -- `(P(x, y), Q(x, y))` is drawn as an arrow at each grid
 *    point, its length a single PROPORTIONAL scale of its own magnitude
 *    (the scaling rule is stated at `VECTOR_ARROW_FRACTION` below and in
 *    the PRESET doc), so two arrows can be compared by eye. An optional
 *    flow line through a point is `rk4Planar` walked both ways from it.
 *  - **levels** -- the level sets of `f(x, y) = c` for each stated `c`,
 *    found by `contour.ts` (marching squares with bisected crossings,
 *    ADR 0029) and labelled with their OWN level value, set into a gap
 *    cut in the branch -- never on ink. An optional `gradientAt` point
 *    draws ∇f there, by central differences, which is perpendicular to
 *    the level curve through that point BY CONSTRUCTION (a level curve's
 *    tangent is where f does not change; its gradient is where f changes fastest -- the two cannot fail
 *    to be perpendicular for a differentiable f, and `tests/field.test.ts`
 *    checks this numerically rather than assuming the calculus).
 *
 * Every expression is compiled by `compileIn` over `["x", "y"]`
 * (`src/math/expr.ts`, ADR 0029's named-variable grammar) -- "x^2 + y^2",
 * "-y", "sin(x) - y" -- never `eval`.
 *
 * Drawing order, fixed across all three kinds: the field's own marks
 * (segments or arrows) first, then every curve (solution/flow/level),
 * then gradient arrows, then every label (each anchored to what it names,
 * ADR 0035), and finally the initial/reference points as small dots -- so
 * a point is never obscured by ink drawn after it, and a label search
 * always sees every line it might cross.
 */

import type { Connector, Frame, FigureSpec, FramedPoint, GridSpec, Point, Scene } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { resolveInFrame, tickPlan } from "../../ir/frames.ts";
import { LOCALES, formatNumber } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";
import { compileIn } from "../../math/expr.ts";
import { contour } from "../../math/contour.ts";
import { rk4Scalar, rk4Planar } from "../../math/numeric.ts";
import { Placer, aroundPoint, besidePolyline, rectAt } from "../construction/place.ts";
import type { Rect } from "../construction/place.ts";

// ---- input ---------------------------------------------------------------

export type FieldPoint = { at: [number, number]; label?: string };

export type FieldInputSlope = {
  kind: "slope";
  /** dy/dx = f(x, y). */
  f: string;
  x: [number, number];
  y: [number, number];
  /** Marks per axis, roughly. Default: chosen so the span holds 8-14 marks. */
  density?: number;
  /** Solution curves through these points, integrated by `rk4Scalar`. */
  solutions?: FieldPoint[];
};

export type FieldInputVector = {
  kind: "vector";
  p: string;
  q: string;
  x: [number, number];
  y: [number, number];
  density?: number;
  /** Flow lines through these points, integrated by `rk4Planar`. */
  flowLines?: FieldPoint[];
};

export type FieldInputLevels = {
  kind: "levels";
  f: string;
  x: [number, number];
  y: [number, number];
  levels: number[];
  /** Cells per axis for `contour.ts`. Default 80. */
  cells?: number;
  /** Points to draw ∇f at, by central differences. */
  gradientAt?: [number, number][];
};

export type FieldInput = (FieldInputSlope | FieldInputVector | FieldInputLevels) & {
  title?: string;
  locale?: Locale;
};

// ---- palette (consistent across all three kinds) --------------------------

const PAPER = "#FCFBF7";
const INK = "#181B21";
const SOFT = "#4E5763";
const FIELD_INK = "#1D4E89"; // blue -- the field itself: slope marks, vector arrows, level curves
const SOLUTION = "#B3400C"; // rust -- a curve derived by integrating the field: solution / flow line
const GRADIENT = "#1E7A46"; // green -- ∇f, drawn only for level curves
const GUIDE = "#9AA3AE"; // grey -- construction guides, never a claim

// ---- geometry constants ----------------------------------------------------

const MARGIN = 56;
const RANGE_PAD_FRACTION = 0.08;
const PLOT_TARGET_PX = 460;
const MIN_UNIT = 26;
const MAX_UNIT = 90;
const SEGMENT_LEN_PX = 20; // slope marks: fixed length in PAGE space, ADR 0050
const ARROW_MIN_PX = 3; // a near-zero vector draws a stub this long, or a dot below it
const ARROW_DOT_R = 1.6;
const GRADIENT_LEN_PX = 26;

// ---- small pure helpers, exported for their own tests ----------------------

/** A tick step a reader counts by: the smallest of 1, 2, 5, 10 (x10^k) that keeps at most `maxLines` divisions across `span`. */
export function niceStep(span: number, maxLines = 8): number {
  const steps = [0.5, 1, 2, 5, 10, 20, 50, 100];
  for (const s of steps) if (span / s <= maxLines) return s;
  return steps[steps.length - 1]!;
}

/** Grid points at every multiple of `step` inside `[lo, hi]` -- the actual lattice intersections, not an independent sampling. */
export function latticeIn(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  const start = Math.ceil((lo - 1e-9) / step) * step;
  for (let x = start; x <= hi + 1e-9; x += step) out.push(Math.round(x / step) * step + 0); // "+ 0" turns a rounded -0 into 0
  return out;
}

/** ∇f at (x, y) by central differences -- the one gradient this preset ever computes, shared by both consumers (labels, if any, and the perpendicularity a caller may want to check). */
export function gradient(f: (x: number, y: number) => number, x: number, y: number, h = 1e-4): [number, number] {
  const fx = (f(x + h, y) - f(x - h, y)) / (2 * h);
  const fy = (f(x, y + h) - f(x, y - h)) / (2 * h);
  return [fx, fy];
}

function magnitude(dx: number, dy: number): number {
  return Math.hypot(dx, dy);
}

/**
 * Like `construction/place.ts`'s `besidePolyline`, but searching much
 * further from the curve before giving up: a solution curve or a flow line
 * is drawn over a field whose marks fill the WHOLE plotted box (unlike a
 * construction's few clean lines), so the few extra pixels that suffice
 * there are often still inside a neighbouring mark's reach.
 */
function besideCurveInField(pts: Point[], w: number, h: number, ts: number[]): Point[] {
  const lens: number[] = [0];
  for (let i = 1; i < pts.length; i += 1) lens.push(lens[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  const total = lens[lens.length - 1]!;
  const out: Point[] = [];
  for (const extra of [0, 6, 14, 24, 36, 50, 68]) {
    for (const t of ts) {
      const s = t * total;
      let i = 1;
      while (i < lens.length - 1 && lens[i]! < s) i += 1;
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const seg = lens[i]! - lens[i - 1]! || 1;
      const f = (s - lens[i - 1]!) / seg;
      const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      const d = { x: (b.x - a.x) / seg, y: (b.y - a.y) / seg };
      const n = { x: -d.y, y: d.x };
      const clearance = Math.abs(n.x) * (w / 2) + Math.abs(n.y) * (h / 2) + 5;
      for (const side of [1, -1]) {
        out.push({ x: p.x + n.x * side * (clearance + extra), y: p.y + n.y * side * (clearance + extra) });
      }
    }
  }
  return out;
}

// ---- shared frame + board setup -------------------------------------------

type Built = {
  board: Board;
  frame: Frame & { origin: Point };
  grid: GridSpec;
  placer: Placer;
  at: (p: [number, number]) => Point;
  unit: number;
  width: number;
  height: number;
  plotHeight: number;
  tickStep: number;
};

/**
 * The plotted box's affine geometry, computed from `[x, y]` alone -- padding,
 * the unit (px per world unit) and the tick step. Exported so a test can
 * invert a rendered figure's canvas coordinates back to (x, y) with the
 * EXACT arithmetic that placed them, rather than a second, independently
 * hand-derived formula that could quietly drift from this one.
 */
export function frameGeometry(xRange: [number, number], yRange: [number, number]): { xMin: number; xMax: number; yMin: number; yMax: number; unit: number; tickStep: number; origin: Point } {
  if (!(xRange[1] > xRange[0])) throw new SpecError(`field: x must be [lo, hi] with lo < hi, got ${JSON.stringify(xRange)}`);
  if (!(yRange[1] > yRange[0])) throw new SpecError(`field: y must be [lo, hi] with lo < hi, got ${JSON.stringify(yRange)}`);
  const padX = (xRange[1] - xRange[0]) * RANGE_PAD_FRACTION;
  const padY = (yRange[1] - yRange[0]) * RANGE_PAD_FRACTION;
  const xMin = xRange[0] - padX;
  const xMax = xRange[1] + padX;
  const yMin = yRange[0] - padY;
  const yMax = yRange[1] + padY;
  const spanX = xMax - xMin;
  const spanY = yMax - yMin;
  const unit = Math.min(MAX_UNIT, Math.max(MIN_UNIT, PLOT_TARGET_PX / Math.max(spanX, spanY)));
  const tickStep = niceStep(Math.max(spanX, spanY));
  return { xMin, xMax, yMin, yMax, unit, tickStep, origin: { x: MARGIN - xMin * unit, y: MARGIN + yMax * unit } };
}

function buildBoard(xRange: [number, number], yRange: [number, number], locale: Locale, captionLines: number): Built {
  const { xMin, xMax, yMin, yMax, unit, tickStep, origin } = frameGeometry(xRange, yRange);
  const spanX = xMax - xMin;
  const spanY = yMax - yMin;

  const plotWidth = Math.ceil(MARGIN * 2 + spanX * unit);
  const plotHeight = Math.ceil(MARGIN * 2 + spanY * unit);
  const CAPTION_LINE_H = 20;
  const captionHeight = captionLines > 0 ? captionLines * CAPTION_LINE_H + 18 : 0;
  const width = plotWidth;
  const height = plotHeight + captionHeight;

  const grid: GridSpec = {
    x: { from: xMin, to: xMax, step: tickStep, origin: 0 },
    y: { from: yMin, to: yMax, step: tickStep, origin: 0 },
    locale,
  };
  const frame: Frame & { origin: Point } = {
    id: "plane",
    origin,
    xUnit: unit,
    yUnit: unit,
    grid,
  };

  const board = new Board(width, height, PAPER);
  board.addFrame(frame);
  const placer = new Placer({ x: 12, y: 8, width: width - 24, height: plotHeight - 12 });
  for (const t of tickPlan(frame, grid)) {
    const b = t.spots[0]!.box;
    board.reserve(b.x + b.width / 2, b.y + b.height / 2, b.width, b.height);
    placer.reserve(b);
  }
  const at = (p: [number, number]): Point => resolveInFrame(frame, p[0], p[1]);
  // The axes are already traced as ink by `addFrame`; make them known to the
  // label placer too (not competing -- grid furniture never wins "nearest").
  if (yMin <= 0 && yMax >= 0) placer.addInk("plane-axis-x", [at([xMin, 0]), at([xMax, 0])], false);
  if (xMin <= 0 && xMax >= 0) placer.addInk("plane-axis-y", [at([0, yMin]), at([0, yMax])], false);

  return { board, frame, grid, placer, at, unit, width, height, plotHeight, tickStep };
}

function framed(frameId: string, p: [number, number]): FramedPoint {
  return { frame: frameId, x: p[0], y: p[1] };
}

function finalizeSpec(board: Board, connectors: Connector[], title: string): FigureSpec {
  const spec = board.spec(title);
  const scene = spec.root as Scene;
  scene.connectors = connectors;
  spec.canvas = { ...spec.canvas, constraints: { allowOverlap: true, allowConnectorCrossing: true, allowCurvedConnectors: true } };
  return parseSpec(spec);
}

// ---- points drawn last ------------------------------------------------------

function drawPoint(board: Board, placer: Placer, id: string, c: Point, label: string | undefined, colour: string): void {
  board.circle(c, 3, { fill: colour, id: `${id}-dot` });
  placer.addInk(`${id}-dot`, [c], false, { c, r: 3 });
  if (label !== undefined) {
    const style = { size: 12, weight: 700, colour: INK };
    const { w, h } = board.extent(label, style);
    const spots = aroundPoint(c, w, h, placer.incident(c), null);
    const best = placer.choose({ kind: "place", id, at: c }, w, h, spots);
    const block = board.label(label, best.centre.x, best.centre.y, { ...style, width: w, fill: PAPER });
    block.annotatesPlace = c;
    placer.commit(rectAt(best.centre, w, h));
  }
}

// ---- kind: slope ------------------------------------------------------------

function expandSlope(input: FieldInputSlope, locale: Locale, title: string): FigureSpec {
  const f = compileIn(input.f, ["x", "y"]);
  const density = input.density ?? 11;
  const captionLines = (input.solutions ?? []).length * 3; // generous: a reading may wrap to more than two lines
  const built = buildBoard(input.x, input.y, locale, captionLines);
  const { board, frame, placer, at, unit } = built;

  const step = niceStep(Math.max(input.x[1] - input.x[0], input.y[1] - input.y[0]), density);
  const xs = latticeIn(input.x[0], input.x[1], step);
  const ys = latticeIn(input.y[0], input.y[1], step);
  if (xs.length === 0 || ys.length === 0) throw new SpecError("field(slope): the grid has no lattice points inside [x, y] -- widen the range or lower density");

  const connectors: Connector[] = [];
  let drawn = 0;
  let refused = 0;
  for (const x of xs) {
    for (const y of ys) {
      const m = f(x, y);
      if (!Number.isFinite(m)) {
        refused += 1;
        continue;
      }
      drawn += 1;
      const c = at([x, y]);
      // A canvas-space direction with EXACTLY slope m in math space: (1, m)
      // in math coordinates is (unit, -m*unit) in canvas coordinates (y is
      // flipped), normalized so every mark has the same length in page
      // pixels (ADR 0050) whatever the local steepness.
      const dxCanvas = unit;
      const dyCanvas = -m * unit;
      const len = Math.hypot(dxCanvas, dyCanvas) || 1;
      const ux = dxCanvas / len;
      const uy = dyCanvas / len;
      const half = SEGMENT_LEN_PX / 2;
      const a: Point = { x: c.x - ux * half, y: c.y - uy * half };
      const b: Point = { x: c.x + ux * half, y: c.y + uy * half };
      const id = `mark-${x}-${y}`;
      board.poly([a, b], { stroke: FIELD_INK, width: 1.6, id });
      placer.addInk(id, [a, b], true);
    }
  }
  if (drawn === 0) throw new SpecError(`field(slope): f(x, y) is not finite at any of the ${xs.length * ys.length} grid points -- nothing to draw`);

  const readings: { id: string; text: string }[] = [];
  const solutionCurves: { id: string; canvasPts: Point[] }[] = [];
  (input.solutions ?? []).forEach((s, i) => {
    const [x0, y0] = s.at;
    const m0 = f(x0, y0);
    if (!Number.isFinite(m0)) throw new SpecError(`field.solutions[${i}].at = (${x0}, ${y0}): f is not finite there -- no solution curve starts on a singularity`);
    const fwd = rk4Scalar(f, x0, y0, input.x[1] + 1, { bounds: { x: input.x, y: input.y }, maxSteps: 4000 });
    const bwd = rk4Scalar(f, x0, y0, input.x[0] - 1, { bounds: { x: input.x, y: input.y }, maxSteps: 4000 });
    const pts = [...bwd.points.slice().reverse(), ...fwd.points.slice(1)];
    if (pts.length < 2) throw new SpecError(`field.solutions[${i}]: the solution curve through (${x0}, ${y0}) has no length inside the plotted box`);
    const canvasPts = pts.map((p) => at([p.x, p.y]));
    const id = `solution-${i}`;
    board.poly(canvasPts, { stroke: SOLUTION, width: 2.2, id });
    placer.addInk(id, canvasPts, true);
    solutionCurves.push({ id, canvasPts });
    const label = s.label ?? `y(${formatNumber(x0, locale)}) = ${formatNumber(y0, locale)}`;
    readings.push({
      id: `reading-${id}`,
      text: `solução por ${label}${stopNote(bwd.stopped, fwd.stopped)}`,
    });
  });

  // No on-plot text label for a solution curve: the field's own marks tile
  // the WHOLE box (unlike a construction's few clean lines), densely enough
  // that no label of ordinary width has honest room anywhere near an
  // interior curve. A curve is identified by its start dot instead, and
  // named in full in the reading below the plot -- the same division of
  // labour the reading panel already carries for every derived quantity.
  void solutionCurves;

  // ---- points, last ----
  (input.solutions ?? []).forEach((s, i) => {
    drawPoint(board, placer, `solution-${i}-start`, at(s.at), undefined, SOLUTION);
  });

  const READING_LINE_H = 56; // generous: two text lines plus wrap slack
  readings.forEach((r, i) => {
    board.label(r.text, built.width / 2, built.plotHeight + 12 + i * READING_LINE_H + READING_LINE_H / 2, {
      size: 12,
      colour: SOFT,
      align: "start",
      width: built.width - MARGIN * 2,
      id: r.id,
      claim: false,
      freeStanding: true,
    });
  });

  void refused; // recorded for the caller's own curiosity; refusing entirely happens only when NOTHING could be drawn (above)
  return finalizeSpec(board, [], title);
}

/**
 * What a reader needs to know about where a curve ends: only that it stopped
 * at a singularity, which is a fact about the equation. Leaving the window or
 * reaching the drawing's length limit is a fact about the figure, and printing
 * it ("para trás: sai da janela; ...") under every curve read as solver output
 * rather than mathematics.
 */
function stopNote(backward: string, forward: string): string {
  const b = backward === "non-finite";
  const f = forward === "non-finite";
  if (b && f) return " (para numa singularidade nos dois sentidos)";
  if (b) return " (para numa singularidade para trás)";
  if (f) return " (para numa singularidade para a frente)";
  return "";
}

// ---- kind: vector -----------------------------------------------------------

/**
 * The scaling rule (ADR 0050): PROPORTIONAL, not normalised. Every arrow's
 * length is `magnitude · SCALE` for one `SCALE` shared by the whole figure,
 * so two arrows are comparable by eye -- a normalised field (every arrow the
 * same length, magnitude read off colour alone) throws that comparison away,
 * and this project has no colour-only channel a printed page can rely on.
 * `SCALE` is computed, not chosen by the author: it is the largest value
 * that keeps the LONGEST sampled arrow at `VECTOR_ARROW_FRACTION` of the
 * lattice spacing, which is what keeps neighbouring arrows from ever
 * touching. A sampled magnitude of (numerically) zero draws a small dot
 * instead of a zero-length arrow, which has no direction to draw.
 */
const VECTOR_ARROW_FRACTION = 0.42;

function expandVector(input: FieldInputVector, locale: Locale, title: string): FigureSpec {
  const p = compileIn(input.p, ["x", "y"]);
  const q = compileIn(input.q, ["x", "y"]);
  const density = input.density ?? 11;
  const captionLines = (input.flowLines ?? []).length * 3; // generous: a reading may wrap to more than two lines
  const built = buildBoard(input.x, input.y, locale, captionLines);
  const { board, at, unit, placer } = built;

  const step = niceStep(Math.max(input.x[1] - input.x[0], input.y[1] - input.y[0]), density);
  const xs = latticeIn(input.x[0], input.x[1], step);
  const ys = latticeIn(input.y[0], input.y[1], step);
  if (xs.length === 0 || ys.length === 0) throw new SpecError("field(vector): the grid has no lattice points inside [x, y] -- widen the range or lower density");

  const samples: { x: number; y: number; dx: number; dy: number; mag: number }[] = [];
  for (const x of xs) {
    for (const y of ys) {
      const dx = p(x, y);
      const dy = q(x, y);
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
      samples.push({ x, y, dx, dy, mag: magnitude(dx, dy) });
    }
  }
  if (samples.length === 0) throw new SpecError(`field(vector): (P, Q) is not finite at any of the ${xs.length * ys.length} grid points -- nothing to draw`);

  const maxMag = Math.max(...samples.map((s) => s.mag));
  const latticePx = step * unit;
  const scale = maxMag > 1e-12 ? (latticePx * VECTOR_ARROW_FRACTION) / maxMag : 0;

  const connectors: Connector[] = [];
  for (const s of samples) {
    const c = at([s.x, s.y]);
    const lenPx = s.mag * scale;
    if (s.mag <= 1e-9 || lenPx < ARROW_MIN_PX) {
      board.circle(c, ARROW_DOT_R, { fill: FIELD_INK, id: `mark-${s.x}-${s.y}` });
      continue;
    }
    const ux = s.dx / s.mag;
    const uy = -s.dy / s.mag; // canvas y is flipped relative to math y
    const head: Point = { x: c.x + ux * lenPx, y: c.y + uy * lenPx };
    const id = `mark-${s.x}-${s.y}`;
    connectors.push({ id, from: c, to: head, arrow: "end", stroke: FIELD_INK, strokeWidth: 1.6 });
    board.trace([c, head], FIELD_INK, 1.6, id);
    placer.addInk(id, [c, head], true);
  }

  const readings: { id: string; text: string }[] = [];
  const flowCurves: { id: string; canvasPts: Point[] }[] = [];
  (input.flowLines ?? []).forEach((s, i) => {
    const [x0, y0] = s.at;
    const dx0 = p(x0, y0);
    const dy0 = q(x0, y0);
    if (!Number.isFinite(dx0) || !Number.isFinite(dy0)) throw new SpecError(`field.flowLines[${i}].at = (${x0}, ${y0}): (P, Q) is not finite there`);
    const system = (_t: number, xy: readonly [number, number]): readonly [number, number] => {
      const [x, y] = xy;
      return [p(x, y), q(x, y)] as const;
    };
    const fwd = rk4Planar(system, 0, [x0, y0], Infinity, { bounds: { x: input.x, y: input.y }, maxLength: 4 * Math.max(input.x[1] - input.x[0], input.y[1] - input.y[0]) });
    const bwd = rk4Planar(system, 0, [x0, y0], -Infinity, { bounds: { x: input.x, y: input.y }, maxLength: 4 * Math.max(input.x[1] - input.x[0], input.y[1] - input.y[0]) });
    const pts = [...bwd.points.slice().reverse(), ...fwd.points.slice(1)];
    if (pts.length < 2) throw new SpecError(`field.flowLines[${i}]: the flow line through (${x0}, ${y0}) has no length inside the plotted box`);
    const canvasPts = pts.map((pt) => at([pt.x, pt.y]));
    const id = `flow-${i}`;
    board.poly(canvasPts, { stroke: SOLUTION, width: 2.2, id });
    placer.addInk(id, canvasPts, true);
    flowCurves.push({ id, canvasPts });
    const label = s.label ?? `(${formatNumber(x0, locale)}; ${formatNumber(y0, locale)})`;
    readings.push({
      id: `reading-${id}`,
      text: `linha de fluxo por ${label}${stopNote(bwd.stopped, fwd.stopped)}`,
    });
  });

  // ---- labels, once every flow line's own ink is registered --------------
  // Searched along the whole curve, not anchored at the initial point --
  // that point sits on the lattice among the field's own arrows.
  (input.flowLines ?? []).forEach((s, i) => {
    if (s.label === undefined) return;
    const id = `flow-${i}`;
    const canvasPts = flowCurves.find((c) => c.id === id)!.canvasPts;
    const style = { size: 12, weight: 600, colour: SOLUTION };
    const { w, h } = board.extent(s.label, style);
    const spots = besideCurveInField(canvasPts, w, h, [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9]);
    const best = placer.choose({ kind: "element", id }, w, h, spots);
    const block = board.label(s.label, best.centre.x, best.centre.y, { ...style, width: w, fill: PAPER });
    block.annotates = id;
    placer.commit(rectAt(best.centre, w, h));
  });

  (input.flowLines ?? []).forEach((s, i) => drawPoint(board, placer, `flow-${i}-start`, at(s.at), undefined, SOLUTION));

  const READING_LINE_H = 56; // generous: two text lines plus wrap slack
  readings.forEach((r, i) => {
    board.label(r.text, built.width / 2, built.plotHeight + 12 + i * READING_LINE_H + READING_LINE_H / 2, {
      size: 12,
      colour: SOFT,
      align: "start",
      width: built.width - MARGIN * 2,
      id: r.id,
      claim: false,
      freeStanding: true,
    });
  });

  return finalizeSpec(board, connectors, title);
}

// ---- kind: levels -----------------------------------------------------------

function expandLevels(input: FieldInputLevels, locale: Locale, title: string): FigureSpec {
  if (input.levels.length === 0) throw new SpecError("field(levels): levels must name at least one value");
  const f = compileIn(input.f, ["x", "y"]);
  const cells = input.cells ?? 80;
  const built = buildBoard(input.x, input.y, locale, 0);
  const { board, at, placer, unit } = built;

  const box = { x: input.x, y: input.y };
  type Curve = { level: number; id: string; canvasPts: Point[] };
  const curves: Curve[] = [];
  input.levels.forEach((level, li) => {
    const lines = contour(f, box, { level, cells });
    lines.forEach((line, si) => {
      if (line.points.length < 2) return;
      const id = `level-${li}-${si}`;
      const canvasPts = line.points.map((pt) => at([pt.x, pt.y]));
      // `line.points` already repeats its first vertex at the end when
      // `line.closed` (contour.ts's own `dedupe`), so the loop is already
      // closed by the point list itself -- `close: true` here would draw a
      // second, zero-length segment back to the start.
      placer.addInk(id, canvasPts, true);
      curves.push({ level, id, canvasPts });
    });
  });
  if (curves.length === 0) {
    throw new SpecError(`field(levels): none of the levels [${input.levels.join(", ")}] are attained anywhere inside the plotted box -- nothing to draw`);
  }

  // Each branch is labelled with its OWN level value, set INTO a gap cut in
  // the branch -- the contour map's convention (matplotlib's clabel, every
  // textbook's topographic map). Nothing is on a line: the ink under the
  // label is removed, not covered. Beside the curve was the first design,
  // and on a saddle's crowded branches it left every number floating between
  // two curves, equally near both. Every branch carries its level, because
  // a hyperbola's two halves are two curves on the page and a reader cannot
  // know the unlabelled one is the same level. A fragment too short to hold
  // its own label keeps no label; its longer siblings carry it.
  const byLevel = new Map<number, Curve[]>();
  for (const c of curves) {
    if (!byLevel.has(c.level)) byLevel.set(c.level, []);
    byLevel.get(c.level)!.push(c);
  }
  const gaps = new Map<string, Rect>();
  const inline = new Map<string, { block: { annotates?: string }; at: Point }>();
  for (const [level, group] of byLevel) {
    const text = formatNumber(level, locale);
    const style = { size: 12, weight: 700, colour: FIELD_INK };
    const { w, h } = board.extent(text, style);
    const gw = w + 4;
    const gh = h + 2;
    const anchors = group.filter((c) => pathLength(c.canvasPts) >= 4 * Math.max(gw, gh));
    for (const curve of anchors) {
      const spot = INLINE_TS.map((t) => pointAlong(curve.canvasPts, t)).find((pt) => placer.clearOf(rectAt(pt, gw, gh), curve.id));
      if (spot === undefined) continue;
      const block = board.label(text, spot.x, spot.y, { ...style, width: w });
      const gap = rectAt(spot, gw, gh);
      placer.commit(gap);
      gaps.set(curve.id, gap);
      inline.set(curve.id, { block, at: spot });
    }
  }
  if (!curves.some((c) => gaps.has(c.id))) {
    // Nowhere on any branch clears its neighbours: the old beside-the-curve
    // placement, on the longest branch of each level, is the honest fallback.
    for (const [level, group] of byLevel) {
      const longest = group.reduce((p, q) => (pathLength(q.canvasPts) > pathLength(p.canvasPts) ? q : p));
      const text = formatNumber(level, locale);
      const style = { size: 12, weight: 700, colour: FIELD_INK };
      const { w, h } = board.extent(text, style);
      const best = placer.choose({ kind: "element", id: longest.id }, w, h, besidePolyline(longest.canvasPts, w, h, [0.5, 0.35, 0.65, 0.2, 0.8]));
      const block = board.label(text, best.centre.x, best.centre.y, { ...style, width: w, fill: PAPER });
      block.annotates = longest.id;
      placer.commit(rectAt(best.centre, w, h));
    }
  }
  for (const c of curves) {
    const gap = gaps.get(c.id);
    const pieces = gap === undefined ? [c.canvasPts] : cutOut(c.canvasPts, gap);
    // The IR has no pen-up inside a mark, so a cut branch is two marks, the
    // first keeping the branch's id. Its label names whichever piece is
    // nearer -- both are the same curve, and the gap is the label.
    const ids = pieces.map((_, k) => (k === 0 ? c.id : `${c.id}-${k}`));
    pieces.forEach((piece, k) => board.poly(piece, { stroke: FIELD_INK, width: 2, id: ids[k]! }));
    placer.removeInk(c.id);
    for (const piece of pieces) placer.addInk(c.id, piece, true);
    const label = inline.get(c.id);
    if (label !== undefined) {
      let best = 0;
      pieces.forEach((piece, k) => {
        if (distanceToPolyline(label.at, piece) < distanceToPolyline(label.at, pieces[best]!)) best = k;
      });
      label.block.annotates = ids[best]!;
    }
  }

  // Gradient arrows: ∇f by central differences, perpendicular to the level
  // curve through that point by construction (checked in
  // tests/field.test.ts, not merely asserted here).
  const gradPoints = input.gradientAt ?? [];
  const gradConnectors: Connector[] = [];
  gradPoints.forEach(([x, y], i) => {
    const [gx, gy] = gradient(f, x, y);
    const mag = magnitude(gx, gy);
    if (!Number.isFinite(mag) || mag <= 1e-9) return; // a critical point has no direction to draw
    const c = at([x, y]);
    const ux = gx / mag;
    const uy = -gy / mag; // canvas y flip
    const head: Point = { x: c.x + ux * GRADIENT_LEN_PX, y: c.y + uy * GRADIENT_LEN_PX };
    const id = `grad-${i}`;
    board.trace([c, head], GRADIENT, 1.8, id);
    // Recorded as a connector for the checked arrowhead geometry.
    gradConnectors.push({ id, from: c, to: head, arrow: "end", stroke: GRADIENT, strokeWidth: 1.8 });
  });

  // Points: the gradient's own foot, last.
  gradPoints.forEach(([x, y], i) => {
    const [gx, gy] = gradient(f, x, y);
    if (!Number.isFinite(magnitude(gx, gy)) || magnitude(gx, gy) <= 1e-9) return;
    drawPoint(board, placer, `grad-${i}-foot`, at([x, y]), undefined, GRADIENT);
  });

  return finalizeSpec(board, gradConnectors, title);
}

/** Where along a branch an inline label is tried, as fractions of its arc length. */
const INLINE_TS = [0.3, 0.7, 0.4, 0.6, 0.2, 0.8, 0.5, 0.25, 0.75, 0.15, 0.85, 0.35, 0.65, 0.45, 0.55];

function distanceToPolyline(p: Point, pts: Point[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
  }
  return best;
}

/** The point at fraction `t` of a polyline's arc length. */
function pointAlong(pts: Point[], t: number): Point {
  const total = pathLength(pts);
  let s = t * total;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (s <= seg && seg > 0) return { x: a.x + ((b.x - a.x) * s) / seg, y: a.y + ((b.y - a.y) * s) / seg };
    s -= seg;
  }
  return pts[pts.length - 1]!;
}

const inside = (p: Point, r: Rect): boolean => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

/** Where a segment from inside `r` to outside it leaves `r`, by bisection to a hundredth of a pixel. */
function exitPoint(from: Point, to: Point, r: Rect): Point {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 40; k += 1) {
    const m = (lo + hi) / 2;
    if (inside({ x: from.x + (to.x - from.x) * m, y: from.y + (to.y - from.y) * m }, r)) lo = m;
    else hi = m;
  }
  return { x: from.x + (to.x - from.x) * hi, y: from.y + (to.y - from.y) * hi };
}

/** The polyline with the part inside `r` removed, cut exactly on the rectangle's edge. */
function cutOut(pts: Point[], r: Rect): Point[][] {
  // A closed loop is re-started just past the gap, so cutting it leaves ONE
  // open piece rather than two that meet at wherever contour.ts began it.
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  if (pts.length > 3 && Math.hypot(last.x - first.x, last.y - first.y) < 1e-6) {
    const ring = pts.slice(0, -1);
    const k = ring.findIndex((p, i) => !inside(p, r) && inside(ring[(i - 1 + ring.length) % ring.length]!, r));
    // Start on the last point inside the gap, so the exit is cut exactly,
    // and stop where the loop re-enters it.
    if (k >= 0) pts = [ring[(k - 1 + ring.length) % ring.length]!, ...ring.slice(k), ...ring.slice(0, k)];
  }
  const pieces: Point[][] = [];
  let run: Point[] = [];
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i]!;
    const prev = i > 0 ? pts[i - 1]! : undefined;
    if (!inside(p, r)) {
      if (prev !== undefined && inside(prev, r)) run.push(exitPoint(prev, p, r));
      run.push(p);
    } else if (prev !== undefined && !inside(prev, r)) {
      run.push(exitPoint(p, prev, r));
      if (run.length >= 2) pieces.push(run);
      run = [];
    }
  }
  if (run.length >= 2) pieces.push(run);
  return pieces;
}

function pathLength(pts: Point[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i += 1) len += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  return len;
}

// ---- entry point -------------------------------------------------------------

export function expandField(input: FieldInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const title = input.title ?? (input.kind === "slope" ? "campo de direções" : input.kind === "vector" ? "campo vetorial" : "curvas de nível");
  if (input.kind === "slope") return expandSlope(input, locale, title);
  if (input.kind === "vector") return expandVector(input, locale, title);
  if (input.kind === "levels") return expandLevels(input, locale, title);
  throw new SpecError(`field.kind must be "slope", "vector" or "levels", got ${JSON.stringify((input as { kind?: unknown }).kind)}`);
}

// ---- validation ---------------------------------------------------------------

function validateRange(raw: Record<string, unknown>, key: string, path: string): void {
  const value = raw[key];
  if (!Array.isArray(value) || value.length !== 2) throw new SpecError(`${path}.${key} must be [lo, hi]`);
  v.finite(value[0], `${path}.${key}[0]`);
  v.finite(value[1], `${path}.${key}[1]`);
}

function validatePoints(raw: Record<string, unknown>, key: string, path: string): void {
  if (raw[key] === undefined) return;
  v.array(raw, key, path, key).forEach((item, i) => {
    const o = v.object(item, `${path}.${key}[${i}]`);
    if (!Array.isArray(o.at) || o.at.length !== 2) throw new SpecError(`${path}.${key}[${i}].at must be [x, y]`);
    v.finite(o.at[0], `${path}.${key}[${i}].at[0]`);
    v.finite(o.at[1], `${path}.${key}[${i}].at[1]`);
    v.optionalString(o, "label", `${path}.${key}[${i}]`);
  });
}

export function validateFieldInput(raw: Record<string, unknown>): void {
  const path = "field";
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  v.optionalEnum(raw, "kind", path, ["slope", "vector", "levels"]);
  const kind = raw.kind;
  validateRange(raw, "x", path);
  validateRange(raw, "y", path);
  if (kind === "slope") {
    v.requiredString(raw, "f", path);
    validatePoints(raw, "solutions", path);
  } else if (kind === "vector") {
    v.requiredString(raw, "p", path);
    v.requiredString(raw, "q", path);
    validatePoints(raw, "flowLines", path);
  } else if (kind === "levels") {
    v.requiredString(raw, "f", path);
    v.nonEmptyArray(raw, "levels", path, "level values").forEach((lv, i) => v.finite(lv, `${path}.levels[${i}]`));
    if (raw.gradientAt !== undefined) {
      v.array(raw, "gradientAt", path, "gradientAt").forEach((p, i) => {
        if (!Array.isArray(p) || p.length !== 2) throw new SpecError(`${path}.gradientAt[${i}] must be [x, y]`);
        v.finite(p[0], `${path}.gradientAt[${i}][0]`);
        v.finite(p[1], `${path}.gradientAt[${i}][1]`);
      });
    }
  } else {
    throw new SpecError(`${path}.kind must be "slope", "vector" or "levels"`);
  }
  // Arithmetic, expression grammar and geometry are all exercised by
  // actually building the figure -- the same discipline every other preset
  // here uses, because a second, hand-written shadow of this logic is a
  // second place for the two to drift.
  expandField(raw as unknown as FieldInput);
}
