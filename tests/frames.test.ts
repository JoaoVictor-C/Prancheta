import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveInFrame } from "../src/ir/frames.ts";
import { parseSpec, SpecError } from "../src/ir/types.ts";
import type { Block, Scene } from "../src/ir/types.ts";

function scene(frames: unknown[], children: unknown[] = [], connectors: unknown[] = []) {
  return {
    version: 1,
    canvas: { constraints: { allowCurvedConnectors: true, allowOverlap: true } },
    root: { type: "scene", layout: "absolute", width: 400, height: 400, frames, children, connectors },
  };
}

function resolved(spec: unknown): Scene {
  return parseSpec(spec).root as Scene;
}

const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;

// --- the transform -----------------------------------------------------------

test("a frame's y axis points UP, unlike the canvas", () => {
  const at = resolveInFrame({ id: "f", origin: { x: 100, y: 100 } }, 0, 10);
  assert.equal(at.x, 100);
  assert.equal(at.y, 90, "+y in a frame must be up the page");
});

test("rotation is counter-clockwise, matching those axes", () => {
  // The frame's +x, turned a quarter turn counter-clockwise, is straight up.
  const at = resolveInFrame({ id: "f", origin: { x: 0, y: 0 }, rotation: 90 }, 10, 0);
  assert.ok(near(at.x, 0) && near(at.y, -10), `expected (0, -10), got (${at.x}, ${at.y})`);
});

test("units scale each axis, and yUnit defaults to xUnit so a frame is square", () => {
  const square = resolveInFrame({ id: "f", origin: { x: 0, y: 0 }, xUnit: 20 }, 1, 1);
  assert.deepEqual(square, { x: 20, y: -20 });
  const wide = resolveInFrame({ id: "f", origin: { x: 0, y: 0 }, xUnit: 20, yUnit: 5 }, 1, 1);
  assert.deepEqual(wide, { x: 20, y: -5 });
});

// --- what it does to a block -------------------------------------------------

test("a block in a rotated frame is turned with it, and its box turns too", () => {
  // Block.rotation is CLOCKWISE where a frame's is counter-clockwise, so the
  // inherited value is negated. This sign flip is the sharp edge of frames.
  const s = resolved(
    scene(
      [{ id: "tilt", origin: { x: 100, y: 100 }, rotation: 30 }],
      [{ type: "block", id: "bar", frame: "tilt", x: 0, y: 0, width: 40, height: 4, label: "" }],
    ),
  );
  const bar = s.children[0] as Block;
  assert.equal(bar.rotation, -30);
  assert.equal(bar.rotateBox, true, "a frame turns the box, not just the glyphs");
});

test("a block that declares its own rotation keeps it", () => {
  // Labels want this: upright text inside a tilted frame.
  const s = resolved(
    scene(
      [{ id: "tilt", origin: { x: 100, y: 100 }, rotation: 30 }],
      [{ type: "block", id: "tag", frame: "tilt", x: 0, y: 0, width: 20, height: 10, rotation: 0, label: "N" }],
    ),
  );
  assert.equal((s.children[0] as Block).rotation, 0);
});

test("a sized block LIES IN its frame: its centre is what the frame places", () => {
  // Mapping the corner and then rotating about the centre swings the box away
  // from where the frame put it -- for a 430px bar at 30 degrees, 35px off the
  // canvas entirely.
  const s = resolved(
    scene(
      [{ id: "tilt", origin: { x: 200, y: 200 }, rotation: 90 }],
      [{ type: "block", id: "bar", frame: "tilt", x: 0, y: 0, width: 100, height: 10, label: "" }],
    ),
  );
  const bar = s.children[0] as Block;
  // Centre in frame coords is (50, -5); a quarter turn puts that at (205, 150).
  assert.ok(near(bar.x! + 50, 205, 1e-6), `centre x ${bar.x! + 50}`);
  assert.ok(near(bar.y! + 5, 150, 1e-6), `centre y ${bar.y! + 5}`);
});

// --- composition -------------------------------------------------------------

test("a frame's origin may be stated in another frame", () => {
  // The reason frames are worth having: an application point natural to state
  // on the incline, and a weight natural to state as straight down.
  const s = resolved(
    scene(
      [
        { id: "incline", origin: { x: 0, y: 100 }, rotation: 90 },
        { id: "contact", origin: { frame: "incline", x: 50, y: 0 } },
      ],
      [],
      [{ id: "w", from: { frame: "contact", x: 0, y: 0 }, to: { frame: "contact", x: 0, y: -30 } }],
    ),
  );
  const edge = s.connectors![0]!;
  const from = edge.from as { x: number; y: number };
  const to = edge.to as { x: number; y: number };
  // contact sits 50 along the incline's +x, which a quarter turn points up.
  assert.ok(near(from.x, 0) && near(from.y, 50), `contact at (${from.x}, ${from.y})`);
  // and "down" in the unrotated contact frame is straight down the page.
  assert.ok(near(to.x, 0) && near(to.y, 80), `weight tip at (${to.x}, ${to.y})`);
});

test("the same point in two frames subtends exactly the angle between them", () => {
  // This is what closes the defect ADR 0019 opens with: an arc drawn between
  // one point expressed in two frames measures the frames' own rotation, so
  // the slope's angle and the arc's angle cannot be different numbers.
  const s = resolved(
    scene(
      [
        { id: "world", origin: { x: 0, y: 200 } },
        { id: "incline", origin: { x: 0, y: 200 }, rotation: 30 },
      ],
      [],
      [{ id: "arc", from: { frame: "world", x: 100, y: 0 }, to: { frame: "incline", x: 100, y: 0 } }],
    ),
  );
  const edge = s.connectors![0]!;
  const a = edge.from as { x: number; y: number };
  const b = edge.to as { x: number; y: number };
  const centre = { x: 0, y: 200 };
  const angle =
    (Math.acos(
      ((a.x - centre.x) * (b.x - centre.x) + (a.y - centre.y) * (b.y - centre.y)) / (100 * 100),
    ) *
      180) /
    Math.PI;
  assert.ok(near(angle, 30, 1e-6), `expected 30 degrees between the frames, got ${angle}`);
});

// --- refusals ----------------------------------------------------------------

test("a reference to a frame the scene never declared is refused, and the known ones listed", () => {
  assert.throws(
    () =>
      parseSpec(
        scene([{ id: "real", origin: { x: 0, y: 0 } }], [
          { type: "block", id: "b", frame: "ghost", x: 0, y: 0, width: 10, height: 10, label: "" },
        ]),
      ),
    (error: unknown) =>
      error instanceof SpecError &&
      /names frame "ghost"/.test(error.message) &&
      /it declares real/.test(error.message),
  );
});

test("a frame declared twice in one scene is refused", () => {
  assert.throws(
    () =>
      parseSpec(
        scene([
          { id: "dup", origin: { x: 0, y: 0 } },
          { id: "dup", origin: { x: 10, y: 10 } },
        ]),
      ),
    (error: unknown) => error instanceof SpecError && /declared twice/.test(error.message),
  );
});

test("a zero unit is refused rather than collapsing the frame onto its origin", () => {
  assert.throws(
    () => parseSpec(scene([{ id: "f", origin: { x: 0, y: 0 }, xUnit: 0 }])),
    (error: unknown) => error instanceof SpecError && /must not be zero/.test(error.message),
  );
});

test("a frame with no origin is refused", () => {
  assert.throws(
    () => parseSpec(scene([{ id: "f" }])),
    (error: unknown) => error instanceof SpecError && /origin must be an \{x, y\} point/.test(error.message),
  );
});

// --- idempotence -------------------------------------------------------------

test("resolving twice changes nothing, because resolution strips what it consumed", () => {
  // normalise runs more than once per render. A resolution that left its own
  // input in place would transform the same coordinates on every pass.
  const input = scene(
    [{ id: "tilt", origin: { x: 100, y: 100 }, rotation: 30 }],
    [{ type: "block", id: "bar", frame: "tilt", x: 10, y: 10, width: 40, height: 4, label: "" }],
  );
  const once = parseSpec(input);
  const twice = parseSpec(once);
  assert.deepEqual(twice, once);
  assert.equal((once.root as Scene).frames, undefined, "frames must be gone once resolved");
  assert.equal(((once.root as Scene).children[0] as Block).frame, undefined);
});

// --- aiming a frame at a point ----------------------------------------------

test("a frame aimed at a point takes its rotation from the two ends", () => {
  // The reason this exists: an equal-side tick across AB is perpendicular to
  // AB, and the moment an author has to type AB's angle, that number can
  // disagree with where A and B actually are.
  const s = resolved(
    scene([
      { id: "page", origin: { x: 0, y: 100 } },
      // From the origin towards (100, 100) in page units, which is up and
      // right at exactly 45 degrees.
      { id: "aimed", origin: { frame: "page", x: 0, y: 0 }, towards: { frame: "page", x: 100, y: 100 } },
    ], [
      { type: "block", id: "tick", frame: "aimed", x: 0, y: 0, width: 2, height: 20, label: "" },
    ]),
  );
  // Block.rotation is clockwise and the frame's is counter-clockwise.
  assert.equal((s.children[0] as Block).rotation, -45);
});

test("aiming and stating a rotation at once is refused", () => {
  assert.throws(
    () =>
      parseSpec(
        scene([{ id: "f", origin: { x: 0, y: 0 }, rotation: 10, towards: { x: 1, y: 1 } }]),
      ),
    (error: unknown) =>
      error instanceof SpecError && /aimed one way or the other/.test(error.message),
  );
});

test("a frame's perpendicular is its y axis, so a tick needs no trigonometry", () => {
  // A 2x20 block in a frame aimed along a side runs 2px ALONG it and 20px
  // ACROSS it, whatever direction that side happens to run.
  const s = resolved(
    scene([
      { id: "side", origin: { x: 0, y: 0 }, towards: { x: 0, y: -50 } }, // straight up the page
    ], [
      { type: "block", id: "tick", frame: "side", x: 0, y: 0, width: 2, height: 20, label: "" },
    ]),
  );
  // Aimed up the page is +90 degrees counter-clockwise, so the block turns -90.
  assert.equal((s.children[0] as Block).rotation, -90);
});

test("a malformed aim is refused rather than silently leaving the frame unrotated", () => {
  assert.throws(
    () => parseSpec(scene([{ id: "f", origin: { x: 0, y: 0 }, towards: { x: 1 } }])),
    (error: unknown) => error instanceof SpecError && /towards must be an \{x, y\} point/.test(error.message),
  );
});
