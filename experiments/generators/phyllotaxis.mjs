/*
 * "The Golden Angle" -- a phyllotaxis poster.
 *
 * Vogel's model: the nth seed sits at angle n * 137.507 degrees and radius
 * c * sqrt(n). Nothing here is decorative arithmetic; the picture is the model.
 */
import { writeFileSync } from "node:fs";

const W = 880;
const H = 1120;
const CX = 440;
const CY = 500;
const N = 450;
const C = 17;                       // radial scale; r = C * sqrt(n)
const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // 137.50776 degrees, in radians
const RMAX = C * Math.sqrt(N - 1);

const BG = "#0A0A12";
const kids = [];
let uid = 0;
const nid = (p) => `${p}${uid++}`;

/** Piecewise-linear ramp through the stops, t in [0, 1]. */
const STOPS = [
  [0.00, "#FFF3D2"],
  [0.12, "#FFD98A"],
  [0.28, "#FFA85C"],
  [0.45, "#F0684F"],
  [0.62, "#C4416B"],
  [0.78, "#7E3579"],
  [0.90, "#45306E"],
  [1.00, "#1E2148"],
];

const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const pad = (v) => Math.round(v).toString(16).padStart(2, "0");

function ramp(t) {
  const u = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < STOPS.length - 2 && u > STOPS[i + 1][0]) i += 1;
  const [t0, c0] = STOPS[i];
  const [t1, c1] = STOPS[i + 1];
  const k = (u - t0) / (t1 - t0);
  const a = hex(c0);
  const b = hex(c1);
  return `#${a.map((v, j) => pad(v + (b[j] - v) * k)).join("")}`;
}

function text(x, y, w, label, fs, fill, align = "center") {
  const lines = label.split("\n").length;
  kids.push({
    type: "block", id: nid("t"), x, y, width: w,
    height: lines * fs * 1.45 + 2.6,
    label, fill: "transparent", stroke: "transparent", strokeWidth: 0,
    textColor: fill, fontSize: fs, padding: 0, textAlign: align,
  });
}

// The frame: one ring, drawn first so every seed nests inside its box.
kids.push({
  type: "block", id: "ring",
  x: CX - RMAX - 26, y: CY - RMAX - 26,
  width: (RMAX + 26) * 2, height: (RMAX + 26) * 2,
  shape: "circle", fill: "transparent", stroke: "#282544",
  strokeWidth: 1, padding: 0,
});

// The seeds.
for (let n = 0; n < N; n += 1) {
  const t = n / (N - 1);
  const r = C * Math.sqrt(n);
  const a = n * GOLDEN;
  const d = 8 + 4 * t;
  const fill = ramp(t);
  // A warm bloom over the innermost seeds. The named `emphasis` glow is a
  // fixed blue, so this is a literal one carrying each seed own colour.
  const bloom = n < 55
    ? { effect: { kind: "glow", radius: 9 - 6 * (n / 55), color: fill, intensity: 0.5 } }
    : {};
  kids.push({
    type: "block", id: `s${n}`,
    x: CX + r * Math.cos(a) - d / 2,
    y: CY + r * Math.sin(a) - d / 2,
    width: d, height: d, shape: "circle",
    fill, stroke: "transparent", strokeWidth: 0, padding: 0, ...bloom,
  });
}

// The words.
text(140, 52, 600, "P  H  Y  L  L  O  T  A  X  I  S", 12, "#9BA0CC");
text(140, 916, 600, "The Golden Angle", 42, "#F4E7CA");
kids.push({
  type: "block", id: "rule", x: CX - 60, y: 1000, width: 120, height: 1,
  fill: "#332F58", stroke: "transparent", strokeWidth: 0, padding: 0,
});
text(130, 1026, 620,
  "Each seed is placed 137.507° from the one before it — the angle that cuts\n" +
  "a full turn in the golden ratio. No other angle fills the disc so evenly:\n" +
  "rational turns leave spokes, and near-misses leave seams.",
  13.5, "#8E92BC");
text(130, 1096, 620, `450 seeds  ·  r = c√n  ·  θ = n · 137.507°`, 11.5, "#8A8FB8");

const spec = {
  version: 1,
  title: "The Golden Angle",
  canvas: { padding: 0, background: BG, theme: "dark", vignette: 0.4 },
  root: { type: "scene", layout: "absolute", width: W, height: H, children: kids },
};
writeFileSync("out/phyllotaxis.json", JSON.stringify(spec, null, 2));
console.log(`wrote out/phyllotaxis.json -- ${kids.length} blocks, rmax ${RMAX.toFixed(1)}`);
