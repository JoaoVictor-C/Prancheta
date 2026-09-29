/**
 * Writers of numbers that sit on the primitives in `format.ts`.
 *
 * `format.ts` decides how a NUMBER is written; the presets then each decide
 * what a MEASURE is -- a length that is a root, an angle in hundredths, a
 * volume that is a multiple of π. Those decisions differ on purpose and stay
 * in the presets. What was copied between them, and lives here once:
 *
 *  - the shape of a written value (`Printed`);
 *  - snap to the exact value a number agrees with, then write it
 *    (`writeSnapped`);
 *  - a length whose SQUARE is a small-denominator rational, as a simplified
 *    root (`sqrtLabel`: 2√5, 2√14/7);
 *  - a measured number printed on a drawing (`measuredLabel`).
 *
 * All of them inherit the two rules of `formatNumber`: long integer parts are
 * grouped from five digits, and a nonzero value is never written as zero.
 */

import { SpecError } from "../ir/types.ts";
import { formatNumber, snapExact, writeExact } from "./format.ts";
import type { Locale } from "./format.ts";
import { gcd, splitSquare } from "../math/integer.ts";

/** A computed number as text, and whether that text IS the number (false: rounded). */
export type Printed = { text: string; exact: boolean };

/** The exact value `value` agrees with to `tolerance` (see `snapExact`), written: 5/3, √3, π/2, or the rounded decimal when it is none of them. */
export function writeSnapped(value: number, tolerance: number, locale: Locale = "pt-BR"): string {
  return writeExact(snapExact(value, tolerance), locale);
}

/** Largest denominator tried when reading a squared length as a fraction. */
const MAX_SQUARE_DENOMINATOR = 1000;

/**
 * The smallest d ≤ `maxDenominator` for which n·d is a whole number -- the
 * denominator of n read as a fraction -- or 0 when there is none.
 */
export function denominatorOf(n: number, maxDenominator = MAX_SQUARE_DENOMINATOR): number {
  for (let d = 1; d <= maxDenominator; d += 1) {
    const p = n * d;
    // a positive n is not 0/d however small: 1,4e-14 is within 1e-9 of a whole number and is still no root of 0
    if (n !== 0 && Math.round(p) === 0) continue;
    if (Math.abs(p - Math.round(p)) <= 1e-9 * Math.max(1, p)) return d;
  }
  return 0;
}

/**
 * √n written as a reader would write it by hand: simplified (√20 → 2√5),
 * and with a rational radicand rationalised (√(1274/169) → 7√26/13). Only
 * when n is not a whole number or a small-denominator fraction does it fall
 * back to a decimal -- that root has no exact form worth printing.
 */
export function sqrtLabel(n: number, locale: Locale = "pt-BR"): string {
  if (n < 0 || !Number.isFinite(n)) throw new SpecError(`√${n} is not a real length`);
  const q = denominatorOf(n);
  if (q === 0) return formatNumber(Math.sqrt(n), locale);
  const p = Math.round(n * q);
  if (p === 0) return "0";
  // √(p/q) = √(p·q)/q, then the square factor k comes out and k/q reduces.
  const { k, r } = splitSquare(p * q);
  const g = gcd(k, q);
  const num = k / g;
  const den = q / g;
  if (r === 1) return formatNumber(num / den, locale);
  const root = `${num === 1 ? "" : num}√${r}`;
  return den === 1 ? root : `${root}/${den}`;
}

/**
 * A measured number printed ON the drawing: exact when it is a short
 * decimal, otherwise rounded to hundredths -- "8", "2,5", "6,40", "57,53".
 *
 * Hundredths because both checks that read these labels forgive far more
 * than that (`length-matches-its-label` half the last printed digit,
 * `sweep-matches-its-label` a whole degree), so the rounding can never be
 * what fails them, and three decimals ("57,529°") claimed a precision no
 * reader measures off a figure. The caption keeps the exact form.
 */
export function measuredLabel(value: number, locale: Locale = "pt-BR"): string {
  // Hundredths for an ordinary measure; two significant digits when the measure is itself below 0,1 (an arrow 0,036 long).
  const a = Math.abs(value);
  const decimals = a > 0 && a < 0.5 ? Math.max(2, 1 - Math.floor(Math.log10(a))) : 2;
  const scale = 10 ** decimals;
  const rounded = Math.round(value * scale) / scale;
  if (Math.abs(value - rounded) <= 1e-9 * Math.max(1, Math.abs(value))) {
    const shortest = formatNumber(rounded, locale, { fractions: false });
    // The shortest form stops at three decimals; a smaller measure keeps the digits it was rounded to.
    return a < 0.5 && Number(shortest.replace(",", ".").replace("−", "-")) !== rounded ? formatNumber(rounded, locale, { decimals }) : shortest;
  }
  return formatNumber(value, locale, { decimals });
}
