/**
 * "How a request becomes a rendered figure", with a type hierarchy.
 *
 * The graph preset is what `select` returns for this content, and it expresses
 * everything about the figure EXCEPT how loud each node is: `Block.level` is a
 * real IR field, but no preset input carries it (see src/presets/graph/preset.ts
 * -- GraphInput has id, label, role, width, shape, and nothing else). So every
 * node comes out at the pack's `body` step and a type pack changes the whole
 * figure at once or not at all.
 *
 * Rather than hand-author a scene, this expands the SAME preset input through
 * the preset layer -- a preset is a macro (ADR 0002), so what comes back is
 * ordinary IR -- and sets `level` on it. Structure, roles, shapes, wrapping and
 * layout all remain the preset's; one axis is added that the input could not
 * carry. Everything downstream is unchanged: validate, measure, check, repair.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseFigureInput } from "../../src/presets/index.ts";
import type { Block, Scene, TypeLevel } from "../../src/ir/types.ts";

const SOURCE = "out/how-a-request-becomes-a-figure.json";
const TARGET = "out/how-a-request-becomes-a-figure-typed.json";

/**
 * Four steps, and each one is a claim about the figure rather than a taste:
 * the two ENDS of the chain are what the reader should find first; the three
 * BRANCH points are the structure; the main line is the body; and the exits --
 * every one of which is a refusal -- annotate rather than compete.
 */
const LEVELS: Record<string, TypeLevel> = {
  request: "title",
  manifest: "title",

  select: "subtitle",
  dispatch: "subtitle",
  checks: "subtitle",
  repair: "subtitle",

  one: "caption",
  compose: "caption",
  none: "caption",
  unknown: "caption",
  specerror: "caption",
  unrepaired: "caption",
};

const spec = parseFigureInput(JSON.parse(readFileSync(SOURCE, "utf8")));
const root = spec.root as Scene;
const typed = {
  ...spec,
  root: {
    ...root,
    children: root.children.map((child) => {
      const block = child as Block;
      const level = block.id === undefined ? undefined : LEVELS[block.id];
      return level === undefined ? block : { ...block, level };
    }),
  },
};

writeFileSync(TARGET, JSON.stringify(typed, null, 2));
const counts = new Map<string, number>();
for (const child of typed.root.children) {
  const level = (child as Block).level ?? "body";
  counts.set(level, (counts.get(level) ?? 0) + 1);
}
console.log(`wrote ${TARGET} — ${typed.root.children.length} blocks, pack "${typed.canvas?.type}"`);
console.log(
  `  levels: ${[...counts].map(([level, n]) => `${level} x${n}`).join("  ·  ")}`,
);
