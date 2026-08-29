/*
 * "The Creation of Adam, Divided" -- Michelangelo's fresco rebuilt out of
 * discrete marks.
 *
 * Sibling of monalisa.mjs and against the grain in exactly the same way:
 * Prancheta's non-goals say photorealism and artistic illustration are not
 * what it is for, and no check here verifies that the plate is a good
 * painting. What IS exercised is what a divisionist plate shares with a
 * schematic -- tens of thousands of independently placed, independently
 * coloured marks, every one landing where the arithmetic said it would.
 *
 * Two things differ from the Joconde plate, and both come from the source:
 *
 *   - A fresco is not a panel. Leonardo's sfumato rewards fat marks that melt
 *     into each other; buon fresco is pigment sunk into wet lime plaster, and
 *     it reads as chalk. So the ground marks are smaller and the chroma lift
 *     is gentler -- the warm/cool split still does the mixing, it just does
 *     not turn a lime wall into a Seurat bathing party.
 *   - The picture is about a gap. Everything in the composition converges on
 *     four centimetres of empty plaster between two fingers, so the detail
 *     pass runs at a finer pitch and a lower threshold than the Joconde
 *     needed: if the marks close that gap, the plate has destroyed the only
 *     thing the painting is about.
 *   - The plate is drawn SMALLER than the buffer it samples. Marks this fine
 *     would otherwise be interpolating pixels the source does not have, so the
 *     source is decoded at 1.5x the drawing width and every mark samples a
 *     footprint of real fresco rather than a smear of one.
 *
 * Dots must overlap for the field to close, so the figure stands down
 * `boxes-do-not-overlap` -- which then reports not-applicable, never pass.
 *
 * Usage: node experiments/pointillism/adam.mjs <rgb> <meta.json> [scale]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { disc, text, rect, INK_TITLE, INK_EYEBROW, INK_BODY, lineHeight } from "../generators/lib.mjs";

// The shared INK_FAINT is tuned against the poster series' near-black ground.
// This plate's ground is the fresco's own mean colour, which is lighter, and
// the stats line lands at 4.46:1 on it -- under AA. Lifted until it clears.
const INK_FAINT = "#9297BE";

const [rgbPath, metaPath, scaleArg] = process.argv.slice(2);
const SCALE = Number(scaleArg ?? 1);          // >1 coarsens; a fast preview knob
const px = readFileSync(rgbPath);
const { w: IW, h: IH } = JSON.parse(readFileSync(metaPath, "utf8"));

/**
 * `Z` maps image pixels to canvas units, and the two are deliberately not the
 * same space: every pitch and sampling footprint below is in IMAGE units,
 * every mark diameter in CANVAS units. Oversampling like this is what lets a
 * 1.2-unit mark still stand for something -- it averages a two-pixel patch of
 * real fresco instead of magnifying a single pixel of it.
 */
const PLATE_W = 900;
const Z = PLATE_W / IW;
const PH = Math.round(IH * Z);

const PAD_X = 110;
const TOP = 70;
const W = PLATE_W + PAD_X * 2;
const H = TOP + PH + 256;
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
let seed = 15121025;                                   // the ceiling, finished
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
 *
 * The lift is half the Joconde's, because the fresco's own range is already
 * narrow -- lime white, ochre, terre verte -- and pushing it harder reads as
 * a filter rather than as a method.
 */
function divide(rgb, t, strength) {
  const [r, g, b] = rgb;
  const m = (r + g + b) / 3;
  const warm = Math.cos(t * Math.PI * 2);
  const s = 1 + 0.13 * strength;                       // chroma lift
  return [
    m + (r - m) * s + warm * 11 * strength,
    m + (g - m) * s + warm * 1.5 * strength,
    m + (b - m) * s - warm * 11 * strength,
  ];
}

const kids = [];

/**
 * One pass of marks on a jittered lattice.
 *
 * `accept` decides whether this pass speaks for a given point at all, which
 * is how the fine passes stay confined to the parts of the picture that have
 * anything fine in them -- here, the two arms and the gap they frame.
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
      disc(kids, X0 + sx * Z, Y0 + sy * Z, d * SCALE, hex(r, g, b));
      n += 1;
    }
  }
  return n;
}

const P = SCALE;
// Underpainting: broad marks whose only job is that no hole in a later layer
// can show the bare ground through it.
const nUnder = pass({
  pitch: 10 * P, jitter: 0.5, dmin: 8, dmax: 10,
  accept: () => true, strength: 1.1,
});
// Ground: closes the field everywhere, fat and slow.
const nBase = pass({
  pitch: 6.4 * P, jitter: 0.85, dmin: 4.6, dmax: 6.8,
  accept: () => true, strength: 1,
});
// Modelling: a second, offset ground so the optical mix is never one mark deep.
const nMid = pass({
  pitch: 6.4 * P, jitter: 0.95, dmin: 2.8, dmax: 4.6,
  accept: (d) => d > 0.035, strength: 0.7,
});
// Drawing: only where the picture has edges -- the two arms, the mantle, the
// faces, and the plaster between the fingers.
const nFine = pass({
  pitch: 3.1 * P, jitter: 0.7, dmin: 1.5, dmax: 2.6,
  accept: (d) => d > 0.09, strength: 0.45,
});
// Contour: finer still, and only on the hardest edges there are. This pass is
// the gap -- without it the two hands blur into one mark and the picture stops
// being about anything.
const nEdge = pass({
  pitch: 2.0 * P, jitter: 0.55, dmin: 1.0, dmax: 1.6,
  accept: (d) => d > 0.19, strength: 0.3,
});

// --- Ground colour, so any gap between marks reads as the fresco's shadow ---
let R = 0, G = 0, B = 0;
for (let i = 0; i < px.length; i += 3) { R += px[i]; G += px[i + 1]; B += px[i + 2]; }
const nPx = px.length / 3;
const BG = hex((R / nPx) * 0.30, (G / nPx) * 0.29, (B / nPx) * 0.31);

// --- Frame: the plate is a figure, so it says what it is and how it was made ---
const capTop = Y0 + PH + 50;
const total = nUnder + nBase + nMid + nFine + nEdge;
text(kids, PAD_X, 30, PLATE_W, "D  I  V  I  S  I  O  N  I  S  M", 12, INK_EYEBROW);
text(kids, PAD_X - 60, capTop, PLATE_W + 120, "The Creation of Adam, Divided", 40, INK_TITLE);
rect(kids, W / 2 - 60, capTop + 80, 120, 1, "#332F58");
text(kids, PAD_X - 40, capTop + 104, PLATE_W + 80,
  "Michelangelo's plaster resampled as discrete marks: spacing set by a Sobel magnitude,\n" +
  "colour split off the local mean along a warm/cool axis and left to mix in the eye.\n" +
  "The finest pass exists for one reason — to keep the two fingers apart.", 13.5, INK_BODY);
text(kids, PAD_X - 40, capTop + 104 + 3 * lineHeight(13.5) + 12, PLATE_W + 80,
  `${total.toLocaleString("en-US")} marks  ·  underpainting ${nUnder.toLocaleString("en-US")}  ·  ground ${nBase.toLocaleString("en-US")}  ·  modelling ${nMid.toLocaleString("en-US")}  ·  drawing ${nFine.toLocaleString("en-US")}  ·  contour ${nEdge.toLocaleString("en-US")}  ·  source: Sistine Chapel ceiling, 1512, public domain`,
  11.5, INK_FAINT);

const spec = {
  version: 1,
  title: "The Creation of Adam, Divided",
  canvas: { padding: 0, background: BG, theme: "dark", vignette: 0.32, constraints: { allowOverlap: true } },
  root: { type: "scene", layout: "absolute", width: W, height: H, children: kids },
};

const name = process.env.OUT_NAME ?? "adam";
writeFileSync(`out/${name}.json`, JSON.stringify(spec));
console.log(`wrote out/${name}.json -- ${kids.length} blocks (${total} marks), canvas ${W}x${H}`);
