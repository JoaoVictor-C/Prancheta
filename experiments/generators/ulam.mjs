/*
 * "The Diagonals" -- the Ulam spiral.
 *
 * Write the integers on a square spiral and mark the primes. Nobody drew the
 * diagonal lines: they are what remains when the composites are removed,
 * because a diagonal of the spiral is the run of a quadratic 4n^2 + bn + c,
 * and some quadratics are unusually rich in primes.
 *
 * A lattice walk means no two marks can ever share a cell, so this figure
 * satisfies `boxes-do-not-overlap` by construction.
 */
import { disc, poster, makeRamp } from "./lib.mjs";

const kids = [];

const SIDE = 101;               // odd, so the spiral is centred
const N = SIDE * SIDE;
const PITCH = 7;
const DOT = 4.5;                // < PITCH
const CX = 440;
const CY = 486;

const ramp = makeRamp([
  [0.00, "#FFEEC4"],
  [0.26, "#FFC078"],
  [0.50, "#EE7A72"],
  [0.72, "#B4589B"],
  [0.88, "#6E5EAE"],
  [1.00, "#3B3A78"],
]);

// Sieve of Eratosthenes.
const composite = new Uint8Array(N + 1);
for (let i = 2; i * i <= N; i += 1) {
  if (composite[i]) continue;
  for (let j = i * i; j <= N; j += i) composite[j] = 1;
}
const isPrime = (v) => v >= 2 && !composite[v];

// Walk the spiral: right 1, up 1, left 2, down 2, right 3, up 3, ...
const DIRS = [[1, 0], [0, -1], [-1, 0], [0, 1]];
const RMAX = (SIDE - 1) / 2;
let x = 0;
let y = 0;
let n = 1;
let count = 0;

const place = (v, gx, gy) => {
  if (!isPrime(v)) return;
  const t = Math.min(1, Math.hypot(gx, gy) / RMAX);
  disc(kids, CX + gx * PITCH, CY + gy * PITCH, DOT, ramp(t));
  count += 1;
};

place(n, x, y);
let run = 1;
let di = 0;
outer: while (n < N) {
  for (let leg = 0; leg < 2; leg += 1) {
    const [dx, dy] = DIRS[di % 4];
    for (let s = 0; s < run; s += 1) {
      x += dx;
      y += dy;
      n += 1;
      if (n > N) break outer;
      place(n, x, y);
    }
    di += 1;
  }
  run += 1;
}

poster({
  kids,
  name: "ulam",
  eyebrow: "U  L  A  M",
  title: "The Diagonals",
  textTop: 906,
  caption:
    "The integers, spiralled. Only the primes are marked — and they refuse to\n" +
    "scatter, because each diagonal of the spiral is a quadratic in disguise.",
  footnote: `${count} primes below ${N}  ·  101 × 101 lattice  ·  hue carries distance from 1`,
});
