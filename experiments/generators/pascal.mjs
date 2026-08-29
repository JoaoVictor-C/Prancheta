/*
 * "The Carries" -- Pascal's triangle modulo 5.
 *
 * Kummer's theorem: the power of p dividing C(n, k) is exactly the number of
 * carries when k is added to n - k in base p. So a cell of the triangle
 * vanishes mod p precisely when that addition carries, and Lucas' theorem
 * gives what survives -- the product of the digitwise binomials, base p.
 *
 * Carrying is a digit-local rule, so it repeats at every scale: the gaps nest
 * in blocks of 5, 25 and 125 rows. Nobody drew the holes.
 *
 * Each cell owns one lattice site, so no two marks can collide and the figure
 * satisfies `boxes-do-not-overlap` by construction.
 */
import { disc, poster, text, makeRamp, INK_FAINT } from "./lib.mjs";

const kids = [];

const P = 5;                    // modulus
const ROWS = 125;               // P^3, so three levels of nesting are complete
const PITCH = 5.6;              // horizontal step between neighbouring cells
const ROW = 5.04;               // vertical step between rows
const DOT = 4.6;                // < the 5.77 gap to the nearest cell of the row below
const CX = 440;
const TOP = 150;

const ramp = makeRamp([
  [0.00, "#FFEEC4"],
  [0.34, "#FFC078"],
  [0.67, "#EE7A72"],
  [1.00, "#8B62B0"],
]);

/** The four surviving residues span the ramp end to end. */
const hue = (r) => ramp((r - 1) / (P - 2));

/** C(a, b) mod P for single base-P digits, 0 <= a, b < P. */
const digit = [];
for (let a = 0; a < P; a += 1) {
  digit[a] = [];
  for (let b = 0; b < P; b += 1) {
    if (b > a) { digit[a][b] = 0; continue; }
    let v = 1;
    for (let i = 0; i < b; i += 1) v = (v * (a - i)) / (i + 1);
    digit[a][b] = v % P;
  }
}

/** C(n, k) mod P by Lucas' theorem: the product of the digitwise binomials. */
function binomMod(n, k) {
  let v = 1;
  while (n > 0 || k > 0) {
    v = (v * digit[n % P][k % P]) % P;
    if (v === 0) return 0;
    n = Math.floor(n / P);
    k = Math.floor(k / P);
  }
  return v;
}

let count = 0;
for (let n = 0; n < ROWS; n += 1) {
  for (let k = 0; k <= n; k += 1) {
    const r = binomMod(n, k);
    if (r === 0) continue;                       // the addition carried
    const x = CX + (k - n / 2) * PITCH;
    const y = TOP + n * ROW;
    disc(kids, x, y, DOT, hue(r));
    count += 1;
  }
}

// Legend: one swatch per surviving residue, in the order the ramp reads them.
const LEGEND_Y = 838;
for (let r = 1; r < P; r += 1) {
  const x = CX + (r - P / 2) * 66;
  disc(kids, x, LEGEND_Y, 7, hue(r));
  text(kids, x - 16, LEGEND_Y + 10, 32, `${r}`, 10.5, INK_FAINT);
}

poster({
  kids,
  name: "pascal",
  eyebrow: "P  A  S  C  A  L",
  title: "The Carries",
  textTop: 906,
  caption:
    "Pascal's triangle, kept only modulo 5. A cell vanishes exactly when adding k to\n" +
    "n − k in base 5 carries — and carrying is a digit rule, so the holes nest.",
  footnote: `${count} surviving cells in ${ROWS} rows  ·  modulo ${P}  ·  hue carries the residue`,
});
