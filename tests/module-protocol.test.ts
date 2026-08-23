import { test } from "node:test";
import assert from "node:assert/strict";
import { parseModuleOutput, geometryTolerance } from "../src/modules/protocol.ts";

function validOutput() {
  return {
    svg: "<svg></svg>",
    elements: [{ id: "a", kind: "feature" }],
  };
}

test("parseModuleOutput accepts a minimal valid output", () => {
  const parsed = parseModuleOutput(validOutput());
  assert.equal(parsed.svg, "<svg></svg>");
  assert.equal(parsed.elements.length, 1);
  assert.equal(parsed.elements[0].id, "a");
});

test("parseModuleOutput rejects a non-object", () => {
  assert.throws(() => parseModuleOutput("not an object"), /must be an object/);
  assert.throws(() => parseModuleOutput(null), /must be an object/);
  assert.throws(() => parseModuleOutput(42), /must be an object/);
});

test("parseModuleOutput rejects a missing svg", () => {
  const output = validOutput() as Record<string, unknown>;
  delete output.svg;
  assert.throws(() => parseModuleOutput(output), /svg must be a non-empty string/);
});

test("parseModuleOutput rejects an empty svg", () => {
  const output = validOutput();
  output.svg = "   ";
  assert.throws(() => parseModuleOutput(output), /svg must be a non-empty string/);
});

test("parseModuleOutput rejects a non-array elements", () => {
  const output = validOutput() as Record<string, unknown>;
  output.elements = "nope";
  assert.throws(() => parseModuleOutput(output), /elements must be an array/);
});

test("parseModuleOutput rejects an element with a missing id", () => {
  const output = validOutput();
  output.elements = [{ kind: "feature" } as never];
  assert.throws(() => parseModuleOutput(output), /elements\[0\]\.id must be a non-empty string/);
});

test("parseModuleOutput rejects an element with an empty id", () => {
  const output = validOutput();
  output.elements = [{ id: "", kind: "feature" }];
  assert.throws(() => parseModuleOutput(output), /elements\[0\]\.id must be a non-empty string/);
});

test("parseModuleOutput rejects an element with an unknown kind", () => {
  const output = validOutput();
  output.elements = [{ id: "a", kind: "bogus" }];
  assert.throws(() => parseModuleOutput(output), /elements\[0\]\.kind must be one of/);
});

test("geometryTolerance returns at least 1 for a tiny box", () => {
  assert.equal(geometryTolerance({ width: 2, height: 3 }), 1);
  assert.equal(geometryTolerance({ width: 0, height: 0 }), 1);
});

test("geometryTolerance returns 2% of the larger dimension for a big box", () => {
  assert.equal(geometryTolerance({ width: 500, height: 100 }), 10);
  assert.equal(geometryTolerance({ width: 100, height: 500 }), 10);
});
