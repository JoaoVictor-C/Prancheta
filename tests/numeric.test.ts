/**
 * numeric.ts: adaptive integration, Riemann sums, limits and partial sums
 * on plain `(x: number) => number` callables -- pinned against known
 * closed-form answers, plus the refusals the module promises (a pole
 * inside an integral, a fast oscillation a limit table cannot see through).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { integrate, riemann, limit, partialSums, NumericError } from "../src/math/numeric.ts";

// --- integrate ---------------------------------------------------------------

test("integrate: x^2 on [0, 3] is 9", () => {
  const { value, errorEstimate } = integrate((x) => x * x, 0, 3);
  assert.ok(Math.abs(value - 9) < 1e-6, `got ${value}`);
  assert.ok(errorEstimate < 1e-6);
});

test("integrate: sin on [0, pi] is 2", () => {
  const { value } = integrate(Math.sin, 0, Math.PI);
  assert.ok(Math.abs(value - 2) < 1e-6, `got ${value}`);
});

test("integrate: 1/x on [1, e] is 1", () => {
  const { value } = integrate((x) => 1 / x, 1, Math.E);
  assert.ok(Math.abs(value - 1) < 1e-6, `got ${value}`);
});

test("integrate: reversed bounds negate the result", () => {
  const forward = integrate((x) => x * x, 0, 3).value;
  const backward = integrate((x) => x * x, 3, 0).value;
  assert.ok(Math.abs(forward + backward) < 1e-9);
});

test("integrate: a pole inside [-1, 1] is refused, not silently skipped", () => {
  assert.throws(() => integrate((x) => 1 / x, -1, 1), NumericError);
});

test("integrate: a pole exactly at an endpoint is also refused", () => {
  assert.throws(() => integrate((x) => 1 / x, 0, 1), NumericError);
});

// --- riemann -------------------------------------------------------------

test("riemann: left/right/mid/trapezoid all converge to the true area as n grows", () => {
  const exact = 9; // integral of x^2 on [0,3]
  for (const rule of ["left", "right", "mid", "trapezoid"] as const) {
    const coarse = riemann((x) => x * x, 0, 3, 10, rule).sum;
    const fine = riemann((x) => x * x, 0, 3, 10000, rule).sum;
    assert.ok(Math.abs(fine - exact) < Math.abs(coarse - exact), `${rule}: fine (${fine}) not closer than coarse (${coarse})`);
    assert.ok(Math.abs(fine - exact) < 5e-3, `${rule}: fine estimate ${fine} not close to ${exact}`);
  }
});

test("riemann: rectangles list has one entry per subinterval, spanning [a, b]", () => {
  const { rectangles } = riemann((x) => x * x, 0, 3, 6, "left");
  assert.equal(rectangles.length, 6);
  assert.equal(rectangles[0]!.x0, 0);
  assert.equal(rectangles[rectangles.length - 1]!.x1, 3);
  for (const r of rectangles) {
    assert.equal(typeof r.height, "number");
    assert.equal(r.heights, undefined);
  }
});

test("riemann: trapezoid rectangles carry two heights instead of one", () => {
  const { rectangles } = riemann((x) => x * x, 0, 2, 4, "trapezoid");
  for (const r of rectangles) {
    assert.equal(r.height, undefined);
    assert.equal(r.heights!.length, 2);
  }
});

test("riemann: left and right sums bracket an increasing function's true area", () => {
  const exact = 9;
  const left = riemann((x) => x * x, 0, 3, 200, "left").sum;
  const right = riemann((x) => x * x, 0, 3, 200, "right").sum;
  assert.ok(left < exact && exact < right, `left=${left} right=${right}`);
});

// --- limit -----------------------------------------------------------------

test("limit: sin(x)/x at 0 is 1", () => {
  const result = limit((x) => Math.sin(x) / x, 0, "both");
  assert.equal(result.kind, "finite");
  if (result.kind === "finite") assert.ok(Math.abs(result.value - 1) < 1e-5, `got ${result.value}`);
  assert.ok(result.samples.length > 0);
});

test("limit: 1/x at 0 is +infinity from the right, -infinity from the left", () => {
  const right = limit((x) => 1 / x, 0, "right");
  const left = limit((x) => 1 / x, 0, "left");
  assert.equal(right.kind, "infinite");
  assert.equal(left.kind, "infinite");
  if (right.kind === "infinite") assert.equal(right.sign, 1);
  if (left.kind === "infinite") assert.equal(left.sign, -1);
});

test("limit: 1/x at 0 has no two-sided limit (opposite signs disagree)", () => {
  const result = limit((x) => 1 / x, 0, "both");
  assert.equal(result.kind, "none");
});

test("limit: (1 + 1/x)^x at +infinity is approximately e", () => {
  const result = limit((x) => Math.pow(1 + 1 / x, x), Infinity, "right");
  assert.equal(result.kind, "finite");
  if (result.kind === "finite") assert.ok(Math.abs(result.value - Math.E) < 1e-3, `got ${result.value}`);
});

test("limit: sin(1/x) at 0 does not settle -- reported as none, not a false finite value", () => {
  const result = limit((x) => Math.sin(1 / x), 0, "both");
  // The doc comment is honest that fixed geometric sampling can be fooled by
  // this function; what must hold is that it never reports a false-precision
  // "finite" verdict for it -- either side legitimately failing to settle,
  // or the two sides disagreeing, both count as the module doing its job.
  assert.notEqual(result.kind, "finite");
});

// --- partialSums -------------------------------------------------------------

test("partialSums: 1/n^2 approaches pi^2/6", () => {
  const { partialSums: sums, n, hint } = partialSums((k) => 1 / (k * k), 1, 20000);
  assert.equal(sums.length, n.length);
  const last = sums[sums.length - 1]!;
  assert.ok(Math.abs(last - Math.PI ** 2 / 6) < 1e-3, `got ${last}`);
  assert.equal(hint, "converging");
});

test("partialSums: harmonic series 1/n keeps growing -- not mistaken for convergence", () => {
  const { partialSums: sums, hint } = partialSums((k) => 1 / k, 1, 5000);
  const early = sums[10]!;
  const late = sums[sums.length - 1]!;
  assert.ok(late > early, "partial sums of the harmonic series must keep increasing");
  assert.notEqual(hint, "converging");
});

test("partialSums: rejects N < n0", () => {
  assert.throws(() => partialSums((k) => k, 5, 1), NumericError);
});

// --- limit: decimal schedule (ADR 0039) -------------------------------------

test("limit: decimal schedule samples exactly a ± 10^-1..10^-4 for a = 1", () => {
  const result = limit((x) => (x * x - 1) / (x - 1), 1, "both", { schedule: "decimal", count: 4 });
  assert.equal(result.kind, "finite");
  if (result.kind === "finite") assert.ok(Math.abs(result.value - 2) < 1e-3, `got ${result.value}`);
  assert.equal(result.samples.length, 8);
  const xs = result.samples.map((s) => s.x);
  const close = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;
  assert.ok(close(xs[0]!, 0.9) && close(xs[1]!, 0.99) && close(xs[2]!, 0.999) && close(xs[3]!, 0.9999));
  assert.ok(close(xs[4]!, 1.1) && close(xs[5]!, 1.01) && close(xs[6]!, 1.001) && close(xs[7]!, 1.0001));
});

test("limit: decimal schedule defaults to the geometric schedule when no options are given", () => {
  const decimal = limit((x) => Math.sin(x) / x, 0, "both");
  const geometric = limit((x) => Math.sin(x) / x, 0, "both", { schedule: "geometric" });
  assert.deepEqual(decimal, geometric);
});

test("limit: decimal schedule, sin(x)/x at 0 is 1", () => {
  const result = limit((x) => Math.sin(x) / x, 0, "both", { schedule: "decimal" });
  assert.equal(result.kind, "finite");
  if (result.kind === "finite") assert.ok(Math.abs(result.value - 1) < 1e-3, `got ${result.value}`);
});

test("limit: decimal schedule, 1/x at 0 is one-sided ±infinity and has no two-sided limit", () => {
  const right = limit((x) => 1 / x, 0, "right", { schedule: "decimal" });
  const left = limit((x) => 1 / x, 0, "left", { schedule: "decimal" });
  assert.equal(right.kind, "infinite");
  assert.equal(left.kind, "infinite");
  if (right.kind === "infinite") assert.equal(right.sign, 1);
  if (left.kind === "infinite") assert.equal(left.sign, -1);
  const both = limit((x) => 1 / x, 0, "both", { schedule: "decimal" });
  assert.equal(both.kind, "none");
});

test("limit: decimal schedule, |x|/x at 0 is one-sided -1 and 1 and has no two-sided limit", () => {
  const right = limit((x) => Math.abs(x) / x, 0, "right", { schedule: "decimal" });
  const left = limit((x) => Math.abs(x) / x, 0, "left", { schedule: "decimal" });
  assert.equal(right.kind, "finite");
  assert.equal(left.kind, "finite");
  if (right.kind === "finite") assert.equal(right.value, 1);
  if (left.kind === "finite") assert.equal(left.value, -1);
  const both = limit((x) => Math.abs(x) / x, 0, "both", { schedule: "decimal" });
  assert.equal(both.kind, "none");
});

test("limit: decimal schedule, (1 + 1/x)^x at +infinity is approximately e", () => {
  const result = limit((x) => Math.pow(1 + 1 / x, x), Infinity, "right", { schedule: "decimal" });
  assert.equal(result.kind, "finite");
  if (result.kind === "finite") assert.ok(Math.abs(result.value - Math.E) < 1e-2, `got ${result.value}`);
  const xs = result.samples.map((s) => s.x);
  assert.deepEqual(xs, [10, 100, 1000, 10000]);
});

test("limit: decimal schedule, sin(1/x) at 0 is refused honestly, not a false finite value", () => {
  const result = limit((x) => Math.sin(1 / x), 0, "both", { schedule: "decimal" });
  assert.notEqual(result.kind, "finite");
});

test("limit: decimal schedule scales its step for a large `a` instead of shrinking to nothing", () => {
  const result = limit((x) => x, 100, "right", { schedule: "decimal", count: 3 });
  const xs = result.samples.map((s) => s.x);
  assert.deepEqual(xs, [110, 101, 100.1]);
});

test("limit: decimal schedule respects a custom count", () => {
  const result = limit((x) => x * x, 2, "right", { schedule: "decimal", count: 2 });
  assert.equal(result.samples.length, 2);
});

test("limit: decimal schedule refuses to report a finite verdict the printed samples do not back up", () => {
  // A function whose dense (fine) schedule settles, but which wobbles just
  // enough between 10^-1 and 10^-4 that the four decimal samples printed do
  // not themselves look settled -- the verdict must not out-run its own
  // printed evidence.
  const f = (x: number): number => 5 + Math.sin(1 / Math.abs(x)) * Math.abs(x) ** 0.1;
  const dense = limit(f, 0, "right");
  const decimal = limit(f, 0, "right", { schedule: "decimal", count: 4 });
  // Whatever the dense schedule concludes, the decimal-schedule verdict must
  // never be "finite" unless its own four printed samples actually settled --
  // it must be internally consistent, not merely borrow the dense answer.
  if (decimal.kind === "finite") {
    const ys = decimal.samples.map((s) => s.y);
    const last = ys[ys.length - 1]!;
    const first = ys[0]!;
    assert.ok(Math.abs(last - decimal.value) < 1e-2 * (1 + Math.abs(decimal.value)));
    assert.ok(Math.abs(last - decimal.value) <= Math.abs(first - decimal.value) + 1e-9);
  }
  void dense;
});

test("limit: a slow divergence is still infinite -- ln x at 0⁺ is −∞, though only about −17 at the closest sample", () => {
  const ln = limit(Math.log, 0, "right");
  assert.equal(ln.kind, "infinite");
  assert.equal(ln.kind === "infinite" ? ln.sign : 0, -1);
  // The increments test must not swallow slowly CONVERGENT tails.
  assert.equal(limit((x) => Math.pow(1 + 1 / x, x), Infinity, "right").kind, "finite");
  // x·ln x and 1/ln x at 0⁺ converge to 0 too slowly for the tolerance to
  // call them finite (they come back "none" -- a known limit, not new); what
  // matters here is that the increments test never calls them infinite.
  assert.notEqual(limit((x) => x * Math.log(x), 0, "right").kind, "infinite");
  assert.notEqual(limit((x) => 1 / Math.log(x), 0, "right").kind, "infinite");
  assert.equal(limit(Math.atan, Infinity, "right").kind, "finite");
  assert.equal(limit((x) => Math.sin(1 / x), 0, "right").kind === "finite", false);
});
