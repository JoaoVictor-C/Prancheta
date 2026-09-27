/**
 * Author strings that reach the HTML mirror's `style` attribute.
 *
 * The mirror's style attribute is delimited with double quotes, and its
 * declarations are built from strings the author supplies -- `fontFamily`,
 * `textColor`, a `fill`/`stroke` colour, a per-side border colour. Only the
 * gradient-stop colour is validated to a shape that excludes a quote; the
 * rest are free-form by design, and a family stack is the one that carries a
 * quote as a matter of course: `"Iowan Old Style", Georgia, serif` is the
 * shape every pack in typography.ts writes.
 *
 * Interpolated raw, the first `"` in a value closed the attribute, and the
 * family plus EVERY declaration after it -- weight, tracking, colour -- was
 * parsed as stray attributes and dropped. Nothing could catch it downstream:
 * the SVG carries what Chromium computed, not what the spec asked for, so the
 * mirror measured the wrong face and the drawing drew the same wrong face.
 * The two agreed with each other and no check compares either against the
 * declaration. Unquoted multi-word names (`Palatino Linotype, Georgia`) kept
 * working the whole time, which is why it looked like the feature worked.
 *
 * So the assertions come in pairs: the value survives escaping intact, AND
 * the declarations that follow it in the list are still inside the attribute.
 * The second half is the one that was actually broken.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHtml } from "../src/layout/html.ts";
import { parseSpec } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";

const QUOTED_STACK = '"Palatino Linotype", Georgia, serif';

/** The value of the block's own style attribute -- `[^"]*` stops at the first closing quote, which is exactly the bug's mechanism. */
function boxStyle(html: string): string {
  const match = html.match(/data-pr-box="[^"]*" style="([^"]*)"/);
  assert.ok(match, "the mirror must emit a style attribute for the block");
  return match[1]!;
}

// --- emission ---------------------------------------------------------------

test("a quoted family stack does not close the style attribute", () => {
  const spec = parseSpec({
    version: 1,
    root: {
      type: "block", id: "a", label: "Hello", width: 300,
      fontFamily: QUOTED_STACK, fontSize: 22,
    },
  });
  const style = boxStyle(buildHtml(spec).html);
  assert.match(style, /font-family: &quot;Palatino Linotype&quot;, Georgia, serif/);
  assert.ok(!style.includes('"'), "a raw quote would end the attribute here");
});

test("every declaration after the family is still inside the attribute", () => {
  // The failure this file exists for. `fontFamily` is emitted mid-list, so a
  // quote in it truncated the weight, the tracking and the colour too -- the
  // font was the symptom that got noticed, not the extent of the damage.
  const spec = parseSpec({
    version: 1,
    root: {
      type: "block", id: "a", label: "Hello", width: 300,
      fontFamily: QUOTED_STACK, fontSize: 22,
      fontWeight: 700, letterSpacing: -1.2, textColor: "#123456",
    },
  });
  const style = boxStyle(buildHtml(spec).html);
  assert.match(style, /font-weight: 700/);
  assert.match(style, /letter-spacing: -1\.2px/);
  assert.match(style, /color: #123456/);
});

test("the other free-form author strings are escaped the same way", () => {
  // None of these is validated to a shape that excludes a quote, so each one
  // could close the attribute exactly as the family did. They are measurement
  // stand-ins rather than what gets drawn, but a truncated attribute drops
  // whatever follows regardless of what the value itself meant.
  const spec = parseSpec({
    version: 1,
    root: {
      type: "block", id: "a", label: "Hello", width: 300,
      fill: 'var(--x, "white")',
      stroke: 'var(--y, "black")',
      textColor: 'var(--z, "red")',
      border: { top: { color: 'var(--w, "grey")' } },
    },
  });
  const style = boxStyle(buildHtml(spec).html);
  assert.ok(!style.includes('"'), "no raw quote may survive into the attribute");
  assert.match(style, /color: var\(--z, &quot;red&quot;\)/);
  assert.match(style, /border-top: .*var\(--w, &quot;grey&quot;\)/);
});

test("a value with no quote in it is emitted byte-for-byte as before", () => {
  // Escaping must not become a second way for a declaration to change
  // meaning: an unquoted stack is what has worked all along, and it has to
  // keep producing identical bytes or this fix trades one silent shift for
  // another.
  const spec = parseSpec({
    version: 1,
    root: {
      type: "block", id: "a", label: "Hello", width: 300,
      fontFamily: "Palatino Linotype, Georgia, serif",
    },
  });
  assert.match(boxStyle(buildHtml(spec).html), /font-family: Palatino Linotype, Georgia, serif/);
});

// --- end to end -------------------------------------------------------------

test(
  "the emitted SVG names the quoted family the spec asked for",
  { timeout: 60000 },
  async () => {
    // The assertion that matters: not that the mirror looks right, but that
    // the face Chromium MEASURED is the one the spec declared. Before the
    // fix this named the theme's stack and nothing else -- the declaration
    // never reached the browser at all.
    //
    // Machine-independent by construction: pipeline.ts hoists the face
    // Chromium actually resolved to the front of the stack and keeps the rest
    // behind it, so the declared name appears whether or not the host has the
    // font installed -- first on a machine that has it, later on one that
    // does not.
    const spec = parseSpec({
      version: 1,
      canvas: { padding: 20, theme: "print" },
      root: {
        type: "block", id: "a", label: "Hello", width: 300, height: 40,
        fontFamily: QUOTED_STACK, fontSize: 22,
        fontWeight: 700, letterSpacing: -1.2,
      },
    });
    const { svg } = await render(spec);
    const text = svg.match(/<text[^>]*data-pr-id="a--label"[^>]*>/)?.[0];
    assert.ok(text, "the label must be drawn as <text>");
    assert.match(text, /Palatino Linotype/, "the declared family must reach the SVG");
    // Emitted only when they differ from the default, so their presence is
    // proof the declarations after `font-family` survived the attribute.
    assert.match(text, /font-weight="700"/);
    assert.match(text, /letter-spacing="-1.2"/);
  },
);
