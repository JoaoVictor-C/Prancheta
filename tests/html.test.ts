import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildHtml } from "../src/layout/html.ts";
import { parseSpec } from "../src/ir/types.ts";

const fixturePath = new URL("../fixtures/labelled-blocks.json", import.meta.url);
const fixtureSpec = parseSpec(JSON.parse(readFileSync(fixturePath, "utf8")));

test("buildHtml output contains no <script", () => {
  const { html } = buildHtml(fixtureSpec);
  assert.ok(!html.includes("<script"));
});

test("every block in the fixture produces a data-pr-box attribute", () => {
  const { html, boxIds } = buildHtml(fixtureSpec);
  // fixture has 6 blocks
  assert.equal(boxIds.length, 6);
  for (const id of boxIds) {
    assert.ok(html.includes(`data-pr-box="${id}"`), `missing data-pr-box for ${id}`);
  }
});

test("a label containing <script> is escaped so the raw tag does not appear", () => {
  const spec = parseSpec({
    version: 1,
    root: { type: "block", id: "evil", label: "<script>alert(1)</script>" },
  });
  const { html } = buildHtml(spec);
  assert.ok(!html.includes("<script>alert"));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
});
