/*
 * Shared scaffolding for the mathematical poster series.
 *
 * Everything here exists because of one constraint: `boxes-do-not-overlap`
 * lets blocks nest or stand apart but never partially overlap. So every
 * figure in this series is built from discrete, separated marks -- and any
 * curve that crosses itself has to be quantised onto a lattice first, which
 * is what `Lattice` is for.
 */
import { writeFileSync } from "node:fs";

export const W = 880;
export const H = 1120;
export const BG = "#0A0A12";

export const INK_TITLE = "#F4E7CA";
export const INK_EYEBROW = "#9BA0CC";
export const INK_BODY = "#8E92BC";
export const INK_FAINT = "#8A8FB8";
export const INK_RULE = "#332F58";

let uid = 0;
export const nid = (p) => `${p}${uid++}`;

/** One rendered line box, matching the theme's 1.45 line-height. */
export const lineHeight = (fs) => fs * 1.45;
/** Slack for the ink that overshoots the line boxes (ascenders, descenders). */
const INK_SLACK = 2.6;

const hexOf = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const pad = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");

/** Piecewise-linear colour ramp through `stops` of [t, "#rrggbb"], t in [0,1]. */
export function makeRamp(stops) {
  return (t) => {
    const u = Math.min(1, Math.max(0, t));
    let i = 0;
    while (i < stops.length - 2 && u > stops[i + 1][0]) i += 1;
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    const k = (u - t0) / (t1 - t0);
    const a = hexOf(c0);
    const b = hexOf(c1);
    return `#${a.map((v, j) => pad(v + (b[j] - v) * k)).join("")}`;
  };
}

/** Blend `c` towards `bg` by `k` (0 = c, 1 = bg). */
export function fade(c, k, bg = BG) {
  const a = hexOf(c);
  const b = hexOf(bg);
  return `#${a.map((v, j) => pad(v + (b[j] - v) * k)).join("")}`;
}

/** A label anchored at its top-left. Newlines are hard breaks. */
export function text(kids, x, y, w, label, fs, fill, align = "center") {
  const lines = label.split("\n").length;
  kids.push({
    type: "block", id: nid("t"), x, y, width: w,
    height: lines * lineHeight(fs) + INK_SLACK,
    label, fill: "transparent", stroke: "transparent", strokeWidth: 0,
    textColor: fill, fontSize: fs, padding: 0, textAlign: align,
  });
}

/** A filled disc of diameter `d` centred on (cx, cy). */
export function disc(kids, cx, cy, d, fill, effect) {
  kids.push({
    type: "block", id: nid("d"), x: cx - d / 2, y: cy - d / 2,
    width: d, height: d, shape: "circle",
    fill, stroke: "transparent", strokeWidth: 0, padding: 0,
    ...(effect ? { effect } : {}),
  });
}

/** An axis-aligned ink rectangle. */
export function rect(kids, x, y, w, h, fill) {
  kids.push({
    type: "block", id: nid("r"), x, y, width: w, height: h,
    fill, stroke: "transparent", strokeWidth: 0, radius: 0, padding: 0,
  });
}

/**
 * Snaps points onto a square lattice and keeps one per cell.
 *
 * A parametric curve that crosses itself would otherwise place two marks at
 * the same spot -- a partial overlap, and a real check failure. Quantising
 * collapses every crossing to a single mark, which is also what rastering
 * the curve would do anyway.
 */
export class Lattice {
  constructor(pitch) {
    this.pitch = pitch;
    this.cells = new Map();
  }

  /** Returns true if this point claimed a previously empty cell. */
  add(x, y, meta) {
    const i = Math.round(x / this.pitch);
    const j = Math.round(y / this.pitch);
    const key = `${i},${j}`;
    if (this.cells.has(key)) return false;
    this.cells.set(key, { x: i * this.pitch, y: j * this.pitch, meta });
    return true;
  }

  get size() {
    return this.cells.size;
  }

  *[Symbol.iterator]() {
    yield* this.cells.values();
  }
}

/**
 * The common poster frame: eyebrow above, title / rule / caption / footnote
 * below, over whatever `kids` the figure has already pushed.
 */
export function poster({ kids, name, title, eyebrow, caption, footnote, textTop = 916, vignette = 0.4 }) {
  text(kids, 140, 52, 600, eyebrow, 12, INK_EYEBROW);
  text(kids, 100, textTop, 680, title, 42, INK_TITLE);
  rect(kids, W / 2 - 60, textTop + 84, 120, 1, INK_RULE);
  text(kids, 110, textTop + 110, 660, caption, 13.5, INK_BODY);
  const lines = caption.split("\n").length;
  text(kids, 110, textTop + 110 + lines * lineHeight(13.5) + 12, 660, footnote, 11.5, INK_FAINT);

  const spec = {
    version: 1,
    title,
    canvas: { padding: 0, background: BG, theme: "dark", vignette },
    root: { type: "scene", layout: "absolute", width: W, height: H, children: kids },
  };
  writeFileSync(`out/${name}.json`, JSON.stringify(spec, null, 2));
  console.log(`wrote out/${name}.json -- ${kids.length} blocks`);
}
