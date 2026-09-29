import { test } from "node:test";
import assert from "node:assert/strict";
import { denominatorOf, measuredLabel, sqrtLabel, writeSnapped } from "../src/locale/write.ts";
import { MINUS } from "../src/locale/format.ts";

test("writeSnapped writes the exact value a number agrees with", () => {
  assert.equal(writeSnapped(5 / 3, 1e-9), "5/3");
  assert.equal(writeSnapped(Math.SQRT2, 1e-9), "√2");
  assert.equal(writeSnapped(-Math.PI / 2, 1e-9), `${MINUS}π/2`);
  assert.equal(writeSnapped(2.5, 1e-9), "2,5");
  assert.equal(writeSnapped(0.0004, 1e-9), "0,0004");
});

test("denominatorOf: a fraction's denominator, 0 when none, and no tiny positive number is 0/d", () => {
  assert.equal(denominatorOf(3), 1);
  assert.equal(denominatorOf(0.25), 4);
  assert.equal(denominatorOf(1 / 3, 10), 3);
  assert.equal(denominatorOf(Math.PI, 100), 0);
  assert.equal(denominatorOf(0), 1);
  // 1,44e-14 is within 1e-9 of a whole number and was read as 0/1; it is a positive number
  assert.equal(denominatorOf(1.44e-14, 64), 0);
});

test("sqrtLabel of a tiny square is its decimal, not 0", () => {
  assert.equal(sqrtLabel(1.44e-14), "0,00000012");
  assert.equal(sqrtLabel(0), "0");
  assert.equal(sqrtLabel(20), "2√5");
});

test("measuredLabel keeps the digits of a measure below a hundredth", () => {
  assert.equal(measuredLabel(0.0004), "0,0004");
  assert.equal(measuredLabel(12345.678), "12 345,68");
  assert.equal(measuredLabel(2.5), "2,5");
});
