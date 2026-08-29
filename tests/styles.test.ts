/**
 * Style packs.
 *
 * The three rules the layer promises, each as a test: it fills only absences,
 * it never touches a callout, and it buys no exemption from the effect checks.
 * The last one is the one worth guarding hardest — a pack that quietly skipped
 * bleed would be a decoration escape hatch, which is the thing this project is
 * built to refuse.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { STYLE_IDS, STYLE_PACKS, applyStyle, styleById } from "../src/effects/styles.ts";
import { resolveEffects } from "../src/effects/types.ts";
import { SpecError, parseSpec } from "../src/ir/types.ts";
import type { Block, FigureSpec, Scene } from "../src/ir/types.ts";
import { parseFigureInput } from "../src/presets/index.ts";

function sceneSpec(children: Block[], style?: string): FigureSpec {
  return {
    version: 1,
    canvas: style === undefined ? {} : { style },
    root: { type: "scene", id: "s", layout: "absolute", width: 400, height: 300, children },
  };
}

const block = (id: string, extra: Partial<Block> = {}): Block => ({
  type: "block",
  id,
  x: 0,
  y: 0,
  width: 100,
  height: 40,
  ...extra,
});

function blocksOf(spec: FigureSpec): Block[] {
  return (spec.root as Scene).children;
}

test("a pack fills in an effect by role", () => {
  const out = applyStyle(sceneSpec([block("a", { role: "primary" })], "elevated"));
  assert.equal(blocksOf(out)[0]!.effect, "raised-3");
});

test("an authored effect wins — a pack is a default, never an override", () => {
  const out = applyStyle(
    sceneSpec([block("a", { role: "primary", effect: "seated" })], "elevated"),
  );
  assert.equal(blocksOf(out)[0]!.effect, "seated");
});

test("a callout is never styled, however loud the pack", () => {
  for (const pack of STYLE_PACKS) {
    const out = applyStyle(sceneSpec([block("c", { role: "callout" })], pack.id));
    assert.equal(
      blocksOf(out)[0]!.effect,
      undefined,
      `${pack.id} put an effect on a callout; a callout carries no fill or border by design`,
    );
  }
});

test("a block with no role takes the pack's default entry", () => {
  const out = applyStyle(sceneSpec([block("a")], "neon"));
  assert.equal(blocksOf(out)[0]!.effect, "outlined");
});

test("no style named means the spec comes back untouched", () => {
  const input = sceneSpec([block("a", { role: "primary" })]);
  assert.equal(applyStyle(input), input);
});

test("a pack fills canvas.vignette only when the canvas does not set its own", () => {
  assert.equal(applyStyle(sceneSpec([block("a")], "neon")).canvas?.vignette, 0.35);
  const authored: FigureSpec = {
    ...sceneSpec([block("a")], "neon"),
    canvas: { style: "neon", vignette: 0.1 },
  };
  assert.equal(applyStyle(authored).canvas?.vignette, 0.1);
});

test("every effect a pack names resolves — no pack can reference an effect that does not exist", () => {
  for (const pack of STYLE_PACKS) {
    for (const [role, effect] of Object.entries(pack.roles)) {
      assert.doesNotThrow(
        () => resolveEffects(Array.isArray(effect) ? effect : [effect]),
        `${pack.id}.${role} names an unknown effect`,
      );
    }
  }
});

test("a packed effect carries the same bleed a hand-written one would — no exemption", () => {
  const packed = blocksOf(applyStyle(sceneSpec([block("a", { role: "primary" })], "neon")))[0]!;
  const byHand = blocksOf(sceneSpec([block("a", { role: "primary", effect: "emphasis" })]))[0]!;
  assert.deepEqual(
    resolveEffects([packed.effect as string]),
    resolveEffects([byHand.effect as string]),
  );
});

test("an unknown style is refused by name, listing the packs", () => {
  assert.throws(
    () => parseSpec(sceneSpec([block("a")], "sparkly")),
    (error: unknown) => {
      assert.ok(error instanceof SpecError);
      assert.match((error as SpecError).message, /canvas\.style/);
      for (const id of STYLE_IDS) assert.match((error as SpecError).message, new RegExp(id));
      return true;
    },
  );
});

test("a preset input can name a style, and a bad one is refused before rendering", () => {
  const spec = parseFigureInput({
    preset: "labelled-blocks",
    style: "spotlight",
    items: [{ label: "One", role: "primary" }],
  });
  assert.equal(spec.canvas?.style, "spotlight");
  assert.throws(
    () => parseFigureInput({ preset: "labelled-blocks", style: "nope", items: [{ label: "One" }] }),
    SpecError,
  );
});

test("styleById answers for every advertised id and nothing else", () => {
  for (const id of STYLE_IDS) assert.ok(styleById(id) !== undefined);
  assert.equal(styleById("does-not-exist"), undefined);
});
