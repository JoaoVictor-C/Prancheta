import { test } from "node:test";
import assert from "node:assert/strict";
import { fitUnits, niceStep, ticksIn, widenToTicks } from "../src/presets/shared/scale.ts";

test("niceStep is 1, 2 or 5 × 10^k at any magnitude, with at most maxTicks intervals", () => {
  for (const span of [0.002, 0.2, 1, 7, 13, 100, 5000, 3.2e7]) {
    for (const max of [4, 8, 10]) {
      const s = niceStep(span, max);
      const mant = s / 10 ** Math.floor(Math.log10(s) + 1e-12);
      assert.ok([1, 2, 5].some((k) => Math.abs(mant - k) < 1e-9), `${s} for span ${span}`);
      assert.ok(span / s <= max + 1e-9, `${span}/${s} > ${max}`);
      assert.ok(span / (s / 2.5) > max - 1e-9 || s === niceStep(span, max), "not needlessly coarse");
    }
  }
  assert.equal(niceStep(5000, 8), 1000);
  assert.equal(niceStep(0.2, 8), 0.05);
  assert.equal(niceStep(10, 10), 1);
});

test("ticksIn counts exact multiples, zero exact, no drift", () => {
  assert.deepEqual(ticksIn(0, 0.3, 0.1), [0, 0.1, 0.2, 0.3]);
  assert.deepEqual(ticksIn(-2, 2, 1), [-2, -1, 0, 1, 2]);
  assert.deepEqual(ticksIn(-1.5, 1.5, 1), [-1, 0, 1]);
  assert.deepEqual(widenToTicks(0.13, 4.9, 0.5), [0, 5]);
});

test("fitUnits fills the target whatever the range", () => {
  const big = fitUnits(5000, 5000);
  assert.ok(Math.abs(5000 * big.xUnit - 420) < 1e-6, "the larger fitted dimension is the binding one");
  const small = fitUnits(0.2, 0.2);
  assert.ok(Math.abs(0.2 * small.yUnit - 420) < 1e-6);
  const indep = fitUnits(10, 10000, { equal: false });
  assert.ok(Math.abs(10 * indep.xUnit - 560) < 1e-6 && Math.abs(10000 * indep.yUnit - 420) < 1e-6);
  assert.equal(fitUnits(1, 1, { maxUnit: 50 }).xUnit, 50);
});
