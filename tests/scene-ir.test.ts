import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSpec, SpecError } from "../src/ir/types.ts";
import type { FigureSpec, Scene } from "../src/ir/types.ts";
import { normalise, cloneNormalised } from "../src/ir/normalise.ts";

function validScene(): FigureSpec {
  return {
    version: 1,
    root: {
      type: "scene",
      layout: "absolute",
      width: 400,
      height: 300,
      children: [
        { type: "block", id: "a", label: "A", x: 0, y: 0 },
        { type: "block", id: "b", label: "B", x: 200, y: 0 },
      ],
      connectors: [{ from: "a", to: "b" }],
    },
  };
}

// ---------------------------------------------------------------------------
// parseSpec
// ---------------------------------------------------------------------------

test("parseSpec accepts a valid scene", () => {
  const spec = parseSpec(validScene());
  assert.equal(spec.root.type, "scene");
});

test("parseSpec rejects a scene with a bad layout value", () => {
  const spec = validScene();
  (spec.root as Scene).layout = "diagonal" as unknown as "absolute";
  assert.throws(() => parseSpec(spec), SpecError);
});

test("parseSpec rejects a connector whose 'from' names a non-child", () => {
  const spec = validScene();
  (spec.root as Scene).connectors = [{ from: "ghost", to: "b" }];
  assert.throws(() => parseSpec(spec), SpecError);
});

test("parseSpec rejects a connector whose 'to' names a non-child", () => {
  const spec = validScene();
  (spec.root as Scene).connectors = [{ from: "a", to: "ghost" }];
  assert.throws(() => parseSpec(spec), SpecError);
});

test("parseSpec rejects a connector whose 'to' is neither a string nor an {x,y} point", () => {
  const spec = validScene();
  (spec.root as Scene).connectors = [{ from: "a", to: 42 as unknown as string }];
  assert.throws(() => parseSpec(spec), SpecError);
});

test("parseSpec accepts a connector whose 'to' is a bare {x,y} point", () => {
  const spec = validScene();
  (spec.root as Scene).connectors = [{ from: "a", to: { x: 10, y: 10 } }];
  assert.doesNotThrow(() => parseSpec(spec));
});

// ---------------------------------------------------------------------------
// normalise — regression guard for scene children never being visited
// ---------------------------------------------------------------------------

test("normalise assigns ids to scene children and indexes them", () => {
  const spec: FigureSpec = {
    version: 1,
    root: {
      type: "scene",
      layout: "absolute",
      children: [
        { type: "block", label: "unnamed" },
        { type: "block", id: "named", label: "named" },
      ],
    },
  };

  const { spec: normalised, index } = normalise(spec);
  const scene = normalised.root as Scene;

  // Every child must have gotten an id.
  for (const child of scene.children) {
    assert.ok(child.id, "scene child must have an id after normalise");
  }

  // The index must be able to find each scene child by that id — this is the
  // regression guard: scene children were once never visited, so the index
  // never had them and repairs targeting them silently never applied.
  for (const child of scene.children) {
    const found = index.get(child.id!);
    assert.ok(found, `index should contain scene child ${child.id}`);
    assert.equal(found, child);
  }

  // The explicitly-named child must keep its id.
  assert.equal(scene.children[1]!.id, "named");
});

test("normalise assigns ids to scene connectors", () => {
  const spec: FigureSpec = {
    version: 1,
    root: {
      type: "scene",
      layout: "absolute",
      children: [
        { type: "block", id: "a" },
        { type: "block", id: "b" },
      ],
      connectors: [{ from: "a", to: "b" }],
    },
  };
  const { spec: normalised } = normalise(spec);
  const scene = normalised.root as Scene;
  assert.ok(scene.connectors![0]!.id, "connector should get an id");
});

// ---------------------------------------------------------------------------
// cloneNormalised
// ---------------------------------------------------------------------------

test("cloneNormalised lets you mutate a scene child without touching the original", () => {
  const spec: FigureSpec = {
    version: 1,
    root: {
      type: "scene",
      layout: "absolute",
      children: [{ type: "block", id: "a", label: "before" }],
    },
  };
  const { spec: normalised } = normalise(spec);
  const { spec: cloned, index } = cloneNormalised(normalised);

  const clonedChild = index.get("a");
  assert.ok(clonedChild);
  (clonedChild as { label?: string }).label = "after";

  const originalChild = (normalised.root as Scene).children[0]!;
  assert.equal(originalChild.label, "before");
  assert.equal((cloned.root as Scene).children[0]!.label, "after");
});
