/**
 * SLOW TEST: launches a real Chromium browser via Playwright to render the
 * full pipeline end-to-end, exercising the M1 repair loop. Given a generous
 * timeout accordingly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render } from "../src/pipeline.ts";
import { parseSpec } from "../src/ir/types.ts";
import { isMonotone } from "../src/repair.ts";

const brokenBoxesPath = new URL("../fixtures/ir/broken-boxes.json", import.meta.url);
const labelledBlocksPath = new URL("../fixtures/labelled-blocks/labelled-blocks.json", import.meta.url);

function loadFixture(url: URL) {
  return parseSpec(JSON.parse(readFileSync(url, "utf8")));
}

test(
  "with repair disabled, the broken-boxes fixture is left broken",
  { timeout: 180000 },
  async () => {
    const spec = loadFixture(brokenBoxesPath);
    const result = await render(spec, { repair: false });

    assert.equal(result.manifest.ok, false);
    assert.equal(result.manifest.repairs.length, 0);
  },
);

test(
  "with repair enabled, the broken-boxes fixture converges without touching the control block",
  { timeout: 180000 },
  async () => {
    const spec = loadFixture(brokenBoxesPath);
    const result = await render(spec);

    assert.equal(result.manifest.ok, true);
    assert.ok(result.manifest.passes <= 3, `expected <= 3 passes, got ${result.manifest.passes}`);
    assert.ok(result.manifest.repairs.length > 0);
    for (const repair of result.manifest.repairs) {
      assert.ok(isMonotone(repair), JSON.stringify(repair));
    }

    const findControlWidth = (spec: ReturnType<typeof loadFixture>): number | undefined => {
      const stack = spec.root;
      if (stack.type !== "stack") return undefined;
      const control = stack.children.find((c) => c.id === "control");
      return control && control.type === "block" ? control.width : undefined;
    };

    const inputControlWidth = findControlWidth(spec);
    const effectiveControlWidth = findControlWidth(result.effectiveSpec as ReturnType<typeof loadFixture>);
    assert.equal(effectiveControlWidth, inputControlWidth);
  },
);

test(
  "TERMINATION: a generous pass budget still converges rather than being exhausted",
  { timeout: 180000 },
  async () => {
    const spec = loadFixture(brokenBoxesPath);
    const result = await render(spec, { maxPasses: 10 });

    assert.ok(result.manifest.passes <= 10, `expected <= 10 passes, got ${result.manifest.passes}`);
    assert.equal(result.manifest.ok, true, "expected the loop to converge, not burn all ten passes");
  },
);

test(
  "a clean figure triggers no repairs at all",
  { timeout: 180000 },
  async () => {
    const spec = loadFixture(labelledBlocksPath);
    const result = await render(spec);

    assert.equal(result.manifest.repairs.length, 0);
  },
);
