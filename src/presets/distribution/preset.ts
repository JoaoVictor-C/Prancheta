/**
 * distribution -- a probability distribution with an event shaded and its
 * probability computed, for Probabilidade e Estatística ("P(60 < X < 75) com
 * X ~ N(70; 5²)", "sombreie a área e calcule", "P(Z > 1,96)", "binomial
 * P(X = 3) com n = 10, p = 0,3", "valores críticos de um teste bilateral").
 *
 * What is typed is the model (a normal's μ and σ, a binomial's n and p, a
 * Poisson's λ) and the event. Everything else is computed from those:
 *
 *  - a normal density is drawn over μ ± 4σ (wider when the event asks for
 *    it), its shaded region is a closed mark whose vertices are stated IN the
 *    plane's frame in (x, density) units, so its area IS the probability and
 *    `area-matches-its-label` (ADR 0037) measures the polygon against the
 *    number printed in it -- the approach ADR 0036 built for function-graph;
 *  - a discrete law is drawn as bars of width 1 centred on each k, each bar's
 *    area is its mass, the event's bars are merged into one closed outline
 *    whose area is the printed sum;
 *  - the axis carries μ ± kσ (or the integers), the boundaries in bold, and
 *    with `showZ` a second row z = (x − μ)/σ beneath;
 *  - the panel does the standardisation and the arithmetic the exercise
 *    asks for, every number computed by `src/math/probability.ts`.
 *
 * See docs/decisions/0059-probability-distributions.md.
 */

import type { Block, FigureSpec, Frame, FramedPoint, Mark, Point, Scene } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { resolveInFrame } from "../../ir/frames.ts";
import { LOCALES, MINUS, formatNumber, roundKeepingNonzero, formatSignificant } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import {
  binomialCoefficientText,
  binomialPmf,
  binomialRange,
  factorialText,
  normalPdf,
  phi,
  phiInv,
  poissonPmf,
  poissonRange,
} from "../../math/probability.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";
import type { LabelOptions } from "../function-graph/board.ts";
import { boxInside } from "../function-graph/areas.ts";
import { Placer } from "../construction/place.ts";
import { distanceToPolyline, rectAt, rectToPolyline } from "../../geometry/hit.ts";
import { wrapText } from "../shared/text.ts";
import type { WrapRules } from "../shared/text.ts";
import type { Printed } from "../../locale/write.ts";

// ---- input ------------------------------------------------------------------

export type DistributionEventInput =
  | { between: [number, number] }
  | { below: number; strict?: boolean }
  | { above: number; strict?: boolean }
  | { equals: number }
  | { tails: number | { alpha: number } };

export type DistributionInput = {
  title?: string;
  locale?: Locale;
  kind: "normal" | "binomial" | "poisson";
  mean?: number;
  sd?: number;
  n?: number;
  p?: number;
  lambda?: number;
  event: DistributionEventInput;
  showZ?: boolean;
  approximation?: "normal";
  decimals?: number;
  tickLabels?: boolean;
  /** false: the figure of the QUESTION -- curve, shaded event and boundary values, no probability, z row, panel or approximation (see PRESET.md). Default true. */
  answers?: boolean;
};

export type Model =
  | { kind: "normal"; mean: number; sd: number }
  | { kind: "binomial"; n: number; p: number }
  | { kind: "poisson"; lambda: number };

export type Event =
  | { type: "between"; a: number; b: number }
  | { type: "below"; b: number; strict: boolean }
  | { type: "above"; a: number; strict: boolean }
  | { type: "equals"; k: number }
  | { type: "tails"; z: number; alpha?: number };

const KEYS = ["preset", "title", "locale", "kind", "mean", "sd", "n", "p", "lambda", "event", "showZ", "approximation", "decimals", "tickLabels", "answers"];
const MAX_N = 5000;

// ---- palette ------------------------------------------------------------------

const PAPER = "#FCFBF7";
const INK = "#181B21";
const SOFT = "#4E5763";
const FAINT = "#8A93A3";
const ACCENT = "#2F6FB5";
const ACCENT_TEXT = "#164A85";
const TINT = "38";
const BAR_FILL = "#E3E7EE";
const BAR_STROKE = "#8792A3";
const HIT_FILL = "#A9C4E6";
const APPROX = "#B3400C";
const APPROX_TEXT = "#9A3508";

// ---- geometry constants ----------------------------------------------------------

const W = 760;
const ML = 64;
const MR = 40;
const PLOT_W = W - ML - MR;
const PEAK_TOP = 80;
const PEAK_PX = 232;
const BASE_Y = PEAK_TOP + PEAK_PX;
const ROW_H = 24;
const FIRST_ROW = 22;
const PANEL_FONT = 13;
const PANEL_LINE_H = 24;

// ---- small helpers --------------------------------------------------------------

/** Round-trip noise removed: 0.30000000000000004 is 0.3. */
const tidy = (x: number): number => Number(x.toPrecision(12));

const SUPER: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "−": "⁻", "-": "⁻" };
const SUBS = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];
export const sup = (s: string | number): string => [...String(s)].map((c) => SUPER[c] ?? c).join("");
export const sub = (n: number): string => [...String(n)].map((c) => SUBS[Number(c)] ?? c).join("");

// ---- parsing -------------------------------------------------------------------------

export function parseModel(raw: Record<string, unknown>): Model {
  const path = "distribution";
  const kind = raw.kind;
  if (kind !== "normal" && kind !== "binomial" && kind !== "poisson") {
    throw new SpecError(`${path}.kind must be one of normal, binomial, poisson, got ${JSON.stringify(kind)}`);
  }
  const foreign = (keys: string[]): void => {
    for (const k of keys) {
      if (raw[k] !== undefined) throw new SpecError(`${path}.${k} does not belong to kind ${JSON.stringify(kind)}`);
    }
  };
  if (kind === "normal") {
    foreign(["n", "p", "lambda"]);
    const mean = raw.mean === undefined ? 0 : v.finite(raw.mean, `${path}.mean`);
    const sd = raw.sd === undefined ? 1 : v.finite(raw.sd, `${path}.sd`);
    if (!(sd > 0)) throw new SpecError(`${path}.sd must be > 0, got ${sd}`);
    return { kind, mean, sd };
  }
  if (kind === "binomial") {
    foreign(["mean", "sd", "lambda"]);
    const n = v.finite(raw.n, `${path}.n`);
    if (!Number.isInteger(n) || n < 1 || n > MAX_N) throw new SpecError(`${path}.n must be a whole number from 1 to ${MAX_N}, got ${n}`);
    const p = v.finite(raw.p, `${path}.p`);
    if (!(p > 0 && p < 1)) throw new SpecError(`${path}.p must lie strictly between 0 and 1, got ${p}`);
    return { kind, n, p };
  }
  foreign(["mean", "sd", "n", "p"]);
  const lambda = v.finite(raw.lambda, `${path}.lambda`);
  if (!(lambda > 0) || lambda > 2000) throw new SpecError(`${path}.lambda must be > 0 and at most 2000, got ${lambda}`);
  return { kind, lambda };
}

export function parseEvent(model: Model, raw: unknown): Event {
  const path = "distribution.event";
  if (raw === undefined) throw new SpecError(`${path} is required: one of between, below, above, equals, tails`);
  const o = v.object(raw, path);
  const keys = Object.keys(o).filter((k) => k !== "strict");
  if (keys.length !== 1) {
    throw new SpecError(`${path} must have exactly one of between, below, above, equals, tails -- found ${keys.length === 0 ? "none" : keys.join(" and ")}`);
  }
  const key = keys[0]!;
  const strict = o.strict === undefined ? undefined : v.optionalBoolean(o, "strict", path);
  if (strict !== undefined && key !== "below" && key !== "above") throw new SpecError(`${path}.strict only applies to below and above`);
  const normal = model.kind === "normal";
  const whole = (x: unknown, at: string): number => {
    const n = v.finite(x, at);
    if (!normal && !Number.isInteger(n)) throw new SpecError(`${at} must be a whole number: X takes only the values 0, 1, 2, …, got ${n}`);
    return n;
  };
  const inSupport = (k: number, at: string): void => {
    if (model.kind === "binomial" && (k < 0 || k > model.n)) throw new SpecError(`${at} = ${k} is outside the support 0 … ${model.n} of B(${model.n}; ${model.p})`);
    if (model.kind === "poisson" && k < 0) throw new SpecError(`${at} = ${k} is outside the support 0, 1, 2, … of a Poisson`);
  };
  switch (key) {
    case "between": {
      const b = o.between;
      if (!Array.isArray(b) || b.length !== 2) throw new SpecError(`${path}.between must be [a, b]`);
      const a = whole(b[0], `${path}.between[0]`);
      const c = whole(b[1], `${path}.between[1]`);
      if (!(a < c)) throw new SpecError(`${path}.between must be [a, b] with a < b, got [${a}, ${c}]${normal ? "" : " (for a single value use equals)"}`);
      if (!normal) {
        inSupport(a, `${path}.between[0]`);
        inSupport(c, `${path}.between[1]`);
      }
      return { type: "between", a, b: c };
    }
    case "below": {
      const b = whole(o.below, `${path}.below`);
      const isStrict = strict === true;
      if (!normal) {
        const top = isStrict ? b - 1 : b;
        if (top < 0) throw new SpecError(`${path}.below = ${b}${isStrict ? " (strict)" : ""} leaves no value of X: the smallest is 0`);
        inSupport(b, `${path}.below`);
      }
      return { type: "below", b, strict: isStrict };
    }
    case "above": {
      const a = whole(o.above, `${path}.above`);
      const isStrict = strict === true;
      if (!normal) {
        const bottom = isStrict ? a + 1 : a;
        if (model.kind === "binomial" && bottom > model.n) throw new SpecError(`${path}.above = ${a}${isStrict ? " (strict)" : ""} leaves no value of X: the largest is ${model.n}`);
        inSupport(a, `${path}.above`);
      }
      return { type: "above", a, strict: isStrict };
    }
    case "equals": {
      if (normal) throw new SpecError(`${path}.equals: a normal variable is continuous, so P(X = k) = 0 for every k -- ask for between, below, above or tails`);
      const k = whole(o.equals, `${path}.equals`);
      inSupport(k, `${path}.equals`);
      return { type: "equals", k };
    }
    case "tails": {
      if (!normal) throw new SpecError(`${path}.tails is the two-sided |Z| > z of a normal test; for a ${model.kind} use between, below, above or equals`);
      const t = o.tails;
      if (typeof t === "number") {
        const z = v.finite(t, `${path}.tails`);
        if (!(z > 0)) throw new SpecError(`${path}.tails must be > 0 (the critical value z, both tails |Z| > z), got ${z}`);
        return { type: "tails", z };
      }
      const a = v.object(t, `${path}.tails`);
      const alpha = v.requiredNumber(a, "alpha", `${path}.tails`);
      if (!(alpha > 0 && alpha < 1)) throw new SpecError(`${path}.tails.alpha must lie strictly between 0 and 1, got ${alpha}`);
      return { type: "tails", z: phiInv(1 - alpha / 2), alpha };
    }
    default:
      throw new SpecError(`${path} must be one of between, below, above, equals, tails, got ${key}`);
  }
}

// ---- the arithmetic ------------------------------------------------------------------------

/** P(zl < Z < zh), each tail read from the side it is small on so nothing cancels. */
export function probZ(zl: number, zh: number): number {
  return zl > 0 ? phi(-zl) - phi(-zh) : phi(zh) - phi(zl);
}

/** The values of X an event covers, for a discrete model: kHi is Infinity for an open Poisson tail. */
export function barRange(model: Model, ev: Event): { kLo: number; kHi: number } {
  const top = model.kind === "binomial" ? model.n : Infinity;
  switch (ev.type) {
    case "between":
      return { kLo: ev.a, kHi: ev.b };
    case "below":
      return { kLo: 0, kHi: ev.strict ? ev.b - 1 : ev.b };
    case "above":
      return { kLo: ev.strict ? ev.a + 1 : ev.a, kHi: top };
    case "equals":
      return { kLo: ev.k, kHi: ev.k };
    default:
      throw new SpecError("distribution: tails belong to a normal");
  }
}

/** The probability of the event, exact: the number every label and panel line is built from. */
export function eventProbability(model: Model, ev: Event): number {
  if (model.kind === "normal") {
    const za = (x: number): number => (x - model.mean) / model.sd;
    switch (ev.type) {
      case "between":
        return probZ(za(ev.a), za(ev.b));
      case "below":
        return phi(za(ev.b));
      case "above":
        return phi(-za(ev.a));
      case "tails":
        return 2 * phi(-ev.z);
      default:
        return 0;
    }
  }
  const { kLo, kHi } = barRange(model, ev);
  return model.kind === "binomial" ? binomialRange(kLo, kHi, model.n, model.p) : poissonRange(kLo, kHi, model.lambda);
}

/** The mean and standard deviation of the normal that approximates a discrete model. */
export function approxMoments(model: Model): { mean: number; sd: number } {
  if (model.kind === "binomial") return { mean: model.n * model.p, sd: Math.sqrt(model.n * model.p * (1 - model.p)) };
  if (model.kind === "poisson") return { mean: model.lambda, sd: Math.sqrt(model.lambda) };
  return { mean: model.mean, sd: model.sd };
}

/** The continuity-corrected edges of a discrete event, in x: infinite where the event is open. */
export function continuityEdges(ev: Event, range: { kLo: number; kHi: number }): { lo: number; hi: number } {
  const lo = ev.type === "below" ? -Infinity : range.kLo - 0.5;
  const hi = ev.type === "above" ? Infinity : range.kHi + 0.5;
  return { lo, hi };
}

/** P from the normal approximation of a discrete event. */
export function approximateProbability(model: Model, ev: Event): number {
  const { mean, sd } = approxMoments(model);
  const { lo, hi } = continuityEdges(ev, barRange(model, ev));
  return probZ((lo - mean) / sd, (hi - mean) / sd);
}

function pmfOf(model: Model, k: number): number {
  return model.kind === "binomial" ? binomialPmf(k, model.n, model.p) : model.kind === "poisson" ? poissonPmf(k, model.lambda) : 0;
}

// ---- the window ------------------------------------------------------------------------------------

/** The whole numbers drawn as bars: the mass outside is below `eps` on each side, and the event is inside. */
export function barWindow(model: Model, ev: Event, decimals: number): { lo: number; hi: number } {
  const eps = 0.1 * 10 ** -decimals;
  const { kLo, kHi } = barRange(model, ev);
  let lo: number;
  let hi: number;
  if (model.kind === "binomial" && model.n <= 20) {
    lo = 0;
    hi = model.n;
  } else {
    const top = model.kind === "binomial" ? model.n : Math.ceil((model as { lambda: number }).lambda + 14 * Math.sqrt((model as { lambda: number }).lambda) + 40);
    lo = 0;
    hi = top;
    let cum = 0;
    for (let k = 0; k <= top; k += 1) {
      cum += pmfOf(model, k);
      if (cum >= eps) {
        lo = k;
        break;
      }
    }
    let tail = 0;
    for (let k = top; k >= 0; k -= 1) {
      tail += pmfOf(model, k);
      if (tail >= eps) {
        hi = k;
        break;
      }
    }
  }
  lo = Math.min(lo, kLo);
  hi = Math.max(hi, Number.isFinite(kHi) ? kHi : hi);
  if (model.kind === "poisson") hi = Math.max(hi, kLo + 1);
  while (hi - lo < 6) {
    if (lo > 0) lo -= 1;
    hi += 1;
    if (model.kind === "binomial" && hi > model.n) hi = model.n;
    if (model.kind === "binomial" && lo === 0 && hi === model.n) break;
  }
  return { lo, hi };
}

/** How far, in σ, the normal drawing reaches either side of μ. */
export function normalReach(model: Model, ev: Event, decimals: number): number {
  if (model.kind !== "normal") return 4;
  let reach = 4;
  const z = (x: number): number => Math.abs((x - model.mean) / model.sd);
  const openEnded = ev.type !== "between";
  if (openEnded) {
    // the mass drawn is short of the true mass by what lies beyond the edge; keep that below a tenth of the last printed digit
    let need = 4;
    while (phi(-need) > 0.1 * 10 ** -decimals && need < 9) need += 0.5;
    reach = Math.max(reach, need);
  }
  if (ev.type === "between") reach = Math.max(reach, z(ev.a) + 1, z(ev.b) + 1);
  if (ev.type === "below") reach = Math.max(reach, z(ev.b) + 1);
  if (ev.type === "above") reach = Math.max(reach, z(ev.a) + 1);
  if (ev.type === "tails") reach = Math.max(reach, ev.z + 1);
  return Math.ceil(reach * 2) / 2;
}

// ---- numbers as text ----------------------------------------------------------------------------------------

/**
 * A typed or derived value as a reader writes it. formatNumber stops at three
 * decimals, so 0,0125 came out "0,013" and μ ± kσ of N(0,15; 0,0125²) printed
 * ticks that were not the values drawn. A value with a short decimal expansion
 * is written in full, whatever its magnitude; one without keeps formatNumber's
 * rounding from 0,1 up, and four significant figures below it.
 */
/** A computed x rounded to a thousandth of σ (never past whole units): the resolution the drawing itself has. */
export function roundToSd(x: number, sd: number): number {
  const d = Math.max(0, Math.ceil(-Math.log10(sd)) + 3);
  return Number(x.toFixed(Math.min(d, 15)));
}

export function shortNumber(x: number, locale: Locale): string {
  const t = tidy(x);
  if (Number.isInteger(t)) return formatNumber(t, locale, { fractions: false });
  for (let d = 1; d <= 9; d += 1) if (Math.abs(Number(t.toFixed(d)) - t) <= 1e-12 * Math.max(1, Math.abs(t))) return formatNumber(t, locale, { decimals: d });
  const a = Math.abs(t);
  if (a < 0.1) return formatSignificant(t, 4, locale);
  return formatNumber(t, locale, { fractions: false });
}

function textFor(locale: Locale) {
  const dec = (x: number, d: number): string => formatNumber(x, locale, { decimals: d });
  const short = (x: number): string => shortNumber(x, locale);
  /** z as a reader writes it: exact when it is, three decimals otherwise. */
  const z = (x: number): Printed => {
    const r = roundKeepingNonzero(x, 3);
    return { text: formatNumber(r === 0 ? 0 : r, locale, { fractions: false }), exact: Math.abs(x - r) < 1e-9 };
  };
  return { dec, short, z };
}

/**
 * The fewest decimals, from `base` up, at which the operands printed as they are
 * still combine to the result printed: "0,8413 − 0,0228 = 0,8186" is wrong by
 * one in the last place (the exact difference is 0,81859…), so the operands
 * are given a digit more and the arithmetic on the page can be checked.
 */
export function operandDecimals(operands: number[], combine: (rounded: number[]) => number, exact: number, base: number): number {
  for (let d = base; d <= base + 4; d += 1) {
    const r = operands.map((x) => Number(x.toFixed(d)));
    if (Number(combine(r).toFixed(base)) === Number(exact.toFixed(base))) return d;
  }
  return base + 4;
}

// ---- the panel's text ---------------------------------------------------------------------------------------------

/** Every line of the reading panel, computed. Exported for the tests. */
export function panelLines(model: Model, ev: Event, o: { locale?: Locale; decimals?: number; approximation?: boolean } = {}): string[] {
  const locale = o.locale ?? "pt-BR";
  const decimals = o.decimals ?? 4;
  const t = textFor(locale);
  const P = eventProbability(model, ev);
  const pct = `${t.dec(P * 100, Math.max(decimals - 2, 0))}%`;
  const fin = `${t.dec(P, decimals)} ≈ ${pct}`;
  const lines: string[] = [];
  if (model.kind === "normal") return normalPanel(model, ev, locale, decimals, P, pct);

  const { kLo, kHi } = barRange(model, ev);
  const isBin = model.kind === "binomial";
  const single = (k: number): string => {
    if (isBin) {
      const m = model as { n: number; p: number };
      const q = tidy(1 - m.p);
      return `C(${m.n}, ${k}) · ${t.short(m.p)}${sup(k)} · ${t.short(q)}${sup(m.n - k)}`;
    }
    const lam = (model as { lambda: number }).lambda;
    const e = Number.isInteger(lam) ? `e${sup(MINUS + lam)}` : `e^(${MINUS}${t.short(lam)})`;
    return `${e} · ${t.short(lam)}${sup(k)} / ${k}!`;
  };
  const symbol = ((): string => {
    switch (ev.type) {
      case "between":
        return `P(${ev.a} ≤ X ≤ ${ev.b})`;
      case "below":
        return ev.strict ? `P(X < ${ev.b})` : `P(X ≤ ${ev.b})`;
      case "above":
        return ev.strict ? `P(X > ${ev.a})` : `P(X ≥ ${ev.a})`;
      default:
        return `P(X = ${(ev as { k: number }).k})`;
    }
  })();
  const count = Number.isFinite(kHi) ? kHi - kLo + 1 : Infinity;
  if (ev.type === "equals") {
    lines.push(`${symbol} = ${single(kLo)} = ${fin}`);
    if (isBin) {
      const c = binomialCoefficientText((model as { n: number }).n, kLo);
      if (c !== null) lines.push(`C(${(model as { n: number }).n}, ${kLo}) = ${c}`);
    } else {
      const f = factorialText(kLo);
      if (f !== null && kLo > 1) lines.push(`${kLo}! = ${f}`);
    }
  } else {
    const rewritten =
      ev.type === "below" && ev.strict
        ? `P(X ≤ ${kHi}) = `
        : ev.type === "above" && ev.strict
          ? `P(X ≥ ${kLo}) = `
          : "";
    const asTerms = (a: number, b: number): string =>
      Array.from({ length: b - a + 1 }, (_, i) => `P(X = ${a + i})`).join(" + ");
    const range = (a: number, b: number): string => {
      const vals = Array.from({ length: b - a + 1 }, (_, i) => pmfOf(model, a + i));
      const d = operandDecimals(vals, (r) => r.reduce((s, x) => s + x, 0), P, decimals);
      return `${asTerms(a, b)} = ${vals.map((x) => t.dec(x, d)).join(" + ")}`;
    };
    if (count <= 6) {
      lines.push(`${symbol} = ${rewritten}${range(kLo, kHi)} = ${fin}`);
    } else {
      // the complement, when it has few terms: P(X ≥ a) = 1 − P(X ≤ a − 1); P(X ≤ b) = 1 − P(X ≥ b + 1)
      const compTop = ev.type === "above" ? kLo - 1 : null;
      const compBottom = ev.type === "below" && isBin ? kHi + 1 : null;
      if (compTop !== null && compTop >= 0 && compTop + 1 <= 6) {
        const vals = Array.from({ length: compTop + 1 }, (_, i) => pmfOf(model, i));
        const cm = (r: number[]): number => 1 - r.reduce((s, x) => s + x, 0);
        const d = operandDecimals(vals, cm, P, decimals);
        lines.push(`${symbol} = ${rewritten}1 − P(X ≤ ${compTop}) = 1 − ${vals.length === 1 ? t.dec(vals[0]!, d) : `(${vals.map((x) => t.dec(x, d)).join(" + ")})`} = ${fin}`);
        if (compTop > 0) lines.push(`P(X ≤ ${compTop}) = ${asTerms(0, compTop)}`);
        else lines.push(`P(X = 0) = ${single(0)} = ${t.dec(vals[0]!, decimals)}`);
      } else if (compBottom !== null && (model as { n: number }).n - compBottom + 1 <= 6) {
        const n = (model as { n: number }).n;
        const vals = Array.from({ length: n - compBottom + 1 }, (_, i) => pmfOf(model, compBottom + i));
        const cm = (r: number[]): number => 1 - r.reduce((s, x) => s + x, 0);
        const d = operandDecimals(vals, cm, P, decimals);
        lines.push(`${symbol} = ${rewritten}1 − P(X ≥ ${compBottom}) = 1 − ${vals.length === 1 ? t.dec(vals[0]!, d) : `(${vals.map((x) => t.dec(x, d)).join(" + ")})`} = ${fin}`);
      } else {
        const hiText = Number.isFinite(kHi) ? String(kHi) : "∞";
        lines.push(`${symbol} = ${rewritten}Σ P(X = k), k = ${kLo}, …, ${hiText} = ${fin}`);
      }
    }
  }
  if (o.approximation) lines.push(...approximationPanel(model, ev, locale, decimals, P));
  return lines;
}

function approximationPanel(model: Model, ev: Event, locale: Locale, decimals: number, exact: number): string[] {
  const t = textFor(locale);
  const { mean, sd } = approxMoments(model);
  const lines: string[] = [];
  const name = model.kind === "binomial" ? "n·p" : "λ";
  const npq = sd * sd;
  if (model.kind === "binomial") {
    lines.push(`aproximação normal: μ = np = ${t.short(mean)}; σ² = npq = ${t.short(npq)}; σ = ${t.dec(sd, 4)}`);
    const nq = model.n * (1 - model.p);
    if (mean < 5 || nq < 5) lines.push(`atenção: np = ${t.short(mean)} e nq = ${t.short(nq)}; a aproximação pede np ≥ 5 e nq ≥ 5`);
  } else {
    lines.push(`aproximação normal: μ = ${name} = ${t.short(mean)}; σ = √λ = ${t.dec(sd, 4)}`);
  }
  const range = barRange(model, ev);
  const { lo, hi } = continuityEdges(ev, range);
  const edge = (x: number): string => t.short(x);
  const symbol =
    ev.type === "between"
      ? `P(${ev.a} ≤ X ≤ ${ev.b}) ≈ P(${edge(lo)} < Y < ${edge(hi)})`
      : ev.type === "below"
        ? `P(X ${ev.strict ? "<" : "≤"} ${ev.b}) ≈ P(Y < ${edge(hi)})`
        : ev.type === "above"
          ? `P(X ${ev.strict ? ">" : "≥"} ${ev.a}) ≈ P(Y > ${edge(lo)})`
          : `P(X = ${(ev as { k: number }).k}) ≈ P(${edge(lo)} < Y < ${edge(hi)})`;
  lines.push(`com correção de continuidade (±0,5), Y ~ N(${t.short(mean)}; ${t.short(npq)}):`);
  lines.push(symbol);
  const zs: { text: string; exact: boolean; x: number }[] = [];
  for (const x of [lo, hi]) {
    if (!Number.isFinite(x)) continue;
    zs.push({ ...t.z((x - mean) / sd), x });
  }
  const sdText = model.kind === "binomial" || Number.isInteger(npq * 1e6) ? `√${t.short(npq)}` : t.dec(sd, 4);
  const zLine = zs.map((zz, i) => `z${sub(zs.length === 1 ? 1 : i + 1)} = (${edge(zz.x)} ${mean < 0 ? "+" : "−"} ${t.short(Math.abs(mean))})/${sdText} ${zz.exact ? "=" : "≈"} ${zz.text}`).join("; ");
  lines.push(zLine);
  const approx = approximateProbability(model, ev);
  const zList = zs.map((zz) => (zz.x - mean) / sd);
  if (ev.type === "above") {
    lines.push(`≈ 1 − Φ(${zs[0]!.text}) = ${t.dec(approx, decimals)}`);
  } else if (ev.type === "below") {
    lines.push(`≈ Φ(${zs[0]!.text}) = ${t.dec(approx, decimals)}`);
  } else {
    const pa = phi(zList[0]!);
    const pb = phi(zList[1]!);
    const d = operandDecimals([pb, pa], (r) => r[0]! - r[1]!, approx, decimals);
    lines.push(`≈ Φ(${zs[1]!.text}) − Φ(${zs[0]!.text}) = ${t.dec(pb, d)} − ${t.dec(pa, d)} = ${t.dec(approx, decimals)}`);
  }
  const diff = approx - exact;
  lines.push(`valor exato ${t.dec(exact, decimals)}; a aproximação erra ${t.dec(Math.abs(diff), decimals)}`);
  return lines;
}

function normalPanel(model: Extract<Model, { kind: "normal" }>, ev: Event, locale: Locale, decimals: number, P: number, pct: string): string[] {
  const t = textFor(locale);
  const lines: string[] = [];
  const standard = model.mean === 0 && model.sd === 1;
  const V = standard ? "Z" : "X";
  if (!standard) lines.push(`μ = ${t.short(model.mean)}; σ = ${t.short(model.sd)}`);
  const zOf = (x: number): number => (x - model.mean) / model.sd;
  const num = (x: number): string => (model.mean === 0 ? t.short(x) : `(${t.short(x)} ${model.mean < 0 ? "+" : MINUS} ${t.short(Math.abs(model.mean))})`);
  const zLine = (name: string, x: number): string => {
    const zz = t.z(zOf(x));
    return `${name} = ${num(x)}/${t.short(model.sd)} ${zz.exact ? "=" : "≈"} ${zz.text}`;
  };
  const cmp = (op: string, x: number): string => `P(${V} ${op} ${t.short(x)})`;
  const zt = (x: number): string => t.z(zOf(x)).text;
  const phiT = (x: number, d: number): string => t.dec(phi(zOf(x)), d);
  const tailT = (x: number, d: number): string => t.dec(phi(-zOf(x)), d);
  switch (ev.type) {
    case "between": {
      if (!standard) lines.push(`${zLine("z₁", ev.a)}; ${zLine("z₂", ev.b)}`);
      const pb = phi(zOf(ev.b));
      const pa = phi(zOf(ev.a));
      // both above the mean: the tails are the accurate operands, but the reader's table is Φ
      const d = operandDecimals([pb, pa], (r) => r[0]! - r[1]!, P, decimals);
      const std = standard ? "" : `P(${zt(ev.a)} < Z < ${zt(ev.b)}) = `;
      lines.push(`P(${t.short(ev.a)} < ${V} < ${t.short(ev.b)}) = ${std}Φ(${zt(ev.b)}) ${MINUS} Φ(${zt(ev.a)}) = ${t.dec(pb, d)} ${MINUS} ${t.dec(pa, d)} = ${t.dec(P, decimals)} ≈ ${pct}`);
      break;
    }
    case "below": {
      if (!standard) lines.push(zLine("z", ev.b));
      const std = standard ? "" : `P(Z < ${zt(ev.b)}) = `;
      lines.push(`${cmp("<", ev.b)} = ${std}Φ(${zt(ev.b)}) = ${phiT(ev.b, decimals)} ≈ ${pct}`);
      break;
    }
    case "above": {
      if (!standard) lines.push(zLine("z", ev.a));
      const std = standard ? "" : `P(Z > ${zt(ev.a)}) = `;
      const pa = phi(zOf(ev.a));
      const d = operandDecimals([pa], (r) => 1 - r[0]!, P, decimals);
      lines.push(`${cmp(">", ev.a)} = ${std}1 ${MINUS} Φ(${zt(ev.a)}) = 1 ${MINUS} ${t.dec(pa, d)} = ${tailT(ev.a, decimals)} ≈ ${pct}`);
      break;
    }
    case "tails": {
      const tail = phi(-ev.z);
      const zz = t.z(ev.z);
      if (ev.alpha !== undefined) {
        const conf = 1 - ev.alpha / 2;
        lines.push(`α = ${t.short(ev.alpha)}: z = Φ⁻¹(1 ${MINUS} α/2) = Φ⁻¹(${t.short(tidy(conf))}) ${zz.exact ? "=" : "≈"} ${zz.text}`);
      }
      const d = operandDecimals([tail], (r) => 2 * r[0]!, P, decimals);
      lines.push(`P(|Z| > ${zz.text}) = 2 · [1 ${MINUS} Φ(${zz.text})] = 2 · ${t.dec(tail, d)} = ${t.dec(P, decimals)} ≈ ${pct}`);
      lines.push(`valores críticos: z = ±${zz.text}; cada cauda tem α/2 = ${t.dec(tail, decimals)}; 1 ${MINUS} α = ${t.dec(1 - P, decimals)}`);
      if (!standard) {
        const lo = model.mean - ev.z * model.sd;
        const hi = model.mean + ev.z * model.sd;
        lines.push(`x = μ ± z·σ = ${t.short(model.mean)} ± ${zz.text} · ${t.short(model.sd)}: ${t.short(roundToSd(lo, model.sd))} e ${t.short(roundToSd(hi, model.sd))}`);
      }
      break;
    }
    default:
      break;
  }
  return lines;
}

// ---- drawing ---------------------------------------------------------------------------------------------------

type XY = [number, number];
type LabelSpec = { text: string; x: number; bold: boolean; colour: string; id: string; annotates?: string };

/** In a panel line an operator stays with both its neighbours: a line never ends on "P(X ≤ 3) =" nor begins with "+". */
const OPERATORS = new Set(["=", "≈", "+", MINUS, "·", "<", ">", "≤", "≥", "/", "±"]);
const OPERATOR_RULES: WrapRules = { joinsPrevious: (w) => OPERATORS.has(w), joinsNext: (w) => OPERATORS.has(w) };
const NICE = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

/**
 * The plane's own geometry, computed from the law and the event alone: the
 * x range (bars, or μ ± reach·σ), the pixels per x unit and per unit of density
 * (the tallest thing drawn is PEAK_PX high), and where x = 0, density = 0 falls.
 * Exported so a test can decode drawn marks back to (x, density) with the same
 * numbers the drawing used.
 */
export function planeGeometry(
  model: Model,
  ev: Event,
  decimals: number,
  approxOn: boolean,
): { xlo: number; xhi: number; win: { lo: number; hi: number } | undefined; reach: number; unitX: number; unitY: number; origin: Point } {
  const moments = approxMoments(model);
  let xlo: number;
  let xhi: number;
  let win: { lo: number; hi: number } | undefined;
  let reach = 4;
  if (model.kind !== "normal") {
    win = barWindow(model, ev, decimals);
    xlo = win.lo - 0.5;
    xhi = win.hi + 0.5;
  } else {
    reach = normalReach(model, ev, decimals);
    xlo = model.mean - reach * model.sd;
    xhi = model.mean + reach * model.sd;
  }
  const unitX = PLOT_W / (xhi - xlo);
  let ymax: number;
  if (win !== undefined) {
    ymax = 0;
    for (let k = win.lo; k <= win.hi; k += 1) ymax = Math.max(ymax, pmfOf(model, k));
    if (approxOn) ymax = Math.max(ymax, normalPdf(moments.mean, moments.mean, moments.sd));
  } else {
    ymax = normalPdf(0, 0, model.kind === "normal" ? model.sd : 1);
  }
  return { xlo, xhi, win, reach, unitX, unitY: PEAK_PX / ymax, origin: { x: ML - xlo * unitX, y: BASE_Y } };
}

/** The frame a figure for this input is drawn in: for tests that decode marks back to axis units. */
export function planeOf(input: DistributionInput): { origin: Point; xUnit: number; yUnit: number } {
  const raw = input as unknown as Record<string, unknown>;
  const model = parseModel(raw);
  const ev = parseEvent(model, raw.event);
  const g = planeGeometry(model, ev, raw.decimals === undefined ? 4 : (raw.decimals as number), raw.approximation !== undefined && raw.answers !== false);
  return { origin: g.origin, xUnit: g.unitX, yUnit: g.unitY };
}

export function expandDistribution(input: DistributionInput): FigureSpec {
  const raw = input as unknown as Record<string, unknown>;
  const locale = input.locale ?? "pt-BR";
  const model = parseModel(raw);
  const ev = parseEvent(model, raw.event);
  const decimalsRaw = raw.decimals === undefined ? 4 : v.finite(raw.decimals, "distribution.decimals");
  if (!Number.isInteger(decimalsRaw) || decimalsRaw < 1 || decimalsRaw > 6) throw new SpecError(`distribution.decimals must be a whole number from 1 to 6, got ${decimalsRaw}`);
  const decimals = decimalsRaw;
  const standardNormal = model.kind === "normal" && model.mean === 0 && model.sd === 1;
  // for the standard normal x IS z: a second row would print every number twice
  const answers = v.optionalBoolean(raw, "answers", "distribution") !== false;
  const showZRequested = v.optionalBoolean(raw, "showZ", "distribution") === true && !standardNormal;
  // the z row is the standardisation an exercise asks for; the question figure carries x only
  const showZ = showZRequested && answers;
  const tickLabels = v.optionalBoolean(raw, "tickLabels", "distribution") !== false;
  const approxAsked = raw.approximation !== undefined;
  // the approximating normal, its continuity edges and its N(μ; σ²) are the solution of "aproxime"
  const approxOn = approxAsked && answers;
  if (approxAsked) {
    if (raw.approximation !== "normal") throw new SpecError(`distribution.approximation must be "normal", got ${JSON.stringify(raw.approximation)}`);
    if (model.kind === "normal") throw new SpecError("distribution.approximation: a normal needs no approximation; it applies to a binomial or a Poisson");
  }
  if (showZRequested && model.kind !== "normal" && !approxAsked) {
    throw new SpecError("distribution.showZ: the z axis belongs to a normal, or to a discrete law drawn with approximation: \"normal\"");
  }
  const t = textFor(locale);
  const P = eventProbability(model, ev);
  const discrete = model.kind !== "normal";
  const moments = approxMoments(model);

  // ---- the horizontal extent and the two scales -------------------------------------------
  const { xlo, xhi, win, reach, unitX, unitY, origin } = planeGeometry(model, ev, decimals, approxOn);
  const pdfAt = (x: number): number => (model.kind === "normal" ? normalPdf(x, model.mean, model.sd) : normalPdf(x, moments.mean, moments.sd));
  const frame: Frame & { origin: Point } = { id: "plane", origin, xUnit: unitX, yUnit: unitY };
  const px = (x: number, y: number): Point => resolveInFrame(frame, x, y);
  const framed = (x: number, y: number): FramedPoint => ({ frame: frame.id, x, y });

  // ---- what is shaded ------------------------------------------------------------------------------
  type Region = { lo: number; hi: number; id: string; prob: number; text: string };
  const regions: Region[] = [];
  const range = discrete ? barRange(model, ev) : { kLo: 0, kHi: 0 };
  if (model.kind === "normal") {
    const za = (x: number): number => (x - model.mean) / model.sd;
    const prob = (a: number, b: number): number => probZ(za(a), za(b));
    const lo = xlo;
    const hi = xhi;
    switch (ev.type) {
      case "between":
        regions.push({ lo: ev.a, hi: ev.b, id: "region-0", prob: P, text: `P = ${t.dec(P, decimals)}` });
        break;
      case "below":
        regions.push({ lo, hi: ev.b, id: "region-0", prob: prob(lo, ev.b), text: `P = ${t.dec(P, decimals)}` });
        break;
      case "above":
        regions.push({ lo: ev.a, hi, id: "region-0", prob: prob(ev.a, hi), text: `P = ${t.dec(P, decimals)}` });
        break;
      case "tails": {
        const half = phi(-ev.z);
        const a = model.mean - ev.z * model.sd;
        const b = model.mean + ev.z * model.sd;
        regions.push({ lo, hi: a, id: "region-0", prob: prob(lo, a), text: `α/2 = ${t.dec(half, decimals)}` });
        regions.push({ lo: b, hi, id: "region-1", prob: prob(b, hi), text: `α/2 = ${t.dec(half, decimals)}` });
        break;
      }
      default:
        break;
    }
  }

  // ---- marks (paint order: axis, bars/regions, curves, drops) ------------------------------------------------
  const board = new Board(W, 10, PAPER);
  const marks: Mark[] = [];
  const kids: Block[] = [];
  // labels searched for a region stay above the axis: the rows beneath it are placed, not searched
  const placer = new Placer({ x: 12, y: 8, width: W - 24, height: BASE_Y - 8 });
  const lineMark = (id: string, pts: Point[], o: { stroke: string; width: number; dash?: "dashed" | "dotted"; grid?: boolean; series?: string }): Mark => {
    const m: Mark = {
      id,
      ...(o.grid ? { gridOf: frame.id } : {}),
      from: pts[0]!,
      segments: pts.slice(1).map((p) => ({ line: p })),
      close: false,
      fill: "none",
      stroke: o.stroke,
      strokeWidth: o.width,
      ...(o.dash === undefined ? {} : { lineStyle: o.dash }),
      ...(o.series === undefined ? {} : { series: o.series }),
    };
    return m;
  };
  const framedMark = (id: string, pts: XY[], o: { fill: string; stroke: string; width: number; close: boolean; dash?: "dashed"; series?: string }): Mark => ({
    id,
    from: framed(pts[0]![0], pts[0]![1]),
    segments: pts.slice(1).map((p) => ({ line: framed(p[0], p[1]) })),
    close: o.close,
    fill: o.fill,
    stroke: o.stroke,
    strokeWidth: o.width,
    ...(o.dash === undefined ? {} : { lineStyle: o.dash }),
    ...(o.series === undefined ? {} : { series: o.series }),
  });
  const ink = (id: string, pts: Point[], closed = false, competes = true): void => {
    placer.addInk(id, closed ? [...pts, pts[0]!] : pts, competes);
  };
  // The polygon is inscribed in the curve, so its area is short of the true area by the trapezoid rule's error,
  // (h²/12)·(f′(b) − f′(a)) <= (h²/12)·0.48/σ². Choosing h = σ·√(0.5·10^−decimals) keeps that under a fiftieth of the
  // last printed digit; below a quarter of a pixel more vertices are only cost.
  const sdDrawn = model.kind === "normal" ? model.sd : moments.sd;
  const stepX = Math.max(0.25 / unitX, sdDrawn * Math.sqrt(0.5 * 10 ** -decimals));
  const sample = (fn: (x: number) => number, a: number, b: number): XY[] => {
    const n = Math.max(6, Math.ceil((b - a) / stepX));
    return Array.from({ length: n + 1 }, (_, i) => {
      const x = i === n ? b : a + ((b - a) * i) / n;
      return [x, fn(x)] as XY;
    });
  };

  // axis and ticks: grid furniture of this frame
  const axis = lineMark("axis-x", [px(xlo, 0), px(xhi, 0)], { stroke: FAINT, width: 1.6, grid: true });
  marks.push(axis);
  ink("axis-x", [px(xlo, 0), px(xhi, 0)], false, false);

  // boundaries: where the labels go under the axis
  type Bound = { x: number; id: string; hidden?: boolean; xText: string; zText?: string; colour: string; xRow?: number; zRow?: number };
  const bounds: Bound[] = [];
  const stdMean = discrete ? moments.mean : (model as { mean: number }).mean;
  const stdSd = discrete ? moments.sd : (model as { sd: number }).sd;
  const zLabel = (x: number): string => t.z((x - stdMean) / stdSd).text;
  if (model.kind === "normal") {
    const xs = new Set<number>();
    for (const r of regions) for (const x of [r.lo, r.hi]) if (x > xlo + 1e-9 && x < xhi - 1e-9) xs.add(x);
    [...xs].sort((a, b) => a - b).forEach((x, i) => bounds.push({ x, id: `boundary-${i}`, hidden: !answers && ev.type === "tails" && ev.alpha !== undefined, xText: t.short(ev.type === "tails" ? roundToSd(x, stdSd) : Number(x.toPrecision(9))), zText: showZ ? zLabel(x) : undefined, colour: ACCENT_TEXT }));
  } else if (approxOn) {
    const { lo, hi } = continuityEdges(ev, range);
    [lo, hi].filter(Number.isFinite).forEach((x, i) => bounds.push({ x, id: `boundary-${i}`, xText: t.short(x), zText: showZ ? zLabel(x) : undefined, colour: APPROX_TEXT }));
  } else {
    // the finite ends of the event's bars: a bar is named by the whole number under it
    const ks = ev.type === "between" ? [ev.a, ev.b] : ev.type === "below" ? [range.kHi] : ev.type === "above" ? [range.kLo] : [range.kLo];
    ks.forEach((k, i) => bounds.push({ x: k, id: `boundary-${i}`, xText: String(k), colour: ACCENT_TEXT }));
  }

  // ---- ticks and the label rows beneath the axis -------------------------------------------------------------------
  const labelOf = (text: string, o: LabelOptions): { w: number; h: number } => board.extent(text, o);
  type Row = { y: number; name: string };
  const rowX: Row = { y: BASE_Y + FIRST_ROW, name: standardNormal ? "z" : "x" };
  const staggerNeeded = ((): boolean => {
    const boxes = bounds.map((b) => {
      const w = labelOf(b.xText, { size: 13, weight: 700 }).w;
      return { x: px(b.x, 0).x, w };
    });
    for (let i = 0; i + 1 < boxes.length; i += 1) if (Math.abs(boxes[i]!.x - boxes[i + 1]!.x) < (boxes[i]!.w + boxes[i + 1]!.w) / 2 + 6) return true;
    return false;
  })();
  const rowX2: Row | null = staggerNeeded ? { y: BASE_Y + FIRST_ROW + ROW_H, name: "" } : null;
  const zStart = BASE_Y + FIRST_ROW + ROW_H * (staggerNeeded ? 2 : 1);
  const rowZ: Row | null = showZ ? { y: zStart, name: "z" } : null;
  const rowZ2: Row | null = showZ && staggerNeeded ? { y: zStart + ROW_H, name: "" } : null;
  const plotAreaBottom = (rowZ2 ?? rowZ ?? rowX2 ?? rowX).y + 22;

  const spots: { row: Row; centre: number; w: number }[] = [];
  const claimBox = (row: Row, cx: number, w: number): void => {
    spots.push({ row, centre: cx, w });
    placer.reserve({ x: cx - w / 2, y: row.y - 11, width: w, height: 22 });
  };
  const overlapsRow = (row: Row, cx: number, w: number): boolean => spots.some((s) => s.row === row && Math.abs(s.centre - cx) < (s.w + w) / 2 + 6);

  const drops: { b: Bound; length: number }[] = [];
  const boundaryLabels: LabelSpec[] = [];
  bounds.forEach((b, i) => {
    const second = staggerNeeded && i % 2 === 1;
    const row = second ? rowX2! : rowX;
    const cx = px(b.x, 0).x;
    const w = labelOf(b.xText, { size: 13, weight: 700 }).w;
    if (b.hidden === true) {
      // the critical value of a test given by alpha is what the exercise asks for: the line stays, its number does not
      b.xRow = row.y;
      drops.push({ b, length: row.y - 11 - BASE_Y });
      return;
    }
    claimBox(row, cx, w);
    boundaryLabels.push({ text: b.xText, x: cx, bold: true, colour: b.colour, id: `label-${b.id}-x`, annotates: b.id });
    const rowLabelY = row.y;
    b.xRow = rowLabelY;
    drops.push({ b, length: rowLabelY - 11 - BASE_Y });
    if (b.zText !== undefined) {
      const zrow = second ? rowZ2! : rowZ!;
      const zw = labelOf(b.zText, { size: 13, weight: 700 }).w;
      claimBox(zrow, cx, zw);
      boundaryLabels.push({ text: b.zText, x: cx, bold: true, colour: b.colour, id: `label-${b.id}-z`, annotates: b.id });
      b.zRow = zrow.y;
    }
  });

  // tick positions: a normal numbers x and z at the same μ + kσ; a discrete law numbers the integers and,
  // with the approximation, z at whole values of z (which fall between the integers)
  type Tick = { x: number; text: string };
  const xTicks: Tick[] = [];
  const zTicks: Tick[] = [];
  if (discrete) {
    const step = NICE.find((s) => s * unitX >= 30) ?? 1000;
    for (let k = Math.ceil(win!.lo / step) * step; k <= win!.hi; k += step) xTicks.push({ x: k, text: String(k) });
    if (approxOn) {
      for (let k = Math.ceil((xlo - moments.mean) / moments.sd); k <= Math.floor((xhi - moments.mean) / moments.sd); k += 1) {
        zTicks.push({ x: moments.mean + k * moments.sd, text: t.short(k) });
      }
    }
  } else {
    const m = model as Extract<Model, { kind: "normal" }>;
    for (let k = -Math.floor(reach); k <= Math.floor(reach); k += 1) {
      const x = m.mean + k * m.sd;
      xTicks.push({ x, text: t.short(Number(x.toPrecision(9))) });
      zTicks.push({ x, text: t.short(k) });
    }
  }
  const tickLabelSpecs: LabelSpec[] = [];
  for (const [i, tk] of xTicks.entries()) {
    const cx = px(tk.x, 0).x;
    marks.push(lineMark(`tick-${i}`, [px(tk.x, 0), { x: cx, y: BASE_Y + 6 }], { stroke: FAINT, width: 1.6, grid: true }));
    if (!tickLabels) continue;
    const w = labelOf(tk.text, { size: 12 }).w;
    if (!overlapsRow(rowX, cx, w) && (rowX2 === null || !overlapsRow(rowX2, cx, w))) {
      claimBox(rowX, cx, w);
      tickLabelSpecs.push({ text: tk.text, x: cx, bold: false, colour: SOFT, id: `tick-label-x-${i}` });
    }
  }
  if (rowZ !== null && tickLabels) {
    for (const [i, tk] of zTicks.entries()) {
      const cx = px(tk.x, 0).x;
      const zw = labelOf(tk.text, { size: 12 }).w;
      if (!overlapsRow(rowZ, cx, zw) && (rowZ2 === null || !overlapsRow(rowZ2, cx, zw))) {
        claimBox(rowZ, cx, zw);
        tickLabelSpecs.push({ text: tk.text, x: cx, bold: false, colour: SOFT, id: `tick-label-z-${i}` });
      }
    }
  }

  // ---- shaded regions and curves ----------------------------------------------------------------------------------------------
  const outlines = new Map<string, Point[]>();
  const regionText = new Map<string, string>();
  const curvePieces: { id: string; pts: XY[] }[] = [];
  if (model.kind === "normal") {
    const pdf = (x: number): number => normalPdf(x, model.mean, model.sd);
    for (const r of regions) {
      const top = sample(pdf, r.lo, r.hi);
      const shape: XY[] = [[r.lo, 0], ...top, [r.hi, 0]];
      marks.push(framedMark(r.id, shape, { fill: `${ACCENT}${TINT}`, stroke: INK, width: 1.9, close: true }));
      const outline = shape.map((p) => px(p[0], p[1]));
      outlines.set(r.id, outline);
      ink(r.id, outline, true);
      if (answers) regionText.set(r.id, r.text);
    }
    // the curve where it is not shaded: each piece starts and stops on a region's edge
    const cuts = [xlo, ...regions.flatMap((r) => [r.lo, r.hi]), xhi].sort((a, b) => a - b);
    const covered = (mid: number): boolean => regions.some((r) => mid > r.lo && mid < r.hi);
    let n = 0;
    for (let i = 0; i + 1 < cuts.length; i += 1) {
      const a = cuts[i]!;
      const b = cuts[i + 1]!;
      if (b - a < 1e-9 || covered((a + b) / 2)) continue;
      const pts = sample(pdf, a, b);
      const id = `curve-${n}`;
      n += 1;
      curvePieces.push({ id, pts });
      marks.push(framedMark(id, pts, { fill: "none", stroke: INK, width: 1.9, close: false }));
      ink(id, pts.map((p) => px(p[0], p[1])));
    }
  } else {
    // bars: every k in the window, then the event's bars, then the merged outline
    const hit = (k: number): boolean => k >= range.kLo && k <= range.kHi;
    const bar = (k: number): XY[] => {
      const h = pmfOf(model, k);
      return [[k - 0.5, 0], [k - 0.5, h], [k + 0.5, h], [k + 0.5, 0]];
    };
    for (let k = win!.lo; k <= win!.hi; k += 1) {
      const id = `bar-${k}`;
      const isHit = hit(k);
      marks.push(framedMark(id, bar(k), { fill: isHit ? HIT_FILL : BAR_FILL, stroke: PAPER, width: 1.6, close: true }));
      ink(id, bar(k).map((p) => px(p[0], p[1])), true, true);
    }
    const kTop = Math.min(range.kHi, win!.hi);
    const stair: XY[] = [[range.kLo - 0.5, 0]];
    for (let k = range.kLo; k <= kTop; k += 1) {
      const h = pmfOf(model, k);
      stair.push([k - 0.5, h], [k + 0.5, h]);
    }
    stair.push([kTop + 0.5, 0]);
    marks.push(framedMark("event-region", stair, { fill: "none", stroke: ACCENT, width: 2.2, close: true }));
    const outline = stair.map((p) => px(p[0], p[1]));
    outlines.set("event-region", outline);
    ink("event-region", outline, true);
    if (answers) regionText.set("event-region", `P = ${t.dec(P, decimals)}`);
    if (approxOn) {
      const pts = sample(pdfAt, xlo, xhi);
      curvePieces.push({ id: "approx-curve", pts });
      marks.push(framedMark("approx-curve", pts, { fill: "none", stroke: APPROX, width: 2, close: false, dash: "dashed", series: "aprox" }));
      ink("approx-curve", pts.map((p) => px(p[0], p[1])));
    }
  }

  // continuity edges and drops beneath the axis
  for (const { b, length } of drops) {
    const cx = px(b.x, 0).x;
    if (discrete && approxOn) {
      const topY = px(0, Math.max(pdfAt(b.x), 0)).y;
      const pts = [{ x: cx, y: BASE_Y + length }, { x: cx, y: Math.min(topY, BASE_Y - 2) }];
      marks.push(lineMark(b.id, pts, { stroke: APPROX, width: 1.5, dash: "dashed" }));
      ink(b.id, pts);
    } else {
      const pts = [{ x: cx, y: BASE_Y }, { x: cx, y: BASE_Y + length }];
      marks.push(lineMark(b.id, pts, { stroke: b.colour === ACCENT_TEXT ? ACCENT : APPROX, width: 1.9 }));
      ink(b.id, pts);
    }
  }

  // ---- labels: every piece of ink is down ------------------------------------------------------------------------------
  const headText = model.kind === "normal"
    ? model.mean === 0 && model.sd === 1
      ? "Z ~ N(0; 1)"
      : `X ~ N(${t.short(model.mean)}; ${t.short(model.sd)}²)`
    : model.kind === "binomial"
      ? `X ~ B(${model.n}; ${t.short(model.p)})`
      : `X ~ Poisson(${t.short(model.lambda)})`;
  const head = labelOf(headText, { size: 15, weight: 700 });
  const putLabel = (text: string, cx: number, cy: number, o: LabelOptions): Block => {
    const b = board.label(text, cx, cy, { ...o, claim: false });
    kids.push(b);
    return b;
  };
  putLabel(headText, ML + head.w / 2, 26, { size: 15, weight: 700, colour: INK, align: "start", width: head.w, freeStanding: true, id: "heading" });
  placer.reserve({ x: ML, y: 26 - head.h / 2, width: head.w, height: head.h });

  const rowName = (row: Row, name: string): void => {
    if (name === "") return;
    const w = labelOf(name, { size: 13, weight: 700 }).w;
    putLabel(name, 30, row.y, { size: 13, weight: 700, colour: SOFT, width: w, freeStanding: true, id: `axis-name-${name}` });
  };
  rowName(rowX, rowX.name);
  if (rowZ !== null) rowName(rowZ, "z");
  for (const s of tickLabelSpecs) {
    const isZ = s.id.startsWith("tick-label-z");
    const row = isZ ? rowZ! : rowX;
    const w = labelOf(s.text, { size: 12 }).w;
    putLabel(s.text, s.x, row.y, { size: 12, colour: s.colour, width: w, freeStanding: true, id: s.id });
  }
  for (const s of boundaryLabels) {
    const isZ = s.id.endsWith("-z");
    const b = bounds.find((bb) => bb.id === s.annotates)!;
    const y = isZ ? b.zRow! : b.xRow!;
    const w = labelOf(s.text, { size: 13, weight: 700 }).w;
    putLabel(s.text, s.x, y, { size: 13, weight: 700, colour: s.colour, width: w, annotates: s.annotates!, id: s.id });
  }

  // region labels
  const pxOutlineDepth = (c: Point, poly: Point[]): number => distanceToPolyline(c, poly, true);
  const spotsFor = (poly: Point[], w: number, h: number, allowInside: boolean): Point[] => {
    const inside: { p: Point; d: number }[] = [];
    const xsP = poly.map((p) => p.x);
    const ysP = poly.map((p) => p.y);
    const x0 = Math.min(...xsP);
    const x1 = Math.max(...xsP);
    const y0 = Math.min(...ysP);
    const y1 = Math.max(...ysP);
    if (allowInside && x1 - x0 > w && y1 - y0 > h) {
      for (let x = x0 + w / 2; x <= x1 - w / 2; x += 5) {
        for (let y = y0 + h / 2; y <= y1 - h / 2; y += 4) {
          if (boxInside({ x, y, hw: w / 2, hh: h / 2 }, poly, 3)) inside.push({ p: { x, y }, d: pxOutlineDepth({ x, y }, poly) });
        }
      }
    }
    inside.sort((a, b) => b.d - a.d);
    const out: Point[] = inside.slice(0, 400).map((s) => s.p);
    // beside: rings around the outline, nearest first
    let area2 = 0;
    let cxSum = 0;
    let cySum = 0;
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const cross = a.x * b.y - b.x * a.y;
      area2 += cross;
      cxSum += (a.x + b.x) * cross;
      cySum += (a.y + b.y) * cross;
    }
    // where the region's mass sits: the label belongs above it, not at the far end of the outline
    const anchor = area2 === 0 ? poly[0]! : { x: cxSum / (3 * area2), y: cySum / (3 * area2) };
    const ring: { p: Point; score: number }[] = [];
    const seen = new Set<string>();
    const stride = Math.max(1, Math.floor(poly.length / 90));
    for (let i = 0; i < poly.length; i += stride) {
      const a = poly[i]!;
      for (const gap of [3, 7, 12, 19, 28, 40, 54]) {
        for (let k = 0; k < 20; k += 1) {
          const ang = (k * Math.PI * 2) / 20;
          const dx = Math.cos(ang);
          const dy = Math.sin(ang);
          const c = { x: a.x + dx * (gap + (w / 2) * Math.abs(dx)), y: a.y + dy * (gap + (h / 2) * Math.abs(dy)) };
          const key = `${Math.round(c.x / 2)},${Math.round(c.y / 2)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (c.y > BASE_Y - h / 2 - 2) continue;
          const score = rectToPolyline(rectAt(c, w, h), poly) + 0.08 * Math.abs(c.x - anchor.x) + (c.y > anchor.y ? 4 : 0);
          ring.push({ p: c, score });
        }
      }
    }
    ring.sort((a, b) => a.score - b.score);
    return [...out, ...ring.slice(0, 5000).map((s) => s.p)];
  };
  for (const [id, poly] of outlines) {
    const text = regionText.get(id);
    if (text === undefined) continue;
    const o: LabelOptions = { size: 14, weight: 700, colour: ACCENT_TEXT };
    const { w, h } = board.extent(text, o);
    const best = placer.choose({ kind: "element", id }, w, h, spotsFor(poly, w, h, model.kind === "normal"));
    const block = putLabel(text, best.centre.x, best.centre.y, { ...o, width: w, annotates: id, id: `label-${id}` });
    void block;
    placer.commit(rectAt(best.centre, w, h));
  }
  if (approxOn) {
    const text = model.kind === "binomial" || model.kind === "poisson" ? `N(${t.short(moments.mean)}; ${t.short(roundKeepingNonzero(moments.sd * moments.sd, 4))})` : "";
    const o: LabelOptions = { size: 13, weight: 700, colour: APPROX_TEXT };
    const { w, h } = board.extent(text, o);
    const curve = curvePieces.find((c) => c.id === "approx-curve")!;
    const poly = curve.pts.map((p) => px(p[0], p[1]));
    // right of the peak, on the falling flank, above the curve
    const cands: Point[] = [];
    for (let i = Math.floor(poly.length * 0.55); i < poly.length; i += 3) {
      const a = poly[i]!;
      for (const gap of [6, 12, 20, 30]) cands.push({ x: a.x + w / 2 + gap, y: a.y - h / 2 - 2 }, { x: a.x + w / 2 + gap, y: a.y - gap }, { x: a.x + gap, y: a.y - h / 2 - gap });
    }
    const best = placer.choose({ kind: "element", id: "approx-curve" }, w, h, cands);
    const block = putLabel(text, best.centre.x, best.centre.y, { ...o, width: w, names: "aprox", id: "label-approx" });
    void block;
    placer.commit(rectAt(best.centre, w, h));
  }

  // ---- the panel -----------------------------------------------------------------------------------------------------------------
  const lines = answers ? panelLines(model, ev, { locale, decimals, approximation: approxOn }) : [];
  const maxLine = W - 2 * ML;
  // the line that is the result is set in bold, which is wider than the regular face the board measures: allow for it
  const BOLD = 1.1;
  const panelWidth = (text: string): number => board.extent(text, { size: PANEL_FONT }).w * (text.startsWith("P(") ? BOLD : 1);
  const wrapped = lines.flatMap((l) => wrapText(l, maxLine, (s) => board.extent(s, { size: PANEL_FONT }).w * (l.startsWith("P(") ? BOLD : 1), OPERATOR_RULES));
  let y = plotAreaBottom + 34;
  wrapped.forEach((text, i) => {
    const w = panelWidth(text);
    putLabel(text, ML + w / 2, y, { size: PANEL_FONT, colour: text.startsWith("P(") ? INK : SOFT, weight: text.startsWith("P(") ? 700 : 400, align: "start", width: w, freeStanding: true, id: `panel-line-${i}` });
    y += PANEL_LINE_H;
  });
  const height = Math.ceil(y - PANEL_LINE_H + 30);

  // ---- the spec -------------------------------------------------------------------------------------------------------------------
  const title = input.title ?? (answers ? `${headText}: ${symbolOf(model, ev, t)} = ${t.dec(P, decimals)}` : `${headText}: ${symbolOf(model, ev, t)}`);
  const spec: FigureSpec = {
    version: 1,
    title,
    canvas: { padding: 0, background: PAPER, theme: "print", constraints: { allowOverlap: true, allowConnectorCrossing: true, allowCurvedConnectors: true } },
    root: {
      type: "scene",
      layout: "absolute",
      width: W,
      height,
      frames: [frame],
      children: kids,
      connectors: [],
      marks,
    } as Scene,
  };
  return parseSpec(spec);
}

/** "P(60 < X < 75)": the event as a reader writes it, for the title. */
export function symbolOf(model: Model, ev: Event, t: { short: (x: number) => string }): string {
  const V = model.kind === "normal" && model.mean === 0 && model.sd === 1 ? "Z" : "X";
  switch (ev.type) {
    case "between":
      return model.kind === "normal" ? `P(${t.short(ev.a)} < ${V} < ${t.short(ev.b)})` : `P(${ev.a} ≤ X ≤ ${ev.b})`;
    case "below":
      return model.kind === "normal" || ev.strict ? `P(${V} < ${t.short(ev.b)})` : `P(X ≤ ${ev.b})`;
    case "above":
      return model.kind === "normal" || ev.strict ? `P(${V} > ${t.short(ev.a)})` : `P(X ≥ ${ev.a})`;
    case "equals":
      return `P(X = ${ev.k})`;
    default:
      return `P(|Z| > ${t.short(roundKeepingNonzero(ev.z, 3))})`;
  }
}

// ---- validation --------------------------------------------------------------------------------------------------------------------

export function validateDistributionInput(raw: Record<string, unknown>): void {
  const path = "distribution";
  for (const key of Object.keys(raw)) {
    if (!KEYS.includes(key)) throw new SpecError(`${path}.${key} is not a field; use ${KEYS.filter((k) => k !== "preset").join(", ")}`);
  }
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  v.optionalBoolean(raw, "showZ", path);
  v.optionalBoolean(raw, "tickLabels", path);
  // the model, the event and every number are exercised by building the figure
  expandDistribution(raw as unknown as DistributionInput);
}
