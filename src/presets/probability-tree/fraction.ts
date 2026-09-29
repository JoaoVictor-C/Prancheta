/**
 * Exact rational arithmetic for probability trees.
 *
 * A branch probability is a fraction, a decimal or a percent the author typed,
 * and every number the figure prints -- a path's product, an event's sum, a
 * Bayes quotient -- is arithmetic on those. Floats would make 0,1 + 0,2 differ
 * from 0,3 and a tree that sums to 1 "not quite sum to 1"; so the arithmetic is
 * done on bigint numerator/denominator pairs, reduced after every step, and a
 * decimal is converted EXACTLY (0,95 is 19/20, not 0.9499999999999999...).
 */

import type { Locale } from "../../locale/format.ts";
import { SpecError } from "../../ir/types.ts";

export type Fraction = { readonly n: bigint; readonly d: bigint };

const ZERO_BI = 0n;

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== ZERO_BI) [x, y] = [y, x % y];
  return x;
}

/** n/d reduced, with the sign on the numerator. d must not be zero. */
export function frac(n: bigint, d: bigint = 1n): Fraction {
  if (d === ZERO_BI) throw new Error("fraction with zero denominator");
  const g = gcd(n, d) || 1n;
  const s = d < 0n ? -1n : 1n;
  return { n: (s * n) / g, d: (s * d) / g };
}

export const ZERO: Fraction = { n: 0n, d: 1n };
export const ONE: Fraction = { n: 1n, d: 1n };

export const add = (a: Fraction, b: Fraction): Fraction => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Fraction, b: Fraction): Fraction => frac(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Fraction, b: Fraction): Fraction => frac(a.n * b.n, a.d * b.d);
export const div = (a: Fraction, b: Fraction): Fraction => {
  if (b.n === ZERO_BI) throw new Error("division by the zero fraction");
  return frac(a.n * b.d, a.d * b.n);
};
export const eq = (a: Fraction, b: Fraction): boolean => a.n === b.n && a.d === b.d;
export const isZero = (a: Fraction): boolean => a.n === ZERO_BI;
export const cmp = (a: Fraction, b: Fraction): number => {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
};

export function sum(xs: readonly Fraction[]): Fraction {
  return xs.reduce(add, ZERO);
}

export function product(xs: readonly Fraction[]): Fraction {
  return xs.reduce(mul, ONE);
}

/** "3/5", or "2" when the denominator is 1. */
export function fractionText(f: Fraction): string {
  return f.d === 1n ? `${f.n}` : `${f.n}/${f.d}`;
}

// ---- parsing ---------------------------------------------------------------------

export type Form = "fraction" | "decimal" | "percent";

export type Parsed = {
  value: Fraction;
  /** How the author wrote it. */
  form: Form;
  /** For a fraction, the numerator and denominator AS WRITTEN ("2/4" stays 2/4 on its branch). */
  written?: { n: bigint; d: bigint };
};

const RE_FRACTION = /^(\d+)\s*\/\s*(\d+)$/;
const RE_DECIMAL = /^(\d+)(?:[.,](\d+))?$/;
const RE_PERCENT = /^(\d+)(?:[.,](\d+))?\s*%$/;

function decimalOf(int: string, fracPart: string | undefined): Fraction {
  const digits = fracPart ?? "";
  return frac(BigInt(int + digits), 10n ** BigInt(digits.length));
}

/** A number as the shortest decimal string that names it, without exponent notation. */
function plainDecimalString(x: number): string {
  const s = String(x);
  if (!/e/i.test(s)) return s;
  return x.toFixed(20).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * A probability from a number, "3/5", "0,25", "0.25" or "95%". Anything else,
 * and anything outside [0, 1], is a SpecError naming `path`.
 */
export function parseProbability(raw: unknown, path: string): Parsed {
  let text: string;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) throw new SpecError(`${path}: ${raw} is not a probability`);
    text = plainDecimalString(raw);
  } else if (typeof raw === "string") {
    text = raw.trim();
  } else {
    throw new SpecError(`${path} must be a number or a string like "3/5", "0,25" or "95%"`);
  }
  let parsed: Parsed | null = null;
  let m = RE_FRACTION.exec(text);
  if (m !== null) {
    const n = BigInt(m[1]!);
    const d = BigInt(m[2]!);
    if (d === 0n) throw new SpecError(`${path}: "${text}" has a zero denominator`);
    parsed = { value: frac(n, d), form: "fraction", written: { n, d } };
  } else if ((m = RE_PERCENT.exec(text)) !== null) {
    parsed = { value: div(decimalOf(m[1]!, m[2]), frac(100n)), form: "percent" };
  } else if ((m = RE_DECIMAL.exec(text)) !== null) {
    parsed = { value: decimalOf(m[1]!, m[2]), form: "decimal" };
  }
  if (parsed === null) throw new SpecError(`${path}: ${JSON.stringify(raw)} is not a probability -- write "3/5", 0.6, "0,6" or "60%"`);
  if (cmp(parsed.value, ZERO) < 0 || cmp(parsed.value, ONE) > 0) {
    throw new SpecError(`${path}: ${JSON.stringify(raw)} is ${fractionText(parsed.value)}, outside [0, 1]`);
  }
  return parsed;
}

// ---- writing ---------------------------------------------------------------------

const MAX_EXACT_PLACES = 6;

/** Digits after the point of `f` if it terminates (only 2s and 5s in the denominator), else null. */
function terminatingPlaces(f: Fraction): number | null {
  let d = f.d;
  let twos = 0;
  let fives = 0;
  while (d % 2n === 0n) {
    d /= 2n;
    twos += 1;
  }
  while (d % 5n === 0n) {
    d /= 5n;
    fives += 1;
  }
  return d === 1n ? Math.max(twos, fives) : null;
}

/** `f` rounded half-up to `places` decimals as a digit string with the point. */
function fixed(f: Fraction, places: number): string {
  const scale = 10n ** BigInt(places);
  const scaled = (f.n * scale * 2n + f.d) / (f.d * 2n); // round half up, f >= 0
  const s = scaled.toString().padStart(places + 1, "0");
  return places === 0 ? s : `${s.slice(0, s.length - places)}.${s.slice(s.length - places)}`;
}

export type Written = { text: string; exact: boolean };

/**
 * `f` as a decimal (or as a percent: 100 f) in the locale's spelling: exact when
 * it terminates within six places ("0,0095", "10,85%"), otherwise rounded to
 * `places` (more if that would print zero) and flagged inexact, so the caller
 * writes "≈" and never "=".
 */
export function decimalText(f: Fraction, locale: Locale, o: { percent: boolean; places?: number }): Written {
  const v = o.percent ? mul(f, frac(100n)) : f;
  const mark = locale === "pt-BR" ? "," : ".";
  const suffix = o.percent ? "%" : "";
  const done = (s: string, exact: boolean): Written => {
    const trimmed = s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
    return { text: trimmed.replace(".", mark) + suffix, exact };
  };
  const t = terminatingPlaces(v);
  if (t !== null && t <= MAX_EXACT_PLACES) return done(fixed(v, t), true);
  let places = o.places ?? (o.percent ? 2 : 4);
  let s = fixed(v, places);
  while (/^0(\.0*)?$/.test(s) && places < 12) {
    places += 1;
    s = fixed(v, places);
  }
  return done(s, false);
}

/** The value with its comparison sign: "= 3/10" or "≈ 8,76%". */
export const withSign = (w: Written): string => `${w.exact ? "=" : "≈"} ${w.text}`;
