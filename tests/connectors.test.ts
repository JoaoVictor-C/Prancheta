import { test } from "node:test";
import assert from "node:assert/strict";
import {
  curveRoute,
  liftCurve,
  polylineIntersectsBox,
  routeBetweenBoxes,
  routeSelfLoop,
  routeToPoint,
  trimRoute,
} from "../src/layout/connectors.ts";
import type { PlacedBox, Point } from "../src/ir/types.ts";

function box(overrides: Partial<PlacedBox> = {}): PlacedBox {
  return {
    kind: "box",
    id: "box-1",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fill: "#fff",
    stroke: "#000",
    strokeWidth: 1,
    radius: 0,
    content: { x: 5, y: 5, width: 90, height: 90 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// polylineIntersectsBox
// ---------------------------------------------------------------------------

test("polylineIntersectsBox is true for a segment that crosses the box", () => {
  const target = box({ id: "box-1", x: 40, y: 40, width: 20, height: 20 }); // 40..60
  const points: Point[] = [
    { x: 0, y: 50 },
    { x: 100, y: 50 },
  ];
  assert.equal(polylineIntersectsBox(points, target), true);
});

test("polylineIntersectsBox is false for a segment passing outside the box", () => {
  const target = box({ id: "box-1", x: 40, y: 40, width: 20, height: 20 });
  const points: Point[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];
  assert.equal(polylineIntersectsBox(points, target), false);
});

test("polylineIntersectsBox does not count a segment that only touches the border (epsilon)", () => {
  const target = box({ id: "box-1", x: 40, y: 40, width: 20, height: 20 }); // left edge at x=40
  // Segment runs vertically exactly along the box's left border.
  const points: Point[] = [
    { x: 40, y: 30 },
    { x: 40, y: 70 },
  ];
  assert.equal(polylineIntersectsBox(points, target), false);
});

// ---------------------------------------------------------------------------
// routeBetweenBoxes
// ---------------------------------------------------------------------------

test("routeBetweenBoxes returns two points, both outside either box, roughly on the centre-to-centre line", () => {
  const from = box({ id: "a", x: 0, y: 0, width: 100, height: 100 }); // centre (50,50)
  const to = box({ id: "b", x: 300, y: 0, width: 100, height: 100 }); // centre (350,50)

  const [start, end] = routeBetweenBoxes(from, to);
  assert.ok(start && end);

  const insideFrom = start!.x > from.x && start!.x < from.x + from.width;
  const insideTo = end!.x > to.x && end!.x < to.x + to.width;
  assert.equal(insideFrom, false, "start point should not lie inside the 'from' box");
  assert.equal(insideTo, false, "end point should not lie inside the 'to' box");

  // Both points should lie on the horizontal centre line since the boxes are
  // aligned on y, i.e. roughly on the line between the two centres.
  assert.ok(Math.abs(start!.y - 50) < 0.01);
  assert.ok(Math.abs(end!.y - 50) < 0.01);
  assert.ok(start!.x > from.x + from.width / 2, "start should be pushed toward 'to'");
  assert.ok(end!.x < to.x + to.width / 2, "end should be pushed toward 'from'");
});

// ---------------------------------------------------------------------------
// routeToPoint
// ---------------------------------------------------------------------------

test("routeToPoint's second point is exactly the target", () => {
  const from = box({ id: "a", x: 0, y: 0, width: 100, height: 100 });
  const target: Point = { x: 500, y: 500 };
  const route = routeToPoint(from, target);
  assert.equal(route.length, 2);
  assert.deepEqual(route[1], target);
});

// ---------------------------------------------------------------------------
// trimRoute
// ---------------------------------------------------------------------------

test("trimRoute preserves point count and pulls both ends toward the interior of the line", () => {
  const from = box({ id: "a", x: 0, y: 0, width: 40, height: 40 });
  const to = box({ id: "b", x: 200, y: 0, width: 40, height: 40 });
  const points: Point[] = [
    { x: 20, y: 20 },
    { x: 100, y: 20 },
    { x: 220, y: 20 },
  ];

  const trimmed = trimRoute(points, from, to);
  assert.equal(trimmed.length, points.length);

  // First point should have moved toward points[1] (x increased, still 20 y).
  assert.ok(trimmed[0]!.x > points[0]!.x);
  assert.ok(trimmed[0]!.x < points[1]!.x);

  // Last point should have moved toward points[1] (x decreased).
  const lastIndex = trimmed.length - 1;
  assert.ok(trimmed[lastIndex]!.x < points[lastIndex]!.x);
  assert.ok(trimmed[lastIndex]!.x > points[1]!.x);

  // Middle point untouched.
  assert.deepEqual(trimmed[1], points[1]);
});

test("trimRoute with a null 'to' leaves the last point untouched", () => {
  const from = box({ id: "a", x: 0, y: 0, width: 40, height: 40 });
  const points: Point[] = [
    { x: 20, y: 20 },
    { x: 220, y: 20 },
  ];
  const trimmed = trimRoute(points, from, null);
  assert.equal(trimmed.length, 2);
  assert.ok(trimmed[0]!.x > points[0]!.x);
  assert.deepEqual(trimmed[1], points[1]);
});

// ---------------------------------------------------------------------------
// routeSelfLoop
// ---------------------------------------------------------------------------

test("a box joined to itself gets a route with real length, not a stub", () => {
  // routeBetweenBoxes on one box clips both ends from the same centre against
  // the same border, collapsing to a point: an invisible connector that every
  // check passes because there is no ink anywhere to be wrong.
  const self = box({ x: 100, y: 100, width: 80, height: 40 });
  const collapsed = routeBetweenBoxes(self, self);
  assert.equal(collapsed[0]!.x, collapsed[1]!.x);
  assert.equal(collapsed[0]!.y, collapsed[1]!.y);

  const loop = routeSelfLoop(self);
  const length = loop
    .slice(1)
    .reduce((total, p, i) => total + Math.hypot(p.x - loop[i]!.x, p.y - loop[i]!.y), 0);
  assert.ok(length > 50, `self-loop was only ${length}px long`);
});

test("a self-loop leaves and re-enters the box it belongs to, and clears it", () => {
  const self = box({ x: 100, y: 100, width: 80, height: 40 });
  const loop = routeSelfLoop(self);

  // Both ends sit over the box's own top edge, so it reads as belonging to it.
  for (const end of [loop[0]!, loop[loop.length - 1]!]) {
    assert.ok(end.x > self.x && end.x < self.x + self.width, `end at x=${end.x} is not over the box`);
    assert.ok(end.y <= self.y, `end at y=${end.y} is inside the box`);
  }
  // And nothing in between dips back into it -- a loop drawn through its own
  // label would be worse than one that is not drawn.
  assert.equal(polylineIntersectsBox(loop, self), false);
});

test("a self-loop is straight runs, so it needs no curve toggle to exist", () => {
  // The loop is a route, not a `curve`. Curving it by default would smuggle in
  // exactly the curvature allowCurvedConnectors exists to gate.
  const loop = routeSelfLoop(box({ x: 0, y: 200, width: 100, height: 50 }));
  for (let i = 0; i < loop.length - 1; i += 1) {
    const a = loop[i]!;
    const b = loop[i + 1]!;
    assert.ok(a.x === b.x || a.y === b.y, `segment ${i} is neither horizontal nor vertical`);
  }
});

// ---------------------------------------------------------------------------
// liftCurve
// ---------------------------------------------------------------------------

test("a bezier's control points are lifted into page space with its route", () => {
  // The route was already lifted out of scene coordinates; a control point
  // left behind bends the curve towards the wrong place by exactly the scene
  // origin -- invisible at the origin, wrong by the padding everywhere else.
  const lifted = liftCurve({ kind: "bezier", control: [{ x: 40, y: 10 }] }, { x: 26, y: 26 });
  assert.deepEqual(lifted, { kind: "bezier", control: [{ x: 66, y: 36 }] });
});

test("arc and spline are derived from the route, so lifting leaves them alone", () => {
  const origin = { x: 26, y: 26 };
  assert.deepEqual(liftCurve({ kind: "arc", bulge: 0.3 }, origin), { kind: "arc", bulge: 0.3 });
  assert.deepEqual(liftCurve({ kind: "spline" }, origin), { kind: "spline" });
});

test("a scene at the page origin lifts to the identical curve", () => {
  const curve = { kind: "bezier", control: [{ x: 40, y: 10 }] } as const;
  assert.equal(liftCurve(curve, { x: 0, y: 0 }), curve);
});

// ---------------------------------------------------------------------------
// spline radius
// ---------------------------------------------------------------------------

test("a spline's radius decides how far back from the corner it turns", () => {
  const corner: Point[] = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }];
  const tight = curveRoute(corner, { kind: "spline", radius: 4 });
  const loose = curveRoute(corner, { kind: "spline", radius: 60 });

  // Straightness up to the fillet is the measurable difference: a tight radius
  // stays exactly on the run for longer.
  const leavesRunAt = (route: Point[]) =>
    Math.min(...route.filter((p) => Math.abs(p.y) > 0.001).map((p) => p.x));
  assert.ok(
    leavesRunAt(tight) > leavesRunAt(loose),
    `tight left the run at ${leavesRunAt(tight)}, loose at ${leavesRunAt(loose)}`,
  );
});

test("a radius larger than the run it sits on is clamped, not overrun", () => {
  // The clamp is what stops two corners on a short segment cutting into each
  // other. A radius of 500 on 40px runs must still stay inside the elbow.
  const route = curveRoute(
    [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }],
    { kind: "spline", radius: 500 },
  );
  assert.deepEqual(route[0], { x: 0, y: 0 });
  assert.deepEqual(route[route.length - 1], { x: 40, y: 40 });
  for (const p of route) {
    assert.ok(p.x <= 40.001 && p.y <= 40.001, `overshot the elbow at ${JSON.stringify(p)}`);
    assert.ok(p.x >= -0.001 && p.y >= -0.001, `backed out of the elbow at ${JSON.stringify(p)}`);
  }
});
