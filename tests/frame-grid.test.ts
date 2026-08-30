import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecks } from "../src/checks.ts";
import { parseSpec } from "../src/ir/types.ts";
import type { Block, LaidOutFigure, PlacedBox, PlacedText, Scene } from "../src/ir/types.ts";

function planeScene(grid: unknown, children: unknown[] = []) {
  return parseSpec({
    version: 1,
    root: {
      type: "scene",
      layout: "absolute",
      width: 400,
      height: 400,
      frames: [{ id: "plane", origin: { x: 200, y: 200 }, xUnit: 20, grid }],
      children,
    },
  });
}

const smallGrid = { x: { from: -2, to: 2 }, y: { from: -2, to: 2 } };

// --- expansion ---------------------------------------------------------------

test("a grid expands into stroked lines and numbered ticks", () => {
  const s = planeScene(smallGrid).root as Scene;
  // The lattice is MARKS: a filled rect can be a 1px line but not a dashed
  // one, and dashed gridlines are the norm in a plot. 5 vertical + 5
  // horizontal.
  assert.equal(s.marks!.filter((m) => m.id.includes("-grid-")).length, 10);
  // The numbers are blocks, because they are measured text -- 5 on each axis,
  // zero included: the two zeros land in different places, and where they
  // genuinely would collide, tick-labels-do-not-collide says so.
  const ticks = s.children.filter((c) => (c as Block).gridOf === "plane");
  assert.equal(ticks.filter((c) => c.id!.includes("-tick-")).length, 10);
});

test("gridlines can be dashed, and the axes stay solid", () => {
  const s = planeScene({ ...smallGrid, lineStyle: "dashed" }).root as Scene;
  const dashed = s.marks!.filter((m) => m.lineStyle === "dashed");
  const solid = s.marks!.filter((m) => m.lineStyle === undefined);
  assert.equal(dashed.length, 8, "every line but the two axes");
  // An axis dashed like its own gridlines stops reading as an axis.
  assert.equal(solid.length, 2);
});

test("grid furniture is generated FIRST, so it paints under the figure", () => {
  // pipeline.ts draws boxes, then connectors, then labels. A lattice built
  // from connectors would be drawn on top of everything standing on it.
  const s = planeScene(smallGrid, [
    { type: "block", id: "dot", frame: "plane", x: 1, y: 1, width: 8, height: 8, label: "" },
  ]).root as Scene;
  assert.equal((s.children[0] as Block).gridOf, "plane");
  assert.equal(s.children[s.children.length - 1]!.id, "dot");
});

test("tick ids carry the marker tick-labels-do-not-collide keys on", () => {
  // That check identifies ticks by id pattern and calls it a temporary
  // heuristic. Until it gains real metadata, this is the contract.
  const s = planeScene(smallGrid).root as Scene;
  const ticks = s.children.filter((c) => c.id!.includes("-tick-"));
  assert.ok(ticks.length > 0);
  for (const t of ticks) assert.match(t.id!, /-tick-/);
});

test("a grid can be asked for lines without numbers", () => {
  const s = planeScene({ ...smallGrid, labels: false }).root as Scene;
  assert.equal(s.children.filter((c) => c.id!.includes("-tick-")).length, 0);
  assert.ok(s.marks!.filter((m) => m.id.includes("-grid-")).length > 0);
});

// --- placement ---------------------------------------------------------------

test("anchor \"center\" puts a marker ON its lattice point", () => {
  const s = planeScene(smallGrid, [
    { type: "block", id: "dot", frame: "plane", x: 1, y: 1, width: 10, height: 10,
      anchor: "center", label: "" },
  ]).root as Scene;
  const dot = s.children.find((c) => c.id === "dot") as Block;
  // (1, 1) at 20px per unit is (220, 180); a centred 10px dot starts 5 back.
  assert.equal(dot.x, 215);
  assert.equal(dot.y, 175);
});

test("a sized block in a SCALED frame is placed in pixels, not in frame units", () => {
  // The regression: the half-box offset was added to the frame coordinate
  // before mapping, so `x + width / 2` mixed units. Invisible while xUnit is
  // 1, and 550px off the plane the moment a frame scales.
  const s = planeScene(smallGrid, [
    { type: "block", id: "box", frame: "plane", x: 0, y: 0, width: 40, height: 20, label: "" },
  ]).root as Scene;
  const box = s.children.find((c) => c.id === "box") as Block;
  // Corner anchoring: the frame point IS the top-left, whatever xUnit is.
  assert.equal(box.x, 200);
  assert.equal(box.y, 200);
});

// --- what the checks do with it ----------------------------------------------

function box(overrides: Partial<PlacedBox> = {}): PlacedBox {
  return {
    kind: "box", id: "b", x: 0, y: 0, width: 100, height: 100,
    fill: "#fff", stroke: "#000", strokeWidth: 1, radius: 0,
    content: { x: 0, y: 0, width: 100, height: 100 }, ...overrides,
  };
}

function figure(elements: (PlacedBox | PlacedText)[]): LaidOutFigure {
  return { width: 400, height: 400, background: "#fff", elements };
}

test("a lattice crosses itself, and that is not a collision", () => {
  const v = box({ id: "plane-grid-v-0", x: 50, y: 0, width: 1, height: 200, gridOf: "plane" });
  const h = box({ id: "plane-grid-h-0", x: 0, y: 50, width: 200, height: 1, gridOf: "plane" });
  const check = runChecks(figure([v, h])).find((c) => c.id === "boxes-do-not-overlap");
  assert.notEqual(check?.status, "fail");
  assert.match(check?.detail ?? "", /grid element\(s\) set aside as substrate/);
});

test("a shape standing on the grid does not collide with it either", () => {
  const line = box({ id: "plane-grid-v-0", x: 50, y: 0, width: 1, height: 200, gridOf: "plane" });
  const shape = box({ id: "tri", x: 20, y: 20, width: 80, height: 80 });
  const check = runChecks(figure([line, shape])).find((c) => c.id === "boxes-do-not-overlap");
  assert.notEqual(check?.status, "fail");
});

test("a gridline is not the surface a label sits on", () => {
  // A 1px line does not decide legibility, and scoring against it would fail
  // a perfectly readable figure for crossing one.
  const line = box({ id: "plane-grid-v-0", x: 40, y: 0, width: 1, height: 200, fill: "#000", gridOf: "plane" });
  const label: PlacedText = {
    kind: "text", id: "t", ownerId: null, fontFamily: "Arial", fontSize: 12, fill: "#111",
    anchor: "start",
    lines: [{ text: "3", x: 30, y: 40, box: { x: 30, y: 30, width: 30, height: 14 }, baselineUncertain: false }],
  };
  // #111 clears white easily and would score about 1.03:1 against the black
  // line, so passing here proves the line was not treated as the surface.
  const check = runChecks(figure([line, label])).find((c) => c.id === "contrast-sufficient");
  assert.equal(check?.status, "pass");
  assert.match(check?.detail ?? "", /#fff/i, "the canvas must be what it was scored against");
  assert.doesNotMatch(check?.detail ?? "", /#000/, "the gridline must not be the surface");
});

test("colliding tick labels ARE reported — the obligation a grid pays", () => {
  const mk = (id: string, x: number): PlacedText => ({
    kind: "text", id, ownerId: null, fontFamily: "Arial", fontSize: 12, fill: "#000",
    anchor: "start",
    lines: [{ text: "1", x, y: 10, box: { x, y: 0, width: 20, height: 12 }, baselineUncertain: false }],
  });
  const clear = runChecks(figure([mk("plane-tick-x-0", 0), mk("plane-tick-x-1", 40)]));
  assert.equal(clear.find((c) => c.id === "tick-labels-do-not-collide")?.status, "pass");
  const crowded = runChecks(figure([mk("plane-tick-x-0", 0), mk("plane-tick-x-1", 5)]));
  assert.equal(crowded.find((c) => c.id === "tick-labels-do-not-collide")?.status, "fail");
});
