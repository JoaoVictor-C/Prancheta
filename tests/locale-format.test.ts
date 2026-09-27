import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MINUS,
  formatNumber,
  formatNumberTex,
  formatPoint,
  formatPointTex,
  parseNumber,
} from "../src/locale/format.ts";

test("pt-BR: a comma is the decimal mark", () => {
  assert.equal(formatNumber(0.5), "0,5");
  assert.equal(formatNumber(2.5), "2,5");
  assert.equal(formatNumber(7.25), "7,25");
  assert.equal(formatNumber(1.2), "1,2");
});

test("pt-BR: an ordered pair is separated by a semicolon", () => {
  assert.equal(formatPoint(2, 5), "(2; 5)");
  assert.equal(formatPoint(2.5, 7.25), "(2,5; 7,25)");
  assert.equal(formatPoint(-2, -8), "(−2; −8)");
});

test("the minus sign is typographic, never the hyphen", () => {
  assert.equal(MINUS, "−");
  assert.equal(formatNumber(-1), "−1");
  assert.equal(formatNumber(-0.25), "−0,25");
  assert.ok(!formatNumber(-3).includes("-"));
});

test("zero is never negative", () => {
  assert.equal(formatNumber(-0), "0");
  assert.equal(formatNumber(-1e-12), "0");
});

test("integers stay integers through float noise", () => {
  assert.equal(formatNumber(6.000000000012), "6");
  assert.equal(formatNumber(0.1 + 0.2), "0,3");
  assert.equal(formatNumber(2073.6), "2073,6");
});

test("a value that is not a short decimal is written as the fraction it is", () => {
  assert.equal(formatNumber(17 / 3), "17/3");
  assert.equal(formatNumber(5 / 3), "5/3");
  assert.equal(formatNumber(-1 / 3), "−1/3");
  assert.equal(formatPoint(2, 17 / 3), "(2; 17/3)");
  // ...unless fractions are turned off, when it is rounded to three places.
  assert.equal(formatNumber(17 / 3, "pt-BR", { fractions: false }), "5,667");
});

test("irrationals are rounded to three places, trailing zeros dropped", () => {
  assert.equal(formatNumber(Math.PI), "3,142");
  assert.equal(formatNumber(Math.SQRT2), "1,414");
});

test("fixed decimals, for money", () => {
  assert.equal(formatNumber(2073.6, "pt-BR", { decimals: 2 }), "2073,60");
  assert.equal(formatNumber(1000, "pt-BR", { decimals: 2, grouping: true }), "1.000,00");
  assert.equal(formatNumber(-0.004, "pt-BR", { decimals: 2 }), "0,00");
});

test("en: point decimals and a comma between coordinates", () => {
  assert.equal(formatNumber(2.5, "en"), "2.5");
  assert.equal(formatPoint(2.5, 7.25, "en"), "(2.5, 7.25)");
  assert.equal(formatNumber(1234.5, "en", { grouping: true }), "1,234.5");
});

test("TeX: the decimal comma is braced so KaTeX does not space it", () => {
  assert.equal(formatNumberTex(2.5), "2{,}5");
  assert.equal(formatNumberTex(-17 / 3), "-\\frac{17}{3}");
  assert.equal(formatPointTex(2.5, 7.25), "\\left(2{,}5;\\,7{,}25\\right)");
});

test("parseNumber reads back what formatNumber writes", () => {
  for (const value of [0, 4, -1, 0.5, 2.5, -7.25, 17 / 3, 2073.6, 1000]) {
    const back = parseNumber(formatNumber(value));
    assert.ok(back !== null && Math.abs(back - value) < 1e-9, `${value} -> ${formatNumber(value)} -> ${back}`);
  }
  assert.equal(parseNumber("x"), null);
  assert.equal(parseNumber("1.000,5"), 1000.5);
  assert.equal(parseNumber("2.5", "en"), 2.5);
});
