/**
 * mechanics -- force diagrams solved before they are drawn (ADR 0073):
 * pulley systems and a block on an inclined plane, for Física lists and ENEM
 * ("a polia móvel reduz à metade a força necessária", "bloco num plano
 * inclinado de 30°").
 *
 * What is typed is the physical situation: a mass, g, how many movable
 * pulleys, an angle, a friction coefficient. Everything drawn is computed:
 *
 *  - pulleys: n movable pulleys in series, each hung by its own rope from the
 *    ceiling and lifting the one below; tension halves at each, T_i = P / 2^i,
 *    and the hand pulls F = P / 2^n (through a fixed pulley when `redirect`).
 *    The rope is traced from the pulley geometry -- vertical runs tangent to
 *    each wheel, wrapping under a movable one and over the fixed one.
 *  - incline: P = mg; along and across the slope P_x = P·sen θ and
 *    P_y = P·cos θ = N; with μ the block slides when tg θ > μ (kinetic
 *    friction μN, a = g(sen θ − μ cos θ)) and is held otherwise (static
 *    friction equal to P_x, a = 0).
 *
 * Every force arrow is drawn to one scale: its length IS its magnitude, so F
 * is half of P on the page when the physics says so.
 *
 * answers:false hides what a question asks: every computed value (F, the
 * tensions, N, P_x, P_y, the friction, a). Arrows keep their names; the mass,
 * g and the angle are given and stay.
 */

import type { FigureSpec, Point, TextRun } from "../../ir/types.ts";
import { SpecError, parseSpec, runsText } from "../../ir/types.ts";
import { LOCALES, formatNumber } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";
import { hasScripts, layoutPanel, rich } from "../shared/panel.ts";
import type { PanelLineInput } from "../shared/panel.ts";

// ---- input ------------------------------------------------------------------

export type MechanicsInput = {
  title?: string;
  locale?: Locale;
  kind: MechanicsKind;
  /** The block's mass, kg (pulleys, incline, spring). */
  mass?: number;
  /** table: [m_A on the table, m_B hanging]; atwood: [m₁ left, m₂ right]. kg. */
  masses?: [number, number];
  /** spring: the spring constant k, N/m. */
  stiffness?: number;
  /** spring: the spring's natural length, m. Default 0.2. */
  natural?: number;
  /** m/s². Default 10. */
  g?: number;
  /** pulleys: movable pulleys in series, 0–3. Default 1. */
  movable?: number;
  /** pulleys: the rope's free end passes over a fixed pulley, so the hand pulls down. Default true. */
  redirect?: boolean;
  /** pulleys: label each rope's tension. Default false. */
  tensions?: boolean;
  /** incline: the slope's angle, degrees (10–75). */
  angle?: number;
  /** incline, table: the friction coefficient μ between block and surface (one μ, kinetic and static). Default: none. */
  friction?: number;
  /** incline: draw P's components along and across the slope. Default true. */
  components?: boolean;
  /** false: the question's figure -- no computed value printed. Default true. */
  answers?: boolean;
};

// ---- the physics ---------------------------------------------------------------

export type PulleySolution = { P: number; tensions: number[]; F: number; advantage: number };

export function solvePulleys(mass: number, g: number, movable: number): PulleySolution {
  const P = mass * g;
  const tensions = Array.from({ length: movable }, (_, i) => P / 2 ** (i + 1));
  const F = movable === 0 ? P : tensions[movable - 1]!;
  return { P, tensions, F, advantage: 2 ** movable };
}

export type InclineSolution = { P: number; Px: number; Py: number; N: number; friction: number; sliding: boolean; a: number };

export function solveIncline(mass: number, g: number, angleDeg: number, mu?: number): InclineSolution {
  const t = (angleDeg * Math.PI) / 180;
  const P = mass * g;
  const Px = P * Math.sin(t);
  const Py = P * Math.cos(t);
  const N = Py;
  if (mu === undefined) return { P, Px, Py, N, friction: 0, sliding: true, a: g * Math.sin(t) };
  if (Math.tan(t) > mu) return { P, Px, Py, N, friction: mu * N, sliding: true, a: g * (Math.sin(t) - mu * Math.cos(t)) };
  return { P, Px, Py, N, friction: Px, sliding: false, a: 0 };
}

export const KINDS = ["pulleys", "incline", "table", "atwood", "spring"] as const;
export type MechanicsKind = (typeof KINDS)[number];

export type TableSolution = { PA: number; PB: number; N: number; friction: number; T: number; a: number; sliding: boolean };

/** Block A on a table, joined over a pulley at its edge to block B hanging. */
export function solveTable(mA: number, mB: number, g: number, mu?: number): TableSolution {
  const PA = mA * g;
  const PB = mB * g;
  const N = PA;
  const limit = mu === undefined ? 0 : mu * N;
  if (PB > limit) {
    const a = (PB - limit) / (mA + mB);
    return { PA, PB, N, friction: limit, T: mB * (g - a), a, sliding: true };
  }
  return { PA, PB, N, friction: PB, T: PB, a: 0, sliding: false };
}

export type AtwoodSolution = { P1: number; P2: number; T: number; a: number; heavier: 0 | 1 | 2 };

/** Two masses over one fixed pulley: a = |m₂ − m₁|g/(m₁ + m₂), T = 2m₁m₂g/(m₁ + m₂). */
export function solveAtwood(m1: number, m2: number, g: number): AtwoodSolution {
  return {
    P1: m1 * g,
    P2: m2 * g,
    T: (2 * m1 * m2 * g) / (m1 + m2),
    a: (Math.abs(m2 - m1) * g) / (m1 + m2),
    heavier: m1 === m2 ? 0 : m1 > m2 ? 1 : 2,
  };
}

export type SpringSolution = { P: number; x: number; Fel: number };

/** A block hanging at rest from a spring: k·x = m·g. */
export function solveSpring(mass: number, g: number, k: number): SpringSolution {
  const P = mass * g;
  return { P, x: P / k, Fel: P };
}

// ---- palette -------------------------------------------------------------------

const PAPER = "#FBFAF7";
const INK = "#181B21";
const SOFT = "#5B6270";
const KEY = "#1D4E89";
const RUST = "#B8431B";
const GREEN = "#2E6B3A";
const WHEEL = "#E3E6EA";
const BLOCK = "#F3E6B8";
const SLOPE = "#E7E3D8";
const M = 28;

// ---- validation ---------------------------------------------------------------------

const COMMON = ["preset", "title", "locale", "kind", "g", "answers"];
/** The fields each kind takes, beyond the common ones. */
const KIND_KEYS: Record<MechanicsKind, string[]> = {
  pulleys: ["mass", "movable", "redirect", "tensions"],
  incline: ["mass", "angle", "friction", "components"],
  table: ["masses", "friction"],
  atwood: ["masses"],
  spring: ["mass", "stiffness", "natural"],
};

function positive(raw: Record<string, unknown>, key: string, path: string): number {
  const x = v.requiredNumber(raw, key, path);
  if (!(x > 0)) throw new SpecError(`${path}.${key} must be positive, got ${x}`);
  return x;
}

export function validateMechanicsInput(raw: Record<string, unknown>): void {
  const path = "mechanics";
  const kind = v.optionalEnum(raw, "kind", path, KINDS);
  if (kind === undefined) throw new SpecError(`${path}.kind is required: ${KINDS.map((k) => `"${k}"`).join(", ")}`);
  const allowed = [...COMMON, ...KIND_KEYS[kind]];
  for (const k of Object.keys(raw)) {
    if (allowed.includes(k)) continue;
    const owner = KINDS.find((x) => KIND_KEYS[x].includes(k));
    throw new SpecError(owner === undefined
      ? `${path}.${k} is not a field of mechanics`
      : `${path}.${k} belongs to another kind (${owner}), not "${kind}"`);
  }
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  const g = v.optionalNumber(raw, "g", path);
  if (g !== undefined && !(g > 0)) throw new SpecError(`${path}.g must be positive, got ${g}`);
  if (kind === "table" || kind === "atwood") {
    const ms = v.array(raw, "masses", path, "two masses [kg, kg]");
    if (ms.length !== 2 || ms.some((m) => typeof m !== "number" || !(m > 0))) throw new SpecError(`${path}.masses must be two positive masses, got ${JSON.stringify(ms)}`);
    if (kind === "table") {
      const mu = v.optionalNumber(raw, "friction", path);
      if (mu !== undefined && mu < 0) throw new SpecError(`${path}.friction must not be negative, got ${mu}`);
    }
  } else {
    positive(raw, "mass", path);
  }
  if (kind === "spring") {
    positive(raw, "stiffness", path);
    if (raw.natural !== undefined) positive(raw, "natural", path);
  } else if (kind === "pulleys") {
    const n = v.optionalNumber(raw, "movable", path);
    if (n !== undefined && (!Number.isInteger(n) || n < 0 || n > 3)) throw new SpecError(`${path}.movable must be 0, 1, 2 or 3, got ${n}`);
    v.optionalBoolean(raw, "redirect", path);
    v.optionalBoolean(raw, "tensions", path);
    if (raw.redirect === false && (n ?? 1) === 0) throw new SpecError(`${path}: with no movable pulley the rope needs the fixed pulley (redirect)`);
  } else if (kind === "incline") {
    const angle = raw.angle === undefined ? undefined : v.requiredNumber(raw, "angle", path);
    if (angle === undefined) throw new SpecError(`${path}.angle is required for an incline (degrees)`);
    if (angle < 10 || angle > 75) throw new SpecError(`${path}.angle must be from 10 to 75 degrees, got ${angle}`);
    const mu = v.optionalNumber(raw, "friction", path);
    if (mu !== undefined && mu < 0) throw new SpecError(`${path}.friction must not be negative, got ${mu}`);
    v.optionalBoolean(raw, "components", path);
  }
  v.optionalBoolean(raw, "answers", path);
  expandMechanics(raw as unknown as MechanicsInput);
}

// ---- drawing helpers -------------------------------------------------------------------

/** A number as printed: two decimals at most, and "≈" when that rounded it. */
function quantity(x: number, locale: Locale): { text: string; approx: boolean } {
  const r = Math.round(x * 100) / 100;
  return { text: formatNumber(r, locale), approx: Math.abs(r - x) > 1e-9 };
}
function eq(name: string, x: number, unit: string, locale: Locale): string {
  const q = quantity(x, locale);
  return `${name} ${q.approx ? "≈" : "="} ${q.text} ${unit}`;
}

function arrow(b: Board, from: Point, to: Point, colour: string, id: string, o: { width?: number; dashed?: boolean } = {}): void {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const u = { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
  const n = { x: -u.y, y: u.x };
  const head = Math.min(11, len * 0.45);
  const half = head / 2;
  const base = { x: to.x - u.x * head, y: to.y - u.y * head };
  b.poly([from, base], { stroke: colour, width: o.width ?? 2.4, id, ...(o.dashed ? { lineStyle: "dashed" as const } : {}) });
  b.poly([to, { x: base.x + n.x * half, y: base.y + n.y * half }, { x: base.x - n.x * half, y: base.y - n.y * half }], { fill: colour, stroke: colour, width: 1, close: true, id: `${id}-head` });
}

/** A label for an arrow, set beyond its tip and naming its head. Scripts by `_{…}` markup. */
function arrowLabel(b: Board, text: string, tip: Point, dir: Point, colour: string, id: string): void {
  const runs: TextRun[] = rich(text);
  const plain = runsText(runs);
  const { w, h } = b.extent(plain, { size: 15, weight: 700 });
  const reach = Math.abs(dir.x) * (w / 2) + Math.abs(dir.y) * (h / 2) + 6;
  const n = { x: -dir.y, y: dir.x };
  const block = b.place(plain, tip.x + dir.x * reach, tip.y + dir.y * reach, [dir, n, { x: -n.x, y: -n.y }], {
    size: 15,
    weight: 700,
    colour,
    annotates: `${id}-head`,
    steps: 8,
  });
  if (hasScripts(runs)) block.runs = runs.map((r) => ({ ...r }));
}

const arcPts = (c: Point, r: number, a0: number, a1: number, steps = 24): Point[] =>
  Array.from({ length: steps + 1 }, (_, k) => {
    const a = a0 + ((a1 - a0) * k) / steps;
    return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
  });

function hatchLine(b: Board, x0: number, x1: number, y: number, side: -1 | 1, id: string): void {
  b.poly([{ x: x0, y }, { x: x1, y }], { stroke: INK, width: 2.4, id });
  for (let x = x0 + 6; x <= x1 - 4; x += 14) b.poly([{ x, y }, { x: x + 10, y: y + side * 10 }], { stroke: INK, width: 1.1, id: `${id}-h${Math.round(x)}` });
}

function panelBelow(b0: { W: number; y: number }, lines: PanelLineInput[]): { height: number; draw: (b: Board) => void; width: number } {
  const panel = layoutPanel(lines, { width: Math.max(460, b0.W - 2 * M), size: 14, lineHeight: 26 });
  return {
    height: panel.empty ? 0 : panel.height + 26,
    width: panel.width,
    draw: (b) => {
      if (!panel.empty) panel.draw(b, { left: M, top: b0.y + 22, cut: b0.y + 10 });
    },
  };
}

// ---- pulleys -------------------------------------------------------------------------

function drawPulleys(input: MechanicsInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const answers = input.answers !== false;
  const g = input.g ?? 10;
  const n = input.movable ?? 1;
  const redirect = input.redirect ?? true;
  const s = solvePulleys(input.mass!, g, n);
  const r = 24;
  const ceil = 56;
  const dy = n >= 2 ? 135 : 105; // stacked pulleys leave room for a tension label between them
  const k = 90 / s.P; // px per newton
  const fixedY = ceil + 62;
  const lowY = (redirect ? fixedY : ceil) + 2 * r + 80 + (n - 1) * dy;
  const C: Point[] = [];
  const x1 = M + 120;
  for (let i = 0; i < n; i += 1) C.push({ x: x1 + i * r, y: lowY - i * dy });
  const Fp: Point | undefined = redirect ? { x: n === 0 ? x1 + r : C[n - 1]!.x + 2 * r, y: fixedY } : undefined;
  const hangX = n === 0 ? Fp!.x - r : C[0]!.x;
  const hookY = n === 0 ? fixedY + 2 * r + 80 : C[0]!.y;
  const blockTop = (n === 0 ? hookY : hookY + r + 36);
  const blockH = 52;
  const pTip = blockTop + blockH + s.P * k;
  const freeX = redirect ? Fp!.x + r : C[n - 1]!.x + r;
  const endY = redirect ? Math.max(blockTop, (n === 0 ? fixedY : C[0]!.y) + 30) : C[n - 1]!.y - dy * 0.85;
  const fLen = Math.max(18, s.F * k);
  const lines: PanelLineInput[] = answers
    ? [
        { text: `P = m·g = ${formatNumber(input.mass!, locale)} · ${formatNumber(g, locale)} = ${quantity(s.P, locale).text} N` },
        n === 0
          ? { text: `a polia fixa só muda a direção: F = P = ${quantity(s.F, locale).text} N` }
          : { text: `cada polia móvel divide a força por 2: F = P/${s.advantage} = ${eq("", s.F, "N", locale).slice(3)}` },
        ...(input.tensions === true ? s.tensions.map((t, i) => ({ text: `T_{${i + 1}} = P/${2 ** (i + 1)} = ${eq("", t, "N", locale).slice(3)}` })) : []),
      ]
    : [];
  const right = Math.max(freeX, Fp === undefined ? 0 : Fp.x + r) + 150;
  const W0 = Math.ceil(right + M);
  const figH = Math.max(pTip, redirect ? endY + fLen : 0) + 30;
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);

  // The ceiling, wide enough for every anchor.
  const anchors = [...C.map((c) => c.x - r), ...(Fp === undefined ? [] : [Fp.x])];
  hatchLine(b, Math.min(...anchors) - 40, Math.max(...anchors) + 40, ceil, -1, "teto");
  // Wheels first; the rope is drawn over their rims.
  if (Fp !== undefined) {
    b.poly([{ x: Fp.x, y: ceil }, { x: Fp.x, y: Fp.y }], { stroke: INK, width: 2.4, id: "haste" });
    b.circle(Fp, r, { stroke: INK, width: 2.2, fill: WHEEL, id: "polia-fixa" });
  }
  C.forEach((c, i) => b.circle(c, r, { stroke: INK, width: 2.2, fill: WHEEL, id: `polia-movel-${i + 1}` }));
  // Ropes.
  for (let i = 0; i < n; i += 1) {
    const c = C[i]!;
    const pts: Point[] = [{ x: c.x - r, y: ceil }, ...arcPts(c, r, Math.PI, 0)];
    if (i < n - 1) {
      const up = C[i + 1]!;
      pts.push({ x: c.x + r, y: up.y + r + 14 });
      b.poly([up, { x: up.x, y: up.y + r + 14 }], { stroke: INK, width: 2, id: `alca-${i + 2}` });
    } else if (redirect) {
      pts.push(...arcPts(Fp!, r, Math.PI, 2 * Math.PI), { x: freeX, y: endY });
    } else {
      pts.push({ x: freeX, y: endY });
    }
    b.poly(pts, { stroke: RUST, width: 2.4, id: `corda-${i + 1}` });
  }
  if (n === 0) b.poly([{ x: hangX, y: blockTop }, ...arcPts(Fp!, r, Math.PI, 2 * Math.PI), { x: freeX, y: endY }], { stroke: RUST, width: 2.4, id: "corda-1" });
  if (Fp !== undefined) b.circle(Fp, 3, { stroke: INK, width: 1, fill: INK, id: "eixo-fixa" });
  C.forEach((c, i) => b.circle(c, 3, { stroke: INK, width: 1, fill: INK, id: `eixo-movel-${i + 1}` }));
  // The block on its hook.
  if (n > 0) b.poly([{ x: hangX, y: hookY }, { x: hangX, y: blockTop }], { stroke: INK, width: 2, id: "gancho" });
  b.poly([{ x: hangX - 34, y: blockTop }, { x: hangX + 34, y: blockTop }, { x: hangX + 34, y: blockTop + blockH }, { x: hangX - 34, y: blockTop + blockH }],
    { stroke: INK, width: 2.2, fill: BLOCK, close: true, id: "bloco" });
  b.label(`${formatNumber(input.mass!, locale)} kg`, hangX, blockTop + blockH / 2, { size: 15, weight: 700, colour: INK, annotates: "bloco" });
  // Forces, to one scale.
  arrow(b, { x: hangX, y: blockTop + blockH }, { x: hangX, y: pTip }, KEY, "peso");
  arrowLabel(b, "P", { x: hangX, y: pTip - 10 }, { x: 1, y: 0 }, KEY, "peso");
  const fTip = { x: freeX, y: redirect ? endY + fLen : endY - fLen };
  arrow(b, { x: freeX, y: endY }, fTip, RUST, "forca");
  arrowLabel(b, "F", { x: fTip.x, y: fTip.y + (redirect ? -10 : 10) }, { x: 1, y: 0 }, RUST, "forca");
  // Tensions, beside each rope's anchored run.
  if (input.tensions === true) {
    s.tensions.forEach((t, i) => {
      const c = C[i]!;
      // Between the two runs of its own rope, above its wheel: the one gap no other rope crosses.
      void t;
      const runs = rich(`T_{${i + 1}}`);
      const plain = runsText(runs);
      const top = i < n - 1 ? C[i + 1]!.y + r + 14 : redirect ? Fp!.y : ceil;
      const block = b.label(plain, c.x, (top + c.y - r) / 2, { size: 14, weight: 700, colour: RUST, annotates: `corda-${i + 1}` });
      if (hasScripts(runs)) block.runs = runs.map((q) => ({ ...q }));
    });
  }
  if (Fp !== undefined) b.place("polia fixa", Fp.x + r + 50, Fp.y - 4, [{ x: 1, y: 0 }], { size: 13, colour: SOFT, annotates: "polia-fixa", steps: 6 });
  if (n === 1 && input.tensions !== true) b.place("polia móvel", C[0]!.x - r - 52, C[0]!.y + 4, [{ x: -1, y: 0 }], { size: 13, colour: SOFT, annotates: "polia-movel-1", steps: 6 });
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? (n === 0 ? "polia fixa" : `${n} polia(s) móvel(is)`)));
}

// ---- incline ----------------------------------------------------------------------------

function drawIncline(input: MechanicsInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const answers = input.answers !== false;
  const g = input.g ?? 10;
  const theta = input.angle!;
  const t = (theta * Math.PI) / 180;
  const s = solveIncline(input.mass!, g, theta, input.friction);
  const components = input.components ?? true;
  // A shallow slope is drawn longer, not lower: the forces need its height.
  const L = Math.min(640, 260 / Math.tan(t));
  const Ht = L * Math.tan(t);
  const side = 60;
  const f = 0.45; // where the block sits, as a fraction of the slope from its top
  // One scale for every force, chosen so P's and P_y's tips stay at least
  // 64px above the ground: a label below a tip must not be read as the ground's.
  const above = Ht * (1 - f); // height of the block's contact point above the ground
  const kP = (above + side / 2 / Math.cos(t) - 64) / s.P;
  const kY = ((above - 64) / Math.cos(t) + side / 2) / s.Py;
  const k = Math.max(0.05, Math.min(110 / s.P, kP, kY));
  // Laid out with the ground at y = 0, then moved so the topmost ink is M + 30 down.
  const x0 = M + 40;
  const T0 = { x: x0, y: -Ht };
  const u = { x: Math.cos(t), y: Math.sin(t) }; // down the slope
  const nrm = { x: u.y, y: -u.x }; // out of the slope
  const len = L / Math.cos(t);
  const Q0 = { x: T0.x + u.x * len * f, y: T0.y + u.y * len * f };
  const G0 = { x: Q0.x + (nrm.x * side) / 2, y: Q0.y + (nrm.y * side) / 2 };
  const nTop = G0.y + nrm.y * s.N * k - 34;
  const corner = Q0.y - (u.y * side) / 2 + nrm.y * side - 34;
  const yb = M + 30 - Math.min(T0.y, nTop, corner);
  const T = { x: x0, y: yb - Ht };
  const A = { x: x0, y: yb };
  const B = { x: x0 + L, y: yb };
  const Q = { x: Q0.x, y: Q0.y + yb };
  const G = { x: G0.x, y: G0.y + yb };
  const at = (p: Point, d: Point, f: number): Point => ({ x: p.x + d.x * f * k, y: p.y + d.y * f * k });
  const pTip = at(G, { x: 0, y: 1 }, s.P);
  const nTip = at(G, nrm, s.N);
  const xTip = at(G, u, s.Px);
  const yTip = at(G, { x: -nrm.x, y: -nrm.y }, s.Py);
  // Friction acts at the contact, against the motion: drawn from the up-slope face, out of the block.
  const fFrom = { x: G.x - (u.x * side) / 2, y: G.y - (u.y * side) / 2 };
  const fTip = at(fFrom, { x: -u.x, y: -u.y }, Math.max(s.friction, 18 / k));

  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: `P = m·g = ${quantity(s.P, locale).text} N` });
    lines.push({ text: `${eq("P_{x}", s.Px, "N", locale).replace(/^P_\{x\} /, "P_{x} = P·sen θ ")}` });
    lines.push({ text: `${eq("P_{y}", s.Py, "N", locale).replace(/^P_\{y\} /, "N = P_{y} = P·cos θ ")}` });
    if (input.friction !== undefined) {
      lines.push(s.sliding
        ? { text: `tg θ > μ: o bloco desliza; ${eq("F_{at}", s.friction, "N", locale).replace(/^F_\{at\} /, "F_{at} = μ·N ")}` }
        : { text: `tg θ ≤ μ: o bloco fica em repouso; o atrito estático equilibra P_{x}: ${eq("F_{at}", s.friction, "N", locale)}` });
    }
    lines.push({
      text: s.sliding
        ? eq("a", s.a, "m/s²", locale).replace(/^a /, input.friction === undefined ? "a = g·sen θ " : "a = g(sen θ − μ cos θ) ")
        : "a = 0",
    });
  }
  const W0 = Math.ceil(Math.max(B.x + 80, nTip.x + 140, xTip.x + 120) + M);
  const figH = Math.max(yb + 30, pTip.y + 40);
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);

  b.poly([A, T, B], { fill: SLOPE, stroke: INK, width: 2.2, close: true, id: "rampa" });
  hatchLine(b, x0 - 30, B.x + 50, yb, 1, "chao");
  // The angle at the foot of the slope.
  // The label sits on the bisector a distance d past the arc. It must be nearer the arc than
  // either side of the angle: d < (R + d)·sen(θ/2), so R is chosen to leave d = 16 room.
  const half = Math.sin(t / 2);
  const d = 16;
  const R = Math.max(44, Math.ceil((d * (1 - half)) / half) + 8);
  b.poly(arcPts(B, R, Math.PI, Math.PI + t, 24), { stroke: INK, width: 1.4, id: "angulo" });
  const mid = Math.PI + t / 2;
  b.label(`${formatNumber(theta, locale)}°`, B.x + (R + d) * Math.cos(mid), B.y + (R + d) * Math.sin(mid), { size: 14, weight: 700, colour: INK, annotates: "angulo" });
  // The block, square on the slope.
  const corners = [
    { x: Q.x - (u.x * side) / 2, y: Q.y - (u.y * side) / 2 },
    { x: Q.x + (u.x * side) / 2, y: Q.y + (u.y * side) / 2 },
    { x: Q.x + (u.x * side) / 2 + nrm.x * side, y: Q.y + (u.y * side) / 2 + nrm.y * side },
    { x: Q.x - (u.x * side) / 2 + nrm.x * side, y: Q.y - (u.y * side) / 2 + nrm.y * side },
  ];
  b.poly(corners, { fill: BLOCK, stroke: INK, width: 2.2, close: true, id: "bloco" });
  // Components first, dashed, with the parallelogram that makes them P's.
  if (components) {
    b.poly([pTip, xTip], { stroke: SOFT, width: 1.1, lineStyle: "dashed", id: "proj-x" });
    b.poly([pTip, yTip], { stroke: SOFT, width: 1.1, lineStyle: "dashed", id: "proj-y" });
    arrow(b, G, xTip, SOFT, "px", { width: 1.8, dashed: true });
    arrow(b, G, yTip, SOFT, "py", { width: 1.8, dashed: true });
  }
  arrow(b, G, pTip, KEY, "peso");
  arrow(b, G, nTip, GREEN, "normal");
  if (input.friction !== undefined && s.friction > 1e-9) arrow(b, fFrom, fTip, RUST, "atrito");
  b.circle(G, 3.2, { fill: INK, stroke: INK, width: 1, id: "centro" });
  // Labels beyond each tip.
  const unit = (p: Point, q: Point): Point => {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    return { x: (q.x - p.x) / d, y: (q.y - p.y) / d };
  };
  arrowLabel(b, "P", pTip, { x: 0, y: 1 }, KEY, "peso");
  arrowLabel(b, "N", nTip, nrm, GREEN, "normal");
  if (components) {
    arrowLabel(b, "P_{x}", xTip, unit(G, xTip), SOFT, "px");
    arrowLabel(b, "P_{y}", yTip, unit(G, yTip), SOFT, "py");
  }
  if (input.friction !== undefined && s.friction > 1e-9) arrowLabel(b, "F_{at}", fTip, { x: -u.x, y: -u.y }, RUST, "atrito");
  b.place(`${formatNumber(input.mass!, locale)} kg`, corners[3]!.x - 30, corners[3]!.y - 14, [{ x: -1, y: 0 }, { x: 0, y: -1 }], { size: 14, weight: 700, colour: INK, annotates: "bloco", steps: 8 });
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? `plano inclinado de ${theta}°`));
}

// ---- shared pieces for the two-body kinds ---------------------------------------------------

const TENSION = "#6B3FA0";

function rect(b: Board, cx: number, top: number, w: number, h: number, id: string, fill = BLOCK): void {
  b.poly([{ x: cx - w / 2, y: top }, { x: cx + w / 2, y: top }, { x: cx + w / 2, y: top + h }, { x: cx - w / 2, y: top + h }], { stroke: INK, width: 2.2, fill, close: true, id });
}

/** A vertical dimension line with a head at each end, named by its label. */
function dimension(b: Board, x: number, y0: number, y1: number, id: string): void {
  b.poly([{ x, y: y0 }, { x, y: y1 }], { stroke: SOFT, width: 1.3, id });
  for (const [end, dir] of [[y0, -1], [y1, 1]] as const) {
    b.poly([{ x, y: end }, { x: x - 4, y: end - dir * 9 }, { x: x + 4, y: end - dir * 9 }], { fill: SOFT, stroke: SOFT, width: 1, close: true, id: `${id}-${dir < 0 ? "top" : "bottom"}` });
  }
}

/** A label for something that is not an arrow (a block, a dimension), with `_{…}` scripts. */
function name(b: Board, text: string, cx: number, cy: number, annotates: string, colour = INK, size = 15): void {
  const runs = rich(text);
  const block = b.label(runsText(runs), cx, cy, { size, weight: 700, colour, annotates });
  if (hasScripts(runs)) block.runs = runs.map((q) => ({ ...q }));
}

// ---- table: block A on a table, joined over a pulley to block B hanging ---------------------------

function drawTable(input: MechanicsInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const answers = input.answers !== false;
  const g = input.g ?? 10;
  const [mA, mB] = input.masses!;
  const s = solveTable(mA, mB, g, input.friction);
  const k = 100 / Math.max(s.PA, s.PB, s.N);
  const yt = M + 40 + s.N * k + 26 + 30; // room above A for N and its name
  const x0 = M + 20;
  const x1 = x0 + 360;
  const bw = 120; // wide enough for the mass and the name on either side of P and N
  const bh = 52;
  const GA = { x: x0 + 170, y: yt - bh / 2 };
  const r = 20;
  const C = { x: x1 + 26, y: GA.y + r }; // the rope leaves A level and meets the wheel at its top
  const bx = C.x + r;
  const bTop = yt + 112;
  const bwB = 60;
  const pATip = { x: GA.x, y: GA.y + s.PA * k };
  const pBTip = { x: bx, y: bTop + bh + s.PB * k };
  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: `P_{A} = m_{A}·g = ${quantity(s.PA, locale).text} N   ·   P_{B} = m_{B}·g = ${quantity(s.PB, locale).text} N   ·   N = P_{A}` });
    if (input.friction !== undefined) {
      lines.push(s.sliding
        ? { text: `P_{B} > μ·N: o sistema se move; F_{at} = μ·N = ${quantity(s.friction, locale).text} N` }
        : { text: `P_{B} ≤ μ·N: o sistema fica em repouso; o atrito estático equilibra P_{B}: F_{at} = ${quantity(s.friction, locale).text} N` });
    }
    if (s.sliding) {
      lines.push({ text: `${eq("a", s.a, "m/s²", locale).replace(/^a /, input.friction === undefined ? "a = P_{B}/(m_{A} + m_{B}) " : "a = (P_{B} − F_{at})/(m_{A} + m_{B}) ")}` });
      lines.push({ text: `${eq("T", s.T, "N", locale).replace(/^T /, "T = m_{B}(g − a) ")}` });
    } else {
      lines.push({ text: `a = 0   ·   T = P_{B} = ${quantity(s.T, locale).text} N` });
    }
  }
  const W0 = Math.ceil(bx + bwB / 2 + 110 + M);
  const figH = Math.max(pBTip.y + 34, pATip.y + 34, yt + 170);
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);

  // The table: a slab on two legs, and the pulley's bracket at its edge.
  b.poly([{ x: x0, y: yt }, { x: x1, y: yt }, { x: x1, y: yt + 12 }, { x: x0, y: yt + 12 }], { fill: SLOPE, stroke: INK, width: 2, close: true, id: "mesa" });
  for (const lx of [x0 + 24, x1 - 24]) b.poly([{ x: lx, y: yt + 12 }, { x: lx, y: yt + 170 }], { stroke: INK, width: 3, id: `perna-${lx}` });
  b.poly([{ x: x1, y: yt + 6 }, C], { stroke: INK, width: 2.4, id: "suporte" });
  b.circle(C, r, { stroke: INK, width: 2.2, fill: WHEEL, id: "polia" });
  // The rope: level from A, over the wheel's top-right quarter, straight down to B.
  b.poly([{ x: GA.x + bw / 2, y: GA.y }, { x: C.x, y: C.y - r }, ...arcPts(C, r, -Math.PI / 2, 0, 10), { x: bx, y: bTop }], { stroke: INK, width: 1.8, id: "fio" });
  b.circle(C, 3, { stroke: INK, width: 1, fill: INK, id: "eixo" });
  rect(b, GA.x, yt - bh, bw, bh, "bloco-a");
  rect(b, bx, bTop, bwB, bh, "bloco-b");
  name(b, `${formatNumber(mA, locale)} kg`, GA.x - bw / 4 - 2, GA.y, "bloco-a", INK, 13);
  name(b, "A", GA.x + bw / 4 + 2, GA.y, "bloco-a", INK, 15);
  name(b, `B: ${formatNumber(mB, locale)} kg`, bx + bwB / 2 + 52, bTop + bh / 2, "bloco-b", INK, 14);
  // Forces on A.
  arrow(b, GA, pATip, KEY, "peso-a");
  arrow(b, GA, { x: GA.x, y: GA.y - s.N * k }, GREEN, "normal");
  const tA0 = { x: GA.x + bw / 2 + 4, y: GA.y - 10 }; // beside the rope, not on it
  const tA1 = { x: tA0.x + s.T * k, y: tA0.y };
  arrow(b, tA0, tA1, TENSION, "tracao-a");
  let fTip: Point | undefined;
  if (input.friction !== undefined && s.friction > 1e-9) {
    const f0 = { x: GA.x - bw / 2, y: GA.y };
    fTip = { x: f0.x - Math.max(s.friction * k, 16), y: f0.y };
    arrow(b, f0, fTip, RUST, "atrito");
  }
  // Forces on B.
  const tB0 = { x: bx - 10, y: bTop - 3 };
  const tB1 = { x: tB0.x, y: tB0.y - s.T * k };
  arrow(b, tB0, tB1, TENSION, "tracao-b");
  arrow(b, { x: bx, y: bTop + bh }, pBTip, KEY, "peso-b");
  arrowLabel(b, "P_{A}", pATip, { x: 0, y: 1 }, KEY, "peso-a");
  arrowLabel(b, "N", { x: GA.x, y: GA.y - s.N * k }, { x: 0, y: -1 }, GREEN, "normal");
  arrowLabel(b, "T", tA1, { x: 0, y: -1 }, TENSION, "tracao-a");
  if (fTip !== undefined) arrowLabel(b, "F_{at}", fTip, { x: -1, y: 0 }, RUST, "atrito");
  arrowLabel(b, "T", tB1, { x: -1, y: 0 }, TENSION, "tracao-b");
  arrowLabel(b, "P_{B}", pBTip, { x: 0, y: 1 }, KEY, "peso-b");
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? "bloco sobre a mesa ligado a um bloco suspenso"));
}

// ---- atwood: two masses over one fixed pulley ---------------------------------------------------

function drawAtwood(input: MechanicsInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const answers = input.answers !== false;
  const g = input.g ?? 10;
  const [m1, m2] = input.masses!;
  const s = solveAtwood(m1, m2, g);
  const k = 100 / Math.max(s.P1, s.P2);
  const ceil = M + 30;
  const r = 40;
  const C = { x: M + 200, y: ceil + 56 };
  const bw = 56;
  const bh = 48;
  const base = C.y + s.T * k + 40; // room for each T arrow under the wheel
  const top1 = base + (s.heavier === 1 ? 40 : 0);
  const top2 = base + (s.heavier === 2 ? 40 : 0);
  const x1 = C.x - r;
  const x2 = C.x + r;
  const p1Tip = { x: x1, y: top1 + bh + s.P1 * k };
  const p2Tip = { x: x2, y: top2 + bh + s.P2 * k };
  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: `P_{1} = ${quantity(s.P1, locale).text} N   ·   P_{2} = ${quantity(s.P2, locale).text} N` });
    lines.push({ text: eq("a", s.a, "m/s²", locale).replace(/^a /, "a = |m_{2} − m_{1}|·g/(m_{1} + m_{2}) ") });
    lines.push({ text: eq("T", s.T, "N", locale).replace(/^T /, "T = 2·m_{1}·m_{2}·g/(m_{1} + m_{2}) ") });
    lines.push({ text: s.heavier === 0 ? "massas iguais: o sistema fica em equilíbrio" : `o bloco ${s.heavier} (${formatNumber(s.heavier === 1 ? m1 : m2, locale)} kg) desce, o outro sobe` });
  }
  const W0 = Math.ceil(x2 + bw / 2 + 140 + M);
  const figH = Math.max(p1Tip.y, p2Tip.y) + 34;
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);
  hatchLine(b, C.x - 90, C.x + 90, ceil, -1, "teto");
  b.poly([{ x: C.x, y: ceil }, C], { stroke: INK, width: 2.4, id: "haste" });
  b.circle(C, r, { stroke: INK, width: 2.2, fill: WHEEL, id: "polia" });
  b.poly([{ x: x1, y: top1 }, ...arcPts(C, r, Math.PI, 2 * Math.PI), { x: x2, y: top2 }], { stroke: INK, width: 1.8, id: "fio" });
  b.circle(C, 3, { stroke: INK, width: 1, fill: INK, id: "eixo" });
  rect(b, x1, top1, bw, bh, "bloco-1");
  rect(b, x2, top2, bw, bh, "bloco-2");
  name(b, `${formatNumber(m1, locale)} kg`, x1, top1 + bh / 2, "bloco-1", INK, 13);
  name(b, `${formatNumber(m2, locale)} kg`, x2, top2 + bh / 2, "bloco-2", INK, 13);
  // Tension beside each rope, outward; weights from the blocks' bottoms.
  const t1 = { x: x1 - 10, y: top1 - 3 };
  const t2 = { x: x2 + 10, y: top2 - 3 };
  arrow(b, t1, { x: t1.x, y: t1.y - s.T * k }, TENSION, "tracao-1");
  arrow(b, t2, { x: t2.x, y: t2.y - s.T * k }, TENSION, "tracao-2");
  arrow(b, { x: x1, y: top1 + bh }, p1Tip, KEY, "peso-1");
  arrow(b, { x: x2, y: top2 + bh }, p2Tip, KEY, "peso-2");
  arrowLabel(b, "T", { x: t1.x, y: t1.y - s.T * k }, { x: -1, y: 0 }, TENSION, "tracao-1");
  arrowLabel(b, "T", { x: t2.x, y: t2.y - s.T * k }, { x: 1, y: 0 }, TENSION, "tracao-2");
  arrowLabel(b, "P_{1}", p1Tip, { x: -1, y: 0 }, KEY, "peso-1");
  arrowLabel(b, "P_{2}", p2Tip, { x: 1, y: 0 }, KEY, "peso-2");
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? "máquina de Atwood"));
}

// ---- spring: a block hanging at rest, beside the same spring unloaded -------------------------------

function springPath(x: number, y0: number, y1: number, coils = 9, amp = 10): Point[] {
  const lead = 12;
  const pts: Point[] = [{ x, y: y0 }, { x, y: y0 + lead }];
  const n = coils * 2;
  for (let i = 1; i < n; i += 1) pts.push({ x: x + (i % 2 === 1 ? amp : -amp), y: y0 + lead + ((y1 - y0 - 2 * lead) * i) / n });
  pts.push({ x, y: y1 - lead }, { x, y: y1 });
  return pts;
}

function drawSpring(input: MechanicsInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const answers = input.answers !== false;
  const g = input.g ?? 10;
  const kSpring = input.stiffness!;
  const L0 = input.natural ?? 0.2;
  const s = solveSpring(input.mass!, g, kSpring);
  const scale = 230 / (L0 + s.x); // px per metre: the stretched spring is 230 px long
  const L0px = L0 * scale;
  const Xpx = s.x * scale;
  if (Xpx < 18) throw new SpecError(`mechanics: the stretch x = ${quantity(s.x, locale).text} m is too small beside L₀ = ${formatNumber(L0, locale)} m to draw to scale; use a shorter natural length`);
  const ceil = M + 30;
  const xL = M + 90;
  const xR = xL + 190;
  const yNat = ceil + L0px;
  const yEnd = yNat + Xpx;
  const bw = 60;
  const bh = 48;
  const kF = 90 / s.P;
  const pTip = { x: xR, y: yEnd + bh + s.P * kF };
  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: `P = m·g = ${quantity(s.P, locale).text} N` });
    lines.push({ text: "em equilíbrio, F_{el} = P: k·x = m·g" });
    lines.push({ text: `x = m·g/k = ${eq("", s.x, "m", locale).slice(3)} (${quantity(s.x * 100, locale).text} cm)` });
    lines.push({ text: `comprimento com o bloco: L_{0} + x = ${quantity(L0 + s.x, locale).text} m` });
  }
  const W0 = Math.ceil(xR + 120 + M);
  const figH = pTip.y + 34;
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);
  hatchLine(b, xL - 50, xR + 60, ceil, -1, "teto");
  // The natural end, carried across as a dashed guide.
  b.poly([{ x: xL + 16, y: yNat }, { x: xR + 70, y: yNat }], { stroke: SOFT, width: 1.1, lineStyle: "dashed", id: "guia" });
  b.poly(springPath(xL, ceil, yNat), { stroke: INK, width: 1.8, id: "mola-livre" });
  b.circle({ x: xL, y: yNat }, 3.5, { stroke: INK, width: 1, fill: INK, id: "ponta" });
  b.poly(springPath(xR, ceil, yEnd), { stroke: INK, width: 1.8, id: "mola" });
  rect(b, xR, yEnd, bw, bh, "bloco");
  name(b, `${formatNumber(input.mass!, locale)} kg`, xR, yEnd + bh / 2, "bloco", INK, 13);
  // L₀ beside the unloaded spring, x beside the stretch: both to scale.
  dimension(b, xL - 34, ceil, yNat, "l0");
  name(b, "L_{0}", xL - 56, (ceil + yNat) / 2, "l0", SOFT, 14);
  b.poly([{ x: xR + 34, y: yEnd }, { x: xR + 62, y: yEnd }], { stroke: SOFT, width: 1.1, id: "ext-x" });
  dimension(b, xR + 54, yNat, yEnd, "x");
  name(b, "x", xR + 72, (yNat + yEnd) / 2, "x", SOFT, 15);
  // The spring's pull and the weight: equal, to one scale.
  const f0 = { x: xR - 22, y: yEnd - 3 };
  const fTip = { x: f0.x, y: f0.y - s.Fel * kF };
  arrow(b, f0, fTip, GREEN, "elastica");
  arrow(b, { x: xR, y: yEnd + bh }, pTip, KEY, "peso");
  arrowLabel(b, "F_{el}", fTip, { x: -1, y: 0 }, GREEN, "elastica");
  arrowLabel(b, "P", pTip, { x: 1, y: 0 }, KEY, "peso");
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? "bloco suspenso por uma mola"));
}

export function expandMechanics(input: MechanicsInput): FigureSpec {
  switch (input.kind) {
    case "incline":
      return drawIncline(input);
    case "table":
      return drawTable(input);
    case "atwood":
      return drawAtwood(input);
    case "spring":
      return drawSpring(input);
    default:
      return drawPulleys(input);
  }
}

