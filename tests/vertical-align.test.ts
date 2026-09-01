/**
 * `verticalAlign` moves a label down its own box.
 *
 * Flow layout puts a label at the top of the padding box, which is only the
 * right answer when the box hugs its text. With a fixed height there was no
 * way to say otherwise, and every figure that wanted a centred label had to
 * draw the box unlabelled and lay a second block over it by hand.
 *
 * Three things have to hold together, and the last is the one that makes this
 * a feature rather than a stylesheet tweak:
 *   - a block that does not ask for it is emitted exactly as before,
 *   - the browser really does move the label, and
 *   - the repair loop still fits an overflowing label, even though a centred
 *     one overflows *upward* — which it used to call unrepairable.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHtml } from "../src/layout/html.ts";
import { parseSpec, SpecError } from "../src/ir/types.ts";
import { planRepairs, newBudget } from "../src/repair.ts";
import { render } from "../src/pipeline.ts";
import type { Check } from "../src/checks.ts";
import type { LaidOutFigure, PlacedBox, PlacedText } from "../src/ir/types.ts";

// --- emission ---------------------------------------------------------------

const blockSpec = (verticalAlign?: string) =>
  parseSpec({
    version: 1,
    root: {
      type: "block", id: "b", label: "hello", width: 200, height: 120,
      ...(verticalAlign === undefined ? {} : { verticalAlign }),
    },
  });

test("a block that does not ask for it is emitted exactly as before", () => {
  const withoutProp = buildHtml(blockSpec()).html;
  const withStart = buildHtml(blockSpec("start")).html;
  assert.equal(withStart, withoutProp, "an explicit \"start\" must not change the output");
  assert.ok(!withoutProp.includes("display: flex"), "no flex context should be emitted");
});

test("centre and end emit a column flex context the label can sit in", () => {
  const centred = buildHtml(blockSpec("center")).html;
  assert.match(centred, /display: flex/);
  assert.match(centred, /flex-direction: column/);
  assert.match(centred, /justify-content: center/);

  const end = buildHtml(blockSpec("end")).html;
  assert.match(end, /justify-content: flex-end/);
});

test("an unrecognised value is refused rather than quietly ignored", () => {
  // Passing it through would emit CSS the browser drops: the label would sit
  // where it always did and nothing would say why.
  assert.throws(() => blockSpec("middle"), SpecError);
  assert.throws(() => blockSpec("bottom"), SpecError);
});

// --- repair -----------------------------------------------------------------

function placedBox(overrides: Partial<PlacedBox> = {}): PlacedBox {
  return {
    kind: "box", id: "b1", x: 0, y: 0, width: 100, height: 50,
    fill: "#fff", stroke: "#000", strokeWidth: 1, radius: 0,
    content: { x: 5, y: 5, width: 90, height: 40 },
    ...overrides,
  };
}

const splitOverflow = (top: number, bottom: number): Check => ({
  id: "text-fits-box",
  target: "text-1",
  status: "fail",
  ownerId: "b1",
  overflow: { left: 0, top, right: 0, bottom },
  detail: `overflows by ${top}px above and ${bottom}px below`,
});

test("a centred label that overflows both ways is grown by the whole deficit", () => {
  const box = placedBox({ height: 50, verticalAlign: "center" });
  const figure: LaidOutFigure = { width: 500, height: 500, background: "#fff", elements: [box] };

  const plan = planRepairs([splitOverflow(12, 12)], figure, 1, newBudget(3));

  assert.equal(plan.unrepairable.length, 0, "upward overflow must not be called unrepairable");
  assert.equal(plan.edits.length, 1);
  // 50 + 24 + 1px slack. Growing by the bottom alone would close half the gap,
  // then half the remainder, and never actually fit.
  assert.equal(plan.edits[0]?.property, "height");
  assert.equal(plan.edits[0]?.to, 75);
});

test("a start-aligned label overflowing upward is still reported as unrepairable", () => {
  // Nothing in flow layout can produce this, so it means something upstream is
  // wrong and growing the box would hide it. That guard has to survive.
  const box = placedBox({ height: 50, verticalAlign: "start" });
  const figure: LaidOutFigure = { width: 500, height: 500, background: "#fff", elements: [box] };

  const plan = planRepairs([splitOverflow(12, 0)], figure, 1, newBudget(3));

  assert.equal(plan.edits.length, 0);
  assert.equal(plan.unrepairable.length, 1);
  assert.match(plan.unrepairable[0]!.why, /starts before its content box/);
});

test("a bottom-only overflow is unchanged, message included", () => {
  const box = placedBox({ height: 50 });
  const figure: LaidOutFigure = { width: 500, height: 500, background: "#fff", elements: [box] };

  const plan = planRepairs([splitOverflow(0, 10)], figure, 1, newBudget(3));

  assert.equal(plan.edits.length, 1);
  assert.equal(plan.edits[0]?.to, 61);
  assert.equal(plan.edits[0]?.reason, "label overflows bottom by 10px");
});

// --- the browser actually does it -------------------------------------------

test(
  "the browser really moves the label, and the move is read back",
  { timeout: 120000 },
  async () => {
    const spec = parseSpec({
      version: 1,
      canvas: { padding: 0 },
      root: {
        type: "stack", direction: "row", gap: 10, align: "start",
        children: [
          { type: "block", id: "top", label: "x", width: 120, height: 200 },
          { type: "block", id: "mid", label: "x", width: 120, height: 200, verticalAlign: "center" },
          { type: "block", id: "low", label: "x", width: 120, height: 200, verticalAlign: "end" },
        ],
      },
    });

    const result = await render(spec);
    const baselineOf = (ownerId: string): number => {
      const text = result.figure.elements.find(
        (e): e is PlacedText => e.kind === "text" && e.ownerId === ownerId,
      );
      assert.ok(text, `no label for ${ownerId}`);
      return text.lines[0]!.y;
    };

    const top = baselineOf("top");
    const mid = baselineOf("mid");
    const low = baselineOf("low");

    assert.ok(mid > top + 50, `centre (${mid}) should sit well below start (${top})`);
    assert.ok(low > mid + 50, `end (${low}) should sit well below centre (${mid})`);
    assert.equal(result.manifest.ok, true);

    // Read back from computed style, not copied from the spec.
    const boxOf = (id: string) =>
      result.figure.elements.find((e): e is PlacedBox => e.kind === "box" && e.id === id);
    assert.equal(boxOf("top")?.verticalAlign, "start");
    assert.equal(boxOf("mid")?.verticalAlign, "center");
    assert.equal(boxOf("low")?.verticalAlign, "end");
  },
);

test(
  "a centred label too tall for its box is repaired, and fits afterwards",
  { timeout: 120000 },
  async () => {
    // The box starts at 90px, not 40px, and the reason is worth stating: the
    // repair budget is 3x a node's original size, so at 40px this figure was
    // only repairable if the label wrapped to few enough lines -- which is a
    // fact about the FONT, not about the feature under test. It fitted in
    // Segoe UI and did not fit in the bundled face, so the assertion was
    // measuring the ambient font of whatever machine ran it. At 90px the
    // label is still far too tall for its box and the growth needed is
    // comfortably inside budget either way.
    const spec = parseSpec({
      version: 1,
      root: {
        type: "block", id: "tight", width: 130, height: 90,
        verticalAlign: "center", textAlign: "center",
        label: "a centred label far too tall for the box it was given",
      },
    });

    const result = await render(spec);
    assert.equal(result.manifest.ok, true, "the figure should end up green");
    const grew = result.manifest.repairs?.some(
      (edit) => edit.target === "tight" && edit.property === "height",
    );
    assert.ok(grew, "the box should have been grown to fit");
  },
);
