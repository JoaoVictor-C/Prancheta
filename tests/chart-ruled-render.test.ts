/**
 * SLOW TEST: a ruled bar chart with a line overlay (ADR 0066), rendered end
 * to end. It is drawn on function-graph's plane, so it is held to that
 * plane's checks -- every y number printed at its tick, the category axis
 * declared without numbers, every category name beside its place.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render } from "../src/pipeline.ts";
import { parseFigureInput } from "../src/presets/index.ts";

test("chart-bars-overlay.json renders with every check passing", { timeout: 240000 }, async () => {
  const raw = JSON.parse(readFileSync(new URL("../fixtures/chart-bars-overlay.json", import.meta.url), "utf8"));
  const result = await render(parseFigureInput(raw), { raster: false });
  const failing = result.manifest.checks.filter((c) => c.status === "fail");
  assert.equal(result.manifest.ok, true, failing.map((c) => `${c.id} ${c.target}: ${c.detail}`).join("\n"));
  const axis = result.manifest.checks.find((c) => c.id === "axis-number-present")!;
  assert.equal(axis.status, "pass");
  assert.match(axis.detail ?? "", /declared without numbers \(plane x\)/);
});
