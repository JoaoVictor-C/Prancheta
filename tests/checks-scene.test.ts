import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecks } from "../src/checks.ts";
import type { LaidOutFigure, PlacedBox, PlacedConnector } from "../src/ir/types.ts";

function box(overrides: Partial<PlacedBox> = {}): PlacedBox {
  return {
    kind: "box",
    id: "box-1",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fill: "#fff",
    stroke: "#000",
    strokeWidth: 1,
    radius: 0,
    content: { x: 5, y: 5, width: 90, height: 90 },
    ...overrides,
  };
}

function connector(overrides: Partial<PlacedConnector> = {}): PlacedConnector {
  return {
    kind: "connector",
    id: "conn-1",
    fromId: "a",
    toId: "b",
    points: [],
    arrow: "end",
    arrowStyle: "closed",
    dashed: false,
    lineStyle: "solid",
    stroke: "#000",
    strokeWidth: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// connector-clear-of-boxes
// ---------------------------------------------------------------------------

test("connector-clear-of-boxes fails when a connector crosses an unrelated box", () => {
  const a = box({ id: "a", x: 0, y: 40, width: 20, height: 20 });
  const b = box({ id: "b", x: 200, y: 40, width: 20, height: 20 });
  const unrelated = box({ id: "unrelated", x: 90, y: 30, width: 40, height: 40 });
  const line = connector({
    fromId: "a",
    toId: "b",
    points: [
      { x: 20, y: 50 },
      { x: 200, y: 50 },
    ],
  });
  const figure: LaidOutFigure = {
    width: 400,
    height: 200,
    background: "#000",
    elements: [a, b, unrelated, line],
  };

  const checks = runChecks(figure);
  const check = checks.find((c) => c.id === "connector-clear-of-boxes" && c.target === "conn-1");
  assert.ok(check);
  assert.equal(check?.status, "fail");
  assert.ok(check?.detail?.includes("unrelated"));
});

test("connector-clear-of-boxes passes when the crossed box is an endpoint", () => {
  const a = box({ id: "a", x: 0, y: 0, width: 100, height: 100 });
  const b = box({ id: "b", x: 150, y: 0, width: 100, height: 100 });
  const line = connector({
    fromId: "a",
    toId: "b",
    points: [
      { x: 50, y: 50 },
      { x: 200, y: 50 },
    ],
  });
  const figure: LaidOutFigure = { width: 400, height: 200, background: "#000", elements: [a, b, line] };

  const checks = runChecks(figure);
  const check = checks.find((c) => c.id === "connector-clear-of-boxes" && c.target === "conn-1");
  assert.ok(check);
  assert.equal(check?.status, "pass");
});

test("connector-clear-of-boxes passes when the crossed box contains an endpoint box (container guard)", () => {
  // A callout leader line runs from outside the case, into a part fully
  // contained by the case (e.g. a cross-section). The case must not be
  // reported as an unrelated collision.
  const container = box({ id: "case", x: 100, y: 0, width: 200, height: 200 });
  const part = box({ id: "cathode", x: 120, y: 20, width: 60, height: 30 }); // inside case
  const callout = box({ id: "callout-1", x: 0, y: 0, width: 50, height: 20 }); // outside case
  const line = connector({
    fromId: "callout-1",
    toId: "cathode",
    points: [
      { x: 50, y: 10 },
      { x: 150, y: 35 },
    ],
  });
  const figure: LaidOutFigure = {
    width: 400,
    height: 300,
    background: "#000",
    elements: [container, part, callout, line],
  };

  const checks = runChecks(figure);
  const check = checks.find((c) => c.id === "connector-clear-of-boxes" && c.target === "conn-1");
  assert.ok(check);
  assert.equal(check?.status, "pass", check?.detail);
});

// ---------------------------------------------------------------------------
// boxes-do-not-overlap
// ---------------------------------------------------------------------------

test("boxes-do-not-overlap fails for two partially overlapping boxes", () => {
  const a = box({ id: "a", x: 0, y: 0, width: 100, height: 100 });
  const b = box({ id: "b", x: 50, y: 50, width: 100, height: 100 });
  const figure: LaidOutFigure = { width: 400, height: 400, background: "#000", elements: [a, b] };

  const checks = runChecks(figure);
  const check = checks.find((c) => c.id === "boxes-do-not-overlap");
  assert.ok(check);
  assert.equal(check?.status, "fail");
});

test("boxes-do-not-overlap passes when one box fully contains the other", () => {
  const outer = box({ id: "outer", x: 0, y: 0, width: 200, height: 200 });
  const inner = box({ id: "inner", x: 20, y: 20, width: 50, height: 50 });
  const figure: LaidOutFigure = { width: 400, height: 400, background: "#000", elements: [outer, inner] };

  const checks = runChecks(figure);
  const failing = checks.filter((c) => c.id === "boxes-do-not-overlap" && c.status === "fail");
  assert.equal(failing.length, 0);
});

test("boxes-do-not-overlap passes for disjoint boxes", () => {
  const a = box({ id: "a", x: 0, y: 0, width: 50, height: 50 });
  const b = box({ id: "b", x: 200, y: 200, width: 50, height: 50 });
  const figure: LaidOutFigure = { width: 400, height: 400, background: "#000", elements: [a, b] };

  const checks = runChecks(figure);
  const check = checks.find((c) => c.id === "boxes-do-not-overlap");
  assert.ok(check);
  assert.equal(check?.status, "pass");
});
