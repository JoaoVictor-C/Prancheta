/**
 * The easing guard (ADR 0014).
 *
 * What is under test is not CSS syntax handling but the premise the motion
 * check now rests on: one shared, continuous, non-decreasing easing leaves
 * "do these boxes overlap somewhere inside the transition" unchanged, so
 * boxes-do-not-overlap-during-transition needs no easing-aware math. Anything
 * that breaks a premise of that argument has to be refused, not accepted and
 * quietly left unverified.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEasing } from "../src/anim/easing.ts";
import { SpecError } from "../src/ir/types.ts";

test("every CSS named easing is accepted, and each one really does satisfy the guard", () => {
  // Asserted rather than assumed: `ease` is the tightest at y1=0.1, y2=1, and
  // parseEasing re-checks the table rather than trusting it.
  for (const easing of ["linear", "ease", "ease-in", "ease-out", "ease-in-out"]) {
    assert.equal(parseEasing(easing), easing);
  }
});

test("a hand-written cubic-bezier inside the guard is accepted and normalised", () => {
  assert.equal(parseEasing("cubic-bezier(0.3,0,0.7,1)"), "cubic-bezier(0.3, 0, 0.7, 1)");
  assert.equal(parseEasing("  ease-in-out  "), "ease-in-out");
});

test("an overshooting easing is refused: it carries a box past the endpoint no trajectory describes", () => {
  // The standard "back" easing. y1 = -0.55 dips below the start, y2 = 1.55
  // sails past the end, and in between the box is somewhere the affine
  // trajectory in trajectory.ts never claims it goes.
  assert.throws(() => parseEasing("cubic-bezier(0.68, -0.55, 0.265, 1.55)"), SpecError);
  assert.throws(() => parseEasing("cubic-bezier(0, 1.2, 1, 1)"), SpecError);
  assert.throws(() => parseEasing("cubic-bezier(0, -0.1, 1, 1)"), SpecError);
});

test("a decreasing stretch is refused even though it stays inside [0,1]", () => {
  // y1 = 0.9 then y2 = 0.1: time would run backwards in the middle. The guard
  // is 0 <= y1 <= y2 <= 1, and this violates the middle inequality only.
  assert.throws(() => parseEasing("cubic-bezier(0.5, 0.9, 0.5, 0.1)"), SpecError);
});

test("steps() is refused: monotone, but it skips values the overlap could hide in", () => {
  // The invariance argument needs the easing to hit every s in (0,1). A step
  // function does not, so an overlap can sit in a range the animation jumps
  // straight over.
  assert.throws(() => parseEasing("steps(4, end)"), SpecError);
  assert.throws(() => parseEasing("step-start"), SpecError);
});

test("an x control point outside [0,1] is refused, as CSS itself requires", () => {
  assert.throws(() => parseEasing("cubic-bezier(1.5, 0, 0.5, 1)"), SpecError);
});

test("nonsense is refused with a message naming what is accepted", () => {
  assert.throws(() => parseEasing("wobble"), SpecError);
  assert.throws(() => parseEasing("cubic-bezier(a, b, c, d)"), SpecError);
  assert.throws(
    () => parseEasing("bouncy"),
    (error: unknown) => error instanceof SpecError && /cubic-bezier/.test(error.message),
  );
});
