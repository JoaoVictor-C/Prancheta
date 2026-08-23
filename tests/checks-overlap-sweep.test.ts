/**
 * `boxes-do-not-overlap` resolves every pair by sweeping along x rather than
 * by walking all n(n-1)/2 of them. The sweep is only worth having if it is
 * *indistinguishable* from the pairwise version it replaced, so that is what
 * is tested here: the same failures, naming the same boxes, in the same
 * order, over randomised layouts built to hit the cases that matter.
 *
 * The naive implementation is repeated in this file on purpose. It is the
 * specification; importing the thing under test to check itself would prove
 * nothing.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecks, EPSILON } from "../src/checks.ts";
import type { Check } from "../src/checks.ts";
import type { LaidOutFigure, PlacedBox, Rect } from "../src/ir/types.ts";

function box(id: string, x: number, y: number, width: number, height: number): PlacedBox {
  return {
    kind: "box", id, x, y, width, height,
    fill: "#fff", stroke: "#000", strokeWidth: 0, radius: 0,
    content: { x, y, width, height },
  };
}

// --- the specification: the pairwise version, verbatim ----------------------

function contains(outer: Rect, inner: Rect): boolean {
  return (
    outer.x <= inner.x + EPSILON &&
    outer.y <= inner.y + EPSILON &&
    outer.x + outer.width >= inner.x + inner.width - EPSILON &&
    outer.y + outer.height >= inner.y + inner.height - EPSILON
  );
}

function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width - EPSILON &&
    a.x + a.width > b.x + EPSILON &&
    a.y < b.y + b.height - EPSILON &&
    a.y + a.height > b.y + EPSILON
  );
}

function pairwise(boxes: PlacedBox[]): { target: string; detail: string }[] {
  const out: { target: string; detail: string }[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const ra = { x: a.x, y: a.y, width: a.width, height: a.height };
      const rb = { x: b.x, y: b.y, width: b.width, height: b.height };
      if (!intersects(ra, rb)) continue;
      if (contains(ra, rb) || contains(rb, ra)) continue;
      out.push({ target: a.id, detail: `overlaps ${b.id} without containing it` });
    }
  }
  return out;
}

function sweep(boxes: PlacedBox[]): { target: string; detail: string }[] {
  const figure: LaidOutFigure = {
    width: 4000, height: 4000, background: "#000", elements: boxes,
  };
  return runChecks(figure)
    .filter((c: Check) => c.id === "boxes-do-not-overlap" && c.status === "fail")
    .map((c) => ({ target: c.target, detail: c.detail ?? "" }));
}

// --- randomised layouts -----------------------------------------------------

function makeRandom(seedStart: number) {
  let seed = seedStart;
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

/**
 * Four regimes, because they stress different parts of the sweep: a dense
 * cloud makes the active list long, a sparse one keeps it near empty, shared
 * edges sit exactly on the EPSILON boundary, and the nested case is the one
 * where intersecting is *allowed*.
 */
const REGIMES: { name: string; build: (rand: () => number, n: number) => PlacedBox[] }[] = [
  {
    name: "dense cloud on a small canvas",
    build: (rand, n) =>
      Array.from({ length: n }, (_, i) =>
        box(`b${i}`, Math.round(rand() * 200), Math.round(rand() * 200), 8 + Math.round(rand() * 30), 8 + Math.round(rand() * 30))),
  },
  {
    // A clean lattice can never collide -- that is exactly why the poster
    // generators quantise onto one -- so a minority of marks are knocked off
    // their cell far enough to reach a neighbour. Without them this regime
    // would agree with the specification vacuously.
    name: "sparse marks on a lattice, a few knocked askew",
    build: (rand, n) =>
      Array.from({ length: n }, (_, i) => {
        const askew = () => (rand() < 0.12 ? Math.round((rand() - 0.5) * 16) : 0);
        return box(
          `b${i}`,
          Math.round(rand() * 40) * 14 + askew(),
          Math.round(rand() * 40) * 14 + askew(),
          9, 9,
        );
      }),
  },
  {
    name: "shared and near-shared edges",
    build: (rand, n) =>
      Array.from({ length: n }, (_, i) => {
        const gx = Math.round(rand() * 12) * 20;
        const gy = Math.round(rand() * 12) * 20;
        // Offsets straddling EPSILON in both directions.
        const nudge = [-1, -0.5, -0.25, 0, 0.25, 0.5, 1][Math.floor(rand() * 7)]!;
        return box(`b${i}`, gx + nudge, gy, 20, 20);
      }),
  },
  {
    name: "wide containers over small marks",
    build: (rand, n) =>
      Array.from({ length: n }, (_, i) =>
        (i % 8 === 0
          ? box(`b${i}`, 0, Math.round(rand() * 300), 900, 60 + Math.round(rand() * 200))
          : box(`b${i}`, Math.round(rand() * 880), Math.round(rand() * 480), 7, 7))),
  },
];

for (const regime of REGIMES) {
  test(`the sweep matches the pairwise walk: ${regime.name}`, () => {
    let sawFailure = false;
    for (let trial = 0; trial < 40; trial += 1) {
      const rand = makeRandom(1000 + trial * 7919);
      const boxes = regime.build(rand, 5 + Math.floor(rand() * 90));
      const expected = pairwise(boxes);
      const actual = sweep(boxes);
      if (expected.length > 0) sawFailure = true;
      assert.deepEqual(
        actual,
        expected,
        `trial ${trial} with ${boxes.length} boxes disagreed`,
      );
    }
    // A regime that never produced a collision would agree vacuously.
    assert.ok(sawFailure, "regime produced no overlaps at all, so it proved nothing");
  });
}

test("a pair is reported once, naming the boxes in their own order", () => {
  // `later` is declared first but sits to the right, so the sweep meets it
  // second. The report must still follow declaration order, not sweep order.
  const boxes = [
    box("later", 60, 0, 100, 100),
    box("earlier", 0, 0, 100, 100),
  ];
  const actual = sweep(boxes);
  assert.deepEqual(actual, [
    { target: "later", detail: "overlaps earlier without containing it" },
  ]);
});

test("every pair is accounted for in the passing report", () => {
  const boxes = Array.from({ length: 30 }, (_, i) => box(`b${i}`, i * 40, 0, 20, 20));
  const figure: LaidOutFigure = {
    width: 2000, height: 200, background: "#000", elements: boxes,
  };
  const check = runChecks(figure).find((c) => c.id === "boxes-do-not-overlap");
  assert.equal(check?.status, "pass");
  // 30 disjoint boxes: 435 pairs, all resolved, and the sweep should have
  // needed far fewer explicit tests than that.
  assert.equal(check?.examined, 435);
  assert.match(check?.detail ?? "", /^resolved 435 pair\(s\); \d+ needed an overlap test$/);
  const tested = Number(/; (\d+) needed/.exec(check?.detail ?? "")?.[1]);
  assert.ok(tested < 435, `sweep tested ${tested} pairs, no better than the pairwise walk`);
});
