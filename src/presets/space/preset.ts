/**
 * space -- R³ analytic geometry (Geometria Analítica): points, vectors,
 * lines and planes on three axes, drawn through a camera (ADR 0045).
 *
 * Typed coordinates are the only input. A point is `at: [x, y, z]` or is
 * DERIVED (a midpoint, where a line meets a plane or another line, the foot
 * of a perpendicular); a vector is components or two points, or a cross
 * product or sum; a line is two points, point+direction, two planes meeting,
 * or the perpendicular to a plane; a plane is an equation, point+normal or
 * three points. Every drawn position is projected from computed R³
 * coordinates by `geometry/projection.ts`; every printed number is computed
 * with `geometry/vec.ts` and written exact (`numbers.ts`).
 *
 * Visibility is per object (`visibility.ts`): a segment is dashed exactly
 * where a plane patch hides it, decided by depth. Nothing else is occluded.
 */

import type { FigureSpec, Point, Scene } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { LOCALES } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";
import {
  GeometryError,
  add,
  angleBetween,
  angleBetweenLines3,
  angleBetweenPlanes3,
  angleLinePlane3,
  cross3,
  distance,
  distancePointToLine3,
  distancePointToPlane3,
  dot,
  intersectLinePlane3,
  intersectPlanes3,
  length,
  lengthSquared,
  lerp,
  lineFromPointDirection3,
  lineThrough3,
  normalOfThreePoints3,
  normalize,
  planeEquation3,
  planeFromEquation3,
  planeFromPointNormal3,
  relativePosition3,
  scale,
  sub,
} from "../../geometry/vec.ts";
import type { Line3, Plane3, Vec2, Vec3 } from "../../geometry/vec.ts";
import { makeCamera, project, projectDirection } from "../../geometry/projection.ts";
import type { Camera, CameraSpec } from "../../geometry/projection.ts";
import { clipLineToBox, clipPolygon, clipPolygonToBox, splitByVisibility } from "./visibility.ts";
import type { Box3, Patch } from "./visibility.ts";
import { SpacePlacer, aroundPlace, besideRun } from "./placer.ts";
import { parsePlaneEquation, planeEquationText, printDegrees, printExact, printTriple, simplestDirection, typesANumber } from "./numbers.ts";
import type { Linear, Printed } from "./numbers.ts";

// ---- input ------------------------------------------------------------------

export type Coord3 = [number, number, number];
/** A point by name, or typed coordinates. */
export type PointRef = string | Coord3;

type Named = { name: string; label?: string };

export type SpacePointDef = Named & { coords?: boolean } & (
    | { at: Coord3; box?: boolean | "full" | "floor" }
    | { midpoint: [string, string] }
    | { intersection: [string, string] }
    | { foot: { from: string; on: string } }
  );

export type SpaceVectorDef = Named &
  (
    | { components: Coord3; at?: PointRef }
    | { from: string; to: string }
    | { cross: [string, string]; at?: PointRef }
    | { sum: string[]; at?: PointRef }
  ) & {
    /** Guides from the head to the coordinate planes, as for a point; only for a vector drawn from the origin. */
    box?: boolean | "full" | "floor";
  };

export type SpaceLineDef = Named &
  (
    | { through: [string, string] }
    | { point: PointRef; direction: string | Coord3 }
    | { intersection: [string, string] }
    | { point: PointRef; perpendicularTo: string }
  );

export type SpacePlaneDef = Named & {
  /** "parallelogram" (default): the textbook patch, edges parallel to two coordinate planes. "octant": the piece in x, y, z ≥ 0 -- the intercept triangle. */
  patch?: "parallelogram" | "octant";
  /** Draw the plane's traces on the coordinate planes. */
  traces?: boolean;
  /** Mark and number where the plane meets each axis. */
  intercepts?: boolean;
} & ({ equation: string } | { point: PointRef; normal: string | Coord3 } | { through: [string, string, string] });

export type SpaceMeasure =
  | { distance: [string, string] }
  | { angle: [string, string] }
  | { position: [string, string] }
  | { commonPerpendicular: [string, string] };

export type SpaceInput = {
  title?: string;
  locale?: Locale;
  camera?: CameraSpec;
  axes?: { ticks?: boolean; names?: boolean; origin?: boolean };
  /** The drawing region lines and planes are clipped to, per axis. Derived from the figure's points when omitted. */
  region?: { x?: [number, number]; y?: [number, number]; z?: [number, number] };
  points?: SpacePointDef[];
  vectors?: SpaceVectorDef[];
  lines?: SpaceLineDef[];
  planes?: SpacePlaneDef[];
  measures?: SpaceMeasure[];
};

// ---- palette -----------------------------------------------------------------

const PAPER = "#FCFBF7";
const INK = "#181B21";
const SOFT = "#4E5763";
const AXIS = "#3F4652";
const GUIDE = "#8A93A3";
const PLANE_COLOURS = ["#1D4E89", "#2F6B3A", "#7A3E9D"];
const PLANE_ALPHA = "1A";
const LINE_COLOURS = ["#9A3409", "#6E4A00", "#08505C"];
const VECTOR_TYPED = "#1D4E89";
const VECTOR_DERIVED = "#6C3290";
const PERP = "#2F6B3A";

// ---- sizes (canvas px) ------------------------------------------------------------

const TARGET = 470;
const MIN_UNIT = 26;
const MAX_UNIT = 90;
const PAD = 70;
const DOT_R = 3.4;
const HEAD_LEN = 11;
const HEAD_HALF = 4.2;
const AXIS_EXTRA = 0.7;
const TICK_HALF = 4;
const CAPTION_LINE_H = 20;

// ---- resolved objects ---------------------------------------------------------------

type PointObj = { kind: "point"; name: string; p: Vec3; derivation?: string; def: SpacePointDef };
type VectorObj = { kind: "vector"; name: string; d: Vec3; tail: Vec3; derived: boolean; derivation?: string; def: SpaceVectorDef };
type LineObj = { kind: "line"; name: string; line: Line3; derived: boolean; derivation?: string; def: SpaceLineDef };
type PlaneObj = { kind: "plane"; name: string; plane: Plane3; eq: Linear; def: SpacePlaneDef };
type Obj = PointObj | VectorObj | LineObj | PlaneObj;
type Kind = Obj["kind"];

const KIND_WORD: Record<Kind, string> = { point: "a point", vector: "a vector", line: "a line", plane: "a plane" };

function coord3(raw: unknown, path: string): Vec3 {
  if (!Array.isArray(raw) || raw.length !== 3) throw new SpecError(`${path} must be [x, y, z]`);
  return [v.finite(raw[0], `${path}[0]`), v.finite(raw[1], `${path}[1]`), v.finite(raw[2], `${path}[2]`)];
}

/** Rethrow a vec.ts refusal as a spec error naming where it came from. */
function geom<T>(path: string, f: () => T): T {
  try {
    return f();
  } catch (e) {
    if (e instanceof GeometryError) throw new SpecError(`${path}: ${e.message}`);
    throw e;
  }
}

/** The foot of the perpendicular from `p` onto a 3D line. (vec.ts has only the 2D one.) */
export function footOnLine3(p: Vec3, line: Line3): Vec3 {
  const t = dot(sub(p, line.point), line.direction) / lengthSquared(line.direction);
  return add(line.point, scale(line.direction, t));
}

/** The foot of the perpendicular from `p` onto a plane. */
export function footOnPlane3(p: Vec3, plane: Plane3): Vec3 {
  const t = dot(plane.normal, sub(p, plane.point)) / lengthSquared(plane.normal);
  return sub(p, scale(plane.normal, t));
}

/**
 * The closest points of two non-parallel lines: the feet of their common
 * perpendicular. (vec.ts classifies reversas but does not return these.)
 */
export function closestPoints3(l1: Line3, l2: Line3): [Vec3, Vec3] {
  const d1 = l1.direction;
  const d2 = l2.direction;
  const w0 = sub(l1.point, l2.point);
  const a = dot(d1, d1);
  const b = dot(d1, d2);
  const c = dot(d2, d2);
  const d = dot(d1, w0);
  const e = dot(d2, w0);
  const denom = a * c - b * b;
  if (Math.abs(denom) <= 1e-12 * a * c) throw new GeometryError("closestPoints3: the lines are parallel -- the common perpendicular is not unique");
  const s = (b * e - c * d) / denom;
  const t = (a * e - b * d) / denom;
  return [add(l1.point, scale(d1, s)), add(l2.point, scale(d2, t))];
}

/**
 * A point on the line where two planes meet with the simplest coordinates:
 * one coordinate set to 0 and the other two solved, preferring whole
 * numbers -- the point a student would find by hand. Falls back to vec.ts's
 * own solve when no coordinate plane cuts the line.
 */
export function nicePointOnPlaneLine(e1: Linear, e2: Linear, fallback: Vec3): Vec3 {
  const cs1 = [e1.a, e1.b, e1.c];
  const cs2 = [e2.a, e2.b, e2.c];
  let best: { p: Vec3; score: number } | null = null;
  for (let zero = 0; zero < 3; zero += 1) {
    const [i, j] = [0, 1, 2].filter((k) => k !== zero) as [number, number];
    const det = cs1[i]! * cs2[j]! - cs1[j]! * cs2[i]!;
    if (Math.abs(det) < 1e-12) continue;
    const r1 = -e1.d;
    const r2 = -e2.d;
    const xi = (r1 * cs2[j]! - r2 * cs1[j]!) / det;
    const xj = (cs1[i]! * r2 - cs2[i]! * r1) / det;
    const p: [number, number, number] = [0, 0, 0];
    p[i] = xi;
    p[j] = xj;
    const whole = [xi, xj].filter((x) => Math.abs(x - Math.round(x)) < 1e-9).length;
    const score = whole * 100 - Math.abs(xi) - Math.abs(xj);
    if (best === null || score > best.score) best = { p, score };
  }
  return best?.p ?? fallback;
}

// ---- the build ------------------------------------------------------------------

export function expandSpace(input: SpaceInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const camera = geom("camera", () => makeCamera(input.camera ?? "cavalier"));

  // ---- 1. every definition by name, resolved lazily ----
  type Def = { kind: Kind; def: Record<string, unknown>; path: string };
  const defs = new Map<string, Def>();
  const order: string[] = [];
  const register = (kind: Kind, list: unknown[] | undefined, key: string): void => {
    (list ?? []).forEach((raw, i) => {
      const path = `${key}[${i}]`;
      const def = v.object(raw, path);
      const name = v.requiredString(def, "name", path);
      if (name.trim() === "") throw new SpecError(`${path}.name must not be empty`);
      if (defs.has(name)) throw new SpecError(`${path}.name "${name}" is already declared (${defs.get(name)!.path})`);
      const label = def.label;
      if (typeof label === "string" && typesANumber(label)) {
        throw new SpecError(`${path}.label "${label}" types a number -- every printed number is computed, never typed`);
      }
      defs.set(name, { kind, def, path });
      order.push(name);
    });
  };
  register("point", input.points, "points");
  register("vector", input.vectors, "vectors");
  register("line", input.lines, "lines");
  register("plane", input.planes, "planes");

  const done = new Map<string, Obj>();
  const visiting = new Set<string>();

  function resolve(name: string, path: string, want?: Kind | Kind[]): Obj {
    const d = defs.get(name);
    if (d === undefined) {
      const known = [...defs.keys()].map((k) => `"${k}"`).join(", ");
      throw new SpecError(`${path}: "${name}" is not declared${known === "" ? "" : ` (known: ${known})`}`);
    }
    const wants = want === undefined ? undefined : Array.isArray(want) ? want : [want];
    if (wants !== undefined && !wants.includes(d.kind)) {
      throw new SpecError(`${path}: "${name}" is ${KIND_WORD[d.kind]}, not ${wants.map((k) => KIND_WORD[k]).join(" or ")}`);
    }
    const cached = done.get(name);
    if (cached !== undefined) return cached;
    if (visiting.has(name)) throw new SpecError(`${d.path}: "${name}" is defined in terms of itself`);
    visiting.add(name);
    const obj = build(name, d);
    visiting.delete(name);
    done.set(name, obj);
    return obj;
  }

  const pointOf = (ref: unknown, path: string): Vec3 =>
    typeof ref === "string" ? (resolve(ref, path, "point") as PointObj).p : coord3(ref, path);
  const directionOf = (ref: unknown, path: string): Vec3 =>
    typeof ref === "string" ? (resolve(ref, path, "vector") as VectorObj).d : coord3(ref, path);
  const pairOf = (raw: unknown, path: string): [string, string] => {
    if (!Array.isArray(raw) || raw.length !== 2 || typeof raw[0] !== "string" || typeof raw[1] !== "string") {
      throw new SpecError(`${path} must be two names`);
    }
    return [raw[0], raw[1]];
  };

  function build(name: string, d: Def): Obj {
    const o = d.def;
    const path = d.path;
    const one = (keys: string[]): string => {
      const present = keys.filter((k) => o[k] !== undefined);
      if (present.length !== 1) {
        throw new SpecError(`${path} must be exactly one of: ${keys.join(", ")} -- found ${present.length === 0 ? "none" : present.join(" and ")}`);
      }
      return present[0]!;
    };

    if (d.kind === "point") {
      const def = o as unknown as SpacePointDef;
      const kind = one(["at", "midpoint", "intersection", "foot"]);
      if (kind === "at") return { kind: "point", name, p: coord3(o.at, `${path}.at`), def };
      if (kind === "midpoint") {
        const [a, b] = pairOf(o.midpoint, `${path}.midpoint`);
        const p = lerp(pointOf(a, `${path}.midpoint[0]`), pointOf(b, `${path}.midpoint[1]`), 0.5);
        return { kind: "point", name, p, derivation: `ponto médio de ${a}${b}`, def };
      }
      if (kind === "intersection") {
        const [a, b] = pairOf(o.intersection, `${path}.intersection`);
        const A = resolve(a, `${path}.intersection[0]`, ["line", "plane"]);
        const B = resolve(b, `${path}.intersection[1]`, ["line", "plane"]);
        if (A.kind === "plane" && B.kind === "plane") {
          throw new SpecError(`${path}: the planes "${a}" and "${b}" meet in a line, not a point -- declare it under lines as {"intersection": ["${a}", "${b}"]}`);
        }
        if (A.kind === "line" && B.kind === "line") {
          const rel = geom(path, () => relativePosition3(A.line, B.line));
          if (rel.kind !== "concorrentes") {
            throw new SpecError(
              `${path}: the lines "${a}" and "${b}" are ${rel.kind} -- they ${rel.kind === "coincidentes" ? "share every point" : "never meet"}` +
                (rel.kind === "reversas" ? `; ask for {"commonPerpendicular": ["${a}", "${b}"]} under measures instead` : ""),
            );
          }
          return { kind: "point", name, p: rel.point, derivation: `${a} ∩ ${b}`, def };
        }
        const line = (A.kind === "line" ? A : B) as LineObj;
        const plane = (A.kind === "plane" ? A : B) as PlaneObj;
        const hit = geom(path, () => intersectLinePlane3(line.line, plane.plane));
        if (hit.kind === "parallel") throw new SpecError(`${path}: the line "${line.name}" is parallel to the plane "${plane.name}" -- they never meet`);
        if (hit.kind === "contained") throw new SpecError(`${path}: the line "${line.name}" lies in the plane "${plane.name}" -- every point of it is common`);
        return { kind: "point", name, p: hit.point, derivation: `${a} ∩ ${b}`, def };
      }
      const foot = v.object(o.foot, `${path}.foot`);
      const from = v.requiredString(foot, "from", `${path}.foot`);
      const on = v.requiredString(foot, "on", `${path}.foot`);
      const P = pointOf(from, `${path}.foot.from`);
      const target = resolve(on, `${path}.foot.on`, ["line", "plane"]);
      const p = target.kind === "plane" ? footOnPlane3(P, target.plane) : footOnLine3(P, (target as LineObj).line);
      return { kind: "point", name, p, derivation: `pé da perpendicular de ${from} a ${on}`, def };
    }

    if (d.kind === "vector") {
      const def = o as unknown as SpaceVectorDef;
      const kind = one(["components", "from", "cross", "sum"]);
      const tailOf = (): Vec3 => (o.at === undefined ? [0, 0, 0] : pointOf(o.at, `${path}.at`));
      if (kind === "components") return { kind: "vector", name, d: coord3(o.components, `${path}.components`), tail: tailOf(), derived: false, def };
      if (kind === "from") {
        const from = v.requiredString(o, "from", path);
        const to = v.requiredString(o, "to", path);
        const A = pointOf(from, `${path}.from`);
        const B = pointOf(to, `${path}.to`);
        return { kind: "vector", name, d: sub(B, A), tail: A, derived: false, derivation: `${to} − ${from}`, def };
      }
      if (kind === "cross") {
        const [a, b] = pairOf(o.cross, `${path}.cross`);
        const A = resolve(a, `${path}.cross[0]`, "vector") as VectorObj;
        const B = resolve(b, `${path}.cross[1]`, "vector") as VectorObj;
        const c = cross3(A.d, B.d);
        if (length(c) <= 1e-12) throw new SpecError(`${path}: "${a}" and "${b}" are parallel -- their cross product is the zero vector, with no direction to draw`);
        return { kind: "vector", name, d: c, tail: tailOf(), derived: true, derivation: `${a} × ${b}`, def };
      }
      if (!Array.isArray(o.sum) || o.sum.length < 2) throw new SpecError(`${path}.sum needs at least two vector names`);
      const parts = (o.sum as unknown[]).map((n, i) => {
        if (typeof n !== "string") throw new SpecError(`${path}.sum[${i}] must be a vector name`);
        return resolve(n, `${path}.sum[${i}]`, "vector") as VectorObj;
      });
      const s = parts.reduce<Vec3>((acc, p) => add(acc, p.d), [0, 0, 0]);
      return { kind: "vector", name, d: s, tail: tailOf(), derived: true, derivation: parts.map((p) => p.name).join(" + "), def };
    }

    if (d.kind === "line") {
      const def = o as unknown as SpaceLineDef;
      const kind = one(["through", "direction", "intersection", "perpendicularTo"]);
      if (kind === "through") {
        const [a, b] = pairOf(o.through, `${path}.through`);
        const line = geom(path, () => lineThrough3(pointOf(a, `${path}.through[0]`), pointOf(b, `${path}.through[1]`)));
        return { kind: "line", name, line, derived: false, def };
      }
      if (kind === "direction") {
        if (o.point === undefined) throw new SpecError(`${path}.point is required alongside "direction"`);
        const line = geom(path, () => lineFromPointDirection3(pointOf(o.point, `${path}.point`), directionOf(o.direction, `${path}.direction`)));
        return { kind: "line", name, line, derived: false, def };
      }
      if (kind === "perpendicularTo") {
        if (o.point === undefined) throw new SpecError(`${path}.point is required alongside "perpendicularTo"`);
        const plane = resolve(String(o.perpendicularTo), `${path}.perpendicularTo`, "plane") as PlaneObj;
        const line = { point: pointOf(o.point, `${path}.point`), direction: plane.plane.normal };
        return { kind: "line", name, line, derived: true, derivation: `perpendicular a ${plane.name}`, def };
      }
      const [a, b] = pairOf(o.intersection, `${path}.intersection`);
      const A = resolve(a, `${path}.intersection[0]`, "plane") as PlaneObj;
      const B = resolve(b, `${path}.intersection[1]`, "plane") as PlaneObj;
      const hit = geom(path, () => intersectPlanes3(A.plane, B.plane));
      if (hit.kind === "parallel") throw new SpecError(`${path}: the planes "${a}" and "${b}" are parallel -- they never meet`);
      if (hit.kind === "coincident") throw new SpecError(`${path}: "${a}" and "${b}" are the same plane -- they share every line`);
      const direction = simplestDirection(hit.line.direction as [number, number, number]);
      const point = nicePointOnPlaneLine(A.eq, B.eq, hit.line.point);
      return { kind: "line", name, line: { point, direction }, derived: true, derivation: `${a} ∩ ${b}`, def };
    }

    const def = o as unknown as SpacePlaneDef;
    const kind = one(["equation", "normal", "through"]);
    let plane: Plane3;
    if (kind === "equation") {
      if (typeof o.equation !== "string") throw new SpecError(`${path}.equation must be a string like "2x + y − z = 4"`);
      const eq = parsePlaneEquation(o.equation);
      plane = geom(path, () => planeFromEquation3(eq.a, eq.b, eq.c, eq.d));
    } else if (kind === "normal") {
      if (o.point === undefined) throw new SpecError(`${path}.point is required alongside "normal"`);
      plane = geom(path, () => planeFromPointNormal3(pointOf(o.point, `${path}.point`), directionOf(o.normal, `${path}.normal`)));
    } else {
      if (!Array.isArray(o.through) || o.through.length !== 3) throw new SpecError(`${path}.through must be three point names`);
      const [A, B, C] = (o.through as unknown[]).map((n, i) => pointOf(n, `${path}.through[${i}]`)) as [Vec3, Vec3, Vec3];
      geom(path, () => normalOfThreePoints3(A, B, C));
      // The raw cross product, not vec.ts's unit normal: whole-number points
      // give whole-number coefficients, which is the equation a student writes.
      plane = { point: A, normal: cross3(sub(B, A), sub(C, A)) };
    }
    const e = planeEquation3(plane);
    return { kind: "plane", name, plane, eq: { a: e.a, b: e.b, c: e.c, d: e.d }, def };
  }

  for (const name of order) resolve(name, defs.get(name)!.path);
  const objs = order.map((n) => done.get(n)!);
  const pointsList = objs.filter((o): o is PointObj => o.kind === "point");
  const vectorsList = objs.filter((o): o is VectorObj => o.kind === "vector");
  const linesList = objs.filter((o): o is LineObj => o.kind === "line");
  const planesList = objs.filter((o): o is PlaneObj => o.kind === "plane");
  if (objs.length === 0) throw new SpecError("space: declare at least one point, vector, line or plane");

  // ---- 2. measures (resolved now, so a refusal names itself before any drawing) ----
  const readings: string[] = [];
  const perpendiculars: { from: Vec3; to: Vec3; l1: Line3; l2: Line3; id: string }[] = [];
  const eqOrApprox = (p: Printed): string => (p.exact ? "=" : "≈");

  for (const [i, raw] of (input.measures ?? []).entries()) {
    const path = `measures[${i}]`;
    const m = v.object(raw, path);
    const keys = ["distance", "angle", "position", "commonPerpendicular"].filter((k) => m[k] !== undefined);
    if (keys.length !== 1) throw new SpecError(`${path} must be exactly one of: distance, angle, position, commonPerpendicular`);
    const key = keys[0]!;
    const [a, b] = pairOf(m[key], `${path}.${key}`);
    const A = resolve(a, `${path}.${key}[0]`);
    const B = resolve(b, `${path}.${key}[1]`);
    if (key === "distance") {
      const value = measureDistance(A, B, path);
      const printed = printExact(value, locale);
      readings.push(`d(${a}, ${b}) ${eqOrApprox(printed)} ${printed.text}`);
    } else if (key === "angle") {
      readings.push(measureAngle(A, B, path, locale));
    } else if (key === "position") {
      readings.push(describePosition(A, B, path));
    } else {
      if (A.kind !== "line" || B.kind !== "line") throw new SpecError(`${path}.commonPerpendicular needs two lines`);
      const rel = geom(path, () => relativePosition3(A.line, B.line));
      if (rel.kind !== "reversas") {
        throw new SpecError(`${path}: "${a}" and "${b}" are ${rel.kind}, not reversas -- only skew lines have one common perpendicular`);
      }
      const [f1, f2] = geom(path, () => closestPoints3(A.line, B.line));
      perpendiculars.push({ from: f1, to: f2, l1: A.line, l2: B.line, id: `perp-${i}` });
      const printed = printExact(distance(f1, f2), locale);
      readings.push(`${a} e ${b}: reversas; perpendicular comum de ${printTriple(f1, locale).text} a ${printTriple(f2, locale).text}; d(${a}, ${b}) ${eqOrApprox(printed)} ${printed.text}`);
    }
  }

  // ---- 3. the region everything is clipped to ----
  const extent: Vec3[] = [[0, 0, 0]];
  for (const p of pointsList) extent.push(p.p);
  for (const vec of vectorsList) extent.push(vec.tail, add(vec.tail, vec.d));
  for (const pp of perpendiculars) extent.push(pp.from, pp.to);
  // A plane's axis intercepts widen the region only when the figure is
  // ABOUT them (an octant patch, marked intercepts) or has no points of its
  // own to frame; otherwise a far intercept (y = 8) would stretch the patch
  // across the page and wedge every point against its edge.
  const framed = pointsList.length + vectorsList.length > 0;
  for (const pl of planesList) {
    if (framed && pl.def.patch !== "octant" && pl.def.intercepts !== true) continue;
    const cs = [pl.eq.a, pl.eq.b, pl.eq.c];
    cs.forEach((c, i) => {
      if (Math.abs(c) < 1e-12) return;
      const t = -pl.eq.d / c;
      if (Math.abs(t) <= 12) {
        const p: [number, number, number] = [0, 0, 0];
        p[i] = t;
        extent.push(p);
      }
    });
  }
  for (const l of linesList) extent.push(l.line.point);
  const lo: [number, number, number] = [0, 0, 0];
  const hi: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    const cs = extent.map((p) => p[i]!);
    const min = Math.min(...cs);
    const max = Math.max(...cs);
    lo[i] = min < -1e-9 ? Math.floor(min) - 1 : 0;
    hi[i] = Math.max(2, Math.ceil(max - 1e-9) + 1);
  }
  const axesKeys = ["x", "y", "z"] as const;
  axesKeys.forEach((k, i) => {
    const r = input.region?.[k];
    if (r === undefined) return;
    const a = v.finite(r[0], `region.${k}[0]`);
    const b = v.finite(r[1], `region.${k}[1]`);
    if (!(a < b)) throw new SpecError(`region.${k} must be [low, high] with low < high`);
    lo[i] = a;
    hi[i] = b;
  });
  const region: Box3 = { lo, hi };
  // Lines and plane patches run a little past the region on every side, so
  // a line reads as a line and not as a segment that happens to stop at an
  // axis, and a patch is not cut flush with a coordinate plane.
  const drawBox: Box3 = { lo: [lo[0] - 1, lo[1] - 1, lo[2] - 1], hi: [hi[0] + 0.6, hi[1] + 0.6, hi[2] + 0.6] };

  // ---- 4. geometry in R³ ----
  type Seg = { id: string; group: string; a: Vec3; b: Vec3; colour: string; width: number; skip: Set<string>; occludable: boolean; dashed?: boolean };
  const segs: Seg[] = [];
  const patches: (Patch & { colour: string; name: string; group: string; label: string })[] = [];
  const dots: { id: string; p: Vec3; colour: string; name?: string; text?: string; small?: boolean }[] = [];
  const arrows: { id: string; group: string; tail: Vec3; head: Vec3; colour: string; name: string }[] = [];
  const rightAngles: { id: string; pts: Vec3[] }[] = [];

  // Axes.
  const axisSegs: { i: number; a: Vec3; b: Vec3 }[] = [];
  for (let i = 0; i < 3; i += 1) {
    const a: [number, number, number] = [0, 0, 0];
    const b: [number, number, number] = [0, 0, 0];
    a[i] = lo[i]!;
    b[i] = hi[i]! + AXIS_EXTRA;
    axisSegs.push({ i, a, b });
    segs.push({ id: `axis-${axesKeys[i]}`, group: `axis-${axesKeys[i]}`, a, b, colour: AXIS, width: 1.5, skip: new Set(), occludable: true });
  }

  // Planes.
  planesList.forEach((pl, k) => {
    const n = pl.plane.normal;
    const m = [0, 1, 2].reduce((best, i) => (Math.abs(n[i]!) > Math.abs(n[best]!) ? i : best), 0);
    const [j, kk] = [0, 1, 2].filter((i) => i !== m) as [number, number];
    const solve = (cj: number, ck: number): Vec3 => {
      const p: [number, number, number] = [0, 0, 0];
      p[j] = cj;
      p[kk] = ck;
      p[m] = -(pl.eq.d + n[j]! * cj + n[kk]! * ck) / n[m]!;
      return p;
    };
    let corners: Vec3[];
    if ((pl.def.patch ?? "parallelogram") === "octant") {
      // The piece in x, y, z ≥ 0: for positive intercepts, the intercept triangle.
      const quad = [solve(lo[j]!, lo[kk]!), solve(hi[j]!, lo[kk]!), solve(hi[j]!, hi[kk]!), solve(lo[j]!, hi[kk]!)];
      corners = clipPolygonToBox(quad, region);
      for (let i = 0; i < 3; i += 1) corners = clipPolygon(corners, (p) => -p[i]!);
      corners = corners.filter((p, i) => distance(p, corners[(i + 1) % corners.length]!) > 1e-9);
    } else {
      // The textbook parallelogram: edges parallel to the two coordinate
      // planes the normal leans least on, as wide as the region. With points
      // of its own, the figure centres it on them and clips it to the same
      // box the lines run to, so the points a plane is drawn for sit inside
      // it rather than against an edge a coordinate plane happened to cut.
      // Without (planes and the lines they make), it is clipped to the
      // region, whose corner then gives the intercept-like outline.
      const own = pointsList.length + vectorsList.length > 0 ? extent.slice(1) : [];
      const cj = own.length > 0 ? own.reduce((acc, q) => acc + q[j]!, 0) / own.length : (lo[j]! + hi[j]!) / 2;
      const ck = own.length > 0 ? own.reduce((acc, q) => acc + q[kk]!, 0) / own.length : (lo[kk]! + hi[kk]!) / 2;
      const hj = (hi[j]! - lo[j]!) / 2;
      const hk = (hi[kk]! - lo[kk]!) / 2;
      const quad = [solve(cj - hj, ck - hk), solve(cj + hj, ck - hk), solve(cj + hj, ck + hk), solve(cj - hj, ck + hk)];
      corners = clipPolygonToBox(quad, own.length > 0 ? drawBox : region);
    }
    if (corners.length < 3) {
      throw new SpecError(`planes: "${pl.name}" does not cross the drawing region${pl.def.patch === "octant" ? " in the first octant" : ""} -- widen "region"`);
    }
    const id = `plane-${k}`;
    const colour = PLANE_COLOURS[k % PLANE_COLOURS.length]!;
    patches.push({ id, corners, point: pl.plane.point, normal: n, colour, name: pl.name, group: id, label: pl.def.label ?? pl.name });
  });
  const patchById = new Map(patches.map((p) => [p.id, p]));
  planesList.forEach((pl, k) => {
    const patch = patches[k]!;
    patch.corners.forEach((c, i) => {
      // An edge lying along an axis is left to the axis: two strokes of two
      // colours on one line read as neither.
      const next = patch.corners[(i + 1) % patch.corners.length]!;
      if ([0, 1, 2].some((ax) => [0, 1, 2].every((j) => j === ax || (Math.abs(c[j]!) < 1e-9 && Math.abs(next[j]!) < 1e-9)))) return;
      segs.push({ id: `${patch.id}-edge${i}`, group: patch.group, a: c, b: patch.corners[(i + 1) % patch.corners.length]!, colour: patch.colour, width: 1.4, skip: new Set([patch.id]), occludable: true });
    });
    if (pl.def.traces === true && (pl.def.patch ?? "parallelogram") !== "octant") {
      for (let i = 0; i < 3; i += 1) {
        const normal: [number, number, number] = [0, 0, 0];
        normal[i] = 1;
        const hit = intersectPlanes3(pl.plane, { point: [0, 0, 0], normal });
        if (hit.kind !== "line") continue;
        const range = clipLineToBox(hit.line.point, hit.line.direction, region);
        if (range === null) continue;
        const a = add(hit.line.point, scale(hit.line.direction, range[0]));
        const b = add(hit.line.point, scale(hit.line.direction, range[1]));
        segs.push({ id: `${patch.id}-trace-${axesKeys[i]}`, group: `${patch.id}-trace-${axesKeys[i]}`, a, b, colour: patch.colour, width: 1.2, skip: new Set([patch.id]), occludable: true });
      }
    }
    if (pl.def.intercepts === true) {
      [pl.eq.a, pl.eq.b, pl.eq.c].forEach((c, i) => {
        if (Math.abs(c) < 1e-12) return;
        const t = -pl.eq.d / c;
        if (t < lo[i]! - 1e-9 || t > hi[i]! + AXIS_EXTRA + 1e-9) return;
        const p: [number, number, number] = [0, 0, 0];
        p[i] = t;
        dots.push({ id: `${patch.id}-int-${axesKeys[i]}`, p, colour: patch.colour, text: printExact(t, locale).text, small: true });
      });
    }
  });

  // Lines, clipped to the region.
  linesList.forEach((l, k) => {
    const range = clipLineToBox(l.line.point, l.line.direction, drawBox);
    if (range === null) throw new SpecError(`lines: "${l.name}" does not cross the drawing region -- widen "region"`);
    const a = add(l.line.point, scale(l.line.direction, range[0]));
    const b = add(l.line.point, scale(l.line.direction, range[1]));
    // A line that is the meeting of two planes lies in both, and neither hides it.
    const skip = new Set<string>();
    for (const patch of patches) {
      const tol = 1e-9 * Math.max(1, ...a.map(Math.abs), ...b.map(Math.abs));
      if (Math.abs(dot(patch.normal, sub(a, patch.point))) / length(patch.normal) <= tol && Math.abs(dot(patch.normal, sub(b, patch.point))) / length(patch.normal) <= tol) skip.add(patch.id);
    }
    segs.push({ id: `line-${k}`, group: `line-${k}`, a, b, colour: LINE_COLOURS[k % LINE_COLOURS.length]!, width: 1.9, skip, occludable: true });
  });

  // Common perpendiculars.
  for (const pp of perpendiculars) {
    segs.push({ id: pp.id, group: pp.id, a: pp.from, b: pp.to, colour: PERP, width: 1.7, skip: new Set(), occludable: true });
    dots.push({ id: `${pp.id}-f0`, p: pp.from, colour: PERP, small: true });
    dots.push({ id: `${pp.id}-f1`, p: pp.to, colour: PERP, small: true });
  }

  // Vectors.
  vectorsList.forEach((vec, k) => {
    if (length(vec.d) <= 1e-12) throw new SpecError(`vectors: "${vec.name}" is the zero vector -- there is no arrow to draw`);
    const head = add(vec.tail, vec.d);
    const colour = vec.derived ? VECTOR_DERIVED : VECTOR_TYPED;
    arrows.push({ id: `vec-${k}`, group: `vec-${k}`, tail: vec.tail, head, colour, name: vec.def.label ?? vec.name });
    const box = (vec.def as { box?: boolean | "full" | "floor" }).box;
    if (box !== undefined && box !== false) {
      if (length(vec.tail) > 1e-12) throw new SpecError(`vectors: "${vec.name}".box needs the vector drawn from the origin -- its guides run to the coordinate planes`);
      for (const [e, [a, b]] of boxEdges(head, box).entries()) {
        segs.push({ id: `vec-${k}-box${e}`, group: `vec-${k}-box`, a, b, colour: GUIDE, width: 1.1, skip: new Set(), occludable: false, dashed: true });
      }
    }
  });

  // Points, and each typed point's box guides.
  pointsList.forEach((pt, k) => {
    const def = pt.def as { box?: boolean | "full" | "floor"; coords?: boolean };
    for (const [e, [a, b]] of boxEdges(pt.p, def.box).entries()) {
      segs.push({ id: `pt-${k}-box${e}`, group: `pt-${k}-box`, a, b, colour: GUIDE, width: 1.1, skip: new Set(), occludable: false, dashed: true });
    }
    const coords = printTriple(pt.p, locale);
    // A typed point shows its coordinates by default (they are short and
    // they are the exercise); a derived one shows its name, and its computed
    // coordinates go to the readings panel beside its derivation.
    const showCoords = def.coords ?? pt.derivation === undefined;
    const text = showCoords ? `${pt.def.label ?? pt.name}${coords.exact ? "" : " ≈ "}${coords.text}` : pt.def.label ?? pt.name;
    dots.push({ id: `pt-${k}`, p: pt.p, colour: INK, name: pt.name, text });
    if (pt.derivation !== undefined) {
      readings.unshift(`${pt.name} = ${pt.derivation} ${coords.exact ? "=" : "≈"} ${coords.text}`);
    } else if (!showCoords) {
      readings.unshift(`${pt.name} ${coords.exact ? "=" : "≈"} ${coords.text}`);
    }
    // A foot on a line gets its right-angle mark, drawn in R³ and projected.
    const foot = (pt.def as { foot?: { from: string; on: string } }).foot;
    if (foot !== undefined) {
      const target = done.get(foot.on)!;
      const from = (done.get(foot.from) as PointObj | undefined)?.p;
      if (target.kind === "line" && from !== undefined && distance(from, pt.p) > 1e-9) {
        segs.push({ id: `pt-${k}-perp`, group: `pt-${k}-perp`, a: from, b: pt.p, colour: GUIDE, width: 1.1, skip: new Set(), occludable: false, dashed: true });
        rightAngles.push({ id: `pt-${k}-right`, pts: rightAngle3(pt.p, target.line.direction, sub(from, pt.p), 0.28) });
      } else if (target.kind === "plane" && from !== undefined && distance(from, pt.p) > 1e-9) {
        segs.push({ id: `pt-${k}-perp`, group: `pt-${k}-perp`, a: from, b: pt.p, colour: GUIDE, width: 1.1, skip: new Set(), occludable: false, dashed: true });
      }
    }
  });
  for (const pp of perpendiculars) {
    const d = sub(pp.to, pp.from);
    rightAngles.push({ id: `${pp.id}-right0`, pts: rightAngle3(pp.from, pp.l1.direction, d, 0.28) });
    rightAngles.push({ id: `${pp.id}-right1`, pts: rightAngle3(pp.to, pp.l2.direction, scale(d, -1), 0.28) });
  }

  // Readings for the objects themselves.
  for (const pl of planesList) {
    const t = planeEquationText(pl.eq, locale);
    readings.push(`${pl.name}: ${t.text}${t.exact ? "" : " (coeficientes arredondados)"}`);
  }
  for (const l of linesList) {
    const dir = l.derived ? simplestDirection(l.line.direction as [number, number, number]) : l.line.direction;
    const p0 = printTriple(l.line.point, locale);
    const dd = printTriple(dir, locale);
    const sep = locale === "pt-BR" ? "; " : ", ";
    readings.push(`${l.name}${l.derivation === undefined ? "" : ` = ${l.derivation}`}: (x${sep}y${sep}z) = ${p0.text} + t${dd.text}`);
  }
  for (const vec of vectorsList) {
    const comps = printTriple(vec.d, locale);
    const len = printExact(length(vec.d), locale);
    const der = vec.derivation === undefined || vec.derivation.replace(/\s/g, "") === vec.name.replace(/\s/g, "") ? "" : ` = ${vec.derivation}`;
    readings.push(`${vec.name}${der} = ${comps.text}; |${vec.name}| ${eqOrApprox(len)} ${len.text}`);
  }

  // ---- 5. visibility ----
  type Drawn = { id: string; group: string; a: Vec3; b: Vec3; colour: string; width: number; dashed: boolean };
  const drawn: Drawn[] = [];
  const cutSeg = (s: Seg): void => {
    if (!s.occludable) {
      drawn.push({ id: s.id, group: s.group, a: s.a, b: s.b, colour: s.colour, width: s.width, dashed: s.dashed === true });
      return;
    }
    const pieces = splitByVisibility(camera, s.a, s.b, patches, s.skip);
    pieces.forEach((pc, i) => {
      drawn.push({ id: pieces.length === 1 ? s.id : `${s.id}-${i}`, group: s.group, a: pc.from, b: pc.to, colour: s.colour, width: s.width, dashed: pc.hidden || s.dashed === true });
    });
  };
  for (const s of segs) cutSeg(s);
  const arrowShafts: Drawn[] = [];
  for (const ar of arrows) {
    const pieces = splitByVisibility(camera, ar.tail, ar.head, patches);
    pieces.forEach((pc, i) => arrowShafts.push({ id: pieces.length === 1 ? ar.id : `${ar.id}-${i}`, group: ar.group, a: pc.from, b: pc.to, colour: ar.colour, width: 2.1, dashed: pc.hidden }));
  }

  // ---- 6. page geometry ----
  const pagePts: Vec2[] = [];
  for (const d of [...drawn, ...arrowShafts]) pagePts.push(project(camera, d.a), project(camera, d.b));
  for (const p of patches) for (const c of p.corners) pagePts.push(project(camera, c));
  for (const d of dots) pagePts.push(project(camera, d.p));
  const us = pagePts.map((p) => p[0]);
  const vs = pagePts.map((p) => p[1]);
  const uMin = Math.min(...us);
  const uMax = Math.max(...us);
  const vMin = Math.min(...vs);
  const vMax = Math.max(...vs);
  const unit = Math.min(MAX_UNIT, Math.max(MIN_UNIT, TARGET / Math.max(uMax - uMin, vMax - vMin, 1e-9)));
  const board0 = new Board(1, 1, PAPER);
  const captionStyle = { size: 13, colour: SOFT };
  const captionW = Math.max(0, ...readings.map((r) => board0.extent(r, captionStyle).w));
  const plotW = Math.ceil((uMax - uMin) * unit + 2 * PAD);
  const width = Math.max(plotW, Math.ceil(captionW + 48));
  const plotH = Math.ceil((vMax - vMin) * unit + 2 * PAD);
  const captionH = readings.length > 0 ? readings.length * CAPTION_LINE_H + 18 : 0;
  const height = plotH + captionH;
  const ox = (width - (uMax - uMin) * unit) / 2 - uMin * unit;
  const oy = PAD + vMax * unit;
  const page = (p: Vec3): Point => {
    const q = project(camera, p);
    return { x: ox + q[0] * unit, y: oy - q[1] * unit };
  };
  const pageDir = (d: Vec3): Point => {
    const q = projectDirection(camera, d);
    const len = Math.hypot(q[0], q[1]) || 1;
    return { x: q[0] / len, y: -q[1] / len };
  };

  const board = new Board(width, height, PAPER);
  const placer = new SpacePlacer({ x: 6, y: 6, width: width - 12, height: plotH - 6 });

  // ---- 7. marks, back to front: fills, edges and lines, arrows, marks, dots ----
  const byDepthFarFirst = [...patches].sort((p, q) => depthOfCentroid(camera, p) - depthOfCentroid(camera, q));
  for (const p of byDepthFarFirst) {
    const pts = p.corners.map(page);
    board.poly(pts, { stroke: "none", width: 0, fill: `${p.colour}${PLANE_ALPHA}`, close: true, id: `${p.id}-fill` });
    placer.addInk(`${p.id}-fill`, p.group, [...pts, pts[0]!], false);
  }
  const drawRun = (d: Drawn): void => {
    const a = page(d.a);
    const b = page(d.b);
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.5) return;
    board.poly([a, b], { stroke: d.colour, width: d.dashed ? Math.min(d.width, 1.3) : d.width, id: d.id, ...(d.dashed ? { lineStyle: "dashed" as const } : {}) });
    placer.addInk(d.id, d.group, [a, b]);
  };
  // Guides (always dashed) first, then everything that can be hidden.
  for (const d of drawn.filter((x) => x.group.endsWith("-box") || x.group.endsWith("-perp"))) drawRun(d);
  for (const d of drawn.filter((x) => !(x.group.endsWith("-box") || x.group.endsWith("-perp")))) drawRun(d);
  for (const d of arrowShafts) drawRun(d);

  // Arrowheads: axes and vectors.
  const headAt = (id: string, group: string, tip: Point, dir: Point, colour: string): void => {
    const base = { x: tip.x - dir.x * HEAD_LEN, y: tip.y - dir.y * HEAD_LEN };
    const n = { x: -dir.y, y: dir.x };
    const pts = [tip, { x: base.x + n.x * HEAD_HALF, y: base.y + n.y * HEAD_HALF }, { x: base.x - n.x * HEAD_HALF, y: base.y - n.y * HEAD_HALF }];
    board.poly(pts, { stroke: colour, width: 1, fill: colour, close: true, id });
    placer.addInk(id, group, [...pts, pts[0]!]);
  };
  for (const ax of axisSegs) {
    const unitDir: [number, number, number] = [0, 0, 0];
    unitDir[ax.i] = 1;
    headAt(`axis-${axesKeys[ax.i]}-head`, `axis-${axesKeys[ax.i]}`, page(ax.b), pageDir(unitDir), AXIS);
  }
  for (const ar of arrows) headAt(`${ar.id}-head`, ar.group, page(ar.head), pageDir(sub(ar.head, ar.tail)), ar.colour);

  // Right-angle marks.
  for (const ra of rightAngles) {
    const pts = ra.pts.map(page);
    board.poly(pts, { stroke: INK, width: 1, id: ra.id });
    placer.addInk(ra.id, ra.id, pts);
  }

  // Ticks.
  const ticks: { id: string; at: Point; dir: Point; text: string; axis: number }[] = [];
  if (input.axes?.ticks === true) {
    for (let i = 0; i < 3; i += 1) {
      const unitDir: [number, number, number] = [0, 0, 0];
      unitDir[i] = 1;
      const dir = pageDir(unitDir);
      const n = { x: -dir.y, y: dir.x };
      for (let t = Math.ceil(lo[i]!); t <= Math.floor(hi[i]!); t += 1) {
        if (t === 0) continue;
        const p: [number, number, number] = [0, 0, 0];
        p[i] = t;
        const c = page(p);
        const id = `tick-${axesKeys[i]}-${t < 0 ? "m" : ""}${Math.abs(t)}`;
        const pts = [{ x: c.x - n.x * TICK_HALF, y: c.y - n.y * TICK_HALF }, { x: c.x + n.x * TICK_HALF, y: c.y + n.y * TICK_HALF }];
        board.poly(pts, { stroke: AXIS, width: 1.2, id });
        placer.addInk(id, id, pts);
        ticks.push({ id, at: c, dir: n, text: printExact(t, locale).text, axis: i });
      }
    }
  }

  // Dots last: nothing is ever drawn over a point.
  for (const d of dots) {
    const c = page(d.p);
    const r = d.small ? DOT_R - 0.6 : DOT_R;
    board.circle(c, r, { stroke: d.colour, width: 1, fill: d.colour, id: d.id });
    placer.addInk(d.id, d.id, Array.from({ length: 13 }, (_, i) => ({ x: c.x + r * Math.cos((i * Math.PI) / 6), y: c.y + r * Math.sin((i * Math.PI) / 6) })));
    placer.addPlace(c);
  }
  const origin = page([0, 0, 0]);
  if (input.axes?.origin !== false) placer.addPlace(origin);

  // ---- 8. labels ----
  // Point labels first (they have the least freedom), then vector and line
  // names, plane names, tick numbers, axis names.
  const placeLabel = (id: string, text: string, p: Point, colour: string, size: number, weight: number, r: number, own: string | null, optional = false): void => {
    const style = { size, weight, colour };
    const { w, h } = board.extent(text, style);
    const best = placer.choose(aroundPlace(p, w, h, r), w, h, (c) => placer.placeCost(p, own, c, w, h, 1), !optional);
    // An optional label (the origin's "O") is left out rather than set
    // where it would read as naming something else.
    if (optional && best.cost > 0) return;
    if (optional) placer.reserve({ x: best.centre.x - w / 2, y: best.centre.y - h / 2, width: w, height: h });
    board.label(text, best.centre.x, best.centre.y, { ...style, width: w, id, annotatesPlace: { x: p.x, y: p.y } });
  };
  for (const d of dots) {
    if (d.text === undefined) continue;
    const c = page(d.p);
    placeLabel(`${d.id}-label`, d.text, c, d.small ? d.colour : INK, d.small ? 12 : 13, d.small ? 600 : 700, d.small ? DOT_R - 0.6 : DOT_R, d.id);
  }
  if (input.axes?.origin !== false) placeLabel("origin-label", "O", origin, SOFT, 12, 600, 1, null, true);

  const elementLabel = (group: string, text: string, colour: string, size: number, weight: number, spots: Point[], lead = 4): void => {
    const style = { size, weight, colour };
    const { w, h } = board.extent(text, style);
    const best = placer.choose(spots, w, h, (c) => placer.elementCost(group, c, w, h, lead));
    board.label(text, best.centre.x, best.centre.y, { ...style, width: w, annotates: placer.nearestOf(group, best.centre) });
  };
  const NAME_TS = [0.55, 0.45, 0.65, 0.35, 0.75, 0.25, 0.8, 0.2, 0.85, 0.15];
  for (const ar of arrows) {
    const style = { size: 15, weight: 700 };
    const { w, h } = board.extent(ar.name, style);
    elementLabel(ar.group, ar.name, ar.colour, 15, 700, besideRun(page(ar.tail), page(ar.head), w, h, NAME_TS));
  }
  const LINE_TS = [0.93, 0.07, 0.87, 0.13, 0.8, 0.2, 0.72, 0.28, 0.62, 0.38, 0.5];
  linesList.forEach((l, k) => {
    const s = segs.find((x) => x.id === `line-${k}`)!;
    const text = l.def.label ?? l.name;
    const { w, h } = board.extent(text, { size: 15, weight: 700 });
    elementLabel(`line-${k}`, text, s.colour, 15, 700, besideRun(page(s.a), page(s.b), w, h, LINE_TS));
  });
  for (const p of patches) {
    const style = { size: 16, weight: 700 };
    const { w, h } = board.extent(p.label, style);
    const pts = p.corners.map(page);
    const g = { x: pts.reduce((s, q) => s + q.x, 0) / pts.length, y: pts.reduce((s, q) => s + q.y, 0) / pts.length };
    const spots: Point[] = [];
    for (const f of [0.14, 0.2, 0.27, 0.35, 0.44]) for (const q of pts) spots.push({ x: q.x + (g.x - q.x) * f, y: q.y + (g.y - q.y) * f });
    pts.forEach((q, i) => spots.push(...besideRun(q, pts[(i + 1) % pts.length]!, w, h, [0.5, 0.3, 0.7])));
    elementLabel(p.group, p.label, p.colour, 16, 700, spots);
  }
  for (const t of ticks) {
    const style = { size: 11, weight: 400 };
    const { w, h } = board.extent(t.text, style);
    const spots: Point[] = [];
    // Beside the tick, across the axis from it; then slid a little along the
    // axis, away from a guide that leaves the axis at a neighbouring tick.
    const along = { x: t.dir.y, y: -t.dir.x };
    for (const extra of [0, 3, 7]) {
      for (const slide of [0, 4, -4, 8, -8]) {
        for (const side of [1, -1]) {
          const reach = Math.abs(t.dir.x) * (w / 2) + Math.abs(t.dir.y) * (h / 2);
          const d = TICK_HALF + 3 + reach + extra;
          spots.push({ x: t.at.x + t.dir.x * side * d + along.x * slide, y: t.at.y + t.dir.y * side * d + along.y * slide });
        }
      }
    }
    // Then the ring round the tick, for when a guide or a vector leaves the
    // axis there on the side a number would normally take.
    spots.push(...aroundPlace(t.at, w, h, TICK_HALF));
    // A tick number names the PLACE x = 2 on its axis (ADR 0028), not the
    // tick's own 8px stroke: measured against the stroke, the axis through
    // it is always as near, and a guide ending there nearer.
    const best = placer.choose(spots, w, h, (c) => placer.placeCost(t.at, t.id, c, w, h, 1), false);
    // On the foreshortened x axis the ticks are close, and a box guide can
    // leave the axis one tick away on either side. A number with no honest
    // spot is left off -- its tick stays, and its neighbours still number the
    // scale -- rather than printed where it reads as naming the guide.
    if (best.cost > 0) continue;
    placer.reserve({ x: best.centre.x - w / 2, y: best.centre.y - h / 2, width: w, height: h });
    board.label(t.text, best.centre.x, best.centre.y, { ...style, colour: SOFT, width: w, id: `${t.id}-label`, annotatesPlace: { x: t.at.x, y: t.at.y } });
  }
  if (input.axes?.names !== false) {
    for (const ax of axisSegs) {
      const name = axesKeys[ax.i]!;
      const unitDir: [number, number, number] = [0, 0, 0];
      unitDir[ax.i] = 1;
      const dir = pageDir(unitDir);
      const tip = page(ax.b);
      const style = { size: 14, weight: 600, colour: AXIS };
      const { w, h } = board.extent(name, style);
      const spots: Point[] = [];
      for (const extra of [0, 4, 9, 15]) {
        const reach = Math.abs(dir.x) * (w / 2) + Math.abs(dir.y) * (h / 2);
        const c = { x: tip.x + dir.x * (reach + 5 + extra), y: tip.y + dir.y * (reach + 5 + extra) };
        spots.push(c);
        const n = { x: -dir.y, y: dir.x };
        for (const side of [1, -1]) spots.push({ x: c.x + n.x * side * (w / 2 + 4), y: c.y + n.y * side * (h / 2 + 4) });
      }
      const best = placer.choose(spots, w, h, (c) => placer.elementCost(`axis-${name}`, c, w, h, 0));
      board.label(name, best.centre.x, best.centre.y, { ...style, width: w, id: `axis-${name}-name`, freeStanding: true });
    }
  }

  // ---- 9. the readings panel ----
  readings.forEach((text, i) => {
    board.label(text, 24 + (width - 48) / 2, plotH + 12 + i * CAPTION_LINE_H, {
      ...captionStyle,
      align: "start",
      width: width - 48,
      id: `reading-${i}`,
      claim: false,
      freeStanding: true,
    });
  });

  const spec = board.spec(input.title ?? "geometria analítica no espaço");
  const scene = spec.root as Scene;
  scene.connectors = [];
  spec.canvas = { ...spec.canvas, constraints: { allowOverlap: true, allowConnectorCrossing: true, allowCurvedConnectors: true } };
  return parseSpec(spec);

  // ---- measures, closed over the resolved objects ----

  function measureDistance(A: Obj, B: Obj, path: string): number {
    const [X, Y] = rank(A) <= rank(B) ? [A, B] : [B, A];
    if (X.kind === "point" && Y.kind === "point") return distance(X.p, Y.p);
    if (X.kind === "point" && Y.kind === "line") return distancePointToLine3(X.p, Y.line);
    if (X.kind === "point" && Y.kind === "plane") return distancePointToPlane3(X.p, Y.plane);
    if (X.kind === "line" && Y.kind === "line") {
      const rel = geom(path, () => relativePosition3(X.line, Y.line));
      if (rel.kind === "paralelas") return distancePointToLine3(Y.line.point, X.line);
      if (rel.kind === "reversas") {
        const n = cross3(X.line.direction, Y.line.direction);
        return Math.abs(dot(sub(Y.line.point, X.line.point), n)) / length(n);
      }
      return 0;
    }
    if (X.kind === "line" && Y.kind === "plane") {
      const hit = geom(path, () => intersectLinePlane3(X.line, Y.plane));
      return hit.kind === "parallel" ? distancePointToPlane3(X.line.point, Y.plane) : 0;
    }
    if (X.kind === "plane" && Y.kind === "plane") {
      const hit = geom(path, () => intersectPlanes3(X.plane, Y.plane));
      return hit.kind === "parallel" ? distancePointToPlane3(Y.plane.point, X.plane) : 0;
    }
    throw new SpecError(`${path}: a distance is measured between points, lines and planes -- "${A.name}" is ${KIND_WORD[A.kind]}, "${B.name}" ${KIND_WORD[B.kind]}`);
  }
}

function rank(o: Obj): number {
  return o.kind === "point" ? 0 : o.kind === "line" ? 1 : o.kind === "plane" ? 2 : 3;
}

function measureAngle(A: Obj, B: Obj, path: string, locale: Locale): string {
  const [X, Y] = rank(A) <= rank(B) ? [A, B] : [B, A];
  const name = `ângulo(${A.name}, ${B.name})`;
  let theta: number;
  let trig: "cos" | "sen" = "cos";
  if (X.kind === "vector" && Y.kind === "vector") theta = geom(path, () => angleBetween(X.d, Y.d));
  else if (X.kind === "line" && Y.kind === "line") theta = geom(path, () => angleBetweenLines3(X.line, Y.line));
  else if (X.kind === "line" && Y.kind === "plane") {
    theta = geom(path, () => angleLinePlane3(X.line, Y.plane));
    trig = "sen";
  } else if (X.kind === "plane" && Y.kind === "plane") theta = geom(path, () => angleBetweenPlanes3(X.plane, Y.plane));
  else throw new SpecError(`${path}: an angle is measured between two vectors, two lines, a line and a plane, or two planes`);
  const deg = printDegrees(theta, locale);
  if (deg.exact) return `${name} = ${deg.text}`;
  const value = printExact(trig === "cos" ? Math.cos(theta) : Math.sin(theta), locale);
  return `${name}: ${trig} θ ${value.exact ? "=" : "≈"} ${value.text}; θ ≈ ${deg.text}`;
}

function describePosition(A: Obj, B: Obj, path: string): string {
  const [X, Y] = rank(A) <= rank(B) ? [A, B] : [B, A];
  if (X.kind === "line" && Y.kind === "line") return `${A.name} e ${B.name}: ${geom(path, () => relativePosition3(X.line, Y.line)).kind}`;
  if (X.kind === "line" && Y.kind === "plane") {
    const hit = geom(path, () => intersectLinePlane3(X.line, Y.plane));
    const word = hit.kind === "point" ? "concorrentes (um ponto comum)" : hit.kind === "parallel" ? "paralelos" : `${X.name} está contida em ${Y.name}`;
    return `${X.name} e ${Y.name}: ${word}`;
  }
  if (X.kind === "plane" && Y.kind === "plane") {
    const hit = geom(path, () => intersectPlanes3(X.plane, Y.plane));
    return `${A.name} e ${B.name}: ${hit.kind === "line" ? "concorrentes (uma reta comum)" : hit.kind === "parallel" ? "paralelos" : "coincidentes"}`;
  }
  throw new SpecError(`${path}: a relative position is between two lines, a line and a plane, or two planes`);
}

function depthOfCentroid(camera: Camera, p: Patch): number {
  const c = p.corners.reduce<Vec3>((s, q) => add(s, q), [0, 0, 0]);
  return dot(camera.toward, scale(c, 1 / p.corners.length));
}

/**
 * The guide edges from `p` to the coordinate planes: "full" is the dashed
 * parallelepiped with O and p as opposite corners (nine edges -- the three
 * on the axes are the axes themselves); "floor" is p down to the xy-plane
 * and from there to the x and y axes. Degenerate edges (a zero coordinate)
 * are dropped.
 */
export function boxEdges(p: Vec3, mode: boolean | "full" | "floor" | undefined): [Vec3, Vec3][] {
  if (mode === undefined || mode === false) return [];
  const [x, y, z] = p;
  const V = (a: number, b: number, c: number): Vec3 => [a, b, c];
  const edges: [Vec3, Vec3][] =
    mode === "floor"
      ? [
          [p, V(x, y, 0)],
          [V(x, y, 0), V(x, 0, 0)],
          [V(x, y, 0), V(0, y, 0)],
        ]
      : [
          [V(x, 0, 0), V(x, y, 0)],
          [V(x, 0, 0), V(x, 0, z)],
          [V(0, y, 0), V(x, y, 0)],
          [V(0, y, 0), V(0, y, z)],
          [V(0, 0, z), V(x, 0, z)],
          [V(0, 0, z), V(0, y, z)],
          [V(x, y, 0), p],
          [V(x, 0, z), p],
          [V(0, y, z), p],
        ];
  const seen = new Set<string>();
  return edges.filter(([a, b]) => {
    if (distance(a, b) < 1e-9) return false;
    // A zero coordinate folds the box flat and two edges coincide.
    const key = [a, b].map((q) => q.join(",")).sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    // An edge lying ON an axis is the axis itself.
    return ![0, 1, 2].some((i) => [0, 1, 2].every((j) => j === i || (Math.abs(a[j]!) < 1e-12 && Math.abs(b[j]!) < 1e-12)));
  });
}

/** The small square at `at` between directions `a` and `b`, of side `size`, as a 3-point polyline in R³ -- drawn, not typed, so it foreshortens with the camera. */
export function rightAngle3(at: Vec3, a: Vec3, b: Vec3, size: number): Vec3[] {
  const ua = normalize(a);
  const ub = normalize(b);
  const p1 = add(at, scale(ua, size));
  const p3 = add(at, scale(ub, size));
  return [p1, add(p1, scale(ub, size)), p3];
}

// ---- validation --------------------------------------------------------------

export function validateSpaceInput(raw: Record<string, unknown>): void {
  const path = "space";
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  if (raw.camera !== undefined) {
    const c = raw.camera;
    if (typeof c === "string") v.optionalEnum(raw, "camera", path, ["cavalier", "isometric", "orthographic"]);
    else {
      const o = v.object(c, `${path}.camera`);
      v.optionalEnum(o, "kind", `${path}.camera`, ["cavalier", "isometric", "orthographic"]);
      if (o.kind === undefined) throw new SpecError(`${path}.camera.kind is required`);
      if (o.kind === "orthographic") {
        v.requiredNumber(o, "azimuth", `${path}.camera`);
        v.requiredNumber(o, "elevation", `${path}.camera`);
      }
      if (o.kind === "cavalier") {
        v.optionalNumber(o, "angle", `${path}.camera`);
        v.optionalNumber(o, "ratio", `${path}.camera`);
      }
    }
  }
  if (raw.axes !== undefined) {
    const a = v.object(raw.axes, `${path}.axes`);
    v.optionalBoolean(a, "ticks", `${path}.axes`);
    v.optionalBoolean(a, "names", `${path}.axes`);
    v.optionalBoolean(a, "origin", `${path}.axes`);
  }
  for (const key of ["points", "vectors", "lines", "planes", "measures"]) {
    if (raw[key] !== undefined) v.array(raw, key, path, key);
  }
  // References, arithmetic and every refusal are exercised by building the
  // figure: one implementation of the rules, not a shadow copy.
  expandSpace(raw as unknown as SpaceInput);
}
