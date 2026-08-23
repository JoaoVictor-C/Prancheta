import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EffectError,
  resolveEffects,
  appliesToLabel,
  labelChain,
  EFFECT_NAMES,
} from "../src/effects/types.ts";
import type { ResolvedEffect } from "../src/effects/types.ts";
import {
  bleedOf,
  gaussianExtent,
  filterRegion,
  inkBounds,
  needsFilter,
  REGION_PAD,
  NO_BLEED,
  isEmpty,
} from "../src/effects/bleed.ts";
import { DefsRegistry } from "../src/effects/filters.ts";
import { parseSpec, SpecError } from "../src/ir/types.ts";
import type { Rect } from "../src/ir/types.ts";

// ---------------------------------------------------------------------------
// resolveEffects
// ---------------------------------------------------------------------------

test("a known preset name resolves to a chain with defaults filled in", () => {
  const chain = resolveEffects("raised-2");
  assert.equal(chain.length, 1);
  assert.deepEqual(chain[0], {
    kind: "shadow",
    dx: 0,
    dy: 3,
    blur: 8,
    color: "#000000",
    opacity: 0.4,
  });
});

test("an unknown name throws EffectError and the message lists the known names", () => {
  assert.throws(
    () => resolveEffects("not-a-real-effect"),
    (error: unknown) => {
      assert.ok(error instanceof EffectError);
      for (const name of EFFECT_NAMES) {
        assert.ok(
          (error as Error).message.includes(name),
          `expected message to mention "${name}"`,
        );
      }
      return true;
    },
  );
});

test("an array of refs concatenates chains in order", () => {
  const chain = resolveEffects(["raised-1", "seated"]);
  assert.equal(chain.length, 2);
  assert.equal(chain[0].kind, "shadow");
  assert.equal(chain[1].kind, "occlusion");
});

test("a multi-effect preset like recede resolves to 3 effects in the declared order", () => {
  const chain = resolveEffects("recede");
  assert.deepEqual(
    chain.map((e) => e.kind),
    ["blur", "saturate", "brightness"],
  );
});

test("an out-of-range opacity throws EffectError", () => {
  assert.throws(
    () => resolveEffects({ kind: "shadow", opacity: 1.5 }),
    EffectError,
  );
});

test("a negative blur throws EffectError", () => {
  assert.throws(() => resolveEffects({ kind: "shadow", blur: -1 }), EffectError);
});

test("a non-finite number throws EffectError", () => {
  assert.throws(
    () => resolveEffects({ kind: "shadow", dx: Number.POSITIVE_INFINITY }),
    EffectError,
  );
});

test("a bad colour throws EffectError", () => {
  assert.throws(
    () => resolveEffects({ kind: "shadow", color: "not a colour!" }),
    EffectError,
  );
});

test("a hex colour and a colour keyword are both accepted", () => {
  const chain = resolveEffects([
    { kind: "shadow", color: "#5B8DEF" },
    { kind: "shadow", color: "red" },
  ]);
  assert.equal((chain[0] as { color: string }).color, "#5B8DEF");
  assert.equal((chain[1] as { color: string }).color, "red");
});

test("tint with no color throws EffectError", () => {
  assert.throws(() => resolveEffects({ kind: "tint" } as never), EffectError);
});

test("grain gets a fixed default seed", () => {
  const chain = resolveEffects({ kind: "grain" });
  assert.equal((chain[0] as { seed: number }).seed, 7);
});

// ---------------------------------------------------------------------------
// appliesToLabel / labelChain
// ---------------------------------------------------------------------------

test("blur/brightness/saturate/tint/grain follow the label; shadow/glow/occlusion/bevel/sheen do not", () => {
  assert.equal(appliesToLabel("blur"), true);
  assert.equal(appliesToLabel("brightness"), true);
  assert.equal(appliesToLabel("saturate"), true);
  assert.equal(appliesToLabel("tint"), true);
  assert.equal(appliesToLabel("grain"), true);
  assert.equal(appliesToLabel("shadow"), false);
  assert.equal(appliesToLabel("glow"), false);
  assert.equal(appliesToLabel("occlusion"), false);
  assert.equal(appliesToLabel("bevel"), false);
  assert.equal(appliesToLabel("sheen"), false);
});

test("labelChain on recede keeps blur+saturate+brightness, on raised-2 keeps none", () => {
  const recede = labelChain(resolveEffects("recede"));
  assert.equal(recede.length, 3);
  assert.deepEqual(
    recede.map((e) => e.kind),
    ["blur", "saturate", "brightness"],
  );
  const raised2 = labelChain(resolveEffects("raised-2"));
  assert.equal(raised2.length, 0);
});

// ---------------------------------------------------------------------------
// bleedOf
// ---------------------------------------------------------------------------

test("an empty chain has no bleed", () => {
  assert.deepEqual(bleedOf([]), NO_BLEED);
});

test("occlusion, brightness, saturate, tint, grain, bevel and sheen each produce zero bleed", () => {
  const kinds: ResolvedEffect[] = [
    { kind: "occlusion", radius: 5, dx: 0, dy: 2, color: "#000000", opacity: 0.5 },
    { kind: "brightness", amount: 1.2 },
    { kind: "saturate", amount: 0.5 },
    { kind: "tint", color: "#5B8DEF", amount: 0.3 },
    { kind: "grain", amount: 0.15, scale: 0.8, seed: 7 },
    { kind: "bevel", depth: 2, azimuth: 235, elevation: 45, strength: 0.6 },
    { kind: "sheen", strength: 0.12, direction: "down" },
  ];
  for (const effect of kinds) {
    assert.ok(isEmpty(bleedOf([effect])), `expected zero bleed for ${effect.kind}`);
  }
});

test("a shadow with dx 0, dy 2, blur 6 bleeds top 7, bottom 11, left/right 9", () => {
  const bleed = bleedOf([{ kind: "shadow", dx: 0, dy: 2, blur: 6, color: "#000000", opacity: 0.4 }]);
  assert.equal(bleed.top, 7);
  assert.equal(bleed.bottom, 11);
  assert.equal(bleed.left, 9);
  assert.equal(bleed.right, 9);
});

test("a shadow with a large positive dx bleeds more right than left", () => {
  const bleed = bleedOf([{ kind: "shadow", dx: 20, dy: 0, blur: 6, color: "#000000", opacity: 0.4 }]);
  assert.ok(bleed.right > bleed.left);
});

test("a blur bleeds equally on all four sides: gaussianExtent(radius)", () => {
  const bleed = bleedOf([{ kind: "blur", radius: 10 }]);
  const extent = gaussianExtent(10);
  assert.equal(bleed.left, extent);
  assert.equal(bleed.top, extent);
  assert.equal(bleed.right, extent);
  assert.equal(bleed.bottom, extent);
});

test("a blur placed after a shadow grows the shadow's already-offset bottom bleed by exactly gaussianExtent(blurRadius)", () => {
  const shadow: ResolvedEffect = { kind: "shadow", dx: 0, dy: 2, blur: 6, color: "#000000", opacity: 0.4 };
  const blur: ResolvedEffect = { kind: "blur", radius: 4 };
  const shadowOnly = bleedOf([shadow]);
  const shadowThenBlur = bleedOf([shadow, blur]);
  assert.equal(shadowThenBlur.bottom, shadowOnly.bottom + gaussianExtent(4));
});

test("bleed is never negative even for a shadow whose offset points inward relative to a previous bleed", () => {
  const bleed = bleedOf([{ kind: "shadow", dx: -50, dy: 0, blur: 0, color: "#000000", opacity: 0.4 }]);
  assert.ok(bleed.left >= 0);
  assert.ok(bleed.right >= 0);
  assert.equal(bleed.right, 0);
  assert.equal(bleed.left, 50);
});

// ---------------------------------------------------------------------------
// filterRegion / inkBounds / needsFilter
// ---------------------------------------------------------------------------

test("filterRegion equals inkBounds expanded by REGION_PAD on every side", () => {
  const box: Rect = { x: 10, y: 20, width: 100, height: 50 };
  const bleed = { left: 3, top: 4, right: 5, bottom: 6 };
  const ink = inkBounds(box, bleed);
  const region = filterRegion(box, bleed);
  assert.equal(region.x, ink.x - REGION_PAD);
  assert.equal(region.y, ink.y - REGION_PAD);
  assert.equal(region.width, ink.width + REGION_PAD * 2);
  assert.equal(region.height, ink.height + REGION_PAD * 2);
});

test("needsFilter is false for a sheen-only chain, true for anything with a non-sheen effect, false for empty", () => {
  assert.equal(needsFilter([{ kind: "sheen", strength: 0.1, direction: "down" }]), false);
  assert.equal(
    needsFilter([
      { kind: "sheen", strength: 0.1, direction: "down" },
      { kind: "blur", radius: 2 },
    ]),
    true,
  );
  assert.equal(needsFilter([]), false);
});

// ---------------------------------------------------------------------------
// DefsRegistry
// ---------------------------------------------------------------------------

const box1: Rect = { x: 0, y: 0, width: 100, height: 50 };
const box2: Rect = { x: 40, y: 0, width: 100, height: 50 };
const shadowChain: ResolvedEffect[] = [
  { kind: "shadow", dx: 0, dy: 2, blur: 6, color: "#000000", opacity: 0.4 },
];

test("filter() returns null for a sheen-only chain and for an empty chain", () => {
  const registry = new DefsRegistry();
  const sheenChain: ResolvedEffect[] = [{ kind: "sheen", strength: 0.1, direction: "down" }];
  assert.equal(registry.filter(sheenChain, box1, NO_BLEED), null);
  assert.equal(registry.filter([], box1, NO_BLEED), null);
});

test("two elements with the identical chain and identical box+bleed share one id", () => {
  const registry = new DefsRegistry();
  const bleed = bleedOf(shadowChain);
  const id1 = registry.filter(shadowChain, box1, bleed);
  const id2 = registry.filter(shadowChain, box1, bleed);
  assert.equal(id1, id2);
  const filterCount = (registry.toSvg().match(/<filter/g) ?? []).length;
  assert.equal(filterCount, 1);
});

test("the same chain at a different box position gets a different id", () => {
  const registry = new DefsRegistry();
  const bleed = bleedOf(shadowChain);
  const id1 = registry.filter(shadowChain, box1, bleed);
  const id2 = registry.filter(shadowChain, box2, bleed);
  assert.notEqual(id1, id2);
});

test("ids are deterministic and in first-use order: pr-fx-1, then pr-fx-2", () => {
  const registry = new DefsRegistry();
  const otherChain: ResolvedEffect[] = [{ kind: "blur", radius: 5 }];
  const id1 = registry.filter(shadowChain, box1, bleedOf(shadowChain));
  const id2 = registry.filter(otherChain, box1, bleedOf(otherChain));
  assert.equal(id1, "pr-fx-1");
  assert.equal(id2, "pr-fx-2");
});

test("toSvg() returns empty string when nothing was registered", () => {
  const registry = new DefsRegistry();
  assert.equal(registry.toSvg(), "");
});

test("the emitted filter contains filterUnits=userSpaceOnUse and color-interpolation-filters=sRGB", () => {
  const registry = new DefsRegistry();
  registry.filter(shadowChain, box1, bleedOf(shadowChain));
  const svg = registry.toSvg();
  assert.match(svg, /filterUnits="userSpaceOnUse"/);
  assert.match(svg, /color-interpolation-filters="sRGB"/);
});

test("the emitted filter for a shadow has no feDropShadow and no SourceAlpha, but does have the desugared primitives", () => {
  const registry = new DefsRegistry();
  registry.filter(shadowChain, box1, bleedOf(shadowChain));
  const svg = registry.toSvg();
  assert.ok(!svg.includes("feDropShadow"));
  assert.ok(!svg.includes("SourceAlpha"));
  assert.ok(svg.includes("feGaussianBlur"));
  assert.ok(svg.includes("feOffset"));
  assert.ok(svg.includes("feFlood"));
  assert.ok(svg.includes("feComposite"));
  assert.ok(svg.includes("feMerge"));
});

test("a two-effect chain threads results: the second effect's first primitive reads the previous result, and SourceGraphic appears exactly once", () => {
  // Note: a shadow chain references SourceGraphic twice on its own (once to
  // extract alpha, once again in the final feMerge that keeps the original
  // under the cast shadow), so this test uses two single-primitive effects
  // to isolate the threading behaviour the task describes.
  const registry = new DefsRegistry();
  const chain: ResolvedEffect[] = [
    { kind: "saturate", amount: 0.5 },
    { kind: "blur", radius: 4 },
  ];
  registry.filter(chain, box1, bleedOf(chain));
  const svg = registry.toSvg();
  const occurrences = (svg.match(/SourceGraphic/g) ?? []).length;
  assert.equal(occurrences, 1);
  assert.match(svg, /<feGaussianBlur in="pr1"/);
});

test("sheenGradient dedupes by (strength, direction) and returns pr-sheen-N ids", () => {
  const registry = new DefsRegistry();
  const id1 = registry.sheenGradient(0.1, "down");
  const id2 = registry.sheenGradient(0.1, "down");
  const id3 = registry.sheenGradient(0.1, "up");
  assert.equal(id1, id2);
  assert.equal(id1, "pr-sheen-1");
  assert.notEqual(id1, id3);
});

test("vignetteGradient returns a pr-vignette-N id and emits a radialGradient", () => {
  const registry = new DefsRegistry();
  const id = registry.vignetteGradient(0.5);
  assert.equal(id, "pr-vignette-1");
  assert.match(registry.toSvg(), /<radialGradient id="pr-vignette-1"/);
});

// ---------------------------------------------------------------------------
// parseSpec effect validation
// ---------------------------------------------------------------------------

test("a block with an unknown effect throws SpecError mentioning the block path", () => {
  assert.throws(
    () =>
      parseSpec({
        version: 1,
        root: { type: "block", label: "x", effect: "no-such-effect" },
      }),
    (error: unknown) => {
      assert.ok(error instanceof SpecError);
      assert.ok(!(error instanceof EffectError));
      assert.ok((error as Error).message.includes("root.effect"));
      return true;
    },
  );
});

test("a valid effect name parses fine", () => {
  const spec = parseSpec({
    version: 1,
    root: { type: "block", label: "x", effect: "raised-2" },
  });
  assert.equal(spec.root.type, "block");
});

test("canvas.vignette of 2 throws SpecError", () => {
  assert.throws(
    () =>
      parseSpec({
        version: 1,
        canvas: { vignette: 2 },
        root: { type: "block", label: "x" },
      }),
    SpecError,
  );
});
