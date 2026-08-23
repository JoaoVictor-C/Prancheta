/**
 * Tests for dimension annotation (M8, stage 5, step 29).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createFigureScale,
  createRealWorldScale,
  renderDimensionLine,
  formatMeasurement,
  convertUnits,
} from "../src/dimension/annotation.ts";

test("createFigureScale generates scale description", () => {
  const scale = createFigureScale(50, "mm");

  assert.strictEqual(scale.realWorldPerPixel, 50);
  assert.strictEqual(scale.unit, "mm");
  assert.strictEqual(scale.description, "1:50");
});

test("createRealWorldScale maps real-world coordinates to canvas", () => {
  const scale = createRealWorldScale([0, 1000], [0, 200], "mm");

  assert.strictEqual(scale.scale(0), 0);
  assert.strictEqual(scale.scale(1000), 200);
  assert.strictEqual(scale.scale(500), 100);
  assert.strictEqual(scale.figureScale.realWorldPerPixel, 5); // 1000mm / 200px
  assert.strictEqual(scale.figureScale.unit, "mm");
});

test("renderDimensionLine generates SVG with extension lines and arrows", () => {
  const svg = renderDimensionLine({
    start: { x: 100, y: 100 },
    end: { x: 200, y: 100 },
    measurement: 50,
    unit: "mm",
  });

  assert.ok(svg.includes("<g class=\"dimension-line\">"), "should wrap in dimension-line group");
  assert.ok(svg.includes("<line"), "should include extension lines");
  assert.ok(svg.includes("<path"), "should include arrow heads");
  assert.ok(svg.includes("<text"), "should include measurement label");
  assert.ok(svg.includes("50.00 mm"), "should display measurement with unit");
});

test("renderDimensionLine handles vertical dimensions", () => {
  const svg = renderDimensionLine({
    start: { x: 100, y: 100 },
    end: { x: 100, y: 200 },
    measurement: 75,
    unit: "cm",
  });

  assert.ok(svg.includes("75.00 cm"), "should display vertical measurement");
  assert.ok(svg.includes("<line"), "should render extension lines for vertical dimension");
});

test("renderDimensionLine respects offset parameter", () => {
  const svg = renderDimensionLine({
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    measurement: 10,
    unit: "m",
    offset: 30,
  });

  assert.ok(svg.includes("10.00 m"), "should render with custom offset");
});

test("renderDimensionLine returns empty string for degenerate line", () => {
  const svg = renderDimensionLine({
    start: { x: 100, y: 100 },
    end: { x: 100, y: 100 },
    measurement: 0,
    unit: "mm",
  });

  assert.strictEqual(svg, "", "degenerate dimension line should return empty string");
});

test("formatMeasurement adjusts precision based on magnitude", () => {
  assert.strictEqual(formatMeasurement(0.5, "mm"), "0.50 mm"); // < 1: 2 decimals
  assert.strictEqual(formatMeasurement(5, "cm"), "5.0 cm"); // < 10: 1 decimal
  assert.strictEqual(formatMeasurement(50, "m"), "50 m"); // >= 10: 0 decimals
});

test("convertUnits converts between metric units", () => {
  assert.strictEqual(convertUnits(1000, "mm", "m"), 1);
  assert.strictEqual(convertUnits(1, "m", "cm"), 100);
  assert.strictEqual(convertUnits(10, "cm", "mm"), 100);
});

test("convertUnits converts between imperial units", () => {
  const inchesToFeet = convertUnits(12, "in", "ft");
  assert.ok(Math.abs(inchesToFeet - 1) < 0.001, "12 inches should be ~1 foot");

  const feetToInches = convertUnits(1, "ft", "in");
  assert.ok(Math.abs(feetToInches - 12) < 0.001, "1 foot should be ~12 inches");
});

test("convertUnits converts between metric and imperial", () => {
  const inchesInMm = convertUnits(1, "in", "mm");
  assert.ok(Math.abs(inchesInMm - 25.4) < 0.01, "1 inch should be ~25.4mm");

  const feetInM = convertUnits(1, "ft", "m");
  assert.ok(Math.abs(feetInM - 0.3048) < 0.001, "1 foot should be ~0.3048m");
});

test("convertUnits handles pixel conversions", () => {
  const pxInMm = convertUnits(1, "px", "mm");
  assert.ok(pxInMm > 0, "pixel should convert to positive mm value");
});
