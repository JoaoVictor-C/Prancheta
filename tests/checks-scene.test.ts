import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecks } from "../src/checks.ts";
import type { LaidOutFigure, PlacedBox, PlacedConnector, PlacedMark, PlacedText } from "../src/ir/types.ts";

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

function mark(overrides: Partial<PlacedMark> = {}): PlacedMark {
  return {
    kind: "mark",
    id: "mark-1",
    points: [],
    closed: false,
    fill: "none",
    stroke: "#000",
    strokeWidth: 1,
    lineStyle: "solid",
    arcCentres: [],
    ...overrides,
  };
}

function text(overrides: Partial<PlacedText> = {}): PlacedText {
  return {
    kind: "text",
    id: "text-1",
    ownerId: null,
    fontFamily: "Arial",
    fontSize: 12,
    fill: "#000",
    anchor: "start",
    lines: [],
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

// ---------------------------------------------------------------------------
// text-clear-of-ink
// ---------------------------------------------------------------------------

test("text-clear-of-ink fails when a label sits on a Mark's stroked outline", () => {
  const line = mark({
    id: "curve",
    points: [
      { x: 0, y: 50 },
      { x: 200, y: 50 },
    ],
  });
  const label = text({
    lines: [{ text: "x", x: 90, y: 44, box: { x: 90, y: 40, width: 20, height: 14 }, baselineUncertain: false }],
  });
  const figure: LaidOutFigure = { width: 400, height: 200, background: "#fff", elements: [line, label] };

  const checks = runChecks(figure);
  const check = checks.find((c) => c.id === "text-clear-of-ink" && c.target === "text-1");
  assert.ok(check);
  assert.equal(check?.status, "fail");
  assert.ok(check?.detail?.includes("curve"));
});

test("text-clear-of-ink passes when a label sits well clear of a Mark's outline", () => {
  const line = mark({
    id: "curve",
    points: [
      { x: 0, y: 50 },
      { x: 200, y: 50 },
    ],
  });
  const label = text({
    lines: [{ text: "x", x: 90, y: 120, box: { x: 90, y: 116, width: 20, height: 14 }, baselineUncertain: false }],
  });
  const figure: LaidOutFigure = { width: 400, height: 200, background: "#fff", elements: [line, label] };

  const checks = runChecks(figure);
  const check = checks.find((c) => c.id === "text-clear-of-ink" && c.target === "text-1");
  assert.ok(check);
  assert.equal(check?.status, "pass");
});

test("text-clear-of-ink is relieved when the label's owner annotates the mark it sits on, and the owner's own fill actually covers it", () => {
  const line = mark({
    id: "curve",
    points: [
      { x: 0, y: 50 },
      { x: 200, y: 50 },
    ],
  });
  // box()'s default fill is opaque ("#fff") -- the owner genuinely paints
  // over the curve beneath it, so the relief is real, not assumed.
  const owner = box({ id: "owner-1", x: 80, y: 30, width: 40, height: 30, annotates: "curve" });
  const label = text({
    ownerId: "owner-1",
    lines: [{ text: "x", x: 90, y: 44, box: { x: 90, y: 40, width: 20, height: 14 }, baselineUncertain: false }],
  });
  const figure: LaidOutFigure = { width: 400, height: 200, background: "#fff", elements: [line, owner, label] };

  const checks = runChecks(figure);
  const check = checks.find((c) => c.id === "text-clear-of-ink" && c.target === "text-1");
  assert.ok(check);
  assert.equal(check?.status, "pass", check?.detail);
});

test("text-clear-of-ink still fails when a transparent owner annotates the mark it sits on", () => {
  // The defect this guards: an angle-mark label has no fill of its own, so
  // `annotates` used to buy it a blanket pass while the arc it names visibly
  // sliced the glyph underneath. Relief now requires the owner to actually
  // hide the ink, and a transparent owner hides nothing.
  const line = mark({
    id: "curve",
    points: [
      { x: 0, y: 50 },
      { x: 200, y: 50 },
    ],
  });
  // "transparent", not "none": a real PlacedBox.fill is always browser-measured
  // (getComputedStyle), which normalises an unfilled box to rgba(0,0,0,0) --
  // never the raw spec string -- so this mirrors what isTransparent actually sees.
  const owner = box({ id: "owner-1", x: 80, y: 30, width: 40, height: 30, fill: "transparent", annotates: "curve" });
  const label = text({
    ownerId: "owner-1",
    lines: [{ text: "x", x: 90, y: 44, box: { x: 90, y: 40, width: 20, height: 14 }, baselineUncertain: false }],
  });
  const figure: LaidOutFigure = { width: 400, height: 200, background: "#fff", elements: [line, owner, label] };

  const checks = runChecks(figure);
  const check = checks.find((c) => c.id === "text-clear-of-ink" && c.target === "text-1");
  assert.ok(check);
  assert.equal(check?.status, "fail");
  assert.ok(check?.detail?.includes("curve"));
});

test("text-clear-of-ink ignores grid furniture (Mark.gridOf)", () => {
  const gridline = mark({
    id: "grid-x-3",
    gridOf: "plane",
    points: [
      { x: 0, y: 50 },
      { x: 200, y: 50 },
    ],
  });
  const label = text({
    lines: [{ text: "x", x: 90, y: 44, box: { x: 90, y: 40, width: 20, height: 14 }, baselineUncertain: false }],
  });
  const figure: LaidOutFigure = { width: 400, height: 200, background: "#fff", elements: [gridline, label] };

  const checks = runChecks(figure);
  const check = checks.find((c) => c.id === "text-clear-of-ink" && c.target === "text-1");
  assert.ok(check);
  assert.equal(check?.status, "pass");
});

test("text-clear-of-ink ignores a Mark with no visible stroke", () => {
  // A filled region with stroke: "none" is a surface a label may sit ON --
  // contrast-sufficient is the check that scores that -- not a line it
  // touches, so the same crossing geometry that fails for a stroked outline
  // must pass here.
  const region = mark({
    id: "region",
    stroke: "none",
    strokeWidth: 0,
    fill: "#eee",
    points: [
      { x: 0, y: 50 },
      { x: 200, y: 50 },
    ],
  });
  const label = text({
    lines: [{ text: "x", x: 90, y: 44, box: { x: 90, y: 40, width: 20, height: 14 }, baselineUncertain: false }],
  });
  const figure: LaidOutFigure = { width: 400, height: 200, background: "#fff", elements: [region, label] };

  const checks = runChecks(figure);
  const check = checks.find((c) => c.id === "text-clear-of-ink" && c.target === "text-1");
  assert.ok(check);
  assert.equal(check?.status, "pass");
});

test("text-clear-of-ink fails when a label sits on a Connector's route", () => {
  const a = box({ id: "a", x: 0, y: 0, width: 40, height: 40 });
  const b = box({ id: "b", x: 200, y: 0, width: 40, height: 40 });
  const line = connector({
    fromId: "a",
    toId: "b",
    points: [
      { x: 40, y: 50 },
      { x: 200, y: 50 },
    ],
  });
  const label = text({
    lines: [{ text: "x", x: 90, y: 44, box: { x: 90, y: 40, width: 20, height: 14 }, baselineUncertain: false }],
  });
  const figure: LaidOutFigure = { width: 400, height: 200, background: "#fff", elements: [a, b, line, label] };

  const checks = runChecks(figure);
  const check = checks.find((c) => c.id === "text-clear-of-ink" && c.target === "text-1");
  assert.ok(check);
  assert.equal(check?.status, "fail");
  assert.ok(check?.detail?.includes("conn-1"));
});

test("text-clear-of-ink is relieved when the label's owner annotates the connector it sits on, and the owner's own fill actually covers it", () => {
  const a = box({ id: "a", x: 0, y: 0, width: 40, height: 40 });
  const b = box({ id: "b", x: 200, y: 0, width: 40, height: 40 });
  const line = connector({
    fromId: "a",
    toId: "b",
    points: [
      { x: 40, y: 50 },
      { x: 200, y: 50 },
    ],
  });
  // box()'s default fill is opaque ("#fff") -- a real painted cover, not an
  // assumed one.
  const owner = box({ id: "owner-1", x: 80, y: 30, width: 40, height: 30, annotates: "conn-1" });
  const label = text({
    ownerId: "owner-1",
    lines: [{ text: "x", x: 90, y: 44, box: { x: 90, y: 40, width: 20, height: 14 }, baselineUncertain: false }],
  });
  const figure: LaidOutFigure = {
    width: 400,
    height: 200,
    background: "#fff",
    elements: [a, b, line, owner, label],
  };

  const checks = runChecks(figure);
  const check = checks.find((c) => c.id === "text-clear-of-ink" && c.target === "text-1");
  assert.ok(check);
  assert.equal(check?.status, "pass", check?.detail);
});

test("text-clear-of-ink still fails when a transparent owner annotates the connector it sits on", () => {
  const a = box({ id: "a", x: 0, y: 0, width: 40, height: 40 });
  const b = box({ id: "b", x: 200, y: 0, width: 40, height: 40 });
  const line = connector({
    fromId: "a",
    toId: "b",
    points: [
      { x: 40, y: 50 },
      { x: 200, y: 50 },
    ],
  });
  const owner = box({ id: "owner-1", x: 80, y: 30, width: 40, height: 30, fill: "transparent", annotates: "conn-1" });
  const label = text({
    ownerId: "owner-1",
    lines: [{ text: "x", x: 90, y: 44, box: { x: 90, y: 40, width: 20, height: 14 }, baselineUncertain: false }],
  });
  const figure: LaidOutFigure = {
    width: 400,
    height: 200,
    background: "#fff",
    elements: [a, b, line, owner, label],
  };

  const checks = runChecks(figure);
  const check = checks.find((c) => c.id === "text-clear-of-ink" && c.target === "text-1");
  assert.ok(check);
  assert.equal(check?.status, "fail");
  assert.ok(check?.detail?.includes("conn-1"));
});
