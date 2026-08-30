import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecks } from "../src/checks.ts";
import { parseSpec, SpecError } from "../src/ir/types.ts";
import type { LaidOutFigure, PlacedBox, PlacedConnector, PlacedMark, PlacedText } from "../src/ir/types.ts";

function box(overrides: Partial<PlacedBox> = {}): PlacedBox {
  return {
    kind: "box",
    id: "box-1",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fill: "#fff",
    stroke: "#000",
    strokeWidth: 1,
    radius: 0,
    content: { x: 5, y: 5, width: 90, height: 90 },
    ...overrides,
  };
}

function label(id: string, ownerId: string, rect: { x: number; y: number }): PlacedText {
  return {
    kind: "text",
    id,
    ownerId,
    fontFamily: "Arial",
    fontSize: 12,
    fill: "#000",
    anchor: "start",
    lines: [
      { text: "N", x: rect.x, y: rect.y, box: { ...rect, width: 20, height: 14 }, baselineUncertain: false },
    ],
  };
}

function figure(elements: (PlacedBox | PlacedText | PlacedConnector | PlacedMark)[]): LaidOutFigure {
  return { width: 600, height: 600, background: "#fff", elements };
}

function check(id: string, elements: (PlacedBox | PlacedText | PlacedConnector | PlacedMark)[]) {
  return runChecks(figure(elements)).find((c) => c.id === id);
}

// --- the authored surface ----------------------------------------------------

function scene(children: Record<string, unknown>[], connectors: Record<string, unknown>[] = []) {
  return {
    version: 1,
    root: { type: "scene", layout: "absolute", width: 400, height: 300, children, connectors },
  };
}

test("a block may declare the sibling block it names", () => {
  assert.doesNotThrow(() =>
    parseSpec(
      scene([
        { type: "block", id: "thing", x: 0, y: 0, width: 40, height: 40, label: "" },
        { type: "block", id: "tag", x: 50, y: 0, width: 30, height: 20, label: "N", annotates: "thing" },
      ]),
    ),
  );
});

test("a block may name a CONNECTOR, which is what a force label actually does", () => {
  // The case the feature exists for: in a free-body diagram every force label
  // names an arrow, not a box. Restricting this to children would refuse it.
  assert.doesNotThrow(() =>
    parseSpec(
      scene(
        [
          { type: "block", id: "a", x: 0, y: 0, width: 40, height: 40, label: "" },
          { type: "block", id: "b", x: 200, y: 0, width: 40, height: 40, label: "" },
          { type: "block", id: "tag", x: 90, y: 60, width: 30, height: 20, label: "N", annotates: "force" },
        ],
        [{ id: "force", from: "a", to: "b" }],
      ),
    ),
  );
});

test("a block may name a MARK — ink is nameable too", () => {
  // Found by drawing an origin tick: "O" names a mark, and refusing it sent
  // the author back to inventing an invisible block to hang the label on,
  // which is the workaround this feature exists to remove.
  assert.doesNotThrow(() =>
    parseSpec({
      version: 1,
      root: {
        type: "scene", layout: "absolute", width: 400, height: 300,
        children: [
          { type: "block", id: "tag", x: 0, y: 40, width: 30, height: 20, label: "O", annotates: "tick" },
        ],
        marks: [{ id: "tick", from: { x: 10, y: 0 }, segments: [{ line: { x: 10, y: 20 } }],
                  close: false, stroke: "#000", strokeWidth: 2 }],
      },
    }),
  );
});

test("naming itself is refused — an annotation names something else", () => {
  assert.throws(
    () =>
      parseSpec(
        scene([{ type: "block", id: "tag", x: 0, y: 0, width: 30, height: 20, label: "N", annotates: "tag" }]),
      ),
    (error: unknown) => error instanceof SpecError && /names itself/.test(error.message),
  );
});

test("naming something that is not in the scene is refused at parse time", () => {
  assert.throws(
    () =>
      parseSpec(
        scene([{ type: "block", id: "tag", x: 0, y: 0, width: 30, height: 20, label: "N", annotates: "ghost" }]),
      ),
    (error: unknown) =>
      error instanceof SpecError && /not a block, connector or mark in this scene/.test(error.message),
  );
});

// --- the relief it buys ------------------------------------------------------

test("a label may lie on the box it names, where any other box is still a collision", () => {
  const named = box({ id: "named", x: 0, y: 0, width: 100, height: 100 });
  const tag = box({ id: "tag", x: 90, y: 40, width: 20, height: 14, annotates: "named" });
  const clear = check("text-clear-of-other-boxes", [named, tag, label("tag--label", "tag", { x: 90, y: 40 })]);
  assert.equal(clear?.status, "pass");
});

test("the relief is for the named box ONLY", () => {
  // The label names something else in the figure, so lying on `named` is the
  // collision it always was. Straddling rather than inside it, because a box
  // that fully CONTAINS the label's own box is excused as ancestry by a rule
  // that predates this one -- an exemption arriving from the wrong direction
  // would make this test pass without proving anything.
  const named = box({ id: "named", x: 0, y: 0, width: 100, height: 100 });
  const other = box({ id: "other", x: 300, y: 300, width: 40, height: 40 });
  const tag = box({ id: "tag", x: 90, y: 40, width: 20, height: 14, annotates: "other" });
  const clear = check("text-clear-of-other-boxes", [
    named,
    other,
    tag,
    label("tag--label", "tag", { x: 90, y: 40 }),
  ]);
  assert.equal(clear?.status, "fail");
  assert.match(clear?.detail ?? "", /named/);
});

test("boxes-do-not-overlap excuses an annotation and the box it names, and nothing else", () => {
  const named = box({ id: "named", x: 0, y: 0, width: 100, height: 100 });
  const tag = box({ id: "tag", x: 80, y: 80, width: 40, height: 40, annotates: "named" });
  assert.equal(check("boxes-do-not-overlap", [named, tag])?.status, "pass");

  const unrelated = box({ id: "tag", x: 80, y: 80, width: 40, height: 40 });
  assert.equal(check("boxes-do-not-overlap", [named, unrelated])?.status, "fail");
});

// --- the obligation it costs -------------------------------------------------

test("an annotation nearer something it does NOT name is reported", () => {
  const owner = box({ id: "owner", x: 0, y: 0, width: 40, height: 40 });
  const decoy = box({ id: "decoy", x: 210, y: 0, width: 40, height: 40 });
  // Sits 10px from the decoy and 160px from what it claims to name.
  const tag = box({ id: "tag", x: 200, y: 10, width: 8, height: 8, annotates: "owner" });
  const result = check("annotation-nearest-its-owner", [owner, decoy, tag]);
  assert.equal(result?.status, "fail");
  assert.match(result?.detail ?? "", /tag names owner/);
  assert.match(result?.detail ?? "", /decoy/);
});

test("an annotation beside what it names passes, whatever else is in the figure", () => {
  const owner = box({ id: "owner", x: 0, y: 0, width: 40, height: 40 });
  const far = box({ id: "far", x: 400, y: 400, width: 40, height: 40 });
  const tag = box({ id: "tag", x: 45, y: 10, width: 20, height: 14, annotates: "owner" });
  assert.equal(check("annotation-nearest-its-owner", [owner, far, tag])?.status, "pass");
});

test("a figure with no annotations is not-applicable, not a vacuous pass", () => {
  const result = check("annotation-nearest-its-owner", [box({ id: "a" })]);
  assert.equal(result?.status, "not-applicable");
  assert.equal(result?.examined, 0);
});

test("a mark competes for nearest like a connector, by its line", () => {
  const tick: PlacedMark = {
    kind: "mark", id: "tick", points: [{ x: 100, y: 0 }, { x: 100, y: 20 }],
    closed: false, fill: "none", stroke: "#000", strokeWidth: 2, lineStyle: "solid",
    arcCentres: [],
  };
  const owner = box({ id: "owner", x: 0, y: 0, width: 20, height: 20 });
  // Sits 5px from the tick it does NOT name and 75px from the box it does.
  const tag = box({ id: "tag", x: 90, y: 5, width: 5, height: 5, annotates: "owner" });
  const result = runChecks(figure([owner, tag, tick])).find(
    (c) => c.id === "annotation-nearest-its-owner",
  );
  assert.equal(result?.status, "fail");
  assert.match(result?.detail ?? "", /tick/);
});

test("a connector is measured by its LINE, not by its bounding box", () => {
  // A long diagonal arrow's bounding box covers most of the figure. Measured
  // that way it would beat every real neighbour and the check would be noise.
  const connector: PlacedConnector = {
    kind: "connector",
    id: "arrow",
    fromId: null,
    toId: null,
    points: [
      { x: 0, y: 0 },
      { x: 400, y: 400 },
    ],
    arrow: "end",
    arrowStyle: "closed",
    dashed: false,
    lineStyle: "solid",
    stroke: "#000",
    strokeWidth: 2,
  };
  // Deep inside the arrow's bounding box but far from the arrow itself, and
  // sitting right next to a box it does not name.
  const near = box({ id: "near", x: 380, y: 0, width: 20, height: 20 });
  const tag = box({ id: "tag", x: 350, y: 5, width: 20, height: 14, annotates: "arrow" });
  const result = check("annotation-nearest-its-owner", [near, tag, connector]);
  assert.equal(result?.status, "fail", "the arrow's bounding box must not count as the arrow");
});

test("a label lying on the connector it names does not fail connector-clear-of-boxes", () => {
  const connector: PlacedConnector = {
    kind: "connector",
    id: "arrow",
    fromId: null,
    toId: null,
    points: [
      { x: 0, y: 50 },
      { x: 200, y: 50 },
    ],
    arrow: "end",
    arrowStyle: "closed",
    dashed: false,
    lineStyle: "solid",
    stroke: "#000",
    strokeWidth: 2,
  };
  const tag = box({ id: "tag", x: 90, y: 40, width: 30, height: 20, annotates: "arrow" });
  assert.equal(check("connector-clear-of-boxes", [tag, connector])?.status, "pass");

  const stranger = box({ id: "tag", x: 90, y: 40, width: 30, height: 20 });
  assert.equal(check("connector-clear-of-boxes", [stranger, connector])?.status, "fail");
});
