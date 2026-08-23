import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecks } from "../src/checks.ts";
import type { LaidOutFigure, PlacedBox, PlacedText } from "../src/ir/types.ts";

function box(overrides: Partial<PlacedBox> = {}): PlacedBox {
  return {
    kind: "box",
    id: "box-1",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fill: "#171A21",
    stroke: "#000",
    strokeWidth: 1,
    radius: 0,
    content: { x: 5, y: 5, width: 90, height: 90 },
    ...overrides,
  };
}

function text(overrides: Partial<PlacedText> = {}): PlacedText {
  return {
    kind: "text",
    id: "text-1",
    ownerId: "box-1",
    fontFamily: "Arial",
    fontSize: 12,
    fill: "#E6E9EF",
    anchor: "start",
    lines: [{ text: "x", x: 10, y: 10, box: { x: 10, y: 4, width: 6, height: 12 }, baselineUncertain: false }],
    ...overrides,
  };
}

function figure(overrides: Partial<LaidOutFigure> = {}): LaidOutFigure {
  return { width: 200, height: 200, background: "#0F1115", elements: [], ...overrides };
}

// --- contrast-sufficient ---------------------------------------------------

test("readable text against its owner's fill passes contrast-sufficient", () => {
  const owner = box({ fill: "#171A21" }); // the real dark theme's default block fill
  const label = text({ fill: "#E6E9EF" }); // the real dark theme's default text colour
  const checks = runChecks(figure({ elements: [owner, label] }));
  const contrast = checks.filter((c) => c.id === "contrast-sufficient");
  assert.equal(contrast.length, 1);
  assert.equal(contrast[0]!.status, "pass");
});

test("mid-grey text on a mid-grey fill FAILS contrast-sufficient -- the planted defect", () => {
  const owner = box({ fill: "#808080" });
  const label = text({ fill: "#8A8A8A" }); // deliberately close, not just "some other colour"
  const checks = runChecks(figure({ elements: [owner, label] }));
  const contrast = checks.filter((c) => c.id === "contrast-sufficient");
  assert.equal(contrast.length, 1);
  assert.equal(contrast[0]!.status, "fail");
  assert.match(contrast[0]!.detail ?? "", /below the 4\.5:1 WCAG AA threshold/);
});

test("a text with no owner is checked against the canvas background", () => {
  const label = text({ ownerId: null, fill: "#8A8A8A" });
  const checks = runChecks(figure({ elements: [label], background: "#808080" }));
  const contrast = checks.filter((c) => c.id === "contrast-sufficient");
  assert.equal(contrast.length, 1);
  assert.equal(contrast[0]!.status, "fail");
});

test("a callout (transparent-fill owner) is checked against the canvas, not the transparent fill", () => {
  const owner = box({ fill: "transparent" });
  const label = text({ fill: "#8A8A8A" });
  const checks = runChecks(figure({ elements: [owner, label], background: "#808080" }));
  const contrast = checks.filter((c) => c.id === "contrast-sufficient");
  assert.equal(contrast.length, 1);
  assert.equal(contrast[0]!.status, "fail");
  assert.match(contrast[0]!.detail ?? "", /against #808080/);
});

test("a named CSS colour (not hex) is reported not-applicable, never a silent pass", () => {
  const owner = box({ fill: "#171A21" });
  const label = text({ fill: "red" });
  const checks = runChecks(figure({ elements: [owner, label] }));
  const contrast = checks.filter((c) => c.id === "contrast-sufficient");
  assert.equal(contrast.length, 1);
  assert.equal(contrast[0]!.status, "not-applicable");
});

test("a figure with no text is not-applicable for contrast-sufficient, not a vacuous pass", () => {
  const checks = runChecks(figure({ elements: [box()] }));
  const contrast = checks.filter((c) => c.id === "contrast-sufficient");
  assert.equal(contrast.length, 1);
  assert.equal(contrast[0]!.status, "not-applicable");
  assert.equal(contrast[0]!.examined, 0);
});

test("contrast-sufficient is one check per text element, matching text-fits-box's granularity", () => {
  const owner = box({ fill: "#171A21" });
  const good = text({ id: "good", fill: "#E6E9EF" });
  const bad = text({ id: "bad", fill: "#1A1D23" });
  const checks = runChecks(figure({ elements: [owner, good, bad] }));
  const contrast = checks.filter((c) => c.id === "contrast-sufficient");
  assert.equal(contrast.length, 2);
  assert.equal(contrast.find((c) => c.target === "good")!.status, "pass");
  assert.equal(contrast.find((c) => c.target === "bad")!.status, "fail");
});

// --- categorical-colours-distinguishable -----------------------------------

test("two very different colours in the same categoryGroup pass", () => {
  const a = box({ id: "a", fill: "#5B8DEF", categoryGroup: "series" });
  const b = box({ id: "b", fill: "#E76F51", categoryGroup: "series" });
  const checks = runChecks(figure({ elements: [a, b] }));
  const cat = checks.find((c) => c.id === "categorical-colours-distinguishable")!;
  assert.equal(cat.status, "pass");
});

test("two near-identical colours in the same categoryGroup FAIL -- the planted defect", () => {
  const a = box({ id: "a", fill: "#4CAF7D", categoryGroup: "series" });
  const b = box({ id: "b", fill: "#48A9A6", categoryGroup: "series" }); // the real old defect
  const checks = runChecks(figure({ elements: [a, b] }));
  const cat = checks.find((c) => c.id === "categorical-colours-distinguishable")!;
  assert.equal(cat.status, "fail");
  assert.match(cat.detail ?? "", /group "series"/);
});

test("boxes without a categoryGroup are never compared, however similar their colours", () => {
  const a = box({ id: "a", fill: "#4CAF7D" });
  const b = box({ id: "b", fill: "#48A9A6" });
  const checks = runChecks(figure({ elements: [a, b] }));
  const cat = checks.find((c) => c.id === "categorical-colours-distinguishable")!;
  assert.equal(cat.status, "not-applicable");
});

test("a categoryGroup with only one member is not-applicable, not a vacuous pass", () => {
  const a = box({ id: "a", fill: "#4CAF7D", categoryGroup: "series" });
  const checks = runChecks(figure({ elements: [a] }));
  const cat = checks.find((c) => c.id === "categorical-colours-distinguishable")!;
  assert.equal(cat.status, "not-applicable");
  assert.equal(cat.examined, 0);
});

test("two different categoryGroups do not get compared against each other", () => {
  // "a" and "c" are similar but in DIFFERENT groups, each with only one
  // member -- neither group is comparable, so this must not fail.
  const a = box({ id: "a", fill: "#4CAF7D", categoryGroup: "series" });
  const c = box({ id: "c", fill: "#48A9A6", categoryGroup: "legend" });
  const checks = runChecks(figure({ elements: [a, c] }));
  const cat = checks.find((c) => c.id === "categorical-colours-distinguishable")!;
  assert.equal(cat.status, "not-applicable");
});

test("three colours in one group are compared pairwise, and one bad pair still fails the group", () => {
  const a = box({ id: "a", fill: "#5B8DEF", categoryGroup: "series" });
  const b = box({ id: "b", fill: "#4CAF7D", categoryGroup: "series" });
  const c = box({ id: "c", fill: "#48A9A6", categoryGroup: "series" }); // close to b
  const checks = runChecks(figure({ elements: [a, b, c] }));
  const cat = checks.find((c) => c.id === "categorical-colours-distinguishable")!;
  assert.equal(cat.status, "fail");
  // 3 members, 2 dichromacy kinds -> 3 pairs * 2 kinds = 6 pairs examined
  assert.equal(cat.examined, 6);
});
