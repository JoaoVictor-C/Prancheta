/**
 * Scale for every numbered plane a preset draws (review of 2026-09-29).
 *
 * Six presets each carried a private tick-step list with a floor and a
 * ceiling -- [1, 2, 5, 10, 20, 50, 100] and the like -- and a fixed number
 * of pixels per unit. Inside the ranges their fixtures used, both were fine.
 * Outside them a slope field over [0; 5000] came out 150 912px square, a
 * vector (3000; 4000) 96 218px tall with 143 tick numbers, a sequence
 * aₙ = 1000n 396 280px tall, and a slope field over [0; 0,2] drew one mark
 * and no numbers. Every other check passed, because every other check
 * measures the figure against itself; `canvas-size-sane` now measures it
 * against a page.
 *
 * The cure is the same everywhere, so it lives here once: the unit is FITTED
 * to the data (a target size in pixels, divided by the span), and the tick
 * step is 1, 2 or 5 × 10ᵏ for ANY k.
 */

/**
 * The smallest step of the form 1, 2 or 5 × 10ᵏ that divides `span` into at
 * most `maxTicks` intervals. Any positive span, any magnitude.
 */
export function niceStep(span: number, maxTicks = 8): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const raw = span / Math.max(1, maxTicks);
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const k of [1, 2, 5, 10]) if (k * p >= raw * (1 - 1e-9)) return snap(k * p);
  return snap(10 * p);
}

/** Every multiple of `step` in [lo, hi], counted rather than accumulated so 0,1 · 3 is 0,3 and zero is exactly zero. */
export function ticksIn(lo: number, hi: number, step: number): number[] {
  if (!(step > 0)) return [];
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  const first = Math.ceil(a / step - 1e-9);
  const last = Math.floor(b / step + 1e-9);
  const out: number[] = [];
  for (let i = first; i <= last && out.length < 1000; i += 1) out.push(snap(i * step));
  return out;
}

/** The largest multiple of `step` at or below `x`, and the smallest at or above: a range widened to whole ticks. */
export function widenToTicks(lo: number, hi: number, step: number): [number, number] {
  return [snap(Math.floor(lo / step + 1e-9) * step), snap(Math.ceil(hi / step - 1e-9) * step)];
}

export type FitOptions = {
  /** Pixels the larger span should occupy (equal scale) or each span (independent scales). Default 560 × 420. */
  targetWidth?: number;
  targetHeight?: number;
  /** One unit the same length on both axes -- geometry, vectors, fields. Default true. */
  equal?: boolean;
  /** Never more than this many pixels per unit (a tiny range is not blown up past legibility of its own marks). Default Infinity. */
  maxUnit?: number;
  /** Never fewer. Default 0. */
  minUnit?: number;
};

/**
 * Pixels per unit on each axis so the spans fill about the target size.
 * With `equal`, one unit is one length on both axes and the LARGER span
 * decides -- so a tall, narrow range stays inside the target height too.
 */
export function fitUnits(xSpan: number, ySpan: number, o: FitOptions = {}): { xUnit: number; yUnit: number } {
  const tw = o.targetWidth ?? 560;
  const th = o.targetHeight ?? 420;
  const clamp = (u: number): number => Math.min(o.maxUnit ?? Infinity, Math.max(o.minUnit ?? 0, u));
  const sx = xSpan > 0 && Number.isFinite(xSpan) ? xSpan : 1;
  const sy = ySpan > 0 && Number.isFinite(ySpan) ? ySpan : 1;
  if (o.equal ?? true) {
    const u = clamp(Math.min(tw / sx, th / sy));
    return { xUnit: u, yUnit: u };
  }
  return { xUnit: clamp(tw / sx), yUnit: clamp(th / sy) };
}

/** Round away binary noise: 0.30000000000000004 → 0.3, with the step's own precision. */
function snap(x: number): number {
  return Number.parseFloat(x.toPrecision(12));
}
