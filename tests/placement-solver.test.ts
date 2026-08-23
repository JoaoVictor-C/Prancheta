/**
 * Tests for placement solver (M10, stage 6, step 32).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPlacementSolution,
  detectViolations,
  adjustPositions,
  computePotential,
} from "../src/layout/solver.ts";
import type { Constraint } from "../src/constraints/types.ts";

test("detectViolations finds overlapping boxes", () => {
  const positions = new Map([
    ["a", { x: 0, y: 0 }],
    ["b", { x: 40, y: 0 }], // Overlaps with a
  ]);
  const sizes = new Map([
    ["a", { width: 50, height: 30 }],
    ["b", { width: 50, height: 30 }],
  ]);

  const solution = createPlacementSolution(positions, sizes);
  const violations = detectViolations(solution);

  assert.strictEqual(violations.length, 1, "should detect one overlap");
  assert.strictEqual(violations[0]?.kind, "overlap");
  if (violations[0]?.kind === "overlap") {
    assert.ok(violations[0].area > 0, "overlap area should be positive");
  }
});

test("detectViolations finds no violations for non-overlapping boxes", () => {
  const positions = new Map([
    ["a", { x: 0, y: 0 }],
    ["b", { x: 60, y: 0 }], // Clear of a
  ]);
  const sizes = new Map([
    ["a", { width: 50, height: 30 }],
    ["b", { width: 50, height: 30 }],
  ]);

  const solution = createPlacementSolution(positions, sizes);
  const violations = detectViolations(solution);

  assert.strictEqual(violations.length, 0, "should detect no violations");
});

test("detectViolations finds constraint violations", () => {
  const positions = new Map([
    ["a", { x: 0, y: 0 }],
    ["b", { x: 0, y: 50 }], // Not aligned with a
  ]);
  const sizes = new Map([
    ["a", { width: 50, height: 30 }],
    ["b", { width: 50, height: 30 }],
  ]);

  const constraint: Constraint = {
    kind: "align",
    elements: ["a", "b"],
    axis: "left",
  };

  const solution = createPlacementSolution(positions, sizes, [constraint]);
  // Modify positions to violate constraint
  solution.positions.set("b", { x: 10, y: 50 });

  const violations = detectViolations(solution);

  const constraintViolations = violations.filter((v) => v.kind === "constraint");
  assert.strictEqual(constraintViolations.length, 1, "should detect constraint violation");
});

test("adjustPositions moves boxes to resolve overlaps", () => {
  const positions = new Map([
    ["a", { x: 0, y: 0 }],
    ["b", { x: 40, y: 0 }], // Overlaps with a
  ]);
  const sizes = new Map([
    ["a", { width: 50, height: 30 }],
    ["b", { width: 50, height: 30 }],
  ]);

  const solution = createPlacementSolution(positions, sizes);
  const violations = detectViolations(solution);

  const result = adjustPositions(solution, violations);

  assert.ok(result.moved.has("b"), "element b should be moved");
  const newPosB = result.positions.get("b");
  assert.ok(newPosB && newPosB.x > 50, "b should be moved to the right");
});

test("adjustPositions respects movement budgets", () => {
  const positions = new Map([
    ["a", { x: 0, y: 0 }],
    ["b", { x: 40, y: 0 }], // Overlaps with a
  ]);
  const sizes = new Map([
    ["a", { width: 50, height: 30 }],
    ["b", { width: 50, height: 30 }],
  ]);

  const solution = createPlacementSolution(positions, sizes);
  solution.budgets.set("b", 5); // Very small budget

  const violations = detectViolations(solution);
  const result = adjustPositions(solution, violations);

  // With small budget, b should not move (displacement would exceed budget)
  const newPosB = result.positions.get("b");
  assert.strictEqual(newPosB?.x, 40, "b should not move when budget is insufficient");
});

test("computePotential calculates overlap area, constraint violations, and displacement", () => {
  const positions = new Map([
    ["a", { x: 0, y: 0 }],
    ["b", { x: 40, y: 0 }],
  ]);
  const sizes = new Map([
    ["a", { width: 50, height: 30 }],
    ["b", { width: 50, height: 30 }],
  ]);

  const solution = createPlacementSolution(positions, sizes);
  const violations = detectViolations(solution);
  const initialPositions = new Map(positions);

  const potential = computePotential(solution, violations, initialPositions);

  assert.strictEqual(potential.length, 3, "potential should be a 3-tuple");
  assert.ok(potential[0] > 0, "overlap area should be positive");
  assert.strictEqual(potential[1], 0, "no constraint violations");
  assert.strictEqual(potential[2], 0, "no displacement yet");
});

test("computePotential shows displacement after movement", () => {
  const positions = new Map([
    ["a", { x: 0, y: 0 }],
    ["b", { x: 40, y: 0 }],
  ]);
  const sizes = new Map([
    ["a", { width: 50, height: 30 }],
    ["b", { width: 50, height: 30 }],
  ]);

  const solution = createPlacementSolution(positions, sizes);
  const initialPositions = new Map(positions);

  // Move b
  solution.positions.set("b", { x: 100, y: 0 });

  const violations = detectViolations(solution);
  const potential = computePotential(solution, violations, initialPositions);

  assert.strictEqual(potential[0], 0, "no overlap after movement");
  assert.ok(potential[2] > 0, "displacement should be positive after movement");
});

test("createPlacementSolution initializes budgets for all elements", () => {
  const positions = new Map([
    ["a", { x: 0, y: 0 }],
    ["b", { x: 50, y: 0 }],
  ]);
  const sizes = new Map([
    ["a", { width: 50, height: 30 }],
    ["b", { width: 50, height: 30 }],
  ]);

  const solution = createPlacementSolution(positions, sizes, [], 150);

  assert.strictEqual(solution.budgets.get("a"), 150, "element a should have budget");
  assert.strictEqual(solution.budgets.get("b"), 150, "element b should have budget");
});
