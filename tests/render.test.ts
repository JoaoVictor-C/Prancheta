/**
 * SLOW TEST: launches a real Chromium browser via Playwright to render the
 * full pipeline end-to-end. Given a generous timeout accordingly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render } from "../src/pipeline.ts";
import { parseSpec } from "../src/ir/types.ts";

const fixturePath = new URL("../fixtures/labelled-blocks.json", import.meta.url);

test(
  "render() end-to-end over the labelled-blocks fixture",
  { timeout: 120000 },
  async () => {
    const spec = parseSpec(JSON.parse(readFileSync(fixturePath, "utf8")));
    // raster: true explicitly -- this is the one test that reads the pixels,
    // so it must keep them even under PRANCHETA_SKIP_RASTER.
    const result = await render(spec, { raster: true });

    assert.equal(result.manifest.ok, true);

    const textFitsChecks = result.manifest.checks.filter((c) => c.id === "text-fits-box");
    assert.ok(textFitsChecks.length > 0);
    for (const check of textFitsChecks) {
      assert.equal(check.status, "pass", check.detail);
    }

    assert.ok(!result.svg.includes("foreignObject"));

    assert.ok(result.png !== undefined);
    assert.ok(result.png.length >= 8);
    assert.deepEqual(
      [...result.png.subarray(0, 4)],
      [0x89, 0x50, 0x4e, 0x47],
    );

    const svgTextCount = (result.svg.match(/<text /g) ?? []).length;
    const totalLines = result.figure.elements
      .filter((el) => el.kind === "text")
      .reduce((sum, el) => sum + (el.kind === "text" ? el.lines.length : 0), 0);
    assert.equal(svgTextCount, totalLines);
  },
);
