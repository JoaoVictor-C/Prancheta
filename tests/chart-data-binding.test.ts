/**
 * Tests for chart data binding (M8, stage 5, step 27).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { bindData, createScaleFromData } from "../src/presets/chart/data-binding.ts";

test("bindData transforms dataset with single y field", () => {
  const result = bindData({
    data: [
      { month: "Jan", revenue: 100 },
      { month: "Feb", revenue: 150 },
      { month: "Mar", revenue: 120 },
    ],
    encoding: { x: "month", y: "revenue" },
  });

  assert.strictEqual(result.categories.length, 3);
  assert.strictEqual(result.categories[0]?.label, "Jan");
  assert.strictEqual(result.categories[0]?.values[0], 100);
  assert.strictEqual(result.categories[1]?.label, "Feb");
  assert.strictEqual(result.categories[1]?.values[0], 150);
  assert.strictEqual(result.series, undefined); // Single series has no names
});

test("bindData transforms dataset with multiple y fields (multiple series)", () => {
  const result = bindData({
    data: [
      { quarter: "Q1", product_a: 50, product_b: 30 },
      { quarter: "Q2", product_a: 60, product_b: 45 },
    ],
    encoding: { x: "quarter", y: ["product_a", "product_b"] },
  });

  assert.strictEqual(result.categories.length, 2);
  assert.strictEqual(result.categories[0]?.label, "Q1");
  assert.deepStrictEqual(result.categories[0]?.values, [50, 30]);
  assert.strictEqual(result.categories[1]?.label, "Q2");
  assert.deepStrictEqual(result.categories[1]?.values, [60, 45]);
  assert.deepStrictEqual(result.series, ["product_a", "product_b"]);
});

test("bindData aggregates multiple rows for the same category", () => {
  const result = bindData({
    data: [
      { region: "North", sales: 100 },
      { region: "North", sales: 50 },
      { region: "South", sales: 75 },
    ],
    encoding: { x: "region", y: "sales" },
  });

  assert.strictEqual(result.categories.length, 2);
  assert.strictEqual(result.categories[0]?.label, "North");
  assert.strictEqual(result.categories[0]?.values[0], 150); // 100 + 50 aggregated
  assert.strictEqual(result.categories[1]?.label, "South");
  assert.strictEqual(result.categories[1]?.values[0], 75);
});

test("bindData passes through chart options", () => {
  const result = bindData({
    data: [{ x: "A", y: 10 }],
    encoding: { x: "x", y: "y" },
    title: "Test Chart",
    valueSuffix: "%",
    chartType: "line",
  });

  assert.strictEqual(result.title, "Test Chart");
  assert.strictEqual(result.valueSuffix, "%");
  assert.strictEqual(result.chartType, "line");
});

test("bindData throws on empty dataset", () => {
  assert.throws(
    () => bindData({ data: [], encoding: { x: "x", y: "y" } }),
    /dataset cannot be empty/
  );
});

test("createScaleFromData creates linear scale for numeric data", () => {
  const data = [
    { value: 0 },
    { value: 100 },
    { value: 50 },
  ];

  const scale = createScaleFromData(data, "value", [0, 500]);

  assert.strictEqual(scale.kind, "linear");
  assert.strictEqual(scale.scale(0), 0);
  assert.strictEqual(scale.scale(100), 500);
  assert.strictEqual(scale.scale(50), 250);
});

test("createScaleFromData creates band scale for string data", () => {
  const data = [
    { category: "A" },
    { category: "B" },
    { category: "C" },
  ];

  const scale = createScaleFromData(data, "category", [0, 300]);

  assert.strictEqual(scale.kind, "band");
  // Band scale centers values within bands
  assert.ok(scale.scale("A") >= 0 && scale.scale("A") <= 100);
  assert.ok(scale.scale("B") > scale.scale("A"));
  assert.ok(scale.scale("C") > scale.scale("B"));
});

test("createScaleFromData creates log scale when explicitly specified", () => {
  const data = [
    { value: 1 },
    { value: 10 },
    { value: 100 },
    { value: 1000 },
  ];

  const scale = createScaleFromData(data, "value", [0, 300], "log");

  assert.strictEqual(scale.kind, "log");
  assert.strictEqual(scale.scale(1), 0);
  assert.strictEqual(scale.scale(1000), 300);
  // Log scale: log10(10) = 1 is 1/3 of the way from log10(1)=0 to log10(1000)=3
  assert.strictEqual(scale.scale(10), 100);
});

test("createScaleFromData creates time scale for Date values", () => {
  const start = new Date("2024-01-01");
  const end = new Date("2024-12-31");
  const data = [
    { date: start },
    { date: end },
  ];

  const scale = createScaleFromData(data, "date", [0, 365]);

  assert.strictEqual(scale.kind, "time");
  assert.strictEqual(scale.scale(start), 0);
  assert.ok(Math.abs(scale.scale(end) - 365) < 1); // Allow floating-point tolerance
});
