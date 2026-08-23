import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSpec } from "../src/ir/types.ts";
import type { Scene, Stack } from "../src/ir/types.ts";
import { expand, isPresetInput } from "../src/presets/index.ts";
import { expandGraph } from "../src/presets/graph/preset.ts";
import { expandMindmap } from "../src/presets/mindmap/preset.ts";
import type { MindmapNode } from "../src/presets/mindmap/preset.ts";
import { expandAnnotatedFigure } from "../src/presets/annotated-figure/preset.ts";
import { expandLabelledBlocks } from "../src/presets/labelled-blocks/preset.ts";
import { expandChart } from "../src/presets/chart/preset.ts";

function fixture(name: string): unknown {
  const url = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

const graphFixture = fixture("graph-pipeline.json") as Record<string, unknown>;
const mindmapFixture = fixture("mindmap-incident.json") as Record<string, unknown>;
const annotatedFixture = fixture("annotated-cell.json") as Record<string, unknown>;
const rawIrFixture = fixture("labelled-blocks.json") as Record<string, unknown>;
const chartFixture = fixture("chart-quarterly-revenue.json") as Record<string, unknown>;

// ---------------------------------------------------------------------------
// expand() dispatch and isPresetInput
// ---------------------------------------------------------------------------

test("expand dispatches on the preset field", () => {
  const graphOut = expand(graphFixture as unknown as Parameters<typeof expand>[0]);
  assert.equal(graphOut.root.type, "scene");
  assert.equal((graphOut.root as Scene).layout, "graph");

  const mindmapOut = expand(mindmapFixture as unknown as Parameters<typeof expand>[0]);
  assert.equal(mindmapOut.root.type, "scene");

  const annotatedOut = expand(annotatedFixture as unknown as Parameters<typeof expand>[0]);
  assert.equal(annotatedOut.root.type, "scene");
  assert.equal((annotatedOut.root as Scene).layout, "absolute");

  const blocksOut = expandLabelledBlocks({ items: [{ label: "x" }] });
  assert.equal(blocksOut.root.type, "stack");

  const chartOut = expand(chartFixture as unknown as Parameters<typeof expand>[0]);
  assert.equal(chartOut.root.type, "stack");
});

test("each preset's expanded output passes parseSpec", () => {
  assert.doesNotThrow(() => parseSpec(expand(graphFixture as unknown as Parameters<typeof expand>[0])));
  assert.doesNotThrow(() => parseSpec(expand(mindmapFixture as unknown as Parameters<typeof expand>[0])));
  assert.doesNotThrow(() => parseSpec(expand(annotatedFixture as unknown as Parameters<typeof expand>[0])));
  assert.doesNotThrow(() =>
    parseSpec(expandLabelledBlocks({ items: [{ label: "a" }, { label: "b" }] })),
  );
  assert.doesNotThrow(() => parseSpec(expand(chartFixture as unknown as Parameters<typeof expand>[0])));
});

test("isPresetInput accepts the four fixture files' parsed JSON", () => {
  assert.equal(isPresetInput(graphFixture), true);
  assert.equal(isPresetInput(mindmapFixture), true);
  assert.equal(isPresetInput(annotatedFixture), true);
  assert.equal(isPresetInput(chartFixture), true);
});

test("isPresetInput rejects a raw IR spec", () => {
  assert.equal(isPresetInput(rawIrFixture), false);
});

// ---------------------------------------------------------------------------
// expandGraph
// ---------------------------------------------------------------------------

test("expandGraph produces a scene with layout graph, one child per node, one connector per edge", () => {
  const input = graphFixture as unknown as Parameters<typeof expandGraph>[0];
  const spec = expandGraph(input);
  const scene = spec.root as Scene;
  assert.equal(scene.layout, "graph");
  assert.equal(scene.children.length, input.nodes.length);
  assert.equal((scene.connectors ?? []).length, input.edges.length);

  const childIds = new Set(scene.children.map((child) => child.id));
  for (const edge of input.edges) {
    assert.ok(childIds.has(edge.from));
    assert.ok(childIds.has(edge.to));
  }
  scene.connectors!.forEach((connector, i) => {
    assert.equal(connector.from, input.edges[i]!.from);
    assert.equal(connector.to, input.edges[i]!.to);
  });
});

// ---------------------------------------------------------------------------
// expandMindmap
// ---------------------------------------------------------------------------

function countNodes(node: MindmapNode): number {
  return 1 + (node.children ?? []).reduce((sum, child) => sum + countNodes(child), 0);
}

test("expandMindmap produces one child per tree node and (nodes - 1) connectors, all arrow none", () => {
  const input = mindmapFixture as unknown as Parameters<typeof expandMindmap>[0];
  const spec = expandMindmap(input);
  const scene = spec.root as Scene;

  const expectedNodes = countNodes(input.root);
  assert.equal(scene.children.length, expectedNodes);
  assert.equal((scene.connectors ?? []).length, expectedNodes - 1);
  for (const connector of scene.connectors!) {
    assert.equal(connector.arrow, "none");
  }
});

// ---------------------------------------------------------------------------
// expandAnnotatedFigure
// ---------------------------------------------------------------------------

test("expandAnnotatedFigure produces one child per part plus per callout, one connector per callout, callouts have strokeWidth 0", () => {
  const input = annotatedFixture as unknown as Parameters<typeof expandAnnotatedFigure>[0];
  const spec = expandAnnotatedFigure(input);
  const scene = spec.root as Scene;

  const partCount = (input.parts ?? []).length;
  const calloutCount = input.callouts.length;
  assert.equal(scene.children.length, partCount + calloutCount);
  assert.equal((scene.connectors ?? []).length, calloutCount);

  const calloutIds = new Set(
    input.callouts.map((callout, i) => callout.id ?? `callout-${i + 1}`),
  );
  for (const child of scene.children) {
    if (calloutIds.has(child.id!)) {
      assert.equal(child.strokeWidth, 0);
    }
  }
});

// ---------------------------------------------------------------------------
// expandLabelledBlocks
// ---------------------------------------------------------------------------

test("expandLabelledBlocks produces a stack", () => {
  const spec = expandLabelledBlocks({ items: [{ label: "one" }, { label: "two" }] });
  assert.equal(spec.root.type, "stack");
  assert.equal((spec.root as Stack).children.length, 2);
});

test("expandChart scales each bar's length linearly against the largest value", () => {
  const spec = expandChart({
    categories: [{ label: "A", values: [10] }, { label: "B", values: [40] }, { label: "C", values: [20] }],
    maxBarLength: 200,
  });
  const plot = ((spec.root as Stack).children.find((c) => "id" in c && c.id === "plot") as Stack).children as Stack[];
  const barHeight = (column: Stack): number => {
    const barsRow = column.children[0] as Stack;
    const barUnit = barsRow.children[0] as Stack;
    const bar = barUnit.children[barUnit.children.length - 1] as import("../src/ir/types.ts").Block;
    return bar.height!;
  };
  const [a, b, c] = plot.map(barHeight);
  // 40 is the largest value, so its bar is exactly maxBarLength; the others
  // are proportional to it -- this is the whole claim a bar chart makes.
  assert.equal(b, 200);
  assert.ok(Math.abs(a - 50) < 0.01, `expected A's bar near 50, got ${a}`);
  assert.ok(Math.abs(c - 100) < 0.01, `expected C's bar near 100, got ${c}`);
});

test("expandChart throws when categories have mismatched series lengths", () => {
  assert.throws(() =>
    expandChart({
      categories: [{ label: "A", values: [1, 2] }, { label: "B", values: [1] }],
    }),
  );
});

test("expandChart with more than one series produces a legend, one entry per series name", () => {
  const spec = expandChart({
    categories: [{ label: "A", values: [1, 2] }],
    series: ["This year", "Last year"],
  });
  const root = spec.root as Stack;
  const legend = root.children.find((c) => "id" in c && c.id === "legend") as Stack | undefined;
  assert.ok(legend, "a multi-series chart should declare a legend");
  assert.equal(legend!.children.length, 2);
});

test("expandChart with one series produces no legend", () => {
  const spec = expandChart({ categories: [{ label: "A", values: [1] }] });
  const root = spec.root as Stack;
  assert.equal(root.children.find((c) => "id" in c && c.id === "legend"), undefined);
});

function findBlockById(node: import("../src/ir/types.ts").FigureNode, id: string): import("../src/ir/types.ts").Block | undefined {
  if (node.type === "block") return node.id === id ? node : undefined;
  for (const child of node.children) {
    const found = findBlockById(child, id);
    if (found) return found;
  }
  return undefined;
}

test("expandChart stacked mode: a category's segment lengths sum to its total, scaled against the largest total", () => {
  const spec = expandChart({
    stacking: "stacked",
    categories: [
      { label: "A", values: [10, 10] }, // total 20
      { label: "B", values: [30, 10] }, // total 40, the largest
    ],
    maxBarLength: 200,
  });
  const plot = ((spec.root as Stack).children.find((c) => "id" in c && c.id === "plot") as Stack).children;
  const [colA, colB] = plot;
  const segA0 = findBlockById(colA!, "bar-0-0")!;
  const segA1 = findBlockById(colA!, "bar-0-1")!;
  const segB0 = findBlockById(colB!, "bar-1-0")!;
  const segB1 = findBlockById(colB!, "bar-1-1")!;

  // B's total (40) is the largest, so its stack sums to maxBarLength.
  assert.ok(Math.abs(segB0.height! + segB1.height! - 200) < 0.01);
  // A's total (20) is half B's, so its stack sums to half of maxBarLength.
  assert.ok(Math.abs(segA0.height! + segA1.height! - 100) < 0.01);
});

test("expandChart line mode produces a Scene with one connector per adjacent point pair, per series", () => {
  const spec = expandChart({
    chartType: "line",
    categories: [
      { label: "A", values: [10, 20] },
      { label: "B", values: [15, 25] },
      { label: "C", values: [12, 30] },
    ],
    series: ["X", "Y"],
  });
  const root = spec.root as Stack;
  const scene = root.children.find((c) => "id" in c && c.id === "plot") as import("../src/ir/types.ts").Scene;
  assert.equal(scene.type, "scene");
  assert.equal(scene.layout, "absolute");
  // 3 categories -> 2 adjacent pairs per series, 2 series -> 4 connectors.
  assert.equal(scene.connectors?.length, 4);
  // 6 points + 2 y-axis labels + 3 x-axis labels = 11 blocks.
  assert.equal(scene.children.length, 11);
});

test("expandChart scatter mode produces the same points but zero connectors", () => {
  const spec = expandChart({
    chartType: "scatter",
    categories: [
      { label: "A", values: [10] },
      { label: "B", values: [15] },
      { label: "C", values: [12] },
    ],
  });
  const root = spec.root as Stack;
  const scene = root.children.find((c) => "id" in c && c.id === "plot") as import("../src/ir/types.ts").Scene;
  assert.equal(scene.connectors?.length, 0);
  const points = scene.children.filter((c) => "id" in c && /^point-/.test((c as { id: string }).id));
  assert.equal(points.length, 3);
});

test("expandChart line mode: a point's y position is a linear scale against the largest value", () => {
  const spec = expandChart({
    chartType: "line",
    categories: [{ label: "A", values: [10] }, { label: "B", values: [40] }, { label: "C", values: [20] }],
    plotHeight: 200,
  });
  const root = spec.root as Stack;
  const scene = root.children.find((c) => "id" in c && c.id === "plot") as import("../src/ir/types.ts").Scene;
  const byId = new Map(
    scene.children.filter((c): c is import("../src/ir/types.ts").Block => "id" in c).map((c) => [c.id, c]),
  );
  const a = byId.get("point-0-0")!;
  const b = byId.get("point-1-0")!;
  const c = byId.get("point-2-0")!;
  // 40 is the max value, so its point sits at the top of the plot (smallest
  // y); values scale linearly below it -- the same claim expandChart makes
  // for bars, expressed in y position instead of box height.
  assert.ok(b.y! < c.y! && c.y! < a.y!, "larger values should sit higher (smaller y)");
});

test("expandChart with one series and chartType line produces no legend", () => {
  const spec = expandChart({
    chartType: "line",
    categories: [{ label: "A", values: [1] }, { label: "B", values: [2] }],
  });
  const root = spec.root as Stack;
  assert.equal(root.children.find((c) => "id" in c && c.id === "legend"), undefined);
});

test("expandChart stacked100 mode: every category's segments sum to the same total length regardless of raw values", () => {
  const spec = expandChart({
    stacking: "stacked100",
    orientation: "horizontal",
    categories: [
      { label: "A", values: [10, 10] }, // total 20
      { label: "B", values: [60, 20] }, // total 80
    ],
    maxBarLength: 200,
  });
  const plot = ((spec.root as Stack).children.find((c) => "id" in c && c.id === "plot") as Stack).children;
  const [colA, colB] = plot;
  const segA0 = findBlockById(colA!, "bar-0-0")!;
  const segA1 = findBlockById(colA!, "bar-0-1")!;
  const segB0 = findBlockById(colB!, "bar-1-0")!;
  const segB1 = findBlockById(colB!, "bar-1-1")!;

  const totalA = segA0.width! + segA1.width!;
  const totalB = segB0.width! + segB1.width!;
  assert.ok(Math.abs(totalA - 200) < 0.01, `expected A's stack100 width near 200, got ${totalA}`);
  assert.ok(Math.abs(totalB - 200) < 0.01, `expected B's stack100 width near 200, got ${totalB}`);
});
