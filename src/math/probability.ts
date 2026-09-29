/**
 * Probability kernels for the `distribution` preset: the error function, the
 * standard normal cdf and its inverse, the normal density, and the binomial and
 * Poisson mass functions -- each accurate to about 1e-15 relative, so a printed
 * four-decimal probability is never one rounding step away from the truth.
 *
 * Nothing here draws or formats. Sources:
 *
 *  - erf / erfc: two regimes, each convergent and free of cancellation.
 *    |x| < 2 uses the Kummer form of the Maclaurin series,
 *      erf x = (2/√π) e^(−x²) Σ 2ⁿ x^(2n+1) / (1·3·5⋯(2n+1)),
 *    every term positive (Abramowitz & Stegun 7.1.6), so nothing cancels.
 *    |x| ≥ 2 uses the continued fraction of Laplace for erfc
 *      erfc x = e^(−x²)/√π · 1/(x + ½/(x + 1/(x + (3/2)/(x + 2/(x + …))))),
 *    (A&S 7.1.14) evaluated by the modified Lentz method (Press et al.,
 *    Numerical Recipes §5.2), which keeps RELATIVE accuracy far into the tail
 *    (Φ(−8) is right to 14 digits, where 1 − erf would print zero).
 *  - Φ⁻¹: Peter Acklam's rational approximation (relative error 1.15e-9)
 *    followed by one Halley step against the accurate Φ, which brings it to
 *    machine precision.
 *  - binomial and Poisson mass: Catherine Loader, "Fast and Accurate
 *    Computation of Binomial Probabilities" (2000) -- the saddle-point form
 *    with stirlerr and bd0 that R's dbinom and dpois use. It never forms C(n, k)
 *    or a factorial, so n = 1000 costs no accuracy.
 */

const SQRT2 = Math.SQRT2;
const SQRT_PI = Math.sqrt(Math.PI);
const LN_SQRT_2PI = 0.5 * Math.log(2 * Math.PI);
const TINY = 1e-300;

// ---- erf ---------------------------------------------------------------------

/** erf x for x ≥ 0, by the all-positive Kummer series; used for x < 2. */
function erfSeries(x: number): number {
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let n = 1; n < 400; n += 1) {
    term *= (2 * x2) / (2 * n + 1);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return (2 / SQRT_PI) * Math.exp(-x2) * sum;
}

/** erfc x for x ≥ 2, by the continued fraction and modified Lentz. */
function erfcFraction(x: number): number {
  // erfc x = e^(-x²)/√π · 1/(x + a1/(x + a2/(x + …))), a_k = k/2.
  let f = x;
  let c = x;
  let d = 0;
  for (let k = 1; k < 500; k += 1) {
    const a = k / 2;
    d = x + a * d;
    if (d === 0) d = TINY;
    c = x + a / c;
    if (c === 0) c = TINY;
    d = 1 / d;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-x * x) / (SQRT_PI * f);
}

/** The error function, 2/√π ∫₀ˣ e^(−t²) dt. Accurate to ~1e-15. */
export function erf(x: number): number {
  if (Number.isNaN(x)) return NaN;
  const ax = Math.abs(x);
  const v = ax < 2 ? erfSeries(ax) : 1 - erfcFraction(ax);
  return x < 0 ? -v : v;
}

/** The complementary error function 1 − erf x, with full relative accuracy in the tail. */
export function erfc(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x < 0) return 2 - erfc(-x);
  if (x < 2) return 1 - erfSeries(x);
  if (x > 27) return 0; // e^(−729) is below every double
  return erfcFraction(x);
}

// ---- the normal law -----------------------------------------------------------

/** The standard normal density φ(z). */
export function stdNormalPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / (Math.sqrt(2 * Math.PI));
}

/** The density of N(mean, sd²) at x. */
export function normalPdf(x: number, mean = 0, sd = 1): number {
  const z = (x - mean) / sd;
  return stdNormalPdf(z) / sd;
}

/** Φ(z), the standard normal cdf. Φ(−z) is computed from the tail, not as 1 − Φ(z). */
export function phi(z: number): number {
  if (z === Infinity) return 1;
  if (z === -Infinity) return 0;
  return 0.5 * erfc(-z / SQRT2);
}

/** The cdf of N(mean, sd²). */
export function normalCdf(x: number, mean = 0, sd = 1): number {
  return phi((x - mean) / sd);
}

const A = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
const B = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
const C = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
const D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

/** Φ⁻¹(p): the z with Φ(z) = p, for 0 < p < 1. Acklam's approximation and one Halley step. */
export function phiInv(p: number): number {
  if (!(p >= 0 && p <= 1)) return NaN;
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  const pLow = 0.02425;
  let x: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((C[0]! * q + C[1]!) * q + C[2]!) * q + C[3]!) * q + C[4]!) * q + C[5]!) / ((((D[0]! * q + D[1]!) * q + D[2]!) * q + D[3]!) * q + 1);
  } else if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((A[0]! * r + A[1]!) * r + A[2]!) * r + A[3]!) * r + A[4]!) * r + A[5]!) * q) / (((((B[0]! * r + B[1]!) * r + B[2]!) * r + B[3]!) * r + B[4]!) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((C[0]! * q + C[1]!) * q + C[2]!) * q + C[3]!) * q + C[4]!) * q + C[5]!) / ((((D[0]! * q + D[1]!) * q + D[2]!) * q + D[3]!) * q + 1);
  }
  // Halley: e = Φ(x) − p, u = e·√(2π)·e^(x²/2), x ← x − u/(1 + x·u/2). The upper half is refined against
  // the upper tail so 1 − p never cancels.
  const e = p > 0.5 ? -(phi(-x) - (1 - p)) : phi(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

// ---- Loader's saddle-point mass functions ----------------------------------------

const S0 = 1 / 12;
const S1 = 1 / 360;
const S2 = 1 / 1260;
const S3 = 1 / 1680;
const S4 = 1 / 1188;

/** log(n!) for a small integer n, by an exact product. */
function logFactorialSmall(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i += 1) f *= i;
  return Math.log(f);
}

/** stirlerr(n) = log(n!) − log(√(2π n) (n/e)ⁿ), the error of Stirling's formula, for an integer n ≥ 0. */
export function stirlerr(n: number): number {
  if (n <= 15) {
    if (n === 0) return Infinity; // never used: the callers treat 0 apart
    return logFactorialSmall(n) - (n + 0.5) * Math.log(n) + n - LN_SQRT_2PI;
  }
  const nn = n * n;
  if (n > 500) return (S0 - S1 / nn) / n;
  if (n > 80) return (S0 - (S1 - S2 / nn) / nn) / n;
  if (n > 35) return (S0 - (S1 - (S2 - S3 / nn) / nn) / nn) / n;
  return (S0 - (S1 - (S2 - (S3 - S4 / nn) / nn) / nn) / nn) / n;
}

/** bd0(x, np) = x log(x/np) + np − x, evaluated without cancellation when x ≈ np. */
export function bd0(x: number, np: number): number {
  if (Math.abs(x - np) < 0.1 * (x + np)) {
    let v = (x - np) / (x + np);
    let s = (x - np) * v;
    let ej = 2 * x * v;
    v *= v;
    for (let j = 1; j < 1000; j += 1) {
      ej *= v;
      const s1 = s + ej / (2 * j + 1);
      if (s1 === s) return s1;
      s = s1;
    }
    return s;
  }
  return x * Math.log(x / np) + np - x;
}

/** The binomial mass C(n, k) pᵏ (1−p)ⁿ⁻ᵏ, for integer 0 ≤ k ≤ n and 0 ≤ p ≤ 1. */
export function binomialPmf(k: number, n: number, p: number): number {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`binomial n must be a whole number ≥ 0, got ${n}`);
  if (!(p >= 0 && p <= 1)) throw new RangeError(`binomial p must lie in [0, 1], got ${p}`);
  if (!Number.isInteger(k) || k < 0 || k > n) return 0;
  const q = 1 - p;
  if (p === 0) return k === 0 ? 1 : 0;
  if (q === 0) return k === n ? 1 : 0;
  if (k === 0) return Math.exp(n * Math.log(q));
  if (k === n) return Math.exp(n * Math.log(p));
  const lc = stirlerr(n) - stirlerr(k) - stirlerr(n - k) - bd0(k, n * p) - bd0(n - k, n * q);
  const lf = 2 * LN_SQRT_2PI + Math.log(k) + Math.log1p(-k / n);
  return Math.exp(lc - 0.5 * lf);
}

/** P(X ≤ k) for X ~ B(n, p), summed from the shorter side so neither tail cancels. */
export function binomialCdf(k: number, n: number, p: number): number {
  if (k < 0) return 0;
  if (k >= n) return 1;
  const kk = Math.floor(k);
  if (kk <= n * p) {
    let s = 0;
    for (let i = 0; i <= kk; i += 1) s += binomialPmf(i, n, p);
    return Math.min(1, s);
  }
  let s = 0;
  for (let i = kk + 1; i <= n; i += 1) s += binomialPmf(i, n, p);
  return Math.max(0, 1 - s);
}

/** P(X ≥ k) for X ~ B(n, p): the upper tail is summed directly, so it keeps its own relative accuracy. */
export function binomialSf(k: number, n: number, p: number): number {
  const kk = Math.ceil(k);
  if (kk <= 0) return 1;
  if (kk > n) return 0;
  return kk > n * p ? sumBinomial(kk, n, n, p) : Math.max(0, 1 - binomialCdf(kk - 1, n, p));
}

function sumBinomial(lo: number, hi: number, n: number, p: number): number {
  let s = 0;
  for (let i = lo; i <= hi; i += 1) s += binomialPmf(i, n, p);
  return Math.min(1, s);
}

/** P(a ≤ X ≤ b) for X ~ B(n, p), by summing the mass on the shorter side of the mean. */
export function binomialRange(a: number, b: number, n: number, p: number): number {
  const lo = Math.max(0, Math.ceil(a));
  const hi = Math.min(n, Math.floor(b));
  if (hi < lo) return 0;
  return sumBinomial(lo, hi, n, p);
}

/** The Poisson mass e^(−λ) λᵏ / k!, for integer k ≥ 0 and λ ≥ 0. */
export function poissonPmf(k: number, lambda: number): number {
  if (!(lambda >= 0)) throw new RangeError(`Poisson λ must be ≥ 0, got ${lambda}`);
  if (!Number.isInteger(k) || k < 0) return 0;
  if (lambda === 0) return k === 0 ? 1 : 0;
  if (k === 0) return Math.exp(-lambda);
  return Math.exp(-stirlerr(k) - bd0(k, lambda)) / Math.sqrt(2 * Math.PI * k);
}

/** P(X ≤ k) for X ~ Poisson(λ). */
export function poissonCdf(k: number, lambda: number): number {
  if (k < 0) return 0;
  const kk = Math.floor(k);
  let s = 0;
  for (let i = 0; i <= kk; i += 1) s += poissonPmf(i, lambda);
  return Math.min(1, s);
}

/** P(a ≤ X ≤ b) for X ~ Poisson(λ); `b` may be Infinity (summed until the terms vanish). */
export function poissonRange(a: number, b: number, lambda: number): number {
  const lo = Math.max(0, Math.ceil(a));
  if (b !== Infinity) {
    let s = 0;
    for (let i = lo; i <= Math.floor(b); i += 1) s += poissonPmf(i, lambda);
    return Math.min(1, s);
  }
  // Above the mean the terms fall off geometrically: sum until they are below 1e-18 of the total.
  if (lo <= lambda) return Math.max(0, 1 - poissonCdf(lo - 1, lambda));
  let s = 0;
  for (let i = lo; i < lo + 100000; i += 1) {
    const t = poissonPmf(i, lambda);
    s += t;
    if (t < s * 1e-18 && i > lambda) break;
  }
  return Math.min(1, s);
}

/** The binomial coefficient C(n, k) as an exact integer string, or null when it has more than `maxDigits` digits. */
export function binomialCoefficientText(n: number, k: number, maxDigits = 12): string | null {
  const kk = Math.min(k, n - k);
  let c = 1n;
  for (let i = 1n; i <= BigInt(kk); i += 1n) c = (c * (BigInt(n) - BigInt(kk) + i)) / i;
  const s = c.toString();
  return s.length > maxDigits ? null : s;
}

/** k! as an exact integer string, or null past `maxDigits` digits. */
export function factorialText(k: number, maxDigits = 12): string | null {
  let f = 1n;
  for (let i = 2n; i <= BigInt(k); i += 1n) {
    f *= i;
    if (f.toString().length > maxDigits) return null;
  }
  return f.toString();
}
