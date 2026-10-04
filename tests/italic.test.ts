import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "../src/pipeline.ts";
import { parseSpec, SpecError } from "../src/ir/types.ts";
import type { PlacedText } from "../src/ir/types.ts";

/**
 * ADR 0078: italic text, for a whole label or for one run, measured by its ink
 * so that the checks see the lean an italic glyph has past its advance.
 */

const SERIF = '"Times New Roman", Georgia, serif';

function scene(block: Record<string, unknown>, extraMarks: unknown[] = []) {
  return {
    version: 1,
    canvas: { padding: 0, constraints: { allowOverlap: true } },
    root: {
      type: "scene",
      layout: "absolute",
      width: 300,
      height: 140,
      marks: extraMarks,
      children: [
        {
          type: "block",
          id: "tag",
          x: 40,
          y: 30,
          width: 200,
          height: 80,
          padding: 0,
          fill: "none",
          stroke: "none",
          wrap: "none",
          fontSize: 64,
          fontFamily: SERIF,
          freeStanding: true,
          ...block,
        },
      ],
    },
  };
}

const labelOf = (figure: { elements: unknown[] }) =>
  figure.elements.find((element): element is PlacedText => (element as PlacedText).kind === "text")!;

test("fontStyle takes only normal or italic, on a block and on a run", () => {
  assert.throws(
    () => parseSpec(scene({ label: "f", fontStyle: "oblique" })),
    (error: unknown) => error instanceof SpecError && /fontStyle must be "normal" or "italic"/.test(error.message),
  );
  assert.throws(
    () => parseSpec(scene({ label: "f", runs: [{ text: "f", fontStyle: "slanted" }] })),
    (error: unknown) => error instanceof SpecError && /runs\[0\]\.fontStyle/.test(error.message),
  );
});

test("an italic label is drawn italic and measured by its ink, not just its advance", { timeout: 60000 }, async () => {
  const upright = await render(parseSpec(scene({ label: "f" })));
  const italic = await render(parseSpec(scene({ label: "f", fontStyle: "italic" })));
  assert.match(italic.svg, /font-style="italic"/);
  assert.doesNotMatch(upright.svg, /font-style=/);
  const up = labelOf(upright.figure).lines[0]!.box;
  const it = labelOf(italic.figure).lines[0]!.box;
  // An italic f leans well past where the next letter would start.
  assert.ok(it.x + it.width > up.x + up.width + 2, `italic ink right ${it.x + it.width} vs upright ${up.x + up.width}`);
});

test("text-clear-of-ink sees the lean: a line in the italic overhang is caught", { timeout: 60000 }, async () => {
  const first = await render(parseSpec(scene({ label: "f", fontStyle: "italic" })));
  const box = labelOf(first.figure).lines[0]!.box;
  // A vertical rule one pixel inside the ink's right edge, crossing the glyph's upper half.
  const x = box.x + box.width - 1;
  const rule = { id: "rule", from: { x, y: box.y }, segments: [{ line: { x, y: box.y + box.height / 2 } }], close: false, stroke: "#111111", strokeWidth: 2 };
  const result = await render(parseSpec(scene({ label: "f", fontStyle: "italic" }, [rule])), { repair: false });
  const clear = result.manifest.checks.filter((c) => c.id === "text-clear-of-ink");
  assert.ok(clear.some((c) => c.status === "fail"), JSON.stringify(clear));
});

test("a run sets its own style: italic m, upright subscript and units", { timeout: 60000 }, async () => {
  const runs = [
    { text: "m", fontStyle: "italic" },
    { text: "1", script: "sub" },
    { text: " = 4 kg" },
  ];
  const result = await render(parseSpec(scene({ label: "m1 = 4 kg", runs, fontSize: 28 })));
  const line = labelOf(result.figure).lines[0]!;
  assert.deepEqual(
    line.runs!.map((run) => [run.text, run.fontStyle ?? "normal"]),
    [["m", "italic"], ["1", "normal"], [" = 4 kg", "normal"]],
  );
  assert.match(result.svg, /<tspan[^>]*font-style="italic"[^>]*>m<\/tspan>/);
  // The plain string every check and screen reader reads is the ordinary letters.
  assert.equal(line.text, "m1 = 4 kg");
});
