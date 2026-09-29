/**
 * Descriptive statistics, as pure functions: no drawing, no formatting.
 *
 * The `statistics` preset draws histograms and boxplots of RAW DATA, so every
 * number a figure prints -- a quartile, a class frequency, a standard deviation
 * -- comes from here, computed from the observations. Each function follows the
 * definition a Brazilian Estatística textbook gives and says so, because
 * "the" first quartile has at least three definitions in common use and a
 * figure that does not say which one it took is a figure a student cannot check.
 */

// ---- small helpers ----------------------------------------------------------------

/** A float within rounding noise of a round number IS that number. */
export function tidy(x: number): number {
  const r = Math.round(x * 1e10) / 1e10;
  return Math.abs(x - r) < 1e-12 ? r + 0 : x;
}

export const sortedAscending = (xs: readonly number[]): number[] => [...xs].sort((a, b) => a - b);

export function sum(xs: readonly number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) throw new Error("mean of no data");
  return tidy(sum(xs) / xs.length);
}

// ---- median and quartiles ------------------------------------------------------------

/**
 * How a quartile is taken from the ordered data. Three definitions are in use in
 * Brazilian courses; they agree when n is a multiple of 4 and differ otherwise.
 *
 *  - `halves` (default): Q₁ is the median of the lower half and Q₃ the median of
 *    the upper half, the median itself LEFT OUT of both halves when n is odd.
 *    This is what the Ensino Médio texts and ENEM solutions teach ("mediana dos
 *    valores à esquerda / à direita da mediana").
 *  - `tukey`: the same, but the median BELONGS to both halves when n is odd
 *    (Tukey's hinges).
 *  - `linear`: linear interpolation between order statistics at position
 *    (n − 1)·p + 1 -- Excel's QUARTIL.INC, LibreOffice's QUARTILE, R's type 7.
 */
export type QuartileMethod = "halves" | "tukey" | "linear";
export const QUARTILE_METHODS: readonly QuartileMethod[] = ["halves", "tukey", "linear"];

/** The median of an ORDERED array. */
export function medianSorted(sorted: readonly number[]): number {
  const n = sorted.length;
  if (n === 0) throw new Error("median of no data");
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid]! : tidy((sorted[mid - 1]! + sorted[mid]!) / 2);
}

export function median(xs: readonly number[]): number {
  return medianSorted(sortedAscending(xs));
}

/** The p-quantile by linear interpolation (type 7), of an ORDERED array. */
export function quantileLinear(sorted: readonly number[], p: number): number {
  const n = sorted.length;
  if (n === 0) throw new Error("quantile of no data");
  const h = (n - 1) * p;
  const lo = Math.floor(h + 1e-12);
  const frac = h - lo;
  if (lo >= n - 1) return sorted[n - 1]!;
  return tidy(sorted[lo]! + frac * (sorted[lo + 1]! - sorted[lo]!));
}

export type Quartiles = { q1: number; median: number; q3: number };

export function quartiles(xs: readonly number[], method: QuartileMethod = "halves"): Quartiles {
  const s = sortedAscending(xs);
  const n = s.length;
  if (n < 2) throw new Error("quartiles need at least two observations");
  const md = medianSorted(s);
  if (method === "linear") return { q1: quantileLinear(s, 0.25), median: md, q3: quantileLinear(s, 0.75) };
  const half = method === "halves" ? Math.floor(n / 2) : Math.ceil(n / 2);
  return { q1: medianSorted(s.slice(0, half)), median: md, q3: medianSorted(s.slice(n - half)) };
}

export type BoxStats = {
  n: number;
  min: number;
  max: number;
  q1: number;
  median: number;
  q3: number;
  iqr: number;
  /** Q₁ − 1,5·IQR and Q₃ + 1,5·IQR: beyond them a value is an outlier. */
  lowFence: number;
  highFence: number;
  /** The most extreme observations INSIDE the fences: where the whiskers end. */
  lowWhisker: number;
  highWhisker: number;
  /** Observations outside the fences, ascending, repeats kept. */
  outliers: number[];
};

export function boxStats(xs: readonly number[], method: QuartileMethod = "halves"): BoxStats {
  const s = sortedAscending(xs);
  const { q1, median: md, q3 } = quartiles(s, method);
  const iqr = tidy(q3 - q1);
  const lowFence = tidy(q1 - 1.5 * iqr);
  const highFence = tidy(q3 + 1.5 * iqr);
  const inside = s.filter((x) => x >= lowFence - 1e-12 && x <= highFence + 1e-12);
  return {
    n: s.length,
    min: s[0]!,
    max: s[s.length - 1]!,
    q1,
    median: md,
    q3,
    iqr,
    lowFence,
    highFence,
    // Q₁ and Q₃ can each be an interpolated value, but the box always contains at least one observation.
    lowWhisker: inside[0] ?? q1,
    highWhisker: inside[inside.length - 1] ?? q3,
    outliers: s.filter((x) => x < lowFence - 1e-12 || x > highFence + 1e-12),
  };
}

// ---- dispersion ---------------------------------------------------------------------

export type VarianceKind = "sample" | "population";

/** Σ(xᵢ − x̄)²: computed about the mean, never by the "mean of squares" shortcut that loses digits. */
export function sumSquaredDeviations(xs: readonly number[]): number {
  const m = sum(xs) / xs.length;
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return s;
}

/** s² with divisor n − 1 (`sample`) or σ² with divisor n (`population`). Sample needs n ≥ 2. */
export function variance(xs: readonly number[], kind: VarianceKind = "sample"): number {
  const n = xs.length;
  if (n === 0) throw new Error("variance of no data");
  if (kind === "sample" && n < 2) throw new Error("the sample variance needs at least two observations");
  return tidy(sumSquaredDeviations(xs) / (kind === "sample" ? n - 1 : n));
}

export function standardDeviation(xs: readonly number[], kind: VarianceKind = "sample"): number {
  return Math.sqrt(variance(xs, kind));
}

/** The modes: the values of greatest frequency, ascending. Empty when every value occurs once (amodal). */
export function modes(xs: readonly number[]): number[] {
  const count = new Map<number, number>();
  for (const x of xs) count.set(x, (count.get(x) ?? 0) + 1);
  const top = Math.max(...count.values());
  if (top <= 1) return [];
  return [...count.entries()].filter(([, c]) => c === top).map(([x]) => x).sort((a, b) => a - b);
}

// ---- classes and frequencies -----------------------------------------------------------

/** k = 1 + 3,3·log₁₀ n, rounded to the nearest whole number (Sturges). */
export function sturges(n: number): number {
  if (!(n >= 1)) throw new Error("Sturges' rule needs n ≥ 1");
  return Math.max(1, Math.round(1 + 3.3 * Math.log10(n)));
}

/** Decimal places the data are written with (1,65 has two); at most 6. */
export function decimalsOf(xs: readonly number[]): number {
  let d = 0;
  for (const x of xs) {
    const s = String(Math.abs(x));
    if (s.includes("e")) {
      d = Math.max(d, 6);
      continue;
    }
    const dot = s.indexOf(".");
    if (dot >= 0) d = Math.max(d, s.length - dot - 1);
  }
  return Math.min(d, 6);
}

const round10 = (x: number): number => Number(x.toFixed(10));

const NICE_MANTISSAS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10];

/**
 * The class width Sturges' rule asks for, made a number a reader counts by: the
 * amplitude R = máx − mín over k classes, rounded UP to a round width (1, 1,5, 2,
 * 2,5, 3, 4, 5, 6, 7, 8 times a power of ten) that is a multiple of the data's own
 * precision -- a set of whole-number heights never gets a width of 2,5.
 */
export function niceWidth(raw: number, precision: number): number {
  const unit = 10 ** -precision;
  const base = Math.max(raw, unit);
  const m = Math.floor(Math.log10(base) + 1e-12);
  for (let e = m; e <= m + 1; e += 1) {
    for (const mant of NICE_MANTISSAS) {
      const w = round10(mant * 10 ** e);
      const multiple = Math.abs(w / unit - Math.round(w / unit)) < 1e-6;
      if (w >= base - 1e-9 && multiple) return w;
    }
  }
  return round10(Math.ceil(base / unit) * unit);
}

export type ClassScheme = {
  /** k + 1 ascending edges: class i is [edges[i]; edges[i + 1]), the last one closed. */
  edges: number[];
  /** Where a class scheme came from, for the figure to state. */
  origin: "sturges" | "start-width" | "edges";
  /** For "sturges": the k the rule asked for, before the start was rounded down to a round number. */
  requested?: number;
};

/** The edges of `count` equal classes of `width` from `start`. */
export function edgesFrom(start: number, width: number, count: number): number[] {
  return Array.from({ length: count + 1 }, (_, i) => round10(start + i * width));
}

/**
 * Sturges' classes for the data: k = 1 + 3,3·log n; the width R/k rounded up to
 * a round number; the first edge the minimum rounded DOWN to the width's own order
 * of magnitude (150 for a minimum of 152 with width 7); as many classes as it takes
 * to reach the maximum, which the last, closed class includes.
 */
export function sturgesClasses(xs: readonly number[]): ClassScheme {
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  if (!(hi > lo)) throw new Error("classes need at least two different values");
  const k = sturges(xs.length);
  const precision = decimalsOf(xs);
  let width = niceWidth((hi - lo) / k, precision);
  for (let guard = 0; guard < 8; guard += 1) {
    const grid = Math.max(10 ** Math.floor(Math.log10(width) + 1e-12), 10 ** -precision);
    const start = round10(Math.floor(lo / grid + 1e-9) * grid);
    const count = Math.max(1, Math.ceil((hi - start) / width - 1e-9));
    // Rounding the start down can cost a whole extra class; if it costs more than one, widen instead.
    if (count <= k + 1) return { edges: edgesFrom(start, width, count), origin: "sturges", requested: k };
    width = niceWidth(width * 1.0001 + 10 ** -precision, precision);
  }
  const start = round10(Math.floor(lo));
  return { edges: edgesFrom(start, width, Math.max(1, Math.ceil((hi - start) / width - 1e-9))), origin: "sturges", requested: k };
}

/** Equal classes of `width` from `start`, as many as reach the maximum. */
export function startWidthClasses(xs: readonly number[], start: number, width: number): ClassScheme {
  const hi = Math.max(...xs);
  const count = Math.max(1, Math.ceil((hi - start) / width - 1e-9));
  return { edges: edgesFrom(start, width, count), origin: "start-width" };
}

/**
 * The class each observation falls in: closed on the left, open on the right,
 * [aᵢ; aᵢ₊₁) -- and the LAST class closed on both sides, so the maximum has a home.
 * Returns −1 for a value outside every class (the caller refuses the input).
 */
export function classIndex(x: number, edges: readonly number[]): number {
  const eps = 1e-9 * Math.max(1, Math.abs(x));
  const k = edges.length - 1;
  if (x < edges[0]! - eps || x > edges[k]! + eps) return -1;
  for (let i = 0; i < k; i += 1) {
    const last = i === k - 1;
    if (x >= edges[i]! - eps && (last ? x <= edges[i + 1]! + eps : x < edges[i + 1]! - eps)) return i;
  }
  return -1;
}

export function classCounts(xs: readonly number[], edges: readonly number[]): number[] {
  const counts = new Array<number>(edges.length - 1).fill(0);
  for (const x of xs) {
    const i = classIndex(x, edges);
    if (i < 0) throw new Error(`${x} lies outside the classes`);
    counts[i]! += 1;
  }
  return counts;
}

export type FrequencyRow = {
  /** Lower edge, upper edge, width, midpoint. */
  lo: number;
  hi: number;
  width: number;
  mid: number;
  /** fᵢ */
  count: number;
  /** frᵢ = fᵢ / n */
  relative: number;
  /** Fᵢ: fᵢ accumulated up to and including this class. */
  cumulative: number;
  /** fᵢ / (n·hᵢ): the height at which the bar's AREA is frᵢ. */
  density: number;
};

export function frequencyTable(xs: readonly number[], edges: readonly number[]): FrequencyRow[] {
  const counts = classCounts(xs, edges);
  const n = xs.length;
  let running = 0;
  return counts.map((count, i) => {
    running += count;
    const lo = edges[i]!;
    const hi = edges[i + 1]!;
    const width = round10(hi - lo);
    return { lo, hi, width, mid: tidy((lo + hi) / 2), count, relative: count / n, cumulative: running, density: count / (n * width) };
  });
}

/** The indices of the class(es) of greatest frequency. */
export function modalClasses(rows: readonly FrequencyRow[], by: "count" | "density" = "count"): number[] {
  const value = (r: FrequencyRow): number => (by === "count" ? r.count : r.density);
  const top = Math.max(...rows.map(value));
  return rows.flatMap((r, i) => (Math.abs(value(r) - top) < 1e-12 ? [i] : []));
}

// ---- axes ------------------------------------------------------------------------------------

/** A tick step a reader counts by (1, 2, 5 times a power of ten) giving at most `maxTicks` divisions over `span`. */
export function niceStep(span: number, maxTicks = 8): number {
  if (!(span > 0)) return 1;
  const raw = span / maxTicks;
  const m = Math.floor(Math.log10(raw));
  for (const mant of [1, 2, 5, 10]) {
    const s = round10(mant * 10 ** m);
    if (s >= raw - 1e-12) return s;
  }
  return round10(10 ** (m + 1));
}
