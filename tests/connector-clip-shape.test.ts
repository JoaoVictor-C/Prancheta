import { test } from "node:test";
import assert from "node:assert/strict";
import { routeToPoint } from "../src/layout/connectors.ts";
import type { PlacedBox, Point } from "../src/ir/types.ts";
import { connector as connectorTheme } from "../src/theme.ts";
import { containsPoint } from "../src/geometry/shapes.ts";

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

/**
 * What the OLD (pre-fix) `clipToBox` would have produced: the ray from
 * `box`'s centre toward `target`, clipped to the axis-aligned rectangle
 * `width x height + 2*gap`. Reconstructed here (not imported) so the tests
 * below can compare the new shape-aware clip against the bounding-box clip
 * it replaces, on the exact same ray.
 */
function oldRectClip(box: PlacedBox, target: Point): Point {
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const dx = target.x - centre.x;
  const dy = target.y - centre.y;
  const halfW = box.width / 2 + connectorTheme.gap;
  const halfH = box.height / 2 + connectorTheme.gap;
  const scale = Math.min(
    dx === 0 ? Infinity : halfW / Math.abs(dx),
    dy === 0 ? Infinity : halfH / Math.abs(dy),
  );
  return { x: centre.x + dx * scale, y: centre.y + dy * scale };
}

// ---------------------------------------------------------------------------
// M0.3: clipToBox must clip against the drawn shape, not its bounding box.
// ---------------------------------------------------------------------------

test("a connector aimed at a triangle stops on the triangle's edge, not its bounding box", () => {
  // Triangle inscribed apex-up in a 100x100 box at (0,0). Aim toward the
  // box's bottom-left corner region -- inside the AABB, well outside the
  // triangle -- where the bounding-box clip and the true edge diverge sharply.
  const target = box({ x: 0, y: 0, width: 100, height: 100, shape: "triangle" });
  const centre = { x: 50, y: 50 };
  const farTarget: Point = { x: -400, y: 300 }; // direction of the bottom-left corner, far out

  const [endpoint] = routeToPoint(target, farTarget);
  const oldEndpoint = oldRectClip(target, farTarget);

  const newDist = Math.hypot(endpoint!.x - centre.x, endpoint!.y - centre.y);
  const oldDist = Math.hypot(oldEndpoint.x - centre.x, oldEndpoint.y - centre.y);
  assert.ok(
    newDist < oldDist,
    `new clip (${newDist.toFixed(2)}px from centre) should be closer than the old bounding-box clip (${oldDist.toFixed(2)}px)`,
  );

  // Pulling the endpoint back toward the centre by a hair more than the gap
  // must land inside the triangle -- confirming it actually sits on the
  // triangle's boundary, not merely somewhere closer to centre than before.
  const dx = farTarget.x - centre.x;
  const dy = farTarget.y - centre.y;
  const length = Math.hypot(dx, dy);
  const unit = { x: dx / length, y: dy / length };
  const pulledBack = {
    x: endpoint!.x - unit.x * (connectorTheme.gap + 0.5),
    y: endpoint!.y - unit.y * (connectorTheme.gap + 0.5),
  };
  assert.ok(
    containsPoint("triangle", target, pulledBack),
    `point just inside the clipped endpoint should be inside the triangle: ${JSON.stringify(pulledBack)}`,
  );
});

test("a rect target (default shape) is clipped to its bounding box exactly as before", () => {
  const target = box({ x: 0, y: 0, width: 100, height: 100 }); // no shape -> default rect

  const [endpoint] = routeToPoint(target, { x: 350, y: 50 });

  const expected: Point = { x: 100 + connectorTheme.gap, y: 50 };
  assert.equal(endpoint!.x, expected.x);
  assert.equal(endpoint!.y, expected.y);
});

test("an explicit shape: 'rect' target is byte-identical to the default rectangular path", () => {
  const implicit = box({ x: 0, y: 0, width: 100, height: 100 });
  const explicit = box({ x: 0, y: 0, width: 100, height: 100, shape: "rect" });
  const target: Point = { x: 400, y: 400 };

  assert.deepEqual(routeToPoint(implicit, target), routeToPoint(explicit, target));
});

test("a stadium target is byte-identical to the rectangular path (not a polygon)", () => {
  // shapeVertices returns null for "stadium" too, so it must stay on the
  // exact same rectangular clip as "rect" -- this is what proves the branch
  // in clipToBox is gated on shapeVertices, not on box.shape being set.
  const rect = box({ x: 0, y: 0, width: 100, height: 40 });
  const stadium = box({ x: 0, y: 0, width: 100, height: 40, shape: "stadium" });
  const target: Point = { x: 500, y: 5 };

  assert.deepEqual(routeToPoint(rect, target), routeToPoint(stadium, target));
});

test("a diamond target is clipped to its own edges, well inside its bounding-box corners", () => {
  // A diamond's bounding-box corners sit far outside the shape itself, so
  // this is the clearest case: aiming toward the box's corner direction must
  // land on the diamond's slanted edge, nowhere near the corner the old
  // rectangular clip would have produced.
  const target = box({ x: 0, y: 0, width: 100, height: 100, shape: "diamond" });
  const centre = { x: 50, y: 50 };
  const cornerDirection: Point = { x: -1000, y: -1000 }; // toward the box's top-left corner

  const [endpoint] = routeToPoint(target, cornerDirection);
  const oldEndpoint = oldRectClip(target, cornerDirection);

  const newDist = Math.hypot(endpoint!.x - centre.x, endpoint!.y - centre.y);
  const oldDist = Math.hypot(oldEndpoint.x - centre.x, oldEndpoint.y - centre.y);
  assert.ok(
    newDist < oldDist,
    `diamond clip (${newDist.toFixed(2)}px) should be closer to centre than the old box-corner clip (${oldDist.toFixed(2)}px)`,
  );

  const dx = cornerDirection.x - centre.x;
  const dy = cornerDirection.y - centre.y;
  const length = Math.hypot(dx, dy);
  const unit = { x: dx / length, y: dy / length };
  const pulledBack = {
    x: endpoint!.x - unit.x * (connectorTheme.gap + 0.5),
    y: endpoint!.y - unit.y * (connectorTheme.gap + 0.5),
  };
  assert.ok(
    containsPoint("diamond", target, pulledBack),
    `point just inside the clipped endpoint should be inside the diamond: ${JSON.stringify(pulledBack)}`,
  );
});
