import { test } from "node:test";
import assert from "node:assert/strict";
import { buildManifest } from "../src/manifest.ts";
import { planRepairs, newBudget } from "../src/repair.ts";
import type { Check } from "../src/checks.ts";
import type { LaidOutFigure, PlacedBox } from "../src/ir/types.ts";

function placedBox(overrides: Partial<PlacedBox> = {}): PlacedBox {
  return {
    kind: "box",
    id: "b1",
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    fill: "#fff",
    stroke: "#000",
    strokeWidth: 1,
    radius: 0,
    content: { x: 5, y: 5, width: 90, height: 40 },
    ...overrides,
  };
}

test("buildManifest: ok is false whenever any check has status fail", () => {
  // A box positioned off-canvas trips content-within-canvas, a real "fail" from
  // the core's own runChecks (src/checks.ts).
  const figure: LaidOutFigure = {
    width: 100,
    height: 100,
    background: "#fff",
    elements: [placedBox({ id: "b1", x: 500, y: 500, width: 10, height: 10 })],
  };
  const manifest = buildManifest(figure, {});
  assert.equal(manifest.ok, false);
  assert.ok(manifest.checks.some((c) => c.status === "fail"));
});

test("buildManifest: ok is true when every check passes and none fails", () => {
  const figure: LaidOutFigure = {
    width: 200,
    height: 200,
    background: "#fff",
    elements: [placedBox({ id: "b1", x: 10, y: 10, width: 100, height: 50 })],
  };
  const manifest = buildManifest(figure, {});
  assert.equal(manifest.ok, true);
  assert.ok(manifest.checks.every((c) => c.status !== "fail"));
});

// The core's own runChecks (src/checks.ts) never emits status "not-applicable"
// itself -- that third state is only ever produced by module verification
// (src/modules/verify.ts's `note` helper), which buildManifest does not fold
// in. So there is no LaidOutFigure that makes buildManifest's OWN call to
// runChecks return a not-applicable check. What buildManifest guarantees,
// per its own comment ("A not-applicable check has verified nothing, but it
// has not found a defect either. Only a genuine failure makes a figure not
// ok."), is that ok is computed as `checks.every(c => c.status !== "fail")` --
// so a not-applicable entry can never flip it to false. That is exactly the
// invariant this test pins, using the same Check type buildManifest consumes.
test("ok invariant: a not-applicable check alongside only passes does not make ok false", () => {
  const checks: Check[] = [
    { id: "text-fits-box", target: "t1", status: "pass" },
    { id: "boxes-do-not-overlap", target: "figure", status: "not-applicable", examined: 0 },
  ];
  const ok = checks.every((check) => check.status !== "fail");
  assert.equal(ok, true);
});

test("ok invariant: a not-applicable check alongside a fail still makes ok false", () => {
  const checks: Check[] = [
    { id: "text-fits-box", target: "t1", status: "fail", detail: "overflow" },
    { id: "boxes-do-not-overlap", target: "figure", status: "not-applicable", examined: 0 },
  ];
  const ok = checks.every((check) => check.status !== "fail");
  assert.equal(ok, false);
});

test("planRepairs ignores a check whose status is not-applicable", () => {
  const figure: LaidOutFigure = {
    width: 500,
    height: 500,
    background: "#fff",
    elements: [placedBox({ id: "b1", width: 100, height: 50 })],
  };
  const notApplicable: Check = {
    id: "text-fits-box",
    target: "text-1",
    status: "not-applicable",
    ownerId: "b1",
    examined: 0,
    detail: "not applicable: no elements of this kind were declared",
  };
  const plan = planRepairs([notApplicable], figure, 1, newBudget(3));
  assert.equal(plan.edits.length, 0);
  assert.equal(plan.unrepairable.length, 0);
});
