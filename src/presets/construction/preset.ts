/**
 * construction -- plane geometry and Geometria Analítica, derived, never typed.
 *
 * A figure is a list of NAMED objects, each defined from objects named before
 * it: free points (`{"A": [0, 0]}` -- the only coordinates an author types),
 * then midpoints, intersections, feet of perpendiculars, reflections,
 * rotations and triangle centres; lines, segments and rays through points,
 * perpendiculars, parallels, bisectors and tangents; circles by centre and
 * radius, through a point, through three points, inscribed; polygons; and the
 * three conics drawn ANALYTICALLY from their defining elements (foci and a,
 * focus and directrix). Every construction is one call into the shared vector
 * algebra (`src/geometry/vec.ts`, ADR 0043), so an intersection here and an
 * intersection in the R³ layer round the same way.
 *
 * Annotations are derived too: a length label prints the length of the run it
 * sits beside (stated in the plane's frame, so ADR 0028's
 * `length-matches-its-label` measures it against the drawing); an angle mark
 * is a sweep whose arms are the two sides, and its degrees are computed from
 * them (so `sweep-matches-its-label` measures it); a 90° angle is drawn as a
 * right-angle square instead; equal-length ticks are refused on sides that
 * are not equal; a point's name `annotatesPlace` the point (ADR 0028/0035).
 * What the drawing cannot say exactly -- √13 beside a line drawn 3,61 long, a
 * conic's canonical equation -- goes to a readings panel under the plane.
 *
 * Refusals are by name: an undefined object, two parallel lines asked to
 * meet, circles that do not meet, a degenerate triangle, a focus on its own
 * directrix. A construction that cannot be carried out is never drawn
 * approximately.
 */

import type { Block, Connector, FigureSpec, Frame, FramedPoint, GridSpec, Mark, MarkSegment, Point, Scene } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { resolveInFrame, tickPlan } from "../../ir/frames.ts";
import { LOCALES, MINUS, asFraction, formatNumber, formatPoint } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import * as vec from "../../geometry/vec.ts";
import type { Circle2, Line2, Vec2 } from "../../geometry/vec.ts";
import { constantValue } from "../../math/expr.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";
import { layoutPanel } from "../shared/panel.ts";
import { typedCoordinate } from "../function-graph/preset.ts";
import { measuredLabel, sqrtLabel, writeSnapped } from "../../locale/write.ts";
import { fitUnits, niceStep } from "../shared/scale.ts";
import { Placer, aroundPoint, besidePolyline, besideRun } from "./place.ts";
import {
  TAU,
  annularSectorPieces,
  arcPoint,
  arrowHead,
  beltGeometry,
  chainGap,
  dimensionGeometry,
  hatchLines,
  pieceEnd,
  pieceStart,
  piecesArcLength,
  piecesArea,
  ringOutline,
  sampleArc,
  samplePieces,
  sectorPieces,
  semicirclePieces,
} from "./shapes.ts";
import type { BeltGeometry, Piece } from "./shapes.ts";
import type { Claim } from "./place.ts";
import { rectAt } from "../../geometry/hit.ts";

// ---- input ------------------------------------------------------------------

/** One named object. Loosely typed: `validateConstructionInput` and the build check every field. */
export type ConstructionItem = Record<string, unknown>;

export type ConstructionAnnotation =
  | { length: string | [string, string]; name?: string; given?: boolean }
  | { angle: [string, string, string] | string; name?: string; given?: boolean }
  | { equal: (string | [string, string])[] }
  | { equation: string }
  | { area: string; name?: string; given?: boolean }
  | { arc: string; name?: string; given?: boolean }
  | { radius: string; which?: "inner" | "outer"; at?: number; name?: string; given?: boolean };

export type ConstructionInput = {
  title?: string;
  locale?: Locale;
  /** Draw a numbered grid with axes (Geometria Analítica). Default false: pure plane geometry. */
  axes?: boolean;
  /** Tick every set of drawn segments and polygon sides that come out equal. Default false. */
  equalTicks?: boolean;
  /**
   * The unit lengths are in ("m", "cm"). Printed after every length, on the
   * drawing and in the panel, and set on the frame so length-matches-its-label
   * compares units as well as numbers (ADR 0028). Default: none.
   */
  unit?: string;
  /**
   * false: the figure an exercise GIVES. The construction stays -- it is what the statement draws -- and every measured
   * number goes: lengths (a length named `name` prints just that name), angle values (a named angle keeps its name, an
   * unnamed one is marked "?"), the readings panel, the computed pair of a point that is not free. An object with
   * `"answer": true` is not drawn at all, with its labels and every annotation on it. Default true.
   */
  answers?: boolean;
  /** An unnumbered square lattice under the figure (ADR 0067): `true` for unit cells, or `{ "step": 2 }`. Not with `axes`. */
  grid?: boolean | { step?: number };
  objects: ConstructionItem[];
  annotations?: ConstructionAnnotation[];
};

// ---- palette ----------------------------------------------------------------

const PAPER = "#FCFBF7";
const INK = "#181B21";
const SOFT = "#4E5763";
const LINE = "#1D4E89"; // blue: a line, ray or other unbounded construction line
const CIRCLE = "#6B3FA0"; // violet: a circle
const CONIC = "#9A3508"; // rust: a conic (dark enough to be read as text over a gridline, 5,3:1)
const GUIDE = "#6B7480"; // grey: auxiliary (dashed), asymptotes
const UNKNOWN = "#B3261E"; // red: an angle named rather than measured -- the unknown an exercise asks for

// ---- geometry constants (canvas px) ------------------------------------------

const MARGIN = 52;
const PLOT_TARGET_PX = 460;
const CAPTION_LINE_H = 21;
const DOT_R = 3.2;
const RIGHT_ANGLE_PX = 11;
const TICK_HALF = 6;
const TOL = 1e-9;
const TICK_ROOM_PX = 48;
/** Divisions to an axis, at most, when the plane is numbered. */
const AXIS_TICKS = 10;

// ---- word-problem pictograms (ADR 0047) --------------------------------------
// Decoration derived from already-computed geometry: a segment or a point an
// author named earlier. No pictogram adds a coordinate of its own.
const HATCH_GAP = 14;
const HATCH_LEN = 9;
const RAIL_GAP = 7;
const RUNG_GAP = 26;

// ---- the model -------------------------------------------------------------

type Style = {
  colour: string;
  width: number;
  dashed: boolean;
  hidden: boolean;
  /** Hidden because `answers: false` met `"answer": true`: still computed, still bounds the view, never drawn or annotated. */
  withheld?: true;
};

export type Extent = { kind: "line" } | { kind: "ray"; from: Vec2 } | { kind: "segment"; a: Vec2; b: Vec2 };

export type Conic =
  | { type: "ellipse"; center: Vec2; a: number; b: number; axis: Vec2; foci: [Vec2, Vec2] }
  | { type: "hyperbola"; center: Vec2; a: number; b: number; axis: Vec2; foci: [Vec2, Vec2] }
  | { type: "parabola"; focus: Vec2; vertex: Vec2; p: number; axis: Vec2; directrix: Line2 };

/**
 * A scene pictogram (ADR 0047): decoration standing on a named object,
 * never a new coordinate. `SegmentPicto` decorates a drawn segment -- a
 * ladder's rails follow it, a pole's height IS its length. `PointPicto`
 * decorates a point already placed by some earlier construction (the sun,
 * a boat at the foot of a computed sight line).
 */
const SEGMENT_PICTOS = ["ground", "wall", "ladder", "ramp", "pole", "tree", "person", "building"] as const;
const POINT_PICTOS = ["sun", "boat"] as const;
export type SegmentPicto = (typeof SEGMENT_PICTOS)[number];
export type PointPicto = (typeof POINT_PICTOS)[number];

/** A hatch over a region (ADR 0067): parallel lines `gap` pixels apart at `angle` degrees, in `colour` (the object's own when null). */
export type HatchSpec = { angle: number; gap: number; colour: string | null };

/** What an extension shape is, computed from the objects it names -- radii, angles and boundaries in plane units, angles in radians. */
export type ShapeData =
  | { shape: "sector"; c: Vec2; r: number; a0: number; span: number }
  | { shape: "ring"; c: Vec2; rIn: number; rOut: number; a0?: number; span?: number }
  | { shape: "semicircle"; a: Vec2; b: Vec2; side: 1 | -1; c: Vec2; r: number }
  | { shape: "belt"; c1: Circle2; c2: Circle2; mode: "external" | "crossed"; geo: BeltGeometry; touch: string[] }
  | { shape: "region"; pieces: Piece[] }
  | { shape: "path"; names: string[]; pts: Vec2[]; closed: boolean; arrows: "each" | "end" | "none" }
  | { shape: "dimension"; a: Vec2; b: Vec2; offset: number; side: 1 | -1; names: [string, string] }
  | { shape: "axis"; p: Vec2; q: Vec2; extend: number; arrows: "both" | "first" | "last" | "none"; turn: 1 | -1 };

export type ConstructionObject =
  | { kind: "point"; name: string; p: Vec2; style: Style; dot: boolean; label: string | null; coords: boolean; free?: true; picto?: PointPicto }
  | { kind: "linear"; name: string; line: Line2; extent: Extent; ends?: [string, string]; style: Style; label: string | null; picto?: SegmentPicto; side?: 1 | -1 }
  | { kind: "circle"; name: string; circle: Circle2; style: Style; label: string | null; fill?: string | null; hatch?: HatchSpec | null }
  | { kind: "polygon"; name: string; vertices: string[]; pts: Vec2[]; fill: string | null; style: Style; hatch?: HatchSpec | null }
  | { kind: "shape"; name: string; data: ShapeData; style: Style; label: string | null; fill: string | null; hatch: HatchSpec | null; given: boolean }
  | { kind: "conic"; name: string; conic: Conic; style: Style; show: Set<string>; label: string | null; focusNames?: [string, string] };

const POINT_KINDS = [
  "at",
  "midpoint",
  "intersection",
  "foot",
  "onCircle",
  "reflection",
  "rotation",
  "centroid",
  "incenter",
  "circumcenter",
  "orthocenter",
] as const;
const LINEAR_KINDS = ["segment", "line", "ray", "perpendicular", "parallel", "perpendicularBisector", "angleBisector", "tangent"] as const;
const CIRCLE_KINDS = ["circle", "circumcircle", "incircle"] as const;
const OTHER_KINDS = ["polygon", "ellipse", "hyperbola", "parabola"] as const;
/** The extension shapes of ADR 0067. */
const SHAPE_KINDS = ["sector", "ring", "belt", "semicircle", "region", "path", "dimension", "rotationAxis"] as const;
const ALL_KINDS: readonly string[] = [...POINT_KINDS, ...LINEAR_KINDS, ...CIRCLE_KINDS, ...OTHER_KINDS, ...SHAPE_KINDS];
const OPTION_KEYS = new Set(["name", "label", "hidden", "dashed", "colour", "draw", "which", "other", "fill", "show", "dot", "coords", "touch", "focusNames", "picto", "side", "answer", "hatch", "given"]);

/** `raw.hatch` read: `true` is 45° at 7 px; an object sets `angle` (degrees), `gap` (px) and `colour`. */
function hatchOf(raw: unknown, path: string): HatchSpec | null {
  if (raw === undefined || raw === false) return null;
  if (raw === true) return { angle: 45, gap: 7, colour: null };
  const o = v.object(raw, path);
  const angle = o.angle === undefined ? 45 : v.finite(o.angle, `${path}.angle`);
  const gap = o.gap === undefined ? 7 : v.finite(o.gap, `${path}.gap`);
  if (!(gap >= 3 && gap <= 40)) throw new SpecError(`${path}.gap is a gap in pixels, from 3 to 40, got ${gap}`);
  if (o.colour !== undefined && typeof o.colour !== "string") throw new SpecError(`${path}.colour must be a colour string`);
  return { angle, gap, colour: typeof o.colour === "string" ? o.colour : null };
}

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** `raw.picto` checked against the list a kind of object allows, or `undefined` when none was asked. */
function checkedPicto<T extends string>(raw: unknown, allowed: readonly T[], path: string): T | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !(allowed as readonly string[]).includes(raw)) {
    throw new SpecError(`${path} must be one of ${allowed.join(", ")}, got ${JSON.stringify(raw)}`);
  }
  return raw as T;
}

// ---- pure helpers, exported for their own tests --------------------------------

/** A rotation of `p` about `centre` by `degrees` counter-clockwise. vec.ts has no 2D rotation; this is the one this preset needs. */
export function rotateAbout(p: Vec2, centre: Vec2, degrees: number): Vec2 {
  const r = (degrees * Math.PI) / 180;
  const d = vec.sub(p, centre);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return vec.add(centre, [d[0] * c - d[1] * s, d[0] * s + d[1] * c] as Vec2);
}

/** The angle AVB in degrees, (0, 180]. */
export function angleAt(a: Vec2, vtx: Vec2, b: Vec2): number {
  return (vec.angleBetween(vec.sub(a, vtx), vec.sub(b, vtx)) * 180) / Math.PI;
}

/** The incentre: the side-length-weighted mean of the vertices. vec.ts has no incentre; built from its `distance`. */
export function incenterOf(a: Vec2, b: Vec2, c: Vec2): Vec2 {
  const la = vec.distance(b, c);
  const lb = vec.distance(c, a);
  const lc = vec.distance(a, b);
  const s = la + lb + lc;
  return [(la * a[0] + lb * b[0] + lc * c[0]) / s, (la * a[1] + lb * b[1] + lc * c[1]) / s];
}

// ---- pictogram glyphs, in canvas space (ADR 0047) --------------------------
// Every function here takes the already-placed canvas points of the object it
// decorates and returns pure geometry -- no frame, no locale, nothing typed.
// Exported for their own tests, the way `rotateAbout` and `angleAt` are.

/** One drawn part of a glyph: an open polyline, or a closed outline. */
export type GlyphPart = { pts: Point[]; closed?: boolean };

function unitBetween(a: Point, b: Point): Point {
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
}

function circlePtsAt(c: Point, r: number, n = 24): Point[] {
  return Array.from({ length: n + 1 }, (_, k) => ({ x: c.x + r * Math.cos((k * 2 * Math.PI) / n), y: c.y + r * Math.sin((k * 2 * Math.PI) / n) }));
}

/**
 * Evenly spaced hatch ticks beside a straight run -- the ground under a
 * ladder, a wall's far side, a ramp's underside. Each tick starts a couple of
 * pixels off the run (so it never touches the line it hatches) and reaches
 * out and back along the run, on the given `side` of it (+1/-1 across the
 * run's own normal). Exported so a test can hold the count and spacing
 * without rendering a figure.
 */
export function hatchTicks(a: Point, b: Point, side: 1 | -1, gapPx: number, lenPx: number): [Point, Point][] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const d = unitBetween(a, b);
  const n = { x: -d.y * side, y: d.x * side };
  const count = Math.max(2, Math.round(len / gapPx));
  const ticks: [Point, Point][] = [];
  // Ticks sit at the CENTRE of each of `count` equal divisions, never at
  // t = 0 or t = 1 -- an endpoint is usually a named point with its own
  // label, and a hatch tick starting right on it would out-compete that
  // label's own place for "nearest ink" (ADR 0028's label-nearest-its-place).
  for (let k = 0; k < count; k += 1) {
    const t = (k + 0.5) / count;
    const p = { x: a.x + d.x * len * t, y: a.y + d.y * len * t };
    const start = { x: p.x + n.x * 2, y: p.y + n.y * 2 };
    const end = { x: start.x + (n.x - d.x) * lenPx, y: start.y + (n.y - d.y) * lenPx };
    ticks.push([start, end]);
  }
  return ticks;
}

/**
 * A ladder's second rail (parallel to the segment, offset `railGapPx` across
 * it) and its rungs, evenly spaced by dividing the run into equal parts --
 * never by a fixed pixel count that would crowd a short ladder or leave a
 * long one sparse near one end.
 */
export type LadderGeometry = { rail2: [Point, Point]; rungs: [Point, Point][] };
export function ladderGeometry(a: Point, b: Point, railGapPx: number, rungGapPx: number): LadderGeometry {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const n = { x: -d.y, y: d.x };
  const off = (p: Point): Point => ({ x: p.x + n.x * railGapPx, y: p.y + n.y * railGapPx });
  const rail2: [Point, Point] = [off(a), off(b)];
  const rungCount = Math.max(3, Math.min(9, Math.round(len / rungGapPx)));
  const rungs: [Point, Point][] = [];
  for (let k = 1; k <= rungCount; k += 1) {
    const t = k / (rungCount + 1);
    const p1 = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    rungs.push([p1, off(p1)]);
  }
  return { rail2, rungs };
}

/** A small ball finial just past the pole's own top -- the segment itself is the shaft, so the finial never sits over it. */
export function poleGlyph(a: Point, b: Point): GlyphPart[] {
  const d = unitBetween(a, b);
  // A short crossbar at the top, not a ring: an open circle is this
  // project's mark for a point that does NOT belong, and read as one.
  const n = { x: -d.y, y: d.x };
  return [{ pts: [{ x: b.x - n.x * 6, y: b.y - n.y * 6 }, { x: b.x + n.x * 6, y: b.y + n.y * 6 }] }];
}

/** A canopy circle beyond the trunk's own top, tangent to it rather than covering it. */
export function treeGlyph(a: Point, b: Point): GlyphPart[] {
  const d = unitBetween(a, b);
  const r = 13;
  const c = { x: b.x + d.x * r * 0.62, y: b.y + d.y * r * 0.62 };
  return [{ pts: circlePtsAt(c, r) }];
}

/** A stick figure whose overall height is the segment `a`→`b`: a head beyond `b`, arms at the shoulder, legs beyond `a`. */
export function personGlyph(a: Point, b: Point): GlyphPart[] {
  const d = unitBetween(a, b);
  const n = { x: -d.y, y: d.x };
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const headR = Math.min(6, Math.max(3, len * 0.12));
  const headC = { x: b.x + d.x * headR, y: b.y + d.y * headR };
  const shoulder = { x: a.x + (b.x - a.x) * 0.72, y: a.y + (b.y - a.y) * 0.72 };
  const armLen = len * 0.22;
  const armL = { x: shoulder.x - n.x * armLen - d.x * armLen * 0.4, y: shoulder.y - n.y * armLen - d.y * armLen * 0.4 };
  const armR = { x: shoulder.x + n.x * armLen - d.x * armLen * 0.4, y: shoulder.y + n.y * armLen - d.y * armLen * 0.4 };
  const legLen = len * 0.3;
  const legL = { x: a.x - n.x * legLen * 0.5 - d.x * legLen, y: a.y - n.y * legLen * 0.5 - d.y * legLen };
  const legR = { x: a.x + n.x * legLen * 0.5 - d.x * legLen, y: a.y + n.y * legLen * 0.5 - d.y * legLen };
  return [
    { pts: circlePtsAt(headC, headR) },
    { pts: [armL, shoulder, armR] },
    { pts: [legL, a, legR] },
  ];
}

/** A facade rectangle on the outward `side` of the segment, plus a grid of window squares -- all strictly beyond the segment's own line, never over it. */
export function buildingGlyph(a: Point, b: Point, side: 1 | -1): GlyphPart[] {
  const d = unitBetween(a, b);
  const n = { x: -d.y * side, y: d.x * side };
  const height = Math.hypot(b.x - a.x, b.y - a.y);
  const width = Math.min(0.4 * height, 46);
  const a2 = { x: a.x + n.x * width, y: a.y + n.y * width };
  const b2 = { x: b.x + n.x * width, y: b.y + n.y * width };
  const parts: GlyphPart[] = [{ pts: [a, b, b2, a2], closed: true }];
  const rows = Math.max(2, Math.min(4, Math.round(height / 28)));
  const cols = 2;
  const p = (ty: number, tx: number): Point => ({ x: a.x + (b.x - a.x) * ty + n.x * width * tx, y: a.y + (b.y - a.y) * ty + n.y * width * tx });
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const ty0 = (r + 0.25) / (rows + 0.5);
      const ty1 = (r + 0.75) / (rows + 0.5);
      const tx0 = (c + 0.25) / (cols + 0.5);
      const tx1 = (c + 0.75) / (cols + 0.5);
      parts.push({ pts: [p(ty0, tx0), p(ty0, tx1), p(ty1, tx1), p(ty1, tx0)], closed: true });
    }
  }
  return parts;
}

/** A sun: a circle plus eight short rays at its edge. */
export function sunGlyph(c: Point, r = 10): GlyphPart[] {
  const parts: GlyphPart[] = [{ pts: circlePtsAt(c, r) }];
  for (let k = 0; k < 8; k += 1) {
    const a0 = (k * Math.PI * 2) / 8;
    const u = { x: Math.cos(a0), y: Math.sin(a0) };
    parts.push({ pts: [{ x: c.x + u.x * (r + 3), y: c.y + u.y * (r + 3) }, { x: c.x + u.x * (r + 8), y: c.y + u.y * (r + 8) }] });
  }
  return parts;
}

/** A small hull, mast and sail, sitting on the waterline point `p`. */
export function boatGlyph(p: Point): GlyphPart[] {
  const w = 16;
  const h = 6;
  const hull: Point[] = [
    { x: p.x - w / 2, y: p.y },
    { x: p.x - w / 2 + 2, y: p.y + h },
    { x: p.x + w / 2 - 2, y: p.y + h },
    { x: p.x + w / 2, y: p.y },
  ];
  const mast: Point[] = [{ x: p.x, y: p.y }, { x: p.x, y: p.y - 14 }];
  const sail: Point[] = [{ x: p.x, y: p.y - 14 }, { x: p.x, y: p.y - 2 }, { x: p.x + 9, y: p.y - 2 }];
  return [{ pts: hull }, { pts: mast }, { pts: sail, closed: true }];
}

/** A value as a reader writes it, exact when it snaps: 2, 1/2, √3. */
function exact(value: number, locale: Locale): string {
  return writeSnapped(value, TOL, locale);
}

/** "x²", "(x − 2)²", "(x + 1/2)²". */
function squared(variable: string, shift: number, locale: Locale): string {
  if (Math.abs(shift) <= TOL) return `${variable}²`;
  return `(${variable} ${shift > 0 ? MINUS : "+"} ${exact(Math.abs(shift), locale)})²`;
}

/** `term/d`, or just `term` when d is 1. */
function over(term: string, d: number, locale: Locale): string {
  return Math.abs(d - 1) <= TOL ? term : `${term}/${exact(d, locale)}`;
}

/** "3x", "−x", "2x/3", "√3x" -- a coefficient written onto its variable. */
function coefficientTerm(m: number, variable: string, locale: Locale): string {
  const sign = m < 0 ? MINUS : "";
  const abs = Math.abs(m);
  const f = asFraction(abs);
  if (f !== null && Math.abs(f.p / f.q - abs) <= TOL * Math.max(1, abs)) {
    const top = f.p === 1 ? variable : `${f.p}${variable}`;
    return `${sign}${f.q === 1 ? top : `${top}/${f.q}`}`;
  }
  return `${sign}${exact(abs, locale)}${variable}`;
}

/**
 * A line's equation the way a Geometria Analítica student writes the reduced
 * form: "y = −2x/3 − 1/3", "y = 4", "x = 3". Coefficients are computed from
 * the line's own point and direction and snapped to exact values.
 */
export function lineEquation(line: Line2, locale: Locale = "pt-BR"): string {
  const [dx, dy] = line.direction;
  const [x0, y0] = line.point;
  if (Math.abs(dx) <= TOL * Math.max(1, Math.abs(dy))) return `x = ${exact(x0, locale)}`;
  const m = dy / dx;
  const n = y0 - m * x0;
  const mZero = Math.abs(m) <= TOL;
  const nZero = Math.abs(n) <= TOL;
  if (mZero) return `y = ${exact(n, locale)}`;
  const head = coefficientTerm(m, "x", locale);
  if (nZero) return `y = ${head}`;
  return `y = ${head} ${n < 0 ? MINUS : "+"} ${exact(Math.abs(n), locale)}`;
}

/** "(x − 1)² + (y + 2)² = 9", "x² + y² = 25". */
export function circleEquation(c: Circle2, locale: Locale = "pt-BR"): string {
  return `${squared("x", c.center[0], locale)} + ${squared("y", c.center[1], locale)} = ${exact(c.radius * c.radius, locale)}`;
}

/** Is `u` parallel to the x axis (true), the y axis (false), or neither (null)? */
function axisAligned(u: Vec2): "x" | "y" | null {
  if (Math.abs(u[1]) <= 1e-9 * Math.hypot(u[0], u[1])) return "x";
  if (Math.abs(u[0]) <= 1e-9 * Math.hypot(u[0], u[1])) return "y";
  return null;
}

/**
 * A conic's canonical equation, computed from its defining elements: an
 * ellipse's a and b, a hyperbola's a and b, a parabola's focal parameter.
 * Only for a conic whose axis is parallel to a coordinate axis -- otherwise
 * there is no canonical form without a rotation of axes, and `null` says so.
 */
export function conicEquation(c: Conic, locale: Locale = "pt-BR"): string | null {
  if (c.type === "parabola") {
    const along = axisAligned(c.axis);
    if (along === null) return null;
    // Vertical axis: (x − h)² = 4p(y − k); horizontal: (y − k)² = 4p(x − h).
    const [h, k] = c.vertex;
    const sign = along === "y" ? Math.sign(c.axis[1]) : Math.sign(c.axis[0]);
    const coef = 4 * c.p * sign;
    const lhs = along === "y" ? squared("x", h, locale) : squared("y", k, locale);
    const variable = along === "y" ? "y" : "x";
    const shift = along === "y" ? k : h;
    const head = Math.abs(Math.abs(coef) - 1) <= TOL ? (coef < 0 ? MINUS : "") : `${coef < 0 ? MINUS : ""}${exact(Math.abs(coef), locale)}`;
    const rhs = Math.abs(shift) <= TOL ? `${head}${variable}` : `${head}${squared(variable, shift, locale).slice(0, -1)}`;
    return `${lhs} = ${rhs}`;
  }
  const along = axisAligned(c.axis);
  if (along === null) return null;
  const [h, k] = c.center;
  const xTerm = squared("x", h, locale);
  const yTerm = squared("y", k, locale);
  const a2 = c.a * c.a;
  const b2 = c.b * c.b;
  const [first, firstD, second, secondD] = along === "x" ? [xTerm, a2, yTerm, b2] : [yTerm, a2, xTerm, b2];
  if (c.type === "ellipse") {
    // Written x-term first whichever axis is major, as a textbook does.
    const [xd, yd] = along === "x" ? [a2, b2] : [b2, a2];
    return `${over(xTerm, xd, locale)} + ${over(yTerm, yd, locale)} = 1`;
  }
  return `${over(first, firstD, locale)} ${MINUS} ${over(second, secondD, locale)} = 1`;
}

/** An ellipse point at parameter t. */
function conicPoint(c: Extract<Conic, { type: "ellipse" | "hyperbola" }>, s: number, t: number): Vec2 {
  const u = c.axis;
  const w = vec.perpendicular2(u);
  if (c.type === "ellipse") return vec.add(c.center, vec.add(vec.scale(u, c.a * Math.cos(t)), vec.scale(w, c.b * Math.sin(t))));
  return vec.add(c.center, vec.add(vec.scale(u, s * c.a * Math.cosh(t)), vec.scale(w, c.b * Math.sinh(t))));
}

/** Points of a conic, analytically from its parameters -- never traced from a contour. `reach` bounds an unbounded branch. */
export function sampleConic(c: Conic, reach: number): Vec2[][] {
  if (c.type === "ellipse") {
    return [Array.from({ length: 361 }, (_, k) => conicPoint(c, 1, (k * 2 * Math.PI) / 360))];
  }
  if (c.type === "hyperbola") {
    // Far enough that the branch leaves any view `reach` wide.
    const T = Math.min(Math.acosh(Math.max(1, reach / c.a)), Math.asinh(reach / c.b)) + 0.05;
    const n = 400;
    return [1, -1].map((s) => Array.from({ length: n + 1 }, (_, k) => conicPoint(c, s, -T + (2 * T * k) / n)));
  }
  const w = vec.perpendicular2(c.axis);
  const n = 400;
  return [
    Array.from({ length: n + 1 }, (_, k) => {
      const s = -reach + (2 * reach * k) / n;
      return vec.add(c.vertex, vec.add(vec.scale(c.axis, (s * s) / (4 * c.p)), vec.scale(w, s)));
    }),
  ];
}

// ---- reading the list ---------------------------------------------------------------

function asPair(value: unknown, path: string): Vec2 {
  if (!Array.isArray(value) || value.length !== 2) throw new SpecError(`${path} must be [x, y]`);
  return [v.finite(value[0], `${path}[0]`), v.finite(value[1], `${path}[1]`)];
}

function names(value: unknown, n: number, path: string): string[] {
  if (!Array.isArray(value) || value.length !== n || !value.every((x) => typeof x === "string")) {
    throw new SpecError(`${path} must be ${n} object names`);
  }
  return value as string[];
}

/** A text an author typed as a label: refused if it types a coordinate or a number, since those are computed here. */
function checkedText(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new SpecError(`${path} must be a non-empty string`);
  const typed = typedCoordinate(value);
  if (typed !== null) throw new SpecError(`${path} types the coordinate "${typed}" by hand -- set "coords": true to print the computed one`);
  if (/[0-9]/.test(value)) {
    throw new SpecError(`${path} "${value}" types a number by hand -- a printed measure is computed here (use an annotation), never typed`);
  }
  return value;
}

type Model = {
  objects: Map<string, ConstructionObject>;
  order: string[];
};

/**
 * Carry out every construction in order and return the named objects.
 * Exported so a test can hold each result against vec.ts directly.
 */
export function computeConstruction(input: ConstructionInput): Model {
  const objects = new Map<string, ConstructionObject>();
  const order: string[] = [];
  const locale = input.locale ?? "pt-BR";

  const get = (name: unknown, path: string, what = "an object"): ConstructionObject => {
    if (typeof name !== "string") throw new SpecError(`${path} must name ${what}`);
    if (!objects.has(name) && splitPair(name, objects) !== null) return linear(name, path);
    v.knownId(name, new Set(objects.keys()), path, what);
    return objects.get(name)!;
  };
  const point = (name: unknown, path: string): Vec2 => {
    const o = get(name, path, "a point");
    if (o.kind !== "point") throw new SpecError(`${path}: "${String(name)}" is a ${describe(o)}, not a point`);
    return o.p;
  };
  const linear = (name: unknown, path: string): Extract<ConstructionObject, { kind: "linear" }> => {
    // "BC" names the line through B and C when no object is called that --
    // the way a statement says "the perpendicular from A to BC".
    if (typeof name === "string" && !objects.has(name)) {
      const pair = splitPair(name, objects);
      if (pair !== null) {
        const [p, q] = pair.map((n) => (objects.get(n) as { p: Vec2 }).p) as [Vec2, Vec2];
        const line = run(path, () => vec.lineThrough2(p, q));
        return { kind: "linear", name, line, extent: { kind: "line" }, style: { colour: LINE, width: 1.6, dashed: false, hidden: true }, label: null };
      }
    }
    const o = get(name, path, "a line");
    if (o.kind !== "linear") throw new SpecError(`${path}: "${String(name)}" is a ${describe(o)}, not a line, segment or ray`);
    return o;
  };
  const circle = (name: unknown, path: string): Circle2 => {
    const o = get(name, path, "a circle");
    if (o.kind !== "circle") throw new SpecError(`${path}: "${String(name)}" is a ${describe(o)}, not a circle`);
    return o.circle;
  };
  const triangle = (value: unknown, path: string): [Vec2, Vec2, Vec2] => {
    // Either three point names or the name of a three-vertex polygon.
    if (typeof value === "string") {
      const o = get(value, path, "a triangle");
      if (o.kind !== "polygon" || o.pts.length !== 3) throw new SpecError(`${path}: "${value}" is not a triangle`);
      return o.pts as [Vec2, Vec2, Vec2];
    }
    const [a, b, c] = names(value, 3, path).map((n, i) => point(n, `${path}[${i}]`)) as [Vec2, Vec2, Vec2];
    nonDegenerate(a, b, c, path, Array.isArray(value) ? (value as string[]).join("") : "");
    return [a, b, c];
  };
  /** Four vertices -- a polygon of four points, or four point names -- or null when `value` is not one (ADR 0067: a circle about a square). */
  const quadrilateral = (value: unknown, path: string): [Vec2, Vec2, Vec2, Vec2] | null => {
    if (typeof value === "string") {
      const o = objects.get(value);
      return o !== undefined && o.kind === "polygon" && o.pts.length === 4 ? (o.pts as [Vec2, Vec2, Vec2, Vec2]) : null;
    }
    if (Array.isArray(value) && value.length === 4) return names(value, 4, path).map((n, i) => point(n, `${path}[${i}]`)) as [Vec2, Vec2, Vec2, Vec2];
    return null;
  };
  const length = (value: unknown, path: string): number => {
    if (typeof value === "number") {
      if (!(value > 0) || !Number.isFinite(value)) throw new SpecError(`${path} must be a positive length, got ${value}`);
      return value;
    }
    if (typeof value !== "string") throw new SpecError(`${path} must be a number or an expression such as "dist(A,B)"`);
    const replaced = value.replace(/dist\(\s*([^,()\s]+)\s*,\s*([^,()\s]+)\s*\)/g, (_, p: string, q: string) => {
      return `(${vec.distance(point(p, `${path} dist(${p}, …)`), point(q, `${path} dist(…, ${q})`))})`;
    });
    let out: number;
    try {
      out = constantValue(replaced);
    } catch (e) {
      throw new SpecError(`${path}: "${value}" is not a length this preset can compute (${(e as Error).message})`);
    }
    if (!(out > 0)) throw new SpecError(`${path}: "${value}" comes to ${out}, not a positive length`);
    return out;
  };

  const run = <T>(path: string, f: () => T): T => {
    try {
      return f();
    } catch (e) {
      if (e instanceof vec.GeometryError) throw new SpecError(`${path}: ${e.message}`);
      throw e;
    }
  };

  const items = input.objects ?? [];
  if (!Array.isArray(items) || items.length === 0) throw new SpecError("construction.objects must list at least one object");

  items.forEach((raw0, i) => {
    const path = `objects[${i}]`;
    const raw = normalise(raw0, path);
    const name = raw.name as string;
    if (objects.has(name)) throw new SpecError(`${path}: "${name}" is already declared`);
    const kinds = ALL_KINDS.filter((k) => raw[k] !== undefined);
    if (kinds.length !== 1) {
      throw new SpecError(
        `${path} ("${name}") must be defined exactly one way -- one of ${ALL_KINDS.join(", ")} -- found ${kinds.length === 0 ? "none" : kinds.join(" and ")}`,
      );
    }
    const kind = kinds[0]!;
    const arg = raw[kind];
    const kp = `${path}.${kind}`;
    const withheld = input.answers === false && raw.answer === true;
    const hidden = raw.hidden === true || withheld;
    const hid = { hidden, ...(withheld ? { withheld: true as const } : {}) };
    const dashed = raw.dashed === true;
    const colour = typeof raw.colour === "string" ? raw.colour : undefined;
    const label = raw.label === undefined || raw.label === false ? null : raw.label === true ? name : checkedText(raw.label, `${path}.label`);

    const which = (count: number, pts: readonly Vec2[], what: string): Vec2 => {
      if (raw.other !== undefined) {
        const avoid = point(raw.other, `${path}.other`);
        const rest = pts.filter((p) => !vec.approxEqual(p, avoid, 1e-7));
        if (rest.length !== 1) {
          throw new SpecError(`${path}: "other": "${String(raw.other)}" does not single out one of the ${count} points where ${what} meet`);
        }
        return rest[0]!;
      }
      if (pts.length === 1) return pts[0]!;
      if (raw.which !== 0 && raw.which !== 1) {
        throw new SpecError(
          `${path}: ${what} meet at two points, ${vec.writeVec(pts[0]!, locale)} and ${vec.writeVec(pts[1]!, locale)} -- ` +
            `say which: "which": 0 or 1 (ordered by x, then y, as vec.ts orders them), or "other": a point to exclude`,
        );
      }
      return pts[raw.which]!;
    };

    // ---- points ----
    if ((POINT_KINDS as readonly string[]).includes(kind)) {
      const p = run(path, (): Vec2 => {
        switch (kind) {
          case "at":
            return asPair(arg, kp);
          case "midpoint": {
            const [a, b] = names(arg, 2, kp).map((n, j) => point(n, `${kp}[${j}]`)) as [Vec2, Vec2];
            return vec.lerp(a, b, 0.5);
          }
          case "intersection": {
            const [n1, n2] = names(arg, 2, kp);
            const either = (n: string, p: string): ConstructionObject =>
              !objects.has(n) && splitPair(n, objects) !== null ? linear(n, p) : get(n, p, "a line or circle");
            const o1 = either(n1, `${kp}[0]`);
            const o2 = either(n2, `${kp}[1]`);
            const what = `"${n1}" and "${n2}"`;
            if (o1.kind === "linear" && o2.kind === "linear") {
              const r = vec.intersectLines2(o1.line, o2.line);
              if (r.kind === "parallel") throw new SpecError(`${path}: ${what} are parallel -- they never meet, so "${name}" does not exist`);
              if (r.kind === "coincident") throw new SpecError(`${path}: ${what} are the same line -- they meet everywhere, so "${name}" is not one point`);
              return r.point;
            }
            if ((o1.kind === "linear" && o2.kind === "circle") || (o1.kind === "circle" && o2.kind === "linear")) {
              const [l, c] = o1.kind === "linear" ? [o1, o2 as Extract<ConstructionObject, { kind: "circle" }>] : [o2 as Extract<ConstructionObject, { kind: "linear" }>, o1];
              const r = vec.intersectLineCircle2(l.line, c.circle);
              if (r.kind === "none") {
                throw new SpecError(`${path}: ${what} do not meet -- the line passes ${formatNumber(vec.distancePointToLine2(c.circle.center, l.line), locale, { decimals: 2 })} from the centre, the radius is ${formatNumber(c.circle.radius, locale, { decimals: 2 })}`);
              }
              return which(r.kind === "tangent" ? 1 : 2, r.kind === "tangent" ? [r.point] : r.points, what);
            }
            if (o1.kind === "circle" && o2.kind === "circle") {
              const r = vec.intersectCircles2(o1.circle, o2.circle);
              if (r.kind === "none") {
                throw new SpecError(
                  `${path}: circles ${what} do not meet -- centres ${formatNumber(vec.distance(o1.circle.center, o2.circle.center), locale, { decimals: 2 })} apart, radii ${formatNumber(o1.circle.radius, locale, { decimals: 2 })} and ${formatNumber(o2.circle.radius, locale, { decimals: 2 })}`,
                );
              }
              if (r.kind === "coincident") throw new SpecError(`${path}: ${what} are the same circle`);
              return which(r.kind === "tangent" ? 1 : 2, r.kind === "tangent" ? [r.point] : r.points, what);
            }
            throw new SpecError(`${path}: an intersection is of two lines or circles; "${n1}" is a ${describe(o1)} and "${n2}" a ${describe(o2)}`);
          }
          case "foot": {
            const o = v.object(arg, kp);
            return vec.footOfPerpendicular2(point(o.of, `${kp}.of`), linear(o.on, `${kp}.on`).line);
          }
          case "onCircle": {
            const o = v.object(arg, kp);
            const c = circle(o.circle, `${kp}.circle`);
            const deg = v.finite(o.angle, `${kp}.angle`);
            return rotateAbout(vec.add(c.center, [c.radius, 0] as Vec2), c.center, deg);
          }
          case "reflection": {
            const o = v.object(arg, kp);
            const p = point(o.of, `${kp}.of`);
            const over = get(o.over, `${kp}.over`, "a line or point");
            if (over.kind === "point") return vec.sub(vec.scale(over.p, 2), p);
            if (over.kind === "linear") return vec.sub(vec.scale(vec.footOfPerpendicular2(p, over.line), 2), p);
            throw new SpecError(`${kp}.over: a reflection is over a line or a point, and "${String(o.over)}" is a ${describe(over)}`);
          }
          case "rotation": {
            const o = v.object(arg, kp);
            return rotateAbout(point(o.of, `${kp}.of`), point(o.about, `${kp}.about`), v.finite(o.angle, `${kp}.angle`));
          }
          case "centroid": {
            const [a, b, c] = triangle(arg, kp);
            return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
          }
          case "incenter": {
            const [a, b, c] = triangle(arg, kp);
            return incenterOf(a, b, c);
          }
          case "circumcenter": {
            const [a, b, c] = triangle(arg, kp);
            return vec.circleThroughThreePoints2(a, b, c).center;
          }
          default: {
            // orthocenter: where two altitudes meet.
            const [a, b, c] = triangle(arg, kp);
            const altA: Line2 = { point: a, direction: vec.perpendicular2(vec.sub(c, b)) };
            const altB: Line2 = { point: b, direction: vec.perpendicular2(vec.sub(a, c)) };
            const r = vec.intersectLines2(altA, altB);
            if (r.kind !== "point") throw new SpecError(`${path}: the altitudes do not meet -- the triangle is degenerate`);
            return r.point;
          }
        }
      });
      const coords = raw.coords === true;
      const picto = checkedPicto(raw.picto, POINT_PICTOS, `${path}.picto`);
      objects.set(name, {
        kind: "point",
        name,
        p,
        style: { colour: colour ?? INK, width: 0, dashed: false, ...hid },
        dot: raw.dot !== false,
        label: raw.label === false ? null : label ?? name,
        coords,
        ...(kind === "at" ? { free: true as const } : {}),
        ...(picto === undefined ? {} : { picto }),
      });
      order.push(name);
      return;
    }

    // ---- lines ----
    if ((LINEAR_KINDS as readonly string[]).includes(kind)) {
      const built = run(path, (): { line: Line2; extent: Extent; ends?: [string, string] } => {
        switch (kind) {
          case "segment":
          case "line":
          case "ray": {
            const [na, nb] = names(arg, 2, kp);
            const a = point(na, `${kp}[0]`);
            const b = point(nb, `${kp}[1]`);
            const line = vec.lineThrough2(a, b);
            const extent: Extent = kind === "segment" ? { kind: "segment", a, b } : kind === "ray" ? { kind: "ray", from: a } : { kind: "line" };
            return { line, extent, ...(kind === "segment" ? { ends: [na, nb] as [string, string] } : {}) };
          }
          case "perpendicular":
          case "parallel": {
            const o = v.object(arg, kp);
            const through = point(o.through, `${kp}.through`);
            const to = linear(o.to, `${kp}.to`).line;
            const direction = kind === "perpendicular" ? vec.perpendicular2(to.direction) : to.direction;
            const line: Line2 = { point: through, direction };
            if (raw.draw === "segment") {
              if (kind !== "perpendicular") throw new SpecError(`${path}: a parallel has no second end to draw a segment to`);
              const foot = vec.footOfPerpendicular2(through, to);
              if (vec.approxEqual(foot, through)) throw new SpecError(`${path}: "${String(o.through)}" lies on "${String(o.to)}" -- the perpendicular segment from it has no length`);
              return { line, extent: { kind: "segment", a: through, b: foot } };
            }
            return { line, extent: { kind: "line" } };
          }
          case "perpendicularBisector": {
            const [a, b] = names(arg, 2, kp).map((n, j) => point(n, `${kp}[${j}]`)) as [Vec2, Vec2];
            return { line: vec.perpendicularBisector2(a, b), extent: { kind: "line" } };
          }
          case "angleBisector": {
            const [na, nv, nb] = names(arg, 3, kp);
            const a = point(na, `${kp}[0]`);
            const vtx = point(nv, `${kp}[1]`);
            const b = point(nb, `${kp}[2]`);
            const pair = vec.angleBisectors2(vec.lineThrough2(vtx, a), vec.lineThrough2(vtx, b));
            if (pair.kind !== "pair") throw new SpecError(`${path}: ${na}, ${nv} and ${nb} are collinear -- the angle ${na}${nv}${nb} is flat or zero and has no bisector to draw`);
            // Of the two bisectors, the INTERNAL one points between VA and VB.
            const inside = vec.add(vec.normalize(vec.sub(a, vtx)), vec.normalize(vec.sub(b, vtx)));
            let line = pair.bisectors.find((l) => Math.abs(vec.dot(vec.normalize(l.direction), vec.normalize(inside))) > 1 - 1e-9) ?? pair.bisectors[0];
            if (vec.dot(line.direction, inside) < 0) line = { point: line.point, direction: vec.scale(line.direction, -1) };
            if (raw.draw === "segment") {
              const meet = vec.intersectLines2(line, vec.lineThrough2(a, b));
              if (meet.kind !== "point") throw new SpecError(`${path}: the bisector does not meet ${na}${nb}`);
              return { line, extent: { kind: "segment", a: vtx, b: meet.point } };
            }
            return { line, extent: raw.draw === "line" ? { kind: "line" } : { kind: "ray", from: vtx } };
          }
          default: {
            // tangent from a point to a circle
            const o = v.object(arg, kp);
            const p = point(o.from, `${kp}.from`);
            const c = circle(o.to, `${kp}.to`);
            const d = vec.distance(p, c.center);
            const slack = 1e-9 * Math.max(1, d, c.radius);
            if (d < c.radius - slack) {
              throw new SpecError(`${path}: "${String(o.from)}" is inside the circle "${String(o.to)}" -- no tangent passes through it`);
            }
            let touch: Vec2;
            if (Math.abs(d - c.radius) <= slack) {
              touch = p;
            } else {
              // Thales: the tangent points are where the circle on PC as a diameter meets the circle.
              const r = vec.intersectCircles2(c, { center: vec.lerp(p, c.center, 0.5), radius: d / 2 });
              if (r.kind !== "two") throw new SpecError(`${path}: unreachable -- a point outside a circle has two tangents`);
              touch = which(2, r.points, `the tangents from "${String(o.from)}" to "${String(o.to)}"`);
            }
            if (typeof raw.touch === "string") {
              if (objects.has(raw.touch) || raw.touch === name) throw new SpecError(`${path}.touch: "${raw.touch}" is already declared`);
              objects.set(raw.touch, { kind: "point", name: raw.touch, p: touch, style: { colour: INK, width: 0, dashed: false, hidden: false }, dot: true, label: raw.touch, coords: false });
              order.push(raw.touch);
            }
            const direction = vec.approxEqual(touch, p) ? vec.perpendicular2(vec.sub(p, c.center)) : vec.sub(touch, p);
            const line: Line2 = { point: p, direction };
            if (raw.draw === "segment") {
              if (vec.approxEqual(touch, p)) throw new SpecError(`${path}: "${String(o.from)}" is on the circle, so the tangent segment to it has no length`);
              return { line, extent: { kind: "segment", a: p, b: touch } };
            }
            return { line, extent: { kind: "line" } };
          }
        }
      });
      const isLine = built.extent.kind !== "segment";
      const picto = checkedPicto(raw.picto, SEGMENT_PICTOS, `${path}.picto`);
      if (picto !== undefined && built.extent.kind !== "segment") {
        throw new SpecError(`${path}.picto: "${picto}" decorates a drawn segment, and "${name}" is a ${isLine ? "line or ray" : "segment"} -- give it "segment": [A, B] instead`);
      }
      const side: 1 | -1 = raw.side === -1 ? -1 : 1;
      objects.set(name, {
        kind: "linear",
        name,
        line: built.line,
        extent: built.extent,
        ...(built.ends === undefined ? {} : { ends: built.ends }),
        style: {
          colour: colour ?? (dashed ? GUIDE : isLine ? LINE : INK),
          width: dashed ? 1.4 : isLine ? 1.6 : 2,
          dashed,
          ...hid,
        },
        label,
        ...(picto === undefined ? {} : { picto, side }),
      });
      order.push(name);
      return;
    }

    // ---- circles ----
    if ((CIRCLE_KINDS as readonly string[]).includes(kind)) {
      const c = run(path, (): Circle2 => {
        if (kind === "circle") {
          const o = v.object(arg, kp);
          const center = point(o.center, `${kp}.center`);
          if (o.through !== undefined) {
            const r = vec.distance(center, point(o.through, `${kp}.through`));
            if (r <= TOL) throw new SpecError(`${path}: "${String(o.through)}" is the centre itself -- the circle has no radius`);
            return { center, radius: r };
          }
          return { center, radius: length(o.radius, `${kp}.radius`) };
        }
        const quad = quadrilateral(arg, kp);
        if (quad !== null) {
          const [qa, qb, qc, qd] = quad;
          if (kind === "circumcircle") {
            nonDegenerate(qa, qb, qc, kp, "of the first three vertices");
            const cc4 = vec.circleThroughThreePoints2(qa, qb, qc);
            if (Math.abs(vec.distance(qd, cc4.center) - cc4.radius) > 1e-7 * Math.max(1, cc4.radius)) {
              throw new SpecError(`${path}: the four vertices are not on one circle -- the fourth is ${formatNumber(vec.distance(qd, cc4.center), locale, { decimals: 3 })} from the centre of the circle through the other three, whose radius is ${formatNumber(cc4.radius, locale, { decimals: 3 })}`);
            }
            return cc4;
          }
          // incircle: the internal bisectors at the first two vertices meet at the centre; every side must then be as far.
          const bis = (p: Vec2, prev: Vec2, next: Vec2): Line2 => ({ point: p, direction: vec.add(vec.normalize(vec.sub(prev, p)), vec.normalize(vec.sub(next, p))) });
          const hit = vec.intersectLines2(bis(qa, qd, qb), bis(qb, qa, qc));
          if (hit.kind !== "point") throw new SpecError(`${path}: the bisectors of the first two angles do not meet -- the quadrilateral has no incircle`);
          const ring4 = [qa, qb, qc, qd];
          const dists = ring4.map((p, i) => vec.distancePointToLine2(hit.point, vec.lineThrough2(p, ring4[(i + 1) % 4]!)));
          const rIn = Math.min(...dists);
          if (Math.max(...dists) - rIn > 1e-7 * Math.max(1, rIn)) throw new SpecError(`${path}: the sides are not all the same distance from one point -- this quadrilateral has no incircle (a square, a rhombus or a kite does)`);
          return { center: hit.point, radius: rIn };
        }
        const [a, b, cc] = triangle(arg, kp);
        if (kind === "circumcircle") return vec.circleThroughThreePoints2(a, b, cc);
        const center = incenterOf(a, b, cc);
        return { center, radius: vec.distancePointToLine2(center, vec.lineThrough2(a, b)) };
      });
      objects.set(name, {
        kind: "circle",
        name,
        circle: c,
        style: { colour: colour ?? (dashed ? GUIDE : CIRCLE), width: dashed ? 1.4 : 1.8, dashed, ...hid },
        label,
        fill: typeof raw.fill === "string" ? raw.fill : null,
        hatch: hatchOf(raw.hatch, `${path}.hatch`),
      });
      order.push(name);
      return;
    }

    // ---- polygons ----
    if (kind === "polygon") {
      if (!Array.isArray(arg) || arg.length < 3 || !arg.every((x) => typeof x === "string")) {
        throw new SpecError(`${kp} must list at least three point names`);
      }
      const vs = arg as string[];
      const pts = vs.map((n, j) => point(n, `${kp}[${j}]`));
      if (vs.length === 3) nonDegenerate(pts[0]!, pts[1]!, pts[2]!, kp, vs.join(""));
      for (let j = 0; j < pts.length; j += 1) {
        if (vec.approxEqual(pts[j]!, pts[(j + 1) % pts.length]!)) throw new SpecError(`${kp}: ${vs[j]} and ${vs[(j + 1) % vs.length]} coincide -- the polygon has a side of length zero`);
      }
      const fill = typeof raw.fill === "string" ? raw.fill : null;
      objects.set(name, { kind: "polygon", name, vertices: vs, pts, fill, hatch: hatchOf(raw.hatch, `${path}.hatch`), style:{ colour: colour ?? INK, width: 2, dashed, ...hid } });
      order.push(name);
      return;
    }

    // ---- extension shapes (ADR 0067) ----
    if ((SHAPE_KINDS as readonly string[]).includes(kind)) {
      const data = run(path, (): ShapeData => {
        const o = v.object(arg, kp);
        switch (kind) {
          case "sector": {
            const c = point(o.center, `${kp}.center`);
            let r: number;
            let a0: number;
            if (o.through !== undefined) {
              const p = point(o.through, `${kp}.through`);
              r = vec.distance(c, p);
              if (r <= TOL) throw new SpecError(`${path}: "${String(o.through)}" is the centre -- the sector has no radius`);
              a0 = Math.atan2(p[1] - c[1], p[0] - c[0]);
            } else {
              if (o.radius === undefined) throw new SpecError(`${kp} needs "through" (a point on its first radius) or "radius" with "from" (degrees)`);
              r = length(o.radius, `${kp}.radius`);
              a0 = rad(o.from === undefined ? 0 : v.finite(o.from, `${kp}.from`));
            }
            let span: number;
            if (o.to !== undefined) {
              if (o.angle !== undefined) throw new SpecError(`${kp}: give "angle" or "to", not both -- one of them is computed from the other`);
              const q = point(o.to, `${kp}.to`);
              if (vec.approxEqual(q, c)) throw new SpecError(`${path}: "${String(o.to)}" is the centre -- it gives no second radius`);
              span = (((Math.atan2(q[1] - c[1], q[0] - c[0]) - a0) % TAU) + TAU) % TAU;
              if (span <= 1e-9) throw new SpecError(`${path}: both radii run the same way -- there is no sector between them`);
            } else {
              const deg = v.finite(o.angle, `${kp}.angle`);
              if (!(Math.abs(deg) > 0 && Math.abs(deg) < 360)) throw new SpecError(`${kp}.angle must be between 0° and 360° (exclusive), got ${deg}`);
              span = rad(deg);
              if (span < 0) {
                a0 += span;
                span = -span;
              }
            }
            return { shape: "sector", c, r, a0, span };
          }
          case "ring": {
            const c = point(o.center, `${kp}.center`);
            const rIn = length(o.inner, `${kp}.inner`);
            const rOut = length(o.outer, `${kp}.outer`);
            if (!(rIn < rOut - TOL)) throw new SpecError(`${path}: the inner radius ${formatNumber(rIn, locale)} is not smaller than the outer ${formatNumber(rOut, locale)}`);
            if (o.angle === undefined) {
              if (o.from !== undefined) throw new SpecError(`${kp}: "from" without "angle" -- a whole ring has no start`);
              return { shape: "ring", c, rIn, rOut };
            }
            const deg = v.finite(o.angle, `${kp}.angle`);
            if (!(Math.abs(deg) > 0 && Math.abs(deg) < 360)) throw new SpecError(`${kp}.angle must be between 0° and 360° (exclusive), got ${deg}`);
            let a0 = rad(o.from === undefined ? 0 : v.finite(o.from, `${kp}.from`));
            let span = rad(deg);
            if (span < 0) {
              a0 += span;
              span = -span;
            }
            return { shape: "ring", c, rIn, rOut, a0, span };
          }
          case "semicircle": {
            const [na, nb] = names(o.on, 2, `${kp}.on`);
            const a = point(na, `${kp}.on[0]`);
            const b = point(nb, `${kp}.on[1]`);
            if (vec.approxEqual(a, b)) throw new SpecError(`${path}: ${na} and ${nb} coincide -- no diameter`);
            let side: 1 | -1;
            if (o.away !== undefined) {
              if (o.side !== undefined) throw new SpecError(`${kp}: give "side" or "away", not both`);
              const ref = get(o.away, `${kp}.away`, "a point or polygon");
              let rp: Vec2;
              if (ref.kind === "point") rp = ref.p;
              else if (ref.kind === "polygon") rp = [ref.pts.reduce((t, p) => t + p[0], 0) / ref.pts.length, ref.pts.reduce((t, p) => t + p[1], 0) / ref.pts.length];
              else throw new SpecError(`${kp}.away: "${String(o.away)}" is a ${describe(ref)}, not a point or polygon`);
              const cr = vec.cross2(vec.sub(b, a), vec.sub(rp, a));
              if (Math.abs(cr) <= TOL * Math.max(1, vec.lengthSquared(vec.sub(b, a)))) throw new SpecError(`${path}: "${String(o.away)}" is on the line ${na}${nb}, so "away" names no side`);
              side = cr > 0 ? -1 : 1;
            } else if (o.side === 1 || o.side === -1) side = o.side;
            else throw new SpecError(`${kp}: say which side the half-disc bulges to -- "side": 1 (left of ${na}→${nb}) or -1, or "away": a point or polygon it bulges away from`);
            const sc = semicirclePieces(a, b, side);
            return { shape: "semicircle", a, b, side, c: sc.centre, r: sc.r };
          }
          case "belt": {
            const [n1, n2] = names(o.circles, 2, `${kp}.circles`);
            const c1 = circle(n1, `${kp}.circles[0]`);
            const c2 = circle(n2, `${kp}.circles[1]`);
            const mode = o.tangents === undefined ? "external" : o.tangents;
            if (mode !== "external" && mode !== "crossed") throw new SpecError(`${kp}.tangents must be "external" or "crossed", got ${JSON.stringify(mode)}`);
            const d = vec.distance(c1.center, c2.center);
            if (mode === "external" && !(d > Math.abs(c1.radius - c2.radius) + TOL)) throw new SpecError(`${path}: the circles are nested or equal (centres ${formatNumber(d, locale, { decimals: 2 })} apart, radii ${formatNumber(c1.radius, locale, { decimals: 2 })} and ${formatNumber(c2.radius, locale, { decimals: 2 })}) -- they have no external tangent`);
            if (mode === "crossed" && !(d > c1.radius + c2.radius + TOL)) throw new SpecError(`${path}: the circles touch or overlap (centres ${formatNumber(d, locale, { decimals: 2 })} apart, radii sum ${formatNumber(c1.radius + c2.radius, locale, { decimals: 2 })}) -- they have no crossed tangent`);
            const geo = beltGeometry(c1, c2, mode);
            const touchNames = o.touch === undefined ? [] : names(o.touch, 4, `${kp}.touch`);
            const pts = [geo.tangents[0][0], geo.tangents[0][1], geo.tangents[1][0], geo.tangents[1][1]];
            touchNames.forEach((tn, j) => {
              if (objects.has(tn) || tn === name) throw new SpecError(`${kp}.touch[${j}]: "${tn}" is already declared`);
              objects.set(tn, { kind: "point", name: tn, p: pts[j]!, style: { colour: INK, width: 0, dashed: false, hidden: false }, dot: true, label: tn, coords: false });
              order.push(tn);
            });
            return { shape: "belt", c1, c2, mode, geo, touch: touchNames };
          }
          case "region": {
            if (typeof o.start !== "string") throw new SpecError(`${kp}.start must name the point the boundary starts from`);
            if (!Array.isArray(o.then) || o.then.length < 2) throw new SpecError(`${kp}.then must list at least two pieces ({"line": "B"} or {"arc": {"center": "O", "to": "C", "ccw": true}})`);
            const startP = point(o.start, `${kp}.start`);
            let here: Vec2 = startP;
            const pieces: Piece[] = [];
            (o.then as unknown[]).forEach((rawPiece, j) => {
              const pp = `${kp}.then[${j}]`;
              const pc = v.object(rawPiece, pp);
              if (pc.line !== undefined) {
                const to = point(pc.line, `${pp}.line`);
                if (vec.approxEqual(here, to)) throw new SpecError(`${pp}: the line starts and ends at the same point`);
                pieces.push({ kind: "line", a: here, b: to });
                here = to;
                return;
              }
              const ac = v.object(pc.arc, `${pp}.arc`);
              const co = get(ac.center, `${pp}.arc.center`, "a point or circle");
              const centre = co.kind === "point" ? co.p : co.kind === "circle" ? co.circle.center : null;
              if (centre === null) throw new SpecError(`${pp}.arc.center: "${String(ac.center)}" is a ${describe(co)}, not a point or circle`);
              const to = point(ac.to, `${pp}.arc.to`);
              const r = vec.distance(centre, here);
              if (r <= TOL) throw new SpecError(`${pp}: the arc's centre is where it starts -- it has no radius`);
              if (Math.abs(vec.distance(centre, to) - r) > 1e-6 * Math.max(1, r)) {
                throw new SpecError(`${pp}: "${String(ac.to)}" is ${formatNumber(vec.distance(centre, to), locale, { decimals: 3 })} from "${String(ac.center)}" but the arc starts ${formatNumber(r, locale, { decimals: 3 })} from it -- they are not on one circle`);
              }
              if (ac.ccw !== true && ac.ccw !== false) throw new SpecError(`${pp}.arc.ccw must say which way round the arc runs: true (counter-clockwise) or false`);
              const a0 = Math.atan2(here[1] - centre[1], here[0] - centre[0]);
              const a1 = Math.atan2(to[1] - centre[1], to[0] - centre[0]);
              const ccwSpan = (((a1 - a0) % TAU) + TAU) % TAU;
              const cwSpan = (((a0 - a1) % TAU) + TAU) % TAU;
              const span = ac.ccw === true ? ccwSpan : -cwSpan;
              if (Math.abs(span) <= 1e-9) throw new SpecError(`${pp}: the arc starts and ends at the same point`);
              pieces.push({ kind: "arc", c: centre, r, a0, span });
              here = to;
            });
            const scale = Math.max(1, ...pieces.map((pc) => vec.distance(pieceStart(pc), pieceEnd(pc))));
            if (chainGap(pieces) > 1e-7 * scale) throw new SpecError(`${kp}: the boundary does not close -- it ends ${formatNumber(vec.distance(here, startP), locale, { decimals: 3 })} from where it started`);
            return { shape: "region", pieces };
          }
          case "path": {
            const ns = Array.isArray(o.through) ? (o.through as unknown[]) : [];
            if (ns.length < 2 || !ns.every((x) => typeof x === "string")) throw new SpecError(`${kp}.through must list at least two point names`);
            const pts = (ns as string[]).map((n, j) => point(n, `${kp}.through[${j}]`));
            const closed = o.closed === true;
            const n = pts.length;
            for (let j = 0; j < (closed ? n : n - 1); j += 1) {
              if (vec.approxEqual(pts[j]!, pts[(j + 1) % n]!)) throw new SpecError(`${kp}: ${String(ns[j])} and ${String(ns[(j + 1) % n])} coincide -- a step of length zero`);
            }
            const arrows = o.arrows === undefined ? "each" : o.arrows;
            if (arrows !== "each" && arrows !== "end" && arrows !== "none") throw new SpecError(`${kp}.arrows must be "each", "end" or "none", got ${JSON.stringify(arrows)}`);
            return { shape: "path", names: ns as string[], pts, closed, arrows };
          }
          case "dimension": {
            const a = point(o.from, `${kp}.from`);
            const b = point(o.to, `${kp}.to`);
            if (vec.approxEqual(a, b)) throw new SpecError(`${path}: the two points coincide -- there is no length to dimension`);
            const offset = o.offset === undefined ? 0.12 * vec.distance(a, b) : v.finite(o.offset, `${kp}.offset`);
            if (!(offset > 0)) throw new SpecError(`${kp}.offset is a distance from the measured points to the dimension line, and must be positive`);
            const side = o.side === -1 ? -1 : 1;
            return { shape: "dimension", a, b, offset, side, names: [o.from as string, o.to as string] };
          }
          default: {
            // rotationAxis: a dashed axis through P and Q, extended past both, with curved turn arrows.
            const [np, nq] = names(o.through, 2, `${kp}.through`);
            const p = point(np, `${kp}.through[0]`);
            const q = point(nq, `${kp}.through[1]`);
            if (vec.approxEqual(p, q)) throw new SpecError(`${path}: ${np} and ${nq} coincide -- no axis`);
            const extend = o.extend === undefined ? 0.3 : v.finite(o.extend, `${kp}.extend`);
            if (!(extend >= 0 && extend <= 2)) throw new SpecError(`${kp}.extend is a fraction of the axis length, 0 to 2`);
            const arrows = o.arrows === undefined ? "last" : o.arrows;
            if (arrows !== "both" && arrows !== "first" && arrows !== "last" && arrows !== "none") throw new SpecError(`${kp}.arrows must be "both", "first", "last" or "none"`);
            return { shape: "axis", p, q, extend, arrows, turn: o.turn === -1 ? -1 : 1 };
          }
        }
      });
      const dim = data.shape === "dimension";
      const ax = data.shape === "axis";
      objects.set(name, {
        kind: "shape",
        name,
        data,
        style: {
          colour: colour ?? (data.shape === "path" ? CONIC : ax ? SOFT : INK),
          width: dim ? 1.3 : data.shape === "belt" ? 2.6 : data.shape === "path" ? 2.6 : ax ? 1.5 : 2,
          dashed: ax || dashed,
          ...hid,
        },
        label,
        fill: typeof raw.fill === "string" ? raw.fill : null,
        hatch: hatchOf(raw.hatch, `${path}.hatch`),
        given: raw.given === true,
      });
      order.push(name);
      return;
    }

    // ---- conics ----
    const show = new Set<string>();
    if (raw.show !== undefined) {
      if (!Array.isArray(raw.show) || !raw.show.every((x) => typeof x === "string")) throw new SpecError(`${path}.show must be a list of names`);
      const allowed = kind === "parabola" ? ["focus", "vertex", "axis", "equation"] : kind === "hyperbola" ? ["foci", "vertices", "asymptotes", "equation"] : ["foci", "vertices", "equation"];
      for (const s of raw.show as string[]) {
        if (!allowed.includes(s)) throw new SpecError(`${path}.show: "${s}" is not something a ${kind} shows -- one of ${allowed.join(", ")}`);
        show.add(s);
      }
    }
    const conic = run(path, (): Conic => {
      const o = v.object(arg, kp);
      if (kind === "parabola") {
        const focus = point(o.focus, `${kp}.focus`);
        const d = linear(o.directrix, `${kp}.directrix`).line;
        const foot = vec.footOfPerpendicular2(focus, d);
        const dist = vec.distance(focus, foot);
        if (dist <= 1e-9 * Math.max(1, Math.abs(focus[0]), Math.abs(focus[1]))) {
          throw new SpecError(`${path}: the focus "${String(o.focus)}" lies on the directrix "${String(o.directrix)}" -- that parabola degenerates to a line`);
        }
        return { type: "parabola", focus, vertex: vec.lerp(focus, foot, 0.5), p: dist / 2, axis: vec.normalize(vec.sub(focus, foot)), directrix: d };
      }
      if (o.foci !== undefined) {
        const [f1, f2] = names(o.foci, 2, `${kp}.foci`).map((n, j) => point(n, `${kp}.foci[${j}]`)) as [Vec2, Vec2];
        const a = length(o.a, `${kp}.a`);
        const c = vec.distance(f1, f2) / 2;
        if (c <= TOL) throw new SpecError(`${path}: the two foci coincide -- give a circle, or a center with a and b`);
        const axis = vec.normalize(vec.sub(f2, f1));
        const center = vec.lerp(f1, f2, 0.5);
        if (kind === "ellipse") {
          if (a <= c + TOL) throw new SpecError(`${path}: a = ${formatNumber(a, locale)} but the foci are ${formatNumber(2 * c, locale)} apart -- an ellipse needs 2a greater than the focal distance`);
          return { type: "ellipse", center, a, b: Math.sqrt(a * a - c * c), axis, foci: [f1, f2] };
        }
        if (a >= c - TOL) throw new SpecError(`${path}: a = ${formatNumber(a, locale)} but the foci are ${formatNumber(2 * c, locale)} apart -- a hyperbola needs 2a less than the focal distance`);
        return { type: "hyperbola", center, a, b: Math.sqrt(c * c - a * a), axis, foci: [f1, f2] };
      }
      const center = point(o.center, `${kp}.center`);
      const a = length(o.a, `${kp}.a`);
      const b = length(o.b, `${kp}.b`);
      const deg = o.rotation === undefined ? 0 : v.finite(o.rotation, `${kp}.rotation`);
      const axis = rotateAbout([1, 0], [0, 0], deg);
      if (kind === "ellipse") {
        if (b > a + TOL) throw new SpecError(`${path}: b = ${formatNumber(b, locale)} is greater than a = ${formatNumber(a, locale)} -- a is the semi-major axis; swap them and turn the ellipse 90°`);
        const c = Math.sqrt(Math.max(0, a * a - b * b));
        return { type: "ellipse", center, a, b, axis, foci: [vec.sub(center, vec.scale(axis, c)), vec.add(center, vec.scale(axis, c))] };
      }
      const c = Math.sqrt(a * a + b * b);
      return { type: "hyperbola", center, a, b, axis, foci: [vec.sub(center, vec.scale(axis, c)), vec.add(center, vec.scale(axis, c))] };
    });
    if (show.has("equation") && conicEquation(conic) === null) {
      throw new SpecError(`${path}: "${name}" is turned relative to the coordinate axes, so it has no canonical equation -- drop "equation" from show`);
    }
    let focusNames: [string, string] | undefined;
    if (raw.focusNames !== undefined) focusNames = names(raw.focusNames, 2, `${path}.focusNames`).map((n, j) => checkedLabelName(n, `${path}.focusNames[${j}]`)) as [string, string];
    objects.set(name, {
      kind: "conic",
      name,
      conic,
      style: { colour: colour ?? (dashed ? GUIDE : CONIC), width: dashed ? 1.4 : 2.2, dashed, ...hid },
      show,
      label,
      ...(focusNames === undefined ? {} : { focusNames }),
    });
    order.push(name);
  });

  return { objects, order };
}

function checkedLabelName(n: string, path: string): string {
  return typedCoordinate(n) === null ? n : checkedText(n, path);
}

function describe(o: ConstructionObject): string {
  return o.kind === "linear" ? "line" : o.kind === "conic" ? o.conic.type : o.kind === "shape" ? o.data.shape : o.kind;
}

function nonDegenerate(a: Vec2, b: Vec2, c: Vec2, path: string, label: string): void {
  const area2 = Math.abs(vec.cross2(vec.sub(b, a), vec.sub(c, a)));
  const scale = Math.max(vec.lengthSquared(vec.sub(b, a)), vec.lengthSquared(vec.sub(c, a)), 1e-300);
  if (area2 / scale <= 1e-9) {
    throw new SpecError(`${path}: the triangle ${label} is degenerate -- its three vertices are collinear (or two coincide)`);
  }
}

/** `{"A": [0, 0]}` is `{"name": "A", "at": [0, 0]}`. */
function normalise(raw: unknown, path: string): Record<string, unknown> {
  const o = v.object(raw, path);
  if (o.name === undefined) {
    const keys = Object.keys(o).filter((k) => !OPTION_KEYS.has(k));
    if (keys.length === 1 && !ALL_KINDS.includes(keys[0]!) && Array.isArray(o[keys[0]!])) {
      const key = keys[0]!;
      return { ...o, name: key, at: o[key], [key]: undefined };
    }
    throw new SpecError(`${path} needs a "name" (or write a free point as {"A": [x, y]})`);
  }
  if (typeof o.name !== "string" || o.name.trim() === "") throw new SpecError(`${path}.name must be a non-empty string`);
  return o;
}

// ---- the build -----------------------------------------------------------------------

type View = { xMin: number; xMax: number; yMin: number; yMax: number };

/** Clip the parametric line p + t·d, t ∈ [lo, hi], to the view. Null when it misses. */
function clipLine(p: Vec2, d: Vec2, lo: number, hi: number, view: View): [Vec2, Vec2] | null {
  let t0 = lo;
  let t1 = hi;
  for (const [dd, q0, qMin, qMax] of [
    [d[0], p[0], view.xMin, view.xMax],
    [d[1], p[1], view.yMin, view.yMax],
  ] as const) {
    if (Math.abs(dd) < 1e-15) {
      if (q0 < qMin || q0 > qMax) return null;
      continue;
    }
    let a = (qMin - q0) / dd;
    let b = (qMax - q0) / dd;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
  }
  if (t0 >= t1) return null;
  return [vec.add(p, vec.scale(d, t0)), vec.add(p, vec.scale(d, t1))];
}

/** Split a sampled curve into the runs that lie inside the view, cut exactly at its edges. */
function clipPolyline(pts: Vec2[], view: View): Vec2[][] {
  const runs: Vec2[][] = [];
  let current: Vec2[] = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const seg = clipLine(a, vec.sub(b, a), 0, 1, view);
    if (seg === null) {
      if (current.length > 1) runs.push(current);
      current = [];
      continue;
    }
    if (current.length === 0) current.push(seg[0]);
    else if (!vec.approxEqual(current[current.length - 1]!, seg[0], 1e-12)) {
      if (current.length > 1) runs.push(current);
      current = [seg[0]];
    }
    current.push(seg[1]);
    if (!vec.approxEqual(seg[1], b, 1e-12)) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 1) runs.push(current);
  return runs;
}

const safeId = (s: string): string => s.replace(/[^A-Za-z0-9_-]/g, (ch) => `_${ch.codePointAt(0)!.toString(16)}`);

type LabelJob = {
  order: number;
  run: () => void;
};

export function expandConstruction(input: ConstructionInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const model = computeConstruction(input);
  const { objects } = model;
  const axes = input.axes === true;
  const answers = input.answers !== false;
  const unitSuffix = input.unit === undefined ? "" : ` ${input.unit}`;

  // ---- annotations: read and computed before anything is drawn ----
  // `withheld` segments (answers: false, "answer": true) stay addressable so an annotation on one is not an error;
  // they are simply never drawn, ticked or measured.
  type SegStyle = { colour: string; width: number; dashed: boolean };
  /**
   * `alias` is how an annotation names a run an extension shape owns ("belt.t1", "S.r2", "walk.3"). A `lazy` run
   * (a sector's radii, already inside its outline) is drawn only when an annotation measures it (`need`); an `extra`
   * run (a circle's radius, asked for by a radius annotation) is drawn in its own `style`.
   */
  type Seg = { id: string; a: Vec2; b: Vec2; ends: [string, string]; poly: string | null; withheld: boolean; alias?: string; shape?: string; lazy?: boolean; need?: boolean; extra?: SegStyle };
  const segments: Seg[] = [];
  for (const name of model.order) {
    const o = objects.get(name)!;
    if (o.style.hidden && o.style.withheld !== true) continue;
    const withheld = o.style.withheld === true;
    if (o.kind === "linear" && o.extent.kind === "segment") {
      const ends: [string, string] = o.ends ?? ["", ""];
      segments.push({ id: `o-${safeId(name)}`, a: o.extent.a, b: o.extent.b, ends, poly: null, withheld });
    }
    if (o.kind === "polygon") {
      o.vertices.forEach((vn, j) => {
        const wn = o.vertices[(j + 1) % o.vertices.length]!;
        segments.push({ id: `side-${safeId(name)}-${safeId(vn)}-${safeId(wn)}`, a: o.pts[j]!, b: o.pts[(j + 1) % o.pts.length]!, ends: [vn, wn], poly: name, withheld });
      });
    }
    if (o.kind === "shape") {
      const d = o.data;
      const base = `o-${safeId(name)}`;
      if (d.shape === "sector") {
        const p0 = arcPoint(d.c, d.r, d.a0);
        const p1 = arcPoint(d.c, d.r, d.a0 + d.span);
        segments.push({ id: `${base}-r1`, a: d.c, b: p0, ends: ["", ""], poly: null, withheld, alias: `${name}.r1`, shape: name, lazy: true });
        segments.push({ id: `${base}-r2`, a: d.c, b: p1, ends: ["", ""], poly: null, withheld, alias: `${name}.r2`, shape: name, lazy: true });
      } else if (d.shape === "belt") {
        const t = d.touch;
        segments.push({ id: `${base}-t1`, a: d.geo.tangents[0][0], b: d.geo.tangents[0][1], ends: [t[0] ?? "", t[1] ?? ""], poly: null, withheld, alias: `${name}.t1`, shape: name });
        segments.push({ id: `${base}-t2`, a: d.geo.tangents[1][0], b: d.geo.tangents[1][1], ends: [t[2] ?? "", t[3] ?? ""], poly: null, withheld, alias: `${name}.t2`, shape: name });
      } else if (d.shape === "path") {
        const n = d.pts.length;
        for (let j = 0; j < (d.closed ? n : n - 1); j += 1) {
          segments.push({ id: `${base}-${j + 1}`, a: d.pts[j]!, b: d.pts[(j + 1) % n]!, ends: [d.names[j]!, d.names[(j + 1) % n]!], poly: null, withheld, alias: `${name}.${j + 1}`, shape: name });
        }
      }
    }
  }
  // A segment's endpoints by name, when it has them: a drawn segment whose
  // ends are two named points is "AB" to an annotation.
  const endsOf = (s: Seg): string => [...s.ends].sort().join("|");
  const findSegment = (ref: unknown, path: string): Seg => {
    const found = findSegment0(ref, path);
    found.need = true;
    return found;
  };
  const findSegment0 = (ref: unknown, path: string): Seg => {
    if (typeof ref === "string") {
      const aliased = segments.find((s) => s.alias === ref);
      if (aliased !== undefined) return aliased;
      const direct =segments.find((s) => s.id === `o-${safeId(ref)}`);
      if (direct !== undefined) return direct;
      if (objects.has(ref)) {
        const o = objects.get(ref)!;
        if (o.style.hidden) throw new SpecError(`${path}: "${ref}" is hidden, so it has no drawn length to label`);
        throw new SpecError(`${path}: "${ref}" is a ${describe(o)}, not a drawn segment -- only a segment has a length`);
      }
      // "AB" as two point names run together, when both exist.
      const pair = splitPair(ref, objects);
      if (pair !== null) return findSegment0(pair, path);
      v.knownId(ref, new Set(segments.filter((s) => s.poly === null).map((s) => s.id.slice(2))), path, "a segment");
    }
    if (Array.isArray(ref) && ref.length === 2 && ref.every((x) => typeof x === "string")) {
      const key = [...(ref as string[])].sort().join("|");
      const found = segments.find((s) => endsOf(s) === key);
      if (found === undefined) {
        for (const n of ref as string[]) v.knownId(n, new Set(objects.keys()), path, "a point");
        throw new SpecError(`${path}: no segment ${(ref as string[]).join("")} is drawn -- declare {"segment": ["${ref[0]}", "${ref[1]}"]} or a polygon with that side`);
      }
      return found;
    }
    throw new SpecError(`${path} must name a segment, or give its two endpoints as ["A", "B"]`);
  };

  type LengthNote = { seg: Seg; name: string | null; given: boolean };
  type AngleNote = { a: Vec2; vtx: Vec2; b: Vec2; label: string; names: [string, string, string]; name: string | null; degrees: number };
  /** An area, arc length or sector angle printed beside a shape (ADR 0067). */
  type ShapeNote = { kind: "area" | "arc" | "angle"; target: string; text: string; colour: string };
  const lengthNotes: LengthNote[] = [];
  const angleNotes: AngleNote[] = [];
  const shapeNotes: ShapeNote[] = [];
  const needFill = new Set<string>();
  const needArc = new Set<string>();
  const tickGroups: Seg[][] = [];
  const readings: string[] = [];
  let radiusCount = 0;

  (input.annotations ?? []).forEach((raw, i) => {
    const path = `annotations[${i}]`;
    const o = v.object(raw, path);
    const kinds = ["length", "angle", "equal", "equation", "area", "arc", "radius"].filter((k) => o[k] !== undefined);
    if (kinds.length !== 1) throw new SpecError(`${path} must be exactly one of length, angle, equal, equation, area, arc, radius`);
    const kind = kinds[0]!;
    const name = o.name === undefined ? null : checkedText(o.name, `${path}.name`);
    if (o.given !== undefined && typeof o.given !== "boolean") throw new SpecError(`${path}.given must be true or false`);
    // `given`: the exercise states this value, so it stays when answers is false.
    const given = o.given === true;
    const shows = answers || given;
    const refObj = (key: string, what: string): ConstructionObject => {
      const t = o[key];
      if (typeof t !== "string") throw new SpecError(`${path}.${key} must name ${what}`);
      v.knownId(t, new Set(objects.keys()), `${path}.${key}`, what);
      return objects.get(t)!;
    };
    const unit2 = input.unit === undefined ? "" : ` ${input.unit}²`;
    if (kind === "area" || kind === "arc") {
      const obj = refObj(kind, "a shape, polygon or circle");
      const region = regionOf(obj);
      if (region === null) throw new SpecError(`${path}.${kind}: "${obj.name}" is a ${describe(obj)}, which encloses no region`);
      if (obj.style.hidden) throw new SpecError(`${path}.${kind}: "${obj.name}" is hidden, so there is nothing drawn to label`);
      if (kind === "arc") {
        const ok = (obj.kind === "shape" && (obj.data.shape === "sector" || obj.data.shape === "semicircle")) || obj.kind === "circle";
        if (!ok || region.arcLength === undefined) throw new SpecError(`${path}.arc: an arc length is of a sector, a semicircle or a circle, and "${obj.name}" is a ${describe(obj)}`);
        const len = obj.kind === "circle" ? region.arcLength : (region.pieces ?? []).reduce((s, p) => s + (p.kind === "arc" ? p.r * Math.abs(p.span) : 0), 0);
        needArc.add(obj.name);
        const full = `${name === null ? "ℓ" : name} = ${measuredLabel(len, locale)}${unitSuffix}`;
        if (shows) shapeNotes.push({ kind: "arc", target: obj.name, text: full, colour: INK });
        else if (name !== null) shapeNotes.push({ kind: "arc", target: obj.name, text: name, colour: INK });
        return;
      }
      needFill.add(obj.name);
      const full = `${name === null ? "A" : name} = ${measuredLabel(region.area, locale)}${unit2}`;
      if (shows) shapeNotes.push({ kind: "area", target: obj.name, text: full, colour: INK });
      else if (name !== null) shapeNotes.push({ kind: "area", target: obj.name, text: name, colour: INK });
      return;
    }
    if (kind === "radius") {
      const obj = refObj("radius", "a sector, ring, semicircle or circle");
      const which = o.which === undefined ? "outer" : o.which;
      if (which !== "inner" && which !== "outer") throw new SpecError(`${path}.which must be "inner" or "outer"`);
      if (obj.style.hidden) throw new SpecError(`${path}.radius: "${obj.name}" is hidden`);
      if (obj.kind === "shape" && obj.data.shape === "sector") {
        const seg = findSegment(`${obj.name}.r1`, `${path}.radius`);
        if (!seg.withheld) lengthNotes.push({ seg, name: name ?? "r", given });
        return;
      }
      let centre: Vec2;
      let r: number;
      let defaultName = "r";
      if (obj.kind === "circle") ({ center: centre, radius: r } = obj.circle);
      else if (obj.kind === "shape" && obj.data.shape === "semicircle") ({ c: centre, r } = obj.data);
      else if (obj.kind === "shape" && obj.data.shape === "ring") {
        centre = obj.data.c;
        r = which === "inner" ? obj.data.rIn : obj.data.rOut;
        defaultName = which === "inner" ? "r" : "R";
      } else throw new SpecError(`${path}.radius: "${obj.name}" is a ${describe(obj)} -- a radius is of a sector, ring, semicircle or circle`);
      const at = o.at === undefined ? (which === "inner" ? 135 : 45) : v.finite(o.at, `${path}.at`);
      radiusCount += 1;
      const seg: Seg = { id: `o-${safeId(obj.name)}-rad${radiusCount}`, a: centre, b: arcPoint(centre, r, rad(at)), ends: ["", ""], poly: null, withheld: false, extra: { colour: INK, width: 1.5, dashed: false }, need: true };
      segments.push(seg);
      lengthNotes.push({ seg, name: name ?? defaultName, given });
      return;
    }
    if (kind === "length") {
      const seg = findSegment(o.length, `${path}.length`);
      // Without answers a length is what the exercise asks for: a named one prints as its bare name (the unknown),
      // an unnamed one prints nothing.
      if (!seg.withheld && (answers || name !== null || given)) lengthNotes.push({ seg, name, given });
      return;
    }
    if (kind === "angle" && typeof o.angle === "string") {
      const obj = refObj("angle", "a sector");
      if (obj.kind !== "shape" || obj.data.shape !== "sector") throw new SpecError(`${path}.angle: "${obj.name}" is a ${describe(obj)} -- a sector's angle is the only one named by one word; give three points otherwise`);
      if (obj.style.hidden) throw new SpecError(`${path}.angle: "${obj.name}" is hidden`);
      const degrees = (obj.data.span * 180) / Math.PI;
      const shown = shows ? name : name ?? "?";
      shapeNotes.push({ kind: "angle", target: obj.name, text: shown ?? `${measuredLabel(degrees, locale)}°`, colour: shown === null ? INK : UNKNOWN });
      return;
    }
    if (kind === "angle") {
      const ns = names(o.angle, 3, `${path}.angle`) as [string, string, string];
      const pts = ns.map((n, j) => {
        v.knownId(n, new Set(objects.keys()), `${path}.angle[${j}]`, "a point");
        const p = objects.get(n)!;
        if (p.kind !== "point") throw new SpecError(`${path}.angle[${j}]: "${n}" is a ${describe(p)}, not a point`);
        return p.p;
      }) as [Vec2, Vec2, Vec2];
      if (vec.approxEqual(pts[0], pts[1]) || vec.approxEqual(pts[2], pts[1])) throw new SpecError(`${path}: an arm of the angle ${ns.join("")} has no length`);
      const withheld = ns.some((n) => objects.get(n)!.style.withheld === true);
      const degrees = angleAt(pts[0], pts[1], pts[2]);
      if (degrees < 1e-6 || degrees > 180 - 1e-6) {
        throw new SpecError(`${path}: the angle ${ns.join("")} is ${degrees < 1 ? "zero" : "flat (180°)"} -- there is no angle to mark`);
      }
      if (withheld) return;
      // Without answers an unnamed angle is marked "?": the value is the answer, the arc says which angle.
      const shownName = answers || given ? name : name ?? "?";
      angleNotes.push({ a: pts[0], vtx: pts[1], b: pts[2], names: ns, name: shownName, degrees, label: shownName ?? `${measuredLabel(degrees, locale)}°` });
      return;
    }
    if (kind === "equal") {
      if (!Array.isArray(o.equal) || o.equal.length < 2) throw new SpecError(`${path}.equal must list at least two segments`);
      const segs = (o.equal as unknown[]).map((r, j) => findSegment(r, `${path}.equal[${j}]`));
      const l0 = vec.distance(segs[0]!.a, segs[0]!.b);
      segs.forEach((s, j) => {
        const l = vec.distance(s.a, s.b);
        if (Math.abs(l - l0) > 1e-9 * Math.max(1, l0)) {
          throw new SpecError(
            `${path}: ${s.ends.join("")} is ${formatNumber(l, locale, { decimals: 3 })} long but ${segs[0]!.ends.join("")} is ${formatNumber(l0, locale, { decimals: 3 })} -- equal ticks would claim what the construction does not give (item ${j})`,
          );
        }
      });
      if (!segs.some((s) => s.withheld)) tickGroups.push(segs);
      return;
    }
    // equation
    if (!answers) return;
    const target = o.equation;
    if (typeof target !== "string") throw new SpecError(`${path}.equation must name a line, circle or conic`);
    v.knownId(target, new Set(objects.keys()), `${path}.equation`, "an object");
    const obj = objects.get(target)!;
    if (obj.kind === "linear") readings.push(`${target}: ${lineEquation(obj.line, locale)}`);
    else if (obj.kind === "circle") readings.push(`${target}: ${circleEquation(obj.circle, locale)}`);
    else if (obj.kind === "conic") {
      const eq = conicEquation(obj.conic, locale);
      if (eq === null) throw new SpecError(`${path}: "${target}" is turned relative to the axes -- it has no canonical equation`);
      readings.push(`${target}: ${eq}`);
    } else throw new SpecError(`${path}.equation: "${target}" is a ${describe(obj)}, which has no equation`);
  });

  if (input.equalTicks === true) {
    const used = new Set(tickGroups.flat().map((s) => s.id));
    const free = segments.filter((s) => !used.has(s.id) && !s.withheld && !(s.lazy === true && s.need !== true));
    const groups: Seg[][] = [];
    for (const s of free) {
      const l = vec.distance(s.a, s.b);
      const g = groups.find((gr) => Math.abs(vec.distance(gr[0]!.a, gr[0]!.b) - l) <= 1e-9 * Math.max(1, l));
      if (g === undefined) groups.push([s]);
      else g.push(s);
    }
    for (const g of groups) if (g.length >= 2) tickGroups.push(g);
  }
  if (tickGroups.length > 3) throw new SpecError(`construction: ${tickGroups.length} groups of equal segments -- more than three tick styles cannot be told apart`);

  // ---- conics' extra points and lines ----
  type Extra = { id: string; p: Vec2; label: string };
  const extraPoints: Extra[] = [];
  type ExtraLine = { id: string; line: Line2; label: string | null };
  const extraLines: ExtraLine[] = [];
  for (const name of model.order) {
    const o = objects.get(name)!;
    if (o.kind !== "conic" || o.style.hidden) continue;
    const c = o.conic;
    const base = `o-${safeId(name)}`;
    if (c.type === "parabola") {
      if (o.show.has("vertex")) extraPoints.push({ id: `${base}-V`, p: c.vertex, label: "V" });
      if (o.show.has("axis")) extraLines.push({ id: `${base}-axis`, line: { point: c.vertex, direction: c.axis }, label: null });
    } else {
      const fromPoints = [...objects.values()].some((p) => p.kind === "point" && (vec.approxEqual(p.p, c.foci[0]) || vec.approxEqual(p.p, c.foci[1])));
      if (o.show.has("foci") && !fromPoints) {
        const [n1, n2] = o.focusNames ?? ["F₁", "F₂"];
        extraPoints.push({ id: `${base}-F1`, p: c.foci[0], label: n1 }, { id: `${base}-F2`, p: c.foci[1], label: n2 });
      }
      if (o.show.has("vertices")) {
        extraPoints.push(
          { id: `${base}-A1`, p: vec.sub(c.center, vec.scale(c.axis, c.a)), label: "A₁" },
          { id: `${base}-A2`, p: vec.add(c.center, vec.scale(c.axis, c.a)), label: "A₂" },
        );
        if (c.type === "ellipse") {
          const w = vec.perpendicular2(c.axis);
          extraPoints.push(
            { id: `${base}-B1`, p: vec.sub(c.center, vec.scale(w, c.b)), label: "B₁" },
            { id: `${base}-B2`, p: vec.add(c.center, vec.scale(w, c.b)), label: "B₂" },
          );
        }
      }
      if (c.type === "hyperbola" && o.show.has("asymptotes")) {
        const w = vec.perpendicular2(c.axis);
        [1, -1].forEach((s, k) => {
          const line: Line2 = { point: c.center, direction: vec.add(vec.scale(c.axis, c.a), vec.scale(w, s * c.b)) };
          extraLines.push({ id: `${base}-asymptote-${k + 1}`, line, label: null });
          if (answers) readings.push(`assíntota: ${lineEquation(line, locale)}`);
        });
      }
    }
    if (answers && o.show.has("equation")) readings.unshift(`${name}: ${conicEquation(c, locale)!}`);
  }

  // Length and angle readings: what the drawing cannot say exactly.
  for (const n of answers ? lengthNotes : []) {
    const l2 = vec.lengthSquared(vec.sub(n.seg.b, n.seg.a));
    const exactText = sqrtLabel(l2, locale);
    const drawn = measuredLabel(Math.sqrt(l2), locale);
    // Only a length whose square is rational has an exact form worth a line
    // (√13, 7/3); any other is already as exact as it gets on the drawing.
    if (exactText !== drawn && rationalSquare(l2)) {
      const who = n.name ?? n.seg.ends.join("");
      readings.push(`${who} = ${exactText}${unitSuffix} ≈ ${drawn}${unitSuffix}`);
    }
  }
  // A belt's length is made of arcs and tangents: the drawing cannot state it as one run, so the panel does (computed, never typed).
  for (const name of answers ? model.order : []) {
    const o = objects.get(name)!;
    if (o.kind === "shape" && o.data.shape === "belt" && !o.style.hidden) {
      readings.push(`comprimento de ${o.label ?? name} = ${measuredLabel(o.data.geo.length, locale)}${unitSuffix}`);
    }
  }
  for (const n of angleNotes) {
    if (n.name !== null) continue; // (every angle has a name without answers, so none is read out then)
    const rounded = Math.abs(n.degrees - Math.round(n.degrees * 100) / 100) > 1e-9 * n.degrees;
    if (rounded) readings.push(`∠${n.names.join("")} ≈ ${measuredLabel(n.degrees, locale)}°`);
  }

  // ---- the view: every drawn object's extent, never a line's ----
  const xs: number[] = [];
  const ys: number[] = [];
  const touch = (p: Vec2, r = 0): void => {
    xs.push(p[0] - r, p[0] + r);
    ys.push(p[1] - r, p[1] + r);
  };
  if (axes) touch([0, 0]);
  for (const name of model.order) {
    const o = objects.get(name)!;
    // A withheld object still bounds the view: the question's plane is the answer's plane.
    if (o.style.hidden && o.style.withheld !== true) continue;
    if (o.kind === "point") touch(o.p);
    else if (o.kind === "linear") {
      if (o.extent.kind === "segment") {
        touch(o.extent.a);
        touch(o.extent.b);
      } else if (o.extent.kind === "ray") touch(o.extent.from);
    } else if (o.kind === "circle") touch(o.circle.center, o.circle.radius);
    else if (o.kind === "polygon") o.pts.forEach((p) => touch(p));
    else if (o.kind === "shape") {
      const d = o.data;
      if (d.shape === "belt") {
        touch(d.c1.center, d.c1.radius);
        touch(d.c2.center, d.c2.radius);
      } else if (d.shape === "path") d.pts.forEach((p) => touch(p));
      else if (d.shape === "dimension") {
        const g = dimensionGeometry(d.a, d.b, d.offset, d.side, 0, 0);
        g.line.forEach((p) => touch(p));
        touch(d.a);
        touch(d.b);
      } else if (d.shape === "axis") {
        const e = vec.scale(vec.sub(d.q, d.p), d.extend);
        touch(vec.sub(d.p, e));
        touch(vec.add(d.q, e));
      } else if (d.shape === "ring") touch(d.c, d.rOut);
      else if (d.shape === "semicircle") touch(d.c, d.r);
      else regionOf(o)?.poly.forEach((p) => touch(p));
    } else {
      const c = o.conic;
      if (c.type === "ellipse") {
        const w = vec.perpendicular2(c.axis);
        const hx = Math.hypot(c.a * c.axis[0], c.b * w[0]);
        const hy = Math.hypot(c.a * c.axis[1], c.b * w[1]);
        xs.push(c.center[0] - hx, c.center[0] + hx);
        ys.push(c.center[1] - hy, c.center[1] + hy);
        c.foci.forEach((f) => touch(f));
      } else if (c.type === "hyperbola") {
        c.foci.forEach((f) => touch(f));
        // Each branch is shown out to where |y| = 1,6b along it (sinh t =
        // 1,6): far enough that it has plainly turned towards its
        // asymptotes, near enough that the vertices are not lost.
        const t0 = Math.asinh(1.6);
        for (const s of [1, -1]) for (const t of [t0, -t0]) touch(conicPoint(c, s, t));
      } else {
        touch(c.focus);
        touch(c.vertex);
        const w = vec.perpendicular2(c.axis);
        // Out past the latus rectum (s = ±2p, level with the focus) to
        // s = ±3p, and back to the directrix.
        const s = 3 * c.p;
        touch(vec.add(c.vertex, vec.add(vec.scale(c.axis, (s * s) / (4 * c.p)), vec.scale(w, s))));
        touch(vec.add(c.vertex, vec.add(vec.scale(c.axis, (s * s) / (4 * c.p)), vec.scale(w, -s))));
        touch(vec.footOfPerpendicular2(c.focus, c.directrix));
      }
    }
  }
  for (const e of extraPoints) touch(e.p);
  if (xs.length === 0) throw new SpecError("construction: nothing is drawn -- every object is hidden");

  let view: View = { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys) };
  // Everything below is in proportion to the figure's own extent: the same triangle at 3, at 3000 or at 0,03 is the same
  // figure, with a tick step of 1, 2 or 5 x 10^k and about a dozen numbers to an axis at most.
  const spanRaw = Math.max(view.xMax - view.xMin, view.yMax - view.yMin) || 1;
  const lattice = !axes && input.grid !== undefined && input.grid !== false;
  const latticeStep = typeof input.grid === "object" && input.grid.step !== undefined ? input.grid.step : 1;
  if (lattice && !(latticeStep > 0)) throw new SpecError("construction.grid.step must be a positive cell size");
  const pad = lattice ? 0.5 * latticeStep : (axes ? 0.13 : 0.08) * spanRaw;
  view = { xMin: view.xMin - pad, xMax: view.xMax + pad, yMin: view.yMin - pad, yMax: view.yMax + pad };
  const step = lattice ? latticeStep : niceStep(Math.max(view.xMax - view.xMin, view.yMax - view.yMin), AXIS_TICKS);
  if (lattice && (view.xMax - view.xMin) / latticeStep + (view.yMax - view.yMin) / latticeStep > 80) {
    throw new SpecError(`construction.grid: a cell of ${formatNumber(latticeStep, locale)} makes more than 80 cells across the figure -- give a larger "step"`);
  }
  if (axes || lattice) {
    view = {
      xMin: Math.floor(view.xMin / step) * step,
      xMax: Math.ceil(view.xMax / step) * step,
      yMin: Math.floor(view.yMin / step) * step,
      yMax: Math.ceil(view.yMax / step) * step,
    };
  }
  const spanX = view.xMax - view.xMin;
  const spanY = view.yMax - view.yMin;
  const fitted = fitUnits(spanX, spanY, { targetWidth: PLOT_TARGET_PX, targetHeight: PLOT_TARGET_PX, equal: true }).xUnit;
  // A tick number can only step off a curve crossing its axis (ADR 0034) when half a division leaves room beside it:
  // at least 48px a division. (The step was chosen for that; this keeps it true after the range is widened to whole ticks.)
  const unit = axes ? Math.max(fitted, TICK_ROOM_PX / step) : fitted;
  const plotWidth = Math.ceil(2 * MARGIN + spanX * unit);
  const plotHeight = Math.ceil(2 * MARGIN + spanY * unit);

  // One reading a line, never wrapped: an equation parted across lines reads wrong.
  const readingPanel = layoutPanel(
    readings.map((text, i) => ({ text: [{ text }], id: String(i + 1), wrap: false })),
    { width: Infinity, size: 13, lineHeight: CAPTION_LINE_H, emphasis: "soft" },
  );
  const width = Math.max(plotWidth, readingPanel.width + 2 * 24);
  const offsetX = Math.round((width - plotWidth) / 2);
  const height = plotHeight + (readingPanel.empty ? 0 : readingPanel.height + 16);

  const grid: GridSpec | undefined = axes
    ? { x: { from: view.xMin, to: view.xMax, step, origin: 0 }, y: { from: view.yMin, to: view.yMax, step, origin: 0 }, locale }
    : lattice
      ? { x: { from: view.xMin, to: view.xMax, step, origin: 0 }, y: { from: view.yMin, to: view.yMax, step, origin: 0 }, axes: false, labels: false, stroke: "#C4CAD3", locale }
      : undefined;
  const frame: Frame & { origin: Point } = {
    id: "plane",
    origin: { x: offsetX + MARGIN - view.xMin * unit, y: MARGIN + view.yMax * unit },
    xUnit: unit,
    yUnit: unit,
    ...(grid === undefined ? {} : { grid }),
    ...(input.unit === undefined ? {} : { unit: input.unit }),
  };
  const at = (p: Vec2): Point => resolveInFrame(frame, p[0], p[1]);
  const framed = (p: Vec2): FramedPoint => ({ frame: frame.id, x: p[0], y: p[1] });

  const board = new Board(width, height, PAPER);
  board.frames.push(frame);
  const placer = new Placer({ x: 6, y: 6, width: width - 12, height: plotHeight - 10 });
  if (grid !== undefined) {
    for (const t of tickPlan(frame, grid)) placer.reserve(t.spots[0]!.box);
    const spans = (a: { from: number; to: number }): boolean => axes && a.from <= 0 && a.to >= 0;
    if (spans(grid.y)) placer.addInk("plane-axis-x", [at([view.xMin, 0]), at([view.xMax, 0])], false);
    if (spans(grid.x)) placer.addInk("plane-axis-y", [at([0, view.yMin]), at([0, view.yMax])], false);
  }

  const marks: Mark[] = [];
  const connectors: Connector[] = [];
  const lineMark = (id: string, pts: Point[], style: { colour: string; width: number; dashed: boolean }, close = false): void => {
    marks.push({
      id,
      from: pts[0]!,
      segments: pts.slice(1).map((p) => ({ line: p })),
      close,
      fill: "none",
      stroke: style.colour,
      strokeWidth: style.width,
      ...(style.dashed ? { lineStyle: "dashed" as const } : {}),
    });
    placer.addInk(id, close ? [...pts, pts[0]!] : pts);
  };
  /** A straight run stated in the plane's frame, so its length is measured (ADR 0028). */
  const measuredRun = (id: string, a: Vec2, b: Vec2, style: { colour: string; width: number; dashed: boolean }): void => {
    marks.push({
      id,
      from: framed(a),
      segments: [{ line: framed(b) }],
      close: false,
      fill: "none",
      stroke: style.colour,
      strokeWidth: style.width,
      ...(style.dashed ? { lineStyle: "dashed" as const } : {}),
    });
    placer.addInk(id, [at(a), at(b)]);
  };
  // ---- word-problem pictograms (ADR 0047): decoration, drawn beside the ----
  // ---- ink it stands on, never over it, and declared so labels see it. ----
  const pictoInk = (id: string, pts: Point[], closed = false): void => {
    marks.push({ id, from: pts[0]!, segments: pts.slice(1).map((p) => ({ line: p })), close: closed, fill: "none", stroke: INK, strokeWidth: 1.3 });
    // Pictogram ink is real drawn ink, not grid furniture, so it competes for
    // "nearest" like any other mark (ADR 0028) -- a point's own label must
    // still search past it, never merely avoid crossing it.
    placer.addInk(id, closed ? [...pts, pts[0]!] : pts, true);
  };
  const drawSegmentPicto = (name: string, kind: SegmentPicto, side: 1 | -1, a: Point, b: Point): void => {
    const base = `picto-${safeId(name)}`;
    if (kind === "ground" || kind === "wall" || kind === "ramp") {
      hatchTicks(a, b, side, HATCH_GAP, HATCH_LEN).forEach((seg, i) => pictoInk(`${base}-h${i}`, seg));
      return;
    }
    if (kind === "ladder") {
      const { rail2, rungs } = ladderGeometry(a, b, RAIL_GAP, RUNG_GAP);
      pictoInk(`${base}-rail`, rail2);
      rungs.forEach((r, i) => pictoInk(`${base}-rung${i}`, r));
      return;
    }
    const glyph = kind === "pole" ? poleGlyph(a, b) : kind === "tree" ? treeGlyph(a, b) : kind === "person" ? personGlyph(a, b) : buildingGlyph(a, b, side);
    glyph.forEach((g, i) => pictoInk(`${base}-${i}`, g.pts, g.closed === true));
  };
  const drawPointPicto = (name: string, kind: PointPicto, c: Point): void => {
    const base = `picto-${safeId(name)}`;
    (kind === "sun" ? sunGlyph(c) : boatGlyph(c)).forEach((g, i) => pictoInk(`${base}-${i}`, g.pts, g.closed === true));
  };
  const circlePts = (c: Circle2): Point[] => Array.from({ length: 121 }, (_, k) => at(vec.add(c.center, [c.radius * Math.cos((k * Math.PI) / 60), c.radius * Math.sin((k * Math.PI) / 60)] as Vec2)));
  const reach = Math.hypot(spanX, spanY) + Math.hypot((view.xMin + view.xMax) / 2, (view.yMin + view.yMax) / 2) + 1;
  // What a name label beside each object is placed along.
  const nameRuns = new Map<string, { id: string; pts: Point[]; centre?: Point }>();

  // ---- extension shapes (ADR 0067): their marks ----
  type ShapeObj = Extract<ConstructionObject, { kind: "shape" }>;
  type DimNote = { id: string; a: Point; b: Point; outward: Point; text: string | null };
  const dimNotes: DimNote[] = [];
  const hatchMarks = (id: string, poly: Point[], h: HatchSpec, colour: string): void => {
    hatchLines(poly, h.angle, h.gap).forEach(([p, q], k) => {
      const hid = `hatch-${id}-${k}`;
      marks.push({ id: hid, from: p, segments: [{ line: q }], close: false, fill: "none", stroke: h.colour ?? colour, strokeWidth: 1 });
      placer.addInk(hid, [p, q]);
    });
  };
  const arrowMark = (id: string, tip: Point, dir: Point, colour: string): void => {
    const pts = arrowHead(tip, dir);
    marks.push({ id, from: pts[0]!, segments: [{ line: pts[1]! }, { line: pts[2]! }], close: true, fill: colour, stroke: "none", strokeWidth: 0 });
    placer.addInk(id, [...pts, pts[0]!]);
  };
  const strokeMark = (id: string, from: Point, segs: MarkSegment[], style: { colour: string; width: number; dashed: boolean }, close: boolean): void => {
    marks.push({ id, from, segments: segs, close, fill: "none", stroke: style.colour, strokeWidth: style.width, ...(style.dashed ? { lineStyle: "dashed" as const } : {}) });
  };
  /** A closed outline as ONE mark whose arcs turn about their own centres, so a sector is a sector to the sweep check. */
  const outlineMark = (id: string, pieces: Piece[], style: { colour: string; width: number; dashed: boolean }): void => {
    const segs: MarkSegment[] = [];
    pieces.forEach((pc, i) => {
      if (pc.kind === "line") {
        if (i === pieces.length - 1 && vec.approxEqual(pc.b, pieceStart(pieces[0]!), 1e-9)) return;
        segs.push({ line: at(pc.b) });
        return;
      }
      const n = Math.max(1, Math.ceil(Math.abs(pc.span) / (Math.PI / 2) - 1e-9));
      for (let k = 1; k <= n; k += 1) segs.push({ arc: at(arcPoint(pc.c, pc.r, pc.a0 + (pc.span * k) / n)), centre: at(pc.c) });
    });
    strokeMark(id, at(pieceStart(pieces[0]!)), segs, style, true);
    const ring = samplePieces(pieces).map(at);
    placer.addInk(id, [...ring, ring[0]!]);
  };
  const circleMark = (id: string, c: Vec2, r: number, style: { colour: string; width: number; dashed: boolean }): Point[] => {
    const cc = at(c);
    strokeMark(id, at(arcPoint(c, r, 0)), [90, 180, 270, 360].map((deg) => ({ arc: at(arcPoint(c, r, rad(deg))), centre: cc })), style, true);
    const pts = circlePts({ center: c, radius: r });
    placer.addInk(id, pts);
    return pts;
  };
  const drawShape = (name: string, o: ShapeObj, id: string): void => {
    const d = o.data;
    const style = { colour: o.style.colour, width: o.style.width, dashed: o.style.dashed };
    const own = segments.filter((s) => s.shape === name && (s.lazy !== true || s.need === true));
    const pieces = shapePieces(d);
    if (pieces !== null) {
      outlineMark(id, pieces, style);
      nameRuns.set(name, { id, pts: samplePieces(pieces).map(at) });
      for (const s of own) measuredRun(s.id, s.a, s.b, { ...style, dashed: false });
      if (needArc.has(name) && (d.shape === "sector" || d.shape === "semicircle")) {
        const arcPiece = pieces.find((pc): pc is Extract<Piece, { kind: "arc" }> => pc.kind === "arc")!;
        lineMark(`${id}-arc`, sampleArc(arcPiece.c, arcPiece.r, arcPiece.a0, arcPiece.span).map(at), style);
      }
      return;
    }
    if (d.shape === "ring") {
      const outer = circleMark(`${id}-outer`, d.c, d.rOut, style);
      circleMark(`${id}-inner`, d.c, d.rIn, style);
      nameRuns.set(name, { id: `${id}-outer`, pts: outer, centre: at(d.c) });
      return;
    }
    if (d.shape === "belt") {
      for (const s of own) measuredRun(s.id, s.a, s.b, style);
      d.geo.arcs.forEach((a, k) => lineMark(`${id}-a${k + 1}`, sampleArc(a.c, a.r, a.a0, a.span).map(at), style));
      return;
    }
    if (d.shape === "path") {
      own.forEach((s, j) => {
        measuredRun(s.id, s.a, s.b, style);
        const a = at(s.a);
        const b = at(s.b);
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
        if (d.arrows === "each" && len >= 30) arrowMark(`arrow-${id}-${j + 1}`, { x: (a.x + b.x) / 2 + dir.x * 5, y: (a.y + b.y) / 2 + dir.y * 5 }, dir, style.colour);
        if (d.arrows === "end" && j === own.length - 1) arrowMark(`arrow-${id}-end`, { x: b.x - dir.x * 4, y: b.y - dir.y * 4 }, dir, style.colour);
      });
      return;
    }
    if (d.shape === "dimension") {
      const g = dimensionGeometry(d.a, d.b, d.offset, d.side, 3 / unit, 5 / unit);
      const cid = `dim-${safeId(name)}`;
      connectors.push({ id: cid, from: framed(g.line[0]), to: framed(g.line[1]), arrow: "both", stroke: style.colour, strokeWidth: style.width });
      placer.addInk(cid, [at(g.line[0]), at(g.line[1])]);
      g.extensions.forEach((e, k) => lineMark(`${id}-ext${k + 1}`, [at(e[0]), at(e[1])], { colour: style.colour, width: 1, dashed: false }));
      const shows = answers || o.given;
      const len = vec.distance(d.a, d.b);
      const text = shows ? `${o.label === null ? "" : `${o.label} = `}${measuredLabel(len, locale)}${unitSuffix}` : o.label;
      dimNotes.push({ id: cid, a: at(g.line[0]), b: at(g.line[1]), outward: { x: g.normal[0], y: -g.normal[1] }, text });
      return;
    }
    if (d.shape === "axis") {
      const e = vec.scale(vec.sub(d.q, d.p), d.extend);
      const p2 = at(vec.sub(d.p, e));
      const q2 = at(vec.add(d.q, e));
      // Dashed only where it extends past the segment: along the segment itself it would smear over that segment's own edge.
      const pA = at(d.p);
      const qA = at(d.q);
      lineMark(id, [p2, pA], style);
      lineMark(`${id}-b`, [qA, q2], style);
      nameRuns.set(name, { id, pts: [p2, pA] });
      const axisDir = unitTo(p2, q2);
      const ends: [Point, Point][] = [];
      if (d.arrows === "first" || d.arrows === "both") ends.push([p2, { x: -axisDir.x, y: -axisDir.y }]);
      if (d.arrows === "last" || d.arrows === "both") ends.push([q2, axisDir]);
      ends.forEach(([end, out], k) => {
        const w = { x: -out.y, y: out.x };
        const A = 17;
        const B = 7;
        const t0 = -0.2 * Math.PI;
        const t1 = 1.2 * Math.PI;
        const at2 = (t: number): Point => ({ x: end.x + w.x * A * Math.cos(t) + out.x * B * Math.sin(t), y: end.y + w.y * A * Math.cos(t) + out.y * B * Math.sin(t) });
        const ts = Array.from({ length: 41 }, (_, j) => (d.turn === 1 ? t0 + ((t1 - t0) * j) / 40 : t1 - ((t1 - t0) * j) / 40));
        const pts = ts.map(at2);
        lineMark(`${id}-turn${k + 1}`, pts, { colour: style.colour, width: 1.6, dashed: false });
        const last = pts[pts.length - 1]!;
        arrowMark(`arrow-${id}-turn${k + 1}`, last, unitTo(pts[pts.length - 3]!, last), style.colour);
      });
    }
  };

  // ---- 1. fills, under everything ----
  for (const name of model.order) {
    const o = objects.get(name)!;
    if (o.style.hidden || (o.kind !== "polygon" && o.kind !== "circle" && o.kind !== "shape")) continue;
    const region = regionOf(o);
    if (region === null) continue;
    const fill = o.fill ?? null;
    const hatch = o.hatch ?? null;
    const wanted = needFill.has(name);
    if (fill === null && hatch === null && !wanted) continue;
    const fid = `fill-${safeId(name)}`;
    const pts = region.poly;
    marks.push({ id: fid, from: framed(pts[0]!), segments: pts.slice(1).map((p) => ({ line: framed(p) })), close: true, fill: fill ?? "none", stroke: "none", strokeWidth: 0 });
    if (wanted) placer.addInk(fid, [...pts.map(at), at(pts[0]!)]);
    if (hatch !== null) hatchMarks(fid, pts.map(at), hatch, o.style.colour);
  }

  // ---- 2. every line, circle and curve ----
  for (const name of model.order) {
    const o = objects.get(name)!;
    if (o.style.hidden || o.kind === "point") continue;
    const id = `o-${safeId(name)}`;
    if (o.kind === "linear") {
      if (o.extent.kind === "segment") {
        measuredRun(id, o.extent.a, o.extent.b, o.style);
        nameRuns.set(name, { id, pts: [at(o.extent.a), at(o.extent.b)] });
        if (o.picto !== undefined) drawSegmentPicto(name, o.picto, o.side ?? 1, at(o.extent.a), at(o.extent.b));
        continue;
      }
      const lo = o.extent.kind === "ray" ? 0 : -Infinity;
      const p0 = o.extent.kind === "ray" ? o.extent.from : o.line.point;
      const clipped = clipLine(p0, o.line.direction, lo, Infinity, view);
      if (clipped === null) throw new SpecError(`"${name}" never crosses the drawn region`);
      const pts = [at(clipped[0]), at(clipped[1])];
      lineMark(id, pts, o.style);
      nameRuns.set(name, { id, pts });
    } else if (o.kind === "circle") {
      const c = at(o.circle.center);
      marks.push({
        id,
        from: at(vec.add(o.circle.center, [o.circle.radius, 0] as Vec2)),
        segments: [90, 180, 270, 360].map((deg) => ({
          arc: at(vec.add(o.circle.center, [o.circle.radius * Math.cos((deg * Math.PI) / 180), o.circle.radius * Math.sin((deg * Math.PI) / 180)] as Vec2)),
          centre: c,
        })),
        close: true,
        fill: "none",
        stroke: o.style.colour,
        strokeWidth: o.style.width,
        ...(o.style.dashed ? { lineStyle: "dashed" as const } : {}),
      });
      const pts = circlePts(o.circle);
      placer.addInk(id, pts);
      nameRuns.set(name, { id, pts, centre: c });
    } else if (o.kind === "polygon") {
      o.vertices.forEach((vn, j) => {
        const wn = o.vertices[(j + 1) % o.vertices.length]!;
        measuredRun(`side-${safeId(name)}-${safeId(vn)}-${safeId(wn)}`, o.pts[j]!, o.pts[(j + 1) % o.pts.length]!, o.style);
      });
    } else if (o.kind === "shape") {
      drawShape(name, o, id);
    } else {
      const samples = sampleConic(o.conic, reach);
      let k = 0;
      for (const branch of samples) {
        const closed = o.conic.type === "ellipse";
        const runs = closed ? [branch] : clipPolyline(branch, view);
        for (const r of runs) {
          k += 1;
          const rid = k === 1 ? id : `${id}-${k}`;
          const pts = r.map(at);
          lineMark(rid, closed ? pts.slice(0, -1) : pts, o.style, closed);
          if (!nameRuns.has(name)) nameRuns.set(name, { id: rid, pts });
        }
      }
    }
  }
  // A radius an annotation asked for (a circle's own has no run until then).
  for (const s of segments) if (s.extra !== undefined) measuredRun(s.id, s.a, s.b, s.extra);
  for (const e of extraLines) {
    const clipped = clipLine(e.line.point, e.line.direction, -Infinity, Infinity, view);
    if (clipped === null) continue;
    lineMark(e.id, [at(clipped[0]), at(clipped[1])], { colour: GUIDE, width: 1.3, dashed: true });
  }

  // ---- 3. marks that annotate: equal ticks, right angles ----
  tickGroups.forEach((group, g) => {
    for (const s of group) {
      const a = at(s.a);
      const b = at(s.b);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      const n = { x: -d.y, y: d.x };
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      for (let k = 0; k <= g; k += 1) {
        const off = (k - g / 2) * 5;
        const c = { x: mid.x + d.x * off, y: mid.y + d.y * off };
        const tid = `tick-${s.id}-${k}`;
        const pts = [
          { x: c.x - n.x * TICK_HALF, y: c.y - n.y * TICK_HALF },
          { x: c.x + n.x * TICK_HALF, y: c.y + n.y * TICK_HALF },
        ];
        marks.push({ id: tid, from: pts[0]!, segments: [{ line: pts[1]! }], close: false, fill: "none", stroke: INK, strokeWidth: 1.8 });
        placer.addInk(tid, pts);
      }
    }
  });

  type ArcJob = { note: AngleNote; id: string };
  const arcJobs: ArcJob[] = [];
  angleNotes.forEach((n, i) => {
    const id = `angle-${i + 1}-${safeId(n.names.join(""))}`;
    const vtx = at(n.vtx);
    const ua = unitTo(vtx, at(n.a));
    const ub = unitTo(vtx, at(n.b));
    if (Math.abs(n.degrees - 90) <= 1e-7) {
      const s = RIGHT_ANGLE_PX;
      const pts = [
        { x: vtx.x + ua.x * s, y: vtx.y + ua.y * s },
        { x: vtx.x + (ua.x + ub.x) * s, y: vtx.y + (ua.y + ub.y) * s },
        { x: vtx.x + ub.x * s, y: vtx.y + ub.y * s },
      ];
      marks.push({ id, from: pts[0]!, segments: pts.slice(1).map((p) => ({ line: p })), close: false, fill: "none", stroke: INK, strokeWidth: 1.3 });
      placer.addInk(id, pts);
      return;
    }
    arcJobs.push({ note: n, id });
  });

  // ---- 4. points, last, so every dot sits on top of the lines through it ----
  type Dot = { id: string; p: Vec2; label: string | null; colour: string; placeId: string; size: number; picto?: PointPicto; name?: string };
  const dots: Dot[] = [];
  for (const name of model.order) {
    const o = objects.get(name)!;
    if (o.kind !== "point" || o.style.hidden) continue;
    // A point's computed pair is an answer unless the point is one the author typed.
    const text = o.label === null ? null : o.coords && (answers || o.free === true) ? `${o.label}${formatPoint(o.p[0], o.p[1], locale)}` : o.label;
    dots.push({
      id: `dot-${safeId(name)}`,
      p: o.p,
      label: text,
      colour: o.style.colour,
      placeId: `label-${safeId(name)}`,
      size: o.coords ? 13 : 15,
      name,
      ...(o.picto === undefined ? {} : { picto: o.picto }),
    });
    if (!o.dot) dots[dots.length - 1]!.id = "";
  }
  for (const e of extraPoints) dots.push({ id: `dot-${e.id}`, p: e.p, label: e.label, colour: INK, placeId: `label-${e.id}`, size: 14 });
  for (const d of dots) {
    const c = at(d.p);
    if (d.id !== "") {
      board.circle(c, DOT_R, { stroke: d.colour, width: 0.8, fill: d.colour, id: d.id });
      placer.addInk(d.id, Array.from({ length: 13 }, (_, k) => ({ x: c.x + DOT_R * Math.cos((k * Math.PI) / 6), y: c.y + DOT_R * Math.sin((k * Math.PI) / 6) })), true, { c, r: DOT_R });
    }
    if (d.picto !== undefined) drawPointPicto(d.name ?? d.id, d.picto, c);
    placer.addPlace(d.placeId, c);
  }

  // ---- 5. labels, each beside its own ink ----
  const centroid = (() => {
    const ps = dots.map((d) => at(d.p));
    return ps.length === 0 ? { x: width / 2, y: plotHeight / 2 } : { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length };
  })();
  const polygonCentre = new Map<string, Point>();
  for (const name of model.order) {
    const o = objects.get(name)!;
    if (o.kind === "polygon") {
      const ps = o.pts.map(at);
      polygonCentre.set(name, { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length });
    }
  }

  const place = (claim: Claim, text: string, style: { size: number; weight?: number; colour: string }, spots: Point[]): void => {
    const { w, h } = board.extent(text, style);
    const best = placer.choose(claim, w, h, spots);
    const block = board.label(text, best.centre.x, best.centre.y, { ...style, width: w, claim: false });
    if (claim.kind === "place") block.annotatesPlace = { x: claim.at.x, y: claim.at.y };
    else block.annotates = claim.id;
    placer.commit(rectAt(best.centre, w, h));
  };

  // Points first: a point's name must sit within its own size of the point,
  // while every other label can slide along what it names.
  for (const d of dots) {
    if (d.label === null) continue;
    const c = at(d.p);
    const style = { size: d.size, weight: 700, colour: INK };
    const { w, h } = board.extent(d.label, style);
    const out = { x: c.x - centroid.x, y: c.y - centroid.y };
    const ol = Math.hypot(out.x, out.y);
    const outward = ol < 1 ? null : { x: out.x / ol, y: out.y / ol };
    place({ kind: "place", id: d.placeId, at: c }, d.label, style, aroundPoint(c, w, h, placer.incident(c), outward));
  }

  // Angle arcs next: an arc's radius is chosen together with its label.
  for (const job of arcJobs) {
    const n = job.note;
    const vtx = at(n.vtx);
    const ua = unitTo(vtx, at(n.a));
    const ub = unitTo(vtx, at(n.b));
    const a0 = Math.atan2(ua.y, ua.x);
    let delta = Math.atan2(ub.y, ub.x) - a0;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    const arcAt = (r: number): Point[] => Array.from({ length: 25 }, (_, k) => ({ x: vtx.x + r * Math.cos(a0 + (delta * k) / 24), y: vtx.y + r * Math.sin(a0 + (delta * k) / 24) }));
    const colour = n.name === null ? INK : UNKNOWN;
    const style = { size: 13, weight: 600, colour };
    const { w, h } = board.extent(n.label, style);
    const shorter = Math.min(Math.hypot(at(n.a).x - vtx.x, at(n.a).y - vtx.y), Math.hypot(at(n.b).x - vtx.x, at(n.b).y - vtx.y));
    let chosen: { r: number; centre: Point; cost: number } | undefined;
    for (let r = Math.max(18, Math.min(34, 0.25 * shorter)); r <= Math.max(20, 0.55 * shorter); r += 5) {
      placer.addInk(job.id, arcAt(r));
      const spots: Point[] = [];
      for (const extra of [0, 3, 7, 12]) {
        for (const f of [0, 0.2, -0.2, 0.4, -0.4, 0.6, -0.6]) {
          const t = a0 + delta / 2 + (f * delta) / 2;
          const u = { x: Math.cos(t), y: Math.sin(t) };
          const rr = r + Math.abs(u.x) * (w / 2) + Math.abs(u.y) * (h / 2) + 4 + extra;
          spots.push({ x: vtx.x + u.x * rr, y: vtx.y + u.y * rr });
        }
      }
      const best = placer.choose({ kind: "element", id: job.id }, w, h, spots);
      placer.removeInk(job.id);
      if (chosen === undefined || best.cost < chosen.cost) chosen = { r, ...best };
      if (best.cost === 0) break;
    }
    const pts = arcAt(chosen!.r);
    connectors.push({ id: job.id, from: pts[0]!, to: pts[pts.length - 1]!, curve: { kind: "sweep", centre: vtx }, arrow: "none", stroke: colour, strokeWidth: 1.5 });
    placer.addInk(job.id, pts);
    const block = board.label(n.label, chosen!.centre.x, chosen!.centre.y, { ...style, width: w, claim: false });
    block.annotates = job.id;
    placer.commit(rectAt(chosen!.centre, w, h));
  }

  // Lengths: beside the segment, outside the polygon when it is a side.
  const LENGTH_TS = [0.5, 0.4, 0.6, 0.32, 0.68, 0.25, 0.75, 0.2, 0.8];
  for (const n of lengthNotes) {
    const a = at(n.seg.a);
    const b = at(n.seg.b);
    const l = Math.sqrt(vec.lengthSquared(vec.sub(n.seg.b, n.seg.a)));
    const text = answers || n.given ? `${n.name === null ? "" : `${n.name} = `}${measuredLabel(l, locale)}${unitSuffix}` : n.name!;
    const style = { size: 13, weight: 600, colour: INK };
    const { w, h } = board.extent(text, style);
    const ref = n.seg.poly === null ? centroid : polygonCentre.get(n.seg.poly)!;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const nrm = { x: -(b.y - a.y), y: b.x - a.x };
    const side = nrm.x * (mid.x - ref.x) + nrm.y * (mid.y - ref.y) >= 0 ? 1 : -1;
    place({ kind: "element", id: n.seg.id }, text, style, besideRun(a, b, w, h, LENGTH_TS, side));
  }

  // Areas, arc lengths and sector angles beside their shapes (ADR 0067).
  const interiorPoints = (poly: Point[], count: number): Point[] => {
    const xsP = poly.map((p) => p.x);
    const ysP = poly.map((p) => p.y);
    const x0 = Math.min(...xsP);
    const x1 = Math.max(...xsP);
    const y0 = Math.min(...ysP);
    const y1 = Math.max(...ysP);
    const inside = (x: number, y: number): boolean => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
        const a = poly[i]!;
        const b = poly[j]!;
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
      }
      return c;
    };
    const cand: { p: Point; d: number }[] = [];
    for (let i = 0; i <= 28; i += 1) {
      for (let j = 0; j <= 28; j += 1) {
        const p = { x: x0 + ((x1 - x0) * i) / 28, y: y0 + ((y1 - y0) * j) / 28 };
        if (inside(p.x, p.y)) cand.push({ p, d: distanceToPolygon(p, poly) });
      }
    }
    cand.sort((a, b) => b.d - a.d);
    const out: Point[] = [];
    for (const c of cand) {
      if (out.every((q) => Math.hypot(q.x - c.p.x, q.y - c.p.y) > 12)) out.push(c.p);
      if (out.length >= count) break;
    }
    return out;
  };
  for (const n of shapeNotes) {
    const o = objects.get(n.target)!;
    const style = { size: 13, weight: 600, colour: n.colour };
    const { w, h } = board.extent(n.text, style);
    const TS = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
    if (n.kind === "angle" && o.kind === "shape" && o.data.shape === "sector") {
      const d = o.data;
      const apex = at(d.c);
      const rPx = d.r * unit;
      if (d.span <= Math.PI * 0.97) {
        // The angle at the apex is drawn as a swept arc (measured by sweep-matches-its-label), its value beyond it.
        const rr = Math.max(22, Math.min(46, 0.3 * rPx));
        const onArc = (t: number, r: number): Point => ({ x: apex.x + Math.cos(t) * r, y: apex.y - Math.sin(t) * r });
        const aid = `angle-${safeId(n.target)}`;
        const arcPts = Array.from({ length: 25 }, (_, k) => onArc(d.a0 + (d.span * k) / 24, rr));
        connectors.push({ id: aid, from: arcPts[0]!, to: arcPts[24]!, curve: { kind: "sweep", centre: apex }, arrow: "none", stroke: n.colour, strokeWidth: 1.5 });
        placer.addInk(aid, arcPts);
        const sp: Point[] = [];
        for (const extra of [0, 3, 7, 12, 18]) {
          for (const df of [0, 0.2, -0.2, 0.35, -0.35]) {
            const t = d.a0 + d.span / 2 + df * d.span;
            const reachBox = Math.abs(Math.cos(t)) * (w / 2) + Math.abs(Math.sin(t)) * (h / 2);
            sp.push(onArc(t, rr + reachBox + 4 + extra));
          }
        }
        place({ kind: "element", id: aid }, n.text, style, sp);
        continue;
      }
      const spots: Point[] = [];
      for (const f of [0.5, 0.4, 0.6, 0.32, 0.7, 0.25, 0.8]) {
        for (const df of [0, 0.18, -0.18, 0.36, -0.36]) {
          const t = d.a0 + d.span / 2 + df * d.span;
          spots.push({ x: apex.x + Math.cos(t) * f * rPx, y: apex.y - Math.sin(t) * f * rPx });
        }
      }
      place({ kind: "element", id: `o-${safeId(n.target)}` }, n.text, style, spots);
      continue;
    }
    if (n.kind === "arc" && (o.kind === "circle" || (o.kind === "shape" && (o.data.shape === "sector" || o.data.shape === "semicircle")))) {
      const centre = o.kind === "circle" ? o.circle.center : o.data.shape === "sector" ? o.data.c : (o.data as { c: Vec2 }).c;
      const pts =
        o.kind === "circle"
          ? circlePts(o.circle)
          : (() => {
              const arcPiece = shapePieces(o.data as ShapeData)!.find((pc): pc is Extract<Piece, { kind: "arc" }> => pc.kind === "arc")!;
              return sampleArc(arcPiece.c, arcPiece.r, arcPiece.a0, arcPiece.span).map(at);
            })();
      place({ kind: "element", id: o.kind === "circle" ? `o-${safeId(n.target)}` : `o-${safeId(n.target)}-arc` }, n.text, style, besidePolyline(pts, w, h, TS, at(centre)));
      continue;
    }
    // area: inside where there is room (a hatch leaves none), then beside the outline.
    const region = regionOf(o)!;
    const poly = region.poly.map(at);
    const mean = { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length };
    const spots = [...interiorPoints(poly, 8), ...besidePolyline([...poly, poly[0]!], w, h, TS, mean)];
    place({ kind: "element", id: `fill-${safeId(n.target)}` }, n.text, style, spots);
  }

  // Dimension lines: the measured length centred beside its own line, on the side away from what it measures.
  for (const n of dimNotes) {
    if (n.text === null) continue;
    const style = { size: 13, weight: 600, colour: INK };
    const { w, h } = board.extent(n.text, style);
    const nrm = { x: -(n.b.y - n.a.y), y: n.b.x - n.a.x };
    const side = nrm.x * n.outward.x + nrm.y * n.outward.y >= 0 ? 1 : -1;
    place({ kind: "element", id: n.id }, n.text, style, besideRun(n.a, n.b, w, h, [0.5, 0.44, 0.56, 0.38, 0.62, 0.3, 0.7], side));
  }

  // Names of lines, circles and conics that asked for one.
  const NAME_TS = [0.9, 0.1, 0.8, 0.2, 0.7, 0.3, 0.6, 0.4, 0.5];
  for (const name of model.order) {
    const o = objects.get(name)!;
    if (o.style.hidden || o.kind === "point" || o.kind === "polygon" || o.label === null) continue;
    const run = nameRuns.get(name);
    if (run === undefined) continue;
    // A guide's grey is too pale to be read as text over a gridline; its
    // name is set in the panel grey, which is.
    const style = { size: 14, weight: 700, colour: o.style.colour === GUIDE ? SOFT : o.style.colour };
    const { w, h } = board.extent(o.label, style);
    const spots =
      o.kind === "circle"
        ? besidePolyline(run.pts, w, h, [0.125, 0.375, 0.875, 0.625, 0.06, 0.19, 0.31, 0.44, 0.56, 0.69, 0.81, 0.94], run.centre)
        : besidePolyline(run.pts, w, h, NAME_TS);
    place({ kind: "element", id: run.id }, o.label, style, spots);
  }

  // ---- 6. the readings panel: what the drawing cannot say exactly ----
  readingPanel.draw(board, { top: plotHeight + 8, cut: plotHeight, align: "center" });

  // Paint order: fills, lines, annotation marks, then dots over all of them.
  const spec = board.spec(input.title ?? "construção");
  const scene = spec.root as Scene;
  scene.marks = [...marks, ...board.marks];
  scene.connectors = connectors;
  spec.canvas = { ...spec.canvas, constraints: { allowOverlap: true, allowConnectorCrossing: true, allowCurvedConnectors: true } };
  return parseSpec(spec);
}

/** Is l² a fraction with a denominator a school text would write (≤ 1000)? Then √l² has an exact form. */
function rationalSquare(l2: number): boolean {
  for (let d = 1; d <= 1000; d += 1) if (Math.abs(l2 * d - Math.round(l2 * d)) <= 1e-9 * Math.max(1, l2 * d)) return true;
  return false;
}

function unitTo(from: Point, to: Point): Point {
  const l = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return { x: (to.x - from.x) / l, y: (to.y - from.y) / l };
}

/** "AB" read as the points "A" and "B" when both exist and the split is unique. */
function splitPair(ref: string, objects: Map<string, ConstructionObject>): [string, string] | null {
  const found: [string, string][] = [];
  for (let k = 1; k < ref.length; k += 1) {
    const a = ref.slice(0, k);
    const b = ref.slice(k);
    if (objects.get(a)?.kind === "point" && objects.get(b)?.kind === "point") found.push([a, b]);
  }
  return found.length === 1 ? found[0]! : null;
}

// ---- validation ------------------------------------------------------------

export function validateConstructionInput(raw: Record<string, unknown>): void {
  const path = "construction";
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  v.optionalBoolean(raw, "axes", path);
  v.optionalBoolean(raw, "equalTicks", path);
  v.optionalString(raw, "unit", path);
  if (typeof raw.unit === "string" && (raw.unit.trim() === "" || /\d/.test(raw.unit))) {
    throw new SpecError(`${path}.unit must be a unit name like "m" or "cm", got ${JSON.stringify(raw.unit)}`);
  }
  v.nonEmptyArray(raw, "objects", path, "objects").forEach((item, i) => {
    const o = v.object(item, `${path}.objects[${i}]`);
    for (const key of ["hidden", "dashed", "dot", "coords", "answer"]) v.optionalBoolean(o, key, `${path}.objects[${i}]`);
    if (o.draw !== undefined) v.optionalEnum(o, "draw", `${path}.objects[${i}]`, ["line", "ray", "segment"]);
    if (o.colour !== undefined) v.optionalString(o, "colour", `${path}.objects[${i}]`);
  });
  if (raw.annotations !== undefined) v.array(raw, "annotations", path, "annotations");
  // References, geometry and every refusal are exercised by building the
  // figure -- one implementation, never a shadow of it that could drift.
  expandConstruction(raw as unknown as ConstructionInput);
}

// Keep the Block type referenced for readers of the emitted spec.
export type { Block };

// ---- regions of the extension shapes (ADR 0067) ----------------------------------------

/** A region an object encloses: its outline sampled in plane units, its exact area, and the pieces when it has arcs. */
export type Region = { poly: Vec2[]; area: number; pieces?: Piece[]; arcLength?: number };

/** The outline pieces of a sector, semicircle, annular sector or region -- null for a shape that is not one closed chain of pieces. */
export function shapePieces(d: ShapeData): Piece[] | null {
  if (d.shape === "sector") return sectorPieces(d.c, d.r, d.a0, d.span);
  if (d.shape === "semicircle") return semicirclePieces(d.a, d.b, d.side).pieces;
  if (d.shape === "region") return d.pieces;
  if (d.shape === "ring" && d.span !== undefined && d.a0 !== undefined) return annularSectorPieces(d.c, d.rIn, d.rOut, d.a0, d.span);
  return null;
}

/** What an object encloses, computed from its definition: Green's theorem over the pieces, or the closed form of a disc and a ring. */
export function regionOf(o: ConstructionObject): Region | null {
  if (o.kind === "polygon") {
    let twice = 0;
    o.pts.forEach((p, i) => {
      const q = o.pts[(i + 1) % o.pts.length]!;
      twice += p[0] * q[1] - q[0] * p[1];
    });
    return { poly: o.pts, area: Math.abs(twice) / 2 };
  }
  if (o.kind === "circle") {
    return { poly: sampleArc(o.circle.center, o.circle.radius, 0, TAU).slice(0, -1), area: Math.PI * o.circle.radius ** 2, arcLength: TAU * o.circle.radius };
  }
  if (o.kind !== "shape") return null;
  const d = o.data;
  if (d.shape === "ring" && d.span === undefined) {
    return { poly: ringOutline(d.c, d.rIn, d.rOut), area: Math.PI * (d.rOut ** 2 - d.rIn ** 2) };
  }
  const pieces = shapePieces(d);
  if (pieces === null) return null;
  return { poly: samplePieces(pieces), area: piecesArea(pieces), pieces, arcLength: piecesArcLength(pieces) };
}

/** The distance from a point to the nearest edge of a closed polygon. */
function distanceToPolygon(p: { x: number; y: number }, poly: { x: number; y: number }[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const l2 = vx * vx + vy * vy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy)));
  }
  return best;
}
