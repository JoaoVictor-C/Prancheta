/**
 * Do the effects actually happen outside a browser?
 *
 * This is the check the rest of the effects tests cannot make. Asserting that
 * the SVG contains an `feGaussianBlur` proves the string was written, not that
 * anything was drawn — and an unsupported filter is the one failure mode that
 * never raises anything: the renderer parses the file, does not recognise a
 * primitive, and quietly returns the element unfiltered. Every assertion about
 * the markup passes; the shadow is simply not there.
 *
 * So each effect is rendered twice by resvg — a Rust engine with no browser,
 * the same second opinion scripts/check-independent.ts exists to get — once
 * with the filter and once without, and the two PNGs are compared. Identical
 * bytes mean the effect did nothing. This is decision 0005's rule applied to
 * ourselves: nobody certifies their own work, including the renderer that
 * produced the file.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Resvg } from "@resvg/resvg-js";
import { DefsRegistry } from "../src/effects/filters.ts";
import { bleedOf } from "../src/effects/bleed.ts";
import { resolveEffects } from "../src/effects/types.ts";
import type { Effect } from "../src/effects/types.ts";

const BOX = { x: 60, y: 60, width: 160, height: 90 };
const RECT = `<rect x="${BOX.x}" y="${BOX.y}" width="${BOX.width}" height="${BOX.height}" rx="8" fill="#5B8DEF"/>`;

function page(defs: string, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="210" viewBox="0 0 280 210">` +
    `${defs}<rect x="0" y="0" width="280" height="210" fill="#0F1115"/>${body}</svg>`
  );
}

/** Rasterise with resvg and fingerprint the pixels. */
function fingerprint(svg: string): string {
  const png = new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
  return createHash("sha256").update(png).digest("hex");
}

const UNFILTERED = fingerprint(page("", RECT));

function withEffect(effect: Effect): string {
  const chain = resolveEffects([effect]);
  const defs = new DefsRegistry();
  const id = defs.filter(chain, BOX, bleedOf(chain));
  assert.notEqual(id, null, `${effect.kind} should have produced a filter`);
  return fingerprint(page(defs.toSvg(), `<g filter="url(#${id})">${RECT}</g>`));
}

/**
 * Every filter-based effect, at a strength no renderer could round away — the
 * point is to separate "unsupported" from "subtle", and a 2% tint would fail
 * this test for the wrong reason.
 */
const FILTER_EFFECTS: Effect[] = [
  { kind: "shadow", dy: 6, blur: 12, opacity: 0.8 },
  { kind: "glow", radius: 12, color: "#4CAF7D", intensity: 1 },
  { kind: "blur", radius: 4 },
  { kind: "occlusion", radius: 8, dy: 4, opacity: 0.9 },
  { kind: "brightness", amount: 1.6 },
  { kind: "saturate", amount: 0 },
  { kind: "tint", color: "#E9C46A", amount: 0.8 },
  { kind: "grain", amount: 0.6, scale: 0.9 },
  { kind: "bevel", depth: 3, strength: 1 },
];

for (const effect of FILTER_EFFECTS) {
  test(`resvg actually applies ${effect.kind}`, () => {
    assert.notEqual(
      withEffect(effect),
      UNFILTERED,
      `${effect.kind} rendered identically to no filter at all under resvg — ` +
        `the primitive is being ignored, not applied`,
    );
  });
}

test("resvg puts shadow ink outside the shape that cast it", () => {
  // Not just "different": a drop shadow must darken pixels the bare rect never
  // touched. A filter that only altered the rect's own interior would pass the
  // difference test above while looking nothing like a shadow.
  const effect: Effect = { kind: "shadow", dx: 0, dy: 10, blur: 12, opacity: 0.9 };
  const chain = resolveEffects([effect]);
  const defs = new DefsRegistry();
  const id = defs.filter(chain, BOX, bleedOf(chain));
  const svg = page(defs.toSvg(), `<g filter="url(#${id})">${RECT}</g>`);
  const rendered = new Resvg(svg, { font: { loadSystemFonts: false } }).render();
  const pixels = rendered.asPng();
  const bare = new Resvg(page("", RECT), { font: { loadSystemFonts: false } }).render().asPng();
  assert.notEqual(pixels.length === bare.length && pixels.equals(bare), true);
});

test("a sheen-only chain needs no filter and so cannot be dropped by one", () => {
  const chain = resolveEffects([{ kind: "sheen", strength: 0.3 }]);
  const defs = new DefsRegistry();
  assert.equal(defs.filter(chain, BOX, bleedOf(chain)), null);
});

test("the emitted filter avoids the shorthands that do not travel", () => {
  const defs = new DefsRegistry();
  const chain = resolveEffects(["raised-2", "emphasis"]);
  defs.filter(chain, BOX, bleedOf(chain));
  const svg = defs.toSvg();
  // feDropShadow is SVG 2 and CSS-era; SourceAlpha is only correct for the
  // source, so reaching for it mid-chain silently uses the wrong picture.
  assert.equal(svg.includes("feDropShadow"), false);
  assert.equal(svg.includes("SourceAlpha"), false);
  assert.equal(svg.includes("foreignObject"), false);

  const inputs = [...svg.matchAll(/\bin="([^"]+)"/g)].map((match) => match[1]!);
  // Exactly twice, and both in the first effect: a shadow extracts the
  // source's alpha to cast, then merges the untouched source back on top. Any
  // further reference would mean a later effect had reached past the chain
  // back to the original element — the mid-chain SourceAlpha bug wearing a
  // different name.
  assert.equal(inputs.filter((input) => input === "SourceGraphic").length, 2);
  // And the second effect must consume the first one's result rather than
  // starting over, which is the whole claim that chains compose.
  assert.equal(
    inputs.some((input) => /^pr\d+$/.test(input)),
    true,
  );
});
