/**
 * SLOW TEST: the Cálculo 1 sheet's figures, rendered end to end.
 *
 * Fourteen of the fifteen are function graphs and are rendered from their
 * function-graph data; the fifteenth (5.5, the chain of three links) is a
 * box-and-arrow figure and lives as raw IR data beside them. Every one must
 * render with no failing check -- the acceptance bar the preset was built
 * against, and the one the helper script it replaced did not meet (its 2.4
 * shipped with the number 6 sitting on the curve).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { render } from "../src/pipeline.ts";
import { parseFigureInput } from "../src/presets/index.ts";

const dir = fileURLToPath(new URL("../fixtures/function-graph/", import.meta.url));
const figures = [
  ...readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => join(dir, name)),
  fileURLToPath(new URL("../fixtures/calc1-s5-5-chain.json", import.meta.url)),
];

test("the sheet has fifteen figures", () => {
  // Beside them, fixtures/function-graph/ holds the curve fixtures of ADR
  // 0029 (curve-*.json), the area and Riemann fixtures of ADR 0036
  // (area-*.json, riemann-*.json) and the asymptote and hole fixtures of ADR
  // 0038 (asym-*.json), rendered below with the same bar.
  const others = /^(curve|area|riemann|asym)-/;
  assert.equal(figures.filter((path) => !others.test(path.split(/[\\/]/).pop()!)).length, 15);
});

for (const path of figures) {
  const name = path.split(/[\\/]/).pop()!;
  test(`${name} renders with every check passing`, { timeout: 240000 }, async () => {
    const spec = parseFigureInput(JSON.parse(readFileSync(path, "utf8")));
    const result = await render(spec, { raster: false });
    const failing = result.manifest.checks.filter((c) => c.status === "fail");
    assert.equal(result.manifest.ok, true, failing.map((c) => `${c.id} ${c.target}: ${c.detail}`).join("\n"));
  });
}
