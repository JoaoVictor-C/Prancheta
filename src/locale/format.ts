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
 *    the student to find.
 */

export type Locale = "pt-BR" | "en";

export const LOCALES: readonly Locale[] = ["pt-BR", "en"];

/** The typographic minus sign. */
export const MINUS = "−";

export type NumberOptions = {
  /** Exactly this many decimals, as for money ("2073,60"). Unset: the shortest honest form. */
  decimals?: number;
  /** Allow "a/b" for a value that is a small-denominator fraction but not a short decimal. Default true. */
  fractions?: boolean;
  /** Group thousands ("1.000" in pt-BR, "1,000" in en). Default false -- an axis number is not an amount. */
  grouping?: boolean;
};

type Marks = { decimal: string; group: string; pair: string };

const MARKS: Record<Locale, Marks> = {
  "pt-BR": { decimal: ",", group: ".", pair: "; " },
  en: { decimal: ".", group: ",", pair: ", " },
};

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

function plain(abs: number, decimals: number, marks: Marks, grouping: boolean): string {
  const [whole, frac] = abs.toFixed(decimals).split(".");
  const head = grouping ? group(whole!, marks.group) : whole!;
  return frac === undefined ? head : `${head}${marks.decimal}${frac}`;
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
  const grouping = options.grouping ?? false;
  if (options.decimals !== undefined) {
    const rounded = Number(value.toFixed(options.decimals));
    const sign = rounded < 0 ? MINUS : "";
    return sign + plain(Math.abs(rounded), options.decimals, marks, grouping);
  }
  if (close(value, 0)) return "0";
  const sign = value < 0 ? MINUS : "";
  const abs = Math.abs(value);
  const fraction = asFraction(abs);
  if (fraction !== null && fraction.q === 1) return sign + plain(fraction.p, 0, marks, grouping);
  if (fraction !== null && terminatesShortly(fraction.q)) {
    const exact = fraction.p / fraction.q;
    for (let d = 1; d <= MAX_SHORT_DECIMALS; d += 1) {
      if (close(Number(exact.toFixed(d)), exact)) return sign + plain(exact, d, marks, grouping);
    }
  }
  if (fraction !== null && options.fractions !== false) return `${sign}${fraction.p}/${fraction.q}`;
  const rounded = Number(abs.toFixed(MAX_SHORT_DECIMALS));
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
      : body.replaceAll(",", "{,}");
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
  let t = text.trim().replaceAll(MINUS, "-").replaceAll("–", "-");
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
  | { value: number; exact: false };

/** Largest denominator a snapped fraction or multiple of π may have. */
const SNAP_MAX_Q = 12;
/** Largest n a snapped √n may have. */
const SNAP_MAX_SQUARE = 400;

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

/**
 * The exact value `r` is, if it is one of the numbers a Cálculo 1 text meets:
 * p/q with q ≤ 12, ±√n with n ≤ 400, or kπ/q with q ≤ 12. The nearest
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
  if (best.exact && Math.abs(best.value) < 1e-12) return { value: 0, exact: true, form: "rational" };
  return best;
}

/** An exact value as a reader writes it: 2, 1/2, 0,5, √3, π/2, −3π/2; rounded when inexact. */
export function writeExact(e: Exact, locale: Locale = "pt-BR"): string {
  if (!e.exact || e.form === "rational") return formatNumber(e.value, locale);
  const sign = e.value < 0 ? MINUS : "";
  if (e.form === "sqrt") return `${sign}√${e.n}`;
  const k = Math.abs(e.k);
  return `${sign}${k === 1 ? "" : k}π${e.q === 1 ? "" : `/${e.q}`}`;
}

/** The same, as TeX source for KaTeX: `\frac{8}{3}`, `\sqrt{2}`, `\frac{3\pi}{2}`, `2{,}5`. */
export function writeExactTex(e: Exact, locale: Locale = "pt-BR"): string {
  if (!e.exact || e.form === "rational") return formatNumberTex(e.value, locale);
  const sign = e.value < 0 ? "-" : "";
  if (e.form === "sqrt") return `${sign}\\sqrt{${e.n}}`;
  const k = Math.abs(e.k);
  const top = `${k === 1 ? "" : k}\\pi`;
  return sign + (e.q === 1 ? top : `\\frac{${top}}{${e.q}}`);
}
