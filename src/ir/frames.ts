/**
 * Frames: coordinate systems a figure states its positions in.
 *
 * The defect this exists to close is the one ADR 0019 opens with. A figure
 * whose coordinates are computed OUTSIDE the document is only true because
 * whoever computed them got it right; nothing in the spec ties the drawn slope
 * to the angle its own label prints. A frame moves that arithmetic inside, so
 * the angle appears once — as the frame's rotation — and everything positioned
 * in that frame follows from it.
 *
 * Resolved to canvas coordinates BEFORE anything measures, checks or repairs,
 * and the `frame` reference is stripped as it goes. That is deliberate on two
 * counts. It keeps every check reasoning in one space, exactly as the effects
 * layer resolves bleed after measurement and geometry/rotate.ts hands the
 * checker an axis-aligned bound. And stripping makes resolution IDEMPOTENT:
 * `normalise` runs more than once per render, and a resolution that left its
 * own input in place would transform the same coordinates twice.
 *
 * One thing survives the stripping: the SCALE a straight run was stated at
 * (`MeasuredIn`, ADR 0028). Every check that asks where ink is wants pixels;
 * the one that asks whether a line is as long as its label says wants the
 * units the label speaks, and those are exactly what stripping throws away.
 *
 * Frame axes point UP, not down. Every figure this serves — a coordinate
 * plane, an incline's normal, a vector diagram — is written by someone for
 * whom +y is up, and asking them to negate every y to suit the canvas would
 * put the arithmetic back outside the document. `rotation` is degrees
 * COUNTER-CLOCKWISE to match those axes; `Block.rotation` is clockwise, so a
 * block inheriting its frame's rotation gets the negated value. That sign flip
 * is the one sharp edge here and it is tested directly.
 */

import type {
  Block,
  FigureNode,
  FigureSpec,
  Frame,
  FramedPoint,
  GridSpec,
  Mark,
  MarkSegment,
  MeasuredIn,
  Point,
  Rect,
  Scene,
} from "./types.ts";
import { SpecError } from "./types.ts";
import { formatNumber } from "../locale/format.ts";
import { rectsMeet, segmentHitsRect } from "../geometry/hit.ts";
import type { Locale } from "../locale/format.ts";

/** A point stated in a frame, or one already in canvas coordinates. */
export function isFramedPoint(value: unknown): value is FramedPoint {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as FramedPoint).frame === "string" &&
    typeof (value as FramedPoint).x === "number" &&
    typeof (value as FramedPoint).y === "number"
  );
}

/** Where `(x, y)` in this frame lands on the canvas. */
export function resolveInFrame(frame: Frame & { origin: Point }, x: number, y: number): Point {
  const xUnit = frame.xUnit ?? 1;
  const yUnit = frame.yUnit ?? xUnit;
  const radians = ((frame.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  // y is negated once, here: the frame's +y is up and the canvas's is down.
  const localX = x * xUnit;
  const localY = -(y * yUnit);
  return {
    // Counter-clockwise in a y-down space is the transpose of the usual
    // matrix, which is why the sin terms read the way they do.
    x: frame.origin.x + localX * cos + localY * sin,
    y: frame.origin.y - localX * sin + localY * cos,
  };
}

/**
 * This scene's frames, each resolved to a canvas origin.
 *
 * In declaration order, so a frame may be placed in one declared before it
 * and nowhere else -- forward references would admit cycles, and a cycle here
 * is a frame defined in terms of itself with no fixed point to fall back on.
 */

/**
 * Every lattice value in [`from`, `to`], stepping by `step` from `origin`
 * (default `from`, which is every value from `from` on).
 *
 * Exported so a preset that must keep its own labels clear of the grid's tick
 * numbers asks this function where they will be, instead of re-deriving the
 * lattice and drifting from it.
 */
export function ticksOf(axis: { from: number; to: number; step?: number; origin?: number }): number[] {
  const step = Math.abs(axis.step ?? 1);
  if (step === 0 || !Number.isFinite(step)) return [];
  const lo = Math.min(axis.from, axis.to);
  const hi = Math.max(axis.from, axis.to);
  const origin = axis.origin ?? axis.from;
  const out: number[] = [];
  // Counted rather than accumulated: adding a float repeatedly drifts, and a
  // gridline half a pixel out of true is exactly the kind of defect this
  // project spends its time removing. Snapped to the origin's own lattice so
  // 0.1 * 3 is 0.3 and zero is exactly zero.
  const first = Math.ceil((lo - origin) / step - 1e-9);
  const last = Math.floor((hi - origin) / step + 1e-9);
  for (let i = first; i <= last; i += 1) {
    const value = origin + i * step;
    out.push(Math.abs(value) < step * 1e-9 ? 0 : Number(value.toPrecision(12)));
  }
  return out;
}

/** Does the closed range of this axis contain zero? */
function spansZero(axis: { from: number; to: number }): boolean {
  return Math.min(axis.from, axis.to) <= 0 && Math.max(axis.from, axis.to) >= 0;
}

const GRID_LINE_PX = 1;
const AXIS_LINE_PX = 2;

/**
 * Tick numbers are set darker than the lattice they number (ADR 0034). The
 * old default, #6B7280, cleared WCAG AA against paper (4.7:1) and still read
 * as grey-on-grey: `contrast-sufficient` scores a number against the SURFACE
 * under it, and a gridline is deliberately not a surface, so the check could
 * not see the complaint a reader made. #4B5563 is 7.3:1 on #FCFBF7 and
 * stays visibly quieter than a figure's own ink.
 */
const TICK_COLOUR = "#4B5563";
const TICK_FONT = 11;
/** The tick block's height: one 11px line box (16px) plus slack. */
const TICK_H = 18;
/** Gap between an axis and the near edge of the number printed beside it. */
const TICK_GAP_X = 5; // below/above the x axis
const TICK_GAP_Y = 14; // left/right of the y axis
/** Gap between the origin and the single "0" printed in its corner. */
const ORIGIN_GAP = 5;

/** What a tick number must stay off: other ink, and other text. Canvas pixels. */
export type GridObstacles = { ink: Point[][]; boxes: Rect[] };

/**
 * How wide an 11px tick number is set, glyph by glyph, erring wide: a digit
 * is about 6.2px, the ASCII hyphen 4, the typographic minus 6.8, a comma or
 * point under 3. Used for what the checks measure -- the TEXT, not its box --
 * so a number is not moved for a neighbour its glyphs do not touch.
 */
function tickTextWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += /\d/.test(ch) ? 6.2 : ch === "-" ? 4.2 : ch === "−" ? 6.8 : ch === "," || ch === "." ? 2.8 : 6.6;
  return w;
}

/** The tick's block: its text plus a pixel each side, the extent of its paper backing. */
function tickWidth(text: string): number {
  return Math.ceil(tickTextWidth(text) + 2);
}

/** Where a spot's text sits inside its box: one 16px line at the top, aligned as the box says. */
function textIn(spot: TickSpot, text: string): Rect {
  const w = tickTextWidth(text);
  const { box, align } = spot;
  const x = align === "start" ? box.x : align === "end" ? box.x + box.width - w : box.x + (box.width - w) / 2;
  return { x, y: box.y, width: w, height: 16 };
}

/** Is this box, padded by a pixel, clear of every obstacle? */
/**
 * Is this spot clear? Of ink, the whole box, padded a pixel: a line through
 * the paper backing would be painted over it. Of other boxes, only the text:
 * that is what `text-clear-of-other-boxes` measures, and holding a number
 * to more would move it off spots the checks were always content with.
 */
function clearOf(spot: TickSpot, text: string, obstacles: GridObstacles): boolean {
  const box = spot.box;
  const padded = { x: box.x - 1, y: box.y - 1, width: box.width + 2, height: box.height + 2 };
  for (const line of obstacles.ink) {
    for (let i = 0; i < line.length - 1; i += 1) {
      if (segmentHitsRect(line[i]!, line[i + 1]!, padded)) return false;
    }
  }
  const glyphs = textIn(spot, text);
  return !obstacles.boxes.some((other) => rectsMeet(glyphs, other));
}

/**
 * A frame's `grid` as ordinary blocks: one thin rect per line, plus numbered
 * ticks along the axes.
 *
 * Blocks and not connectors, and the reason is painter's order: pipeline.ts
 * draws every box, then every connector, then every label, so a lattice built
 * from connectors would be drawn ON TOP of the figure standing on it. Blocks
 * prepended to the scene's children paint first, which is where a grid
 * belongs.
 *
 * Each line is a rect in CANVAS space spanning the two ends the frame maps,
 * which keeps a rotated frame honest: the line runs between the points the
 * frame actually puts at its ends rather than being drawn axis-aligned and
 * rotated afterwards.
 *
 * `obstacles` is the rest of the scene -- its connectors' and marks' ink and
 * its labelled blocks, already in canvas pixels -- so a tick number can step
 * off a line it would otherwise be printed on (ADR 0034). `paper` is the
 * canvas background, when it is a solid colour: a number with a clear spot is
 * set on a paper backing that interrupts the gridline it sits on.
 */
function expandGrid(
  frame: Frame & { origin: Point },
  grid: GridSpec,
  obstacles: GridObstacles = { ink: [], boxes: [] },
  paper?: string,
): { blocks: Block[]; marks: Mark[] } {
  const out: Block[] = [];
  const lines: Mark[] = [];
  const stroke = grid.stroke ?? "#D8DCE3";
  const axisStroke = grid.axisStroke ?? "#8A93A3";
  const labelColor = grid.labelColor ?? TICK_COLOUR;
  const drawAxes = grid.axes !== false;
  const drawLabels = grid.labels !== false;

  const xs = ticksOf(grid.x);
  const ys = ticksOf(grid.y);

  // A stroked mark, not a filled rect: a rect can be a 1px line but it cannot
  // be a DASHED one, and dashed gridlines are the norm in a plot. Marks are
  // also what a lattice actually is -- ink, painted beneath everything, taking
  // no part in collision -- so this is the honest shape as well as the
  // capable one.
  const line = (id: string, a: Point, b: Point, width: number, colour: string, dashed: boolean) => {
    const segments: MarkSegment[] = [{ line: b }];
    lines.push({
      id,
      gridOf: frame.id,
      from: a,
      segments,
      close: false,
      fill: "none",
      stroke: colour,
      strokeWidth: width,
      ...(dashed && grid.lineStyle !== undefined ? { lineStyle: grid.lineStyle } : {}),
    });
  };

  // The zero lines carry stable ids -- `<frame>-axis-x` is the x axis,
  // `<frame>-axis-y` the y axis -- whether or not the lattice lands on zero,
  // so a mark can claim to lie on an axis by name (Mark.on).
  for (const [i, x] of xs.entries()) {
    const isAxis = drawAxes && x === 0;
    line(
      isAxis ? `${frame.id}-axis-y` : `${frame.id}-grid-v-${i}`,
      resolveInFrame(frame, x, grid.y.from),
      resolveInFrame(frame, x, grid.y.to),
      isAxis ? AXIS_LINE_PX : GRID_LINE_PX,
      isAxis ? axisStroke : stroke,
      !isAxis,
    );
  }
  for (const [i, y] of ys.entries()) {
    const isAxis = drawAxes && y === 0;
    line(
      isAxis ? `${frame.id}-axis-x` : `${frame.id}-grid-h-${i}`,
      resolveInFrame(frame, grid.x.from, y),
      resolveInFrame(frame, grid.x.to, y),
      isAxis ? AXIS_LINE_PX : GRID_LINE_PX,
      isAxis ? axisStroke : stroke,
      !isAxis,
    );
  }
  // The zero line is drawn whenever the range CONTAINS zero, not only when
  // the lattice happens to land on it. A grid over [−13, 13] in steps of 2,
  // or [−0.5, 4.5] in steps of 1, rules every line but the one a reader
  // needs most, and the figure silently loses its axes -- which is how the
  // Cálculo 1 sheet shipped a plot with no x axis.
  if (drawAxes && spansZero(grid.x) && !xs.includes(0)) {
    line(`${frame.id}-axis-y`, resolveInFrame(frame, 0, grid.y.from), resolveInFrame(frame, 0, grid.y.to), AXIS_LINE_PX, axisStroke, false);
  }
  if (drawAxes && spansZero(grid.y) && !ys.includes(0)) {
    line(`${frame.id}-axis-x`, resolveInFrame(frame, grid.x.from, 0), resolveInFrame(frame, grid.x.to, 0), AXIS_LINE_PX, axisStroke, false);
  }

  // Ticks are numbered along the axis when zero is in range, and along the
  // low edge otherwise -- a plane showing only positive values still needs
  // its numbers somewhere.
  const yBase = spansZero(grid.y) ? 0 : grid.y.from;
  const xBase = spansZero(grid.x) ? 0 : grid.x.from;

  // A required number leaves a trace with no ink at its tick, so the check
  // can look for the printed number there whoever printed it -- this grid,
  // or a preset that numbers its own axes and turned `labels` off.
  const stepX = Math.abs(grid.x.step ?? 1) * Math.abs(frame.xUnit ?? 1);
  const stepY = Math.abs(grid.y.step ?? 1) * Math.abs(frame.yUnit ?? frame.xUnit ?? 1);
  const requirement = (axis: "x" | "y", value: number, i: number): void => {
    const at = axis === "x" ? resolveInFrame(frame, value, yBase) : resolveInFrame(frame, xBase, value);
    lines.push({
      id: `${frame.id}-require-${axis}-${i}`,
      gridOf: frame.id,
      from: at,
      segments: [{ line: at }],
      close: false,
      fill: "none",
      stroke: "none",
      strokeWidth: 0,
      tick: {
        axis,
        value,
        within: (axis === "x" ? stepX : stepY) / 2,
        reach: (axis === "x" ? stepY : stepX) / 2 + 24,
      },
    });
  };
  (grid.x.require ?? []).forEach((v, i) => requirement("x", v, i));
  (grid.y.require ?? []).forEach((v, i) => requirement("y", v, i));

  if (!drawLabels) return { blocks: out, marks: lines };

  // Tick numbers already placed are obstacles for the ones after them: a
  // number that stepped off a line must not step onto its neighbour.
  const taken: GridObstacles = { ink: obstacles.ink, boxes: [...obstacles.boxes] };
  for (const { id, text, spots } of tickPlan(frame, grid)) {
    // The first spot is where the number has always been printed. It moves
    // only when that spot has ink or another label on it, and only to a spot
    // still beside its own tick; if nothing is clear it keeps the first spot
    // WITHOUT a backing, so `text-clear-of-ink` reports the collision rather
    // than a paper patch hiding it (connectors paint over boxes, so a backing
    // would not even cover the line it was hiding).
    const clear = spots.find((spot) => clearOf(spot, text, taken));
    const { box, align } = clear ?? spots[0]!;
    taken.boxes.push(box);
    out.push({
      type: "block",
      id,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      padding: 0,
      fill: clear !== undefined && paper !== undefined ? paper : "none",
      stroke: "none",
      strokeWidth: 0,
      wrap: "none",
      fontSize: TICK_FONT,
      textAlign: align,
      textColor: labelColor,
      label: text,
      gridOf: frame.id,
    });
  }
  return { blocks: out, marks: lines };
}

export type TickSpot = { box: Rect; align: "start" | "center" | "end" };

/**
 * Every tick number a grid prints, with the spots it may be printed in, in
 * order of preference -- the first is where it goes when nothing is in the
 * way (ADR 0034). Exported so a preset keeping its own labels clear of the
 * numbers asks this function where they will be instead of re-deriving it.
 * Empty when the grid's `labels` are off.
 */
export function tickPlan(
  frame: Frame & { origin: Point },
  grid: GridSpec,
): { id: string; text: string; spots: TickSpot[] }[] {
  const plan: { id: string; text: string; spots: TickSpot[] }[] = [];
  if (grid.labels === false) return plan;
  const everyOn = (axis: { labelEvery?: number }): number =>
    Math.max(1, Math.round(axis.labelEvery ?? grid.labelEvery ?? 1));
  const everyX = everyOn(grid.x);
  const everyY = everyOn(grid.y);
  const xs = ticksOf(grid.x);
  const ys = ticksOf(grid.y);
  const yBase = spansZero(grid.y) ? 0 : grid.y.from;
  const xBase = spansZero(grid.x) ? 0 : grid.x.from;
  const stepX = Math.abs(grid.x.step ?? 1) * Math.abs(frame.xUnit ?? 1);
  const stepY = Math.abs(grid.y.step ?? 1) * Math.abs(frame.yUnit ?? frame.xUnit ?? 1);
  const locale = grid.locale;
  const format = (value: number): string =>
    locale === undefined ? String(Math.round(value * 1000) / 1000) : formatNumber(value, locale);

  // How far a number may slide along its own gridline, away from the axis:
  // never past half a division, so it stays nearer its own tick's row than
  // the next one's.
  const slides = (room: number): number[] => {
    const out: number[] = [];
    for (let k = 2; k <= room; k += 2) out.push(k);
    return out;
  };

  // How far a number may step sideways off its own gridline: from just
  // clear of it to just short of halfway to the next one, so it is always
  // nearer its own tick than its neighbour's.
  const sideways = (from: number, to: number): number[] => {
    const out: number[] = [];
    for (let k = from; k <= to; k += 3) out.push(k);
    return out;
  };

  // Zero is printed ONCE, in the corner of the origin, when both axes would
  // number it there. Printed per axis, the x axis's "0" sat on the y axis
  // and the y axis's "0" sat on the x axis -- one number, struck through
  // twice. Only when both bases ARE the origin: a plane numbered along its
  // low edge has two different zeros, and each keeps its own.
  const xZero = xs.findIndex((x) => x === 0);
  const yZero = ys.findIndex((y) => y === 0);
  const sharedZero =
    xBase === 0 && yBase === 0 && xZero >= 0 && yZero >= 0 && xZero % everyX === 0 && yZero % everyY === 0;

  for (const [i, x] of xs.entries()) {
    if (i % everyX !== 0 || (sharedZero && i === xZero)) continue;
    const at = resolveInFrame(frame, x, yBase);
    const text = format(x);
    const w = tickWidth(text);
    const left = at.x - w / 2;
    const below = at.y + TICK_GAP_X;
    const above = at.y - TICK_GAP_X - TICK_H;
    // A number whose box starts within half a division of the axis is still
    // read as this row's, not as a label on the next gridline across.
    const room = Math.max(0, stepY / 2 - TICK_GAP_X);
    plan.push({ id: `${frame.id}-tick-x-${i}`, text, spots: [
      { box: { x: left, y: below, width: w, height: TICK_H }, align: "center" },
      { box: { x: left, y: above, width: w, height: TICK_H }, align: "center" },
      // Then further along its own gridline, away from the axis -- below
      // first, the side the row of numbers is read along. On its gridline it
      // cannot be mistaken for another x.
      ...slides(room).map((k) => ({ box: { x: left, y: below + k, width: w, height: TICK_H }, align: "center" as const })),
      ...slides(room).map((k) => ({ box: { x: left, y: above - k, width: w, height: TICK_H }, align: "center" as const })),
      // Last, off its own gridline to either side -- for when something is
      // drawn ALONG that gridline (a vector at x = −6 is ink on the whole
      // gridline). Only while it stays nearer its own tick than the next.
      ...sideways(w / 2 + 3, stepX / 2 - w / 2 - 2).flatMap((k) =>
        [left - k, left + k].flatMap((x) => [
          { box: { x, y: below, width: w, height: TICK_H }, align: "center" as const },
          { box: { x, y: above, width: w, height: TICK_H }, align: "center" as const },
        ]),
      ),
    ] });
  }
  for (const [i, y] of ys.entries()) {
    if (i % everyY !== 0 || (sharedZero && i === yZero)) continue;
    const at = resolveInFrame(frame, xBase, y);
    const text = format(y);
    const w = tickWidth(text);
    const top = at.y - TICK_H / 2;
    const leftOf = at.x - TICK_GAP_Y - w;
    const rightOf = at.x + TICK_GAP_Y;
    const room = Math.max(0, stepX / 2 - TICK_GAP_Y);
    plan.push({ id: `${frame.id}-tick-y-${i}`, text, spots: [
      { box: { x: leftOf, y: top, width: w, height: TICK_H }, align: "end" },
      { box: { x: rightOf, y: top, width: w, height: TICK_H }, align: "start" },
      // Then further out along its own gridline.
      ...slides(room).flatMap((k) => [
        { box: { x: leftOf - k, y: top, width: w, height: TICK_H }, align: "end" as const },
        { box: { x: rightOf + k, y: top, width: w, height: TICK_H }, align: "start" as const },
      ]),
      // Last, off its own gridline, up or down, the same way.
      ...sideways(TICK_H / 2 + 3, stepY / 2 - TICK_H / 2 - 2).flatMap((k) =>
        [top - k, top + k].flatMap((y) => [
          { box: { x: leftOf, y, width: w, height: TICK_H }, align: "end" as const },
          { box: { x: rightOf, y, width: w, height: TICK_H }, align: "start" as const },
        ]),
      ),
    ] });
  }
  if (sharedZero) {
    const o = resolveInFrame(frame, 0, 0);
    const text = format(0);
    const w = tickWidth(text);
    const box = (dx: -1 | 1, dy: -1 | 1): { box: Rect; align: "start" | "end" } => ({
      box: {
        x: dx < 0 ? o.x - ORIGIN_GAP - w : o.x + ORIGIN_GAP,
        y: dy > 0 ? o.y + ORIGIN_GAP : o.y - ORIGIN_GAP - TICK_H,
        width: w,
        height: TICK_H,
      },
      align: dx < 0 ? "end" : "start",
    });
    // Below-left first: the corner a textbook prints its origin in.
    plan.push({ id: `${frame.id}-tick-origin`, text, spots: [box(-1, 1), box(1, 1), box(-1, -1), box(1, -1)] });
  }
  return plan;
}

/** A minor arc from `a` to `b` about `centre`, as a short polyline. */
function arcPoints(a: Point, b: Point, centre: Point): Point[] {
  const r = Math.hypot(a.x - centre.x, a.y - centre.y);
  const a0 = Math.atan2(a.y - centre.y, a.x - centre.x);
  let delta = Math.atan2(b.y - centre.y, b.x - centre.x) - a0;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const out: Point[] = [];
  for (let k = 0; k <= 12; k += 1) {
    const t = a0 + (delta * k) / 12;
    out.push({ x: centre.x + r * Math.cos(t), y: centre.y + r * Math.sin(t) });
  }
  return out;
}

/**
 * What a scene's tick numbers must stay off, from the scene's own resolved
 * connectors, marks and labelled blocks. Only what can be located before
 * layout counts: a connector ending on a block id has no route yet, and a
 * curve other than a sweep is not modelled; both are left to the checks.
 */
function obstaclesOf(children: FigureNode[], connectors: Scene["connectors"], marks: Mark[]): GridObstacles {
  const ink: Point[][] = [];
  for (const c of connectors ?? []) {
    if (typeof c.from === "string" || typeof c.to === "string") continue;
    if (c.stroke === "none" || (c.strokeWidth !== undefined && c.strokeWidth <= 0)) continue;
    const from = c.from as Point;
    const to = c.to as Point;
    if (c.curve === undefined) ink.push([from, to]);
    else if (c.curve.kind === "sweep") ink.push(arcPoints(from, to, c.curve.centre as Point));
  }
  for (const m of marks) {
    if (m.gridOf !== undefined || m.place === true) continue;
    if (m.stroke === undefined || m.stroke === "none" || (m.strokeWidth ?? 1) <= 0) continue;
    const pts: Point[] = [m.from as Point];
    for (const s of m.segments) {
      const prev = pts[pts.length - 1]!;
      if ("line" in s) pts.push(s.line as Point);
      else pts.push(...arcPoints(prev, s.arc as Point, s.centre as Point).slice(1));
    }
    if (m.close === true) pts.push(pts[0]!);
    ink.push(pts);
  }
  const boxes: Rect[] = [];
  for (const child of children) {
    if (child.type !== "block") continue;
    const b = child as Block;
    if (b.gridOf !== undefined || typeof b.label !== "string" || b.label === "") continue;
    if (b.rotation !== undefined && b.rotation !== 0) continue;
    if (typeof b.x !== "number" || typeof b.y !== "number" || typeof b.width !== "number" || typeof b.height !== "number") continue;
    boxes.push({ x: b.x, y: b.y, width: b.width, height: b.height });
  }
  return { ink, boxes };
}

/** A canvas background a tick number can be backed with, if it is a solid colour. */
function paperOf(background: string | undefined): string | undefined {
  if (background === undefined) return undefined;
  const hex = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
  return hex.test(background.trim()) ? background.trim() : undefined;
}

function framesOf(
  scene: Scene,
  inherited: Map<string, Frame & { origin: Point }>,
): Map<string, Frame & { origin: Point }> {
  const frames = new Map(inherited);
  for (const frame of scene.frames ?? []) {
    const origin = isFramedPoint(frame.origin)
      ? resolveInFrame(
          frameOrThrow(frames, frame.origin.frame, `frame "${frame.id}".origin`),
          frame.origin.x,
          frame.origin.y,
        )
      : frame.origin;
    // `towards` becomes a rotation the moment both ends are known, so nothing
    // downstream has to learn about a second way of aiming a frame.
    let rotation = frame.rotation;
    if (frame.towards !== undefined) {
      const aim = isFramedPoint(frame.towards)
        ? resolveInFrame(
            frameOrThrow(frames, frame.towards.frame, `frame "${frame.id}".towards`),
            frame.towards.x,
            frame.towards.y,
          )
        : frame.towards;
      // Canvas y is down and a frame's rotation is counter-clockwise, so the
      // bearing is negated exactly once, here.
      rotation = (-Math.atan2(aim.y - origin.y, aim.x - origin.x) * 180) / Math.PI;
    }
    frames.set(frame.id, { ...frame, origin, ...(rotation === undefined ? {} : { rotation }) });
  }
  return frames;
}

function frameOrThrow(
  frames: Map<string, Frame & { origin: Point }>,
  id: string,
  where: string,
): Frame & { origin: Point } {
  const frame = frames.get(id);
  if (frame === undefined) {
    const known = [...frames.keys()];
    throw new SpecError(
      `${where} names frame "${id}", which this scene does not declare` +
        (known.length === 0 ? "" : ` (it declares ${known.join(", ")})`),
    );
  }
  return frame;
}

function resolvePoint(
  value: Point | FramedPoint,
  frames: Map<string, Frame & { origin: Point }>,
  where: string,
): Point {
  if (!isFramedPoint(value)) return value;
  return resolveInFrame(frameOrThrow(frames, value.frame, where), value.x, value.y);
}

/**
 * The scale a straight run from `a` to `b` was stated at, or undefined when
 * it has no single one (ADR 0028).
 *
 * Resolution is about to strip both frames, and `length-matches-its-label`
 * is the one check that needs what they said: pixels per unit, and which way
 * the unit runs. Recorded only when both ends are framed and the two frames
 * agree on scale -- the SAME frame is the common case (a dimension line, a
 * vector in its own scaled frame), and two frames of one scale are the
 * incline figure's case (an arrow leaving a point stated in the tilted frame
 * and ending in the level one). Anything else has no honest unit, and the
 * check then says "not applicable" rather than this function inventing one.
 *
 * A non-square frame measures a diagonal differently depending on which way
 * its axes run, so two non-square frames must share a rotation too. A square
 * one does not care, and demanding it would refuse the incline for nothing.
 */
function scaleOf(
  a: Point | FramedPoint,
  b: Point | FramedPoint,
  frames: Map<string, Frame & { origin: Point }>,
): MeasuredIn | undefined {
  if (!isFramedPoint(a) || !isFramedPoint(b)) return undefined;
  const fa = frames.get(a.frame);
  const fb = frames.get(b.frame);
  if (fa === undefined || fb === undefined) return undefined; // resolvePoint throws with the message
  const scale = (f: Frame) => {
    const xUnit = Math.abs(f.xUnit ?? 1);
    return { xUnit, yUnit: Math.abs(f.yUnit ?? f.xUnit ?? 1) };
  };
  const sa = scale(fa);
  const sb = scale(fb);
  if (sa.xUnit !== sb.xUnit || sa.yUnit !== sb.yUnit) return undefined;
  if (fa.unit !== fb.unit) return undefined;
  const turn = (f: Frame): number => ((((f.rotation ?? 0) % 360) + 360) % 360);
  if (sa.xUnit !== sa.yUnit && Math.abs(turn(fa) - turn(fb)) > 1e-9) return undefined;
  return {
    frame: fa.id,
    xUnit: sa.xUnit,
    yUnit: sa.yUnit,
    rotation: fa.rotation ?? 0,
    ...(fa.unit === undefined ? {} : { unit: fa.unit }),
  };
}

/**
 * The scale a CLOSED mark's whole outline was stated at, or undefined when it
 * has none (ADR 0037, extending ADR 0028's rule from a run's two ends to a
 * polygon's every vertex).
 *
 * A shaded region -- "area under the curve", a Riemann rectangle, a triangle
 * -- is one closed mark, and its printed area label is exactly the same kind
 * of separately-typed number a dimension line's "50 m" is. Recorded only when
 * every vertex is a `FramedPoint` and every one of them agrees with the
 * first on scale (and, for a non-square frame, on rotation too) -- the same
 * agreement `scaleOf` already tests pairwise for a run's two ends, checked
 * here against every vertex rather than just two. An arc segment has no
 * vertex a shoelace sum can use, so a mark with one records nothing; neither
 * does a mark with fewer than two vertices, or one open (`close` false and no
 * `fill`), since ADR 0028 already covers an open single-segment run and an
 * open, multi-segment path has no enclosed area to check a label against.
 */
function scaleOfClosedOutline(
  from: Point | FramedPoint,
  segments: MarkSegment[],
  frames: Map<string, Frame & { origin: Point }>,
): MeasuredIn | undefined {
  if (segments.some((s) => "arc" in s)) return undefined; // no vertex a shoelace sum can use
  const vertices: (Point | FramedPoint)[] = [from, ...segments.map((s) => (s as { line: Point | FramedPoint }).line)];
  if (vertices.length < 3) return undefined; // not a polygon
  let scale: MeasuredIn | undefined;
  for (let i = 1; i < vertices.length; i += 1) {
    const pair = scaleOf(vertices[0]!, vertices[i]!, frames);
    if (pair === undefined) return undefined;
    scale = pair;
  }
  return scale;
}

/**
 * Every frame reference in the spec replaced by the canvas coordinate it
 * denotes, and every `frame` field removed.
 *
 * The spec is not mutated; a resolved copy is returned, the same discipline
 * decision 0003 imposes on repairs.
 */
export function resolveFrames(spec: FigureSpec): FigureSpec {
  return { ...spec, root: resolveNode(spec.root, new Map(), paperOf(spec.canvas?.background)) };
}

function resolveNode(
  node: FigureNode,
  inherited: Map<string, Frame & { origin: Point }>,
  paper?: string,
): FigureNode {
  if (node.type === "stack") {
    return { ...node, children: node.children.map((child) => resolveNode(child, inherited, paper)) };
  }
  if (node.type === "scene") {
    // A scene's own frames win over an enclosing scene's, by id.
    const frames = framesOf(node, inherited);

    // A label that names a PLACE (ADR 0028) leaves resolution naming a MARK
    // at that place: no stroke, no fill, one point -- the tick requirement's
    // shape, for the tick requirement's reason. Layout already lifts every
    // mark into page space, so the place lands where the label's box does
    // without a second lifting path, and `annotates` already reaches the
    // placed figure, so nothing else in the pipeline has to learn a new field.
    // Rewriting `annotatesPlace` away is what keeps this idempotent, exactly
    // as stripping `frame` does for positions.
    const placeMarks: Mark[] = [];
    const takenIds = new Set((node.marks ?? []).map((mark) => mark.id));
    const ownChildren = [
      ...node.children.map((child, i) => {
        const resolved = resolveNode(child, frames, paper) as Block;
        if (child.annotatesPlace === undefined) return resolved;
        const at = resolvePoint(child.annotatesPlace, frames, `children[${i}].annotatesPlace`);
        const id = `${child.id}-place`;
        if (takenIds.has(id)) {
          throw new SpecError(
            `block "${child.id}" names a place, recorded as mark "${id}" -- which this scene already declares`,
          );
        }
        takenIds.add(id);
        placeMarks.push({
          id,
          place: true,
          from: at,
          segments: [{ line: at }],
          close: false,
          fill: "none",
          stroke: "none",
          strokeWidth: 0,
        });
        const named: Block = { ...resolved, annotates: id };
        delete named.annotatesPlace;
        return named;
      }),
    ];
    const connectors = node.connectors?.map((connector, i) => {
      const where = `connectors[${i}]`;
      const measuredIn =
        typeof connector.from === "string" || typeof connector.to === "string"
          ? undefined
          : scaleOf(connector.from, connector.to, frames);
      const curve =
        connector.curve?.kind === "sweep"
          ? {
              ...connector.curve,
              centre: resolvePoint(connector.curve.centre, frames, `${where}.curve.centre`),
            }
          : connector.curve;
      return {
        ...connector,
        from:
          typeof connector.from === "string"
            ? connector.from
            : resolvePoint(connector.from, frames, `${where}.from`),
        to:
          typeof connector.to === "string"
            ? connector.to
            : resolvePoint(connector.to, frames, `${where}.to`),
        ...(curve === undefined ? {} : { curve }),
        ...(measuredIn === undefined ? {} : { measuredIn }),
      };
    });

    const ownMarks = [...(node.marks ?? []), ...placeMarks].map((mark, i) => {
      const where = `marks[${i}]`;
      // Only a single straight run has one length to state; a path of
      // several segments, or an arc, is not what "50 m" measures.
      const only = mark.segments.length === 1 ? mark.segments[0]! : undefined;
      // A closed mark's whole outline is what an area label measures (ADR
      // 0037), unchanged from ADR 0028 when it happens to be a single
      // segment: that case already goes through `scaleOf` above.
      const closed = mark.close ?? mark.fill !== undefined;
      const measuredIn =
        mark.gridOf !== undefined
          ? undefined
          : only !== undefined && "line" in only
            ? scaleOf(mark.from, only.line, frames)
            : closed
              ? scaleOfClosedOutline(mark.from, mark.segments, frames)
              : undefined;
      return {
        ...mark,
        ...(measuredIn === undefined ? {} : { measuredIn }),
        from: resolvePoint(mark.from, frames, `${where}.from`),
        segments: mark.segments.map((segment, j) =>
          "line" in segment
            ? { line: resolvePoint(segment.line, frames, `${where}.segments[${j}].line`) }
            : {
                arc: resolvePoint(segment.arc, frames, `${where}.segments[${j}].arc`),
                centre: resolvePoint(segment.centre, frames, `${where}.segments[${j}].centre`),
              },
        ),
      } as Mark;
    });

    // Generated first so it paints first: a grid is what the figure stands on.
    // Expanded AFTER the scene's own elements are resolved, because a tick
    // number has to know where their ink is to stay off it (ADR 0034).
    const furniture: Block[] = [];
    const furnitureMarks: Mark[] = [];
    const obstacles = obstaclesOf(ownChildren, connectors, ownMarks);
    for (const declared of node.frames ?? []) {
      if (declared.grid === undefined) continue;
      const expanded = expandGrid(frames.get(declared.id)!, declared.grid, obstacles, paper);
      furniture.push(...expanded.blocks);
      furnitureMarks.push(...expanded.marks);
    }
    const children = [...furniture, ...ownChildren];
    const marks = [...furnitureMarks, ...ownMarks];

    const resolved: Scene = {
      ...node,
      children,
      ...(connectors === undefined ? {} : { connectors }),
      ...(marks.length === 0 ? {} : { marks }),
    };
    delete resolved.frames;
    return resolved;
  }

  const block = node as Block;
  if (block.frame === undefined) return block;
  const frame = frameOrThrow(inherited, block.frame, `block "${block.id ?? "(unnamed)"}"`);

  // A block in a frame LIES IN that frame: its box is laid out along the
  // frame's axes from the stated corner, and the whole thing is then mapped
  // to the canvas. Since `Block.rotation` turns a box about its own centre
  // (geometry/rotate.ts), the way to get that is to map the CENTRE and place
  // the box around it -- mapping the corner instead and rotating about the
  // centre swings the box away from where the frame put it, which for a
  // 440px bar on a 30 degree frame threw it 35px off the canvas.
  //
  // A block with no declared size has no centre to map, so its corner is
  // mapped and it sits where an unrotated frame would have put it anyway.
  const sized = block.width !== undefined && block.height !== undefined;
  const at = resolveInFrame(frame, block.x ?? 0, block.y ?? 0);
  // The half-box offset is applied along the frame's DIRECTIONS but in CANVAS
  // pixels, because width and height are pixels and x and y are frame units.
  // Adding one to the other -- which a first version did -- is a unit error
  // that stays invisible while xUnit is 1 and throws a marker 550px off the
  // plane the moment a frame scales.
  const radians = ((frame.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const along = (dx: number, dy: number): Point => ({
    x: at.x + dx * cos + dy * sin,
    y: at.y - dx * sin + dy * cos,
  });
  const placed = !sized
    ? at
    : block.anchor === "center"
      ? { x: at.x - block.width! / 2, y: at.y - block.height! / 2 }
      : (() => {
          // Default: the stated point is the box's top-left corner IN THE
          // FRAME, so the box extends along the frame's own axes from there.
          const centre = along(block.width! / 2, block.height! / 2);
          return { x: centre.x - block.width! / 2, y: centre.y - block.height! / 2 };
        })();
  const resolved: Block = {
    ...block,
    x: placed.x,
    y: placed.y,
    // A block in a tilted frame is tilted with it unless it says otherwise.
    // Block.rotation is CLOCKWISE and a frame's is counter-clockwise, hence
    // the negation -- the one sign flip in this file, and the reason
    // `rotateBox` is set alongside it: a frame turns the box, not just the
    // glyphs inside it.
    ...(frame.rotation === undefined || frame.rotation === 0 || block.rotation !== undefined
      ? {}
      : { rotation: -frame.rotation, rotateBox: block.rotateBox ?? true }),
  };
  delete resolved.frame;
  return resolved;
}
