import { test } from "node:test";
import assert from "node:assert/strict";
import { containsPoint, hexagonVertices, stadiumRadius, SHAPE_KINDS } from "../src/geometry/shapes.ts";
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
