import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecks } from "../src/checks.ts";
import { render } from "../src/pipeline.ts";
import { parseSpec } from "../src/ir/types.ts";
import type { LaidOutFigure, PlacedBox } from "../src/ir/types.ts";

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

function figure(elements: PlacedBox[]): LaidOutFigure {
  return { width: 300, height: 300, background: "#fff", elements };
}

function declaredCheck(elements: PlacedBox[]) {
  return runChecks(figure(elements)).find((c) => c.id === "declared-size-honoured");
}

// --- the unit: a request against a measurement -------------------------------

test("a box drawn at the size it asked for passes", () => {
  const check = declaredCheck([box({ width: 100, height: 40, declared: { width: 100, height: 40 } })]);
  assert.equal(check?.status, "pass");
  assert.equal(check?.examined, 1);
});

test("a box drawn larger than it asked for fails, and the detail carries both numbers", () => {
  const check = declaredCheck([box({ width: 200, height: 28, declared: { height: 3 } })]);
  assert.equal(check?.status, "fail");
  assert.match(check?.detail ?? "", /asked for height 3 and got 28/);
});

test("width and height are reported independently, not as one size", () => {
  const check = declaredCheck([box({ width: 28, height: 28, declared: { width: 3, height: 3 } })]);
  assert.equal(check?.status, "fail");
  assert.match(check?.detail ?? "", /2 declared size\(s\)/);
  assert.match(check?.detail ?? "", /asked for width 3/);
  assert.match(check?.detail ?? "", /asked for height 3/);
});

test("an axis the author left auto claims nothing and cannot fail", () => {
  // Only `height` was fixed; the width came out wherever layout put it, which
  // is not a broken promise because no promise was made.
  const check = declaredCheck([box({ width: 137, height: 40, declared: { height: 40 } })]);
  assert.equal(check?.status, "pass");
});

test("a figure where no block declares a size is not-applicable, not a vacuous pass", () => {
  // The same standard the rest of this file holds: a check that examined
  // nothing has verified nothing.
  const check = declaredCheck([box({ declared: undefined })]);
  assert.equal(check?.status, "not-applicable");
  assert.equal(check?.examined, 0);
});

test("sub-pixel drift is not a violation", () => {
  const check = declaredCheck([box({ width: 100.3, height: 40, declared: { width: 100, height: 40 } })]);
  assert.equal(check?.status, "pass");
});

// --- end to end: the defect that prompted the check --------------------------

function thinBar(padding?: number) {
  return parseSpec({
    version: 1,
    canvas: { padding: 10, theme: "print" },
    root: {
      type: "scene",
      layout: "absolute",
      width: 300,
      height: 120,
      children: [
        {
          type: "block",
          id: "rule",
          x: 20,
          y: 20,
          width: 200,
          height: 3,
          fill: "#222",
          stroke: "none",
          label: "",
          ...(padding === undefined ? {} : { padding }),
        },
      ],
    },
  });
}

test(
  "a 3px rule under default padding is drawn at 28px, and the figure now says so",
  { timeout: 60000 },
  async () => {
    // Found while drawing an inclined plane. `box-sizing: border-box` makes a
    // height below padding-plus-border unsatisfiable, and CSS grows the box.
    // The figure stays well-formed, so every other check passes it -- which is
    // exactly why this one has to exist.
    const result = await render(thinBar());
    const check = result.manifest.checks.find((c) => c.id === "declared-size-honoured");
    assert.equal(check?.status, "fail");
    assert.match(check?.detail ?? "", /rule asked for height 3 and got 28/);
  },
);

test(
  "the same rule with padding 0 is drawn at 3px and passes",
  { timeout: 60000 },
  async () => {
    // The floor is padding plus border, not an arbitrary minimum: remove the
    // padding and the declared height is honoured exactly.
    const result = await render(thinBar(0));
    const check = result.manifest.checks.find((c) => c.id === "declared-size-honoured");
    assert.equal(check?.status, "pass");
  },
);

test(
  "a repaired block is measured against its REPAIRED size, not its original one",
  { timeout: 120000 },
  async () => {
    // The repair loop's whole job is to change a declared size. If this check
    // compared against the author's superseded number it would fail every
    // figure the loop successfully fixed, which would make it useless.
    //
    // The height here is deliberately clear of the padding-and-border floor:
    // a first draft used 24, which is BELOW it, so the block violated its own
    // declaration before the repair loop was involved at all and the test
    // failed for a reason it was not written to test.
    const spec = parseSpec({
      version: 1,
      root: {
        type: "block",
        id: "grows",
        label: "a label far too long for the box it was given",
        width: 60,
        height: 40,
      },
    });
    const result = await render(spec);
    assert.ok(result.manifest.repairs.length > 0, "expected the loop to resize this block");
    const check = result.manifest.checks.find((c) => c.id === "declared-size-honoured");
    assert.equal(check?.status, "pass");
  },
);
