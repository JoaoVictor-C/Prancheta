/**
 * Numbers as a reader sees them, shared by a figure and the text around it.
 *
 * The Cálculo 1 sheet shipped "(2, 5)" beside decimals written "0,5": in a
 * language whose decimal mark IS the comma, that pair reads as the single
 * number two-and-a-half. Brazilian school mathematics settles it with a
 * semicolon between coordinates -- "(2; 5)", "(2,5; 7,25)" -- and a figure
 * that typed its own coordinates by hand had no way to follow that rule
 * except by the author remembering to, label by label.
 *
 * So there is ONE formatter, and both the figure (function-graph tick numbers
 * and computed point labels) and the sheet text (placeholders resolved when a
 * statement is rendered) go through it. A label and the sentence that cites
 * it cannot disagree about how a number is written, because neither of them
 * writes it.
 *
 * Three decisions live here and nowhere else:
 *
 *  - the decimal mark and the separator between coordinates;
 *  - the typographic minus "−" (U+2212), never the hyphen, which sets short
 *    and high next to a digit and is what a keyboard produces;
 *  - how a value that is not a short decimal is written. 17/3 is printed as
 *    "17/3", not "5,667": the rounded decimal is a different number, and a
 *    figure labelled with it contradicts the exact answer the exercise asks
 *    the student to find;
 *  - how a long integer part is set. From five digits the Brazilian standard
 *    (SI, INMETRO) puts a narrow no-break space between groups of three --
 *    "12 000", "1 234 567" -- and "2026" stays "2026", so a year is not a
 *    quantity. English does the same with a comma ("12,000"). Decimals are
 *    never grouped;
 *  - that no nonzero value is ever written as zero. A value the rounding rule
 *    would print as "0", "0,0" or "0,000" is written to three significant
 *    digits instead ("0,000215"). Only noise below NOISE counts as zero.
 */

import { gcd } from "../math/integer.ts";

export type Locale = "pt-BR" | "en";

export const LOCALES: readonly Locale[] = ["pt-BR", "en"];

/** The typographic minus sign. */
export const MINUS = "−";

export type NumberOptions = {
  /** Exactly this many decimals, as for money ("2073,60"). Unset: the shortest honest form. */
  decimals?: number;
  /** Allow "a/b" for a value that is a small-denominator fraction but not a short decimal. Default true. */
  fractions?: boolean;
  /**
   * Digit grouping. Unset: the standard one -- a narrow no-break space (en: a
   * comma) between groups of three, from five integer digits. `true`: an
   * amount of money, grouped from four digits with the traditional mark
   * ("1.000,00" in pt-BR). `false`: never, for a number that is read back by a
   * program (an id, an expression) rather than by a person.
   */
  grouping?: boolean;
};

type Marks = { decimal: string; group: string; thousands: string; pair: string };

/** The narrow no-break space (U+202F) that groups digits in pt-BR. */
export const NARROW_SPACE = " ";

const MARKS: Record<Locale, Marks> = {
  "pt-BR": { decimal: ",", group: ".", thousands: NARROW_SPACE, pair: "; " },
  en: { decimal: ".", group: ",", thousands: ",", pair: ", " },
};

/** Integer digits from which the standard grouping starts. */
const GROUP_FROM = 5;
/**
 * Below this a value is rounding noise and is written "0". Above it a value is
 * a quantity, and no writer prints it as zero.
 */
export const NOISE = 1e-12;

/** Largest denominator tried when a value is not a short decimal. */
const MAX_DENOMINATOR = 24;
/** Decimals a value may have and still be written as a decimal. */
const MAX_SHORT_DECIMALS = 3;
/**
 * How close a float must be to a candidate to BE that candidate. Loose enough
 * to absorb evaluation noise (a central-difference slope, 5/3 * 3), tight
 * enough that 0.3334 is not mistaken for 1/3.
 */
const TOLERANCE = 1e-7;

function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b));
}

function group(digits: string, mark: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, mark);
}

/** The simplest p/q equal to `value`, or null. */
export function asFraction(value: number): { p: number; q: number } | null {
  for (let q = 1; q <= MAX_DENOMINATOR; q += 1) {
    const p = Math.round(value * q);
    if (close(p / q, value)) return { p, q };
  }
  return null;
}

/** Does `q` divide a power of ten small enough to be a short decimal? */
function terminatesShortly(q: number): boolean {
  return 10 ** MAX_SHORT_DECIMALS % q === 0;
}

function plain(abs: number, decimals: number, marks: Marks, grouping: boolean | undefined): string {
  const [whole, frac] = abs.toFixed(decimals).split(".");
  const head =
    grouping === true
      ? group(whole!, marks.group)
      : grouping !== false && whole!.length >= GROUP_FROM
        ? group(whole!, marks.thousands)
        : whole!;
  return frac === undefined ? head : `${head}${marks.decimal}${frac}`;
}

/**
 * `value` rounded to `decimals` places -- except that a value above NOISE never
 * rounds to zero: it is returned as it is, for `formatNumber` to write to three
 * significant digits. For a writer that rounds first and formats second.
 */
export function roundKeepingNonzero(value: number, decimals: number): number {
  const rounded = Number(value.toFixed(decimals));
  return rounded === 0 && Math.abs(value) > NOISE ? value : rounded;
}

/**
 * `value` to `sig` significant digits, trailing zeros dropped, in the marks of
 * `locale`: 0,000215 at three, 0,0002154 at four. The one way a quantity too
 * small for a fixed number of decimals is written, so 0,0004 is never "0".
 */
export function formatSignificant(value: number, sig: number, locale: Locale = "pt-BR", grouping?: boolean): string {
  if (value === 0) return "0";
  const full = Math.min(20, Math.max(0, sig - 1 - Math.floor(Math.log10(Math.abs(value)))));
  const target = Number(value.toFixed(full));
  let d = full;
  while (d > 0 && Number(value.toFixed(d - 1)) === target) d -= 1;
  return (target < 0 ? MINUS : "") + plain(Math.abs(target), d, MARKS[locale], grouping);
}

/**
 * A number, written for `locale`.
 *
 * Without `decimals`, the shortest form that IS the value: an integer, a
 * decimal of at most three places, a small fraction, and only as a last
 * resort a decimal rounded to three places.
 */
export function formatNumber(value: number, locale: Locale = "pt-BR", options: NumberOptions = {}): string {
  if (!Number.isFinite(value)) throw new Error(`cannot format ${value} as a number`);
  const marks = MARKS[locale];
  const grouping = options.grouping;
  if (options.decimals !== undefined) {
    const rounded = Number(value.toFixed(options.decimals));
    if (rounded === 0 && Math.abs(value) > NOISE) return formatSignificant(value, 3, locale, grouping);
    const sign = rounded < 0 ? MINUS : "";
    return sign + plain(Math.abs(rounded), options.decimals, marks, grouping);
  }
  if (Math.abs(value) <= NOISE) return "0";
  const sign = value < 0 ? MINUS : "";
  const abs = Math.abs(value);
  // asFraction reads anything within its tolerance of a whole number as that number; a value above NOISE is a quantity, never 0/1.
  const found = asFraction(abs);
  const fraction = found !== null && found.p === 0 ? null : found;
  if (fraction !== null && fraction.q === 1) return sign + plain(fraction.p, 0, marks, grouping);
  if (fraction !== null && terminatesShortly(fraction.q)) {
    const exact = fraction.p / fraction.q;
    for (let d = 1; d <= MAX_SHORT_DECIMALS; d += 1) {
      if (close(Number(exact.toFixed(d)), exact)) return sign + plain(exact, d, marks, grouping);
    }
  }
  if (fraction !== null && options.fractions !== false) return `${sign}${fraction.p}/${fraction.q}`;
  const rounded = Number(abs.toFixed(MAX_SHORT_DECIMALS));
  // Three decimals misstate a value below 0,005 (0,0006 would read 0,001, 0,0002 would read 0): past a tenth off, write it to three significant digits.
  if (Math.abs(rounded - abs) > 0.1 * abs) return formatSignificant(value, 3, locale, grouping);
  let decimals = MAX_SHORT_DECIMALS;
  while (decimals > 0 && close(Number(rounded.toFixed(decimals - 1)), rounded)) decimals -= 1;
  return sign + plain(rounded, decimals, marks, grouping);
}

/** An ordered pair: "(2; 5)" in pt-BR, "(2, 5)" in en. */
export function formatPoint(
  x: number,
  y: number,
  locale: Locale = "pt-BR",
  options: NumberOptions = {},
): string {
  return `(${formatNumber(x, locale, options)}${MARKS[locale].pair}${formatNumber(y, locale, options)})`;
}

/**
 * The same number as TeX source, for text KaTeX will set.
 *
 * A comma inside TeX math is punctuation and gets a thin space after it, so
 * "2,5" would set as "2, 5" -- the exact ambiguity this module exists to
 * remove. `{,}` makes it an ordinary symbol. A fraction becomes `\frac`.
 */
export function formatNumberTex(value: number, locale: Locale = "pt-BR", options: NumberOptions = {}): string {
  const text = formatNumber(value, locale, options);
  const negative = text.startsWith(MINUS);
  const body = negative ? text.slice(MINUS.length) : text;
  const slash = body.indexOf("/");
  const tex =
    slash >= 0
      ? `\\frac{${body.slice(0, slash)}}{${body.slice(slash + 1)}}`
      : body.replaceAll(",", "{,}").replaceAll(NARROW_SPACE, "\\,");
  return (negative ? "-" : "") + tex;
}

/** An ordered pair as TeX source: `(2;\,5)` in pt-BR. */
export function formatPointTex(
  x: number,
  y: number,
  locale: Locale = "pt-BR",
  options: NumberOptions = {},
): string {
  const sep = locale === "pt-BR" ? ";\\," : ",\\,";
  return `\\left(${formatNumberTex(x, locale, options)}${sep}${formatNumberTex(y, locale, options)}\\right)`;
}

/**
 * Read a number back the way `formatNumber` writes it -- "−1", "0,5",
 * "17/3" -- or null. Used by the check that a required axis number was
 * actually printed: it has to recognise the figure's own spelling.
 */
export function parseNumber(text: string, locale: Locale = "pt-BR"): number | null {
  const marks = MARKS[locale];
  let t = text.trim().replaceAll(NARROW_SPACE, "").replaceAll(MINUS, "-").replaceAll("–", "-");
  if (t === "") return null;
  const slash = t.indexOf("/");
  if (slash >= 0) {
    const p = parseNumber(t.slice(0, slash), locale);
    const q = parseNumber(t.slice(slash + 1), locale);
    return p === null || q === null || q === 0 ? null : p / q;
  }
  if (marks.decimal === ",") t = t.replaceAll(".", "").replace(",", ".");
  else t = t.replaceAll(",", "");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

// ---- exact values (ADR 0040) ----------------------------------------------------

/**
 * A number and how it is written: snapped to the exact value it agrees with,
 * or left as it was and flagged inexact.
 *
 * This lived in three places -- function-graph's asymptotes (fractions, √n,
 * kπ/q), sign-chart's `exactLabel` (fractions, √n) and value-table's limit
 * verdicts (fractions, √n, at a looser tolerance) -- each a private copy with
 * its own candidate list. It is one helper now, beside the formatter that
 * writes its result, and each caller passes only the one thing that really
 * differs between them: how far its number can be trusted (`tolerance`).
 */
export type Exact =
  | { value: number; exact: true; form: "rational" }
  | { value: number; exact: true; form: "sqrt"; n: number }
  | { value: number; exact: true; form: "pi"; k: number; q: number }
  /** ±e^p for p in E_POWERS: the limits (1 + a/n)^n and their kin land here. */
  | { value: number; exact: true; form: "e"; p: number }
  | { value: number; exact: false };

/** Largest denominator a snapped fraction or multiple of π may have. */
const SNAP_MAX_Q = 12;
/** Largest n a snapped √n may have. */
const SNAP_MAX_SQUARE = 400;
/** The powers of e a snapped value may be: e, e², e³, their reciprocals, and √e, 1/√e. */
const E_POWERS = [1, 2, 3, -1, -2, -3, 0.5, -0.5];

/**
 * The exact value `r` is, if it is one of the numbers a Cálculo 1 text meets:
 * p/q with q ≤ 12, ±√n with n ≤ 400, kπ/q with q ≤ 12, or ±eᵖ for
 * p = ±1, ±2, ±3, ±1/2. The nearest
 * candidate within `tolerance · max(1, |r|)` wins, rationals first on a tie.
 * `tolerance` is the caller's statement of how precise its number is: a
 * bisected root is good to ~1e-9, a central-difference slope to ~1e-6, a
 * numeric limit to ~1e-5.
 */
export function snapExact(r: number, tolerance: number): Exact {
  const slack = tolerance * Math.max(1, Math.abs(r));
  let best = { value: r, exact: false } as Exact;
  let gap = Infinity;
  const offer = (candidate: Exact): void => {
    const d = Math.abs(candidate.value - r);
    if (d <= slack && d < gap - 1e-15) {
      best = candidate;
      gap = d;
    }
  };
  for (let q = 1; q <= SNAP_MAX_Q; q += 1) offer({ value: Math.round(r * q) / q, exact: true, form: "rational" });
  const n = Math.round(r * r);
  if (n >= 2 && n <= SNAP_MAX_SQUARE && !Number.isInteger(Math.sqrt(n))) {
    offer({ value: Math.sign(r) * Math.sqrt(n), exact: true, form: "sqrt", n });
  }
  for (let q = 1; q <= SNAP_MAX_Q; q += 1) {
    const k = Math.round((r * q) / Math.PI);
    if (k === 0) continue;
    const g = gcd(k, q);
    offer({ value: (k * Math.PI) / q, exact: true, form: "pi", k: k / g, q: q / g });
  }
  if (r !== 0) for (const p of E_POWERS) offer({ value: Math.sign(r) * Math.exp(p), exact: true, form: "e", p });
  if (best.exact && Math.abs(best.value) < 1e-12) return { value: 0, exact: true, form: "rational" };
  return best;
}

/** An exact value as a reader writes it: 2, 1/2, 0,5, √3, π/2, −3π/2; rounded when inexact. */
export function writeExact(e: Exact, locale: Locale = "pt-BR"): string {
  if (!e.exact || e.form === "rational") return formatNumber(e.value, locale);
  const sign = e.value < 0 ? MINUS : "";
  if (e.form === "sqrt") return `${sign}√${e.n}`;
  if (e.form === "e") return sign + writeEPower(e.p);
  const k = Math.abs(e.k);
  return `${sign}${k === 1 ? "" : k}π${e.q === 1 ? "" : `/${e.q}`}`;
}

/** e, e², e³, √e and their reciprocals, as printed. */
function writeEPower(p: number): string {
  const m = Math.abs(p);
  const body = m === 0.5 ? "√e" : m === 1 ? "e" : `e${m === 2 ? "²" : "³"}`;
  return p < 0 ? `1/${body}` : body;
}

/** The same, as TeX source for KaTeX: `\frac{8}{3}`, `\sqrt{2}`, `\frac{3\pi}{2}`, `2{,}5`. */
export function writeExactTex(e: Exact, locale: Locale = "pt-BR"): string {
  if (!e.exact || e.form === "rational") return formatNumberTex(e.value, locale);
  const sign = e.value < 0 ? "-" : "";
  if (e.form === "sqrt") return `${sign}\\sqrt{${e.n}}`;
  if (e.form === "e") {
    const m = Math.abs(e.p);
    const body = m === 0.5 ? "\\sqrt{e}" : m === 1 ? "e" : `e^{${m}}`;
    return sign + (e.p < 0 ? `\\frac{1}{${body}}` : body);
  }
  const k = Math.abs(e.k);
  const top = `${k === 1 ? "" : k}\\pi`;
  return sign + (e.q === 1 ? top : `\\frac{${top}}{${e.q}}`);
}
