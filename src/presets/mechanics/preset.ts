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
  kind: "pulleys" | "incline";
  /** The block's mass, kg. */
  mass: number;
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
  /** incline: the friction coefficient μ between block and slope. Default: none. */
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

const KEYS = ["preset", "title", "locale", "kind", "mass", "g", "movable", "redirect", "tensions", "angle", "friction", "components", "answers"];
const PULLEY_KEYS = ["movable", "redirect", "tensions"];
const INCLINE_KEYS = ["angle", "friction", "components"];

export function validateMechanicsInput(raw: Record<string, unknown>): void {
  const path = "mechanics";
  for (const k of Object.keys(raw)) {
    if (!KEYS.includes(k)) throw new SpecError(`${path}.${k} is not a field of mechanics (${KEYS.filter((x) => x !== "preset").join(", ")})`);
  }
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  const kind = v.optionalEnum(raw, "kind", path, ["pulleys", "incline"]);
  if (kind === undefined) throw new SpecError(`${path}.kind is required: "pulleys" or "incline"`);
  const foreign = (kind === "pulleys" ? INCLINE_KEYS : PULLEY_KEYS).filter((k) => raw[k] !== undefined);
  if (foreign.length > 0) throw new SpecError(`${path}: ${foreign.join(", ")} belong(s) to the other kind, not "${kind}"`);
  const mass = v.requiredNumber(raw, "mass", path);
  if (!(mass > 0)) throw new SpecError(`${path}.mass must be positive, got ${mass}`);
  const g = v.optionalNumber(raw, "g", path);
  if (g !== undefined && !(g > 0)) throw new SpecError(`${path}.g must be positive, got ${g}`);
  if (kind === "pulleys") {
    const n = v.optionalNumber(raw, "movable", path);
    if (n !== undefined && (!Number.isInteger(n) || n < 0 || n > 3)) throw new SpecError(`${path}.movable must be 0, 1, 2 or 3, got ${n}`);
    v.optionalBoolean(raw, "redirect", path);
    v.optionalBoolean(raw, "tensions", path);
    if (raw.redirect === false && (n ?? 1) === 0) throw new SpecError(`${path}: with no movable pulley the rope needs the fixed pulley (redirect)`);
  } else {
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
  const s = solvePulleys(input.mass, g, n);
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
        { text: `P = m·g = ${formatNumber(input.mass, locale)} · ${formatNumber(g, locale)} = ${quantity(s.P, locale).text} N` },
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
  b.label(`${formatNumber(input.mass, locale)} kg`, hangX, blockTop + blockH / 2, { size: 15, weight: 700, colour: INK, annotates: "bloco" });
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
  const s = solveIncline(input.mass, g, theta, input.friction);
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
  b.place(`${formatNumber(input.mass, locale)} kg`, corners[3]!.x - 30, corners[3]!.y - 14, [{ x: -1, y: 0 }, { x: 0, y: -1 }], { size: 14, weight: 700, colour: INK, annotates: "bloco", steps: 8 });
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? `plano inclinado de ${theta}°`));
}

export function expandMechanics(input: MechanicsInput): FigureSpec {
  return input.kind === "incline" ? drawIncline(input) : drawPulleys(input);
}
