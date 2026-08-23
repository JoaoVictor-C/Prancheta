/**
 * Tests for grouping, nesting, and container transforms (M10, stage 6, step 37).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyTransform,
  transformToSvg,
  groupBounds,
  isInsideClipBounds,
  flattenGroups,
  createGroup,
} from "../src/layout/grouping.ts";
import type { Transform, Group } from "../src/layout/grouping.ts";

test("applyTransform applies translation", () => {
  const point = { x: 10, y: 20 };
  const transform: Transform = { translate: { x: 5, y: 10 } };

  const result = applyTransform(point, transform);

  assert.strictEqual(result.x, 15);
  assert.strictEqual(result.y, 30);
});

test("applyTransform applies uniform scale", () => {
  const point = { x: 10, y: 20 };
  const transform: Transform = { scale: 2 };

  const result = applyTransform(point, transform);

  assert.strictEqual(result.x, 20);
  assert.strictEqual(result.y, 40);
});

test("applyTransform applies non-uniform scale", () => {
  const point = { x: 10, y: 20 };
  const transform: Transform = { scale: { x: 2, y: 0.5 } };

  const result = applyTransform(point, transform);

  assert.strictEqual(result.x, 20);
  assert.strictEqual(result.y, 10);
});

test("applyTransform applies rotation", () => {
  const point = { x: 10, y: 0 };
  const transform: Transform = { rotate: 90 };

  const result = applyTransform(point, transform);

  assert.ok(Math.abs(result.x) < 0.0001, "x should be ~0 after 90° rotation");
  assert.ok(Math.abs(result.y - 10) < 0.0001, "y should be ~10 after 90° rotation");
});

test("applyTransform combines multiple transformations", () => {
  const point = { x: 10, y: 0 };
  const transform: Transform = {
    translate: { x: 5, y: 5 },
    rotate: 90,
    scale: 2,
  };

  const result = applyTransform(point, transform);

  assert.ok(result.x !== 10 && result.y !== 0, "point should be transformed");
});

test("transformToSvg generates translation string", () => {
  const transform: Transform = { translate: { x: 10, y: 20 } };

  const svg = transformToSvg(transform);

  assert.strictEqual(svg, "translate(10, 20)");
});

test("transformToSvg generates rotation string", () => {
  const transform: Transform = { rotate: 45 };

  const svg = transformToSvg(transform);

  assert.ok(svg.includes("rotate(45"), "should include rotation");
});

test("transformToSvg generates scale string", () => {
  const transform: Transform = { scale: 2 };

  const svg = transformToSvg(transform);

  assert.strictEqual(svg, "scale(2)");
});

test("transformToSvg generates non-uniform scale string", () => {
  const transform: Transform = { scale: { x: 2, y: 0.5 } };

  const svg = transformToSvg(transform);

  assert.strictEqual(svg, "scale(2, 0.5)");
});

test("transformToSvg combines multiple transforms", () => {
  const transform: Transform = {
    translate: { x: 10, y: 20 },
    rotate: 45,
    scale: 2,
  };

  const svg = transformToSvg(transform);

  assert.ok(svg.includes("translate"), "should include translate");
  assert.ok(svg.includes("rotate"), "should include rotate");
  assert.ok(svg.includes("scale"), "should include scale");
});

test("groupBounds computes bounding box of group", () => {
  const elementPositions = new Map([
    ["a", { x: 0, y: 0, width: 50, height: 30 }],
    ["b", { x: 60, y: 0, width: 50, height: 30 }],
    ["c", { x: 30, y: 40, width: 50, height: 30 }],
  ]);

  const bounds = groupBounds(elementPositions, ["a", "b", "c"]);

  assert.strictEqual(bounds.x, 0, "left edge should be 0");
  assert.strictEqual(bounds.y, 0, "top edge should be 0");
  assert.strictEqual(bounds.width, 110, "width should span all elements");
  assert.strictEqual(bounds.height, 70, "height should span all elements");
});

test("isInsideClipBounds checks if point is inside", () => {
  const clipBounds = { x: 10, y: 10, width: 50, height: 50 };

  assert.ok(isInsideClipBounds({ x: 30, y: 30 }, clipBounds), "point inside should return true");
  assert.ok(!isInsideClipBounds({ x: 5, y: 5 }, clipBounds), "point outside should return false");
  assert.ok(!isInsideClipBounds({ x: 70, y: 70 }, clipBounds), "point outside should return false");
});

test("flattenGroups flattens nested group hierarchy", () => {
  const groups = new Map<string, Group>([
    [
      "root",
      {
        id: "root",
        children: ["child1", "nested"],
        transform: { translate: { x: 10, y: 10 } },
      },
    ],
    [
      "nested",
      {
        id: "nested",
        children: ["child2", "child3"],
        transform: { scale: 2 },
      },
    ],
  ]);

  const flattened = flattenGroups(groups, "root");

  assert.ok(flattened.length >= 2, "should include leaf elements");
  assert.ok(flattened.some((f) => f.elementId === "child1"), "should include child1");
  assert.ok(flattened.some((f) => f.elementId === "child2"), "should include nested child2");
});

test("createGroup generates unique group id", () => {
  const group1 = createGroup(["a", "b"]);
  const group2 = createGroup(["c", "d"]);

  assert.notStrictEqual(group1.id, group2.id, "group ids should be unique");
});

test("createGroup sets children and transform", () => {
  const transform: Transform = { translate: { x: 10, y: 10 } };
  const group = createGroup(["a", "b", "c"], transform);

  assert.deepStrictEqual(group.children, ["a", "b", "c"]);
  assert.deepStrictEqual(group.transform, transform);
});

test("createGroup sets clip bounds when provided", () => {
  const clipBounds = { x: 0, y: 0, width: 100, height: 100 };
  const group = createGroup(["a", "b"], undefined, clipBounds);

  assert.deepStrictEqual(group.clipBounds, clipBounds);
});
