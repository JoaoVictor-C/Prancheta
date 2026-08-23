/*
 * "ONE OBJECT, SEEN TWICE" -- the logistic map and z^2 + c are the same thing.
 *
 * x -> r x (1 - x) is affinely conjugate to z -> z^2 + c under x = 1/2 - z/r,
 * which gives c = (2r - r^2) / 4. The map is strictly DECREASING in r for
 * r > 1, so the period-doubling cascade necessarily reads right to left here;
 * that is a property of the conjugacy, not a mistake, and the dual c/r axis
 * makes it visible at every tick.
 *
 * Landmarks, exact: r=3 -> c=-3/4 (cardioid meets the period-2 disc),
 * r=1+sqrt6 -> c=-5/4, r=1+sqrt8 -> c=-7/4 (the period-3 window, and the
 * largest mini-Mandelbrot on the real axis), r=4 -> c=-2 (tip of the antenna).
 * Three exact rationals out of two irrational inputs: if the -7/4 inset does
 * not land under the period-3 window, the implementation is wrong.
 *
 * Composition: only the UPPER HALF of the c-plane is drawn. The set is
 * symmetric about the real axis, so nothing is lost, and the real axis becomes
 * the shared edge between the two panels -- which is the only line along which
 * the correspondence actually holds. Every label sits over space proved empty
 * before the field was generated; no connector touches a field cell.
 */
import { writeFileSync } from "node:fs";

// ---------------------------------------------------------------- geometry
const W = 1500;
const H = 2100;
const BG = "#07070E";

const C0 = -2.06;                 // left edge of the shared c-axis
const C1 = 0.56;
const X0 = 60;
const X1 = 1440;
const SX = (X1 - X0) / (C1 - C0); // 526.718 px per unit c
const cx = (c) => X0 + (c - C0) * SX;

const A_TOP = 120;                // band I: upper-half c-plane
const AXIS_Y = 726;               // the real axis == band I's bottom edge
const B_TOP = 846;                // band II: the cascade
const B_BOT = 1386;
const TICK_Y = 1400;              // the dual c / r axis
const INS_TOP = 1524;             // two on-axis insets
const INS_H = 340;
const INS_W = 470;

// ---------------------------------------------------------------- palette
const hx = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const pad = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
const ramp = (stops) => (t) => {
  const u = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < stops.length - 2 && u > stops[i + 1][0]) i += 1;
  const k = (u - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
  const a = hx(stops[i][1]);
  const b = hx(stops[i + 1][1]);
  return `#${a.map((v, j) => pad(v + (b[j] - v) * k)).join("")}`;
};

// Escape time: far from the set (fast escape) is dim, close to it is bright.
const escapeRamp = ramp([
  [0.00, "#161A44"], [0.22, "#33389A"], [0.42, "#7048B0"],
  [0.60, "#C25786"], [0.76, "#F08E4E"], [0.89, "#FFCB6E"], [1.00, "#FFF6DC"],
]);
// Lyapunov exponent: negative (periodic) cool, positive (chaotic) warm.
const lyapRamp = ramp([
  [0.00, "#37E2C4"], [0.42, "#4C86DC"], [0.62, "#9A6FD2"],
  [0.74, "#DE5F44"], [1.00, "#FFC96A"],
]);

/** Blend towards the canvas, so a mark can fade out instead of just stopping. */
const fade = (c, k) => {
  const a = hx(c);
  const b = hx(BG);
  return `#${a.map((v, j) => pad(v + (b[j] - v) * k)).join("")}`;
};

const INK = "#EFE6CE";
const DIM = "#9CA2CE";
const FAINT = "#7E85B4";

// ---------------------------------------------------------------- emission
const kids = [];
const cons = [];
let uid = 0;
const nid = (p) => `${p}${uid++}`;

/**
 * Space reserved for text and frames, recorded BEFORE any field is generated.
 * Carving is not only an overlap workaround: `contrast-sufficient` compares a
 * label against the canvas, so a label over bright cells would pass at 4.5:1
 * while being illegible. Emptiness has to be established, not hoped for.
 */
const reserved = [];
const reserve = (x, y, w, h, m = 7) =>
  reserved.push({ x: x - m, y: y - m, x2: x + w + m, y2: y + h + m });
const isFree = (x, y) =>
  !reserved.some((r) => x >= r.x && x <= r.x2 && y >= r.y && y <= r.y2);

const lineH = (fs) => fs * 1.45;
function text(x, y, w, label, fs, fill, align = "start") {
  const h = label.split("\n").length * lineH(fs) + 2.6;
  reserve(x, y, w, h);
  kids.push({
    type: "block", id: nid("t"), x, y, width: w, height: h, label,
    fill: "transparent", stroke: "transparent", strokeWidth: 0,
    textColor: fill, fontSize: fs, padding: 0, textAlign: align,
  });
}
const rect = (x, y, w, h, fill) =>
  kids.push({
    type: "block", id: nid("r"), x, y, width: w, height: h,
    fill, stroke: "transparent", strokeWidth: 0, radius: 0, padding: 0,
  });
const disc = (x, y, d, fill) =>
  kids.push({
    type: "block", id: nid("d"), x: x - d / 2, y: y - d / 2, width: d, height: d,
    shape: "circle", fill, stroke: "transparent", strokeWidth: 0, padding: 0,
  });

// ---------------------------------------------------------------- the maths
const BAIL = 65536;               // |z| > 256: keeps log(log|z|) well away from 0
const escape = (cr, ci, maxIter) => {
  let zr = 0;
  let zi = 0;
  for (let n = 0; n < maxIter; n += 1) {
    const zr2 = zr * zr;
    const zi2 = zi * zi;
    if (zr2 + zi2 > BAIL) {
      // Normalised iteration count: continuous, so neither colour nor size bands.
      return n + 1 - Math.log(Math.log(Math.sqrt(zr2 + zi2))) / Math.LN2;
    }
    zi = 2 * zr * zi + ci;
    zr = zr2 - zi2 + cr;
  }
  return -1;                      // interior: emitted as nothing at all
};

/** The conjugacy, and its inverse on the branch where it is injective. */
const cOfR = (r) => (2 * r - r * r) / 4;
const rOfC = (c) => 1 + Math.sqrt(1 - 4 * c);

// Self-check: two irrational r values must land on exact rationals.
const near = (a, b) => Math.abs(a - b) < 1e-12;
if (!near(cOfR(3), -0.75)) throw new Error("conjugacy: r=3 should give c=-3/4");
if (!near(cOfR(1 + Math.sqrt(6)), -1.25)) throw new Error("conjugacy: r=1+sqrt6 should give c=-5/4");
if (!near(cOfR(1 + Math.sqrt(8)), -1.75)) throw new Error("conjugacy: r=1+sqrt8 should give c=-7/4");
if (!near(cOfR(4), -2)) throw new Error("conjugacy: r=4 should give c=-2");
if (!near(rOfC(-1.75), 1 + Math.sqrt(8))) throw new Error("inverse branch is wrong");

const LANDMARKS = [
  { c: -2, label: "−2", rlab: "4" },
  { c: -1.75, label: "−7/4", rlab: "1+√8" },
  // The next landmark is only 79px away, so this label hangs to the LEFT of
  // its own tie-line rather than crossing its neighbour's.
  { c: -1.401155, label: "−1.4012", rlab: "3.5699", left: true },
  { c: -1.25, label: "−5/4", rlab: "1+√6" },
  { c: -0.75, label: "−3/4", rlab: "3" },
];

// ================================================================ masthead
// Band I's upper-left is far exterior: it escapes in a handful of iterations
// and is culled, so it is empty before anything is drawn there.
text(74, 150, 660, "ONE OBJECT,\nSEEN TWICE", 54, INK);
text(76, 330, 620,
  "The logistic map and the quadratic map are the same\n" +
  "dynamical system in two coordinates. Under x = ½ − z/r\n" +
  "they are conjugate, and c = (2r − r²)/4.", 16, DIM);
text(76, 418, 620,
  "So the real axis of the Mandelbrot set below IS the\n" +
  "period-doubling cascade beneath it. Drop a vertical\n" +
  "anywhere along it and the two panels must agree.", 16, DIM);
text(76, 508, 300, "z ↦ z² + c", 22, "#FFCB6E");
text(76, 548, 300, "x ↦ r x (1 − x)", 22, "#37E2C4");

text(1180, 152, 260,
  "I.  THE c-PLANE\nupper half; the set is\nsymmetric about ℝ", 14, FAINT, "end");
text(1180, 866, 260,
  "II.  THE CASCADE\nhue is the Lyapunov exponent:\ncool periodic, warm chaotic", 14, FAINT, "end");

// ============================================ tie-lines and their labels
// The gutter between the panels holds no field cell by construction, so a
// vertical here can be drawn without carving anything.
LANDMARKS.forEach((L, i) => {
  const x = cx(L.c);
  rect(x - 0.5, AXIS_Y + 5, 1, (B_TOP - 5) - (AXIS_Y + 5), "#4A4A7E");
  const ty = i % 2 === 0 ? 750 : 796;
  const lx = L.left === true ? x - 92 : x + 6;
  const al = L.left === true ? "end" : "start";
  text(lx, ty, 86, L.label, 14, "#FFCB6E", al);
  text(lx, ty + 24, 86, `r = ${L.rlab}`, 11.5, FAINT, al);
});

// ================================================ I. the c-plane, upper half
const PITCH_A = 3;
const MAXIT_A = 500;
let cellsA = 0;
for (let x = X0; x <= X1; x += PITCH_A) {
  for (let y = A_TOP; y <= AXIS_Y; y += PITCH_A) {
    if (!isFree(x, y)) continue;
    const nu = escape(C0 + (x - X0) / SX, (AXIS_Y - y) / SX, MAXIT_A);
    if (nu < 0) continue;         // interior: the canvas itself is the silhouette
    // The far exterior dissolves rather than stopping: a hard cull threshold
    // draws its own contour across the plate, which is structure that is not
    // there. Marks shrink to nothing and are dropped only once invisible.
    const t = Math.min(1, Math.pow(Math.max(0, nu - 3) / 70, 0.62));
    const d = PITCH_A * (0.06 + 0.84 * t);
    if (d < 0.75) continue;
    disc(x, y, d, escapeRamp(t));
    cellsA += 1;
  }
}

// ============================================ II. the cascade, driven by c
// Driven from c, never from r: c(r) is 2-to-1 on (0,2), so sweeping r would
// fold the diagram onto itself while still rendering green.
const PITCH_B = 4;
let cellsB = 0;
for (let x = X0; x <= cx(0.25); x += PITCH_B) {
  const c = C0 + (x - X0) / SX;
  if (c > 0.25) break;
  const r = rOfC(c);

  let v = 0.5;
  let lyap = 0;
  for (let k = 0; k < 700; k += 1) v = r * v * (1 - v);       // discard the transient
  for (let k = 0; k < 900; k += 1) {
    v = r * v * (1 - v);
    lyap += Math.log(Math.abs(r * (1 - 2 * v)));
  }
  const fill = lyapRamp(Math.min(1, Math.max(0, (lyap / 900 + 1.5) / 2.2)));

  v = 0.5;
  const hits = new Map();
  for (let k = 0; k < 700; k += 1) v = r * v * (1 - v);
  for (let k = 0; k < 1400; k += 1) {
    v = r * v * (1 - v);
    const y = Math.round((B_BOT - v * (B_BOT - B_TOP)) / PITCH_B) * PITCH_B;
    if (y < B_TOP || y > B_BOT) continue;
    hits.set(y, (hits.get(y) ?? 0) + 1);
  }
  // How often the orbit visits a cell IS the invariant measure, and it is what
  // gives a bifurcation diagram its bright edges. Without it the chaotic band
  // is a solid slab that hides the windows inside it.
  for (const [y, n] of hits) {
    if (!isFree(x, y)) continue;
    const q = Math.min(1, Math.pow(n / 70, 0.55));
    disc(x, y, PITCH_B * (0.20 + 0.68 * q), fade(fill, 0.68 * (1 - q)));
    cellsB += 1;
  }
}

// ============================================== the dual c / r axis
rect(X0, TICK_Y, X1 - X0, 1, "#2A2A52");
for (let c = -2; c <= 0.5; c += 0.25) {
  const x = cx(c);
  rect(x, TICK_Y + 1, 1, 7, "#4A4A7E");
  text(x - 34, TICK_Y + 12, 68, c.toFixed(2).replace("-", "−"), 11.5, DIM, "center");
}
text(X0, TICK_Y + 34, 150, "c", 13, "#FFCB6E");
// r is ticked only at and above 2: r in [1,2] is crushed into c in [0, 0.25],
// a tenth of the width, and `tick-labels-do-not-collide` would fail there.
for (const r of [2, 2.5, 3, 3.2, 3.449, 3.57, 3.828, 4]) {
  const x = cx(cOfR(r));
  rect(x, TICK_Y + 48, 1, 7, "#4A4A7E");
  text(x - 34, TICK_Y + 57, 68, String(r), 11.5, "#37E2C4", "center");
}
text(X0, TICK_Y + 76, 150, "r", 13, "#37E2C4");

// ==================================================== two on-axis insets
// An inset may use position as its pointer only if its target has Im(c) = 0;
// an off-axis target would drop its vertical onto a different point of the
// axis and assert something false. Both of these sit on the axis.
const INSETS = [
  { c: -1.75, span: 0.052, at: 330,
    cap: "A.  c = −7/4 exactly, from r = 1+√8.\nA whole Mandelbrot set, sitting under\nthe period-3 window above it." },
  { c: -1.3985, span: 0.034, at: 1000,
    cap: "B.  c ≈ −1.4012, the Feigenbaum point.\nBulbs accumulate here exactly as the\ndoublings above them do." },
];

for (const ins of INSETS) {
  const left = ins.at - INS_W / 2;
  reserve(left, INS_TOP, INS_W, INS_H, 2);
  // Frame. The verticals start one pixel in so the arms butt at the corner
  // instead of sharing a pixel, which would be a partial overlap.
  rect(left, INS_TOP, INS_W, 1, "#2A2A52");
  rect(left, INS_TOP + INS_H, INS_W, 1, "#2A2A52");
  rect(left, INS_TOP + 1, 1, INS_H - 1, "#2A2A52");
  rect(left + INS_W, INS_TOP + 1, 1, INS_H - 1, "#2A2A52");

  const pitch = 4;
  const scale = INS_W / (2 * ins.span);
  for (let x = left + 7; x <= left + INS_W - 7; x += pitch) {
    for (let y = INS_TOP + 7; y <= INS_TOP + INS_H - 7; y += pitch) {
      const nu = escape(
        ins.c + (x - ins.at) / scale,
        (INS_TOP + INS_H / 2 - y) / scale,
        1400,
      );
      if (nu < 0) continue;
      const t = Math.min(1, Math.pow(Math.max(0, nu - 14) / 300, 0.62));
      const d = pitch * (0.06 + 0.84 * t);
      if (d < 0.85) continue;
      disc(x, y, d, escapeRamp(t));
    }
  }

  // The connector leaves the TRUE c on the axis; the inset is displaced, and
  // the line is what says so. It crosses an empty band, never a field.
  const wp = nid("w");
  kids.push({
    type: "block", id: wp, x: cx(ins.c) - 1, y: TICK_Y + 100, width: 2, height: 2,
    fill: "transparent", stroke: "transparent", strokeWidth: 0, padding: 0,
  });
  cons.push({
    from: wp, to: { x: ins.at, y: INS_TOP - 2 },
    arrow: "end", stroke: "#6B6FA8", strokeWidth: 1.1,
  });
  text(left, INS_TOP + INS_H + 14, INS_W, ins.cap, 13, DIM);
}

// ==================================================================== coda
text(74, 1966, 660,
  "Read right to left. c decreases as r increases — dc/dr = (1−r)/2 — so the\n" +
  "cascade runs backwards against every textbook bifurcation diagram. That is\n" +
  "the conjugacy showing its orientation, not an error in the plate.", 14, DIM);
text(790, 1966, 650,
  "Only the upper half of the c-plane is drawn; the set is symmetric about ℝ,\n" +
  "so the real axis is the shared edge of the two panels, the only line along\n" +
  "which the correspondence holds. Columns are uniform in c and therefore not\n" +
  "in r: the chaotic band is sampled more coarsely than usual.", 14, DIM);

const spec = {
  version: 1,
  title: "One Object, Seen Twice",
  canvas: { padding: 0, background: BG, theme: "dark", vignette: 0.34 },
  root: { type: "scene", layout: "absolute", width: W, height: H, children: kids, connectors: cons },
};
writeFileSync("out/conjugacy.json", JSON.stringify(spec));
console.log(
  `wrote out/conjugacy.json -- ${kids.length} blocks, ${cons.length} connectors ` +
  `(c-plane ${cellsA}, cascade ${cellsB})`,
);
