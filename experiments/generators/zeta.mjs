/*
 * "THE ZEROS KNOW WHERE THE PRIMES ARE" — von Mangoldt's explicit formula.
 *
 * ψ(x) = Σ_{p^m ≤ x} log p counts prime powers, weighted. It is a staircase:
 * flat, then a jump of log p at every prime and prime power. Riemann's
 * explicit formula, proved by von Mangoldt, says that staircase is exactly
 *
 *     ψ(x) = x − Σ_ρ x^ρ/ρ − log 2π − ½ log(1 − x⁻²)
 *
 * where ρ runs over the nontrivial zeros of ζ. The first term is a straight
 * line. Everything that makes it a staircase — every jump, at every prime,
 * in the right place, of the right size — comes out of the zeros.
 *
 * So this plate shows a straight line being beaten into the primes by a sum
 * of waves, one wave per zero. Nothing about primes is fed in.
 *
 * NOTHING IS TABULATED. The zeros are computed here: ζ on the critical line by
 * Euler–Maclaurin, the Riemann–Siegel theta by its asymptotic series, and then
 * Z(t) = e^{iθ(t)} ζ(½+it), which is real, so its zeros are sign changes to
 * bisect. The first three are checked against their known values, and the
 * generator throws if they are wrong — see ZEROS_KNOWN.
 */
import { writeFileSync } from "node:fs";

// ---------------------------------------------------------------- geometry
const W = 1700;
const H = 2070;
const BG = "#06070E";

const PLOT_X0 = 132;
const PLOT_X1 = 1568;

const STRIP_Y0 = 322;             // Z(t) on the critical line
const STRIP_Y1 = 566;
const T_MAX = 100;                // strip's t range

const MAIN_Y0 = 700;              // the staircase and its convergents
const MAIN_Y1 = 1700;
const MAIN_X1 = 1132;             // square: psi(x) ~ x is a 45-degree diagonal
const SIDE_X = 1196;              // the margin the square leaves free
const X_LO = 2;                   // the staircase's x range
const X_HI = 50;

// ---------------------------------------------------------------- palette
const hx = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const pad = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
const mix = (a, b, k) => {
  const A = hx(a);
  const B = hx(b);
  return `#${A.map((v, i) => pad(v + (B[i] - v) * k)).join("")}`;
};

const TRUTH = "#FFF4DC";
const INK = "#EFE6CE";
const DIM = "#98A2C8";
const FAINT = "#77809F";
const AXIS = "#2A2F52";

// ---------------------------------------------------------------- ζ machinery
/** Complex helpers, just enough for Euler–Maclaurin. */
const cAdd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const cMul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cDiv = (a, b) => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
/** n^(-s) for real n > 0. */
const nPowNegS = (n, s) => {
  const m = Math.pow(n, -s[0]);
  const a = -s[1] * Math.log(n);
  return [m * Math.cos(a), m * Math.sin(a)];
};

// Euler–Maclaurin correction coefficients B_2k/(2k)!.
const EM = [1 / 12, -1 / 720, 1 / 30240, -1 / 1209600, 1 / 47900160];

/**
 * ζ(s) by Euler–Maclaurin summation.
 *
 * Σ_{n<N} n^-s  +  N^-s/2  +  N^(1-s)/(s-1)  +  Σ_k c_k Π(s+j) N^(-s-2k+1)
 *
 * Accuracy needs N to outgrow |t|, so N is chosen from the imaginary part
 * rather than fixed — a constant N that is ample at t = 20 is useless at 300.
 */
function zeta(s) {
  const N = Math.max(24, Math.ceil(Math.abs(s[1])) + 12);
  let sum = [0, 0];
  for (let n = 1; n < N; n += 1) sum = cAdd(sum, nPowNegS(n, s));

  const nNegS = nPowNegS(N, s);
  sum = cAdd(sum, [nNegS[0] / 2, nNegS[1] / 2]);
  // N^(1-s)/(s-1)
  const oneMinusS = [1 - s[0], -s[1]];
  const nPow1ms = [
    Math.pow(N, oneMinusS[0]) * Math.cos(oneMinusS[1] * Math.log(N)),
    Math.pow(N, oneMinusS[0]) * Math.sin(oneMinusS[1] * Math.log(N)),
  ];
  sum = cAdd(sum, cDiv(nPow1ms, [s[0] - 1, s[1]]));

  // Π_{j=0}^{2k-2} (s+j), built up term by term, times N^(-s-2k+1).
  let prod = [s[0], s[1]];
  for (let k = 1; k <= EM.length; k += 1) {
    const exp = [-s[0] - 2 * k + 1, -s[1]];
    const nPow = [
      Math.pow(N, exp[0]) * Math.cos(exp[1] * Math.log(N)),
      Math.pow(N, exp[0]) * Math.sin(exp[1] * Math.log(N)),
    ];
    const term = cMul([EM[k - 1], 0], cMul(prod, nPow));
    sum = cAdd(sum, term);
    prod = cMul(prod, cMul([s[0] + 2 * k - 1, s[1]], [s[0] + 2 * k, s[1]]));
  }
  return sum;
}

/** Riemann–Siegel theta, asymptotic. Only used for t well above 8. */
const theta = (t) =>
  (t / 2) * Math.log(t / (2 * Math.PI)) - t / 2 - Math.PI / 8
  + 1 / (48 * t) + 7 / (5760 * t * t * t);

/** Z(t) = e^{iθ(t)} ζ(½+it), which is real — so its zeros can be bisected. */
function Z(t) {
  const z = zeta([0.5, t]);
  const th = theta(t);
  return Math.cos(th) * z[0] - Math.sin(th) * z[1];
}

/** Every zero of Z below tMax, by scan and bisection. */
function findZeros(tMax) {
  const zeros = [];
  const step = 0.05;
  let prevT = 8;
  let prev = Z(prevT);
  for (let t = 8 + step; t <= tMax; t += step) {
    const v = Z(t);
    if ((prev < 0) !== (v < 0)) {
      let lo = prevT;
      let hi = t;
      for (let i = 0; i < 60; i += 1) {
        const mid = (lo + hi) / 2;
        if ((Z(lo) < 0) !== (Z(mid) < 0)) hi = mid;
        else lo = mid;
      }
      zeros.push((lo + hi) / 2);
    }
    prevT = t;
    prev = v;
  }
  return zeros;
}

const ZEROS = findZeros(320);

// The computation is worth nothing if it is wrong, and these three values are
// the standard check. A drift throws rather than drawing a plausible lie.
const ZEROS_KNOWN = [14.134725142, 21.022039639, 25.010857580];
ZEROS_KNOWN.forEach((known, i) => {
  if (Math.abs(ZEROS[i] - known) > 1e-6) {
    throw new Error(`zero ${i + 1} came out ${ZEROS[i]}, expected ${known}`);
  }
});

// ---------------------------------------------------------------- ψ and its sum
/** ψ(x) = Σ_{p^m ≤ x} log p — the staircase, computed from the primes. */
function chebyshevSteps(limit) {
  const composite = new Uint8Array(limit + 1);
  const steps = [];
  for (let p = 2; p <= limit; p += 1) {
    if (composite[p]) continue;
    for (let q = p * p; q <= limit; q += p) composite[q] = 1;
    for (let v = p; v <= limit; v *= p) steps.push({ at: v, rise: Math.log(p), p });
  }
  return steps.sort((a, b) => a.at - b.at);
}
const STEPS = chebyshevSteps(X_HI + 1);
const psi = (x) => STEPS.filter((s) => s.at <= x).reduce((a, s) => a + s.rise, 0);

/**
 * The explicit formula truncated to the first `k` zeros.
 *
 * Each conjugate pair contributes 2·Re(x^ρ/ρ). With ρ = ½+iγ that is
 * 2√x (½cos(γ log x) + γ sin(γ log x)) / (¼ + γ²) — one damped wave per zero,
 * whose frequency in log x is the zero's height.
 */
function explicit(x, k) {
  const lx = Math.log(x);
  let wave = 0;
  for (let i = 0; i < k; i += 1) {
    const g = ZEROS[i];
    wave += 2 * Math.sqrt(x) * (0.5 * Math.cos(g * lx) + g * Math.sin(g * lx)) / (0.25 + g * g);
  }
  return x - Math.log(2 * Math.PI) - 0.5 * Math.log(1 - Math.pow(x, -2)) - wave;
}

// ---------------------------------------------------------------- emission
const kids = [];
let uid = 0;
const nid = (p) => `${p}${uid++}`;

const rect = (x, y, w, h, fill) =>
  kids.push({
    type: "block", id: nid("r"), x, y, width: Math.max(w, 0.4), height: Math.max(h, 0.4),
    fill, stroke: "transparent", strokeWidth: 0, radius: 0, padding: 0,
  });

const dot = (cx, cy, d, fill) =>
  kids.push({
    type: "block", id: nid("d"), x: cx - d / 2, y: cy - d / 2, width: d, height: d,
    shape: "circle", fill, stroke: "transparent", strokeWidth: 0, padding: 0,
  });

function text(x, y, w, label, fs, fill, align = "start") {
  kids.push({
    type: "block", id: nid("t"), x, y, width: w,
    height: label.split("\n").length * fs * 1.45 + 3, label,
    fill: "transparent", stroke: "transparent", strokeWidth: 0,
    textColor: fill, fontSize: fs, padding: 0, textAlign: align,
  });
}

/**
 * A function drawn as a chain of thin vertical spans, one per sample column.
 *
 * Each span reaches from this sample to the next, so a steep stretch stays
 * continuous instead of breaking into dots. Consecutive spans necessarily
 * overlap, which is exactly what `allowOverlap` is for: without it a curve
 * would have to be quantised onto a lattice and would lose its steep parts.
 */
function curve(fn, x0, x1, toX, toY, colour, weight = 2.4) {
  const cols = Math.round(toX(x1) - toX(x0));
  let prev = toY(fn(x0));
  for (let i = 1; i <= cols; i += 1) {
    const x = x0 + ((x1 - x0) * i) / cols;
    const y = toY(fn(x));
    const px = toX(x);
    rect(px - weight / 2, Math.min(prev, y), weight, Math.abs(y - prev) + weight, colour);
    prev = y;
  }
}

// ================================================== masthead
text(110, 74, 1000, "THE ZEROS KNOW", 46, INK);
text(110, 152, 1000, "WHERE THE PRIMES ARE", 46, INK);
text(112, 236, 760,
  "Riemann's explicit formula, computed from scratch: no table of zeros, no table of primes.",
  17, DIM);

// ================================================== I. Z(t) on the critical line
const tToX = (t) => PLOT_X0 + (t / T_MAX) * (PLOT_X1 - PLOT_X0);
const zMid = (STRIP_Y0 + STRIP_Y1) / 2;
let zMaxAbs = 0;
for (let t = 0.5; t <= T_MAX; t += 0.25) zMaxAbs = Math.max(zMaxAbs, Math.abs(Z(t)));
const zToY = (v) => zMid - (v / zMaxAbs) * ((STRIP_Y1 - STRIP_Y0) / 2 - 8);

rect(PLOT_X0, zMid, PLOT_X1 - PLOT_X0, 1, AXIS);
curve((t) => Z(t), 1.2, T_MAX, tToX, zToY, "#5E7CC8", 1.8);

// Every crossing is a zero of ζ on the critical line. They are the only input
// the reconstruction below ever sees.
for (const g of ZEROS.filter((g) => g <= T_MAX)) dot(tToX(g), zMid, 7, "#FFC96A");

text(PLOT_X0, STRIP_Y0 - 40, 700,
  "I.   Z(t), the real function that shares its zeros with ζ on the critical line", 15, FAINT);
for (const t of [0, 20, 40, 60, 80, 100]) {
  rect(tToX(t), STRIP_Y1 + 8, 1, 6, AXIS);
  text(tToX(t) - 30, STRIP_Y1 + 18, 60, String(t), 12, FAINT, "center");
}
text(PLOT_X1 - 200, STRIP_Y1 + 40, 200, "t", 13, FAINT, "end");
text(PLOT_X0, STRIP_Y1 + 40, 560,
  `${ZEROS.filter((g) => g <= T_MAX).length} zeros below t = ${T_MAX}; ${ZEROS.length} were computed and used below.`,
  13, FAINT);

// ================================================== II. the staircase
const psiMax = X_HI;   // the diagonal is then exactly 45 degrees
const xToX = (x) => PLOT_X0 + ((x - X_LO) / (X_HI - X_LO)) * (MAIN_X1 - PLOT_X0);
const yToY = (v) => MAIN_Y1 - (v / psiMax) * (MAIN_Y1 - MAIN_Y0);

rect(PLOT_X0, MAIN_Y1, MAIN_X1 - PLOT_X0, 1, AXIS);
rect(PLOT_X0, MAIN_Y0, 1, MAIN_Y1 - MAIN_Y0, AXIS);

// Convergents, coldest and furthest from the truth first, so the warm ones
// that hug the staircase are drawn on top of the ones that miss it.
const RUNS = [
  { k: 0, colour: "#2B3670", label: "no zeros: just x − log 2π" },
  { k: 5, colour: "#3F5CB8" },
  { k: 25, colour: "#7D5FC8" },
  { k: 80, colour: "#C55C93" },
  { k: ZEROS.length, colour: "#F2A052" },
];
for (const run of RUNS) {
  curve((x) => explicit(x, run.k), X_LO, X_HI, xToX, yToY, run.colour, run.k === 0 ? 2.2 : 2.0);
}

// The staircase itself, drawn last and brightest: treads and risers, exact.
let level = 0;
let cursor = X_LO;
for (const step of STEPS) {
  if (step.at < X_LO || step.at > X_HI) continue;
  rect(xToX(cursor), yToY(level) - 1.5, xToX(step.at) - xToX(cursor), 3, TRUTH);
  rect(xToX(step.at) - 1.5, yToY(level + step.rise), 3, yToY(level) - yToY(level + step.rise), TRUTH);
  level += step.rise;
  cursor = step.at;
}
rect(xToX(cursor), yToY(level) - 1.5, xToX(X_HI) - xToX(cursor), 3, TRUTH);

for (const x of [10, 20, 30, 40, 50]) {
  rect(xToX(x), MAIN_Y1 + 8, 1, 6, AXIS);
  text(xToX(x) - 30, MAIN_Y1 + 18, 60, String(x), 12, FAINT, "center");
}
text(MAIN_X1 - 200, MAIN_Y1 + 42, 200, "x", 13, FAINT, "end");
for (const v of [10, 20, 30, 40]) {
  rect(PLOT_X0 - 6, yToY(v), 6, 1, AXIS);
  text(PLOT_X0 - 76, yToY(v) - 10, 60, String(v), 12, FAINT, "end");
}
text(PLOT_X0 - 76, MAIN_Y0 - 4, 60, "ψ", 13, FAINT, "end");
text(PLOT_X0, MAIN_Y0 - 42, 900,
  "II.  ψ(x) = Σ log p over prime powers p^m ≤ x, and the formula closing on it", 15, FAINT);

// A few risers named, so the steps are legibly the primes.
for (const step of STEPS) {
  if (step.at !== step.p) continue;                 // primes only, not powers
  if (![5, 11, 17, 23, 31, 41, 47].includes(step.p)) continue;
  const running = STEPS.filter((s) => s.at <= step.at).reduce((a, s) => a + s.rise, 0);
  text(xToX(step.at) - 26, yToY(running) - 30, 52, String(step.p), 12, "#8E96BE", "center");
}

// --- legend, in the empty upper-left of the main plot -----------------------
let ly = MAIN_Y0 + 8;
text(SIDE_X, ly, 380, "ZEROS USED", 14, DIM);
ly += 34;
for (const run of RUNS) {
  rect(SIDE_X, ly + 8, 38, 3, run.colour);
  text(SIDE_X + 52, ly, 330, run.label ?? `${run.k} zeros`, 13.5, DIM);
  ly += 28;
}
rect(SIDE_X, ly + 8, 38, 3, TRUTH);
text(SIDE_X + 52, ly, 330, "ψ(x) itself", 13.5, TRUTH);
text(SIDE_X, ly + 76, 372,
  "Each curve is the same straight line —\n" +
  "x − log 2π — with a few more waves\n" +
  "added. The waves are the only thing\n" +
  "here that knows about primes, and\n" +
  "they learned it from the zeros above.", 14, FAINT);

// ================================================== coda
text(110, 1836, 700,
  "Each zero contributes one damped wave, 2√x (½cos(γ log x) + γ sin(γ log x)) / (¼ + γ²),\n" +
  "whose frequency in log x is the zero's own height. Add enough of them and the waves\n" +
  "interfere into a staircase that rises only at primes and prime powers.", 14, "#8791BC");
text(880, 1836, 720,
  "The zeros were found by bisecting sign changes of Z; the first three agree with\n" +
  "14.134725, 21.022040, 25.010858 to within 10⁻⁶, and the generator throws if they\n" +
  "do not. No prime is used anywhere in computing the coloured curves.", 14, "#8791BC");

const spec = {
  version: 1,
  title: "The Zeros Know Where The Primes Are",
  canvas: {
    padding: 0, background: BG, theme: "dark", vignette: 0.3,
    // A curve drawn as a chain of spans has consecutive spans that overlap;
    // without this the curves would have to be quantised onto a lattice and
    // would break apart exactly where they are steepest.
    constraints: { allowOverlap: true },
  },
  root: { type: "scene", layout: "absolute", width: W, height: H, children: kids },
};
writeFileSync("out/zeta.json", JSON.stringify(spec));
console.log(
  `wrote out/zeta.json -- ${ZEROS.length} zeros (first ${ZEROS[0].toFixed(6)}), ` +
  `${STEPS.filter((s) => s.at <= X_HI).length} steps, ${kids.length} blocks`,
);
