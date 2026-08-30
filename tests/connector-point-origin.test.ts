import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "../src/pipeline.ts";
import { parseSpec, SpecError } from "../src/ir/types.ts";

function scene(connectors: Record<string, unknown>[]) {
  return {
    version: 1,
    canvas: { theme: "print" as const, constraints: { allowConnectorCrossing: true } },
    root: {
      type: "scene",
      layout: "absolute",
      width: 300,
      height: 200,
      children: [
        { type: "block", id: "a", x: 20, y: 80, width: 60, height: 40, label: "a" },
        { type: "block", id: "b", x: 200, y: 80, width: 60, height: 40, label: "b" },
      ],
      connectors,
    },
  };
}

// --- the authored surface ----------------------------------------------------

test("a bare point is accepted as a connector origin, as it already was as a target", () => {
  assert.doesNotThrow(() => parseSpec(scene([{ from: { x: 10, y: 10 }, to: "b" }])));
});

test("both ends may be points — a free vector", () => {
  assert.doesNotThrow(() =>
    parseSpec(scene([{ from: { x: 10, y: 10 }, to: { x: 100, y: 100 } }])),
  );
});

test("a malformed origin is refused by the same rule that guards the target", () => {
  assert.throws(
    () => parseSpec(scene([{ from: { x: 10 }, to: "b" }])),
    (error: unknown) =>
      error instanceof SpecError && /from must be a block id or a \{x, y\} point/.test(error.message),
  );
});

test("an origin naming a block that is not in the scene is still refused", () => {
  assert.throws(
    () => parseSpec(scene([{ from: "ghost", to: "b" }])),
    (error: unknown) => error instanceof SpecError && /is not a child of this scene/.test(error.message),
  );
});

// --- what actually gets drawn ------------------------------------------------

test(
  "a stated origin is drawn exactly where it was stated, not pulled back off itself",
  { timeout: 60000 },
  async () => {
    // routeToPoint already leaves a stated TARGET unclipped, for the reason
    // that a coordinate the author chose is a claim the figure makes. The
    // origin is the same claim in the other direction, so the two must land
    // on the same page coordinate for the same scene-local point -- asserted
    // that way rather than against a literal, because a scene is lifted by
    // its own placement and a raw 40 would be testing the padding.
    const spot = { x: 40, y: 30 };
    const asOrigin = await render(parseSpec(scene([{ from: spot, to: "b" }])));
    const asTarget = await render(parseSpec(scene([{ from: "b", to: spot }])));
    const origin = asOrigin.figure.elements.find((e) => e.kind === "connector");
    const target = asTarget.figure.elements.find((e) => e.kind === "connector");
    assert.ok(origin && origin.kind === "connector" && target && target.kind === "connector");
    const start = origin.points[0]!;
    const end = target.points[target.points.length - 1]!;
    assert.deepEqual(
      { x: start.x, y: start.y },
      { x: end.x, y: end.y },
      "a point must mean the same place whichever end of a connector it is on",
    );
  },
);

test(
  "the far end is still clipped to the box it arrives at",
  { timeout: 60000 },
  async () => {
    const result = await render(parseSpec(scene([{ from: { x: 40, y: 30 }, to: "b" }])));
    const connector = result.figure.elements.find((e) => e.kind === "connector");
    assert.ok(connector && connector.kind === "connector");
    const end = connector.points[connector.points.length - 1]!;
    // b spans x 200..260; an arrow into it must stop on its border, not at
    // its centre and not past it.
    assert.ok(end.x < 232, `expected the route to stop before b's centre, got x=${end.x}`);
  },
);

test(
  "several forces from ONE application point share ONE start coordinate",
  { timeout: 60000 },
  async () => {
    // The whole reason this exists. Routed from a block, three arrows leave
    // that block's boundary at three different places, and a free-body
    // diagram whose forces do not share an application point is not one.
    const origin = { x: 150, y: 100 };
    const result = await render(
      parseSpec(
        scene([
          { id: "w", from: origin, to: { x: 150, y: 180 } },
          { id: "n", from: origin, to: { x: 210, y: 60 } },
          { id: "f", from: origin, to: { x: 90, y: 60 } },
        ]),
      ),
    );
    const starts = result.figure.elements
      .filter((e) => e.kind === "connector")
      .map((e) => (e.kind === "connector" ? `${e.points[0]!.x},${e.points[0]!.y}` : ""));
    assert.equal(starts.length, 3);
    assert.equal(new Set(starts).size, 1, `expected one shared origin, got ${starts.join(" | ")}`);
  },
);

test(
  "a point-origin connector reports no block at that end, and the manifest says so",
  { timeout: 60000 },
  async () => {
    const result = await render(parseSpec(scene([{ id: "v", from: { x: 40, y: 30 }, to: "b" }])));
    const connector = result.figure.elements.find((e) => e.kind === "connector");
    assert.ok(connector && connector.kind === "connector");
    assert.equal(connector.fromId, null);
    const entry = result.manifest.elements.find((e) => e.id === "v");
    // `joins` lists the boxes actually attached to; for this one that is only b.
    assert.deepEqual(entry?.joins, ["b"]);
  },
);

test(
  "a free vector joins nothing and claims nothing",
  { timeout: 60000 },
  async () => {
    const result = await render(
      parseSpec(scene([{ id: "v", from: { x: 40, y: 30 }, to: { x: 120, y: 150 } }])),
    );
    const entry = result.manifest.elements.find((e) => e.id === "v");
    assert.deepEqual(entry?.joins, []);
    assert.equal(entry?.ownerId, undefined);
  },
);

test(
  "a block origin still routes and clips exactly as before",
  { timeout: 60000 },
  async () => {
    // The widening must not change the path every existing figure takes.
    const result = await render(parseSpec(scene([{ from: "a", to: "b" }])));
    const connector = result.figure.elements.find((e) => e.kind === "connector");
    assert.ok(connector && connector.kind === "connector");
    assert.equal(connector.fromId, "a");
    // a spans x 20..80, so a clipped start sits on its right border, not its centre.
    assert.ok(connector.points[0]!.x > 50, `expected a clipped start, got x=${connector.points[0]!.x}`);
  },
);
