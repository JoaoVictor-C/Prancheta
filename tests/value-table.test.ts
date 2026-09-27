/**
 * value-table: a table of function values at specified x points.
 *
 * Every cell is computed from the function's expression, so these tests pin the
 * arithmetic: values computed correctly, non-finite values marked as "∄",
 * pt-BR decimal formatting, orientation, and validation of bad input.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { expandValueTable, validateValueTableInput } from "../src/presets/value-table/preset.ts";
import type { ValueTableInput } from "../src/presets/value-table/preset.ts";
import { parseFigureInput } from "../src/presets/index.ts";
import { render } from "../src/pipeline.ts";
import type { Block, Scene } from "../src/ir/types.ts";

const dir = fileURLToPath(new URL("../fixtures/value-table/", import.meta.url));
const fixtures = readdirSync(dir).filter((n) => n.endsWith(".json"));

/** The "values" mode shape these helpers exercise: `xs` and `functions` always present. */
type ValuesInput = ValueTableInput & { xs: number[]; functions: { name: string; expr: string }[] };

const texts = (input: ValuesInput): Map<string, string> =>
  new Map(((expandValueTable(input).root as Scene).children as Block[]).map((b) => [String(b.id), b.label ?? ""]));

const cells = (input: ValuesInput): string[][] => {
  const t = texts(input);
  const xs = input.xs.length;
  const funcs = input.functions.length;
  const result: string[][] = [];
  for (let row = 0; row < funcs; row += 1) {
    const values: string[] = [];
    for (let col = 0; col < xs; col += 1) {
      values.push(t.get(`cell-${row}-${col}`) ?? "");
    }
    result.push(values);
  }
  return result;
};

const getRowLabels = (input: ValuesInput): string[] => {
  const spec = expandValueTable(input);
  const blocks = (spec.root as Scene).children as Block[];
  const variable = input.variable ?? "x";
  const result: string[] = [];
  // The block structure is:
  // - variable label (index 0)
  // - x value labels (indices 1 to xs.length)
  // - For each function:
  //   - function label
  //   - cell values (xs.length blocks)
  // So the first function label is at index 1 + xs.length
  // The nth function label is at index 1 + xs.length + n * (1 + xs.length)
  const headerCount = 1 + input.xs.length;
  for (let fi = 0; fi < input.functions.length; fi += 1) {
    const blockIndex = headerCount + fi * (1 + input.xs.length);
    const block = blocks[blockIndex];
    if (block && block.label) {
      result.push(block.label);
    }
  }
  return result;
};

const getColumnGap = (input: ValuesInput): number => {
  const spec = expandValueTable(input);
  const blocks = (spec.root as Scene).children as Block[];
  const variable = input.variable ?? "x";

  // Find the function label block (first function row label)
  // The block structure is:
  // - variable label (index 0)
  // - x value labels (indices 1 to xs.length)
  // - For first function: label at index 1 + xs.length, cells at indices 2 + xs.length to 1 + xs.length + xs.length
  const headerCount = 1 + input.xs.length;
  const firstFuncLabelIndex = headerCount;
  const firstCellIndex = headerCount + 1; // first cell of first function

  const firstFuncBlock = blocks[firstFuncLabelIndex];
  const firstCellBlock = blocks[firstCellIndex];

  if (!firstFuncBlock || !firstCellBlock) {
    return -1; // Return invalid value if blocks not found
  }

  // The gap is the distance between the right edge of the function label
  // and the left edge of the first cell value
  // Assuming all blocks are at the same vertical level (same y)
  const funcRightEdge = (firstFuncBlock.x ?? 0) + (firstFuncBlock.width ?? 0);
  const cellLeftEdge = firstCellBlock.x ?? 0;

  return cellLeftEdge - funcRightEdge;
};

// --- arithmetic ----------------------------------------------------------------

test("basic table: f(x) = x^2 - 1 at x = -1, 0, 1", () => {
  const input: ValuesInput = {
    xs: [-1, 0, 1],
    functions: [{ name: "f", expr: "x^2 - 1" }],
  };
  assert.deepEqual(cells(input), [["0", "−1", "0"]]);
});

test("multiple functions with different expressions", () => {
  const input: ValuesInput = {
    xs: [-2, -1, 0, 1, 2],
    functions: [
      { name: "f", expr: "x^2 - 1" },
      { name: "g", expr: "2x + 1" },
    ],
  };
  const result = cells(input);
  assert.deepEqual(result[0], ["3", "0", "−1", "0", "3"]);
  assert.deepEqual(result[1], ["−3", "−1", "1", "3", "5"]);
});

test("undefined values (poles) are marked with ∄", () => {
  const input: ValuesInput = {
    xs: [-1, 0, 1],
    functions: [{ name: "f", expr: "1/x" }],
  };
  const result = cells(input);
  assert.equal(result[0][0], "−1");
  assert.equal(result[0][1], "∄"); // 1/0 is undefined
  assert.equal(result[0][2], "1");
});

test("pt-BR decimal formatting: comma as decimal mark", () => {
  const input: ValuesInput = {
    xs: [0.5, 1.5],
    functions: [{ name: "f", expr: "x + 0.25" }],
    locale: "pt-BR",
  };
  const result = cells(input);
  assert.equal(result[0][0], "0,75");
  assert.equal(result[0][1], "1,75");
});

test("fractions and decimals: 1/x at selected points", () => {
  const input: ValuesInput = {
    xs: [1, 2, 3],
    functions: [{ name: "f", expr: "1/x" }],
    locale: "pt-BR",
  };
  const result = cells(input);
  assert.equal(result[0][0], "1");
  assert.equal(result[0][1], "0,5"); // 1/2 terminates as 0.5
  assert.equal(result[0][2], "1/3"); // 1/3 does not terminate, so it's a fraction
});

test("variable name can be customized", () => {
  const input: ValuesInput = {
    variable: "t",
    xs: [0, 1, 2],
    functions: [{ name: "v", expr: "2t + 3" }],
  };
  const spec = expandValueTable(input);
  // The title should not throw and should generate a valid spec
  assert.ok(spec);
  assert.ok(spec.canvas);
});

test("validation refuses empty xs", () => {
  const bad = { xs: [], functions: [{ name: "f", expr: "x" }] };
  assert.throws(() => validateValueTableInput(bad as Record<string, unknown>), /must not be empty/);
});

test("validation refuses empty functions", () => {
  const bad = { xs: [1, 2], functions: [] };
  assert.throws(() => validateValueTableInput(bad as Record<string, unknown>), /must not be empty/);
});

test("validation refuses bad expression", () => {
  const bad = {
    xs: [1, 2],
    functions: [{ name: "f", expr: "unknown_var + x" }],
  };
  assert.throws(() => validateValueTableInput(bad as Record<string, unknown>), /unexpected/);
});

test("validation refuses bad orientation", () => {
  const bad = {
    xs: [1, 2],
    functions: [{ name: "f", expr: "x" }],
    orientation: "diagonal",
  };
  assert.throws(() => validateValueTableInput(bad as Record<string, unknown>), /must be one of/);
});

// --- row labels ---------------------------------------------------------------

test("function row labels include the variable name", () => {
  const input: ValuesInput = {
    xs: [-1, 0, 1],
    functions: [{ name: "f", expr: "x^2 - 1" }],
  };
  const labels = getRowLabels(input);
  assert.equal(labels.length, 1);
  assert.equal(labels[0], "f(x)");
});

test("multiple function row labels include the variable name", () => {
  const input: ValuesInput = {
    xs: [-2, -1, 0, 1, 2],
    functions: [
      { name: "f", expr: "x^2 - 1" },
      { name: "g", expr: "2x + 1" },
    ],
  };
  const labels = getRowLabels(input);
  assert.equal(labels.length, 2);
  assert.equal(labels[0], "f(x)");
  assert.equal(labels[1], "g(x)");
});

test("function row labels use custom variable name", () => {
  const input: ValuesInput = {
    variable: "t",
    xs: [0, 1, 2],
    functions: [
      { name: "v", expr: "2t + 3" },
      { name: "w", expr: "t^2" },
    ],
  };
  const labels = getRowLabels(input);
  assert.equal(labels.length, 2);
  assert.equal(labels[0], "v(t)");
  assert.equal(labels[1], "w(t)");
});

test("gap between name column and first value column is small", () => {
  const input: ValuesInput = {
    xs: [-1, 0, 1],
    functions: [{ name: "f", expr: "x^2 - 1" }],
  };
  const gap = getColumnGap(input);
  // The gap should be small (much less than 50 pixels) to indicate a compact layout
  // This verifies that there's no wide empty space between the name column and values
  assert.ok(gap < 50 && gap >= 0, `Gap between columns should be 0-50 pixels, got ${gap}`);
});

// --- rendering ---------------------------------------------------------------

for (const name of fixtures) {
  test(`${name} renders with every check passing`, { timeout: 240000 }, async () => {
    const input = JSON.parse(readFileSync(join(dir, name), "utf8")) as ValueTableInput;
    const spec = expandValueTable(input);
    const result = await render(spec, { raster: false });
    const failing = result.manifest.checks.filter((c) => c.status === "fail");
    assert.equal(result.manifest.ok, true, failing.map((c) => `${c.id} ${c.target}: ${c.detail}`).join("\n"));
  });
}
