/**
 * SLOW TEST: launches a real Chromium browser via Playwright to render the
 * chart preset end-to-end. Kept separate from presets-render.test.ts, whose
 * shared assertions require at least one connector element in the manifest
 * -- true of every scene-based preset fixture there, but only sometimes true
 * of a chart: bar/stacked/scatter fixtures are built entirely from
 * Stack/Block (or bare points) and declare none, while a line-chart fixture
 * is a Scene whose points are joined by real Connectors.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render } from "../src/pipeline.ts";
import { expand } from "../src/presets/index.ts";
import type { PresetInput } from "../src/presets/index.ts";

const fixtures = [
  "chart-quarterly-revenue.json",
  "chart-horizontal-single.json",
  "chart-stacked-budget.json",
  "chart-stacked100-horizontal.json",
  "chart-line-latency.json",
  "chart-scatter-single.json",
];

for (const name of fixtures) {
  test(`render() end-to-end over the ${name} chart fixture`, { timeout: 240000 }, async () => {
    const fixtureUrl = new URL(`../fixtures/${name}`, import.meta.url);
    const raw = JSON.parse(readFileSync(fixtureUrl, "utf8")) as PresetInput;
    const spec = expand(raw);
    const result = await render(spec);

    assert.equal(
      result.manifest.ok,
      true,
      JSON.stringify(result.manifest.checks.filter((c) => c.status === "fail")),
    );
    assert.ok(!result.svg.includes("foreignObject"));
    assert.ok(!result.svg.includes("<marker"));

    // Only a line chart declares connectors; every other chart shape here is
    // boxes/points only.
    const connectorElements = result.manifest.elements.filter((el) => el.kind === "connector");
    const expectsConnectors = name.startsWith("chart-line-");
    assert.equal(
      connectorElements.length > 0,
      expectsConnectors,
      expectsConnectors ? "a line chart should declare connectors" : "this chart should declare no connectors",
    );

    const boxElements = result.manifest.elements.filter((el) => el.kind === "box");
    assert.ok(boxElements.length > 0, "expected at least one bar/swatch/point box in the manifest");
  });
}

test(
  "grouped bar chart: every bar's box height is proportional to its declared value",
  { timeout: 240000 },
  async () => {
    const fixtureUrl = new URL("../fixtures/chart-quarterly-revenue.json", import.meta.url);
    const raw = JSON.parse(readFileSync(fixtureUrl, "utf8")) as PresetInput;
    const spec = expand(raw);
    const result = await render(spec);

    const bars = result.manifest.elements.filter(
      (el) => el.kind === "box" && el.id.startsWith("bar-"),
    );
    assert.equal(bars.length, 8, "4 categories x 2 series");

    // Q4's "this year" bar (67) should be the tallest of all eight, and
    // noticeably taller than Q1's "this year" bar (42) -- a real proportion
    // check, not just "some boxes exist".
    const byId = new Map(bars.map((b) => [b.id, b]));
    const q1 = byId.get("bar-0-0")!;
    const q4 = byId.get("bar-3-0")!;
    assert.ok(q4.box.height > q1.box.height, "Q4's bar (67) should be taller than Q1's (42)");
    const ratio = q4.box.height / q1.box.height;
    assert.ok(Math.abs(ratio - 67 / 42) < 0.05, `expected height ratio near ${67 / 42}, got ${ratio}`);
  },
);

test(
  "stacked bar chart: a category's segments sum in height to that category's total, and series[0] sits at the bottom",
  { timeout: 240000 },
  async () => {
    const fixtureUrl = new URL("../fixtures/chart-stacked-budget.json", import.meta.url);
    const raw = JSON.parse(readFileSync(fixtureUrl, "utf8")) as PresetInput;
    const spec = expand(raw);
    const result = await render(spec);

    const bars = result.manifest.elements.filter(
      (el) => el.kind === "box" && el.id.startsWith("bar-"),
    );
    assert.equal(bars.length, 12, "4 categories x 3 series");
    const byId = new Map(bars.map((b) => [b.id, b]));

    // Q1: Engineering 18, Marketing 12, Ops 9 -- total 39.
    const eng = byId.get("bar-0-0")!;
    const mkt = byId.get("bar-0-1")!;
    const ops = byId.get("bar-0-2")!;
    const summed = eng.box.height + mkt.box.height + ops.box.height;

    // Q4: Engineering 25, Marketing 15, Ops 10 -- total 50, the largest
    // category total in the fixture, so its stack should be the tallest.
    const eng4 = byId.get("bar-3-0")!;
    const mkt4 = byId.get("bar-3-1")!;
    const ops4 = byId.get("bar-3-2")!;
    const summed4 = eng4.box.height + mkt4.box.height + ops4.box.height;

    assert.ok(summed4 > summed, "Q4's stack (total 50) should be taller than Q1's (total 39)");
    const ratio = summed4 / summed;
    assert.ok(Math.abs(ratio - 50 / 39) < 0.05, `expected summed-height ratio near ${50 / 39}, got ${ratio}`);

    // series[0] (Engineering) is drawn last in the column so it lands at
    // the bottom -- its box's own bottom edge should be the whole stack's
    // bottom edge (the largest y + height among the three segments).
    const stackBottom = Math.max(eng.box.y + eng.box.height, mkt.box.y + mkt.box.height, ops.box.y + ops.box.height);
    assert.ok(
      Math.abs(eng.box.y + eng.box.height - stackBottom) < 1,
      "Engineering (series[0]) should sit at the bottom of the stack",
    );
  },
);

test(
  "line chart: point y-position is a linear scale against the largest value, and connectors join adjacent points",
  { timeout: 240000 },
  async () => {
    const fixtureUrl = new URL("../fixtures/chart-line-latency.json", import.meta.url);
    const raw = JSON.parse(readFileSync(fixtureUrl, "utf8")) as PresetInput;
    const spec = expand(raw);
    const result = await render(spec);

    const points = result.manifest.elements.filter(
      (el) => el.kind === "box" && el.id.startsWith("point-"),
    );
    assert.equal(points.length, 12, "6 categories x 2 series");

    // d3's p99 (210ms) is the largest value in the fixture, so its point
    // should sit at the smallest y (highest on the canvas) of the p99 series.
    const byId = new Map(points.map((p) => [p.id, p]));
    const d3p99 = byId.get("point-2-1")!;
    const d1p99 = byId.get("point-0-1")!;
    const d5p99 = byId.get("point-4-1")!;
    assert.ok(d3p99.box.y < d1p99.box.y, "the largest value (d3 p99) should sit higher than d1 p99");
    assert.ok(d3p99.box.y < d5p99.box.y, "the largest value (d3 p99) should sit higher than d5 p99");

    // 6 categories -> 5 adjacent pairs per series, 2 series -> 10 connectors.
    const connectors = result.manifest.elements.filter((el) => el.kind === "connector");
    assert.equal(connectors.length, 10);
  },
);

test(
  "scatter chart: points are declared but never joined by a connector",
  { timeout: 240000 },
  async () => {
    const fixtureUrl = new URL("../fixtures/chart-scatter-single.json", import.meta.url);
    const raw = JSON.parse(readFileSync(fixtureUrl, "utf8")) as PresetInput;
    const spec = expand(raw);
    const result = await render(spec);

    const points = result.manifest.elements.filter(
      (el) => el.kind === "box" && el.id.startsWith("point-"),
    );
    assert.equal(points.length, 5, "5 endpoints, one series");
    const connectors = result.manifest.elements.filter((el) => el.kind === "connector");
    assert.equal(connectors.length, 0, "scatter mode must never connect its points");
  },
);

test(
  "stacked100 bar chart: every bar rescales to the same total length regardless of its raw values",
  { timeout: 240000 },
  async () => {
    const fixtureUrl = new URL("../fixtures/chart-stacked100-horizontal.json", import.meta.url);
    const raw = JSON.parse(readFileSync(fixtureUrl, "utf8")) as PresetInput;
    const spec = expand(raw);
    const result = await render(spec);

    const bars = result.manifest.elements.filter(
      (el) => el.kind === "box" && el.id.startsWith("bar-"),
    );
    assert.equal(bars.length, 9, "3 categories x 3 series");
    const byId = new Map(bars.map((b) => [b.id, b]));

    // NA (40/35/25) and EU (30/45/25) have different raw values but both
    // sum to 100 -- their full-stack widths should end up equal.
    const naWidth = byId.get("bar-0-0")!.box.width + byId.get("bar-0-1")!.box.width + byId.get("bar-0-2")!.box.width;
    const euWidth = byId.get("bar-1-0")!.box.width + byId.get("bar-1-1")!.box.width + byId.get("bar-1-2")!.box.width;
    assert.ok(Math.abs(naWidth - euWidth) < 2, `stacked100 bars should share one total width: NA=${naWidth}, EU=${euWidth}`);
  },
);
