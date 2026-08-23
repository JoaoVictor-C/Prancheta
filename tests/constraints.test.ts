/**
 * Tests for constraint vocabulary (M10, stage 6, step 31).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { isConstraintSatisfied } from "../src/constraints/types.ts";
import type { Constraint } from "../src/constraints/types.ts";

const makeBox = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

test("align constraint: left edges aligned", () => {
  const boxes = new Map([
    ["a", makeBox(100, 0, 50, 30)],
    ["b", makeBox(100, 50, 50, 30)],
    ["c", makeBox(100, 100, 50, 30)],
  ]);

  const constraint: Constraint = {
    kind: "align",
    elements: ["a", "b", "c"],
    axis: "left",
  };

  assert.ok(isConstraintSatisfied(constraint, boxes), "left edges should be aligned");
});

test("align constraint: misaligned left edges fail", () => {
  const boxes = new Map([
    ["a", makeBox(100, 0, 50, 30)],
    ["b", makeBox(110, 50, 50, 30)], // 10px off
    ["c", makeBox(100, 100, 50, 30)],
  ]);

  const constraint: Constraint = {
    kind: "align",
    elements: ["a", "b", "c"],
    axis: "left",
  };

  assert.ok(!isConstraintSatisfied(constraint, boxes), "misaligned edges should fail");
});

test("align constraint: center-x aligned", () => {
  const boxes = new Map([
    ["a", makeBox(100, 0, 40, 30)], // center-x = 120
    ["b", makeBox(110, 50, 20, 30)], // center-x = 120
    ["c", makeBox(95, 100, 50, 30)], // center-x = 120
  ]);

  const constraint: Constraint = {
    kind: "align",
    elements: ["a", "b", "c"],
    axis: "center-x",
  };

  assert.ok(isConstraintSatisfied(constraint, boxes), "centers should be aligned");
});

test("distribute constraint: equal spacing", () => {
  const boxes = new Map([
    ["a", makeBox(0, 0, 50, 30)],
    ["b", makeBox(70, 0, 50, 30)], // 20px gap
    ["c", makeBox(140, 0, 50, 30)], // 20px gap
  ]);

  const constraint: Constraint = {
    kind: "distribute",
    elements: ["a", "b", "c"],
    axis: "horizontal",
  };

  assert.ok(isConstraintSatisfied(constraint, boxes), "equal spacing should be satisfied");
});

test("distribute constraint: unequal spacing fails", () => {
  const boxes = new Map([
    ["a", makeBox(0, 0, 50, 30)],
    ["b", makeBox(70, 0, 50, 30)], // 20px gap
    ["c", makeBox(150, 0, 50, 30)], // 30px gap (different!)
  ]);

  const constraint: Constraint = {
    kind: "distribute",
    elements: ["a", "b", "c"],
    axis: "horizontal",
  };

  assert.ok(!isConstraintSatisfied(constraint, boxes), "unequal spacing should fail");
});

test("distribute constraint: fixed spacing", () => {
  const boxes = new Map([
    ["a", makeBox(0, 0, 50, 30)],
    ["b", makeBox(80, 0, 50, 30)], // 30px gap
    ["c", makeBox(160, 0, 50, 30)], // 30px gap
  ]);

  const constraint: Constraint = {
    kind: "distribute",
    elements: ["a", "b", "c"],
    axis: "horizontal",
    spacing: 30,
  };

  assert.ok(isConstraintSatisfied(constraint, boxes), "fixed spacing should be satisfied");
});

test("keepClear constraint: sufficient clearance", () => {
  const boxes = new Map([
    ["a", makeBox(0, 0, 50, 30)],
    ["b", makeBox(80, 0, 50, 30)], // 30px apart
  ]);

  const constraint: Constraint = {
    kind: "keepClear",
    element1: "a",
    element2: "b",
    minDistance: 20,
  };

  assert.ok(isConstraintSatisfied(constraint, boxes), "sufficient clearance should be satisfied");
});

test("keepClear constraint: insufficient clearance fails", () => {
  const boxes = new Map([
    ["a", makeBox(0, 0, 50, 30)],
    ["b", makeBox(60, 0, 50, 30)], // 10px apart
  ]);

  const constraint: Constraint = {
    kind: "keepClear",
    element1: "a",
    element2: "b",
    minDistance: 20,
  };

  assert.ok(!isConstraintSatisfied(constraint, boxes), "insufficient clearance should fail");
});

test("sameSize constraint: same width", () => {
  const boxes = new Map([
    ["a", makeBox(0, 0, 100, 30)],
    ["b", makeBox(0, 50, 100, 40)], // different height, same width
    ["c", makeBox(0, 100, 100, 50)],
  ]);

  const constraint: Constraint = {
    kind: "sameSize",
    elements: ["a", "b", "c"],
    dimension: "width",
  };

  assert.ok(isConstraintSatisfied(constraint, boxes), "same width should be satisfied");
});

test("sameSize constraint: different widths fail", () => {
  const boxes = new Map([
    ["a", makeBox(0, 0, 100, 30)],
    ["b", makeBox(0, 50, 110, 30)], // different width
    ["c", makeBox(0, 100, 100, 30)],
  ]);

  const constraint: Constraint = {
    kind: "sameSize",
    elements: ["a", "b", "c"],
    dimension: "width",
  };

  assert.ok(!isConstraintSatisfied(constraint, boxes), "different widths should fail");
});

test("sameSize constraint: both dimensions", () => {
  const boxes = new Map([
    ["a", makeBox(0, 0, 100, 50)],
    ["b", makeBox(0, 60, 100, 50)],
    ["c", makeBox(0, 120, 100, 50)],
  ]);

  const constraint: Constraint = {
    kind: "sameSize",
    elements: ["a", "b", "c"],
    dimension: "both",
  };

  assert.ok(isConstraintSatisfied(constraint, boxes), "both dimensions same should be satisfied");
});

test("anchor constraint: absolute position", () => {
  const boxes = new Map([["logo", makeBox(20, 30, 50, 40)]]);

  const constraint: Constraint = {
    kind: "anchor",
    element: "logo",
    position: { x: 20, y: 30 },
  };

  assert.ok(isConstraintSatisfied(constraint, boxes), "absolute anchor should be satisfied");
});

test("anchor constraint: relative position below", () => {
  const boxes = new Map([
    ["title", makeBox(0, 0, 100, 30)],
    ["subtitle", makeBox(0, 40, 100, 20)], // 10px below title
  ]);

  const constraint: Constraint = {
    kind: "anchor",
    element: "subtitle",
    relativeTo: {
      target: "title",
      relation: "below",
      offset: 10,
    },
  };

  assert.ok(isConstraintSatisfied(constraint, boxes), "relative anchor below should be satisfied");
});

test("anchor constraint: wrong relative position fails", () => {
  const boxes = new Map([
    ["title", makeBox(0, 0, 100, 30)],
    ["subtitle", makeBox(0, 50, 100, 20)], // 20px below, not 10px
  ]);

  const constraint: Constraint = {
    kind: "anchor",
    element: "subtitle",
    relativeTo: {
      target: "title",
      relation: "below",
      offset: 10,
    },
  };

  assert.ok(!isConstraintSatisfied(constraint, boxes), "wrong relative position should fail");
});

test("constraints with missing elements are not-applicable (always satisfied)", () => {
  const boxes = new Map([["a", makeBox(0, 0, 50, 30)]]);

  const alignConstraint: Constraint = {
    kind: "align",
    elements: ["a", "nonexistent"],
    axis: "left",
  };

  const keepClearConstraint: Constraint = {
    kind: "keepClear",
    element1: "a",
    element2: "nonexistent",
    minDistance: 10,
  };

  assert.ok(
    isConstraintSatisfied(alignConstraint, boxes),
    "constraint with missing element should be not-applicable"
  );
  assert.ok(
    isConstraintSatisfied(keepClearConstraint, boxes),
    "keepClear with missing element should be not-applicable"
  );
});
