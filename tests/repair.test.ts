import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planRepairs,
  planWrapFallback,
  applyEdits,
  isMonotone,
  newBudget,
} from "../src/repair.ts";
import type { RepairEdit } from "../src/repair.ts";
import type { Check } from "../src/checks.ts";
import type { FigureSpec, LaidOutFigure, PlacedBox } from "../src/ir/types.ts";

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

function figureWith(boxes: PlacedBox[]): LaidOutFigure {
  return { width: 500, height: 500, background: "#fff", elements: boxes };
}

function bottomOverflowCheck(ownerId = "b1", bottom = 10): Check {
  return {
    id: "text-fits-box",
    target: "text-1",
    status: "fail",
    ownerId,
    overflow: { left: 0, top: 0, right: 0, bottom },
    detail: `overflows bottom by ${bottom}px`,
  };
}

function rightOverflowCheck(ownerId = "b1", right = 15): Check {
  return {
    id: "text-fits-box",
    target: "text-1",
    status: "fail",
    ownerId,
    overflow: { left: 0, top: 0, right, bottom: 0 },
    detail: `overflows right by ${right}px`,
  };
}

test("planRepairs on a bottom-overflow failure emits one height edit that grows the box", () => {
  const figure = figureWith([placedBox({ id: "b1", width: 100, height: 50 })]);
  const plan = planRepairs([bottomOverflowCheck("b1", 10)], figure, 1, newBudget(3));

  assert.equal(plan.edits.length, 1);
  const edit = plan.edits[0];
  assert.equal(edit.property, "height");
  assert.equal(typeof edit.to, "number");
  assert.equal(typeof edit.from, "number");
  assert.ok((edit.to as number) > (edit.from as number));
  assert.ok(edit.reason.includes("overflow"));
});

test("planRepairs on a right-overflow failure emits one width edit that grows the box", () => {
  const figure = figureWith([placedBox({ id: "b1", width: 100, height: 50 })]);
  const plan = planRepairs([rightOverflowCheck("b1", 15)], figure, 1, newBudget(3));

  assert.equal(plan.edits.length, 1);
  const edit = plan.edits[0];
  assert.equal(edit.property, "width");
  assert.ok((edit.to as number) > (edit.from as number));
});

test("MONOTONICITY: every edit planRepairs returns satisfies isMonotone", () => {
  const figure = figureWith([placedBox({ id: "b1", width: 100, height: 50 })]);
  const plan = planRepairs(
    [bottomOverflowCheck("b1", 10), rightOverflowCheck("b2", 15)],
    figureWith([placedBox({ id: "b1", width: 100, height: 50 }), placedBox({ id: "b2", width: 80, height: 60 })]),
    1,
    newBudget(3),
  );
  assert.ok(plan.edits.length > 0);
  for (const edit of plan.edits) assert.ok(isMonotone(edit), JSON.stringify(edit));
});

test("isMonotone rejects a fabricated shrinking edit", () => {
  const shrink: RepairEdit = {
    pass: 1,
    target: "b1",
    property: "width",
    from: 100,
    to: 50,
    reason: "fabricated",
  };
  assert.equal(isMonotone(shrink), false);
});

test("isMonotone rejects a wrap edit going normal -> none", () => {
  const backwards: RepairEdit = {
    pass: 1,
    target: "b1",
    property: "wrap",
    from: "normal",
    to: "none",
    reason: "fabricated",
  };
  assert.equal(isMonotone(backwards), false);
});

test("BUDGET: with no room to grow, a right-overflow failure produces no width edit and one unrepairable entry mentioning the budget", () => {
  const figure = figureWith([placedBox({ id: "b1", width: 100, height: 50 })]);
  const plan = planRepairs([rightOverflowCheck("b1", 15)], figure, 1, newBudget(1));

  const widthEdits = plan.edits.filter((e) => e.property === "width");
  assert.equal(widthEdits.length, 0);
  assert.equal(plan.unrepairable.length, 1);
  assert.ok(plan.unrepairable[0].why.includes("budget"));
});

test("planWrapFallback returns a wrap edit only for a block whose spec has wrap: none", () => {
  const spec: FigureSpec = {
    version: 1,
    root: {
      type: "stack",
      direction: "column",
      children: [
        { type: "block", id: "no-wrap", label: "SELECT * FROM x", wrap: "none" },
        { type: "block", id: "already-wraps", label: "a normal label", wrap: "normal" },
      ],
    },
  };

  const plan = {
    edits: [],
    unrepairable: [
      { check: bottomOverflowCheck("no-wrap", 5), why: "budget" },
      { check: bottomOverflowCheck("already-wraps", 5), why: "budget" },
    ],
  };

  const edits = planWrapFallback(plan, spec, 2);
  assert.equal(edits.length, 1);
  assert.equal(edits[0].target, "no-wrap");
  assert.equal(edits[0].property, "wrap");
  assert.equal(edits[0].from, "none");
  assert.equal(edits[0].to, "normal");
});

test("applyEdits does not mutate the input spec and returns a copy with the edit applied", () => {
  const spec: FigureSpec = {
    version: 1,
    root: { type: "block", id: "blk", label: "hi", width: 100 },
  };
  const before = JSON.parse(JSON.stringify(spec));

  const edits: RepairEdit[] = [
    { pass: 1, target: "blk", property: "width", from: 100, to: 150, reason: "grow" },
  ];
  const copy = applyEdits(spec, edits);

  assert.deepEqual(spec, before);
  assert.equal((copy.root as { width?: number }).width, 150);
  assert.equal((spec.root as { width?: number }).width, 100);
});

test("planRepairs emits at most one size edit per node per pass, even when several checks blame the same node", () => {
  const figure = figureWith([placedBox({ id: "b1", width: 100, height: 50 })]);
  const plan = planRepairs(
    [rightOverflowCheck("b1", 15), bottomOverflowCheck("b1", 10)],
    figure,
    1,
    newBudget(3),
  );
  assert.equal(plan.edits.length, 1);
});
