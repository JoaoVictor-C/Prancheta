/*
 * "THE RIEMANN ZETA FUNCTION" — a grid, and what ζ does to it.
 *
 * Take the ordinary square grid of the complex plane, feed every point of it
 * through ζ, and draw where the grid lines land. Straight lines come back as
 * loops and spirals; the whole right-hand half of the plane is wound into a
 * tightening whorl around w = 1, because ζ(σ+it) → 1 as σ → ∞ and every line
 * far to the right collapses towards that single point.
 *
 * ζ is computed by Euler–Maclaurin, which IS the analytic continuation: the
 * correction terms are what carry the value into Re(s) < 1, where the naive
 * series Σ n^-s diverges. So the curves left of the critical strip are not an
 * extrapolation — they are the continued function, evaluated.
 *
 * The one check available is the pole. ζ has a simple pole at s = 1 and no
 * other singularity, so a grid line passing near s = 1 must fly off to
 * infinity, and nothing else may. The generator verifies |ζ| is large near
 * s = 1 and bounded elsewhere on the sampled grid before drawing anything.
 */
import { writeFileSync } from "node:fs";

// ---------------------------------------------------------------- geometry
const W = 1920;
const H = 1264;
const PLOT_Y0 = 176;
const PLOT_Y1 = 1136;
const BG = "#000208";

// The output plane, in w = ζ(s). Isotropic: 1920/14.8 = 960/7.4 = 129.73 px.
const RE_HALF = 7.4;
const IM_HALF = 3.7;
const SCALE = W / (2 * RE_HALF);
const wx = (re) => W / 2 + re * SCALE;
const wy = (im) => (PLOT_Y0 + PLOT_Y1) / 2 - im * SCALE;

// The input plane: the grid that gets transformed.
const SIG_LO = -3.0;
const SIG_HI = 5.0;
const T_HALF = 4.0;
const GRID = 0.2;                // spacing of the grid being transformed

// ---------------------------------------------------------------- palette
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const pad = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
const ramp = (stops) => (t) => {
  const u = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < stops.length - 2 && u > stops[i + 1][0]) i += 1;
  const k = (u - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
  const a = hex(stops[i][1]);
  const b = hex(stops[i + 1][1]);
  return `#${a.map((v, j) => pad(v + (b[j] - v) * k)).join("")}`;
};

// Two pale families, so the images of the two directions stay tellable apart
// without either shouting: lines of constant σ cool, lines of constant t warm.
const sigmaRamp = ramp([
  [0.00, "#6FE3D0"], [0.26, "#74B8F0"], [0.52, "#A79BF0"], [0.76, "#D191E4"], [1.00, "#F2A0BE"],
]);
const tRamp = ramp([
  [0.00, "#7FD9A2"], [0.28, "#B6DE92"], [0.54, "#EADD8C"], [0.78, "#F5B37E"], [1.00, "#F09B96"],
]);

const GRID_MINOR = "#0A2531";
const GRID_MAJOR = "#12475C";
const AXIS = "#8D949E";
const INK = "#F4F6FA";
const DIM = "#8E97B4";

// ---------------------------------------------------------------- ζ
const cAdd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const cMul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cDiv = (a, b) => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const powNeg = (n, s) => {
  const m = Math.pow(n, -s[0]);
  const a = -s[1] * Math.log(n);
  return [m * Math.cos(a), m * Math.sin(a)];
};

// B_2k/(2k)!. Six terms carry the continuation comfortably past Re(s) = -2.
const EM = [1 / 12, -1 / 720, 1 / 30240, -1 / 1209600, 1 / 47900160];

/**
 * ζ(s) by Euler–Maclaurin — and this is the analytic continuation, not an
 * approximation to it. Σ n^-s alone diverges for Re(s) ≤ 1; the tail terms
 * below are exactly what carries the value across.
 */
function zeta(s) {
  const N = Math.max(28, Math.ceil(Math.abs(s[1])) * 2 + 20);
  let sum = [0, 0];
  for (let n = 1; n < N; n += 1) sum = cAdd(sum, powNeg(n, s));

  const half = powNeg(N, s);
  sum = cAdd(sum, [half[0] / 2, half[1] / 2]);

  const lnN = Math.log(N);
  const p1 = Math.pow(N, 1 - s[0]);
  sum = cAdd(sum, cDiv([p1 * Math.cos(-s[1] * lnN), p1 * Math.sin(-s[1] * lnN)], [s[0] - 1, s[1]]));

  let prod = [s[0], s[1]];
  for (let k = 1; k <= EM.length; k += 1) {
    const e = -s[0] - 2 * k + 1;
    const m = Math.pow(N, e);
    const nPow = [m * Math.cos(-s[1] * lnN), m * Math.sin(-s[1] * lnN)];
    sum = cAdd(sum, cMul([EM[k - 1], 0], cMul(prod, nPow)));
    prod = cMul(prod, cMul([s[0] + 2 * k - 1, s[1]], [s[0] + 2 * k, s[1]]));
  }
  return sum;
}

// The pole is the only check this figure admits, so it is made explicit: ζ
// must blow up at s = 1 and stay finite away from it.
const nearPole = Math.hypot(...zeta([1.002, 0]));
if (nearPole < 400) throw new Error(`no pole at s=1: |ζ| was only ${nearPole}`);
for (const probe of [[2, 0], [0.5, 14], [-1, 3], [4, -2]]) {
  const v = Math.hypot(...zeta(probe));
  if (!Number.isFinite(v) || v > 50) throw new Error(`ζ${JSON.stringify(probe)} = ${v}, not finite and bounded`);
}
// ζ(2) = π²/6 and ζ(-1) = -1/12 are the two values everyone knows. If the
// continuation is wired up correctly, both fall out of the same code path.
const z2 = zeta([2, 0])[0];
if (Math.abs(z2 - Math.PI * Math.PI / 6) > 1e-9) throw new Error(`ζ(2) = ${z2}`);
const zm1 = zeta([-1, 0])[0];
if (Math.abs(zm1 + 1 / 12) > 1e-9) throw new Error(`ζ(-1) = ${zm1}, expected -1/12`);

// ---------------------------------------------------------------- emission
const kids = [];
let uid = 0;
const nid = (p) => `${p}${uid++}`;

const rect = (x, y, w, h, fill) =>
  kids.push({
    type: "block", id: nid("r"), x, y, width: Math.max(w, 0.35), height: Math.max(h, 0.35),
    fill, stroke: "transparent", strokeWidth: 0, radius: 0, padding: 0,
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
 * Space claimed by text, recorded BEFORE the curves are drawn.
 *
 * `text-clear-of-other-boxes` is not toggleable, and every span of every curve
 * is a box. A label dropped onto the field afterwards would collide with
 * whatever happened to pass beneath it, so the field is generated around the
 * labels instead — the same inversion of draw order every dense figure here
 * has needed.
 */
const reserved = [];
const reserve = (x, y, w, h, m = 5) =>
  reserved.push({ x: x - m, y: y - m, x2: x + w + m, y2: y + h + m });
const blocked = (x, y) => reserved.some((r) => x >= r.x && x <= r.x2 && y >= r.y && y <= r.y2);

// --- axis labels, placed and reserved first ---------------------------------
const axisLabels = [];
for (let re = -7; re <= 7; re += 1) {
  if (re === 0) continue;
  const x = wx(re) - 30;
  const y = wy(0) + 20;
  axisLabels.push({ x, y, w: 60, label: String(re).replace("-", "−"), fs: 20 });
}
for (let im = -3; im <= 3; im += 1) {
  if (im === 0) continue;
  const x = wx(0) - 74;
  const y = wy(im) - 15;
  axisLabels.push({ x, y, w: 60, label: `${im}i`.replace("-", "−"), fs: 20, align: "end" });
}
// Reserve the INK, not the block. A 60px-wide box around a single digit
// carves a rectangle out of the field that reads as a rendering fault.
for (const l of axisLabels) {
  // Width from the glyphs, height from the LINE box — that is what the
  // check unions over, and estimating the glyph height instead undershoots.
  const w = l.label.length * l.fs * 0.72 + 12;
  // The reserve has to follow the ALIGNMENT: a right-aligned label puts its
  // ink at the right edge of its block, not in the middle of it.
  const offset = l.align === "end" ? l.w - w : (l.w - w) / 2;
  reserve(l.x + offset, l.y, w, l.fs * 1.45 + 4, 2);
}


/**
 * A grid line, split around anything already reserved.
 *
 * The curves were generated around the labels, but the reference grid is drawn
 * as whole rects and would run straight through them. Splitting it here keeps
 * `text-clear-of-other-boxes` satisfied and, incidentally, gives every label
 * the small clearing a printed axis label has anyway.
 */
function carvedLine(along, from, to, thickness, fill, vertical) {
  const cuts = reserved
    .filter((r) => (vertical ? along >= r.x && along <= r.x2 : along >= r.y && along <= r.y2))
    .map((r) => (vertical ? [r.y, r.y2] : [r.x, r.x2]))
    .sort((a, b) => a[0] - b[0]);
  let cursor = from;
  for (const [lo, hi] of cuts) {
    if (hi <= cursor) continue;
    if (lo > cursor) {
      const end = Math.min(lo, to);
      if (end > cursor) {
        if (vertical) rect(along, cursor, thickness, end - cursor, fill);
        else rect(cursor, along, end - cursor, thickness, fill);
      }
    }
    cursor = Math.max(cursor, hi);
    if (cursor >= to) return;
  }
  if (cursor < to) {
    if (vertical) rect(along, cursor, thickness, to - cursor, fill);
    else rect(cursor, along, to - cursor, thickness, fill);
  }
}

// --- the reference grid of the OUTPUT plane ---------------------------------
for (let re = -8; re <= 8; re += GRID) {
  if (Math.abs(re) < 1e-9) continue;
  const x = wx(re);
  if (x < 0 || x > W) continue;
  carvedLine(x, PLOT_Y0, PLOT_Y1, 1, Number.isInteger(re) ? GRID_MAJOR : GRID_MINOR, true);
}
for (let im = -4; im <= 4; im += GRID) {
  if (Math.abs(im) < 1e-9) continue;
  const y = wy(im);
  if (y < PLOT_Y0 || y > PLOT_Y1) continue;
  carvedLine(y, 0, W, 1, Number.isInteger(im) ? GRID_MAJOR : GRID_MINOR, false);
}
carvedLine(wy(0), 0, W, 1.6, AXIS, false);
carvedLine(wx(0), PLOT_Y0, PLOT_Y1, 1.6, AXIS, true);

// --- the transformed grid ---------------------------------------------------
const MAX_SPAN = 60;              // a span longer than this leapt over the pole
const MIN_SPAN = 1.0;             // shorter than this and the curve has not moved
let spans = 0;

/**
 * Draw the image of one parametrised line under ζ.
 *
 * Consecutive samples are joined by a thin span, which is what makes a curve
 * rather than a dotted trail — and consecutive spans necessarily overlap,
 * which is precisely what `allowOverlap` is for. A span that would jump more
 * than MAX_SPAN is dropped: that is the curve going round the pole, not a
 * piece of geometry, and drawing it would put a straight streak across the
 * plate that means nothing.
 */
function trace(at, samples, colour, weight) {
  let last = null;
  for (let i = 0; i <= samples; i += 1) {
    const w = zeta(at(i / samples));
    const x = wx(w[0]);
    const y = wy(w[1]);
    if (x < -60 || x > W + 60 || y < PLOT_Y0 - 60 || y > PLOT_Y1 + 60) {
      last = null;                    // left the frame; do not bridge the gap
      continue;
    }
    if (last === null) {
      last = { x, y };
      continue;
    }
    const d = Math.hypot(x - last.x, y - last.y);
    // Decimation, and it is what makes the density affordable: in the whorl
    // near w = 1 hundreds of samples land inside one pixel, and emitting a
    // block for each would cost tens of thousands of boxes to draw a dot.
    if (d < MIN_SPAN) continue;
    // A leap this large is the curve going round the pole, not geometry.
    if (d > MAX_SPAN) { last = { x, y }; continue; }
    const x0 = Math.max(0, Math.min(last.x, x) - weight / 2);
    const y0 = Math.max(PLOT_Y0, Math.min(last.y, y) - weight / 2);
    const x1 = Math.min(W, Math.max(last.x, x) + weight / 2);
    const y1 = Math.min(PLOT_Y1, Math.max(last.y, y) + weight / 2);
    if (x1 > x0 && y1 > y0 && !blocked(x, y)) {
      rect(x0, y0, x1 - x0, y1 - y0, colour);
      spans += 1;
    }
    last = { x, y };
  }
}

// Lines of constant σ: as t runs, each traces a loop tightening towards w = 1.
const sigmas = [];
for (let sig = SIG_LO; sig <= SIG_HI + 1e-9; sig += GRID) sigmas.push(sig);
for (const sig of sigmas) {
  const u = (sig - SIG_LO) / (SIG_HI - SIG_LO);
  trace((f) => [sig, -T_HALF + 2 * T_HALF * f], 4000, sigmaRamp(u), 1.3);
}

// Lines of constant t: as σ runs, each sweeps in from far out and lands at 1.
const ts = [];
for (let t = -T_HALF; t <= T_HALF + 1e-9; t += GRID) ts.push(t);
for (const t of ts) {
  const u = (t + T_HALF) / (2 * T_HALF);
  trace((f) => [SIG_LO + (SIG_HI - SIG_LO) * f, t], 4000, tRamp(u), 1.3);
}

// Everything to the right converges here, because ζ(σ+it) → 1 as σ → ∞.
kids.push({
  type: "block", id: "one", x: wx(1) - 7, y: wy(0) - 7, width: 14, height: 14,
  shape: "circle", fill: "#FFD35C", stroke: "transparent", strokeWidth: 0, padding: 0,
});

// --- labels, last, over everything ------------------------------------------
for (const l of axisLabels) text(l.x, l.y, l.w, l.label, l.fs, "#C6CCD8", l.align ?? "center");

text(64, 44, 900, "The Riemann zeta function", 46, INK);
text(66, 116, 900, "ζ(s)  =  1⁻ˢ + 2⁻ˢ + 3⁻ˢ + 4⁻ˢ + ⋯", 26, "#C9A2E4");

text(64, 1164, 880,
  "The square grid of the s-plane, drawn where ζ sends it. Cool curves are lines of constant\n" +
  "real part; warm ones are lines of constant imaginary part. Everything winds towards 1,\n" +
  "because ζ(σ+it) → 1 as σ → ∞ — that is the gold point.", 15, DIM);
text(1040, 1164, 816,
  "Computed by Euler–Maclaurin, which is the analytic continuation itself rather than an\n" +
  "approximation of it: the sum Σ n⁻ˢ diverges left of the critical strip, and the tail terms are\n" +
  "what carry the value across. The generator checks ζ(2) = π²/6 and ζ(−1) = −1/12 before drawing.",
  15, DIM);

const spec = {
  version: 1,
  title: "The Riemann Zeta Function",
  canvas: {
    padding: 0, background: BG, theme: "dark",
    // A curve is a chain of spans and consecutive spans overlap; without this
    // every curve would have to be quantised onto a lattice and would come
    // apart exactly where it turns most sharply.
    constraints: { allowOverlap: true },
  },
  root: { type: "scene", layout: "absolute", width: W, height: H, children: kids },
};
writeFileSync("out/zeta-conformal.json", JSON.stringify(spec));
console.log(
  `wrote out/zeta-conformal.json -- ${sigmas.length} + ${ts.length} grid lines, ` +
  `${spans} spans, ${kids.length} blocks`,
);
