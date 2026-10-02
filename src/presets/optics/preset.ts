/**
 * optics -- geometric optics as Ramalho, Halliday and the ENEM ask for it:
 * thin lenses and spherical (or plane) mirrors with the image they form, and
 * refraction / reflection at a plane interface.
 *
 * Every drawn position and every printed number is COMPUTED from the input,
 * never typed:
 *
 *  - **lens / mirror** -- the focal length f (a magnitude; the KIND says the
 *    sign: converging lens and concave mirror f > 0, diverging lens and
 *    convex mirror f < 0), the object distance p and the object height o.
 *    The image comes from Gauss, 1/f = 1/p + 1/p′, with the Brazilian sign
 *    convention (real: p′ > 0; virtual: p′ < 0) and A = −p′/p = i/o. The
 *    principal rays are then CONSTRUCTED the way a student does with a ruler
 *    (parallel → through the focus, through the focus → parallel, through the
 *    optical centre or the vertex), each from its own rule and never aimed
 *    at the computed image; the image arrow sits where Gauss says, and a
 *    test decodes the drawn rays back and checks they meet at its tip.
 *    A virtual image is drawn dashed together with the backward extensions
 *    of the rays that make it. An object at the focus sends its rays out
 *    parallel: the image is improper (at infinity) and is stated, not drawn.
 *  - **interface** -- n₁, n₂ and the angle of incidence θ₁. The refracted
 *    angle is Snell's, n₁ sin θ₁ = n₂ sin θ₂; past the critical angle
 *    θc = asin(n₂/n₁) there is no refracted ray, only total internal
 *    reflection, and the figure says so with the numbers.
 *
 * Mirrors are traced in the PARAXIAL way school texts trace them: a ray
 * reflects at the tangent plane through the vertex. The arc drawn is the true
 * circle of radius 2|f| about C, and each ray is cut where ITS OWN LINE meets
 * that arc, so no ray is bent to fit the drawing and the arc's sagitta never
 * moves a line off the image.
 *
 * Every angle label is the bare value ("30°", "22,1°") on its own arc, a
 * `sweep` connector, so `sweep-matches-its-label` measures it against the
 * angle really drawn; the panel names them (θ₁ = 30°, θ₂ ≈ 22,1°).
 */

import type { Block, Connector, FigureSpec, Point, Scene } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { LOCALES, MINUS, formatNumber } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import { constantValue } from "../../math/expr.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";
import type { LabelOptions } from "../function-graph/board.ts";
import { Placer, aroundPoint, besideRun } from "../construction/place.ts";
import type { Claim } from "../construction/place.ts";
import { distanceToPolyline, rectAt } from "../../geometry/hit.ts";
import { niceStep } from "../shared/scale.ts";
import { layoutPanel } from "../shared/panel.ts";
import type { Panel } from "../shared/panel.ts";
import { tidy } from "../../math/numeric.ts";
import type { Printed } from "../../locale/write.ts";

// ---- input ---------------------------------------------------------------------

export type RayKind = "parallel" | "focal" | "centre" | "vertex";
export const RAY_KINDS: readonly RayKind[] = ["parallel", "focal", "centre", "vertex"];

export type OpticsShow = { antiprincipal?: boolean; names?: boolean };

export type LensInput = {
  kind: "lens";
  lens: "converging" | "diverging";
  /** Focal length magnitude, cm. */
  f: number | string;
  /** Object distance, cm (a real object: p > 0). */
  p: number | string;
  /** Object height, cm. Default: a third of the smaller of p and f. */
  o?: number | string;
  rays?: RayKind[];
  show?: OpticsShow;
};

export type MirrorInput = {
  kind: "mirror";
  mirror: "concave" | "convex" | "plane";
  /** Focal length magnitude, cm; absent for a plane mirror. */
  f?: number | string;
  p: number | string;
  o?: number | string;
  rays?: RayKind[];
  show?: OpticsShow;
};

export type Medium = { name: string; n?: number | string };

export type InterfaceInput = {
  kind: "interface";
  n1: Medium;
  n2: Medium;
  /** Angle of incidence, degrees, 0 ≤ θ₁ < 90. */
  theta1: number | string;
  /** Draw the reflected ray. Default true. */
  reflected?: boolean;
};

/** `answers: false` draws the givens only: no rays, no image, no computed panel line. Default true. */
export type OpticsInput = { title?: string; locale?: Locale; answers?: boolean } & (LensInput | MirrorInput | InterfaceInput);

// ---- tables ---------------------------------------------------------------------

/** Indices a textbook problem names by medium; used only when `n` is omitted. */
export const KNOWN_INDICES: Record<string, number> = {
  ar: 1,
  vácuo: 1,
  vacuo: 1,
  água: 1.33,
  agua: 1.33,
  gelo: 1.31,
  álcool: 1.36,
  alcool: 1.36,
  acrílico: 1.5,
  acrilico: 1.5,
  vidro: 1.5,
  diamante: 2.42,
};

// ---- palette ---------------------------------------------------------------------

const PAPER = "#FCFBF7";
const INK = "#181B21";
const SOFT = "#4E5763";
const AXIS = "#7A8494";
const TINT = "#E6F0F9";
const PARALLEL = "#1F5FA8";
const FOCAL = "#1E7A46";
const CENTRE = "#8A3FA0";
const IMAGE = "#B3400C";
const IMAGE_TEXT = "#9A3508";
const REFLECT = "#6B3FA0";
const HATCH = "#5B6675";

const RAY_COLOUR: Record<RayKind, string> = { parallel: PARALLEL, focal: FOCAL, centre: CENTRE, vertex: CENTRE };
const RAY_TEXT: Record<RayKind, string> = { parallel: PARALLEL, focal: "#17603A", centre: CENTRE, vertex: CENTRE };

const EPS = 1e-9;
const PANEL_FONT = 14;
const PANEL_LINE_H = 26;

// ---- small pure helpers -------------------------------------------------------------

const fmtInt = (n: number): string => String(n).replace("-", MINUS);

/** A number as printed on the figure: exact when short, else hundredths; `exact` says which. */
export function written(x: number, locale: Locale = "pt-BR", decimals = 2): Printed {
  // A value that IS a short decimal is printed whole and exact: A = 7,5/20
  // is 0,375, not "≈ 0,38". Only a value with no terminating form within
  // four places is rounded to `decimals` and marked approximate.
  for (let d = decimals; d <= Math.max(decimals, 4); d += 1) {
    const scale = 10 ** d;
    const rounded = Math.round(x * scale) / scale;
    if (Math.abs(x - rounded) <= 1e-9 * Math.max(1, Math.abs(x))) return { text: formatNumber(rounded, locale, { fractions: false }), exact: true };
  }
  return { text: formatNumber(x, locale, { decimals }), exact: false };
}

/** "= 15" or "≈ 13,33" as one piece, for a panel line. */
const eq = (x: number, locale: Locale, decimals = 2): string => {
  const w = written(x, locale, decimals);
  return `${w.exact ? "=" : "≈"} ${w.text}`;
};

/** Degrees as printed: an integer when it is one, else one decimal (two if one hides the difference). */
export function degreesText(deg: number, locale: Locale = "pt-BR"): Printed {
  const r = Math.round(deg);
  if (Math.abs(deg - r) < 1e-6) return { text: fmtInt(r), exact: true };
  const one = Math.round(deg * 10) / 10;
  if (Math.abs(deg - one) < 1e-9) return { text: formatNumber(one, locale, { decimals: 1 }), exact: true };
  const text = formatNumber(deg, locale, { decimals: 1 });
  if (Number(deg.toFixed(1)) === r) return { text: formatNumber(deg, locale, { decimals: 2 }), exact: false };
  return { text, exact: false };
}

function numberOf(raw: unknown, path: string): number {
  if (typeof raw === "number") return v.finite(raw, path);
  if (typeof raw === "string") {
    try {
      return constantValue(raw.replace(",", "."));
    } catch (e) {
      throw new SpecError(`${path}: ${JSON.stringify(raw)} is not a number or a constant expression (${(e as Error).message})`);
    }
  }
  throw new SpecError(`${path} must be a number (or an expression string like "10/3"), got ${JSON.stringify(raw)}`);
}

// ---- the physics ---------------------------------------------------------------------

export type Gauss =
  | { improper: true; f: number; p: number }
  | { improper: false; f: number; p: number; pPrime: number; A: number };

/**
 * Gauss's equation with the school sign convention. `f` is signed (converging
 * lens, concave mirror > 0). An object AT the focus (p = f) has no finite
 * image: `improper`.
 */
export function gauss(f: number, p: number): Gauss {
  if (Math.abs(p - f) <= EPS * Math.max(1, Math.abs(f), Math.abs(p))) return { improper: true, f, p };
  const pPrime = tidy((f * p) / (p - f));
  return { improper: false, f, p, pPrime, A: tidy(-pPrime / p) };
}

export type Nature = { real: boolean; upright: boolean; size: "maior" | "menor" | "igual" };

export function natureOf(g: { pPrime: number; A: number }): Nature {
  const a = Math.abs(g.A);
  return {
    real: g.pPrime > 0,
    upright: g.A > 0,
    size: Math.abs(a - 1) <= 1e-9 ? "igual" : a > 1 ? "maior" : "menor",
  };
}

export function natureText(n: Nature): string {
  return `imagem ${n.real ? "real" : "virtual"}, ${n.upright ? "direita" : "invertida"}, ${n.size}`;
}

export type Snell =
  | { total: false; theta2: number; sin2: number }
  | { total: true; sin2: number };

/** n₁ sin θ₁ = n₂ sin θ₂ (degrees). `total` when sin θ₂ would exceed 1. */
export function snell(n1: number, n2: number, theta1Deg: number): Snell {
  const s = (n1 * Math.sin((theta1Deg * Math.PI) / 180)) / n2;
  if (s > 1 + 1e-12) return { total: true, sin2: s };
  const clamped = Math.min(1, s);
  return { total: false, theta2: (Math.asin(clamped) * 180) / Math.PI, sin2: clamped };
}

/** The critical angle (degrees) for n₁ > n₂, else null. */
export function criticalAngle(n1: number, n2: number): number | null {
  return n1 > n2 ? (Math.asin(n2 / n1) * 180) / Math.PI : null;
}

// ---- geometry ------------------------------------------------------------------------

type P = { x: number; y: number };

const sgn = (x: number): number => (x < 0 ? -1 : 1);
const dist = (a: P, b: P): number => Math.hypot(a.x - b.x, a.y - b.y);

/** The intersection of the ray P0 + t·d (t ≥ 0 preferred near `near`) with a circle; null when it misses. */
function circleHit(p0: P, d: P, c: P, r: number, near: number): P | null {
  const fx = p0.x - c.x;
  const fy = p0.y - c.y;
  const a = d.x * d.x + d.y * d.y;
  const b = 2 * (fx * d.x + fy * d.y);
  const k = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * k;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const ts = [(-b - s) / (2 * a), (-b + s) / (2 * a)];
  const t = Math.abs(ts[0]! - near) <= Math.abs(ts[1]! - near) ? ts[0]! : ts[1]!;
  return { x: p0.x + t * d.x, y: p0.y + t * d.y };
}

/** The largest t ≥ 0 with S + t·d inside the box (cm). */
function reach(s: P, d: P, box: { xlo: number; xhi: number; ylo: number; yhi: number }): number {
  let t = Infinity;
  if (d.x > 1e-12) t = Math.min(t, (box.xhi - s.x) / d.x);
  if (d.x < -1e-12) t = Math.min(t, (box.xlo - s.x) / d.x);
  if (d.y > 1e-12) t = Math.min(t, (box.yhi - s.y) / d.y);
  if (d.y < -1e-12) t = Math.min(t, (box.ylo - s.y) / d.y);
  return Number.isFinite(t) ? Math.max(0, t) : 0;
}

// ---- the figure's own ink ------------------------------------------------------------------

type Piece = { id: string; pts: P[]; dashed: boolean; colour: string; width: number; head?: { at: number; sign: 1 | -1 } };

type Prepared = {
  kind: "lens" | "mirror";
  variant: string;
  f: number | null; // signed; null for a plane mirror
  p: number;
  o: number;
  g: Gauss;
  rays: RayKind[];
  explicitRays: boolean;
  show: Required<OpticsShow>;
};

function prepare(input: OpticsInput & { kind: "lens" | "mirror" }): Prepared {
  const path = `optics.${input.kind}`;
  const plane = input.kind === "mirror" && input.mirror === "plane";
  let f: number | null = null;
  if (!plane) {
    if (input.f === undefined) throw new SpecError(`${path}: \`f\` (the focal length in cm, a positive magnitude) is required${input.kind === "mirror" ? " for a spherical mirror; a plane mirror has none" : ""}`);
    const mag = numberOf(input.f, `${path}.f`);
    if (!(mag > 0)) throw new SpecError(`${path}.f must be a positive magnitude in cm (the ${input.kind === "lens" ? "lens" : "mirror"} kind gives the sign), got ${mag}`);
    const positive = input.kind === "lens" ? input.lens === "converging" : input.mirror === "concave";
    f = positive ? mag : -mag;
  } else if (input.f !== undefined) {
    throw new SpecError(`${path}.f: a plane mirror has no focal length; drop \`f\``);
  }
  const p = numberOf(input.p, `${path}.p`);
  if (!(p > 0)) throw new SpecError(`${path}.p must be a positive distance in cm (a real object), got ${p}`);
  let o: number;
  if (input.o !== undefined) {
    o = numberOf(input.o, `${path}.o`);
    if (!(o > 0)) throw new SpecError(`${path}.o must be a positive height in cm, got ${o}`);
  } else {
    const ref = f === null ? p : Math.min(p, Math.abs(f));
    o = Math.max(0.5, Math.round((ref / 3) * 2) / 2);
  }
  const g: Gauss = f === null ? { improper: false, f: Infinity, p, pPrime: -p, A: 1 } : gauss(f, p);
  const rays = input.rays ?? (input.kind === "lens" ? ["parallel", "focal", "centre"] : plane ? ["centre", "centre"] : input.kind === "mirror" && input.mirror === "convex" ? ["parallel", "focal", "vertex", "centre"] : ["parallel", "focal", "centre", "vertex"]);
  if (!plane) {
    if (rays.length < 2) throw new SpecError(`${path}.rays needs at least two of ${RAY_KINDS.join(", ")} -- one ray does not locate an image`);
    const seen = new Set<string>();
    rays.forEach((r, i) => {
      if (!RAY_KINDS.includes(r)) throw new SpecError(`${path}.rays[${i}] must be one of ${RAY_KINDS.join(", ")}, got ${JSON.stringify(r)}`);
      if (input.kind === "lens" && r === "vertex") throw new SpecError(`${path}.rays[${i}]: a lens has an optical centre, not a vertex -- use "centre"`);
      if (seen.has(r)) throw new SpecError(`${path}.rays: "${r}" is listed twice`);
      seen.add(r);
    });
  }
  const show: Required<OpticsShow> = {
    antiprincipal: input.show?.antiprincipal ?? (input.kind === "lens" && input.lens === "converging"),
    names: input.show?.names ?? true,
  };
  return { kind: input.kind, variant: input.kind === "lens" ? input.lens : input.mirror, f, p, o, g, rays, explicitRays: input.rays !== undefined, show };
}

/** What the figure would need to show is too far from the element: refuse rather than draw a lie. */
function farLimit(pr: Prepared): number {
  return 5 * Math.max(pr.p, pr.f === null ? 0 : 2 * Math.abs(pr.f));
}

function expandOptical(input: OpticsInput & { kind: "lens" | "mirror" }): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const answers = input.answers !== false;
  const pr = prepare(input);
  const isMirror = pr.kind === "mirror";
  const plane = pr.f === null;
  const f = pr.f;
  const { p, o, g } = pr;

  // ---- the image (cm; x to the right, y up; the element at x = 0) ---------------------
  const finite = !g.improper;
  const pPrime = g.improper ? 0 : g.pPrime;
  const A = g.improper ? 0 : g.A;
  const iHeight = tidy(A * o);
  const xImage = isMirror ? -pPrime : pPrime;
  if (finite && Math.abs(pPrime) > farLimit(pr)) {
    throw new SpecError(
      `optics: the image is at p′ = ${formatNumber(pPrime, "en", { decimals: 1 })} cm (A = ${formatNumber(A, "en", { decimals: 2 })}), too far from the ${pr.kind} to draw to scale beside the object -- move p away from f (p = ${formatNumber(p, "en")}, f = ${f === null ? "∞" : formatNumber(f, "en")})`,
    );
  }
  const imageTip: P | null = finite ? { x: xImage, y: iHeight } : null;
  const tip: P = { x: -p, y: o };

  // ---- the rays' rules, in cm --------------------------------------------------------------
  type Rule = { kind: RayKind; yh: number; out: P } | { kind: "centre-mirror"; yh: number };
  const rules: Rule[] = [];
  const limit = 2 * Math.max(o, Math.abs(iHeight));
  if (!plane) {
    const ff = f as number;
    for (const kind of pr.rays) {
      if (kind === "parallel") {
        rules.push({ kind, yh: o, out: { x: isMirror ? -Math.abs(ff) : Math.abs(ff), y: -sgn(ff) * o } });
      } else if (kind === "focal") {
        if (Math.abs(p - ff) <= EPS * Math.max(1, p)) continue; // the ray runs along the focal plane and never meets the element
        const yh = (o * ff) / (ff - p);
        if (Math.abs(yh) > limit) continue;
        rules.push({ kind, yh, out: { x: isMirror ? -1 : 1, y: 0 } });
      } else if (kind === "centre" && !isMirror) {
        rules.push({ kind, yh: 0, out: { x: p, y: -o } });
      } else if (kind === "vertex") {
        rules.push({ kind, yh: 0, out: { x: -p, y: -o } });
      } else if (kind === "centre" && isMirror) {
        const Cm = { x: -2 * ff, y: 0 };
        const towardM = Cm.x > tip.x ? { x: Cm.x - tip.x, y: Cm.y - tip.y } : { x: tip.x - Cm.x, y: tip.y - Cm.y };
        const hitM = circleHit(tip, towardM, Cm, 2 * Math.abs(ff), 1);
        if (hitM === null || Math.abs(hitM.y) > limit || Math.abs(hitM.y) > 0.92 * 2 * Math.abs(ff)) continue;
        rules.push({ kind: "centre-mirror", yh: hitM.y });
      }
    }
    if (!pr.explicitRays && isMirror) rules.splice(3);
  }

  // ---- the frame: what must be in view ------------------------------------------------------
  const keys: number[] = [-p, 0];
  if (f !== null) keys.push(-f, f);
  if (f !== null && pr.show.antiprincipal && !isMirror) keys.push(-2 * f, 2 * f);
  if (f !== null && isMirror) keys.push(-2 * f);
  if (imageTip !== null && answers) keys.push(imageTip.x);
  const hits = answers ? rules.map((r) => Math.abs(r.yh)) : [];
  const iShown = answers ? Math.abs(iHeight) : 0;
  const plainHalf = Math.max(1.7 * o, 1.6 * iShown, 1.25 * Math.max(0, ...hits));
  const mirrorR = f === null ? Infinity : 2 * Math.abs(f);
  const elementHalf = Math.min(plainHalf, 0.92 * mirrorR * (isMirror ? 1 : 1e9));
  const vhalf = Math.max(elementHalf * 1.08, 1.3 * o, 1.3 * iShown);
  const span = Math.max(...keys) - Math.min(...keys);
  const pad = 0.1 * span + 0.6;
  const xlo = Math.min(...keys) - pad;
  const xhi = Math.max(...keys) + pad;

  const WMAX = 900;
  const SIDE = 36;
  let unit = Math.min((WMAX - 2 * SIDE) / (xhi - xlo), 190 / vhalf, 30);
  if (unit >= 8) unit = Math.floor(unit);
  const width = Math.round(Math.min(WMAX, Math.max(620, (xhi - xlo) * unit + 2 * SIDE)));
  const plotH = Math.round(Math.max(280, 2 * vhalf * unit + 80));
  const x0 = (width - (xhi - xlo) * unit) / 2 - xlo * unit;
  const y0 = plotH / 2;
  const X = (x: number): number => x0 + x * unit;
  const Y = (y: number): number => y0 - y * unit;
  const at = (q: P): Point => ({ x: X(q.x), y: Y(q.y) });
  const box = { xlo: (14 - x0) / unit, xhi: (width - 14 - x0) / unit, ylo: (y0 - (plotH - 12)) / unit, yhi: (y0 - 12) / unit };

  // ---- the pieces of every ray ----------------------------------------------------------------
  const pieces: Piece[] = [];
  const centreOfCurvature: P | null = isMirror && f !== null ? { x: -2 * f, y: 0 } : null;
  const arcAtHeight = (y: number): P => {
    const ff = f as number;
    return { x: -2 * ff + sgn(ff) * Math.sqrt(Math.max(0, mirrorR * mirrorR - y * y)), y };
  };
  const halfMirror = Math.min(elementHalf, 0.92 * mirrorR);

  const piece = (id: string, pts: P[], colour: string, o2: { dashed?: boolean; width?: number; head?: { at: number; sign: 1 | -1 } } = {}): void => {
    if (pts.length < 2 || dist(pts[0]!, pts[pts.length - 1]!) < 1e-9) return;
    pieces.push({ id, pts, colour, dashed: o2.dashed ?? false, width: o2.width ?? 1.9, ...(o2.head === undefined ? {} : { head: o2.head }) });
  };
  const farEnd = (s: P, d: P): P => {
    const t = reach(s, d, box);
    return { x: s.x + t * d.x, y: s.y + t * d.y };
  };

  if (plane) {
    // Plane mirror: rays from the tip to three heights on the mirror; each reflected ray keeps its y-direction and reverses x.
    const image = imageTip as P;
    const heights = [0.55 * o, 0, -0.55 * o];
    heights.forEach((yh, k) => {
      const id = `ray-${k + 1}`;
      const hit: P = { x: 0, y: yh };
      const d: P = { x: -p, y: yh - o }; // reflected direction: incident (p, yh - o) with x reversed
      const colour = [PARALLEL, FOCAL, CENTRE][k]!;
      piece(`${id}-in`, [tip, hit], colour, { head: { at: 0.5, sign: 1 } });
      piece(`${id}-out`, [hit, farEnd(hit, d)], colour, { head: { at: 0.5, sign: 1 } });
      piece(`${id}-ext`, [hit, image], colour, { dashed: true, width: 1.5 });
    });
  } else {
    const ff = f as number;
    for (const rule of rules) {
      if (rule.kind === "centre-mirror") {
        const C = centreOfCurvature as P;
        const toward = C.x > tip.x ? { x: C.x - tip.x, y: C.y - tip.y } : { x: tip.x - C.x, y: tip.y - C.y };
        const Q = circleHit(tip, toward, C, mirrorR, 1) as P | null;
        if (Q === null || Math.abs(Q.y) > 0.92 * mirrorR) continue;
        if (Math.abs(Q.y) > limit) continue;
        piece("ray-centre-in", [tip, Q], CENTRE, { head: { at: 0.35, sign: 1 } });
        if (ff > 0) {
          // Reflected back along itself, the ray is real light the whole way:
          // through the object tip, through C, and on to a real image. It
          // runs to whichever of those is farthest from the mirror.
          const along = [tip, C, ...(imageTip !== null && imageTip.x < 0 ? [imageTip] : [])];
          const far = along.reduce((a, b) => (Math.hypot(b.x - Q.x, b.y - Q.y) > Math.hypot(a.x - Q.x, a.y - Q.y) ? b : a));
          piece("ray-centre-out", [far, Q], CENTRE, { head: { at: 0.3, sign: -1 } });
        } else {
          piece("ray-centre-out", [tip, Q], CENTRE, { head: { at: 0.65, sign: -1 } });
        }
        if (ff < 0) piece("ray-centre-hid", [Q, C], CENTRE, { dashed: true, width: 1.5 });
        if (imageTip !== null && imageTip.x > 0 && ff > 0) piece("ray-centre-ext", [Q, imageTip], CENTRE, { dashed: true, width: 1.5 });
        continue;
      }
      const id = `ray-${rule.kind}`;
      const colour = RAY_COLOUR[rule.kind];
      const plan: P = { x: 0, y: rule.yh };
      const dInc: P = { x: plan.x - tip.x, y: plan.y - tip.y };
      let sIn: P = plan;
      let sOut: P = plan;
      if (isMirror) {
        const C = centreOfCurvature as P;
        sIn = circleHit(tip, dInc, C, mirrorR, 1) ?? plan;
        sOut = circleHit(plan, rule.out, C, mirrorR, 0) ?? plan;
      }
      piece(`${id}-in`, [tip, sIn], colour, { head: { at: 0.5, sign: 1 } });
      // The focal ray's incident line passes through F; where F is not between the object and the element, show it.
      if (rule.kind === "focal") {
        const F: P = { x: -ff, y: 0 };
        if (ff > p) piece(`${id}-hid`, [F, tip], colour, { dashed: true, width: 1.5 });
        else if (ff < 0) piece(`${id}-hid`, [sIn, F], colour, { dashed: true, width: 1.5 });
      }
      if (imageTip === null) {
        piece(`${id}-out`, [sOut, farEnd(sOut, rule.out)], colour, { head: { at: 0.5, sign: 1 } });
      } else if (pPrime > 0) {
        piece(`${id}-out`, [sOut, imageTip], colour, { head: { at: 0.5, sign: 1 } });
      } else {
        piece(`${id}-out`, [sOut, farEnd(sOut, rule.out)], colour, { head: { at: 0.5, sign: 1 } });
        piece(`${id}-ext`, [sOut, imageTip], colour, { dashed: true, width: 1.5 });
      }
    }
  }

  // The rays and the image are what the exercise asks for.
  if (!answers) pieces.length = 0;

  // ---- draw ------------------------------------------------------------------------------
  const panelLines = answers ? opticalPanel(pr, g, iHeight, locale) : givensPanel(pr, locale);
  const barCm = niceStep(Math.max(1, 90 / unit), 1);
  const barPx = barCm * unit;
  const readingPanel = typesetPanel(panelLines, width - 2 * SIDE);
  // The scale bar belongs to the figure, so it sits ABOVE the panel: a sheet
  // that lifts the panel out of the drawing crops at the bar's foot (ADR 0062).
  const barRowY = plotH + 22;
  const panelTop = plotH + 46;
  const height = panelTop + readingPanel.height + 14;
  const board = new Board(width, height, PAPER);
  const placer = new Placer({ x: 10, y: 6, width: width - 20, height: plotH - 10 });
  const connectors: Connector[] = [];

  // Axis
  const axisA: Point = { x: 14, y: y0 };
  const axisB: Point = { x: width - 14, y: y0 };
  board.poly([axisA, axisB], { stroke: AXIS, width: 1.2, id: "axis" });
  placer.addInk("axis", [axisA, axisB]);

  // The element
  const elementId = "element";
  let elementTop: Point;
  let elementBottom: Point;
  const H = isMirror ? halfMirror : elementHalf;
  if (!isMirror) {
    elementTop = at({ x: 0, y: H });
    elementBottom = at({ x: 0, y: -H });
    board.poly([elementTop, elementBottom], { stroke: INK, width: 2.6, id: elementId });
    placer.addInk(elementId, [elementTop, elementBottom]);
    // Arrowheads: outward for a converging lens, inward for a diverging one.
    const w = 6.5;
    const h = 11;
    for (const s of [1, -1]) {
      const end = s === 1 ? elementTop : elementBottom;
      const pts: Point[] =
        (f as number) > 0
          ? [{ x: end.x - w, y: end.y + s * h }, end, { x: end.x + w, y: end.y + s * h }]
          : [{ x: end.x - w, y: end.y }, { x: end.x, y: end.y + s * h }, { x: end.x + w, y: end.y }];
      board.poly(pts, { stroke: INK, width: 2.2, id: `${elementId}-head${s === 1 ? "-top" : "-bottom"}` });
      placer.addInk(elementId, pts);
    }
  } else if (plane) {
    elementTop = at({ x: 0, y: H });
    elementBottom = at({ x: 0, y: -H });
    board.poly([elementTop, elementBottom], { stroke: INK, width: 2.6, id: elementId });
    placer.addInk(elementId, [elementTop, elementBottom]);
    hatch(board, placer, (y) => ({ x: 0, y }), H, at, unit);
  } else {
    const C = centreOfCurvature as P;
    const a = arcAtHeight(H);
    const b = arcAtHeight(-H);
    elementTop = at(a);
    elementBottom = at(b);
    const arcPts: Point[] = Array.from({ length: 41 }, (_, k) => at(arcAtHeight(H - (2 * H * k) / 40)));
    board.trace(arcPts, INK, 2.6, elementId);
    board.marks.push({
      id: elementId,
      from: elementTop,
      segments: [{ arc: elementBottom, centre: at(C) }],
      close: false,
      fill: "none",
      stroke: INK,
      strokeWidth: 2.6,
    });
    placer.addInk(elementId, arcPts);
    hatch(board, placer, arcAtHeight, H, at, unit);
  }

  // Rays
  for (const pc of pieces) {
    const pts = pc.pts.map(at);
    board.poly(pts, { stroke: pc.colour, width: pc.width, id: pc.id, ...(pc.dashed ? { lineStyle: "dashed" as const } : {}) });
    placer.addInk(pc.id, pts);
  }
  // Direction arrowheads, after the lines and before the labels.
  for (const pc of pieces) {
    if (pc.head === undefined || pc.dashed) continue;
    const a = at(pc.pts[0]!);
    const b = at(pc.pts[pc.pts.length - 1]!);
    const len = dist(a, b);
    if (len < 44) continue;
    const ux = ((b.x - a.x) / len) * pc.head.sign;
    const uy = ((b.y - a.y) / len) * pc.head.sign;
    const mx = a.x + (b.x - a.x) * pc.head.at;
    const my = a.y + (b.y - a.y) * pc.head.at;
    const tipPt = { x: mx + ux * 5, y: my + uy * 5 };
    const l = { x: mx - ux * 5 - uy * 3.6, y: my - uy * 5 + ux * 3.6 };
    const r = { x: mx - ux * 5 + uy * 3.6, y: my - uy * 5 - ux * 3.6 };
    const hid = `${pc.id}-head-${pc.head.at}`;
    board.poly([l, tipPt, r], { stroke: pc.colour, width: 1, fill: pc.colour, close: true, id: hid });
    placer.addInk(hid, [l, tipPt, r, l]);
  }

  // Object and image arrows
  const objBase = at({ x: -p, y: 0 });
  const objTip = at(tip);
  connectors.push({ id: "object", from: objBase, to: objTip, arrow: "end", stroke: INK, strokeWidth: 2.6 });
  board.trace([objBase, objTip], INK, 2.6, "object");
  placer.addInk("object", [objBase, objTip]);
  let imgBase: Point | null = null;
  let imgTipPx: Point | null = null;
  if (imageTip !== null && answers) {
    imgBase = at({ x: imageTip.x, y: 0 });
    imgTipPx = at(imageTip);
    if (dist(imgBase, imgTipPx) > 3) {
      connectors.push({
        id: "image",
        from: imgBase,
        to: imgTipPx,
        arrow: "end",
        stroke: IMAGE,
        strokeWidth: 2.6,
        ...(pPrime < 0 ? { lineStyle: "dashed" as const } : {}),
      });
      board.trace([imgBase, imgTipPx], IMAGE, 2.6, "image");
      placer.addInk("image", [imgBase, imgTipPx]);
    }
  }

  // Points on the axis
  type Named = { id: string; name: string; x: number };
  const named: Named[] = [];
  if (f !== null) {
    if (!isMirror) {
      named.push({ id: "F", name: "F", x: -f }, { id: "Fp", name: "F′", x: f });
      if (pr.show.antiprincipal) named.push({ id: "A", name: "A", x: -2 * f }, { id: "Ap", name: "A′", x: 2 * f });
    } else {
      named.push({ id: "F", name: "F", x: -f }, { id: "C", name: "C", x: -2 * f });
    }
  }
  if (isMirror) named.push({ id: "V", name: "V", x: 0 });
  else named.push({ id: "O", name: "O", x: 0 });

  const dots = named.map((n) => ({ ...n, c: at({ x: n.x, y: 0 }) }));
  for (const d of dots) {
    placer.addPlace(d.id, d.c);
    placer.addInk(`${d.id}-dot`, [d.c], true, { c: d.c, r: 3 });
  }

  // ---- labels, every piece of ink down ----------------------------------------------------------
  const put = (claim: Claim, text: string, o2: LabelOptions, spots: (w: number, h: number) => Point[]): Block => {
    const { w, h } = board.extent(text, o2);
    const best = placer.choose(claim, w, h, spots(w, h));
    const block = board.label(text, best.centre.x, best.centre.y, { ...o2, width: w });
    placer.commit(rectAt(best.centre, w, h));
    return block;
  };
  const bold = (colour: string, size = 13): LabelOptions => ({ size, weight: 700, colour });

  if (pr.show.names) {
    const nameOf = isMirror ? (plane ? "espelho plano" : `espelho ${pr.variant === "concave" ? "côncavo" : "convexo"}`) : `lente ${pr.variant === "converging" ? "convergente" : "divergente"}`;
    const top = at({ x: 0, y: H });
    const b1 = put({ kind: "element", id: elementId }, nameOf, bold(INK, 13), (w, h) => gridAround([elementTop, elementBottom], w, h, 70, (c) => (c.y > top.y ? 200 : 0)));
    b1.annotates = elementId;
  }

  // A point's name: as near the point as a clear spot allows, below the axis first. A, A′ and O are
  // conveniences and are left off when no clear spot exists; F, F′, C and V are the figure.
  for (const d of dots) {
    const text = d.name;
    const { w, h } = board.extent(text, bold(INK, 14));
    // Every centre on a fine grid around the point, nearest box first (below the axis a hair ahead of above).
    const spots: { c: Point; score: number }[] = [];
    for (let dx = -44; dx <= 44; dx += 1.5) {
      for (let dy = -44; dy <= 44; dy += 1.5) {
        const c = { x: d.c.x + dx, y: d.c.y + dy };
        const box = rectAt(c, w, h);
        const near = Math.hypot(Math.max(box.x - d.c.x, 0, d.c.x - (box.x + box.width)), Math.max(box.y - d.c.y, 0, d.c.y - (box.y + box.height)));
        if (near < 3.5 || near > Math.max(w, h) - 1) continue;
        spots.push({ c, score: near + (dy < 0 ? 0.8 : 0) + (d.id === "V" && dx > 0 ? 6 : 0) });
      }
    }
    spots.sort((p, q) => p.score - q.score);
    const best = placer.choose({ kind: "place", id: d.id, at: d.c }, w, h, spots.map((x) => x.c));
    if (best.cost > 0 && (d.id === "A" || d.id === "Ap" || d.id === "O" || d.id === "V")) continue;
    const block = board.label(text, best.centre.x, best.centre.y, { ...bold(INK, 14), width: w });
    placer.commit(rectAt(best.centre, w, h));
    block.annotatesPlace = d.c;
  }

  put({ kind: "element", id: "object" }, "objeto", bold(INK, 13), (w, h) => gridAround([objBase, objTip], w, h, 80, (c) => (Math.abs(c.y - y0) < h ? 30 : 0))).annotates = "object";
  if (imgBase !== null && imgTipPx !== null && dist(imgBase, imgTipPx) > 3) {
    put({ kind: "element", id: "image" }, "imagem", bold(IMAGE_TEXT, 13), (w, h) => gridAround([imgBase as Point, imgTipPx as Point], w, h, 80, (c) => (Math.abs(c.y - y0) < h ? 30 : 0))).annotates = "image";
  }

  // Dots last
  for (const d of dots) board.circle(d.c, 3, { fill: INK, id: `${d.id}-dot` });

  // The scale: a bar of a stated number of cm, so the figure can be read to scale.
  const barY = barRowY;
  const barA: Point = { x: SIDE, y: barY };
  const barB: Point = { x: SIDE + barPx, y: barY };
  board.poly([barA, barB], { stroke: INK, width: 2, id: "scale-bar" });
  board.poly([{ x: barA.x, y: barY - 5 }, { x: barA.x, y: barY + 5 }], { stroke: INK, width: 2, id: "scale-bar-l" });
  board.poly([{ x: barB.x, y: barY - 5 }, { x: barB.x, y: barY + 5 }], { stroke: INK, width: 2, id: "scale-bar-r" });
  const scaleText = `${formatNumber(barCm, locale)} cm`;
  const sw = board.extent(scaleText, { size: 13 }).w;
  board.label(scaleText, barB.x + 12 + sw / 2, barY, { size: 13, colour: SOFT, weight: 400, width: sw, id: "scale-label", claim: false, annotates: "scale-bar" });
  const note = "figura em escala";
  const nw = board.extent(note, { size: 13 }).w;
  board.label(note, barB.x + 12 + sw + 24 + nw / 2, barY, { size: 13, colour: SOFT, width: nw, id: "scale-note", claim: false, freeStanding: true });

  // ---- the panel ------------------------------------------------------------------------------------
  readingPanel.draw(board, { left: SIDE, top: panelTop, cut: barRowY + 16 });

  const title =
    input.title ??
    (plane ? `espelho plano, p = ${formatNumber(p, locale)} cm` : `${isMirror ? `espelho ${pr.variant === "concave" ? "côncavo" : "convexo"}` : `lente ${pr.variant === "converging" ? "convergente" : "divergente"}`}: p = ${formatNumber(p, locale)} cm, f = ${formatNumber(Math.abs(f as number), locale)} cm`);
  const spec = board.spec(title);
  const scene = spec.root as Scene;
  scene.connectors = connectors;
  spec.canvas = { ...spec.canvas, constraints: { allowOverlap: true, allowConnectorCrossing: true, allowCurvedConnectors: true } };
  return parseSpec(spec);
}

/**
 * Centres for a label of size w×h around a piece of ink, nearest first: every spot on a fine grid within
 * `reach` px of it whose box does not touch it. The placer then takes the first that costs nothing.
 */
function gridAround(own: Point[], w: number, h: number, reach = 70, prefer?: (c: Point) => number): Point[] {
  const xs = own.map((q) => q.x);
  const ys = own.map((q) => q.y);
  const out: { c: Point; score: number }[] = [];
  for (let x = Math.min(...xs) - reach - w / 2; x <= Math.max(...xs) + reach + w / 2; x += 3) {
    for (let y = Math.min(...ys) - reach - h / 2; y <= Math.max(...ys) + reach + h / 2; y += 3) {
      const c = { x, y };
      const d = distanceToPolyline(c, own);
      if (d > reach) continue;
      out.push({ c, score: d + (prefer === undefined ? 0 : prefer(c)) });
    }
  }
  out.sort((p, q) => p.score - q.score);
  return out.map((o) => o.c);
}

/** Hatching on the back (the side away from the object) of a mirror. */
function hatch(board: Board, placer: Placer, onMirror: (y: number) => P, half: number, at: (q: P) => Point, unit: number): void {
  const step = 9 / unit;
  const n = Math.floor((2 * half) / step);
  for (let k = 0; k <= n; k += 1) {
    const y = half - k * step;
    const a = at(onMirror(y));
    const pts = [a, { x: a.x + 7, y: a.y + 7 }];
    const id = `hatch-${k}`;
    board.poly(pts, { stroke: HATCH, width: 1.2, id });
    placer.addInk(id, pts);
  }
}

type PanelLine = { text: string; strong?: boolean };

/** A result line is strong; the arithmetic that reaches it is soft. Scripts as in "θ_{c}". */
function typesetPanel(lines: PanelLine[], width: number): Panel {
  return layoutPanel(
    lines.map((l) => ({ text: l.text, emphasis: l.strong === true ? "strong" : "soft" })),
    { width, size: PANEL_FONT, lineHeight: PANEL_LINE_H },
  );
}

/** answers:false: one line with what the exercise gives. */
function givensPanel(pr: Prepared, locale: Locale): PanelLine[] {
  const cm = (x: number): string => written(x, locale).text;
  const parts = [`p = ${cm(pr.p)} cm`];
  if (pr.f !== null) parts.push(`f = ${cm(pr.f)} cm`);
  parts.push(`o = ${cm(pr.o)} cm`);
  return [{ text: parts.join("; ") }];
}

function opticalPanel(pr: Prepared, g: Gauss, iHeight: number, locale: Locale): PanelLine[] {
  const cm = (x: number): string => written(x, locale).text;
  const p = pr.p;
  const lines: PanelLine[] = [];
  if (pr.f === null) {
    const gg = g as Extract<Gauss, { improper: false }>;
    lines.push({ text: `p = ${cm(p)} cm  →  p′ = ${fmtInt(gg.pPrime)} cm; A = ${formatNumber(gg.A, locale)}` });
    lines.push({ text: `espelho plano: p′ = −p e A = i/o = +1  →  i = ${cm(iHeight)} cm; o = ${cm(pr.o)} cm` });
    lines.push({ text: natureText(natureOf(gg)), strong: true });
    return lines;
  }
  const f = pr.f;
  if (g.improper) {
    lines.push({ text: `p = ${cm(p)} cm; f = ${cm(f)} cm  →  1/p′ = 1/f − 1/p = 0` });
    lines.push({ text: "o objeto está no foco: os raios emergem paralelos e não se cruzam" });
    lines.push({ text: "imagem imprópria (no infinito)", strong: true });
    return lines;
  }
  lines.push({ text: `p = ${cm(p)} cm; f = ${cm(f)} cm  →  p′ ${eq(g.pPrime, locale)} cm; A ${eq(g.A, locale)}` });
  lines.push({ text: `1/f = 1/p + 1/p′;  A = −p′/p = i/o  →  o = ${cm(pr.o)} cm; i ${eq(iHeight, locale)} cm` });
  lines.push({ text: natureText(natureOf(g)), strong: true });
  return lines;
}

// ---- interface ----------------------------------------------------------------------------------

function mediumOf(m: Medium | undefined, key: string): { name: string; n: number } {
  const path = `optics.${key}`;
  if (m === undefined) throw new SpecError(`${path} is required: { "name": "ar", "n": 1 }`);
  if (typeof m.name !== "string" || m.name.trim() === "") throw new SpecError(`${path}.name must be a non-empty string`);
  let n: number;
  if (m.n !== undefined) n = numberOf(m.n, `${path}.n`);
  else {
    const known = KNOWN_INDICES[m.name.trim().toLowerCase()];
    if (known === undefined) {
      throw new SpecError(`${path}.n is required: "${m.name}" is not a medium with a tabulated index (${Object.keys(KNOWN_INDICES).join(", ")})`);
    }
    n = known;
  }
  if (!(n >= 1)) throw new SpecError(`${path}.n must be a refractive index ≥ 1, got ${n}`);
  return { name: m.name.trim(), n };
}

function expandInterface(input: OpticsInput & { kind: "interface" }): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const answers = input.answers !== false;
  const m1 = mediumOf(input.n1, "n1");
  const m2 = mediumOf(input.n2, "n2");
  const theta1 = numberOf(input.theta1, "optics.theta1");
  if (!(theta1 >= 0 && theta1 < 90)) throw new SpecError(`optics.theta1 must be an angle of incidence in [0, 90) degrees, got ${theta1}`);
  const showReflected = input.reflected ?? true;

  const sn = snell(m1.n, m2.n, theta1);
  const thetaC = criticalAngle(m1.n, m2.n);
  const rad = (d: number): number => (d * Math.PI) / 180;
  const s1 = Math.sin(rad(theta1));
  const c1 = Math.cos(rad(theta1));

  // The denser medium is drawn below (tinted), the way a pool or a glass block is: when the ray
  // starts in the denser medium the whole figure is turned over, the incident ray coming from below.
  const flip = m1.n > m2.n;
  const dy = flip ? -1 : 1;

  // A narrow angle needs long rays: a label of ~34px only fits inside a wedge of half-angle θ/2 at a radius of about (34 + slack) / 2 sin(θ/2).
  const drawnAngles = [theta1, ...(sn.total || !answers ? [] : [sn.theta2])].filter((t) => t > 0);
  const needed = Math.max(0, ...drawnAngles.map((t) => 60 / (2 * Math.sin(rad(t) / 2)) + 30));
  const L = Math.round(Math.min(300, Math.max(190, needed + 10)));
  const width = Math.max(780, 2 * L + 100);
  const half = L + 60;
  const plotH = 2 * half;
  const O: Point = { x: width / 2, y: half };
  /** The point r·(dx, dyUp) from O, "up" being the incident side (down on the page when flipped). */
  const from = (dx: number, dyUp: number, r = 1): Point => ({ x: O.x + r * dx, y: O.y - dy * r * dyUp });

  const rays = {
    incident: { from: from(-s1, c1, L), to: O },
    reflected: { from: O, to: from(s1, c1, L) },
    refracted: sn.total || !answers ? null : { from: O, to: from(Math.sin(rad(sn.theta2)), -Math.cos(rad(sn.theta2)), L) },
  };

  const lines: PanelLine[] = [];
  const t1 = degreesText(theta1, locale);
  const sinText = (x: number): string => written(x, locale, 3).text;
  const n1t = formatNumber(m1.n, locale);
  const n2t = formatNumber(m2.n, locale);
  if (!answers) {
    lines.push({ text: `n₁ = ${n1t} (${m1.name}), n₂ = ${n2t} (${m2.name});  θ₁ = ${t1.text}°` });
  } else lines.push({ text: `n₁ sen θ₁ = n₂ sen θ₂;  n₁ = ${n1t} (${m1.name}), n₂ = ${n2t} (${m2.name})` });
  if (!answers) {
    // the givens only: nothing below is asked to be copied
  } else if (theta1 === 0) {
    lines.push({ text: "θ₁ = 0°: o raio incide na normal e atravessa sem se desviar (θ₂ = 0°)" });
  } else if (sn.total) {
    lines.push({ text: `θ₁ = ${t1.text}°:  sen θ₂ = ${n1t} · ${sinText(Math.sin(rad(theta1)))} / ${n2t} ${eq(sn.sin2, locale, 3)} > 1  →  não há raio refratado` });
  } else {
    const t2 = degreesText(sn.theta2, locale);
    lines.push({ text: `θ₁ = ${t1.text}°:  sen θ₂ = ${n1t} · ${sinText(Math.sin(rad(theta1)))} / ${n2t} ${eq(sn.sin2, locale, 3)}  →  θ₂ ${t2.exact ? "=" : "≈"} ${t2.text}°` });
  }
  if (answers && thetaC !== null) {
    const tc = degreesText(thetaC, locale);
    lines.push({ text: `ângulo limite: sen θ_{c} = n₂/n₁  →  θ_{c} ${tc.exact ? "=" : "≈"} ${tc.text}°` });
  }
  if (!answers) {
    // no verdict
  } else if (sn.total && thetaC !== null) {
    const tc = degreesText(thetaC, locale);
    lines.push({ text: `reflexão total (θ₁ > θ_{c} = ${tc.text}°)`, strong: true });
  } else if (!sn.total && theta1 > 0) {
    lines.push({
      text:
        m2.n > m1.n
          ? `${m2.name} é mais refringente que ${m1.name}: o raio se aproxima da normal (θ₂ < θ₁)`
          : m2.n < m1.n
            ? `${m2.name} é menos refringente que ${m1.name}: o raio se afasta da normal (θ₂ > θ₁)`
            : "mesmo índice de refração: não há desvio",
      strong: true,
    });
  }

  const readingPanel = typesetPanel(lines, width - 72);
  const height = plotH + 12 + readingPanel.height + 8;
  const board = new Board(width, height, PAPER);
  const placer = new Placer({ x: 8, y: 6, width: width - 16, height: plotH - 10 });
  const connectors: Connector[] = [];

  // Media: the tinted one is the lower.
  board.poly([{ x: 0, y: O.y }, { x: width, y: O.y }, { x: width, y: plotH }, { x: 0, y: plotH }], { stroke: "none", fill: TINT, close: true, id: "medium-lower", width: 0 });
  placer.addInk("medium-lower", [{ x: 0, y: O.y }, { x: width, y: O.y }, { x: width, y: plotH }, { x: 0, y: plotH }, { x: 0, y: O.y }]);
  board.poly([{ x: 10, y: O.y }, { x: width - 10, y: O.y }], { stroke: INK, width: 2.6, id: "boundary" });
  placer.addInk("boundary", [{ x: 10, y: O.y }, { x: width - 10, y: O.y }]);
  const normal = [{ x: O.x, y: O.y - L - 34 }, { x: O.x, y: O.y + L + 34 }];
  board.poly(normal, { stroke: SOFT, width: 1.3, lineStyle: "dashed", id: "normal" });
  placer.addInk("normal", normal);

  const drawRay = (id: string, a: Point, b: Point, colour: string, w: number): void => {
    board.poly([a, b], { stroke: colour, width: w, id });
    placer.addInk(id, [a, b]);
  };
  const arrowOn = (a: Point, b: Point, colour: string, id: string, at: number): void => {
    const len = dist(a, b);
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const mx = a.x + (b.x - a.x) * at;
    const my = a.y + (b.y - a.y) * at;
    const pts = [
      { x: mx - ux * 6 - uy * 4.4, y: my - uy * 6 + ux * 4.4 },
      { x: mx + ux * 6, y: my + uy * 6 },
      { x: mx - ux * 6 + uy * 4.4, y: my - uy * 6 - ux * 4.4 },
    ];
    board.poly(pts, { stroke: colour, width: 1, fill: colour, close: true, id });
    placer.addInk(id, [...pts, pts[0]!]);
  };
  const reflectedDrawn = answers ? showReflected || sn.total : showReflected;
  drawRay("ray-incident", rays.incident.from, rays.incident.to, PARALLEL, 2.6);
  if (reflectedDrawn) drawRay("ray-reflected", rays.reflected.from, rays.reflected.to, REFLECT, sn.total && answers ? 2.6 : 1.6);
  if (rays.refracted !== null) drawRay("ray-refracted", rays.refracted.from, rays.refracted.to, IMAGE, 2.6);
  arrowOn(rays.incident.from, rays.incident.to, PARALLEL, "head-incident", 0.3);
  if (reflectedDrawn) arrowOn(rays.reflected.from, rays.reflected.to, REFLECT, "head-reflected", 0.82);
  if (rays.refracted !== null) arrowOn(rays.refracted.from, rays.refracted.to, IMAGE, "head-refracted", 0.82);

  const putLabel = (claim: Claim, text: string, o2: LabelOptions, spots: (w: number, h: number) => Point[]): Block => {
    const { w, h } = board.extent(text, o2);
    const best = placer.choose(claim, w, h, spots(w, h));
    const block = board.label(text, best.centre.x, best.centre.y, { ...o2, width: w });
    placer.commit(rectAt(best.centre, w, h));
    return block;
  };
  const bold = (colour: string, size = 13): LabelOptions => ({ size, weight: 700, colour });

  // Angle arcs, the radius chosen together with the label. Directions are in the incident side's "up".
  type ArcSpec = { id: string; a: P; b: P; value: number; colour: string };
  const arcs: ArcSpec[] = [];
  if (theta1 > 0) {
    arcs.push({ id: "arc-incident", a: { x: 0, y: 1 }, b: { x: -s1, y: c1 }, value: theta1, colour: PARALLEL });
    if (!sn.total && answers) arcs.push({ id: "arc-refracted", a: { x: 0, y: -1 }, b: { x: Math.sin(rad(sn.theta2)), y: -Math.cos(rad(sn.theta2)) }, value: sn.theta2, colour: IMAGE });
    if (sn.total && answers) arcs.push({ id: "arc-reflected", a: { x: 0, y: 1 }, b: { x: s1, y: c1 }, value: theta1, colour: REFLECT });
  }
  for (const a of arcs) {
    const angA = Math.atan2(-dy * a.a.y, a.a.x);
    let delta = Math.atan2(-dy * a.b.y, a.b.x) - angA;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    const arcAt = (r: number): Point[] =>
      Array.from({ length: 17 }, (_, k) => {
        const t = angA + (delta * k) / 16;
        return { x: O.x + r * Math.cos(t), y: O.y + r * Math.sin(t) };
      });
    const text = `${degreesText(a.value, locale).text}°`;
    const style = { size: 13, weight: 600, colour: INK };
    const { w, h } = board.extent(text, style);
    let chosen: { radius: number; centre: Point; cost: number } | undefined;
    for (let radius = 54; radius <= L - 30; radius += 6) {
      placer.addInk(a.id, arcAt(radius));
      const spots: Point[] = [];
      for (const extra of [0, 5, 10, 16]) {
        for (const f of [0, 0.25, -0.25, 0.5, -0.5, 0.7, -0.7]) {
          const t = angA + delta / 2 + (f * delta) / 2;
          const u = { x: Math.cos(t), y: Math.sin(t) };
          const reachPx = Math.abs(u.x) * (w / 2) + Math.abs(u.y) * (h / 2);
          const r = radius + reachPx + 4 + extra;
          spots.push({ x: O.x + u.x * r, y: O.y + u.y * r });
        }
      }
      const best = placer.choose({ kind: "element", id: a.id }, w, h, spots);
      placer.removeInk(a.id);
      if (chosen === undefined || best.cost < chosen.cost) chosen = { radius, ...best };
      if (best.cost === 0) break;
    }
    // No clear spot beside the arc (a very narrow wedge): the arc is still drawn, and the panel gives the value.
    const labelled = chosen!.cost === 0;
    const radius = labelled ? chosen!.radius : 60;
    const pts = arcAt(radius);
    connectors.push({
      id: a.id,
      from: pts[0]!,
      to: pts[pts.length - 1]!,
      curve: { kind: "sweep", centre: O },
      arrow: "none",
      stroke: a.colour,
      strokeWidth: 1.8,
    });
    board.trace(pts, a.colour, 1.8, a.id);
    placer.addInk(a.id, pts);
    if (!labelled) continue;
    const block = board.label(text, chosen!.centre.x, chosen!.centre.y, { ...style, width: w });
    block.annotates = a.id;
    placer.commit(rectAt(chosen!.centre, w, h));
  }

  // Names of the rays, the normal, the media, the point of incidence.
  const beside = (a: Point, b: Point, ts: number[], side: number) => (w: number, h: number): Point[] => [...besideRun(a, b, w, h, ts, side), ...gridAround([a, b], w, h, 90)];
  putLabel({ kind: "element", id: "ray-incident" }, "raio incidente", bold(PARALLEL, 13), beside(rays.incident.from, rays.incident.to, [0.6, 0.68, 0.52, 0.76, 0.44, 0.15], -1)).annotates = "ray-incident";
  if (reflectedDrawn) {
    putLabel({ kind: "element", id: "ray-reflected" }, "raio refletido", bold(REFLECT, 13), beside(rays.reflected.from, rays.reflected.to, [0.55, 0.47, 0.63, 0.39, 0.3], 1)).annotates = "ray-reflected";
  }
  if (rays.refracted !== null) {
    putLabel({ kind: "element", id: "ray-refracted" }, "raio refratado", bold(IMAGE_TEXT, 13), beside(rays.refracted.from, rays.refracted.to, [0.55, 0.47, 0.63, 0.39, 0.3], -1)).annotates = "ray-refracted";
  }
  putLabel({ kind: "element", id: "normal" }, "normal", bold(SOFT, 13), (w, h) => [
    { x: O.x + w / 2 + 8, y: O.y - L - 24 },
    { x: O.x - w / 2 - 8, y: O.y - L - 24 },
    { x: O.x + w / 2 + 8, y: O.y + L + 22 },
    { x: O.x - w / 2 - 8, y: O.y + L + 22 },
    { x: O.x + w / 2 + 8, y: O.y - L - 24 + h },
  ]).annotates = "normal";
  const mediumText = (m: { name: string; n: number }, i: 1 | 2): string => `${m.name} (n${i === 1 ? "₁" : "₂"} = ${formatNumber(m.n, locale)})`;
  const upper = flip ? ([m2, 2] as const) : ([m1, 1] as const);
  const lower = flip ? ([m1, 1] as const) : ([m2, 2] as const);
  for (const [[m, i], isUpper] of [
    [upper, true],
    [lower, false],
  ] as const) {
    const text = mediumText(m, i);
    const { w, h } = board.extent(text, { size: 14 });
    const y = isUpper ? 8 + h / 2 + 4 : plotH - 8 - h / 2 - 4;
    const spots: Point[] = [{ x: 20 + w / 2, y }, { x: width - 20 - w / 2, y }, { x: 20 + w / 2, y: y + (isUpper ? 30 : -30) }, { x: width - 20 - w / 2, y: y + (isUpper ? 30 : -30) }];
    putLabel({ kind: "place", id: `medium-${i}`, at: { x: 0, y: 0 } }, text, { size: 14, weight: 700, colour: INK, freeStanding: true }, () => spots);
  }
  placer.addPlace("incidence", O);
  const iBlock = putLabel({ kind: "place", id: "incidence", at: O }, "I", bold(INK, 14), (w, h) => aroundPoint(O, w, h, placer.incident(O), { x: 1, y: dy }));
  iBlock.annotatesPlace = O;
  board.circle(O, 3.2, { fill: INK, id: "incidence-dot" });

  readingPanel.draw(board, { left: 36, top: plotH + 12, cut: plotH });

  const title = input.title ?? `refração ${m1.name} → ${m2.name}, θ₁ = ${degreesText(theta1, locale).text}°`;
  const spec = board.spec(title);
  const scene = spec.root as Scene;
  scene.connectors = connectors;
  spec.canvas = { ...spec.canvas, constraints: { allowOverlap: true, allowConnectorCrossing: true, allowCurvedConnectors: true } };
  return parseSpec(spec);
}

// ---- entry points ----------------------------------------------------------------------------------

export function expandOptics(input: OpticsInput): FigureSpec {
  switch (input.kind) {
    case "lens":
    case "mirror":
      return expandOptical(input as OpticsInput & { kind: "lens" | "mirror" });
    case "interface":
      return expandInterface(input as OpticsInput & { kind: "interface" });
    default:
      throw new SpecError(`optics.kind must be "lens", "mirror" or "interface", got ${JSON.stringify((input as { kind?: unknown }).kind)}`);
  }
}

export function validateOpticsInput(raw: Record<string, unknown>): void {
  const path = "optics";
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  const kind = v.optionalEnum(raw, "kind", path, ["lens", "mirror", "interface"] as const);
  if (kind === undefined) throw new SpecError(`${path}.kind is required: "lens", "mirror" or "interface"`);
  const allowed: Record<string, string[]> = {
    lens: ["title", "locale", "kind", "lens", "f", "p", "o", "rays", "show"],
    mirror: ["title", "locale", "kind", "mirror", "f", "p", "o", "rays", "show"],
    interface: ["title", "locale", "kind", "n1", "n2", "theta1", "reflected"],
  };
  // The dispatcher's own keys (the preset name, the common style options) are not this figure's fields to police.
  const common = ["preset", "style", "theme", "type"];
  for (const key of Object.keys(raw)) {
    if (!common.includes(key) && !allowed[kind]!.includes(key)) throw new SpecError(`${path}.${key} is not a field of a ${kind} figure; the fields are ${allowed[kind]!.join(", ")}`);
  }
  if (kind === "lens") {
    v.optionalEnum(raw, "lens", path, ["converging", "diverging"] as const);
    if (raw.lens === undefined) throw new SpecError(`${path}.lens is required: "converging" or "diverging"`);
  }
  if (kind === "mirror") {
    v.optionalEnum(raw, "mirror", path, ["concave", "convex", "plane"] as const);
    if (raw.mirror === undefined) throw new SpecError(`${path}.mirror is required: "concave", "convex" or "plane"`);
  }
  if (kind !== "interface") {
    if (raw.p === undefined) throw new SpecError(`${path}.p is required (the object distance in cm)`);
    if (raw.rays !== undefined) v.array(raw, "rays", path, "ray names");
    if (raw.show !== undefined) {
      const s = v.object(raw.show, `${path}.show`);
      for (const key of Object.keys(s)) {
        if (key !== "antiprincipal" && key !== "names") throw new SpecError(`${path}.show.${key} is not a flag; use antiprincipal or names`);
        v.optionalBoolean(s, key, `${path}.show`);
      }
    }
  } else {
    if (raw.n1 !== undefined) v.object(raw.n1, `${path}.n1`);
    if (raw.n2 !== undefined) v.object(raw.n2, `${path}.n2`);
    if (raw.theta1 === undefined) throw new SpecError(`${path}.theta1 is required (the angle of incidence, in degrees)`);
    v.optionalBoolean(raw, "reflected", path);
  }
  // Arithmetic and geometry are exercised by building the figure.
  expandOptics(raw as unknown as OpticsInput);
}

