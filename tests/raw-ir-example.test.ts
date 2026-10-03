/**
 * The worked raw-IR example SELECTION.md points to for an illustration no
 * preset draws: every shape placed by hand, every label still held to the
 * checks. If this stops rendering clean, the example teaches the wrong thing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseSpec } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";

test("the raw-IR fuel cell renders with every check passing", { timeout: 120000 }, async () => {
  const spec = parseSpec(JSON.parse(readFileSync(new URL("../fixtures/ir/raw-ir-fuel-cell.json", import.meta.url), "utf8")));
  const result = await render(spec, { raster: false });
  const failed = result.manifest.checks.filter((c) => c.status === "fail");
  assert.deepEqual(failed.map((c) => `${c.id}: ${c.detail}`), []);
});