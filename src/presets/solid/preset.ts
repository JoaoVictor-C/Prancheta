/**
 * solid -- the school solids of geometria espacial (ENEM, ensino médio):
 * cube, paralelepípedo, regular prisms and pyramids, right circular
 * cylinder and cone, sphere. ADR 0046.
 *
 * Dimensions are typed once. Every vertex, edge, rim ellipse and outline
 * generator is computed from them (`geometry.ts`), projected through the
 * camera of ADR 0045, and every printed measure -- a diagonal, a slant
 * height, a volume, an area -- is computed from the same dimensions and
 * written exact (`exact.ts`). A measure printed on the drawing is drawn as a
 * run stated in a frame whose unit is the camera's own foreshortening along
 * that run, so `length-matches-its-label` measures the TRUE 3D length.
 *
 * Visibility is per solid and exact for a convex body. Composites are
 * transparent: no solid hides another.
 */

import type { Frame, Mark, Point } from "../../ir/types.ts";
import type { FigureSpec, Scene } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { LOCALES } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";
import { layoutPanel } from "../shared/panel.ts";
import { GeometryError, add, dot, lerp, normalize, scale as vscale, sub as vsub } from "../../geometry/vec.ts";
import type { Vec2, Vec3 } from "../../geometry/vec.ts";
import { facesViewer, makeCamera, orthographicCamera, planeBasis, project, projectCircle, projectDirection, tangentParamsParallelTo } from "../../geometry/projection.ts";
import type { Camera, CameraSpec, ProjectedCircle } from "../../geometry/projection.ts";
import { fitUnits } from "../shared/scale.ts";
import { SpacePlacer, aroundPlace } from "../space/placer.ts";
import { rightAngle3 } from "../space/preset.ts";
import { typesANumber } from "../space/numbers.ts";
import {
  arcPoints,

  classifyEdges,
  coneView,
  convexHull,
  cylinderView,
  faceNormal,
  faceVisible,
  prism,
  pyramid,
  rectangle,
  regularPolygon,
  rightmostParam,
  sphereView,
} from "./geometry.ts";
import type { Polyhedron } from "./geometry.ts";
import { domeView, frustumView, seenThroughOpening, splitCircle, splitParam, splitWholeCircle } from "./geometry.ts";
import { MeshError, faceCensus, insidePolygon, meshArea, meshEdges, meshNormals, meshVolume, orientMesh, seeEdges, stairsMesh } from "./mesh.ts";
import type { Mesh } from "./mesh.ts";
import { NetError, coneNet, cylinderNet, frustumNet, polyhedronNet, prismTree } from "./net.ts";
import type { PolyNet, RoundNet } from "./net.ts";
import { PI, add as xadd, cbrt, div, equalsText, mul, parseTyped, print, rat, scale as xscale, sqrt as xsqrt, square, sub as xsub, valueOf, approx } from "./exact.ts";
import type { Exact } from "./exact.ts";

// ---- input ------------------------------------------------------------------

export type SolidKind = "cube" | "box" | "prism" | "pyramid" | "cylinder" | "cone" | "sphere" | "frustum" | "hemisphere" | "stairs" | "polyhedron";
export const SOLID_KINDS: readonly SolidKind[] = ["cube", "box", "prism", "pyramid", "cylinder", "cone", "sphere", "frustum", "hemisphere", "stairs", "polyhedron"];

export type ShowItem =
  | "edge"
  | "dimensions"
  | "height"
  | "radius"
  | "slant"
  | "baseApothem"
  | "spaceDiagonal"
  | "faceDiagonal"
  | "equator"
  | "topRadius"
  | "topEdge"
  | "bore"
  | "level";
export type ReadingItem = "volume" | "area" | "measures" | "counts";

/** A hole through a solid along its axis, base to top (ADR 0068): a cylinder of `radius`, or a regular prism of `sides` and `edge` -- or inscribed in a cylinder's circle. */
export type BoreDef = { radius?: number; sides?: number; edge?: number; inscribed?: boolean };
/** Liquid standing in a solid to a level: typed by its `height`, or by its `volume` (a number, or "18π"), the level then computed. */
export type LiquidDef = { height?: number; volume?: number | string };

export type SolidDef = {
  kind: SolidKind;
  /** Referred to by `inscribedIn` / `circumscribes`, and heads its readings in a composite. */
  name?: string;
  /** The centre of the base (a sphere: its centre). Default the origin. */
  at?: [number, number, number];
  edge?: number;
  width?: number;
  depth?: number;
  height?: number;
  sides?: number;
  radius?: number;
  /** Cone: the geratriz g, instead of height. Pyramid: its apótema g, instead of height. */
  slant?: number;
  /** A sphere in a cube or an equilateral cylinder; a cone in a cylinder. Every dimension is derived. */
  inscribedIn?: string;
  /** A sphere round a cube or a paralelepípedo. Every dimension is derived. */
  circumscribes?: string;
  /** true: the textbook letters (A, B, C, … ; V for an apex; O, O′ for centres); or the names, one per point. */
  labels?: boolean | string[];
  show?: ShowItem[];
  readings?: ReadingItem[];
  /** Frustum of a cone: the top radius (radius is the bottom). */
  topRadius?: number;
  /** Frustum of a pyramid: the top edge (edge is the bottom). */
  topEdge?: number;
  /** Cone: "down" stands it on its apex, base on top (a funnel, a glass); `at` is then the apex. */
  apex?: "up" | "down";
  /** Stairs. */
  steps?: number;
  tread?: number;
  riser?: number;
  /** Polyhedron from face data: coordinates, and each face's vertex indices in order round it. */
  vertices?: [number, number, number][];
  faces?: number[][];
  /** Polyhedron: tint each face by its number of sides. */
  tint?: "sides";
  /** Stand this solid on top of the named one: `at` is its top centre; a round solid on a round one takes its top radius. */
  on?: string;
  bore?: BoreDef;
  liquid?: LiquidDef;
  /** Draw the net (planificação) beside the solid, or "only" the net. */
  net?: boolean | "only";
  /** Names for the net's faces, in face order ("" leaves one unnamed). */
  netLabels?: string[];
};

export type SolidInput = {
  title?: string;
  locale?: Locale;
  /** A unit of length printed after every measure ("cm"): areas get ², volumes ³. */
  unit?: string;
  /** Default: cavalier for polyhedra alone; orthographic when a round solid is present (ADR 0046). */
  camera?: CameraSpec;
  solids: SolidDef[];
  /** Totals over the whole composite: one volume, and one area with every joined face taken off. */
  total?: ("volume" | "area")[];
  /**
   * Default true. With false the figure is the exercise's question: every solid keeps the dimensions it was
   * GIVEN, drawn and labelled, and nothing computed -- no diagonal, no slant height or apothem the dimensions
   * did not state, no derived height, no radius of a derived sphere, and no volume, area or measures in the panel.
   */
  answers?: boolean;
};

const SHOW_BY_KIND: Record<SolidKind, ShowItem[]> = {
  cube: ["edge", "spaceDiagonal", "faceDiagonal"],
  box: ["dimensions", "spaceDiagonal", "faceDiagonal"],
  prism: ["edge", "height"],
  pyramid: ["edge", "height", "slant", "baseApothem"],
  cylinder: ["radius", "height"],
  cone: ["radius", "height", "slant"],
  sphere: ["radius", "equator"],
  frustum: ["edge", "topEdge", "radius", "topRadius", "height", "slant"],
  hemisphere: ["radius"],
  stairs: ["dimensions"],
  polyhedron: [],
};
const READINGS: readonly ReadingItem[] = ["volume", "area", "measures", "counts"];

const WORD: Record<SolidKind, string> = {
  cube: "Cubo",
  box: "Paralelepípedo",
  prism: "Prisma",
  pyramid: "Pirâmide",
  cylinder: "Cilindro",
  cone: "Cone",
  sphere: "Esfera",
  frustum: "Tronco",
  hemisphere: "Semiesfera",
  stairs: "Escada",
  polyhedron: "Poliedro",
};

// ---- palette and sizes -------------------------------------------------------------

const PAPER = "#FCFBF7";
const SOLID_COLOURS = ["#181B21", "#1D4E89", "#2F6B3A"];
const ACCENT = "#9A3409";
const WATER = "#2A7AB8";
const WATER_TEXT = "#1B5A8C";
const SOFT = "#4E5763";
const TARGET = 400;
/** Pixels per unit of length for a solid whose largest dimension is from 1 to 30; other magnitudes scale by their decade. */
const MIN_UNIT = 20;
const MAX_UNIT = 120;
const PAD = 62;
const DOT_R = 3;
const CAPTION_LINE_H = 20;
const W_VISIBLE = 1.8;
const W_HIDDEN = 1.2;
const W_CONSTRUCTION = 1.7;

// ---- resolved solids ----------------------------------------------------------------

type Dims = {
  a?: Exact; // cube edge, or a regular base's edge ℓ
  w?: Exact; // box: along y
  d?: Exact; // box: along x
  h?: Exact;
  r?: Exact;
  g?: Exact; // slant: cone geratriz, pyramid apótema
  m?: Exact; // pyramid base apothem
  n?: number;
  rt?: Exact; // frustum of a cone: top radius
  b?: Exact; // frustum of a pyramid: top edge
  mt?: Exact; // frustum of a pyramid: top apothem
  steps?: number; // stairs
  t?: Exact; // stairs: tread (piso)
  e?: Exact; // stairs: riser (espelho)
};

export type Bore = { kind: "round"; rho: Exact } | { kind: "polygon"; n: number; edge: Exact; inscribed: boolean };
export type Liquid = { level: Exact; volume: Exact; given: "height" | "volume" };

type Resolved = {
  index: number;
  path: string;
  name: string;
  kind: SolidKind;
  def: SolidDef;
  at: Vec3;
  dims: Dims;
  derivation?: string;
  colour: string;
  /** stairs and polyhedron: the oriented mesh, drawn with hidden-line removal (mesh.ts). */
  mesh?: Mesh;
  /** The solid this one stands on (`on`). */
  host?: number;
  /** A cone standing on its apex. */
  down?: boolean;
  bore?: Bore;
  liquid?: Liquid;
};

/**
 * Whether a construction of `show` draws a length the exercise states. A derived solid states none; a height or a
 * slant is given only when it was typed (a cone typed by its slant does not state the height); a diagonal and a
 * base apothem are always computed.
 */
function isGiven(s: Resolved, item: ShowItem): boolean {
  if (s.derivation !== undefined) return item === "equator";
  switch (item) {
    case "edge":
    case "dimensions":
    case "radius":
    case "equator":
      return true;
    case "topRadius":
    case "topEdge":
      return true;
    case "bore":
      return s.bore !== undefined && !(s.bore.kind === "polygon" && s.bore.inscribed);
    case "level":
      return s.liquid?.given === "height";
    case "height":
      return s.def.height !== undefined;
    case "slant":
      return s.def.slant !== undefined;
    default:
      return false;
  }
}

function positive(o: Record<string, unknown>, key: string, path: string): Exact {
  const x = v.requiredNumber(o, key, path);
  if (!(x > 0)) throw new SpecError(`${path}.${key} must be positive, got ${x} -- a solid has no side of length ${x}`);
  return rat(x);
}

function coord3(raw: unknown, path: string): Vec3 {
  if (!Array.isArray(raw) || raw.length !== 3) throw new SpecError(`${path} must be [x, y, z]`);
  return [v.finite(raw[0], `${path}[0]`), v.finite(raw[1], `${path}[1]`), v.finite(raw[2], `${path}[2]`)];
}

/** The apothem of the regular n-gon of side ℓ: exact for n = 3, 4, 6, the bases a school exercise uses. */
export function baseApothem(n: number, edge: Exact): Exact {
  if (n === 3) return xscale(mul(edge, xsqrt(rat(3))), 1 / 6);
  if (n === 4) return xscale(edge, 1 / 2);
  if (n === 6) return xscale(mul(edge, xsqrt(rat(3))), 1 / 2);
  return approx(valueOf(edge) / (2 * Math.tan(Math.PI / n)));
}

/** Area of the regular n-gon of side ℓ: n·ℓ·m/2. */
export function baseArea(n: number, edge: Exact): Exact {
  return xscale(mul(edge, baseApothem(n, edge)), n / 2);
}

const BASE_AREA_FORMULA: Record<number, string> = { 3: "ℓ²√3/4", 4: "ℓ²", 6: "3ℓ²√3/2" };
const APOTHEM_FORMULA: Record<number, string> = { 3: "ℓ√3/6", 4: "ℓ/2", 6: "ℓ√3/2" };

const DERIVED_KEYS = ["at", "edge", "width", "depth", "height", "radius", "slant", "sides", "topRadius", "topEdge"] as const;

/** The radius of the round top a solid offers a solid stood on it: a cylinder's, a cone frustum's top. */
function topRadiusOf(T: Resolved): Exact | undefined {
  if (T.kind === "cylinder") return T.dims.r;
  if (T.kind === "frustum" && T.dims.r !== undefined) return T.dims.rt;
  return undefined;
}

/** The height of the top face of a solid that has a flat top, or null (a cone, a pyramid, a sphere). */
export function topHeightOf(s: { kind: SolidKind; dims: Dims; down?: boolean }): Exact | null {
  if (s.kind === "cube") return s.dims.a!;
  if (s.kind === "box" || s.kind === "prism" || s.kind === "cylinder" || s.kind === "frustum") return s.dims.h!;
  return null;
}

/** 2R·sin(π/n), the side of the regular n-gon inscribed in a circle of radius R: exact for n = 3, 4, 6. */
export function inscribedEdge(n: number, R: Exact): Exact {
  if (n === 3) return mul(R, xsqrt(rat(3)));
  if (n === 4) return mul(R, xsqrt(rat(2)));
  if (n === 6) return R;
  return approx(2 * valueOf(R) * Math.sin(Math.PI / n));
}

function resolveAll(input: SolidInput): Resolved[] {
  const raws = v.nonEmptyArray(input as unknown as Record<string, unknown>, "solids", "solid", "solids");
  const byName = new Map<string, number>();
  raws.forEach((raw, i) => {
    const o = v.object(raw, `solids[${i}]`);
    const name = v.optionalString(o, "name", `solids[${i}]`);
    if (name !== undefined) {
      if (byName.has(name)) throw new SpecError(`solids[${i}].name "${name}" is already used by solids[${byName.get(name)}]`);
      byName.set(name, i);
    }
  });
  const done = new Map<number, Resolved>();
  const visiting = new Set<number>();

  const resolve = (i: number): Resolved => {
    const cached = done.get(i);
    if (cached !== undefined) return cached;
    const path = `solids[${i}]`;
    if (visiting.has(i)) throw new SpecError(`${path} is derived from itself`);
    visiting.add(i);
    const o = v.object(raws[i], path);
    const kind = v.optionalEnum(o, "kind", path, SOLID_KINDS);
    if (kind === undefined) throw new SpecError(`${path}.kind is required: one of ${SOLID_KINDS.join(", ")}`);
    const def = o as unknown as SolidDef;
    const name = def.name ?? `${WORD[kind]}${raws.length > 1 ? ` ${i + 1}` : ""}`;
    const colour = SOLID_COLOURS[i % SOLID_COLOURS.length]!;
    const dims: Dims = {};
    let at: Vec3 = def.at === undefined ? [0, 0, 0] : coord3(def.at, `${path}.at`);
    let derivation: string | undefined;

    let mesh: Mesh | undefined;
    let host: number | undefined;
    let hostTop: Exact | undefined;
    if (def.on !== undefined) {
      if (def.inscribedIn !== undefined || def.circumscribes !== undefined) throw new SpecError(`${path}: a solid is either stood on another or derived from one, not both`);
      if (def.at !== undefined) throw new SpecError(`${path}.at is derived from "${def.on}" -- a solid stood on another sits on its top`);
      const j = byName.get(String(def.on));
      if (j === undefined) throw new SpecError(`${path}.on: no solid is named "${String(def.on)}"`);
      const T = resolve(j);
      const top = topHeightOf(T);
      if (top === null || T.down === true) throw new SpecError(`${path}.on: a ${T.kind} has no flat top to stand a solid on`);
      host = j;
      at = add(T.at, [0, 0, valueOf(top)]);
      if (kind === "hemisphere" || kind === "cone" || kind === "cylinder") hostTop = topRadiusOf(T);
    }
    const relation = def.inscribedIn !== undefined ? "inscribedIn" : def.circumscribes !== undefined ? "circumscribes" : null;
    if (def.inscribedIn !== undefined && def.circumscribes !== undefined) throw new SpecError(`${path} cannot be both inscribedIn and circumscribes`);
    if (relation !== null) {
      for (const k of DERIVED_KEYS) {
        if (k === "sides" && kind === "prism" && relation === "inscribedIn") continue;
        if (o[k] !== undefined) throw new SpecError(`${path}.${k} is derived from "${String(o[relation])}" -- a derived solid's dimensions are never typed`);
      }
      const targetName = String(o[relation]);
      const j = byName.get(targetName);
      if (j === undefined) throw new SpecError(`${path}.${relation}: no solid is named "${targetName}"`);
      const T = resolve(j);
      if (relation === "inscribedIn" && kind === "sphere" && T.kind === "cube") {
        dims.r = xscale(T.dims.a!, 1 / 2);
        at = add(T.at, [0, 0, valueOf(dims.r)]);
        derivation = `inscrita no cubo: r = a/2`;
      } else if (relation === "inscribedIn" && kind === "sphere" && T.kind === "cylinder") {
        if (Math.abs(valueOf(T.dims.h!) - 2 * valueOf(T.dims.r!)) > 1e-9) {
          throw new SpecError(`${path}: a sphere fits a cylinder only when h = 2r (cilindro equilátero); "${targetName}" has h ${print(T.dims.h!).text} and r ${print(T.dims.r!).text}`);
        }
        dims.r = T.dims.r!;
        at = add(T.at, [0, 0, valueOf(dims.r)]);
        derivation = `inscrita no cilindro equilátero: r = R`;
      } else if (relation === "inscribedIn" && kind === "cone" && T.kind === "cylinder") {
        dims.r = T.dims.r!;
        dims.h = T.dims.h!;
        at = T.at;
        derivation = `inscrito no cilindro: mesma base, mesma altura`;
      } else if (relation === "inscribedIn" && kind === "prism" && T.kind === "cylinder") {
        const n = v.requiredNumber(o, "sides", path);
        if (!Number.isInteger(n) || n < 3 || n > 12) throw new SpecError(`${path}.sides must be a whole number from 3 to 12, got ${n}`);
        dims.n = n;
        dims.a = inscribedEdge(n, T.dims.r!);
        dims.h = T.dims.h!;
        at = T.at;
        derivation = `inscrito no cilindro: ℓ = ${n === 3 ? "R√3" : n === 4 ? "R√2" : n === 6 ? "R" : "2R·sen(180°/n)"}`;
      } else if (relation === "inscribedIn" && kind === "cylinder" && (T.kind === "prism" || T.kind === "cube")) {
        dims.r = T.kind === "cube" ? xscale(T.dims.a!, 1 / 2) : baseApothem(T.dims.n!, T.dims.a!);
        dims.h = T.kind === "cube" ? T.dims.a! : T.dims.h!;
        at = T.at;
        derivation = T.kind === "cube" ? `inscrito no cubo: r = a/2` : `inscrito no prisma: r = m`;
      } else if (relation === "circumscribes" && kind === "sphere" && (T.kind === "cube" || T.kind === "box")) {
        const [w, d, h] = T.kind === "cube" ? [T.dims.a!, T.dims.a!, T.dims.a!] : [T.dims.w!, T.dims.d!, T.dims.h!];
        dims.r = xscale(xsqrt(xadd(xadd(square(w), square(d)), square(h))), 1 / 2);
        at = add(T.at, [0, 0, valueOf(h) / 2]);
        derivation = T.kind === "cube" ? `circunscrita ao cubo: r = a√3/2` : `circunscrita ao paralelepípedo: r = D/2`;
      } else {
        throw new SpecError(
          `${path}: a ${kind} ${relation === "inscribedIn" ? "inscribed in" : "circumscribing"} a ${T.kind} is not offered -- ` +
            `inscribedIn: a sphere in a cube or equilateral cylinder, a cone or a regular prism in a cylinder, a cylinder in a cube or regular prism; circumscribes: a sphere round a cube or box`,
        );
      }
    } else if (kind === "stairs") {
      const n = v.requiredNumber(o, "steps", path);
      if (!Number.isInteger(n) || n < 1 || n > 12) throw new SpecError(`${path}.steps must be a whole number from 1 to 12, got ${n}`);
      dims.steps = n;
      dims.t = positive(o, "tread", path);
      dims.e = positive(o, "riser", path);
      dims.w = positive(o, "width", path);
      dims.h = xscale(dims.e, n);
    } else if (kind === "polyhedron") {
      if (!Array.isArray(o.vertices)) throw new SpecError(`${path}.vertices must be a list of [x, y, z]`);
      if (!Array.isArray(o.faces)) throw new SpecError(`${path}.faces must be a list of vertex-index lists`);
      const verts = (o.vertices as unknown[]).map((p, k) => add(coord3(p, `${path}.vertices[${k}]`), at));
      const faces = (o.faces as unknown[]).map((f, k) => {
        if (!Array.isArray(f)) throw new SpecError(`${path}.faces[${k}] must be a list of vertex indices`);
        return f.map((x, m) => v.finite(x, `${path}.faces[${k}][${m}]`));
      });
      try {
        mesh = orientMesh({ vertices: verts, faces });
      } catch (e) {
        if (e instanceof MeshError) throw new SpecError(`${path}: ${e.message}`);
        throw e;
      }
      const zs = verts.map((p) => p[2]);
      dims.h = rat(Math.max(...zs) - Math.min(...zs));
    } else if (kind === "frustum") {
      const pyramidal = o.edge !== undefined || o.sides !== undefined || o.topEdge !== undefined;
      if (pyramidal) {
        const n = o.sides === undefined ? 4 : v.requiredNumber(o, "sides", path);
        if (!Number.isInteger(n) || n < 3 || n > 12) throw new SpecError(`${path}.sides must be a whole number from 3 to 12, got ${n}`);
        dims.n = n;
        dims.a = positive(o, "edge", path);
        dims.b = positive(o, "topEdge", path);
        if (Math.abs(valueOf(dims.a) - valueOf(dims.b)) < 1e-12 * valueOf(dims.a)) throw new SpecError(`${path}: a frustum with equal edges is a prism -- use kind "prism"`);
        dims.m = baseApothem(n, dims.a);
        dims.mt = baseApothem(n, dims.b);
      } else {
        dims.r = positive(o, "radius", path);
        dims.rt = positive(o, "topRadius", path);
        if (Math.abs(valueOf(dims.r) - valueOf(dims.rt)) < 1e-12 * valueOf(dims.r)) throw new SpecError(`${path}: a frustum with equal radii is a cylinder -- use kind "cylinder"`);
      }
      const dr = pyramidal ? xsub(dims.m!, dims.mt!) : xsub(dims.r!, dims.rt!);
      if ((o.height === undefined) === (o.slant === undefined)) throw new SpecError(`${path} needs exactly one of height and slant (the ${pyramidal ? "apótema" : "geratriz"} g of the frustum)`);
      if (o.height !== undefined) {
        dims.h = positive(o, "height", path);
        dims.g = xsqrt(xadd(square(dims.h), square(dr)));
      } else {
        dims.g = positive(o, "slant", path);
        const h2 = xsub(square(dims.g), square(dr));
        if (!(valueOf(h2) > 1e-12 * valueOf(square(dims.g)))) throw new SpecError(`${path}.slant ${print(dims.g).text} must exceed ${print(approx(Math.abs(valueOf(dr)))).text}, the difference of the ${pyramidal ? "apothems" : "radii"}`);
        dims.h = xsqrt(h2);
      }
    } else if (kind === "hemisphere") {
      dims.r = o.radius === undefined && hostTop !== undefined ? hostTop : positive(o, "radius", path);
    } else if (kind === "cube") {
      dims.a = positive(o, "edge", path);
    } else if (kind === "box") {
      dims.w = positive(o, "width", path);
      dims.d = positive(o, "depth", path);
      dims.h = positive(o, "height", path);
    } else if (kind === "prism" || kind === "pyramid") {
      const n = o.sides === undefined && kind === "pyramid" ? 4 : v.requiredNumber(o, "sides", path);
      if (!Number.isInteger(n) || n < 3 || n > 12) throw new SpecError(`${path}.sides must be a whole number from 3 to 12, got ${n}`);
      dims.n = n;
      dims.a = positive(o, "edge", path);
      if (kind === "prism") dims.h = positive(o, "height", path);
      else {
        dims.m = baseApothem(n, dims.a);
        if ((o.height === undefined) === (o.slant === undefined)) throw new SpecError(`${path} needs exactly one of height and slant (the apótema g)`);
        if (o.height !== undefined) {
          dims.h = positive(o, "height", path);
          dims.g = xsqrt(xadd(square(dims.h), square(dims.m)));
        } else {
          dims.g = positive(o, "slant", path);
          const h2 = xsub(square(dims.g), square(dims.m));
          if (!(valueOf(h2) > 1e-12 * valueOf(square(dims.g)))) {
            throw new SpecError(`${path}.slant ${print(dims.g).text} must exceed the base apothem m = ${print(dims.m).text} -- no pyramid has that apótema`);
          }
          dims.h = xsqrt(h2);
        }
      }
    } else if (kind === "cylinder") {
      dims.r = o.radius === undefined && hostTop !== undefined ? hostTop : positive(o, "radius", path);
      dims.h = positive(o, "height", path);
    } else if (kind === "cone") {
      dims.r = o.radius === undefined && hostTop !== undefined ? hostTop : positive(o, "radius", path);
      if ((o.height === undefined) === (o.slant === undefined)) throw new SpecError(`${path} needs exactly one of height and slant (the geratriz g)`);
      if (o.height !== undefined) dims.h = positive(o, "height", path);
      else {
        const g = positive(o, "slant", path);
        const h2 = xsub(square(g), square(dims.r));
        if (!(valueOf(h2) > 1e-12 * valueOf(square(g)))) throw new SpecError(`${path}.slant ${print(g).text} must exceed the radius ${print(dims.r).text} -- the geratriz is the hypotenuse`);
        dims.h = xsqrt(h2);
      }
    } else {
      dims.r = positive(o, "radius", path);
    }
    if (kind === "cone") dims.g = dims.g ?? xsqrt(xadd(square(dims.r!), square(dims.h!)));

    // ---- a cone on its apex, a bore, a liquid, a net (ADR 0068) ----
    let down: boolean | undefined;
    if (o.apex !== undefined) {
      if (kind !== "cone") throw new SpecError(`${path}.apex is a cone's: "up" or "down"`);
      if (o.apex !== "up" && o.apex !== "down") throw new SpecError(`${path}.apex must be "up" or "down"`);
      if (o.apex === "down") {
        if (relation !== null || host !== undefined) throw new SpecError(`${path}: a cone on its apex is typed by its own radius and height`);
        down = true;
      }
    }
    const shape: Shape = { kind, at, dims, ...(down === undefined ? {} : { down }) };
    let bore: Bore | undefined;
    if (o.bore !== undefined) {
      const bo = v.object(o.bore, `${path}.bore`);
      if (!["cylinder", "frustum", "prism", "cube", "box"].includes(kind)) throw new SpecError(`${path}.bore: a bore runs through a solid with two flat bases -- a cylinder, a frustum, a prism, a cube or a box, not a ${kind}`);
      const inner = innerRadius(shape);
      if (bo.radius !== undefined) {
        if (bo.sides !== undefined || bo.edge !== undefined || bo.inscribed !== undefined) throw new SpecError(`${path}.bore is either round (radius) or a prism (sides with edge or inscribed)`);
        const rho = positive(bo, "radius", `${path}.bore`);
        if (!(valueOf(rho) < valueOf(inner) * (1 - 1e-12))) throw new SpecError(`${path}.bore.radius ${print(rho).text} does not fit: the hole must be narrower than ${print(inner).text}, the solid's narrowest half-width`);
        bore = { kind: "round", rho };
      } else {
        const n = v.requiredNumber(bo, "sides", `${path}.bore`);
        if (!Number.isInteger(n) || n < 3 || n > 12) throw new SpecError(`${path}.bore.sides must be a whole number from 3 to 12, got ${n}`);
        if ((bo.edge === undefined) === (bo.inscribed !== true)) throw new SpecError(`${path}.bore needs exactly one of edge and inscribed: true`);
        if (bo.inscribed === true) {
          if (kind !== "cylinder") throw new SpecError(`${path}.bore.inscribed: a prism is inscribed in a cylinder's circle; a ${kind} has none`);
          bore = { kind: "polygon", n, edge: inscribedEdge(n, dims.r!), inscribed: true };
        } else {
          const edge = positive(bo, "edge", `${path}.bore`);
          const R = valueOf(edge) / (2 * Math.sin(Math.PI / n));
          if (!(R < valueOf(inner) * (1 - 1e-12))) throw new SpecError(`${path}.bore: a ${n}-gon of edge ${print(edge).text} does not fit inside the solid (its corners reach ${print(approx(R)).text} from the axis; the solid allows ${print(inner).text})`);
          bore = { kind: "polygon", n, edge, inscribed: false };
        }
      }
    }
    let liquid: Liquid | undefined;
    if (o.liquid !== undefined) {
      const lo = v.object(o.liquid, `${path}.liquid`);
      if (!["cube", "box", "prism", "cylinder", "cone", "frustum", "pyramid"].includes(kind)) throw new SpecError(`${path}.liquid: a liquid level is drawn in a cube, box, prism, pyramid, cylinder, cone or frustum, not a ${kind}`);
      if (bore !== undefined) throw new SpecError(`${path}: a liquid in a bored solid is not offered`);
      if ((lo.height === undefined) === (lo.volume === undefined)) throw new SpecError(`${path}.liquid needs exactly one of height and volume`);
      const H = dims.h ?? dims.a!;
      const full = solidVolume(shape);
      if (lo.height !== undefined) {
        const level = positive(lo, "height", `${path}.liquid`);
        if (valueOf(level) > valueOf(H) * (1 + 1e-12)) throw new SpecError(`${path}.liquid.height ${print(level).text} is above the solid's height ${print(H).text}`);
        liquid = { level, volume: liquidVolume(shape, level), given: "height" };
      } else {
        if (typeof lo.volume !== "number" && typeof lo.volume !== "string") throw new SpecError(`${path}.liquid.volume must be a number or a string like "18π"`);
        const vol = parseTyped(lo.volume);
        if (vol === null) throw new SpecError(`${path}.liquid.volume "${String(lo.volume)}" is not a number or a multiple of π`);
        if (!(valueOf(vol) > 0)) throw new SpecError(`${path}.liquid.volume must be positive`);
        if (valueOf(vol) > valueOf(full) * (1 + 1e-12)) throw new SpecError(`${path}.liquid.volume ${print(vol).text} is more than the solid holds (${print(full).text})`);
        liquid = { level: levelOf(shape, vol), volume: vol, given: "volume" };
      }
    }
    if (o.net !== undefined) {
      if (o.net !== true && o.net !== false && o.net !== "only") throw new SpecError(`${path}.net must be true, false or "only"`);
      if (o.net !== false && (kind === "sphere" || kind === "hemisphere")) throw new SpecError(`${path}.net: a sphere has no net -- its surface does not unroll flat`);
      if (o.net !== false && bore !== undefined) throw new SpecError(`${path}.net: the net of a bored solid is not offered`);
      if (o.net === "only" && liquid !== undefined) throw new SpecError(`${path}: a liquid is drawn in the solid, so the solid must be drawn too (net: true)`);
    }
    if (o.netLabels !== undefined) {
      if (!Array.isArray(o.netLabels)) throw new SpecError(`${path}.netLabels must be a list of names`);
      (o.netLabels as unknown[]).forEach((l, k) => {
        if (typeof l !== "string") throw new SpecError(`${path}.netLabels[${k}] must be a string`);
        if (typesANumber(l) && !/^\d{1,2}$/.test(l.trim())) throw new SpecError(`${path}.netLabels[${k}] "${l}" types a number -- a face is named (or numbered, as on a die), never measured`);
      });
    }
    if (o.tint !== undefined && (kind !== "polyhedron" || o.tint !== "sides")) throw new SpecError(`${path}.tint: "sides" tints a polyhedron's faces by their number of sides`);

    const show = def.show ?? [];
    if (!Array.isArray(show)) throw new SpecError(`${path}.show must be an array`);
    const offered = (item: ShowItem): boolean => {
      if (item === "bore") return bore !== undefined;
      if (item === "level") return liquid !== undefined;
      if (kind === "frustum" && dims.r !== undefined) return ["radius", "topRadius", "height", "slant"].includes(item);
      if (kind === "frustum") return ["edge", "topEdge", "height", "slant"].includes(item);
      return SHOW_BY_KIND[kind].includes(item);
    };
    show.forEach((s, k) => {
      if (!offered(s)) {
        throw new SpecError(`${path}.show[${k}] "${String(s)}" is not drawn on a ${kind} -- offered: ${SHOW_BY_KIND[kind].join(", ")}`);
      }
    });
    const readings = def.readings ?? [];
    if (!Array.isArray(readings)) throw new SpecError(`${path}.readings must be an array`);
    readings.forEach((s, k) => {
      if (!READINGS.includes(s)) throw new SpecError(`${path}.readings[${k}] must be one of ${READINGS.join(", ")}`);
    });
    if (Array.isArray(def.labels)) {
      def.labels.forEach((l, k) => {
        if (typeof l !== "string" || l.trim() === "") throw new SpecError(`${path}.labels[${k}] must be a non-empty name`);
        if (typesANumber(l)) throw new SpecError(`${path}.labels[${k}] "${l}" types a number -- a point is named, never numbered`);
      });
    } else if (def.labels !== undefined && typeof def.labels !== "boolean") throw new SpecError(`${path}.labels must be true, false or a list of names`);

    const r: Resolved = {
      index: i,
      path,
      name,
      kind,
      def,
      at,
      dims,
      colour,
      ...(derivation === undefined ? {} : { derivation }),
      ...(kind === "stairs" ? { mesh: orientMesh(stairsMesh(at, dims.steps!, valueOf(dims.t!), valueOf(dims.e!), valueOf(dims.w!))) } : mesh === undefined ? {} : { mesh }),
      ...(host === undefined ? {} : { host }),
      ...(down === undefined ? {} : { down }),
      ...(bore === undefined ? {} : { bore }),
      ...(liquid === undefined ? {} : { liquid }),
    };
    visiting.delete(i);
    done.set(i, r);
    return r;
  };
  return raws.map((_, i) => resolve(i));
}

// ---- volumes, bores and liquids (ADR 0068) ---------------------------------------------

type Shape = { kind: SolidKind; at: Vec3; dims: Dims; down?: boolean };

/** The distance from the axis to the nearest point of the solid's side, over its whole height: what a bore must stay inside. */
function innerRadius(s: Shape): Exact {
  const d = s.dims;
  if (s.kind === "cylinder") return d.r!;
  if (s.kind === "cube") return xscale(d.a!, 1 / 2);
  if (s.kind === "box") return xscale(valueOf(d.w!) < valueOf(d.d!) ? d.w! : d.d!, 1 / 2);
  if (s.kind === "prism") return baseApothem(d.n!, d.a!);
  if (d.r !== undefined) return valueOf(d.r) < valueOf(d.rt!) ? d.r : d.rt!;
  return valueOf(d.m!) < valueOf(d.mt!) ? d.m! : d.mt!;
}

/** The base area of a solid with a constant cross-section. */
function sectionArea(s: Shape): Exact {
  const d = s.dims;
  if (s.kind === "cube") return square(d.a!);
  if (s.kind === "box") return mul(d.w!, d.d!);
  if (s.kind === "prism") return baseArea(d.n!, d.a!);
  return mul(PI, square(d.r!));
}

/** The exact volume of a school solid, a frustum or a hemisphere. */
export function solidVolume(s: Shape): Exact {
  const d = s.dims;
  switch (s.kind) {
    case "cube":
    case "box":
    case "prism":
    case "cylinder":
      return mul(sectionArea(s), d.h ?? d.a!);
    case "pyramid":
      return xscale(mul(baseArea(d.n!, d.a!), d.h!), 1 / 3);
    case "cone":
      return xscale(mul(PI, mul(square(d.r!), d.h!)), 1 / 3);
    case "frustum":
      if (d.r !== undefined) return xscale(mul(mul(PI, d.h!), xadd(xadd(square(d.r), mul(d.r, d.rt!)), square(d.rt!))), 1 / 3);
      {
        const B = baseArea(d.n!, d.a!);
        const b = baseArea(d.n!, d.b!);
        return xscale(mul(d.h!, xadd(xadd(B, div(mul(B, d.b!), d.a!)), b)), 1 / 3);
      }
    case "sphere":
      return xscale(mul(PI, mul(square(d.r!), d.r!)), 4 / 3);
    case "hemisphere":
      return xscale(mul(PI, mul(square(d.r!), d.r!)), 2 / 3);
    default:
      throw new SpecError(`the volume of a ${s.kind} is computed from its mesh`);
  }
}

/** The exact total area of a school solid, a frustum or a hemisphere (its base included). */
export function solidArea(s: Shape): Exact {
  const d = s.dims;
  switch (s.kind) {
    case "cube":
      return xscale(square(d.a!), 6);
    case "box":
      return xscale(xadd(xadd(mul(d.w!, d.d!), mul(d.w!, d.h!)), mul(d.d!, d.h!)), 2);
    case "prism":
      return xadd(xscale(baseArea(d.n!, d.a!), 2), xscale(mul(d.a!, d.h!), d.n!));
    case "pyramid":
      return xadd(baseArea(d.n!, d.a!), xscale(mul(d.a!, d.g!), d.n! / 2));
    case "cylinder":
      return xadd(xscale(mul(PI, square(d.r!)), 2), xscale(mul(PI, mul(d.r!, d.h!)), 2));
    case "cone":
      return xadd(mul(PI, square(d.r!)), mul(PI, mul(d.r!, d.g!)));
    case "frustum":
      if (d.r !== undefined) return xadd(mul(mul(PI, xadd(d.r, d.rt!)), d.g!), mul(PI, xadd(square(d.r), square(d.rt!))));
      return xadd(xadd(baseArea(d.n!, d.a!), baseArea(d.n!, d.b!)), xscale(mul(xadd(d.a!, d.b!), d.g!), d.n! / 2));
    case "sphere":
      return xscale(mul(PI, square(d.r!)), 4);
    case "hemisphere":
      return xscale(mul(PI, square(d.r!)), 3);
    default:
      throw new SpecError(`the area of a ${s.kind} is computed from its mesh`);
  }
}

/** The volume of a bore: πρ²h, or the prism's base area times h. */
export function boreVolume(s: Shape & { bore?: Bore }): Exact {
  return mul(boreMouth(s), topHeightOf(s)!);
}

/** The area of a bore's opening on one base. */
export function boreMouth(s: Shape & { bore?: Bore }): Exact {
  const b = s.bore!;
  return b.kind === "round" ? mul(PI, square(b.rho)) : baseArea(b.n, b.edge);
}

/** The area of a bore's wall: 2πρh, or n·ℓ·h. */
export function boreWall(s: Shape & { bore?: Bore }): Exact {
  const b = s.bore!;
  const h = topHeightOf(s)!;
  return b.kind === "round" ? xscale(mul(PI, mul(b.rho, h)), 2) : xscale(mul(b.edge, h), b.n);
}

/** A solid's own volume: from its mesh, less its bore. */
function volumeOfSolid(s: Shape & { mesh?: Mesh; bore?: Bore }): Exact {
  if (s.mesh !== undefined) return meshVolume(s.mesh);
  return s.bore === undefined ? solidVolume(s) : xsub(solidVolume(s), boreVolume(s));
}

/** A solid's own total area: from its mesh; with a bore, less its two mouths and plus its wall. */
function areaOfSolid(s: Shape & { mesh?: Mesh; bore?: Bore }): Exact {
  if (s.mesh !== undefined) return meshArea(s.mesh);
  return s.bore === undefined ? solidArea(s) : xadd(xsub(solidArea(s), xscale(boreMouth(s), 2)), boreWall(s));
}

/** How a liquid's volume is computed, as a student writes it, `nível` standing for the level. */
function liquidFormula(s: Shape): string {
  if (s.kind === "cube") return "a²·nível";
  if (s.kind === "box") return "a·b·nível";
  if (s.kind === "prism") return "Ab·nível";
  if (s.kind === "cylinder") return "πr²·nível";
  if (s.kind === "cone" && s.down === true) return "V·(nível/h)³";
  if (s.kind === "cone" || s.kind === "pyramid") return "V·[1 − (1 − nível/h)³]";
  return s.dims.r !== undefined ? "π·nível·(R² + Rρ + ρ²)/3" : "nível·(Ab + √(Ab·aₙ) + aₙ)/3";
}

function levelFormula(s: Shape): string {
  if (s.kind === "cube" || s.kind === "box" || s.kind === "prism") return "V(líquido)/Ab";
  if (s.kind === "cylinder") return "V(líquido)/(πr²)";
  if (s.kind === "cone" && s.down === true) return "h·∛(V(líquido)/V)";
  if (s.kind === "cone" || s.kind === "pyramid") return "h·[1 − ∛(1 − V(líquido)/V)]";
  return "(raiz da equação do volume)";
}

const cube3 = (x: Exact): Exact => mul(mul(x, x), x);

/** The volume of liquid standing to `level` in the solid, exact. */
export function liquidVolume(s: Shape, level: Exact): Exact {
  const d = s.dims;
  const H = d.h ?? d.a!;
  if (s.kind === "cube" || s.kind === "box" || s.kind === "prism" || s.kind === "cylinder") return mul(sectionArea(s), level);
  const k = div(level, H);
  if (s.kind === "cone" && s.down === true) return mul(solidVolume(s), cube3(k));
  if (s.kind === "cone" || s.kind === "pyramid") return mul(solidVolume(s), xsub(rat(1), cube3(xsub(rat(1), k))));
  // A frustum: the frustum from the base to the level.
  if (d.r !== undefined) {
    const rho = xadd(d.r, mul(xsub(d.rt!, d.r), k));
    return solidVolume({ kind: "frustum", at: s.at, dims: { r: d.r, rt: rho, h: level } });
  }
  const eL = xadd(d.a!, mul(xsub(d.b!, d.a!), k));
  return solidVolume({ kind: "frustum", at: s.at, dims: { n: d.n!, a: d.a!, b: eL, h: level } });
}

/** The level a given volume of liquid reaches: exact for a constant section and for a cone whose fraction is a rational cube; else by bisection, flagged ≈. */
export function levelOf(s: Shape, volume: Exact): Exact {
  const d = s.dims;
  const H = d.h ?? d.a!;
  if (s.kind === "cube" || s.kind === "box" || s.kind === "prism" || s.kind === "cylinder") return div(volume, sectionArea(s));
  const frac = div(volume, solidVolume(s));
  if (s.kind === "cone" && s.down === true) return mul(H, cbrt(frac));
  if (s.kind === "cone" || s.kind === "pyramid") return mul(H, xsub(rat(1), cbrt(xsub(rat(1), frac))));
  const target = valueOf(volume);
  let lo = 0;
  let hi = valueOf(H);
  for (let k = 0; k < 200 && hi - lo > 1e-15 * valueOf(H); k += 1) {
    const mid = (lo + hi) / 2;
    if (valueOf(liquidVolume(s, approx(mid))) < target) lo = mid;
    else hi = mid;
  }
  return approx((lo + hi) / 2);
}

/** The default camera (ADR 0046): the textbook's cavalier view for polyhedra; an orthographic view -- round rims as level ellipses, a sphere's outline a true circle -- once a round solid is in the figure. */
export function defaultCamera(kinds: readonly SolidKind[]): Camera {
  const round = kinds.filter((k) => k === "cylinder" || k === "cone" || k === "sphere" || k === "hemisphere").length;
  if (round === 0) return makeCamera("cavalier");
  if (round === kinds.length) return orthographicCamera(0, 20);
  return orthographicCamera(30, 20);
}

/** The largest dimension of a solid: what its unit of length is fitted to. */
function sizeOf(s: { kind: SolidKind; dims: Dims; mesh?: Mesh }): number {
  const d = s.dims;
  const xs = [d.a, d.b, d.w, d.d, d.h, d.r ? xscale(d.r, 2) : undefined, d.rt ? xscale(d.rt, 2) : undefined, d.t && d.steps ? xscale(d.t, d.steps) : undefined]
    .filter((x): x is Exact => x !== undefined)
    .map(valueOf);
  if (s.mesh !== undefined) for (let i = 0; i < 3; i += 1) xs.push(Math.max(...s.mesh.vertices.map((p) => p[i]!)) - Math.min(...s.mesh.vertices.map((p) => p[i]!)));
  return Math.max(...xs);
}

// ---- the model of one solid, in R³ ------------------------------------------------

/** The polyhedron a resolved solid is, or null for a round one. */
export function polyhedronOf(s: { kind: SolidKind; at: Vec3; dims: Dims }): Polyhedron | null {
  const { kind, at, dims } = s;
  if (kind === "cube") return prism(rectangle(at, valueOf(dims.a!), valueOf(dims.a!)), valueOf(dims.a!));
  if (kind === "box") return prism(rectangle(at, valueOf(dims.w!), valueOf(dims.d!)), valueOf(dims.h!));
  if (kind === "prism") return prism(regularPolygon(at, dims.n!, valueOf(dims.a!)), valueOf(dims.h!));
  if (kind === "pyramid") return pyramid(regularPolygon(at, dims.n!, valueOf(dims.a!)), add(at, [0, 0, valueOf(dims.h!)]));
  if (kind === "frustum" && dims.n !== undefined) {
    // A prism's faces, with the top a smaller (or larger) copy of the base.
    const base = regularPolygon(at, dims.n, valueOf(dims.a!));
    const top = regularPolygon(add(at, [0, 0, valueOf(dims.h!)]), dims.n, valueOf(dims.b!));
    const p = prism(base, 1);
    return { vertices: [...base, ...top], faces: p.faces, n: dims.n };
  }
  return null;
}

// ---- drawing primitives, in page units (y up), placed once the scale is known ----

type Stroke = {
  id: string;
  pts: Vec2[];
  colour: string;
  width: number;
  dashed: boolean;
  layer: 0 | 1 | 2 | 3; // hidden, visible, construction, marks
  /** A straight run carrying a printed length: its 3D direction, for the measuring frame. */
  measure?: {
    dir3: Vec3;
    text: string;
    labelColour: string;
    solid: number;
    symbol: string | null;
    reading: string;
    /** A run lying flat on the page (a net): one true unit is one page unit, whatever the camera. */
    flat?: boolean;
    /** The label may also sit just past the run's far end (a short radius inside a crowded rim). */
    beyond?: boolean;
    /** The label sits only over this part of the run (a fraction of it): a height clear of the liquid it crosses. */
    span?: [number, number];
    /** The label tries the side toward the solid first: a stair's tread on its own face, not on the wall below. */
    inward?: boolean;
  };
};
type Fill = { id: string; pts: Vec2[]; colour: string };
type Place = { id: string; p: Vec2; text: string; colour: string; dot: boolean; solid: number };

function lettersFrom(start: number, count: number): string[] {
  const out: string[] = [];
  let code = start;
  while (out.length < count) {
    const ch = String.fromCharCode(65 + (code % 26));
    code += 1;
    if (ch === "O" || ch === "V") continue;
    out.push(ch);
  }
  return out;
}

// ---- the build ------------------------------------------------------------------

export function expandSolid(input: SolidInput): FigureSpec {
  const first = draw(input, []);
  return first.needs.length === 0 ? first.spec : draw(input, first.needs).spec;
}

/**
 * One layout. `extra` are panel lines a previous pass found it needs: a
 * measure whose full label ("g = 13") had no honest spot is printed on the
 * drawing as its symbol alone, and its value moves to the panel.
 */
function draw(input: SolidInput, extra: string[]): { spec: FigureSpec; needs: string[] } {
  const locale = input.locale ?? "pt-BR";
  const solids = resolveAll(input);
  const answers = input.answers ?? true;
  let camera: Camera;
  try {
    camera = input.camera === undefined ? defaultCamera(solids.map((s) => (s.kind === "frustum" ? (s.dims.r !== undefined ? "cone" : "prism") : s.kind))) : makeCamera(input.camera);
  } catch (e) {
    if (e instanceof GeometryError) throw new SpecError(`camera: ${e.message}`);
    throw e;
  }
  const unit = input.unit === undefined ? "" : ` ${input.unit}`;
  const unitOf = (power: 1 | 2 | 3): string => (input.unit === undefined ? "" : ` ${input.unit}${power === 1 ? "" : power === 2 ? "²" : "³"}`);
  if (input.unit !== undefined && typesANumber(input.unit)) throw new SpecError(`unit "${input.unit}" types a number`);

  const fills: Fill[] = [];
  const strokes: Stroke[] = [];
  const places: Place[] = [];
  const rights: { id: string; pts: Vec3[] }[] = [];
  const readings: string[] = [];
  const solidPage: Vec2[][] = [];
  const P = (p: Vec3): Vec2 => project(camera, p);

  let letter = 0;
  // A rim two solids share (a cone in a cylinder stands on the cylinder's
  // base) is drawn once, by the solid declared first: one curve, one colour.
  const rims = new Set<string>();
  const firstRim = (centre: Vec3, radius: number): boolean => {
    const key = [...centre, radius].map((x) => x.toFixed(9)).join(",");
    if (rims.has(key)) return false;
    rims.add(key);
    return true;
  };
  const usedNames = new Map<string, string>();
  const nameOnce = (text: string, path: string): void => {
    const prev = usedNames.get(text);
    if (prev !== undefined) throw new SpecError(`${path}: the name "${text}" is already a point of ${prev} -- set labels to false or give other names`);
    usedNames.set(text, path);
  };

  const measureText = (symbol: string | null, value: Exact): string => {
    const pr = print(value, locale);
    if (symbol === null) return `${pr.exact ? "" : "≈ "}${pr.text}${unit}`;
    return `${symbol} ${pr.exact ? "=" : "≈"} ${pr.text}${unit}`;
  };
  const line = (label: string, formula: string, value: Exact, power: 1 | 2 | 3): string => `${label} = ${formula} ${equalsText(value, locale)}${unitOf(power)}`;

  // ---- round solids stood on round solids: the rim they share (ADR 0068) ----
  // A cylinder topped by a hemisphere of its own radius has no top face: the
  // rim where they meet is seen where either lateral surface faces the
  // reader, and is drawn once, by the solid underneath. A smaller solid on a
  // wider top stands on that top's exposed ring; a wider one overhangs it.
  const ZUP: Vec3 = [0, 0, 1];
  const ZDOWN: Vec3 = [0, 0, -1];
  const [BU, BV] = planeBasis(ZUP);
  const radialAt = (t: number): Vec3 => add(vscale(BU, Math.cos(t)), vscale(BV, Math.sin(t)));
  const roundUp = (x: Resolved): boolean => x.kind === "cylinder" || (x.kind === "cone" && x.down !== true) || (x.kind === "frustum" && x.dims.r !== undefined) || x.kind === "hemisphere";
  const lateralOf = (x: Resolved) => (t: number): Vec3 => {
    if (x.kind === "cone") return add(vscale(radialAt(t), valueOf(x.dims.h!)), vscale(ZUP, valueOf(x.dims.r!)));
    if (x.kind === "frustum") return add(vscale(radialAt(t), valueOf(x.dims.h!)), vscale(ZUP, valueOf(x.dims.r!) - valueOf(x.dims.rt!)));
    return radialAt(t);
  };
  type Junction = { host: number; att: number; same: boolean; attLarger: boolean };
  const junctions: Junction[] = [];
  for (const x of solids) {
    if (x.host === undefined) continue;
    const h = solids[x.host]!;
    const top = topRadiusOf(h);
    if (!roundUp(x) || !roundUp(h) || top === undefined) continue;
    const a = valueOf(x.dims.r!);
    const b = valueOf(top);
    junctions.push({ host: h.index, att: x.index, same: Math.abs(a - b) <= 1e-9 * Math.max(a, b), attLarger: a > b });
  }
  const asHost = (x: Resolved): Junction | undefined => junctions.find((j) => j.host === x.index);
  const asAtt = (x: Resolved): Junction | undefined => junctions.find((j) => j.att === x.index);
  /** Is the solid's top face (the plane its top rim lies on, outside it) seen? */
  const capTopSeen = (x: Resolved): boolean => {
    const j = asHost(x);
    if (j === undefined) return facesViewer(camera, ZUP);
    return j.same ? false : j.attLarger ? facesViewer(camera, ZDOWN) : facesViewer(camera, ZUP);
  };
  const capBotSeen = (x: Resolved): boolean => {
    const j = asAtt(x);
    if (j === undefined || j.attLarger) return facesViewer(camera, ZDOWN);
    return j.same ? false : facesViewer(camera, ZUP);
  };
  /** A rim's arcs: seen where its cap or a lateral surface through it faces the reader. */
  const rimArcs = (x: Resolved, which: "top" | "bottom", fallback: { t0: number; t1: number; visible: boolean }[], own: (t: number) => Vec3): { t0: number; t1: number; visible: boolean }[] => {
    if (asHost(x) === undefined && asAtt(x) === undefined) return fallback;
    const cap = which === "top" ? capTopSeen(x) : capBotSeen(x);
    const j = which === "top" ? asHost(x) : undefined;
    const other = j !== undefined && j.same ? lateralOf(solids[j.att]!) : null;
    return splitWholeCircle((t) => cap || dot(own(t), camera.toward) > 0 || (other !== null && dot(other(t), camera.toward) > 0));
  };
  const skipBottomRim = (x: Resolved): boolean => asAtt(x)?.same === true;

  for (const s of solids) {
    const k = s.index;
    const show = new Set((s.def.show ?? []).filter((item) => answers || isGiven(s, item)));
    const want = new Set(answers ? s.def.readings ?? [] : []);
    const prefix = solids.length > 1 ? `${s.name}: ` : "";
    const lines: string[] = [];
    const pagePts: Vec2[] = [];
    const size = sizeOf(s);
    const ra = 0.075 * size;
    const labelsOn = s.def.labels !== undefined && s.def.labels !== false;
    const given = Array.isArray(s.def.labels) ? s.def.labels : null;
    const construction = (id: string, a: Vec3, b: Vec3, hidden: boolean, symbol: string, value: Exact): void => {
      strokes.push({ id, pts: [P(a), P(b)], colour: ACCENT, width: hidden ? W_HIDDEN + 0.2 : W_CONSTRUCTION, dashed: hidden, layer: 2, measure: { dir3: vsub(b, a), text: measureText(symbol, value), labelColour: ACCENT, solid: k, symbol, reading: `${prefix}${measureText(symbol, value)}` } });
    };

    const marksBefore = { fills: fills.length, strokes: strokes.length, places: places.length, rights: rights.length };
    const poly = s.mesh === undefined ? polyhedronOf(s) : null;
    if (s.mesh !== undefined) {
      // A stair or a typed polyhedron: hidden-line removal over the whole
      // mesh, since it need not be convex (mesh.ts).
      const mesh = s.mesh;
      const V = mesh.vertices;
      const normals = meshNormals(mesh);
      const light = normalize(add(camera.toward, [0, -0.35, 0.9]));
      mesh.faces.forEach((face, f) => {
        if (!facesViewer(camera, normals[f]!)) return;
        if (s.def.tint === "sides") {
          fills.push({ id: `s${k}-face${f}-fill`, pts: face.map((i) => P(V[i]!)), colour: `${tintFor(face.length)}55` });
          return;
        }
        const lit = Math.max(0, Math.min(1, normals[f]!.reduce((acc, c, i) => acc + c * light[i]!, 0)));
        const alpha = Math.round((0.05 + 0.13 * (1 - lit)) * 255).toString(16).padStart(2, "0").toUpperCase();
        fills.push({ id: `s${k}-face${f}-fill`, pts: face.map((i) => P(V[i]!)), colour: `${s.colour}${alpha}` });
      });
      const claimed = new Map<string, { symbol: string | null; value: Exact; inward?: boolean }>();
      if (s.kind === "stairs" && show.has("dimensions")) {
        // The riser and tread are labelled on the side wall the reader sees.
        const m = V.length / 2;
        const o = facesViewer(camera, [0, 1, 0]) ? m : 0;
        claimed.set(`0-${m}`, { symbol: null, value: s.dims.w! });
        // The riser's label sits on the first riser's own face, beside its edge. The tread gets a dimension line
        // of its own, raised above the top step where nothing else is drawn: a label on a tread's edge fell on
        // the side wall, where it read as the depth of the wall's whole bottom edge.
        const n2 = 2 * s.dims.steps!;
        claimed.set(`${o}-${o + 1}`, { symbol: null, value: s.dims.e!, inward: true });
        dimensionLine(strokes, P, `s${k}-tread-dimension`, V[o + n2 - 1]!, V[o + n2]!, [0, 0, 1], 0.12 * size, size, s.colour, { dir3: vsub(V[o + n2]!, V[o + n2 - 1]!), text: measureText(null, s.dims.t!), labelColour: s.colour, solid: k, symbol: null, reading: `${prefix}${measureText("p", s.dims.t!)}` });
      }
      for (const e of seeEdges(camera, mesh)) {
        const key = `${e.i}-${e.j}`;
        const c = claimed.get(key);
        e.pieces.forEach((pc, q) => {
          const whole = e.pieces.length === 1;
          strokes.push({
            id: `s${k}-edge-${key}${whole ? "" : `-${q}`}`,
            pts: [P(pc.a), P(pc.b)],
            colour: s.colour,
            width: pc.visible ? W_VISIBLE : W_HIDDEN,
            dashed: !pc.visible,
            layer: pc.visible ? 1 : 0,
            ...(c !== undefined && whole ? { measure: { dir3: vsub(pc.b, pc.a), text: measureText(c.symbol, c.value), labelColour: s.colour, solid: k, symbol: c.symbol, reading: `${prefix}${measureText(c.symbol, c.value)}`, ...(c.inward === true ? { inward: true } : {}) } } : {}),
          });
        });
      }
      for (const p of V) pagePts.push(P(p));
      if (labelsOn) {
        if (given !== null && given.length !== V.length) throw new SpecError(`${s.path}.labels names ${given.length} point(s), but this ${s.kind} has ${V.length} vertices`);
        if (given === null && V.length > 24) throw new SpecError(`${s.path}.labels: ${V.length} vertices are more than the alphabet names -- give the names, or set labels to false`);
        const names = given ?? lettersFrom(letter, V.length);
        if (given === null) letter += V.length;
        V.forEach((p, i) => places.push({ id: `s${k}-v${i}`, p: P(p), text: names[i]!, colour: s.colour, dot: false, solid: k }));
      }
      if (s.kind === "stairs") {
        const n = s.dims.steps!;
        const { t, e, w } = s.dims as Required<Pick<Dims, "t" | "e" | "w">>;
        const tri = (n * (n + 1)) / 2;
        if (want.has("measures")) lines.push(`piso p = ${print(t, locale).text}${unit}, espelho e = ${print(e, locale).text}${unit}, largura ℓ = ${print(w, locale).text}${unit}, ${n} degraus`);
        if (want.has("volume")) lines.push(line("V", `p·e·ℓ·${n}·${n + 1}/2`, xscale(mul(mul(t, e), w), tri), 3));
        if (want.has("area")) {
          lines.push(line("pisos", `${n}·p·ℓ`, xscale(mul(t, w), n), 2));
          lines.push(line("espelhos", `${n}·e·ℓ`, xscale(mul(e, w), n), 2));
          lines.push(line("paredes laterais", `2·p·e·${n}·${n + 1}/2`, xscale(mul(t, e), 2 * tri), 2));
          lines.push(`${line("A", "pisos + espelhos + laterais + fundo + base", meshArea(mesh), 2)} (área total)`);
        }
      } else {
        if (want.has("volume")) lines.push(line("V", "Σ (volumes das pirâmides de cada face)", meshVolume(mesh), 3));
        if (want.has("area")) lines.push(`${line("A", "Σ (áreas das faces)", meshArea(mesh), 2)} (área total)`);
      }
      if (want.has("counts")) lines.push(...countLines(mesh));
    } else if (poly !== null) {
      const n = poly.n;
      const V = poly.vertices;
      const seen = poly.faces.map((_, f) => faceVisible(camera, poly, f));
      // Fills: each visible face, shaded by how squarely it faces a light up
      // and to the left of the reader, so the solid reads as a solid.
      const light = normalize(add(camera.toward, [0, -0.35, 0.9]));
      poly.faces.forEach((face, f) => {
        if (!seen[f]) return;
        const lit = Math.max(0, Math.min(1, faceNormal(poly, f).reduce((acc, c, i) => acc + c * light[i]!, 0)));
        const alpha = Math.round((0.05 + 0.13 * (1 - lit)) * 255).toString(16).padStart(2, "0").toUpperCase();
        fills.push({ id: `s${k}-face${f}-fill`, pts: face.map((i) => P(V[i]!)), colour: `${s.colour}${alpha}` });
      });
      // Measured edges: an edge that carries a printed length IS that run.
      const claimed = new Map<string, { symbol: string | null; value: Exact }>();
      const claim = (i: number, j: number, symbol: string | null, value: Exact): void => {
        claimed.set(i < j ? `${i}-${j}` : `${j}-${i}`, { symbol, value });
      };
      if (s.kind === "cube" && show.has("edge")) claim(0, 1, "a", s.dims.a!);
      if (s.kind === "box" && show.has("dimensions")) {
        claim(0, 1, null, s.dims.w!);
        claim(1, 2, null, s.dims.d!);
        claim(1, n + 1, null, s.dims.h!);
      }
      if ((s.kind === "prism" || s.kind === "pyramid" || s.kind === "frustum") && show.has("edge")) claim(0, 1, "ℓ", s.dims.a!);
      if (s.kind === "frustum" && show.has("topEdge")) claim(n, n + 1, "ℓ′", s.dims.b!);
      if (s.kind === "prism" && show.has("height")) claim(1, n + 1, "h", s.dims.h!);
      for (const e of classifyEdges(camera, poly)) {
        const key = `${e.i}-${e.j}`;
        const c = claimed.get(key);
        strokes.push({
          id: `s${k}-edge-${key}`,
          pts: [P(V[e.i]!), P(V[e.j]!)],
          colour: s.colour,
          width: e.visible ? W_VISIBLE : W_HIDDEN,
          dashed: !e.visible,
          layer: e.visible ? 1 : 0,
          ...(c === undefined ? {} : { measure: { dir3: vsub(V[e.j]!, V[e.i]!), text: measureText(c.symbol, c.value), labelColour: s.colour, solid: k, symbol: c.symbol, reading: `${prefix}${measureText(c.symbol, c.value)}` } }),
        });
      }
      for (const p of V) pagePts.push(P(p));

      // Construction lines.
      if (s.kind === "cube" || s.kind === "box") {
        // The space diagonal drawn is the one of the four whose page image
        // passes farthest from every other vertex: in the cavalier view of a
        // cube, A, F and G are collinear on the page, and AG would run along
        // the edge FG.
        const [ib, it] = clearestDiagonal(camera, V);
        const [A, C, G] = [V[ib]!, V[it - n]!, V[it]!];
        const a = s.dims.a;
        const [w, d, h] = a !== undefined ? [a, a, a] : [s.dims.w!, s.dims.d!, s.dims.h!];
        const D = a !== undefined ? mul(a, xsqrt(rat(3))) : xsqrt(xadd(xadd(square(w), square(d)), square(h)));
        const fd = a !== undefined ? mul(a, xsqrt(rat(2))) : xsqrt(xadd(square(w), square(d)));
        if (show.has("spaceDiagonal")) {
          construction(`s${k}-space-diagonal`, A, G, true, "D", D);
          if (want.has("measures")) lines.push(line("D", a !== undefined ? "a√3" : "√(a² + b² + c²)", D, 1));
        }
        if (show.has("faceDiagonal")) {
          construction(`s${k}-face-diagonal`, A, C, !seen[0], "d", fd);
          if (want.has("measures")) lines.push(line("d", a !== undefined ? "a√2" : "√(a² + b²)", fd, 1));
          if (show.has("spaceDiagonal")) rights.push({ id: `s${k}-right-foot`, pts: rightAngle3(C, vsub(A, C), vsub(G, C), ra) });
        }
        if (s.kind === "box" && want.has("measures")) {
          lines.push(`a = ${print(w, locale).text}${unit}, b = ${print(d, locale).text}${unit}, c = ${print(h, locale).text}${unit}`);
        }
        const vol = mul(mul(w, d), h);
        const area = xscale(xadd(xadd(mul(w, d), mul(w, h)), mul(d, h)), 2);
        if (want.has("volume")) lines.push(line("V", a !== undefined ? "a³" : "abc", vol, 3));
        if (want.has("area")) lines.push(`${line("A", a !== undefined ? "6a²" : "2(ab + ac + bc)", area, 2)} (área total)`);
      } else if (s.kind === "prism") {
        const B = baseArea(n, s.dims.a!);
        const bf = BASE_AREA_FORMULA[n] ?? "nℓm/2";
        if (want.has("volume") || want.has("area")) lines.push(line("Ab", bf, B, 2));
        if (want.has("volume")) lines.push(line("V", "Ab·h", mul(B, s.dims.h!), 3));
        if (want.has("area")) lines.push(`${line("A", `2Ab + ${n}ℓh`, xadd(xscale(B, 2), xscale(mul(s.dims.a!, s.dims.h!), n)), 2)} (área total)`);
      } else if (s.kind === "frustum") {
        // A pyramid's frustum: O and O′ the centres of its bases, M and M′ the
        // midpoints of the bottom and top edges of the visible lateral face
        // farthest right on the page, MM′ its apótema g.
        const O = s.at;
        const Ot = add(O, [0, 0, valueOf(s.dims.h!)]);
        let side = -1;
        for (let i = 0; i < n; i += 1) {
          if (!seen[i + 2]) continue;
          const x = P(lerp(V[i]!, V[(i + 1) % n]!, 0.5))[0];
          if (side < 0 || x > P(lerp(V[side]!, V[(side + 1) % n]!, 0.5))[0]) side = i;
        }
        if (side < 0) side = 0;
        const M = lerp(V[side]!, V[(side + 1) % n]!, 0.5);
        const Mt = lerp(V[n + side]!, V[n + ((side + 1) % n)]!, 0.5);
        const { h, g, a: ea, b: eb } = s.dims as Required<Pick<Dims, "h" | "g" | "a" | "b">>;
        if (show.has("height")) {
          construction(`s${k}-height`, Ot, O, true, "h", h);
          rights.push({ id: `s${k}-right-O`, pts: rightAngle3(O, vsub(Ot, O), vsub(M, O), ra) });
        }
        if (show.has("slant")) construction(`s${k}-slant`, Mt, M, !seen[side + 2], "g", g);
        const B = baseArea(n, ea);
        const b = baseArea(n, eb);
        if (want.has("measures")) {
          lines.push(line("m", APOTHEM_FORMULA[n] ?? `ℓ/(2·tg(180°/${n}))`, s.dims.m!, 1));
          lines.push(line("m′", (APOTHEM_FORMULA[n] ?? `ℓ′/(2·tg(180°/${n}))`).replace("ℓ", "ℓ′"), s.dims.mt!, 1));
          lines.push(s.def.slant === undefined ? line("g", "√(h² + (m − m′)²)", g, 1) : line("h", "√(g² − (m − m′)²)", h, 1));
        }
        if (want.has("volume") || want.has("area")) {
          lines.push(line("Ab", BASE_AREA_FORMULA[n] ?? "nℓm/2", B, 2));
          lines.push(line("ab", (BASE_AREA_FORMULA[n] ?? "nℓm/2").replaceAll("ℓ", "ℓ′"), b, 2));
        }
        if (want.has("volume")) lines.push(line("V", "h(Ab + √(Ab·ab) + ab)/3", solidVolume(s), 3));
        if (want.has("area")) lines.push(`${line("A", `Ab + ab + ${n}(ℓ + ℓ′)g/2`, solidArea(s), 2)} (área total)`);
      } else {
        // Pyramid: V apex, O base centre, M the midpoint of the front edge AB.
        const O = s.at;
        const Vx = V[n]!;
        // M is the midpoint of the base edge of the visible lateral face
        // farthest right on the page: the textbook's triangle VOM, drawn
        // where it is seen and, for a square base, in true shape.
        let side = 0;
        for (let i = 0; i < n; i += 1) {
          if (!seen[i + 1]) continue;
          const x = P(lerp(V[i]!, V[(i + 1) % n]!, 0.5))[0];
          if (!seen[side + 1] || x > P(lerp(V[side]!, V[(side + 1) % n]!, 0.5))[0]) side = i;
        }
        const M = lerp(V[side]!, V[(side + 1) % n]!, 0.5);
        const { h, g, m } = s.dims as Required<Pick<Dims, "h" | "g" | "m">>;
        if (show.has("height")) {
          construction(`s${k}-height`, Vx, O, true, "h", h);
          rights.push({ id: `s${k}-right-O`, pts: rightAngle3(O, vsub(Vx, O), vsub(M, O), ra) });
        }
        if (show.has("baseApothem")) construction(`s${k}-base-apothem`, O, M, !seen[0], "m", m);
        if (show.has("slant")) construction(`s${k}-slant`, Vx, M, !seen[side + 1], "g", g);
        if (labelsOn && (show.has("slant") || show.has("baseApothem"))) places.push({ id: `s${k}-M`, p: P(M), text: "M", colour: s.colour, dot: false, solid: k });
        if (labelsOn && (show.has("height") || show.has("baseApothem"))) places.push({ id: `s${k}-O`, p: P(O), text: "O", colour: s.colour, dot: true, solid: k });
        if (want.has("measures")) {
          lines.push(line("m", APOTHEM_FORMULA[n] ?? `ℓ/(2·tg(180°/${n}))`, m, 1));
          lines.push(s.def.slant === undefined ? line("g", "√(h² + m²)", g, 1) : line("h", "√(g² − m²)", h, 1));
        }
        const B = baseArea(n, s.dims.a!);
        if (want.has("volume") || want.has("area")) lines.push(line("Ab", BASE_AREA_FORMULA[n] ?? "nℓm/2", B, 2));
        if (want.has("volume")) lines.push(line("V", "Ab·h/3", xscale(mul(B, h), 1 / 3), 3));
        if (want.has("area")) lines.push(`${line("A", `Ab + ${n}·ℓg/2`, xadd(B, xscale(mul(s.dims.a!, g), n / 2)), 2)} (área total)`);
      }

      if (want.has("counts")) lines.push(...countLines(orientMesh(poly)));

      // Vertex names.
      if (labelsOn) {
        const count = V.length;
        let names: string[];
        if (given !== null) {
          if (given.length !== count) throw new SpecError(`${s.path}.labels names ${given.length} point(s), but a ${s.kind} with these dimensions has ${count} vertices`);
          names = given;
        } else if (s.kind === "pyramid") {
          names = [...lettersFrom(letter, n), "V"];
          letter += n;
        } else {
          names = lettersFrom(letter, count);
          letter += count;
        }
        V.forEach((p, i) => places.push({ id: `s${k}-v${i}`, p: P(p), text: names[i]!, colour: s.colour, dot: false, solid: k }));
      }
    } else {
      const r = valueOf(s.dims.r!);
      const O = s.at;
      if (s.kind === "cylinder") {
        const h = valueOf(s.dims.h!);
        const view = cylinderView(camera, O, r, h);
        const all = [...arcPoints(view.bottom, 0, 2 * Math.PI), ...arcPoints(view.top, 0, 2 * Math.PI)];
        pagePts.push(...all);
        fills.push({ id: `s${k}-fill`, pts: convexHull(all), colour: `${s.colour}1A` });
        if (capTopSeen(s)) fills.push({ id: `s${k}-top-fill`, pts: arcPoints(view.top, 0, 2 * Math.PI), colour: `${s.colour}14` });
        if (!skipBottomRim(s) && firstRim(O, r)) rimStrokes(strokes, `s${k}-bottom`, view.bottom, rimArcs(s, "bottom", view.bottomArcs, radialAt), s.colour);
        if (firstRim(add(O, [0, 0, h]), r)) rimStrokes(strokes, `s${k}-top`, view.top, rimArcs(s, "top", view.topArcs, radialAt), s.colour);
        const right = rightOf(view.bottom, view.silhouette);
        view.silhouette.forEach((t, i) => {
          const a = view.bottom.point3(t);
          const b = view.top.point3(t);
          const isRight = t === right;
          strokes.push({
            id: `s${k}-generator-${i}`,
            pts: [P(a), P(b)],
            colour: s.colour,
            width: W_VISIBLE,
            dashed: false,
            layer: 1,
            ...(isRight && show.has("height") ? { measure: { dir3: vsub(b, a), text: measureText("h", s.dims.h!), labelColour: s.colour, solid: k, symbol: "h", reading: `${prefix}${measureText("h", s.dims.h!)}` } } : {}),
          });
        });
        const Otop = add(O, [0, 0, h]);
        if (show.has("radius")) construction(`s${k}-radius`, Otop, view.top.point3(right), !capTopSeen(s), "r", s.dims.r!);
        if (labelsOn) {
          const [n0, n1] = given ?? ["O", "O′"];
          if (given !== null && given.length !== 2) throw new SpecError(`${s.path}.labels names ${given.length} point(s); a cylinder names its two base centres`);
          places.push({ id: `s${k}-O`, p: P(O), text: n0!, colour: s.colour, dot: true, solid: k });
          places.push({ id: `s${k}-O2`, p: P(Otop), text: n1!, colour: s.colour, dot: true, solid: k });
        }
        const { r: R, h: H } = s.dims as Required<Pick<Dims, "r" | "h">>;
        if (want.has("volume")) lines.push(line("V", "πr²h", mul(PI, mul(square(R), H)), 3));
        if (want.has("area")) lines.push(`${line("A", "2πr² + 2πrh", xadd(xscale(mul(PI, square(R)), 2), xscale(mul(PI, mul(R, H)), 2)), 2)} (área total)`);
      } else if ((s.kind === "cone" && s.down === true) || s.kind === "frustum") {
        // A cone frustum (bottom radius R, top r), or a cone on its apex (a
        // frustum whose bottom radius is 0): outline generators from the
        // virtual apex, each rim seen where its cap or the lateral surface is.
        const h = valueOf(s.dims.h!);
        const cone = s.kind === "cone";
        const R = cone ? 0 : r;
        const rt = cone ? r : valueOf(s.dims.rt!);
        const view = frustumView(camera, O, R, rt, h);
        if (view.silhouette.length !== 2) throw new SpecError(`${s.path}: this camera sees the virtual apex through a base, so the outline has no generators -- choose a lower elevation`);
        const Otop = add(O, [0, 0, h]);
        const lat = (t: number): Vec3 => view.lateral(t);
        const topCap = capTopSeen(s);
        const botCap = capBotSeen(s);
        const all = [...(cone ? [P(O)] : arcPoints(view.bottom, 0, 2 * Math.PI)), ...arcPoints(view.top, 0, 2 * Math.PI)];
        pagePts.push(...all);
        fills.push({ id: `s${k}-fill`, pts: convexHull(all), colour: `${s.colour}1A` });
        if (topCap) fills.push({ id: `s${k}-top-fill`, pts: arcPoints(view.top, 0, 2 * Math.PI), colour: `${s.colour}14` });
        const topArcs = rimArcs(s, "top", splitCircle(view.silhouette, (t) => topCap || dot(lat(t), camera.toward) > 0), lat);
        if (!cone && !skipBottomRim(s) && firstRim(O, R)) rimStrokes(strokes, `s${k}-bottom`, view.bottom, rimArcs(s, "bottom", splitCircle(view.silhouette, (t) => botCap || dot(lat(t), camera.toward) > 0), lat), s.colour);
        if (firstRim(Otop, rt)) rimStrokes(strokes, `s${k}-top`, view.top, topArcs, s.colour);
        const right = rightOf(view.top, view.silhouette as [number, number]);
        const g = s.dims.g!;
        view.silhouette.forEach((t, i) => {
          const a = cone ? O : view.bottom.point3(t);
          const b = view.top.point3(t);
          strokes.push({
            id: `s${k}-generator-${i}`,
            pts: [P(a), P(b)],
            colour: s.colour,
            width: W_VISIBLE,
            dashed: false,
            layer: 1,
            ...(t === right && show.has("slant") ? { measure: { dir3: vsub(b, a), text: measureText("g", g), labelColour: s.colour, solid: k, symbol: "g", reading: `${prefix}${measureText("g", g)}` } } : {}),
          });
        });
        if (show.has("height")) {
          construction(`s${k}-height`, Otop, O, true, "h", s.dims.h!);
          const foot = cone ? Otop : O;
          const towards = cone ? view.top.point3(right) : view.bottom.point3(right);
          rights.push({ id: `s${k}-right-O`, pts: rightAngle3(foot, vsub(cone ? O : Otop, foot), vsub(towards, foot), ra) });
        }
        if (cone && show.has("radius")) construction(`s${k}-radius`, Otop, view.top.point3(right), !topCap, "r", s.dims.r!);
        if (!cone && show.has("radius")) construction(`s${k}-radius`, O, view.bottom.point3(right), !botCap, "R", s.dims.r!);
        if (!cone && show.has("topRadius")) construction(`s${k}-top-radius`, Otop, view.top.point3(right), !topCap, "r", s.dims.rt!);
        if (labelsOn) {
          if (given !== null && given.length !== 2) throw new SpecError(`${s.path}.labels names ${given.length} point(s); a ${cone ? "cone" : "frustum"} names ${cone ? "its apex and its base centre" : "its two base centres"}`);
          const [n0, n1] = given ?? (cone ? ["V", "O"] : ["O", "O′"]);
          places.push({ id: `s${k}-O`, p: P(O), text: n0!, colour: s.colour, dot: !cone, solid: k });
          places.push({ id: `s${k}-O2`, p: P(Otop), text: n1!, colour: s.colour, dot: true, solid: k });
        } else if (show.has("height") || show.has("radius") || show.has("topRadius")) {
          if (!cone) places.push({ id: `s${k}-O`, p: P(O), text: "", colour: s.colour, dot: true, solid: k });
          places.push({ id: `s${k}-O2`, p: P(Otop), text: "", colour: s.colour, dot: true, solid: k });
        }
        const { h: H } = s.dims as Required<Pick<Dims, "h">>;
        if (cone) {
          if (want.has("measures")) lines.push(s.def.slant === undefined ? line("g", "√(r² + h²)", g, 1) : line("h", "√(g² − r²)", H, 1));
          if (want.has("volume")) lines.push(line("V", "πr²h/3", solidVolume(s), 3));
          if (want.has("area")) lines.push(`${line("A", "πr² + πrg", solidArea(s), 2)} (área total)`);
        } else {
          if (want.has("measures")) lines.push(s.def.slant === undefined ? line("g", "√(h² + (R − r)²)", g, 1) : line("h", "√(g² − (R − r)²)", H, 1));
          if (want.has("volume")) lines.push(line("V", "πh(R² + Rr + r²)/3", solidVolume(s), 3));
          if (want.has("area")) lines.push(`${line("A", "π(R + r)g + πR² + πr²", solidArea(s), 2)} (área total)`);
        }
      } else if (s.kind === "hemisphere") {
        // A dome on its base: the half of the sphere's outline above the base
        // plane, and the base rim, seen where the dome or the base faces the reader.
        const view = domeView(camera, O, r);
        const dome = arcPoints(view.outline, view.upper[0], view.upper[1]);
        const all = [...dome, ...arcPoints(view.base, 0, 2 * Math.PI)];
        pagePts.push(...all);
        fills.push({ id: `s${k}-fill`, pts: convexHull(all), colour: `${s.colour}1A` });
        strokes.push({ id: `s${k}-outline`, pts: dome, colour: s.colour, width: W_VISIBLE, dashed: false, layer: 1 });
        const botCap = capBotSeen(s);
        if (!skipBottomRim(s) && firstRim(O, r)) rimStrokes(strokes, `s${k}-base`, view.base, rimArcs(s, "bottom", splitWholeCircle((t) => botCap || dot(radialAt(t), camera.toward) > 0), radialAt), s.colour);
        // Up to the top of the dome: a radius the flat base ellipse has no room to label.
        if (show.has("radius")) construction(`s${k}-radius`, O, add(O, [0, 0, r]), true, "r", s.dims.r!);
        if (labelsOn || show.has("radius")) {
          if (given !== null && given.length !== 1) throw new SpecError(`${s.path}.labels names ${given.length} point(s); a hemisphere names its centre`);
          places.push({ id: `s${k}-O`, p: P(O), text: labelsOn ? (given?.[0] ?? "O") : "", colour: s.colour, dot: true, solid: k });
        }
        const Rr = s.dims.r!;
        const onTop = s.host !== undefined;
        if (want.has("volume")) lines.push(line("V", "2πr³/3", solidVolume(s), 3));
        if (want.has("area")) lines.push(onTop ? `${line("A", "2πr²", xscale(mul(PI, square(Rr)), 2), 2)} (superfície curva)` : `${line("A", "2πr² + πr²", solidArea(s), 2)} (área total)`);
      } else if (s.kind === "cone") {
        const h = valueOf(s.dims.h!);
        const view = coneView(camera, O, r, h);
        const all = [...arcPoints(view.base, 0, 2 * Math.PI), P(view.apex)];
        pagePts.push(...all);
        fills.push({ id: `s${k}-fill`, pts: convexHull(all), colour: `${s.colour}1A` });
        if (!skipBottomRim(s) && firstRim(O, r)) rimStrokes(strokes, `s${k}-base`, view.base, rimArcs(s, "bottom", view.baseArcs, lateralOf(s)), s.colour);
        const right = view.silhouette.length === 2 ? rightOf(view.base, view.silhouette as [number, number]) : null;
        if (right === null && (show.has("slant") || show.has("radius"))) {
          throw new SpecError(`${s.path}: this camera sees the apex through the base, so the cone has no outline generator to carry g or r -- choose a lower elevation`);
        }
        view.silhouette.forEach((t, i) => {
          const a = view.base.point3(t);
          strokes.push({
            id: `s${k}-generator-${i}`,
            pts: [P(view.apex), P(a)],
            colour: s.colour,
            width: W_VISIBLE,
            dashed: false,
            layer: 1,
            ...(t === right && show.has("slant") ? { measure: { dir3: vsub(a, view.apex), text: measureText("g", s.dims.g!), labelColour: s.colour, solid: k, symbol: "g", reading: `${prefix}${measureText("g", s.dims.g!)}` } } : {}),
          });
        });
        const baseSeen = facesViewer(camera, [0, 0, -1]);
        if (show.has("height")) construction(`s${k}-height`, view.apex, O, true, "h", s.dims.h!);
        if (show.has("radius")) construction(`s${k}-radius`, O, view.base.point3(right!), !baseSeen, "r", s.dims.r!);
        if (show.has("height") && right !== null) rights.push({ id: `s${k}-right-O`, pts: rightAngle3(O, vsub(view.apex, O), vsub(view.base.point3(right), O), ra) });
        if (labelsOn) {
          if (given !== null && given.length !== 2) throw new SpecError(`${s.path}.labels names ${given.length} point(s); a cone names its apex and its base centre`);
          const [nV, nO] = given ?? ["V", "O"];
          places.push({ id: `s${k}-V`, p: P(view.apex), text: nV!, colour: s.colour, dot: false, solid: k });
          places.push({ id: `s${k}-O`, p: P(O), text: nO!, colour: s.colour, dot: true, solid: k });
        } else if (show.has("height") || show.has("radius")) {
          places.push({ id: `s${k}-O`, p: P(O), text: "", colour: s.colour, dot: true, solid: k });
        }
        const { r: R, h: H, g: G } = s.dims as Required<Pick<Dims, "r" | "h" | "g">>;
        if (want.has("measures")) lines.push(s.def.slant === undefined ? line("g", "√(r² + h²)", G, 1) : line("h", "√(g² − r²)", H, 1));
        if (want.has("volume")) lines.push(line("V", "πr²h/3", xscale(mul(PI, mul(square(R), H)), 1 / 3), 3));
        if (want.has("area")) lines.push(`${line("A", "πr² + πrg", xadd(mul(PI, square(R)), mul(PI, mul(R, G))), 2)} (área total)`);
      } else {
        const view = sphereView(camera, O, r);
        const outline = arcPoints(view.outline, 0, 2 * Math.PI);
        pagePts.push(...outline);
        fills.push({ id: `s${k}-fill`, pts: outline, colour: `${s.colour}1A` });
        strokes.push({ id: `s${k}-outline`, pts: outline, colour: s.colour, width: W_VISIBLE, dashed: false, layer: 1 });
        if (show.has("equator")) rimStrokes(strokes, `s${k}-equator`, view.equator, view.equatorArcs, s.colour, 1.4);
        if (show.has("radius")) construction(`s${k}-radius`, O, view.equator.point3(rightmostParam(view.equator)), true, "r", s.dims.r!);
        if (labelsOn || show.has("radius")) {
          if (given !== null && given.length !== 1) throw new SpecError(`${s.path}.labels names ${given.length} point(s); a sphere names its centre`);
          places.push({ id: `s${k}-O`, p: P(O), text: labelsOn ? (given?.[0] ?? "O") : "", colour: s.colour, dot: true, solid: k });
        }
        const R = s.dims.r!;
        if (want.has("measures") && s.derivation !== undefined) lines.push(line("r", s.derivation.split("r = ")[1] ?? "", R, 1));
        if (want.has("volume")) lines.push(line("V", "4πr³/3", xscale(mul(PI, mul(square(R), R)), 4 / 3), 3));
        if (want.has("area")) lines.push(`${line("A", "4πr²", xscale(mul(PI, square(R)), 4), 2)} (superfície)`);
      }
    }
    // ---- an inscribed prism or cylinder states its derived dimension ----
    if (s.derivation !== undefined && want.has("measures") && (s.kind === "prism" || s.kind === "cylinder")) {
      const [sym, formula] = s.derivation.split(": ")[1]!.split(" = ") as [string, string];
      lines.unshift(line(sym, formula, s.kind === "prism" ? s.dims.a! : s.dims.r!, 1));
    }

    // ---- a bore through the solid (ADR 0068) ----
    if (s.bore !== undefined && s.def.net !== "only") {
      const bore = s.bore;
      const c = s.at;
      const Hb = valueOf(topHeightOf(s)!);
      const zBot = c[2];
      const zTop = c[2] + Hb;
      const topSeen = facesViewer(camera, ZUP);
      const botSeen = facesViewer(camera, ZDOWN);
      let insideXY: (x: number, y: number) => boolean;
      let ring2: Vec2[] = [];
      if (bore.kind === "round") {
        const rho = valueOf(bore.rho);
        insideXY = (x, y) => Math.hypot(x - c[0], y - c[1]) < rho * (1 - 1e-9);
      } else {
        ring2 = regularPolygon(c, bore.n, valueOf(bore.edge)).map((p) => [p[0], p[1]] as Vec2);
        insideXY = (x, y) => insidePolygon(ring2, [x, y], 1e-9 * size);
      }
      // A point of the bore's wall is seen on a cap that faces the reader, or through the opening -- and nowhere
      // else. A prism inscribed in a cylinder touches the outer wall only along its corner lines, a seam of no
      // thickness: those lines are the hole's edges, inside the solid, and are hidden like the rest of its wall.
      const seenAt = (p: Vec3, cap: "top" | "bottom" | null): boolean => {
        if (cap === "top" && topSeen) return true;
        if (cap === "bottom" && botSeen) return true;
        return seenThroughOpening(camera, p, zBot, zTop, insideXY);
      };
      const pieceStrokes = (id: string, at: (u: number) => Vec3, cap: "top" | "bottom" | null, measure?: Stroke["measure"]): void => {
        const pieces = splitParam((u) => seenAt(at(u), cap), 0, 1, 120);
        pieces.forEach((pc, q) => {
          const steps = 24;
          const pts = Array.from({ length: steps + 1 }, (_, j) => P(at(pc.t0 + ((pc.t1 - pc.t0) * j) / steps)));
          strokes.push({ id: pieces.length === 1 ? id : `${id}-${q}`, pts: measure === undefined ? pts : [pts[0]!, pts[pts.length - 1]!], colour: s.colour, width: pc.visible ? W_VISIBLE - 0.2 : W_HIDDEN, dashed: !pc.visible, layer: pc.visible ? 1 : 0, ...(measure !== undefined && pieces.length === 1 ? { measure } : {}) });
        });
      };
      const holeCap = topSeen ? zTop : botSeen ? zBot : null;
      if (bore.kind === "round") {
        const rho = valueOf(bore.rho);
        const top = projectCircle(camera, [c[0], c[1], zTop], ZUP, rho);
        const bot = projectCircle(camera, [c[0], c[1], zBot], ZUP, rho);
        if (holeCap !== null) fills.push({ id: `s${k}-bore-fill`, pts: arcPoints(holeCap === zTop ? top : bot, 0, 2 * Math.PI), colour: `${s.colour}40` });
        for (const [name, pc, cap] of [["top", top, "top"], ["bottom", bot, "bottom"]] as const) {
          const arcs = splitWholeCircle((t) => seenAt(pc.point3(t), cap));
          arcs.forEach((a, q) => strokes.push({ id: `s${k}-bore-${name}-${q}`, pts: arcPoints(pc, a.t0, a.t1), colour: s.colour, width: a.visible ? W_VISIBLE - 0.2 : W_HIDDEN, dashed: !a.visible, layer: a.visible ? 1 : 0 }));
        }
        tangentParamsParallelTo(bot, projectDirection(camera, [0, 0, Hb])).forEach((t, q) => {
          pieceStrokes(`s${k}-bore-generator-${q}`, (u) => lerp(bot.point3(t), top.point3(t), u), null);
        });
        // Toward the back, so it never runs along the solid's own radius (drawn to the right) or through O′'s name.
        if (show.has("bore")) {
          construction(`s${k}-bore-radius`, [c[0], c[1], zTop], top.point3(top.frontCenter + Math.PI), !topSeen, "ρ", bore.rho);
          strokes[strokes.length - 1]!.measure!.beyond = true;
        }
      } else {
        const T = regularPolygon([c[0], c[1], zTop], bore.n, valueOf(bore.edge));
        const B = regularPolygon([c[0], c[1], zBot], bore.n, valueOf(bore.edge));
        if (holeCap !== null) fills.push({ id: `s${k}-bore-fill`, pts: (holeCap === zTop ? T : B).map(P), colour: `${s.colour}40` });
        const symbol = s.kind === "cylinder" || s.dims.r !== undefined ? "ℓ" : "ℓ′";
        for (let i = 0; i < bore.n; i += 1) {
          const j = (i + 1) % bore.n;
          const m = i === 0 && show.has("bore") ? { dir3: vsub(T[1]!, T[0]!), text: measureText(symbol, bore.edge), labelColour: s.colour, solid: k, symbol, reading: `${prefix}${measureText(symbol, bore.edge)}` } : undefined;
          pieceStrokes(`s${k}-bore-top-${i}`, (u) => lerp(T[i]!, T[j]!, u), "top", m);
          pieceStrokes(`s${k}-bore-bottom-${i}`, (u) => lerp(B[i]!, B[j]!, u), "bottom");
          pieceStrokes(`s${k}-bore-edge-${i}`, (u) => lerp(B[i]!, T[i]!, u), null);
        }
      }
      const hostV = solidVolume(s);
      const boreV = boreVolume(s);
      const hostA = solidArea(s);
      const word = WORD[s.kind].toLowerCase();
      for (let q = lines.length - 1; q >= 0; q -= 1) if (/^(V|A) = /.test(lines[q]!)) lines.splice(q, 1);
      if (want.has("measures") && bore.kind === "polygon" && bore.inscribed) {
        lines.push(line("ℓ (furo)", bore.n === 3 ? "R√3" : bore.n === 4 ? "R√2" : bore.n === 6 ? "R" : "2R·sen(180°/n)", bore.edge, 1));
      }
      if (want.has("volume")) lines.push(`V = V(${word}) − V(furo) = ${print(hostV, locale).text} − ${print(boreV, locale).text} ${equalsText(xsub(hostV, boreV), locale)}${unitOf(3)}`);
      if (want.has("area")) {
        const mouth = boreMouth(s);
        const wall = boreWall(s);
        lines.push(`A = A(${word}) − 2·A(boca) + A(parede do furo) = ${print(hostA, locale).text} − 2·${print(mouth, locale).text} + ${print(wall, locale).text} ${equalsText(xadd(xsub(hostA, xscale(mouth, 2)), wall), locale)}${unitOf(2)} (área total)`);
      }
    }

    // ---- liquid to a level (ADR 0068) ----
    if (s.liquid !== undefined) {
      const liq = s.liquid;
      const L = valueOf(liq.level);
      const Hs = valueOf(s.dims.h ?? s.dims.a!);
      const c = s.at;
      const lvl: Vec3 = [c[0], c[1], c[2] + L];
      let rimPts: Vec2[] = [];
      let lowPts: Vec2[] = [];
      let reach = 0;
      let rightDir: Vec3 = [0, 1, 0];
      let floorPt: Vec3 = c;
      let levelPt: Vec3 = lvl;
      const lp = polyhedronOf(s);
      if (lp !== null) {
        const n = lp.n;
        const V = lp.vertices;
        const tops = s.kind === "pyramid" ? Array.from({ length: n }, () => V[n]!) : V.slice(n, 2 * n);
        const section = V.slice(0, n).map((b, i) => lerp(b, tops[i]!, L / Hs));
        const faceOf = (i: number): number => (s.kind === "pyramid" ? 1 + i : 2 + i);
        section.forEach((p, i) => {
          const q = section[(i + 1) % n]!;
          const seenFace = faceVisible(camera, lp, faceOf(i));
          strokes.push({ id: `s${k}-level-${i}`, pts: [P(p), P(q)], colour: WATER, width: seenFace ? 1.6 : W_HIDDEN, dashed: !seenFace, layer: seenFace ? 1 : 0 });
        });
        rimPts = section.map(P);
        lowPts = V.slice(0, n).map(P);
        // The dimension stands out square to the lateral face that draws furthest to the page-right, from the
        // base corner furthest that way (the one nearer the reader on a tie), in the plane of that face.
        let bestX = -Infinity;
        for (let i = 0; i < n; i += 1) {
          const nrm = faceNormal(lp, faceOf(i));
          const flat = normalize([nrm[0], nrm[1], 0]);
          const x = projectDirection(camera, flat)[0];
          if (x > bestX + 1e-9) {
            bestX = x;
            rightDir = flat;
          }
        }
        const along = (p: Vec3): number => dot(vsub(p, c), rightDir);
        let best = 0;
        V.slice(0, n).forEach((p, i) => {
          const gain = along(p) - along(V[best]!);
          if (gain > 1e-9 * size || (Math.abs(gain) <= 1e-9 * size && dot(p, camera.toward) < dot(V[best]!, camera.toward))) best = i;
          reach = Math.max(reach, along(p), along(section[i]!));
        });
        floorPt = V[best]!;
        levelPt = section[best]!;
      } else {
        const r0 = valueOf(s.dims.r!);
        const down = s.down === true;
        const rho = s.kind === "cylinder" ? r0 : s.kind === "cone" ? (down ? (r0 * L) / Hs : r0 * (1 - L / Hs)) : r0 + ((valueOf(s.dims.rt!) - r0) * L) / Hs;
        const lat = (t: number): Vec3 => (s.kind === "cylinder" ? radialAt(t) : down ? add(vscale(radialAt(t), Hs), vscale(ZUP, -r0)) : lateralOf(s)(t));
        const pc = projectCircle(camera, lvl, ZUP, rho);
        splitWholeCircle((t) => dot(lat(t), camera.toward) > 0).forEach((a, q) => {
          strokes.push({ id: `s${k}-level-${q}`, pts: arcPoints(pc, a.t0, a.t1), colour: WATER, width: a.visible ? 1.6 : W_HIDDEN, dashed: !a.visible, layer: a.visible ? 1 : 0 });
        });
        rimPts = arcPoints(pc, 0, 2 * Math.PI);
        lowPts = down ? [P(c)] : arcPoints(projectCircle(camera, c, ZUP, r0), 0, 2 * Math.PI);
        // The widest the liquid gets, from the floor (or the apex) to its level.
        const r00 = down ? 0 : r0;
        reach = Math.max(r00, rho);
        rightDir = radialAt(rightmostParam(projectCircle(camera, c, ZUP, 1)));
        floorPt = add(c, vscale(rightDir, r00));
        levelPt = add(lvl, vscale(rightDir, rho));
      }
      fills.push({ id: `s${k}-liquid-fill`, pts: convexHull([...lowPts, ...rimPts]), colour: `${WATER}1C` });
      if (show.has("level")) {
        // The level as a dimension line beside the liquid, vertical and in true length: arrowheads at both ends,
        // and thin extension lines out from the floor (or the apex) and from the level.
        const off = reach + 0.1 * size;
        const a: Vec3 = add(floorPt, vscale(rightDir, off - dot(vsub(floorPt, c), rightDir)));
        const b: Vec3 = add(a, [0, 0, L]);
        const past = 0.03 * size;
        strokes.push({ id: `s${k}-level-extension-0`, pts: [P(add(floorPt, vscale(rightDir, 0.02 * size))), P(add(a, vscale(rightDir, past)))], colour: WATER, width: 0.9, dashed: false, layer: 3 });
        strokes.push({ id: `s${k}-level-extension-1`, pts: [P(add(levelPt, vscale(rightDir, 0.02 * size))), P(add(b, vscale(rightDir, past)))], colour: WATER, width: 0.9, dashed: false, layer: 3 });
        const head = Math.min(0.05 * size, L / 4);
        for (const [tip, up, q] of [[a, 1, 0], [b, -1, 1]] as const) {
          const base = add(tip, [0, 0, up * head]);
          strokes.push({ id: `s${k}-level-arrow-${q}`, pts: [P(add(base, vscale(rightDir, -0.4 * head))), P(tip), P(add(base, vscale(rightDir, 0.4 * head)))], colour: WATER, width: 1.2, dashed: false, layer: 3 });
        }
        // Room for its label beside it, inside the canvas.
        pagePts.push(P(add(a, vscale(rightDir, 0.3 * size))));
        strokes.push({ id: `s${k}-level-dimension`, pts: [P(a), P(b)], colour: WATER, width: 1.4, dashed: false, layer: 2, measure: { dir3: vsub(b, a), text: measureText(null, liq.level), labelColour: WATER_TEXT, solid: k, symbol: null, reading: `${prefix}${measureText("nível", liq.level)}` } });
      }
      // A height drawn through the liquid is labelled on its dry part, never on the level.
      for (const st of strokes.slice(marksBefore.strokes)) {
        const ms = st.measure;
        if (ms === undefined || st.id.includes("level")) continue;
        const d3 = ms.dir3;
        if (Math.hypot(d3[0], d3[1]) > 1e-9 * Math.abs(d3[2]) || Math.abs(Math.abs(d3[2]) - Hs) > 1e-9 * Hs) continue;
        const wet = L / Hs;
        const span: [number, number] = d3[2] > 0 ? [wet + 0.08, 1] : [0, 1 - wet - 0.08];
        if (span[1] - span[0] >= 0.15) ms.span = span;
      }
      const full = solidVolume(s);
      const formula = liquidFormula(s);
      if (want.has("measures") && liq.given === "volume") lines.push(line("nível", levelFormula(s), liq.level, 1));
      if (want.has("volume")) {
        lines.push(line("V(líquido)", formula, liq.volume, 3));
        lines.push(`V(líquido)/V ${equalsText(div(liq.volume, full), locale)}`);
      }
    }

    // A solid drawn as its net alone keeps its readings and loses its 3D marks.
    if (s.def.net === "only") {
      fills.length = marksBefore.fills;
      strokes.length = marksBefore.strokes;
      places.length = marksBefore.places;
      rights.length = marksBefore.rights;
      pagePts.length = 0;
    }
    for (const p of places.filter((q) => q.solid === k)) if (p.text !== "") nameOnce(p.text, s.path);
    if (s.derivation !== undefined && !want.has("measures")) lines.unshift(s.derivation.split(":")[0]!);
    readings.push(...lines.map((l) => `${prefix}${l}`));
    solidPage.push(pagePts);
  }
  // ---- nets, laid flat to the right of the solids, in true size (ADR 0068) ----
  type FaceLabel = { id: string; p: Vec2; text: string; colour: string };
  const faceLabels: FaceLabel[] = [];
  const netted = solids.filter((s) => s.def.net === true || s.def.net === "only");
  if (netted.length > 0) {
    const before = [...solidPage.flat(), ...strokes.flatMap((x) => x.pts)];
    let cursor = before.length > 0 ? Math.max(...before.map((p) => p[0])) : 0;
    const floor = before.length > 0 ? Math.min(...before.map((p) => p[1])) : 0;
    const gap = 0.3 * Math.max(...netted.map(sizeOf));
    for (const s of netted) {
      const k = s.index;
      const slot = solidPage.length;
      const show = new Set((s.def.show ?? []).filter((item) => answers || isGiven(s, item)));
      const netLines: string[] = [];
      const prefix = solids.length > 1 ? `${s.name}: ` : "";
      let flatPts: Vec2[] = [];
      const pieces: { pts: Vec2[]; fill: string; label: string | null }[] = [];
      const segs: { a: Vec2; b: Vec2; dashed: boolean; measure?: { symbol: string | null; value: Exact } }[] = [];
      const radii: { a: Vec2; b: Vec2; symbol: string; value: Exact }[] = [];
      const arcs: Vec2[][] = [];
      let angle: { at: Vec2; value: Exact } | null = null;
      try {
        if (s.kind === "cylinder" || s.kind === "cone" || (s.kind === "frustum" && s.dims.r !== undefined)) {
          let rn: RoundNet;
          if (s.kind === "cylinder") rn = cylinderNet(valueOf(s.dims.r!), valueOf(s.dims.h!));
          else if (s.kind === "cone") rn = coneNet(valueOf(s.dims.r!), valueOf(s.dims.g!));
          else {
            const [big, small] = valueOf(s.dims.r!) > valueOf(s.dims.rt!) ? [s.dims.r!, s.dims.rt!] : [s.dims.rt!, s.dims.r!];
            rn = frustumNet(valueOf(big), valueOf(small), valueOf(s.dims.g!));
          }
          for (const pc of rn.pieces) pieces.push({ pts: pc.outline, fill: `${s.colour}14`, label: pc.name === "base" ? "base" : "superfície lateral" });
          // Outlines: a lateral piece's straight sides as runs of their own (one may carry a length), its arcs as curves.
          const lat = rn.pieces[0]!.outline;
          if (s.kind === "cylinder") {
            const [p0, p1, p2, p3] = lat as [Vec2, Vec2, Vec2, Vec2];
            segs.push({ a: p0, b: p1, dashed: false, ...(answers ? { measure: { symbol: "2πr", value: mul(xscale(PI, 2), s.dims.r!) } } : {}) });
            segs.push({ a: p1, b: p2, dashed: false, ...(show.has("height") || answers ? { measure: { symbol: "h", value: s.dims.h! } } : {}) });
            segs.push({ a: p2, b: p3, dashed: false }, { a: p3, b: p0, dashed: false });
          } else if (s.kind === "cone") {
            const apex = lat[0]!;
            const arc = lat.slice(1);
            arcs.push(arc);
            segs.push({ a: apex, b: arc[arc.length - 1]!, dashed: false, ...(answers || isGiven(s, "slant") ? { measure: { symbol: "g", value: s.dims.g! } } : {}) });
            segs.push({ a: arc[0]!, b: apex, dashed: false });
            if (answers) angle = { at: apex, value: div(xscale(s.dims.r!, 360), s.dims.g!) };
          } else {
            const half = lat.length / 2;
            const outer = lat.slice(0, half);
            const inner = lat.slice(half);
            arcs.push(outer, inner);
            segs.push({ a: inner[0]!, b: outer[outer.length - 1]!, dashed: false, ...(answers || isGiven(s, "slant") ? { measure: { symbol: "g", value: s.dims.g! } } : {}) });
            segs.push({ a: outer[0]!, b: inner[inner.length - 1]!, dashed: false });
          }
          for (const pc of rn.pieces.slice(1)) arcs.push([...pc.outline, pc.outline[0]!]);
          for (const run of rn.runs) {
            if (run.which === "radius") radii.push({ a: run.a, b: run.b, symbol: s.kind === "frustum" ? "R" : "r", value: s.kind === "frustum" ? (valueOf(s.dims.r!) > valueOf(s.dims.rt!) ? s.dims.r! : s.dims.rt!) : s.dims.r! });
            if (run.which === "topRadius") radii.push({ a: run.a, b: run.b, symbol: "r", value: valueOf(s.dims.r!) > valueOf(s.dims.rt!) ? s.dims.rt! : s.dims.r! });
          }
          flatPts = rn.pieces.flatMap((pc) => pc.outline);
        } else {
          const poly = s.mesh ?? orientMesh(polyhedronOf(s)!);
          const prismLike = s.kind === "cube" || s.kind === "box" || s.kind === "prism";
          const preferred = prismLike ? prismTree(polyhedronOf(s)!.n) : s.kind === "stairs" ? prismTree(poly.faces.length - 2, poly.faces.length - 3) : undefined;
          const net: PolyNet = polyhedronNet(poly, preferred);
          const given = s.def.netLabels;
          if (given !== undefined && given.length !== poly.faces.length) throw new SpecError(`${s.path}.netLabels names ${given.length} face(s); this ${s.kind} has ${poly.faces.length}`);
          const role = (f: number): string | null => {
            if (given !== undefined) return given[f]!.trim() === "" ? null : given[f]!;
            if (prismLike || (s.kind === "frustum" && s.dims.n !== undefined)) return f <= 1 ? "base" : null;
            if (s.kind === "pyramid") return f === 0 ? "base" : null;
            return null;
          };
          for (const nf of net.faces) {
            const sides = poly.faces[nf.face]!.length;
            pieces.push({ pts: nf.pts, fill: s.def.tint === "sides" ? `${tintFor(sides)}55` : `${s.colour}14`, label: role(nf.face) });
          }
          for (const [a, b] of net.cuts) segs.push({ a, b, dashed: false });
          for (const [a, b] of net.folds) segs.push({ a, b, dashed: true });
          flatPts = net.faces.flatMap((f) => f.pts);
        }
      } catch (e) {
        if (e instanceof NetError) throw new SpecError(`${s.path}.net: ${e.message}`);
        throw e;
      }
      const minX = Math.min(...flatPts.map((p) => p[0]));
      const minY = Math.min(...flatPts.map((p) => p[1]));
      const dx = (before.length > 0 ? cursor + gap : 0) - minX;
      const dy = floor - minY;
      const T = (p: Vec2): Vec2 => [p[0] + dx, p[1] + dy];
      const pagePts = flatPts.map(T);
      pieces.forEach((pc, q) => {
        fills.push({ id: `s${k}-net-face${q}`, pts: pc.pts.map(T), colour: pc.fill });
        if (pc.label !== null) {
          const cx = pc.pts.reduce((acc, p) => acc + p[0], 0) / pc.pts.length;
          const cy = pc.pts.reduce((acc, p) => acc + p[1], 0) / pc.pts.length;
          faceLabels.push({ id: `s${k}-net-face${q}`, p: T([cx, cy]), text: pc.label, colour: SOFT });
        }
      });
      segs.forEach((sg, q) => {
        const m = sg.measure;
        strokes.push({
          id: `s${k}-net-${sg.dashed ? "fold" : "cut"}-${q}`,
          pts: [T(sg.a), T(sg.b)],
          colour: s.colour,
          width: sg.dashed ? W_HIDDEN : W_VISIBLE,
          dashed: sg.dashed,
          layer: sg.dashed ? 0 : 1,
          ...(m === undefined ? {} : { measure: { dir3: [1, 0, 0], flat: true, text: measureText(m.symbol, m.value), labelColour: s.colour, solid: slot, symbol: m.symbol, reading: `${prefix}${measureText(m.symbol, m.value)}` } }),
        });
      });
      arcs.forEach((arc, q) => strokes.push({ id: `s${k}-net-arc-${q}`, pts: arc.map(T), colour: s.colour, width: W_VISIBLE, dashed: false, layer: 1 }));
      radii.forEach((rr, q) => {
        if (!(answers || isGiven(s, rr.symbol === "R" ? "radius" : s.kind === "frustum" ? "topRadius" : "radius"))) return;
        strokes.push({ id: `s${k}-net-radius-${q}`, pts: [T(rr.a), T(rr.b)], colour: ACCENT, width: W_CONSTRUCTION, dashed: false, layer: 2, measure: { dir3: [1, 0, 0], flat: true, text: measureText(rr.symbol, rr.value), labelColour: ACCENT, solid: slot, symbol: rr.symbol, reading: `${prefix}${measureText(rr.symbol, rr.value)}` } });
        places.push({ id: `s${k}-net-centre-${q}`, p: T(rr.a), text: "", colour: ACCENT, dot: true, solid: slot });
      });
      if (angle !== null) {
        const pr = print(angle.value, locale);
        places.push({ id: `s${k}-net-angle`, p: T(angle.at), text: `θ ${pr.exact ? "=" : "≈"} ${pr.text}°`, colour: ACCENT, dot: false, solid: slot });
        netLines.push(`${prefix}planificação: θ = 360°·r/g ${pr.exact ? "=" : "≈"} ${pr.text}°`);
      }
      if (answers && s.kind === "cylinder") netLines.push(`${prefix}planificação: retângulo 2πr × h = ${print(mul(xscale(PI, 2), s.dims.r!), locale).text} × ${print(s.dims.h!, locale).text}`);
      if (answers && (s.def.readings ?? []).length > 0) readings.push(...netLines);
      cursor = Math.max(...pagePts.map((p) => p[0]));
      solidPage.push(pagePts);
    }
  }

  // ---- totals over the composite (ADR 0068) ----
  if (input.total !== undefined) {
    if (!Array.isArray(input.total) || input.total.some((t) => t !== "volume" && t !== "area")) throw new SpecError(`total must be a list of "volume" and "area"`);
    if (answers && solids.length > 1) {
      const names = solids.map((s) => s.name).join(" + ");
      if (input.total.includes("volume")) {
        const V = solids.reduce<Exact>((acc, s) => xadd(acc, volumeOfSolid(s)), rat(0));
        readings.push(`Total: V = V(${names}) ${equalsText(V, locale)}${unitOf(3)}`);
      }
      if (input.total.includes("area")) {
        const loose = solids.filter((s) => s.host !== undefined && !junctions.some((j) => j.att === s.index));
        if (loose.length > 0) throw new SpecError(`total: the joined area of ${loose[0]!.path} on its host is computed only for round solids on round solids`);
        let A = solids.reduce<Exact>((acc, s) => xadd(acc, areaOfSolid(s)), rat(0));
        for (const j of junctions) {
          const a = solids[j.att]!.dims.r!;
          const b = topRadiusOf(solids[j.host]!)!;
          A = xsub(A, xscale(mul(PI, square(valueOf(a) < valueOf(b) ? a : b)), 2));
        }
        readings.push(`Total: A = A(${names}) − 2·A(junções) ${equalsText(A, locale)}${unitOf(2)} (área total)`);
      }
    }
  }
  readings.push(...extra);
  const needs: string[] = [];

  // ---- page transform ----
  const every: Vec2[] = [...solidPage.flat(), ...strokes.flatMap((s) => s.pts)];
  const us = every.map((p) => p[0]);
  const vs = every.map((p) => p[1]);
  const [uMin, uMax, vMin, vMax] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  // The unit is fitted to the solid: the bounds are for a solid of 1 to 30 lengths, and a solid of 5000 or of
  // 0,003 has the same figure, its bounds scaled by its decade (shared/scale.ts).
  const largest = Math.max(...solids.map(sizeOf));
  const decade = largest >= 1 && largest < 30 ? 1 : 10 ** Math.floor(Math.log10(largest));
  // A net laid beside the solid widens the figure; the solid keeps the size it has alone (the page grows,
  // up to twice as wide), rather than shrinking to share 400 px with its net.
  const own = solidPage.slice(0, solids.length).flat();
  const ownW = own.length > 0 ? Math.max(...own.map((p) => p[0])) - Math.min(...own.map((p) => p[0])) : 0;
  const ownH = own.length > 0 ? Math.max(...own.map((p) => p[1])) - Math.min(...own.map((p) => p[1])) : 0;
  const widen = netted.length > 0 && ownW > 0 ? Math.min(2.2, Math.max(1, (uMax - uMin) / Math.max(ownW, ownH))) : 1;
  const tall = netted.length > 0 && ownH > 0 ? Math.min(1.6, Math.max(1, (vMax - vMin) / Math.max(ownW, ownH))) : 1;
  const unitPx = fitUnits(uMax - uMin, vMax - vMin, { targetWidth: TARGET * widen, targetHeight: TARGET * tall, equal: true, maxUnit: MAX_UNIT / decade, minUnit: MIN_UNIT / decade }).xUnit;
  // One reading a line, never wrapped: an equation parted across lines reads wrong.
  const readingPanel = layoutPanel(
    readings.map((text) => ({ text: [{ text }], wrap: false })),
    { width: Infinity, size: 13, lineHeight: CAPTION_LINE_H, emphasis: "soft" },
  );
  const captionW = readingPanel.width;
  const plotW = Math.ceil((uMax - uMin) * unitPx + 2 * PAD);
  const width = Math.max(plotW, Math.ceil(captionW + 48));
  const plotH = Math.ceil((vMax - vMin) * unitPx + 2 * PAD);
  const height = plotH + (readingPanel.empty ? 0 : readingPanel.height + 18);
  const ox = (width - (uMax - uMin) * unitPx) / 2 - uMin * unitPx;
  const oy = PAD + vMax * unitPx;
  const page = (q: Vec2): Point => ({ x: ox + q[0] * unitPx, y: oy - q[1] * unitPx });
  const board = new Board(width, height, PAPER);
  const placer = new SpacePlacer({ x: 6, y: 6, width: width - 12, height: plotH - 6 });
  const solidCentre = solidPage.map((pts) => {
    const c = pts.map(page);
    return { x: c.reduce((s, p) => s + p.x, 0) / c.length, y: c.reduce((s, p) => s + p.y, 0) / c.length };
  });

  // ---- marks: fills, hidden, visible, construction, right angles, dots ----
  for (const f of fills) {
    const pts = f.pts.map(page);
    board.poly(pts, { stroke: "none", width: 0, fill: f.colour, close: true, id: f.id });
    // A fill's outline is ink to annotation-nearest-its-owner, so the search
    // sees it too (never as a clash: it is not stroked).
    placer.addInk(f.id, f.id, [...pts, pts[0]!], false);
  }
  const measured: { id: string; a: Point; b: Point; text: string; colour: string; solid: number; outline: boolean; symbol: string | null; reading: string; beyond: boolean; span: [number, number]; inward: boolean }[] = [];
  const ordered = [...strokes].sort((a, b) => a.layer - b.layer);
  for (const s of ordered) {
    const pts = s.pts.map(page);
    const style = { ...(s.dashed ? { lineStyle: "dashed" as const } : {}) };
    if (s.measure !== undefined) {
      const a = pts[0]!;
      const b = pts[1]!;
      const px = Math.hypot(b.x - a.x, b.y - a.y);
      const shrink = s.measure.flat === true ? 1 : Math.hypot(...projectDirection(camera, normalize(s.measure.dir3)));
      if (px > 1 && shrink > 0.05) {
        // The run is stated in a frame laid along its own page direction,
        // whose unit is how many px ONE TRUE unit along this 3D direction
        // draws: so the frame measures true length, and the printed value
        // is checked against it.
        const frame: Frame = {
          id: `${s.id}-ruler`,
          origin: a,
          rotation: (Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI,
          xUnit: unitPx * shrink,
          ...(input.unit === undefined ? {} : { unit: input.unit }),
        };
        board.frames.push(frame);
        const mark: Mark = {
          id: s.id,
          from: { frame: frame.id, x: 0, y: 0 },
          segments: [{ line: { frame: frame.id, x: px / (unitPx * shrink), y: 0 } }],
          close: false,
          fill: "none",
          stroke: s.colour,
          strokeWidth: s.width,
          ...style,
        };
        board.marks.push(mark);
        board.trace([a, b], s.colour, s.width, s.id);
        measured.push({ id: s.id, a, b, text: s.measure.text, colour: s.measure.labelColour, solid: s.measure.solid, outline: s.layer === 1, symbol: s.measure.symbol, reading: s.measure.reading, beyond: s.measure.beyond === true, span: s.measure.span ?? [0, 1], inward: s.measure.inward === true });
        placer.addInk(s.id, s.id, pts);
        continue;
      }
    }
    board.poly(pts, { stroke: s.colour, width: s.width, id: s.id, ...style });
    placer.addInk(s.id, s.id, pts);
  }
  for (const r of rights) {
    const pts = r.pts.map((p) => page(P(p)));
    board.poly(pts, { stroke: ACCENT, width: 1.1, id: r.id });
    placer.addInk(r.id, r.id, pts);
  }
  // Dots last: nothing is ever drawn over a point.
  for (const d of places) {
    const c = page(d.p);
    if (d.dot) {
      board.circle(c, DOT_R, { stroke: d.colour, width: 1, fill: d.colour, id: `${d.id}-dot` });
      placer.addInk(`${d.id}-dot`, `${d.id}-dot`, Array.from({ length: 13 }, (_, i) => ({ x: c.x + DOT_R * Math.cos((i * Math.PI) / 6), y: c.y + DOT_R * Math.sin((i * Math.PI) / 6) })));
    }
    if (d.text !== "") placer.addPlace(c);
  }

  // ---- labels: point names first (least freedom), then measures ----
  for (const d of places) {
    if (d.text === "") continue;
    const c = page(d.p);
    const style = { size: 15, weight: 700, colour: d.colour };
    const { w, h } = board.extent(d.text, style);
    const centre = solidCentre[d.solid]!;
    const out = { x: c.x - centre.x, y: c.y - centre.y };
    const outLen = Math.hypot(out.x, out.y) || 1;
    const raw = aroundPlace(c, w, h, d.dot ? DOT_R : 1);
    const spots: Point[] = [];
    for (let i = 0; i < raw.length; i += 12) {
      const block = raw.slice(i, i + 12);
      block.sort((p, q) => outward(q) - outward(p));
      spots.push(...block);
    }
    function outward(p: Point): number {
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      return (dx * out.x + dy * out.y) / (outLen * (Math.hypot(dx, dy) || 1));
    }
    const best = placer.choose(spots, w, h, (q) => placer.placeCost(c, d.dot ? `${d.id}-dot` : null, q, w, h, 1));
    board.label(d.text, best.centre.x, best.centre.y, { ...style, width: w, id: `${d.id}-label`, annotatesPlace: { x: c.x, y: c.y } });
  }
  // A net's face names, set on the face itself; a face too small to hold its name clear of the edges goes unnamed.
  for (const f of faceLabels) {
    const c = page(f.p);
    const style = { size: 13, weight: 600, colour: f.colour };
    const { w, h } = board.extent(f.text, style);
    const best = placer.choose([c], w, h, (q) => placer.placeCost(c, null, q, w, h, 1), false);
    if (best.cost > 0) continue;
    placer.reserve({ x: c.x - w / 2, y: c.y - h / 2, width: w, height: h });
    board.label(f.text, c.x, c.y, { ...style, width: w, id: `${f.id}-label`, annotatesPlace: { x: c.x, y: c.y } });
  }
  const TS = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82];
  for (const m of measured) {
    const style = { size: 14, weight: 700, colour: m.colour };
    const len = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y) || 1;
    const dir = { x: (m.b.x - m.a.x) / len, y: (m.b.y - m.a.y) / len };
    const nrm = { x: -dir.y, y: dir.x };
    const mid = { x: (m.a.x + m.b.x) / 2, y: (m.a.y + m.b.y) / 2 };
    const centre = solidCentre[m.solid]!;
    const outSide = (mid.x - centre.x) * nrm.x + (mid.y - centre.y) * nrm.y >= 0 ? 1 : -1;
    const spotsFor = (w: number, h: number): Point[] => {
      const clearance = Math.abs(nrm.x) * (w / 2) + Math.abs(nrm.y) * (h / 2) + 3 + 3;
      const spots: Point[] = [];
      for (const extra of [0, 3, 7, 12, 18, 26]) {
        for (const t0 of TS) {
          const t = m.span[0] + (m.span[1] - m.span[0]) * t0;
          for (const side of m.inward ? [-outSide, outSide] : [outSide, -outSide]) {
            spots.push({ x: m.a.x + dir.x * len * t + nrm.x * side * (clearance + extra), y: m.a.y + dir.y * len * t + nrm.y * side * (clearance + extra) });
          }
        }
      }
      if (m.beyond) {
        const along = Math.abs(dir.x) * (w / 2) + Math.abs(dir.y) * (h / 2) + 6;
        for (const extra of [0, 4, 9, 15]) spots.push({ x: m.b.x + dir.x * (along + extra), y: m.b.y + dir.y * (along + extra) });
      }
      return spots;
    };
    const attempt = (text: string): { text: string; w: number; h: number; centre: Point; cost: number } => {
      const { w, h } = board.extent(text, style);
      const best = placer.choose(spotsFor(w, h), w, h, (q) => placer.elementCost(m.id, q, w, h, 4), false);
      return { text, w, h, ...best };
    };
    let pick = attempt(m.text);
    if (pick.cost > 0 && m.symbol !== null) {
      // No honest spot for "g = 13": the drawing names the run by its
      // symbol, which claims no length, and the value goes to the panel.
      const short = attempt(m.symbol);
      if (short.cost === 0 || (pick.cost >= 5 && short.cost < Math.min(pick.cost, 5))) {
        pick = short;
        const head = m.reading.slice(0, m.reading.indexOf(`${m.symbol} `) + m.symbol.length + 1);
        if (!readings.some((l) => l.startsWith(head))) needs.push(m.reading);
      }
    }
    placer.reserve({ x: pick.centre.x - pick.w / 2, y: pick.centre.y - pick.h / 2, width: pick.w, height: pick.h });
    // A length printed as a plain fraction ("5/3") reads to the length check
    // as 5 in the unit "/3"; such a label names its run's midpoint instead,
    // and the length goes unmeasured (ADR 0046, "The cost").
    const plainFraction = (pick.text.includes("/") && !pick.text.includes("√")) || pick.text.includes("π");
    board.label(pick.text, pick.centre.x, pick.centre.y, {
      ...style,
      width: pick.w,
      id: `${m.id}-label`,
      ...(plainFraction ? { annotatesPlace: mid } : { annotates: m.id }),
    });
  }

  // ---- the readings panel ----
  readingPanel.draw(board, { left: 24, top: plotH + 2, cut: plotH });

  const spec = board.spec(input.title ?? "geometria espacial");
  const scene = spec.root as Scene;
  scene.connectors = [];
  spec.canvas = { ...spec.canvas, constraints: { allowOverlap: true, allowConnectorCrossing: true, allowCurvedConnectors: true } };
  return { spec: parseSpec(spec), needs };
}

/**
 * Of a box's four space diagonals (bottom vertex i to the top vertex over
 * i + 2), the one whose page image keeps farthest from the other six
 * vertices; returned as [bottom index, top index].
 */
export function clearestDiagonal(camera: Camera, V: readonly Vec3[]): [number, number] {
  let best: [number, number] = [0, 6];
  let bestGap = -1;
  for (let i = 0; i < 4; i += 1) {
    const top = 4 + ((i + 2) % 4);
    const a = project(camera, V[i]!);
    const b = project(camera, V[top]!);
    let gap = Infinity;
    V.forEach((p, k) => {
      if (k === i || k === top) return;
      const q = project(camera, p);
      const d: Vec2 = [b[0] - a[0], b[1] - a[1]];
      const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * d[0] + (q[1] - a[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1])));
      gap = Math.min(gap, Math.hypot(q[0] - a[0] - t * d[0], q[1] - a[1] - t * d[1]));
    });
    if (gap > bestGap + 1e-9) {
      bestGap = gap;
      best = [i, top];
    }
  }
  return best;
}

/**
 * A dimension line for the run p → q, stood off it by `dist` along `off`: thin extension lines from p and q a
 * little past it, arrowheads at both ends, and the line itself carrying the measured label.
 */
function dimensionLine(strokes: Stroke[], P: (p: Vec3) => Vec2, id: string, p: Vec3, q: Vec3, off: Vec3, dist: number, size: number, colour: string, measure: NonNullable<Stroke["measure"]>): void {
  const a = add(p, vscale(off, dist));
  const b = add(q, vscale(off, dist));
  const past = 0.03 * size;
  const gap = 0.02 * size;
  strokes.push({ id: `${id}-extension-0`, pts: [P(add(p, vscale(off, gap))), P(add(a, vscale(off, past)))], colour, width: 0.9, dashed: false, layer: 3 });
  strokes.push({ id: `${id}-extension-1`, pts: [P(add(q, vscale(off, gap))), P(add(b, vscale(off, past)))], colour, width: 0.9, dashed: false, layer: 3 });
  const L = Math.hypot(...vsub(b, a));
  const u = vscale(vsub(b, a), 1 / L);
  const head = Math.min(0.05 * size, L / 4);
  for (const [tip, sgn, k] of [[a, 1, 0], [b, -1, 1]] as const) {
    const base = add(tip, vscale(u, sgn * head));
    strokes.push({ id: `${id}-arrow-${k}`, pts: [P(add(base, vscale(off, -0.4 * head))), P(tip), P(add(base, vscale(off, 0.4 * head)))], colour, width: 1.2, dashed: false, layer: 3 });
  }
  strokes.push({ id, pts: [P(a), P(b)], colour, width: 1.4, dashed: false, layer: 2, measure });
}

/** A face tint by its number of sides, for a polyhedron drawn `tint: "sides"` and its net. */
const TINTS: Record<number, string> = { 3: "#1D4E89", 4: "#B8860B", 5: "#2F6B3A", 6: "#9A3409" };
function tintFor(sides: number): string {
  return TINTS[sides] ?? "#6C3290";
}

/** "vértices: 8; arestas: 12; faces: 6 (6 quadrados)" and Euler's relation, counted from the mesh. */
function countLines(mesh: Mesh): string[] {
  const nv = mesh.vertices.length;
  const ne = meshEdges(mesh).length;
  const nf = mesh.faces.length;
  const chi = nv - ne + nf;
  return [`vértices: ${nv}; arestas: ${ne}; faces: ${nf} (${faceCensus(mesh)})`, `V − A + F = ${nv} − ${ne} + ${nf} = ${chi}`];
}

/** Of the two outline parameters, the one whose generator is further right on the page -- where r, h and g are written. */
function rightOf(pc: ProjectedCircle, ts: readonly [number, number] | readonly number[]): number {
  return pc.point(ts[0]!)[0] >= pc.point(ts[1]!)[0] ? ts[0]! : ts[1]!;
}

function rimStrokes(strokes: Stroke[], id: string, pc: ProjectedCircle, arcs: { t0: number; t1: number; visible: boolean }[], colour: string, visibleWidth = W_VISIBLE): void {
  arcs.forEach((a, i) => {
    strokes.push({ id: `${id}-${a.visible ? "front" : "back"}${arcs.length > 2 ? i : ""}`, pts: arcPoints(pc, a.t0, a.t1), colour, width: a.visible ? visibleWidth : W_HIDDEN, dashed: !a.visible, layer: a.visible ? 1 : 0 });
  });
}

// ---- measures, for tests and the panel ------------------------------------------

/** Every measure of one solid definition, exact, computed from its typed dimensions (no drawing). */
export function measuresOf(def: SolidDef): Record<string, Exact> {
  const [s] = resolveAll({ solids: [def] });
  const d = s!.dims;
  const out: Record<string, Exact> = {};
  for (const [k, x] of Object.entries(d)) if (typeof x === "object") out[k] = x;
  if (s!.kind === "cube") {
    out.D = mul(d.a!, xsqrt(rat(3)));
    out.V = mul(mul(d.a!, d.a!), d.a!);
    out.A = xscale(square(d.a!), 6);
  } else if (s!.kind === "box") {
    out.D = xsqrt(xadd(xadd(square(d.w!), square(d.d!)), square(d.h!)));
    out.V = mul(mul(d.w!, d.d!), d.h!);
    out.A = xscale(xadd(xadd(mul(d.w!, d.d!), mul(d.w!, d.h!)), mul(d.d!, d.h!)), 2);
  } else if (s!.kind === "prism") {
    const B = baseArea(d.n!, d.a!);
    out.Ab = B;
    out.V = mul(B, d.h!);
    out.A = xadd(xscale(B, 2), xscale(mul(d.a!, d.h!), d.n!));
  } else if (s!.kind === "pyramid") {
    const B = baseArea(d.n!, d.a!);
    out.Ab = B;
    out.V = xscale(mul(B, d.h!), 1 / 3);
    out.A = xadd(B, xscale(mul(d.a!, d.g!), d.n! / 2));
  } else if (s!.kind === "cylinder") {
    out.V = mul(PI, mul(square(d.r!), d.h!));
    out.A = xadd(xscale(mul(PI, square(d.r!)), 2), xscale(mul(PI, mul(d.r!, d.h!)), 2));
  } else if (s!.kind === "cone") {
    out.V = xscale(mul(PI, mul(square(d.r!), d.h!)), 1 / 3);
    out.A = xadd(mul(PI, square(d.r!)), mul(PI, mul(d.r!, d.g!)));
  } else if (s!.kind === "sphere") {
    out.V = xscale(mul(PI, mul(square(d.r!), d.r!)), 4 / 3);
    out.A = xscale(mul(PI, square(d.r!)), 4);
  } else {
    // frustum, hemisphere, stairs, polyhedron (ADR 0068)
    out.V = volumeOfSolid(s!);
    out.A = areaOfSolid(s!);
  }
  if (s!.bore !== undefined) {
    out.V = volumeOfSolid(s!);
    out.A = areaOfSolid(s!);
  }
  if (s!.liquid !== undefined) {
    out.level = s!.liquid.level;
    out.Vliquid = s!.liquid.volume;
  }
  return out;
}

/** The resolved solids of an input: names, positions and exact dimensions, derived ones included. For tests. */
export function resolveSolids(input: SolidInput): { name: string; kind: SolidKind; at: Vec3; dims: Dims; mesh?: Mesh; bore?: Bore; liquid?: Liquid; down?: boolean }[] {
  return resolveAll(input).map((s) => ({
    name: s.name,
    kind: s.kind,
    at: s.at,
    dims: s.dims,
    ...(s.mesh === undefined ? {} : { mesh: s.mesh }),
    ...(s.bore === undefined ? {} : { bore: s.bore }),
    ...(s.liquid === undefined ? {} : { liquid: s.liquid }),
    ...(s.down === undefined ? {} : { down: s.down }),
  }));
}

// ---- validation --------------------------------------------------------------

export function validateSolidInput(raw: Record<string, unknown>): void {
  const path = "solid";
  v.optionalString(raw, "title", path);
  v.optionalString(raw, "unit", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  if (raw.camera !== undefined && typeof raw.camera !== "string") {
    const o = v.object(raw.camera, `${path}.camera`);
    v.optionalEnum(o, "kind", `${path}.camera`, ["cavalier", "isometric", "orthographic"]);
    if (o.kind === undefined) throw new SpecError(`${path}.camera.kind is required`);
    if (o.kind === "orthographic") {
      v.requiredNumber(o, "azimuth", `${path}.camera`);
      v.requiredNumber(o, "elevation", `${path}.camera`);
    }
  } else if (raw.camera !== undefined) v.optionalEnum(raw, "camera", path, ["cavalier", "isometric", "orthographic"]);
  v.nonEmptyArray(raw, "solids", path, "solids");
  // References, arithmetic and every refusal are exercised by building the
  // figure: one implementation of the rules, not a shadow copy.
  expandSolid(raw as unknown as SolidInput);
}

