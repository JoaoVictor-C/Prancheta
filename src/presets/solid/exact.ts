/**
 * Exact numbers of school solids (ADR 0046).
 *
 * Every measure a geometria espacial exercise prints is a sum of terms
 * c·√r, all multiplied by π or none of them: a³, a√3, √(r² + h²),
 * 3√3ℓ²/2, πr²h/3, πr² + πrg. `snapExact` knows √n and kπ/q but not a sum
 * (24√3 + 48) or k√r·π (4√5π), so this module carries the value
 * symbolically from the typed dimensions to the printed text, and a value
 * that leaves these forms (a pentagon's apothem, √ of a surd) is carried
 * numerically and printed rounded, flagged inexact.
 *
 * Pure and exported for tests.
 */

import { MINUS, asFraction, formatNumber, formatSignificant } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import { gcd, splitSquare } from "../../math/integer.ts";
import type { Printed } from "../../locale/write.ts";

type Frac = { p: number; q: number };
type Term = { r: number; c: Frac };

export type Exact = { kind: "exact"; terms: Term[]; pi: 0 | 1 } | { kind: "approx"; value: number };

function frac(p: number, q: number): Frac {
  if (q < 0) {
    p = -p;
    q = -q;
  }
  const g = gcd(p, q) || 1;
  return { p: p / g, q: q / g };
}

const SAFE = 2 ** 40;
const safe = (...ns: number[]): boolean => ns.every((n) => Number.isSafeInteger(n) && Math.abs(n) < SAFE);

export function valueOf(e: Exact): number {
  if (e.kind === "approx") return e.value;
  const sum = e.terms.reduce((s, t) => s + (t.c.p / t.c.q) * Math.sqrt(t.r), 0);
  return e.pi === 1 ? sum * Math.PI : sum;
}

export const approx = (value: number): Exact => ({ kind: "approx", value });

/** A typed number: exact when it is a small-denominator rational (every decimal a student types is). */
export function rat(x: number): Exact {
  const f = asFraction(x) ?? decimalFraction(x);
  if (f === null) return approx(x);
  return norm({ kind: "exact", terms: [{ r: 1, c: frac(f.p, f.q) }], pi: 0 });
}

/** A typed decimal ("0,003", "12345,678") as the fraction it is, for a magnitude `asFraction` does not reach. */
function decimalFraction(x: number): Frac | null {
  if (!Number.isFinite(x) || x === 0) return null;
  for (let d = 0; d <= 15; d += 1) {
    const p = Math.round(x * 10 ** d);
    if (!safe(p, 10 ** d)) return null;
    if (Math.abs(p / 10 ** d - x) <= 1e-12 * Math.abs(x)) return frac(p, 10 ** d);
  }
  return null;
}

export const PI: Exact = { kind: "exact", terms: [{ r: 1, c: { p: 1, q: 1 } }], pi: 1 };

function norm(e: Exact): Exact {
  if (e.kind === "approx") return e;
  const by = new Map<number, Frac>();
  for (const t of e.terms) {
    const prev = by.get(t.r);
    if (prev === undefined) by.set(t.r, t.c);
    else {
      const p = prev.p * t.c.q + t.c.p * prev.q;
      const q = prev.q * t.c.q;
      if (!safe(p, q)) return approx(valueOf(e));
      by.set(t.r, frac(p, q));
    }
  }
  const terms = [...by.entries()].filter(([, c]) => c.p !== 0).map(([r, c]) => ({ r, c })).sort((a, b) => a.r - b.r);
  return { kind: "exact", terms, pi: terms.length === 0 ? 0 : e.pi };
}

const isZero = (e: Exact): boolean => e.kind === "exact" && e.terms.length === 0;

export function add(a: Exact, b: Exact): Exact {
  if (isZero(a)) return b;
  if (isZero(b)) return a;
  if (a.kind === "approx" || b.kind === "approx" || a.pi !== b.pi) return approx(valueOf(a) + valueOf(b));
  return norm({ kind: "exact", terms: [...a.terms, ...b.terms], pi: a.pi });
}

export function mul(a: Exact, b: Exact): Exact {
  if (a.kind === "approx" || b.kind === "approx") return approx(valueOf(a) * valueOf(b));
  const pi = a.pi + b.pi;
  if (pi > 1) return approx(valueOf(a) * valueOf(b));
  const terms: Term[] = [];
  for (const s of a.terms) {
    for (const t of b.terms) {
      const { k, r } = splitSquare(s.r * t.r);
      const p = s.c.p * t.c.p * k;
      const q = s.c.q * t.c.q;
      if (!safe(p, q, s.r * t.r)) return approx(valueOf(a) * valueOf(b));
      terms.push({ r, c: frac(p, q) });
    }
  }
  return norm({ kind: "exact", terms, pi: pi as 0 | 1 });
}

export const scale = (a: Exact, k: number): Exact => mul(a, rat(k));
export const sub = (a: Exact, b: Exact): Exact => add(a, scale(b, -1));
export const square = (a: Exact): Exact => mul(a, a);

/** √a -- exact only when a is one rational (√(p/q) = √(pq)/q, simplified); else numeric. */
export function sqrt(a: Exact): Exact {
  const v = valueOf(a);
  if (v < 0) throw new RangeError(`√ of a negative number (${v})`);
  if (a.kind === "approx" || a.pi !== 0 || a.terms.length > 1 || (a.terms.length === 1 && a.terms[0]!.r !== 1)) return approx(Math.sqrt(v));
  if (a.terms.length === 0) return a;
  const { p, q } = a.terms[0]!.c;
  if (!safe(p * q)) return approx(Math.sqrt(v));
  const { k, r } = splitSquare(p * q);
  return norm({ kind: "exact", terms: [{ r, c: frac(k, q) }], pi: 0 });
}

export type { Printed };

/**
 * The value as a student writes it: 8, 2,5, 2√3, 3√2/2, 12π, 32π/3,
 * 24√3 + 48, 4π + 4√5π. A rational that is not a short decimal prints as a
 * fraction (1/3); an inexact value prints to hundredths with exact = false.
 */
export function print(e: Exact, locale: Locale = "pt-BR"): Printed {
  if (e.kind === "approx") return { text: roundedText(e.value, locale), exact: false };
  if (e.terms.length === 0) return { text: "0", exact: true };
  const parts = e.terms.map((t, i) => {
    const neg = t.c.p < 0;
    const p = Math.abs(t.c.p);
    const q = t.c.q;
    let body: string;
    if (t.r === 1 && e.pi === 0) body = plainText(p / q, locale);
    else {
      const coef = p === 1 ? "" : formatNumber(p, locale);
      body = `${coef}${t.r === 1 ? "" : `√${t.r}`}${e.pi === 1 ? "π" : ""}`;
      if (q !== 1) body = `${body}/${q}`;
    }
    if (i === 0) return neg ? `${MINUS}${body}` : body;
    return neg ? ` ${MINUS} ${body}` : ` + ${body}`;
  });
  return { text: parts.join(""), exact: true };
}

/**
 * A number the way formatNumber writes it, except below a hundredth, where formatNumber (whose tolerance is
 * absolute) reads it as 0: three significant digits, trailing zeros dropped, the locale's decimal mark.
 */
function plainText(x: number, locale: Locale): string {
  if (!(Math.abs(x) < 0.01) || x === 0) return formatNumber(x, locale);
  return formatSignificant(x, 3, locale);
}

/** A value that is not exact: hundredths; three significant digits below a hundredth; whole units from a million up, where hundredths are false precision. */
function roundedText(x: number, locale: Locale): string {
  if (Math.abs(x) < 0.01 && x !== 0) return plainText(x, locale);
  if (Math.abs(x) >= 1e6) return formatNumber(Math.round(x), locale);
  return formatNumber(x, locale, { decimals: 2 });
}

/** "= 2√3" or "≈ 3,24": the relation and the value, ready to follow a formula. */
export function equalsText(e: Exact, locale: Locale = "pt-BR"): string {
  const p = print(e, locale);
  return `${p.exact ? "=" : "≈"} ${p.text}`;
}

// ---- division, cube roots and typed volumes (ADR 0068) ----------------------------

/**
 * a / b, exact when b is ONE term c·√r (times π or not) and the quotient's π
 * power is 0 or 1: 1/(c√r) = √r/(c·r). A sum in the denominator, or π², is
 * carried numerically. Division by zero throws.
 */
export function div(a: Exact, b: Exact): Exact {
  const bv = valueOf(b);
  if (bv === 0) throw new RangeError("division by zero");
  const numeric = (): Exact => approx(valueOf(a) / bv);
  if (a.kind === "approx" || b.kind === "approx" || b.terms.length !== 1) return numeric();
  if (a.terms.length === 0) return a;
  const pi = a.pi - b.pi;
  if (pi < 0 || pi > 1) return numeric();
  const t = b.terms[0]!;
  if (!safe(t.c.p * t.r, t.c.q)) return numeric();
  const inv: Exact = norm({ kind: "exact", terms: [{ r: t.r, c: frac(t.c.q, t.c.p * t.r) }], pi: 0 });
  const m = mul({ kind: "exact", terms: a.terms, pi: 0 }, inv);
  if (m.kind === "approx") return numeric();
  return norm({ kind: "exact", terms: m.terms, pi: pi as 0 | 1 });
}

/** ∛a: exact only for a rational whose numerator and denominator are both perfect cubes (∛(1/8) = 1/2). */
export function cbrt(a: Exact): Exact {
  const v = valueOf(a);
  if (a.kind === "exact" && a.terms.length === 0) return a;
  if (a.kind === "exact" && a.pi === 0 && a.terms.length === 1 && a.terms[0]!.r === 1) {
    const { p, q } = a.terms[0]!.c;
    const cp = Math.round(Math.cbrt(Math.abs(p)));
    const cq = Math.round(Math.cbrt(q));
    if (cp ** 3 === Math.abs(p) && cq ** 3 === q) return norm({ kind: "exact", terms: [{ r: 1, c: frac(Math.sign(p) * cp, cq) }], pi: 0 });
  }
  return approx(Math.cbrt(v));
}

/** Is this value exactly zero, or exactly a rational (no root, no π)? */
export function isRational(e: Exact): boolean {
  return e.kind === "exact" && e.pi === 0 && e.terms.every((t) => t.r === 1);
}

/**
 * A typed volume: a number (37,5), or a string with π as a student writes it ("18π", "9π/2", "3/2 π", "12,5").
 * Null when the string is none of these.
 */
export function parseTyped(raw: number | string): Exact | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? rat(raw) : null;
  const m = /^\s*(\d+(?:[.,]\d+)?)?\s*(?:\/\s*(\d+))?\s*(π|pi)?\s*(?:\/\s*(\d+))?\s*$/i.exec(raw);
  if (m === null || (m[1] === undefined && m[3] === undefined)) return null;
  if (m[2] !== undefined && m[4] !== undefined) return null;
  const num = m[1] === undefined ? 1 : Number(m[1].replace(",", "."));
  const den = Number(m[2] ?? m[4] ?? 1);
  if (!(den > 0)) return null;
  const base = div(rat(num), rat(den));
  return m[3] === undefined ? base : mul(base, PI);
}
