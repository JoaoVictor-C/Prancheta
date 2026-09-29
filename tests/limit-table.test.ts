/**
 * value-table's limit mode (ADR 0039): the "tabela de valores para estimar
 * um limite". Pins the printed x schedule (exactly 0,9; 0,99; 0,999; 0,9999
 * and its mirror), the computed conclusion, and validation of malformed
 * input. Rendering (every fixture, every check passing) is at the bottom.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { expandValueTable, validateValueTableInput } from "../src/presets/value-table/preset.ts";
import type { ValueTableInput } from "../src/presets/value-table/preset.ts";
import { render } from "../src/pipeline.ts";
import type { Block, Scene } from "../src/ir/types.ts";

const dir = fileURLToPath(new URL("../fixtures/value-table/", import.meta.url));
const fixtures = readdirSync(dir).filter((n) => n.startsWith("limit-") && n.endsWith(".json"));

const labels = (input: ValueTableInput): string[] =>
  ((expandValueTable(input).root as Scene).children as Block[]).map((b) => b.label ?? "");

const cellLabels = (input: ValueTableInput): string[] => {
  const scene = expandValueTable(input).root as Scene;
  const blocks = scene.children as Block[];
  return blocks.filter((b) => String(b.id).startsWith("cell-0-")).map((b) => b.label ?? "");
};

// --- x schedule --------------------------------------------------------------

test("limit table: x schedule is exactly 0,9; 0,99; 0,999; 0,9999 on the left and 1,1; 1,01; 1,001; 1,0001 on the right", () => {
  const input: ValueTableInput = { limit: { expr: "(x^2 - 1) / (x - 1)", at: 1, side: "both", count: 4 } };
  const text = labels(input);
  for (const x of ["0,9", "0,99", "0,999", "0,9999", "1,1", "1,01", "1,001", "1,0001"]) {
    assert.ok(text.includes(x), `missing x = ${x} in ${JSON.stringify(text)}`);
  }
});

test("limit table: x schedule toward infinity is 10; 100; 1000; 10 000 (grouped from five digits)", () => {
  const input: ValueTableInput = { limit: { expr: "(1 + 1/x)^x", at: "inf", count: 4 } };
  const text = labels(input);
  for (const x of ["10", "100", "1000", "10\u202f000"]) {
    assert.ok(text.includes(x), `missing x = ${x} in ${JSON.stringify(text)}`);
  }
});

// --- conclusions ---------------------------------------------------------------

test("limit table: (x^2-1)/(x-1) at x=1 concludes 2", () => {
  const input: ValueTableInput = { limit: { expr: "(x^2 - 1) / (x - 1)", at: 1, side: "both", count: 4 } };
  const text = labels(input);
  assert.ok(text.some((t) => /lim f\(x\) = 2$/.test(t)), JSON.stringify(text));
  // The column for x = a itself is undefined (0/0): printed as ∄.
  const cells = cellLabels(input);
  assert.ok(cells.includes("∄"), JSON.stringify(cells));
});

test("limit table: sin(x)/x at x=0 concludes 1", () => {
  const input: ValueTableInput = { limit: { expr: "sin(x) / x", at: 0, side: "both", count: 4 } };
  const text = labels(input);
  assert.ok(text.some((t) => /lim f\(x\) = 1$/.test(t)), JSON.stringify(text));
});

test("limit table: 1/x at x=0 has one-sided ±infinity and the limit does not exist", () => {
  const input: ValueTableInput = { limit: { expr: "1/x", at: 0, side: "both", count: 4 } };
  const text = labels(input);
  assert.ok(text.some((t) => t.includes("não existe")), JSON.stringify(text));
  assert.ok(text.some((t) => t.includes("+∞")), JSON.stringify(text));
  assert.ok(text.some((t) => t.includes(`−∞`)), JSON.stringify(text)); // −∞
});

test("limit table: (1+1/x)^x at +infinity is e, printed exact", () => {
  const input: ValueTableInput = { limit: { expr: "(1 + 1/x)^x", at: "inf", count: 4 } };
  const text = labels(input);
  assert.ok(text.includes("x → +∞: lim f(x) = e"), JSON.stringify(text));
});

test("limit table: a sample is printed to as many places as its x step, so the approach is visible", () => {
  // The default shortest form printed f(0,9999) = 1,9999 as "2".
  const text = labels({ limit: { expr: "(x^2 - 1)/(x - 1)", at: 1, side: "both", count: 4 } });
  for (const v of ["1,9", "1,99", "1,999", "1,9999", "2,1", "2,01", "2,001", "2,0001"]) {
    assert.ok(text.includes(v), `${v} missing: ${JSON.stringify(text)}`);
  }
  assert.ok(text.includes("x → 1: lim f(x) = 2"), JSON.stringify(text));
});

test("limit table: |x|/x at x=0 is one-sided -1 and 1, and the limit does not exist", () => {
  const input: ValueTableInput = { limit: { expr: "abs(x) / x", at: 0, side: "both", count: 4 } };
  const text = labels(input);
  assert.ok(text.some((t) => t.includes("não existe")), JSON.stringify(text));
  assert.ok(text.includes("x → 0⁺: lim f(x) = 1"), JSON.stringify(text));
  assert.ok(text.includes("x → 0⁻: lim f(x) = −1"), JSON.stringify(text)); // each side on its own line
});

test("limit table: sin(1/x) at x=0 is refused honestly -- never a false 'finite' verdict", () => {
  const input: ValueTableInput = { limit: { expr: "sin(1/x)", at: 0, side: "both", count: 4 } };
  const text = labels(input);
  // Either the whole table says "não existe", or a one-sided line does --
  // what must never happen is a "lim f(x) = <number>" without "≈" hedging
  // for a function this module documents as unsafe to certify convergent.
  assert.ok(text.some((t) => t.includes("não existe")), JSON.stringify(text));
});

// --- validation ---------------------------------------------------------------

test("limit table: refuses combining `limit` with `xs`/`functions`", () => {
  const bad = { xs: [1, 2], functions: [{ name: "f", expr: "x" }], limit: { expr: "x", at: 0 } };
  assert.throws(() => validateValueTableInput(bad as Record<string, unknown>), /cannot be combined/);
});

test("limit table: refuses a missing `at`", () => {
  const bad = { limit: { expr: "x" } };
  assert.throws(() => validateValueTableInput(bad as Record<string, unknown>), /at is required/);
});

test("limit table: refuses an `at` that is not a finite number, \"inf\", or \"-inf\"", () => {
  const bad = { limit: { expr: "x", at: "not-a-number" } };
  assert.throws(() => validateValueTableInput(bad as Record<string, unknown>), /must be a finite number/);
});

test("limit table: refuses a non-finite `at`", () => {
  const bad = { limit: { expr: "x", at: Number.POSITIVE_INFINITY } };
  assert.throws(() => validateValueTableInput(bad as Record<string, unknown>), /must be a finite number/);
});

test("limit table: refuses a bad `side`", () => {
  const bad = { limit: { expr: "x", at: 0, side: "up" } };
  assert.throws(() => validateValueTableInput(bad as Record<string, unknown>), /must be one of/);
});

test("limit table: refuses a `count` outside 1..8", () => {
  const bad = { limit: { expr: "x", at: 0, count: 0 } };
  assert.throws(() => validateValueTableInput(bad as Record<string, unknown>), /count must be an integer/);
});

test("limit table: refuses a bad expression", () => {
  const bad = { limit: { expr: "unknown_var + x", at: 0 } };
  assert.throws(() => validateValueTableInput(bad as Record<string, unknown>));
});

test("limit table: refuses neither `limit` nor `xs`/`functions`", () => {
  const bad = { title: "empty" };
  assert.throws(() => validateValueTableInput(bad as Record<string, unknown>));
});

test("limit table: a valid limit input validates without throwing", () => {
  assert.doesNotThrow(() => validateValueTableInput({ limit: { expr: "x^2", at: 2 } } as unknown as Record<string, unknown>));
});

// --- rendering ---------------------------------------------------------------

for (const name of fixtures) {
  test(`${name} renders with every check passing`, { timeout: 240000 }, async () => {
    const input = JSON.parse(readFileSync(join(dir, name), "utf8")) as ValueTableInput & { preset: string };
    const spec = expandValueTable(input);
    const result = await render(spec, { raster: false });
    const failing = result.manifest.checks.filter((c) => c.status === "fail");
    assert.equal(result.manifest.ok, true, failing.map((c) => `${c.id} ${c.target}: ${c.detail}`).join("\n"));
  });
}
