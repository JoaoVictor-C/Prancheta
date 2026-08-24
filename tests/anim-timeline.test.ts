import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSpec, SpecError } from "../src/ir/types.ts";
import {
  collectDeclaredIds,
  requireDeclaredIds,
  requireIdenticalRotation,
  validateAnimationSpecs,
} from "../src/anim/timeline.ts";
import type { FigureDiff, Delta } from "../src/anim/diff.ts";

function diffWith(deltas: Delta[]): FigureDiff {
  return { deltas, counts: {} as FigureDiff["counts"], persisted: deltas.length, expressible: true, unexplained: [] };
}

// --- collectDeclaredIds -------------------------------------------------------

test("collectDeclaredIds only records ids the author actually wrote", () => {
  const spec = parseSpec({
    version: 1,
    root: {
      type: "stack",
      direction: "row",
      children: [
        { type: "block", id: "a" },
        { type: "block" }, // no id -- normalise.ts would invent "block-3" here
      ],
    },
  });
  const declared = collectDeclaredIds(spec);
  assert.ok(declared.has("a"));
  assert.equal(declared.size, 1);
});

test("collectDeclaredIds walks a scene's children and connectors", () => {
  const spec = parseSpec({
    version: 1,
    root: {
      type: "scene",
      layout: "absolute",
      width: 200,
      height: 200,
      children: [
        { type: "block", id: "x", x: 0, y: 0, width: 40, height: 40 },
        { type: "block", id: "y", x: 100, y: 0, width: 40, height: 40 },
      ],
      connectors: [{ id: "edge1", from: "x", to: "y" }],
    },
  });
  const declared = collectDeclaredIds(spec);
  assert.deepEqual([...declared].sort(), ["edge1", "x", "y"]);
});

// --- requireDeclaredIds --------------------------------------------------------

test("requireDeclaredIds passes when a moved element has an explicit id on both sides", () => {
  const diff = diffWith([{ id: "a", kind: "moved" }]);
  assert.doesNotThrow(() => requireDeclaredIds(diff, new Set(["a"]), new Set(["a"]), new Set()));
});

test("requireDeclaredIds refuses a moved element missing its id on either side", () => {
  const diff = diffWith([{ id: "block-3", kind: "moved" }]);
  assert.throws(
    () => requireDeclaredIds(diff, new Set(["block-3"]), new Set(), new Set()),
    SpecError,
  );
  assert.throws(
    () => requireDeclaredIds(diff, new Set(), new Set(["block-3"]), new Set()),
    SpecError,
  );
});

test("requireDeclaredIds ignores appeared/disappeared/unchanged deltas -- they don't need a cross-state match", () => {
  const diff = diffWith([
    { id: "new", kind: "appeared" },
    { id: "gone", kind: "disappeared" },
    { id: "same", kind: "unchanged" },
  ]);
  assert.doesNotThrow(() => requireDeclaredIds(diff, new Set(), new Set(), new Set()));
});

// --- requireIdenticalRotation --------------------------------------------------

test("requireIdenticalRotation passes when rotation is identical (including both undefined)", () => {
  const diff = diffWith([{ id: "a", kind: "moved" }]);
  assert.doesNotThrow(() =>
    requireIdenticalRotation(diff, new Map([["a", undefined]]), new Map([["a", undefined]])),
  );
  assert.doesNotThrow(() =>
    requireIdenticalRotation(diff, new Map([["a", 45]]), new Map([["a", 45]])),
  );
});

test("requireIdenticalRotation refuses a moved box whose rotation differs between states", () => {
  const diff = diffWith([{ id: "a", kind: "moved" }]);
  assert.throws(
    () => requireIdenticalRotation(diff, new Map([["a", 0]]), new Map([["a", 45]])),
    SpecError,
  );
});

test("requireIdenticalRotation catches the confirmed diff.ts gap: a rotation-only change classifies as 'unchanged', not 'moved'", () => {
  // This is exactly the case diffFigures cannot see on its own (boxOf() never
  // reads .rotation) -- the guard must still catch it via the "unchanged" branch.
  const diff = diffWith([{ id: "a", kind: "unchanged" }]);
  assert.throws(
    () => requireIdenticalRotation(diff, new Map([["a", 0]]), new Map([["a", 90]])),
    SpecError,
  );
});

test("requireDeclaredIds exempts a moved text delta -- a label's id is derived from its owner, never a positional guess", () => {
  // measure.ts always names a label "<ownerId>--label", so its identity is
  // exactly as sound as its (separately guarded) owner box's, even though
  // the label itself never got an explicit id from the author.
  const diff = diffWith([{ id: "a--label", kind: "moved" }]);
  assert.doesNotThrow(() =>
    requireDeclaredIds(diff, new Set(["a"]), new Set(["a"]), new Set(["a--label"])),
  );
});

// --- validateAnimationSpecs (both guards together) -----------------------------

const emptyFigure = { width: 100, height: 100, background: "#000", elements: [] };

test("validateAnimationSpecs accepts two states with matching explicit ids and rotation", () => {
  const specA = parseSpec({ version: 1, root: { type: "block", id: "a" } });
  const specB = parseSpec({ version: 1, root: { type: "block", id: "a" } });
  const diff = diffWith([{ id: "a", kind: "moved" }]);
  assert.doesNotThrow(() => validateAnimationSpecs(specA, specB, diff, emptyFigure, emptyFigure));
});

test("validateAnimationSpecs refuses when the second state's element has no explicit id", () => {
  const specA = parseSpec({ version: 1, root: { type: "block", id: "a" } });
  const specB = parseSpec({ version: 1, root: { type: "block" } }); // gets "block-1"
  const diff = diffWith([{ id: "a", kind: "moved" }]);
  assert.throws(() => validateAnimationSpecs(specA, specB, diff, emptyFigure, emptyFigure), SpecError);
});
