/**
 * venn -- Venn diagrams of two or three sets in a rectangular universe, for
 * Conjuntos, Probabilidade and ENEM ("sombreie (A ∪ B) − C", "numa pesquisa
 * com 100 pessoas, 45 leem o jornal A, 30 o B, 12 ambos: quantas não leem
 * nenhum?").
 *
 * What is typed is the sets' names and, optionally, an expression to shade,
 * the numbers of a survey, or the elements of each set. Everything drawn is
 * computed:
 *
 *  - Circles are EQUAL and laid out symmetrically: two overlapping, or three
 *    on an equilateral triangle of side r (the classic arrangement). This is
 *    a Venn diagram, not an Euler one: area-proportional diagrams are out of
 *    scope, and a region's size says nothing about its count.
 *  - The plane is cut into its ATOMIC regions -- 2^n of them, the outside of
 *    every circle included. Each inner region is traced from the circle
 *    intersection geometry as arcs between intersection points (a `{ arc,
 *    centre }` IR segment per <= 60 degrees), so its outline is exact, never a
 *    polygon approximation. Both sides of every arc are known (the arc's
 *    midpoint tested against the other circles), which is what chains the arcs
 *    of a region into a closed loop.
 *  - Shading is an expression (setexpr.ts) EVALUATED on each region's
 *    membership vector; no region is ever picked by hand. Fills are drawn
 *    first with no stroke, and the circle outlines -- traced from the very same
 *    arcs -- go on top, so a shaded union of regions reads as one smooth area
 *    and the seam between two fills is under a 2px line.
 *  - Counts: either the exclusive count of each region, or the textbook data
 *    (|A|, |B|, |A ∩ B|, total ...) solved for every region by inclusion-
 *    exclusion. A negative region is refused, naming it. Each number is set
 *    at the point of ITS region furthest from every outline (a sampled pole of
 *    inaccessibility), tested so that the label's box crosses no outline.
 *  - Elements: each region's elements, computed from membership, wrapped.
 */

import type { FigureSpec, Mark, MarkSegment, Point } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { LOCALES, formatNumber } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";
import { evalSetExpr, isReservedSetName, parseSetExpr, printSetExpr } from "./setexpr.ts";
import type { SetExpr } from "./setexpr.ts";

// ---- input ------------------------------------------------------------------

export type VennElement = number | string;

export type VennInput = {
  title?: string;
  locale?: Locale;
  /** Two or three names. */
  sets: string[];
  /** The universe's name, drawn in the rectangle's corner. Default "U". */
  universe?: string;
  /** A set expression: "(A ∪ B) − C", "A'", "A inter B". */
  shade?: string;
  /** Textbook data ({ total, A, B, "A∩B" }) or `{ regions: { A: 33, "A∩B": 12, none: 37 } }`. */
  counts?: Record<string, unknown>;
  /** The elements of each set, and of the universe under its own name. */
  elements?: Record<string, VennElement[]>;
};

// ---- palette and geometry constants ------------------------------------------

const PAPER = "#FCFBF7";
const INK = "#181B21";
const SOFT = "#4E5763";
const SHADE = "#9DBDE9";
const CIRCLE_W = 2;
const RECT_W = 1.6;
const MARGIN = 28;
const PAD_X = 58;
const PAD_TOP = 62;
const PAD_BOTTOM = 56;
const ARC_STEP = Math.PI / 3;
const COUNT_SIZES = [19, 16, 13, 11];
const ELEMENT_SIZES = [15, 13, 12, 11];
const CAPTION_SIZE = 15;
const FIT_PAD = 3;

type Pt = { x: number; y: number };
export type Circle = { x: number; y: number; r: number };

// ---- the layout ---------------------------------------------------------------

/** The circles of the classic arrangement, in a y-up frame centred on the middle of the diagram. */
export function vennCircles(n: 2 | 3, r: number): Circle[] {
  if (n === 2) {
    return [
      { x: -r / 2, y: 0, r },
      { x: r / 2, y: 0, r },
    ];
  }
  const rho = r / Math.sqrt(3); // circumradius of an equilateral triangle of side r
  return [
    { x: -r / 2, y: rho / 2, r },
    { x: r / 2, y: rho / 2, r },
    { x: 0, y: -rho, r },
  ];
}

/** The membership bit-mask of a point: bit i is set when it is inside circle i. */
export function maskAt(circles: readonly Circle[], x: number, y: number): number {
  let m = 0;
  circles.forEach((c, i) => {
    if (Math.hypot(x - c.x, y - c.y) < c.r) m |= 1 << i;
  });
  return m;
}

const popcount = (m: number): number => {
  let n = 0;
  for (let x = m; x > 0; x >>= 1) n += x & 1;
  return n;
};

/** "A", "A ∩ B", "A ∩ B ∩ C": the sets a mask is in. */
export function maskText(mask: number, names: readonly string[]): string {
  return names.filter((_, i) => (mask & (1 << i)) !== 0).join(" ∩ ");
}

/** A region as a reader names it: "only A", "A ∩ B, outside C", "outside every set". */
export function describeRegion(mask: number, names: readonly string[]): string {
  const inside = names.filter((_, i) => (mask & (1 << i)) !== 0);
  const outside = names.filter((_, i) => (mask & (1 << i)) === 0);
  if (inside.length === 0) return "outside every set";
  if (outside.length === 0) return inside.join(" ∩ ");
  if (inside.length === 1) return `only ${inside[0]}`;
  return `${inside.join(" ∩ ")}, outside ${outside.join(" and ")}`;
}

function intersections(a: Circle, b: Circle): [Pt, Pt] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const h = Math.sqrt(Math.max(0, a.r * a.r - (d / 2) * (d / 2)));
  const mx = a.x + dx / 2;
  const my = a.y + dy / 2;
  return [
    { x: mx - (h * dy) / d, y: my + (h * dx) / d },
    { x: mx + (h * dy) / d, y: my - (h * dx) / d },
  ];
}

type Arc = { circle: number; a0: number; a1: number; from: Pt; to: Pt; others: number };
const TAU = Math.PI * 2;

/** Every circle cut at its intersection points with the others; each arc knows which other circles it lies inside. */
export function circleArcs(circles: readonly Circle[]): Arc[] {
  const cuts: { circle: number; ang: number; p: Pt }[] = [];
  for (let i = 0; i < circles.length; i += 1) {
    for (let j = i + 1; j < circles.length; j += 1) {
      for (const p of intersections(circles[i]!, circles[j]!)) {
        for (const k of [i, j]) {
          const c = circles[k]!;
          let ang = Math.atan2(p.y - c.y, p.x - c.x);
          if (ang < 0) ang += TAU;
          cuts.push({ circle: k, ang, p });
        }
      }
    }
  }
  const arcs: Arc[] = [];
  circles.forEach((c, i) => {
    const mine = cuts.filter((q) => q.circle === i).sort((a, b) => a.ang - b.ang);
    const list = mine.length > 0 ? mine : [{ circle: i, ang: 0, p: { x: c.x + c.r, y: c.y } }];
    list.forEach((q, k) => {
      const next = list[(k + 1) % list.length]!;
      const a1 = next.ang > q.ang ? next.ang : next.ang + TAU;
      const mid = (q.ang + a1) / 2;
      const mx = c.x + c.r * Math.cos(mid);
      const my = c.y + c.r * Math.sin(mid);
      const others = maskAt(circles, mx, my) & ~(1 << i);
      arcs.push({ circle: i, a0: q.ang, a1, from: q.p, to: next.p, others });
    });
  });
  return arcs;
}

/** The points of an arc after `from`, each step at most 60 degrees, the last exactly `to`. */
function arcWaypoints(circles: readonly Circle[], arc: Arc): Pt[] {
  const c = circles[arc.circle]!;
  const n = Math.max(1, Math.ceil((arc.a1 - arc.a0) / ARC_STEP - 1e-9));
  const out: Pt[] = [];
  for (let s = 1; s < n; s += 1) {
    const a = arc.a0 + ((arc.a1 - arc.a0) * s) / n;
    out.push({ x: c.x + c.r * Math.cos(a), y: c.y + c.r * Math.sin(a) });
  }
  out.push(arc.to);
  return out;
}

type Run = { start: Pt; pts: Pt[]; circle: number };

/**
 * The closed outlines of one inner region: the arcs on its boundary, each
 * walked with the region on its left, chained head to tail. Most regions are
 * one loop; a region the layout cut in two would give two.
 */
export function regionLoops(circles: readonly Circle[], arcs: readonly Arc[], mask: number): Run[][] {
  const runs: Run[] = [];
  for (const arc of arcs) {
    const way = arcWaypoints(circles, arc);
    const bit = 1 << arc.circle;
    if ((arc.others | bit) === mask) {
      runs.push({ start: arc.from, pts: way, circle: arc.circle }); // inside, counter-clockwise
    } else if (arc.others === mask) {
      const pts = [arc.from, ...way.slice(0, -1)]; // outside: walked clockwise, so reversed
      runs.push({ start: arc.to, pts: pts.reverse(), circle: arc.circle });
    }
  }
  const key = (p: Pt): string => `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
  const loops: Run[][] = [];
  const left = new Set(runs);
  while (left.size > 0) {
    const first = [...left][0]!;
    left.delete(first);
    const loop = [first];
    let end = first.pts[first.pts.length - 1]!;
    while (key(end) !== key(first.start)) {
      const next = [...left].find((r) => key(r.start) === key(end));
      if (next === undefined) throw new Error(`venn: the outline of region ${mask} does not close`);
      left.delete(next);
      loop.push(next);
      end = next.pts[next.pts.length - 1]!;
    }
    loops.push(loop);
  }
  return loops;
}

/** Flatten the arcs of a loop to a polygon (for measuring). */
export function loopPolygon(circles: readonly Circle[], loop: Run[], per = 24): Pt[] {
  const out: Pt[] = [];
  for (const run of loop) {
    const c = circles[run.circle]!;
    let prev = run.start;
    out.push(prev);
    for (const p of run.pts) {
      const a0 = Math.atan2(prev.y - c.y, prev.x - c.x);
      let da = Math.atan2(p.y - c.y, p.x - c.x) - a0;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      for (let s = 1; s <= per; s += 1) {
        const a = a0 + (da * s) / per;
        out.push(s === per ? p : { x: c.x + c.r * Math.cos(a), y: c.y + c.r * Math.sin(a) });
      }
      prev = p;
    }
  }
  return out;
}

// ---- counts: textbook data solved by inclusion-exclusion ---------------------------------

export type Solved = {
  /** The exclusive count of each inner region, by mask (index 0 is unused). */
  region: (number | undefined)[];
  /** Outside every circle, when the total was given. */
  none: number | undefined;
};

function isCount(x: unknown): x is number {
  return typeof x === "number" && Number.isInteger(x) && x >= 0;
}

function keyMask(raw: string, names: readonly string[], path: string): { mask: number } | { none: true } | { total: true } | { union: number } {
  let s = raw.replace(/\s+/g, "");
  const wrapped = /^(?:n\((.*)\)|\|(.*)\|)$/.exec(s);
  if (wrapped !== null) s = wrapped[1] ?? wrapped[2] ?? "";
  const low = s.toLowerCase();
  if (["total", "u", "universo", "universe"].includes(low)) return { total: true };
  if (["none", "nenhum", "fora", "∅", "outside"].includes(low)) return { none: true };
  const union = s.includes("∪");
  const parts = s.split(union ? "∪" : /[∩&∧]|inter/);
  let mask = 0;
  for (const part of parts) {
    const i = names.indexOf(part);
    if (i < 0) {
      throw new SpecError(`${path}: ${JSON.stringify(raw)} names ${JSON.stringify(part)}, which is not one of the sets (${names.join(", ")}); keys are total, ${names.join(", ")}, ${names.length === 2 ? `${names[0]}∩${names[1]}` : `${names[0]}∩${names[1]}, ${names[0]}∩${names[2]}, ${names[1]}∩${names[2]}, ${names.join("∩")}`}`);
    }
    mask |= 1 << i;
  }
  return union ? { union: mask } : { mask };
}

/**
 * Solve every region from the counts. Two forms:
 *
 *  - `{ regions: { A: 33, "A∩B": 12, B: 18, none: 37 } }` -- the EXCLUSIVE count of each
 *    region (keyed by the sets it is in; `none` for outside), optionally with `total`;
 *  - the textbook data `{ total: 100, A: 45, B: 30, "A∩B": 12 }` -- cardinalities of the
 *    sets and of their intersections, solved by inclusion-exclusion:
 *    exact(S) = sum over T ⊇ S of (−1)^(|T|−|S|) |∩T|. `A∪B∪…` may stand in for the last
 *    intersection, and `total` is optional (without it nothing is printed outside).
 */
export function solveCounts(counts: Record<string, unknown>, names: readonly string[], path = "venn.counts"): Solved {
  const n = names.length;
  const full = (1 << n) - 1;
  const region: (number | undefined)[] = new Array(1 << n).fill(undefined);
  const check = (mask: number | "none", value: number): void => {
    if (value < 0) {
      const what = mask === "none" ? "outside every set" : describeRegion(mask, names);
      throw new SpecError(`${path}: inconsistent data -- the region "${what}" comes out as ${value} (a count cannot be negative); the cardinalities given do not fit together`);
    }
  };
  let total: number | undefined;
  let none: number | undefined;

  if (counts.regions !== undefined) {
    const regs = v.object(counts.regions, `${path}.regions`);
    for (const [k, val] of Object.entries(regs)) {
      if (!isCount(val)) throw new SpecError(`${path}.regions.${k} must be a whole number >= 0, got ${JSON.stringify(val)}`);
      const key = keyMask(k, names, `${path}.regions`);
      if ("none" in key) none = val;
      else if ("mask" in key) region[key.mask] = val;
      else throw new SpecError(`${path}.regions.${k}: a region is keyed by the sets it is in (A, A∩B, none), not ${JSON.stringify(k)}`);
    }
    for (const k of Object.keys(counts)) {
      if (k === "regions") continue;
      const key = keyMask(k, names, path);
      if (!("total" in key)) throw new SpecError(`${path}.${k}: next to \`regions\` only \`total\` is allowed`);
      if (!isCount(counts[k])) throw new SpecError(`${path}.${k} must be a whole number >= 0, got ${JSON.stringify(counts[k])}`);
      total = counts[k] as number;
    }
    const missing: string[] = [];
    for (let m = 1; m <= full; m += 1) if (region[m] === undefined) missing.push(maskText(m, names));
    if (missing.length > 0) throw new SpecError(`${path}.regions is missing ${missing.join(", ")}: give the count of every region (0 where it is empty)`);
    const sum = region.reduce<number>((s, x) => s + (x ?? 0), 0);
    if (total !== undefined) {
      if (none === undefined) {
        none = total - sum;
        check("none", none);
      } else if (none + sum !== total) {
        throw new SpecError(`${path}: total ${total} is not the sum of the regions (${sum + none})`);
      }
    }
    return { region, none };
  }

  const card: (number | undefined)[] = new Array(1 << n).fill(undefined);
  let unionAll: number | undefined;
  for (const [k, val] of Object.entries(counts)) {
    if (!isCount(val)) throw new SpecError(`${path}.${k} must be a whole number >= 0, got ${JSON.stringify(val)}`);
    const key = keyMask(k, names, path);
    if ("total" in key) total = val;
    else if ("none" in key) none = val;
    else if ("union" in key) {
      if (key.union !== full) throw new SpecError(`${path}.${k}: only the union of ALL the sets (${names.join("∪")}) is understood`);
      unionAll = val;
    } else if (card[key.mask] !== undefined && card[key.mask] !== val) throw new SpecError(`${path}.${k}: given twice with different values`);
    else card[key.mask] = val;
  }
  if (total === undefined && none !== undefined && unionAll !== undefined) total = none + unionAll;
  const need: number[] = [];
  for (let m = 1; m < full; m += 1) if (card[m] === undefined) need.push(m);
  if (need.length > 0) throw new SpecError(`${path} needs ${need.map((m) => `|${maskText(m, names)}|`).join(", ")} (with the data form every set and every intersection of fewer than all the sets is required)`);
  // |∩ all| from the union when it is not given directly: |∪| = Σ_{T≠∅} (−1)^(|T|+1) |∩T|.
  if (card[full] === undefined) {
    if (unionAll === undefined) throw new SpecError(`${path} needs |${names.join("∩")}| or |${names.join("∪")}|`);
    let partial = 0;
    for (let m = 1; m < full; m += 1) partial += (popcount(m) % 2 === 1 ? 1 : -1) * card[m]!;
    const sign = n % 2 === 1 ? 1 : -1;
    card[full] = sign * (unionAll - partial);
    if (card[full]! < 0) {
      throw new SpecError(`${path}: inconsistent data -- |${names.join("∩")}| comes out as ${card[full]} from |${names.join("∪")}| = ${unionAll}`);
    }
  }
  for (let m = 1; m <= full; m += 1) {
    let s = 0;
    for (let t = m; t <= full; t += 1) {
      if ((t & m) !== m) continue;
      s += ((popcount(t) - popcount(m)) % 2 === 0 ? 1 : -1) * card[t]!;
    }
    check(m, s);
    region[m] = s;
  }
  const sum = region.reduce<number>((s, x) => s + (x ?? 0), 0);
  if (unionAll !== undefined && unionAll !== sum) throw new SpecError(`${path}: |${names.join("∪")}| = ${unionAll} disagrees with the other data (${sum})`);
  if (total !== undefined) {
    const out = total - sum;
    check("none", out);
    if (none !== undefined && none !== out) throw new SpecError(`${path}: "none" = ${none} disagrees with total − union = ${out}`);
    none = out;
  }
  return { region, none };
}

// ---- elements -----------------------------------------------------------------------------

export function solveElements(
  elements: Record<string, unknown>,
  names: readonly string[],
  universe: string,
  locale: Locale,
  path = "venn.elements",
): { region: string[][]; none: string[] | undefined } {
  const n = names.length;
  const text = (x: unknown, at: string): string => {
    if (typeof x === "number" && Number.isFinite(x)) return formatNumber(x, locale);
    if (typeof x === "string" && x.trim() !== "") return x;
    throw new SpecError(`${at} must be a number or a non-empty string, got ${JSON.stringify(x)}`);
  };
  for (const k of Object.keys(elements)) {
    if (!names.includes(k) && k !== universe && k !== "U") throw new SpecError(`${path}.${k} is not one of the sets (${names.join(", ")}) or the universe (${universe})`);
  }
  const lists = names.map((name) => {
    const raw = elements[name];
    if (raw === undefined) return [] as string[];
    if (!Array.isArray(raw)) throw new SpecError(`${path}.${name} must be an array of elements`);
    return raw.map((e, i) => text(e, `${path}.${name}[${i}]`));
  });
  const uRaw = elements[universe] ?? elements.U;
  const uList = uRaw === undefined ? undefined : (Array.isArray(uRaw) ? uRaw : (() => { throw new SpecError(`${path}.${universe} must be an array of elements`); })()).map((e, i) => text(e, `${path}.${universe}[${i}]`));
  lists.forEach((l, i) => {
    if (new Set(l).size !== l.length) throw new SpecError(`${path}.${names[i]} lists an element twice`);
  });
  const all: string[] = [];
  for (const l of [...(uList === undefined ? [] : [uList]), ...lists]) for (const e of l) if (!all.includes(e)) all.push(e);
  if (uList !== undefined) {
    lists.forEach((l, i) => {
      const stray = l.filter((e) => !uList.includes(e));
      if (stray.length > 0) throw new SpecError(`${path}.${names[i]} has ${stray.join(", ")}, which the universe ${universe} does not contain`);
    });
  }
  const region: string[][] = Array.from({ length: 1 << n }, () => []);
  const none: string[] = [];
  for (const e of all) {
    let mask = 0;
    lists.forEach((l, i) => {
      if (l.includes(e)) mask |= 1 << i;
    });
    if (mask === 0) none.push(e);
    else region[mask]!.push(e);
  }
  return { region, none: uList === undefined ? undefined : none };
}

// ---- validation ----------------------------------------------------------------------------

const KEYS = ["preset", "title", "locale", "sets", "universe", "shade", "counts", "elements"];

export function validateVennInput(raw: Record<string, unknown>): void {
  const path = "venn";
  for (const k of Object.keys(raw)) {
    if (!KEYS.includes(k)) throw new SpecError(`${path}.${k} is not a field of venn (${KEYS.filter((x) => x !== "preset").join(", ")})`);
  }
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  v.optionalString(raw, "universe", path);
  v.optionalString(raw, "shade", path);
  const sets = v.array(raw, "sets", path, "set names (two or three)");
  if (sets.length < 2 || sets.length > 3) throw new SpecError(`${path}.sets must name two or three sets, got ${sets.length}`);
  sets.forEach((s, i) => {
    if (typeof s !== "string" || !/^[\p{L}][\p{L}\p{N}_]*$/u.test(s)) throw new SpecError(`${path}.sets[${i}] must be a name of letters and digits (A, B, Jornal), got ${JSON.stringify(s)}`);
  });
  if (new Set(sets).size !== sets.length) throw new SpecError(`${path}.sets has a repeated name`);
  const universe = typeof raw.universe === "string" ? raw.universe : "U";
  for (const s of sets as string[]) if (isReservedSetName(s, universe)) throw new SpecError(`${path}.sets: ${JSON.stringify(s)} is reserved (the universe, an operator word)`);
  if (raw.counts !== undefined && raw.elements !== undefined) throw new SpecError(`${path}: give \`counts\` or \`elements\`, not both -- a region prints one or the other`);
  if (raw.counts !== undefined) v.object(raw.counts, `${path}.counts`);
  if (raw.elements !== undefined) v.object(raw.elements, `${path}.elements`);
  // The arithmetic, the expression and the placement are exercised by building the figure.
  expandVenn(raw as unknown as VennInput);
}

// ---- placement of text inside a region ---------------------------------------------------------

type Frame = { left: number; right: number; top: number; bottom: number }; // y-up rectangle of the universe

/** Does the padded box lie inside `mask`'s region: no outline crosses it and its centre is in the mask? */
function boxClear(circles: readonly Circle[], cx: number, cy: number, hw: number, hh: number): boolean {
  const x0 = cx - hw;
  const x1 = cx + hw;
  const y0 = cy - hh;
  const y1 = cy + hh;
  for (const c of circles) {
    const nx = Math.min(Math.max(c.x, x0), x1);
    const ny = Math.min(Math.max(c.y, y0), y1);
    const dmin = Math.hypot(nx - c.x, ny - c.y);
    const dmax = Math.hypot(Math.max(Math.abs(x0 - c.x), Math.abs(x1 - c.x)), Math.max(Math.abs(y0 - c.y), Math.abs(y1 - c.y)));
    if (dmin <= c.r && c.r <= dmax) return false;
  }
  return true;
}

/** The distance from a point to the nearest circle outline. */
function clearance(circles: readonly Circle[], x: number, y: number): number {
  let m = Infinity;
  for (const c of circles) m = Math.min(m, Math.abs(Math.hypot(x - c.x, y - c.y) - c.r));
  return m;
}

/**
 * A sampled pole of inaccessibility: the point of region `mask` furthest from
 * every outline at which a w x h box crosses none. Outside every circle the
 * universe's edges count too, the box keeps off text already claimed, and the
 * corner opposite the universe's name is preferred among the roomy spots.
 */
export function findSpot(
  circles: readonly Circle[],
  mask: number,
  w: number,
  h: number,
  frame: Frame,
  blocked: (x: number, y: number, hw: number, hh: number) => boolean,
): { x: number; y: number; clear: number } | null {
  const hw = w / 2 + FIT_PAD;
  const hh = h / 2 + FIT_PAD;
  let best: { x: number; y: number; clear: number; score: number } | null = null;
  const step = 2;
  for (let x = frame.left; x <= frame.right; x += step) {
    for (let y = frame.bottom; y <= frame.top; y += step) {
      if (maskAt(circles, x, y) !== mask) continue;
      if (!boxClear(circles, x, y, hw, hh)) continue;
      if (x - hw < frame.left + 6 || x + hw > frame.right - 6 || y - hh < frame.bottom + 6 || y + hh > frame.top - 6) continue;
      if (blocked(x, y, hw, hh)) continue;
      let clear = clearance(circles, x, y);
      let score = clear;
      if (mask === 0) {
        clear = Math.min(clear, x - frame.left, frame.right - x, y - frame.bottom, frame.top - y);
        score = Math.min(clear, 40) * 1000 - Math.hypot(frame.right - x, y - frame.bottom);
      }
      if (best === null || score > best.score) best = { x, y, clear, score };
    }
  }
  return best === null ? null : { x: best.x, y: best.y, clear: best.clear };
}

/** Rows of an element list: as few lines as fit, balanced, commas kept at the line ends. */
function elementRows(items: readonly string[], lines: number): string {
  const per = Math.ceil(items.length / lines);
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += per) rows.push(items.slice(i, i + per).join(", "));
  return rows.map((r, i) => (i < rows.length - 1 ? `${r},` : r)).join("\n");
}

// ---- the figure ------------------------------------------------------------------------------------

export type VennModel = {
  names: string[];
  universe: string;
  circles: Circle[];
  /** Mask -> is it shaded (index 0 is the outside). */
  shaded: boolean[];
  shadeText: string | undefined;
  solved: Solved | undefined;
  elems: { region: string[][]; none: string[] | undefined } | undefined;
};

export function buildVennModel(input: VennInput): VennModel {
  const path = "venn";
  const names = input.sets;
  const universe = input.universe ?? "U";
  const n = names.length as 2 | 3;
  const locale = input.locale ?? "pt-BR";
  const solved = input.counts === undefined ? undefined : solveCounts(input.counts, names, `${path}.counts`);
  const elems = input.elements === undefined ? undefined : solveElements(input.elements, names, universe, locale, `${path}.elements`);
  const r = elems !== undefined ? 128 : 100;
  const circles = vennCircles(n, r);
  const shaded: boolean[] = new Array(1 << n).fill(false);
  let shadeText: string | undefined;
  if (input.shade !== undefined) {
    const expr: SetExpr = parseSetExpr(input.shade, names, universe, `${path}.shade`);
    shadeText = printSetExpr(expr, names, universe);
    for (let m = 0; m < 1 << n; m += 1) shaded[m] = evalSetExpr(expr, names.map((_, i) => (m & (1 << i)) !== 0));
  }
  return { names, universe, circles, shaded, shadeText, solved, elems };
}

const idOf = (names: readonly string[], mask: number): string => (mask === 0 ? "universe" : `region-${names.filter((_, i) => (mask & (1 << i)) !== 0).join("-")}`);

export function expandVenn(input: VennInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const model = buildVennModel(input);
  const { names, universe, circles, shaded, solved, elems } = model;
  const n = names.length;

  // ---- the frame: the universe rectangle around the circles, in the y-up frame ----
  const ymax = Math.max(...circles.map((c) => c.y + c.r));
  const ymin = Math.min(...circles.map((c) => c.y - c.r));
  const xmax = Math.max(...circles.map((c) => c.x + c.r));
  const xmin = Math.min(...circles.map((c) => c.x - c.r));
  const frame: Frame = { left: xmin - PAD_X, right: xmax + PAD_X, top: ymax + PAD_TOP, bottom: ymin - PAD_BOTTOM };
  const rectW = frame.right - frame.left;
  const rectH = frame.top - frame.bottom;

  // ---- the caption under the rectangle ----
  const inShade = (m: number): boolean => shaded[m] === true;
  let caption: string | undefined;
  if (model.shadeText !== undefined) {
    if (solved !== undefined) {
      const unknown = shaded[0] === true && solved.none === undefined;
      if (!unknown) {
        let sum = 0;
        for (let m = 0; m < 1 << n; m += 1) if (inShade(m)) sum += m === 0 ? solved.none! : solved.region[m]!;
        caption = `n(${model.shadeText}) = ${formatNumber(sum, locale)}`;
      } else caption = `sombreado: ${model.shadeText}`;
    } else if (elems !== undefined) {
      const list: string[] = [];
      for (let m = 0; m < 1 << n; m += 1) if (inShade(m)) list.push(...(m === 0 ? (elems.none ?? []) : elems.region[m]!));
      caption = list.length <= 12 ? `${model.shadeText} = {${list.join(", ")}}` : `sombreado: ${model.shadeText}`;
      if (list.length === 0) caption = `${model.shadeText} = ∅`;
    } else caption = `sombreado: ${model.shadeText}`;
  }
  const probe = new Board(10, 10, PAPER);
  const capW = caption === undefined ? 0 : probe.extent(caption, { size: CAPTION_SIZE }).w;
  const W = Math.ceil(Math.max(rectW, capW) + 2 * MARGIN);
  const captionH = caption === undefined ? 0 : 44;
  const H = Math.ceil(rectH + 2 * MARGIN + captionH);
  const board = new Board(W, H, PAPER);
  const ox = W / 2 - (frame.left + frame.right) / 2;
  const oy = MARGIN + frame.top;
  const X = (x: number): number => ox + x;
  const Y = (y: number): number => oy - y;
  const P = (p: Pt): Point => ({ x: X(p.x), y: Y(p.y) });

  // ---- the fills, first, with no stroke ----
  const arcs = circleArcs(circles);
  const outsideShaded = shaded[0] === true;
  const rectPts: Point[] = [
    { x: X(frame.left), y: Y(frame.top) },
    { x: X(frame.right), y: Y(frame.top) },
    { x: X(frame.right), y: Y(frame.bottom) },
    { x: X(frame.left), y: Y(frame.bottom) },
  ];
  board.poly(rectPts, { stroke: "none", width: 0, fill: outsideShaded ? SHADE : PAPER, close: true, id: "universe-fill" });
  const regionIds: (string | undefined)[] = new Array(1 << n).fill(undefined);
  for (let m = 1; m < 1 << n; m += 1) {
    const loops = regionLoops(circles, arcs, m);
    loops.forEach((loop, li) => {
      const id = li === 0 ? idOf(names, m) : `${idOf(names, m)}-${li + 1}`;
      if (li === 0) regionIds[m] = id;
      const segments: MarkSegment[] = [];
      for (const run of loop) for (const p of run.pts) segments.push({ arc: P(p), centre: P(circles[run.circle]!) });
      const mark: Mark = {
        id,
        from: P(loop[0]!.start),
        segments,
        close: true,
        fill: shaded[m] === true ? SHADE : PAPER,
        stroke: "none",
        strokeWidth: 0,
      };
      board.marks.push(mark);
    });
  }

  // ---- the outlines on top: the universe, then each circle from the SAME arcs ----
  board.poly(rectPts, { stroke: INK, width: RECT_W, fill: "none", close: true, id: "universe" });
  circles.forEach((c, i) => {
    const mine = arcs.filter((a) => a.circle === i);
    const segments: MarkSegment[] = [];
    const trace: Point[] = [P(mine[0]!.from)];
    for (const arc of mine) {
      for (const p of arcWaypoints(circles, arc)) segments.push({ arc: P(p), centre: P(c) });
    }
    for (const p of loopPolygon(circles, mine.map((a) => ({ start: a.from, pts: arcWaypoints(circles, a), circle: i })), 12)) trace.push(P(p));
    board.trace(trace, INK, CIRCLE_W, `set-${names[i]}`);
    board.marks.push({
      id: `set-${names[i]}`,
      from: P(mine[0]!.from),
      segments,
      close: true,
      fill: "none",
      stroke: INK,
      strokeWidth: CIRCLE_W,
    });
  });

  // ---- text: the universe's name, the set names, then what each region holds ----
  board.label(universe, X(frame.left) + 20, Y(frame.top) + 20, { size: 19, colour: INK, weight: 700, serif: true, annotates: "universe", id: "universe-name" });
  const centroid = { x: circles.reduce((s, c) => s + c.x, 0) / n, y: circles.reduce((s, c) => s + c.y, 0) / n };
  circles.forEach((c, i) => {
    let dx = c.x - centroid.x;
    let dy = c.y - centroid.y;
    if (n === 2) {
      dx = dx < 0 ? -0.75 : 0.75;
      dy = 0.66; // up and out: beside the circle, clear of the overlap
    }
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;
    const ax = X(c.x + (c.r + 14) * dx);
    const ay = Y(c.y + (c.r + 14) * dy);
    const dirs: Point[] = [
      { x: dx, y: -dy },
      { x: dx, y: -dy - 0.6 },
      { x: dx * 0.5, y: -0.9 },
    ];
    board.place(names[i]!, ax, ay, dirs, { size: 21, colour: INK, weight: 700, serif: true, annotates: `set-${names[i]}`, id: `name-${names[i]}`, steps: 14 });
  });

  const blocked = (x: number, y: number, hw: number, hh: number): boolean => {
    const b = board.box(X(x), Y(y), hw * 2, hh * 2);
    return board.taken.some((t) => board.hits(b, t, 1));
  };
  const put = (mask: number, text: string, sizes: number[]): void => {
    for (const size of sizes) {
      const ext = board.extent(text, { size });
      const spot = findSpot(circles, mask, ext.w, ext.h, frame, blocked);
      if (spot === null) continue;
      const id = mask === 0 ? "count-outside" : `count-${idOf(names, mask).slice("region-".length)}`;
      const opts = { size, colour: INK, weight: 600, id, width: ext.w };
      if (mask === 0) board.label(text, X(spot.x), Y(spot.y), { ...opts, annotatesPlace: { x: X(spot.x), y: Y(spot.y) } });
      else board.label(text, X(spot.x), Y(spot.y), { ...opts, annotates: regionIds[mask]! });
      return;
    }
    throw new SpecError(`venn: the region "${describeRegion(mask, names)}" is too small to hold ${JSON.stringify(text)}; use fewer elements or shorter names`);
  };
  if (solved !== undefined) {
    for (let m = 0; m < 1 << n; m += 1) {
      const val = m === 0 ? solved.none : solved.region[m];
      if (val === undefined) continue;
      put(m, formatNumber(val, locale), COUNT_SIZES);
    }
  }
  if (elems !== undefined) {
    for (let m = 0; m < 1 << n; m += 1) {
      const items = m === 0 ? elems.none : elems.region[m];
      if (items === undefined || items.length === 0) continue;
      let done = false;
      // Prefer the largest type, then the fewest lines.
      outer: for (const size of ELEMENT_SIZES) {
        for (let lines = 1; lines <= Math.min(items.length, 8); lines += 1) {
          const text = elementRows(items, lines);
          const ext = board.extent(text, { size });
          const spot = findSpot(circles, m, ext.w, ext.h, frame, blocked);
          if (spot === null) continue;
          const id = m === 0 ? "elements-outside" : `elements-${idOf(names, m).slice("region-".length)}`;
          const opts = { size, colour: INK, weight: 400, id, width: ext.w };
          if (m === 0) board.label(text, X(spot.x), Y(spot.y), { ...opts, annotatesPlace: { x: X(spot.x), y: Y(spot.y) } });
          else board.label(text, X(spot.x), Y(spot.y), { ...opts, annotates: regionIds[m]! });
          done = true;
          break outer;
        }
      }
      if (!done) throw new SpecError(`venn: the elements of the region "${describeRegion(m, names)}" (${items.join(", ")}) do not fit in it; the circles are fixed in size, so list fewer or write shorter ones`);
    }
  }

  if (caption !== undefined) {
    board.label(caption, W / 2, MARGIN + rectH + 26, { size: CAPTION_SIZE, colour: SOFT, freeStanding: true, id: "caption" });
  }

  const title = input.title ?? `diagrama de Venn (${names.join(", ")})`;
  const spec = board.spec(title);
  return parseSpec(spec);
}
