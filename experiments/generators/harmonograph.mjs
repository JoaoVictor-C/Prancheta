/*
 * "Ratios" -- a Lissajous plate.
 *
 *   x = sin(a t + delta),  y = sin(b t)
 *
 * The shape depends only on a : b and the phase. A rational ratio closes into
 * a knot; the closer the ratio, the simpler the knot.
 *
 * Every curve here crosses itself, and two marks at one crossing would be a
 * partial overlap -- a real check failure. So each curve is sampled far more
 * densely than it is drawn and quantised onto a lattice, one mark per cell.
 * That is also exactly what rastering the curve would do.
 */
import { disc, poster, makeRamp, Lattice, text, INK_FAINT } from "./lib.mjs";

const kids = [];

const CELL = 190;       // pitch of the plate grid
const SPAN = 150;       // width of one curve's bounding square
const PITCH = 3.6;      // lattice pitch; marks are smaller than this
const DOT = 2.9;
const OX = 65;
const OY = 138;

const ramp = makeRamp([
  [0.00, "#7FE3D4"],
  [0.30, "#6FA8E8"],
  [0.55, "#9B86EE"],
  [0.78, "#DE72C0"],
  [1.00, "#F0A15E"],
]);

const RATIOS = [
  [1, 2], [1, 3], [2, 3], [3, 4],
  [1, 4], [3, 5], [4, 5], [5, 6],
  [2, 5], [4, 7], [5, 7], [5, 8],
  [3, 7], [5, 9], [7, 8], [7, 9],
];

RATIOS.forEach(([a, b], k) => {
  const cx = OX + (k % 4) * CELL + SPAN / 2;
  const cy = OY + Math.floor(k / 4) * CELL + SPAN / 2;
  const delta = Math.PI / 4;
  const hue = ramp(k / (RATIOS.length - 1));

  // Sample ~30x more finely than the lattice can hold, so the trace is solid.
  const lattice = new Lattice(PITCH);
  const STEPS = 9000;
  for (let s = 0; s < STEPS; s += 1) {
    const t = (s / STEPS) * 2 * Math.PI;
    lattice.add(
      cx + (SPAN / 2) * Math.sin(a * t + delta),
      cy + (SPAN / 2) * Math.sin(b * t),
    );
  }
  for (const p of lattice) disc(kids, p.x, p.y, DOT, hue);

  text(kids, cx - SPAN / 2, cy + SPAN / 2 + 12, SPAN, `${a} : ${b}`, 11, INK_FAINT);
});

poster({
  kids,
  name: "harmonograph",
  eyebrow: "L  I  S  S  A  J  O  U  S",
  title: "Ratios",
  textTop: 912,
  caption:
    "Two perpendicular oscillations, one figure. The curve closes only when the\n" +
    "frequencies are commensurable — and the simpler the ratio, the simpler the knot.",
  footnote: "x = sin(at + π/4),  y = sin(bt)  ·  sixteen ratios  ·  traced on a 3.6 px lattice",
});
