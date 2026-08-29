/*
 * "The Popcorn Function" -- Thomae's function, drawn on the Farey fractions.
 *
 *   f(x) = 1/q  when x = p/q in lowest terms
 *   f(x) = 0    when x is irrational
 *
 * It is continuous at every irrational and discontinuous at every rational --
 * a function whose set of discontinuities is dense and countable, which is
 * why it is the standard counterexample to "discontinuous somewhere means
 * discontinuous on an interval".
 *
 * The subject chose the medium rather than the other way round. This library
 * can only draw discrete, separated marks (see README.md: `boxes-do-not-overlap`
 * forbids a stroked curve), and Thomae's function IS a set of discrete points
 * with nothing joining them. Every other poster in this directory quantises a
 * continuum to satisfy the constraint; this one does not have to.
 *
 * Written against the page builder only -- the current idiom, per README.md.
 */
import { page, makeRamp } from "./lib.mjs";

const p = page({ theme: "midnight" });

// Warm where the fraction is simple and loud, cool where it is fine and quiet.
const heat = makeRamp([
  [0.0, "#3B4B8C"], [0.32, "#5A93B8"], [0.63, "#D8B368"], [1.0, "#E8674F"],
]);

/**
 * The Farey sequence F_Q: every p/q in [0,1] with q <= Q, in lowest terms and
 * in order, by the neighbour recurrence. No gcd, no sort, no duplicates --
 * consecutive terms satisfy |ps - qr| = 1 by construction, which is the same
 * fact that makes the mediant tree work.
 */
function farey(Q) {
  const terms = [[0, 1]];
  let [a, b, c, d] = [0, 1, 1, Q];
  while (c <= Q) {
    const k = Math.floor((Q + b) / d);
    [a, b, c, d] = [c, d, k * c - a, k * d - b];
    terms.push([a, b]);
  }
  return terms;
}

const Q = 64;
// The integers are dropped, and the picture is the reason: f(0) = f(1) = 1,
// twice the next tallest value anywhere, so keeping them forces a scale on
// which the whole rest of the function is squashed into the bottom quarter of
// the panel. The domain drawn is therefore stated as the OPEN interval rather
// than cropped quietly.
const terms = farey(Q).filter(([, b]) => b >= 2);
const loud = (q) => heat(1 - Math.log(q) / Math.log(Q));

// --- the field: every rational in [0,1] at its own height -------------------
const main = p.panel({
  x: 150, y: 132, width: 660, height: 430,
  xDomain: [0, 1], yDomain: [0, 0.53],
  pitch: 4.4,
});
main.ticks({
  x: [0, 0.25, 0.5, 0.75, 1],
  y: [0, 0.125, 0.25, 0.375, 0.5],
  format: (v) => (v === 0 ? "0" : v === 1 ? "1" : String(v).replace("0.", ".")),
});

// Height IS the value: a point at p/q sits at 1/q, so the tallest spikes are
// the simplest fractions and the field thins downward without limit.
for (const [a, b] of terms) main.dot(a / b, 1 / b, 3.4, loud(b));
const drawnMain = main.lattice.size;

main.caption(
  `every p/q in (0, 1) with q up to ${Q}  ·  height is 1/q  ·  colour is how simple the fraction is`,
);

// --- the inset: the same picture, magnified around 1/3 ----------------------
// The claim under it is that this window is not special, so it is drawn from a
// much finer Q: at any magnification the same spikes appear, indexed by the
// denominators the window can now afford.
const ZOOM = [0.3, 0.4];
const fine = farey(180).filter(([a, b]) => a / b >= ZOOM[0] && a / b <= ZOOM[1]);
const inset = p.panel({
  x: 500, y: 640, width: 310, height: 168,
  xDomain: ZOOM, yDomain: [0, 0.36],
  pitch: 3.2,
});
inset.ticks({ x: [0.3, 0.35, 0.4], y: [0, 0.1, 0.2, 0.3], format: (v) => v.toFixed(2), fs: 10 });
for (const [a, b] of fine) inset.dot(a / b, 1 / b, 2.6, loud(Math.min(b, Q)));
inset.caption(`x from 0.30 to 0.40, q up to 180 — the tall one is 1/3`, 10.5);

// Width 280, not 300: the inset's own y-axis labels are reserved out to x=446,
// and a 300-wide column reaches them. Found by rendering -- boxes-do-not-overlap
// failed on "0.20" and "0.30" before this was narrowed.
p.text(150, 664, 280, "Continuous exactly where nothing is drawn", 13.5, "body", "start");
// The breaks are explicit because lib's `text` sizes a block by its HARD line
// count: a long string left to wrap overflows a box measured for one line, and
// `text-fits-box` says so.
p.text(150, 700, 280,
  "Near any irrational, only fractions with a large\n" +
    "denominator come close, and those are drawn low,\n" +
    "so the function tends to zero there — which is its\n" +
    "own value. Near a rational, the point itself sits\n" +
    "high above every neighbourhood of it. Dense\n" +
    "discontinuity, and nowhere an interval of it.",
  11.5, "faint", "start");

p.poster({
  name: "thomae",
  eyebrow: "T  H  O  M  A  E",
  title: "The Popcorn Function",
  caption:
    "Give every fraction p/q the height 1/q and every irrational the height zero. The\n" +
    "result is continuous at every irrational and broken at every rational — and the\n" +
    "rationals are dense, so the breaks are everywhere and nowhere in a row.",
  footnote:
    // One line, and it has to stay one line: `poster` measures a footnote by
    // its hard line count and the page has ~16px left under it.
    `${terms.length} fractions in (0, 1)  ·  ${drawnMain} survived the lattice  ·  ` +
    `f(0) = f(1) = 1, above the frame`,
  ramp: heat,
});
