/**
 * SLOW TEST: launches a real Chromium browser via Playwright to render the
 * full pipeline end-to-end for every preset fixture. Given a generous timeout
 * accordingly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render } from "../src/pipeline.ts";
import { expand } from "../src/presets/index.ts";
import type { PresetInput } from "../src/presets/index.ts";

const fixtures = ["graph-pipeline.json", "mindmap-incident.json", "annotated-cell.json"];

for (const name of fixtures) {
  test(
    `render() end-to-end over the ${name} preset fixture`,
    { timeout: 240000 },
    async () => {
      const fixtureUrl = new URL(`../fixtures/${name}`, import.meta.url);
      const raw = JSON.parse(readFileSync(fixtureUrl, "utf8")) as PresetInput;
      const spec = expand(raw);
      const result = await render(spec);

      assert.equal(result.manifest.ok, true, JSON.stringify(result.manifest.checks.filter((c) => c.status === "fail")));

      assert.ok(!result.svg.includes("foreignObject"));
      assert.ok(!result.svg.includes("<marker"));

      const connectorElements = result.manifest.elements.filter((el) => el.kind === "connector");
      assert.ok(connectorElements.length > 0, "expected at least one connector element in the manifest");

      const boxIds = new Set(
        result.manifest.elements.filter((el) => el.kind === "box").map((el) => el.id),
      );
      for (const connector of connectorElements) {
        assert.ok(connector.joins && connector.joins.length > 0, `${connector.id} should carry joins`);
        if (connector.joins!.length === 1) {
          // A callout aimed at a bare point: the single id is the box it
          // leaves from.
          assert.ok(boxIds.has(connector.joins![0]!), `${connector.joins![0]} should be a known box`);
        } else {
          for (const id of connector.joins!) {
            assert.ok(boxIds.has(id), `${id} named by connector ${connector.id} should be a known box`);
          }
        }
      }
    },
  );
}
