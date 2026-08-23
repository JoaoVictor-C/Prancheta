/**
 * Tests for translation repair loop (M10, stage 6, step 34).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { repairTranslations, repairBoxPositions } from "../src/layout/repair.ts";
import { createPlacementSolution } from "../src/layout/solver.ts";

test("repairTranslations resolves overlapping boxes", () => {
  const positions = new Map([
    ["a", { x: 0, y: 0 }],
    ["b", { x: 40, y: 0 }], // Overlaps with a
  ]);
  const sizes = new Map([
    ["a", { width: 50, height: 30 }],
    ["b", { width: 50, height: 30 }],
  ]);

  const solution = createPlacementSolution(positions, sizes, [], 100);
  const result = repairTranslations(solution);

  assert.ok(result.moved.has("b"), "element b should be moved");
  assert.strictEqual(result.stopReason, "all_satisfied", "should resolve all violations");
  assert.strictEqual(result.violations.length, 0, "no violations should remain");
});

test("repairTranslations stops when budget is exhausted", () => {
  const positions = new Map([
    ["a", { x: 0, y: 0 }],
    ["b", { x: 40, y: 0 }], // Overlaps with a
  ]);
  const sizes = new Map([
    ["a", { width: 50, height: 30 }],
    ["b", { width: 50, height: 30 }],
  ]);

  const solution = createPlacementSolution(positions, sizes, [], 5); // Very small budget
  const result = repairTranslations(solution);

  assert.ok(
    result.stopReason === "budget_exhausted" || result.stopReason === "no_improvement",
    "should stop when budget is insufficient"
  );
});

test("repairTranslations converges within iteration limit", () => {
  const positions = new Map([
    ["a", { x: 0, y: 0 }],
    ["b", { x: 40, y: 0 }],
  ]);
  const sizes = new Map([
    ["a", { width: 50, height: 30 }],
    ["b", { width: 50, height: 30 }],
  ]);

  const solution = createPlacementSolution(positions, sizes);
  const result = repairTranslations(solution, 50); // Reasonable iteration limit

  assert.ok(result.iterations <= 50, "should not exceed iteration limit");
  assert.notStrictEqual(result.stopReason, "max_iterations", "should converge before max iterations");
});

test("repairTranslations returns immediately when no violations exist", () => {
  const positions = new Map([
    ["a", { x: 0, y: 0 }],
    ["b", { x: 60, y: 0 }], // No overlap
  ]);
  const sizes = new Map([
    ["a", { width: 50, height: 30 }],
    ["b", { width: 50, height: 30 }],
  ]);

  const solution = createPlacementSolution(positions, sizes);
  const result = repairTranslations(solution);

  assert.strictEqual(result.iterations, 1, "should return after first check");
  assert.strictEqual(result.stopReason, "all_satisfied", "no violations to resolve");
  assert.strictEqual(result.moved.size, 0, "no elements should be moved");
});

test("repairTranslations tracks which elements were moved", () => {
  const positions = new Map([
    ["a", { x: 0, y: 0 }],
    ["b", { x: 40, y: 0 }],
    ["c", { x: 100, y: 0 }], // Not involved in collision
  ]);
  const sizes = new Map([
    ["a", { width: 50, height: 30 }],
    ["b", { width: 50, height: 30 }],
    ["c", { width: 50, height: 30 }],
  ]);

  const solution = createPlacementSolution(positions, sizes);
  const result = repairTranslations(solution);

  assert.ok(!result.moved.has("a"), "a should not be moved (it's the reference)");
  assert.ok(result.moved.has("b"), "b should be moved to resolve overlap");
  assert.ok(!result.moved.has("c"), "c should not be moved (not involved)");
});

test("repairBoxPositions is a convenience wrapper", () => {
  const boxes = new Map([
    ["a", { x: 0, y: 0, width: 50, height: 30 }],
    ["b", { x: 40, y: 0, width: 50, height: 30 }],
  ]);

  const result = repairBoxPositions(boxes);

  assert.ok(result.positions.has("a"), "should return positions for all boxes");
  assert.ok(result.positions.has("b"), "should return positions for all boxes");
  assert.strictEqual(result.stopReason, "all_satisfied", "should resolve violations");
});

test("repairTranslations handles multiple overlaps", () => {
  const positions = new Map([
    ["a", { x: 0, y: 0 }],
    ["b", { x: 40, y: 0 }],   // Overlaps with a
    ["c", { x: 80, y: 0 }],   // Overlaps with b
  ]);
  const sizes = new Map([
    ["a", { width: 50, height: 30 }],
    ["b", { width: 50, height: 30 }],
    ["c", { width: 50, height: 30 }],
  ]);

  const solution = createPlacementSolution(positions, sizes, [], 150);
  const result = repairTranslations(solution);

  assert.ok(result.iterations > 1, "should require multiple iterations for chain of overlaps");
  assert.strictEqual(result.violations.length, 0, "should resolve all overlaps");
});
