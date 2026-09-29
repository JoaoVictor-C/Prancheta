/**
 * The probability kernels behind `distribution`. Every reference value below
 * is a published constant or was computed by scipy 1.x at double precision,
 * and where a value can be had exactly (a binomial with rational p) it is
 * recomputed here in BigInt arithmetic, so the saddle-point mass functions are
 * held to the exact answer and not to a second floating-point implementation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  bd0,
  binomialCdf,
  binomialCoefficientText,
  binomialPmf,
  binomialRange,
  binomialSf,
  erf,
  erfc,
  factorialText,
  normalCdf,
  normalPdf,
  phi,
  phiInv,
  poissonCdf,
  poissonPmf,
  poissonRange,
  stdNormalPdf,
  stirlerr,
} from "../src/math/probability.ts";

const abs = (a: number, b: number, eps: number, what = ""): void => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} vs ${b} (|Δ| = ${Math.abs(a - b)}, allowed ${eps})`);
const rel = (a: number, b: number, eps: number, what = ""): void => assert.ok(Math.abs(a - b) <= eps * Math.abs(b), `${what} ${a} vs ${b} (relative Δ = ${Math.abs(a - b) / Math.abs(b)}, allowed ${eps})`);

// ---- erf ----------------------------------------------------------------------------------

test("erf agrees with reference values to better than 1e-12", () => {
  const table: [number, number][] = [
    [0, 0],
    [0.1, 0.1124629160182849],
    [0.5, 0.5204998778130465],
    [1, 0.8427007929497148],
    [1.5, 0.9661051464753108],
    [2, 0.9953222650189527],
    [2.5, 0.999593047982555],
    [3, 0.9999779095030014],
    [4, 0.9999999845827421],
  ];
  for (const [x, want] of table) {
    abs(erf(x), want, 1e-14, `erf(${x})`);
    abs(erf(-x), -want, 1e-14, `erf(${-x})`);
  }
  assert.equal(erf(0), 0);
  assert.equal(erf(30), 1);
  assert.equal(erf(-30), -1);
  assert.ok(Number.isNaN(erf(NaN)));
});

test("erfc keeps RELATIVE accuracy in the tail, where 1 − erf would print zero", () => {
  const table: [number, number][] = [
    [0.5, 0.4795001221869535],
    [1.9, 0.007209570764742531],
    [2, 0.004677734981047266],
    [2.1, 0.0029794666563329845],
    [3, 2.2090496998585445e-5],
    [5, 1.5374597944280347e-12],
    [8, 1.1224297172982928e-29],
    [10, 2.0884875837625446e-45],
  ];
  for (const [x, want] of table) rel(erfc(x), want, 1e-12, `erfc(${x})`);
  assert.equal(erfc(40), 0);
  abs(erfc(-2), 2 - 0.004677734981047266, 1e-15);
});

test("erf + erfc = 1 on both sides of the switch between series and fraction", () => {
  for (let x = -5; x <= 5; x += 0.0625) abs(erf(x) + erfc(x), 1, 2e-16 * 4, `x=${x}`);
  // the two regimes meet at 2 without a step
  abs(erfc(2 - 1e-12), erfc(2 + 1e-12), 1e-11);
});

// ---- the normal law ------------------------------------------------------------------------------

test("Φ matches the values every table prints, to better than 1e-12", () => {
  abs(phi(1), 0.841344746068543, 1e-14, "Φ(1)");
  abs(phi(1.96), 0.9750021048517795, 1e-14, "Φ(1,96)");
  abs(phi(-3), 0.0013498980316300933, 1e-14, "Φ(−3)");
  abs(phi(-1.96), 0.024997895148220435, 1e-14);
  abs(phi(-1), 0.15865525393145707, 1e-14);
  abs(phi(0.5), 0.6914624612740131, 1e-14);
  abs(phi(3.5), 0.9997673709209645, 1e-14);
  assert.equal(phi(0), 0.5);
  assert.equal(phi(Infinity), 1);
  assert.equal(phi(-Infinity), 0);
});

test("Φ(−z) is computed from the tail: far tails keep their digits", () => {
  rel(phi(-8), 6.22096057427174e-16, 1e-12);
  rel(phi(-6), 9.865876450376946e-10, 1e-12);
  for (const z of [0.1, 0.7, 1.3, 2.9, 4.4]) abs(phi(z) + phi(-z), 1, 2e-16);
});

test("normalCdf standardises", () => {
  abs(normalCdf(75, 70, 5), phi(1), 1e-15);
  abs(normalCdf(60, 70, 5), phi(-2), 1e-15);
  // the textbook answer: P(60 < X < 75) = Φ(1) − Φ(−2) = 0,81859...
  abs(normalCdf(75, 70, 5) - normalCdf(60, 70, 5), 0.8185946141203637, 1e-14);
});

test("the density is φ(z)/σ and integrates to one", () => {
  abs(stdNormalPdf(0), 0.3989422804014327, 1e-16);
  abs(normalPdf(70, 70, 5), 0.3989422804014327 / 5, 1e-16);
  abs(normalPdf(75, 70, 5), Math.exp(-0.5) * 0.3989422804014327 / 5, 1e-16);
  // trapezoid over ±8σ
  let s = 0;
  const h = 0.001;
  for (let x = -8; x <= 8; x += h) s += stdNormalPdf(x) * h;
  abs(s, 1, 1e-6);
});

test("Φ⁻¹ inverts Φ, to machine precision, across the whole range", () => {
  const table: [number, number][] = [
    [1e-12, -7.034483825301131],
    [1e-6, -4.753424308822899],
    [0.001, -3.090232306167813],
    [0.025, -1.9599639845400545],
    [0.05, -1.6448536269514729],
    [0.1, -1.2815515655446004],
    [0.9, 1.2815515655446004],
    [0.975, 1.959963984540054],
    [0.995, 2.5758293035489004],
    [0.9999, 3.719016485455709],
  ];
  for (const [p, want] of table) abs(phiInv(p), want, 1e-12, `Φ⁻¹(${p})`);
  assert.equal(phiInv(0.5), 0);
  assert.equal(phiInv(0), -Infinity);
  assert.equal(phiInv(1), Infinity);
  assert.ok(Number.isNaN(phiInv(-0.1)));
  assert.ok(Number.isNaN(phiInv(1.1)));
  for (const p of [1e-300, 1e-100, 1e-20, 1e-9, 0.001, 0.02, 0.0243, 0.3, 0.5, 0.7, 0.97, 0.9757, 0.999, 1 - 1e-9]) {
    const z = phiInv(p);
    // compare on the small side of Φ so the check itself does not cancel
    if (p < 0.5) rel(phi(z), p, 1e-11, `Φ(Φ⁻¹(${p}))`);
    else rel(phi(-z), 1 - p, 1e-6, `tail of Φ⁻¹(${p})`);
  }
});

test("Φ⁻¹ is odd and increasing", () => {
  let last = -Infinity;
  for (let p = 0.001; p < 1; p += 0.001) {
    const z = phiInv(p);
    assert.ok(z > last, `not increasing at ${p}`);
    last = z;
    abs(phiInv(1 - p), -z, 1e-9, `oddness at ${p}`);
  }
});

// ---- binomial ----------------------------------------------------------------------------------------

/** C(n, k) p^k q^(n−k) for p = a/b, exactly, as a float. */
function exactBinomial(k: number, n: number, a: bigint, b: bigint): number {
  let c = 1n;
  for (let i = 1n; i <= BigInt(k); i += 1n) c = (c * (BigInt(n) - BigInt(k) + i)) / i;
  const num = c * a ** BigInt(k) * (b - a) ** BigInt(n - k);
  const den = b ** BigInt(n);
  const scaled = (num * 10n ** 80n) / den;
  return Number(scaled) / 1e80;
}

test("the binomial mass is right to 1e-13 relative, against exact rational arithmetic", () => {
  const cases: [number, number, bigint, bigint][] = [
    [3, 10, 3n, 10n],
    [0, 10, 3n, 10n],
    [10, 10, 3n, 10n],
    [7, 10, 1n, 2n],
    [20, 50, 2n, 5n],
    [25, 50, 1n, 2n],
    [1, 60, 1n, 100n],
    [59, 60, 99n, 100n],
    [5, 15, 1n, 3n],
    [16, 40, 7n, 20n],
    [80, 120, 2n, 3n],
  ];
  for (const [k, n, a, b] of cases) rel(binomialPmf(k, n, Number(a) / Number(b)), exactBinomial(k, n, a, b), 1e-13, `pmf(${k}; ${n}, ${a}/${b})`);
});

test("the binomial mass matches scipy up to n = 2000", () => {
  const table: [number, number, number, number][] = [
    [3, 10, 0.3, 0.2668279319999998],
    [0, 10, 0.3, 0.0282475249],
    [10, 10, 0.3, 5.9048999999999975e-6],
    [500, 1000, 0.5, 0.025225018178360824],
    [370, 1000, 0.37, 0.026122808087172343],
    [20, 50, 0.4, 0.11455855282952418],
    [1, 1000, 0.001, 0.3680634882592233],
    [5, 2000, 0.002, 0.15644996707035377],
  ];
  for (const [k, n, p, want] of table) rel(binomialPmf(k, n, p), want, 1e-12, `pmf(${k}; ${n}, ${p})`);
});

test("a binomial's masses sum to one and their mean is np, for n up to 1000", () => {
  for (const [n, p] of [[10, 0.3], [50, 0.4], [200, 0.05], [1000, 0.37], [1000, 0.5], [1000, 0.999]] as [number, number][]) {
    let s = 0;
    let m = 0;
    for (let k = 0; k <= n; k += 1) {
      const t = binomialPmf(k, n, p);
      s += t;
      m += k * t;
    }
    abs(s, 1, 1e-13, `Σ pmf, n=${n}, p=${p}`);
    abs(m, n * p, 1e-10 * Math.max(1, n * p), `mean, n=${n}, p=${p}`);
  }
});

test("binomial cdf, survival and range agree with scipy and with each other", () => {
  abs(binomialCdf(2, 10, 0.3), 0.38278278639999974, 1e-15);
  abs(binomialCdf(18, 50, 0.4), 0.3356132635690678, 1e-14);
  abs(binomialCdf(400, 1000, 0.37), 0.9766949451853648, 1e-13);
  abs(binomialCdf(480, 1000, 0.5), 0.10872414660207082, 1e-13);
  assert.equal(binomialCdf(-1, 10, 0.3), 0);
  assert.equal(binomialCdf(10, 10, 0.3), 1);
  // P(X ≥ k) = 1 − P(X ≤ k − 1)
  abs(binomialSf(3, 10, 0.3), 1 - binomialCdf(2, 10, 0.3), 1e-15);
  abs(binomialSf(30, 50, 0.4), 1 - binomialCdf(29, 50, 0.4), 1e-14);
  assert.equal(binomialSf(0, 10, 0.3), 1);
  assert.equal(binomialSf(11, 10, 0.3), 0);
  // the range is a difference of cdfs
  abs(binomialRange(18, 24, 50, 0.4), binomialCdf(24, 50, 0.4) - binomialCdf(17, 50, 0.4), 1e-14);
  abs(binomialRange(0, 2, 10, 0.3), binomialCdf(2, 10, 0.3), 1e-15);
  assert.equal(binomialRange(5, 3, 10, 0.3), 0);
  // the upper tail keeps its digits: P(X ≥ 990) for B(1000; 0,5) is astronomically small but positive
  assert.ok(binomialSf(990, 1000, 0.5) > 0 && binomialSf(990, 1000, 0.5) < 1e-250);
});

test("the binomial refuses a probability outside [0, 1] and a non-integer n, and is zero off its support", () => {
  assert.throws(() => binomialPmf(1, 10, 1.5), RangeError);
  assert.throws(() => binomialPmf(1, 10.5, 0.3), RangeError);
  assert.equal(binomialPmf(-1, 10, 0.3), 0);
  assert.equal(binomialPmf(11, 10, 0.3), 0);
  assert.equal(binomialPmf(2.5, 10, 0.3), 0);
  assert.equal(binomialPmf(0, 10, 0), 1);
  assert.equal(binomialPmf(10, 10, 1), 1);
});

test("the exact coefficient is an integer string, and null when it would not fit a line", () => {
  assert.equal(binomialCoefficientText(10, 3), "120");
  assert.equal(binomialCoefficientText(30, 15), "155117520");
  assert.equal(binomialCoefficientText(10, 0), "1");
  assert.equal(binomialCoefficientText(10, 10), "1");
  assert.equal(binomialCoefficientText(1000, 500), null);
  assert.equal(factorialText(5), "120");
  assert.equal(factorialText(0), "1");
  assert.equal(factorialText(40), null);
});

// ---- Poisson ---------------------------------------------------------------------------------------------

test("the Poisson mass matches scipy", () => {
  const table: [number, number, number][] = [
    [2, 3, 0.22404180765538775],
    [0, 3, 0.049787068367863944],
    [100, 100, 0.03986099680914883],
    [30, 30, 0.07263452647159181],
    [0, 0.5, 0.6065306597126334],
    [12, 2.5, 1.0214260629538451e-5],
  ];
  for (const [k, l, want] of table) rel(poissonPmf(k, l), want, 1e-12, `pmf(${k}; ${l})`);
});

test("a Poisson's masses sum to one, its mean is λ, and its cdf and range agree", () => {
  for (const l of [0.5, 3, 30, 200, 1000]) {
    let s = 0;
    let m = 0;
    for (let k = 0; k <= l + 40 * Math.sqrt(l) + 60; k += 1) {
      const t = poissonPmf(k, l);
      s += t;
      m += k * t;
    }
    abs(s, 1, 1e-13, `Σ pmf, λ=${l}`);
    abs(m, l, 1e-9 * Math.max(1, l), `mean, λ=${l}`);
  }
  abs(poissonCdf(2, 3), 0.42319008112684364, 1e-15);
  abs(poissonCdf(24, 30), 0.1572420272383916, 1e-14);
  abs(poissonCdf(100, 100), 0.5265621985299985, 1e-13);
  // P(X ≥ 1) = 1 − e^(−3), and an open range reaches infinity
  abs(poissonRange(1, Infinity, 3), 1 - Math.exp(-3), 1e-15);
  abs(poissonRange(5, Infinity, 3), 1 - poissonCdf(4, 3), 1e-15);
  abs(poissonRange(60, Infinity, 30), 1 - poissonCdf(59, 30), 1e-13);
  abs(poissonRange(2, 5, 3), poissonCdf(5, 3) - poissonCdf(1, 3), 1e-15);
  assert.equal(poissonPmf(-1, 3), 0);
  assert.equal(poissonPmf(1.5, 3), 0);
  assert.throws(() => poissonPmf(1, -1), RangeError);
});

// ---- Loader's building blocks, across the thresholds where the series change ---------------------------------------

test("stirlerr is continuous across every threshold of its series (15, 35, 80, 500)", () => {
  // reference values: ln n! − (n + ½) ln n + n − ½ ln 2π summed in 60-digit decimal arithmetic
  const table: [number, number][] = [
    [1, 0.08106146679532726],
    [5, 0.016644691189821193],
    [15, 0.005554733551962801],
    [16, 0.0052076559196096404],
    [35, 0.002380887608234112],
    [36, 0.002314755290514684],
    [80, 0.0010416612415616192],
    [81, 0.0010288013577107774],
    [500, 0.00016666664444446984],
    [501, 0.0001663339765799327],
    [1000, 8.333333055555635e-05],
  ];
  for (const [n, want] of table) abs(stirlerr(n), want, 1e-15, `stirlerr(${n})`);
});

test("bd0 is the same function on both sides of its series switch", () => {
  const direct = (x: number, np: number): number => x * Math.log(x / np) + np - x;
  for (const [x, np] of [[10, 30], [30, 10], [5, 20], [100, 101], [1000, 1010], [12, 11]] as [number, number][]) {
    if (Math.abs(x - np) >= 0.1 * (x + np)) abs(bd0(x, np), direct(x, np), 1e-12);
    else abs(bd0(x, np), direct(x, np), 1e-9 * Math.max(1, Math.abs(direct(x, np)) + 1)); // the series is the accurate one; direct cancels
  }
  assert.equal(bd0(7, 7), 0);
});
