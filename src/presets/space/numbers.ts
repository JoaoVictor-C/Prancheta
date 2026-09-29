/**
 * Numbers the space preset prints, and the plane equations it reads and
 * writes. Everything here is pure and exported for tests.
 *
 * Exactness goes through `locale/format.ts`'s `snapExact`/`writeExact`
 * (ADR 0040) for rationals and multiples of π; a length whose SQUARE is a
 * small-denominator rational is written as a simplified root with the
 * vectors preset's `sqrtLabel` (2√5, 2√14/7), which `snapExact` does not
 * reach -- it knows √n, not k√r/q, and a distance point–plane is almost
 * always the latter.
 */

import { SpecError } from "../../ir/types.ts";
import { MINUS, asFraction, formatNumber, formatSignificant, snapExact, writeExact } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import { denominatorOf, sqrtLabel } from "../../locale/write.ts";
import { gcd } from "../../math/integer.ts";
import type { Printed } from "../../locale/write.ts";

export type { Printed };

/** Largest denominator tried when reading a squared value as a fraction. */
const MAX_SQUARE_DEN = 1000;

function squareIsRational(x: number): boolean {
  return denominatorOf(x * x, MAX_SQUARE_DEN) !== 0;
}

/**
 * Below this a number is not a hundredth-rounded value: locale/format.ts reads
 * anything under its own tolerance as zero and "0,00" would stand for 0,0005.
 */
const SMALL = 0.01;

/** A small number to three significant digits, decimal mark of the locale, trailing zeros dropped; exact when that IS the number. */
function printSmall(x: number, locale: Locale): Printed {
  const rounded = Number(x.toPrecision(3));
  return { text: formatSignificant(x, 3, locale), exact: Math.abs(rounded - x) <= 1e-9 * Math.abs(x) };
}

/**
 * `x` the way a reader writes it: 3, 1/2, 2,5, √14, 2√14/7, π/3 -- or,
 * when none of those is the number, rounded to hundredths and flagged
 * inexact so the caller writes "≈".
 */
export function printExact(x: number, locale: Locale = "pt-BR"): Printed {
  if (!Number.isFinite(x)) throw new SpecError(`cannot print ${x}`);
  if (Math.abs(x) < SMALL && Math.abs(x) > 1e-12) return printSmall(x, locale);
  const snapped = snapExact(x, 1e-9);
  if (snapped.exact && snapped.form === "rational") return { text: formatNumber(snapped.value, locale), exact: true };
  if (squareIsRational(x)) {
    const body = sqrtLabel(x * x, locale);
    return { text: x < 0 ? `${MINUS}${body}` : body, exact: true };
  }
  if (snapped.exact) return { text: writeExact(snapped, locale), exact: true };
  return { text: formatNumber(x, locale, { decimals: 2 }), exact: false };
}

/** "(2; 3; 4)" -- each coordinate through `printExact`; `exact` false if any coordinate was rounded. */
export function printTriple(v: readonly number[], locale: Locale = "pt-BR"): Printed {
  const parts = v.map((c) => printExact(c, locale));
  const sep = locale === "pt-BR" ? "; " : ", ";
  return { text: `(${parts.map((p) => p.text).join(sep)})`, exact: parts.every((p) => p.exact) };
}

/** An angle in degrees: "60°" when it is a whole or short-decimal degree, else rounded with exact=false. */
export function printDegrees(radians: number, locale: Locale = "pt-BR"): Printed {
  const deg = (radians * 180) / Math.PI;
  const whole = Math.round(deg * 1000) / 1000;
  if (Math.abs(deg - whole) <= 1e-7 * Math.max(1, deg)) return { text: `${formatNumber(whole, locale)}°`, exact: true };
  return { text: `${formatNumber(deg, locale, { decimals: 2 })}°`, exact: false };
}

// ---- plane equations -----------------------------------------------------

export type Linear = { a: number; b: number; c: number; d: number };

/**
 * Reads `"2x + y − z = 4"` (or `"x = 3"`, `"2,5y − z/1 + 1 = 0"`) into
 * a·x + b·y + c·z + d = 0. Accepts the typographic minus, a pt-BR decimal
 * comma, `*` or `·` before a variable, and a fraction coefficient `1/2`.
 * Refuses anything else by name -- a squared term, a product of variables,
 * a missing `=` -- rather than guessing.
 */
export function parsePlaneEquation(text: string): Linear {
  const sides = text.split("=");
  if (sides.length !== 2) throw new SpecError(`plane equation "${text}" must have exactly one "="`);
  const left = parseSide(sides[0]!, text);
  const right = parseSide(sides[1]!, text);
  const out = { a: left.x - right.x, b: left.y - right.y, c: left.z - right.z, d: left.k - right.k };
  if (out.a === 0 && out.b === 0 && out.c === 0) throw new SpecError(`plane equation "${text}" has no x, y or z term -- it is not a plane`);
  return out;
}

function parseSide(raw: string, whole: string): { x: number; y: number; z: number; k: number } {
  const s = raw.replace(/[−–]/g, "-").replace(/\s+/g, "");
  if (s === "") throw new SpecError(`plane equation "${whole}" has an empty side`);
  const acc = { x: 0, y: 0, z: 0, k: 0 };
  const term = /([+-]?)(\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)?)?[*·]?([xyz])?/y;
  let i = 0;
  let first = true;
  while (i < s.length) {
    term.lastIndex = i;
    const m = term.exec(s);
    if (m === null || m[0] === "" || (m[2] === undefined && m[3] === undefined)) {
      throw new SpecError(`plane equation "${whole}": cannot read "${s.slice(i)}" -- write terms like 2x, −y, 3z, 4`);
    }
    if (!first && m[1] === "") throw new SpecError(`plane equation "${whole}": expected + or − before "${s.slice(i)}"`);
    const sign = m[1] === "-" ? -1 : 1;
    let coef = 1;
    if (m[2] !== undefined) {
      const [p, q] = m[2].split("/").map((t) => Number(t.replace(",", ".")));
      coef = q === undefined ? p! : p! / q;
      if (!Number.isFinite(coef)) throw new SpecError(`plane equation "${whole}": "${m[2]}" is not a number`);
    }
    const key = (m[3] ?? "k") as "x" | "y" | "z" | "k";
    acc[key] += sign * coef;
    i += m[0].length;
    first = false;
  }
  return acc;
}

/**
 * The same plane with the smallest whole coefficients and a positive
 * leading one: 4x + 2y − 2z − 8 = 0 → 2x + y − z − 4 = 0; (1/2, 1/3, 1, −1)
 * → 3x + 2y + 6z − 6 = 0. When a coefficient is irrational after dividing
 * by the smallest nonzero one, the coefficients are only sign-normalised and
 * printed rounded (`exact` false).
 */
export function canonicalPlane(eq: Linear): Linear & { exact: boolean } {
  const cs = [eq.a, eq.b, eq.c, eq.d];
  const lead = [eq.a, eq.b, eq.c].find((c) => Math.abs(c) > 1e-12)!;
  const smallest = Math.min(...cs.filter((c) => Math.abs(c) > 1e-12).map(Math.abs));
  const ratios = cs.map((c) => c / smallest);
  const fracs = ratios.map((r) => asFraction(r));
  const sign = lead < 0 ? -1 : 1;
  if (fracs.some((f) => f === null)) {
    const [a, b, c, d] = cs.map((c) => (sign * c) / smallest) as [number, number, number, number];
    return { a, b, c, d, exact: false };
  }
  let lcm = 1;
  for (const f of fracs) lcm = (lcm * f!.q) / gcd(lcm, f!.q);
  let ints = fracs.map((f) => Math.round((f!.p * lcm) / f!.q));
  const g = ints.reduce((acc, n) => gcd(acc, n), 0) || 1;
  ints = ints.map((n) => (sign * n) / g + 0);
  const [a, b, c, d] = ints as [number, number, number, number];
  return { a, b, c, d, exact: true };
}

/** "2x + y − z − 4 = 0" -- the equação geral, in canonical form. */
export function planeEquationText(eq: Linear, locale: Locale = "pt-BR"): Printed {
  const canon = canonicalPlane(eq);
  const terms: string[] = [];
  const push = (coef: number, symbol: string): void => {
    if (Math.abs(coef) < 1e-12) return;
    const abs = Math.abs(coef);
    const num = symbol !== "" && Math.abs(abs - 1) < 1e-12 ? "" : formatNumber(abs, locale, canon.exact ? {} : { decimals: 2 });
    const body = `${num}${symbol}`;
    if (terms.length === 0) terms.push(coef < 0 ? `${MINUS}${body}` : body);
    else terms.push(coef < 0 ? `${MINUS} ${body}` : `+ ${body}`);
  };
  push(canon.a, "x");
  push(canon.b, "y");
  push(canon.c, "z");
  push(canon.d, "");
  return { text: `${terms.join(" ")} = 0`, exact: canon.exact };
}

/**
 * The same direction scaled to the smallest whole components when it has
 * rational ratios -- (2, 4, −6) → (1, 2, −3), (−1/2, 0, 1) → (1, 0, −2) --
 * so a derived line's direction prints the way a student writes it. The
 * first nonzero component is made positive. Irrational ratios return the
 * input unchanged.
 */
export function simplestDirection(v: readonly [number, number, number]): [number, number, number] {
  const nz = v.filter((c) => Math.abs(c) > 1e-12);
  if (nz.length === 0) return [0, 0, 0];
  const smallest = Math.min(...nz.map(Math.abs));
  const fracs = v.map((c) => asFraction(c / smallest));
  if (fracs.some((f) => f === null)) return [v[0], v[1], v[2]];
  let lcm = 1;
  for (const f of fracs) lcm = (lcm * f!.q) / gcd(lcm, f!.q);
  let ints = fracs.map((f) => Math.round((f!.p * lcm) / f!.q));
  const g = ints.reduce((acc, n) => gcd(acc, n), 0) || 1;
  const lead = ints.find((n) => n !== 0)!;
  const sign = lead < 0 ? -1 : 1;
  ints = ints.map((n) => (sign * n) / g + 0);
  return [ints[0]!, ints[1]!, ints[2]!];
}

/** Does this label type a number by hand? A printed number is computed, never typed. */
export function typesANumber(label: string): boolean {
  return /\d/.test(label);
}
