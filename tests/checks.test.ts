import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecks, EPSILON } from "../src/checks.ts";
import type { LaidOutFigure, PlacedBox, PlacedText } from "../src/ir/types.ts";

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

function text(overrides: Partial<PlacedText> = {}): PlacedText {
  return {
    kind: "text",
    id: "text-1",
    ownerId: "box-1",
    fontFamily: "Arial",
    fontSize: 12,
    fill: "#000",
    anchor: "start",
    lines: [],
    ...overrides,
  };
}

test("a text overflowing the bottom of its owner's content box fails text-fits-box with the true deficit", () => {
  const owner = box({ id: "box-1", content: { x: 5, y: 5, width: 90, height: 80 } }); // content bottom at y=85
  const label = text({
    ownerId: "box-1",
    lines: [
      { text: "line", x: 10, y: 88, box: { x: 10, y: 70, width: 20, height: 20 }, baselineUncertain: false },
    ], // line box bottom at y=90, 5px past content bottom (85)
  });
  const figure: LaidOutFigure = { width: 300, height: 300, background: "#fff", elements: [owner, label] };

  const checks = runChecks(figure);
  const check = checks.find((c) => c.id === "text-fits-box" && c.target === "text-1");
  assert.ok(check);
  assert.equal(check?.status, "fail");
  assert.equal(check?.ownerId, "box-1");
  assert.ok(check?.overflow);
  assert.ok(Math.abs(check!.overflow!.bottom - 5) < 0.01, `expected ~5, got ${check?.overflow?.bottom}`);
  assert.equal(check?.overflow?.right, 0);
});

test("a text overflowing the right of its owner's content box sets overflow.right", () => {
  const owner = box({ id: "box-1", content: { x: 5, y: 5, width: 80, height: 90 } }); // content right edge at x=85
  const label = text({
    ownerId: "box-1",
    lines: [
      { text: "line", x: 80, y: 20, box: { x: 80, y: 10, width: 20, height: 12 }, baselineUncertain: false },
    ], // line box right edge at x=100, 15px past content right (85)
  });
  const figure: LaidOutFigure = { width: 300, height: 300, background: "#fff", elements: [owner, label] };

  const checks = runChecks(figure);
  const check = checks.find((c) => c.id === "text-fits-box" && c.target === "text-1");
  assert.ok(check);
  assert.equal(check?.status, "fail");
  assert.ok(Math.abs(check!.overflow!.right - 15) < 0.01, `expected ~15, got ${check?.overflow?.right}`);
});

test("a text intersecting a box that is not its owner fails text-clear-of-other-boxes naming that box", () => {
  const owner = box({ id: "box-1", x: 0, y: 0, width: 40, height: 40 });
  const other = box({ id: "box-2", x: 100, y: 0, width: 50, height: 50 });
  const label = text({
    ownerId: "box-1",
    lines: [
      // right edge at x=101: 1px past box-2's left edge (100), well past EPSILON
      { text: "line", x: 50, y: 20, box: { x: 50, y: 0, width: 51, height: 10 }, baselineUncertain: false },
    ],
  });
  const figure: LaidOutFigure = { width: 300, height: 300, background: "#fff", elements: [owner, other, label] };

  const checks = runChecks(figure);
  const check = checks.find((c) => c.id === "text-clear-of-other-boxes" && c.target === "text-1");
  assert.ok(check);
  assert.equal(check?.status, "fail");
  assert.ok(check?.detail?.includes("box-2"));
});

test("a text touching a non-owner box by less than EPSILON does not trip text-clear-of-other-boxes", () => {
  const owner = box({ id: "box-1", x: 0, y: 0, width: 40, height: 40 });
  const other = box({ id: "box-2", x: 100, y: 0, width: 50, height: 50 });
  const overlap = EPSILON - 0.2; // strictly less than EPSILON
  const label = text({
    ownerId: "box-1",
    lines: [
      {
        text: "line",
        x: 50,
        y: 20,
        box: { x: 50, y: 0, width: 50 + overlap, height: 10 },
        baselineUncertain: false,
      },
    ],
  });
  const figure: LaidOutFigure = { width: 300, height: 300, background: "#fff", elements: [owner, other, label] };

  const checks = runChecks(figure);
  const check = checks.find((c) => c.id === "text-clear-of-other-boxes" && c.target === "text-1");
  assert.ok(check);
  assert.equal(check?.status, "pass");
});

test("an element extending past the canvas trips content-within-canvas", () => {
  const escapee = box({ id: "box-2", x: 90, y: 90, width: 50, height: 50 });
  const figure: LaidOutFigure = { width: 100, height: 100, background: "#fff", elements: [escapee] };

  const checks = runChecks(figure);
  const check = checks.find((c) => c.id === "content-within-canvas");
  assert.ok(check);
  assert.equal(check?.status, "fail");
  assert.ok(check?.detail?.includes("box-2"));
});

// --- label-within-shape --------------------------------------------------

test("label-within-shape is not-applicable for a rect (or unset) shape", () => {
  const owner = box({ id: "box-1" });
  const label = text({
    ownerId: "box-1",
    lines: [{ text: "hi", x: 10, y: 20, box: { x: 10, y: 10, width: 20, height: 12 }, baselineUncertain: false }],
  });
  const figure: LaidOutFigure = { width: 200, height: 200, background: "#fff", elements: [owner, label] };

  const check = runChecks(figure).find((c) => c.id === "label-within-shape" && c.target === "text-1");
  assert.ok(check);
  assert.equal(check?.status, "not-applicable");
});

/**
 * The planted defect step 15 exists to catch: a wrapped line sitting near a
 * diamond's own corner. It fits comfortably inside the content rectangle
 * (text-fits-box has nothing to say), but the diamond's slanted sides cut
 * that corner off well before the box does -- exactly the gap a bounding-box
 * check cannot see and label-within-shape must.
 */
test("a line whose corners fall outside a diamond fails label-within-shape while passing text-fits-box", () => {
  const owner = box({
    id: "box-1",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    content: { x: 10, y: 10, width: 80, height: 80 },
    shape: "diamond",
  });
  const label = text({
    ownerId: "box-1",
    lines: [
      // Within the content rect (10,10)-(90,90) but its top corners are well
      // outside the diamond inscribed in the full 100x100 box.
      { text: "wrapped top line", x: 10, y: 20, box: { x: 10, y: 10, width: 80, height: 15 }, baselineUncertain: false },
    ],
  });
  const figure: LaidOutFigure = { width: 200, height: 200, background: "#fff", elements: [owner, label] };

  const checks = runChecks(figure);
  const shapeCheck = checks.find((c) => c.id === "label-within-shape" && c.target === "text-1");
  const boxCheck = checks.find((c) => c.id === "text-fits-box" && c.target === "text-1");
  assert.equal(boxCheck?.status, "pass");
  assert.equal(shapeCheck?.status, "fail");
  assert.equal(shapeCheck?.ownerId, "box-1");
  assert.ok(shapeCheck?.detail?.includes("diamond"));
});

test("a short line safely inside a diamond's inscribed area passes label-within-shape", () => {
  const owner = box({
    id: "box-1",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    content: { x: 10, y: 10, width: 80, height: 80 },
    shape: "diamond",
  });
  const label = text({
    ownerId: "box-1",
    lines: [{ text: "ok", x: 40, y: 55, box: { x: 40, y: 45, width: 20, height: 12 }, baselineUncertain: false }],
  });
  const figure: LaidOutFigure = { width: 200, height: 200, background: "#fff", elements: [owner, label] };

  const check = runChecks(figure).find((c) => c.id === "label-within-shape" && c.target === "text-1");
  assert.equal(check?.status, "pass");
});

// A single-box figure has no pair of boxes to compare, so boxes-do-not-overlap
// now reports "not-applicable" rather than a vacuous pass. The meaningful
// assertion is that a clean figure produces no FAILURES; claiming every check
// passed would credit the figure with verification that never happened.
test("a clean figure produces no failures", () => {
  const owner = box({ id: "box-1", x: 0, y: 0, width: 100, height: 100, content: { x: 5, y: 5, width: 90, height: 90 } });
  const label = text({
    ownerId: "box-1",
    lines: [
      { text: "hi", x: 10, y: 20, box: { x: 10, y: 10, width: 20, height: 12 }, baselineUncertain: false },
    ],
  });
  const figure: LaidOutFigure = { width: 200, height: 200, background: "#fff", elements: [owner, label] };

  const checks = runChecks(figure);
  assert.ok(checks.length > 0);
  for (const check of checks) assert.notEqual(check.status, "fail", check.detail);
  // And at least one check must have actually examined something, or the
  // figure is "clean" only in the sense that nothing looked at it.
  assert.ok(
    checks.some((check) => check.status === "pass"),
    "every check was not-applicable; nothing was actually verified",
  );
});
