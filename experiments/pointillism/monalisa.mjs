/*
 * "La Joconde, Divided" -- the Mona Lisa rebuilt out of discrete marks.
 *
 * This is deliberately against the grain of the project: Prancheta's non-goals
 * say photorealism and artistic illustration are not what it is for. Nothing
 * here is verified to be a good painting, and no check could be. What IS being
 * exercised is the thing a pointillist plate and a schematic share -- tens of
 * thousands of independently placed, independently coloured marks, every one
 * of which has to land where the arithmetic said it would.
 *
 * The method is divisionist rather than photographic:
 *   - dot SPACING carries detail. A Sobel magnitude over the source drives a
 *     second, finer pass, so the face and hands get marks the sfumato
 *     background never asks for.
 *   - dot COLOUR is split, not averaged. Each mark is pulled off the local
 *     mean along a warm/cool axis, so the plate mixes optically at reading
 *     distance instead of being a mosaic of exact samples.
 *
 * Dots must overlap for the field to close, so the figure stands down
 * `boxes-do-not-overlap` -- which then reports not-applicable, never pass.
 *
 * Usage: node experiments/pointillism/monalisa.mjs <rgb> <meta.json> [scale]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { disc, text, rect, INK_TITLE, INK_EYEBROW, INK_BODY, INK_FAINT, lineHeight } from "../generators/lib.mjs";

const [rgbPath, metaPath, scaleArg] = process.argv.slice(2);
const SCALE = Number(scaleArg ?? 1);          // >1 coarsens; a fast preview knob
const px = readFileSync(rgbPath);
const { w: IW, h: IH } = JSON.parse(readFileSync(metaPath, "utf8"));

const PAD_X = 120;
const TOP = 70;
const W = IW + PAD_X * 2;
const H = TOP + IH + 226;
const X0 = PAD_X;
const Y0 = TOP;

const at = (x, y) => {
  const i = (Math.min(IH - 1, Math.max(0, y | 0)) * IW + Math.min(IW - 1, Math.max(0, x | 0))) * 3;
  return [px[i], px[i + 1], px[i + 2]];
};
const lum = (x, y) => { const [r, g, b] = at(x, y); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

/** Mean colour over a square footprint -- what the eye would get from that patch. */
function patch(cx, cy, r) {
  let R = 0, G = 0, B = 0, n = 0;
  for (let y = cy - r; y <= cy + r; y += 1) {
    for (let x = cx - r; x <= cx + r; x += 1) {
      const [a, b, c] = at(x, y);
      R += a; G += b; B += c; n += 1;
    }
  }
  return [R / n, G / n, B / n];
}

// --- Sobel magnitude, normalised to [0,1]. Detail, in one number per pixel. ---
const grad = new Float32Array(IW * IH);
let gmax = 0;
for (let y = 1; y < IH - 1; y += 1) {
  for (let x = 1; x < IW - 1; x += 1) {
    const gx = -lum(x - 1, y - 1) - 2 * lum(x - 1, y) - lum(x - 1, y + 1)
      + lum(x + 1, y - 1) + 2 * lum(x + 1, y) + lum(x + 1, y + 1);
    const gy = -lum(x - 1, y - 1) - 2 * lum(x, y - 1) - lum(x + 1, y - 1)
      + lum(x - 1, y + 1) + 2 * lum(x, y + 1) + lum(x + 1, y + 1);
    const g = Math.hypot(gx, gy);
    grad[y * IW + x] = g;
    if (g > gmax) gmax = g;
  }
}
for (let i = 0; i < grad.length; i += 1) grad[i] /= gmax;

/** Mean detail over a footprint, so a single noisy pixel cannot summon a mark. */
function detail(cx, cy, r) {
  let s = 0, n = 0;
  for (let y = cy - r; y <= cy + r; y += 2) {
    for (let x = cx - r; x <= cx + r; x += 2) {
      const yy = Math.min(IH - 1, Math.max(0, y | 0));
      const xx = Math.min(IW - 1, Math.max(0, x | 0));
      s += grad[yy * IW + xx]; n += 1;
    }
  }
  return s / n;
}

// --- Deterministic noise: the plate must be the same plate on every run. ---
let seed = 20250825;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const hex = (r, g, b) => "#" + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");

/**
 * Divisionist split: push a sample off its own mean along a warm/cool axis
 * and lift its saturation a little. Seurat did not put the average colour
 * down; he put two colours down and let the eye do the averaging.
 */
function divide(rgb, t, strength) {
  const [r, g, b] = rgb;
  const m = (r + g + b) / 3;
  const warm = Math.cos(t * Math.PI * 2);
  const s = 1 + 0.20 * strength;                       // chroma lift
  return [
    m + (r - m) * s + warm * 15 * strength,
    m + (g - m) * s + warm * 2 * strength,
    m + (b - m) * s - warm * 15 * strength,
  ];
}

const kids = [];

/**
 * One pass of marks on a jittered lattice.
 *
 * `accept` decides whether this pass speaks for a given point at all, which
 * is how the fine pass stays confined to the parts of the picture that have
 * anything fine in them.
 */
function pass({ pitch, jitter, dmin, dmax, accept, strength }) {
  let n = 0;
  for (let gy = 0; gy * pitch < IH + pitch; gy += 1) {
    for (let gx = 0; gx * pitch < IW + pitch; gx += 1) {
      const stagger = (gy % 2) * pitch * 0.5;          // hex-ish, not a grid
      // Clamped, not skipped: a mark that jitters off the panel is pulled back
      // to its edge, so the plate has a straight border instead of a fringe.
      const sx = clamp(gx * pitch + stagger + (rnd() - 0.5) * pitch * jitter, 0, IW - 1);
      const sy = clamp(gy * pitch + (rnd() - 0.5) * pitch * jitter, 0, IH - 1);
      const d0 = detail(sx, sy, Math.max(1, pitch * 0.6));
      if (!accept(d0, sx, sy)) continue;
      const c = patch(sx, sy, Math.max(1, Math.round(pitch * 0.5)));
      // Flat ground gets the fat marks; detail gets the small ones.
      const d = clamp(dmax - (dmax - dmin) * Math.pow(clamp(d0 * 3.2, 0, 1), 0.7), dmin, dmax);
      const [r, g, b] = divide(c, rnd(), strength);
      disc(kids, X0 + sx, Y0 + sy, d * SCALE, hex(r, g, b));
      n += 1;
    }
  }
  return n;
}

const P = SCALE;
// Underpainting: broad marks whose only job is that no hole in a later layer
// can show the bare ground through it.
const nUnder = pass({
  pitch: 11 * P, jitter: 0.5, dmin: 15, dmax: 18,
  accept: () => true, strength: 1.15,
});
// Ground: closes the field everywhere, fat and slow.
const nBase = pass({
  pitch: 7 * P, jitter: 0.85, dmin: 8.5, dmax: 12.5,
  accept: () => true, strength: 1,
});
// Modelling: a second, offset ground so the optical mix is never one mark deep.
const nMid = pass({
  pitch: 7 * P, jitter: 0.95, dmin: 5, dmax: 8.5,
  accept: (d) => d > 0.04, strength: 0.75,
});
// Drawing: only where the picture has edges -- eyes, mouth, hands, the veil.
const nFine = pass({
  pitch: 3.4 * P, jitter: 0.7, dmin: 2.6, dmax: 4.6,
  accept: (d) => d > 0.11, strength: 0.5,
});

// --- Ground colour, so any gap between marks reads as the painting's dark ---
let R = 0, G = 0, B = 0;
for (let i = 0; i < px.length; i += 3) { R += px[i]; G += px[i + 1]; B += px[i + 2]; }
const nPx = px.length / 3;
const BG = hex((R / nPx) * 0.42, (G / nPx) * 0.42, (B / nPx) * 0.40);

// --- Frame: the plate is a figure, so it says what it is and how it was made ---
const capTop = Y0 + IH + 46;
const total = nUnder + nBase + nMid + nFine;
text(kids, PAD_X, 30, IW, "D  I  V  I  S  I  O  N  I  S  M", 12, INK_EYEBROW);
text(kids, PAD_X - 60, capTop, IW + 120, "La Joconde, Divided", 40, INK_TITLE);
rect(kids, W / 2 - 60, capTop + 80, 120, 1, "#332F58");
text(kids, PAD_X - 40, capTop + 104, IW + 80,
  "Leonardo's panel resampled as discrete marks: spacing set by a Sobel magnitude,\n" +
  "colour split off the local mean along a warm/cool axis and left to mix in the eye.", 13.5, INK_BODY);
text(kids, PAD_X - 40, capTop + 104 + 2 * lineHeight(13.5) + 12, IW + 80,
  `${total.toLocaleString("en-US")} marks  ·  underpainting ${nUnder.toLocaleString("en-US")}  ·  ground ${nBase.toLocaleString("en-US")}  ·  modelling ${nMid.toLocaleString("en-US")}  ·  drawing ${nFine.toLocaleString("en-US")}  ·  source: C2RMF scan, public domain`,
  11.5, INK_FAINT);

const spec = {
  version: 1,
  title: "La Joconde, Divided",
  canvas: { padding: 0, background: BG, theme: "dark", vignette: 0.35, constraints: { allowOverlap: true } },
  root: { type: "scene", layout: "absolute", width: W, height: H, children: kids },
};

const name = process.env.OUT_NAME ?? "monalisa";
writeFileSync(`out/${name}.json`, JSON.stringify(spec));
console.log(`wrote out/${name}.json -- ${kids.length} blocks (${total} marks), canvas ${W}x${H}`);
