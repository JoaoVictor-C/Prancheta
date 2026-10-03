/**
 * Measured series (ADR 0066): a curve through GIVEN points rather than an
 * expression -- a month's temperatures, a spectrum read off an instrument,
 * the exports of a country year by year.
 *
 * The points are data; nothing here invents a value between them that the
 * chosen interpolation does not state. Three interpolations, each a function
 * of x where the points allow it:
 *
 *  - "linear": the polyline through the points, the reading a line chart
 *    makes;
 *  - "smooth": a monotone cubic (Fritsch–Butland slopes on a Hermite
 *    spline). Between two points it never leaves the interval their values
 *    span, so a smooth curve cannot draw a peak the data does not have -- the
 *    overshoot a natural cubic spline puts beside every sharp change;
 *  - "step": the value held until the next point, risers drawn at the
 *    points.
 *
 * "none" draws markers only (a scatter). A "linear" series whose x does not
 * run one way is a PATH (a process on a P–T plane that goes back on itself):
 * drawn in the order given, and no function of x.
 */

export type Interpolation = "linear" | "smooth" | "step" | "none";

export type XYPoint = { x: number; y: number };

export type Piece = { f: (x: number) => number; domain: [number, number]; source: string };

export type Measured = {
  /** The points as given, in the order given. */
  points: XYPoint[];
  interpolate: Interpolation;
  /** True when x is strictly monotone: the series is then also a function y(x). */
  isFunction: boolean;
  /** One piece per interval between consecutive points, sorted by x; empty for a path. */
  pieces: Piece[];
  /** What is drawn, in data units and drawing order: the points, the risers of a step, a smooth curve's samples. */
  path: XYPoint[];
};

/** How x runs through the points: 1 increasing, -1 decreasing, 0 neither. */
export function direction(points: XYPoint[]): 1 | -1 | 0 {
  if (points.length < 2) return 0;
  const up = points.every((p, i) => i === 0 || p.x > points[i - 1]!.x);
  if (up) return 1;
  const down = points.every((p, i) => i === 0 || p.x < points[i - 1]!.x);
  return down ? -1 : 0;
}

/**
 * Hermite slopes that keep a cubic monotone between every pair of points
 * (Fritsch & Butland 1984): zero where the data turns, a weighted harmonic
 * mean of the two secants elsewhere, the one-sided secant at the ends.
 * Points sorted by x, strictly increasing.
 */
export function monotoneSlopes(xs: number[], ys: number[]): number[] {
  const n = xs.length;
  const h = Array.from({ length: n - 1 }, (_, i) => xs[i + 1]! - xs[i]!);
  const d = Array.from({ length: n - 1 }, (_, i) => (ys[i + 1]! - ys[i]!) / h[i]!);
  const m = new Array<number>(n).fill(0);
  if (n === 2) return [d[0]!, d[0]!];
  m[0] = d[0]!;
  m[n - 1] = d[n - 2]!;
  for (let i = 1; i < n - 1; i += 1) {
    const a = d[i - 1]!;
    const b = d[i]!;
    if (a * b <= 0) {
      m[i] = 0;
      continue;
    }
    const h0 = h[i - 1]!;
    const h1 = h[i]!;
    m[i] = (3 * (h0 + h1)) / ((2 * h1 + h0) / a + (h1 + 2 * h0) / b);
  }
  // An end slope steeper than three secants can overshoot the first interval.
  for (const [k, s] of [
    [0, 0],
    [n - 1, n - 2],
  ] as const) {
    if (m[k]! * d[s]! <= 0) m[k] = 0;
    else if (Math.abs(m[k]!) > 3 * Math.abs(d[s]!)) m[k] = 3 * d[s]!;
  }
  return m;
}

/** The cubic Hermite segment on [x0, x1] with values y0, y1 and slopes m0, m1. */
function hermite(x0: number, x1: number, y0: number, y1: number, m0: number, m1: number): (x: number) => number {
  const h = x1 - x0;
  return (x) => {
    const t = (x - x0) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m1;
  };
}

/** Samples per interval for a smooth series: enough that a chord strays well under a pixel at any figure scale. */
const SMOOTH_SAMPLES = 24;

export function measure(points: XYPoint[], interpolate: Interpolation): Measured {
  const dir = direction(points);
  const isFunction = dir !== 0;
  const sorted = dir === -1 ? [...points].reverse() : points;
  const pieces: Piece[] = [];
  let path: XYPoint[] = points.map((p) => ({ ...p }));
  if (isFunction && interpolate !== "none") {
    const xs = sorted.map((p) => p.x);
    const ys = sorted.map((p) => p.y);
    const slopes = interpolate === "smooth" ? monotoneSlopes(xs, ys) : [];
    for (let i = 0; i + 1 < sorted.length; i += 1) {
      const [x0, x1, y0, y1] = [xs[i]!, xs[i + 1]!, ys[i]!, ys[i + 1]!];
      const f =
        interpolate === "smooth"
          ? hermite(x0, x1, y0, y1, slopes[i]!, slopes[i + 1]!)
          : interpolate === "step"
            ? () => y0
            : (x: number) => y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
      pieces.push({ f, domain: [x0, x1], source: "" });
    }
    if (interpolate === "smooth") {
      const dense: XYPoint[] = [];
      pieces.forEach((piece, i) => {
        const [x0, x1] = piece.domain;
        for (let k = i === 0 ? 0 : 1; k <= SMOOTH_SAMPLES; k += 1) {
          const x = x0 + ((x1 - x0) * k) / SMOOTH_SAMPLES;
          dense.push({ x, y: k === SMOOTH_SAMPLES ? ys[i + 1]! : piece.f(x) });
        }
      });
      path = dir === -1 ? dense.reverse() : dense;
    } else if (interpolate === "step") {
      // The value is held from each point to the next: across, then up or down.
      const stairs: XYPoint[] = [];
      points.forEach((p, i) => {
        if (i > 0) stairs.push({ x: p.x, y: points[i - 1]!.y });
        stairs.push({ ...p });
      });
      path = stairs.filter((p, i) => i === 0 || p.x !== stairs[i - 1]!.x || p.y !== stairs[i - 1]!.y);
    }
  }
  return { points, interpolate, isFunction, pieces, path };
}

/**
 * The outline of a series between a and b in data units, for a shaded
 * region: every data point inside, a smooth curve's samples, and the two
 * ends evaluated. The fill's edge then IS the drawn polyline, kinks
 * included, where an adaptive sampler would cut a corner of it.
 */
export function edgeOf(m: Measured, at: (x: number) => number, a: number, b: number): XYPoint[] {
  const inside = (x: number): boolean => x > a && x < b;
  const sorted = [...m.path].sort((p, q) => p.x - q.x);
  const out: XYPoint[] = [{ x: a, y: at(a) }];
  for (const p of sorted) {
    if (!inside(p.x)) continue;
    // A step's riser: both of its ends, in the order the region walks them.
    const last = out[out.length - 1]!;
    if (p.x === last.x && p.y === last.y) continue;
    out.push({ x: p.x, y: p.y });
  }
  out.push({ x: b, y: at(b) });
  return out;
}

/**
 * The point at a fraction of a polyline's length, and the unit direction
 * the polyline runs there: where an arrow on a curve is set.
 */
export function alongPolyline(pts: { x: number; y: number }[], fraction: number): { at: { x: number; y: number }; dir: { x: number; y: number } } | null {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const l = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    lengths.push(l);
    total += l;
  }
  if (!(total > 0)) return null;
  let target = Math.min(Math.max(fraction, 0), 1) * total;
  for (let i = 0; i < lengths.length; i += 1) {
    const l = lengths[i]!;
    if (l === 0) continue;
    if (target <= l || i === lengths.length - 1) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const t = Math.min(target / l, 1);
      return {
        at: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        dir: { x: (b.x - a.x) / l, y: (b.y - a.y) / l },
      };
    }
    target -= l;
  }
  return null;
}
