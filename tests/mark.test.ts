import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecks } from "../src/checks.ts";
import { toSvg } from "../src/render/svg.ts";
import { render } from "../src/pipeline.ts";
import { parseSpec } from "../src/ir/types.ts";
import type { LaidOutFigure, PlacedMark, PlacedText, Scene } from "../src/ir/types.ts";

function mark(overrides: Partial<PlacedMark> = {}): PlacedMark {
  return {
    kind: "mark",
    id: "m",
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
    closed: true,
    fill: "#000000",
    stroke: "none",
    strokeWidth: 0,
    lineStyle: "solid",
    arcCentres: [],
    ...overrides,
  };
}

function figure(elements: (PlacedMark | PlacedText)[]): LaidOutFigure {
  return { width: 400, height: 400, background: "#FFFFFF", elements };
}

function label(fill: string, at = { x: 40, y: 40 }): PlacedText {
  return {
    kind: "text", id: "t", ownerId: null, fontFamily: "Arial", fontSize: 12, fill,
    anchor: "start",
    lines: [{ text: "x", x: at.x, y: at.y, box: { ...at, width: 20, height: 14 }, baselineUncertain: false }],
  };
}

// --- flattening --------------------------------------------------------------

test(
  "an arc segment lands on the circle it was given, not near it",
  { timeout: 60000 },
  async () => {
    const result = await render(
      parseSpec({
        version: 1,
        root: {
          type: "scene", layout: "absolute", width: 400, height: 400, children: [],
          marks: [{
            id: "arc",
            from: { x: 300, y: 200 },
            segments: [{ arc: { x: 200, y: 100 }, centre: { x: 200, y: 200 } }],
            close: false, stroke: "#000", strokeWidth: 2,
          }],
        },
      }),
    );
    const placed = result.figure.elements.find((e) => e.kind === "mark");
    assert.ok(placed && placed.kind === "mark");
    assert.ok(placed.points.length > 2, "an arc must flatten to more than its chord");
    // Every sampled point sits on the circle, within the flattener's own bound.
    const centre = placed.arcCentres[0]!.centre;
    for (const point of placed.points) {
      const r = Math.hypot(point.x - centre.x, point.y - centre.y);
      assert.ok(Math.abs(r - 100) < 0.5, `expected radius 100, got ${r}`);
    }
  },
);

test(
  "a mark paints in its own layer, before the boxes",
  { timeout: 60000 },
  async () => {
    // A shaded region is what the rest of the figure is drawn ON.
    const result = await render(
      parseSpec({
        version: 1,
        root: {
          type: "scene", layout: "absolute", width: 300, height: 300,
          children: [{ type: "block", id: "b", x: 10, y: 10, width: 50, height: 50, label: "" }],
          marks: [{ id: "shade", from: { x: 0, y: 0 },
                    segments: [{ line: { x: 100, y: 0 } }, { line: { x: 100, y: 100 } }],
                    fill: "#eee" }],
        },
      }),
    );
    assert.ok(result.svg.indexOf('id="pr-marks"') < result.svg.indexOf('id="pr-boxes"'));
  },
);

test("a mark with fewer than two points draws nothing rather than a degenerate path", () => {
  const svg = toSvg(figure([mark({ points: [{ x: 1, y: 1 }] })]));
  assert.ok(!svg.includes("pr-marks") || !svg.includes('d="M'));
});

// --- what a mark is to the checks -------------------------------------------

test("a closed, filled mark IS the surface a label sits on", () => {
  // The obligation ADR 0019 named as the Mark's price. Without it, shading a
  // region under a label changes what a reader sees and nothing measures it.
  const check = runChecks(figure([mark({ fill: "#101010" }), label("#141414")]))
    .find((c) => c.id === "contrast-sufficient");
  assert.equal(check?.status, "fail");
  assert.match(check?.detail ?? "", /#101010/);
});

test("an OPEN mark is a line, not a ground, and is not substrate", () => {
  const check = runChecks(figure([mark({ closed: false, fill: "#101010" }), label("#141414")]))
    .find((c) => c.id === "contrast-sufficient");
  assert.equal(check?.status, "pass");
  assert.match(check?.detail ?? "", /#FFFFFF/);
});

test("a label outside a filled mark is scored against the canvas", () => {
  const check = runChecks(figure([mark({ fill: "#101010" }), label("#141414", { x: 300, y: 300 })]))
    .find((c) => c.id === "contrast-sufficient");
  assert.equal(check?.status, "pass");
});

test("a mark's own stroke reach counts towards staying on the canvas", () => {
  // The bleed a mark actually has: no effect, no halo, just the pen. Ignoring
  // it would let an outline's edge fall off while its centreline sat inside.
  const onEdge = mark({
    points: [{ x: 0, y: 200 }, { x: 200, y: 200 }],
    closed: false, fill: "none", stroke: "#000", strokeWidth: 12,
  });
  const check = runChecks(figure([onEdge])).find((c) => c.id === "content-within-canvas");
  assert.equal(check?.status, "fail", "6px of pen past x=0 is 6px off the canvas");
});

// --- arc-is-circular ---------------------------------------------------------

test("an arc whose ends are not equidistant from its centre is reported", () => {
  // Stating two endpoints AND a centre is one number more than a circle
  // needs, so the three can disagree -- and sweepCommands averages the radii
  // and draws a smooth curve matching neither, which nothing else notices.
  const bad = mark({
    arcCentres: [{ centre: { x: 0, y: 0 }, from: { x: 100, y: 0 }, to: { x: 0, y: 140 } }],
  });
  const check = runChecks(figure([bad])).find((c) => c.id === "arc-is-circular");
  assert.equal(check?.status, "fail");
  assert.match(check?.detail ?? "", /100px one side of its centre and 140px the other/);
});

test("an arc whose ends agree passes, within the half-pixel everything else tolerates", () => {
  const good = mark({
    arcCentres: [{ centre: { x: 0, y: 0 }, from: { x: 100, y: 0 }, to: { x: 0, y: 100.3 } }],
  });
  assert.equal(runChecks(figure([good])).find((c) => c.id === "arc-is-circular")?.status, "pass");
});

test("a figure with no arcs is not-applicable, not a vacuous pass", () => {
  const check = runChecks(figure([mark()])).find((c) => c.id === "arc-is-circular");
  assert.equal(check?.status, "not-applicable");
  assert.equal(check?.examined, 0);
});

// --- frames ------------------------------------------------------------------

test("a mark states its geometry in a frame like everything else", () => {
  const s = parseSpec({
    version: 1,
    root: {
      type: "scene", layout: "absolute", width: 400, height: 400,
      frames: [{ id: "page", origin: { x: 100, y: 300 }, xUnit: 10 }],
      children: [],
      marks: [{ id: "m", from: { frame: "page", x: 0, y: 0 },
                segments: [{ line: { frame: "page", x: 5, y: 0 } }], fill: "#eee" }],
    },
  }).root as Scene;
  const m = s.marks![0]!;
  assert.deepEqual(m.from, { x: 100, y: 300 });
  assert.deepEqual((m.segments[0] as { line: { x: number; y: number } }).line, { x: 150, y: 300 });
});
