/**
 * field -- slope fields, vector fields and level curves for Cálculo 2/3
 * (EDO's "campo de direções", Física's field-line diagrams, the 2D contour
 * map).
 *
 * Three figures share one gridded plane because they share one discipline (a fourth, `charges`, is a bare board: ADR 0055):
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

import type { Connector, Frame, FigureSpec, FramedPoint, GridSpec, LineStyle, Point, Scene } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { resolveInFrame, tickPlan } from "../../ir/frames.ts";
import { LOCALES, formatNumber } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";
import { compileIn } from "../../math/expr.ts";
import { contour } from "../../math/contour.ts";
import { rk4Scalar, rk4Planar } from "../../math/numeric.ts";
import { fitUnits, niceStep, ticksIn } from "../shared/scale.ts";
import { Placer, aroundPoint, besidePolyline } from "../construction/place.ts";
import type { Rect } from "../../ir/types.ts";
import { distanceToPolyline, pointToRect, rectAt, rectToPolyline, segmentHitsRect } from "../../geometry/hit.ts";

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

type WithAnswers = { answers?: boolean };

export type FieldInput = (FieldInputSlope | FieldInputVector | FieldInputLevels | FieldInputCharges) & {
  title?: string;
  locale?: Locale;
  /**
   * false: the figure an exercise GIVES -- the field's marks, the axes, the charges and the points a curve starts from,
   * without the solution and flow curves, the level curves, the gradients, the field lines or the equipotentials.
   * Default true.
   */
  answers?: boolean;
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
const SEGMENT_LEN_PX = 20; // slope marks: fixed length in PAGE space, ADR 0050
const ARROW_MIN_PX = 3; // a near-zero vector draws a stub this long, or a dot below it
const ARROW_DOT_R = 1.6;
const GRADIENT_LEN_PX = 26;

// ---- small pure helpers, exported for their own tests ----------------------

/** Grid points at every multiple of `step` inside `[lo, hi]` -- the actual lattice intersections, not an independent sampling. */
export function latticeIn(lo: number, hi: number, step: number): number[] {
  return ticksIn(lo, hi, step).map((x) => x + 0); // "+ 0" turns a -0 into 0
}

/** ∇f at (x, y) by central differences -- the one gradient this preset ever computes, shared by both consumers (labels, if any, and the perpendicularity a caller may want to check). */
export function gradient(f: (x: number, y: number) => number, x: number, y: number, h = 1e-4): [number, number] {
  const fx = (f(x + h, y) - f(x - h, y)) / (2 * h);
  const fy = (f(x, y + h) - f(x, y - h)) / (2 * h);
  return [fx, fy];
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
  grid: GridSpec | undefined;
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
  // FITTED, not clamped: a range of 0,2 or of 5000 fills the same ~460px as a range of 8, and the lattice
  // and tick steps (1, 2 or 5 x 10^k at any k) follow the span, so marks stay a readable distance apart.
  const { xUnit: unit } = fitUnits(spanX, spanY, { targetWidth: PLOT_TARGET_PX, targetHeight: PLOT_TARGET_PX, equal: true });
  const tickStep = niceStep(Math.max(spanX, spanY), 8);
  return { xMin, xMax, yMin, yMax, unit, tickStep, origin: { x: MARGIN - xMin * unit, y: MARGIN + yMax * unit } };
}

function buildBoard(xRange: [number, number], yRange: [number, number], locale: Locale, captionLines: number, bare = false): Built {
  const { xMin, xMax, yMin, yMax, unit, tickStep, origin } = frameGeometry(xRange, yRange);
  const spanX = xMax - xMin;
  const spanY = yMax - yMin;

  const plotWidth = Math.ceil(MARGIN * 2 + spanX * unit);
  const plotHeight = Math.ceil(MARGIN * 2 + spanY * unit);
  const CAPTION_LINE_H = 20;
  const captionHeight = captionLines > 0 ? captionLines * CAPTION_LINE_H + 18 : 0;
  const width = plotWidth;
  const height = plotHeight + captionHeight;

  // A `bare` board has the frame's affine map and nothing drawn from it: a
  // charge diagram is a physics figure, and a textbook draws it without axes
  // or numbers (ADR 0055).
  const grid: GridSpec | undefined = bare
    ? undefined
    : {
        x: { from: xMin, to: xMax, step: tickStep, origin: 0 },
        y: { from: yMin, to: yMax, step: tickStep, origin: 0 },
        locale,
      };
  const frame: Frame & { origin: Point } = {
    id: "plane",
    origin,
    xUnit: unit,
    yUnit: unit,
    ...(grid === undefined ? {} : { grid }),
  };

  const board = new Board(width, height, PAPER);
  board.addFrame(frame);
  const placer = new Placer({ x: 12, y: 8, width: width - 24, height: plotHeight - 12 });
  for (const t of grid === undefined ? [] : tickPlan(frame, grid)) {
    const b = t.spots[0]!.box;
    board.reserve(b.x + b.width / 2, b.y + b.height / 2, b.width, b.height);
    placer.reserve(b);
  }
  const at = (p: [number, number]): Point => resolveInFrame(frame, p[0], p[1]);
  // The axes are already traced as ink by `addFrame`; make them known to the
  // label placer too (not competing -- grid furniture never wins "nearest").
  if (grid !== undefined && yMin <= 0 && yMax >= 0) placer.addInk("plane-axis-x", [at([xMin, 0]), at([xMax, 0])], false);
  if (grid !== undefined && xMin <= 0 && xMax >= 0) placer.addInk("plane-axis-y", [at([0, yMin]), at([0, yMax])], false);

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

function expandSlope(input: FieldInputSlope & WithAnswers, locale: Locale, title: string): FigureSpec {
  const f = compileIn(input.f, ["x", "y"]);
  const density = input.density ?? 11;
  const answers = input.answers !== false;
  const solutions = input.solutions ?? [];
  const captionLines = answers ? solutions.length * 3 : 0; // generous: a reading may wrap to more than two lines
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
  // answers: false keeps the marks and the point each curve starts from (y(x₀) = y₀ is a datum) and draws no curve.
  (answers ? solutions : []).forEach((s, i) => {
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
  solutions.forEach((s, i) => {
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

function expandVector(input: FieldInputVector & WithAnswers, locale: Locale, title: string): FigureSpec {
  const p = compileIn(input.p, ["x", "y"]);
  const q = compileIn(input.q, ["x", "y"]);
  const density = input.density ?? 11;
  const answers = input.answers !== false;
  const flowLines = input.flowLines ?? [];
  const captionLines = answers ? flowLines.length * 3 : 0; // generous: a reading may wrap to more than two lines
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
      samples.push({ x, y, dx, dy, mag: Math.hypot(dx, dy) });
    }
  }
  if (samples.length === 0) throw new SpecError(`field(vector): (P, Q) is not finite at any of the ${xs.length * ys.length} grid points -- nothing to draw`);

  const maxMag = Math.max(...samples.map((s) => s.mag));
  const latticePx = step * unit;
  const scale = maxMag > 0 ? (latticePx * VECTOR_ARROW_FRACTION) / maxMag : 0;

  const connectors: Connector[] = [];
  for (const s of samples) {
    const c = at([s.x, s.y]);
    const lenPx = s.mag * scale;
    if (s.mag <= 1e-9 * maxMag || lenPx < ARROW_MIN_PX) {
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
  (answers ? flowLines : []).forEach((s, i) => {
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
  (answers ? flowLines : []).forEach((s, i) => {
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

  flowLines.forEach((s, i) => drawPoint(board, placer, `flow-${i}-start`, at(s.at), undefined, SOLUTION));

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

function expandLevels(input: FieldInputLevels & WithAnswers, locale: Locale, title: string): FigureSpec {
  if (input.levels.length === 0) throw new SpecError("field(levels): levels must name at least one value");
  const f = compileIn(input.f, ["x", "y"]);
  const cells = input.cells ?? 80;
  const answers = input.answers !== false;
  const built = buildBoard(input.x, input.y, locale, 0);
  const { board, at, placer, unit } = built;

  const box = { x: input.x, y: input.y };
  type Curve = { level: number; id: string; canvasPts: Point[] };
  const curves: Curve[] = [];
  // answers: false is the plane a contour map is sketched on: the axes, and the points a gradient is asked at.
  (answers ? input.levels : []).forEach((level, li) => {
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
  if (answers && curves.length === 0) {
    throw new SpecError(`field(levels): none of the levels [${input.levels.join(", ")}] are attained anywhere inside the plotted box -- nothing to draw`);
  }

  if (answers) drawContours(board, placer, locale, curves, { stroke: FIELD_INK, text: FIELD_INK, width: 2 });

  // Gradient arrows: ∇f by central differences, perpendicular to the level
  // curve through that point by construction (checked in
  // tests/field.test.ts, not merely asserted here).
  const gradPoints = input.gradientAt ?? [];
  const gradConnectors: Connector[] = [];
  // A step in proportion to the range: 1e-4 is nothing to a range of 5000 and everything to one of 0,001.
  const h = (Math.max(input.x[1] - input.x[0], input.y[1] - input.y[0]) * 1e-5) || 1e-4;
  gradPoints.forEach(([x, y], i) => {
    if (!answers) return;
    const [gx, gy] = gradient(f, x, y, h);
    const mag = Math.hypot(gx, gy);
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
    const [gx, gy] = gradient(f, x, y, h);
    if (!Number.isFinite(Math.hypot(gx, gy)) || (answers && Math.hypot(gx, gy) <= 1e-9)) return;
    drawPoint(board, placer, `grad-${i}-foot`, at([x, y]), undefined, GRADIENT);
  });

  return finalizeSpec(board, gradConnectors, title);
}

type ContourCurve = { level: number; id: string; canvasPts: Point[] };

/** How a family of contour branches is drawn. */
type ContourLook = {
  stroke: string;
  text: string;
  width: number;
  lineStyle?: LineStyle;
  /** Fractions of a branch's length where a label is tried, in order; default `INLINE_TS`. */
  tries?: number[];
  /** Orders the spots tried, best first (larger is better), when the first that fits is not the best. */
  rank?: (p: Point) => number;
  /** Drop a level none of whose branches could be labelled: a reader cannot tell what it is. */
  dropUnlabelled?: boolean;
};

/**
 * Draws contour branches with each branch labelled by its own level, set into a gap cut in the branch (ADR 0050).
 * Shared by `levels` and by the equipotentials of `charges`: the branches must already be known to `placer` as ink
 * (so a gap is only cut where nothing else passes), and the placer is told about each gap it takes.
 */
function drawContours(board: Board, placer: Placer, locale: Locale, curves: ContourCurve[], look: ContourLook): Rect[] {
  // Each branch is labelled with its OWN level value, set INTO a gap cut in
  // the branch -- the contour map's convention (matplotlib's clabel, every
  // textbook's topographic map). Nothing is on a line: the ink under the
  // label is removed, not covered. Beside the curve was the first design,
  // and on a saddle's crowded branches it left every number floating between
  // two curves, equally near both. Every branch carries its level, because
  // a hyperbola's two halves are two curves on the page and a reader cannot
  // know the unlabelled one is the same level. A fragment too short to hold
  // its own label keeps no label; its longer siblings carry it.
  const byLevel = new Map<number, ContourCurve[]>();
  for (const c of curves) {
    if (!byLevel.has(c.level)) byLevel.set(c.level, []);
    byLevel.get(c.level)!.push(c);
  }
  const gaps = new Map<string, Rect>();
  const inline = new Map<string, { block: { annotates?: string }; at: Point }>();
  for (const [level, group] of byLevel) {
    const text = formatNumber(level, locale);
    const style = { size: 12, weight: 700, colour: look.text };
    const { w, h } = board.extent(text, style);
    const gw = w + 4;
    const gh = h + 2;
    const anchors = group.filter((c) => pathLength(c.canvasPts) >= 4 * Math.max(gw, gh));
    for (const curve of anchors) {
      const tried = (look.tries ?? INLINE_TS).map((t) => pointAlong(curve.canvasPts, t));
      if (look.rank !== undefined) {
        const score = new Map(tried.map((pt) => [pt, look.rank!(pt)] as const));
        tried.sort((a, b) => score.get(b)! - score.get(a)!);
      }
      const spot = tried.find((pt) => placer.clearOf(rectAt(pt, gw, gh), curve.id));
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
      const style = { size: 12, weight: 700, colour: look.text };
      const { w, h } = board.extent(text, style);
      const best = placer.choose({ kind: "element", id: longest.id }, w, h, besidePolyline(longest.canvasPts, w, h, [0.5, 0.35, 0.65, 0.2, 0.8]));
      const block = board.label(text, best.centre.x, best.centre.y, { ...style, width: w, fill: PAPER });
      block.annotates = longest.id;
      placer.commit(rectAt(best.centre, w, h));
    }
  }
  const dropped = new Set<string>();
  if (look.dropUnlabelled === true && curves.some((c) => gaps.has(c.id))) {
    for (const group of byLevel.values()) {
      if (group.some((c) => gaps.has(c.id))) continue;
      for (const c of group) {
        dropped.add(c.id);
        placer.removeInk(c.id);
      }
    }
  }
  for (const c of curves) {
    if (dropped.has(c.id)) continue;
    const gap = gaps.get(c.id);
    const pieces = gap === undefined ? [c.canvasPts] : cutOut(c.canvasPts, gap);
    // The IR has no pen-up inside a mark, so a cut branch is two marks, the
    // first keeping the branch's id. Its label names whichever piece is
    // nearer -- both are the same curve, and the gap is the label.
    const ids = pieces.map((_, k) => (k === 0 ? c.id : `${c.id}-${k}`));
    pieces.forEach((piece, k) => board.poly(piece, { stroke: look.stroke, width: look.width, id: ids[k]!, ...(look.lineStyle === undefined ? {} : { lineStyle: look.lineStyle }) }));
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
  return [...gaps.values()];
}

/** Where along a branch an inline label is tried, as fractions of its arc length. */
const INLINE_TS = [0.3, 0.7, 0.4, 0.6, 0.2, 0.8, 0.5, 0.25, 0.75, 0.15, 0.85, 0.35, 0.65, 0.45, 0.55];

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

// ---- kind: charges ----------------------------------------------------------

/**
 * Electric field lines and equipotentials of point charges (ADR 0055).
 *
 * E = Σ qᵢ (p − cᵢ) / |p − cᵢ|³ and V = Σ qᵢ / |p − cᵢ|: k and every unit are
 * omitted, because the figure shows SHAPES and the panel says so. A line is
 * `rk4Planar` walked along E / |E| (arc length is the parameter), from a seed
 * on a small circle around a source charge, and it ends where physics ends it:
 * on entering a sink charge's disc, at the plotted box, or at a stagnation
 * point where E vanishes -- never drawn through one.
 */
export type FieldCharge = { at: [number, number]; q: number; name?: string };

export type FieldInputCharges = {
  kind: "charges";
  charges: FieldCharge[];
  x: [number, number];
  y: [number, number];
  /** Lines leaving a charge of magnitude 1. Default 8; a charge of |q| draws round(|q| · this). */
  linesPerUnitCharge?: number;
  /** Levels of V = Σ q/r to draw dashed, or "auto" for a short symmetric ladder. */
  equipotentials?: number[] | "auto";
};

// 11.5 keeps the disc inside the 24px `MARKER_EXTENT` (checks.ts) past which a closed mark stops being read as a point.
const CHARGE_R_PX = 11.5;
const CHARGE_POS = "#B42318"; // white on it: 6.5:1
const CHARGE_NEG = "#1F4E9E"; // white on it: 8.6:1
const LINE_INK = "#181B21";
const EQUIPOTENTIAL = "#1E7A46";
const DEFAULT_LINES_PER_UNIT = 8;

/** E at (x, y): Σ q · r̂ / r². */
export function electricField(charges: FieldCharge[], x: number, y: number): [number, number] {
  let ex = 0;
  let ey = 0;
  for (const c of charges) {
    const dx = x - c.at[0];
    const dy = y - c.at[1];
    const r2 = dx * dx + dy * dy;
    const r3 = r2 * Math.sqrt(r2);
    ex += (c.q * dx) / r3;
    ey += (c.q * dy) / r3;
  }
  return [ex, ey];
}

/** V at (x, y): Σ q / r. */
export function electricPotential(charges: FieldCharge[], x: number, y: number): number {
  let v = 0;
  for (const c of charges) v += c.q / Math.hypot(x - c.at[0], y - c.at[1]);
  return v;
}

export type FieldLine = {
  /** Index of the charge the line was seeded on. */
  charge: number;
  index: number;
  /** +1 when the line runs along E from its seed (a positive source), -1 when it runs against E (a negative source, integrated backward). */
  along: 1 | -1;
  /** From the seed outward, in world coordinates. */
  points: { x: number; y: number }[];
  end: "sink" | "box" | "stagnation" | "limit";
  /** Index of the charge it ended on, when `end` is "sink". */
  sink?: number;
  /** Where E = 0, when `end` is "stagnation": found by Newton's method from the line's last point, so a line reaches the point itself rather than stopping short of it. */
  stagnation?: { x: number; y: number };
};

/** |E| as a share of Σ|qᵢ|/rᵢ²: how much of the field survives the charges' cancelling one another. */
function fieldSurvival(charges: FieldCharge[], x: number, y: number): number {
  const [ex, ey] = electricField(charges, x, y);
  let sum = 0;
  for (const c of charges) sum += Math.abs(c.q) / ((x - c.at[0]) ** 2 + (y - c.at[1]) ** 2);
  return Math.hypot(ex, ey) / sum;
}

/** Below this survival a direction means nothing: the field has cancelled itself, as between two equal charges. */
const STAGNATION_SURVIVAL = 0.04;

/** The zero of E nearest `from`, by Newton's method with a central-difference Jacobian; undefined if it does not converge close by. */
function findStagnation(charges: FieldCharge[], from: { x: number; y: number }, within: number): { x: number; y: number } | undefined {
  let x = from.x;
  let y = from.y;
  const h = 1e-6;
  for (let it = 0; it < 40; it += 1) {
    const [ex, ey] = electricField(charges, x, y);
    const [axp, ayp] = electricField(charges, x + h, y);
    const [axm, aym] = electricField(charges, x - h, y);
    const [bxp, byp] = electricField(charges, x, y + h);
    const [bxm, bym] = electricField(charges, x, y - h);
    const a = (axp - axm) / (2 * h);
    const b = (bxp - bxm) / (2 * h);
    const c = (ayp - aym) / (2 * h);
    const d = (byp - bym) / (2 * h);
    const det = a * d - b * c;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-14) return undefined;
    x -= (d * ex - b * ey) / det;
    y -= (-c * ex + a * ey) / det;
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x - from.x, y - from.y) > within) return undefined;
  }
  return fieldSurvival(charges, x, y) < 1e-6 ? { x, y } : undefined;
}

/** The world radius of a charge's disc, the one radius that seeds a line and captures one. */
export function chargeRadius(input: { x: [number, number]; y: [number, number] }): number {
  return CHARGE_R_PX / frameGeometry(input.x, input.y).unit;
}

/**
 * Every field line of the configuration, in world coordinates. Pure -- no
 * drawing -- so the tests check the physics (Gauss: the lines ending on a
 * sink are proportional to its charge) on the same lines the figure draws.
 */
export function traceChargeLines(input: Pick<FieldInputCharges, "charges" | "x" | "y" | "linesPerUnitCharge">): FieldLine[] {
  const { charges } = input;
  const total = charges.reduce((s, c) => s + c.q, 0);
  const along: 1 | -1 = total >= 0 ? 1 : -1;
  const rd = chargeRadius(input);
  const span = Math.max(input.x[1] - input.x[0], input.y[1] - input.y[0]);
  const perUnit = input.linesPerUnitCharge ?? DEFAULT_LINES_PER_UNIT;
  const box = { x: input.x, y: input.y };
  const out: FieldLine[] = [];

  const system = (_t: number, xy: readonly [number, number]): readonly [number, number] => {
    const [ex, ey] = electricField(charges, xy[0], xy[1]);
    const m = Math.hypot(ex, ey);
    if (!(fieldSurvival(charges, xy[0], xy[1]) > STAGNATION_SURVIVAL)) return [Number.NaN, Number.NaN];
    return [(along * ex) / m, (along * ey) / m];
  };

  charges.forEach((c, ci) => {
    if (Math.sign(c.q) !== along) return;
    const n = Math.max(1, Math.round(Math.abs(c.q) * perUnit));
    // One seed points at the nearest other charge, so a configuration that is
    // symmetric about the line joining charges draws symmetric lines.
    let phi0 = 0;
    let nearest = Infinity;
    charges.forEach((o, oi) => {
      if (oi === ci) return;
      const d = Math.hypot(o.at[0] - c.at[0], o.at[1] - c.at[1]);
      if (d < nearest) {
        nearest = d;
        phi0 = Math.atan2(o.at[1] - c.at[1], o.at[0] - c.at[0]);
      }
    });
    for (let k = 0; k < n; k += 1) {
      const a = phi0 + (2 * Math.PI * k) / n;
      const seed: [number, number] = [c.at[0] + rd * Math.cos(a), c.at[1] + rd * Math.sin(a)];
      const step = span / 500;
      const run = rk4Planar(system, 0, seed, Infinity, { bounds: box, step, maxLength: 8 * span, maxSteps: 6000 });
      const pts = run.points;
      let end: FieldLine["end"] = run.stopped === "boundary" ? "box" : run.stopped === "non-finite" ? "stagnation" : "limit";
      let sink: number | undefined;
      const kept: { x: number; y: number }[] = [pts[0]!];
      for (let i = 1; i < pts.length; i += 1) {
        const p = pts[i]!;
        const prev = kept[kept.length - 1]!;
        // A line that enters another charge's disc ends on its rim.
        const hit = charges.findIndex((o, oi) => oi !== ci && Math.hypot(p.x - o.at[0], p.y - o.at[1]) <= rd);
        if (hit >= 0) {
          const o = charges[hit]!;
          const d0 = Math.hypot(prev.x - o.at[0], prev.y - o.at[1]);
          const d1 = Math.hypot(p.x - o.at[0], p.y - o.at[1]);
          const f = d0 > rd && d0 !== d1 ? (d0 - rd) / (d0 - d1) : 1;
          kept.push({ x: prev.x + (p.x - prev.x) * f, y: prev.y + (p.y - prev.y) * f });
          end = "sink";
          sink = hit;
          break;
        }
        // A step that turns back on itself has stepped across a stagnation point.
        if (kept.length >= 2) {
          const a0 = kept[kept.length - 2]!;
          const dot = (prev.x - a0.x) * (p.x - prev.x) + (prev.y - a0.y) * (p.y - prev.y);
          if (dot < 0) {
            end = "stagnation";
            break;
          }
        }
        kept.push(p);
      }
      if (kept.length < 2) continue;
      let stagnation: { x: number; y: number } | undefined;
      if (end === "stagnation") {
        const last = kept[kept.length - 1]!;
        const before = kept[kept.length - 2]!;
        const z = findStagnation(charges, last, 8 * step);
        // Only a zero AHEAD of the line, and inside the box, is where it stopped.
        if (z !== undefined && (z.x - last.x) * (last.x - before.x) + (z.y - last.y) * (last.y - before.y) >= 0 && z.x >= input.x[0] && z.x <= input.x[1] && z.y >= input.y[0] && z.y <= input.y[1]) {
          stagnation = z;
          kept.push(z);
        }
      }
      out.push({ charge: ci, index: k, along, points: kept, end, ...(sink === undefined ? {} : { sink }), ...(stagnation === undefined ? {} : { stagnation }) });
    }
  });
  return out;
}

/** The default name of a charge: "q", "−q", "2q", "−2q", "0,5q" -- derived from q, never typed. */
export function chargeName(q: number, locale: Locale): string {
  const m = Math.abs(q);
  return `${q < 0 ? "−" : ""}${m === 1 ? "" : formatNumber(m, locale)}q`;
}

/** A short ladder of equipotential levels, in units of the largest |q|, with 0 where the charges have both signs. */
function autoLevels(charges: FieldCharge[]): number[] {
  const u = Math.max(...charges.map((c) => Math.abs(c.q)));
  const rungs = [0.25, 0.5, 1, 2].map((r) => r * u);
  const both = charges.some((c) => c.q > 0) && charges.some((c) => c.q < 0);
  return [...rungs.map((r) => -r).reverse(), ...(both ? [0] : []), ...rungs];
}

function expandCharges(input: FieldInputCharges & WithAnswers, locale: Locale, title: string): FigureSpec {
  const { charges } = input;
  // answers: false is the configuration alone -- charges, names, the box. The field lines and the equipotentials are what
  // "esboce as linhas de campo" asks for, and the null points are where they meet.
  const answers = input.answers !== false;
  const equipotentials = !answers || input.equipotentials === undefined ? [] : input.equipotentials === "auto" ? autoLevels(charges) : input.equipotentials;
  const captionLines = !answers ? 0 : equipotentials.length > 0 ? 2 : 1;
  const built = buildBoard(input.x, input.y, locale, captionLines, true);
  const { board, at, placer, unit } = built;
  const rd = CHARGE_R_PX;

  charges.forEach((c, i) => {
    charges.forEach((o, j) => {
      const d = Math.hypot(o.at[0] - c.at[0], o.at[1] - c.at[1]);
      if (j > i && d * unit < 2 * rd + 8) {
        throw new SpecError(`field.charges[${i}] and charges[${j}] are ${d.toFixed(2)} apart: their discs would touch at this scale -- separate them or widen x/y`);
      }
    });
  });

  // ---- field lines --------------------------------------------------------
  const lines = answers ? traceChargeLines(input) : [];
  if (answers && lines.length === 0) throw new SpecError("field(charges): no field line could be drawn -- a charge sits too close to the edge of the plotted box");
  // A line is drawn from its charge's CENTRE (the disc, drawn last, covers the
  // stub) and, on a sink, to the sink's centre: every line then passes through
  // the place its charge's name labels, which is what makes those lines the
  // charge rather than rivals to the name (ADR 0028's place rule).
  const canvasLines = lines.map((ln) => {
    const pts = ln.points.map((pt) => at([pt.x, pt.y]));
    const from = at(charges[ln.charge]!.at);
    return ln.sink === undefined ? [from, ...pts] : [from, ...pts, at(charges[ln.sink]!.at)];
  });
  const lineIds = lines.map((ln) => `line-${ln.charge}-${ln.index}`);
  canvasLines.forEach((pts, i) => placer.addInk(lineIds[i]!, pts, true));

  // ---- arrowheads: small filled triangles on the line, pointing along E ----
  const ARROW_LEN = 10;
  const ARROW_HALF = 3.6;
  const arrows: { id: string; ring: Point[] }[] = [];
  canvasLines.forEach((pts, i) => {
    const len = pathLength(pts);
    if (len < 48) return;
    const ts = len < 340 ? [0.5] : [0.34, 0.68];
    ts.forEach((t, j) => {
      const p = pointAlong(pts, t);
      const a = pointAlong(pts, Math.max(0, t - 6 / len));
      const b = pointAlong(pts, Math.min(1, t + 6 / len));
      const m = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const s = lines[i]!.along;
      const d = { x: (s * (b.x - a.x)) / m, y: (s * (b.y - a.y)) / m };
      const n = { x: -d.y, y: d.x };
      const tip = { x: p.x + d.x * (ARROW_LEN * 0.55), y: p.y + d.y * (ARROW_LEN * 0.55) };
      const base = { x: p.x - d.x * (ARROW_LEN * 0.45), y: p.y - d.y * (ARROW_LEN * 0.45) };
      const ring = [tip, { x: base.x + n.x * ARROW_HALF, y: base.y + n.y * ARROW_HALF }, { x: base.x - n.x * ARROW_HALF, y: base.y - n.y * ARROW_HALF }];
      const id = `${lineIds[i]!}-arrow-${j}`;
      arrows.push({ id, ring });
      placer.addInk(id, [...ring, ring[0]!], false);
    });
  });

  // ---- equipotentials ---------------------------------------------------
  const V = (x: number, y: number): number => electricPotential(charges, x, y);
  const rdWorld = rd / unit;
  const curves: ContourCurve[] = [];
  equipotentials.forEach((level, li) => {
    contour(V, { x: input.x, y: input.y }, { level, cells: 160 }).forEach((line, si) => {
      if (line.points.length < 2) return;
      // A branch wholly inside a charge's disc would be drawn under it.
      if (line.points.every((pt) => charges.some((c) => Math.hypot(pt.x - c.at[0], pt.y - c.at[1]) <= rdWorld * 1.25))) return;
      const id = `equipotential-${li}-${si}`;
      const canvasPts = line.points.map((pt) => at([pt.x, pt.y]));
      // A sliver left where a circle just clips a corner of the box is not a curve a reader can follow.
      if (pathLength(canvasPts) < 60) return;
      placer.addInk(id, canvasPts, false);
      curves.push({ level, id, canvasPts });
    });
  });
  if (equipotentials.length > 0 && curves.length === 0) {
    throw new SpecError(`field(charges): none of the equipotentials [${equipotentials.join(", ")}] are attained inside the plotted box`);
  }

  // Field lines first, then the equipotentials (thin, dashed, each level set
  // into a gap in its branch), then arrowheads, then the charges.
  canvasLines.forEach((pts, i) => board.poly(pts, { stroke: LINE_INK, width: 1.6, id: lineIds[i]! }));
  const tries = Array.from({ length: 96 }, (_, k) => 0.5 + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * 0.0104 + 0.0052 * (k % 2)).filter((t) => t > 0.02 && t < 0.98);
  const labelGaps = curves.length === 0 ? [] : drawContours(board, placer, locale, curves, { stroke: EQUIPOTENTIAL, text: EQUIPOTENTIAL, width: 1.3, lineStyle: "dashed", tries, rank: (pt) => Math.min(...canvasLines.map((pts) => distanceToPolyline(pt, pts))), dropUnlabelled: input.equipotentials === "auto" });
  arrows.forEach((ar) => board.poly(ar.ring, { stroke: LINE_INK, width: 1, fill: LINE_INK, close: true, id: ar.id }));

  // ---- stagnation points: where a line stopped because E = 0 -------------------
  const zeros: { x: number; y: number }[] = [];
  for (const ln of lines) {
    if (ln.stagnation !== undefined && !zeros.some((z) => Math.hypot(z.x - ln.stagnation!.x, z.y - ln.stagnation!.y) < 0.05)) zeros.push(ln.stagnation);
  }
  zeros.forEach((z, k) => {
    const c = at([z.x, z.y]);
    board.circle(c, 3.6, { fill: PAPER, stroke: LINE_INK, width: 1.5, id: `null-point-${k}` });
    placer.addInk(`null-point-${k}`, [c], false, { c, r: 3.6 });
  });

  // ---- charges, last: a disc, its sign inside, its name beside -------------
  charges.forEach((c, i) => {
    const centre = at(c.at);
    const id = `charge-${i}`;
    board.circle(centre, rd, { fill: c.q > 0 ? CHARGE_POS : CHARGE_NEG, id });
    placer.addInk(id, [centre], false, { c: centre, r: rd });
    placer.commit(rectAt(centre, 2 * rd, 2 * rd));
    // The sign is drawn, not typeset: strokes 6px either side of the centre,
    // so it always sits inside a disc too small to hold a text box.
    const arm = 5.5;
    board.poly([{ x: centre.x - arm, y: centre.y }, { x: centre.x + arm, y: centre.y }], { stroke: "#FFFFFF", width: 2.4, id: `${id}-sign-h` });
    if (c.q > 0) board.poly([{ x: centre.x, y: centre.y - arm }, { x: centre.x, y: centre.y + arm }], { stroke: "#FFFFFF", width: 2.4, id: `${id}-sign-v` });
  });
  charges.forEach((c, i) => {
    const centre = at(c.at);
    const name = c.name ?? chargeName(c.q, locale);
    if (name === "") return;
    const style = { size: 14, weight: 700, colour: INK };
    const { w, h } = board.extent(name, style);
    // Directions the lines leave (or arrive at) this charge in: the name goes between them.
    const incident: number[] = [];
    lines.forEach((ln, k) => {
      if (ln.charge !== i && ln.sink !== i) return;
      const pts = canvasLines[k]!;
      const run = ln.charge === i ? pts : [...pts].reverse();
      const q = run.find((pt) => Math.hypot(pt.x - centre.x, pt.y - centre.y) >= rd + 12);
      if (q !== undefined) incident.push(Math.atan2(q.y - centre.y, q.x - centre.x));
    });
    const reach = Math.max(w, h);
    const lineGap = (a: Point, b: Point): number => {
      let best = Infinity;
      for (let t = 0; t <= 1; t += 0.1) {
        const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        for (const pts of canvasLines) best = Math.min(best, distanceToPolyline(p, pts));
      }
      return best;
    };
    const spots = aroundDisc(centre, rd, w, h, incident);
    // What could be read as the owner instead: the arrowheads, the equipotentials, and every OTHER charge's disc.
    const rivalsOf = (rect: Rect, own: number): boolean => {
      for (const ar of arrows) if (rectToPolyline(rect, [...ar.ring, ar.ring[0]!]) < own + 1) return true;
      for (const cv of curves) if (rectToPolyline(rect, cv.canvasPts) < own + 1) return true;
      for (let j = 0; j < charges.length; j += 1) {
        if (j !== i && pointToRect(at(charges[j]!.at), rect) - rd < own + 1) return true;
      }
      return false;
    };
    let chosen: { at: Point; leader?: [Point, Point] } | undefined;
    for (const spot of spots) {
      const rect = rectAt(spot.centre, w, h);
      if (!placer.clearOf(rect, "")) continue;
      const near = pointToRect(centre, rect);
      if (near <= reach - 1) {
        if (rivalsOf(rect, near)) continue;
        chosen = { at: spot.centre };
        break;
      }
      if (spot.gap >= 10) {
        const p0 = { x: centre.x + spot.u.x * (rd + 5), y: centre.y + spot.u.y * (rd + 5) };
        const p1 = { x: centre.x + spot.u.x * (rd + spot.gap), y: centre.y + spot.u.y * (rd + spot.gap) };
        // The name is read as belonging to what its centre is nearest: the leader, so no line may be as near.
        const toLeader = Math.hypot(spot.centre.x - p1.x, spot.centre.y - p1.y);
        let nearestLine = Infinity;
        for (const pts of canvasLines) nearestLine = Math.min(nearestLine, distanceToPolyline(spot.centre, pts));
        if (lineGap(p0, p1) >= 2 && !labelGaps.some((g) => segmentHitsRect(p0, p1, { x: g.x - 3, y: g.y - 3, width: g.width + 6, height: g.height + 6 })) && nearestLine > toLeader + 2 && !rivalsOf(rect, toLeader)) {
          chosen = { at: spot.centre, leader: [p0, p1] };
          break;
        }
      }
    }
    const at0 = chosen?.at ?? placer.choose({ kind: "place", id: `charge-${i}`, at: centre }, w, h, spots.map((sp) => sp.centre)).centre;
    const block = board.label(name, at0.x, at0.y, { ...style, width: w, fill: PAPER });
    if (chosen?.leader !== undefined) {
      const lid = `charge-${i}-leader`;
      board.poly(chosen.leader, { stroke: SOFT, width: 1, id: lid });
      block.annotates = lid;
    } else {
      block.annotatesPlace = centre;
    }
    placer.commit(rectAt(at0, w, h));
  });

  // ---- the panel: what the figure omits -------------------------------------
  const panel = ["linhas de campo (k omitido)"];
  if (zeros.length > 0) panel[0] = `linhas de campo (k omitido); ${zeros.length === 1 ? "○ marca o ponto" : "○ marca os pontos"} onde E = 0`;
  if (equipotentials.length > 0) panel.push("linhas tracejadas: equipotenciais, V = Σ q/r (k omitido)");
  (answers ? panel : []).forEach((text, i) => {
    board.label(text, built.width / 2, built.plotHeight + 22 + i * 20, { size: 12, colour: SOFT, id: `panel-${i}`, claim: false, freeStanding: true });
  });

  return finalizeSpec(board, [], title);
}

type DiscSpot = { centre: Point; gap: number; u: Point };

/** Spots for a label beside a disc of radius `r`, the directions farthest from `incident` first, each at growing distance from the rim. */
function aroundDisc(c: Point, r: number, w: number, h: number, incident: number[]): DiscSpot[] {
  const dirs: { a: number; score: number }[] = [];
  for (let k = 0; k < 120; k += 1) {
    const a = (k * Math.PI * 2) / 120;
    let gap = Math.PI;
    for (const i of incident) {
      let d = Math.abs(a - i) % (2 * Math.PI);
      if (d > Math.PI) d = 2 * Math.PI - d;
      gap = Math.min(gap, d);
    }
    dirs.push({ a, score: Math.min(gap, 1.2) - 0.05 * Math.sin(a) + 0.02 * Math.cos(a) });
  }
  dirs.sort((p, q) => q.score - p.score);
  const out: DiscSpot[] = [];
  for (const gap of [3, 5, 7, 10, 14, 20, 28, 38, 50, 64, 80, 100]) {
    for (const d of dirs) {
      const u = { x: Math.cos(d.a), y: Math.sin(d.a) };
      const reach = Math.abs(u.x) * (w / 2) + Math.abs(u.y) * (h / 2);
      out.push({ centre: { x: c.x + u.x * (r + gap + reach), y: c.y + u.y * (r + gap + reach) }, gap, u });
    }
  }
  return out;
}

// ---- entry point -------------------------------------------------------------

export function expandField(input: FieldInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const title = input.title ?? (input.kind === "slope" ? "campo de direções" : input.kind === "vector" ? "campo vetorial" : input.kind === "charges" ? "linhas de campo elétrico" : "curvas de nível");
  if (input.kind === "slope") return expandSlope(input, locale, title);
  if (input.kind === "vector") return expandVector(input, locale, title);
  if (input.kind === "levels") return expandLevels(input, locale, title);
  if (input.kind === "charges") return expandCharges(input, locale, title);
  throw new SpecError(`field.kind must be "slope", "vector", "levels" or "charges", got ${JSON.stringify((input as { kind?: unknown }).kind)}`);
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

function validateCharges(raw: Record<string, unknown>, path: string): void {
  const xr = raw.x as [number, number];
  const yr = raw.y as [number, number];
  const list = v.nonEmptyArray(raw, "charges", path, "charges");
  list.forEach((item, i) => {
    const p = `${path}.charges[${i}]`;
    const o = v.object(item, p);
    if (!Array.isArray(o.at) || o.at.length !== 2) throw new SpecError(`${p}.at must be [x, y]`);
    v.finite(o.at[0], `${p}.at[0]`);
    v.finite(o.at[1], `${p}.at[1]`);
    v.finite(o.q, `${p}.q`);
    if (o.q === 0) throw new SpecError(`${p}.q is 0: a charge of zero has no field -- leave it out`);
    v.optionalString(o, "name", p);
    const [x, y] = o.at as [number, number];
    if (!(x > xr[0] && x < xr[1] && y > yr[0] && y < yr[1])) throw new SpecError(`${p}.at = (${x}, ${y}) lies outside the plotted box x ${JSON.stringify(xr)}, y ${JSON.stringify(yr)}`);
  });
  if (raw.linesPerUnitCharge !== undefined) {
    v.finite(raw.linesPerUnitCharge, `${path}.linesPerUnitCharge`);
    if (!((raw.linesPerUnitCharge as number) >= 1)) throw new SpecError(`${path}.linesPerUnitCharge must be at least 1`);
  }
  const eq = raw.equipotentials;
  if (eq !== undefined && eq !== "auto") {
    v.array(raw, "equipotentials", path, "equipotentials").forEach((lv, i) => v.finite(lv, `${path}.equipotentials[${i}]`));
  }
}

export function validateFieldInput(raw: Record<string, unknown>): void {
  const path = "field";
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  v.optionalEnum(raw, "kind", path, ["slope", "vector", "levels", "charges"]);
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
  } else if (kind === "charges") {
    validateCharges(raw, path);
  } else {
    throw new SpecError(`${path}.kind must be "slope", "vector", "levels" or "charges"`);
  }
  // Arithmetic, expression grammar and geometry are all exercised by
  // actually building the figure -- the same discipline every other preset
  // here uses, because a second, hand-written shadow of this logic is a
  // second place for the two to drift.
  expandField(raw as unknown as FieldInput);
}
