import { test } from "node:test";
import assert from "node:assert/strict";
import { overlapsDuringTransition, boxesDoNotOverlapDuringTransition } from "../src/anim/checks.ts";
import type { LaidOutFigure, PlacedBox, Rect } from "../src/ir/types.ts";
import type { Trajectory } from "../src/anim/trajectory.ts";
import { FULL_WINDOW } from "../src/anim/trajectory.ts";

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
//
// Since M11.1 the wrapper consumes trajectories (what the renderer actually
// does) rather than two figures, and its population is what the emitted SVG
// draws. These helpers build trajectories directly so the wrapper's own
// policy -- the population, and the t=1 delegation to boxes-do-not-overlap --
// is what is under test, not the derivation feeding it.

function moves(id: string, from: [number, number], to: [number, number]): Trajectory {
  return {
    id,
    from: rect(from[0], from[1], 40, 40),
    to: rect(to[0], to[1], 40, 40),
    tweened: true,
    fade: null,
    inFinishedFigure: true,
    atFirstStatePlace: true,
    window: FULL_WINDOW,
  };
}

/** A box that hard-cuts: already at its second-state place when t=0. */
function stays(id: string, at: [number, number]): Trajectory {
  const r = rect(at[0], at[1], 40, 40);
  return {
    id,
    from: r,
    to: r,
    tweened: false,
    fade: null,
    inFinishedFigure: true,
    atFirstStatePlace: false,
    window: FULL_WINDOW,
  };
}

function fadesIn(id: string, at: [number, number]): Trajectory {
  return { ...stays(id, at), fade: "in" };
}

function fadesOut(id: string, at: [number, number]): Trajectory {
  return { ...stays(id, at), fade: "out", inFinishedFigure: false, atFirstStatePlace: true };
}

function figure(constraints?: LaidOutFigure["constraints"]): LaidOutFigure {
  return { width: 500, height: 500, background: "#fff", elements: [], constraints };
}

function run(trajectories: Trajectory[], constraints?: LaidOutFigure["constraints"]) {
  return boxesDoNotOverlapDuringTransition(new Map(trajectories.map((t) => [t.id, t])), {
    after: figure(constraints),
    before: figure(constraints),
  });
}

test("not-applicable when fewer than two boxes are drawn during the transition", () => {
  const checks = run([moves("a", [0, 0], [100, 0])]);
  assert.equal(checks.length, 1);
  assert.equal(checks[0]!.status, "not-applicable");
});

test("fails naming both boxes on a planted diagonal-swap defect, passes a clean transition", () => {
  const checks = run([moves("a", [0, 0], [200, 200]), moves("b", [200, 0], [0, 200])]);
  assert.equal(checks.length, 1);
  assert.equal(checks[0]!.status, "fail");
  assert.match(checks[0]!.detail ?? "", /overlaps b during the transition/);

  const clean = run([moves("a", [0, 0], [200, 0]), moves("b", [200, 0], [400, 0])]);
  assert.equal(clean[0]!.status, "pass");
});

test("a box that hard-cuts is a constant occupier, and a sweeper that hits it fails -- the M11 false negative", () => {
  // `a` moved but also restyled, so diff.ts labelled it `restyled` and it is
  // not tweened: it sits at (100,0) from t=0. `b` sweeps straight through.
  const checks = run([stays("a", [100, 0]), moves("b", [0, 0], [300, 0])]);
  assert.equal(checks[0]!.status, "fail");
  assert.match(checks[0]!.detail ?? "", /though clear of it in the finished figure/);
});

test("an overlap that is also present in the finished figure is delegated to boxes-do-not-overlap, not double-reported", () => {
  // Two constants sitting on top of each other overlap at t=1 too, which is
  // exactly what the after frame's own static check reports.
  const checks = run([stays("a", [100, 100]), stays("b", [110, 110])]);
  assert.equal(checks[0]!.status, "pass");
});

test("when allowOverlap stands the static check down, the delegation is void and the overlap is reported here", () => {
  const checks = run([stays("a", [100, 100]), stays("b", [110, 110])], { allowOverlap: true });
  assert.equal(checks[0]!.status, "fail");
  assert.match(checks[0]!.detail ?? "", /allowOverlap stood boxes-do-not-overlap down/);
});

test("a crossfade is not an overlap: one box fades out exactly where another fades in", () => {
  // The commonest transition anyone writes. Their opacities are complementary
  // on one clock, so neither is ever at full strength while the other shows.
  const checks = run([fadesOut("old", [100, 100]), fadesIn("new", [100, 100])]);
  assert.equal(checks[0]!.status, "pass");
});

test("a box gliding through one that is still fading out is a real defect neither state contains", () => {
  const checks = run([fadesOut("old", [150, 0]), moves("mover", [0, 0], [300, 0])]);
  assert.equal(checks[0]!.status, "fail");
  assert.match(checks[0]!.detail ?? "", /still fading out/);
});

test("two boxes that leave together, overlapping where the first state put them, are left to that state's own check", () => {
  const checks = run([fadesOut("one", [100, 100]), fadesOut("two", [110, 110])]);
  assert.equal(checks[0]!.status, "pass");
});
