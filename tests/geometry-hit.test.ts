import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidatesBeside,
  distanceToPolyline,
  distanceToSegment,
  distanceToSegmentXY,
  pointInPolygon,
  pointToRect,
  rectAt,
  rectToPolyline,
  rectsMeet,
  segmentHitsRect,
} from "../src/geometry/hit.ts";

const P = (x: number, y: number) => ({ x, y });
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test("distanceToSegment: perpendicular, beyond an end, and a degenerate segment", () => {
  near(distanceToSegment(P(5, 3), P(0, 0), P(10, 0)), 3);
  near(distanceToSegment(P(-4, 3), P(0, 0), P(10, 0)), 5);
  near(distanceToSegment(P(13, 4), P(0, 0), P(10, 0)), 5);
  near(distanceToSegment(P(3, 4), P(0, 0), P(0, 0)), 5);
  near(distanceToSegmentXY(5, 3, 0, 0, 10, 0), 3);
});

test("distanceToPolyline: open, closed, one point, none", () => {
  const square = [P(0, 0), P(10, 0), P(10, 10), P(0, 10)];
  // open: the edge back to the start is not there, so the left side is 5 away from the nearest end
  near(distanceToPolyline(P(-3, 5), square), Math.hypot(3, 5));
  // closed: the left side is an edge
  near(distanceToPolyline(P(-3, 5), square, true), 3);
  near(distanceToPolyline(P(3, 4), [P(0, 0)]), 5);
  assert.equal(distanceToPolyline(P(0, 0), []), Infinity);
});

test("pointToRect: zero inside and on the edge, corner distance outside", () => {
  const r = { x: 0, y: 0, width: 10, height: 4 };
  assert.equal(pointToRect(P(5, 2), r), 0);
  assert.equal(pointToRect(P(10, 4), r), 0);
  near(pointToRect(P(13, 8), r), 5);
  near(pointToRect(P(5, -6), r), 6);
});

test("segmentHitsRect: through, touching, missing, and axis-parallel", () => {
  const r = { x: 0, y: 0, width: 10, height: 10 };
  assert.equal(segmentHitsRect(P(-5, 5), P(15, 5), r), true);
  assert.equal(segmentHitsRect(P(-5, -5), P(15, 15), r), true);
  assert.equal(segmentHitsRect(P(-5, 11), P(15, 11), r), false);
  assert.equal(segmentHitsRect(P(11, -5), P(11, 15), r), false);
  assert.equal(segmentHitsRect(P(2, 2), P(3, 3), r), true, "a segment wholly inside");
  assert.equal(segmentHitsRect(P(-5, -1), P(-1, -5), r), false);
});

test("rectToPolyline: 0 when a stretch passes through, else the nearest approach", () => {
  const r = { x: 0, y: 0, width: 10, height: 10 };
  assert.equal(rectToPolyline(r, [P(-5, 5), P(15, 5)]), 0);
  near(rectToPolyline(r, [P(13, -1), P(13, 20)]), 3);
  near(rectToPolyline(r, [P(13, 14)]), 5);
  near(rectToPolyline(r, [P(-3, 12), P(-3, 30)]), Math.hypot(3, 2));
  assert.equal(rectToPolyline(r, []), Infinity);
});

test("rectsMeet: overlap grown by pad, touching is not meeting", () => {
  const a = { x: 0, y: 0, width: 10, height: 10 };
  assert.equal(rectsMeet(a, { x: 5, y: 5, width: 10, height: 10 }), true);
  assert.equal(rectsMeet(a, { x: 10, y: 0, width: 5, height: 5 }), false);
  assert.equal(rectsMeet(a, { x: 10, y: 0, width: 5, height: 5 }, 1), true);
  assert.equal(rectsMeet(a, { x: 12, y: 0, width: 5, height: 5 }, 1), false);
});

test("rectAt centres a box on a point", () => {
  assert.deepEqual(rectAt(P(10, 20), 4, 6), { x: 8, y: 17, width: 4, height: 6 });
});

test("pointInPolygon: inside, outside, concave", () => {
  const square = [P(0, 0), P(10, 0), P(10, 10), P(0, 10)];
  assert.equal(pointInPolygon(P(5, 5), square), true);
  assert.equal(pointInPolygon(P(15, 5), square), false);
  const ell = [P(0, 0), P(10, 0), P(10, 4), P(4, 4), P(4, 10), P(0, 10)];
  assert.equal(pointInPolygon(P(2, 8), ell), true);
  assert.equal(pointInPolygon(P(8, 8), ell), false);
});

test("candidatesBeside: both sides, every fraction, every extra distance; the preferred side first", () => {
  const out = candidatesBeside(P(0, 0), P(100, 0), 20, 10, [0.25, 0.75], { gap: 5, extras: [0, 5, 10] });
  assert.equal(out.length, 2 * 2 * 3);
  // the run is horizontal, its normal (−dy, dx) = (0, 1): +1 is below in canvas y
  near(out[0]!.x, 25);
  near(out[0]!.y, 10 / 2 + 5);
  near(out[1]!.y, -(10 / 2 + 5));
  const flipped = candidatesBeside(P(0, 0), P(100, 0), 20, 10, [0.25], { gap: 5, extras: [0], side: -1 });
  near(flipped[0]!.y, -(10 / 2 + 5));
  // a zero-length run does not divide by zero
  assert.ok(candidatesBeside(P(3, 3), P(3, 3), 20, 10, [0.5], { gap: 5, extras: [0] }).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
});
