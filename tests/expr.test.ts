/**
 * The expression grammar over NAMED variables (ADR 0029).
 *
 * The one-variable form -- `parse(source, "t")`, `compile(source, "t")` --
 * is pinned by function-graph.test.ts and sign-chart.test.ts and must not
 * move. This file pins what was added beside it: declared variables, each
 * its own number; θ and its spelling "theta"; equations; bounds written as
 * expressions; and the rule that decides when a run of letters like "xy" is
 * a product, which is the one place the grammar could have started guessing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ExprError,
  compile,
  compileIn,
  constantValue,
  evaluate,
  freeVariables,
  parse,
  parseEquation,
  parseIn,
  pretty,
} from "../src/math/expr.ts";

const close = (a: number, b: number, eps = 1e-12): boolean => Math.abs(a - b) <= eps;

test("declared variables are each their own number, taken in the order declared", () => {
  const f = compileIn("x^2 + 3y", ["x", "y"]);
  assert.equal(f(2, 1), 7);
  assert.equal(f(1, 2), 7);
  assert.equal(compileIn("x - y", ["y", "x"])(1, 5), 4, "positional in the DECLARED order, not the order written");
  assert.ok(close(compileIn("cos(t)", ["t"])(Math.PI), -1));
  assert.equal(evaluate(parseIn("x y", ["x", "y"]), { x: 3, y: 4 }), 12);
});

test("θ and theta are one variable, printed θ", () => {
  const r = parseIn("1 + cos(theta)", ["θ"]);
  assert.deepEqual([...freeVariables(r)], ["θ"]);
  assert.equal(pretty(r), "1 + cos(θ)");
  assert.ok(close(compileIn("2θ", ["theta"])(0.5), 1), "declared as theta, written θ");
  assert.ok(close(compileIn("rθ", ["r", "θ"])(2, 3), 6), "a Latin run stops at θ");
});

test("a name outside the declared ones is refused by name, before anything is sampled", () => {
  assert.throws(() => parseIn("x + z", ["x", "y"]), /unknown name "z"\. The variables are "x", "y"/);
  assert.throws(() => parseIn("cos(x)", ["t"]), /unknown name "x"\. The variable is "t"/);
  assert.throws(() => parseIn("t", []), /This expression takes no variables/);
  assert.throws(() => parseIn("constructor(x)", ["x"]), /unknown name "constructor"/);
  assert.throws(() => parseIn("x", ["e"]), /"e" cannot be a variable: it is already a constant/);
  assert.throws(() => parseIn("x", ["sin"]), /already a function/);
});

test("the one-variable form did not move: x is always the variable, and every spelling is one number", () => {
  assert.equal(compile("t^2 + x", "t")(3), 12, "t and x are the same variable in the one-variable form");
  assert.equal(pretty(parse("t + x", "t")), "t + t", "each variable node prints as the declared variable");
  assert.equal(pretty(parse("x^2 - 4x + 1")), "x² − 4x + 1");
  assert.throws(() => parse("y + 1"), /unknown name "y"\. The variable is "x"/);
  // An axis name that is not a name can never be written; x still can.
  assert.equal(compile("2x", "t (h)")(4), 8);
});

// --- "xy": when a run of letters is a product -----------------------------------

test("a run that splits into declared names in exactly one way is their product", () => {
  const xy = parseIn("xy", ["x", "y"]);
  assert.equal(evaluate(xy, { x: 3, y: 5 }), 15);
  assert.equal(pretty(xy), "xy");
  assert.equal(compileIn("2xy^2", ["x", "y"])(3, 2), 24, "the power binds to y alone: 2·x·y²");
  assert.equal(compileIn("xy²", ["x", "y"])(3, 2), 12);
  assert.ok(close(compileIn("thetax", ["θ", "x"])(2, 3), 6));
  assert.ok(close(compileIn("xe^x", ["x"])(1), Math.E), "x·eˣ, with e the constant");
  // The one-variable form splits the same way: "xe^x" used to be the unknown name "xe".
  assert.ok(close(compile("xe^x")(2), 2 * Math.exp(2)));
});

test("an exact name is never split: pi is π, exp is the function", () => {
  assert.ok(close(compileIn("pi", ["p", "i"])(), Math.PI), "exactly a constant wins over p·i");
  assert.throws(() => parseIn("exp", ["x"]), /"exp" is a function and needs its argument in parentheses/);
});

test("a run that does not split is refused, and functions never take part in a split", () => {
  assert.throws(() => parseIn("xz", ["x", "y"]), /unknown name "xz".*exactly one way/s);
  assert.throws(() => parseIn("xsin(x)", ["x"]), /unknown name "xsin".*"x sin\(x\)"/s);
  assert.throws(() => parseIn("x2", ["x"]), /unknown name "x2"/, "a digit ends no name: x2 is not x·2");
});

test("a run that splits in two ways is refused, naming both readings", () => {
  assert.throws(
    () => parseIn("pie", ["p", "i"]),
    (e: Error) => e instanceof ExprError && /"pie" .* reads as (pi·e or as p·i·e|p·i·e or as pi·e)/.test(e.message),
  );
  // Separating the factors says which.
  assert.ok(close(compileIn("p i e", ["p", "i"])(2, 3), 6 * Math.E));
  assert.ok(close(compileIn("pi e", ["p", "i"])(), Math.PI * Math.E));
});

// --- equations and bounds ---------------------------------------------------------

test("an equation is two expressions around exactly one =", () => {
  const { left, right } = parseEquation("x^2/9 + y^2/4 = 1", ["x", "y"]);
  assert.equal(pretty(left), "x²/9 + y²/4");
  assert.equal(pretty(right), "1");
  assert.throws(() => parseEquation("x^2 + y^2", ["x", "y"]), /needs "="/);
  assert.throws(() => parseEquation("x = y = 1", ["x", "y"]), /one "=", this has 2/);
  assert.throws(() => parseEquation("= 1", ["x", "y"]), /an expression on each side/);
  assert.throws(() => parse("x = 1"), /"=" makes an equation/, "an expression is not an equation");
});

test("aliases are further spellings of a declared variable", () => {
  const { left } = parseEquation("t^2 + N = 1", ["x", "y"], { t: "x", N: "y" });
  assert.deepEqual([...freeVariables(left)].sort(), ["x", "y"]);
  assert.equal(pretty(left, { x: "t", y: "N" }), "t² + N", "printed back in the axis's own names");
  // A name that is not a name is skipped, as the one-variable form always did.
  assert.doesNotThrow(() => parseEquation("x = 1", ["x", "y"], { "t (h)": "x" }));
});

test("a bound may be written as an expression, never as a variable", () => {
  assert.ok(close(constantValue("2pi"), 2 * Math.PI));
  assert.ok(close(constantValue("π/2"), Math.PI / 2));
  assert.ok(close(constantValue("sqrt(2)"), Math.SQRT2));
  assert.throws(() => constantValue("2t"), /unknown name "t"/);
  assert.throws(() => constantValue("1/0"), /not a finite number/);
});

test("the decimal-point rule and the pt-BR logarithm hold for declared variables too", () => {
  assert.throws(() => parseIn("1,2x", ["x", "y"]), /comma/);
  assert.equal(compileIn("log(100x)", ["x", "y"])(1, 0), 2, "log is base 10");
  assert.ok(close(compileIn("ln(e^y)", ["x", "y"])(0, 3), 3));
  assert.ok(Number.isNaN(compileIn("sqrt(x - y)", ["x", "y"])(0, 1)), "undefined is NaN, never a throw");
});
