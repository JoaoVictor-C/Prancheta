/**
 * vectors -- R² vectors for Geometria Analítica and Física 1.
 *
 * A vector is given three ways: by components (`{name: "u", components:
 * [3, 1]}`), by two named points (`{name: "AB", from: "A", to: "B"}`), or
 * by magnitude and angle (`{magnitude: 5, angle: "37°"}`). Everything else --
 * a sum, a difference, a scalar multiple, the decomposition of a vector into
 * its x/y components, the projection of one vector onto another, the angle
 * between two vectors -- is DERIVED from the vectors already named, never
 * typed. A sum's arrowhead lands where component addition puts it; an angle
 * arc's sweep is the angle its two arms actually make (ADR 0019's
 * `sweep-matches-its-label` then holds by construction, not by hand-tuning).
 *
 * Every vector is drawn on one gridded plane -- a `Frame` with a `grid`, so
 * the lattice, the axes and their numbers are the frame's own geometry
 * (ir/frames.ts), never redrawn by hand here. This preset computes every
 * other point in the same MATH space the frame uses and converts it with the
 * frame's own `resolveInFrame`, so a vector's arrowhead and the gridline it
 * lands beside come from the same arithmetic and cannot disagree. The plane
 * carries no rotation, so canvas-only visual constants (an arc's radius, a
 * right-angle mark's leg) are safe to size in pixels without distorting an
 * angle.
 *
 * Printed numbers -- magnitudes, components, angles -- are computed and
 * formatted pt-BR by the one locale formatter (src/locale/format.ts): a
 * magnitude whose square is an integer prints as an exact root, |(3, 1)| as
 * "√10", the way sign-chart snaps a root instead of printing "3,162".
 */

import type { Connector, Frame, FigureSpec, FramedPoint, GridSpec, Point, Rect, Scene } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { resolveInFrame, tickPlan } from "../../ir/frames.ts";
import { LOCALES, formatNumber, formatPoint } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";
import type { LabelOptions } from "../function-graph/board.ts";
import { typedCoordinate } from "../function-graph/preset.ts";
import { fitUnits, niceStep } from "../shared/scale.ts";
import { hasScripts, layoutPanel, rich } from "../shared/panel.ts";
import { runsText } from "../../ir/types.ts";
import { candidatesBeside, distanceToPolyline, pointToRect, rectsMeet, segmentHitsRect } from "../../geometry/hit.ts";
import { measuredLabel, sqrtLabel } from "../../locale/write.ts";

// ---- input ------------------------------------------------------------

export type PointDef = { name: string; at: [number, number] };

export type VectorTyped =
  | { name: string; components: [number, number]; at?: [number, number]; label?: string }
  | { name: string; from: string; to: string; label?: string }
  | { name: string; magnitude: number; angle: number | string; label?: string };

export type VectorDerived =
  | { name: string; sum: string[]; construction?: "parallelogram" | "head-to-tail"; label?: string }
  | { name: string; difference: [string, string]; label?: string }
  | { name: string; scale: string; factor: number; label?: string }
  | { decompose: string }
  | { name?: string; projection: { of: string; onto: string }; label?: string }
  | { name?: string; angleBetween: [string, string]; label?: string };

export type VectorItem = VectorTyped | VectorDerived;

export type VectorsInput = {
  title?: string;
  locale?: Locale;
  /** Named points, for a vector stated as `from`/`to`. */
  points?: PointDef[];
  vectors: VectorItem[];
  /**
   * false: the figure an exercise GIVES -- the typed vectors (with their names, and the points they run between) and
   * nothing derived from them: no sum, difference, multiple, projection, components or angle, and no printed magnitude
   * except where the magnitude was the datum. Default true.
   */
  answers?: boolean;
};

// ---- palette ------------------------------------------------------------

const PAPER = "#FCFBF7";
const INK = "#181B21";
const SOFT = "#4E5763";
const TYPED = "#1D4E89"; // blue -- a vector the author gave
const RESULT = "#B3400C"; // rust -- a sum, difference or scalar multiple
const PROJECTION = "#7A3E9D"; // violet -- a projection
const GUIDE = "#9AA3AE"; // grey -- a construction line, never itself a claim

// ---- geometry constants (canvas pixels; the plane carries no rotation) ----

const MARGIN = 56;
/** The margin round the vectors' bounding box, as a share of its larger side (1,4 for a box 5 across). */
const RANGE_PAD_SHARE = 0.28;
const PLOT_TARGET_PX = 440;
const CAPTION_LINE_H = 20;
/** An angle arc is 30% of its shorter arm, within these bounds. */
const ARC_MIN = 24;
const ARC_MAX = 56;
const RIGHT_ANGLE = 10;

// ---- pure helpers, exported for their own tests --------------------------

/** |(dx, dy)|, formatted pt-BR -- an exact, simplified root when one exists. */
export function magnitudeLabel(dx: number, dy: number, locale: Locale = "pt-BR"): string {
  return sqrtLabel(dx * dx + dy * dy, locale);
}

/** Is this measured number printed exactly, or rounded? */
function isExactAtHundredths(value: number): boolean {
  return Math.abs(value - Math.round(value * 100) / 100) <= 1e-9 * Math.max(1, Math.abs(value));
}

/**
 * The derivation a caption prints between a vector's name and its value,
 * or nothing when the name already IS that derivation: a sum named "u+v" is
 * not re-stated as "u+v = u + v", nor "AB" as "AB = AB".
 */
function derivation(name: string, expression: string): string {
  const bare = (s: string): string => s.replace(/\s+/g, "").replace(/−/g, "-");
  return bare(name) === bare(expression) ? "" : ` = ${expression}`;
}

/** The angle in degrees between (ax, ay) and (bx, by), 0..180. */
export function angleBetweenDegrees(ax: number, ay: number, bx: number, by: number): number {
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la === 0 || lb === 0) throw new SpecError("angleBetween: a zero vector has no direction");
  const cos = Math.min(1, Math.max(-1, (ax * bx + ay * by) / (la * lb)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** The projection of u = (ux, uy) onto v = (vx, vy), as components. */
export function projectComponents(ux: number, uy: number, vx: number, vy: number): { x: number; y: number } {
  const lenSq = vx * vx + vy * vy;
  if (lenSq === 0) throw new SpecError("projection: cannot project onto the zero vector");
  const k = (ux * vx + uy * vy) / lenSq;
  return { x: k * vx, y: k * vy };
}

/** "37°" or 37 -> 37, accepting a pt-BR comma. */
function parseAngle(raw: number | string, path: string): number {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) throw new SpecError(`${path} must be a finite number of degrees`);
    return raw;
  }
  const m = /^\s*([+-]?\d+(?:[.,]\d+)?)\s*(?:°|deg|graus)?\s*$/.exec(raw);
  if (m === null) throw new SpecError(`${path}: ${JSON.stringify(raw)} is not an angle -- write a number or "37°"`);
  return Number(m[1]!.replace(",", "."));
}

/**
 * A lattice step a student counts by: 1, 2 or 5 x 10^k at any magnitude, at most eight lines to a span. Where the
 * vectors are given in whole components (a span from 2 to 12) a step of 1 is kept rather than 0,5, so A = (−6, −6) never
 * falls between two gridlines.
 */
function gridStepFor(span: number): number {
  const step = niceStep(span, 8);
  return step < 1 && span >= 2 && span <= 12 ? 1 : step;
}

// ---- label placement: every label anchored to its own ink ------------------

/** Where along a shaft a name is tried, in order of preference (0 = tail). */
const NAME_TS = [0.55, 0.45, 0.65, 0.35, 0.75, 0.25, 0.8, 0.2, 0.85, 0.15, 0.9];
/** The magnitude prefers the half nearer the tail, where the name is not. */
const MAGNITUDE_TS = [0.35, 0.45, 0.25, 0.55, 0.65, 0.2, 0.75, 0.15, 0.8, 0.85, 0.9];
/** Extra distance off the shaft, beyond just clearing it, tried in turn. */
const OFFSETS = [0, 5, 10, 16];

/**
 * Candidate centres for a `w`×`h` label beside the straight shaft
 * `tail`→`head`: at each fraction `t` of its length, on either side, just
 * clear of the shaft (the box's half-extent along the shaft's normal, plus a
 * gap) and then a little further out. Nothing is ever tried anywhere else --
 * a label that cannot sit beside its own arrow does not go looking for room
 * beside someone else's.
 */
export function alongShaft(tail: Point, head: Point, w: number, h: number, ts: number[]): Point[] {
  return candidatesBeside(tail, head, w, h, ts, { gap: 5, extras: OFFSETS });
}

/**
 * Chooses a spot for each label among candidates beside its own ink, under
 * the rules the checks will hold the figure to -- measured the way they
 * measure, so a spot this accepts is one they pass:
 *
 *  - clear of every line (`text-clear-of-ink`) and every other label
 *    (`text-clear-of-other-boxes`);
 *  - nearer its own ink, from its centre, than any other ink or label
 *    (`annotation-nearest-its-owner`), with a few pixels to spare so a tie
 *    does not read as a coin toss;
 *  - never nearer an EARLIER label's centre than that label's own owner is
 *    -- a new label must not steal a placed one's claim.
 *
 * The first candidate meeting all of them wins, in the caller's order of
 * preference. When none does, the least-bad candidate is returned instead of
 * a search further afield: the label stays on its own shaft and the checks
 * report what is wrong with it.
 */
export class Placer {
  private ink: { owner: string; pts: Point[]; competes: boolean }[] = [];
  private boxes: { rect: Rect; competes: boolean }[] = [];
  private placed: { centre: Point; ownerDistance: number }[] = [];

  private readonly bounds: Rect;

  constructor(bounds: Rect) {
    this.bounds = bounds;
  }

  /** A line; `competes` false for grid furniture no check lets win "nearest". */
  addInk(owner: string, pts: Point[], competes = true): void {
    this.ink.push({ owner, pts, competes });
  }

  removeInk(owner: string): void {
    this.ink = this.ink.filter((line) => line.owner !== owner);
  }

  /** A box no label may enter; `competes` when it is itself a label. */
  reserve(rect: Rect, competes = false): void {
    this.boxes.push({ rect, competes });
  }

  /** How badly a `w`×`h` label naming `owner`, centred at `c`, breaks the rules. 0 is honest. */
  cost(owner: string, c: Point, w: number, h: number, margin: number): number {
    const box = { x: c.x - w / 2, y: c.y - h / 2, width: w, height: h };
    const b = this.bounds;
    if (box.x < b.x || box.y < b.y || box.x + w > b.x + b.width || box.y + h > b.y + b.height) return Infinity;
    const padded = { x: box.x - 2, y: box.y - 2, width: w + 4, height: h + 4 };
    let cost = 0;
    for (const line of this.ink) {
      for (let i = 0; i < line.pts.length - 1; i += 1) {
        if (segmentHitsRect(line.pts[i]!, line.pts[i + 1]!, padded)) {
          cost += 10;
          break;
        }
      }
    }
    for (const other of this.boxes) if (rectsMeet(box, other.rect, 3)) cost += 10;
    const own = this.ink.filter((line) => line.owner === owner);
    const toOwner = Math.min(...own.map((line) => distanceToPolyline(c, line.pts)));
    let rival = Infinity;
    for (const line of this.ink) {
      if (line.owner === owner || !line.competes) continue;
      rival = Math.min(rival, distanceToPolyline(c, line.pts));
    }
    for (const other of this.boxes) if (other.competes) rival = Math.min(rival, pointToRect(c, other.rect));
    if (rival < toOwner + margin) cost += rival < toOwner - 0.5 ? 5 : 1;
    for (const p of this.placed) if (pointToRect(p.centre, box) < p.ownerDistance + margin) cost += 5;
    return cost;
  }

  choose(owner: string, w: number, h: number, spots: Point[]): { centre: Point; cost: number } {
    // A clear margin first; then an exact tie, which the check accepts (a
    // projection lies ON the vector it projects onto, so every spot beside
    // it is as near one as the other); then the least bad.
    for (const margin of [4, 0]) {
      for (const c of spots) if (this.cost(owner, c, w, h, margin) === 0) return { centre: c, cost: 0 };
    }
    let best: { centre: Point; cost: number } = { centre: spots[0]!, cost: Infinity };
    for (const c of spots) {
      const cost = this.cost(owner, c, w, h, 0);
      if (cost < best.cost) best = { centre: c, cost };
    }
    return best;
  }

  commit(owner: string, c: Point, w: number, h: number): void {
    const own = this.ink.filter((line) => line.owner === owner);
    this.placed.push({ centre: c, ownerDistance: Math.min(...own.map((line) => distanceToPolyline(c, line.pts))) });
    this.boxes.push({ rect: { x: c.x - w / 2, y: c.y - h / 2, width: w, height: h }, competes: true });
  }
}

// ---- the build -------------------------------------------------------------

type Named = { dx: number; dy: number; tail: [number, number]; head: [number, number] };

type Reading = { id: string; text: string };

export function expandVectors(input: VectorsInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const answers = input.answers !== false;
  for (const [i, item] of (input.vectors ?? []).entries()) {
    const anyItem = item as Record<string, unknown>;
    const label = anyItem.label;
    if (typeof label === "string") {
      const typed = typedCoordinate(label);
      if (typed !== null) throw new SpecError(`vectors[${i}].label types the coordinate "${typed}" by hand`);
    }
  }

  const points = new Map<string, [number, number]>();
  for (const [i, p] of (input.points ?? []).entries()) {
    if (points.has(p.name)) throw new SpecError(`points[${i}].name "${p.name}" is already declared`);
    points.set(p.name, p.at);
  }

  const named = new Map<string, Named>();
  const bounds: [number, number][] = [[0, 0]];
  const touch = (p: [number, number]): void => {
    bounds.push(p);
  };
  // Every declared point is in view, whether or not a vector ends up using it.
  for (const p of points.values()) touch(p);

  // Drawing is deferred to a second pass (it needs the frame, which needs the
  // bounds), so this pass records what to draw as plain data.
  type VecDraw = {
    id: string;
    tail: [number, number];
    head: [number, number];
    colour: string;
    dashed?: boolean;
    labelText: string;
    guides?: { id: string; from: [number, number]; to: [number, number] }[];
    /** A sum, difference or multiple: what an exercise asks for, so `answers: false` leaves it out. */
    derived?: true;
    /** Print |v| beside the arrow: always with answers, and without them only where the magnitude was the datum. */
    givenMagnitude?: true;
  };
  type DecomposeDraw = { id: string; ref: string; tail: [number, number]; head: [number, number] };
  type ProjectionDraw = {
    id: string;
    tail: [number, number];
    head: [number, number];
    uHead: [number, number];
    labelText: string;
  };
  type AngleDraw = { id: string; a: [number, number]; b: [number, number]; degrees: number; labelText: string };

  let vecs: VecDraw[] = [];
  let decomposes: DecomposeDraw[] = [];
  let projections: ProjectionDraw[] = [];
  let angles: AngleDraw[] = [];
  let readings: Reading[] = [];

  const known = (name: string, path: string): Named => {
    v.knownId(name, new Set(named.keys()), path, "a vector");
    return named.get(name)!;
  };
  const declare = (name: string, path: string, entry: Named): void => {
    if (named.has(name)) throw new SpecError(`${path}: vector "${name}" is already declared`);
    named.set(name, entry);
  };

  (input.vectors ?? []).forEach((raw, i) => {
    const item = raw as Record<string, unknown>;
    const path = `vectors[${i}]`;
    const present = ["components", "from", "magnitude", "sum", "difference", "scale", "decompose", "projection", "angleBetween"].filter(
      (k) => item[k] !== undefined,
    );
    if (present.length !== 1) {
      throw new SpecError(
        `${path} must be exactly one of: components, {from, to}, {magnitude, angle}, sum, difference, ` +
          `{scale, factor}, decompose, projection, angleBetween -- found ${present.length === 0 ? "none" : present.join(" and ")}`,
      );
    }
    const [kind] = present;

    if (kind === "components") {
      const it = raw as { name: string; components: [number, number]; at?: [number, number]; label?: string };
      if (!Array.isArray(it.components) || it.components.length !== 2) {
        throw new SpecError(`${path}.components must be [x, y]`);
      }
      v.finite(it.components[0], `${path}.components[0]`);
      v.finite(it.components[1], `${path}.components[1]`);
      let tail: [number, number] = [0, 0];
      if (it.at !== undefined) {
        if (!Array.isArray(it.at) || it.at.length !== 2) throw new SpecError(`${path}.at must be [x, y]`);
        tail = [v.finite(it.at[0], `${path}.at[0]`), v.finite(it.at[1], `${path}.at[1]`)];
      }
      const head: [number, number] = [tail[0] + it.components[0], tail[1] + it.components[1]];
      declare(it.name, path, { dx: it.components[0], dy: it.components[1], tail, head });
      touch(tail);
      touch(head);
      vecs.push({ id: it.name, tail, head, colour: TYPED, labelText: it.label ?? it.name });
      readings.push({
        id: `${it.name}`,
        text: `${it.name} = ${formatPoint(it.components[0], it.components[1], locale)}${answers ? `, |${it.name}| = ${magnitudeLabel(it.components[0], it.components[1], locale)}` : ""}`,
      });
      return;
    }

    if (kind === "from") {
      const it = raw as { name: string; from: string; to: string; label?: string };
      if (it.to === undefined) throw new SpecError(`${path}.to is required alongside "from"`);
      v.knownId(it.from, new Set(points.keys()), `${path}.from`, "a point");
      v.knownId(it.to, new Set(points.keys()), `${path}.to`, "a point");
      const tail = points.get(it.from)!;
      const head = points.get(it.to)!;
      const dx = head[0] - tail[0];
      const dy = head[1] - tail[1];
      declare(it.name, path, { dx, dy, tail, head });
      touch(tail);
      touch(head);
      vecs.push({ id: it.name, tail, head, colour: TYPED, labelText: it.label ?? it.name });
      // Its components are the difference of two points' coordinates: computed, so no reading without answers.
      if (answers) {
        readings.push({
          id: `${it.name}`,
          text: `${it.name}${derivation(it.name, `${it.from}${it.to}`)} = ${formatPoint(dx, dy, locale)}, |${it.name}| = ${magnitudeLabel(dx, dy, locale)}`,
        });
      }
      return;
    }

    if (kind === "magnitude") {
      const it = raw as { name: string; magnitude: number; angle: number | string; label?: string };
      const mag = v.finite(it.magnitude, `${path}.magnitude`);
      if (mag <= 0) throw new SpecError(`${path}.magnitude must be positive, got ${mag}`);
      const deg = parseAngle(it.angle, `${path}.angle`);
      const rad = (deg * Math.PI) / 180;
      const dx = mag * Math.cos(rad);
      const dy = mag * Math.sin(rad);
      const tail: [number, number] = [0, 0];
      const head: [number, number] = [dx, dy];
      declare(it.name, path, { dx, dy, tail, head });
      touch(tail);
      touch(head);
      vecs.push({ id: it.name, tail, head, colour: TYPED, labelText: it.label ?? it.name, givenMagnitude: true });
      readings.push({
        id: `${it.name}`,
        text: `${it.name}: |${it.name}| = ${formatNumber(mag, locale)}, θ = ${formatNumber(deg, locale)}°${answers ? `, ${it.name} = ${formatPoint(dx, dy, locale)}` : ""}`,
      });
      return;
    }

    if (kind === "sum") {
      const it = raw as { name: string; sum: string[]; construction?: "parallelogram" | "head-to-tail"; label?: string };
      if (it.sum.length < 2) throw new SpecError(`${path}.sum needs at least two vectors`);
      const parts = it.sum.map((n) => known(n, `${path}.sum`));
      const dx = parts.reduce((s, p) => s + p.dx, 0);
      const dy = parts.reduce((s, p) => s + p.dy, 0);
      const tail: [number, number] = [0, 0];
      const head: [number, number] = [dx, dy];
      declare(it.name, path, { dx, dy, tail, head });
      touch(head);
      const guides: { id: string; from: [number, number]; to: [number, number] }[] = [];
      if (it.construction === "head-to-tail") {
        let running: [number, number] = [0, 0];
        it.sum.forEach((n, k) => {
          const p = parts[k]!;
          const next: [number, number] = [running[0] + p.dx, running[1] + p.dy];
          guides.push({ id: `${it.name}-g${k}`, from: running, to: next });
          touch(next);
          running = next;
        });
      } else if (it.construction === "parallelogram") {
        if (it.sum.length !== 2) throw new SpecError(`${path}.construction "parallelogram" needs exactly two vectors`);
        const [pa, pb] = parts as [Named, Named];
        const cornerA: [number, number] = [pa.dx + pb.dx, pa.dy + pb.dy];
        guides.push({ id: `${it.name}-g0`, from: [pa.dx, pa.dy], to: cornerA });
        guides.push({ id: `${it.name}-g1`, from: [pb.dx, pb.dy], to: cornerA });
        touch(cornerA);
      }
      vecs.push({ id: it.name, tail, head, colour: RESULT, labelText: it.label ?? it.name, guides, derived: true });
      readings.push({
        id: `${it.name}`,
        text: `${it.name}${derivation(it.name, it.sum.join(" + "))} = ${formatPoint(dx, dy, locale)}, |${it.name}| = ${magnitudeLabel(dx, dy, locale)}`,
      });
      return;
    }

    if (kind === "difference") {
      const it = raw as { name: string; difference: [string, string]; label?: string };
      if (!Array.isArray(it.difference) || it.difference.length !== 2) {
        throw new SpecError(`${path}.difference must be [a, b]`);
      }
      const a = known(it.difference[0], `${path}.difference[0]`);
      const b = known(it.difference[1], `${path}.difference[1]`);
      const dx = a.dx - b.dx;
      const dy = a.dy - b.dy;
      const tail: [number, number] = [0, 0];
      const head: [number, number] = [dx, dy];
      declare(it.name, path, { dx, dy, tail, head });
      touch(head);
      vecs.push({ id: it.name, tail, head, colour: RESULT, labelText: it.label ?? it.name, derived: true });
      readings.push({
        id: `${it.name}`,
        text: `${it.name}${derivation(it.name, `${it.difference[0]} − ${it.difference[1]}`)} = ${formatPoint(dx, dy, locale)}, |${it.name}| = ${magnitudeLabel(dx, dy, locale)}`,
      });
      return;
    }

    if (kind === "scale") {
      const it = raw as { name: string; scale: string; factor: number; label?: string };
      const factor = v.finite(it.factor, `${path}.factor`);
      if (factor === 0) throw new SpecError(`${path}.factor must not be zero -- that is not a vector`);
      const base = known(it.scale, `${path}.scale`);
      const dx = factor * base.dx;
      const dy = factor * base.dy;
      const tail: [number, number] = [0, 0];
      const head: [number, number] = [dx, dy];
      declare(it.name, path, { dx, dy, tail, head });
      touch(head);
      vecs.push({ id: it.name, tail, head, colour: RESULT, labelText: it.label ?? it.name, derived: true });
      readings.push({
        id: `${it.name}`,
        text: `${it.name}${derivation(it.name, `${formatNumber(factor, locale)}${it.scale}`)} = ${formatPoint(dx, dy, locale)}, |${it.name}| = ${magnitudeLabel(dx, dy, locale)}`,
      });
      return;
    }

    if (kind === "decompose") {
      const it = raw as { decompose: string };
      const ref = known(it.decompose, `${path}.decompose`);
      const id = `${it.decompose}-decompose`;
      decomposes.push({ id, ref: it.decompose, tail: ref.tail, head: ref.head });
      touch([ref.head[0], ref.tail[1]]);
      readings.push({
        id: `${id}`,
        text: `${it.decompose} = ${formatNumber(ref.dx, locale)}î ${ref.dy < 0 ? "−" : "+"} ${formatNumber(Math.abs(ref.dy), locale)}ĵ`,
      });
      return;
    }

    if (kind === "projection") {
      const it = raw as { name?: string; projection: { of: string; onto: string }; label?: string };
      const o = v.object(it.projection, `${path}.projection`);
      const ofName = v.requiredString(o, "of", `${path}.projection`);
      const ontoName = v.requiredString(o, "onto", `${path}.projection`);
      const u = known(ofName, `${path}.projection.of`);
      const w = known(ontoName, `${path}.projection.onto`);
      const proj = projectComponents(u.dx, u.dy, w.dx, w.dy);
      const tail: [number, number] = [0, 0];
      const head: [number, number] = [proj.x, proj.y];
      // proj with its axis as a real subscript (ADR 0062); rich() reads the mark.
      const label = it.name ?? `proj_{${ontoName}}(${ofName})`;
      const id = it.name ?? `proj-${ofName}-${ontoName}`;
      if (it.name !== undefined) declare(it.name, path, { dx: proj.x, dy: proj.y, tail, head });
      touch(head);
      projections.push({ id, tail, head, uHead: [u.dx, u.dy], labelText: it.label ?? label });
      readings.push({
        id: `${id}`,
        text: `${label} = ${formatPoint(proj.x, proj.y, locale)}, |${label}| = ${magnitudeLabel(proj.x, proj.y, locale)}`,
      });
      return;
    }

    // angleBetween
    {
      const it = raw as { name?: string; angleBetween: [string, string]; label?: string };
      if (!Array.isArray(it.angleBetween) || it.angleBetween.length !== 2) {
        throw new SpecError(`${path}.angleBetween must be [a, b]`);
      }
      const a = known(it.angleBetween[0], `${path}.angleBetween[0]`);
      const b = known(it.angleBetween[1], `${path}.angleBetween[1]`);
      const degrees = angleBetweenDegrees(a.dx, a.dy, b.dx, b.dy);
      const id = it.name ?? `angle-${it.angleBetween[0]}-${it.angleBetween[1]}`;
      angles.push({
        id,
        a: [a.dx, a.dy],
        b: [b.dx, b.dy],
        degrees,
        labelText: it.label ?? `${measuredLabel(degrees, locale)}°`,
      });
      readings.push({
        id: `${id}`,
        text: `ângulo(${it.angleBetween[0]}, ${it.angleBetween[1]}) ${isExactAtHundredths(degrees) ? "=" : "≈"} ${measuredLabel(degrees, locale)}°`,
      });
    }
  });

  if (named.size === 0 && vecs.length === 0) throw new SpecError("vectors: at least one vector must be given or derived");

  // ---- answers: false -----------------------------------------------------
  // Everything derived was needed above (to bound the frame, so the question's plane is the answer's plane, and to
  // resolve names); none of it is drawn or printed. What stays is what was typed.
  if (!answers) {
    vecs = vecs.filter((vec) => vec.derived !== true);
    decomposes = [];
    projections = [];
    angles = [];
    const kept = new Set(vecs.map((vec) => vec.id));
    readings = readings.filter((r) => kept.has(r.id));
  }

  // ---- frame ---------------------------------------------------------------

  const xs = bounds.map((p) => p[0]);
  const ys = bounds.map((p) => p[1]);
  // The margin and the unit follow the vectors' own extent, so (3000; 4000) and (0,02; 0,03) are drawn as large as (3; 4).
  const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  const pad = RANGE_PAD_SHARE * extent;
  const xMin = Math.min(...xs) - pad;
  const xMax = Math.max(...xs) + pad;
  const yMin = Math.min(...ys) - pad;
  const yMax = Math.max(...ys) + pad;
  const spanX = xMax - xMin;
  const spanY = yMax - yMin;
  const { xUnit: unit } = fitUnits(spanX, spanY, { targetWidth: PLOT_TARGET_PX, targetHeight: PLOT_TARGET_PX, equal: true });
  const gridStep = gridStepFor(Math.max(spanX, spanY));

  const plotWidth = Math.ceil(MARGIN * 2 + spanX * unit);
  const plotHeight = Math.ceil(MARGIN * 2 + spanY * unit);
  // One reading a line, never wrapped: a pair parted across lines reads wrong.
  const readingPanel = layoutPanel(
    readings.map((r) => ({ text: r.text, id: r.id, wrap: false })),
    { width: Infinity, size: 13, lineHeight: CAPTION_LINE_H, emphasis: "soft" },
  );
  const captionHeight = readingPanel.empty ? 0 : readingPanel.height + 18;
  const width = plotWidth;
  const height = plotHeight + captionHeight;

  // The grid numbers its own ticks in this figure's locale (ADR 0034): "2,5"
  // and "−4", the spelling every other number here already has.
  const grid: GridSpec = {
    x: { from: xMin, to: xMax, step: gridStep, origin: 0 },
    y: { from: yMin, to: yMax, step: gridStep, origin: 0 },
    locale,
  };
  const frame: Frame & { origin: Point } = {
    id: "plane",
    origin: { x: MARGIN - xMin * unit, y: MARGIN + yMax * unit },
    xUnit: unit,
    yUnit: unit,
    grid,
  };

  const at = (p: [number, number]): Point => resolveInFrame(frame, p[0], p[1]);

  const board = new Board(width, height, PAPER);
  board.frames.push(frame);
  const placer = new Placer({ x: 12, y: 8, width: width - 24, height: plotHeight - 12 });
  // The grid's own tick numbers are furniture the frame resolver adds AFTER
  // this preset returns, so nothing here has seen them yet. Their first-
  // choice spots come from the resolver's own plan (`tickPlan`), not a copy
  // of its arithmetic, so a vector label never lands where a number goes.
  for (const t of tickPlan(frame, grid)) {
    const b = t.spots[0]!.box;
    board.reserve(b.x + b.width / 2, b.y + b.height / 2, b.width, b.height);
    placer.reserve(b);
  }
  // The axes are grid furniture -- no check lets them compete for "nearest"
  // -- but a label printed across one is still unreadable, so they are ink
  // to keep off.
  const axisX = [at([xMin, 0]), at([xMax, 0])];
  const axisY = [at([0, yMin]), at([0, yMax])];
  board.trace(axisX, "#8A93A3", 2, "axis-x");
  board.trace(axisY, "#8A93A3", 2, "axis-y");
  placer.addInk("plane-axis-x", axisX, false);
  placer.addInk("plane-axis-y", axisY, false);

  const connectors: Connector[] = [];

  // Endpoints are stated IN THE FRAME (`{frame: "plane", x, y}`), not
  // resolved to canvas points here, so a straight run whose both ends share
  // this frame keeps its scale through resolution as `Connector.measuredIn`
  // (ADR 0028) -- which is what lets a numeric label that `annotates` it be
  // checked by `length-matches-its-label` against the frame's own unit.
  const framed = (p: [number, number]): FramedPoint => ({ frame: frame.id, x: p[0], y: p[1] });

  const drawArrow = (id: string, tail: [number, number], head: [number, number], colour: string, dashed = false): void => {
    connectors.push({
      id,
      from: framed(tail),
      to: framed(head),
      arrow: "end",
      stroke: colour,
      strokeWidth: dashed ? 1.6 : 2.2,
      ...(dashed ? { lineStyle: "dashed" as const } : {}),
    });
    board.trace([at(tail), at(head)], colour, dashed ? 1.6 : 2.2, id);
    placer.addInk(id, [at(tail), at(head)]);
  };

  // ---- every piece of ink first ----------------------------------------
  //
  // A label is placed only once ALL the ink is down. Placing each vector's
  // labels as it was drawn let an early label settle where a later arrow then
  // ran, and the label search -- which walked up to 150px from its anchor to
  // find room -- carried names and magnitudes beside the wrong arrow.

  for (const vec of vecs) {
    drawArrow(vec.id, vec.tail, vec.head, vec.colour);
    for (const guide of vec.guides ?? []) drawArrow(guide.id, guide.from, guide.to, GUIDE, true);
  }
  for (const d of decomposes) {
    const elbow: [number, number] = [d.head[0], d.tail[1]];
    drawArrow(`${d.id}-x`, d.tail, elbow, GUIDE, true);
    drawArrow(`${d.id}-y`, elbow, d.head, GUIDE, true);
  }
  for (const p of projections) {
    drawArrow(p.id, p.tail, p.head, PROJECTION);
    const headC = at(p.head);
    const tailC = at(p.tail);
    const uHeadC = at(p.uHead);
    // Perpendicular guide from u's head to the foot, and a right-angle mark
    // there -- the standard small-square glyph, its two free corners set back
    // from the vertex by RIGHT_ANGLE along each edge so it never overlaps the
    // lines it names.
    drawArrow(`${p.id}-guide`, p.uHead, p.head, GUIDE, true);
    const pdir = { x: headC.x - tailC.x, y: headC.y - tailC.y };
    const plen = Math.hypot(pdir.x, pdir.y) || 1;
    const e1 = { x: pdir.x / plen, y: pdir.y / plen }; // along v, towards the foot
    let e2 = { x: -e1.y, y: e1.x }; // perpendicular, towards u's head
    const toU = { x: uHeadC.x - headC.x, y: uHeadC.y - headC.y };
    if (e2.x * toU.x + e2.y * toU.y < 0) e2 = { x: -e2.x, y: -e2.y };
    const p1: Point = { x: headC.x - e1.x * RIGHT_ANGLE, y: headC.y - e1.y * RIGHT_ANGLE };
    const p2: Point = { x: p1.x + e2.x * RIGHT_ANGLE, y: p1.y + e2.y * RIGHT_ANGLE };
    const p3: Point = { x: headC.x + e2.x * RIGHT_ANGLE, y: headC.y + e2.y * RIGHT_ANGLE };
    board.poly([p1, p2, p3], { stroke: INK, width: 1.2, id: `${p.id}-right-angle` });
    placer.addInk(`${p.id}-right-angle`, [p1, p2, p3]);
  }

  // ---- then every label, each anchored to its own ink --------------------

  // Named points (A, B, ...) get a label that names the PLACE itself, not
  // any drawn element (ADR 0028's `Block.annotatesPlace`). Placed before the
  // vector labels now that every line is already down: a place label must
  // sit within a few px of its point (`label-nearest-its-place`), while a
  // vector's label can slide anywhere along its own shaft. No decorative dot
  // is drawn at the place itself -- the vector ends already mark it.
  for (const [name, p] of points) {
    const c = at(p);
    const block = board.place(name, c.x, c.y - 14, [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }], {
      size: 13,
      weight: 700,
      colour: INK,
      // Three 6px steps: a bold capital in the bundled face is ~9px wide, so its
      // box clears a vertical shaft only from the third (ADR 0063).
      steps: 3,
    });
    block.annotatesPlace = framed(p);
    placer.reserve({ x: block.x!, y: block.y!, width: block.width!, height: block.height! }, true);
  }

  // Angle marks come first among the labels: an arc's radius is chosen
  // TOGETHER with its label (below), so every other label must already see
  // the arc it ends up drawn at.
  for (const a of angles) {
    const centreC = at([0, 0]);
    const lenA = Math.hypot(a.a[0], a.a[1]) || 1;
    const lenB = Math.hypot(a.b[0], a.b[1]) || 1;
    // Direction in canvas space: y is flipped relative to math space, and the
    // frame carries no rotation, so (dx, dy) -> (dx, -dy) is exact.
    const dirA = { x: a.a[0] / lenA, y: -a.a[1] / lenA };
    const dirB = { x: a.b[0] / lenB, y: -a.b[1] / lenB };
    const angA = Math.atan2(dirA.y, dirA.x);
    let delta = Math.atan2(dirB.y, dirB.x) - angA;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    const arcAt = (radius: number): Point[] =>
      Array.from({ length: 17 }, (_, k) => {
        const t = angA + (delta * k) / 16;
        return { x: centreC.x + radius * Math.cos(t), y: centreC.y + radius * Math.sin(t) };
      });
    const style = { size: 13, weight: 600, colour: INK };
    const { w, h } = board.extent(a.labelText, style);
    // The value sits just outside the arc, inside the angle. A point there
    // is r·sin(offset) from each arm, so the radius is what makes room: it
    // starts at 30% of the shorter arm and grows (to 75%) until some spot
    // inside the angle is nearer the arc than any arm -- a third vector
    // running through the angle, as a parallelogram's diagonal does, leaves
    // only a narrow wedge on either side of it, and only a wider arc gives a
    // label room in one of them.
    const shorter = Math.min(lenA, lenB) * unit;
    const radii: number[] = [];
    for (let r = Math.max(ARC_MIN, Math.min(ARC_MAX, 0.3 * shorter)); r <= Math.max(ARC_MIN, 0.75 * shorter); r += 8) radii.push(r);
    let chosen: { radius: number; centre: Point; cost: number } | undefined;
    for (const radius of radii) {
      placer.addInk(a.id, arcAt(radius));
      const spots: Point[] = [];
      for (const extra of [0, 4, 8]) {
        for (const f of [0, 0.2, -0.2, 0.4, -0.4, 0.55, -0.55, 0.7, -0.7]) {
          const t = angA + delta / 2 + (f * delta) / 2;
          const u = { x: Math.cos(t), y: Math.sin(t) };
          const reach = Math.abs(u.x) * (w / 2) + Math.abs(u.y) * (h / 2);
          const r = radius + reach + 4 + extra;
          spots.push({ x: centreC.x + u.x * r, y: centreC.y + u.y * r });
        }
      }
      const best = placer.choose(a.id, w, h, spots);
      placer.removeInk(a.id);
      if (chosen === undefined || best.cost < chosen.cost) chosen = { radius, ...best };
      if (best.cost === 0) break;
    }
    const radius = chosen!.radius;
    const arcPts = arcAt(radius);
    connectors.push({
      id: a.id,
      from: arcPts[0]!,
      to: arcPts[arcPts.length - 1]!,
      curve: { kind: "sweep", centre: centreC },
      arrow: "none",
      stroke: INK,
      strokeWidth: 1.4,
    });
    board.trace(arcPts, INK, 1.4, a.id);
    placer.addInk(a.id, arcPts);
    const block = board.label(a.labelText, chosen!.centre.x, chosen!.centre.y, { ...style, width: w, fill: PAPER });
    block.annotates = a.id;
    placer.commit(a.id, chosen!.centre, w, h);
  }


  const put = (owner: string, marked: string, style: LabelOptions, spots: Point[]): void => {
    const runs = rich(marked);
    const text = runsText(runs);
    const { w, h } = board.extent(text, style);
    const best = placer.choose(owner, w, h, spots);
    // No honest spot: rather than wander off to wherever there is room, which
    // is how names ended up beside the wrong arrow, the label keeps its
    // least-bad spot ON its own shaft and the checks say what is wrong with
    // it (`annotation-nearest-its-owner`, `text-clear-of-ink`).
    const block = board.label(text, best.centre.x, best.centre.y, { ...style, width: w, fill: PAPER });
    if (hasScripts(runs)) block.runs = runs;
    block.annotates = owner;
    placer.commit(owner, best.centre, w, h);
  };

  const arrowLabels = (id: string, tail: Point, head: Point, name: string | undefined, magnitudeText: string | undefined, colour: string) => {
    if (name !== undefined) {
      const style = { size: 14, weight: 700, colour };
      const { w, h } = board.extent(name, style);
      put(id, name, style, alongShaft(tail, head, w, h, NAME_TS));
    }
    if (magnitudeText !== undefined) {
      const style = { size: 11, colour };
      const { w, h } = board.extent(magnitudeText, style);
      put(id, magnitudeText, style, alongShaft(tail, head, w, h, MAGNITUDE_TS));
    }
  };

  // Shortest arrow first: a short shaft has the fewest honest spots beside
  // it, and a long one can always move further along itself. Every name
  // goes down before any magnitude, since a name is what says whose arrow
  // it is.
  const arrowsToLabel = [
    ...vecs.map((vec) => ({
      id: vec.id,
      tail: at(vec.tail),
      head: at(vec.head),
      name: vec.labelText,
      // The magnitude, printed as a plain decimal (not the exact-root form
      // the readings panel uses) so `length-matches-its-label` can read it
      // as a number and check it against the arrow's own length.
      magnitude: answers || vec.givenMagnitude === true ? measuredLabel(Math.hypot(vec.head[0] - vec.tail[0], vec.head[1] - vec.tail[1]), locale) : undefined,
      colour: vec.colour,
    })),
    ...projections.map((p) => ({ id: p.id, tail: at(p.tail), head: at(p.head), name: p.labelText, magnitude: undefined, colour: PROJECTION })),
  ].sort((a, b) => Math.hypot(a.head.x - a.tail.x, a.head.y - a.tail.y) - Math.hypot(b.head.x - b.tail.x, b.head.y - b.tail.y));
  for (const arrow of arrowsToLabel) arrowLabels(arrow.id, arrow.tail, arrow.head, arrow.name, undefined, arrow.colour);
  for (const arrow of arrowsToLabel) {
    if (arrow.magnitude !== undefined) arrowLabels(arrow.id, arrow.tail, arrow.head, undefined, arrow.magnitude, arrow.colour);
  }

  for (const d of decomposes) {
    const elbow: [number, number] = [d.head[0], d.tail[1]];
    const style = { size: 12, colour: SOFT };
    const dxText = formatNumber(d.head[0] - d.tail[0], locale);
    const dyText = formatNumber(d.head[1] - d.tail[1], locale);
    const dxSize = board.extent(dxText, style);
    const dySize = board.extent(dyText, style);
    put(`${d.id}-x`, dxText, style, alongShaft(at(d.tail), at(elbow), dxSize.w, dxSize.h, NAME_TS));
    put(`${d.id}-y`, dyText, style, alongShaft(at(elbow), at(d.head), dySize.w, dySize.h, NAME_TS));
  }

  // Readings panel, below the plane -- a caption line per named or computed
  // quantity, each the same formatted text a reader would write by hand.
  readingPanel.draw(board, { left: MARGIN, top: plotHeight + 2, cut: plotHeight });

  const spec = board.spec(input.title ?? "vetores no plano");
  const scene = spec.root as Scene;
  scene.connectors = connectors;
  spec.canvas = {
    ...spec.canvas,
    constraints: { allowOverlap: true, allowConnectorCrossing: true, allowCurvedConnectors: true },
  };
  return parseSpec(spec);
}

// ---- validation ------------------------------------------------------------

export function validateVectorsInput(raw: Record<string, unknown>): void {
  const path = "vectors";
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  if (raw.points !== undefined) {
    v.array(raw, "points", path, "points").forEach((p, i) => {
      const o = v.object(p, `${path}.points[${i}]`);
      v.requiredString(o, "name", `${path}.points[${i}]`);
      const at = o.at;
      if (!Array.isArray(at) || at.length !== 2) {
        throw new SpecError(`${path}.points[${i}].at must be [x, y]`);
      }
      v.finite(at[0], `${path}.points[${i}].at[0]`);
      v.finite(at[1], `${path}.points[${i}].at[1]`);
    });
  }
  v.nonEmptyArray(raw, "vectors", path, "vectors").forEach((raw2, i) => {
    const item = v.object(raw2, `${path}.vectors[${i}]`);
    const ip = `${path}.vectors[${i}]`;
    v.optionalString(item, "label", ip);
    if (item.components !== undefined) {
      v.requiredString(item, "name", ip);
    } else if (item.from !== undefined) {
      v.requiredString(item, "name", ip);
      v.requiredString(item, "from", ip);
      v.requiredString(item, "to", ip);
    } else if (item.magnitude !== undefined) {
      v.requiredString(item, "name", ip);
      v.requiredNumber(item, "magnitude", ip);
      if (typeof item.angle !== "number" && typeof item.angle !== "string") {
        throw new SpecError(`${ip}.angle must be a number of degrees or a string like "37°"`);
      }
    } else if (item.sum !== undefined) {
      v.requiredString(item, "name", ip);
      v.nonEmptyArray(item, "sum", ip, "vector names");
      if (item.construction !== undefined) v.optionalEnum(item, "construction", ip, ["parallelogram", "head-to-tail"]);
    } else if (item.difference !== undefined) {
      v.requiredString(item, "name", ip);
      v.array(item, "difference", ip, "two vector names");
    } else if (item.scale !== undefined) {
      v.requiredString(item, "name", ip);
      v.requiredString(item, "scale", ip);
      v.requiredNumber(item, "factor", ip);
    } else if (item.decompose !== undefined) {
      v.requiredString(item, "decompose", ip);
    } else if (item.projection !== undefined) {
      const o = v.object(item.projection, `${ip}.projection`);
      v.requiredString(o, "of", `${ip}.projection`);
      v.requiredString(o, "onto", `${ip}.projection`);
      v.optionalString(item, "name", ip);
    } else if (item.angleBetween !== undefined) {
      v.array(item, "angleBetween", ip, "two vector names");
      v.optionalString(item, "name", ip);
    } else {
      throw new SpecError(
        `${ip} must be exactly one of: components, {from, to}, {magnitude, angle}, sum, difference, ` +
          `{scale, factor}, decompose, projection, angleBetween`,
      );
    }
  });
  // Arithmetic, references and shape agreement are all exercised by actually
  // building the figure -- the same discipline sign-chart's validator uses,
  // because a second, hand-written shadow of this logic is a second place
  // for the two to drift.
  expandVectors(raw as unknown as VectorsInput);
}
