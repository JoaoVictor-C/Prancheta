/**
 * Tests for math typesetting (M8, stage 5, step 28).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMath, renderMathGroup } from "../src/math/mathjax.ts";

test("renderMath returns SVG with measured box", async () => {
  const result = await renderMath({
    latex: "E = mc^2",
    id: "einstein",
    x: 100,
    y: 50,
  });

  assert.ok(result.svg.includes('data-pr-id="einstein"'), "svg should include id");
  assert.ok(result.svg.includes("E = mc^2"), "svg should include latex");
  assert.strictEqual(result.box.x, 100, "box x should match node x");
  assert.strictEqual(result.box.y, 50, "box y should match node y");
  assert.ok(result.box.width > 0, "box should have positive width");
  assert.ok(result.box.height > 0, "box should have positive height");
  assert.ok(result.baseline > 0, "baseline should be positive");
});

test("renderMath respects fontSize option", async () => {
  const small = await renderMath({
    latex: "x",
    id: "small",
    x: 0,
    y: 0,
    fontSize: 12,
  });

  const large = await renderMath({
    latex: "x",
    id: "large",
    x: 0,
    y: 0,
    fontSize: 24,
  });

  assert.ok(large.box.height > small.box.height, "larger fontSize should produce larger box");
});

test("renderMath respects color option", async () => {
  const result = await renderMath({
    latex: "y = mx + b",
    id: "colored",
    x: 0,
    y: 0,
    color: "#FF0000",
  });

  assert.ok(result.svg.includes("#FF0000"), "svg should include specified color");
});

test("renderMathGroup renders multiple nodes", async () => {
  const nodes = [
    { latex: "a", id: "a", x: 0, y: 0 },
    { latex: "b", id: "b", x: 50, y: 0 },
    { latex: "c", id: "c", x: 100, y: 0 },
  ];

  const result = await renderMathGroup(nodes);

  assert.ok(result.svg.includes('data-pr-id="a"'), "should include first node");
  assert.ok(result.svg.includes('data-pr-id="b"'), "should include second node");
  assert.ok(result.svg.includes('data-pr-id="c"'), "should include third node");
  assert.strictEqual(result.boxes.size, 3, "should return boxes for all nodes");
  assert.ok(result.boxes.has("a"), "boxes should have entry for node a");
  assert.ok(result.boxes.has("b"), "boxes should have entry for node b");
  assert.ok(result.boxes.has("c"), "boxes should have entry for node c");
});

test("renderMath escapes XML special characters in latex", async () => {
  const result = await renderMath({
    latex: "a < b & c > d",
    id: "escaped",
    x: 0,
    y: 0,
  });

  assert.ok(result.svg.includes("&lt;"), "< should be escaped");
  assert.ok(result.svg.includes("&gt;"), "> should be escaped");
  assert.ok(result.svg.includes("&amp;"), "& should be escaped");
});
