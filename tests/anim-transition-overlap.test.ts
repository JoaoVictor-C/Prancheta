import { test } from "node:test";
import assert from "node:assert/strict";
import { overlapsDuringTransition, boxesDoNotOverlapDuringTransition } from "../src/anim/checks.ts";
import type { PlacedBox, Rect } from "../src/ir/types.ts";

function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

function box(overrides: Partial<PlacedBox> & { id: string; x: number; y: number }): PlacedBox {
  return {
    kind: "box",
    width: 40,
    height: 40,
    fill: "#fff",
    stroke: "#000",
    strokeWidth: 1,
    radius: 0,
    content: { x: 0, y: 0, width: 40, height: 40 },
    ...overrides,
  };
}

// --- overlapsDuringTransition: the closed-form math itself -------------------

test("a diagonal swap crosses mid-transition though clear at both authored endpoints", () => {
  // A: (0,0)->(100,100). B: (100,0)->(0,100). Both 40x40. Clear at t=0 (100px
  // apart on x) and t=1 (100px apart on x), but their paths cross around t=0.5.
  const a0 = rect(0, 0, 40, 40);
  const a1 = rect(100, 100, 40, 40);
  const b0 = rect(100, 0, 40, 40);
  const b1 = rect(0, 100, 40, 40);
  assert.equal(overlapsDuringTransition(a0, a1, b0, b1), true);
});

test("two boxes that never come close at any t do not overlap", () => {
  const a0 = rect(0, 0, 40, 40);
  const a1 = rect(50, 0, 40, 40);
  const b0 = rect(500, 500, 40, 40);
  const b1 = rect(600, 500, 40, 40);
  assert.equal(overlapsDuringTransition(a0, a1, b0, b1), false);
});

test("a stationary box and a box that moves through it overlaps", () => {
  const a0 = rect(0, 0, 40, 40); // stationary
  const a1 = rect(0, 0, 40, 40);
  const b0 = rect(-100, 0, 40, 40); // sweeps straight through A
  const b1 = rect(100, 0, 40, 40);
  assert.equal(overlapsDuringTransition(a0, a1, b0, b1), true);
});

test("two boxes moving in parallel at a fixed safe distance never overlap", () => {
  const a0 = rect(0, 0, 40, 40);
  const a1 = rect(200, 0, 40, 40);
  const b0 = rect(0, 100, 40, 40);
  const b1 = rect(200, 100, 40, 40);
  assert.equal(overlapsDuringTransition(a0, a1, b0, b1), false);
});

test("full containment throughout the transition is excused, same as the static check", () => {
  const outer0 = rect(0, 0, 100, 100);
  const outer1 = rect(50, 50, 100, 100);
  const inner0 = rect(20, 20, 20, 20);
  const inner1 = rect(70, 70, 20, 20); // moves rigidly with the outer box, stays inside
  assert.equal(overlapsDuringTransition(outer0, outer1, inner0, inner1), false);
});

test("a box that starts contained but escapes mid-transition is a real violation", () => {
  const outer0 = rect(0, 0, 100, 100);
  const outer1 = rect(0, 0, 100, 100); // stays put
  const inner0 = rect(20, 20, 20, 20); // starts inside
  const inner1 = rect(85, 20, 20, 20); // ends up straddling the right edge -- not contained, not clear
  assert.equal(overlapsDuringTransition(outer0, outer1, inner0, inner1), true);
});

test("two boxes already overlapping at rest (ddx=ddy=0, no motion) still overlap", () => {
  const a = rect(0, 0, 40, 40);
  const b = rect(20, 20, 40, 40);
  assert.equal(overlapsDuringTransition(a, a, b, b), true);
});

// --- boxesDoNotOverlapDuringTransition: the Check[]-producing wrapper --------

test("not-applicable when fewer than two boxes persist across both states", () => {
  const before = new Map([["a", box({ id: "a", x: 0, y: 0 })]]);
  const after = new Map([["a", box({ id: "a", x: 100, y: 0 })]]);
  const checks = boxesDoNotOverlapDuringTransition(before, after);
  assert.equal(checks.length, 1);
  assert.equal(checks[0]!.status, "not-applicable");
});

test("fails naming both boxes on a planted diagonal-swap defect, passes a clean transition", () => {
  const before = new Map([
    ["a", box({ id: "a", x: 0, y: 0 })],
    ["b", box({ id: "b", x: 200, y: 0 })],
  ]);
  const after = new Map([
    ["a", box({ id: "a", x: 200, y: 200 })],
    ["b", box({ id: "b", x: 0, y: 200 })],
  ]);
  const checks = boxesDoNotOverlapDuringTransition(before, after);
  assert.equal(checks.length, 1);
  assert.equal(checks[0]!.status, "fail");
  assert.match(checks[0]!.detail ?? "", /overlaps b during the transition/);

  const cleanAfter = new Map([
    ["a", box({ id: "a", x: 200, y: 0 })],
    ["b", box({ id: "b", x: 400, y: 0 })],
  ]);
  const cleanChecks = boxesDoNotOverlapDuringTransition(before, cleanAfter);
  assert.equal(cleanChecks[0]!.status, "pass");
});
