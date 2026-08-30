/*
 * "Five Ways Down" -- the basins of Newton's method for z^5 = 1.
 *
 * Newton's method is the most ordinary algorithm in numerical analysis: guess
 * a root, then repeatedly replace the guess with
 *
 *   z  <-  z - p(z)/p'(z)  =  (4z)/5 + 1/(5 z^4)
 *
 * for p(z) = z^5 - 1. Every starting point in the plane is coloured by WHICH
 * of the five fifth-roots of unity it eventually falls into, and shaded by how
 * many steps that took.
 *
 * The five basins are open sets, so the picture ought to be five wedges. It is
 * not, and the reason is worth stating plainly: the boundary between them is a
 * WADA set. Every single point on it borders all five basins at once. There is
 * no point of the boundary you can stand on and name two basins you are
 * between -- you are always between five. That is why no amount of magnifying
 * ever resolves the edge into an edge, and it is what the three zooms below
 * are for: the same lace at 1x, 40x and 1600x, each window centred on a
 * boundary point located by bisection rather than by eye.
 *
 * Drawn the way everything in this series is drawn: discrete separated marks
 * on a lattice, one per cell, because two marks at one point is a real check
 * failure rather than a rounding detail.
 */
import { writeFileSync } from "node:fs";
import { lineHeight } from "./lib.mjs";

const W = 1240;
const H = 1700;
const BG = "#08080F";

const INK = {
  title: "#F4E7CA",
  eyebrow: "#9BA0CC",
  body: "#8E92BC",
  faint: "#8A8FB8",
  rule: "#332F58",
};

let uid = 0;
const nid = (p) => `${p}${uid++}`;
const kids = [];
const marks = [];

const hex2 = (v) => Math.round(Math.min(255, Math.max(0, v * 255))).toString(16).padStart(2, "0");
const rgb = (r, g, b) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

function label(x, y, w, text, fs, fill, align = "center") {
  kids.push({
    type: "block", id: nid("t"), x, y, width: w,
    height: text.split("\n").length * lineHeight(fs) + 2.6,
    label: text, fill: "transparent", stroke: "transparent", strokeWidth: 0,
    textColor: fill, fontSize: fs, padding: 0, textAlign: align, wrap: "none",
  });
}

const disc = (x, y, d, fill) =>
  kids.push({
    type: "block", id: nid("d"), x: x - d / 2, y: y - d / 2, width: d, height: d,
    shape: "circle", fill, stroke: "transparent", strokeWidth: 0, padding: 0,
  });

const rect = (x, y, w, h, fill) =>
  kids.push({
    type: "block", id: nid("r"), x, y, width: w, height: h,
    fill, stroke: "transparent", strokeWidth: 0, radius: 0, padding: 0,
  });

// ===========================================================================
// Newton's method for z^5 - 1.
// ===========================================================================

const N = 5;
const MAX_STEPS = 64;
const TOL = 1e-9;

const ROOTS = Array.from({ length: N }, (_, k) => ({
  re: Math.cos((2 * Math.PI * k) / N),
  im: Math.sin((2 * Math.PI * k) / N),
}));

/**
 * Which root this start falls into, and how long it took.
 *
 * The step count is refined to a fraction by interpolating in LOG distance:
 * Newton converges quadratically, so the last two distances straddle the
 * tolerance on a scale where linear interpolation is the right thing to do.
 * Without it the shading comes out in visible integer terraces.
 */
function basin(re0, im0) {
  let re = re0;
  let im = im0;
  let prev = Infinity;
  for (let step = 0; step < MAX_STEPS; step += 1) {
    // z^2, z^4, then one Newton step: z <- 4z/5 + 1/(5 z^4).
    const r2 = re * re - im * im;
    const i2 = 2 * re * im;
    const r4 = r2 * r2 - i2 * i2;
    const i4 = 2 * r2 * i2;
    const den = r4 * r4 + i4 * i4;
    if (den < 1e-300) return null;          // straight onto the critical point
    re = 0.8 * re + (0.2 * r4) / den;
    im = 0.8 * im - (0.2 * i4) / den;

    let best = Infinity;
    let bestK = -1;
    for (let k = 0; k < N; k += 1) {
      const d = Math.hypot(re - ROOTS[k].re, im - ROOTS[k].im);
      if (d < best) { best = d; bestK = k; }
    }
    if (best < TOL) {
      const t = prev === Infinity || prev <= best
        ? 1
        : (Math.log(TOL) - Math.log(prev)) / (Math.log(best) - Math.log(prev));
      return { root: bestK, steps: step + Math.min(1, Math.max(0, t)) };
    }
    prev = best;
  }
  return null;                               // never settled
}

// Five hues, far enough apart to survive a dark ground and a small mark.
const HUES = [
  [0.910, 0.404, 0.310],   // coral
  [0.949, 0.757, 0.306],   // amber
  [0.498, 0.847, 0.651],   // mint
  [0.357, 0.722, 0.910],   // sky
  [0.655, 0.545, 0.910],   // violet
];

/**
 * A point on the basin boundary, found by bisecting between two starts that
 * land in different basins. Located rather than eyeballed, so the zooms below
 * are centred on the boundary by construction.
 */
function boundaryPoint(a, b) {
  const idOf = (p) => { const h = basin(p.re, p.im); return h === null ? -1 : h.root; };
  let lo = a;
  let hi = b;
  // Walk the segment until two adjacent samples genuinely disagree, rather
  // than assuming the two endpoints happen to.
  if (idOf(lo) === idOf(hi)) {
    const steps = 400;
    let found = false;
    for (let i = 0; i < steps && !found; i += 1) {
      const p = (t) => ({ re: a.re + (b.re - a.re) * t, im: a.im + (b.im - a.im) * t });
      const u = p(i / steps);
      const v = p((i + 1) / steps);
      if (idOf(u) !== idOf(v)) { lo = u; hi = v; found = true; }
    }
    if (!found) throw new Error("no basin change along the probe segment");
  }
  const target = idOf(lo);
  for (let i = 0; i < 90; i += 1) {
    const mid = { re: (lo.re + hi.re) / 2, im: (lo.im + hi.im) / 2 };
    if (idOf(mid) === target) lo = mid; else hi = mid;
  }
  return { re: (lo.re + hi.re) / 2, im: (lo.im + hi.im) / 2 };
}

// ===========================================================================
// Plates.
// ===========================================================================

/**
 * Raster one square window of the plane onto a lattice of separated marks.
 *
 * Shading is normalised to THIS window's own step range, computed in a first
 * pass. A fixed range is right for the whole plate and useless for a zoom:
 * every point near the boundary takes many steps, so a scale calibrated on
 * the full picture renders a magnified boundary as a black square. The cost
 * is that brightness is comparable within a window and not between windows,
 * which is stated under the strip rather than left to be inferred.
 */
function plate({ x, y, size, centre, half, pitch, skip }) {
  const dot = pitch - 0.15;
  const samples = [];
  for (let px = 0; px <= size; px += pitch) {
    for (let py = 0; py <= size; py += pitch) {
      if (skip !== undefined && skip(x + px, y + py)) continue;
      const re = centre.re + ((px / size) * 2 - 1) * half;
      const im = centre.im - ((py / size) * 2 - 1) * half;
      const hit = basin(re, im);
      if (hit === null) continue;
      samples.push({ px, py, root: hit.root, steps: hit.steps });
    }
  }
  if (samples.length === 0) return { drawn: 0, lo: 0, hi: 0 };

  const sorted = samples.map((v) => v.steps).sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.02)];
  const hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))];
  const span = hi - lo || 1;

  for (const v of samples) {
    // Deep inside a basin the method lands in a couple of steps; on the lace
    // it takes dozens. Brightness IS the step count, so the boundary draws
    // itself as the dark part rather than being outlined.
    const t = Math.min(1, Math.max(0, (v.steps - lo) / span));
    const glow = Math.pow(1 - t, 1.35);
    const [r, g, b] = HUES[v.root];
    const k = 0.17 + 0.83 * glow;
    const d = dot * (0.42 + 0.58 * glow);
    if (d < 0.85) continue;
    disc(x + v.px, y + v.py, d, rgb(r * k, g * k, b * k));
  }
  return { drawn: samples.length, lo, hi };
}

const MAIN = { x: 178, y: 128, size: 884 };
const HALF = 1.55;

// The five roots: the only five points the method is trying to find. Their
// markers are placed BEFORE the raster so the raster can leave room for them
// -- a marker dropped on top of a finished field is a real partial overlap.
const ROOT_PX = ROOTS.map((root) => ({
  x: MAIN.x + ((root.re / HALF + 1) / 2) * MAIN.size,
  y: MAIN.y + ((-root.im / HALF + 1) / 2) * MAIN.size,
}));

const mainPlate = plate({
  x: MAIN.x, y: MAIN.y, size: MAIN.size,
  centre: { re: 0, im: 0 }, half: HALF, pitch: 4.2,
  skip: (px, py) => ROOT_PX.some((r) => Math.hypot(px - r.x, py - r.y) < 11),
});
let grains = mainPlate.drawn;
const ranges = [];

for (const r of ROOT_PX) {
  disc(r.x, r.y, 13, BG);
  disc(r.x, r.y, 6.4, "#FFF6E2");
}

// A boundary point, found by bisection between two basins.
const SEED = boundaryPoint({ re: 0.36, im: 0.30 }, { re: 0.30, im: 0.42 });

const ZOOMS = [40, 1600];
const STRIP_Y = 1128;
const STRIP_SIZE = 268;
const GAP = 40;
const STRIP_X = (W - (3 * STRIP_SIZE + 2 * GAP)) / 2;

const windows = [
  // Centred on the SAME point as the other two, so the strip is one descent
  // into one place rather than three unrelated views.
  { half: HALF, factor: 1, centre: SEED, note: "×1" },
  ...ZOOMS.map((f) => ({ half: HALF / f, factor: f, centre: SEED, note: `×${f.toLocaleString("en")}` })),
];

windows.forEach((wdw, i) => {
  const x = STRIP_X + i * (STRIP_SIZE + GAP);
  const got = plate({
    x, y: STRIP_Y, size: STRIP_SIZE, centre: wdw.centre, half: wdw.half, pitch: 3.6,
  });
  grains += got.drawn;
  ranges.push(`${wdw.note} ${got.lo.toFixed(0)}–${got.hi.toFixed(0)}`);
  label(x, STRIP_Y + STRIP_SIZE + 16, STRIP_SIZE,
    i === 0 ? "×1     half-width 1.55" : `${wdw.note}     half-width ${wdw.half.toExponential(1)}`,
    11.5, INK.faint);
});

// A frame round each zoom, so the strip reads as three windows rather than
// three unrelated pictures. An outline, not four bars: four rects meeting at
// the corners overlap there, which is a real defect and not a rounding one.
for (let i = 0; i < 3; i += 1) {
  const x = STRIP_X + i * (STRIP_SIZE + GAP) - 9;
  const y = STRIP_Y - 9;
  const side = STRIP_SIZE + 18;
  marks.push({
    id: `frame-${i}`,
    from: { x, y },
    segments: [
      { line: { x: x + side, y } },
      { line: { x: x + side, y: y + side } },
      { line: { x, y: y + side } },
    ],
    close: true,
    stroke: "#2F2A57",
    strokeWidth: 1,
  });
}

label(140, 48, W - 280, "F  I  V  E   B  A  S  I  N  S".split(" ").join(" "), 12, INK.eyebrow);
label(MAIN.x, MAIN.y + MAIN.size + 20, MAIN.size,
  "every start in the square, coloured by the root Newton's method carries it to",
  11.5, INK.faint);
label(STRIP_X, STRIP_Y - 62, 3 * STRIP_SIZE + 2 * GAP,
  `each window centred on the boundary point ${SEED.re.toFixed(6)} + ${SEED.im.toFixed(6)}i, ` +
  "found by bisection between two basins",
  11.5, INK.faint);
label(STRIP_X, STRIP_Y + STRIP_SIZE + 40, 3 * STRIP_SIZE + 2 * GAP,
  `shading is normalised inside each window, so brightness compares within one and not across three  ·  ` +
  `step ranges  ${ranges.join("   ")}`,
  11, INK.faint);

const TEXT_TOP = H - 236;
label(100, TEXT_TOP, W - 200, "Five Ways Down", 42, INK.title);
rect(W / 2 - 60, TEXT_TOP + 84, 120, 1, INK.rule);
label(110, TEXT_TOP + 110, W - 220,
  "Five roots, and for every point of the plane the question of which one it falls to. The answer\n" +
  "is not five wedges. Every point of the boundary borders all five basins at once, so there is\n" +
  "nowhere on it you are between two of them — which is why the edge never becomes an edge.",
  13.5, INK.body);
label(110, TEXT_TOP + 110 + 3 * lineHeight(13.5) + 12, W - 220,
  `z ← 4z/5 + 1/(5z⁴)  ·  ${grains.toLocaleString("en")} starting points  ·  ` +
  `to ${TOL.toExponential(0)} in at most ${MAX_STEPS} steps  ·  brightness is the step count`,
  11.5, INK.faint);

const spec = {
  version: 1,
  title: "Five Ways Down",
  canvas: { padding: 0, background: BG, theme: "dark", vignette: 0.36 },
  root: { type: "scene", layout: "absolute", width: W, height: H, marks, children: kids },
};

writeFileSync("out/newton.json", JSON.stringify(spec, null, 2));
console.log(`wrote out/newton.json -- ${kids.length} blocks, ${grains} starting points`);
console.log(`  boundary seed ${SEED.re.toFixed(9)} + ${SEED.im.toFixed(9)}i`);
