import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MINUS,
  formatNumber,
  formatNumberTex,
  formatPoint,
  formatPointTex,
  formatSignificant,
  parseNumber,
  roundKeepingNonzero,
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
  assert.equal(formatNumber(-0.004, "pt-BR", { decimals: 2 }), "−0,004"); // never "0,00" for a nonzero value
  assert.equal(formatNumber(-0.0000004, "pt-BR", { decimals: 2 }), "−0,0000004");
  assert.equal(formatNumber(1e-15, "pt-BR", { decimals: 2 }), "0,00"); // rounding noise is still zero
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

// ---- digit grouping (from five integer digits) ----------------------------------------

const NS = "\u202f";

test("pt-BR groups from five integer digits with a narrow no-break space; a year stays whole", () => {
  assert.equal(formatNumber(2026), "2026");
  assert.equal(formatNumber(9999), "9999");
  assert.equal(formatNumber(12000), `12${NS}000`);
  assert.equal(formatNumber(1234567), `1${NS}234${NS}567`);
  assert.equal(formatNumber(-12000), `${MINUS}12${NS}000`);
  assert.equal(formatNumber(999998000), `999${NS}998${NS}000`);
});

test("decimals are never grouped", () => {
  assert.equal(formatNumber(12345.678), `12${NS}345,678`);
  assert.equal(formatNumber(0.12345), "0,123");
  assert.equal(formatNumber(1234.5678), "1234,568");
  assert.equal(formatNumber(12345.5, "pt-BR", { decimals: 2 }), `12${NS}345,50`);
});

test("en groups from five digits with a comma", () => {
  assert.equal(formatNumber(2026, "en"), "2026");
  assert.equal(formatNumber(12000, "en"), "12,000");
  assert.equal(formatNumber(1234567.5, "en"), "1,234,567.5");
});

test("grouping: false is for a number a program reads back; grouping: true is money", () => {
  assert.equal(formatNumber(12000, "pt-BR", { grouping: false }), "12000");
  assert.equal(formatNumber(12000, "en", { grouping: false }), "12000");
  assert.equal(formatNumber(1234.5, "pt-BR", { decimals: 2, grouping: true }), "1.234,50");
  assert.equal(formatNumber(12000, "pt-BR", { decimals: 2, grouping: true }), "12.000,00");
});

test("a grouped number reads back, and sets in TeX with a thin space", () => {
  for (const value of [12000, -1234567, 12345.678]) {
    const back = parseNumber(formatNumber(value));
    assert.ok(back !== null && Math.abs(back - value) < 1e-9, `${value} -> ${formatNumber(value)} -> ${back}`);
  }
  assert.equal(parseNumber(formatNumber(12000, "en"), "en"), 12000);
  assert.equal(formatNumberTex(12000), "12\\,000");
  assert.equal(formatNumberTex(12345.5), "12\\,345{,}5");
});

// ---- no nonzero value is written as zero ----------------------------------------------

test("a tiny value is written to three significant digits, never as 0, 0,0, 0,00 or 0,000", () => {
  assert.equal(formatNumber(0.0004), "0,0004");
  assert.equal(formatNumber(0.000215), "0,000215");
  assert.equal(formatNumber(0.00021547), "0,000215");
  assert.equal(formatNumber(-0.000215), `${MINUS}0,000215`);
  assert.equal(formatNumber(2.5e-7), "0,00000025");
  assert.equal(formatNumber(0.0004, "en"), "0.0004");
  assert.equal(formatNumber(0.0004, "pt-BR", { decimals: 2 }), "0,0004");
  assert.equal(formatNumber(0.0004, "pt-BR", { decimals: 3 }), "0,0004");
  assert.equal(formatNumber(0.0000215, "pt-BR", { fractions: false }), "0,0000215");
});

test("a value three decimals would misstate by a tenth or more is written to three significant digits", () => {
  assert.equal(formatNumber(0.0006), "0,0006");
  assert.equal(formatNumber(0.0026), "0,0026");
  // ...and one they state well enough is untouched
  assert.equal(formatNumber(0.0042), "0,004");
  assert.equal(formatNumber(0.025), "0,025");
  assert.equal(formatNumber(Math.PI), "3,142");
});

test("only rounding noise is zero", () => {
  assert.equal(formatNumber(1e-13), "0");
  assert.equal(formatNumber(-6e-17), "0");
  assert.equal(formatNumber(1e-15, "pt-BR", { decimals: 2 }), "0,00");
  assert.equal(formatNumber(0), "0");
  assert.equal(formatNumber(0, "pt-BR", { decimals: 2 }), "0,00");
});

test("formatSignificant and roundKeepingNonzero", () => {
  assert.equal(formatSignificant(0.000215478, 3), "0,000215");
  assert.equal(formatSignificant(0.000215478, 4), "0,0002155");
  assert.equal(formatSignificant(0.5, 3), "0,5");
  assert.equal(formatSignificant(-0.0125, 3), `${MINUS}0,0125`);
  assert.equal(formatSignificant(0, 3), "0");
  assert.equal(formatSignificant(0.000215, 3, "en"), "0.000215");
  assert.equal(roundKeepingNonzero(0.0004, 3), 0.0004);
  assert.equal(roundKeepingNonzero(0.1234, 3), 0.123);
  assert.equal(roundKeepingNonzero(1e-15, 3), 0);
  assert.equal(roundKeepingNonzero(0, 3), 0);
});
