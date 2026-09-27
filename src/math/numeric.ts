/**
 * Numeric calculus on PLAIN functions.
 *
 * `expr.ts` compiles a figure's text into `(x: number) => number` for
 * `function-graph` and `sign-chart` to sample. This module is what a preset
 * reaches for once it has that callable and needs a number derived from it
 * over a range: an area, a Riemann sum, a limit, a series' partial sums.
 * It never parses an expression itself and never imports `expr.ts` --
 * a caller that already has a callable (from `compile`, or from its own
 * closed-form derivative or antiderivative) is the only contract here, so
 * this file works for both.
 *
 * The project's standing rule (ADR 0027, `sign-chart`) is that a number
 * which cannot be trusted is refused, never printed with false confidence.
 * Every function here either returns a value it can bound the error of, or
 * throws `NumericError` naming exactly what went wrong -- a pole inside the
 * interval, a sum that would not settle, a limit that could not be told
 * apart from an oscillation. None of these silently return `NaN`: a preset
 * that receives `NaN` from `expr.ts` for an undefined point is expected to
 * treat it as a refusal signal too, and `finite()` below is the one place
 * that turns "not finite" into that decision.
 */

/** A number that could not be trusted, refused instead of printed. */
export class NumericError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NumericError";
  }
}

function finite(y: number, where: string): number {
  if (!Number.isFinite(y)) {
    throw new NumericError(`${where}: f produced ${Number.isNaN(y) ? "NaN" : y} -- a pole or an undefined point.`);
  }
  return y;
}

// --- integrate -------------------------------------------------------------

export interface IntegrateOptions {
  /** Absolute error the recursion is allowed to stop at. Default 1e-9. */
  tolerance?: number;
  /**
   * How many times an interval may be bisected before the recursion gives
   * up on it. Default 20, i.e. up to 2^20 sub-intervals -- generous for any
   * smooth textbook function, and a genuine limit: a function that needs
   * more than that to settle is not one adaptive Simpson should certify
   * quietly, so hitting it is a refusal, not a silently coarser answer.
   */
  maxDepth?: number;
}

export interface IntegrateResult {
  value: number;
  /** |estimate at full resolution − estimate at half| for the whole interval, Simpson's own error signal. */
  errorEstimate: number;
}

function simpson(f: (x: number) => number, a: number, b: number, fa: number, fm: number, fb: number): number {
  return ((b - a) / 6) * (fa + 4 * fm + fb);
}

/**
 * Definite integral of `f` on `[a, b]` by adaptive Simpson's rule.
 *
 * Simpson's rule is exact for cubics, so on any interval short and smooth
 * enough to look cubic, one estimate already agrees with a second one taken
 * at twice the resolution; where the two estimates disagree by more than a
 * share of the tolerance, that half is bisected and asked again. This
 * matches how the rest of the project spends precision: it puts panels
 * where the function is busy (near a bend, a hump) and few where it is
 * nearly straight, instead of a fixed grid that either wastes work on a
 * calm stretch or misses a chart's fine one.
 *
 * Refuses (does not return a number) rather than integrate through:
 * - a non-finite sample anywhere probed in `[a, b]` -- a pole or a genuinely
 *   undefined point inside the interval. Integrating "around" it silently
 *   would report a value for an integral that, strictly, diverges or does
 *   not exist as written; the caller must exclude the point or split the
 *   interval at it on purpose.
 * - recursion past `maxDepth` on some sub-interval -- the tolerance asked
 *   for more resolution there than this method will spend.
 *
 * What it cannot detect: a function that is finite and smooth everywhere
 * sampled but has a thin spike or a removable near-singularity narrower
 * than the panels ever probed (e.g. a bump of width 1e-8 hidden between two
 * sample points) is simply never seen, and the reported error estimate says
 * nothing about it -- Simpson's error bound is a statement about the
 * function's fourth derivative on the samples taken, not a promise about
 * what was never sampled.
 */
export function integrate(f: (x: number) => number, a: number, b: number, opts: IntegrateOptions = {}): IntegrateResult {
  const tolerance = opts.tolerance ?? 1e-9;
  const maxDepth = opts.maxDepth ?? 20;
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new NumericError(`integrate: endpoints must be finite, got [${a}, ${b}].`);
  }
  if (a === b) return { value: 0, errorEstimate: 0 };
  if (a > b) {
    const flipped = integrate(f, b, a, opts);
    return { value: -flipped.value, errorEstimate: flipped.errorEstimate };
  }

  const sample = (x: number): number => finite(f(x), `integrate: at x = ${x}`);

  function recurse(x0: number, x2: number, f0: number, f1: number, f2: number, whole: number, tol: number, depth: number): { value: number; error: number } {
    const x1 = (x0 + x2) / 2;
    const xLeftMid = (x0 + x1) / 2;
    const xRightMid = (x1 + x2) / 2;
    const fLeftMid = sample(xLeftMid);
    const fRightMid = sample(xRightMid);
    const left = simpson(f, x0, x1, f0, fLeftMid, f1);
    const right = simpson(f, x1, x2, f1, fRightMid, f2);
    const refined = left + right;
    const error = (refined - whole) / 15; // Richardson extrapolation term for Simpson's rule.
    if (Math.abs(error) <= tol || depth >= maxDepth) {
      if (depth >= maxDepth && Math.abs(error) > tol) {
        throw new NumericError(
          `integrate: did not converge on [${x0}, ${x2}] within ${maxDepth} bisections ` +
            `(remaining error ~${Math.abs(error).toExponential(2)} > tolerance ${tol.toExponential(2)}).`,
        );
      }
      return { value: refined + error, error: Math.abs(error) };
    }
    const l = recurse(x0, x1, f0, fLeftMid, f1, left, tol / 2, depth + 1);
    const r = recurse(x1, x2, f1, fRightMid, f2, right, tol / 2, depth + 1);
    return { value: l.value + r.value, error: l.error + r.error };
  }

  const fa = sample(a);
  const fb = sample(b);
  const m = (a + b) / 2;
  const fm = sample(m);
  const whole = simpson(f, a, b, fa, fm, fb);
  const { value, error } = recurse(a, b, fa, fm, fb, whole, tolerance, 0);
  return { value, errorEstimate: error };
}

// --- riemann -----------------------------------------------------------------

export type RiemannRule = "left" | "right" | "mid" | "trapezoid";

export interface Rectangle {
  x0: number;
  x1: number;
  /** left/right/mid: the single sampled height of the rectangle drawn on [x0, x1]. */
  height?: number;
  /** trapezoid only: f(x0) and f(x1), the two heights a trapezoid needs. */
  heights?: [number, number];
}

export interface RiemannResult {
  sum: number;
  rectangles: Rectangle[];
}

/**
 * A Riemann sum of `f` on `[a, b]` with `n` equal subintervals, returning
 * both the number and the exact shapes a figure must draw to show what was
 * summed -- the reason this returns `rectangles` at all is decision 0027's
 * rule applied to drawing rather than arithmetic: a figure that drew its
 * own rectangles from a second, independent height computation could show a
 * bar that disagrees with the sum printed beside it.
 *
 * "mid" samples at each subinterval's midpoint; "trapezoid" is not a
 * rectangle at all but is returned in the same shape (two heights instead
 * of one) so a caller can draw either without a second code path.
 *
 * What this cannot detect: a pole or discontinuity strictly between two
 * sample points is invisible to every rule here in the same way it is
 * invisible to a coarse limit table -- the sum is only ever evidence about
 * the `n` points actually asked for.
 */
export function riemann(f: (x: number) => number, a: number, b: number, n: number, rule: RiemannRule): RiemannResult {
  if (!Number.isInteger(n) || n < 1) throw new NumericError(`riemann: n must be a positive integer, got ${n}.`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new NumericError(`riemann: endpoints must be finite, got [${a}, ${b}].`);
  const width = (b - a) / n;
  const rectangles: Rectangle[] = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x0 = a + i * width;
    const x1 = x0 + width;
    if (rule === "trapezoid") {
      const h0 = finite(f(x0), `riemann: at x = ${x0}`);
      const h1 = finite(f(x1), `riemann: at x = ${x1}`);
      sum += ((h0 + h1) / 2) * width;
      rectangles.push({ x0, x1, heights: [h0, h1] });
      continue;
    }
    const sampleX = rule === "left" ? x0 : rule === "right" ? x1 : (x0 + x1) / 2;
    const h = finite(f(sampleX), `riemann: at x = ${sampleX}`);
    sum += h * width;
    rectangles.push({ x0, x1, height: h });
  }
  return { sum, rectangles };
}

// --- limit ---------------------------------------------------------------

export type LimitSide = "left" | "right" | "both";

export interface LimitSample {
  x: number;
  y: number;
}

export type LimitResult =
  | { kind: "finite"; value: number; samples: LimitSample[] }
  | { kind: "infinite"; sign: 1 | -1; samples: LimitSample[] }
  | { kind: "none"; reason: string; samples: LimitSample[] };

const LIMIT_STEPS = 12; // geometric steps from a coarse start down to ~1e-8 of it -- see doc comment on `limit`.
const LIMIT_START = 0.1;
const LIMIT_RATIO = 0.3;
const LIMIT_CONVERGE_TOL = 2e-5;
const LIMIT_BLOWUP = 1e4;
/** How close a decimal-schedule sample's tail must land to the dense verdict to be trusted. */
const DECIMAL_AGREE_TOL = 1e-2;

function sampleTowards(f: (x: number) => number, a: number, direction: 1 | -1): LimitSample[] {
  const samples: LimitSample[] = [];
  const finiteA = Number.isFinite(a);
  for (let i = 0; i < LIMIT_STEPS; i++) {
    const step = LIMIT_START * Math.pow(LIMIT_RATIO, i);
    // a = ±Infinity: walk out along growing x instead of shrinking a gap.
    const x = finiteA ? a + direction * step : direction * (1 / step);
    const y = f(x);
    samples.push({ x, y });
  }
  return samples;
}

/**
 * The unit a decimal step is scaled by, so "a ± 10^-k" stays a step of `a`'s
 * own size rather than a step that is comically small next to a large `a` --
 * a table for a = 100 should print 90, 99, 99.9, 99.99, not 99.9999999999.
 * For |a| < 1 (including a = 0) the unit is 1: the textbook schedule
 * (0,9; 0,99; 0,999; 0,9999) is exactly this with unit 1.
 */
export function decimalUnit(a: number): number {
  if (!Number.isFinite(a) || a === 0) return 1;
  const mag = Math.abs(a);
  return mag >= 1 ? Math.pow(10, Math.floor(Math.log10(mag))) : 1;
}

/**
 * The schedule a Brazilian textbook prints: a ± 10^-k for k = 1..count
 * (scaled by `decimalUnit`), or 10^k toward an infinite `a` -- the same
 * "walk out along growing x" convention `sampleTowards` uses, so `side`
 * alone still picks the direction when `a` is ±Infinity.
 */
function sampleDecimalTowards(f: (x: number) => number, a: number, direction: 1 | -1, count: number): LimitSample[] {
  const samples: LimitSample[] = [];
  const finiteA = Number.isFinite(a);
  const unit = finiteA ? decimalUnit(a) : 1;
  for (let k = 1; k <= count; k++) {
    const step = unit * Math.pow(10, -k);
    const x = finiteA ? a + direction * step : direction * (1 / step);
    const y = f(x);
    samples.push({ x, y });
  }
  return samples;
}

/** Do the (few, coarse) decimal samples settle to `value` the way the dense verdict says they should? */
function decimalAgreesFinite(samples: LimitSample[], value: number): boolean {
  const ys = samples.map((s) => s.y);
  if (ys.some((y) => !Number.isFinite(y))) return false;
  const tol = DECIMAL_AGREE_TOL * (1 + Math.abs(value));
  const last = ys[ys.length - 1]!;
  if (Math.abs(last - value) > tol) return false;
  const first = ys[0]!;
  // The tail must be at least as close as the head -- genuinely approaching,
  // not just coincidentally within tolerance at both ends of an oscillation.
  return Math.abs(last - value) <= Math.abs(first - value) + 1e-9;
}

/** Do the decimal samples blow up with the same sign the dense verdict found? */
function decimalAgreesInfinite(samples: LimitSample[], sign: 1 | -1): boolean {
  const ys = samples.map((s) => s.y);
  if (ys.some((y) => Number.isNaN(y))) return false;
  const signOf = (y: number): number => (y === 0 ? 0 : Math.sign(y));
  const last = ys[ys.length - 1]!;
  if (signOf(last) !== sign) return false;
  const first = ys[0]!;
  return !Number.isFinite(last) || Math.abs(last) >= Math.abs(first);
}

function oneSided(f: (x: number) => number, a: number, direction: 1 | -1): LimitResult {
  const samples = sampleTowards(f, a, direction);
  const ys = samples.map((s) => s.y);

  // Divergence to infinity: the tail must keep growing in magnitude, with a
  // consistent sign, past a size a finite limit would not plausibly reach.
  // (An absolute size check alone is not enough -- a slowly-growing but
  // truly unbounded tail is still "infinite" in spirit, but this module
  // only promises to catch the tails a textbook exercise produces: 1/x,
  // 1/x^2, tan near an asymptote, and the like all clear this easily.)
  const tail4 = ys.slice(-4);
  const allSameSign = tail4.every((y) => Number.isFinite(y) && Math.sign(y) === Math.sign(tail4[0]!) && y !== 0);
  const growing = tail4.every((y, i) => i === 0 || Math.abs(y) >= Math.abs(tail4[i - 1]!) * 0.999);
  const infiniteEntry = tail4.find((y) => !Number.isFinite(y) && !Number.isNaN(y));
  if (infiniteEntry !== undefined) {
    return { kind: "infinite", sign: (infiniteEntry > 0 ? 1 : -1) as 1 | -1, samples };
  }
  if (allSameSign && growing && Math.abs(tail4[tail4.length - 1]!) > LIMIT_BLOWUP) {
    return { kind: "infinite", sign: (tail4[tail4.length - 1]! > 0 ? 1 : -1) as 1 | -1, samples };
  }
  // Slow divergence: ln x at 0⁺ is only about −17 at the closest sample and
  // never reaches LIMIT_BLOWUP, yet it is unbounded. What separates it from a
  // convergent tail is not its size but its increments: on a geometric step
  // schedule a convergent sequence's increments shrink geometrically, while
  // ln's stay constant (each step adds ln(1/0.3) ≈ 1,2). So a tail that keeps
  // growing in magnitude with one sign, and whose last increment is still at
  // least half its first, is diverging.
  const tail5 = ys.slice(-5);
  if (tail5.every((y) => Number.isFinite(y) && y !== 0 && Math.sign(y) === Math.sign(tail5[0]!))) {
    const increments = tail5.slice(1).map((y, i) => Math.abs(y) - Math.abs(tail5[i]!));
    const first = increments[0]!;
    const lastIncrement = increments[increments.length - 1]!;
    if (increments.every((d) => d > 0) && first > LIMIT_CONVERGE_TOL * (1 + Math.abs(tail5[0]!)) && lastIncrement >= 0.5 * first) {
      return { kind: "infinite", sign: (tail5[tail5.length - 1]! > 0 ? 1 : -1) as 1 | -1, samples };
    }
  }

  const last = ys.slice(-3);
  if (last.some((y) => !Number.isFinite(y))) {
    return { kind: "none", reason: "f is undefined (NaN) arbitrarily close to a -- cannot approach along this side.", samples };
  }
  const spread = Math.max(...last) - Math.min(...last);
  if (spread <= LIMIT_CONVERGE_TOL * (1 + Math.abs(last[last.length - 1]!))) {
    return { kind: "finite", value: last[last.length - 1]!, samples };
  }
  // Growing without settling and without a consistent large sign is either
  // divergence to infinity through a mixed sign (e.g. 1/x through a pole
  // crossed by an asymmetric step, which does not happen here since we walk
  // one direction only) or oscillation -- report the latter and hand back
  // the table so a reader can see which.
  return { kind: "none", reason: "successive samples did not settle within tolerance -- oscillation or slow divergence.", samples };
}

/**
 * Estimate lim f(x) as x → a (a may be ±Infinity), from one or both sides.
 *
 * This is Richardson-free sampling, not a symbolic limit: it walks a
 * geometric sequence of steps toward `a` (ratio 0.3, twelve steps, so the
 * closest sample is about `0.3^12 ≈ 6e-7` of the way from the first step to
 * `a`) and asks whether the tail has settled to within a relative
 * tolerance, blown up past a fixed size with a consistent sign, or done
 * neither. The exact table sampled is returned as `samples` so a sheet can
 * print the "tabela de valores" that IS the evidence for the verdict,
 * rather than a second, independently-typed table that could disagree
 * with it.
 *
 * `side: "both"` samples both directions and requires them to agree (same
 * kind, and for "finite" the same value within tolerance); a jump
 * discontinuity is correctly reported as `"none"` with both sides' samples
 * attached so the disagreement itself is visible.
 *
 * What this cannot detect, stated plainly: geometric sampling only ever
 * looks at twelve points on a fixed schedule, so a function that oscillates
 * on a *finer* schedule than that -- the canonical case is sin(1/x) near 0,
 * whose wiggles shrink faster than any fixed geometric step thins them out
 * -- can land all twelve samples near a flat run of the oscillation and be
 * misreported as convergent, or, depending on phase, correctly caught as
 * "none". This module does not special-case sin(1/x); it is named here so
 * a caller does not trust a "finite" verdict near a suspected fast
 * oscillation without also looking at the sample table.
 */
/**
 * `oneSided`, but reporting the DECIMAL schedule's own samples rather than
 * the dense geometric ones -- and only ever reporting a "finite" or
 * "infinite" verdict when those printed samples actually back it up.
 *
 * The dense schedule (twelve steps, ratio 0.3) is the trustworthy read: it
 * is the same computation `oneSided` always did, so its verdict is exactly
 * as reliable as before this option existed. But printing twelve geometric
 * steps is not what a Cálculo 1 table looks like, and four decimal steps are
 * not always enough resolution to reach the same verdict on their own. So
 * both are computed; the dense one decides, the decimal one is what gets
 * printed, and if the decimal samples do not actually settle the way the
 * dense verdict says they should, the verdict is downgraded to "none" --
 * evidence and conclusion are never allowed to disagree, even at the cost of
 * a true limit sometimes being reported as unresolved by too coarse a
 * schedule. `sin(1/x)` near 0 already fails at the dense stage (it does not
 * settle even on twelve geometric steps), so it never reaches this check at
 * all; this guards the rarer case of a limit that IS genuinely settled but
 * settles too slowly for four decimal steps to show it.
 */
function decimalOneSided(f: (x: number) => number, a: number, direction: 1 | -1, count: number): LimitResult {
  const dense = oneSided(f, a, direction);
  const samples = sampleDecimalTowards(f, a, direction, count);
  if (dense.kind === "finite") {
    if (!decimalAgreesFinite(samples, dense.value)) {
      return {
        kind: "none",
        reason:
          `dense sampling finds a finite limit (${dense.value}), but the printed decimal steps ` +
          `(10^-1..10^-${count}) do not settle to it closely enough to trust -- refusing rather than ` +
          `printing a verdict the visible evidence disputes.`,
        samples,
      };
    }
    return { kind: "finite", value: dense.value, samples };
  }
  if (dense.kind === "infinite") {
    if (!decimalAgreesInfinite(samples, dense.sign)) {
      return {
        kind: "none",
        reason:
          `dense sampling finds divergence to ${dense.sign > 0 ? "+" : "-"}infinity, but the printed decimal ` +
          `steps do not show it -- refusing rather than printing a verdict the visible evidence disputes.`,
        samples,
      };
    }
    return { kind: "infinite", sign: dense.sign, samples };
  }
  return { kind: "none", reason: dense.reason, samples };
}

function combineSides(left: LimitResult, right: LimitResult): LimitResult {
  const samples = [...left.samples, ...right.samples];
  if (left.kind === "finite" && right.kind === "finite") {
    if (Math.abs(left.value - right.value) <= LIMIT_CONVERGE_TOL * (1 + Math.abs(left.value))) {
      return { kind: "finite", value: right.value, samples };
    }
    return { kind: "none", reason: `left side → ${left.value}, right side → ${right.value}: they disagree.`, samples };
  }
  if (left.kind === "infinite" && right.kind === "infinite" && left.sign === right.sign) {
    return { kind: "infinite", sign: left.sign, samples };
  }
  if (left.kind !== right.kind || (left.kind === "infinite" && right.kind === "infinite")) {
    return {
      kind: "none",
      reason: `left side is ${describeKind(left)}, right side is ${describeKind(right)}: no two-sided limit.`,
      samples,
    };
  }
  return { kind: "none", reason: "neither side settled.", samples };
}

export interface LimitOptions {
  /**
   * "geometric" (default): the original twelve-step ratio-0.3 schedule,
   * unchanged -- existing callers (`function-graph`'s asymptote detection
   * among them) see no difference. "decimal": sample and print a ± 10^-k
   * for k = 1..`count` (the Cálculo 1 "tabela de valores" schedule), with
   * the verdict cross-checked against the dense schedule -- see
   * `decimalOneSided`.
   */
  schedule?: "geometric" | "decimal";
  /** Steps per side for `schedule: "decimal"`. Default 4. Ignored otherwise. */
  count?: number;
}

export function limit(f: (x: number) => number, a: number, side: LimitSide, options: LimitOptions = {}): LimitResult {
  const sideResult: (direction: 1 | -1) => LimitResult =
    options.schedule === "decimal"
      ? (direction) => decimalOneSided(f, a, direction, options.count ?? 4)
      : (direction) => oneSided(f, a, direction);
  if (side === "left" || side === "right") {
    return sideResult(side === "left" ? -1 : 1);
  }
  return combineSides(sideResult(-1), sideResult(1));
}

function describeKind(r: LimitResult): string {
  if (r.kind === "finite") return `finite (${r.value})`;
  if (r.kind === "infinite") return r.sign > 0 ? "+infinity" : "-infinity";
  return "not determined";
}

// --- partialSums -----------------------------------------------------------

export interface PartialSumsResult {
  /** partialSums[i] is the sum of term(n0) .. term(n0 + i). */
  partialSums: number[];
  /** The n used for each entry of partialSums, same length, for labelling an axis or a table. */
  n: number[];
  hint: "converging" | "diverging" | "inconclusive";
}

/**
 * Partial sums S_N = Σ term(n) for n from `n0` to `N`, plus a hint about
 * where they are headed.
 *
 * The hint is deliberately weak: it looks only at whether the last few
 * partial sums are still moving by more than a shrinking tolerance
 * ("diverging" / "inconclusive") or have settled ("converging"), the same
 * kind of tail-behaviour read as `limit` uses on a sequence instead of a
 * continuous approach. It is not a convergence TEST in the analysis sense
 * (no ratio test, no comparison test) -- a series that converges only very
 * slowly (harmonic-adjacent, like Σ1/(n log n)) will read as
 * "inconclusive" or even "diverging" over any finite `N` a sheet can afford
 * to compute, because it genuinely has not settled yet at that N. The
 * partial-sum table returned is the same honesty this module keeps
 * elsewhere: the reader sees the numbers the verdict was read from.
 */
export function partialSums(term: (n: number) => number, n0: number, N: number): PartialSumsResult {
  if (!Number.isInteger(n0) || !Number.isInteger(N) || N < n0) {
    throw new NumericError(`partialSums: n0 and N must be integers with N >= n0, got n0=${n0}, N=${N}.`);
  }
  const sums: number[] = [];
  const ns: number[] = [];
  let running = 0;
  for (let k = n0; k <= N; k++) {
    const t = finite(term(k), `partialSums: term(${k})`);
    running += t;
    sums.push(running);
    ns.push(k);
  }
  let hint: PartialSumsResult["hint"] = "inconclusive";
  const tailCount = Math.min(5, sums.length);
  if (tailCount >= 3) {
    const tail = sums.slice(-tailCount);
    const diffs = tail.slice(1).map((v, i) => Math.abs(v - tail[i]!));
    const lastVal = tail[tail.length - 1]!;
    const settling = diffs.every((d, i) => i === 0 || d <= diffs[i - 1]! + 1e-15);
    const smallNow = diffs[diffs.length - 1]! <= 1e-6 * (1 + Math.abs(lastVal));
    if (smallNow && settling) hint = "converging";
    else if (diffs[diffs.length - 1]! > diffs[0]! * 0.999 && diffs[diffs.length - 1]! > 1e-6) hint = "diverging";
  }
  return { partialSums: sums, n: ns, hint };
}
