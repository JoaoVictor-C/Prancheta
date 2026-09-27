/**
 * Asymptotes and holes of a function y = f(x), FOUND from its expression
 * (ADR 0038): the pure part. Nothing here draws or places; `preset.ts` does,
 * from these.
 *
 * Where to look is read off the expression's own tree: a division is
 * undefined where its denominator vanishes, a logarithm where its argument
 * does, tan where cos of its argument does, a power where its base does.
 * Those zeros are found by the sign chart's root finder (`criticalPoints`,
 * sign change and bisection, snapped), joined by the poles that finder sees
 * in f itself. None of them is believed on sight. Each candidate is asked
 * of `numeric.limit` from both sides:
 *
 *  - a side that runs off to ±∞ makes x = a a VERTICAL asymptote;
 *  - two finite sides that agree, where f itself is undefined, make (a, L) a
 *    HOLE -- a removable discontinuity;
 *  - anything else (a jump, a limit the numerics cannot settle) is nothing,
 *    and nothing is drawn.
 *
 * At ±∞ the same kit decides: a finite limit is a HORIZONTAL asymptote on
 * that side; an infinite one with a finite, nonzero m = lim f(x)/x and a
 * finite q = lim (f(x) − mx) is an OBLIQUE one. Every number is snapped to
 * the exact value it is -- a small fraction, ±√n, or kπ/q -- when it agrees
 * with one, and is otherwise printed rounded, with "≈".
 */

import type { Node } from "../../math/expr.ts";
import { compileTree, freeVariables } from "../../math/expr.ts";
import { limit } from "../../math/numeric.ts";
import type { LimitResult } from "../../math/numeric.ts";
import { MINUS, formatNumber, snapExact } from "../../locale/format.ts";
import type { Exact, Locale } from "../../locale/format.ts";
import { criticalPoints } from "../sign-chart/preset.ts";

export type Fn = (x: number) => number;

// ---- exact values ---------------------------------------------------------------

// The snapping helper moved to the one formatter (ADR 0040); re-exported so
// every existing importer keeps its path.
export { snapExact, writeExact } from "../../locale/format.ts";
export type { Exact } from "../../locale/format.ts";

// ---- where to look --------------------------------------------------------------

/** Functions undefined where their argument is zero. */
const LOGS = new Set(["ln", "log", "log10", "log2"]);

/**
 * Where an expression may be undefined or unbounded, read off its tree: the
 * zeros of every denominator, of every logarithm's argument, of cos under
 * every tan, of every power's base. A superset, deliberately -- a candidate
 * costs one limit to dismiss, a miss costs an asymptote.
 */
export function singularCandidates(tree: Node, variable: string, lo: number, hi: number): number[] {
  const subjects: Node[] = [];
  const walk = (node: Node): void => {
    switch (node.kind) {
      case "bin":
        if (node.op === "/") subjects.push(node.right);
        if (node.op === "^") subjects.push(node.left);
        walk(node.left);
        walk(node.right);
        return;
      case "neg":
        walk(node.arg);
        return;
      case "call":
        if (node.name === "tan") subjects.push({ kind: "call", name: "cos", arg: node.arg });
        if (LOGS.has(node.name)) subjects.push(node.arg);
        walk(node.arg);
        return;
      default:
        return;
    }
  };
  walk(tree);
  const out: number[] = [];
  for (const subject of subjects) {
    if (!freeVariables(subject).has(variable)) continue;
    const g = compileTree(subject, [variable]) as Fn;
    for (const c of criticalPoints(g, lo, hi)) {
      if (c.kind === "root") out.push(c.x);
    }
  }
  return out;
}

// ---- what is there ----------------------------------------------------------------

export type Vertical = { x: Exact; left: LimitResult; right: LimitResult };
export type Hole = { x: Exact; y: Exact; left: LimitResult; right: LimitResult };

/** Relative agreement `numeric.limit` itself uses for "the two sides agree". */
const AGREE = 2e-5;
/** Snapping tolerance for a position found by a root finder: bisection is exact to the last few bits. */
const ROOT_SNAP = 1e-7;
/** Snapping tolerance for a limit's value: its tail settles to about this much (numeric.ts, LIMIT_CONVERGE_TOL). */
const LIMIT_SNAP = 1e-5;

/** How a one-sided limit reads in a sentence: "→ +∞", "→ 2", "has no limit (...)". */
export function describeLimit(r: LimitResult): string {
  if (r.kind === "finite") return `→ ${Number(r.value.toPrecision(6))}`;
  if (r.kind === "infinite") return r.sign > 0 ? "→ +∞" : "→ −∞";
  return `has no limit the numerics can confirm (${r.reason})`;
}

/**
 * One candidate x = a, classified by its one-sided limits. `null` when it is
 * neither an asymptote nor a hole (a jump, a continuous point, a limit that
 * would not settle).
 */
export function classify(f: Fn, a: number): { vertical: Vertical } | { hole: Hole } | { neither: { left: LimitResult; right: LimitResult } } {
  const left = limit(f, a, "left");
  const right = limit(f, a, "right");
  const x = snapExact(a, ROOT_SNAP);
  if (left.kind === "infinite" || right.kind === "infinite") return { vertical: { x, left, right } };
  if (
    left.kind === "finite" &&
    right.kind === "finite" &&
    Math.abs(left.value - right.value) <= AGREE * (1 + Math.abs(left.value))
  ) {
    const at = f(x.value);
    if (!Number.isFinite(at)) {
      return { hole: { x, y: snapExact((left.value + right.value) / 2, LIMIT_SNAP), left, right } };
    }
  }
  return { neither: { left, right } };
}

/**
 * Every vertical asymptote and hole of f strictly inside (lo, hi): the
 * expression's singular candidates and the poles `criticalPoints` sees in f,
 * each kept only if its limits confirm it.
 */
export function verticalsAndHoles(f: Fn, tree: Node, variable: string, lo: number, hi: number): { verticals: Vertical[]; holes: Hole[] } {
  const margin = 1e-9 * Math.max(1, hi - lo);
  const raw = [
    ...singularCandidates(tree, variable, lo, hi),
    // A pole the tree did not predict, as the sign chart finds it. Samples
    // deep inside a region where f is undefined (ln x for x < 0) also come
    // back as "poles"; each is dismissed by its limits, which cannot settle
    // on a side where f is NaN.
    ...criticalPoints(f, lo, hi)
      .filter((c) => c.kind === "pole")
      .map((c) => c.x)
      .filter((x) => [-1e-3, 1e-3].some((d) => Number.isFinite(f(x + d)))),
  ];
  const candidates: number[] = [];
  for (const x of raw.map((r) => snapExact(r, ROOT_SNAP).value)) {
    if (x <= lo + margin || x >= hi - margin) continue;
    if (candidates.some((c) => Math.abs(c - x) < 1e-7 * Math.max(1, Math.abs(x)))) continue;
    candidates.push(x);
  }
  candidates.sort((p, q) => p - q);
  const verticals: Vertical[] = [];
  const holes: Hole[] = [];
  for (const a of candidates) {
    const verdict = classify(f, a);
    if ("vertical" in verdict) verticals.push(verdict.vertical);
    else if ("hole" in verdict) holes.push(verdict.hole);
  }
  return { verticals, holes };
}

/** An asymptote at one end, y = mx + q; m = 0 is horizontal. */
export type Slant = { m: Exact; q: Exact };

export type SideResult =
  | { kind: "horizontal"; line: Slant; evidence: LimitResult }
  | { kind: "oblique"; line: Slant; evidence: LimitResult }
  | { kind: "none"; evidence: LimitResult; why: string };

/**
 * f's behaviour as x → +∞ (`side` 1) or −∞ (−1): a horizontal asymptote when
 * the limit is finite; an oblique one when f is unbounded but f(x)/x has a
 * finite nonzero limit m and f(x) − mx a finite limit q; else none, with why.
 *
 * m is snapped before q is asked for: q is read off f(x) − mx at x in the
 * millions, where a rounded m would leave its own error times x behind.
 */
export function atInfinity(f: Fn, side: 1 | -1): SideResult {
  const to = side > 0 ? Infinity : -Infinity;
  const way = side > 0 ? "right" : "left";
  const evidence = limit(f, to, way);
  if (evidence.kind === "finite") {
    return { kind: "horizontal", line: { m: { value: 0, exact: true, form: "rational" }, q: snapExact(evidence.value, LIMIT_SNAP) }, evidence };
  }
  if (evidence.kind === "none") return { kind: "none", evidence, why: `f(x) ${describeLimit(evidence)}` };
  const slope = limit((x) => f(x) / x, to, way);
  if (slope.kind !== "finite") {
    return { kind: "none", evidence, why: `f(x) ${describeLimit(evidence)} and f(x)/x ${describeLimit(slope)}` };
  }
  const m = snapExact(slope.value, LIMIT_SNAP);
  if (m.exact && m.value === 0) {
    return { kind: "none", evidence, why: `f(x) ${describeLimit(evidence)} but f(x)/x → 0: it grows slower than any line` };
  }
  const intercept = limit((x) => f(x) - m.value * x, to, way);
  if (intercept.kind !== "finite") {
    return { kind: "none", evidence, why: `f(x)/x → ${Number(m.value.toPrecision(6))} but f(x) − mx ${describeLimit(intercept)}` };
  }
  return { kind: "oblique", line: { m, q: snapExact(intercept.value, LIMIT_SNAP) }, evidence };
}

/** Is f that very line over [lo, hi]? A line is not its own asymptote in any exercise. */
export function coincides(f: Fn, line: Slant, lo: number, hi: number): boolean {
  let scale = 1;
  let worst = 0;
  let seen = 0;
  for (let i = 0; i <= 64; i += 1) {
    const x = lo + ((hi - lo) * i) / 64;
    const y = f(x);
    // A hole on the line ((x² − 1)/(x − 1) is x + 1 but at 1) does not make
    // the curve any less that line.
    if (!Number.isFinite(y)) continue;
    seen += 1;
    scale = Math.max(scale, Math.abs(y));
    worst = Math.max(worst, Math.abs(y - (line.m.value * x + line.q.value)));
  }
  return seen > 32 && worst <= 1e-9 * scale;
}

export function sameLine(a: Slant, b: Slant): boolean {
  const close = (p: number, q: number): boolean => Math.abs(p - q) <= 1e-9 * Math.max(1, Math.abs(p));
  return close(a.m.value, b.m.value) && close(a.q.value, b.q.value);
}
