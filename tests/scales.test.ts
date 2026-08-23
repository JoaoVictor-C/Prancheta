/**
 * Tests for scale abstraction (M8, stage 5, step 25).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createLinearScale, createLogScale, createBandScale, createTimeScale } from "../src/scales.ts";

test("linear scale maps domain to range correctly", () => {
  const scale = createLinearScale([0, 100], [0, 500]);

  assert.strictEqual(scale.scale(0), 0);
  assert.strictEqual(scale.scale(100), 500);
  assert.strictEqual(scale.scale(50), 250);
  assert.strictEqual(scale.scale(25), 125);
});

test("linear scale invert maps range back to domain", () => {
  const scale = createLinearScale([0, 100], [0, 500]);

  assert.strictEqual(scale.invert!(0), 0);
  assert.strictEqual(scale.invert!(500), 100);
  assert.strictEqual(scale.invert!(250), 50);
});

test("linear scale generates nice tick values", () => {
  const scale = createLinearScale([0, 100], [0, 500]);
  const ticks = scale.ticks({ count: 5 });

  assert.ok(ticks.length > 0, "should generate ticks");
  assert.ok(ticks.every(t => typeof t.value === 'number' && t.value >= 0 && t.value <= 100), "all ticks should be within domain");
  assert.ok(ticks.every(t => t.position >= 0 && t.position <= 500), "all positions should be within range");

  // Ticks should be in ascending order
  for (let i = 1; i < ticks.length; i++) {
    assert.ok((ticks[i].value as number) > (ticks[i - 1].value as number), "ticks should be ascending");
  }
});

test("linear scale respects minSpacing in tick policy", () => {
  const scale = createLinearScale([0, 100], [0, 200]);
  const ticks = scale.ticks({ count: 50, minSpacing: 50 });

  // With minSpacing=50 on a 200px range, we should get at most 5 ticks
  assert.ok(ticks.length <= 5, "minSpacing should limit tick count");

  // Check spacing
  for (let i = 1; i < ticks.length; i++) {
    const spacing = Math.abs(ticks[i].position - ticks[i - 1].position);
    assert.ok(spacing >= 49, `spacing ${spacing} should be >= minSpacing`);
  }
});

test("log scale maps domain to range with logarithmic interpolation", () => {
  const scale = createLogScale([1, 1000], [0, 300]);

  assert.strictEqual(scale.scale(1), 0);
  assert.strictEqual(scale.scale(1000), 300);
  assert.strictEqual(scale.scale(10), 100); // log10(10) = 1, halfway between log10(1)=0 and log10(1000)=3
  assert.strictEqual(scale.scale(100), 200); // log10(100) = 2
});

test("log scale throws on non-positive domain", () => {
  assert.throws(() => createLogScale([0, 100], [0, 500]), /positive values/);
  assert.throws(() => createLogScale([-10, 100], [0, 500]), /positive values/);
});

test("log scale generates ticks at powers of 10", () => {
  const scale = createLogScale([1, 1000], [0, 300]);
  const ticks = scale.ticks({ count: 5 });

  assert.ok(ticks.length > 0, "should generate ticks");
  // Should have ticks at 1, 10, 100, 1000
  const values = ticks.map(t => t.value);
  assert.ok(values.includes(1), "should have tick at 1");
  assert.ok(values.includes(10), "should have tick at 10");
  assert.ok(values.includes(100), "should have tick at 100");
  assert.ok(values.includes(1000), "should have tick at 1000");
});

test("band scale distributes categories evenly", () => {
  const categories = ["A", "B", "C", "D"];
  const scale = createBandScale(categories, [0, 400], 0);

  // With no padding, bands should be 100px wide and centered at 50, 150, 250, 350
  assert.strictEqual(scale.scale("A"), 50);
  assert.strictEqual(scale.scale("B"), 150);
  assert.strictEqual(scale.scale("C"), 250);
  assert.strictEqual(scale.scale("D"), 350);
});

test("band scale handles unknown categories", () => {
  const categories = ["A", "B", "C"];
  const scale = createBandScale(categories, [0, 300], 0);

  // Unknown category should map to start
  assert.strictEqual(scale.scale("Unknown"), 0);
});

test("band scale generates ticks for all categories", () => {
  const categories = ["Red", "Green", "Blue"];
  const scale = createBandScale(categories, [0, 300], 0);
  const ticks = scale.ticks({ count: 10 }); // count is ignored for band scales

  assert.strictEqual(ticks.length, 3, "should have one tick per category");
  assert.strictEqual(ticks[0].value, "Red");
  assert.strictEqual(ticks[1].value, "Green");
  assert.strictEqual(ticks[2].value, "Blue");
});

test("time scale maps dates to range", () => {
  const start = new Date("2024-01-01T00:00:00Z");
  const end = new Date("2024-01-02T00:00:00Z"); // 1 day = 86400000 ms
  const scale = createTimeScale([start, end], [0, 864]);

  assert.strictEqual(scale.scale(start), 0);
  // Use closeTo for floating-point comparison
  assert.ok(Math.abs(scale.scale(end) - 864) < 0.001, "end should map to ~864");

  const midpoint = new Date("2024-01-01T12:00:00Z"); // noon
  assert.ok(Math.abs(scale.scale(midpoint) - 432) < 0.001, "midpoint should map to ~432");
});

test("time scale generates time-based ticks", () => {
  const start = new Date("2024-01-01T00:00:00Z");
  const end = new Date("2024-12-31T00:00:00Z"); // 1 year
  const scale = createTimeScale([start, end], [0, 365]);

  const ticks = scale.ticks({ count: 6 });
  assert.ok(ticks.length > 0, "should generate ticks");
  assert.ok(ticks.every(t => t.value instanceof Date), "all tick values should be Dates");
  assert.ok(ticks.every(t => t.value >= start && t.value <= end), "all ticks should be within domain");
});

test("scale format function is applied to tick labels", () => {
  const scale = createLinearScale([0, 1], [0, 100]);
  const ticks = scale.ticks({
    count: 5,
    format: (value) => `${(value as number * 100).toFixed(0)}%`,
  });

  assert.ok(ticks.every(t => t.label.endsWith("%")), "all labels should use custom format");
});
