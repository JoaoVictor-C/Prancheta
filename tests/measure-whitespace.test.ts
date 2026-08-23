/**
 * SLOW TEST: launches a real Chromium browser. The defect it guards against
 * only exists in the gap between what the browser rendered and what we wrote
 * out, so nothing short of the real pipeline can see it.
 *
 * The bug: CSS collapses a run of spaces to one. The second and third get a
 * client rect with zero width but a full line's height, so they survived the
 * zero-size filter, contributed nothing to the measured extent, and were still
 * appended to the string we exported. The SVG carries xml:space="preserve", so
 * they were then drawn at full width — a label measurably wider than the box
 * measured for it, with every check downstream agreeing with the measurement
 * and none of them able to see the drawing.
 *
 * It surfaced through the effects layer, which is the first thing that depends
 * on a text box being truthful: a filter region computed from the measured
 * width sliced the last several characters off the label. Without a filter the
 * same figure looked merely a little wide, and passed.
 *
 * The invariant under test is the one the whole project rests on: THE STRING
 * MEASURED IS THE STRING DRAWN.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "../src/pipeline.ts";
import { parseSpec } from "../src/ir/types.ts";
import type { FigureSpec, PlacedText } from "../src/ir/types.ts";

function specWith(label: string): FigureSpec {
  return parseSpec({
    version: 1,
    root: { type: "block", id: "subject", label, width: 460 },
  });
}

test(
  "a collapsed run of spaces is not exported as drawn text",
  { timeout: 120000 },
  async () => {
    const result = await render(specWith("Disk seek   ·   10 ms   ·   20 million × L1"));

    const text = result.figure.elements.find(
      (element): element is PlacedText => element.kind === "text",
    );
    assert.ok(text, "the figure should carry a label");

    const drawn = text.lines.map((line) => line.text).join("");
    assert.equal(
      /\s\s/.test(drawn),
      false,
      `exported label still holds a collapsed run: ${JSON.stringify(drawn)}`,
    );
    // The content is all still there — this trims what CSS already discarded,
    // it does not shorten the label.
    assert.match(drawn, /20 million × L1$/);
    assert.equal(result.manifest.ok, true);
  },
);

test(
  "the measured box is wide enough for the text that gets drawn",
  { timeout: 120000 },
  async () => {
    // Same label with the runs already collapsed by hand. If measurement and
    // emission agree, the two must measure the same width — that equality IS
    // the invariant, and it was off by about 45px before the fix.
    const spaced = await render(specWith("Disk seek   ·   10 ms   ·   20 million × L1"));
    const single = await render(specWith("Disk seek · 10 ms · 20 million × L1"));

    const widthOf = (result: Awaited<ReturnType<typeof render>>): number => {
      const text = result.figure.elements.find(
        (element): element is PlacedText => element.kind === "text",
      );
      assert.ok(text);
      return text.lines[0]!.box.width;
    };

    assert.ok(
      Math.abs(widthOf(spaced) - widthOf(single)) < 1,
      `a label written with collapsed runs measured ${widthOf(spaced)}px against ` +
        `${widthOf(single)}px for the same rendered text`,
    );
  },
);

test(
  "a zero-width mark that is part of a glyph is kept",
  { timeout: 120000 },
  async () => {
    // The fix drops zero-width WHITESPACE only. A combining acute has a
    // zero-width rect of its own and genuinely was measured with the letter it
    // sits on, so dropping it would silently change the word.
    // Written decomposed, with the mark as an explicit escape: the point is
    // a separate zero-width code point, and a precomposed "é" in the
    // source would test nothing while looking identical in a diff.
    const MARK = "́";
    const result = await render(specWith(`cafe${MARK} latte`));
    const text = result.figure.elements.find(
      (element): element is PlacedText => element.kind === "text",
    );
    assert.ok(text);
    const drawn = text.lines.map((line) => line.text).join("");
    assert.ok(
      drawn.includes(MARK),
      `combining mark was dropped from ${JSON.stringify(drawn)}`,
    );
  },
);
