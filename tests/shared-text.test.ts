import { test } from "node:test";
import assert from "node:assert/strict";
import { LABEL_SLACK, labelWidth, packItems, wrapText } from "../src/presets/shared/text.ts";
import { measureText } from "../src/layout/text-metrics.ts";
import type { WrapRules } from "../src/presets/shared/text.ts";
import { gcd, gcdBig, splitSquare } from "../src/math/integer.ts";

/** One pixel per character, so a test states its own widths. */
const chars = (t: string): number => [...t].length;

const OPERATORS = new Set(["=", "+", "−", "·"]);
const operators: WrapRules = { joinsPrevious: (w) => OPERATORS.has(w), joinsNext: (w) => OPERATORS.has(w) };

test("wrapText breaks a paragraph at spaces, no line wider than the limit", () => {
  assert.deepEqual(wrapText("aa bb cc dd", 5, chars), ["aa bb", "cc dd"]);
  assert.deepEqual(wrapText("aa bb cc dd", 100, chars), ["aa bb cc dd"]);
  // a word wider than the limit stands alone
  assert.deepEqual(wrapText("a bbbbbbbb c", 4, chars), ["a", "bbbbbbbb", "c"]);
});

test("wrapText: an operator stays with both neighbours", () => {
  // words are glued into pieces first: "P(X) = 0,5 + 0,25" is one piece, so it is not parted at a bare operator
  const lines = wrapText("P(X) = 0,5 + 0,25", 12, chars, operators);
  assert.equal(lines.join(" "), "P(X) = 0,5 + 0,25");
  for (const line of lines) assert.ok(!/[=+]$/.test(line), `${line} ends on an operator`);
  // without rules the same text is broken at any space
  assert.deepEqual(wrapText("P(X) = 0,5 + 0,25", 11, chars), ["P(X) = 0,5", "+ 0,25"]);
});

test("wrapText: a chain glued into one piece too wide breaks BEFORE an operator", () => {
  const lines = wrapText("V = 1 + 2 + 3 + 4 + 5", 9, chars, operators);
  assert.ok(lines.length > 1, JSON.stringify(lines));
  for (const line of lines.slice(1)) assert.ok(/^[=+−·]/.test(line), `${line} should begin with an operator`);
  for (const line of lines) assert.ok(!/[=+−·]$/.test(line), `${line} ends on an operator`);
  assert.equal(lines.join(" "), "V = 1 + 2 + 3 + 4 + 5");
});

test("packItems joins with the separator and packs to the limit", () => {
  assert.deepEqual(packItems(["aa", "bb", "cc"], ", ", 6, chars), ["aa, bb", "cc"]);
  assert.deepEqual(packItems([], ", ", 6, chars), []);
  assert.deepEqual(packItems(["wide-item", "x"], " ", 3, chars), ["wide-item", "x"]);
});

test("labelWidth: the bundled face's measured width plus the slack, widest line of several", () => {
  // A narrow no-break space (the digit-group mark) is narrow in the face itself.
  assert.ok(labelWidth("12\u202f000", 13) < labelWidth("12x000", 13));
  assert.equal(labelWidth("abcde", 13), Math.ceil(measureText("abcde", { size: 13, tracking: 0.1 }) + LABEL_SLACK));
  assert.equal(labelWidth("ab\nabcde", 13), labelWidth("abcde", 13));
  // Bold is wider: a weight is measured, not guessed.
  assert.ok(labelWidth("Variação média", 13, 0.1, 700) > labelWidth("Variação média", 13, 0.1, 400));
});

test("gcd, gcdBig and splitSquare", () => {
  assert.equal(gcd(12, 18), 6);
  assert.equal(gcd(-12, 18), 6);
  assert.equal(gcd(0, 7), 7);
  assert.equal(gcd(7, 0), 7);
  assert.equal(gcd(0, 0), 0);
  assert.equal(gcdBig(-12n, 18n), 6n);
  assert.equal(gcdBig(0n, 0n), 0n);
  assert.deepEqual(splitSquare(20), { k: 2, r: 5 });
  assert.deepEqual(splitSquare(16), { k: 4, r: 1 });
  assert.deepEqual(splitSquare(17), { k: 1, r: 17 });
});
