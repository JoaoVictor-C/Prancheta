import { test } from "node:test";
import assert from "node:assert/strict";
import { containsPoint, hexagonVertices, shapeVertices, stadiumRadius, SHAPE_KINDS } from "../src/geometry/shapes.ts";
import type { Rect } from "../src/ir/types.ts";

const box: Rect = { x: 0, y: 0, width: 100, height: 60 };
const centre = { x: 50, y: 30 };
const corner = { x: 0, y: 0 };

// --- rect --------------------------------------------------------------------

test("rect: centre and every corner are inside", () => {
  assert.equal(containsPoint("rect", box, centre), true);
  assert.equal(containsPoint("rect", box, corner), true);
  assert.equal(containsPoint("rect", box, { x: 100, y: 60 }), true);
});

test("rect: a point outside the box is outside", () => {
  assert.equal(containsPoint("rect", box, { x: 150, y: 30 }), false);
});

// --- circle vs ellipse: the real distinction ----------------------------------

test("circle is inscribed at the SHORTER dimension, leaving the long-axis corners outside", () => {
  // 100x60 box: circle radius is 30 (half the shorter side), centred at (50,30).
  // A box corner (0,0) is sqrt(50^2+30^2) ~= 58.3 from centre -- well outside r=30.
  assert.equal(containsPoint("circle", box, corner), false);
  assert.equal(containsPoint("circle", box, centre), true);
});

test("ellipse hugs the full box, so a corner is still outside but closer to the boundary than circle", () => {
  // Ellipse rx=50, ry=30: corner (0,0) normalized is (1,1), distance^2 = 2 > 1 -> outside.
  assert.equal(containsPoint("ellipse", box, corner), false);
  // A point just inside the ellipse boundary along the major axis must be inside.
  assert.equal(containsPoint("ellipse", box, { x: 10, y: 30 }), true);
});

test("ellipse's edge midpoints (touching the box) are inside; circle's are not, on the long axis", () => {
  const rightEdgeMid = { x: 100, y: 30 }; // on the ellipse boundary exactly
  assert.equal(containsPoint("ellipse", box, rightEdgeMid), true);
  assert.equal(containsPoint("circle", box, rightEdgeMid), false); // circle radius is only 30
});

// --- diamond -------------------------------------------------------------------

test("diamond: centre is inside, box corners are outside", () => {
  assert.equal(containsPoint("diamond", box, centre), true);
  assert.equal(containsPoint("diamond", box, corner), false);
});

test("diamond: the midpoint of each edge of the bounding box is a vertex, on the boundary", () => {
  assert.equal(containsPoint("diamond", box, { x: 50, y: 0 }), true); // top-mid vertex
  assert.equal(containsPoint("diamond", box, { x: 0, y: 30 }), true); // left-mid vertex
});

// --- hexagon -------------------------------------------------------------------

test("hexagon: centre is inside, box corners (cut off) are outside", () => {
  assert.equal(containsPoint("hexagon", box, centre), true);
  assert.equal(containsPoint("hexagon", box, corner), false);
});

test("hexagonVertices returns exactly six points forming the expected flat-top shape", () => {
  const vertices = hexagonVertices(box);
  assert.equal(vertices.length, 6);
  // Left-most and right-most vertices sit at the vertical centre.
  const leftmost = vertices.reduce((a, b) => (a.x < b.x ? a : b));
  const rightmost = vertices.reduce((a, b) => (a.x > b.x ? a : b));
  assert.equal(leftmost.x, box.x);
  assert.equal(rightmost.x, box.x + box.width);
  assert.equal(leftmost.y, box.y + box.height / 2);
});

test("hexagon: a point just inside the vertical sides (not near a corner cut) is inside", () => {
  assert.equal(containsPoint("hexagon", box, { x: 50, y: 5 }), true);
});

// --- stadium ---------------------------------------------------------------------

test("stadium: horizontal box gets rounded left/right ends", () => {
  // 100x60 box, horizontal (width > height): radius = 30.
  assert.equal(stadiumRadius(box), 30);
  assert.equal(containsPoint("stadium", box, centre), true);
  // The flat top-middle is a straight rectangle edge -> inside.
  assert.equal(containsPoint("stadium", box, { x: 50, y: 0 }), true);
  // A box corner falls in the rounded-cap region and outside the circle there.
  assert.equal(containsPoint("stadium", box, corner), false);
});

test("stadium: a vertical box gets rounded top/bottom ends instead", () => {
  const tall: Rect = { x: 0, y: 0, width: 60, height: 100 };
  assert.equal(containsPoint("stadium", tall, { x: 0, y: 50 }), true); // flat side edge
  assert.equal(containsPoint("stadium", tall, { x: 0, y: 0 }), false); // rounded corner
});

test("every SHAPE_KINDS entry is handled without throwing", () => {
  for (const shape of SHAPE_KINDS) {
    assert.doesNotThrow(() => containsPoint(shape, box, centre));
  }
});

test("a degenerate zero-size box never contains a point, for any shape", () => {
  const zero: Rect = { x: 10, y: 10, width: 0, height: 0 };
  for (const shape of SHAPE_KINDS) {
    assert.equal(containsPoint(shape, zero, { x: 10, y: 10 }), shape === "rect");
  }
});

// ---------------------------------------------------------------------------
// The symbol shapes added alongside style packs. Every one is a polygon, and
// deliberately so: the SAME vertex list is handed to `inPolygon` for
// containment and to the `<polygon>` element for drawing, so the check answers
// about the shape actually on the page rather than an approximation of it.
// ---------------------------------------------------------------------------

const SYMBOLS = ["parallelogram", "trapezoid", "chevron", "cross", "star", "note"] as const;

test("every symbol shape is drawable as a polygon, so drawing and containment cannot diverge", () => {
  for (const shape of SYMBOLS) {
    const vertices = shapeVertices(shape, box);
    assert.ok(vertices !== null, `${shape} has no vertices, so svg.ts would throw on it`);
    assert.ok(vertices!.length >= 3, `${shape} has too few vertices to be a polygon`);
    for (const vertex of vertices!) {
      assert.ok(
        vertex.x >= box.x - 0.001 &&
          vertex.x <= box.x + box.width + 0.001 &&
          vertex.y >= box.y - 0.001 &&
          vertex.y <= box.y + box.height + 0.001,
        `${shape} puts a vertex outside its own bounding box, which every check assumes it fills`,
      );
    }
  }
});

test("every symbol contains its own centre", () => {
  for (const shape of SYMBOLS) {
    assert.ok(containsPoint(shape, box, centre), `${shape} does not contain its own centre`);
  }
});

test("cross is genuinely concave: all four box corners fall outside it", () => {
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x, y: box.y + box.height },
    { x: box.x + box.width, y: box.y + box.height },
  ];
  for (const corner of corners) {
    assert.equal(containsPoint("cross", box, corner), false);
  }
  // ...but the arm midpoints are inside, which a convex hull would also claim.
  // The distinguishing point is the notch: inset from a corner along both axes,
  // still outside. A convex approximation would wrongly say "in" here.
  assert.equal(
    containsPoint("cross", box, { x: box.x + box.width / 6, y: box.y + box.height / 6 }),
    false,
  );
});

test("chevron's notch is outside it — the property that lets a row interlock", () => {
  // The tail notch bites in from the left edge at the vertical midpoint.
  const midY = box.y + box.height / 2;
  assert.equal(containsPoint("chevron", box, { x: box.x + 1, y: midY }), false);
  // ...while the same x at the top edge is inside, since the notch is a wedge.
  assert.equal(containsPoint("chevron", box, { x: box.x + 1, y: box.y + 1 }), true);
});

test("star holds far less than its bounding box, so it is a marker and not a container", () => {
  // Sampled the same way the generated reference samples it.
  let inside = 0;
  let total = 0;
  for (let i = 0; i < 60; i += 1) {
    for (let j = 0; j < 60; j += 1) {
      const point = {
        x: box.x + ((i + 0.5) / 60) * box.width,
        y: box.y + ((j + 0.5) / 60) * box.height,
      };
      total += 1;
      if (containsPoint("star", box, point)) inside += 1;
    }
  }
  const fraction = inside / total;
  assert.ok(fraction > 0.2 && fraction < 0.35, `star covers ${fraction} of its box`);
});
