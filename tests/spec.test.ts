import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseSpec, SpecError } from "../src/ir/types.ts";

const fixturePath = fileURLToPath(
  new URL("../fixtures/labelled-blocks.json", import.meta.url),
);

test("parseSpec accepts the real labelled-blocks fixture", () => {
  const raw = JSON.parse(readFileSync(fixturePath, "utf8"));
  const spec = parseSpec(raw);
  assert.equal(spec.version, 1);
  assert.equal(spec.root.type, "stack");
});

test("parseSpec throws SpecError for a missing version", () => {
  assert.throws(() => parseSpec({ root: { type: "block" } }), SpecError);
});

test("parseSpec throws SpecError for a wrong version number", () => {
  assert.throws(() => parseSpec({ version: 2, root: { type: "block" } }), SpecError);
});

test("parseSpec throws SpecError for a missing root", () => {
  assert.throws(() => parseSpec({ version: 1 }), SpecError);
});

test("parseSpec throws SpecError for a node with an unknown type", () => {
  assert.throws(
    () => parseSpec({ version: 1, root: { type: "circle" } }),
    SpecError,
  );
});

test("parseSpec throws SpecError for a stack whose children is not an array", () => {
  assert.throws(
    () =>
      parseSpec({
        version: 1,
        root: { type: "stack", direction: "row", children: "nope" },
      }),
    SpecError,
  );
});

test("parseSpec throws SpecError for a block whose label is not a string", () => {
  assert.throws(
    () => parseSpec({ version: 1, root: { type: "block", label: 42 } }),
    SpecError,
  );
});
