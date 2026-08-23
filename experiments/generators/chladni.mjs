/*
 * "Where The Sand Settles" -- Chladni nodal figures.
 *
 * For a square plate the standing-wave amplitude of mode (n, m) is
 *   f(x, y) = cos(n pi x) cos(m pi y) - cos(m pi x) cos(n pi y)
 * Sand sprinkled on a vibrating plate migrates off the antinodes and piles up
 * on the nodal set f = 0, so the grain is drawn only where |f| is small.
 * That is also what makes a fine sampling grid affordable: only the narrow
 * band around the nodal curves ever emits a block.
 */
import { disc, poster, fade, text, INK_FAINT } from "./lib.mjs";

const kids = [];

const PLATE = 320;      // side of one plate, in px
const GAP = 40;
const N = 64;           // samples per side
const STEP = PLATE / N;
const DMAX = 4.6;       // < STEP, so neighbouring grains can never collide
const BAND = 0.125;      // half-width of the nodal band the sand collects in
const SAND = "#F2E2BC";

const MODES = [
  [1, 2], [1, 3],
  [2, 3], [2, 5],
];

const amplitude = (n, m, x, y) =>
  (Math.cos(n * Math.PI * x) * Math.cos(m * Math.PI * y) -
    Math.cos(m * Math.PI * x) * Math.cos(n * Math.PI * y)) / 2;

MODES.forEach(([n, m], k) => {
  const ox = 100 + (k % 2) * (PLATE + GAP);
  const oy = 130 + Math.floor(k / 2) * (PLATE + GAP);

  for (let i = 0; i < N; i += 1) {
    for (let j = 0; j < N; j += 1) {
      const x = (i + 0.5) / N;
      const y = (j + 0.5) / N;
      const a = Math.abs(amplitude(n, m, x, y));
      if (a > BAND) continue;                    // sand never rests here
      const w = 1 - a / BAND;                    // 1 on the node, 0 at the edge
      const d = DMAX * Math.pow(w, 0.45);
      if (d < 1) continue;
      disc(kids, ox + (i + 0.5) * STEP, oy + (j + 0.5) * STEP, d,
        fade(SAND, 0.85 * (1 - w)));
    }
  }

  text(kids, ox, oy + PLATE + 10, PLATE, `n = ${n}  ·  m = ${m}`, 11.5, INK_FAINT);
});

poster({
  kids,
  name: "chladni",
  eyebrow: "C  H  L  A  D  N  I",
  title: "Where The Sand Settles",
  textTop: 910,
  caption:
    "Bow the edge of a metal plate and the sand stops moving only where the plate\n" +
    "does not. The grain maps the nodal curves of f = cos nπx cos mπy − cos mπx cos nπy.",
  footnote: "four modes of a square plate  ·  64 x 64 samples  ·  grain size carries proximity to f = 0",
});
