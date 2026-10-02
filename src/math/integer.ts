/**
 * Integer helpers shared by every writer of exact numbers.
 *
 * `gcd` lived in six files -- the locale formatter, linear-map, solid, space,
 * vectors and probability-tree -- each reducing a fraction of its own.
 */

/** The greatest common divisor of two integers, never negative; gcd(a, 0) = |a|. */
export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) [x, y] = [y, x % y];
  return x;
}

/** The same for bigints, for the probability tree's exact fractions. */
export function gcdBig(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

/**
 * A whole number as k²·r with r square-free: 20 → {k: 2, r: 5}, 52 → {k: 2,
 * r: 13}, 16 → {k: 4, r: 1}. The Brazilian school form of a root is k√r --
 * "2√5", never "√20" -- so the square factor is always taken out.
 */
export function splitSquare(n: number): { k: number; r: number } {
  let k = 1;
  let r = n;
  for (let f = 2; f * f <= r; f += 1) {
    while (r % (f * f) === 0) {
      r /= f * f;
      k *= f;
    }
  }
  return { k, r };
}
