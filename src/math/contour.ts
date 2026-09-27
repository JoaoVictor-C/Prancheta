/**
 * Level sets f(x, y) = c, found by marching squares.
 *
 * An implicit curve -- "x²/9 + y²/4 = 1", "xy = 1", "x² − y² = 0" -- has no
 * y = f(x) to sample: it is where a function of two variables takes one
 * value. The only way to DERIVE its geometry rather than type it is to look
 * for that value: lay a grid of cells over the box, note at every grid
 * vertex which side of c the function is on, and wherever an edge joins
 * vertices on opposite sides the curve crosses that edge. Joining the
 * crossings cell by cell gives the curve as polylines.
 *
 * Three things separate this from the textbook sketch, and each is here
 * because the textbook version draws something the function did not say:
 *
 *  - **Vertices are ON the curve, not interpolated near it.** Linear
 *    interpolation between two samples puts the crossing where a straight
 *    line would cross, which is off the curve by the function's curvature
 *    along the edge. Each crossing is found by bisection on the edge
 *    instead, until the bracket is narrower than `tolerance` (world units).
 *    The bracket's ends are on opposite sides of c, so a continuous f takes
 *    the value c inside it: every vertex returned is within `tolerance` of a
 *    true point of the level set. Between two vertices the polyline is a
 *    chord inside one cell; how far a chord strays is the caller's to bound,
 *    by choosing cells small enough (the preset uses about 3px).
 *
 *  - **A sign change is not always a crossing.** Across a pole
 *    (1/(xy) = 1 near the axes) or a jump (sign(x)) the function changes
 *    side without ever taking the value c, and bisection converges on the
 *    pole or the jump all the same. What tells them apart is the size of
 *    f − c where the bracket closes: at a crossing it has shrunk to rounding
 *    noise, at a pole it has grown, at a jump it has not shrunk. A crossing
 *    whose residual is not below a thousandth of the edge's end values is
 *    discarded -- the same test sign-chart uses to tell a root from a pole
 *    (ADR 0027), and the reason a hyperbola is never joined across its
 *    asymptote.
 *
 *  - **Saddle cells are decided by the function, not by a convention.** A
 *    cell whose corners alternate +, −, +, − is crossed twice, and the four
 *    crossings pair up in two ways that draw different curves. The textbook
 *    fixes one pairing by table, which draws x² − y² = 0.01 with its
 *    branches wrongly joined half the time. Here f is evaluated at the cell's
 *    centre: if the centre is on the side of one diagonal's corners, those
 *    corners are connected through the middle and the curve cuts off the
 *    other two. Where f is undefined at the centre the bilinear
 *    interpolant's saddle value stands in (the "asymptotic decider"). A
 *    centre ON the level (to rounding) -- the crossing of xy = 0 -- joins
 *    all four crossings to the centre, so the X is drawn as an X.
 *
 * What it cannot see, stated rather than hidden: a level set that touches c
 * without crossing it ((x² + y² − 1)² = 0, an isolated point x² + y² = 0),
 * and any piece of the curve smaller than a cell, which can fall between
 * samples. Cells where f is undefined at a corner are skipped, so a curve
 * stops within one cell of where its function stops being defined.
 *
 * Pure: no drawing, no pixels, no state. The function-graph preset maps the
 * polylines to its plane (ADR 0029).
 */

export type ContourPoint = { x: number; y: number };

export type ContourLine = {
  /** Vertices in order; a closed line repeats its first vertex at the end. */
  points: ContourPoint[];
  closed: boolean;
};

export type ContourOptions = {
  /** The level c in f(x, y) = c. Default 0. */
  level?: number;
  /** Cells across and down, or one count for both. Default 64. */
  cells?: number | [number, number];
  /**
   * The widest bracket a crossing is bisected to, in world units: every
   * vertex lies within this distance of a true point of the level set.
   * Default 1e-9 of the box's larger side.
   */
  tolerance?: number;
};

/** A crossing is refused as a pole or a jump unless its residual shrank below this share of the edge's ends. */
const RESIDUAL_SHARE = 1e-3;

export function contour(
  f: (x: number, y: number) => number,
  box: { x: [number, number]; y: [number, number] },
  options: ContourOptions = {},
): ContourLine[] {
  const level = options.level ?? 0;
  const [nx, ny] = typeof options.cells === "number" ? [options.cells, options.cells] : (options.cells ?? [64, 64]);
  if (!(Number.isInteger(nx) && Number.isInteger(ny) && nx >= 1 && ny >= 1)) {
    throw new RangeError(`contour: cells must be positive integers, got ${nx} × ${ny}`);
  }
  const [x0, x1] = box.x;
  const [y0, y1] = box.y;
  if (!(x1 > x0 && y1 > y0)) throw new RangeError("contour: the box must have min < max on both axes");
  const span = Math.max(x1 - x0, y1 - y0);
  const tolerance = options.tolerance ?? span * 1e-9;

  const g = (x: number, y: number): number => {
    const v = f(x, y) - level;
    return Number.isFinite(v) ? v : Number.NaN;
  };
  // "Inside" is g >= 0: a vertex exactly on the level counts as one side, so
  // every edge is either crossed or not and no case needs its own table.
  const inside = (v: number): boolean => v >= 0;
  const X = (i: number): number => x0 + ((x1 - x0) * i) / nx;
  const Y = (j: number): number => y0 + ((y1 - y0) * j) / ny;

  const values: number[][] = [];
  for (let i = 0; i <= nx; i += 1) {
    const column: number[] = [];
    for (let j = 0; j <= ny; j += 1) column.push(g(X(i), Y(j)));
    values.push(column);
  }
  const at = (i: number, j: number): number => values[i]![j]!;

  // ---- crossings, one per edge, shared by the two cells that meet there ----
  const points = new Map<string, ContourPoint>();
  const crossings = new Map<string, ContourPoint | null>();
  const crossing = (key: string, ax: number, ay: number, ga: number, bx: number, by: number, gb: number): ContourPoint | null => {
    const known = crossings.get(key);
    if (known !== undefined) return known;
    let found: ContourPoint | null = null;
    if (Number.isFinite(ga) && Number.isFinite(gb) && inside(ga) !== inside(gb)) {
      const length = Math.hypot(bx - ax, by - ay);
      let lo = 0;
      let hi = 1;
      let defined = true;
      for (let n = 0; n < 200 && (hi - lo) * length > tolerance; n += 1) {
        const mid = (lo + hi) / 2;
        if (mid === lo || mid === hi) break;
        const gm = g(ax + (bx - ax) * mid, ay + (by - ay) * mid);
        if (!Number.isFinite(gm)) {
          // Undefined somewhere on the edge: whatever changes side here, it
          // is not a point where f takes the value.
          defined = false;
          break;
        }
        if (inside(gm) === inside(ga)) lo = mid;
        else hi = mid;
      }
      if (defined) {
        const s = (lo + hi) / 2;
        const p = { x: ax + (bx - ax) * s, y: ay + (by - ay) * s };
        const residual = g(p.x, p.y);
        if (Number.isFinite(residual) && Math.abs(residual) <= RESIDUAL_SHARE * Math.max(Math.abs(ga), Math.abs(gb))) {
          found = p;
          points.set(key, p);
        }
      }
    }
    crossings.set(key, found);
    return found;
  };
  const horizontal = (i: number, j: number): ContourPoint | null =>
    crossing(`h${i},${j}`, X(i), Y(j), at(i, j), X(i + 1), Y(j), at(i + 1, j));
  const vertical = (i: number, j: number): ContourPoint | null =>
    crossing(`v${i},${j}`, X(i), Y(j), at(i, j), X(i), Y(j + 1), at(i, j + 1));

  // ---- segments, cell by cell ----------------------------------------------
  const segments: [string, string][] = [];
  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < ny; j += 1) {
      const g00 = at(i, j);
      const g10 = at(i + 1, j);
      const g11 = at(i + 1, j + 1);
      const g01 = at(i, j + 1);
      if (![g00, g10, g11, g01].every(Number.isFinite)) continue;
      // Around the cell: bottom, right, top, left.
      const edges: [string, ContourPoint | null][] = [
        [`h${i},${j}`, horizontal(i, j)],
        [`v${i + 1},${j}`, vertical(i + 1, j)],
        [`h${i},${j + 1}`, horizontal(i, j + 1)],
        [`v${i},${j}`, vertical(i, j)],
      ];
      const crossed = edges.filter(([, p]) => p !== null).map(([key]) => key);
      if (crossed.length === 2) {
        segments.push([crossed[0]!, crossed[1]!]);
        continue;
      }
      // One or three: a pole or a jump took one crossing away and the rest
      // cannot be paired without guessing. Nothing is drawn in this cell.
      if (crossed.length !== 4) continue;
      const [bottom, right, top, left] = edges.map(([key]) => key) as [string, string, string, string];
      const cx = (X(i) + X(i + 1)) / 2;
      const cy = (Y(j) + Y(j + 1)) / 2;
      let centre = g(cx, cy);
      if (!Number.isFinite(centre)) {
        const denominator = g00 + g11 - g10 - g01;
        centre = denominator === 0 ? (g00 + g10 + g11 + g01) / 4 : (g00 * g11 - g10 * g01) / denominator;
      }
      // "On the level" to within rounding of the corners' size: the centre
      // of a cell is itself a sum of grid coordinates, and x·y there is
      // 1e-34, not 0, when the grid is symmetric about the origin.
      if (Math.abs(centre) <= 1e-12 * Math.max(Math.abs(g00), Math.abs(g10), Math.abs(g11), Math.abs(g01))) {
        const key = `c${i},${j}`;
        points.set(key, { x: cx, y: cy });
        for (const edge of [bottom, right, top, left]) segments.push([edge, key]);
      } else if (inside(centre) === inside(g00)) {
        // 00 and 11 are joined through the middle: cut off corners 10 and 01.
        segments.push([bottom, right], [top, left]);
      } else {
        // 10 and 01 are joined through the middle: cut off corners 00 and 11.
        segments.push([left, bottom], [right, top]);
      }
    }
  }

  return chain(segments, points, tolerance);
}

/**
 * Join segments that share an endpoint into polylines. An edge crossing is
 * shared by at most the two cells on either side of its edge, so every node
 * has degree one (an end: the box's border, or a cell that drew nothing),
 * two (the middle of a line), or four (the centre of an X). Lines are walked
 * from every node that is not a middle first; what is left is closed loops.
 */
function chain(segments: [string, string][], points: Map<string, ContourPoint>, tolerance: number): ContourLine[] {
  const touching = new Map<string, number[]>();
  segments.forEach(([a, b], s) => {
    for (const key of [a, b]) {
      if (!touching.has(key)) touching.set(key, []);
      touching.get(key)!.push(s);
    }
  });
  const used = new Array<boolean>(segments.length).fill(false);
  const out: ContourLine[] = [];
  const walk = (start: string, first: number): ContourLine => {
    const keys = [start];
    let node = start;
    let s: number | undefined = first;
    while (s !== undefined) {
      used[s] = true;
      const [a, b] = segments[s]!;
      node = a === node ? b : a;
      keys.push(node);
      if (node === start) break;
      const next = touching.get(node)!;
      s = next.length === 2 ? next.find((t) => !used[t]) : undefined;
    }
    const closed = keys.length > 2 && keys[0] === keys[keys.length - 1];
    return { points: dedupe(keys.map((k) => points.get(k)!), tolerance), closed };
  };
  for (const [key, list] of touching) {
    if (list.length === 2) continue;
    for (const s of list) if (!used[s]) out.push(walk(key, s));
  }
  for (let s = 0; s < segments.length; s += 1) {
    if (!used[s]) out.push(walk(segments[s]![0], s));
  }
  return out.filter((line) => line.points.length >= 2);
}

/**
 * Consecutive vertices closer than the tolerance are one vertex: a level
 * passing exactly through a grid vertex is found on every edge that meets
 * there, at the same place.
 */
function dedupe(points: ContourPoint[], tolerance: number): ContourPoint[] {
  const out: ContourPoint[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last !== undefined && Math.hypot(p.x - last.x, p.y - last.y) <= tolerance) continue;
    out.push(p);
  }
  // A closed line's last vertex is its first again, and must stay so even if
  // it was deduplicated against its neighbour.
  if (points.length > 1 && points[0] === points[points.length - 1] && out[out.length - 1] !== out[0]) {
    if (out.length > 1 && Math.hypot(out[out.length - 1]!.x - out[0]!.x, out[out.length - 1]!.y - out[0]!.y) <= tolerance) {
      out[out.length - 1] = out[0]!;
    } else {
      out.push(out[0]!);
    }
  }
  return out;
}
