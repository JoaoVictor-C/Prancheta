import { test } from "node:test";
import assert from "node:assert/strict";
import { expandGraph } from "../src/presets/graph/preset.ts";
import type { Scene } from "../src/ir/types.ts";

function connectorIds(input: Parameters<typeof expandGraph>[0]): string[] {
  const spec = expandGraph(input);
  const scene = spec.root as Scene;
  return (scene.connectors ?? []).map((c) => c.id!);
}

test("an edge from a to b gets id a--b", () => {
  const ids = connectorIds({
    nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    edges: [{ from: "a", to: "b" }],
  });
  assert.deepEqual(ids, ["a--b"]);
});

test("two edges between the same pair get a--b and a--b#2", () => {
  const ids = connectorIds({
    nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    edges: [
      { from: "a", to: "b" },
      { from: "a", to: "b" },
    ],
  });
  assert.deepEqual(ids, ["a--b", "a--b#2"]);
});

// The M4 identity finding: edge ids used to be positional ("edge-0", "edge-1",
// ...), derived from an edge's index in the input list. That is not identity --
// delete an edge from the middle of the list and every edge after it shifts
// down one slot, so "edge-2" silently stops meaning "the edge that was third"
// and starts meaning "the edge that is now third", which may be a completely
// different pair of nodes. The two-state diff (src/anim/diff.ts) matches
// elements by id: fed positional ids across a deletion, it would report a
// surviving edge as "moved" or "resized" when the edge it is actually comparing
// against is a different edge entirely that happened to land in the same slot.
// Content-based ids (`from--to`, with a `#2` suffix for a genuine duplicate)
// make an edge's identity survive edits to the edges around it -- this test is
// the regression guard for that property.
test("removing an edge from the middle of the list does not change the ids of the surviving edges", () => {
  const nodes = [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
    { id: "c", label: "C" },
    { id: "d", label: "D" },
  ];
  const before = connectorIds({
    nodes,
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "c" }, // this one gets deleted
      { from: "c", to: "d" },
    ],
  });
  const after = connectorIds({
    nodes,
    edges: [
      { from: "a", to: "b" },
      { from: "c", to: "d" },
    ],
  });

  assert.deepEqual(before, ["a--b", "b--c", "c--d"]);
  assert.deepEqual(after, ["a--b", "c--d"]);

  // Every id that survives the deletion is identical between states -- a
  // positional scheme would have renamed "c--d" (it moved from index 2 to
  // index 1) even though the edge itself did not change.
  const survivors = new Set(after);
  for (const id of survivors) {
    assert.ok(before.includes(id), `${id} should have existed before the deletion too`);
  }
  assert.deepEqual(new Set(after), new Set(["a--b", "c--d"]));
});
