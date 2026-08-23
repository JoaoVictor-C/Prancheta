/**
 * The flattening tolerance is a guarantee, so it is tested as one.
 *
 * These tests measure the real distance between the sampled polyline and the
 * curve it stands for, by walking the curve densely and asking how far each
 * point is from the nearest segment. That is the quantity the tolerance is
 * about; the number of points it took to get there is not.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { FLATTEN_TOLERANCE, flattenPath } from "../src/geometry/paths.ts";
import type { PathCommand } from "../src/geometry/paths.ts";

type P = { x: number; y: number };

/** Furthest any point of `curve` sits from the polyline `poly`. */
function maxDeviation(curve: (t: number) => P, poly: P[], samples = 4000): number {
  let worst = 0;
  for (let i = 0; i <= samples; i += 1) {
    const p = curve(i / samples);
    let nearest = Infinity;
    for (let j = 0; j < poly.length - 1; j += 1) {
      const a = poly[j]!;
      const b = poly[j + 1]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      const raw = lengthSquared === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
      const t = Math.max(0, Math.min(1, raw));
      nearest = Math.min(nearest, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
    }
    worst = Math.max(worst, nearest);
  }
  return worst;
}

const quadratic = (p0: P, c: P, p2: P) => (t: number): P => ({
  x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * c.x + t * t * p2.x,
  y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * c.y + t * t * p2.y,
});

test("a curve is sampled to within the tolerance whatever size it is drawn at", () => {
  // The defect a fixed segment count has: the same number of segments over a
  // longer curve is a proportionally worse approximation, so a figure drawn
  // large silently stops meeting the bound a figure drawn small met.
  for (const chord of [40, 200, 1000, 4000]) {
    const p0 = { x: 0, y: 0 };
    const p2 = { x: chord, y: 0 };
    const control = { x: chord / 2, y: chord * 0.6 };
    const poly = flattenPath([
      { kind: "M", x: p0.x, y: p0.y },
      { kind: "Q", x1: control.x, y1: control.y, x: p2.x, y: p2.y },
    ]);
    const deviation = maxDeviation(quadratic(p0, control, p2), poly);
    assert.ok(
      deviation <= FLATTEN_TOLERANCE,
      `chord ${chord}: deviated ${deviation.toFixed(4)}px, tolerance ${FLATTEN_TOLERANCE}`,
    );
  }
});

test("the tolerance is well inside the half-pixel every check already tolerates", () => {
  // If it were not, a curve could pass or fail a check on the strength of how
  // it was sampled rather than where it actually goes.
  assert.ok(FLATTEN_TOLERANCE < 0.5 / 5, `tolerance ${FLATTEN_TOLERANCE} is too close to EPSILON`);
});

test("a gentle curve costs fewer points than a hard one", () => {
  // The other half of adaptive sampling: not just enough points where they are
  // needed, but not paying for them where they are not.
  const ends: PathCommand[] = [{ kind: "M", x: 0, y: 0 }];
  const gentle = flattenPath([...ends, { kind: "Q", x1: 100, y1: 10, x: 200, y: 0 }]);
  const hard = flattenPath([...ends, { kind: "Q", x1: 100, y1: 240, x: 200, y: 0 }]);
  assert.ok(
    gentle.length < hard.length,
    `gentle took ${gentle.length} points, hard took ${hard.length}`,
  );
});

test("a straight command is left exact, with no sampling at all", () => {
  const points = flattenPath([
    { kind: "M", x: 10, y: 10 },
    { kind: "L", x: 400, y: 250 },
  ]);
  assert.deepEqual(points, [{ x: 10, y: 10 }, { x: 400, y: 250 }]);
});

test("an arc is sampled to the same tolerance as a bezier", () => {
  // Arcs take a different path through flattenPath -- an angular step derived
  // from the radius rather than recursive subdivision -- so the guarantee has
  // to be shown separately rather than assumed to carry over.
  const radius = 300;
  const poly = flattenPath([
    { kind: "M", x: -radius, y: 0 },
    { kind: "A", rx: radius, ry: radius, rotation: 0, largeArc: false, sweep: true, x: radius, y: 0 },
  ]);
  // A positive sweep turns clockwise on screen, which is upward in y-down
  // coordinates, so the reference semicircle arches over the chord.
  const semicircle = (t: number): P => ({
    x: -radius * Math.cos(t * Math.PI),
    y: -radius * Math.sin(t * Math.PI),
  });
  const deviation = maxDeviation(semicircle, poly);
  assert.ok(
    deviation <= FLATTEN_TOLERANCE,
    `arc deviated ${deviation.toFixed(4)}px, tolerance ${FLATTEN_TOLERANCE}`,
  );
});

test("a coarser tolerance really does buy fewer points", () => {
  const command: PathCommand[] = [
    { kind: "M", x: 0, y: 0 },
    { kind: "C", x1: 0, y1: 200, x2: 300, y2: 200, x: 300, y: 0 },
  ];
  assert.ok(flattenPath(command, 2).length < flattenPath(command, 0.01).length);
});

test("subdivision terminates on a degenerate curve rather than recurring forever", () => {
  // Both controls far from a chord of zero length: the flatness test can never
  // be satisfied by subdividing, so only the depth cap ends it.
  const points = flattenPath([
    { kind: "M", x: 100, y: 100 },
    { kind: "C", x1: 400, y1: 100, x2: 400, y2: 400, x: 100, y: 100 },
  ]);
  assert.ok(points.length > 2, "a loop back to the start should still be drawn");
  assert.ok(points.length < 2000, `bounded, but produced ${points.length} points`);
});
