import { test } from "node:test";
import assert from "node:assert/strict";
import { normalise, cloneNormalised } from "../src/ir/normalise.ts";
import type { FigureNode, FigureSpec } from "../src/ir/types.ts";

/** Pre-order walk, matching the order `normalise` visits nodes in. */
function walk(node: FigureNode, into: FigureNode[] = []): FigureNode[] {
  into.push(node);
  if (node.type === "stack") {
    for (const child of node.children) walk(child, into);
  }
  return into;
}

function sampleSpec(): FigureSpec {
  return {
    version: 1,
    root: {
      type: "stack",
      direction: "column",
      children: [
        { type: "block", label: "A" },
        { type: "block", id: "b-fixed", label: "B" },
        {
          type: "stack",
          direction: "row",
          children: [{ type: "block", label: "C" }],
        },
      ],
    },
  };
}

test("normalise assigns an id to every node lacking one, in document order", () => {
  const spec = sampleSpec();
  const { spec: out } = normalise(spec);
  const nodes = walk(out.root);

  // root stack, block A, block B (kept), nested stack, block C
  assert.equal(nodes.length, 5);
  for (const node of nodes) assert.ok(node.id, `node of type ${node.type} should have an id`);

  // Ids auto-generated for nodes that lacked one follow document order: the
  // numeric suffix should increase monotonically across the walk.
  const suffixes = nodes
    .map((n) => n.id!)
    .filter((id) => /^(stack|block)-\d+$/.test(id))
    .map((id) => Number(id.split("-")[1]));
  for (let i = 1; i < suffixes.length; i++) {
    assert.ok(suffixes[i] > suffixes[i - 1], `expected increasing ids, got ${suffixes}`);
  }
});

test("normalise preserves ids that were already present", () => {
  const spec = sampleSpec();
  const { spec: out } = normalise(spec);
  const nodes = walk(out.root);
  const b = nodes.find((n) => n.type === "block" && n.label === "B");
  assert.equal(b?.id, "b-fixed");
});

test("normalise does not mutate the input spec", () => {
  const spec = sampleSpec();
  const before = JSON.parse(JSON.stringify(spec));
  normalise(spec);
  assert.deepEqual(spec, before);
});

test("the returned index maps every id to the corresponding node in the returned spec", () => {
  const spec = sampleSpec();
  const { spec: out, index } = normalise(spec);
  const nodes = walk(out.root);

  assert.equal(index.size, nodes.length);
  for (const node of nodes) {
    const fromIndex = index.get(node.id!);
    // Identity with the node reached by walking the RETURNED tree, not the input.
    assert.strictEqual(fromIndex, node);
  }
});

test("cloneNormalised produces a copy whose blocks can be mutated without affecting the original", () => {
  const spec = sampleSpec();
  const { spec: normalised } = normalise(spec);
  const { spec: clone, index: cloneIndex } = cloneNormalised(normalised);

  const cloneBlock = [...cloneIndex.values()].find((n) => n.type === "block" && n.label === "A");
  assert.ok(cloneBlock && cloneBlock.type === "block");
  (cloneBlock as { width?: number }).width = 999;

  const originalBlock = walk(normalised.root).find((n) => n.type === "block" && n.label === "A");
  assert.notEqual((originalBlock as { width?: number }).width, 999);

  // Sanity: the clone really did change and clone !== normalised tree.
  assert.notStrictEqual(clone, normalised);
});
