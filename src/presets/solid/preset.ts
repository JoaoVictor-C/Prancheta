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
import { GeometryError, add, lerp, normalize, sub as vsub } from "../../geometry/vec.ts";
import type { Vec2, Vec3 } from "../../geometry/vec.ts";
import { facesViewer, makeCamera, orthographicCamera, project, projectDirection } from "../../geometry/projection.ts";
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
import { PI, add as xadd, equalsText, mul, print, rat, scale as xscale, sqrt as xsqrt, square, sub as xsub, valueOf, approx } from "./exact.ts";
import type { Exact } from "./exact.ts";

// ---- input ------------------------------------------------------------------

export type SolidKind = "cube" | "box" | "prism" | "pyramid" | "cylinder" | "cone" | "sphere";
export const SOLID_KINDS: readonly SolidKind[] = ["cube", "box", "prism", "pyramid", "cylinder", "cone", "sphere"];

export type ShowItem = "edge" | "dimensions" | "height" | "radius" | "slant" | "baseApothem" | "spaceDiagonal" | "faceDiagonal" | "equator";
export type ReadingItem = "volume" | "area" | "measures";

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
};

export type SolidInput = {
  title?: string;
  locale?: Locale;
  /** A unit of length printed after every measure ("cm"): areas get ², volumes ³. */
  unit?: string;
  /** Default: cavalier for polyhedra alone; orthographic when a round solid is present (ADR 0046). */
  camera?: CameraSpec;
  solids: SolidDef[];
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
};
const READINGS: readonly ReadingItem[] = ["volume", "area", "measures"];

const WORD: Record<SolidKind, string> = {
  cube: "Cubo",
  box: "Paralelepípedo",
  prism: "Prisma",
  pyramid: "Pirâmide",
  cylinder: "Cilindro",
  cone: "Cone",
  sphere: "Esfera",
};

// ---- palette and sizes -------------------------------------------------------------

const PAPER = "#FCFBF7";
const SOLID_COLOURS = ["#181B21", "#1D4E89", "#2F6B3A"];
const ACCENT = "#9A3409";
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
};

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

const DERIVED_KEYS = ["at", "edge", "width", "depth", "height", "radius", "slant", "sides"] as const;

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

    const relation = def.inscribedIn !== undefined ? "inscribedIn" : def.circumscribes !== undefined ? "circumscribes" : null;
    if (def.inscribedIn !== undefined && def.circumscribes !== undefined) throw new SpecError(`${path} cannot be both inscribedIn and circumscribes`);
    if (relation !== null) {
      for (const k of DERIVED_KEYS) {
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
      } else if (relation === "circumscribes" && kind === "sphere" && (T.kind === "cube" || T.kind === "box")) {
        const [w, d, h] = T.kind === "cube" ? [T.dims.a!, T.dims.a!, T.dims.a!] : [T.dims.w!, T.dims.d!, T.dims.h!];
        dims.r = xscale(xsqrt(xadd(xadd(square(w), square(d)), square(h))), 1 / 2);
        at = add(T.at, [0, 0, valueOf(h) / 2]);
        derivation = T.kind === "cube" ? `circunscrita ao cubo: r = a√3/2` : `circunscrita ao paralelepípedo: r = D/2`;
      } else {
        throw new SpecError(
          `${path}: a ${kind} ${relation === "inscribedIn" ? "inscribed in" : "circumscribing"} a ${T.kind} is not offered -- ` +
            `inscribedIn: a sphere in a cube or equilateral cylinder, a cone in a cylinder; circumscribes: a sphere round a cube or box`,
        );
      }
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
      dims.r = positive(o, "radius", path);
      dims.h = positive(o, "height", path);
    } else if (kind === "cone") {
      dims.r = positive(o, "radius", path);
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

    const show = def.show ?? [];
    if (!Array.isArray(show)) throw new SpecError(`${path}.show must be an array`);
    show.forEach((s, k) => {
      if (!SHOW_BY_KIND[kind].includes(s)) {
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

    const r: Resolved = { index: i, path, name, kind, def, at, dims, colour, ...(derivation === undefined ? {} : { derivation }) };
    visiting.delete(i);
    done.set(i, r);
    return r;
  };
  return raws.map((_, i) => resolve(i));
}

/** The default camera (ADR 0046): the textbook's cavalier view for polyhedra; an orthographic view -- round rims as level ellipses, a sphere's outline a true circle -- once a round solid is in the figure. */
export function defaultCamera(kinds: readonly SolidKind[]): Camera {
  const round = kinds.filter((k) => k === "cylinder" || k === "cone" || k === "sphere").length;
  if (round === 0) return makeCamera("cavalier");
  if (round === kinds.length) return orthographicCamera(0, 20);
  return orthographicCamera(30, 20);
}

// ---- the model of one solid, in R³ ------------------------------------------------

/** The polyhedron a resolved solid is, or null for a round one. */
export function polyhedronOf(s: { kind: SolidKind; at: Vec3; dims: Dims }): Polyhedron | null {
  const { kind, at, dims } = s;
  if (kind === "cube") return prism(rectangle(at, valueOf(dims.a!), valueOf(dims.a!)), valueOf(dims.a!));
  if (kind === "box") return prism(rectangle(at, valueOf(dims.w!), valueOf(dims.d!)), valueOf(dims.h!));
  if (kind === "prism") return prism(regularPolygon(at, dims.n!, valueOf(dims.a!)), valueOf(dims.h!));
  if (kind === "pyramid") return pyramid(regularPolygon(at, dims.n!, valueOf(dims.a!)), add(at, [0, 0, valueOf(dims.h!)]));
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
  measure?: { dir3: Vec3; text: string; labelColour: string; solid: number; symbol: string | null; reading: string };
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
    camera = input.camera === undefined ? defaultCamera(solids.map((s) => s.kind)) : makeCamera(input.camera);
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

  for (const s of solids) {
    const k = s.index;
    const show = new Set((s.def.show ?? []).filter((item) => answers || isGiven(s, item)));
    const want = new Set(answers ? s.def.readings ?? [] : []);
    const prefix = solids.length > 1 ? `${s.name}: ` : "";
    const lines: string[] = [];
    const pagePts: Vec2[] = [];
    const size = Math.max(...[s.dims.a, s.dims.w, s.dims.d, s.dims.h, s.dims.r ? xscale(s.dims.r, 2) : undefined].filter((x): x is Exact => x !== undefined).map(valueOf));
    const ra = 0.075 * size;
    const labelsOn = s.def.labels !== undefined && s.def.labels !== false;
    const given = Array.isArray(s.def.labels) ? s.def.labels : null;
    const construction = (id: string, a: Vec3, b: Vec3, hidden: boolean, symbol: string, value: Exact): void => {
      strokes.push({ id, pts: [P(a), P(b)], colour: ACCENT, width: hidden ? W_HIDDEN + 0.2 : W_CONSTRUCTION, dashed: hidden, layer: 2, measure: { dir3: vsub(b, a), text: measureText(symbol, value), labelColour: ACCENT, solid: k, symbol, reading: `${prefix}${measureText(symbol, value)}` } });
    };

    const poly = polyhedronOf(s);
    if (poly !== null) {
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
      if ((s.kind === "prism" || s.kind === "pyramid") && show.has("edge")) claim(0, 1, "ℓ", s.dims.a!);
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
        if (facesViewer(camera, [0, 0, 1])) fills.push({ id: `s${k}-top-fill`, pts: arcPoints(view.top, 0, 2 * Math.PI), colour: `${s.colour}14` });
        if (firstRim(O, r)) rimStrokes(strokes, `s${k}-bottom`, view.bottom, view.bottomArcs, s.colour);
        if (firstRim(add(O, [0, 0, h]), r)) rimStrokes(strokes, `s${k}-top`, view.top, view.topArcs, s.colour);
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
        if (show.has("radius")) construction(`s${k}-radius`, Otop, view.top.point3(right), !facesViewer(camera, [0, 0, 1]), "r", s.dims.r!);
        if (labelsOn) {
          const [n0, n1] = given ?? ["O", "O′"];
          if (given !== null && given.length !== 2) throw new SpecError(`${s.path}.labels names ${given.length} point(s); a cylinder names its two base centres`);
          places.push({ id: `s${k}-O`, p: P(O), text: n0!, colour: s.colour, dot: true, solid: k });
          places.push({ id: `s${k}-O2`, p: P(Otop), text: n1!, colour: s.colour, dot: true, solid: k });
        }
        const { r: R, h: H } = s.dims as Required<Pick<Dims, "r" | "h">>;
        if (want.has("volume")) lines.push(line("V", "πr²h", mul(PI, mul(square(R), H)), 3));
        if (want.has("area")) lines.push(`${line("A", "2πr² + 2πrh", xadd(xscale(mul(PI, square(R)), 2), xscale(mul(PI, mul(R, H)), 2)), 2)} (área total)`);
      } else if (s.kind === "cone") {
        const h = valueOf(s.dims.h!);
        const view = coneView(camera, O, r, h);
        const all = [...arcPoints(view.base, 0, 2 * Math.PI), P(view.apex)];
        pagePts.push(...all);
        fills.push({ id: `s${k}-fill`, pts: convexHull(all), colour: `${s.colour}1A` });
        if (firstRim(O, r)) rimStrokes(strokes, `s${k}-base`, view.base, view.baseArcs, s.colour);
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
    for (const p of places.filter((q) => q.solid === k)) if (p.text !== "") nameOnce(p.text, s.path);
    if (s.derivation !== undefined && !want.has("measures")) lines.unshift(s.derivation.split(":")[0]!);
    readings.push(...lines.map((l) => `${prefix}${l}`));
    solidPage.push(pagePts);
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
  const largest = Math.max(...solids.map((s) => Math.max(...[s.dims.a, s.dims.w, s.dims.d, s.dims.h, s.dims.r ? xscale(s.dims.r, 2) : undefined].filter((x): x is Exact => x !== undefined).map(valueOf))));
  const decade = largest >= 1 && largest < 30 ? 1 : 10 ** Math.floor(Math.log10(largest));
  const unitPx = fitUnits(uMax - uMin, vMax - vMin, { targetWidth: TARGET, targetHeight: TARGET, equal: true, maxUnit: MAX_UNIT / decade, minUnit: MIN_UNIT / decade }).xUnit;
  const board0 = new Board(1, 1, PAPER);
  const captionStyle = { size: 13, colour: SOFT };
  const captionW = Math.max(0, ...readings.map((r) => board0.extent(r, captionStyle).w));
  const plotW = Math.ceil((uMax - uMin) * unitPx + 2 * PAD);
  const width = Math.max(plotW, Math.ceil(captionW + 48));
  const plotH = Math.ceil((vMax - vMin) * unitPx + 2 * PAD);
  const height = plotH + (readings.length > 0 ? readings.length * CAPTION_LINE_H + 18 : 0);
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
  const measured: { id: string; a: Point; b: Point; text: string; colour: string; solid: number; outline: boolean; symbol: string | null; reading: string }[] = [];
  const ordered = [...strokes].sort((a, b) => a.layer - b.layer);
  for (const s of ordered) {
    const pts = s.pts.map(page);
    const style = { ...(s.dashed ? { lineStyle: "dashed" as const } : {}) };
    if (s.measure !== undefined) {
      const a = pts[0]!;
      const b = pts[1]!;
      const px = Math.hypot(b.x - a.x, b.y - a.y);
      const shrink = Math.hypot(...projectDirection(camera, normalize(s.measure.dir3)));
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
        measured.push({ id: s.id, a, b, text: s.measure.text, colour: s.measure.labelColour, solid: s.measure.solid, outline: s.layer === 1, symbol: s.measure.symbol, reading: s.measure.reading });
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
        for (const t of TS) {
          for (const side of [outSide, -outSide]) {
            spots.push({ x: m.a.x + dir.x * len * t + nrm.x * side * (clearance + extra), y: m.a.y + dir.y * len * t + nrm.y * side * (clearance + extra) });
          }
        }
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
      if (short.cost === 0) {
        pick = short;
        const head = m.reading.slice(0, m.reading.indexOf(`${m.symbol} `) + m.symbol.length + 1);
        if (!readings.some((l) => l.startsWith(head))) needs.push(m.reading);
      }
    }
    placer.reserve({ x: pick.centre.x - pick.w / 2, y: pick.centre.y - pick.h / 2, width: pick.w, height: pick.h });
    // A length printed as a plain fraction ("5/3") reads to the length check
    // as 5 in the unit "/3"; such a label names its run's midpoint instead,
    // and the length goes unmeasured (ADR 0046, "The cost").
    const plainFraction = pick.text.includes("/") && !pick.text.includes("√");
    board.label(pick.text, pick.centre.x, pick.centre.y, {
      ...style,
      width: pick.w,
      id: `${m.id}-label`,
      ...(plainFraction ? { annotatesPlace: mid } : { annotates: m.id }),
    });
  }

  // ---- the readings panel ----
  readings.forEach((text, i) => {
    board.label(text, 24 + (width - 48) / 2, plotH + 12 + i * CAPTION_LINE_H, { ...captionStyle, align: "start", width: width - 48, id: `reading-${i}`, claim: false, freeStanding: true });
  });

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
  } else {
    out.V = xscale(mul(PI, mul(square(d.r!), d.r!)), 4 / 3);
    out.A = xscale(mul(PI, square(d.r!)), 4);
  }
  return out;
}

/** The resolved solids of an input: names, positions and exact dimensions, derived ones included. For tests. */
export function resolveSolids(input: SolidInput): { name: string; kind: SolidKind; at: Vec3; dims: Dims }[] {
  return resolveAll(input).map((s) => ({ name: s.name, kind: s.kind, at: s.at, dims: s.dims }));
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

