/**
 * The didactic checks (ADR 0024), each with a figure that fails and one that
 * passes. Built as laid-out figures directly: these checks read geometry
 * and metadata the pipeline already carries, so no browser is needed to
 * pin what they decide.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecks } from "../src/checks.ts";
import type { Check } from "../src/checks.ts";
import type { LaidOutFigure, PlacedBox, PlacedMark, PlacedText, Point } from "../src/ir/types.ts";

function box(id: string, x: number, y: number, width: number, height: number, extra: Partial<PlacedBox> = {}): PlacedBox {
  return {
    kind: "box", id, x, y, width, height, fill: "transparent", stroke: "transparent", strokeWidth: 0, radius: 0,
    content: { x, y, width, height }, ...extra,
  };
}

function text(id: string, owner: string, value: string, x: number, y: number, width = 20, height = 16): PlacedText {
  return {
    kind: "text", id, ownerId: owner, fontFamily: "Arial", fontSize: 11, fill: "#000", anchor: "center",
    lines: [{ text: value, x: x + width / 2, y: y + height - 4, box: { x, y, width, height }, baselineUncertain: false }],
  };
}

function curve(id: string, points: Point[], extra: Partial<PlacedMark> = {}): PlacedMark {
  return {
    kind: "mark", id, points, closed: false, fill: "none", stroke: "#1D4E89", strokeWidth: 2, lineStyle: "solid",
    arcCentres: [], ...extra,
  };
}

const figure = (elements: LaidOutFigure["elements"]): LaidOutFigure => ({
  width: 600, height: 400, background: "#FCFBF7", elements,
});

const check = (f: LaidOutFigure, id: string): Check => {
  const found = runChecks(f).find((c) => c.id === id);
  assert.ok(found, `${id} did not run`);
  return found!;
};

// Two horizontal curves 100px apart.
const upper = (extra: Partial<PlacedMark> = {}) => curve("f", [{ x: 50, y: 100 }, { x: 550, y: 100 }], { series: "f", ...extra });
const lower = (extra: Partial<PlacedMark> = {}) => curve("g", [{ x: 50, y: 200 }, { x: 550, y: 200 }], { series: "g", stroke: "#B3400C", ...extra });

// --- series-distinguishable-without-colour ------------------------------------

test("series-distinguishable-without-colour fails two solid series told apart only by colour", () => {
  const c = check(figure([upper(), lower()]), "series-distinguishable-without-colour");
  assert.equal(c.status, "fail");
  assert.match(c.detail!, /f \(solid, like g\)/);
});

test("…a legend does not rescue it: legend rows name no series", () => {
  const legend = box("legend-1", 400, 20, 120, 18);
  const c = check(figure([upper(), lower(), legend, text("legend-1--label", "legend-1", "f(x)", 400, 20)]), "series-distinguishable-without-colour");
  assert.equal(c.status, "fail");
});

test("series-distinguishable-without-colour passes with a direct label on each", () => {
  const a = box("a", 300, 70, 40, 18, { names: "f" });
  const b = box("b", 300, 170, 40, 18, { names: "g" });
  const c = check(figure([upper(), lower(), a, b]), "series-distinguishable-without-colour");
  assert.equal(c.status, "pass", c.detail);
});

test("series-distinguishable-without-colour passes when the stroke patterns differ", () => {
  const c = check(figure([upper(), lower({ lineStyle: "dashed" })]), "series-distinguishable-without-colour");
  assert.equal(c.status, "pass", c.detail);
});

test("series-distinguishable-without-colour is not applicable to a single series", () => {
  assert.equal(check(figure([upper()]), "series-distinguishable-without-colour").status, "not-applicable");
});

// --- curve-label-nearest-its-curve --------------------------------------------

test("curve-label-nearest-its-curve fails a label that names f but sits beside g", () => {
  const misplaced = box("lbl", 300, 180, 40, 16, { names: "f" });
  const c = check(figure([upper(), lower(), misplaced]), "curve-label-nearest-its-curve");
  assert.equal(c.status, "fail");
  assert.match(c.detail!, /lbl names f .* from g/);
});

test("curve-label-nearest-its-curve passes a label beside the curve it names", () => {
  const placed = box("lbl", 300, 76, 40, 16, { names: "f" });
  const c = check(figure([upper(), lower(), placed]), "curve-label-nearest-its-curve");
  assert.equal(c.status, "pass", c.detail);
});

test("curve-label-nearest-its-curve measures a series across all its runs", () => {
  // f leaves the plot and comes back: two runs, one series.
  const run1 = curve("f-1", [{ x: 50, y: 100 }, { x: 200, y: 100 }], { series: "f" });
  const run2 = curve("f-2", [{ x: 400, y: 190 }, { x: 550, y: 190 }], { series: "f" });
  const g = curve("g", [{ x: 50, y: 300 }, { x: 550, y: 300 }], { series: "g" });
  const label = box("lbl", 450, 170, 40, 16, { names: "f" });
  assert.equal(check(figure([run1, run2, g, label]), "curve-label-nearest-its-curve").status, "pass");
});

// --- axis-number-present ------------------------------------------------------

const tick = (value: number, at: Point) =>
  curve(`req-${value}`, [at, at], { stroke: "none", strokeWidth: 0, gridOf: "plane", tick: { axis: "y", value, within: 20, reach: 44 } });

test("axis-number-present fails when a required number is missing", () => {
  const c = check(figure([tick(4, { x: 100, y: 120 }), box("t", 60, 192, 20, 16), text("t--label", "t", "8", 60, 192)]), "axis-number-present");
  assert.equal(c.status, "fail");
  assert.match(c.detail!, /y = 4/);
});

test("axis-number-present fails a number printed nearer the next tick than its own", () => {
  // "4" printed 30px below its tick, past half a division (20px).
  const c = check(figure([tick(4, { x: 100, y: 120 }), box("t", 70, 142, 20, 16), text("t--label", "t", "4", 70, 142)]), "axis-number-present");
  assert.equal(c.status, "fail");
});

test("axis-number-present passes a number at its tick, in the figure's own spelling", () => {
  const c = check(
    figure([
      tick(4, { x: 100, y: 120 }),
      tick(-1, { x: 100, y: 245 }),
      tick(2.5, { x: 100, y: 157 }),
      box("a", 70, 112, 20, 16), text("a--label", "a", "4", 70, 112),
      box("b", 62, 237, 28, 16), text("b--label", "b", "−1", 62, 237, 28),
      // Slid along its gridline to the far side of the axis: still its own.
      box("c", 112, 149, 28, 16), text("c--label", "c", "2,5", 112, 149, 28),
    ]),
    "axis-number-present",
  );
  assert.equal(c.status, "pass", c.detail);
  assert.equal(c.examined, 3);
});

test("axis-number-present is not applicable when no axis requires a number", () => {
  assert.equal(check(figure([upper()]), "axis-number-present").status, "not-applicable");
});
