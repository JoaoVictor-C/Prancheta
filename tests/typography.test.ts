/**
 * Type packs, and the axis they key on.
 *
 * The load-bearing test here is the LAST one: `level` and `role` must stay
 * independent, because the whole reason typography got its own axis is that a
 * poster's largest type is often semantically neutral and its smallest is
 * often the most urgent. If those two ever collapse into one vocabulary, the
 * design is wrong and this test is how we find out.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUNDLED_FAMILIES,
  TYPE_IDS,
  TYPE_LADDER,
  TYPE_LEVELS,
  TYPE_PACKS,
  hostDependentLevels,
  isSelfContained,
  stepFor,
  typeById,
} from "../src/typography.ts";
import { applyType } from "../src/typography-apply.ts";
import { SpecError, parseSpec } from "../src/ir/types.ts";
import type { Block, FigureSpec, Stack } from "../src/ir/types.ts";
import { parseFigureInput } from "../src/presets/index.ts";

function stackSpec(children: Block[], type?: string): FigureSpec {
  return {
    version: 1,
    canvas: type === undefined ? {} : { type },
    root: { type: "stack", id: "s", direction: "column", children },
  };
}

const block = (id: string, extra: Partial<Block> = {}): Block => ({
  type: "block",
  id,
  label: "Text",
  ...extra,
});

const kids = (spec: FigureSpec): Block[] => (spec.root as Stack).children as Block[];

test("a pack sets family, size, weight and tracking from the element's level", () => {
  const out = applyType(stackSpec([block("a", { level: "display" })], "grotesk"));
  const b = kids(out)[0]!;
  assert.equal(b.fontSize, 46);
  assert.equal(b.fontWeight, 700);
  assert.equal(b.letterSpacing, -1.2);
  assert.match(b.fontFamily!, /Inter/);
});

test("an element that declares its own size keeps it, and gets the rest of the step", () => {
  const out = applyType(stackSpec([block("a", { level: "display", fontSize: 12 })], "grotesk"));
  const b = kids(out)[0]!;
  assert.equal(b.fontSize, 12, "a pack must not rescale a figure that was already correct");
  assert.equal(b.fontWeight, 700);
});

test("an element with no level is set as body", () => {
  const out = applyType(stackSpec([block("a")], "grotesk"));
  assert.equal(kids(out)[0]!.fontSize, stepFor(typeById("grotesk")!, undefined).size);
  assert.equal(kids(out)[0]!.fontSize, 15);
});

test("a block with no label takes nothing — a shape that draws no glyph needs no family", () => {
  const out = applyType(stackSpec([block("a", { label: undefined, level: "display" })], "grotesk"));
  assert.equal(kids(out)[0]!.fontFamily, undefined);
  assert.equal(kids(out)[0]!.fontSize, undefined);
});

test("no pack named means the spec comes back untouched", () => {
  const input = stackSpec([block("a", { level: "display" })]);
  assert.equal(applyType(input), input);
});

test("every pack defines every level — a missing step would silently fall back to body", () => {
  for (const pack of TYPE_PACKS) {
    for (const level of TYPE_LEVELS) {
      const step = pack.levels[level];
      assert.ok(step !== undefined, `${pack.id} has no ${level} step`);
      assert.ok(step.size > 0, `${pack.id}.${level} has a non-positive size`);
      assert.match(step.family, /,/, `${pack.id}.${level} names one family with no fallback`);
    }
  }
});

test("every family stack ends in a CSS generic, so a host without the face still draws", () => {
  const generics = ["sans-serif", "serif", "monospace", "system-ui", "cursive"];
  for (const pack of TYPE_PACKS) {
    for (const level of TYPE_LEVELS) {
      const last = pack.levels[level].family.split(",").pop()!.trim();
      assert.ok(
        generics.includes(last),
        `${pack.id}.${level} ends in "${last}", which is not a CSS generic`,
      );
    }
  }
});

test("size decreases monotonically from display to caption", () => {
  const ladder = TYPE_LADDER;
  for (const pack of TYPE_PACKS) {
    for (let i = 1; i < ladder.length; i += 1) {
      assert.ok(
        pack.levels[ladder[i]!].size < pack.levels[ladder[i - 1]!].size,
        `${pack.id}: ${ladder[i]} is not smaller than ${ladder[i - 1]}`,
      );
    }
  }
});

test("self-containment is DERIVED, and no pack claims more portability than it has", () => {
  for (const pack of TYPE_PACKS) {
    const dependent = hostDependentLevels(pack);
    assert.equal(
      isSelfContained(pack),
      dependent.length === 0,
      `${pack.id} disagrees with its own host-dependent level list`,
    );
    for (const level of dependent) {
      const first = pack.levels[level].family.split(",")[0]!.trim().replace(/["']/g, "");
      assert.ok(
        !BUNDLED_FAMILIES.includes(first),
        `${pack.id}.${level} is listed host-dependent but "${first}" is bundled`,
      );
    }
  }
});

test("an unknown pack is refused by name, listing the packs", () => {
  assert.throws(
    () => parseSpec(stackSpec([block("a")], "comic")),
    (error: unknown) => {
      assert.ok(error instanceof SpecError);
      assert.match((error as SpecError).message, /canvas\.type/);
      for (const id of TYPE_IDS) assert.match((error as SpecError).message, new RegExp(id));
      return true;
    },
  );
});

test("an unknown level is refused by name", () => {
  assert.throws(
    () => parseSpec(stackSpec([block("a", { level: "enormous" as never })])),
    (error: unknown) => {
      assert.ok(error instanceof SpecError);
      assert.match((error as SpecError).message, /level/);
      return true;
    },
  );
});

test("a preset input can name a type pack, and a bad one is refused", () => {
  const spec = parseFigureInput({
    preset: "labelled-blocks",
    type: "editorial",
    items: [{ label: "One" }],
  });
  assert.equal(spec.canvas?.type, "editorial");
  assert.throws(
    () => parseFigureInput({ preset: "labelled-blocks", type: "nope", items: [{ label: "One" }] }),
    SpecError,
  );
});

test("level and role are independent axes — the reason typography got its own", () => {
  // A warning caption: the smallest type on the page carrying the most urgent
  // meaning. If these ever had to be one vocabulary, this could not be said.
  const out = applyType(
    stackSpec([block("a", { level: "caption", role: "warning" })], "grotesk"),
  );
  const b = kids(out)[0]!;
  assert.equal(b.role, "warning", "the type pack must not touch what an element MEANS");
  assert.equal(b.fontSize, 12.5, "and the role must not decide how loud it is");

  // ...and the mirror case: display type carrying no semantic weight at all.
  const neutral = applyType(stackSpec([block("b", { level: "display" })], "grotesk"));
  assert.equal(kids(neutral)[0]!.role, undefined);
  assert.equal(kids(neutral)[0]!.fontSize, 46);
});
