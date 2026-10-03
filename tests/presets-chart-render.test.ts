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
  "chart/chart-quarterly-revenue.json",
  "chart/chart-horizontal-single.json",
  "chart/chart-stacked-budget.json",
  "chart/chart-stacked100-horizontal.json",
  "chart/chart-line-latency.json",
  "chart/chart-scatter-single.json",
  "chart/chart-pie-market-share.json",
  "chart/chart-donut-budget.json",
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
    const expectsConnectors = name.startsWith("chart/chart-line-");
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
    const fixtureUrl = new URL("../fixtures/chart/chart-quarterly-revenue.json", import.meta.url);
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
    const fixtureUrl = new URL("../fixtures/chart/chart-stacked-budget.json", import.meta.url);
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
    const fixtureUrl = new URL("../fixtures/chart/chart-line-latency.json", import.meta.url);
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
    const fixtureUrl = new URL("../fixtures/chart/chart-scatter-single.json", import.meta.url);
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
    const fixtureUrl = new URL("../fixtures/chart/chart-stacked100-horizontal.json", import.meta.url);
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

/**
 * The claim a pie makes, and the check that can refuse it.
 *
 * A pie says one thing: this slice's angle is its share. The preset derives
 * both from the same fraction, so they cannot drift on their own -- which
 * means the only way to prove the check works is to break the figure by hand
 * and watch it fail. That is the same bargain `--misdeclare` strikes for a
 * figure module.
 */
test("a slice whose printed share disagrees with the angle it sweeps is caught", { timeout: 240000 }, async () => {
  const spec = expand({
    preset: "chart",
    chartType: "pie",
    categories: [
      { label: "Northwind", values: [42] },
      { label: "Contoso", values: [27] },
      { label: "Fabrikam", values: [18] },
      { label: "Others", values: [13] },
    ],
  } as unknown as PresetInput);

  // Reach into the expanded spec and print a share nobody drew.
  const scene = (spec.root as { children: { children: { id?: string; label?: string }[] }[] })
    .children[0]!;
  const share = scene.children.find((child) => child.id === "slice-0-share");
  assert.ok(share, "the largest slice should carry an inline share");
  assert.equal(share!.label, "42%");
  share!.label = "12%";

  const result = await render(spec, {});
  const sweep = result.manifest.checks.find((check) => check.id === "sweep-matches-its-label");
  assert.ok(sweep, "sweep-matches-its-label must be present for a pie");
  assert.equal(
    sweep!.status,
    "fail",
    `a 12% label on a 42% slice must fail: ${JSON.stringify(sweep)}`,
  );
  assert.match(sweep!.detail ?? "", /slice-0/);
});

test("every slice's angle is its share of the whole, measured from the drawn arcs", { timeout: 240000 }, async () => {
  const values = [42, 27, 18, 9, 4];
  const total = values.reduce((a, b) => a + b, 0);
  const spec = expand({
    preset: "chart",
    chartType: "pie",
    categories: values.map((value, i) => ({ label: `C${i}`, values: [value] })),
  } as unknown as PresetInput);
  const result = await render(spec, {});

  // Summed straight off the rendered marks, not off the input: this is the
  // figure being read back, which is the only reading that proves anything.
  const marks = result.figure.elements.filter((element) => element.kind === "mark");
  assert.equal(marks.length, values.length, "one mark per slice");
  for (const [i, value] of values.entries()) {
    const mark = marks.find((candidate) => candidate.id === `slice-${i}`);
    assert.ok(mark, `slice-${i} should be drawn`);
    const arcs = (mark as { arcCentres: { centre: { x: number; y: number }; from: { x: number; y: number }; to: { x: number; y: number } }[] }).arcCentres;
    const swept = arcs.reduce((sum, arc) => {
      const a = Math.hypot(arc.from.x - arc.centre.x, arc.from.y - arc.centre.y);
      const b = Math.hypot(arc.to.x - arc.centre.x, arc.to.y - arc.centre.y);
      const dot =
        (arc.from.x - arc.centre.x) * (arc.to.x - arc.centre.x) +
        (arc.from.y - arc.centre.y) * (arc.to.y - arc.centre.y);
      return sum + (Math.acos(Math.min(1, Math.max(-1, dot / (a * b)))) * 180) / Math.PI;
    }, 0);
    const expected = (value / total) * 360;
    assert.ok(
      Math.abs(swept - expected) < 0.5,
      `slice-${i} should sweep ${expected.toFixed(1)} degrees, drew ${swept.toFixed(1)}`,
    );
  }
});
