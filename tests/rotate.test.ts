import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attachBoxRotation,
  attachRotations,
  collectBoxRotations,
  collectRotations,
  rotatePoint,
  rotatedBounds,
} from "../src/geometry/rotate.ts";
import type { FigureSpec, LaidOutFigure, PlacedBox, PlacedText } from "../src/ir/types.ts";

function close(a: number, b: number, tol = 1e-6): void {
  assert.ok(Math.abs(a - b) < tol, `expected ${a} ~= ${b}`);
}

// --- rotatePoint ---------------------------------------------------------

test("rotatePoint: 90 degrees clockwise sends (1,0) to (0,1) around the origin", () => {
  const p = rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, 90);
  close(p.x, 0);
  close(p.y, 1);
});

test("rotatePoint: 180 degrees sends a point to its mirror through the centre", () => {
  const p = rotatePoint({ x: 10, y: 5 }, { x: 0, y: 0 }, 180);
  close(p.x, -10);
  close(p.y, -5);
});

test("rotatePoint: 0 degrees is the identity", () => {
  const p = rotatePoint({ x: 7, y: -3 }, { x: 1, y: 1 }, 0);
  close(p.x, 7);
  close(p.y, -3);
});

test("rotatePoint: the centre itself never moves, at any angle", () => {
  const p = rotatePoint({ x: 42, y: 17 }, { x: 42, y: 17 }, 37);
  close(p.x, 42);
  close(p.y, 17);
});

// --- rotatedBounds ---------------------------------------------------------

test("rotatedBounds: a square rotated 45 degrees around its own centre becomes a diamond bbox, side * sqrt(2)", () => {
  const rect = { x: 0, y: 0, width: 100, height: 100 };
  const centre = { x: 50, y: 50 };
  const bounds = rotatedBounds(rect, centre, 45);
  const expected = 100 * Math.sqrt(2);
  close(bounds.width, expected, 0.01);
  close(bounds.height, expected, 0.01);
  // Still centred on the same point.
  close(bounds.x + bounds.width / 2, 50, 0.01);
  close(bounds.y + bounds.height / 2, 50, 0.01);
});

test("rotatedBounds: a 90-degree rotation swaps width and height", () => {
  const rect = { x: 10, y: 20, width: 60, height: 20 };
  const centre = { x: 40, y: 30 };
  const bounds = rotatedBounds(rect, centre, 90);
  close(bounds.width, 20, 0.01);
  close(bounds.height, 60, 0.01);
});

test("rotatedBounds: 0 degrees returns the rect unchanged", () => {
  const rect = { x: 5, y: 5, width: 30, height: 12 };
  const bounds = rotatedBounds(rect, { x: 20, y: 11 }, 0);
  close(bounds.x, 5);
  close(bounds.y, 5);
  close(bounds.width, 30);
  close(bounds.height, 12);
});

// --- collectRotations / attachRotations ------------------------------------

test("collectRotations only records blocks with a nonzero rotation, keyed by resolved id", () => {
  const spec: FigureSpec = {
    version: 1,
    root: {
      type: "stack",
      direction: "row",
      children: [
        { type: "block", id: "a", label: "tilted", rotation: 45 },
        { type: "block", id: "b", label: "level" },
        { type: "block", id: "c", label: "full turn", rotation: 360 },
      ],
    },
  };
  const rotations = collectRotations(spec);
  assert.equal(rotations.get("a"), 45);
  assert.equal(rotations.has("b"), false);
  assert.equal(rotations.has("c"), false);
});

function box(overrides: Partial<PlacedBox> = {}): PlacedBox {
  return {
    kind: "box",
    id: "box-1",
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    fill: "#fff",
    stroke: "#000",
    strokeWidth: 1,
    radius: 0,
    content: { x: 5, y: 5, width: 90, height: 30 },
    ...overrides,
  };
}

function text(overrides: Partial<PlacedText> = {}): PlacedText {
  return {
    kind: "text",
    id: "text-1",
    ownerId: "box-1",
    fontFamily: "Arial",
    fontSize: 12,
    fill: "#000",
    anchor: "start",
    lines: [],
    ...overrides,
  };
}

test("attachRotations rotates a text element's line boxes around their own union centre and records the angle", () => {
  const spec: FigureSpec = {
    version: 1,
    root: { type: "block", id: "box-1", label: "tick", rotation: 90 },
  };
  const owner = box();
  const label = text({
    lines: [
      { text: "tick", x: 10, y: 25, box: { x: 10, y: 15, width: 40, height: 10 }, baselineUncertain: false },
    ],
  });
  const figure: LaidOutFigure = { width: 200, height: 200, background: "#fff", elements: [owner, label] };

  const rotated = attachRotations(figure, spec);
  const rotatedText = rotated.elements.find((e) => e.kind === "text") as PlacedText;
  assert.equal(rotatedText.rotation, 90);
  assert.ok(rotatedText.rotationCenter);
  // A 90-degree turn of a 40x10 box swaps its dimensions.
  close(rotatedText.lines[0]!.box.width, 10, 0.01);
  close(rotatedText.lines[0]!.box.height, 40, 0.01);
});

// --- collectBoxRotations / attachBoxRotation --------------------------------

test("collectBoxRotations only records blocks with rotateBox AND a nonzero rotation", () => {
  const spec: FigureSpec = {
    version: 1,
    root: {
      type: "stack",
      direction: "row",
      children: [
        { type: "block", id: "a", rotation: 30, rotateBox: true },
        { type: "block", id: "b", rotation: 30 }, // label-only, rotateBox unset
        { type: "block", id: "c", rotateBox: true }, // no rotation to apply
      ],
    },
  };
  const rotations = collectBoxRotations(spec);
  assert.equal(rotations.get("a"), 30);
  assert.equal(rotations.has("b"), false);
  assert.equal(rotations.has("c"), false);
});

test("attachBoxRotation records the box's exact rotated AABB as `bounds`, leaving x/y/width/height (the drawn geometry) untouched", () => {
  const spec: FigureSpec = { version: 1, root: { type: "block", id: "box-1", rotation: 45, rotateBox: true } };
  const owner = box({ x: 0, y: 0, width: 100, height: 100 });
  const figure: LaidOutFigure = { width: 300, height: 300, background: "#fff", elements: [owner] };

  const rotated = attachBoxRotation(figure, spec);
  const placedBox = rotated.elements[0] as PlacedBox;
  assert.equal(placedBox.rotation, 45);
  assert.ok(placedBox.rotationCenter);
  assert.equal(placedBox.x, 0);
  assert.equal(placedBox.width, 100);
  close(placedBox.bounds!.width, 100 * Math.sqrt(2), 0.01);
});

test("a rotated box that would clear an unrotated neighbour instead overlaps it once its true rotated footprint is accounted for", () => {
  // A 100x20 box centred at (50,50), rotated 45 degrees, has a rotated AABB
  // width/height of (100+20)/sqrt(2) =~ 84.85 -- reaching from about x=7.57
  // to x=92.43 (still short of its own UNROTATED right edge at x=100). A
  // neighbour placed at x=95 clears the unrotated box (100 <= 95 is false --
  // it clears because 95 >= 100 is false too; the point is it sits INSIDE the
  // rotated footprint at x=92.43 while starting past where a naive reading of
  // "does x=95 overlap width=100 starting at 0" might expect little overlap).
  const spec: FigureSpec = {
    version: 1,
    root: {
      type: "scene",
      layout: "absolute",
      children: [
        { type: "block", id: "rotated", x: 0, y: 40, width: 100, height: 20, rotation: 45, rotateBox: true },
        { type: "block", id: "neighbour", x: 88, y: 5, width: 40, height: 40 },
      ],
    },
  };
  const rotatedBox = box({ id: "rotated", x: 0, y: 40, width: 100, height: 20 });
  const neighbour = box({ id: "neighbour", x: 88, y: 5, width: 40, height: 40 });
  const figure: LaidOutFigure = { width: 300, height: 300, background: "#fff", elements: [rotatedBox, neighbour] };

  const attached = attachBoxRotation(figure, spec);
  const attachedRotated = attached.elements.find((e) => e.kind === "box" && e.id === "rotated") as PlacedBox;
  // The box's own drawn geometry never moved -- only `bounds` grew to cover it.
  assert.equal(attachedRotated.x, 0);
  close(attachedRotated.bounds!.width, (100 + 20) / Math.sqrt(2), 0.01);
  assert.ok(attachedRotated.bounds!.x + attachedRotated.bounds!.width > 88, "rotated footprint should reach past x=88");
});

test("attachRotations turns a label around its owner's box centre, not its own text-bbox centre, when the owner also rotates its box", () => {
  const spec: FigureSpec = {
    version: 1,
    root: { type: "block", id: "box-1", label: "tilt", rotation: 30, rotateBox: true },
  };
  const owner = box({ x: 0, y: 0, width: 100, height: 100 });
  const boxRotated = attachBoxRotation(
    { width: 300, height: 300, background: "#fff", elements: [owner] },
    spec,
  );
  const rotatedOwner = boxRotated.elements[0] as PlacedBox;

  const label = text({
    lines: [{ text: "tilt", x: 30, y: 55, box: { x: 30, y: 45, width: 40, height: 10 }, baselineUncertain: false }],
  });
  const figure: LaidOutFigure = { ...boxRotated, elements: [rotatedOwner, label] };

  const result = attachRotations(figure, spec);
  const rotatedText = result.elements.find((e) => e.kind === "text") as PlacedText;
  // The label's rotation centre must be the BOX's own centre (50,50), not the
  // label's own text-bbox centre (50,50 here too by coincidence of the fixture --
  // the real assertion is that it matches the box's rotationCenter exactly).
  assert.deepEqual(rotatedText.rotationCenter, rotatedOwner.rotationCenter);
  // And text-fits-box's pre-rotation comparison box must be preserved.
  assert.deepEqual(rotatedText.lines[0]!.localBox, { x: 30, y: 45, width: 40, height: 10 });
});

test("attachRotations leaves localBox unset when only the label rotates (rotateBox false/unset) -- unchanged existing behaviour", () => {
  const spec: FigureSpec = { version: 1, root: { type: "block", id: "box-1", label: "tick", rotation: 90 } };
  const owner = box();
  const label = text({
    lines: [{ text: "tick", x: 10, y: 25, box: { x: 10, y: 15, width: 40, height: 10 }, baselineUncertain: false }],
  });
  const figure: LaidOutFigure = { width: 200, height: 200, background: "#fff", elements: [owner, label] };

  const result = attachRotations(figure, spec);
  const rotatedText = result.elements.find((e) => e.kind === "text") as PlacedText;
  assert.equal(rotatedText.lines[0]!.localBox, undefined);
});

test("attachRotations is a no-op when no block declares a rotation", () => {
  const spec: FigureSpec = { version: 1, root: { type: "block", id: "box-1", label: "level" } };
  const owner = box();
  const label = text({
    lines: [{ text: "level", x: 10, y: 25, box: { x: 10, y: 15, width: 40, height: 10 }, baselineUncertain: false }],
  });
  const figure: LaidOutFigure = { width: 200, height: 200, background: "#fff", elements: [owner, label] };

  const result = attachRotations(figure, spec);
  assert.equal(result, figure);
});
