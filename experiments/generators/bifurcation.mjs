/*
 * "The Road To Chaos" -- the logistic map's bifurcation diagram.
 *
 *   x -> r x (1 - x)
 *
 * Sweep r and plot where the orbit settles. One fixed point becomes two,
 * two become four, and the doublings arrive faster and faster -- each window
 * shorter than the last by Feigenbaum's constant, 4.669..., until they
 * accumulate at r = 3.5699 and order runs out.
 *
 * The chaotic band would put thousands of marks on the same spot, so the
 * orbit is quantised onto a lattice: one mark per cell, which is what
 * rastering it would do anyway, and what keeps every mark disjoint.
 */
import { disc, poster, makeRamp, Lattice, text, INK_FAINT } from "./lib.mjs";

const kids = [];

const PX = 72;          // plot box
const PW = 736;
const PY = 150;
const PH = 656;

const R0 = 2.6;
const R1 = 4.0;
const PITCH = 3.5;
const DOT = 2.7;        // < PITCH

const ramp = makeRamp([
  [0.00, "#4C8FD6"],
  [0.34, "#63C6C0"],
  [0.58, "#E8C55F"],
  [0.76, "#EE7F4E"],
  [0.90, "#DE4A63"],
  [1.00, "#B03A86"],
]);

const lattice = new Lattice(PITCH);
const COLS = Math.round(PW / PITCH);

for (let i = 0; i <= COLS; i += 1) {
  const r = R0 + (i / COLS) * (R1 - R0);
  let x = 0.5;
  for (let k = 0; k < 600; k += 1) x = r * x * (1 - x);      // discard transient
  for (let k = 0; k < 700; k += 1) {
    x = r * x * (1 - x);
    lattice.add(PX + (i / COLS) * PW, PY + (1 - x) * PH);
  }
}

for (const p of lattice) {
  const t = Math.min(1, Math.max(0, (p.x - PX) / PW));
  disc(kids, p.x, p.y, DOT, ramp(t));
}

// r axis, labelled outside the plot so nothing can collide with the orbit.
for (const r of [2.6, 3.0, 3.45, 3.57, 4.0]) {
  const x = PX + ((r - R0) / (R1 - R0)) * PW;
  text(kids, x - 30, PY + PH + 14, 60, r === 3.57 ? "3.5699" : r.toFixed(1), 10.5, INK_FAINT);
}

poster({
  kids,
  name: "bifurcation",
  eyebrow: "L  O  G  I  S  T  I  C  ·  M  A  P",
  title: "The Road To Chaos",
  textTop: 900,
  caption:
    "One population, one parameter. Raise r and the steady state splits, then splits\n" +
    "again, each window shorter than the last by 4.669 — until the splitting never stops.",
  footnote: `x → r x (1 − x)  ·  ${lattice.size} cells  ·  r from 2.6 to 4.0  ·  700 iterates per column after transient`,
});
