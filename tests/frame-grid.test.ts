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
  // horizontal, the two through zero named as the axes (ADR 0025).
  assert.equal(s.marks!.filter((m) => m.id.includes("-grid-") || m.id.includes("-axis-")).length, 10);
  assert.ok(s.marks!.some((m) => m.id === "plane-axis-x") && s.marks!.some((m) => m.id === "plane-axis-y"));
  // The numbers are blocks, because they are measured text -- 4 on each axis
  // and ONE zero at the origin (ADR 0034): numbered per axis, each zero sat
  // on the other axis.
  const ticks = s.children.filter((c) => (c as Block).gridOf === "plane");
  assert.equal(ticks.filter((c) => c.id!.includes("-tick-")).length, 9);
  assert.equal(ticks.filter((c) => c.id === "plane-tick-origin").length, 1);
});

test("a gridline never competes to be the nearest thing to a label", () => {
  // Regression: gridlines became marks, marks became annotation candidates,
  // and every vertex label on a dense plane was suddenly "nearer a gridline"
  // than the point it named. Grid furniture is substrate in whichever form it
  // takes -- a numbered tick is a block, a ruled line is a mark.
  const s = planeScene(smallGrid).root as Scene;
  for (const m of s.marks!) assert.equal(m.gridOf, "plane");
});

test("each axis sets its own label density", () => {
  // The two axes rarely want the same one. Ruling every 50s and every 200m,
  // a plot wants a number on every fourth line of x and every second of y;
  // one value for both forces the denser axis to carry labels it has no room
  // for.
  const s = planeScene({
    x: { from: 0, to: 8, step: 1, labelEvery: 4 },
    y: { from: 0, to: 8, step: 1, labelEvery: 2 },
  }).root as Scene;
  const ticks = s.children.filter((c) => c.id!.includes("-tick-"));
  // Zero is shared, printed once at the origin.
  assert.equal(ticks.filter((c) => c.id!.includes("-tick-x-")).length, 2, "4, 8");
  assert.equal(ticks.filter((c) => c.id!.includes("-tick-y-")).length, 4, "2, 4, 6, 8");
  assert.equal(ticks.filter((c) => c.id!.includes("-tick-origin")).length, 1, "0");
});

test("an axis with no density of its own falls back to the grid's", () => {
  const s = planeScene({
    x: { from: 0, to: 4, step: 1 },
    y: { from: 0, to: 4, step: 1, labelEvery: 1 },
    labelEvery: 2,
  }).root as Scene;
  const ticks = s.children.filter((c) => c.id!.includes("-tick-"));
  assert.equal(ticks.filter((c) => c.id!.includes("-tick-x-")).length, 2, "fell back to 2: 2, 4 (+ the shared 0)");
  assert.equal(ticks.filter((c) => c.id!.includes("-tick-y-")).length, 4, "stated its own 1: 1..4 (+ the shared 0)");
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

// --- tick numbers: locale, contrast, the origin, and ink (ADR 0034) ----------

const tickOf = (s: Scene, id: string): Block => s.children.find((c) => c.id === id) as Block;

test("without a locale, tick numbers print exactly as they always have", () => {
  const s = planeScene({ x: { from: -1, to: 1, step: 0.5 }, y: { from: -1, to: 1, step: 0.5 } }).root as Scene;
  const labels = s.children.filter((c) => c.id!.includes("-tick-x-")).map((c) => (c as Block).label);
  assert.deepEqual(labels, ["-1", "-0.5", "0.5", "1"]);
});

test("with a locale, tick numbers go through the project's formatter", () => {
  const s = planeScene({ x: { from: -1, to: 1, step: 0.5 }, y: { from: -1, to: 1, step: 0.5 }, locale: "pt-BR" }).root as Scene;
  const labels = s.children.filter((c) => c.id!.includes("-tick-x-")).map((c) => (c as Block).label);
  assert.deepEqual(labels, ["−1", "−0,5", "0,5", "1"]);
});

test("the single origin zero sits in the corner, clear of both axes", () => {
  // Origin at (200, 200): the box must lie wholly left of x = 200 and below
  // y = 200, so neither axis runs through it.
  const zero = tickOf(planeScene(smallGrid).root as Scene, "plane-tick-origin");
  assert.equal(zero.label, "0");
  assert.ok(zero.x! + zero.width! < 199, `right edge ${zero.x! + zero.width!}`);
  assert.ok(zero.y! > 201, `top ${zero.y}`);
});

test("a plane numbered along its low edge keeps two zeros", () => {
  // Neither axis spans zero here, so there is no origin corner to share.
  const s = planeScene({ x: { from: 1, to: 3 }, y: { from: 1, to: 3 } }).root as Scene;
  assert.equal(s.children.filter((c) => c.id === "plane-tick-origin").length, 0);
});

test("tick numbers are darker than the lattice by default", () => {
  const t = tickOf(planeScene(smallGrid).root as Scene, "plane-tick-x-0");
  assert.equal(t.textColor, "#4B5563");
});

function plane(grid: unknown, extra: Record<string, unknown> = {}, background?: string) {
  return parseSpec({
    version: 1,
    ...(background === undefined ? {} : { canvas: { background } }),
    root: {
      type: "scene",
      layout: "absolute",
      width: 400,
      height: 400,
      frames: [{ id: "plane", origin: { x: 200, y: 200 }, xUnit: 40, grid }],
      children: [],
      ...extra,
    },
  }).root as Scene;
}

test("on a solid paper, a tick number is backed with it, interrupting its gridline", () => {
  const s = plane({ x: { from: -2, to: 2 }, y: { from: -2, to: 2 } }, {}, "#FCFBF7");
  assert.equal(tickOf(s, "plane-tick-x-0").fill, "#FCFBF7");
  // No solid paper, no backing: nothing is guessed.
  assert.equal(tickOf(plane({ x: { from: -2, to: 2 }, y: { from: -2, to: 2 } }), "plane-tick-x-0").fill, "none");
});

test("a tick number steps off a line drawn along its own gridline", () => {
  // A vector along x = −2 crosses the axis exactly where "−2" is printed,
  // above and below, and runs the whole gridline; the number moves sideways,
  // still nearer its own tick (80px from the next) than any other.
  const grid = { x: { from: -2, to: 2, step: 2 }, y: { from: -2, to: 2 } };
  const s = plane(grid, {
    connectors: [{ id: "AB", from: { frame: "plane", x: -2, y: -2 }, to: { frame: "plane", x: -2, y: 2 }, arrow: "end" }],
  }, "#FCFBF7");
  const t = tickOf(s, "plane-tick-x-0");
  assert.equal(t.label, "-2");
  const lineX = 120;
  assert.ok(t.x! > lineX || t.x! + t.width! < lineX, `box ${t.x}..${t.x! + t.width!} still on x = ${lineX}`);
  assert.ok(Math.abs(t.x! + t.width! / 2 - lineX) < 40, "stayed nearer its own tick than the next");
  assert.equal(t.fill, "#FCFBF7", "a clear spot earns the backing");
});

test("when no spot is clear, the number keeps its place WITHOUT a backing", () => {
  // A backing would let text-clear-of-ink wave the collision through, and a
  // connector paints over boxes anyway -- so the collision is left visible
  // for the check to report.
  const grid = { x: { from: -2, to: 2 }, y: { from: -2, to: 2 } };
  const wall = [-1.4, -1.2, -1, -0.8, -0.6].map((x, i) => ({
    id: `w${i}`, from: { frame: "plane", x, y: -2 }, to: { frame: "plane", x, y: 2 },
  }));
  const s = plane(grid, { connectors: wall }, "#FCFBF7");
  const t = tickOf(s, "plane-tick-x-1");
  assert.equal(t.fill, "none");
  assert.equal(t.y, 205, "the first-choice spot, just below the axis");
});
